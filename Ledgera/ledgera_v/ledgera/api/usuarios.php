<?php
// API de usuarios (solo Administrador)
//   GET  usuarios.php                         -> lista de usuarios y puestos activos
//   POST usuarios.php {accion:'crear'|'editar'|'restablecer'|'estado', ...}
require 'auth.php';
exigir_rol(['Administrador']);
$pdo = db();
$yo  = (int)$_SESSION['id_usuario'];

function clave_temporal(int $n = 8): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $s = '';
    for ($i = 0; $i < $n; $i++) $s .= $chars[random_int(0, strlen($chars) - 1)];
    return $s;
}

function error(int $c, string $m): void { responder($c, ['ok' => false, 'mensaje' => $m]); }

// Valida el puesto según el rol y devuelve el id a guardar (NULL para Administrador)
function validar_puesto(PDO $pdo, string $rol, $id_puesto, int $excluir = 0): ?int {
    if ($rol === 'Administrador') return null;
    if (!$id_puesto) error(400, 'Elige el puesto del usuario.');
    $st = $pdo->prepare('SELECT estado FROM puestos WHERE id_puesto = ?');
    $st->execute([(int)$id_puesto]);
    $p = $st->fetch();
    if (!$p || $p['estado'] !== 'Activo') error(400, 'Ese puesto no existe o está inactivo.');
    if ($rol === 'Dueno') {
        $st = $pdo->prepare("SELECT 1 FROM usuarios WHERE id_puesto = ? AND rol = 'Dueno'
                             AND estado = 'Activo' AND id_usuario <> ?");
        $st->execute([(int)$id_puesto, $excluir]);
        if ($st->fetch()) error(409, 'Ese puesto ya tiene un Dueño activo.');
    }
    return (int)$id_puesto;
}

function datos_basicos(array $in): array {
    $usuario = trim($in['usuario'] ?? '');
    $nombre  = trim($in['nombre'] ?? '');
    $cedula  = trim($in['cedula'] ?? '');
    if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $usuario))
        error(400, 'El usuario debe tener entre 3 y 50 letras, números, punto o guion, sin espacios.');
    if ($nombre === '' || mb_strlen($nombre) > 150) error(400, 'Escribe el nombre completo.');
    if (!preg_match('/^[0-9]{5,15}$/', $cedula)) error(400, 'La cédula debe tener solo números (5 a 15 dígitos).');
    return [$usuario, $nombre, $cedula];
}

// ---------- GET ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $usuarios = $pdo->query(
        "SELECT u.id_usuario AS id, u.usuario, u.nombre_completo AS nombre,
                u.num_identificacion AS cedula, u.rol, u.estado, u.id_puesto,
                p.nombre_puesto AS puesto
         FROM usuarios u LEFT JOIN puestos p ON p.id_puesto = u.id_puesto
         ORDER BY FIELD(u.rol,'Administrador','Dueno','Vendedor'), u.nombre_completo")->fetchAll();
    $puestos = $pdo->query(
        "SELECT id_puesto AS id, nombre_puesto AS nombre FROM puestos
         WHERE estado = 'Activo' ORDER BY nombre_puesto")->fetchAll();
    responder(200, ['ok' => true, 'usuarios' => $usuarios, 'puestos' => $puestos]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') error(405, 'Método no permitido.');

$in     = json_decode(file_get_contents('php://input'), true) ?? [];
$accion = $in['accion'] ?? '';

// ---------- CREAR ----------
if ($accion === 'crear') {
    [$usuario, $nombre, $cedula] = datos_basicos($in);
    $rol = $in['rol'] ?? '';
    if (!in_array($rol, ['Administrador', 'Dueno', 'Vendedor'], true)) error(400, 'Elige un rol válido.');
    $id_puesto = validar_puesto($pdo, $rol, $in['id_puesto'] ?? null);

    $clave = clave_temporal();
    try {
        $pdo->prepare('INSERT INTO usuarios (id_puesto, usuario, nombre_completo, num_identificacion,
                                             password_hash, rol, debe_cambiar_clave)
                       VALUES (?,?,?,?,?,?,1)')
            ->execute([$id_puesto, $usuario, $nombre, $cedula, password_hash($clave, PASSWORD_DEFAULT), $rol]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') error(409, 'Ese usuario o esa cédula ya existe.');
        throw $e;
    }
    responder(200, ['ok' => true, 'mensaje' => 'Usuario creado.', 'clave' => $clave]);
}

// Las demás acciones trabajan sobre un usuario existente
$id = (int)($in['id'] ?? 0);
$st = $pdo->prepare('SELECT * FROM usuarios WHERE id_usuario = ?');
$st->execute([$id]);
$obj = $st->fetch();
if (!$obj) error(404, 'El usuario no existe.');

// ---------- EDITAR ----------
if ($accion === 'editar') {
    [$usuario, $nombre, $cedula] = datos_basicos($in);
    $id_puesto = validar_puesto($pdo, $obj['rol'], $in['id_puesto'] ?? null, $id);
    try {
        $pdo->prepare('UPDATE usuarios SET usuario = ?, nombre_completo = ?, num_identificacion = ?, id_puesto = ?
                       WHERE id_usuario = ?')
            ->execute([$usuario, $nombre, $cedula, $id_puesto, $id]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') error(409, 'Ese usuario o esa cédula ya existe.');
        throw $e;
    }
    responder(200, ['ok' => true, 'mensaje' => 'Cambios guardados.']);
}

// ---------- RESTABLECER CLAVE ----------
if ($accion === 'restablecer') {
    if ($id === $yo) error(400, 'No puedes restablecer tu propia clave desde aquí.');
    $clave = clave_temporal();
    $pdo->prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_clave = 1,
                   intentos_fallidos = 0, fecha_bloqueo = NULL WHERE id_usuario = ?')
        ->execute([password_hash($clave, PASSWORD_DEFAULT), $id]);
    responder(200, ['ok' => true, 'mensaje' => 'Clave restablecida.', 'clave' => $clave]);
}

// ---------- ACTIVAR / DESACTIVAR ----------
if ($accion === 'estado') {
    $activar = !empty($in['activo']);
    if (!$activar) {
        if ($id === $yo) error(400, 'No puedes desactivar tu propia cuenta.');
        if ($obj['rol'] === 'Administrador') {
            $otros = $pdo->prepare("SELECT COUNT(*) FROM usuarios WHERE rol = 'Administrador'
                                    AND estado = 'Activo' AND id_usuario <> ?");
            $otros->execute([$id]);
            if ((int)$otros->fetchColumn() === 0) error(400, 'Debe quedar al menos un Administrador activo.');
        }
    } elseif ($obj['rol'] === 'Dueno') {
        validar_puesto($pdo, 'Dueno', $obj['id_puesto'], $id); // evita dos Dueños activos
    }
    $pdo->prepare('UPDATE usuarios SET estado = ? WHERE id_usuario = ?')
        ->execute([$activar ? 'Activo' : 'Inactivo', $id]);
    responder(200, ['ok' => true, 'mensaje' => $activar ? 'Usuario activado.' : 'Usuario desactivado.']);
}

error(400, 'Acción no válida.');