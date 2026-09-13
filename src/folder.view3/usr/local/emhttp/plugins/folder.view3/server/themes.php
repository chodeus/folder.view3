<?php
    // Lists styles/ or answers 500: an unreadable folder must not look like "no themes"
    function fv3_scan_styles(string $stylesDir): array {
        $entries = @scandir($stylesDir);
        if ($entries === false) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'The styles folder could not be read.']);
            exit;
        }
        return $entries;
    }

    function listThemes() : array {
        global $configDir;
        $stylesDir = "$configDir/styles";
        if (!is_dir($stylesDir)) return [];
        $baseReal = (string)realpath($stylesDir);
        $themes = [];
        foreach (fv3_scan_styles($stylesDir) as $entry) {
            if ($entry === '.' || $entry === '..' || fv3_is_theme_scratch($entry)) continue;
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
            $source = null;
            // A linked entry stays listed so it can be deleted, but nothing is read through a link
            if (is_dir($path) && !is_link($path) && fv3_path_within($path, $baseReal)) {
                $srcFile = $path . '/.fv3-source';
                if (file_exists($srcFile) && !is_link($srcFile)) {
                    $raw = trim(file_get_contents($srcFile));
                    $parsed = json_decode($raw, true);
                    $source = is_array($parsed) ? $parsed : ['repo' => $raw];
                }
            }
            $themes[] = [
                'name' => $name,
                'entry' => $entry,
                'isDir' => is_dir($path),
                'enabled' => !$disabled,
                'source' => $source
            ];
        }
        return $themes;
    }

    // True when $path resolves inside $baseReal (itself a realpath); re-check right before a write or delete
    function fv3_path_within(string $path, string $baseReal): bool {
        $real = realpath($path);
        return $real !== false && $baseReal !== '' && strpos($real . '/', rtrim($baseReal, '/') . '/') === 0;
    }

    // mkdir -p that can't lead out of $baseReal: the nearest existing ancestor (a dangling link counts) must resolve inside it
    function fv3_mkdir_within(string $dir, string $baseReal): bool {
        $probe = $dir;
        while (!file_exists($probe) && !is_link($probe) && dirname($probe) !== $probe) { $probe = dirname($probe); }
        if (!fv3_path_within($probe, $baseReal)) return false;
        if (!is_dir($dir)) @mkdir($dir, 0770, true);
        return is_dir($dir) && fv3_path_within($dir, $baseReal);
    }

    // Empties $dir without following a link out of $baseReal.
    // False when anything could not be removed, so a partial clear is never reported as done.
    function fv3_clear_tree(string $dir, string $baseReal): bool {
        if (is_link($dir) || !is_dir($dir)) return false;
        $ok = true;
        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($items as $item) {
            $p = $item->getPathname();
            if (is_link($p)) { $ok = @unlink($p) && $ok; continue; }
            if (!fv3_path_within($p, $baseReal)) { $ok = false; continue; }
            $ok = ($item->isDir() ? @rmdir($p) : @unlink($p)) && $ok;
        }
        return $ok;
    }

    // fv3_clear_tree, then $dir itself
    function fv3_remove_tree(string $dir, string $baseReal): bool {
        return fv3_clear_tree($dir, $baseReal) && @rmdir($dir);
    }

    // importTheme's staging and replaced-theme folders: never listed or exported as themes
    function fv3_is_theme_scratch(string $entry): bool {
        return (bool)preg_match('/^\.fv3-(stage|old)-/', $entry);
    }

    function toggleTheme(string $entry, bool $enable, bool $exclusive) : void {
        global $configDir;
        $stylesDir = "$configDir/styles";
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $entry) || $entry === '.' || $entry === '..') { http_response_code(400); exit; }
        $path = "$stylesDir/$entry";
        if (!file_exists($path)) { http_response_code(404); exit; }
        // A rename never replaces an existing entry, and one that fails is reported instead of a silent 200
        $move = fn(string $from, string $to): bool => !file_exists($to) && !is_link($to) && @rename($from, $to);
        $failed = [];
        if ($exclusive && $enable) {
            foreach (fv3_scan_styles($stylesDir) as $e) {
                if ($e === '.' || $e === '..' || !is_dir("$stylesDir/$e")) continue;
                if (preg_match('/^_fv3-generated\./', $e)) continue;
                $ePath = "$stylesDir/$e";
                if (!preg_match('/\.disabled$/', $e) && $e !== $entry && !$move($ePath, $ePath . '.disabled')) $failed[] = $e;
            }
        }
        $isDisabled = (bool) preg_match('/\.disabled$/', $entry);
        if ($enable && $isDisabled) {
            if (!$move($path, "$stylesDir/" . preg_replace('/\.disabled$/', '', $entry))) $failed[] = $entry;
        } else if (!$enable && !$isDisabled) {
            if (!$move($path, $path . '.disabled')) $failed[] = $entry;
        }
        if ($failed) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Could not rename: ' . implode(', ', $failed)]);
            exit;
        }
    }

    function importTheme(string $repoUrl, string $subPath = '', string $branch = '') : array {
        global $configDir;
        $stylesDir = "$configDir/styles";
        $maxCssBytes = 2 * 1024 * 1024;
        $maxCssFiles = 200;
        if (!preg_match('#^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$#', $repoUrl)) {
            return ['error' => 'Invalid repo format. Use owner/repo.'];
        }
        $ctx = stream_context_create(['http' => [
            'header' => "User-Agent: FolderView3\r\n",
            'timeout' => 15
        ]]);
        $refParam = $branch !== '' ? '?ref=' . rawurlencode($branch) : '';
        $apiBase = "https://api.github.com/repos/$repoUrl/contents/";
        $fetchPath = ($subPath !== '' ? $apiBase . rawurlencode($subPath) : $apiBase) . $refParam;
        $raw = @file_get_contents($fetchPath, false, $ctx);
        if ($raw === false) return ['error' => 'Failed to fetch repo contents.'];
        $contents = json_decode($raw, true);
        if (!is_array($contents)) return ['error' => 'Invalid GitHub API response.'];
        $cssFiles = [];
        foreach ($contents as $f) {
            if (!isset($f['name']) || $f['type'] !== 'file') continue;
            if (preg_match('/\.css$/i', $f['name'])) $cssFiles[] = $f;
        }
        if ($subPath === '') {
            $dirs = array_filter($contents, fn($f) => isset($f['name']) && $f['type'] === 'dir');
            foreach ($dirs as $dir) {
                $subRaw = @file_get_contents($apiBase . rawurlencode($dir['name']) . $refParam, false, $ctx);
                if ($subRaw === false) continue;
                $subContents = json_decode($subRaw, true);
                if (!is_array($subContents)) continue;
                foreach ($subContents as $sf) {
                    if (isset($sf['name']) && $sf['type'] === 'file' && preg_match('/\.css$/i', $sf['name'])) {
                        $sf['_subdir'] = $dir['name'];
                        $cssFiles[] = $sf;
                    }
                }
            }
        }
        if (empty($cssFiles)) return ['error' => 'No CSS files found.'];
        $repoParts = explode('/', $repoUrl);
        $owner = $repoParts[0];
        $repoSlug = $repoParts[1];
        $baseName = $subPath !== '' ? "$owner-$subPath" : "$owner-$repoSlug";
        if ($branch !== '' && !in_array($branch, ['main', 'master'])) {
            $baseName .= "-$branch";
        }
        $themeName = preg_replace('/[^a-zA-Z0-9._-]/', '-', $baseName);
        $themeDirEnabled = "$stylesDir/$themeName";
        $themeDirDisabled = "$stylesDir/$themeName.disabled";
        $isUpdate = is_dir($themeDirEnabled) || is_dir($themeDirDisabled);
        $themeDir = is_dir($themeDirEnabled) ? $themeDirEnabled : $themeDirDisabled;
        if (!is_dir($stylesDir)) { @mkdir($stylesDir, 0770, true); }
        $baseReal = (string)realpath($stylesDir);
        // Never follow a linked theme folder out of styles/
        if (is_link($themeDir) || ($isUpdate && !fv3_path_within($themeDir, $baseReal))) {
            return ['error' => 'Theme folder resolves outside the styles directory.'];
        }
        // Files land in a hidden .disabled sibling (skipped by custom.php and listThemes) and replace
        // the live theme only once every one is in, so a failed update leaves the old theme untouched
        $stageDir = "$stylesDir/.fv3-stage-" . bin2hex(random_bytes(6)) . '.disabled';
        if (!@mkdir($stageDir, 0770)) {
            return ['error' => 'Could not create a staging folder for the theme.'];
        }
        $fail = function (string $message) use ($stageDir, $baseReal): array {
            fv3_remove_tree($stageDir, $baseReal);
            return ['error' => $message];
        };
        $downloaded = [];
        $missing = [];
        $clashes = [];
        $seen = [];
        $cssFiles = array_slice($cssFiles, 0, $maxCssFiles);
        foreach ($cssFiles as $file) {
            if (!isset($file['download_url'])) continue;
            $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '', $file['name']);
            $subdir = $file['_subdir'] ?? '';
            $targetDir = $stageDir;
            if ($subdir !== '') {
                $safeDir = preg_replace('/[^a-zA-Z0-9._-]/', '-', $subdir);
                $targetDir = "$stageDir/$safeDir";
                if (!is_dir($targetDir)) @mkdir($targetDir, 0770, true);
            }
            $relPath = ($subdir !== '' ? "$safeDir/" : '') . $safeName;
            // Two GitHub names can clean up to one file name, and the later would overwrite the earlier
            if (isset($seen[$relPath])) { $clashes[] = ($subdir !== '' ? "$subdir/" : '') . $file['name']; continue; }
            $seen[$relPath] = true;
            // One byte past the cap tells a too-large file from one that fits exactly
            $css = @file_get_contents($file['download_url'], false, $ctx, 0, $maxCssBytes + 1);
            if ($css !== false && strlen($css) > $maxCssBytes) {
                $missing[] = "$relPath (over 2 MB)";
            } elseif ($css !== false && fv3_atomic_write("$targetDir/$safeName", $css)) {
                $downloaded[] = $relPath;
            } else {
                $missing[] = $relPath;
            }
        }
        if ($clashes) return $fail('These files would overwrite another once their names are cleaned up: ' . implode(', ', $clashes));
        if ($missing) return $fail(($downloaded ? 'Could not download: ' : 'Failed to download any CSS files: ') . implode(', ', $missing));
        if (empty($downloaded)) return $fail('Failed to download any CSS files.');
        $warnings = fv3_scan_css_warnings($stageDir, $downloaded);
        $sourceData = ['repo' => $repoUrl, 'path' => $subPath, 'branch' => $branch, 'files' => []];
        foreach ($cssFiles as $file) {
            if (!isset($file['sha'])) continue;
            $subdir = $file['_subdir'] ?? '';
            $key = $subdir !== '' ? $subdir . '/' . $file['name'] : $file['name'];
            $sourceData['files'][$key] = $file['sha'];
        }
        $sourceData['updated'] = date('c');
        if (!fv3_atomic_write("$stageDir/.fv3-source", json_encode($sourceData))) {
            return $fail('Could not write the theme source file.');
        }
        // Swap: old theme aside, staged copy in (rolled back if that fails), then drop the old copy
        $oldDir = "$stylesDir/.fv3-old-" . bin2hex(random_bytes(6)) . '.disabled';
        if ($isUpdate && !@rename($themeDir, $oldDir)) {
            return $fail('Could not replace the old theme files.');
        }
        if (!@rename($stageDir, $themeDir)) {
            if ($isUpdate && !@rename($oldDir, $themeDir)) fv3_debug_log("importTheme: could not restore $oldDir to $themeDir");
            return $fail('Could not install the theme files.');
        }
        if ($isUpdate && !fv3_remove_tree($oldDir, $baseReal)) {
            fv3_debug_log("importTheme: left $oldDir behind after updating $themeName");
        }
        $result = ['success' => true, 'name' => $themeName, 'files' => $downloaded, 'is_update' => $isUpdate];
        if (!empty($warnings)) $result['warnings'] = $warnings;
        return $result;
    }

    function fv3_scan_css_warnings(string $baseDir, array $relPaths): array {
        $warnings = [];
        $patterns = [
            'url(' => '/url\s*\(/i',
            '@import' => '/@import\b/i',
            'expression(' => '/expression\s*\(/i',
            'javascript:' => '/javascript\s*:/i'
        ];
        foreach ($relPaths as $relPath) {
            $filePath = "$baseDir/$relPath";
            if (!file_exists($filePath)) continue;
            $lines = file($filePath, FILE_IGNORE_NEW_LINES);
            foreach ($lines as $lineNum => $line) {
                foreach ($patterns as $label => $regex) {
                    if (preg_match($regex, $line)) {
                        $trimmed = trim($line);
                        if (strlen($trimmed) > 120) $trimmed = substr($trimmed, 0, 120) . '...';
                        $warning = [
                            'file' => $relPath,
                            'line' => $lineNum + 1,
                            'type' => $label,
                            'code' => $trimmed
                        ];
                        if ($label === 'url(' && preg_match('/url\s*\(\s*["\']?([^"\')\s]+)/i', $line, $urlMatch)) {
                            $warning['url'] = $urlMatch[1];
                        }
                        $warnings[] = $warning;
                    }
                }
            }
        }
        return $warnings;
    }

    function deleteTheme(string $entry) : void {
        global $configDir;
        $stylesDir = "$configDir/styles";
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $entry) || $entry === '.' || $entry === '..') { http_response_code(400); exit; }
        $path = "$stylesDir/$entry";
        // is_link: a link whose target is gone fails file_exists() but must stay deletable
        if (!file_exists($path) && !is_link($path)) { http_response_code(404); exit; }
        if (preg_match('/^_fv3-generated\./', $entry)) { http_response_code(403); exit; }
        // A linked entry is removed itself, never followed; anything else must resolve inside styles/
        if (is_link($path)) {
            $removed = @unlink($path);
        } else {
            $baseReal = (string)realpath($stylesDir);
            if (!fv3_path_within($path, $baseReal)) { http_response_code(403); exit; }
            $removed = is_dir($path) ? fv3_remove_tree($path, $baseReal) : @unlink($path);
        }
        if (!$removed) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Some theme files could not be removed.']);
            exit;
        }
    }
?>
