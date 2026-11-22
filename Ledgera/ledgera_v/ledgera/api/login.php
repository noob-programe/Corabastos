<?php
// POST /login.php  {"usuario":"...","password":"..."}
require 'db.php';

const MAX_INTENTOS = 3;
const MINUTOS_BLOQUEO = 3;

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(405, ['ok' => false, 'mensaje' => 'Método no permitido.']);
}

$in = json_decode(file_get_contents('php://input'), true) ?? [];
$usuario  = trim($in['usuario'] ?? '');
$password = $in['password'] ?? '';

if ($usuario === '' || $password === '') {
    responder(400, ['ok' => false, 'mensaje' => 'Escribe tu usuario y tu contraseña.']);
}

$pdo = db();
$st = $pdo->prepare('SELECT u.*, p.estado AS estado_puesto
                     FROM usuarios u LEFT JOIN puestos p ON p.id_puesto = u.id_puesto
                     WHERE u.usuario = ?');
$st->execute([$usuario]);
$u = $st->fetch();

// Mismo mensaje si el usuario no existe o la clave falla (no revela cuáles usuarios existen)
$MSG_FALLO = 'Usuario o contraseña incorrectos.';

if (!$u) {
    password_verify($password, '$2y$10$usesomesillystringforsaltuoQ5f5Y5lq3V0mQ0QZ0Q0Q0Q0Q0Q0Q0Q'); // tiempo parejo
    responder(401, ['ok' => false, 'mensaje' => $MSG_FALLO]);
}

// 1) Bloqueo vigente
if ($u['fecha_bloqueo'] !== null) {
    $fin = strtotime($u['fecha_bloqueo']) + MINUTOS_BLOQUEO * 60;
    if (time() < $fin) {
        $seg = $fin - time();
        responder(423, ['ok' => false, 'mensaje' => 'Cuenta bloqueada. Intenta de nuevo en ' . ceil($seg / 60) . ' min.']);
    }
    // Bloqueo vencido: reiniciar
    $pdo->prepare('UPDATE usuarios SET intentos_fallidos = 0, fecha_bloqueo = NULL WHERE id_usuario = ?')
        ->execute([$u['id_usuario']]);
    $u['intentos_fallidos'] = 0;
}

// 2) Cuenta o puesto inactivo
if ($u['estado'] !== 'Activo' || ($u['id_puesto'] !== null && $u['estado_puesto'] !== 'Activo')) {
    responder(403, ['ok' => false, 'mensaje' => 'Tu cuenta no está activa. Habla con tu superior.']);
}

// 2b) Dueño o Vendedor sin puesto asignado
if ($u['rol'] !== 'Administrador' && $u['id_puesto'] === null) {
    responder(403, ['ok' => false, 'mensaje' => 'Tu cuenta no tiene un puesto asignado. Habla con el Administrador.']);
}

// 3) Verificar clave
if (!password_verify($password, $u['password_hash'])) {
    $intentos = $u['intentos_fallidos'] + 1;
    if ($intentos >= MAX_INTENTOS) {
        $pdo->prepare('UPDATE usuarios SET intentos_fallidos = ?, fecha_bloqueo = NOW() WHERE id_usuario = ?')
            ->execute([$intentos, $u['id_usuario']]);
        responder(423, ['ok' => false, 'mensaje' => 'Demasiados intentos. Cuenta bloqueada por ' . MINUTOS_BLOQUEO . ' minutos.']);
    }
    $pdo->prepare('UPDATE usuarios SET intentos_fallidos = ? WHERE id_usuario = ?')
        ->execute([$intentos, $u['id_usuario']]);
    responder(401, ['ok' => false, 'mensaje' => $MSG_FALLO . ' Te quedan ' . (MAX_INTENTOS - $intentos) . ' intentos.']);
}

// 4) Éxito
$pdo->prepare('UPDATE usuarios SET intentos_fallidos = 0, fecha_bloqueo = NULL WHERE id_usuario = ?')
    ->execute([$u['id_usuario']]);

session_regenerate_id(true); // evita fijación de sesión
$_SESSION['id_usuario'] = (int)$u['id_usuario'];
$_SESSION['nombre']     = $u['nombre_completo'];
$_SESSION['cambiar_clave'] = !empty($u['debe_cambiar_clave']);
$_SESSION['rol']        = $u['rol'];
$_SESSION['id_puesto']  = $u['id_puesto'] !== null ? (int)$u['id_puesto'] : null;
$_SESSION['ultima_actividad'] = time();

responder(200, ['ok' => true, 'cambiar_clave' => !empty($u['debe_cambiar_clave']), 'usuario' => [
    'nombre' => $u['nombre_completo'],
    'rol'    => $u['rol'],
]]);