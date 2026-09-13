<?php
    define('FV3_DEBUG_MODE', file_exists('/tmp/fv3_debug_enabled'));
    $fv3_debug_log_file = "/tmp/folder_view3_php_debug.log";

    function fv3_atomic_write(string $path, $data, int $perms = 0660): bool {
        // Reject a non-string payload (e.g. json_encode()/file_get_contents() returned false) so a failed encode/read never blanks a good file.
        if (!is_string($data)) return false;
        $tmp = $path . '.tmp.' . getmypid() . '.' . uniqid('', true);
        // Treat a short/partial write as failure too — file_put_contents returns a byte count (not false) on a truncated write, e.g. flash ENOSPC.
        if (@file_put_contents($tmp, $data) !== strlen($data)) { @unlink($tmp); return false; }
        @chmod($tmp, $perms);
        if (@rename($tmp, $path)) return true;
        @unlink($tmp);
        return false;
    }

    // WebUI values come from container labels and are rendered into <a href> — allow only http(s)/relative, block javascript:/data: etc.
    function fv3_safe_http_url(string $url): string {
        $url = trim($url);
        if ($url === '') return '';
        if (preg_match('#^https?://#i', $url) || $url[0] === '/') return $url;
        return '';
    }

    function fv3_read_json(string $path): array {
        if (!file_exists($path)) return [];
        $raw = @file_get_contents($path);
        if ($raw === false) return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    // Like fv3_read_json but keeps the tri-state: [] = file absent (a legitimate fresh
    // state), null = file EXISTS but is unreadable or malformed. Use before any write
    // that would persist "empty" — corrupt-as-empty must fail closed, never fall through.
    function fv3_read_json_strict(string $path): ?array {
        if (!file_exists($path)) return [];
        $raw = @file_get_contents($path);
        if ($raw === false) return null;
        if (trim($raw) === '') return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    // Shared guard for the flock'd settings read-modify-write: a corrupt (non-empty,
    // undecodable) settings.json aborts the request instead of resetting every other
    // setting on the next save.
    function fv3_decode_settings_or_abort($fp, $raw): array {
        // A failed stream read (false) is as unreadable as corrupt JSON — never treat
        // either as an empty file, or the next save resets every other setting.
        if (is_string($raw) && trim($raw) === '') return [];
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            flock($fp, LOCK_UN);
            fclose($fp);
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'settings.json is unreadable — refusing to save so other settings are not reset']);
            exit;
        }
        return $data;
    }

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

    function fv3_validate_type($type): string {
        // Untyped on purpose: a crafted type[]=x request reaches every endpoint as an
        // array, and a string-typed parameter would fatal (TypeError) instead of 400ing.
        if (!is_string($type) || !in_array($type, ['docker', 'vm'], true)) {
            http_response_code(400);
            exit;
        }
        return $type;
    }

    // A POST field as a string, else a 400: like type above, an x[]= array must not reach a typed param
    function fv3_post_string(string $key, string $default = ''): string {
        $value = $_POST[$key] ?? $default;
        if (!is_string($value)) {
            http_response_code(400);
            exit;
        }
        return $value;
    }

    function fv3_security_headers(): void {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Cache-Control: no-store');
    }

    function fv3_require_post(): void {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            header('Allow: POST');
            exit;
        }
    }

    function fv3_post_init(): void {
        fv3_security_headers();
        fv3_require_post();
        // CSRF is enforced globally by Unraid's local_prepend.php (php auto_prepend_file):
        // it validates csrf_token against $var['csrf_token'] on every POST and then unsets
        // both $_POST['csrf_token'] and $_SERVER['HTTP_X_CSRF_TOKEN'] before this script runs.
        // A second check here cannot see the token (already consumed) and would 403 every
        // legitimate request, so we rely on Unraid's enforcement.
    }

    function fv3_get_init(): void {
        fv3_security_headers();
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            http_response_code(405);
            header('Allow: GET');
            exit;
        }
    }

    $folderVersion = 1.0;
    $configDir = "/boot/config/plugins/folder.view3";
    $sourceDir = "/usr/local/emhttp/plugins/folder.view3";
    $documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? '/usr/local/emhttp';

    require_once("$documentRoot/webGui/include/Helpers.php");
    require_once("$documentRoot/plugins/dynamix.docker.manager/include/DockerClient.php");
    if (file_exists("$documentRoot/plugins/dynamix.vm.manager/include/libvirt_helpers.php")) {
        require_once("$documentRoot/plugins/dynamix.vm.manager/include/libvirt_helpers.php");
    }

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
        $raw = @file_get_contents("$configDir/$type.json");
        if ($raw === false) {
            // Fail the request: a 200 '{}' would be cached client-side over the last good copy
            http_response_code(500);
            return json_encode(['error' => "$type.json is unreadable"]);
        }
        // Unparseable stays byte-identical so the client's cached-copy fallback still fires
        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) { return $raw; }
        // Valid JSON that isn't a folder map fails like an unreadable file
        if (!is_array($decoded)) {
            http_response_code(500);
            return json_encode(['error' => "$type.json does not contain a folder map"]);
        }
        $clean = json_encode((object)fv3_normalize_folders($decoded));
        return $clean !== false ? $clean : $raw;
    }

    // Fills the fields every reader dereferences so a hand-edited folder can't break a render
    // or the autostart sync; object fields stay JSON objects. Never writes the file.
    function fv3_normalize_folders(array $folders): array {
        $out = [];
        foreach ($folders as $id => $f) {
            if (!is_array($f)) { continue; }
            $f['name'] = is_scalar($f['name'] ?? null) ? (string)$f['name'] : (string)$id;
            $f['icon'] = is_string($f['icon'] ?? null) ? $f['icon'] : '';
            $f['regex'] = is_string($f['regex'] ?? null) ? $f['regex'] : '';
            $f['containers'] = is_array($f['containers'] ?? null) ? array_values($f['containers']) : [];
            $f['hidden_preview'] = is_array($f['hidden_preview'] ?? null) ? array_values($f['hidden_preview']) : [];
            $f['actions'] = is_array($f['actions'] ?? null) ? array_values(array_filter($f['actions'], 'is_array')) : [];
            $f['settings'] = (object)(is_array($f['settings'] ?? null) ? $f['settings'] : []);
            foreach (['containerImages', 'containerIds'] as $k) {
                if (array_key_exists($k, $f)) { $f[$k] = (object)(is_array($f[$k]) ? $f[$k] : []); }
            }
            $out[$id] = $f;
        }
        return $out;
    }

    function readUserPrefs(string $type) : string {
        $userPrefsDir = "/boot/config/plugins";
        $prefsFilePath = '';
        if($type == 'docker') { $prefsFilePath = "$userPrefsDir/dockerMan/userprefs.cfg"; }
        elseif($type == 'vm') { $prefsFilePath = "$userPrefsDir/dynamix.vm.manager/userprefs.cfg"; }
        else { return '[]'; }
        if(!file_exists($prefsFilePath)) { return '[]'; }
        // Deliberate GET side-effect (self-heal on the page-load read, mirroring the
        // organizer mirror + rename-backfill pattern): content derives only from
        // server-side state, is idempotent, and inserts rather than removes — a
        // cross-site-triggered GET can only cause the same heal the next page load would.
        fv3_heal_user_prefs($type, $prefsFilePath);
        $parsedIni = @parse_ini_file($prefsFilePath);
        return json_encode(array_values($parsedIni ?: []));
    }

    function fv3_order_snapshot_file(string $type): string {
        global $configDir;
        return "$configDir/order-$type.json";
    }

    // Returns the cleaned list, or null when any non-empty entry breaks the snapshot
    // rules. Empty entries are delimiter artifacts (every stock names string ends ';')
    // and are dropped, not treated as invalid. The rules exist because a violating
    // entry could corrupt an ini line when healed back into userprefs.cfg.
    function fv3_sanitize_order_entries(array $entries): ?array {
        $clean = [];
        foreach ($entries as $e) {
            if (!is_string($e)) return null;
            $e = trim($e);
            if ($e === '') continue;
            if (strlen($e) > 256 || strpos($e, '"') !== false || preg_match('/[\x00-\x1f\x7f]/', $e)) return null;
            $clean[] = $e;
        }
        if (count($clean) > 4096) return null;
        return $clean;
    }

    function saveOrderSnapshot(string $type, array $entries): bool {
        $clean = fv3_sanitize_order_entries($entries);
        if ($clean === null || empty($clean)) return false;
        return fv3_atomic_write(fv3_order_snapshot_file($type), json_encode(['fv3_order_version' => 1, 'entries' => $clean], JSON_PRETTY_PRINT));
    }

    // Snapshot state for export, keeping the tri-state importAll() relies on:
    // absent file -> [] (present-empty: source authoritatively has no snapshot, import
    // clears the destination); unreadable/malformed -> null (omit the bundle key, import
    // leaves the destination untouched); valid -> the wrapped snapshot.
    // A snapshot wrapper saveOrderSnapshot could actually have written: version 1 and a
    // non-empty entries list that passes sanitization unchanged. Returns the entries or
    // null. Shared by export (file contents) and import (bundle contents) so both sides
    // apply identical validation — anything else is corrupt/tampered and must be ignored,
    // never treated as empty (that would clear a valid destination snapshot on import).
    function fv3_validate_order_snapshot(array $data): ?array {
        if (($data['fv3_order_version'] ?? null) !== 1
            || !isset($data['entries']) || !is_array($data['entries'])) return null;
        $clean = fv3_sanitize_order_entries($data['entries']);
        if ($clean === null || empty($clean) || $clean !== array_values($data['entries'])) return null;
        return $clean;
    }

    function fv3_export_order_snapshot(string $type): ?array {
        $path = fv3_order_snapshot_file($type);
        if (!file_exists($path)) return [];
        $raw = @file_get_contents($path);
        $data = ($raw !== false) ? json_decode($raw, true) : null;
        if (!is_array($data) || fv3_validate_order_snapshot($data) === null) return null;
        return $data;
    }

    // Re-insert folder rows into the stock sort prefs from FV3's own order snapshot.
    // Fires when prefs has entries but at least one live folder is unpositioned —
    // the post-reinstall state, or a folder whose entry went missing. Insert-only —
    // existing prefs entries are never reordered or removed, so container order is
    // preserved, and already-positioned folders are kept in place and used as anchors.
    function fv3_heal_user_prefs(string $type, string $prefsFilePath): void {
        global $configDir;
        $raw = @file_get_contents($prefsFilePath);
        if (!is_string($raw) || $raw === '') return;
        $parsed = @parse_ini_string($raw);
        if (!is_array($parsed) || empty($parsed)) return;
        uksort($parsed, function($a, $b) { return (int)$a <=> (int)$b; });
        $current = array_values($parsed);

        $config = fv3_read_json("$configDir/$type.json");
        if (empty($config)) return;
        // Prefs and the snapshot store folder rows as 'folder-<id>' placeholders
        // (the hidden appname the stock reorder serializes); config keys are raw ids.
        $placeholders = [];
        foreach (array_keys($config) as $fid) { $placeholders['folder-' . $fid] = true; }
        if (empty(array_diff(array_keys($placeholders), $current))) return;

        $snap = fv3_read_json(fv3_order_snapshot_file($type));
        $saved = $snap['entries'] ?? null;
        if (!is_array($saved)) return;

        $currentSet = array_flip($current);
        // Each unpositioned live folder placeholder maps to the first later snapshot entry still present in prefs (null = append)
        $insertBefore = [];
        $pending = [];
        foreach ($saved as $entry) {
            if (!is_string($entry)) continue;
            if (isset($placeholders[$entry]) && !isset($currentSet[$entry])) { $pending[] = $entry; continue; }
            if (isset($currentSet[$entry])) {
                foreach ($pending as $fid) { $insertBefore[$fid] = $entry; }
                $pending = [];
            }
        }
        foreach ($pending as $fid) { $insertBefore[$fid] = null; }
        if (empty($insertBefore)) return;

        $out = [];
        foreach ($current as $name) {
            foreach ($insertBefore as $fid => $succ) {
                if ($succ === $name) { $out[] = $fid; unset($insertBefore[$fid]); }
            }
            $out[] = $name;
        }
        foreach (array_keys($insertBefore) as $fid) { $out[] = $fid; }

        $lines = [];
        foreach (array_values($out) as $i => $name) { $lines[] = $i . '="' . $name . '"'; }
        // Stock UserPrefs writes are lockless, so re-check the source right before
        // replacing — a concurrent reorder mid-compute aborts the heal (next load retries).
        if (@file_get_contents($prefsFilePath) !== $raw) return;
        if (fv3_atomic_write($prefsFilePath, implode("\n", $lines) . "\n")) {
            fv3_debug_log("fv3_heal_user_prefs($type): re-inserted " . (count($out) - count($current)) . " folder position(s)");
        }
    }

    function fv3_autostart_file(): string {
        $dockerManPaths = @parse_ini_file('/boot/config/plugins/dockerMan/dockerMan.cfg') ?: [];
        return $dockerManPaths['autostart-file'] ?? "/var/lib/docker/unraid-autostart";
    }

    function readAutostartConfig(): array {
        global $configDir;
        $cfg = fv3_read_json_strict("$configDir/autostart.json");
        // Corrupt config fails closed to 'off' (pure stock behaviour, no autostart writes)
        // rather than silently flipping a custom/off user to folder mode.
        if ($cfg === null) return ['mode' => 'off', 'sequence' => []];
        $mode = $cfg['mode'] ?? 'folder';
        if (!in_array($mode, ['folder', 'custom', 'off'], true)) $mode = 'folder';
        $sequence = [];
        foreach ((array)($cfg['sequence'] ?? []) as $name) {
            // docker name charset — a crafted config entry must not smuggle markup or newlines into the autostart file
            if (is_string($name) && preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/', $name)) $sequence[] = $name;
        }
        return ['mode' => $mode, 'sequence' => array_values(array_unique($sequence))];
    }

    // Names of organizer folders FV3 created/manages — user-made native folders are never listed here
    function readOrganizerRegistry(): array {
        global $configDir;
        $reg = fv3_read_json("$configDir/organizer-registry.json");
        $names = [];
        foreach ((array)($reg['folders'] ?? []) as $n) {
            if (is_string($n) && $n !== '' && strlen($n) <= 100) $names[] = $n;
        }
        return ['folders' => array_values(array_unique($names))];
    }

    function updateOrganizerRegistry(array $names): bool {
        global $configDir;
        $clean = [];
        foreach ($names as $n) {
            if (!is_string($n)) continue;
            $n = trim(preg_replace('/[\x00-\x1f\x7f]/', '', $n));
            if ($n === '' || strlen($n) > 100) continue;
            $clean[] = $n;
            if (count($clean) >= 200) break;
        }
        $clean = array_values(array_unique($clean));
        return fv3_atomic_write("$configDir/organizer-registry.json", json_encode(['folders' => $clean], JSON_PRETTY_PRINT));
    }

    function updateAutostartConfig(string $mode, array $sequence, array $waits): array {
        global $configDir;
        if (!in_array($mode, ['folder', 'custom', 'off'], true)) return ['error' => 'Invalid mode'];
        $cleanSeq = [];
        foreach ($sequence as $name) {
            if (is_string($name) && preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/', $name)) $cleanSeq[] = $name;
            if (count($cleanSeq) >= 500) break;
        }
        $cleanSeq = array_values(array_unique($cleanSeq));
        $ok = fv3_atomic_write("$configDir/autostart.json", json_encode(['mode' => $mode, 'sequence' => $cleanSeq], JSON_PRETTY_PRINT));
        if (!$ok) return ['error' => 'Failed to write autostart config'];

        // Fold wait edits into the live file — a name only matches a line that already has autostart enabled
        $autoStartFile = fv3_autostart_file();
        if (!empty($waits) && file_exists($autoStartFile)) {
            $lines = @file($autoStartFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            $changed = false;
            foreach ($lines as $i => $line) {
                $name = explode(' ', $line, 2)[0];
                if (array_key_exists($name, $waits)) {
                    $wait = max(0, min(3600, (int)$waits[$name]));
                    $newLine = rtrim($name . ' ' . ($wait > 0 ? $wait : ''));
                    if ($newLine !== $line) { $lines[$i] = $newLine; $changed = true; }
                }
            }
            if ($changed) file_put_contents($autoStartFile, implode("\n", $lines) . "\n", LOCK_EX);
        }

        // Re-assert order under the saved mode — saving folder mode instantly restores folder-derived order
        if ($mode !== 'off') syncContainerOrder('docker');
        return ['success' => true, 'mode' => $mode, 'sequence' => $cleanSeq];
    }

    // Reorders the existing autostart lines to the saved custom sequence. Waits ride along
    // verbatim; enabled-but-unsequenced containers keep their current relative order at the end.
    function fv3_apply_custom_autostart(array $allContainerNames, bool $ctListComplete): void {
        $autoStartFile = fv3_autostart_file();
        if (!file_exists($autoStartFile)) return;
        $sequence = readAutostartConfig()['sequence'];
        $autoStartLines = fv3_prune_stale_autostart(
            @file($autoStartFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [],
            $allContainerNames, $ctListComplete);
        $autoStartMap = [];
        foreach ($autoStartLines as $line) {
            $autoStartMap[explode(' ', $line, 2)[0]] = $line;
        }
        $newAutoStart = [];
        foreach ($sequence as $name) {
            if (isset($autoStartMap[$name])) {
                $newAutoStart[] = $autoStartMap[$name];
                unset($autoStartMap[$name]);
            }
        }
        foreach ($autoStartMap as $line) { $newAutoStart[] = $line; }
        file_put_contents($autoStartFile, implode("\n", $newAutoStart) . "\n", LOCK_EX);
        fv3_debug_log("fv3_apply_custom_autostart: wrote " . count($newAutoStart) . " entries (" . count($sequence) . " sequenced)");
    }

    // Container names from getDockerContainers(). 'complete' is false when the read is empty
    // or any entry is unnamed — a degraded list must not drive autostart pruning (#214).
    function fv3_read_container_names(DockerClient $dockerClient): array {
        $cts = $dockerClient->getDockerContainers();
        if (!is_array($cts)) { $cts = []; }
        $names = [];
        $complete = !empty($cts);
        foreach ($cts as $c) {
            $n = is_array($c) ? ($c['Name'] ?? '') : '';
            // Drop non-strings too — one would reach preg_match() and fatal on PHP 8
            if (!is_string($n) || $n === '') { $complete = false; continue; }
            $names[] = $n;
        }
        return ['names' => $names, 'complete' => $complete];
    }

    // The one definition of "drop autostart entries whose container is gone". A degraded Docker
    // read must never prune (#214/#231) — a transient blip would otherwise curtail the file.
    function fv3_prune_stale_autostart(array $autoStartLines, array $allContainerNames, bool $ctListComplete): array {
        if (!$ctListComplete) return $autoStartLines;
        $kept = [];
        foreach ($autoStartLines as $line) {
            $name = explode(' ', $line, 2)[0];
            if (in_array($name, $allContainerNames, true)) { $kept[] = $line; continue; }
            fv3_debug_log("autostart: dropped stale entry '$name' (container no longer exists)");
        }
        return $kept;
    }

    // `folder.view3: <name>` label claims keyed by container name — getDockerContainers()
    // carries no Labels, so read the same raw endpoint readInfo() uses. Returns null on a
    // failed/partial/unnamed read so callers fail closed rather than treat label-assigned
    // containers as unassigned (#214 class).
    function fv3_read_container_labels(DockerClient $dockerClient, array $allContainerNames): ?array {
        $ctLabels = [];
        $rawCts = $dockerClient->getDockerJSON("/containers/json?all=1");
        if (!is_array($rawCts)) {
            fv3_debug_log("fv3_read_container_labels: read unavailable");
            return null;
        }
        $answered = [];
        foreach ($rawCts as $rc) {
            $rcRaw = is_array($rc) ? ($rc['Names'][0] ?? '') : '';
            // is_string first: a nested array here would fatal ltrim() on PHP 8
            if (!is_string($rcRaw) || ltrim($rcRaw, '/') === '') {
                fv3_debug_log("fv3_read_container_labels: unnamed container in read");
                return null;
            }
            $rcName = ltrim($rcRaw, '/');
            $answered[$rcName] = true;
            $rcLabel = $rc['Labels']['folder.view3'] ?? '';
            if (is_string($rcLabel) && $rcLabel !== '') { $ctLabels[$rcName] = $rcLabel; }
        }
        // Identity, not cardinality: a same-size response (concurrent rename between the two
        // Docker reads) would leave a container with no label answer and place it as unassigned.
        foreach ($allContainerNames as $n) {
            if (!isset($answered[$n])) {
                fv3_debug_log("fv3_read_container_labels: '$n' missing from label read");
                return null;
            }
        }
        return $ctLabels;
    }

    // Effective membership — explicit > label > regex (issues #46/#55). Single source of
    // truth shared by syncContainerOrder and read_membership.php (issue #61).
    function fv3_compute_folder_membership(array $folders, array $allContainerNames, array $ctLabels): array {
        // One malformed entry is dropped or filled in, not allowed to abort every folder's sync
        $folders = fv3_normalize_folders($folders);
        $folderNameSet = [];
        foreach ($folders as $folder) {
            if (isset($folder['name'])) { $folderNameSet[$folder['name']] = true; }
        }
        $folderContainers = [];
        $folderNames = [];
        $assignedContainers = [];
        $explicitMembers = [];
        foreach ($folders as $folder) {
            $explicitMembers = array_merge($explicitMembers, $folder['containers'] ?? []);
        }
        $explicitAssigned = $explicitMembers;
        foreach ($ctLabels as $ctName => $ctLabel) {
            if (isset($folderNameSet[$ctLabel])) { $explicitAssigned[] = $ctName; }
        }
        foreach ($folders as $folderId => $folder) {
            $members = $folder['containers'] ?? [];
            // is_string + trim, not empty(): empty("0") is true in PHP, so a regex of "0" was
            // silently dropped while docker.js applied it. The type check mirrors docker.js and
            // keeps a non-string regex from fataling trim() (TypeError on PHP 8).
            if (is_string($folder['regex'] ?? null) && trim($folder['regex']) !== '') {
                $regex = '/' . str_replace('/', '\/', $folder['regex']) . '/';
                foreach ($allContainerNames as $name) {
                    if (@preg_match($regex, $name) && !in_array($name, $members) && !in_array($name, $explicitAssigned)) {
                        $members[] = $name;
                    }
                }
            }
            // Explicit containers[] entries anywhere win over a label claim (issue #55)
            foreach ($ctLabels as $ctName => $ctLabel) {
                if ($ctLabel === ($folder['name'] ?? null) && !in_array($ctName, $members) && !in_array($ctName, $explicitMembers)) {
                    $members[] = $ctName;
                }
            }
            $members = array_values(array_filter($members, function($m) use ($allContainerNames, $assignedContainers) {
                return in_array($m, $allContainerNames) && !in_array($m, $assignedContainers);
            }));
            $folderContainers["folder-$folderId"] = $members;
            $folderNames["folder-$folderId"] = $folder['name'] ?? "folder-$folderId";
            $assignedContainers = array_merge($assignedContainers, $members);
        }
        return ['containers' => $folderContainers, 'names' => $folderNames, 'assigned' => $assignedContainers];
    }

    function syncContainerOrder(string $type): void {
        // Rewrites the autostart file to match what FV3 renders on screen — top-to-bottom,
        // folder members left-to-right in their editor-chosen order. Render order itself is
        // owned by Unraid (userprefs.cfg if user drag-reordered, alphabetical otherwise);
        // FV3 no longer auto-writes userprefs.cfg from this function.
        global $configDir;
        fv3_debug_log("syncContainerOrder called for type: $type");

        if ($type !== 'docker') { return; }

        $autostartMode = readAutostartConfig()['mode'];
        // 'off' = FV3 never writes the autostart file — pure stock Unraid behaviour
        if ($autostartMode === 'off') { fv3_debug_log("syncContainerOrder: autostart mode off, skipping"); return; }

        $prefsFile = "/boot/config/plugins/dockerMan/userprefs.cfg";
        $foldersFile = "$configDir/docker.json";
        $folders = fv3_read_json_strict($foldersFile);
        if ($folders === null) {
            // Corrupt folder config must not rewrite the autostart file as if no folders exist
            fv3_debug_log("syncContainerOrder: $foldersFile unreadable, aborting before write");
            return;
        }

        $dockerClient = new DockerClient();
        $ctNames = fv3_read_container_names($dockerClient);
        $allContainerNames = $ctNames['names'];
        // Prune below only on a complete, fully-named container list — a degraded Docker read must not wipe autostart entries (#214)
        $ctListComplete = $ctNames['complete'];

        // 'custom' = the Autostart tab's saved sequence overrides folder-derived order entirely
        if ($autostartMode === 'custom') {
            fv3_apply_custom_autostart($allContainerNames, $ctListComplete);
            return;
        }

        // Folder-derived order needs the WHOLE list: containers missing from a partial read are
        // skipped by the order walk and land appended at the end, silently reordering the file.
        // Custom mode above is exempt — its order comes from the saved sequence, not this list.
        if (!$ctListComplete) {
            fv3_debug_log("syncContainerOrder: container list empty or incomplete, aborting before write");
            return;
        }

        $ctLabels = fv3_read_container_labels($dockerClient, $allContainerNames);
        // Fail closed: without label claims the order below would write label-assigned
        // containers back out as unassigned — the same hazard $ctListComplete guards above.
        if ($ctLabels === null) {
            fv3_debug_log("syncContainerOrder: label read unavailable or incomplete, aborting before write");
            return;
        }
        $membership = fv3_compute_folder_membership($folders, $allContainerNames, $ctLabels);
        $folderContainers = $membership['containers'];
        $folderNames = $membership['names'];
        $assignedContainers = $membership['assigned'];

        // Build $currentOrder. Source:
        //   - userprefs.cfg if it exists (user has drag-reordered at some point)
        //   - otherwise alphabetical intermix of folder names + orphan containers (matches the
        //     alpha synthesis in createFolders() client-side)
        $currentPrefs = file_exists($prefsFile) ? @parse_ini_file($prefsFile) : false;
        if ($currentPrefs) {
            $currentOrder = array_values($currentPrefs);
            fv3_debug_log("syncContainerOrder: using userprefs.cfg order (" . count($currentOrder) . " entries)");
        } else {
            $entries = [];
            foreach ($folderContainers as $placeholder => $_members) {
                $entries[] = ['key' => $placeholder, 'name' => $folderNames[$placeholder]];
            }
            foreach ($allContainerNames as $name) {
                if (!in_array($name, $assignedContainers)) {
                    $entries[] = ['key' => $name, 'name' => $name];
                }
            }
            usort($entries, function($a, $b) { return strnatcasecmp($a['name'], $b['name']); });
            $currentOrder = array_column($entries, 'key');
            fv3_debug_log("syncContainerOrder: synthesized alpha-intermix order (" . count($currentOrder) . " entries)");
        }

        // Walk $currentOrder, build the existing-layout portion of $newOrder.
        $existingOrder = [];
        $seen = [];
        foreach ($currentOrder as $item) {
            if (isset($folderContainers[$item])) {
                foreach ($folderContainers[$item] as $ct) {
                    if (!in_array($ct, $seen)) { $existingOrder[] = $ct; $seen[] = $ct; }
                }
                $existingOrder[] = $item;
                $seen[] = $item;
            } elseif (in_array($item, $assignedContainers)) {
                continue;
            } elseif (in_array($item, $allContainerNames) && !in_array($item, $seen)) {
                $existingOrder[] = $item;
                $seen[] = $item;
            }
        }

        // New items (not in $currentOrder): mirrors Unraid's render-time placement of
        // "missing from userprefs.cfg = sort key 0 = top of table". For FV3's folder
        // client-side rendering, new folder placeholders also land at the top via the
        // remaining-folders unshift loop. We prepend them in alphabetical order among
        // themselves so the autostart file matches what's on screen.
        $newItemEntries = [];
        foreach ($folderContainers as $placeholder => $members) {
            if (!in_array($placeholder, $seen)) {
                $newItemEntries[] = ['key' => $placeholder, 'name' => $folderNames[$placeholder]];
            }
        }
        foreach ($allContainerNames as $name) {
            if (!in_array($name, $seen) && !in_array($name, $assignedContainers)) {
                $newItemEntries[] = ['key' => $name, 'name' => $name];
            }
        }
        usort($newItemEntries, function($a, $b) { return strnatcasecmp($a['name'], $b['name']); });

        $newItemsExpanded = [];
        foreach ($newItemEntries as $entry) {
            $key = $entry['key'];
            if (isset($folderContainers[$key])) {
                foreach ($folderContainers[$key] as $ct) { $newItemsExpanded[] = $ct; }
                $newItemsExpanded[] = $key;
            } else {
                $newItemsExpanded[] = $key;
            }
        }

        $newOrder = array_merge($newItemsExpanded, $existingOrder);
        fv3_debug_log("syncContainerOrder: computed newOrder with " . count($newOrder) . " entries (" . count($newItemsExpanded) . " new prepended)");

        // Rewrite autostart file in $newOrder sequence. userprefs.cfg is NOT touched —
        // Unraid owns it, and writes it only when the user explicitly drag-reorders.
        $autoStartFile = fv3_autostart_file();
        if (file_exists($autoStartFile)) {
            $autoStartLines = fv3_prune_stale_autostart(
                @file($autoStartFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [],
                $allContainerNames, $ctListComplete);
            $autoStartMap = [];
            foreach ($autoStartLines as $line) {
                $parts = explode(' ', $line, 2);
                $autoStartMap[$parts[0]] = $line;
            }

            $newAutoStart = [];
            foreach ($newOrder as $name) {
                if (isset($autoStartMap[$name])) {
                    $newAutoStart[] = $autoStartMap[$name];
                    unset($autoStartMap[$name]);
                }
            }
            foreach ($autoStartMap as $line) {
                $newAutoStart[] = $line;
            }
            file_put_contents($autoStartFile, implode("\n", $newAutoStart) . "\n", LOCK_EX);
            fv3_debug_log("syncContainerOrder: wrote autostart file with " . count($newAutoStart) . " entries");
        }
    }

    // A container may be explicit in at most one folder (issue #62). $winnerId's list survives
    // intact (the folder just saved wins); elsewhere ties resolve first-wins in key order.
    function fv3_dedupe_explicit_members(array $folders, ?string $winnerId = null): array {
        $claimed = [];
        // PHP stores an all-digit id as an int key, so compare canonical strings below — on ===
        // the winner would fail to match its own id and be stripped of the members claimed here
        $winnerKey = $winnerId === null ? null : (string)$winnerId;
        $winnerMembers = $winnerId !== null ? ($folders[$winnerId]['containers'] ?? null) : null;
        if (is_array($winnerMembers)) {
            foreach ($winnerMembers as $ct) {
                if (is_string($ct)) { $claimed[$ct] = true; }
            }
        }
        foreach ($folders as $fid => $folder) {
            if (($winnerKey !== null && (string)$fid === $winnerKey) || !is_array($folder['containers'] ?? null)) { continue; }
            $kept = [];
            foreach ($folder['containers'] as $ct) {
                if (is_string($ct)) {
                    if (isset($claimed[$ct])) { continue; }
                    $claimed[$ct] = true;
                }
                $kept[] = $ct;
            }
            $folders[$fid]['containers'] = $kept;
        }
        return $folders;
    }

    function updateFolder(string $type, string $content, ?string $id = null) : void {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { createFile($type); }
        $decoded = json_decode($content, true);
        // A folder must be an object/array — reject scalars so a full-backup bundle can't pollute $type.json
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
            http_response_code(400);
            exit;
        }
        // 'root' is reserved by Unraid's Docker organizer — a same-named folder can never mirror
        if (isset($decoded['name']) && is_string($decoded['name']) && strtolower(trim($decoded['name'])) === 'root') {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => "The folder name 'root' is reserved by Unraid's Docker organizer"]);
            exit;
        }
        $fileData = fv3_read_json_strict("$configDir/$type.json");
        if ($fileData === null) {
            // Corrupt config must fail closed — merging onto empty would wipe every other folder
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => "$type.json is unreadable — refusing to save so existing folders are not wiped"]);
            exit;
        }
        // null (create.php) gets a fresh id, and so does an unknown bad id from a folder-map import; a stored bad id,
        // '' included, is refused, never duplicated
        if ($id === null || (!fv3_is_folder_id($id) && !array_key_exists($id, $fileData))) {
            $id = generateId();
        } elseif (!fv3_is_folder_id($id)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Folder id may only contain letters, digits, _ and -']);
            exit;
        }
        $fileData[$id] = $decoded;
        $fileData = fv3_dedupe_explicit_members($fileData, $id);
        $path = "$configDir/$type.json";
        fv3_atomic_write($path, json_encode($fileData));
    }

    function updateFolderIds(string $type, string $data) : void {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { return; }
        $updates = json_decode($data, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($updates)) { http_response_code(400); exit; }
        // Strict, like updateFolder: the dedupe below rewrites every folder, so a
        // corrupt-as-empty read must abort rather than persist a pruned file
        $fileData = fv3_read_json_strict("$configDir/$type.json");
        if ($fileData === null) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => "$type.json is unreadable — refusing to save so existing folders are not wiped"]);
            exit;
        }
        $changed = false;
        foreach ($updates as $folderId => $patch) {
            if (!fv3_is_folder_id($folderId)) continue;
            if (!is_array($fileData[$folderId] ?? null)) continue;
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
            // A rename can land on a name already explicit elsewhere — re-assert single ownership (issue #62)
            $fileData = fv3_dedupe_explicit_members($fileData);
            $path = "$configDir/$type.json";
            fv3_atomic_write($path, json_encode($fileData));
        }
    }

    function deleteFolder(string $type, string $id) : void {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { createFile($type); return; }
        $fileData = fv3_read_json_strict("$configDir/$type.json");
        if ($fileData === null) {
            // Corrupt config must fail closed — writing the fallback would wipe every folder
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => "$type.json is unreadable — refusing to delete so the folder config is not wiped"]);
            exit;
        }
        // Already gone: delete stays idempotent, and there is nothing to rewrite
        if (!array_key_exists($id, $fileData)) { return; }
        unset($fileData[$id]);
        $path = "$configDir/$type.json";
        fv3_atomic_write($path, json_encode($fileData));
    }

    function readSettings() : string {
        global $configDir;
        $path = "$configDir/settings.json";
        if(!file_exists($path)) {
            if (!is_dir($configDir)) { @mkdir($configDir, 0770, true); }
            fv3_atomic_write($path, '{}');
        }
        $raw = @file_get_contents($path);
        return ($raw !== false) ? $raw : '{}';
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
            'dashboard_context'              => ['0', '1', '2', '3'],
            'dashboard_context_trigger'      => ['0', '1'],
            'dashboard_context_graph'        => ['0', '1', '2', '3', '4'],
            'default_preview'          => ['0', '1', '2', '3', '4'],
            'default_preview_hover'    => ['yes', 'no'],
            'default_preview_status'   => ['none', 'symbol', 'grayscale'],
            'default_preview_grayscale'=> ['yes', 'no'],
            'default_preview_webui'    => ['yes', 'no'],
            'default_preview_logs'     => ['yes', 'no'],
            'default_preview_console'  => ['yes', 'no'],
            'default_preview_update'   => ['yes', 'no'],
            'default_preview_update_folder'      => ['yes', 'no'],
            'dashboard_update_container'         => ['yes', 'no'],
            'dashboard_update_folder'            => ['yes', 'no'],
            'default_preview_vertical_bars' => ['yes', 'no'],
            'default_preview_border'   => ['yes', 'no'],
            'default_row_separator'    => ['yes', 'no'],
            'default_overflow'         => ['default', 'scroll', 'expand'],
            'default_context'          => ['0', '1', '2', '3'],
            'default_context_trigger'  => ['0', '1'],
            'default_context_graph'    => ['0', '1', '2', '3', '4'],
            'default_update_column'    => ['yes', 'no']
        ];
        $freeformUpdate = ['default_context_graph_time', 'dashboard_context_graph_time'];
        if (in_array($key, $freeformUpdate, true)) {
            $value = preg_replace('/[^0-9]/', '', $value);
            if ($value === '') { http_response_code(400); exit; }
        } elseif (!isset($allowed[$key]) || !in_array($value, $allowed[$key], true)) {
            http_response_code(400);
            exit;
        }
        $path = "$configDir/settings.json";
        $fp = fopen($path, 'c+');
        if (!$fp) { http_response_code(500); exit; }
        flock($fp, LOCK_EX);
        $raw = stream_get_contents($fp);
        $data = fv3_decode_settings_or_abort($fp, $raw);
        $data[$key] = $value;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        @chmod($path, 0660);
    }

    function updateSettingsBatch(array $settings) : void {
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
            'dashboard_context'              => ['0', '1', '2', '3'],
            'dashboard_context_trigger'      => ['0', '1'],
            'dashboard_context_graph'        => ['0', '1', '2', '3', '4'],
            'default_preview'          => ['0', '1', '2', '3', '4'],
            'default_preview_hover'    => ['yes', 'no'],
            'default_preview_status'   => ['none', 'symbol', 'grayscale'],
            'default_preview_grayscale'=> ['yes', 'no'],
            'default_preview_webui'    => ['yes', 'no'],
            'default_preview_logs'     => ['yes', 'no'],
            'default_preview_console'  => ['yes', 'no'],
            'default_preview_update'   => ['yes', 'no'],
            'default_preview_update_folder'      => ['yes', 'no'],
            'dashboard_update_container'         => ['yes', 'no'],
            'dashboard_update_folder'            => ['yes', 'no'],
            'default_preview_vertical_bars' => ['yes', 'no'],
            'default_preview_border'   => ['yes', 'no'],
            'default_row_separator'    => ['yes', 'no'],
            'default_overflow'         => ['default', 'scroll', 'expand'],
            'default_context'          => ['0', '1', '2', '3'],
            'default_context_trigger'  => ['0', '1'],
            'default_context_graph'    => ['0', '1', '2', '3', '4'],
            'default_update_column'    => ['yes', 'no']
        ];
        $freeform = ['default_vertical_bars_color', 'default_border_color', 'default_separator_color', 'default_preview_text_width', 'default_context_graph_time', 'dashboard_context_graph_time'];
        $path = "$configDir/settings.json";
        $fp = fopen($path, 'c+');
        if (!$fp) { http_response_code(500); exit; }
        flock($fp, LOCK_EX);
        $raw = stream_get_contents($fp);
        $data = fv3_decode_settings_or_abort($fp, $raw);
        foreach ($settings as $key => $value) {
            $key = (string)$key;
            $value = (string)$value;
            if (isset($allowed[$key])) {
                if (in_array($value, $allowed[$key], true)) $data[$key] = $value;
            } elseif (in_array($key, $freeform, true)) {
                if (strlen($value) > 50) continue;
                $value = preg_replace('/[<>"\'\\\\]/', '', $value);
                if ($value === '') { unset($data[$key]); } else { $data[$key] = $value; }
            }
        }
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
        $data = fv3_decode_settings_or_abort($fp, $raw);
        if ($value === '') { unset($data[$key]); } else { $data[$key] = $value; }
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        @chmod($path, 0660);
    }

    // Theme listing, import, toggle and delete, and the styles/ confinement helpers they share
    require_once(__DIR__ . '/themes.php');

    function exportAll() : array {
        global $configDir;
        $unraidIni = @parse_ini_file('/etc/unraid-version');
        // Strict reads: a config file that exists but can't be parsed aborts the export —
        // a backup silently exporting corrupt-as-empty would wipe good data when imported.
        $sections = [];
        foreach (['docker' => 'docker.json', 'vm' => 'vm.json', 'settings' => 'settings.json',
                  'autostart' => 'autostart.json', 'css_config' => 'css-config.json'] as $bk => $bf) {
            $sec = fv3_read_json_strict("$configDir/$bf");
            if ($sec === null) return ['error' => "$bf is unreadable or corrupt — export aborted so an incomplete backup can't overwrite good data on import"];
            $sections[$bk] = $sec;
        }
        $bundle = [
            'fv3_export_version' => 1,
            'plugin_version' => trim(@file_get_contents("$configDir/version") ?: ''),
            'unraid_version' => is_array($unraidIni) && isset($unraidIni['version']) ? $unraidIni['version'] : '',
            'exported' => date('c'),
            'docker' => $sections['docker'],
            'vm' => $sections['vm'],
            'settings' => $sections['settings'],
            'autostart' => $sections['autostart'],
            'css_config' => $sections['css_config'],
            'custom_styles' => []
        ];
        foreach (['docker', 'vm'] as $ot) {
            $snapExport = fv3_export_order_snapshot($ot);
            if ($snapExport !== null) { $bundle["order_$ot"] = $snapExport; }
        }
        $stylesDir = "$configDir/styles";
        $cssSize = 0;
        if (is_dir($stylesDir)) {
            $items = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($stylesDir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );
            foreach ($items as $item) {
                if ($item->isFile() && (preg_match('/\.css$/i', $item->getFilename()) || $item->getFilename() === '.fv3-source')) {
                    if (preg_match('/^_fv3-generated\./', $item->getFilename())) continue;
                    $relPath = substr($item->getRealPath(), strlen(realpath($stylesDir)) + 1);
                    if (fv3_is_theme_scratch($relPath)) continue;
                    $content = file_get_contents($item->getRealPath());
                    $cssSize += strlen($content);
                    $bundle['custom_styles'][$relPath] = $content;
                }
            }
        }
        if ($cssSize > 2097152) {
            $bundle['custom_styles'] = [];
            $bundle['css_skipped'] = true;
            $bundle['css_skipped_reason'] = 'Custom CSS files exceeded 2MB — export them manually via File Manager.';
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
        // Confinement gate for EVERY write below, not just the snapshot branch: refuse the
        // whole import if the config dir path resolves through a symlink or doesn't exist.
        if (realpath($configDir) !== $configDir) {
            return ['error' => 'Plugin config directory failed its confinement check — import aborted'];
        }
        foreach (['docker', 'vm', 'settings', 'autostart', 'css_config', 'order_docker', 'order_vm'] as $key) {
            if (!isset($bundle[$key]) || !is_array($bundle[$key])) continue;
            $data = $bundle[$key];
            if ($key === 'order_docker' || $key === 'order_vm') {
                $t = $key === 'order_docker' ? 'docker' : 'vm';
                $snapFile = fv3_order_snapshot_file($t);
                if ($data === []) {
                    // Exactly [] is how export represents "source has no snapshot" — clear any
                    // pre-existing destination snapshot so it can't position the freshly
                    // imported folders. A bundle without the key leaves the destination alone.
                    if (file_exists($snapFile)) {
                        if (!@unlink($snapFile)) {
                            // A stale snapshot the bundle said to remove must not survive a "success"
                            return ['error' => "Could not clear order-$t.json — remove it manually (earlier sections were imported)"];
                        }
                        $restored[] = "order-$t.json (cleared)";
                    }
                    continue;
                }
                // Same validation as export: a malformed wrapper is corrupt/tampered input and
                // must not fall through to the clear branch or to a destructive restore.
                $entries = fv3_validate_order_snapshot($data);
                if ($entries === null) { continue; }
                if (saveOrderSnapshot($t, $entries)) {
                    $restored[] = "order-$t.json";
                } else {
                    // Validated entries can only fail on the atomic write itself; the source
                    // provably had a different snapshot, so drop the stale destination copy
                    // rather than let it position the imported folders (heal simply disables).
                    if (file_exists($snapFile) && !@unlink($snapFile)) {
                        return ['error' => "Could not update order-$t.json — remove it manually (earlier sections were imported)"];
                    }
                }
                continue;
            }
            // A key outside the id rule could break out of class/onclick markup (XSS): re-key it, keep the folder
            if ($key === 'docker' || $key === 'vm') {
                $clean = [];
                foreach ($data as $fid => $folder) {
                    if (!is_array($folder)) { continue; }
                    $clean[fv3_is_folder_id($fid) ? (string)$fid : generateId()] = $folder;
                }
                // Imported bundles (and folder.view2 exports) can hold one container in two
                // folders — first folder in bundle order keeps it (issue #62)
                $data = fv3_dedupe_explicit_members($clean);
            }
            $filename = $key === 'css_config' ? 'css-config.json' : "$key.json";
            $path = "$configDir/$filename";
            $flags = JSON_PRETTY_PRINT;
            if (empty($data)) $flags |= JSON_FORCE_OBJECT;
            fv3_atomic_write($path, json_encode($data, $flags));
            $restored[] = $filename;
        }
        if (isset($bundle['custom_styles']) && is_array($bundle['custom_styles'])) {
            $stylesDir = "$configDir/styles";
            if (!is_dir($stylesDir)) @mkdir($stylesDir, 0770, true);
            $baseReal = realpath($stylesDir);
            foreach ($bundle['custom_styles'] as $relPath => $content) {
                if (!is_string($content) || !is_string($relPath)) continue;
                if (!preg_match('/\.css$/i', $relPath) && basename($relPath) !== '.fv3-source') continue;
                if (preg_match('/\.\./', $relPath)) continue;
                $fullPath = "$stylesDir/$relPath";
                if (!fv3_mkdir_within(dirname($fullPath), (string)$baseReal)) continue;
                fv3_atomic_write($fullPath, $content);
                $restored[] = "styles/$relPath";
            }
        }
        if (isset($bundle['css_config']) && is_array($bundle['css_config'])) {
            generateCssFile($bundle['css_config']);
        }
        // apply the restored folder layout / autostart mode to the live start order immediately
        syncContainerOrder('docker');
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
            'folder-view3-graph-mem' => '#5d6db6',
            'fv3-accent-color' => 'var(--color-orange, #f0a30a)',
            'fv3-folder-preview-bg' => 'transparent',
            'fv3-preview-icon-size' => '32px',
            'fv3-folder-icon-size' => '36px',
            'fv3-folder-name-bg' => 'transparent',
            'fv3-row-bg' => 'transparent',
            'fv3-toggle-color' => '',
            'fv3-toggle-hover-color' => '',
            'fv3-appname-max-width' => '120px',
            'fv3-scrollbar-color' => 'rgba(255, 140, 47, 0.5)',
            'fv3-separator-bg' => 'rgba(128, 128, 128, 0.15)',
            'fv3-tab-active-bg' => 'rgba(128, 128, 128, 0.15)',
            'fv3-tab-active-border' => 'rgba(128, 128, 128, 0.3)',
            'fv3-panel-border' => 'rgba(128, 128, 128, 0.2)',
            'fv3-panel-bg' => 'rgba(128, 128, 128, 0.08)',
            'fv3-surface-tint' => 'rgba(128, 128, 128, 0.1)',
            'fv3-hover-bg' => 'rgba(128, 128, 128, 0.2)',
            'fv3-border' => '1px solid rgba(128, 128, 128, 0.3)',
            'fv3-inset-bg' => 'transparent',
            'fv3-inset-fill' => 'none',
            'fv3-inset-border-color' => 'rgba(128, 128, 128, 0.3)',
            'fv3-inset-showcase-fill' => 'none',
            'fv3-inset-showcase-border' => 'rgba(128, 128, 128, 0.2)',
            'fv3-embossed-border' => 'rgba(128, 128, 128, 0.3)',
            'fv3-embossed-accent' => 'var(--color-orange, #f0a30a)',
            'fv3-embossed-bg' => 'transparent',
            'fv3-embossed-inner-border' => 'rgba(128, 128, 128, 0.2)',
            'fv3-embossed-inner-bg' => 'var(--fv3-panel-bg, rgba(128, 128, 128, 0.08))',
            'fv3-chevron-color' => 'inherit',
            'fv3-chevron-size' => '14px',
            'fv3-preview-border-color' => 'currentColor',
            'fv3-vertical-bars-color' => 'currentColor',
            'fv3-separator-color' => 'rgba(128, 128, 128, 0.5)',
            'fv3-folder-name-color' => 'inherit',
            'fv3-folder-name-size' => 'inherit',
            'fv3-folder-name-weight' => 'inherit',
            'fv3-appname-color' => 'inherit',
            'fv3-appname-size' => 'inherit',
            'fv3-folder-row-border-width' => '0',
            'fv3-folder-row-border-color' => 'transparent',
            'fv3-folder-row-radius' => '0',
            'fv3-folder-row-padding' => '0',
            'fv3-preview-row-border-width' => '0',
            'fv3-preview-row-border-color' => 'transparent',
            'fv3-showcase-bg' => 'transparent',
            'fv3-row-alt-bg' => 'var(--dynamix-tablesorter-tbody-row-alt-bg-color, rgba(128, 128, 128, 0.08))',
            'fv3-folder-name-min-width' => '220px'
        ];
    }

    function updateCssConfig(string $json) : void {
        global $configDir;
        if (strlen($json) > 51200) { http_response_code(400); echo 'Config too large'; exit; }
        $config = json_decode($json, true);
        if ($config === null) { http_response_code(400); echo 'Invalid JSON'; exit; }
        $allowedKeys = ['preset', 'global', 'dashboard', 'docker', 'vm', 'custom_css', 'custom_css_dashboard', 'custom_css_docker', 'custom_css_vm', 'toggle_style', 'custom_presets', 'user_notes', 'page_presets', 'page_values'];
        foreach (array_keys($config) as $k) {
            if (!in_array($k, $allowedKeys, true)) { unset($config[$k]); }
        }
        foreach (['custom_css', 'custom_css_dashboard', 'custom_css_docker', 'custom_css_vm'] as $cssKey) {
            if (isset($config[$cssKey]) && is_string($config[$cssKey])) {
                $config[$cssKey] = preg_replace('/@import\b/i', '', $config[$cssKey]);
                $config[$cssKey] = preg_replace('/expression\s*\(/i', '', $config[$cssKey]);
                $config[$cssKey] = preg_replace('/javascript\s*:/i', '', $config[$cssKey]);
                if (strlen($config[$cssKey]) > 10240) $config[$cssKey] = substr($config[$cssKey], 0, 10240);
            }
        }
        foreach (['global', 'dashboard', 'docker', 'vm'] as $section) {
            if (isset($config[$section]) && is_array($config[$section])) {
                foreach ($config[$section] as $varName => $val) {
                    if (!is_string($val) || strlen($val) > 200) { unset($config[$section][$varName]); }
                }
            }
        }
        // Generate CSS file BEFORE object cast (generateCssFile expects arrays)
        generateCssFile($config);
        // Ensure map keys are always serialized as JSON objects (PHP encodes empty arrays as [])
        foreach (['global', 'dashboard', 'docker', 'vm', 'page_presets', 'page_values'] as $mapKey) {
            if (isset($config[$mapKey]) && is_array($config[$mapKey])) {
                $config[$mapKey] = (object)$config[$mapKey];
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
    }

    function generateCssFile(array $config) : void {
        global $configDir;
        $defaults = readCssDefaults();
        $stylesDir = "$configDir/styles";
        if (!is_dir($stylesDir)) { @mkdir($stylesDir, 0770, true); }

        $sanitize = function($varName, $value) use ($defaults) {
            if (!isset($defaults[$varName])) return null;
            if ($value === $defaults[$varName]) return null;
            $safeVar = preg_replace('/[^a-zA-Z0-9-]/', '', $varName);
            $safeVal = str_replace([';', '{', '}', '<', '>'], '', $value);
            $safeVal = preg_replace('/expression\s*\(/i', '', $safeVal);
            $safeVal = preg_replace('/@import\b/i', '', $safeVal);
            return "    --{$safeVar}: {$safeVal};\n";
        };

        // Sanitize custom CSS at the write sink so ALL callers are covered
        // (updateCssConfig strips too, but importAll writes generated CSS directly).
        $sanitizeCustom = function($css) {
            $css = preg_replace('/@import\b/i', '', $css);
            $css = preg_replace('/expression\s*\(/i', '', $css);
            $css = preg_replace('/javascript\s*:/i', '', $css);
            if (strlen($css) > 10240) $css = substr($css, 0, 10240);
            return $css;
        };

        // Global variables + custom CSS → combined file (loaded on all pages)
        $globalCss = ":root {\n";
        $hasGlobal = false;
        if (isset($config['global']) && is_array($config['global'])) {
            foreach ($config['global'] as $varName => $value) {
                $line = $sanitize($varName, $value);
                if ($line) { $globalCss .= $line; $hasGlobal = true; }
            }
        }
        $globalCss .= "}\n";
        if (isset($config['custom_css']) && is_string($config['custom_css']) && trim($config['custom_css']) !== '') {
            $globalCss .= "\n" . $sanitizeCustom($config['custom_css']) . "\n";
            $hasGlobal = true;
        }
        $outPath = "$stylesDir/_fv3-generated.docker-vm-dashboard.css";
        if ($hasGlobal) {
            fv3_atomic_write($outPath, $globalCss);
        } else {
            @unlink($outPath);
        }

        // Page-scoped variables + custom CSS → per-page files
        foreach (['dashboard', 'docker', 'vm'] as $scope) {
            $scopeCss = '';
            $hasScope = false;

            // Page-scoped variables from variable editor
            if (isset($config[$scope]) && is_array($config[$scope])) {
                $varBlock = ":root {\n";
                $hasVars = false;
                foreach ($config[$scope] as $varName => $value) {
                    $line = $sanitize($varName, $value);
                    if ($line) { $varBlock .= $line; $hasVars = true; }
                }
                $varBlock .= "}\n";
                if ($hasVars) { $scopeCss .= $varBlock; $hasScope = true; }
            }

            // Page-scoped custom CSS
            $scopeKey = "custom_css_{$scope}";
            if (isset($config[$scopeKey]) && is_string($config[$scopeKey]) && trim($config[$scopeKey]) !== '') {
                $scopeCss .= "\n" . $sanitizeCustom($config[$scopeKey]) . "\n";
                $hasScope = true;
            }

            $scopePath = "$stylesDir/_fv3-generated.{$scope}.css";
            if ($hasScope) {
                fv3_atomic_write($scopePath, $scopeCss);
            } else {
                @unlink($scopePath);
            }
        }
    }

    function generateId(int $length = 20) : string {
        return substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes((int)ceil($length * 3 / 4)))), 0, $length);
    }

    // Ids safe to write and to render into class/selector/onclick markup; int = all-digit JSON key
    function fv3_is_folder_id($id) : bool {
        return (is_string($id) || is_int($id)) && preg_match('/^[A-Za-z0-9_-]+$/D', (string)$id) === 1;
    }

    function createFile(string $type): void {
        global $configDir;
        if (!is_dir($configDir)) { @mkdir($configDir, 0770, true); }
        $path = "$configDir/$type.json";
        fv3_atomic_write($path, '{}');
    }

    // Mirrors DockerContainers.php:82 — ':???' net-ref wins, then Unraid's per-container cache.
    // Only 'updated' comes from that cache; WebUi/Shell stay live here (the cache holds unresolved [IP]/[PORT:n]).
    function fv3_container_update_status(array $ct, string $name, array $cache, DockerUpdate $DockerUpdate): ?bool {
        if (substr($ct['HostConfig']['NetworkMode'] ?? '', -4) === ':???') return false;
        $entry = $cache[$name] ?? null;
        if (is_array($entry) && array_key_exists('updated', $entry)) {
            return $entry['updated'] === 'true' ? true : ($entry['updated'] === 'false' ? false : null);
        }
        return $DockerUpdate->getUpdateStatus($ct['info']['Config']['Image']);
    }

    function readInfo(string $type): array {
        fv3_debug_log("readInfo called for type: $type");
        $info = [];
        if ($type == "docker") {
            global $dockerManPaths, $documentRoot;
            global $driver, $host; 
            if (!isset($driver) || !is_array($driver)) { $driver = DockerUtil::driver(); fv3_debug_log("Initialized \$driver: " . json_encode($driver)); }
            // DockerUtil::host() only exists on Unraid 7.1.0+; fall back to the request's server address on 7.0.0/7.0.1
            if (!isset($host)) { $host = method_exists('DockerUtil', 'host') ? DockerUtil::host() : ($_SERVER['SERVER_ADDR'] ?? ''); fv3_debug_log("Initialized \$host: " . $host); }

            $dockerClient = new DockerClient();
            $DockerUpdate = new DockerUpdate();
            $dockerTemplates = new DockerTemplates();

            $cts = $dockerClient->getDockerJSON("/containers/json?all=1");
            if (!is_array($cts)) $cts = [];
            $autoStartFile = $dockerManPaths['autostart-file'] ?? "/var/lib/docker/unraid-autostart";
            $autoStartLines = @file($autoStartFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            $autoStart = array_map('var_split', $autoStartLines);
            $dockerInfoCache = DockerUtil::loadJSON($dockerManPaths['webui-info'] ?? "/usr/local/emhttp/state/plugins/dynamix.docker.manager/docker.json");
            if (!is_array($dockerInfoCache)) $dockerInfoCache = [];

            // Only curate the file while FV3 actually manages autostart order
            $ctNames = array_map(function($c) { return ltrim($c['Names'][0] ?? '', '/'); }, $cts);
            if (readAutostartConfig()['mode'] !== 'off') {
                $cleanedLines = fv3_prune_stale_autostart($autoStartLines, $ctNames,
                    !empty($ctNames) && !in_array('', $ctNames, true));
                if (count($cleanedLines) < count($autoStartLines)) {
                    file_put_contents($autoStartFile, implode("\n", $cleanedLines) . "\n", LOCK_EX);
                    $autoStart = array_map('var_split', $cleanedLines);
                }
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
                $ct['info']['State']['Updated'] = fv3_container_update_status($ct, $containerName, $dockerInfoCache, $DockerUpdate);
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
                    $tsServeModeFromXml = $ct['Labels']['net.unraid.docker.tailscale.servemode'] ?? (($ct['Labels']['net.unraid.docker.tailscale.funnel'] ?? '') === 'true' ? 'funnel' : 'no');
                    $isTailscaleEnabledForContainer = strtolower($ct['Labels']['net.unraid.docker.tailscale.enabled'] ?? 'false') === 'true';
                    $ct['info']['Shell'] = $ct['Labels']['net.unraid.docker.shell'] ?? 'sh';
                }
                // Shell is rendered into an inline onclick JS-string arg — constrain to a shell-path charset so a hostile image label can't break out and inject JS
                $ct['info']['Shell'] = preg_replace('/[^a-zA-Z0-9 _.\/-]/', '', (string)$ct['info']['Shell']);
                if ($ct['info']['Shell'] === '') { $ct['info']['Shell'] = 'sh'; }
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

                        // A container:xxx container shares another container's network namespace
                        // (e.g. a VPN sidecar like Gluetun) and has no IP/ports of its own — the
                        // ports are published by the parent. Resolve [IP]/[PORT:] against the
                        // parent's host port bindings instead of giving up on the WebUI link.
                        $portsForResolution = $ct['info']['Ports'];
                        if (strpos($currentNetworkMode, 'container:') === 0) {
                            $webUiIp = $host;
                            $portsForResolution = [];
                            $parentRef = substr($currentNetworkMode, strlen('container:'));
                            $parentDetails = $dockerClient->getContainerDetails($parentRef);
                            $parentBindings = $parentDetails['HostConfig']['PortBindings'] ?? [];
                            if (is_array($parentBindings)) {
                                foreach ($parentBindings as $containerPortProtocol => $hostBindings) {
                                    if (is_array($hostBindings) && !empty($hostBindings)) {
                                        list($pPriv) = explode('/', $containerPortProtocol);
                                        $portsForResolution[] = ['PrivatePort' => $pPriv, 'PublicPort' => $hostBindings[0]['HostPort'] ?? null, 'NAT' => true];
                                    }
                                }
                            }
                            fv3_debug_log("  $containerName: container: mode, parent '$parentRef' bindings: " . json_encode($portsForResolution));
                        }

                        if ($currentNetworkMode === 'none') { $finalWebUi = ''; }
                        else {
                            $tempWebUi = str_replace("[IP]", $webUiIp ?: '', $rawWebUiString);
                            if (preg_match("%\[PORT:(\d+)\]%", $tempWebUi, $matches)) {
                                $internalPortFromTemplate = $matches[1]; $mappedPublicPort = $internalPortFromTemplate;
                                foreach ($portsForResolution as $p) {
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
                $ct['info']['State']['WebUi'] = fv3_safe_http_url($finalWebUi);
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
                $ct['info']['State']['TSWebUi'] = fv3_safe_http_url($finalTsWebUi);
                fv3_debug_log("  $containerName: Resolved TS WebUi: '$finalTsWebUi'");
                
                $info[$containerName] = $ct;
            }
            unset($ct); 

        } elseif ($type == "vm") {
            fv3_debug_log("VM: Entering VM block.");
            if (!fv3_require_libvirt_helpers()) { fv3_debug_log("VM: libvirt_helpers.php not available."); return []; }
            fv3_debug_log("VM: libvirt_helpers loaded OK.");
            try {
                global $lv;
                if (!isset($lv)) {
                    fv3_debug_log("VM: Creating Libvirt instance...");
                    $lv = new Libvirt();
                    fv3_debug_log("VM: Libvirt instance created. Connecting...");
                    if (!$lv->connect()) { fv3_debug_log("VM: Libvirt connection failed."); return []; }
                    fv3_debug_log("VM: Libvirt connected.");
                }
                fv3_debug_log("VM: Calling get_domains()...");
                $vms = $lv->get_domains();
                fv3_debug_log("VM: Found " . count($vms) . " VMs.");
            } catch (\Throwable $e) {
                fv3_debug_log("VM: FATAL - Libvirt init/connect crashed: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
                return [];
            }
            if (!empty($vms)) {
                foreach ($vms as $vm) {
                    $res = $lv->get_domain_by_name($vm);
                    if (!$res) { fv3_debug_log("VM: Could not get domain by name for $vm."); continue; }
                    $dom = $lv->domain_get_info($res);
                    $vncPort = '';
                    try {
                        $xml = $lv->domain_get_xml($res);
                        if ($xml) {
                            $xmlObj = @simplexml_load_string($xml);
                            $graphics = $xmlObj ? $xmlObj->xpath('//graphics[@type="vnc"]') : [];
                            if (!empty($graphics)) {
                                $ws = (string)($graphics[0]['websocket'] ?? '');
                                $raw = $ws ?: (string)$graphics[0]['port'];
                                $vncPort = ctype_digit($raw) ? $raw : '';
                            }
                        }
                    } catch (\Throwable $e) {
                        fv3_debug_log("VM: VNC port extraction failed for $vm: " . $e->getMessage());
                    }
                    $info[$vm] = [
                        'uuid' => $lv->domain_get_uuid($res), 'name' => $vm,
                        'description' => $lv->domain_get_description($res),
                        'autostart' => $lv->domain_get_autostart($res),
                        'state' => $lv->domain_state_translate($dom['state']),
                        'icon' => $lv->domain_get_icon_url($res),
                        'logs' => (is_file("/var/log/libvirt/qemu/$vm.log") ? "libvirt/qemu/$vm.log" : ''),
                        'vnc_port' => $vncPort
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