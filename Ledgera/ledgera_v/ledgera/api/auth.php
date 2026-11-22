<?php
// Úsalo al inicio de cada endpoint protegido:
//   require 'auth.php'; exigir_rol(['Dueno']);
require 'db.php';
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();

const INACTIVIDAD_SEG = 15 * 60; // RNF-004

// Verifica sesión vigente. Mientras la clave sea temporal, bloquea todo
// (salvo cambiar_clave.php, que la llama con $permitirTemporal = true).
function exigir_sesion(bool $permitirTemporal = false): void {
    if (empty($_SESSION['id_usuario'])) {
        responder(401, ['ok' => false, 'mensaje' => 'Inicia sesión para continuar.']);
    }
    if (time() - ($_SESSION['ultima_actividad'] ?? 0) > INACTIVIDAD_SEG) {
        $_SESSION = [];
        session_destroy();
        responder(401, ['ok' => false, 'mensaje' => 'Tu sesión se cerró por inactividad.']);
    }
    $_SESSION['ultima_actividad'] = time();
    if (!$permitirTemporal && !empty($_SESSION['cambir_clave'])) {
        responder(403, ['ok' => false, 'cambiar_clave' => true,
                        'mensaje' => 'Primero debes cambiar tu clave temporal.']);
    }
}

function exigir_rol(array $roles): void {
    exigir_sesion();
    if (!in_array($_SESSION['rol'], $roles, true)) {
        responder(403, ['ok' => false, 'mensaje' => 'No tienes permiso para esto.']);
    }
}