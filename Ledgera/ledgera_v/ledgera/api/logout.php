<?php
require 'db.php';
session_start();
session_destroy();
responder(200, ['ok' => true]);