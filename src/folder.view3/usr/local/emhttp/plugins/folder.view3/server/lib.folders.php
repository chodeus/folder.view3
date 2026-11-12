<?php
    // The folder files (docker.json, vm.json): how they are read and normalized, and every write, each under fv3_config_lock()

    function readFolder(string $type) : string {
        global $configDir;
        if(!file_exists("$configDir/$type.json")) { createFile($type); }
        $raw = @file_get_contents("$configDir/$type.json");
        if ($raw === false) {
            // Fail the request: a 200 '{}' would be cached client-side over the last good copy
            fv3_error_log('readFolder', "$type.json is unreadable");
            http_response_code(500);
            return json_encode(['error' => "$type.json is unreadable"]);
        }
        // Unparseable stays byte-identical so the client's cached-copy fallback still fires
        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) { return $raw; }
        // Valid JSON that isn't a folder map fails like an unreadable file
        if (!is_array($decoded)) {
            fv3_error_log('readFolder', "$type.json does not contain a folder map");
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
        // Only create.php omits the id; importAll() re-keys its own bad ids, so a malformed one here is a bad
        // request, never a new folder
        if ($id === null) {
            $id = generateId();
        } elseif (!fv3_is_folder_id($id)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Folder id may only contain letters, digits, _ and -']);
            exit;
        }
        fv3_write_folders($type, 'updateFolder', function (array $fileData) use ($decoded, $id): array {
            $fileData[$id] = $decoded;
            return fv3_dedupe_explicit_members($fileData, $id);
        });
    }

    // The locked read-modify-write of docker.json / vm.json (imports and createFile() take the same lock themselves): $apply
    // gets the folders as they are on disk, [] with no file, and returns them changed or null for no write. A failure is a 500
    function fv3_write_folders(string $type, string $caller, callable $apply, string $refusal = 'refusing to save so existing folders are not wiped'): void {
        global $configDir;
        $lock = fv3_config_lock("$type.json");
        $abort = function (string $logged, string $error) use ($caller, $lock): void {
            if ($lock) fv3_config_unlock($lock);
            fv3_error_log($caller, $logged);
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => $error]);
            exit;
        };
        // Corrupt config must fail closed: merging onto empty would wipe every other folder
        $fileData = fv3_read_json_strict("$configDir/$type.json");
        if ($fileData === null) $abort("$type.json is unreadable, $refusal", "$type.json is unreadable — $refusal");
        $changed = $apply($fileData);
        // Nothing is written without the lock; a request that changes nothing never fails for want of it
        if ($changed !== null && !$lock) $abort("could not lock $type.json", "Could not lock $type.json — nothing was saved");
        if ($changed !== null && !fv3_atomic_write("$configDir/$type.json", json_encode($changed))) {
            $abort("could not write $type.json", "Could not write $type.json — nothing was saved");
        }
        if ($lock) fv3_config_unlock($lock);
    }

    // True for a value the settings page can send as the default of folder setting $key. Colours, the text width and the
    // graph time are saved there under looser rules than the editor's (fv3_sanitize_setting), so they are judged by those
    function fv3_default_value_ok(string $key, $value): bool {
        $rule = fv3_foreign_setting_rules()[$key] ?? null;
        if ($rule === null) return false;
        // unset: the page sends '' for an empty field, and null where the form held no number
        if ($value === null || $value === '') return true;
        if ($rule[0] === 'color' || $rule[0] === 'width') return is_string($value) && strlen($value) <= 50 && !preg_match('/[<>"\'\\\\]/', $value);
        if ($key === 'context_graph_time') return is_int($value) && $value >= 0;
        [$clean, $ok] = fv3_foreign_setting_value($rule, $value);
        return $ok && $clean === $value;
    }

    // Apply defaults: $settings merged into the settings of every folder as it is on disk, so nothing a page loaded
    // earlier is written back. A folder that locks its colours keeps them
    function applyFolderDefaults(string $type, string $settings) : void {
        $patch = json_decode($settings, true);
        // One bad request must not stamp an unknown key or value on every folder
        if (!is_array($patch) || array_filter($patch, fn($value, $key) => !fv3_default_value_ok((string)$key, $value), ARRAY_FILTER_USE_BOTH)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'The defaults must be folder settings with values the settings page can send']);
            exit;
        }
        if (!$patch) { return; }
        $unlocked = array_diff_key($patch, array_flip(['preview_vertical_bars_color', 'preview_border_color', 'preview_row_separator_color']));
        fv3_write_folders($type, 'applyFolderDefaults', function (array $fileData) use ($patch, $unlocked): ?array {
            $changed = false;
            foreach ($fileData as $folderId => $folder) {
                if (!is_array($folder)) continue;
                $old = is_array($folder['settings'] ?? null) ? $folder['settings'] : [];
                // what the pages call locked: any value JavaScript reads as true
                $locked = !in_array($old['lock_colors'] ?? false, [false, null, 0, 0.0, ''], true);
                $new = array_replace($old, $locked ? $unlocked : $patch);
                if ($new === $old) continue;
                $fileData[$folderId]['settings'] = $new;
                $changed = true;
            }
            return $changed ? $fileData : null;
        });
    }

    // What a Docker, VMs or Dashboard page found at load, per folder: `renames` (old name => new) and `identity` (name => the
    // image or UUID to know it by), applied to the folder as it is on disk. Whole lists from a page's copy are not taken
    function updateFolderIds(string $type, string $data) : void {
        $updates = json_decode($data, true);
        // A JSON list is not a report: its positions would be read as folder ids. Told by the text: a map keyed "0" decodes the same
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($updates) || ($updates && ltrim($data)[0] === '[')) { http_response_code(400); exit; }
        if (!$updates) { return; }
        $identity = $type === 'vm' ? 'containerIds' : 'containerImages';
        fv3_write_folders($type, 'updateFolderIds', function (array $fileData) use ($updates, $identity): ?array {
            // Every name that is a member of some folder by now: a rename never takes one from where it was put
            $claimed = [];
            foreach ($fileData as $folder) {
                foreach (is_array($folder) && is_array($folder['containers'] ?? null) ? $folder['containers'] : [] as $member) {
                    if (is_scalar($member)) $claimed[(string)$member] = true;
                }
            }
            $changed = false;
            foreach ($updates as $folderId => $patch) {
                if (!fv3_is_folder_id($folderId)) continue;
                if (!is_array($fileData[$folderId] ?? null) || !is_array($patch)) continue;
                $folder = fv3_apply_member_changes($fileData[$folderId], $patch, $identity, $claimed);
                if ($folder === $fileData[$folderId]) continue;
                $fileData[$folderId] = $folder;
                $changed = true;
            }
            // As before this took renames: one container still listed in two folders stays in the first (issue #62)
            return $changed ? fv3_dedupe_explicit_members($fileData) : null;
        });
    }

    // $folder with a page's renames and identity entries applied to its members as they are now. Mirrors what
    // fv3ResolveRenamedContainers (customEvents.js) does to the page's own copy, its skip of a $claimed name included
    function fv3_apply_member_changes(array $folder, array $patch, string $identity, array &$claimed): array {
        $members = is_array($folder['containers'] ?? null) ? $folder['containers'] : [];
        $find = function ($name) use (&$members) {
            foreach ($members as $at => $member) { if (is_scalar($member) && (string)$member === (string)$name) return $at; }
            return null;
        };
        foreach (is_array($patch['renames'] ?? null) ? $patch['renames'] : [] as $old => $new) {
            $at = is_string($new) && $new !== '' ? $find($old) : null;
            // a new name that a save since the page loaded made a member somewhere is left there: the next load decides again
            if ($at === null || isset($claimed[$new])) continue;
            $claimed[$new] = true;
            $members[$at] = $new;
            $folder['containers'] = $members;
            if (is_array($folder[$identity] ?? null) && array_key_exists($old, $folder[$identity])) {
                $folder[$identity][$new] = $folder[$identity][$old];
                unset($folder[$identity][$old]);
            }
            $hidden = is_array($folder['hidden_preview'] ?? null) ? array_search((string)$old, $folder['hidden_preview'], true) : false;
            if ($hidden !== false) $folder['hidden_preview'][$hidden] = $new;
        }
        foreach (is_array($patch['identity'] ?? null) ? $patch['identity'] : [] as $name => $value) {
            if (!is_string($value) || $value === '' || $find($name) === null) continue;
            if (is_array($folder[$identity] ?? null) && array_key_exists($name, $folder[$identity])) continue;
            if (!is_array($folder[$identity] ?? null)) $folder[$identity] = [];
            $folder[$identity][$name] = $value;
        }
        return $folder;
    }

    function deleteFolder(string $type, string $id) : void {
        fv3_write_folders($type, 'deleteFolder', function (array $fileData) use ($id): ?array {
            // Already gone: delete stays idempotent, and there is nothing to rewrite
            if (!array_key_exists($id, $fileData)) { return null; }
            unset($fileData[$id]);
            return $fileData;
        }, 'refusing to delete so the folder config is not wiped');
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
        // Under the file's lock, and only if it is still missing: a save or an import since the caller's check is never replaced
        $lock = fv3_config_lock("$type.json");
        if (!$lock) return;
        clearstatcache(true, $path);
        if (!file_exists($path)) { fv3_atomic_write($path, '{}'); }
        fv3_config_unlock($lock);
    }
