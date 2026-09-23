<?php
    // FolderView Plus backups -> folder.view3 folders. Everything above importForeignBundle() is pure;
    // .github/scripts/foreign_import_test.php drives both halves from the PHP CLI.

    const FV3_FOREIGN_SCHEMA_VERSION = 1;
    const FV3_FOREIGN_MAX_BYTES = 5242880;
    const FV3_FOREIGN_MAX_FOLDERS = 1000;
    const FV3_FOREIGN_MAX_MEMBERS = 5000;
    const FV3_FOREIGN_MAX_ACTIONS = 50;

    // folder.view3 setting => rule; mirrors the editor form in folder.js submitForm / Folder.page
    function fv3_foreign_setting_rules(): array {
        $bool = ['bool'];
        $color = ['color'];
        return [
            'folder_webui' => $bool, 'folder_webui_url' => ['url'],
            'preview' => ['int', 0, 4], 'preview_hover' => $bool, 'preview_update' => $bool,
            'preview_update_folder' => $bool, 'preview_text_width' => ['width'], 'preview_grayscale' => $bool,
            'preview_status' => ['enum', ['none', 'symbol', 'grayscale']], 'preview_webui' => $bool,
            'preview_logs' => $bool, 'preview_console' => $bool, 'preview_vertical_bars' => $bool,
            'preview_overflow' => ['overflow'], 'preview_row_separator' => $bool,
            'preview_row_separator_color' => $color, 'context' => ['int', 0, 3], 'context_trigger' => ['int', 0, 1],
            'context_graph' => ['int', 0, 4], 'context_graph_time' => ['int', 5, 600], 'preview_border' => $bool,
            'preview_border_color' => $color, 'preview_vertical_bars_color' => $color, 'lock_colors' => $bool,
            'update_column' => $bool, 'use_global_defaults' => $bool, 'default_action' => $bool,
            'expand_tab' => $bool, 'override_default_actions' => $bool, 'expand_dashboard' => $bool,
        ];
    }

    // Returns [value, ok]; a value that fails its rule is dropped, never coerced into range
    function fv3_foreign_setting_value(array $rule, $value): array {
        switch ($rule[0]) {
            case 'bool':
                if (is_bool($value)) return [$value, true];
                if ($value === 0 || $value === 1) return [(bool)$value, true];
                return [null, false];
            case 'int':
                if (is_int($value) || (is_string($value) && preg_match('/^\d{1,4}$/D', $value))) {
                    $n = (int)$value;
                    return ($n >= $rule[1] && $n <= $rule[2]) ? [$n, true] : [null, false];
                }
                return [null, false];
            case 'enum':
                return (is_string($value) && in_array($value, $rule[1], true)) ? [$value, true] : [null, false];
            case 'overflow':
                $map = ['default' => 0, 'expand_row' => 1, 'scroll' => 2];
                if (is_string($value) && isset($map[$value])) return [$map[$value], true];
                return (is_int($value) && $value >= 0 && $value <= 2) ? [$value, true] : [null, false];
            case 'color':
                return (is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/D', $value)) ? [$value, true] : [null, false];
            case 'width':
                if ($value === '') return ['', true];
                return (is_string($value) && preg_match('/^\d{1,4}(px|%|em|rem|ch)?$/D', $value)) ? [$value, true] : [null, false];
            case 'url':
                if (!is_string($value) || strlen($value) > 2048) return [null, false];
                $safe = fv3_safe_http_url($value);
                return ($safe !== '' || trim($value) === '') ? [$safe, true] : [null, false];
        }
        return [null, false];
    }

    function fv3_foreign_clean_string($value, int $max): ?string {
        if (!is_string($value) || strlen($value) > $max || preg_match('/[\x00-\x1F\x7F]/', $value)) return null;
        return $value;
    }

    function fv3_foreign_icon($value): string {
        if (!is_string($value) || strlen($value) > 8192) return '';
        $value = trim($value);
        if (preg_match('#^/(?!/)[^\s"\'<>]*$#D', $value)) return $value;
        if (preg_match('#^https?://[^\s"\'<>]+$#Di', $value)) return $value;
        if (preg_match('#^data:image/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$#D', $value)) return $value;
        return '';
    }

    // An allowlist, not a blocklist: every token must mean the same in PCRE and in the flag-less
    // JS new RegExp() the renderers use. Anything unlisted is refused, so no new construct slips in.
    function fv3_foreign_regex_js_safe(string $regex): bool {
        // Valid UTF-8, nothing above U+FFFF: JS splits those into two code units, PCRE's /u does not
        if (@preg_match('//u', $regex) !== 1 || preg_match('/[\x{10000}-\x{10FFFF}]/u', $regex)) return false;
        $n = strlen($regex);
        $groups = [];           // one entry per open group: true for a lookaround, which JS will not quantify
        $quantifiable = false;  // whether the previous token can take a quantifier
        for ($i = 0; $i < $n; $i++) {
            $c = $regex[$i];
            if ($c === '\\') {
                if (!preg_match('/\G\\\\(?:[dDwWsSbBtnrf.*+?()\[\]{}|^$\\\\-]|x[0-9A-Fa-f]{2})/', $regex, $m, 0, $i)) return false;
                $i += strlen($m[0]) - 1;
                $quantifiable = true;
            } elseif ($c === '[') {
                // A bare [ inside a class is refused: PCRE reads [[:digit:]] as a POSIX class, JS as literals
                // \S is refused inside a class: fv3_foreign_regex_as_js() cannot negate within one
                if (!preg_match('/\G\[\^?(?:\\\\(?:[dDwWstnrf\\\\\]\[\^.-]|x[0-9A-Fa-f]{2})|[^\\\\\]\[])+\]/', $regex, $m, 0, $i)) return false;
                if (!fv3_foreign_class_ranges_ok(substr($m[0], 1, -1))) return false;
                $i += strlen($m[0]) - 1;
                $quantifiable = true;
            } elseif ($c === '(') {
                preg_match('/\G\((?:\?(?:[:=!]|<[=!]))?/', $regex, $m, 0, $i);
                // A "(?" the shared openers did not consume is a named group, flag, verb or subroutine
                if ($m[0] === '(' && ($regex[$i + 1] ?? '') === '?') return false;
                $groups[] = in_array($m[0], ['(?=', '(?!', '(?<=', '(?<!'], true);
                $i += strlen($m[0]) - 1;
                $quantifiable = false;
            } elseif ($c === ')') {
                if (!$groups) return false;
                $quantifiable = !array_pop($groups);
            } elseif ($c === '*' || $c === '+' || $c === '?' || $c === '{') {
                if (!$quantifiable) return false;
                if ($c === '{') {
                    if (!preg_match('/\G\{\d{1,4}(?:,\d{0,4})?\}/', $regex, $m, 0, $i)) return false;
                    $i += strlen($m[0]) - 1;
                }
                // lazy ? is shared; a possessive + or a second quantifier is not
                if (($regex[$i + 1] ?? '') === '?') $i++;
                if (in_array($regex[$i + 1] ?? '', ['+', '*', '?', '{'], true)) return false;
                $quantifiable = false;
            } elseif ($c === '|') {
                $quantifiable = false;
            } elseif ($c === '^' || $c === '$') {
                $quantifiable = false;
            } else {
                $quantifiable = true;  // . and any literal character
            }
        }
        return !$groups;
    }

    // A range with a class escape at either end, like [\s-z], is literal in JS but a compile error in PCRE
    function fv3_foreign_class_ranges_ok(string $body): bool {
        if (($body[0] ?? '') === '^') $body = substr($body, 1);
        preg_match_all('/\\\\(?:x[0-9A-Fa-f]{2}|.)|./s', $body, $t);
        $t = $t[0];
        foreach ($t as $k => $tok) {
            if ($tok !== '-' || $k === 0 || $k === count($t) - 1) continue;
            if (preg_match('/^\\\\[dDwWsS]$/', $t[$k - 1]) || preg_match('/^\\\\[dDwWsS]$/', $t[$k + 1])) return false;
        }
        return true;
    }

    // JS's \s set. PCRE's \s without Unicode classes stops at ASCII; \x0B, since PCRE's \v is a whole class
    const FV3_FOREIGN_JS_SPACE = '\t\n\x0B\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    // An allowlisted pattern rewritten so PCRE's (*UTF) mode reads . \s \S as flag-less JS does; null otherwise
    function fv3_foreign_regex_as_js(string $regex): ?string {
        if (!fv3_foreign_regex_js_safe($regex)) return null;
        $out = '';
        $inClass = false;
        for ($i = 0, $n = strlen($regex); $i < $n; $i++) {
            $c = $regex[$i];
            if ($c === '\\') {
                $next = $regex[$i + 1];
                if ($next === 's') { $out .= $inClass ? FV3_FOREIGN_JS_SPACE : '[' . FV3_FOREIGN_JS_SPACE . ']'; $i++; continue; }
                if ($next === 'S') { $out .= '[^' . FV3_FOREIGN_JS_SPACE . ']'; $i++; continue; }
                $len = $next === 'x' ? 4 : 2;
                $out .= substr($regex, $i, $len);
                $i += $len - 1;
            } elseif (!$inClass && $c === '[') {
                $inClass = true;
                $out .= $c;
            } elseif ($inClass && $c === ']') {
                $inClass = false;
                $out .= $c;
            } elseif (!$inClass && $c === '.') {
                $out .= '[^\n\r\x{2028}\x{2029}]';  // JS . stops at \r and the line separators too
            } else {
                $out .= $c;
            }
        }
        return $out;
    }

    // $capped: distinct usable names past the member cap; $invalid: entries that are not a usable name at all
    function fv3_foreign_members($value, ?int &$capped = null, ?int &$invalid = null): array {
        $capped = 0;
        $invalid = 0;
        if (!is_array($value)) { $invalid = $value === null ? 0 : 1; return []; }
        $out = [];
        $over = [];
        foreach ($value as $name) {
            $name = fv3_foreign_clean_string($name, 255);
            if ($name === null || $name === '') { $invalid++; continue; }
            if (in_array($name, $out, true) || isset($over[$name])) continue;
            if (count($out) < FV3_FOREIGN_MAX_MEMBERS) { $out[] = $name; } else { $over[$name] = true; $capped++; }
        }
        return $out;
    }

    // Keeps an action only if folder.view3 can run it as-is against this folder's own members
    function fv3_foreign_action($act, array $members): ?array {
        $clean = fv3_foreign_action_fields($act, $members);
        // folder.js loads saved actions through btoa(), which throws above U+00FF and locks the folder editor
        if ($clean === null) return null;
        $encoded = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return ($encoded !== false && !preg_match('/[^\x{00}-\x{FF}]/u', $encoded)) ? $clean : null;
    }

    function fv3_foreign_action_fields($act, array $members): ?array {
        if (!is_array($act)) return null;
        $name = fv3_foreign_clean_string($act['name'] ?? null, 100);
        $icon = $act['script_icon'] ?? '';
        if ($name === null || !is_string($icon) || !preg_match('/^[A-Za-z0-9 _-]{0,64}$/D', $icon)) return null;
        $type = $act['type'] ?? null;
        if ($type === 0) {
            $targets = $act['conatiners'] ?? null;
            $action = $act['action'] ?? null;
            $modes = $act['modes'] ?? null;
            if (!is_array($targets) || !is_int($action) || $action < 0 || $action > 2) return null;
            if ($action !== 2 && (!is_int($modes) || $modes < 0 || $modes > ($action === 0 ? 1 : 3))) return null;
            $targets = fv3_foreign_members($targets, $capped, $bad);
            if ($bad || $capped || !$targets || array_diff($targets, $members)) return null;
            return ['name' => $name, 'type' => 0, 'script_icon' => $icon, 'conatiners' => $targets, 'action' => $action, 'modes' => is_int($modes) ? $modes : 0];
        }
        if ($type === 1) {
            // The script name is spliced into a user.scripts path unencoded; args are encoded by
            // shared.js fv3RunUserScript, and stay restricted here because the source is untrusted
            $script = $act['script'] ?? null;
            $args = $act['script_args'] ?? '';
            if (!is_string($script) || !preg_match('/^[A-Za-z0-9 ._()-]{1,128}$/D', $script) || trim($script, '. ') === '') return null;
            if (!is_string($args) || strlen($args) > 256 || preg_match('/[\x00-\x1F\x7F&#%?]/', $args)) return null;
            $sync = $act['script_sync'] ?? false;
            if (!is_bool($sync)) return null;
            return ['name' => $name, 'type' => 1, 'script_icon' => $icon, 'script' => $script, 'script_args' => $args, 'script_sync' => $sync];
        }
        return null;
    }

    // Returns ['error' => code] (langs key foreign-error-<code>) or ['types' => [type => [foreignId => folder]], 'source' => string, 'skipped' => [...]]
    function fv3_foreign_detect(array $raw): array {
        $version = static function ($v): ?string {
            if (!is_int($v)) return 'no-version';
            if ($v > FV3_FOREIGN_SCHEMA_VERSION) return 'newer-version';
            if ($v < 1) return 'no-version';
            return null;
        };
        $fromTypes = static function (array $raw, string $source) {
            $types = [];
            foreach (['docker', 'vm'] as $t) {
                $folders = $raw['types'][$t]['folders'] ?? null;
                if (is_array($folders)) $types[$t] = $folders;
            }
            if (!$types) return ['error' => 'no-folders'];
            $skipped = ['prefs'];
            if (isset($raw['themeWorkspace'])) $skipped[] = 'themes';
            return ['types' => $types, 'source' => $source, 'skipped' => $skipped];
        };

        if (array_key_exists('kind', $raw)) {
            if ($raw['kind'] !== 'environment_snapshot') return ['error' => 'unsupported'];
            if ($err = $version($raw['schemaVersion'] ?? null)) return ['error' => $err];
            return $fromTypes($raw, 'environment');
        }
        if (array_key_exists('rollbackSchemaVersion', $raw)) {
            if ($err = $version($raw['rollbackSchemaVersion'])) return ['error' => $err];
            return $fromTypes($raw, 'rollback');
        }
        if (!array_key_exists('schemaVersion', $raw)) return ['error' => 'not-foreign'];
        if ($err = $version($raw['schemaVersion'])) return ['error' => $err];
        $type = $raw['type'] ?? null;
        if (!in_array($type, ['docker', 'vm'], true)) return ['error' => 'no-type'];
        $mode = $raw['mode'] ?? null;
        if ($mode === 'full' && is_array($raw['folders'] ?? null)) {
            $skipped = isset($raw['prefs']) ? ['prefs'] : [];
            return ['types' => [$type => $raw['folders']], 'source' => isset($raw['reason']) ? 'backup' : 'export', 'skipped' => $skipped];
        }
        if ($mode === 'single' && is_array($raw['folder'] ?? null)) {
            return ['types' => [$type => ['single' => $raw['folder']]], 'source' => 'single', 'skipped' => []];
        }
        return ['error' => 'unsupported'];
    }

    // A root and its merged descendants' members, hidden entries and identities, plus what the preview counts
    function fv3_foreign_collect_group(array $folders, string $rootId, array $childIds): array {
        $members = [];
        $hidden = [];
        $identities = [];
        $childActions = 0;
        $droppedMembers = 0;
        $invalid = 0;
        foreach (array_merge([$rootId], $childIds) as $gid) {
            $g = $folders[$gid];
            $members = array_merge($members, fv3_foreign_members($g['containers'] ?? null, $capped, $bad));
            $droppedMembers += $capped;
            $invalid += $bad;
            $hidden = array_merge($hidden, fv3_foreign_members($g['hiddenPreviewMembers'] ?? ($g['hidden_preview'] ?? null), $capped, $bad));
            $invalid += $bad;
            $ids = is_array($g['memberIdentities'] ?? null) ? $g['memberIdentities'] : [];
            $invalid += count($ids) - count(array_filter($ids, 'is_array'));
            $identities += array_filter($ids, 'is_array');
            if ($gid !== $rootId && is_array($g['actions'] ?? null)) $childActions += count($g['actions']);
        }
        $unique = array_values(array_unique($members));
        $kept = array_slice($unique, 0, FV3_FOREIGN_MAX_MEMBERS);
        return ['members' => $kept, 'hidden' => $hidden, 'identities' => $identities, 'child_actions' => $childActions,
                'dropped_members' => $droppedMembers + count($unique) - count($kept), 'invalid' => $invalid];
    }

    // Each folder's top-level ancestor; a missing parent or a loop makes the folder its own root
    function fv3_foreign_roots(array $folders, array &$broken): array {
        $roots = [];
        foreach ($folders as $id => $f) {
            $seen = [];
            $cur = (string)$id;
            while (true) {
                $seen[$cur] = true;
                $parent = $folders[$cur]['parentId'] ?? null;
                if ($parent !== null && !is_scalar($parent)) { $broken[$cur] = true; break; }
                $parent = (string)$parent;
                if ($parent === '') break;
                if (isset($seen[$parent])) { $broken[(string)$id] = true; $cur = (string)$id; break; }
                if (!is_array($folders[$parent] ?? null)) { $broken[$cur] = true; break; }
                $cur = $parent;
            }
            $roots[(string)$id] = $cur;
        }
        return $roots;
    }

    // $existing: [type => folder map already on disk], used only for name clashes and member ownership
    function fv3_convert_foreign_bundle(array $raw, ?string $onlyType, array $existing = [], array $alsoOwned = []): array {
        $detected = fv3_foreign_detect($raw);
        if (isset($detected['error'])) return $detected;
        $types = $detected['types'];
        $report = ['source' => $detected['source'], 'skipped_sections' => $detected['skipped'], 'types' => []];
        if ($onlyType !== null) {
            if (!isset($types[$onlyType])) return ['error' => $onlyType === 'vm' ? 'no-vm-folders' : 'no-docker-folders'];
            $other = $onlyType === 'docker' ? 'vm' : 'docker';
            if (isset($types[$other]) && count($types[$other])) $report['skipped_sections'][] = $other;
            $types = [$onlyType => $types[$onlyType]];
        }

        $out = [];
        $rules = fv3_foreign_setting_rules();
        foreach ($types as $type => $folders) {
            $entries = count($folders);
            $folders = array_filter($folders, 'is_array');
            if (count($folders) > FV3_FOREIGN_MAX_FOLDERS) return ['error' => 'too-many-folders'];
            $r = ['folders' => [], 'merged_children' => 0, 'broken_parents' => 0, 'dropped_settings' => 0, 'dropped_keys' => 0,
                  'dropped_actions' => 0, 'child_actions' => 0, 'dropped_icons' => 0, 'dropped_regex' => 0, 'renamed' => 0, 'members_kept_elsewhere' => 0, 'dropped_members' => 0,
                  'dropped_invalid' => $entries - count($folders)];
            $broken = [];
            $roots = fv3_foreign_roots($folders, $broken);
            $r['broken_parents'] = count($broken);  // keyed by folder id: a shared bad ancestor counts once

            $childrenOf = [];
            // PHP turns numeric-string keys into ints, so every id comparison below is on strings
            foreach ($roots as $id => $root) {
                if ((string)$id !== $root) { $childrenOf[$root][] = (string)$id; $r['merged_children']++; }
            }

            $known = ['name', 'icon', 'regex', 'containers', 'settings', 'actions', 'parentId', 'hiddenPreviewMembers', 'hidden_preview', 'memberIdentities'];
            $taken = [];
            foreach ($existing[$type] ?? [] as $f) {
                if (is_array($f) && is_string($f['name'] ?? null)) $taken[strtolower($f['name'])] = true;
            }
            // Explicit members plus anything held by a label or regex: an explicit import entry
            // outranks both in fv3_compute_folder_membership(), so it would take the container
            $owned = [];
            foreach ($existing[$type] ?? [] as $f) {
                foreach ((is_array($f['containers'] ?? null) ? $f['containers'] : []) as $ct) {
                    if (is_string($ct) || is_int($ct)) $owned[(string)$ct] = true;
                }
            }
            // An all-digit name comes back as an int wherever PHP used it as an array key
            foreach ($alsoOwned[$type] ?? [] as $ct) {
                if (is_string($ct) || is_int($ct)) $owned[(string)$ct] = true;
            }

            $converted = [];
            foreach ($roots as $id => $root) {
                $id = (string)$id;
                if ($id !== $root) continue;
                $src = $folders[$id];
                $r['dropped_keys'] += count(array_diff(array_keys($src), $known));
                // A merged child's members, hidden entries and identities move up; its regex and unknown fields go
                foreach ($childrenOf[$id] ?? [] as $cid) {
                    $child = $folders[$cid];
                    $r['dropped_keys'] += count(array_diff(array_keys($child), $known));
                    if (($child['regex'] ?? null) !== null && ($child['regex'] ?? '') !== '') $r['dropped_regex']++;
                }

                $group = fv3_foreign_collect_group($folders, $id, $childrenOf[$id] ?? []);
                [$members, $hidden, $identities] = [$group['members'], $group['hidden'], $group['identities']];
                $r['child_actions'] += $group['child_actions'];
                $r['dropped_members'] += $group['dropped_members'];
                $r['dropped_invalid'] += $group['invalid'];
                $before = count($members);
                $members = array_values(array_filter($members, static fn($m) => !isset($owned[$m])));
                $r['members_kept_elsewhere'] += $before - count($members);
                foreach ($members as $m) { $owned[$m] = true; }

                $name = fv3_foreign_clean_string(is_string($src['name'] ?? null) ? trim($src['name']) : null, 160);
                $unnamed = $name === null || $name === '' || strtolower($name) === 'root';
                if ($unnamed) $name = 'Imported folder';
                $candidate = $name;
                for ($n = 1; isset($taken[strtolower($candidate)]); $n++) {
                    $candidate = $n === 1 ? "$name (imported)" : "$name (imported $n)";
                }
                if ($candidate !== $name || $unnamed) $r['renamed']++;
                $taken[strtolower($candidate)] = true;

                $suppliedIcon = $src['icon'] ?? null;
                $icon = fv3_foreign_icon($suppliedIcon ?? '');
                if ($icon === '' && $suppliedIcon !== null && !(is_string($suppliedIcon) && trim($suppliedIcon) === '')) $r['dropped_icons']++;

                $suppliedRegex = $src['regex'] ?? null;
                $regex = is_string($src['regex'] ?? null) && strlen($src['regex']) <= 1024 ? $src['regex'] : '';
                // A regex present but refused on type or length is left out as much as one that will not compile
                if ($regex === '' && $suppliedRegex !== null && $suppliedRegex !== '') $r['dropped_regex']++;
                // Same pattern build as syncContainerOrder in lib.php; a regex it can't compile would match nothing
                if ($regex !== '' && @preg_match('/' . str_replace('/', '\/', $regex) . '/', '') === false) { $regex = ''; $r['dropped_regex']++; }
                // The renderers hand the stored pattern to JS new RegExp(), so one PHP alone accepts
                // would place members the page then cannot show — see fv3_foreign_regex_js_safe()
                if ($regex !== '' && !fv3_foreign_regex_js_safe($regex)) { $regex = ''; $r['dropped_regex']++; }

                $settings = [];
                if (($src['settings'] ?? null) !== null && !is_array($src['settings'])) $r['dropped_settings']++;
                foreach ((is_array($src['settings'] ?? null) ? $src['settings'] : []) as $k => $v) {
                    if (!isset($rules[$k])) { $r['dropped_settings']++; continue; }
                    [$value, $ok] = fv3_foreign_setting_value($rules[$k], $v);
                    if ($ok) { $settings[$k] = $value; } else { $r['dropped_settings']++; }
                }

                $actions = [];
                $srcActions = is_array($src['actions'] ?? null) ? $src['actions'] : [];
                $r['dropped_actions'] += max(0, count($srcActions) - FV3_FOREIGN_MAX_ACTIONS);
                foreach (array_slice($srcActions, 0, FV3_FOREIGN_MAX_ACTIONS) as $act) {
                    $clean = fv3_foreign_action($act, $members);
                    if ($clean === null) { $r['dropped_actions']++; } else { $actions[] = $clean; }
                }

                $folder = [
                    'name' => $candidate, 'icon' => $icon, 'regex' => $regex, 'containers' => $members,
                    'hidden_preview' => array_values(array_intersect(array_unique($hidden), $members)),
                    'actions' => $actions, 'settings' => (object)$settings,
                ];
                $idKey = $type === 'docker' ? 'containerImages' : 'containerIds';
                $idMap = [];
                foreach ($members as $m) {
                    $ident = $identities[$m] ?? null;
                    $value = $type === 'docker' ? ($ident['image'] ?? null) : ($ident['uuid'] ?? null);
                    $value = fv3_foreign_clean_string($value, 512);
                    if ($value !== null && $value !== '') { $idMap[$m] = $value; } elseif ($ident !== null) { $r['dropped_invalid']++; }
                }
                $folder[$idKey] = (object)$idMap;
                $converted[] = $folder;
                $r['folders'][] = ['name' => $candidate, 'members' => count($members), 'actions' => count($actions)];
            }
            $out[$type] = $converted;
            $report['types'][$type] = $r;
        }
        return ['folders' => $out, 'report' => $report];
    }


    // Preview ($apply false) or merge the converted folders into docker.json / vm.json in one swap
    function importForeignBundle(string $json, ?string $type, bool $apply): array {
        global $configDir;
        if (strlen($json) > FV3_FOREIGN_MAX_BYTES) return ['error' => 'too-large'];
        $raw = json_decode($json, true);
        if (!is_array($raw) || array_is_list($raw)) return ['error' => 'unsupported'];
        // One read per type feeds both halves: the assoc copy converts, the object copy is merged
        // into and written back, so conversion and the swap can never see different maps
        $existing = [];
        $maps = [];
        $unreadable = [];
        foreach (['docker', 'vm'] as $t) {
            $path = "$configDir/$t.json";
            $rawMap = file_exists($path) ? @file_get_contents($path) : '';
            if ($rawMap === false) { $unreadable[$t] = true; $existing[$t] = []; continue; }
            if (trim((string)$rawMap) === '') { $existing[$t] = []; $maps[$t] = new stdClass(); continue; }
            $existing[$t] = json_decode((string)$rawMap, true);
            $maps[$t] = json_decode((string)$rawMap);
            // deleteFolder() json_encodes the map, so removing the last folder leaves [] — the empty map, as settings reads it
            if ($maps[$t] === []) $maps[$t] = new stdClass();
            if (!is_array($existing[$t]) || !$maps[$t] instanceof stdClass) { $unreadable[$t] = true; $existing[$t] = []; }
        }
        // Read Docker before converting, but only refuse if the bundle turns out to hold Docker
        // folders — a VM-only import must not depend on the Docker service being up
        $alsoOwned = [];
        $membershipUnavailable = false;
        $vmMembershipUnavailable = false;
        if ($type !== 'vm') {
            $effective = fv3_effective_docker_members($existing['docker'] ?? []);
            if ($effective === null) $membershipUnavailable = true;
            else $alsoOwned['docker'] = $effective;
        }
        if ($type !== 'docker') {
            $effective = fv3_effective_vm_members($existing['vm'] ?? []);
            if ($effective === null) $vmMembershipUnavailable = true;
            else $alsoOwned['vm'] = $effective;
        }
        $converted = fv3_convert_foreign_bundle($raw, $type, $existing, $alsoOwned);
        if (isset($converted['error'])) return $converted;
        // Corrupt config fails closed, as in updateFolder: merging onto empty would wipe it. Only the types this
        // import writes must be readable, so a damaged vm.json does not block a Docker-only import.
        foreach ($unreadable as $t => $_) {
            if (!empty($converted['folders'][$t])) return ['error' => 'config-unreadable'];
        }
        if ($membershipUnavailable && !empty($converted['folders']['docker'])) return ['error' => 'membership-unavailable'];
        if ($vmMembershipUnavailable && !empty($converted['folders']['vm'])) return ['error' => 'vm-membership-unavailable'];
        if (!array_filter($converted['folders'])) return ['error' => 'no-folders'];
        if (!$apply) return ['report' => $converted['report']];
        if (!is_dir($configDir)) @mkdir($configDir, 0770, true);
        if (realpath($configDir) !== $configDir) return ['error' => 'config-unreadable'];
        $files = [];
        foreach ($converted['folders'] as $t => $folders) {
            if (!$folders) continue;
            // The object copy from the single read above: the assoc one would turn an existing
            // folder's empty {} settings/containerImages into []
            $map = $maps[$t];
            foreach ($folders as $folder) {
                do { $id = generateId(); } while (property_exists($map, $id));
                $map->$id = $folder;
            }
            // No fv3_dedupe_explicit_members here: the converter already skips claimed members, and a
            // whole-map pass would strip members from existing folders that happen to share one
            $encoded = json_encode($map);
            if ($encoded === false) return ['error' => 'write-failed'];
            $files["$t.json"] = $encoded;
        }
        $result = fv3_replace_files($configDir, $files, []);
        if (isset($result['error'])) {
            fv3_error_log('importForeignBundle', $result['error']);
            // A rollback that could not undo everything leaves copies behind, so it must not be
            // reported as "nothing was imported"; the log line names the files
            if (!empty($result['partial'])) return ['error' => 'write-partial'];
            return ['error' => 'write-failed'];
        }
        return ['success' => true, 'report' => $converted['report']];
    }

    // VM names from libvirt. null = unreadable, which readInfo() cannot signal: it returns [] for both
    function fv3_read_vm_names(): ?array {
        if (!fv3_require_libvirt_helpers()) return null;
        try {
            global $lv;
            if (!isset($lv)) { $lv = new Libvirt(); if (!$lv->connect()) return null; }
            $vms = $lv->get_domains();
            // get_domains() returns false for an empty list as well as a failure; the counts call does not
            if ($vms === false) {
                $counts = $lv->get_domain_count();
                return (is_array($counts) && ($counts['total'] ?? null) === 0) ? [] : null;
            }
        } catch (\Throwable $e) {
            return null;
        }
        return is_array($vms) ? array_values(array_filter($vms, 'is_string')) : null;
    }

    // VMs an existing folder holds through its regex. vm.js lets an explicit entry in any folder beat a
    // regex match, so an imported explicit member would take one. null = libvirt could not be read.
    function fv3_effective_vm_members(array $folders): ?array {
        $regexFolders = array_filter($folders, static fn($f) => is_array($f) && is_string($f['regex'] ?? null) && trim($f['regex']) !== '');
        if (!$regexFolders) return [];
        $names = fv3_read_vm_names();
        if ($names === null) return null;
        $explicit = [];
        foreach ($folders as $f) {
            foreach ((is_array($f['containers'] ?? null) ? $f['containers'] : []) as $c) { if (is_string($c)) $explicit[$c] = true; }
        }
        // JS counts a character past U+FFFF as two code units; two private-use stand-ins do the same here
        $subjects = [];
        foreach ($names as $vm) $subjects[$vm] = preg_replace('/[\x{10000}-\x{10FFFF}]/u', "\u{E000}\u{E000}", $vm) ?? $vm;
        $held = [];
        foreach ($regexFolders as $f) {
            // (*UTF) matches per character with ASCII-only \w \b \d, as the page does; /D keeps $ at the very end.
            // A pattern outside the allowlist cannot be rewritten exactly, so it is read as written.
            $re = '/(*UTF)' . str_replace('/', '\/', fv3_foreign_regex_as_js($f['regex']) ?? $f['regex']) . '/D';
            foreach ($subjects as $vm => $subject) {
                if (!isset($explicit[$vm]) && @preg_match($re, $subject) === 1) $held[$vm] = true;
            }
        }
        return array_map('strval', array_keys($held));  // PHP makes an all-digit key an int
    }

    // Containers an existing folder already holds through a label or regex — explicit containers[]
    // alone does not show those. null means Docker could not be read, so the caller must refuse.
    function fv3_effective_docker_members(array $folders): ?array {
        if (!$folders) return [];
        $client = new DockerClient();
        $names = fv3_read_container_names($client);
        if (!$names['complete']) {
            // fv3_read_container_names() reads zero containers as incomplete; the raw list tells none from a failure
            $raw = $client->getDockerJSON('/containers/json?all=1');
            return (is_array($raw) && !$raw) ? [] : null;
        }
        $labels = fv3_read_container_labels($client, $names['names']);
        if ($labels === null) return null;
        return fv3_compute_folder_membership($folders, $names['names'], $labels)['assigned'];
    }
?>
