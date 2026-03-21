(() => {
  const R = { pass: 0, fail: 0, warn: 0 };
  const P = (m) => { R.pass++; console.log('%c[PASS] ' + m, 'color:green'); };
  const F = (m) => { R.fail++; console.log('%c[FAIL] ' + m, 'color:red;font-weight:bold'); };
  const W = (m) => { R.warn++; console.log('%c[WARN] ' + m, 'color:orange'); };
  const T = (label, cond) => cond ? P(label) : F(label);
  const TW = (label, cond) => cond ? P(label) : W(label);

  console.log('%c=== FolderView3 Smoke Test: Dashboard ===', 'font-weight:bold;font-size:14px');

  // --- Core structure ---
  TW('docker_view tbody exists', $('tbody#docker_view').length > 0);
  TW('vm_view tbody exists', $('tbody#vm_view').length > 0);

  // --- Docker folder showcases ---
  const dockerShowcases = $('div.folder-showcase-outer');
  TW('Docker folder showcases exist (' + dockerShowcases.length + ')', dockerShowcases.length > 0);

  if (dockerShowcases.length > 0) {
    const first = dockerShowcases.first();
    T('Showcase has icon', first.find('.folder-img-docker').length >= 1);
    T('Showcase has name', first.find('.folder-appname-docker').length >= 1);
    T('Showcase has status', first.find('.folder-state-docker').length >= 1);

    // --- Expand/collapse test ---
    const outerClass = first.attr('class').match(/folder-showcase-outer-(\S+)/);
    if (outerClass) {
      const fId = outerClass[1];
      const outer = $(`.folder-showcase-outer-${fId}`);
      const wasExpanded = outer.attr('expanded') === 'true';
      expandFolderDocker(fId);
      const nowExpanded = outer.attr('expanded') === 'true';
      T('Docker expand toggles state', wasExpanded !== nowExpanded);
      expandFolderDocker(fId);
      const restored = outer.attr('expanded') === 'true';
      T('Docker expand restores state', wasExpanded === restored);
    }
  }

  // --- VM folder showcases ---
  const vmShowcases = $('tbody#vm_view div.folder-showcase-outer');
  TW('VM folder showcases exist (' + vmShowcases.length + ')', vmShowcases.length > 0);

  if (vmShowcases.length > 0) {
    const firstVm = vmShowcases.first();
    const vmOuterClass = firstVm.attr('class').match(/folder-showcase-outer-(\S+)/);
    if (vmOuterClass) {
      const fId = vmOuterClass[1];
      const outer = $(`.folder-showcase-outer-${fId}`);
      const wasExpanded = outer.attr('expanded') === 'true';
      expandFolderVM(fId);
      const nowExpanded = outer.attr('expanded') === 'true';
      T('VM expand toggles state', wasExpanded !== nowExpanded);
      expandFolderVM(fId);
      const restored = outer.attr('expanded') === 'true';
      T('VM expand restores state', wasExpanded === restored);
    }
  }

  // --- Filter checkboxes ---
  TW('Apps filter checkbox exists', $('input#apps').length === 1);
  TW('VMs filter checkbox exists', $('input#vms').length === 1);

  // --- Global functions ---
  T('createFolders is function', typeof createFolders === 'function');
  T('createFolderDocker is function', typeof createFolderDocker === 'function');
  T('createFolderVM is function', typeof createFolderVM === 'function');
  T('expandFolderDocker is function', typeof expandFolderDocker === 'function');
  T('expandFolderVM is function', typeof expandFolderVM === 'function');
  T('addDockerFolderContext is function', typeof addDockerFolderContext === 'function');
  T('addVMFolderContext is function', typeof addVMFolderContext === 'function');
  T('editDockerFolder is function', typeof editDockerFolder === 'function');
  T('editVMFolder is function', typeof editVMFolder === 'function');
  T('rmDockerFolder is function', typeof rmDockerFolder === 'function');
  T('rmVMFolder is function', typeof rmVMFolder === 'function');
  T('actionFolderDocker is function', typeof actionFolderDocker === 'function');
  T('actionFolderVM is function', typeof actionFolderVM === 'function');
  T('escapeHtml is function', typeof escapeHtml === 'function');

  // --- Global variables ---
  T('globalFolders is object', typeof globalFolders === 'object');
  TW('globalFolders.docker exists', globalFolders.docker && typeof globalFolders.docker === 'object');
  TW('globalFolders.vms exists', globalFolders.vms && typeof globalFolders.vms === 'object');
  T('folderRegex exists', typeof folderRegex !== 'undefined');
  T('dockerDashboardLayout is string', typeof dockerDashboardLayout === 'string');
  T('vmDashboardLayout is string', typeof vmDashboardLayout === 'string');
  T('fv3DockerExpandToggle is boolean', typeof fv3DockerExpandToggle === 'boolean');
  T('fv3VmExpandToggle is boolean', typeof fv3VmExpandToggle === 'boolean');
  T('fv3DockerGreyscale is boolean', typeof fv3DockerGreyscale === 'boolean');
  T('fv3VmGreyscale is boolean', typeof fv3VmGreyscale === 'boolean');
  T('fv3DockerShowLabel is boolean', typeof fv3DockerShowLabel === 'boolean');
  T('fv3VmShowLabel is boolean', typeof fv3VmShowLabel === 'boolean');
  T('fv3AnimationEnabled is boolean', typeof fv3AnimationEnabled === 'boolean');
  TW('Docker layout class applied', $('tbody#docker_view > tr.updated > td').attr('class')?.includes('fv3-layout-'));
  TW('VM layout class applied', $('tbody#vm_view > tr.updated > td').attr('class')?.includes('fv3-layout-'));

  // --- New dashboard functions ---
  T('fv3InjectExpandToggles is function', typeof fv3InjectExpandToggles === 'function');
  T('fv3PositionChevrons is function', typeof fv3PositionChevrons === 'function');
  T('fv3UpdateGreyscale is function', typeof fv3UpdateGreyscale === 'function');
  T('fv3UpdateInsetBorders is function', typeof fv3UpdateInsetBorders === 'function');

  // --- Event bus ---
  T('folderEvents exists', typeof folderEvents !== 'undefined');
  T('folderEvents is EventTarget', folderEvents instanceof EventTarget);

  // --- Summary ---
  console.log(`%c=== SUMMARY: ${R.pass} PASS, ${R.fail} FAIL, ${R.warn} WARN ===`,
    R.fail ? 'color:red;font-weight:bold' : 'color:green;font-weight:bold');
})();
