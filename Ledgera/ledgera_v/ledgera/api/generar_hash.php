<?php
// Ejecutar UNA vez por CLI: php generar_hash.php miClave123
// Pega el resultado en usuarios.password_hash (reemplaza 'hash_de_prueba').
echo password_hash($argv[1] ?? 'cambiame', PASSWORD_DEFAULT) . PHP_EOL;