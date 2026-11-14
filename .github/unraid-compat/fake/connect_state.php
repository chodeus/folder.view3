<?php
// Stand-in for the Connect plugin's include/state.php, which the webGUI repo lacks from 7.2 on: 7.4's header requires it
class ServerState { public function getServerStateJsonForHtmlAttr() { return htmlspecialchars('{}'); } }
