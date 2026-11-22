<?php
// API de ventas (Dueño y Vendedor)
//   GET  ventas.php?accion=catalogo           -> productos con sus calidades, stock y precio del día
//   GET  ventas.php?accion=clientes&q=texto   -> busca clientes del puesto
//   POST ventas.php {accion:'registrar', ...} -> registra una venta (un producto y calidad)
require 'auth.php';
exigir_rol(['Dueno', 'Vendedor']);
$pdo       = db();
$idUsuario = (int)$_SESSION['id_usuario'];
$idPuesto  = (int)($_SESSION['id_puesto'] ?? 0);

function fallo(int $c, string $m): void { responder($c, ['ok' => false, 'mensaje' => $m]); }
function abortar(PDO $pdo, int $c, string $m): void {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fallo($c, $m);
}
function dinero(int $centavos): string { return number_format($centavos / 100, 2, '.', ''); }

if ($idPuesto <= 0) fallo(403, 'Tu cuenta no tiene un puesto asignado.');

// ---------- GET ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $accion = $_GET['accion'] ?? '';

    if ($accion === 'catalogo') {
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
            if (!isset($productos[$id])) {
                $productos[$id] = ['id' => $id, 'nombre' => $f['nombre_producto'], 'calidades' => []];
            }
            $productos[$id]['calidades'][] = [
                'id'     => (int)$f['id_inventario'],
                'nombre' => $f['calidad'],
                'stock'  => (int)$f['stock_actual'],
                'minimo' => (int)$f['stock_minimo'],
                'precio' => (float)$f['precio_venta_diario'],
            ];
        }
        responder(200, ['ok' => true, 'productos' => array_values($productos)]);
    }

    if ($accion === 'clientes') {
        $q = trim($_GET['q'] ?? '');
        if (mb_strlen($q) < 2) responder(200, ['ok' => true, 'clientes' => []]);
        $like = '%' . addcslashes($q, '%_\\') . '%';
        $st = $pdo->prepare(
            "SELECT id_cliente AS id, nombre_completo AS nombre, telefono,
                    plazo_credito_dias AS plazo, fn_deuda_cliente(id_cliente) AS deuda
             FROM clientes
             WHERE id_puesto = ? AND estado = 'Activo' AND (nombre_completo LIKE ? OR telefono LIKE ?)
             ORDER BY nombre_completo LIMIT 8");
        $st->execute([$idPuesto, $like, $like]);
        responder(200, ['ok' => true, 'clientes' => $st->fetchAll()]);
    }

    fallo(400, 'Acción no válida.');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fallo(405, 'Método no permitido.');

$in = json_decode(file_get_contents('php://input'), true) ?? [];
if (($in['accion'] ?? '') !== 'registrar') fallo(400, 'Acción no válida.');

// ---------- Validar lo que llega (el total lo calcula el servidor) ----------
$idInv    = (int)($in['id_inventario'] ?? 0);
$cant     = (int)($in['cantidad'] ?? 0);
$precioC  = (int)round(((float)($in['precio'] ?? 0)) * 100);   // en centavos, sin errores de decimales
$pago     = $in['pago'] ?? '';
$canal    = $in['canal'] ?? 'Mostrador';

if ($idInv <= 0)                         fallo(400, 'Elige el producto y su calidad.');
if ($cant < 1 || $cant > 100000)         fallo(400, 'La cantidad no es válida.');
if ($precioC <= 0 || $precioC > 9999999999) fallo(400, 'Escribe un precio de venta válido.');
if (!in_array($pago, ['Efectivo', 'Nequi', 'Daviplata', 'Bre-B', 'Fiado', 'Mixto'], true)) fallo(400, 'Elige la forma de pago.');
if (!in_array($canal, ['Mostrador', 'Domicilio'], true)) fallo(400, 'El canal no es válido.');

$totalC = $cant * $precioC;
$efC = 0; $digC = 0; $credC = 0; $medioDigital = null;

switch ($pago) {
    case 'Efectivo': $efC = $totalC; break;
    case 'Nequi': case 'Daviplata': case 'Bre-B': $digC = $totalC; $medioDigital = $pago; break;
    case 'Fiado': $credC = $totalC; break;
    case 'Mixto':
        $efC = (int)round(((float)($in['efectivo'] ?? 0)) * 100);
        if ($efC <= 0 || $efC >= $totalC) fallo(400, 'En pago mixto, el efectivo debe ser mayor a 0 y menor al total.');
        $credC = $totalC - $efC;
        break;
}
$usaCredito = $credC > 0;

// ---------- Registrar en una sola transacción ----------
$pdo->beginTransaction();
try {
    // Bloquea la fila del inventario para que dos ventas a la vez no se pisen
    $st = $pdo->prepare(
        "SELECT ic.stock_actual, ic.calidad, p.nombre_producto
         FROM inventario_calidades ic JOIN productos p ON p.id_producto = ic.id_producto
         WHERE ic.id_inventario = ? AND p.id_puesto = ? AND p.estado = 'Activo' FOR UPDATE");
    $st->execute([$idInv, $idPuesto]);
    $inv = $st->fetch();
    if (!$inv) abortar($pdo, 404, 'Ese producto no existe o no es de tu puesto.');

    // Regla del 20 % (RF-004)
    $stock = (int)$inv['stock_actual'];
    $advertencia = null;
    if ($cant > $stock) {
        if ($stock <= 0 || ($cant - $stock) * 5 >= $stock) {
            abortar($pdo, 409, 'No se puede vender esa cantidad: supera el stock del sistema en un 20 % o más. Corrige el inventario primero.');
        }
        $advertencia = "Stock insuficiente en el sistema (había $stock). La venta se registró; corrige el inventario.";
    }

    // Cliente (solo para fiado o mixto)
    $idCliente = null; $nombreCliente = null; $plazo = null; $vence = null;
    if ($usaCredito) {
        if (!empty($in['id_cliente'])) {
            $st = $pdo->prepare("SELECT id_cliente, nombre_completo, plazo_credito_dias FROM clientes
                                 WHERE id_cliente = ? AND id_puesto = ? AND estado = 'Activo'");
            $st->execute([(int)$in['id_cliente'], $idPuesto]);
            $c = $st->fetch();
            if (!$c) abortar($pdo, 404, 'Ese cliente no existe en tu puesto.');
        } elseif (!empty($in['cliente_nuevo']) && is_array($in['cliente_nuevo'])) {
            $n = $in['cliente_nuevo'];
            $nombre = trim($n['nombre'] ?? '');
            $tel    = preg_replace('/\D/', '', $n['telefono'] ?? '');
            if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 150) abortar($pdo, 400, 'Escribe el nombre completo del cliente.');
            if (strlen($tel) < 7 || strlen($tel) > 15)               abortar($pdo, 400, 'El teléfono debe tener entre 7 y 15 números.');
            if (empty($n['consentimiento']))                          abortar($pdo, 400, 'El cliente debe autorizar el uso de sus datos.');
            try {
                $pdo->prepare('INSERT INTO clientes (id_puesto, nombre_completo, telefono, consentimiento_datos)
                               VALUES (?, ?, ?, NOW())')->execute([$idPuesto, $nombre, $tel]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') abortar($pdo, 409, 'Ya existe un cliente con ese teléfono. Búscalo en la lista.');
                throw $e;
            }
            $st = $pdo->prepare('SELECT id_cliente, nombre_completo, plazo_credito_dias FROM clientes WHERE id_cliente = ?');
            $st->execute([(int)$pdo->lastInsertId()]);
            $c = $st->fetch();
        } else {
            abortar($pdo, 400, 'Elige el cliente o crea uno nuevo.');
        }
        $idCliente     = (int)$c['id_cliente'];
        $nombreCliente = $c['nombre_completo'];
        $plazo         = (int)$c['plazo_credito_dias'];
        $vence         = date('Y-m-d', strtotime("+$plazo days"));
    }

    // Los triggers descuentan el stock y crean el crédito
    $pdo->prepare('INSERT INTO ventas (id_puesto, id_usuario, id_cliente, canal, total_venta,
                                       monto_efectivo, monto_digital, medio_digital, monto_credito)
                   VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$idPuesto, $idUsuario, $idCliente, $canal, dinero($totalC),
                   dinero($efC), dinero($digC), $medioDigital, dinero($credC)]);
    $idVenta = (int)$pdo->lastInsertId();

    $pdo->prepare('INSERT INTO detalle_venta (id_venta, id_inventario, cantidad_vendida, precio_unitario)
                   VALUES (?,?,?,?)')->execute([$idVenta, $idInv, $cant, dinero($precioC)]);

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (($e->errorInfo[0] ?? '') === '45000') fallo(400, $e->errorInfo[2] ?? 'No se pudo registrar la venta.');
    error_log('ventas.php: ' . $e->getMessage());
    fallo(500, 'No se pudo registrar la venta. Intenta de nuevo.');
}

responder(200, ['ok' => true, 'mensaje' => 'Venta registrada.', 'venta' => [
    'id'          => $idVenta,
    'producto'    => $inv['nombre_producto'],
    'calidad'     => $inv['calidad'],
    'cantidad'    => $cant,
    'total'       => $totalC / 100,
    'efectivo'    => $efC / 100,
    'digital'     => $digC / 100,
    'medio'       => $medioDigital,
    'credito'     => $credC / 100,
    'cliente'     => $nombreCliente,
    'vencimiento' => $vence,
    'advertencia' => $advertencia,
]]);