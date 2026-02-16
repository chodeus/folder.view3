<?php
  require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
  echo json_encode(readUnraidOrder($_GET['type']));
?>