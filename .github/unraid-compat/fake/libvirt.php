<?php
// Stand-in for the php-libvirt extension, over fixtures/vms.json: reads answer from each domain's XML, and every other
// libvirt_* function the webGUI calls (7.0-7.4) is logged as UNKNOWN; one it never called is an undefined function.

// No function_exists() guard: PHP binds this file's functions before its first line runs, so one would always be true.

const VIR_DOMAIN_NOSTATE = 0;
const VIR_DOMAIN_RUNNING = 1;
const VIR_DOMAIN_BLOCKED = 2;
const VIR_DOMAIN_PAUSED = 3;
const VIR_DOMAIN_SHUTDOWN = 4;
const VIR_DOMAIN_SHUTOFF = 5;
const VIR_DOMAIN_CRASHED = 6;
const VIR_DOMAIN_PMSUSPENDED = 7;
const VIR_DOMAIN_XML_INACTIVE = 2;
const VIR_DOMAIN_DEVICE_MODIFY_LIVE = 1;
const VIR_DOMAIN_DEVICE_MODIFY_CONFIG = 2;
const VIR_CRED_AUTHNAME = 2;
const VIR_CRED_PASSPHRASE = 5;
const VIR_NETWORKS_ACTIVE = 1;
const VIR_NETWORKS_INACTIVE = 2;
const VIR_NETWORKS_ALL = 3;

function fv3l_log(string $line): void { @file_put_contents('/var/log/fv3-fakes.log', "libvirt $line\n", FILE_APPEND | LOCK_EX); }

function fv3l_domains(): array {
    static $domains = null;
    if ($domains === null) {
        $raw = json_decode((string)@file_get_contents(__DIR__ . '/../fixtures/vms.json'), true);
        if (!is_array($raw)) throw new RuntimeException('fixtures/vms.json is unreadable');
        $domains = array_column($raw['domains'], null, 'name');
    }
    return $domains;
}

// Real resources, as php-libvirt hands out: Unraid's libvirt.php tells a handle from a name with is_resource()
function fv3l_handle(string $kind, string $name) {
    static $handles = [];
    $key = "$kind:$name";
    return $handles[$key] ??= fopen('php://memory', 'r');
}

function fv3l_domain($dom): ?array {
    foreach (fv3l_domains() as $name => $d) if (is_resource($dom) && fv3l_handle('domain', $name) === $dom) return $d;
    $GLOBALS['fv3l_error'] = 'invalid domain handle';
    return null;
}

function fv3l_lookup(string $field, $value) {
    foreach (fv3l_domains() as $name => $d) if ($d[$field] === $value) return fv3l_handle('domain', $name);
    $GLOBALS['fv3l_error'] = "Domain not found: no domain with matching $field '$value'";
    return false;
}

// Unraid's Libvirt class connects read-write to qemu:///system; another URI or a read-only connection is not this fake
function libvirt_connect($uri = null, $readonly = true, $credentials = []) {
    if ($uri !== 'qemu:///system' || $readonly !== false) { fv3l_log('UNKNOWN libvirt_connect to ' . var_export($uri, true) . ($readonly === false ? '' : ' read-only')); return false; }
    return fv3l_handle('connection', 'qemu:///system');
}
function libvirt_get_last_error() { return $GLOBALS['fv3l_error'] ?? null; }
function libvirt_logfile_set($filename, $maxsize = 0) { return true; }
function libvirt_connect_get_uri($conn) { return 'qemu:///system'; }
function libvirt_connect_get_hostname($conn) { return 'Tower'; }
function libvirt_list_domains($conn) { return array_keys(fv3l_domains()); }
function libvirt_list_active_domain_ids($conn) { return array_values(array_map(fn($d) => $d['id'], array_filter(fv3l_domains(), fn($d) => $d['id'] > 0))); }
function libvirt_domain_lookup_by_name($conn, $name) { return fv3l_lookup('name', (string)$name); }
function libvirt_domain_lookup_by_uuid_string($conn, $uuid) { return fv3l_lookup('uuid', (string)$uuid); }
function libvirt_domain_get_name($dom) { return fv3l_domain($dom)['name'] ?? false; }
function libvirt_domain_get_uuid_string($dom) { return fv3l_domain($dom)['uuid'] ?? false; }
function libvirt_domain_get_id($dom) { $d = fv3l_domain($dom); return $d ? $d['id'] : false; }
function libvirt_domain_is_active($dom) { $d = fv3l_domain($dom); return $d ? $d['id'] > 0 : false; }
function libvirt_domain_get_autostart($dom) { $d = fv3l_domain($dom); return $d ? (int)$d['autostart'] : false; }
// The live XML only, as Unraid asks for it ($dom, 0): an xpath or flags would be a form this fake does not answer
function libvirt_domain_get_xml_desc($dom, $xpath = null, $flags = 0) {
    if (!in_array($xpath, [null, 0, '0', ''], true) || $flags !== 0) { fv3l_log('UNKNOWN libvirt_domain_get_xml_desc with an xpath or flags'); return false; }
    return fv3l_domain($dom)['xml'] ?? false;
}
function libvirt_list_domain_snapshots($dom) { return fv3l_domain($dom) ? [] : false; }

function libvirt_domain_get_info($dom) {
    $d = fv3l_domain($dom);
    if (!$d) return false;
    $xml = simplexml_load_string($d['xml']);
    return ['maxMem' => (int)$xml->memory, 'memory' => (int)$xml->currentMemory, 'state' => $d['state'], 'nrVirtCpu' => (int)$xml->vcpu, 'cpuUsed' => $d['id'] > 0 ? 12.5 : 0];
}

function libvirt_node_get_info($conn) {
    return ['model' => 'x86_64', 'memory' => 16777216, 'cpus' => 8, 'nodes' => 1, 'sockets' => 1, 'cores' => 4, 'threads' => 2, 'mhz' => 3600];
}

// Each disk is a 20 GiB image at the path its XML names
function libvirt_domain_get_block_info($dom, $dev) {
    $d = fv3l_domain($dom);
    if (!$d) return false;
    foreach (simplexml_load_string($d['xml'])->devices->disk as $disk) {
        if ((string)$disk->target['dev'] !== (string)$dev) continue;
        $size = 21474836480;
        return ['device' => (string)$dev, 'file' => (string)$disk->source['file'], 'type' => (string)$disk->driver['type'], 'capacity' => $size, 'allocation' => $size, 'physical' => $size];
    }
    $GLOBALS['fv3l_error'] = "invalid argument: no disk with target $dev";
    return false;
}

// Unraid's VM usage poller asks for every stat of every domain ($conn alone) and reads these keys; a stats or flags selection is
// a form this fake does not answer. A running domain has used some CPU time
function libvirt_connect_get_all_domain_stats($conn, $stats = 0, $flags = 0) {
    if ($stats !== 0 || $flags !== 0) { fv3l_log('UNKNOWN libvirt_connect_get_all_domain_stats with a stats or flags selection'); return false; }
    $all = [];
    foreach (fv3l_domains() as $name => $d) {
        $info = libvirt_domain_get_info(fv3l_handle('domain', $name));
        $all[$name] = ['state.state' => $d['state'], 'state.reason' => 1, 'cpu.time' => $d['id'] > 0 ? 125000000000 : 0,
            'vcpu.current' => $info['nrVirtCpu'], 'vcpu.maximum' => $info['nrVirtCpu'], 'balloon.current' => $info['memory'],
            'balloon.maximum' => $info['maxMem'], 'net.count' => 0, 'block.count' => 0];
    }
    return $all;
}

function libvirt_domain_get_counts($conn) {
    $active = count(array_filter(fv3l_domains(), fn($d) => $d['id'] > 0));
    return ['total' => count(fv3l_domains()), 'active' => $active, 'inactive' => count(fv3l_domains()) - $active];
}

// php-libvirt's answer: the matches' text in order, their count under 'num', and false when nothing matches
function libvirt_domain_xml_xpath($dom, $xpath, $flags = 0) {
    if ($flags !== 0) { fv3l_log('UNKNOWN libvirt_domain_xml_xpath on the inactive XML'); return false; }
    $d = fv3l_domain($dom);
    if (!$d) return false;
    $doc = new DOMDocument();
    $doc->loadXML($d['xml']);
    $nodes = @(new DOMXPath($doc))->query($xpath);
    if ($nodes === false) { $GLOBALS['fv3l_error'] = "invalid xpath $xpath"; return false; }
    if ($nodes->length === 0) return false;
    $out = ['xpath' => $xpath, 'num' => $nodes->length];
    foreach ($nodes as $i => $node) $out[$i] = $node->nodeValue;
    return $out;
}

// Every other libvirt_* function in the webGUI's code at 7.0.1-7.4.0: none has an answer here yet
foreach (['libvirt_connect_get_information', 'libvirt_connect_get_capabilities', 'libvirt_connect_get_machine_types',
    'libvirt_connect_get_domain_capabilities', 'libvirt_has_feature',
    'libvirt_list_nodedevs', 'libvirt_nodedev_get', 'libvirt_nodedev_get_xml_desc', 'libvirt_nodedev_get_information',
    'libvirt_nodedev_capabilities', 'libvirt_list_networks', 'libvirt_network_get', 'libvirt_network_get_xml_desc', 'libvirt_get_net_res',
    'libvirt_get_net_list', 'libvirt_get_net_xml', 'libvirt_domain_interface_addresses',
    'libvirt_domain_interface_stats', 'libvirt_domain_get_interface_devices', 'libvirt_domain_memory_stats',
    'libvirt_domain_get_screen_dimensions', 'libvirt_domain_qemu_agent_command', 'libvirt_domain_define_xml', 'libvirt_domain_create_xml',
    'libvirt_domain_undefine', 'libvirt_domain_update_device', 'libvirt_domain_create', 'libvirt_domain_destroy', 'libvirt_domain_shutdown',
    'libvirt_domain_reboot', 'libvirt_domain_suspend', 'libvirt_domain_resume', 'libvirt_domain_managedsave', 'libvirt_domain_set_autostart',
    'libvirt_domain_change_boot_devices', 'libvirt_domain_disk_remove', 'libvirt_domain_send_keys', 'libvirt_domain_send_pointer_event',
    'libvirt_domain_snapshot_create', 'libvirt_domain_snapshot_delete', 'libvirt_domain_snapshot_get_xml', 'libvirt_domain_snapshot_lookup_by_name',
    'libvirt_domain_snapshot_revert', 'libvirt_storagevolume_create_xml', 'libvirt_version'] as $fv3lName) {
    eval("function $fv3lName(...\$args) { fv3l_log('UNKNOWN $fv3lName'); \$GLOBALS['fv3l_error'] = 'not in the fake'; return false; }");
}
unset($fv3lName);
