<?php
// What a run against the fake Unraid left in its logs, for pages_test.php and browser_test.sh: [passed, what failed] per check.
// A command run with 2>/dev/null that is missing goes unseen: only errors that reach php -S's log are caught
function fv3_fake_log_checks(): array {
    $checks = [];
    // fake_unraid.sh makes each log, FV3 its error.log on its first line: one that cannot be read fails, never "nothing logged"
    $read = function (string $file, bool $mayBeAbsent = false) use (&$checks): array {
        if ($mayBeAbsent && !file_exists($file)) return [];
        $lines = @file($file, FILE_IGNORE_NEW_LINES);
        $checks[] = [$lines !== false, "$file could not be read"];
        return $lines ?: [];
    };
    // From 7.2 Unraid logs a .page's inline PHP as "in plugins/folder.view3/<file>.page", with no leading slash
    $phplog = $read('/var/log/phplog');
    $fv3Lines = preg_grep('#plugins/folder\.view3/#', $phplog);
    $checks[] = [!$fv3Lines, "PHP logged from FV3's files:\n  " . implode("\n  ", array_slice($fv3Lines, 0, 20))];
    // No script died or failed an include: in Unraid's own code, a sign of state the fakes lack
    $broken = preg_grep('/PHP Fatal error|Failed opening .* for inclusion/', $phplog);
    $checks[] = [!$broken, "PHP died or missed a file:\n  " . implode("\n  ", array_slice(array_unique($broken), 0, 20))];
    // FV3's error log copies every warning raised in its requests, Unraid's too, by basename. With VM debug on, a real Unraid's
    // libvirt.php adds one when it keys an array by a domain handle; any other line fails
    $handleWarning = '/^\[[^]]+\] php-error: Resource ID#\d+ used as offset, casting to integer \(\d+\) at libvirt\.php:\d+$/';
    $reported = preg_grep($handleWarning, $read('/boot/config/plugins/folder.view3/error.log', true), PREG_GREP_INVERT);
    $checks[] = [!$reported, "FV3's error.log:\n  " . implode("\n  ", $reported)];
    $unknown = preg_grep('/UNKNOWN/', $read('/var/log/fv3-fakes.log'));
    $checks[] = [!$unknown, "the fakes were asked what they do not answer:\n  " . implode("\n  ", array_unique($unknown))];
    $missing = preg_grep('/command not found/', $read('/var/log/php-server.log'));
    $checks[] = [!$missing, "the webGUI ran commands this image lacks:\n  " . implode("\n  ", array_unique($missing))];
    return $checks;
}

// Run on its own (browser_test.sh): print what failed, exit 1 on any
if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    if (!is_file('/.dockerenv') || !is_file('/var/run/fv3-fake-unraid')) { fwrite(STDERR, "Run in the container fake_unraid.sh set up\n"); exit(2); }
    $version = $argv[1] ?? '?';
    $failed = array_column(array_filter(fv3_fake_log_checks(), fn($c) => !$c[0]), 1);
    if ($failed) {
        echo "FAILED [Unraid $version]: the fake Unraid's logs\n- " . implode("\n- ", $failed) . "\n";
        exit(1);
    }
    echo "Unraid $version: the fake Unraid's logs are clean\n";
}
