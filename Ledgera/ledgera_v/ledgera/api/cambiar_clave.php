<?php
// POST /cambiar_clave.php {"actual":"...","nueva":"...","confirmar":"..."}
require 'auth.php';
exigir_sesion(true); // permitido aunque la clave sea temporal

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(405, ['ok' => false, 'mensaje' => 'Método no permitido.']);
}
function fallo(int $c, string $m): void { responder($c, ['ok' => false, 'mensaje' => $m]); }

$in     = json_decode(file_get_contents('php://input'), true) ?? [];
$actual = $in['actual'] ?? '';
$nueva  = $in['nueva'] ?? '';
$conf   = $in['confirmar'] ?? '';

if ($actual === '' || $nueva === '' || $conf === '') fallo(400, 'Completa los tres campos.');
if (strlen($nueva) < 8)  fallo(400, 'La clave nueva es muy corta. Usa mínimo 8 caracteres.');
if (strlen($nueva) > 64) fallo(400, 'La clave nueva es muy larga. Usa máximo 64 caracteres.');
if (!preg_match('/[A-Za-z]/', $nueva) || !preg_match('/[0-9]/', $nueva))
    fallo(400, 'La clave nueva debe tener al menos una letra y un número.');
if ($nueva !== $conf)    fallo(400, 'Las claves nuevas no coinciden.');
if ($nueva === $actual)  fallo(400, 'La clave nueva debe ser distinta a la actual.');

$pdo = db();
$id  = (int)$_SESSION['id_usuario'];
$st  = $pdo->prepare('SELECT password_hash, intentos_fallidos FROM usuarios WHERE id_usuario = ?');
$st->execute([$id]);
$u = $st->fetch();
if (!$u) fallo(401, 'Inicia sesión para continuar.');

// Clave actual incorrecta: mismo límite de 3 intentos que el login
if (!password_verify($actual, $u['password_hash'])) {
    $intentos = $u['intentos_fallidos'] + 1;
    if ($intentos >= 3) {
        $pdo->prepare('UPDATE usuarios SET intentos_fallidos = ?, fecha_bloqueo = NOW() WHERE id_usuario = ?')
            ->execute([$intentos, $id]);
        $_SESSION = [];
        session_destroy();
        responder(423, ['ok' => false, 'cerrar' => true,
                        'mensaje' => 'Demasiados intentos. Cuenta bloqueada por 3 minutos.']);
    }
    $pdo->prepare('UPDATE usuarios SET intentos_fallidos = ? WHERE id_usuario = ?')->execute([$intentos, $id]);
    fallo(401, 'La clave actual no es correcta. Te quedan ' . (3 - $intentos) . ' intentos.');
}

$pdo->prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_clave = 0,
               intentos_fallidos = 0, fecha_bloqueo = NULL WHERE id_usuario = ?')
    ->execute([password_hash($nueva, PASSWORD_DEFAULT), $id]);

session_regenerate_id(true);
$_SESSION['cambiar_clave'] = false;

responder(200, ['ok' => true, 'mensaje' => 'Clave cambiada.', 'rol' => $_SESSION['rol']]);