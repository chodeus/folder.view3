(() => {
  const R = { pass: 0, fail: 0, warn: 0 };
  const P = (m) => { R.pass++; console.log('%c[PASS] ' + m, 'color:green'); };
  const F = (m) => { R.fail++; console.log('%c[FAIL] ' + m, 'color:red;font-weight:bold'); };
  const W = (m) => { R.warn++; console.log('%c[WARN] ' + m, 'color:orange'); };
  const T = (label, cond) => cond ? P(label) : F(label);
  const TW = (label, cond) => cond ? P(label) : W(label);

  console.log('%c=== FolderView3 Smoke Test: Settings Page ===', 'font-weight:bold;font-size:14px');

  // --- Docker table ---
  T('Docker tbody exists', $('tbody#docker').length === 1);
  const dockerRows = $('tbody#docker > tr');
  TW('Docker table has rows (' + dockerRows.length + ')', dockerRows.length > 0);

  if (dockerRows.length > 0) {
    T('Docker row has Export button', dockerRows.first().find('button[title="Export"]').length === 1);
    T('Docker row has Delete button', dockerRows.first().find('button[title="Delete"]').length === 1);
    T('Docker row has folder icon', dockerRows.first().find('img').length >= 1);
  }

  // --- VM table ---
  T('VMs tbody exists', $('tbody#vms').length === 1);
  const vmRows = $('tbody#vms > tr');
  TW('VM table has rows (' + vmRows.length + ')', vmRows.length > 0);

  if (vmRows.length > 0) {
    T('VM row has Export button', vmRows.first().find('button[title="Export"]').length === 1);
    T('VM row has Delete button', vmRows.first().find('button[title="Delete"]').length === 1);
    T('VM row has folder icon', vmRows.first().find('img').length >= 1);
  }

  // --- Bulk action buttons: Docker ---
  T('Docker Export All button', $('button[onclick="downloadDocker()"]').length === 1);
  T('Docker Import button', $('button[onclick="importDocker()"]').length === 1);
  T('Docker Clear button', $('button[onclick="clearDocker()"]').length === 1);

  // --- Bulk action buttons: VMs ---
  T('VM Export All button', $('button[onclick="downloadVm()"]').length === 1);
  T('VM Import button', $('button[onclick="importVm()"]').length === 1);
  T('VM Clear button', $('button[onclick="clearVm()"]').length === 1);

  // --- File inputs ---
  T('JSON file input exists', $('input[type="file"][accept=".json"]').length >= 1);
  T('CSS file input exists', $('input[type="file"][accept=".css"]').length >= 1);

  // --- Dashboard layout dropdowns ---
  T('Docker layout dropdown exists', $('select#dashboard-docker-layout').length === 1);
  T('VM layout dropdown exists', $('select#dashboard-vm-layout').length === 1);

  // --- Global settings (toggle switches) ---
  T('Animation toggle switch', $('input#dashboard-animation').length === 1);

  // --- Per-section settings (toggle switches) ---
  T('Docker expand toggle switch', $('input#dashboard-docker-expand-toggle').length === 1);
  T('Docker greyscale switch', $('input#dashboard-docker-greyscale').length === 1);
  T('Docker folder label switch', $('input#dashboard-docker-folder-label').length === 1);
  T('VM expand toggle switch', $('input#dashboard-vm-expand-toggle').length === 1);
  T('VM greyscale switch', $('input#dashboard-vm-greyscale').length === 1);
  T('VM folder label switch', $('input#dashboard-vm-folder-label').length === 1);

  // --- File Manager button ---
  T('File Manager button exists', $('button[onclick="fileManager()"]').length === 1);

  // --- Global functions ---
  T('populateTable is function', typeof populateTable === 'function');
  T('downloadDocker is function', typeof downloadDocker === 'function');
  T('downloadVm is function', typeof downloadVm === 'function');
  T('importDocker is function', typeof importDocker === 'function');
  T('importVm is function', typeof importVm === 'function');
  T('clearDocker is function', typeof clearDocker === 'function');
  T('clearVm is function', typeof clearVm === 'function');
  T('downloadFile is function', typeof downloadFile === 'function');
  T('fileManager is function', typeof fileManager === 'function');
  T('escapeHtml is function', typeof escapeHtml === 'function');
  T('saveDashboardSetting is function', typeof saveDashboardSetting === 'function');
  T('loadDashboardSettings is function', typeof loadDashboardSettings === 'function');
  T('fv3ToggleNonClassicSettings is function', typeof fv3ToggleNonClassicSettings === 'function');

  // --- Global variables ---
  T('dockers is object', typeof dockers === 'object');
  T('vms is object', typeof vms === 'object');
  TW('dockers has entries', Object.keys(dockers).length > 0);
  TW('vms has entries', Object.keys(vms).length > 0);

  // --- Summary ---
  console.log(`%c=== SUMMARY: ${R.pass} PASS, ${R.fail} FAIL, ${R.warn} WARN ===`,
    R.fail ? 'color:red;font-weight:bold' : 'color:green;font-weight:bold');
})();
