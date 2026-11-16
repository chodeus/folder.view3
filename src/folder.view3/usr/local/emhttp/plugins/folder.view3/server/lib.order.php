<?php
    // Docker and VM order: Unraid's saved order (userprefs.cfg) and FV3's snapshot of it, the Docker autostart file and mode, folder
    // membership, and the page order syncContainerOrder() builds from them

    function readUserPrefs(string $type) : string {
        global $fv3DockerManDir;
        $prefsFilePath = '';
        if($type == 'docker') { $prefsFilePath = "$fv3DockerManDir/userprefs.cfg"; }
        elseif($type == 'vm') { $prefsFilePath = "/boot/config/plugins/dynamix.vm.manager/userprefs.cfg"; }
        else { return '[]'; }
        if(!file_exists($prefsFilePath)) { return '[]'; }
        // A deliberate GET side effect: the heal derives only from server-side state and only inserts, so a cross-site GET does no
        // more than the next page load would
        fv3_heal_user_prefs($type, $prefsFilePath);
        $raw = @file_get_contents($prefsFilePath);
        return json_encode(($raw === false ? null : fv3_parse_user_prefs($raw)) ?? []);
    }

    // userprefs.cfg's values in Unraid's order (by the number before each =, as its Docker page sorts them); null when the text
    // will not parse or holds a value that is not a string (a `n[]=` line)
    function fv3_parse_user_prefs(string $raw): ?array {
        $parsed = @parse_ini_string($raw);
        if (!is_array($parsed) || array_filter($parsed, fn($v) => !is_string($v))) return null;
        uksort($parsed, fn($a, $b) => (int)$a <=> (int)$b);
        return array_values($parsed);
    }

    // userprefs.cfg in the format Unraid writes it, one N="name" line per entry
    function fv3_write_user_prefs(string $file, array $entries): bool {
        $lines = [];
        foreach (array_values($entries) as $i => $name) { $lines[] = $i . '="' . $name . '"'; }
        return fv3_atomic_write($file, implode("\n", $lines) . "\n");
    }

    function fv3_order_snapshot_file(string $type): string {
        global $configDir;
        return "$configDir/order-$type.json";
    }

    // The cleaned list, or null when an entry breaks the rules that keep healed userprefs.cfg lines sound (a string, at most 256
    // bytes, no quote or control character; at most 4096 entries). Empty ones (every stock names string ends ';') are dropped
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

    // The entries of a wrapper saveOrderSnapshot could have written (version 1, non-empty entries that sanitize unchanged), else null: export
    // and import share it, and anything else must be ignored, never read as empty (import would clear a valid snapshot)
    function fv3_validate_order_snapshot(array $data): ?array {
        if (($data['fv3_order_version'] ?? null) !== 1
            || !isset($data['entries']) || !is_array($data['entries'])) return null;
        $clean = fv3_sanitize_order_entries($data['entries']);
        if ($clean === null || empty($clean) || $clean !== array_values($data['entries'])) return null;
        return $clean;
    }

    // The tri-state importAll() relies on: no file -> [] (import clears the destination), unreadable or malformed -> null (import
    // leaves it alone), valid -> the wrapped snapshot
    function fv3_export_order_snapshot(string $type): ?array {
        $path = fv3_order_snapshot_file($type);
        if (!file_exists($path)) return [];
        $raw = @file_get_contents($path);
        $data = ($raw !== false) ? json_decode($raw, true) : null;
        if (!is_array($data) || fv3_validate_order_snapshot($data) === null) return null;
        return $data;
    }

    // Puts live folders the saved order lacks (after a reinstall, or a lost entry) back where FV3's snapshot had them. Insert-only:
    // existing entries keep their place and order
    function fv3_heal_user_prefs(string $type, string $prefsFilePath): void {
        global $configDir;
        $raw = @file_get_contents($prefsFilePath);
        if (!is_string($raw) || $raw === '') return;
        $current = fv3_parse_user_prefs($raw);
        if (!$current) return;

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

        // Stock UserPrefs writes are lockless, so re-check the source right before
        // replacing — a concurrent reorder mid-compute aborts the heal (next load retries).
        if (@file_get_contents($prefsFilePath) !== $raw) return;
        if (fv3_write_user_prefs($prefsFilePath, $out)) {
            fv3_debug_log("fv3_heal_user_prefs($type): re-inserted " . (count($out) - count($current)) . " folder position(s)");
        }
    }

    function fv3_autostart_file(): string {
        global $fv3DockerManDir;
        $dockerManPaths = @parse_ini_file("$fv3DockerManDir/dockerMan.cfg") ?: [];
        return $dockerManPaths['autostart-file'] ?? "/var/lib/docker/unraid-autostart";
    }

    // null when the file cannot be read: a caller that rebuilds the file from these lines must stop, not write []
    function fv3_read_autostart_lines(string $file): ?array {
        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        return $lines === false ? null : $lines;
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

    function updateAutostartConfig(string $mode, array $sequence, array $waits): array {
        global $configDir;
        if (!in_array($mode, ['folder', 'custom', 'off'], true)) return ['error' => 'Invalid mode'];
        $cleanSeq = [];
        foreach ($sequence as $name) {
            if (is_string($name) && preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/', $name)) $cleanSeq[] = $name;
            if (count($cleanSeq) >= 500) break;
        }
        $cleanSeq = array_values(array_unique($cleanSeq));
        // Read before the write: an unreadable autostart file aborts the save rather than reporting
        // success with the wait edits silently dropped
        $autoStartFile = fv3_autostart_file();
        $lines = null;
        if (!empty($waits)) {
            if (file_exists($autoStartFile)) {
                // Zeros still have to reach the loop below: that is how a wait is cleared
                $lines = fv3_read_autostart_lines($autoStartFile);
                if ($lines === null) return ['error' => 'Could not read the autostart file — nothing was saved'];
            } elseif (array_filter($waits, static fn($w) => (int)$w > 0)) {
                // No file to apply them to; an all-zero map is the empty state and saves normally
                return ['error' => 'Could not read the autostart file — nothing was saved'];
            }
        }

        $ok = fv3_atomic_write("$configDir/autostart.json", json_encode(['mode' => $mode, 'sequence' => $cleanSeq], JSON_PRETTY_PRINT));
        if (!$ok) return ['error' => 'Failed to write autostart config'];

        // Fold wait edits into the live file — a name only matches a line that already has autostart enabled
        $waitFailed = null;
        if ($lines !== null) {
            $changed = false;
            foreach ($lines as $i => $line) {
                $name = explode(' ', $line, 2)[0];
                if (array_key_exists($name, $waits)) {
                    $wait = max(0, min(3600, (int)$waits[$name]));
                    $newLine = rtrim($name . ' ' . ($wait > 0 ? $wait : ''));
                    if ($newLine !== $line) { $lines[$i] = $newLine; $changed = true; }
                }
            }
            if ($changed && @file_put_contents($autoStartFile, implode("\n", $lines) . "\n", LOCK_EX) === false) {
                $waitFailed = 'the wait edits could not be written to the autostart file';
            }
        }

        // Re-assert order under the saved mode — saving folder mode instantly restores folder-derived order.
        // The mode and sequence are saved either way: wait edits that were not written and a sync that stopped come back as `warning`
        $warnings = array_filter([$waitFailed, $mode !== 'off' ? syncContainerOrder('docker') : null]);
        return ['success' => true, 'mode' => $mode, 'sequence' => $cleanSeq] + ($warnings ? ['warning' => implode('; ', $warnings)] : []);
    }

    // The autostart lines in the saved custom sequence, waits kept; enabled containers it does not name keep their order at the end.
    // Returns why the autostart file could not be put in that sequence, or null
    function fv3_apply_custom_autostart(array $allContainerNames, bool $ctListComplete): ?string {
        $autoStartFile = fv3_autostart_file();
        if (!file_exists($autoStartFile)) return null;
        $sequence = readAutostartConfig()['sequence'];
        $rawLines = fv3_read_autostart_lines($autoStartFile);
        if ($rawLines === null) { fv3_debug_log("fv3_apply_custom_autostart: $autoStartFile unreadable, not rewriting"); return 'the autostart file could not be read'; }
        $newAutoStart = fv3_reorder_autostart(fv3_prune_stale_autostart($rawLines, $allContainerNames, $ctListComplete), $sequence);
        if ($newAutoStart === $rawLines) { return null; }
        if (@file_put_contents($autoStartFile, implode("\n", $newAutoStart) . "\n", LOCK_EX) === false) { return 'the autostart file could not be written'; }
        fv3_debug_log("fv3_apply_custom_autostart: wrote " . count($newAutoStart) . " entries (" . count($sequence) . " sequenced)");
        return null;
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

    // The values of Unraid's saved Docker order (userprefs.cfg): [] when there is none, null when the file will not be read
    function fv3_docker_prefs(): ?array {
        global $fv3DockerManDir;
        $file = "$fv3DockerManDir/userprefs.cfg";
        if (!is_file($file)) { return []; }
        $raw = @file_get_contents($file);
        return $raw === false ? null : fv3_parse_user_prefs($raw);
    }

    // Container names in the order read_unraid_order.php hands the page (readUnraidOrder): saved names in userprefs.cfg
    // order, unsaved ones after them as Docker lists them; A-Z when nothing is saved
    function fv3_live_order(array $names, array $prefs): array {
        if (!$prefs) { usort($names, 'strnatcasecmp'); return $names; }
        $saved = array_values(array_unique(array_filter($prefs, function($p) use ($names) { return in_array($p, $names, true); })));
        return array_merge($saved, array_values(array_filter($names, function($n) use ($saved) { return !in_array($n, $saved, true); })));
    }

    // The order docker.js createFolders() draws folders in: the folders userprefs.cfg names, in its order, then the rest in JS key
    // order; with nothing saved, A-Z by name
    function fv3_folder_walk_order(array $folders, array $prefs): array {
        $ids = fv3_js_key_order(array_keys($folders));
        if (!$prefs) {
            $name = fn($id) => $folders[$id]['name'] !== '' ? $folders[$id]['name'] : "folder-$id";
            usort($ids, fn($a, $b) => fv3_name_cmp($name($a), $name($b)));
            return $ids;
        }
        $saved = [];
        foreach ($prefs as $entry) {
            if (str_starts_with($entry, 'folder-') && array_key_exists(substr($entry, 7), $folders)) $saved[] = substr($entry, 7);
        }
        return array_values(array_unique(array_merge($saved, $ids)));
    }

    // Membership, explicit > label > regex (#46/#55), for syncContainerOrder and read_membership.php alike (#61). $prefs orders regex
    // and label members as the page lists them (fv3_live_order), and folders as it draws them: of two regex matches, the first drawn wins
    function fv3_compute_folder_membership(array $folders, array $allContainerNames, array $ctLabels, array $prefs = []): array {
        $live = fv3_live_order($allContainerNames, $prefs);
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
            if (isset($folderNameSet[$ctLabel])) { $explicitAssigned[] = (string)$ctName; }
        }
        foreach (fv3_folder_walk_order($folders, $prefs) as $folderId) {
            $folder = $folders[$folderId];
            $members = $folder['containers'] ?? [];
            // is_string + trim, not empty(): empty("0") is true, so a regex of "0" was dropped while docker.js applied it; the type
            // check mirrors docker.js and keeps a non-string regex from fataling trim()
            if (is_string($folder['regex'] ?? null) && trim($folder['regex']) !== '') {
                $regex = '/' . str_replace('/', '\/', $folder['regex']) . '/';
                foreach ($live as $name) {
                    if (@preg_match($regex, $name) && !in_array($name, $members, true) && !in_array($name, $explicitAssigned, true)) {
                        $members[] = $name;
                    }
                }
            }
            // Explicit containers[] entries anywhere win over a label claim (issue #55)
            foreach ($live as $ctName) {
                if (($ctLabels[$ctName] ?? null) === $folder['name'] && !in_array($ctName, $members, true) && !in_array($ctName, $explicitMembers, true)) {
                    $members[] = $ctName;
                }
            }
            $members = array_values(array_filter($members, function($m) use ($allContainerNames, $assignedContainers) {
                return in_array($m, $allContainerNames, true) && !in_array($m, $assignedContainers, true);
            }));
            $folderContainers["folder-$folderId"] = $members;
            $folderNames["folder-$folderId"] = $folder['name'] ?? "folder-$folderId";
            $assignedContainers = array_merge($assignedContainers, $members);
        }
        return ['containers' => $folderContainers, 'names' => $folderNames, 'assigned' => $assignedContainers];
    }

    // The order JS walks an object's keys in: index-like keys ("7", not "07") first and ascending, then the rest as written
    function fv3_js_key_order(array $keys): array {
        $keys = array_map('strval', $keys);
        $index = array_values(array_filter($keys, function($k) { return preg_match('/^(0|[1-9]\d{0,9})$/D', $k) === 1 && (int)$k < 4294967295; }));
        sort($index, SORT_NUMERIC);
        return array_merge($index, array_values(array_diff($keys, $index)));
    }

    // A name as the Docker page sorts it with nothing saved: trimmed of what JavaScript's trim() removes
    function fv3_js_trim(string $s): string {
        return preg_replace('/^[\x{9}-\x{D}\x{20}\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+|'
            . '[\x{9}-\x{D}\x{20}\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+$/u', '', $s) ?? trim($s);
    }

    // The browser's name order (localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})) for ASCII: space and punctuation in
    // ICU's order, numbers by value, letters in any case. Other characters follow z by code point, so accents can differ
    function fv3_name_cmp(string $a, string $b): int {
        static $punct = null;
        $punct ??= array_flip(str_split(" _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"));
        $tokens = static function (string $s) use ($punct): ?array {
            if (preg_match_all('/[0-9]+|./su', $s, $m) === false) return null;
            return array_map(static function (string $t) use ($punct): array {
                if (ctype_digit($t)) return [100, ltrim($t, '0')];
                $c = strtolower($t);
                if (isset($punct[$c])) return [$punct[$c], ''];
                return strlen($c) === 1 && $c >= 'a' && $c <= 'z' ? [200 + ord($c), ''] : [1000, $t];
            }, $m[0]);
        };
        $ta = $tokens($a);
        $tb = $tokens($b);
        if ($ta === null || $tb === null) return strnatcasecmp($a, $b);
        foreach ($ta as $i => [$ga, $ka]) {
            if (!isset($tb[$i])) return 1;
            [$gb, $kb] = $tb[$i];
            if ($ga !== $gb) return $ga <=> $gb;
            $c = $ga === 100 ? (strlen($ka) <=> strlen($kb) ?: strcmp($ka, $kb)) : strcmp($ka, $kb);
            if ($c !== 0) return $c <=> 0;
        }
        return count($ta) < count($tb) ? -1 : 0;
    }

    // The Docker page's order, top-down, as container names and folder placeholders, members before their folder.
    // $prefs is userprefs.cfg's values; with none it is A-Z by name as createFolders() sorts it (fv3_name_cmp: accents can differ)
    function fv3_page_order(array $membership, array $allContainerNames, array $prefs): array {
        $folderContainers = $membership['containers'];
        $assigned = $membership['assigned'];
        if (!$prefs) {
            $entries = [];
            foreach ($folderContainers as $placeholder => $_members) {
                // The page's last pass sorts the rows by the trimmed name it shows (docker.js createFolders)
                $entries[] = ['key' => $placeholder, 'name' => fv3_js_trim($membership['names'][$placeholder])];
            }
            foreach ($allContainerNames as $name) {
                if (!in_array($name, $assigned, true)) { $entries[] = ['key' => $name, 'name' => $name]; }
            }
            usort($entries, function($a, $b) { return fv3_name_cmp($a['name'], $b['name']); });
            $prefs = array_column($entries, 'key');
        }
        $placed = [];
        $seen = [];
        foreach ($prefs as $item) {
            if (isset($folderContainers[$item])) {
                foreach ($folderContainers[$item] as $ct) {
                    if (!in_array($ct, $seen, true)) { $placed[] = $ct; $seen[] = $ct; }
                }
                $placed[] = $item;
                $seen[] = $item;
            } elseif (in_array($item, $assigned, true)) {
                continue;
            } elseif (in_array($item, $allContainerNames, true) && !in_array($item, $seen, true)) {
                $placed[] = $item;
                $seen[] = $item;
            }
        }
        // Not in userprefs.cfg yet: docker.js unshifts each such folder (the last one it meets ends on top); new containers sit below them
        $new = [];
        $ids = array_map(function($placeholder) { return substr($placeholder, 7); }, array_keys($folderContainers));
        foreach (array_reverse(fv3_js_key_order($ids)) as $id) {
            $placeholder = "folder-$id";
            if (in_array($placeholder, $seen, true)) { continue; }
            foreach ($folderContainers[$placeholder] as $ct) { $new[] = $ct; }
            $new[] = $placeholder;
        }
        $loose = array_values(array_filter($allContainerNames, function($name) use ($seen, $assigned) {
            return !in_array($name, $seen, true) && !in_array($name, $assigned, true);
        }));
        usort($loose, 'strnatcasecmp');
        return array_merge($new, $loose, $placed);
    }

    // $prefs with each folder's members together in its order, on the side of its entry a neighbour shows (a drag: after, FV3's writers:
    // before; after by default). A folder with no entry, and every other entry, stay as they are
    function fv3_prefs_with_folder_members(array $prefs, array $membership): array {
        $blocks = [];
        foreach ($membership['containers'] as $placeholder => $members) {
            $at = array_search($placeholder, $prefs, true);
            if ($at === false || !$members) continue;
            $after = isset($prefs[$at + 1]) && in_array($prefs[$at + 1], $members, true);
            $before = !$after && $at > 0 && in_array($prefs[$at - 1], $members, true);
            $blocks[$placeholder] = ['members' => $members, 'before' => $before];
        }
        if (!$blocks) return $prefs;
        $moved = array_merge(...array_column($blocks, 'members'));
        $out = [];
        foreach ($prefs as $entry) {
            if (in_array($entry, $moved, true)) continue;
            if (!isset($blocks[$entry])) { $out[] = $entry; continue; }
            ['members' => $members, 'before' => $before] = $blocks[$entry];
            unset($blocks[$entry]); // a repeated entry for the same folder keeps its place, its members come once
            array_push($out, ...($before ? [...$members, $entry] : [$entry, ...$members]));
        }
        return $out;
    }

    // Keeps userprefs.cfg's containers with their folders, so what reads it (Unraid's Start all and autostart sort, other plugins)
    // follows the page. Only a saved order is changed: creating one switches Unraid off its A-Z order (#112). Returns why it failed
    function fv3_sync_user_prefs(array $prefs, array $membership): ?string {
        global $fv3DockerManDir;
        if (!$prefs) return null;
        $updated = fv3_prefs_with_folder_members($prefs, $membership);
        if ($updated === $prefs) return null;
        $updated = fv3_sanitize_order_entries($updated);
        if ($updated === null) return "Unraid's saved Docker order (userprefs.cfg) holds a name that cannot be written back";
        // Stock UserPrefs writes take no lock: an order saved since the read above is kept as it is
        $now = fv3_docker_prefs();
        if ($now === null) return "Unraid's saved Docker order (userprefs.cfg) could not be read";
        if ($now !== $prefs) { fv3_debug_log("fv3_sync_user_prefs: userprefs.cfg changed meanwhile, left as it is"); return null; }
        if (!fv3_write_user_prefs("$fv3DockerManDir/userprefs.cfg", $updated)) {
            fv3_debug_log("fv3_sync_user_prefs: userprefs.cfg could not be written");
            return "Unraid's saved Docker order (userprefs.cfg) could not be updated";
        }
        // FV3's own copy, which the heal restores from after a reinstall
        if (!saveOrderSnapshot('docker', $updated)) fv3_error_log('fv3_sync_user_prefs', 'the order snapshot could not be written');
        fv3_debug_log("fv3_sync_user_prefs: wrote userprefs.cfg with " . count($updated) . " entries");
        return null;
    }

    // Autostart lines ("name" or "name delay") in $order's sequence, each once; lines $order does not name follow, in file order
    function fv3_reorder_autostart(array $lines, array $order): array {
        $byName = [];
        foreach ($lines as $line) { $byName[explode(' ', $line, 2)[0]] = $line; }
        $ordered = [];
        foreach ($order as $name) {
            if (isset($byName[$name])) { $ordered[] = $byName[$name]; unset($byName[$name]); }
        }
        return array_merge($ordered, array_values($byName));
    }

    // Returns why userprefs.cfg or the autostart file could not be put in order (a file or a Docker read it needs failed), else null.
    // An empty container list is only logged: a server with no containers, or with Docker off, has nothing to report
    function syncContainerOrder(string $type): ?string {
        fv3_debug_log("syncContainerOrder called for type: $type");
        if ($type !== 'docker') { return null; }

        $autostartMode = readAutostartConfig()['mode'];
        $dockerClient = new DockerClient();
        $ctNames = fv3_read_container_names($dockerClient);
        // 'custom' = the Autostart tab's saved sequence orders the autostart file; 'off' = FV3 never reorders it
        $failed = array_filter([
            $autostartMode === 'custom' ? fv3_apply_custom_autostart($ctNames['names'], $ctNames['complete']) : null,
            ...fv3_sync_page_order($dockerClient, $ctNames, $autostartMode === 'folder'),
        ]);
        return $failed ? implode('; ', $failed) : null;
    }

    // Puts a saved userprefs.cfg's containers with their folders and, with $autostart, the autostart file in the order FV3 renders:
    // top to bottom, folder members in their editor order. Returns why each part could not be done, [] when all went through
    function fv3_sync_page_order(DockerClient $dockerClient, array $ctNames, bool $autostart): array {
        global $configDir;
        $stop = function (string $why): array { fv3_debug_log("syncContainerOrder: $why, aborting before write"); return [$why]; };
        $allContainerNames = $ctNames['names'];
        // The page's order needs the WHOLE list: a container missing from a partial read would be put out of place in either file
        if (!$ctNames['complete']) {
            if ($ctNames['empty']) { fv3_debug_log("syncContainerOrder: no containers, nothing to sync"); return []; }
            return $stop("Docker's container list could not be read");
        }

        // No docker.json, or no config folder at all (deleted by hand under an open tab), is "no folders": never a stop
        $folders = fv3_read_json_strict("$configDir/docker.json");
        // Corrupt folder config must not be read as no folders
        if ($folders === null) { return $stop('the folder config could not be read'); }

        $ctLabels = fv3_read_container_labels($dockerClient, $allContainerNames);
        // Fail closed: without label claims, label-assigned containers would be written back out as unassigned
        if ($ctLabels === null) { return $stop('the container labels could not be read'); }
        $prefs = fv3_docker_prefs();
        // The page's order cannot be worked out then, so both files stay as they are
        if ($prefs === null) { return $stop("Unraid's saved Docker order (userprefs.cfg) could not be read"); }
        $membership = fv3_compute_folder_membership($folders, $allContainerNames, $ctLabels, $prefs);
        // Each file is put in order on its own: one that fails does not hold the other back
        return array_values(array_filter([
            fv3_sync_user_prefs($prefs, $membership),
            $autostart ? fv3_sync_autostart_order(fv3_page_order($membership, $allContainerNames, $prefs), $allContainerNames) : null,
        ]));
    }

    // The autostart file's lines in $order's sequence, entries for removed containers dropped ($names must be Docker's whole list,
    // #214). Returns why it could not be put in order, else null
    function fv3_sync_autostart_order(array $order, array $names): ?string {
        $autoStartFile = fv3_autostart_file();
        if (!file_exists($autoStartFile)) return null;
        $rawLines = fv3_read_autostart_lines($autoStartFile);
        if ($rawLines === null) return 'the autostart file could not be read';
        $newAutoStart = fv3_reorder_autostart(fv3_prune_stale_autostart($rawLines, $names, true), $order);
        if ($newAutoStart === $rawLines) { fv3_debug_log("syncContainerOrder: autostart file already in order"); return null; }
        if (@file_put_contents($autoStartFile, implode("\n", $newAutoStart) . "\n", LOCK_EX) === false) return 'the autostart file could not be written';
        fv3_debug_log("syncContainerOrder: wrote autostart file with " . count($newAutoStart) . " entries");
        return null;
    }

    // Creates Unraid's saved Docker order on a server with none, after an import or a restore: $first's entries (placeholders, names)
    // first. Its other writers: the heal and fv3_place_imported_docker_folders. Returns why it stopped, or null: also when one is saved
    function fv3_create_docker_order(array $first): ?string {
        global $configDir, $fv3DockerManDir;
        if (!$first) return null;
        $prefs = fv3_docker_prefs();
        if ($prefs === null) return "Unraid's saved Docker order (userprefs.cfg) could not be read";
        if ($prefs) return null;
        $dockerClient = new DockerClient();
        $ctNames = fv3_read_container_names($dockerClient);
        // Docker stopped and no containers both answer []. An order of folders alone would put every container above them once Docker lists them
        if ($ctNames['empty']) return 'Docker is not running or lists no containers';
        if (!$ctNames['complete']) return "Docker's container list could not be read";
        $names = $ctNames['names'];
        $folders = fv3_read_json_strict("$configDir/docker.json");
        if ($folders === null) return 'the folder config could not be read';
        $labels = fv3_read_container_labels($dockerClient, $names);
        if ($labels === null) return 'the container labels could not be read';
        // A restore's order copy names containers too: regex and label members keep its order, the rest Docker's list order (A-Z with none)
        $membership = fv3_compute_folder_membership($folders, $names, $labels, array_values(array_filter($first, fn($e) => is_string($e) && in_array($e, $names, true))));
        // Each folder after its members, as the page lists them; the rest as the page draws it with nothing saved (A-Z)
        $out = [];
        foreach ($first as $entry) {
            if (!is_string($entry)) continue;
            if (isset($membership['containers'][$entry])) {
                array_push($out, ...$membership['containers'][$entry]);
                $out[] = $entry;
            } elseif (in_array($entry, $names, true) && !in_array($entry, $membership['assigned'], true)) {
                $out[] = $entry;
            }
        }
        $out = fv3_sanitize_order_entries(array_values(array_unique(array_merge($out, fv3_page_order($membership, $names, [])))));
        if ($out === null) return 'a name cannot be written to userprefs.cfg';
        // Stock UserPrefs writes take no lock: an order Unraid saved meanwhile wins; one that cannot be read now is said
        $now = fv3_docker_prefs();
        if ($now === null) return "Unraid's saved Docker order (userprefs.cfg) could not be read";
        if ($now) return null;
        if (!is_dir($fv3DockerManDir) || !fv3_write_user_prefs("$fv3DockerManDir/userprefs.cfg", $out)) {
            return "Unraid's saved Docker order (userprefs.cfg) could not be written";
        }
        // FV3's own copy, which the heal restores from after a reinstall
        if (!saveOrderSnapshot('docker', $out)) fv3_error_log('fv3_create_docker_order', 'the order snapshot could not be written');
        return null;
    }

    // After an import: the new Docker folders ($first, placeholders in the file's order) go on top of Unraid's saved order, insert-only,
    // so the page draws them and lets them claim containers top-first; with no saved order one is created. Returns why it stopped, or null
    function fv3_place_imported_docker_folders(array $first): ?string {
        global $configDir, $fv3DockerManDir;
        $file = "$fv3DockerManDir/userprefs.cfg";
        $read = fn() => is_file($file) ? @file_get_contents($file) : '';
        for ($try = 0; $try < 3; $try++) {
            $raw = $read();
            $current = $raw === false ? null : fv3_parse_user_prefs($raw);
            if ($current === null) return "Unraid's saved Docker order (userprefs.cfg) could not be read";
            if (!$current) return fv3_create_docker_order($first);
            $folders = fv3_read_json_strict("$configDir/docker.json");
            if ($folders === null) return 'the folder config could not be read';
            $new = array_values(array_unique(array_filter($first, fn($e) => is_string($e) && str_starts_with($e, 'folder-')
                && array_key_exists(substr($e, 7), $folders) && !in_array($e, $current, true))));
            if (!$new) return null;
            $out = array_merge($new, $current);
            // Stock UserPrefs writes take no lock: an order Unraid saved meanwhile is read again
            if ($read() !== $raw) continue;
            if (!fv3_write_user_prefs($file, $out)) return "Unraid's saved Docker order (userprefs.cfg) could not be written";
            if (!saveOrderSnapshot('docker', $out)) fv3_error_log('fv3_place_imported_docker_folders', 'the order snapshot could not be written');
            return null;
        }
        return "Unraid's saved Docker order (userprefs.cfg) kept changing during the import";
    }

    function readUnraidOrder(string $type): array {
        fv3_debug_log("readUnraidOrder called for type: $type");
        $user_prefs_path = "/boot/config/plugins";
        $order = [];
        if ($type == "docker") {
            $dockerClient = new DockerClient();
            // A userprefs.cfg that will not parse lists A-Z, as one that is absent does
            $order = fv3_live_order(array_column($dockerClient->getDockerContainers() ?: [], 'Name'), fv3_docker_prefs() ?? []);

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
