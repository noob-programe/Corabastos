<?php
// API de inventario (Dueño y Vendedor; algunas acciones solo Dueño)
//   GET  inventario.php?accion=existencias | proveedores | entradas | ajustes
//   POST inventario.php {accion:'entrada'|'ajuste'|'minimo'|'precio', ...}
require 'auth.php';
exigir_rol(['Dueno', 'Vendedor']);
$pdo       = db();
$idUsuario = (int)$_SESSION['id_usuario'];
$idPuesto  = (int)($_SESSION['id_puesto'] ?? 0);
$esDueno   = ($_SESSION['rol'] === 'Dueno');

function fallo(int $c, string $m): void { responder($c, ['ok' => false, 'mensaje' => $m]); }
function abortar(PDO $pdo, int $c, string $m): void {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fallo($c, $m);
}
// La calidad es libre y propia de cada producto (Extra, Grande, Única...). Se ordena el texto y se
// pone la primera letra en mayúscula. La BD no distingue mayúsculas ni tildes al comparar.
function normalizar_calidad(string $c): string {
    $c = trim(preg_replace('/\s+/u', ' ', $c));
    if ($c === '') return '';
    return mb_strtoupper(mb_substr($c, 0, 1)) . mb_substr($c, 1);
}
function dinero(int $centavos): string { return number_format($centavos / 100, 2, '.', ''); }
function solo_dueno(bool $esDueno): void { if (!$esDueno) fallo(403, 'Solo el Dueño puede hacer esto.'); }

// Devuelve la fila del inventario solo si pertenece al puesto del usuario
function inventario_del_puesto(PDO $pdo, int $idInv, int $idPuesto) {
    $st = $pdo->prepare('SELECT ic.id_inventario, ic.stock_actual, ic.calidad, p.nombre_producto
                         FROM inventario_calidades ic JOIN productos p ON p.id_producto = ic.id_producto
                         WHERE ic.id_inventario = ? AND p.id_puesto = ?');
    $st->execute([$idInv, $idPuesto]);
    return $st->fetch();
}

if ($idPuesto <= 0) fallo(403, 'Tu cuenta no tiene un puesto asignado.');

// ================= GET =================
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $accion = $_GET['accion'] ?? '';

    if ($accion === 'existencias') {
        $st = $pdo->prepare(
            "SELECT p.id_producto, p.nombre_producto, ic.id_inventario, ic.calidad,
                    ic.stock_actual, ic.stock_minimo, ic.precio_venta_diario
             FROM productos p JOIN inventario_calidades ic ON ic.id_producto = p.id_producto
             WHERE p.id_puesto = ? AND p.estado = 'Activo'
             ORDER BY p.nombre_producto,
                      (FIELD(ic.calidad, 'Extra', 'Primera', 'Semi', 'Parejo', 'Riche') = 0),
                      FIELD(ic.calidad, 'Extra', 'Primera', 'Semi', 'Parejo', 'Riche'), ic.calidad");
        $st->execute([$idPuesto]);
        $productos = [];
        foreach ($st->fetchAll() as $f) {
            $id = (int)$f['id_producto'];
            if (!isset($productos[$id])) $productos[$id] = ['id' => $id, 'nombre' => $f['nombre_producto'], 'calidades' => []];
            $productos[$id]['calidades'][] = [
                'id' => (int)$f['id_inventario'], 'nombre' => $f['calidad'],
                'stock' => (int)$f['stock_actual'], 'minimo' => (int)$f['stock_minimo'],
                'precio' => (float)$f['precio_venta_diario'],
            ];
        }
        responder(200, ['ok' => true, 'productos' => array_values($productos)]);
    }

    if ($accion === 'proveedores') {
        $st = $pdo->prepare("SELECT id_proveedor AS id, nombre_razon_social AS nombre, telefono
                             FROM proveedores WHERE id_puesto = ? AND estado = 'Activo' ORDER BY nombre_razon_social");
        $st->execute([$idPuesto]);
        $ult = $pdo->prepare('SELECT id_proveedor FROM entradas_mercancia
                              WHERE id_puesto = ? AND id_usuario = ? ORDER BY id_entrada DESC LIMIT 1');
        $ult->execute([$idPuesto, $idUsuario]);
        $u = $ult->fetchColumn();
        responder(200, ['ok' => true, 'proveedores' => $st->fetchAll(), 'ultimo' => $u ? (int)$u : null]);
    }

    if ($accion === 'entradas') {
        $st = $pdo->prepare(
            "SELECT e.id_entrada AS id, e.fecha_entrada AS fecha, pr.nombre_razon_social AS proveedor,
                    e.documento_soporte AS documento, e.total_compra AS total, e.saldo_pendiente AS saldo,
                    e.estado_pago AS estado,
                    (SELECT GROUP_CONCAT(CONCAT(p.nombre_producto, ' ', ic.calidad, ' x', de.cantidad_recibida) SEPARATOR ', ')
                     FROM detalle_entrada de
                     JOIN inventario_calidades ic ON ic.id_inventario = de.id_inventario
                     JOIN productos p ON p.id_producto = ic.id_producto
                     WHERE de.id_entrada = e.id_entrada) AS resumen
             FROM entradas_mercancia e JOIN proveedores pr ON pr.id_proveedor = e.id_proveedor
             WHERE e.id_puesto = ? ORDER BY e.id_entrada DESC LIMIT 30");
        $st->execute([$idPuesto]);
        $filas = $st->fetchAll();
        if (!$esDueno) {            // El Vendedor no ve costos, saldos ni estado de pago
            foreach ($filas as &$f) { unset($f['total'], $f['saldo'], $f['estado']); }
            unset($f);
        }
        responder(200, ['ok' => true, 'entradas' => $filas]);
    }

    if ($accion === 'ajustes') {
        $st = $pdo->prepare(
            "SELECT a.fecha_ajuste AS fecha, p.nombre_producto AS producto, ic.calidad,
                    a.tipo_ajuste AS tipo, a.cantidad, a.motivo, u.nombre_completo AS usuario
             FROM ajustes_inventario a
             JOIN inventario_calidades ic ON ic.id_inventario = a.id_inventario
             JOIN productos p ON p.id_producto = ic.id_producto
             JOIN usuarios u ON u.id_usuario = a.id_usuario
             WHERE p.id_puesto = ? ORDER BY a.id_ajuste DESC LIMIT 40");
        $st->execute([$idPuesto]);
        responder(200, ['ok' => true, 'ajustes' => $st->fetchAll()]);
    }

    fallo(400, 'Acción no válida.');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fallo(405, 'Método no permitido.');

$in     = json_decode(file_get_contents('php://input'), true) ?? [];
$accion = $in['accion'] ?? '';

// ================= MÍNIMO Y PRECIO (solo Dueño) =================
if ($accion === 'minimo' || $accion === 'precio') {
    solo_dueno($esDueno);
    $idInv = (int)($in['id_inventario'] ?? 0);
    if (!inventario_del_puesto($pdo, $idInv, $idPuesto)) fallo(404, 'Ese producto no existe en tu puesto.');

    if ($accion === 'minimo') {
        $v = (int)($in['valor'] ?? -1);
        if ($v < 0 || $v > 1000000) fallo(400, 'El stock mínimo no es válido.');
        $pdo->prepare('UPDATE inventario_calidades SET stock_minimo = ? WHERE id_inventario = ?')->execute([$v, $idInv]);
        responder(200, ['ok' => true, 'mensaje' => 'Stock mínimo actualizado.']);
    }
    $c = (int)round(((float)($in['valor'] ?? 0)) * 100);
    if ($c <= 0 || $c > 9999999999) fallo(400, 'Escribe un precio válido.');
    $pdo->prepare('UPDATE inventario_calidades SET precio_venta_diario = ? WHERE id_inventario = ?')->execute([dinero($c), $idInv]);
    responder(200, ['ok' => true, 'mensaje' => 'Precio del día actualizado.']);
}

// ================= AJUSTE =================
if ($accion === 'ajuste') {
    $tipo   = $in['tipo'] ?? '';
    $idInv  = (int)($in['id_inventario'] ?? 0);
    $cant   = (int)($in['cantidad'] ?? -1);
    $motivo = trim($in['motivo'] ?? '');

    if (!in_array($tipo, ['Merma', 'Devolucion', 'Correccion_conteo'], true)) fallo(400, 'Elige el tipo de ajuste.');
    if ($tipo === 'Correccion_conteo') solo_dueno($esDueno);
    $minimo = ($tipo === 'Correccion_conteo') ? 0 : 1;
    if ($cant < $minimo || $cant > 1000000) fallo(400, 'La cantidad no es válida.');
    if (mb_strlen($motivo) < 3 || mb_strlen($motivo) > 255) fallo(400, 'Escribe el motivo (mínimo 3 letras).');
    if (!inventario_del_puesto($pdo, $idInv, $idPuesto)) fallo(404, 'Ese producto no existe en tu puesto.');

    try {
        $pdo->prepare('INSERT INTO ajustes_inventario (id_inventario, id_usuario, tipo_ajuste, cantidad, motivo)
                       VALUES (?,?,?,?,?)')->execute([$idInv, $idUsuario, $tipo, $cant, $motivo]);
    } catch (PDOException $e) {
        error_log('inventario.php ajuste: ' . $e->getMessage());
        fallo(500, 'No se pudo registrar el ajuste. Intenta de nuevo.');
    }
    $inv = inventario_del_puesto($pdo, $idInv, $idPuesto);
    $nuevo = (int)$inv['stock_actual'];
    responder(200, ['ok' => true, 'mensaje' => 'Ajuste registrado.', 'stock' => $nuevo,
                    'advertencia' => $nuevo < 0 ? 'El stock quedó en negativo. Revisa el inventario.' : null]);
}

// ================= ENTRADA DE MERCANCÍA =================
if ($accion === 'entrada') {
    $doc    = trim($in['documento'] ?? '');
    $lineas = $in['lineas'] ?? [];
    if ($doc === '' || mb_strlen($doc) > 50) fallo(400, 'Escribe el número de factura (máximo 50 caracteres).');
    if (!is_array($lineas) || count($lineas) < 1 || count($lineas) > 30) fallo(400, 'Agrega entre 1 y 30 productos.');

    $limpias = [];
    foreach ($lineas as $i => $l) {
        $n = $i + 1;
        $nombre = trim($l['producto'] ?? '');
        $cal    = normalizar_calidad((string)($l['calidad'] ?? ''));
        $cant   = (int)($l['cantidad'] ?? 0);
        $costoC = (int)round(((float)($l['costo'] ?? 0)) * 100);
        $precC  = (int)round(((float)($l['precio'] ?? 0)) * 100);
        if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100) fallo(400, "Producto $n: escribe el nombre.");
        if ($cal === '' || mb_strlen($cal) > 50)                fallo(400, "Producto $n: escribe la calidad (máximo 50 letras).");
        if ($cant < 1 || $cant > 1000000)                        fallo(400, "Producto $n: la cantidad no es válida.");
        if ($costoC <= 0 || $costoC > 9999999999)                fallo(400, "Producto $n: escribe el costo por unidad.");
        if ($precC <= 0 || $precC > 9999999999)                  fallo(400, "Producto $n: escribe el precio de venta de hoy.");
        $limpias[] = ['nombre' => $nombre, 'calidad' => $cal, 'cant' => $cant, 'costo' => $costoC, 'precio' => $precC];
    }

    $pdo->beginTransaction();
    try {
        // --- Proveedor (existente o nuevo) ---
        if (!empty($in['proveedor_id'])) {
            $st = $pdo->prepare("SELECT id_proveedor FROM proveedores WHERE id_proveedor = ? AND id_puesto = ? AND estado = 'Activo'");
            $st->execute([(int)$in['proveedor_id'], $idPuesto]);
            $idProv = $st->fetchColumn();
            if (!$idProv) abortar($pdo, 404, 'Ese proveedor no existe en tu puesto.');
            $idProv = (int)$idProv;
        } elseif (!empty($in['proveedor_nuevo']) && is_array($in['proveedor_nuevo'])) {
            $pn  = $in['proveedor_nuevo'];
            $nom = trim($pn['nombre'] ?? '');
            $tel = preg_replace('/\D/', '', $pn['telefono'] ?? '');
            if (mb_strlen($nom) < 2 || mb_strlen($nom) > 150) abortar($pdo, 400, 'Escribe el nombre del proveedor.');
            if ($tel !== '' && (strlen($tel) < 7 || strlen($tel) > 15)) abortar($pdo, 400, 'El teléfono debe tener entre 7 y 15 números.');
            try {
                $pdo->prepare('INSERT INTO proveedores (id_puesto, nombre_razon_social, telefono) VALUES (?,?,?)')
                    ->execute([$idPuesto, $nom, $tel !== '' ? $tel : null]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') abortar($pdo, 409, 'Ese proveedor ya existe. Elígelo de la lista.');
                throw $e;
            }
            $idProv = (int)$pdo->lastInsertId();
        } else {
            abortar($pdo, 400, 'Elige el proveedor o crea uno nuevo.');
        }

        // --- Factura (cabecera) ---
        try {
            $pdo->prepare('INSERT INTO entradas_mercancia (id_puesto, id_proveedor, id_usuario, documento_soporte) VALUES (?,?,?,?)')
                ->execute([$idPuesto, $idProv, $idUsuario, $doc]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') abortar($pdo, 409, 'Esa factura ya está registrada para ese proveedor.');
            throw $e;
        }
        $idEntrada = (int)$pdo->lastInsertId();

        // --- Líneas: busca o crea el producto y la calidad; los triggers suman el stock ---
        foreach ($limpias as $l) {
            $st = $pdo->prepare('SELECT id_producto, estado FROM productos WHERE id_puesto = ? AND nombre_producto = ?');
            $st->execute([$idPuesto, $l['nombre']]);
            $p = $st->fetch();
            if ($p) {
                $idProd = (int)$p['id_producto'];
                if ($p['estado'] !== 'Activo') $pdo->prepare("UPDATE productos SET estado = 'Activo' WHERE id_producto = ?")->execute([$idProd]);
            } else {
                $pdo->prepare('INSERT INTO productos (id_puesto, nombre_producto) VALUES (?,?)')->execute([$idPuesto, $l['nombre']]);
                $idProd = (int)$pdo->lastInsertId();
            }

            $st = $pdo->prepare('SELECT id_inventario FROM inventario_calidades WHERE id_producto = ? AND calidad = ?');
            $st->execute([$idProd, $l['calidad']]);
            $idInv = $st->fetchColumn();
            if (!$idInv) {
                $pdo->prepare('INSERT INTO inventario_calidades (id_producto, calidad, stock_actual, stock_minimo, precio_venta_diario)
                               VALUES (?,?,0,0,?)')->execute([$idProd, $l['calidad'], dinero($l['precio'])]);
                $idInv = (int)$pdo->lastInsertId();
            }

            $pdo->prepare('INSERT INTO detalle_entrada (id_entrada, id_inventario, cantidad_recibida, costo_unitario) VALUES (?,?,?,?)')
                ->execute([$idEntrada, (int)$idInv, $l['cant'], dinero($l['costo'])]);
            // RF-003: el precio del día queda con el último ingresado
            $pdo->prepare('UPDATE inventario_calidades SET precio_venta_diario = ? WHERE id_inventario = ?')
                ->execute([dinero($l['precio']), (int)$idInv]);
        }

        $st = $pdo->prepare('SELECT total_compra FROM entradas_mercancia WHERE id_entrada = ?');
        $st->execute([$idEntrada]);
        $total = (float)$st->fetchColumn();
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (($e->errorInfo[0] ?? '') === '45000') fallo(400, $e->errorInfo[2] ?? 'No se pudo registrar la entrada.');
        error_log('inventario.php entrada: ' . $e->getMessage());
        fallo(500, 'No se pudo registrar la entrada. Intenta de nuevo.');
    }
    responder(200, ['ok' => true, 'mensaje' => 'Entrada registrada.', 'total' => $total, 'id' => $idEntrada]);
}

fallo(400, 'Acción no válida.');