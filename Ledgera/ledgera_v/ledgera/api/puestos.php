<?php
// API de puestos (solo Administrador)
//   GET  puestos.php                          -> puestos y Dueños activos disponibles
//   POST puestos.php {accion:'crear'|'editar'|'dueno'|'estado', ...}
require 'auth.php';
exigir_rol(['Administrador']);
$pdo = db();

function error(int $c, string $m): void { responder($c, ['ok' => false, 'mensaje' => $m]); }

function datos_puesto(array $in): array {
    $nombre = trim($in['nombre'] ?? '');
    $bodega = trim($in['bodega'] ?? '');
    if ($nombre === '' || $bodega === '') error(400, 'Completa el nombre y la bodega.');
    if (mb_strlen($nombre) > 100 || mb_strlen($bodega) > 100) error(400, 'El nombre y la bodega admiten máximo 100 letras.');
    return [$nombre, $bodega];
}

// ---------- GET ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $puestos = $pdo->query(
        "SELECT p.id_puesto AS id, p.nombre_puesto AS nombre, p.ubicacion_bodega AS bodega, p.estado,
                (SELECT u.nombre_completo FROM usuarios u
                 WHERE u.id_puesto = p.id_puesto AND u.rol = 'Dueno' AND u.estado = 'Activo' LIMIT 1) AS dueno
         FROM puestos p ORDER BY p.estado, p.nombre_puesto")->fetchAll();
    $duenos = $pdo->query(
        "SELECT u.id_usuario AS id, u.nombre_completo AS nombre, u.id_puesto, p.nombre_puesto AS puesto
         FROM usuarios u LEFT JOIN puestos p ON p.id_puesto = u.id_puesto
         WHERE u.rol = 'Dueno' AND u.estado = 'Activo' ORDER BY u.nombre_completo")->fetchAll();
    responder(200, ['ok' => true, 'puestos' => $puestos, 'duenos' => $duenos]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') error(405, 'Método no permitido.');

$in     = json_decode(file_get_contents('php://input'), true) ?? [];
$accion = $in['accion'] ?? '';

// ---------- CREAR ----------
if ($accion === 'crear') {
    [$nombre, $bodega] = datos_puesto($in);
    try {
        $pdo->prepare('INSERT INTO puestos (nombre_puesto, ubicacion_bodega) VALUES (?, ?)')
            ->execute([$nombre, $bodega]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') error(409, 'Este puesto ya existe.');
        throw $e;
    }
    responder(200, ['ok' => true, 'mensaje' => 'Puesto creado.']);
}

$id = (int)($in['id'] ?? 0);
$st = $pdo->prepare('SELECT * FROM puestos WHERE id_puesto = ?');
$st->execute([$id]);
$puesto = $st->fetch();
if (!$puesto) error(404, 'El puesto no existe.');

// ---------- EDITAR ----------
if ($accion === 'editar') {
    [$nombre, $bodega] = datos_puesto($in);
    try {
        $pdo->prepare('UPDATE puestos SET nombre_puesto = ?, ubicacion_bodega = ? WHERE id_puesto = ?')
            ->execute([$nombre, $bodega, $id]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') error(409, 'Este puesto ya existe.');
        throw $e;
    }
    responder(200, ['ok' => true, 'mensaje' => 'Cambios guardados.']);
}

// ---------- CAMBIAR DUEÑO ----------
if ($accion === 'dueno') {
    if ($puesto['estado'] !== 'Activo') error(400, 'Activa el puesto antes de asignarle un Dueño.');
    $nuevo = (int)($in['dueno_id'] ?? 0);
    $st = $pdo->prepare("SELECT id_usuario, id_puesto FROM usuarios
                         WHERE id_usuario = ? AND rol = 'Dueno' AND estado = 'Activo'");
    $st->execute([$nuevo]);
    $u = $st->fetch();
    if (!$u) error(400, 'Elige una cuenta de Dueño que esté activa.');
    if ((int)$u['id_puesto'] === $id) error(400, 'Esa persona ya es la Dueña de este puesto.');

    $pdo->beginTransaction();
    try {
        // El Dueño anterior pierde el acceso a este puesto (queda sin puesto, no puede iniciar sesión)
        $pdo->prepare("UPDATE usuarios SET id_puesto = NULL
                       WHERE id_puesto = ? AND rol = 'Dueno' AND id_usuario <> ?")->execute([$id, $nuevo]);
        $pdo->prepare('UPDATE usuarios SET id_puesto = ? WHERE id_usuario = ?')->execute([$id, $nuevo]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    responder(200, ['ok' => true, 'mensaje' => 'Dueño asignado.']);
}

// ---------- ACTIVAR / DESACTIVAR ----------
if ($accion === 'estado') {
    $activar = !empty($in['activo']);
    $pdo->prepare('UPDATE puestos SET estado = ? WHERE id_puesto = ?')
        ->execute([$activar ? 'Activo' : 'Inactivo', $id]);
    responder(200, ['ok' => true, 'mensaje' => $activar ? 'Puesto activado.' : 'Puesto desactivado.']);
}

error(400, 'Acción no válida.');