<?php
// Conexión PDO a MySQL. Ajusta usuario/clave a tu entorno local.
date_default_timezone_set('America/Bogota');

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=localhost;dbname=LEDGERA;charset=utf8mb4',
            'root', '',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
        $pdo->exec("SET time_zone = '-05:00'"); // Colombia, evita cierres en el día equivocado
    }
    return $pdo;
}

function responder(int $codigo, array $datos): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}