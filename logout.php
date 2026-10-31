<?php
require __DIR__ . '/lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    start_session();
    $_SESSION = [];
    session_destroy();
}
redirect('');
