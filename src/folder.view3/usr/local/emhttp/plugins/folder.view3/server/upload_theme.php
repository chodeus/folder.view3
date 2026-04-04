<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $type = $_POST['type'] ?? '';
    if (!in_array($type, ['css', 'folder'], true)) {
        echo json_encode(['error' => 'Invalid type.']); exit;
    }
    global $configDir;
    $stylesDir = "$configDir/styles";
    if (!is_dir($stylesDir)) { @mkdir($stylesDir, 0770, true); }
    if ($type === 'css') {
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            echo json_encode(['error' => 'Upload failed.']); exit;
        }
        $file = $_FILES['file'];
        if ($file['size'] > 2 * 1024 * 1024) {
            echo json_encode(['error' => 'File too large (max 2 MB).']); exit;
        }
        if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'css') {
            echo json_encode(['error' => 'Only .css files are accepted.']); exit;
        }
        $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '-', pathinfo($file['name'], PATHINFO_FILENAME)) . '.css';
        $dest = "$stylesDir/$safeName.disabled";
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            echo json_encode(['error' => 'Failed to save file.']); exit;
        }
        @chmod($dest, 0660);
        $warnings = fv3_scan_css_warnings(dirname($dest), [basename($dest)]);
        $result = ['success' => true, 'name' => pathinfo($safeName, PATHINFO_FILENAME)];
        if (!empty($warnings)) $result['warnings'] = $warnings;
        echo json_encode($result);
    } else {
        $folderName = $_POST['folder_name'] ?? '';
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $folderName)) {
            echo json_encode(['error' => 'Invalid folder name.']); exit;
        }
        $files = $_FILES['files'] ?? [];
        $paths = $_POST['paths'] ?? [];
        if (empty($files['name'])) {
            echo json_encode(['error' => 'No files received.']); exit;
        }
        $destDir = "$stylesDir/$folderName.disabled";
        if (!is_dir($destDir)) { @mkdir($destDir, 0770, true); }
        $saved = 0;
        foreach ($files['name'] as $i => $name) {
            if ($files['error'][$i] !== UPLOAD_ERR_OK) continue;
            if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'css') continue;
            $relPath = isset($paths[$i]) ? $paths[$i] : $name;
            $safeParts = array_map(fn($p) => preg_replace('/[^a-zA-Z0-9._-]/', '-', $p), explode('/', $relPath));
            $safeParts = array_values(array_filter($safeParts, fn($p) => $p !== '' && $p !== '.' && $p !== '..'));
            $safePath = implode('/', $safeParts);
            $targetPath = "$destDir/$safePath";
            $targetParent = dirname($targetPath);
            if (!is_dir($targetParent)) { @mkdir($targetParent, 0770, true); }
            if (move_uploaded_file($files['tmp_name'][$i], $targetPath)) {
                @chmod($targetPath, 0660);
                $saved++;
            }
        }
        if ($saved === 0) {
            @rmdir($destDir);
            echo json_encode(['error' => 'No CSS files were uploaded.']); exit;
        }
        $savedPaths = [];
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($destDir, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iter as $item) {
            if ($item->isFile() && preg_match('/\.css$/i', $item->getFilename())) {
                $savedPaths[] = substr($item->getPathname(), strlen($destDir) + 1);
            }
        }
        $warnings = fv3_scan_css_warnings($destDir, $savedPaths);
        $result = ['success' => true, 'name' => $folderName, 'files' => $saved];
        if (!empty($warnings)) $result['warnings'] = $warnings;
        echo json_encode($result);
    }
?>
