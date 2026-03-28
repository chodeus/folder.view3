<?php
    define('FV3_DEBUG_MODE', file_exists('/tmp/fv3_debug_enabled'));
    $fv3_debug_log_file = "/tmp/folder_view3_php_debug.log";

    function fv3_debug_log($message) {
        if (FV3_DEBUG_MODE) {
            global $fv3_debug_log_file;
            $timestamp = date("Y-m-d H:i:s");
            if (is_array($message) || is_object($message)) {
                $message = json_encode($message);
            }
            @file_put_contents($fv3_debug_log_file, "[$timestamp] $message\n", FILE_APPEND);
            @chmod($fv3_debug_log_file, 0600);
        }
    }

    if (FV3_DEBUG_MODE && isset($_GET['type']) && basename($_SERVER['SCRIPT_NAME']) === 'read_info.php') {
        @file_put_contents($fv3_debug_log_file, "--- FolderView3 lib.php readInfo Start ---\n");
    }

    function fv3_validate_type(string $type): string {
        if (!in_array($type, ['docker', 'vm'], true)) {
            http_response_code(400);
            exit;
        }
        return $type;
    }

    $folderVersion = 1.0;
    $configDir = "/boot/config/plugins/folder.view3";
    $sourceDir = "/usr/local/emhttp/plugins/folder.view3";
    $documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? '/usr/local/emhttp';

    require_once("$documentRoot/webGui/include/Helpers.php");
    require_once("$documentRoot/plugins/dynamix.docker.manager/include/DockerClient.php");

    function fv3_require_libvirt_helpers(): bool {
        global $documentRoot;
        static $loaded = null;
        if ($loaded !== null) return $loaded;
        $path = "$documentRoot/plugins/dynamix.vm.manager/include/libvirt_helpers.php";
        if (!file_exists($path)) { $loaded = false; return false; }
        try {
            require_once($path);
            $loaded = true;
        } catch (\Throwable $e) {
            fv3_debug_log("fv3_require_libvirt_helpers: Failed to load libvirt_helpers.php - " . $e->getMessage());
            $loaded = false;
        }
        return $loaded;
    }

    function fv3_get_tailscale_ip_from_container(string $containerName): ?string {
        if (empty($containerName) || !preg_match('/^[a-zA-Z0-9_.-]+$/', $containerName)) {
            fv3_debug_log("    fv3_get_tailscale_ip_from_container: Invalid container name for exec: $containerName");
            return null;
        }
        $command = "docker exec " . escapeshellarg($containerName) . " tailscale ip -4 2>/dev/null";
        fv3_debug_log("    fv3_get_tailscale_ip_from_container: Executing: $command for $containerName");
        $output = [];
        $return_var = -1;
        @exec($command, $output, $return_var);
        
        if ($return_var === 0 && !empty($output) && filter_var(trim($output[0]), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $ip = trim($output[0]);
            fv3_debug_log("    fv3_get_tailscale_ip_from_container: Found IP for $containerName: $ip");
            return $ip;
        }
        fv3_debug_log("    fv3_get_tailscale_ip_from_container: No valid IP found for $containerName. Output: " . json_encode($output) . ", Return: $return_var");
        return null;
    }

    function fv3_get_tailscale_fqdn_from_container(string $containerName): ?string {
        if (empty($containerName) || !preg_match('/^[a-zA-Z0-9_.-]+$/', $containerName)) {
            fv3_debug_log("    fv3_get_tailscale_fqdn_from_container: Invalid container name for exec: $containerName");
            return null;
        }
        $command = "docker exec " . escapeshellarg($containerName) . " tailscale status --peers=false --json 2>/dev/null";
        fv3_debug_log("    fv3_get_tailscale_fqdn_from_container: Executing: $command for $containerName");
        $output_lines = [];
        $return_var = -1;
        @exec($command, $output_lines, $return_var);
        $json_output = implode("\n", $output_lines);

        if ($return_var === 0 && !empty($json_output)) {
            $status_data = json_decode($json_output, true);
            if (isset($status_data['Self']['DNSName'])) {
                $dnsName = rtrim($status_data['Self']['DNSName'], '.'); 
                fv3_debug_log("    fv3_get_tailscale_fqdn_from_container: Found DNSName for $containerName: " . $dnsName);
                return $dnsName;
            }
        }
        fv3_debug_log("    fv3_get_tailscale_fqdn_from_container: No DNSName found for $containerName. Output: " . $json_output . ", Return: $return_var");
        return null;
    }

    function readFolder(string $type) : string {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { createFile($type); }
        return file_get_contents("$configDir/$type.json");
    }

    function readUserPrefs(string $type) : string {
        $userPrefsDir = "/boot/config/plugins";
        $prefsFilePath = '';
        if($type == 'docker') { $prefsFilePath = "$userPrefsDir/dockerMan/userprefs.cfg"; }
        elseif($type == 'vm') { $prefsFilePath = "$userPrefsDir/dynamix.vm.manager/userprefs.cfg"; }
        else { return '[]'; }
        if(!file_exists($prefsFilePath)) { return '[]'; }
        $parsedIni = @parse_ini_file($prefsFilePath);
        return json_encode(array_values($parsedIni ?: []));
    }

    function syncContainerOrder(string $type): void {
        global $configDir;
        fv3_debug_log("syncContainerOrder called for type: $type");

        if ($type !== 'docker') { return; }

        $prefsFile = "/boot/config/plugins/dockerMan/userprefs.cfg";
        if (!file_exists($prefsFile)) { return; }

        $currentPrefs = @parse_ini_file($prefsFile);
        $currentOrder = $currentPrefs ? array_values($currentPrefs) : [];

        $foldersFile = "$configDir/docker.json";
        $folders = file_exists($foldersFile) ? (json_decode(file_get_contents($foldersFile), true) ?: []) : [];

        $dockerClient = new DockerClient();
        $allContainerNames = array_column($dockerClient->getDockerContainers(), 'Name');

        $folderContainers = [];
        $assignedContainers = [];
        foreach ($folders as $folderId => $folder) {
            $members = $folder['containers'] ?? [];
            if (!empty($folder['regex'])) {
                $regex = '/' . str_replace('/', '\/', $folder['regex']) . '/';
                foreach ($allContainerNames as $name) {
                    if (@preg_match($regex, $name) && !in_array($name, $members)) {
                        $members[] = $name;
                    }
                }
            }
            $members = array_values(array_filter($members, function($m) use ($allContainerNames, $assignedContainers) {
                return in_array($m, $allContainerNames) && !in_array($m, $assignedContainers);
            }));
            $folderContainers["folder-$folderId"] = $members;
            $assignedContainers = array_merge($assignedContainers, $members);
        }

        $newOrder = [];
        $seen = [];
        foreach ($currentOrder as $item) {
            if (isset($folderContainers[$item])) {
                foreach ($folderContainers[$item] as $ct) {
                    if (!in_array($ct, $seen)) { $newOrder[] = $ct; $seen[] = $ct; }
                }
                $newOrder[] = $item;
                $seen[] = $item;
            } elseif (in_array($item, $assignedContainers)) {
                continue;
            } elseif (in_array($item, $allContainerNames) && !in_array($item, $seen)) {
                $newOrder[] = $item;
                $seen[] = $item;
            }
        }

        foreach ($allContainerNames as $name) {
            if (!in_array($name, $seen) && !in_array($name, $assignedContainers)) {
                $newOrder[] = $name;
            }
        }
        foreach (array_keys($folderContainers) as $placeholder) {
            if (!in_array($placeholder, $seen)) {
                foreach ($folderContainers[$placeholder] as $ct) {
                    if (!in_array($ct, $seen)) { $newOrder[] = $ct; $seen[] = $ct; }
                }
                $newOrder[] = $placeholder;
                $seen[] = $placeholder;
            }
        }

        $ini = "";
        foreach ($newOrder as $i => $name) {
            $ini .= ($i + 1) . '="' . $name . '"' . "\n";
        }
        file_put_contents($prefsFile, $ini);
        fv3_debug_log("syncContainerOrder: wrote userprefs.cfg with " . count($newOrder) . " entries");

        // Reorder autostart file to match new container order
        $dockerManPaths = @parse_ini_file('/boot/config/plugins/dockerMan/dockerMan.cfg') ?: [];
        $autoStartFile = $dockerManPaths['autostart-file'] ?? "/var/lib/docker/unraid-autostart";
        if (file_exists($autoStartFile)) {
            $autoStartLines = @file($autoStartFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            // Build name→line map to preserve delay values (format: "name" or "name delay")
            $autoStartMap = [];
            foreach ($autoStartLines as $line) {
                $parts = explode(' ', $line, 2);
                $autoStartMap[$parts[0]] = $line;
            }
            // Remove stale entries (containers that no longer exist)
            foreach ($autoStartMap as $name => $line) {
                if (!in_array($name, $allContainerNames)) {
                    fv3_debug_log("syncContainerOrder: removing stale autostart entry '$name' (container no longer exists)");
                    unset($autoStartMap[$name]);
                }
            }

            // Rebuild autostart file in $newOrder sequence, only for containers already in autostart
            $newAutoStart = [];
            foreach ($newOrder as $name) {
                if (isset($autoStartMap[$name])) {
                    $newAutoStart[] = $autoStartMap[$name];
                    unset($autoStartMap[$name]);
                }
            }
            // Append any autostart containers not in $newOrder (shouldn't happen, but safety net)
            foreach ($autoStartMap as $line) {
                $newAutoStart[] = $line;
            }
            file_put_contents($autoStartFile, implode("\n", $newAutoStart) . "\n");
            fv3_debug_log("syncContainerOrder: wrote autostart file with " . count($newAutoStart) . " entries");
        }
    }

    function updateFolder(string $type, string $content, string $id = '') : void {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { createFile($type); if (empty($id)) $id = generateId(); }
        if(empty($id)) { $id = generateId(); }
        $decoded = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(400);
            exit;
        }
        $fileData = json_decode(file_get_contents("$configDir/$type.json"), true) ?: [];
        $fileData[$id] = $decoded;
        $path = "$configDir/$type.json";
        file_put_contents($path, json_encode($fileData));
        @chmod($path, 0660);
    }

    function updateFolderIds(string $type, string $data) : void {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { return; }
        $updates = json_decode($data, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($updates)) { http_response_code(400); exit; }
        $fileData = json_decode(file_get_contents("$configDir/$type.json"), true) ?: [];
        $changed = false;
        foreach ($updates as $folderId => $patch) {
            if (!preg_match('/^[A-Za-z0-9+\/=]+$/', $folderId)) continue;
            if (!isset($fileData[$folderId])) continue;
            if (isset($patch['containers']) && is_array($patch['containers'])) {
                $fileData[$folderId]['containers'] = $patch['containers'];
                $changed = true;
            }
            if (isset($patch['containerIds']) && is_array($patch['containerIds'])) {
                $fileData[$folderId]['containerIds'] = $patch['containerIds'];
                $changed = true;
            }
            if (isset($patch['containerImages']) && is_array($patch['containerImages'])) {
                $fileData[$folderId]['containerImages'] = $patch['containerImages'];
                $changed = true;
            }
            if (isset($patch['hidden_preview']) && is_array($patch['hidden_preview'])) {
                $fileData[$folderId]['hidden_preview'] = $patch['hidden_preview'];
                $changed = true;
            }
        }
        if ($changed) {
            $path = "$configDir/$type.json";
            file_put_contents($path, json_encode($fileData));
            @chmod($path, 0660);
        }
    }

    function deleteFolder(string $type, string $id) : void {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { createFile($type); return; }
        $fileData = json_decode(file_get_contents("$configDir/$type.json"), true) ?: [];
        unset($fileData[$id]);
        $path = "$configDir/$type.json";
        file_put_contents($path, json_encode($fileData));
        @chmod($path, 0660);
    }

    function readSettings() : string {
        global $configDir;
        $path = "$configDir/settings.json";
        if(!file_exists($path)) {
            if (!is_dir($configDir)) { @mkdir($configDir, 0770, true); }
            @file_put_contents($path, '{}');
            @chmod($path, 0660);
        }
        return file_get_contents($path);
    }

    function updateSettings(string $key, string $value) : void {
        global $configDir;
        $allowed = [
            'dashboard_docker_layout' => ['classic', 'fullwidth', 'accordion', 'inset', 'embossed'],
            'dashboard_vm_layout'     => ['classic', 'fullwidth', 'accordion', 'inset', 'embossed'],
            'dashboard_animation'            => ['yes', 'no'],
            'dashboard_docker_expand_toggle' => ['yes', 'no'],
            'dashboard_docker_greyscale'     => ['yes', 'no'],
            'dashboard_docker_folder_label'  => ['yes', 'no'],
            'dashboard_vm_expand_toggle'     => ['yes', 'no'],
            'dashboard_vm_greyscale'         => ['yes', 'no'],
            'dashboard_vm_folder_label'      => ['yes', 'no'],
            'default_preview'          => ['0', '1', '2', '3', '4'],
            'default_preview_hover'    => ['yes', 'no'],
            'default_preview_grayscale'=> ['yes', 'no'],
            'default_preview_webui'    => ['yes', 'no'],
            'default_preview_logs'     => ['yes', 'no'],
            'default_preview_console'  => ['yes', 'no'],
            'default_preview_update'   => ['yes', 'no'],
            'default_preview_vertical_bars' => ['yes', 'no'],
            'default_preview_border'   => ['yes', 'no'],
            'default_row_separator'    => ['yes', 'no'],
            'default_overflow'         => ['default', 'scroll', 'expand'],
            'default_context'          => ['0', '1', '2'],
            'default_update_column'    => ['yes', 'no']
        ];
        if (!isset($allowed[$key]) || !in_array($value, $allowed[$key], true)) {
            http_response_code(400);
            exit;
        }
        $path = "$configDir/settings.json";
        $fp = fopen($path, 'c+');
        if (!$fp) { http_response_code(500); exit; }
        flock($fp, LOCK_EX);
        $raw = stream_get_contents($fp);
        $data = json_decode($raw, true) ?: [];
        $data[$key] = $value;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        @chmod($path, 0660);
    }

    function updateSettingsFreeform(string $key, string $value) : void {
        global $configDir;
        $allowedFreeform = [
            'default_vertical_bars_color',
            'default_border_color',
            'default_separator_color',
            'default_preview_text_width'
        ];
        if (!in_array($key, $allowedFreeform, true)) {
            http_response_code(400);
            exit;
        }
        if (strlen($value) > 50) { http_response_code(400); exit; }
        $value = preg_replace('/[<>"\'\\\\]/', '', $value);
        $path = "$configDir/settings.json";
        $fp = fopen($path, 'c+');
        if (!$fp) { http_response_code(500); exit; }
        flock($fp, LOCK_EX);
        $raw = stream_get_contents($fp);
        $data = json_decode($raw, true) ?: [];
        if ($value === '') { unset($data[$key]); } else { $data[$key] = $value; }
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        @chmod($path, 0660);
    }

    function listThemes() : array {
        global $configDir;
        $stylesDir = "$configDir/styles";
        if (!is_dir($stylesDir)) return [];
        $themes = [];
        foreach (scandir($stylesDir) as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $path = "$stylesDir/$entry";
            if (!is_dir($path)) {
                if (preg_match('/^_fv3-generated\./', $entry)) continue;
                if (!preg_match('/\.css$/', $entry)) continue;
                $disabled = false;
                $name = preg_replace('/\.css$/', '', $entry);
            } else {
                $disabled = (bool) preg_match('/\.disabled$/', $entry);
                $name = preg_replace('/\.disabled$/', '', $entry);
            }
            $themes[] = [
                'name' => $name,
                'entry' => $entry,
                'isDir' => is_dir($path),
                'enabled' => !$disabled
            ];
        }
        return $themes;
    }

    function toggleTheme(string $entry, bool $enable, bool $exclusive) : void {
        global $configDir;
        $stylesDir = "$configDir/styles";
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $entry)) { http_response_code(400); exit; }
        $path = "$stylesDir/$entry";
        if (!file_exists($path)) { http_response_code(404); exit; }
        if ($exclusive && $enable) {
            foreach (scandir($stylesDir) as $e) {
                if ($e === '.' || $e === '..' || !is_dir("$stylesDir/$e")) continue;
                if (preg_match('/^_fv3-generated\./', $e)) continue;
                $ePath = "$stylesDir/$e";
                if (!preg_match('/\.disabled$/', $e) && $e !== $entry) {
                    @rename($ePath, $ePath . '.disabled');
                }
            }
        }
        $isDisabled = (bool) preg_match('/\.disabled$/', $entry);
        if ($enable && $isDisabled) {
            $newName = preg_replace('/\.disabled$/', '', $entry);
            @rename($path, "$stylesDir/$newName");
        } else if (!$enable && !$isDisabled) {
            @rename($path, $path . '.disabled');
        }
    }

    function importTheme(string $repoUrl) : array {
        global $configDir;
        $stylesDir = "$configDir/styles";
        if (!preg_match('#^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$#', $repoUrl)) {
            return ['error' => 'Invalid repo format. Use owner/repo.'];
        }
        $apiUrl = "https://api.github.com/repos/$repoUrl/contents/";
        $ctx = stream_context_create(['http' => [
            'header' => "User-Agent: FolderView3\r\n",
            'timeout' => 15
        ]]);
        $raw = @file_get_contents($apiUrl, false, $ctx);
        if ($raw === false) return ['error' => 'Failed to fetch repo contents.'];
        $contents = json_decode($raw, true);
        if (!is_array($contents)) return ['error' => 'Invalid GitHub API response.'];
        $cssFiles = array_filter($contents, fn($f) => isset($f['name']) && preg_match('/\.css$/i', $f['name']) && $f['type'] === 'file');
        if (empty($cssFiles)) return ['error' => 'No CSS files found in repo root.'];
        $repoName = explode('/', $repoUrl)[1];
        $repoNameDisabled = $repoName . '.disabled';
        $themeDir = "$stylesDir/$repoName";
        $themeDirDisabled = "$stylesDir/$repoNameDisabled";
        $wasDisabled = false;
        if (is_dir($themeDirDisabled)) {
            $themeDir = $themeDirDisabled;
            $wasDisabled = true;
        }
        if (is_dir($themeDir)) {
            foreach (scandir($themeDir) as $old) {
                if ($old === '.' || $old === '..') continue;
                @unlink("$themeDir/$old");
            }
        } else {
            @mkdir($themeDir, 0770, true);
        }
        $downloaded = [];
        foreach ($cssFiles as $file) {
            if (!isset($file['download_url'])) continue;
            $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '', $file['name']);
            $css = @file_get_contents($file['download_url'], false, $ctx);
            if ($css !== false) {
                file_put_contents("$themeDir/$safeName", $css);
                @chmod("$themeDir/$safeName", 0660);
                $downloaded[] = $safeName;
            }
        }
        if (empty($downloaded)) return ['error' => 'Failed to download any CSS files.'];
        return ['success' => true, 'name' => $repoName, 'files' => $downloaded];
    }

    function deleteTheme(string $entry) : void {
        global $configDir;
        $stylesDir = "$configDir/styles";
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $entry)) { http_response_code(400); exit; }
        $path = "$stylesDir/$entry";
        if (!file_exists($path)) { http_response_code(404); exit; }
        if (preg_match('/^_fv3-generated\./', $entry)) { http_response_code(403); exit; }
        if (is_dir($path)) {
            $items = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($items as $item) {
                if ($item->isDir()) { @rmdir($item->getRealPath()); }
                else { @unlink($item->getRealPath()); }
            }
            @rmdir($path);
        } else {
            @unlink($path);
        }
    }

    function exportAll() : array {
        global $configDir;
        $bundle = [
            'fv3_export_version' => 1,
            'plugin_version' => trim(@file_get_contents("$configDir/version") ?: ''),
            'exported' => date('c'),
            'docker' => json_decode(@file_get_contents("$configDir/docker.json") ?: '{}', true) ?: [],
            'vm' => json_decode(@file_get_contents("$configDir/vm.json") ?: '{}', true) ?: [],
            'settings' => json_decode(@file_get_contents("$configDir/settings.json") ?: '{}', true) ?: [],
            'css_config' => json_decode(@file_get_contents("$configDir/css-config.json") ?: '{}', true) ?: [],
            'custom_styles' => []
        ];
        $stylesDir = "$configDir/styles";
        if (is_dir($stylesDir)) {
            $items = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($stylesDir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );
            foreach ($items as $item) {
                if ($item->isFile() && preg_match('/\.css$/i', $item->getFilename())) {
                    if (preg_match('/^_fv3-generated\./', $item->getFilename())) continue;
                    $relPath = substr($item->getRealPath(), strlen(realpath($stylesDir)) + 1);
                    $bundle['custom_styles'][$relPath] = file_get_contents($item->getRealPath());
                }
            }
        }
        return $bundle;
    }

    function importAll(string $json) : array {
        global $configDir;
        if (strlen($json) > 5242880) return ['error' => 'Bundle too large (5MB max)'];
        $bundle = json_decode($json, true);
        if (!$bundle || !isset($bundle['fv3_export_version'])) return ['error' => 'Invalid FV3 export file'];
        $restored = [];
        if (!is_dir($configDir)) @mkdir($configDir, 0770, true);
        foreach (['docker', 'vm', 'settings', 'css_config'] as $key) {
            if (!isset($bundle[$key]) || !is_array($bundle[$key])) continue;
            $filename = $key === 'css_config' ? 'css-config.json' : "$key.json";
            $path = "$configDir/$filename";
            file_put_contents($path, json_encode($bundle[$key], JSON_PRETTY_PRINT));
            @chmod($path, 0660);
            $restored[] = $filename;
        }
        if (isset($bundle['custom_styles']) && is_array($bundle['custom_styles'])) {
            $stylesDir = "$configDir/styles";
            if (!is_dir($stylesDir)) @mkdir($stylesDir, 0770, true);
            $baseReal = realpath($stylesDir);
            foreach ($bundle['custom_styles'] as $relPath => $content) {
                if (!is_string($content) || !is_string($relPath)) continue;
                if (!preg_match('/\.css$/i', $relPath)) continue;
                if (preg_match('/\.\./', $relPath)) continue;
                $fullPath = "$stylesDir/$relPath";
                $dir = dirname($fullPath);
                if (!is_dir($dir)) @mkdir($dir, 0770, true);
                $dirReal = realpath($dir);
                if ($dirReal === false || strpos($dirReal, $baseReal) !== 0) continue;
                file_put_contents($fullPath, $content);
                @chmod($fullPath, 0660);
                $restored[] = "styles/$relPath";
            }
        }
        if (isset($bundle['css_config']) && is_array($bundle['css_config'])) {
            generateCssFile($bundle['css_config']);
        }
        return ['success' => true, 'restored' => $restored];
    }

    function readCssConfig() : string {
        global $configDir;
        $path = "$configDir/css-config.json";
        if (!file_exists($path)) return '{}';
        $raw = file_get_contents($path);
        return ($raw !== false && json_decode($raw) !== null) ? $raw : '{}';
    }

    function readCssDefaults() : array {
        return [
            'folder-view3-graph-cpu' => '#2b8da3',
            'folder-view3-graph-mem' => '#b56a28',
            'fv3-accent-color' => 'var(--color-orange, #f0a30a)',
            'fv3-folder-preview-bg' => 'transparent',
            'fv3-preview-icon-size' => '32px',
            'fv3-folder-icon-size' => '48px',
            'fv3-folder-name-bg' => 'transparent',
            'fv3-row-bg' => 'transparent',
            'fv3-toggle-color' => '#ff8c2f',
            'fv3-toggle-hover-color' => '#ffad5c',
            'fv3-appname-max-width' => '120px',
            'fv3-scrollbar-color' => 'rgba(255, 140, 47, 0.5)',
            'fv3-separator-bg' => 'rgba(128, 128, 128, 0.15)',
            'fv3-tab-active-bg' => 'rgba(128, 128, 128, 0.15)',
            'fv3-tab-active-border' => 'rgba(128, 128, 128, 0.3)',
            'fv3-panel-border' => 'rgba(128, 128, 128, 0.2)',
            'fv3-panel-bg' => 'rgba(128, 128, 128, 0.08)',
            'fv3-surface-tint' => 'rgba(128, 128, 128, 0.08)',
            'fv3-hover-bg' => 'rgba(128, 128, 128, 0.15)',
            'fv3-border' => '1px solid rgba(128, 128, 128, 0.3)',
            'fv3-inset-fill' => 'none',
            'fv3-inset-border-color' => 'rgba(128, 128, 128, 0.3)',
            'fv3-inset-showcase-fill' => 'none',
            'fv3-inset-showcase-border' => 'rgba(128, 128, 128, 0.2)',
            'fv3-embossed-border' => 'rgba(128, 128, 128, 0.3)',
            'fv3-embossed-accent' => 'var(--color-orange, #f0a30a)',
            'fv3-embossed-inner-border' => 'rgba(128, 128, 128, 0.2)'
        ];
    }

    function updateCssConfig(string $json) : void {
        global $configDir;
        if (strlen($json) > 51200) { http_response_code(400); echo 'Config too large'; exit; }
        $config = json_decode($json, true);
        if ($config === null) { http_response_code(400); echo 'Invalid JSON'; exit; }
        $allowedKeys = ['preset', 'global', 'dashboard', 'docker', 'vm', 'custom_css'];
        foreach (array_keys($config) as $k) {
            if (!in_array($k, $allowedKeys, true)) { unset($config[$k]); }
        }
        if (isset($config['custom_css']) && is_string($config['custom_css'])) {
            $config['custom_css'] = preg_replace('/!\s*important/i', '', $config['custom_css']);
            $config['custom_css'] = preg_replace('/@import\b/i', '', $config['custom_css']);
            $config['custom_css'] = preg_replace('/expression\s*\(/i', '', $config['custom_css']);
            $config['custom_css'] = preg_replace('/javascript\s*:/i', '', $config['custom_css']);
            if (strlen($config['custom_css']) > 10240) $config['custom_css'] = substr($config['custom_css'], 0, 10240);
        }
        foreach (['global', 'dashboard', 'docker', 'vm'] as $section) {
            if (isset($config[$section]) && is_array($config[$section])) {
                foreach ($config[$section] as $varName => $val) {
                    if (!is_string($val) || strlen($val) > 200) { unset($config[$section][$varName]); }
                }
            }
        }
        $path = "$configDir/css-config.json";
        if (!is_dir($configDir)) { @mkdir($configDir, 0770, true); }
        $fp = fopen($path, 'c+');
        if (!$fp) { http_response_code(500); exit; }
        flock($fp, LOCK_EX);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($config, JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        @chmod($path, 0660);
        generateCssFile($config);
    }

    function generateCssFile(array $config) : void {
        global $configDir;
        $defaults = readCssDefaults();
        $css = ":root {\n";
        $sections = ['global', 'dashboard', 'docker', 'vm'];
        $hasVars = false;
        foreach ($sections as $section) {
            if (!isset($config[$section]) || !is_array($config[$section])) continue;
            foreach ($config[$section] as $varName => $value) {
                if (!isset($defaults[$varName])) continue;
                if ($value === $defaults[$varName]) continue;
                $safeVar = preg_replace('/[^a-zA-Z0-9-]/', '', $varName);
                $safeVal = str_replace([';', '{', '}', '<', '>'], '', $value);
                $safeVal = preg_replace('/url\s*\(/i', '', $safeVal);
                $safeVal = preg_replace('/expression\s*\(/i', '', $safeVal);
                $safeVal = preg_replace('/@import\b/i', '', $safeVal);
                $css .= "    --{$safeVar}: {$safeVal};\n";
                $hasVars = true;
            }
        }
        $css .= "}\n";
        if (isset($config['custom_css']) && is_string($config['custom_css']) && trim($config['custom_css']) !== '') {
            $css .= "\n" . $config['custom_css'] . "\n";
            $hasVars = true;
        }
        $stylesDir = "$configDir/styles";
        if (!is_dir($stylesDir)) { @mkdir($stylesDir, 0770, true); }
        $outPath = "$stylesDir/_fv3-generated.docker-vm-dashboard.css";
        if ($hasVars) {
            file_put_contents($outPath, $css);
            @chmod($outPath, 0660);
        } else {
            @unlink($outPath);
        }
    }

    function generateId(int $length = 20) : string {
        return substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes((int)ceil($length * 3 / 4)))), 0, $length);
    }

    function createFile(string $type): void {
        global $configDir;
        if (!is_dir($configDir)) { @mkdir($configDir, 0770, true); }
        $default = ['docker' => '{}', 'vm' => '{}'];
        $path = "$configDir/$type.json";
        @file_put_contents($path, $default[$type] ?? '{}');
        @chmod($path, 0660);
    }

    function readInfo(string $type): array {
        fv3_debug_log("readInfo called for type: $type");
        $info = [];
        if ($type == "docker") {
            global $dockerManPaths, $documentRoot;
            global $driver, $host; 
            if (!isset($driver) || !is_array($driver)) { $driver = DockerUtil::driver(); fv3_debug_log("Initialized \$driver: " . json_encode($driver)); }
            if (!isset($host)) { $host = DockerUtil::host(); fv3_debug_log("Initialized \$host: " . $host); }

            $dockerClient = new DockerClient();
            $DockerUpdate = new DockerUpdate();
            $dockerTemplates = new DockerTemplates();

            $cts = $dockerClient->getDockerJSON("/containers/json?all=1");
            $autoStartFile = $dockerManPaths['autostart-file'] ?? "/var/lib/docker/unraid-autostart";
            $autoStartLines = @file($autoStartFile, FILE_IGNORE_NEW_LINES) ?: [];
            $autoStart = array_map('var_split', $autoStartLines);

            // Remove stale entries from autostart file (containers that no longer exist)
            $allCtNames = array_map(function($c) { return ltrim($c['Names'][0] ?? '', '/'); }, $cts);
            $cleanedLines = array_filter($autoStartLines, function($line) use ($allCtNames) {
                $parts = explode(' ', $line, 2);
                return in_array($parts[0], $allCtNames);
            });
            if (count($cleanedLines) < count($autoStartLines)) {
                file_put_contents($autoStartFile, implode("\n", $cleanedLines) . "\n");
                fv3_debug_log("readInfo: removed " . (count($autoStartLines) - count($cleanedLines)) . " stale autostart entries");
                $autoStart = array_map('var_split', $cleanedLines);
            }

            $allXmlTemplates = [];
            foreach ($dockerTemplates->getTemplates('all') as $templateFile) {
                $doc = new DOMDocument();
                if (@$doc->load($templateFile['path'])) { 
                    $templateName = trim($doc->getElementsByTagName('Name')->item(0)->nodeValue ?? '');
                    $templateImage = DockerUtil::ensureImageTag($doc->getElementsByTagName('Repository')->item(0)->nodeValue ?? '');
                    if ($templateName && $templateImage) {
                        $allXmlTemplates[$templateName . '|' . $templateImage] = [
                            'WebUi'             => trim($doc->getElementsByTagName('WebUI')->item(0)->nodeValue ?? ''),
                            'TSUrlRaw'          => trim($doc->getElementsByTagName('TailscaleWebUI')->item(0)->nodeValue ?? ''),
                            'TSServeMode'       => trim($doc->getElementsByTagName('TailscaleServe')->item(0)->nodeValue ?? 'no'),
                            'TSTailscaleEnabled'=> strtolower(trim($doc->getElementsByTagName('TailscaleEnabled')->item(0)->nodeValue ?? 'false')) === 'true',
                            'registry'          => trim($doc->getElementsByTagName('Registry')->item(0)->nodeValue ?? ''),
                            'Support'           => trim($doc->getElementsByTagName('Support')->item(0)->nodeValue ?? ''),
                            'Project'           => trim($doc->getElementsByTagName('Project')->item(0)->nodeValue ?? ''),
                            'DonateLink'        => trim($doc->getElementsByTagName('DonateLink')->item(0)->nodeValue ?? ''),
                            'ReadMe'            => trim($doc->getElementsByTagName('ReadMe')->item(0)->nodeValue ?? ''),
                            'Shell'             => trim($doc->getElementsByTagName('Shell')->item(0)->nodeValue ?? 'sh'),
                            'path'              => $templateFile['path']
                        ];
                    }
                }
            }
            unset($doc);

            foreach ($cts as $key => &$ct) {
                $ct['info'] = $dockerClient->getContainerDetails($ct['Id']);
                if (empty($ct['info'])) { fv3_debug_log("Skipped container due to empty details: ID " . ($ct['Id'] ?? 'N/A')); continue; }

                $containerName = substr($ct['info']['Name'], 1);
                $ct['info']['Name'] = $containerName;
                fv3_debug_log("Processing Container: $containerName (ID: " . ($ct['Id'] ?? 'N/A') . ")");

                $ct['info']['State']['Autostart'] = in_array($containerName, $autoStart);
                $ct['info']['Config']['Image'] = DockerUtil::ensureImageTag($ct['info']['Config']['Image']);
                $ct['info']['State']['Updated'] = $DockerUpdate->getUpdateStatus($ct['info']['Config']['Image']);
                $ct['info']['State']['manager'] = $ct['Labels']['net.unraid.docker.managed'] ?? false;
                $ct['shortId'] = substr(str_replace('sha256:', '', $ct['Id']), 0, 12);
                $ct['shortImageId'] = substr(str_replace('sha256:', '', $ct['ImageID']), 0, 12);
                $ct['info']['State']['WebUi'] = ''; $ct['info']['State']['TSWebUi'] = '';
                $ct['info']['Shell'] = 'sh'; $ct['info']['template'] = null;
                $rawWebUiString = ''; $rawTsXmlUrl = ''; $tsServeModeFromXml = 'no';
                $isTailscaleEnabledForContainer = false;

                $templateKey = $containerName . '|' . $ct['info']['Config']['Image'];
                $templateData = $allXmlTemplates[$templateKey] ?? null;

                if ($ct['info']['State']['manager'] == 'dockerman' && !is_null($templateData)) {
                    $rawWebUiString = $templateData['WebUi']; $rawTsXmlUrl = $templateData['TSUrlRaw'];
                    $tsServeModeFromXml = $templateData['TSServeMode'];
                    $isTailscaleEnabledForContainer = $templateData['TSTailscaleEnabled'];
                    $ct['info']['registry'] = $templateData['registry']; $ct['info']['Support'] = $templateData['Support']; $ct['info']['Project'] = $templateData['Project']; $ct['info']['DonateLink'] = $templateData['DonateLink']; $ct['info']['ReadMe'] = $templateData['ReadMe']; $ct['info']['Shell'] = $templateData['Shell'] ?: 'sh'; $ct['info']['template'] = ['path' => $templateData['path']];
                } else {
                    $rawWebUiString = $ct['Labels']['net.unraid.docker.webui'] ?? '';
                    $rawTsXmlUrl = $ct['Labels']['net.unraid.docker.tailscale.webui'] ?? '';
                    $tsServeModeFromXml = $ct['Labels']['net.unraid.docker.tailscale.servemode'] ?? ($ct['Labels']['net.unraid.docker.tailscale.funnel'] === 'true' ? 'funnel' : 'no');
                    $isTailscaleEnabledForContainer = strtolower($ct['Labels']['net.unraid.docker.tailscale.enabled'] ?? 'false') === 'true';
                    $ct['info']['Shell'] = $ct['Labels']['net.unraid.docker.shell'] ?? 'sh';
                }
                fv3_debug_log("  $containerName: Using ".($templateData && $ct['info']['State']['manager'] == 'dockerman' ? "XML" : "Label")." data. TailscaleEnabled: " . ($isTailscaleEnabledForContainer ? 'true' : 'false'));
                fv3_debug_log("    $containerName: Raw WebUI: '$rawWebUiString', Raw TS XML URL: '$rawTsXmlUrl', TS Serve Mode: '$tsServeModeFromXml'");
                
                // --- Populate $ct['info']['Ports'] ---
                $ct['info']['Ports'] = [];
                $currentNetworkMode = $ct['HostConfig']['NetworkMode'] ?? 'unknown';
                $currentNetworkDriver = $driver[$currentNetworkMode] ?? null;
                
                $containerIpAddress = null; 
                if ($currentNetworkMode !== 'host' && $currentNetworkDriver !== 'bridge') {
                    $containerNetworkSettings = $ct['NetworkSettings']['Networks'][$currentNetworkMode] ?? null;
                    if ($containerNetworkSettings && !empty($containerNetworkSettings['IPAddress'])) { $containerIpAddress = $containerNetworkSettings['IPAddress']; }
                } elseif ($currentNetworkMode === 'host') {
                    $containerIpAddress = $host; 
                }
                fv3_debug_log("  $containerName: NetworkMode: $currentNetworkMode, Driver: " . ($currentNetworkDriver ?: 'N/A') . ", ContainerIP (for custom/host): " . ($containerIpAddress ?: 'N/A'));
                fv3_debug_log("  $containerName: HostConfig.PortBindings: " . json_encode($ct['info']['HostConfig']['PortBindings'] ?? []));
                fv3_debug_log("  $containerName: Config.ExposedPorts: " . json_encode($ct['info']['Config']['ExposedPorts'] ?? []));

                if (isset($ct['info']['HostConfig']['PortBindings']) && is_array($ct['info']['HostConfig']['PortBindings']) && !empty($ct['info']['HostConfig']['PortBindings'])) {
                    fv3_debug_log("  $containerName: Processing HostConfig.PortBindings...");
                    foreach ($ct['info']['HostConfig']['PortBindings'] as $containerPortProtocol => $hostBindings) {
                        if (is_array($hostBindings) && !empty($hostBindings)) {
                            list($privatePort, $protocol) = explode('/', $containerPortProtocol);
                            $protocol = strtoupper($protocol ?: 'TCP');
                            $hostBinding = $hostBindings[0];
                            $publicIp = ($hostBinding['HostIp'] === '0.0.0.0' || empty($hostBinding['HostIp'])) ? $host : $hostBinding['HostIp'];
                            $publicPort = $hostBinding['HostPort'] ?? null; 

                            fv3_debug_log("    $containerName Binding: Private=$privatePort/$protocol, Public=$publicIp:" . ($publicPort ?: 'N/A'));
                            $ct['info']['Ports'][] = [
                                'PrivateIP'   => null, // For bridge mappings, the "private IP" is internal to Docker, not usually the container's specific IP on another net
                                'PrivatePort' => $privatePort,
                                'PublicIP'    => $publicIp,
                                'PublicPort'  => $publicPort, 
                                'NAT'         => true, 
                                'Type'        => $protocol
                            ];
                        }
                    }
                } elseif (isset($ct['info']['Config']['ExposedPorts']) && is_array($ct['info']['Config']['ExposedPorts'])) {
                    fv3_debug_log("  $containerName: Processing Config.ExposedPorts (Network: $currentNetworkMode)...");
                    foreach ($ct['info']['Config']['ExposedPorts'] as $containerPortProtocol => $emptyValue) {
                        list($privatePort, $protocol) = explode('/', $containerPortProtocol);
                        $protocol = strtoupper($protocol ?: 'TCP');
                        
                        $effectiveIp = null;
                        $effectivePort = $privatePort; 

                        if ($currentNetworkMode === 'host') {
                            $effectiveIp = $host;
                        } elseif ($currentNetworkMode !== 'none' && $containerIpAddress) {
                            $effectiveIp = $containerIpAddress;
                        }
                        
                        fv3_debug_log("    $containerName Exposed: Private=$privatePort/$protocol, EffectiveIP=" . ($effectiveIp ?: 'null') . ", EffectivePort=$effectivePort");
                        $ct['info']['Ports'][] = [
                            'PrivateIP'   => $containerIpAddress, 
                            'PrivatePort' => $privatePort,
                            'PublicIP'    => $effectiveIp, 
                            'PublicPort'  => $effectivePort, 
                            'NAT'         => false,
                            'Type'        => $protocol
                        ];
                     }
                }
                
                if ($currentNetworkMode === 'none') {
                    fv3_debug_log("  $containerName: NetworkMode is 'none'. Adjusting public port aspects.");
                    $tempPorts = [];
                    if(isset($ct['info']['Config']['ExposedPorts']) && is_array($ct['info']['Config']['ExposedPorts'])){
                        foreach($ct['info']['Config']['ExposedPorts'] as $containerPortProtocol => $emptyValue) {
                            list($privatePort, $protocol) = explode('/', $containerPortProtocol);
                            $protocol = strtoupper($protocol ?: 'TCP');
                            $tempPorts[] = [
                                'PrivateIP'   => null, // No specific container IP accessible
                                'PrivatePort' => $privatePort,
                                'PublicIP'    => null,
                                'PublicPort'  => null, 
                                'NAT'         => false, 
                                'Type'        => $protocol
                            ];
                        }
                    }
                    $ct['info']['Ports'] = $tempPorts;
                }
                ksort($ct['info']['Ports']);
                fv3_debug_log("  $containerName: Final ct[info][Ports]: " . json_encode($ct['info']['Ports']));

                $finalWebUi = '';
                if (!empty($rawWebUiString)) {
                    if (strpos($rawWebUiString, '[IP]') === false && strpos($rawWebUiString, '[PORT:') === false) { $finalWebUi = $rawWebUiString; } 
                    else {
                        $webUiIp = $host; 
                        if ($currentNetworkMode === 'host') { $webUiIp = $host; } 
                        elseif ($currentNetworkDriver !== 'bridge' && $containerIpAddress) { $webUiIp = $containerIpAddress; }
                        if (strpos($currentNetworkMode, 'container:') === 0 || $currentNetworkMode === 'none') { $finalWebUi = ''; } 
                        else {
                            $tempWebUi = str_replace("[IP]", $webUiIp ?: '', $rawWebUiString);
                            if (preg_match("%\[PORT:(\d+)\]%", $tempWebUi, $matches)) {
                                $internalPortFromTemplate = $matches[1]; $mappedPublicPort = $internalPortFromTemplate; 
                                foreach ($ct['info']['Ports'] as $p) {
                                    if (isset($p['PrivatePort']) && $p['PrivatePort'] == $internalPortFromTemplate) {
                                        $isNatEquivalent = (($p['NAT'] ?? false) === true);
                                        $mappedPublicPort = ($isNatEquivalent && !empty($p['PublicPort'])) ? $p['PublicPort'] : $p['PrivatePort'];
                                        break;
                                    }
                                }
                                $tempWebUi = preg_replace("%\[PORT:\d+\]%", $mappedPublicPort, $tempWebUi);
                            }
                            $finalWebUi = $tempWebUi;
                        }
                    }
                }
                $ct['info']['State']['WebUi'] = $finalWebUi;
                fv3_debug_log("  $containerName: Resolved Standard WebUi: '$finalWebUi'");
                
                $finalTsWebUi = '';
                if ($isTailscaleEnabledForContainer) { 
                    fv3_debug_log("  $containerName: Tailscale is ENABLED. Attempting to resolve TS WebUI.");
                    $baseTsTemplateFromHelper = '';
                    if (!empty($rawTsXmlUrl) && function_exists('generateTSwebui')) {
                        $baseTsTemplateFromHelper = generateTSwebui($rawTsXmlUrl, $tsServeModeFromXml, $rawWebUiString);
                    } elseif (!empty($rawTsXmlUrl) && !function_exists('generateTSwebui')) {
                        fv3_require_libvirt_helpers();
                        if (function_exists('generateTSwebui')) {
                            $baseTsTemplateFromHelper = generateTSwebui($rawTsXmlUrl, $tsServeModeFromXml, $rawWebUiString);
                        }
                    } elseif (!empty($ct['Labels']['net.unraid.docker.tailscale.webui'])) {
                        $baseTsTemplateFromHelper = $ct['Labels']['net.unraid.docker.tailscale.webui'];
                    }
                    fv3_debug_log("    $containerName: Base TS WebUI from generateTSwebui/label: '$baseTsTemplateFromHelper'");

                    if (!empty($baseTsTemplateFromHelper)) {
                        if (strpos($baseTsTemplateFromHelper, '[hostname]') !== false || strpos($baseTsTemplateFromHelper, '[HOSTNAME]') !== false) {
                            $tsFqdn = fv3_get_tailscale_fqdn_from_container($containerName); 
                            if ($tsFqdn) {
                                $finalTsWebUi = str_replace(["[hostname][magicdns]", "[HOSTNAME][MAGICDNS]"], $tsFqdn, $baseTsTemplateFromHelper);
                                if (strpos($baseTsTemplateFromHelper, 'http://[hostname]') === 0) {
                                    $finalTsWebUi = str_replace('http://', 'https://', $finalTsWebUi);
                                }
                            } else { fv3_debug_log("    $containerName: TS WebUI: Could not resolve [hostname] via exec."); $finalTsWebUi = ''; }
                        } elseif (strpos($baseTsTemplateFromHelper, '[noserve]') !== false || strpos($baseTsTemplateFromHelper, '[NOSERVE]') !== false) {
                            $tsIP = fv3_get_tailscale_ip_from_container($containerName); 
                            if ($tsIP) {
                                $finalTsWebUi = str_replace(["[noserve]", "[NOSERVE]"], $tsIP, $baseTsTemplateFromHelper);
                                $internalPortForTS = null;
                                if (preg_match('/\[PORT:(\d+)\]/i', $baseTsTemplateFromHelper, $portMatches)) { 
                                    $internalPortForTS = $portMatches[1];
                                } elseif (preg_match('/\[PORT:(\d+)\]/i', $rawWebUiString, $portMatches)) { 
                                    $internalPortForTS = $portMatches[1];
                                } elseif (preg_match('/:(\d+)/', $finalTsWebUi, $portMatchesNoserve)) { 
                                    $internalPortForTS = $portMatchesNoserve[1];
                                }
                                
                                if ($internalPortForTS !== null) {
                                   $finalTsWebUi = preg_replace('/\[PORT:\d+\]/i', $internalPortForTS, $finalTsWebUi);
                                   if (strpos($baseTsTemplateFromHelper, '[noserve]:[PORT:') === false && preg_match('/:(\d+)/', $baseTsTemplateFromHelper, $portMatchesRawBase)) {
                                       if ($portMatchesRawBase[1] != $internalPortForTS) { 
                                          $finalTsWebUi = str_replace(":$portMatchesRawBase[1]", ":$internalPortForTS", $finalTsWebUi);
                                       }
                                   }
                                }
                            } else { fv3_debug_log("    $containerName: TS WebUI: Could not resolve [noserve] via exec."); $finalTsWebUi = ''; }
                        } else {
                            $finalTsWebUi = $baseTsTemplateFromHelper; 
                        }
                    }
                } else {
                    fv3_debug_log("  $containerName: Tailscale is NOT enabled or no TS URL defined in template/label.");
                }
                $ct['info']['State']['TSWebUi'] = $finalTsWebUi;
                fv3_debug_log("  $containerName: Resolved TS WebUi: '$finalTsWebUi'");
                
                $info[$containerName] = $ct;
            }
            unset($ct); 

        } elseif ($type == "vm") {
            if (!fv3_require_libvirt_helpers()) { fv3_debug_log("VM: libvirt_helpers.php not available."); return []; }
            global $lv;
            if (!isset($lv)) {
                $lv = new Libvirt();
                if (!$lv->connect()) { fv3_debug_log("VM: Libvirt connection failed."); return []; }
            }
            $vms = $lv->get_domains();
            fv3_debug_log("VM: Found " . count($vms) . " VMs.");
            if (!empty($vms)) {
                foreach ($vms as $vm) {
                    $res = $lv->get_domain_by_name($vm);
                    if (!$res) { fv3_debug_log("VM: Could not get domain by name for $vm."); continue; }
                    $dom = $lv->domain_get_info($res);
                    $info[$vm] = [
                        'uuid' => $lv->domain_get_uuid($res), 'name' => $vm,
                        'description' => $lv->domain_get_description($res),
                        'autostart' => $lv->domain_get_autostart($res),
                        'state' => $lv->domain_state_translate($dom['state']),
                        'icon' => $lv->domain_get_icon_url($res),
                        'logs' => (is_file("/var/log/libvirt/qemu/$vm.log") ? "libvirt/qemu/$vm.log" : '')
                    ];
                }
            }
        }
        fv3_debug_log("readInfo for type: $type completed.");
        return $info;
    }

    function readUnraidOrder(string $type): array {
        fv3_debug_log("readUnraidOrder called for type: $type");
        $user_prefs_path = "/boot/config/plugins";
        $order = [];
        if ($type == "docker") {
            $dockerClient = new DockerClient();
            $containersFromUnraid = $dockerClient->getDockerContainers(); 
            $prefs_file = "$user_prefs_path/dockerMan/userprefs.cfg";

            if (file_exists($prefs_file)) {
                $prefs_ini = @parse_ini_file($prefs_file);
                if ($prefs_ini) { 
                    $prefs_array = array_values($prefs_ini);
                    $sort = [];
                    $count_containers = count($containersFromUnraid);
                    foreach ($containersFromUnraid as $ct_item)  { 
                        $search = array_search($ct_item['Name'], $prefs_array);
                        $sort[] = ($search === false) ? ($count_containers + count($sort) + 1) : $search; 
                    }
                    if (!empty($sort)) { 
                         @array_multisort($sort,SORT_NUMERIC,$containersFromUnraid);
                    } else { 
                         @usort($containersFromUnraid, function($a, $b) { return strnatcasecmp($a['Name'], $b['Name']); });
                    }
                } else { 
                    @usort($containersFromUnraid, function($a, $b) { return strnatcasecmp($a['Name'], $b['Name']); });
                }
            } else { 
                 @usort($containersFromUnraid, function($a, $b) { return strnatcasecmp($a['Name'], $b['Name']); });
            }
            $order = array_column($containersFromUnraid, 'Name');

        } elseif ($type == "vm") {
            if (!fv3_require_libvirt_helpers()) { fv3_debug_log("VM Order: libvirt_helpers.php not available."); return []; }
            global $lv;
            if (!isset($lv)) { $lv = new Libvirt(); if (!$lv->connect()) { fv3_debug_log("VM Order: Libvirt connection failed."); return []; } }

            $prefs_file = "$user_prefs_path/dynamix.vm.manager/userprefs.cfg";
            $vms = $lv->get_domains();

            if (!empty($vms)) {
                if (file_exists($prefs_file)) {
                    $prefs_ini = @parse_ini_file($prefs_file);
                     if ($prefs_ini) {
                        $prefs_array = array_values($prefs_ini);
                        $sort = [];
                        $count_vms = count($vms);
                        foreach ($vms as $vm_name) {
                            $search = array_search($vm_name, $prefs_array);
                            $sort[] = ($search === false) ? ($count_vms + count($sort) + 1) : $search;
                        }
                        if (!empty($sort)) {
                            @array_multisort($sort, SORT_NUMERIC, $vms);
                        } else {
                             natcasesort($vms);
                        }
                    } else {
                       natcasesort($vms);
                    }
                } else {
                    natcasesort($vms);
                }
                $order = array_values($vms);
            }
        }
        fv3_debug_log("readUnraidOrder for type: $type completed. Order: " . json_encode($order));
        return $order;
    }
    function pathToMultiDimArray($dir) {
        $final = [];
        try {
            if (!is_dir($dir) || !is_readable($dir)) return $final;
            $elements = array_diff(scandir($dir), ['.', '..']);
            foreach ($elements as $el) {
                $newEl = "{$dir}/{$el}";
                if(is_dir($newEl)) {
                    array_push($final, ["name" => $el, "path" => $newEl, "sub" => pathToMultiDimArray($newEl)]);
                } else if(is_file($newEl)) {
                    array_push($final, ["name" => $el, "path" => $newEl]);
                }
            }
        } catch (Throwable $err) { fv3_debug_log("Error in pathToMultiDimArray for $dir: " . $err->getMessage()); }
        return $final;
    }
    function dirToArrayOfFiles($dir, $fileFilter = NULL, $folderFilter = NULL) {
        $final = [];
        if (!is_array($dir)) return $final; 
        foreach ($dir as $el) {
            if (!is_array($el) || !isset($el['name'])) continue; 
            if(isset($el['sub']) && (!isset($folderFilter) || (isset($folderFilter) && !preg_match($folderFilter, $el['name'])))) {
                $final = array_merge($final, dirToArrayOfFiles($el['sub'], $fileFilter, $folderFilter));
            } else if(!isset($el['sub']) && (!isset($fileFilter) || (isset($fileFilter) && preg_match($fileFilter, $el['name'])))) {
                array_push($final, $el);
            }
        }
        return $final;
    }
?>