<?php
// GET /me.php -> sesión activa + datos básicos del usuario
require 'db.php';
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();
if (empty($_SESSION['id_usuario']) || time() - ($_SESSION['ultima_actividad'] ?? 0) > 15 * 60) {
    responder(401, ['ok' => false]);
}
$_SESSION['ultima_actividad'] = time();
responder(200, ['ok' => true, 'usuario' => [
    'nombre'        => $_SESSION['nombre'] ?? '',
    'rol'           => $_SESSION['rol'],
    'cambiar_clave' => !empty($_SESSION['cambiar_clave']),
]]);