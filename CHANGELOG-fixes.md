# FolderView3 Changelog

## Summary

This fork (`chodeus/folder.view3`) is a maintained continuation of `VladoPortos/folder.view2` (originally `scolcipitato/folder.view`). It includes bug fixes, new features, theme compatibility, Unraid 7 support, and a full rebrand.

---

## Security

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 169 | Revert of #167 — that change broke every legitimate mutation (folder create/edit/delete, CSS save, settings save all returned 403). Root cause: Unraid's global `auto_prepend_file` (`webGui/include/local_prepend.php`) already validates `csrf_token` on every POST and then `unset()`s both `$_POST['csrf_token']` and `$_SERVER['HTTP_X_CSRF_TOKEN']` before the plugin script runs. `fv3_validate_csrf()` then read the (now-empty) token and 403'd. #167's "verified on PHP 8.4" check passed only because it ran under CLI, where `REQUEST_METHOD` is not `POST`, so local_prepend's strip block never executes. Fix: removed the `fv3_validate_csrf()` call (and the dead function) from `fv3_post_init()`; CSRF remains fully enforced by Unraid's global layer (the documented model — "Unraid emhttp auto-validates"). Confirmed in a real browser against the live server. | `server/lib.php` | 2026.06.13.2 |
| 167 | **Superseded by #169 (reverted in 2026.06.13.2).** Wired `fv3_validate_csrf()` into `fv3_post_init()` believing CSRF was unenforced. This was both redundant (Unraid enforces CSRF globally via local_prepend) and broken (local_prepend strips the token before the plugin sees it → 403 on all legit POSTs). | `server/lib.php` | 2026.06.13.1 |
| 168 | Theme delete/toggle accepted `entry="."`/`".."` (regex `^[a-zA-Z0-9._-]+$` permits all-dot strings), resolving `$path` to the plugin config dir and recursively deleting `docker.json`, `vm.json`, `settings.json`, `css-config.json` and all themes. Added explicit `.`/`..` rejection in `deleteTheme()` and `toggleTheme()`. | `server/lib.php` | 2026.06.13.1 |
| 141 | H2: escapeHtml on Docker icon label. `<img src="${ct.Labels['net.unraid.docker.icon']}">` wrapped in escapeHtml. Not exploitable on Unraid today, consistent with rest of popup. | `scripts/advanced-preview.js` | 2026.05.21 |
| 142 | H3: escapeHtml on port mappings and volume mounts. `e.PrivateIP`, `e.PublicIP`, `e.PrivatePort`, `e.PublicPort`, `e.Type.toUpperCase()`, `e.Destination`, `e.Source` all wrapped in escapeHtml. Defense in depth. | `scripts/advanced-preview.js` | 2026.05.21 |
| 144 | H7: Graph time input validation. Added `min="5" max="600" step="5"` to all three `context_graph_time` inputs (per-folder + Folder Defaults + Dashboard). | `Folder.page`, `FolderView3.page` | 2026.05.21 |
| 12 | Content-Type: application/json on all JSON endpoints | All `server/*.php` | 2026.04.04 |
| 13 | CSS injection sanitization (strips @import, url(), expression(), javascript:) | `lib.php` | 2026.04.04 |
| 14 | Recursive delete for theme removal | `lib.php`, `delete_theme.php` | 2026.04.04 |

## New Features

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 150 | Per-folder `preview_update` (Docker page container names in preview) kept and relabelled "Orange container text on update". Added new per-folder `preview_update_folder` (Docker page folder name on update). Both live in the Folder editor and as defaults on the Defaults page. New toggle defaults OFF. | `Folder.page`, `FolderView3.page`, `scripts/folder.js`, `scripts/folderview3.js`, `scripts/docker.js`, `server/lib.php`, all 7 lang files | 2026.05.23 |
| 151 | New global Dashboard settings `dashboard_update_container` and `dashboard_update_folder` (Settings → Dashboard → Docker column). Replaces the implicit dashboard behaviour that piggybacked on per-folder `preview_update`. Stored once in `settings.json`, read by dashboard.js into `fv3DashboardUpdateContainer` / `fv3DashboardUpdateFolder` vars. Default OFF — existing folders that previously turned orange on the Dashboard via `preview_update=true` will no longer do so until the new global toggles are enabled. | `FolderView3.page`, `scripts/dashboard.js`, `scripts/folderview3.js`, `server/lib.php` | 2026.05.23 |
| 152 | New behaviour: on Docker page, the folder name (`.folder-appname`) gets `.orange-text` when any child container has `Updated === false` AND `preview_update_folder` is enabled. Added to `createFolder()`'s `!upToDate` branch in docker.js. | `scripts/docker.js` | 2026.05.23 |
| 116 | Add `preview_status` setting (`none` / `symbol` / `grayscale`) shown only when Preview = Only icon. **Symbol**: appends `<br>` + `<i class="fa fa-play started green-text">` (running) or `<i class="fa fa-square stopped red-text">` (stopped) inside `span.hand` after the WebUI/console/log action buttons; CSS floats the icon left so the right column stacks: action buttons on line 1, status icon on line 2. **Grayscale stopped**: applies `filter: grayscale(100%)` to the entire `span.hand` of stopped wrappers, desaturating icon and action buttons together. Per-folder via Folder.page select, global default via FolderView3.page. Backward-compatible — existing folders without the field show no indicator. | `Folder.page`, `FolderView3.page`, `docker.js`, `vm.js`, `folder.js`, `folderview3.js`, `shared.js`, `lib.php`, `folder-common.css`, 7 lang files | 2026.05.21 |
| 117 | Add red "Delete folder" button to the folder editor footer, far-right on the same row as Submit/Cancel for visual separation. PHP-conditional render — only appears when `?id=` is present (editing, not creating). swal confirm dialog with Cancel default and the folder name interpolated into the warning text; POST to existing `delete.php` on confirm, then redirects back to /Docker or /VMs. | `Folder.page`, `folder.js`, `folder.css`, 7 lang files | 2026.05.21 |
| 118 | Defaults page (`FolderView3.page`) previously left preview-related settings visible regardless of the Preview mode, even when they'd have no effect (e.g. "Orange text on update" with Preview = Only icon, or all preview options with Preview = None). New `fv3ApplyConstraints()` reads `data-fv3-show-preview="…"` on each setting row's `<div class="basic">` and toggles `display` based on the master Preview dropdown, with combinatoric AND for `.fv3-expand-only` (Overflow = Expand) and `.fv3-context-advanced` (Context = Advanced). Replaces two single-purpose change listeners. 13 setting rows now show/hide correctly. | `FolderView3.page`, `folderview3.js` | 2026.05.21 |
| 124 | Add `dashboard_context` global setting (`0/1/2` = None/Default/Advanced) to the backend allowlist and a new row on the FolderView3 settings page → Dashboard panel → General section. When set to Advanced (2), all Docker containers on the Dashboard get the same popup the Docker tab shows. | `server/lib.php`, `FolderView3.page`, `scripts/folderview3.js`, `langs/*.json` | 2026.05.21 |
| 125 | Wire dashboard.js to read `dashboard_context` (via existing `fv3SettingsReq` parse), initialize a WebSocket stats subscription via shared.js's `fv3ConnectStats` (no SSE fallback on Dashboard), and attach `fv3AttachAdvancedPreview` to each Docker container's `span.hand` inside folder storage when `dashboard_context === 2`. | `scripts/dashboard.js` | 2026.05.21 |
| 126 | Load Chart.js + chartjs-plugin-streaming + chartjs-adapter-moment + moment.js on `folder.view3.Dashboard.page` (previously Docker-tab-only). +300 KB on Dashboard first load, cached thereafter. Also load `advanced-preview.js`. | `folder.view3.Dashboard.page`, `folder.view3.Docker.page` | 2026.05.21 |
| 129 | Add three dashboard-specific sub-options that mirror the per-folder context settings, shown only when `dashboard_context = Advanced`: **Activation mode** (`dashboard_context_trigger`, Click/Hover), **Graph mode** (`dashboard_context_graph`, None/Combined/Split/CPU/MEM), **Time Frame (s)** (`dashboard_context_graph_time`, freeform number). These are separate from the per-folder context values so Dashboard popup behavior can be configured independently. | `FolderView3.page`, `server/lib.php` (allowlist + freeform list), `scripts/folderview3.js` (selectMap, defaults, applyFormState, collectSettings, change listener), `scripts/shared.js` (fv3LoadFolderDefaults) | 2026.05.21 |
| 130 | Wire dashboard.js to pass `dashboardContextTrigger` / `dashboardContextGraph` / `dashboardContextGraphTime` to `fv3AttachAdvancedPreview` instead of folder-specific context values. Dashboard popups now honor the new dashboard-specific sub-option settings. | `scripts/dashboard.js` | 2026.05.21 |
| 29 | shared.js extraction (~930 lines): row separators, preview heights, resize listeners, debug system, JSON recovery | `shared.js` (new), `docker.js`, `vm.js`, `dashboard.js` | 2026.04.04 |
| 30 | folder-common.css extraction (~622 lines): common folder layout rules from docker/vm CSS | `folder-common.css` (new), `docker.css`, `vm.css` | 2026.04.04 |
| 31 | customEvents.js consolidation: event bus (`folderEvents`), `escapeHtml()`, CSRF ajaxPrefilter | `customEvents.js` (new) | 2026.04.04 |
| 32 | GraphQL API detection and hybrid mutations with automatic PHP fallback | `shared.js`, `docker.js`, `vm.js`, `dashboard.js` | 2026.04.04 |
| 33 | WebSocket real-time stats subscription (replaces SSE on Unraid 7.2+) | `shared.js`, `docker.js` | 2026.04.04 |
| 34 | Docker container update checking via GraphQL API | `shared.js`, `docker.js` | 2026.04.04 |
| 35 | Native Docker Organizer sync (one-way FV3→Unraid, fire-and-forget) | `shared.js`, `docker.js` | 2026.04.04 |
| 36 | VM Reset action via GraphQL (7.2+ only) | `vm.js` | 2026.04.04 |
| 37 | Settings page restructured into tabs (Backup, Dashboard, Defaults, CSS) | `FolderView3.page`, `folderview3.js`, `folderview3.css` | 2026.04.04 |
| 38 | Folder defaults with Apply to All and Use Global Defaults checkbox | `FolderView3.page`, `folderview3.js`, `lib.php`, `read_settings.php`, `save_settings.php` | 2026.04.04 |
| 39 | Full backup export/import (folders, settings, CSS config, themes in one JSON) | `folderview3.js`, `export_all.php`, `import_all.php` | 2026.04.04 |
| 40 | CSS Tool: theme manager with GitHub import, enable/disable, update checker | `csstool.js` (new), `csstool.css` (new), `upload_theme.php`, `delete_theme.php`, `list_themes.php` | 2026.04.04 |
| 41 | CSS Tool: variable editor (27 vars, page scoping, color pickers) | `csstool.js`, `csstool.css`, `read_css_config.php`, `save_css_config.php`, `default_css.php` | 2026.04.04 |
| 42 | CSS Tool: presets (Default, Orange, Blue Accent, Muted) | `csstool.js`, `csstool.css` | 2026.04.04 |
| 43 | CSS Tool: toggle style picker (5 styles with live preview) | `csstool.js`, `csstool.css`, `folder-common.css` | 2026.04.04 |
| 44 | CSS Tool: advanced CSS textarea with security scanning | `csstool.js`, `lib.php` | 2026.04.04 |
| 45 | Incognito mode (blur container/VM names, icons, Tailscale IPs for screenshot-safe sharing) | `shared.js` | 2026.04.04 |
| 46 | Error banners (`fv3ShowBanner()`): deduped, auto-dismiss warnings (15s), persistent errors | `shared.js` | 2026.04.04 |
| 47 | Unified debug system: `fv3debug` keyboard toggle, localStorage persistence, zero-overhead no-op when off | `shared.js`, `docker.js`, `vm.js`, `dashboard.js` | 2026.04.04 |
| 48 | PHP debug toggle via `touch /tmp/fv3_debug_enabled` file flag | `lib.php` | 2026.04.04 |
| 49 | Build script cross-platform support (macOS sed, md5, cp detection) | `pkg_build.sh` | 2026.04.04 |
| 50 | README updated with screenshots and missing feature descriptions | `README.md` | 2026.04.04 |

## Improvements

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 172 | Page-load timing in the debug capture. (1) `window.fv3Milestones` (`env.milestones`) — an eviction-proof, name-keyed `{first,last,count}` of `performance.now()` for createFolders-start, folderReq-resolved, createFolders-end, width-fix runs, fonts-ready, first-stat. Separate from the verbose ring buffer, which was evicting the early timeline (300 createFolder lines pushed out the fonts/width-fix #1 markers). (2) `window.fv3IconLoads` (`env.iconLoads`) — per-preview-icon finish timestamps via load/error listeners attached in `fv3SetupPreviewMode`, so icon-finish vs width-fix-run ordering (the load-order race signal) is recoverable. (3) `env.perf` — `getEntriesByType('navigation')` milestones + `resource` timings filtered to plugin assets and preview-icon hosts (real network load times). (4) Trace ring buffer cap raised 300→600. Diagnostics only. | `scripts/shared.js`, `scripts/docker.js` | 2026.06.13.5 |
| 171 | Broaden debug coverage beyond the Docker width-fix hypothesis. (1) Geometry capture generalized from hardcoded `#docker_containers`-first-folder to all container tables present (`#docker_containers`, `#kvm_table`) plus Dashboard showcase (`.folder-showcase-outer`), capturing per-column thead geometry per table. (2) New `env.foldersRendered` per-folder manifest across every rendered folder (row + showcase): id/name, preview cell placement, the overflow mode actually applied (className), and child/wrapper/divider counts — so "preview pushed right / clipped / wrong content" is diagnosable on any page for every folder. (3) Live-stats diagnostics: `window.fv3StatsState` (transport websocket/sse, lastStatAt, statCount, fallbacks) instrumented in the WebSocket handlers + the Docker SSE path, surfaced in `env.renderSignals.stats` with `apiAvailable`/`cpuCores`/`wsReadyState`/`listeners` — covers the "graphs blank/frozen" class. (4) `fv3CollectCssDebug` now fetches the rendered contents (truncated) of generated/custom CSS loaded from `/boot/config/plugins/folder.view3/` and lists custom scripts — a bad generated rule or community custom-CSS override is no longer invisible. Diagnostics only. | `scripts/shared.js`, `scripts/docker.js` | 2026.06.13.4 |
| 170 | Debug capture overhaul. (1) Env was collected *before* folders rendered (inside `createFolders` ahead of the draw loop and the width-fix), so every `tr.folder` sample was always null and the layout state was never captured — root cause of an undiagnosable, machine-specific "preview pushed right" report. Capture is now on-demand: each page stashes its data payload by source into `window.fv3DebugPayloads`; `fv3CaptureDebug(source)` downloads it with a *fresh* `fv3CollectEnv()` at click time (post-render). (2) New centered, draggable "FV3 Debug" pill, injected only while debug mode is armed (`fv3debug` keyword) — zero footprint for normal users; `fv3SetDebugPill()` shows/removes it on toggle. (3) Timestamped ring buffer (`fv3TraceBuffer`, cap 300) records the render timeline (existing `fv3Debug` seam calls route through it) plus a `document.fonts.ready` marker — so load-order races are visible. (4) `fv3CollectEnv` now captures per-column thead geometry, `table-layout`, `#fv3-width-style`, exposed width snapshots, the first folder's preview-cell/`.folder-preview` computed alignment, and browser-divergence signals (per-icon `complete`/`naturalWidth`/isSVG, `fonts.status`, scrollbar gutter, DPR, real Unraid release). (5) Width-fix instrumented with a run counter, `fv3GetWidthState()`, and `fv3WidthFixDiff()` (re-measures and diffs vs locked widths — a non-zero delta proves a stale measure-before-load layout). (6) `fv3SanitizeContainersInfo` switched from a denylist to an allowlist — fixes a host-path leak (volume Binds/Mounts, ZFS mountpoints, log/template paths shipped in debug files) and cuts file size ~10x. Diagnostics only; no change to rendering when debug is off. | `scripts/shared.js`, `scripts/docker.js`, `scripts/vm.js`, `scripts/dashboard.js` | 2026.06.13.3 |
| 162 | Dashboard docker folder menu: compute `running`, `paused`, `runningNotPaused`, `stopped` from `folder.containers` at menu-build time. Hide Start when nothing is stopped, Stop/Restart when nothing is running, Pause when nothing is running-not-paused, Resume when nothing is paused. Trailing divider only added if at least one action survived gating. | `scripts/dashboard.js` | 2026.05.28 |
| 163 | Dashboard VM folder menu: compute per-state counts (`running`, `shutoff`, `resumable` = paused+pmsuspended+unknown). Hide Start when no shutoff VM; hide Stop/Pause/Restart/Hibernate when no running VM; hide Resume when no resumable VM; hide Force-stop when no destroyable VM; Reset stays gated on both `fv3ApiAvailable` and running VM count. | `scripts/dashboard.js` | 2026.05.28 |
| 164 | Docker tab folder menu (docker.js `addDockerFolderContext`): same docker gating logic as the Dashboard equivalent, applied at the per-row context menu. | `scripts/docker.js` | 2026.05.28 |
| 165 | VM tab folder menu (vm.js `addVMFolderContext`): same VM gating logic as the Dashboard equivalent, applied at the per-row context menu. | `scripts/vm.js` | 2026.05.28 |
| 153 | Defaults panel split into Basic / Preview / Behavior sub-sections. Item order under Preview now mirrors the Folder editor (preview mode → orange container → text width → status → hover → greyscale → webui/logs/console → vertical bars / border → overflow → row separator → context popup). `default-update-column` moved into the new Behavior section. | `FolderView3.page` | 2026.05.23 |
| 154 | Folder editor: `preview_update_folder` placed in Basic section (works regardless of preview mode). `preview_hover` moved closer to other display toggles, directly above `preview_grayscale`. | `Folder.page` | 2026.05.23 |
| 155 | Spelling: "grayscale" → "greyscale" in English UI text only (label + tooltip in en.json, Folder.page, FolderView3.page). Variable names (`preview_grayscale`, `dashboard_docker_greyscale`), the CSS function `grayscale(100%)`, and non-English translations were intentionally left alone. | `langs/en.json`, `Folder.page`, `FolderView3.page` | 2026.05.23 |
| 121 | Extract the ~480-line advanced-preview tooltipster block from docker.js into a new shared helper `window.fv3AttachAdvancedPreview({triggerEl, ct, folder, id, container_name_in_folder, cpus})` in a new file `scripts/advanced-preview.js`. Verbatim lift — internal logic unchanged, only the outer wrapper became a function and the lone `tooltip_trigger_element` reference inside the mobile ResizeObserver was renamed to `triggerEl`. Net effect: `docker.js` shrinks from 1865 → 1401 lines. | `scripts/advanced-preview.js` (new), `scripts/docker.js` | 2026.05.21 |
| 122 | Move helper utilities (`memToB`, `hideAllTips`, `advancedAutostart`) and the `fv3UsingWebSocket` flag from `docker.js` to `advanced-preview.js` as `window.*` globals so Dashboard can access them without loading docker.js. Both files now reference them via the global scope chain. | `scripts/advanced-preview.js`, `scripts/docker.js` | 2026.05.21 |
| 128 | Move the Dashboard "Preview context" select from the General section to the Docker column on Settings → FolderView3 → Dashboard. It was a Docker-only setting living in a cross-cutting section; relocating it groups it with the other Docker dashboard settings and drops the now-redundant "Docker only" scope badge. | `FolderView3.page` | 2026.05.21 |
| 134 | v.7 loaded docker.css on Dashboard.page as a quick fix for popup styling, which mixed Docker-tab-specific rules into the Dashboard page (~424 lines of unrelated CSS). Per-user request, duplicated only the popup-related rules into dashboard.css (378 lines copied verbatim — `.preview-outbox`, `.preview-name`, `.preview-status`, `.action-info`, `.info-section`, `.tooltipster-docker-folder`, `.fv3-mobile-details`, graph canvas styles, mobile @media block). docker.css unchanged; both files now contain the popup styles. Dashboard.page reverts to loading only dashboard.css. Trade-off accepted: popup CSS fixes now need to be applied in two places. | `styles/dashboard.css`, `folder.view3.Dashboard.page` | 2026.05.21 |
| 113 | Client-side `createFolders()` synthesizes an alphabetical-intermix order when `read_order.php` returns empty. Folder names and orphan container names sort together using natural case-insensitive comparison (`localeCompare(name, undefined, {numeric: true, sensitivity: 'base'})`), so folders slot into their natural alphabetical position alongside containers instead of stacking at the top in reverse JSON-key order. | `docker.js` | 2026.05.15 |
| 115 | Server-side `syncContainerOrder()` matches the client-side alpha-intermix when `userprefs.cfg` is absent. New items not present in `userprefs.cfg` are now prepended (not appended) so the autostart file mirrors what's on screen, including Unraid's native sort=0 "top placement" for items missing from `userprefs.cfg` in manual mode. | `lib.php` | 2026.05.15 |
| 104 | **Two-snapshot column-width model.** `fv3InstallDockerTableWidthFix` now computes both `widthsExpanded` (Uptime present) and `widthsCollapsed` (Uptime = 0, freed space → Volume Mappings only) once per page-load / resize / view-toggle, using the state-independent hoist loop as the only measurement source. New `fv3ApplyCachedWidths` swaps between cached snapshots on `docker-post-folder-expansion` — no re-measurement, no drift. Cols 0–5, 7, 8 are byte-stable across every folder open/close transition; only col 6 (Volume Mappings) and col 9 (Uptime) change. Eliminates the perceived "Version column shrinks" jump and fixes a real ~38px Version drift in advanced view after expand→collapse cycles that had survived through `.901`–`.908`. | `shared.js` | 2026.05.02 |
| 105 | Reduce verHint buffer from `+12` to `+2`. The `+12` cushion was protecting against folder-state drift the snapshot model now prevents. Result: ~10px of horizontal space transferred from Version column to preview area. | `shared.js` | 2026.05.02 |
| 106 | Drop dead `fv3-width-hint` references — the hint element was created by the trailing-collapse logic deleted in `.909`, so the cleanup line and the corresponding `id === 'fv3-width-hint'` skip in `fv3AnyNonFolderRowVisible` were orphaned. | `shared.js` | 2026.05.02 |
| 109 | Plugin-wide comment cleanup. Stripped explanation lines across all eight JS files (`shared.js`, `docker.js`, `vm.js`, `dashboard.js`, `folder.js`, `folderview3.js`, `csstool.js`, `include/customEvents.js`); kept only single-line section markers and architectural do-not-retry warnings (e.g. pill height invariants, `switchButton` deferred init, ajaxPrefilter rationale). Added navigational section markers throughout `shared.js` (Row separators, Preview height sync, Unraid GraphQL API, Preview mode, Docker table column-width lock, Resize / view-mode listeners) and `docker.js` (Folder rendering, Folder controls, Bulk actions, Custom actions, Context menu, SSE stats fallback, Memory unit conversion). Net: -268 / +86 lines. | all 8 JS files | 2026.05.02 |
| 92 | Replace `fv3InstallDockerTableWidthFix` min-width-hint mechanism with `table-layout: fixed` + explicit per-`<th>` widths. The old hint approach (min-width on a hidden tbody row covering only cols 1-6) was a soft floor that browsers ignored when actual content demanded more — col 9 (Uptime) wasn't covered, so it grew ~29px on expand and stole space from col 1 (Version), shifting the preview row. The new approach probes both collapsed and expanded-children widths, computes per-column widths summing to `containerW - 2`, and applies them as inline `<th>` widths under `table-layout: fixed` with `box-sizing: border-box`. Result: zero column shift across expand/collapse cycles AND across basic↔advanced view toggles, in both views. | `shared.js` | 2026.04.30 |
| 93 | Extend Version column probe to include child-row Version cell content. Previously only the first folder's verCell was measured, missing child rows where image tags like "release-5.1.4" live. With the new probe loop measuring children's `td:nth-child(2) > *` while temporarily hoisted, `verCap` correctly accommodates the widest version string across all rows. | `shared.js` | 2026.04.30 |
| 101 | Shrink Dashboard `All Apps`/`All VMs` toggles to match the sizes used everywhere else in the plugin (Docker/VM tabs and advanced-popup autostart switches). The dashboard rules at [dashboard.css:533](src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/dashboard.css:533) — added whole-cloth in the v2026.03.28 CSS Tool / Settings refactor — were ~33% larger than the matching `folder-common.css:242` rules: flat 40×22 → 30×16, rounded 44×24 → 32×18, material 36×14 → 28×10, pill 56×26 → 38×20. Inner button dimensions, top/left offsets, border-radii and the checked-position `left` end values updated to match. Also added `background: #fff` to the rounded-checked button rule for parity with `folder-common.css:294` — without it the button rendered gray (inheriting the new `#ccc` unchecked color) on the orange checked track. Single-file CSS change, no JS impact, only affects switches with the `.fv3-styled-switch` marker class added by [customEvents.js:155](src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/include/customEvents.js:155). | `dashboard.css` | 2026.04.30 |
| 83 | Enrich debug export: viewport, theme, foreign plugin detection, computed preview/ct-name/updatecolumn styles, timestamp+theme in filename | `shared.js` | 2026.04.30 |
| 86 | Add CSS diagnostics to debug export: `--fv3-*` variable values from `:root`, plugin stylesheet hrefs (with autov tokens), `.folder-name-sub`/`td.folder-name` border samples, plus async fetch of `read_css_config.php` + `list_themes.php` and Unraid version — diagnoses preset/cache/theme issues without back-and-forth | `shared.js`, `docker.js`, `vm.js`, `dashboard.js` | 2026.04.30 |
| 87 | Remove narration comments from mobile accordion block; kept two that explain non-obvious timing (requestAnimationFrame settle, 1100ms double-cleanup for streaming plugin) | `docker.js` | 2026.04.30 |
| 21 | Atomic file writes: prevent config corruption on power loss or crash | `lib.php` | 2026.04.14 |
| 22 | Safe JSON reads: validate file contents before parsing | `lib.php` | 2026.04.14 |
| 23 | Error banner on settings page if folder data fails to load | `folderview3.js` | 2026.04.14 |
| 24 | Extend incognito mode scrubbing to advanced preview tooltips | `docker.js`, `shared.js` | 2026.04.14 |
| 25 | Remove all `!important` from CSS in favor of specificity | CSS | 2026.04.14 |
| 26 | Reduce page title margin for tighter layout (issue #6) | `folder-common.css` | 2026.04.14 |
| 27 | Improved post-install dialog with FV3 logo and maintainer credits | `.plg` | 2026.04.14 |
| 28 | Updated bug report template with FV3 debug instructions | `bug_report.yml` | 2026.04.14 |
| 29 | Advanced preview hybrid accordion layout with collapsible sections | `docker.js`, `docker.css` | 2026.04.14 |
| 19 | Compute VM name column width from actual icon size and cell padding instead of hardcoded +80px | `vm.js` | 2026.04.08 |
| 20 | Add swal confirmation dialogs to settings Apply buttons (saved, no changes, error with details) | `folderview3.js` | 2026.04.08 |
| 51 | Scrub container/VM names in volume paths (preserves path structure) | `shared.js` | 2026.04.05 |
| 52 | Hide public IPv6 addresses (keeps private fe80/fc/fd) | `shared.js` | 2026.04.05 |
| 53 | Hide MAC addresses | `shared.js` | 2026.04.05 |
| 54 | Scrub disk image filenames (qcow2/img/iso/raw/vmdk/vdi/vhd/vhdx) | `shared.js` | 2026.04.05 |
| 55 | Scrub /domains/ directory names in VM disk paths | `shared.js` | 2026.04.05 |
| 56 | Hide non-standard interface names (keeps eth/enp/docker/br/etc) | `shared.js` | 2026.04.05 |
| 57 | VM folder previews show "VM 1" instead of "Container 1" | `shared.js` | 2026.04.05 |
| 1 | 44px dropdown tap targets for touch devices | `folder-common.css` | 2026.04.04 |
| 2 | hover:none visibility for touch-only devices | `folder-common.css` | 2026.04.04 |
| 3 | Firefox scrollbar fallback (`scrollbar-width`, `scrollbar-color`) | `folder-common.css` | 2026.04.04 |
| 4 | Dashboard responsive breakpoints for all layouts | `dashboard.css` | 2026.04.04 |
| 1 | ~40 new keys across all 7 language files (settings, CSS tool, folder defaults, incognito) | `langs/*.json` | 2026.04.04 |
| 1 | PLG pre-install cleanup: removes stale package DB entries before install | `folder.view3.plg` | 2026.04.04 |
| 2 | PLG post-install cleanup: safety net for lingering package entries | `folder.view3.plg` | 2026.04.04 |
| 3 | PLG old .txz cleanup moved from post-install to pre-install | `folder.view3.plg` | 2026.04.04 |
| 4 | .DS_Store files removed and added to .gitignore | `.gitignore` | 2026.04.04 |

## Bug Fixes

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 173 | Live CPU/MEM stats always used the SSE fallback even when the GraphQL WebSocket was available. The Docker stats wiring decided WS-vs-SSE with a synchronous `if (fv3ApiAvailable && fv3CpuCores)` at module-parse time, but those globals are populated asynchronously by `fv3DetectApi()` (a /graphql fetch) — so they were always `null` when the check ran and the `else`/SSE branch always won; `fv3ConnectStats` (WebSocket) was never invoked on the Docker tab. Confirmed live via Chrome MCP (wsReadyState=null, transport=sse, apiAvailable=true) and the fix mechanism validated in-page (calling `fv3ConnectStats` post-detection → wsReadyState=1, stat delivered). Fix: wrap the transport decision in `fv3DetectApi().then(...)` so it runs after detection resolves. Low impact (SSE worked); restores the intended WebSocket transport. | `scripts/docker.js` | 2026.06.13.6 |
| 169 | Preview row separators (vertical bars/borders between wrapped preview rows) were recomputed only on a 300 ms debounce, with no re-trigger when container icons finished loading. On slow connections the `<img>` thumbnails had zero height when the math ran, so separators were misplaced/missing until a later resize. `fv3SetupPreviewMode`'s expand branch now recomputes `fv3UpdateRowSeparators` in the same `img.load`/`ResizeObserver`/RAF callback it already uses for overflow detection. | `scripts/shared.js` | 2026.06.13.1 |
| 170 | On a failed/timed-out folder data request, `loadedFolder` latched `true` before the un-awaited `createFolders()` ran, leaving folders blank with no retry until manual reload. Set and reset the flag in a `.catch()` (Docker/VM) so a later render recovers; Dashboard now `await`s `createFolders()` before applying layouts (also fixes layouts applying to a half-built DOM on slow loads). | `scripts/docker.js`, `scripts/vm.js`, `scripts/dashboard.js` | 2026.06.13.1 |
| 171 | With a CSS preset/accent active, container names in a folder preview that turned orange on update were overridden back to the preset colour: the guarded rules at `folder-common.css:207-208` excluded `.orange-text` but an older unguarded sibling at `:169-170` still matched. Added `:not(.orange-text)` to the sibling. | `styles/folder-common.css` | 2026.06.13.1 |
| 172 | Live CPU/MEM stats died silently when the GraphQL WebSocket closed cleanly (server restart, nginx reload, sleep/wake) — only `onerror` triggered the SSE fallback, not `onclose`. `onclose` now invokes the fallback unless the close was a deliberate teardown (flagged in the `beforeunload` cleanup). | `scripts/shared.js` | 2026.06.13.1 |
| 173 | Dashboard VM custom action (non-directPHP branch) passed an empty `&arg2=`, dropping configured script arguments; the Docker twin and the VM directPHP branch both pass `+args`. Fixed to match. | `scripts/dashboard.js` | 2026.06.13.1 |
| 174 | Hardening: top-level `localStorage` read in shared.js wrapped in try/catch so browsers blocking site data don't throw at parse time and take down all folder rendering. Removed dead `getAllPresets()` and `isCssDarkTheme()` helpers. | `scripts/shared.js`, `scripts/csstool.js` | 2026.06.13.1 |
| 166 | VM tab crashed with `HierarchyRequestError: …The new child element contains the parent` (at `createFolder` line 309) whenever a VM folder was named identically to a VM. The folder row renders the folder name inside `td.vm-name span.outer span.inner a.folder-appname` — the same path the per-container VM-row lookup matches by text. On a name collision the `$('#kvm_list > tr.sortable').filter(…)` selector matched both the real VM row and the folder row; since the folder row is inserted first, `.first()` returned the folder, and the subsequent `.folder-storage` append tried to place the folder inside its own descendant → DOM throws, aborting `createFolders()`, so the folder never rendered and the VM was left unfoldered. Added `:not(.folder)` to the candidate selector so folder rows can never be mistaken for VM rows. Docker (ID-based lookup + `.appname` vs `.folder-appname`) and Dashboard (`.not('.folder-vm')`) were already immune. Reproduced and verified live in-browser. | `scripts/vm.js` | 2026.05.28.1 |
| 157 | `actionFolderDocker` switch had `case "resume"` duplicated; the second case (intended as `"restart"`) was unreachable, so the "restart" action fell into `default` with `pass = false` and zero `fv3DockerAction('restart', …)` calls fired. Spinner blipped, containers untouched. Confirmed live via instrumented `window.fv3DockerAction` / `window.fv3GraphQL`. Renamed the second case to `"restart"` and gated it on `ct.state` so stopped containers aren't sent restart (no more "Execution error" swal). | `scripts/dashboard.js` | 2026.05.28 |
| 158 | `createFolderDocker` and `createFolderVM` captured each container's `pause` field but never aggregated it. The `if (started) { … fa-play … }` block ran whenever any container was running (Docker keeps `State.Running === true` while paused), so the folder icon stayed green even when all children were paused. Added `paused` counter; when `paused > 0 && paused === started` the icon swaps to `fa fa-pause … orange-text` and the state text uses the existing `paused` i18n key. `folder.status.paused` now persists alongside `started`. | `scripts/dashboard.js`, `scripts/docker.js`, `scripts/vm.js` | 2026.05.28 |
| 159 | When a docker folder had `override_default_actions = true` with at least one custom action, the Dashboard context menu wired the menu item to a function named `folderCustomAction` — which is only defined inside docker.js (Docker tab) and vm.js (VM tab), not on the Dashboard. Clicking threw `ReferenceError: folderCustomAction is not defined`. Routed the override-mode docker entries to the page-local `folderDockerCustomAction` and the VM entries to `folderVMCustomAction`. | `scripts/dashboard.js` | 2026.05.28 |
| 160 | The bulk Restart "pass" predicate in Docker's `actionFolder` (docker.js) and the Restart custom-action variant in both `folderDockerCustomAction` (dashboard.js) and `folderCustomAction` (docker.js) set `pass = true` / pushed unconditionally, so restart was sent to stopped containers too. Unraid's PHP `/update.htm action=restart` returns `{"success":"Server error"}` in that case, which `actionFolderDocker` surfaces as an "Execution error" swal. Added `ct.state` / `e.state` / `e_ct.state` guards on every restart push. | `scripts/dashboard.js`, `scripts/docker.js` | 2026.05.28 |
| 161 | VM custom-action "Set Restart" mode (`act.action === 1, act.modes === 3`) gated `domain-restart` on `state === "paused" || state === "unknown"` — libvirt can't reboot a paused VM, so the custom action effectively never fired on the correct state. Changed the predicate to `state === "running"` in both `vm.js` and `dashboard.js`. | `scripts/vm.js`, `scripts/dashboard.js` | 2026.05.28 |
| 156 | The `body[data-fv3-preset] .folder-appname` rule (specificity 0,2,1) was beating `.orange-text` (0,1,0), so folder names on Docker page and Dashboard stayed the preset accent color even when `preview_update_folder` / `dashboard_update_folder` were on. Added `:not(.orange-text)` to the preset folder-name selector to mirror the existing pattern used for preview-wrapper container names in the same file. | `styles/folder-common.css` | 2026.05.23 |
| 119 | Add `default_preview_status: 'none'` to `fv3SettingDefaults`. The map is the fallback the dirty-check (`fv3IsSettingsDirty`) uses when `fv3LoadedSettings[key]` is undefined. The new field had no entry, so the fallback chain resolved to `''`, and the select's actual value `'none'` was permanently flagged as a pending change — triggering the "You have unsaved changes. Discard them?" prompt on every tab switch / SPA navigation away from the FolderView3 settings page even when the user had touched nothing. | `folderview3.js` | 2026.05.21 |
| 120 | Unraid's top-nav links are `<a href="/Docker" onclick="initab('/Docker')">…</a>`. The intercepted `initab()` returned `false` to block the SPA tab switch, but because the inline `onclick` attribute lacks `return`, the return value is discarded and the browser still follows the `href` — so the swal fired alongside a full page load. Added a capture-phase document click listener that intercepts clicks on `a[onclick*="initab"]` before the inline `onclick` runs, calls `preventDefault` + `stopPropagation` when the form is dirty, shows the swal, and navigates manually via `window.location.href` only after the user picks Discard. | `folderview3.js` | 2026.05.21 |
| 123 | Add `typeof dockerload !== 'undefined'` guard to the SSE listener subscription inside the helper. Dashboard has no `dockerload` SSE source — the guard prevents a `ReferenceError` on Dashboard when WebSocket stats are unavailable; the popup still renders but graphs degrade to 0% (acceptable). | `scripts/advanced-preview.js` | 2026.05.21 |
| 127 | Add `dashboard_context: '0'` to `fv3SettingDefaults` to avoid phantom dirty-state on the settings page (same regression pattern as v2026.05.21.2 — without this entry, the dirty-check resolves the new field's fallback to `''`, conflicting with the select's actual value `'0'`). | `scripts/folderview3.js` | 2026.05.21 |
| 131 | Add `selected` attribute to the Combined option of `<select id="dashboard-context-graph">`. v.5 introduced the new dashboard Graph mode select with no `selected` on any option (HTML defaults to first = `value="0"`/None), but `fv3SettingDefaults.dashboard_context_graph = '1'`. With no saved value yet, the dirty-check resolved fallback to `'1'` while the actual select value was `'0'` — permanent phantom dirty flag the moment the page loaded. Matches how the Folder Defaults equivalent (`default-context-graph`) handles its initial state. | `FolderView3.page` | 2026.05.21 |
| 132 | Add `docker.css` to the Dashboard.page stylesheet loads. The advanced preview popup HTML template uses `.preview-outbox`, `.preview-name`, `.action-info`, `.info-section`, etc. — all defined in docker.css. Dashboard.page previously only loaded dashboard.css, so on Dashboard the popup rendered with no styling at all. | `folder.view3.Dashboard.page` | 2026.05.21 |
| 133 | When attaching the advanced preview tooltipster to a Dashboard container's `span.hand` in Advanced mode, strip its inline `onclick="addDockerContainerContext(...)"` attribute. Unraid's native click handler fires synchronously alongside tooltipster's click handler, so without this both the default Unraid context menu AND our advanced popup would open on the same click. In Default mode the helper isn't attached, so the native menu still works. | `scripts/dashboard.js` | 2026.05.21 |
| 135 | Load `folder-common.css` on Dashboard.page (previously only Docker.page / VMs.page / Folder.page loaded it — Dashboard was an oversight). This restores the shared CSS variables the popup styles reference: `--folder-view3-graph-cpu` / `--folder-view3-graph-mem` (the Chart.js line colors were resolving to empty string and falling back to Chart defaults — wrong colors), `--fv3-tooltip-min-width` / `-max-height` / `-action-pane-width`, `--fv3-surface-tint` / `-hover-bg` / `-border` / `-tab-active-bg` / `-tab-active-border`, `--tooltip-spacing`. | `folder.view3.Dashboard.page` | 2026.05.21 |
| 136 | Override `.tooltipster-docker-folder.tooltipster-base { background: transparent; }` in both docker.css and dashboard.css. Unraid's default `.tooltipster-sidetip` theme paints the outer base with `rgb(29, 27, 27)` (dark backdrop) — visible as a black box surrounding the popup content with the arrow attached to it. Setting it transparent removes the backdrop while the arrow and orange top accent on `.tooltipster-box` remain. Both pages get this for consistency. | `styles/docker.css`, `styles/dashboard.css` | 2026.05.21 |
| 137 | v.9 added the `.tooltipster-base { background: transparent; }` override to dashboard.css only — the symmetric edit to docker.css failed silently (Edit tool error from skipping the Read step). v.10 applies the same override to docker.css so the Docker tab also drops the black backdrop. | `styles/docker.css` | 2026.05.21 |
| 138 | `.preview-outbox` had `background-color: inherit`, which after v.10's `.tooltipster-base` transparency change inherited transparency all the way up to body. Page content showed through the popup. Replaced with `hsla(var(--background, 0 0% 11%), 1)` (theme-aware via Unraid's HSL background variable, opaque fallback for older themes) + a soft box-shadow for elevation and a subtle 1px border. Applied to both docker.css and dashboard.css for consistency. | `styles/docker.css`, `styles/dashboard.css` | 2026.05.21 |
| 139 | C1: CPU% wrong on servers without GraphQL API. dashboard.js was passing `cpus: window.fv3CpuCores || 1`. `fv3CpuCores` only gets set by the GraphQL probe in shared.js; on Unraid <7.2 or with API disabled it stays null, so SSE-path `cpuVal / cpus` rendered CPU as `cores× actual`. Added `$.get('/plugins/folder.view3/server/cpu.php')` fetch inside `fv3InitDashboardStats()` populating `dashboardCpus` as fallback. | `scripts/dashboard.js` | 2026.05.21 |
| 140 | C2: Dropped non-functional Default Preview context option. v.5 added a 3-state select but `dashboard.js` only branched on `=== 2`, so value `1` silently did nothing while help text claimed it would show basic info. Reduced to 2 options: `value="0"` Default (Unraid native menu) and `value="2"` Advanced (FV3 popup). Allowlist keeps `[0,1,2]` for forward compat. | `FolderView3.page`, `langs/*.json` | 2026.05.21 |
| 143 | H4: Tooltipster availability guard. Added `if (!$.fn.tooltipster) return;` at the top of `fv3AttachAdvancedPreview`. Cheap insurance against future Unraid changes. | `scripts/advanced-preview.js` | 2026.05.21 |
| 145 | v.11 used `background-color: hsla(var(--background, 0 0% 11%), 1)` to make the popup opaque. That syntax is invalid CSS — `hsla()` expects either all-comma (`hsla(H, S%, L%, A)`) or modern slash separator inside `hsl()` (`hsl(H S% L% / A)`). Mixing space-separated HSL components with a comma-separated alpha produced an invalid color, browsers fell back to `rgba(0,0,0,0)` (transparent), and the popup looked transparent again. Switched to `hsl(var(--background, 0 0% 11%))` (no alpha needed since we want fully opaque). Verified `computedBg: rgb(10, 10, 10)` after fix. | `styles/docker.css`, `styles/dashboard.css` | 2026.05.21 |
| 146 | v.12 used `hsl(var(--background, 0 0% 11%))` thinking `--background` was Unraid's theme background variable. It isn't — `--background` is hardcoded to `0 0% 3.9%` on both light and dark themes (not theme-aware). The ACTUAL theme-aware variable is `--background-color` (with hyphen), defined in `default-base.css` as the `body { background-color: ... }` source. On light themes it's `#f2f2f2`, on dark themes it's `#1d1b1b`-ish. Switched popup background to `var(--background-color, rgb(29, 27, 27))`. Light themes now get a light popup, dark themes a dark popup. The 1px border + box-shadow keep it visually distinct from the page. | `styles/docker.css`, `styles/dashboard.css` | 2026.05.21 |
| 147 | v.13's CSS edit silently failed because the `background-color: hsl(var(--background, 0 0% 11%));` string matched twice per file (main rule + mobile @media block) and Edit tool refused without `replace_all: true`. v.13 was built and pushed without the actual change. v.14 re-ran with `replace_all: true` on both docker.css and dashboard.css. Lesson learned: when Edit fails, the build can still ship with stale CSS — always verify the change made it into the build before pushing. | `styles/docker.css`, `styles/dashboard.css` | 2026.05.21 |
| 148 | `pushChartData()` called `chart.update('quiet')` unconditionally on each entry of the `charts` array. When a WS stats event fired after tooltipster's `functionAfter` had begun destroying charts, the call hit a destroyed chart and chartjs-plugin-streaming threw `TypeError: Cannot set properties of null (setting '_setStyle')`. Wrapped the update loop with try/catch and added a `chart.canvas && document.body.contains(chart.canvas)` guard to skip stale references silently. | `scripts/advanced-preview.js` | 2026.05.21 |
| 149 | Two leaks in the advanced preview tooltipster's stats-listener lifecycle: (a) `functionReady` can fire more than once per popup lifecycle (esp. hover trigger), each call added another listener; `functionAfter`'s `removeEventListener` only matched one closure reference, so duplicates accumulated; (b) `functionAfter` decided which listener to remove based on the CURRENT `fv3UsingWebSocket` flag, which may have flipped between attach and remove time. Introduced an `attachedListener` closure-scoped tracker (`'ws' \| 'sse' \| null`) so attach is idempotent and remove uses the tracked type. The v.15 try/catch in `pushChartData` stays as defense-in-depth. | `scripts/advanced-preview.js` | 2026.05.21 |
| 110 | Fix Unraid's Reset Order button — silently broken on every server running FV3 since the userprefs.cfg interceptor was added. FV3's `$.ajaxPrefilter` for `/plugins/dynamix.docker.manager/include/UserPrefs.php` assumed a save-order payload with `names=…`; the Reset Order POST is `{reset:true}` with no `names` field, so `data.get('names').split(';')` threw `TypeError: Cannot read properties of null (reading 'split')` synchronously inside the prefilter and the request never reached Unraid. Added early-return guard `if (!data.has('names')) return;`. Same fix applied to the VM tab prefilter. | `docker.js`, `vm.js` | 2026.05.15 |
| 111 | Patch `resetSorting()` to chain a `sync_order.php` POST between Unraid's reset and `loadlist()`. Stock Unraid's reset deletes `userprefs.cfg` and natcasesorts the autostart file alphabetically. The patch restores folder-grouped autostart before the page re-renders. | `docker.js` | 2026.05.15 |
| 112 | Stop auto-writing `userprefs.cfg` on folder save. The pre-existing `syncContainerOrder()` rewrote `userprefs.cfg` after every folder edit, which permanently flipped Unraid into "manual order mode" — silently disabling Unraid's native alphabetical sort for new containers and pinning new folders to the bottom of the list. The function now only rewrites the autostart file; render order is left entirely to Unraid (alphabetical when `userprefs.cfg` is absent, manual when the user drag-reorders). | `lib.php` | 2026.05.15 |
| 114 | Add post-sort pass for alpha-synthesis mode. `createFolder()`'s `positionInMainOrder` is an index into the order array, but the DOM has containers in pure alphabetical order while the synthesized array has folders interleaved with orphans — the indices don't map cleanly. Final pass reattaches top-level sortable rows alphabetically by name after all folders are built. Manual mode is unaffected. | `docker.js` | 2026.05.15 |
| 116 | New `ajaxComplete` hook fires `sync_order.php` after Unraid's autostart-toggle (`UpdateConfig.php?action=autostart` / `action=wait`) and drag-reorder save (`UserPrefs.php` with `names=…`). Without this, Unraid resorts the autostart file (natcasesort when `userprefs.cfg` is absent, by `userprefs.cfg` position when present) and silently breaks folder grouping on every autostart toggle. The hook re-establishes folder grouping by walking the current render order and rewriting the autostart file. Combined with the Reset Order patch, the autostart file now stays in sync across all four state-changing events: folder save, Reset Order, drag-reorder, and autostart toggle. | `docker.js` | 2026.05.15 |
| 107 | Fix `verHint = 0` in hoist loop. The `.908` filter excluded `visibility:hidden` status spans to skip hidden update-state siblings — but `visibility` is inherited, and the hoist loop applies `visibility:hidden` to the entire `<tr>` while measuring. Every status span inherited hidden visibility and got filtered out, leaving `verContentMax = 0` and the Version column stuck at its natural ~197px table-layout:auto width. Switched to `display:none`-only filtering inside the hoist sub-scan; `getBoundingClientRect()` returns layout width regardless of visibility. | `shared.js` | 2026.05.02 |
| 108 | Tail-call `fv3SchedulePillSize` from `fv3ApplyCachedWidths` so collapse can shrink stuck rows. `docker-post-folder-expansion` queues both `fv3SchedulePillSize` (50ms) and `fv3ScheduleApplyCachedWidths` (50ms). When pill-sizing won the race, it measured the still-narrow Volume Mappings column (chips wrapped, preview tall) and re-pinned the pill at the expanded value (e.g. 95px). When `fv3ApplyCachedWidths` then widened the column and chips unwrapped, the pill was already locked, leaving the row stuck at 103px instead of dropping back to 67px. Tail-call fires a second pass after column widths settle. Mirrors the `.905` fix for basic↔advanced toggle path. | `shared.js` | 2026.05.02 |
| 85 | Stabilize Docker table columns: probe expanded-child widths, inject zero-height hint row, cap VERSION cell content with ellipsis so preview row left edge stops shifting on folder expand/collapse (issue #31) | `shared.js`, `docker.js` | 2026.04.30 |
| 88 | Lock Docker table columns in advanced view: bump `verHint` padding buffer from +2 to +12 to absorb auto-layout discrepancy between folder rows (2 stacked divs) and child rows (3 stacked divs) — kills the ~7px Version column shift on expand. Cap total column-sum to container width and proportionally scale cols 2-6 (NET/IP/PORT/LAN/VOL) when natural widths would overflow — kills the persistent horizontal scrollbar in advanced view | `shared.js` | 2026.04.30 |
| 89 | Fix Firefox-only folder pill border bug. Pre-existing CSS `body[data-fv3-preset] td.folder-name { height: 1px }` + `.folder-name-sub { height: 100% }` was a Chromium/WebKit table-cell stretch hack that Firefox doesn't honor, leaving the bordered pill ~20px tall and drawing through the icon and text. Replaced with a JS function `fv3SizeFolderPills()` that measures `tr.folder` row height, subtracts td vertical padding, and applies inline height. Hooked to `folderEvents` post-folders-creation, post-folder-expansion, and `window resize`. Pill now matches preview pill height in every browser. | `shared.js`, `folder-common.css` | 2026.04.30 |
| 99 | Fix folder-name chevron alignment under CSS preset by re-running widthFix after preset apply. Inside `fv3LoadToggleStyle`'s success callback in [customEvents.js:197](src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/include/customEvents.js:197), call `window.fv3ScheduleWidthFix()` after the preset attribute is set/removed. This makes the APPLICATION column re-measure with the preset's extra pill padding/border accounted for, so the cell is wide enough for natural folder name widths plus the chevron without overflow. (Final fix after #96–#98 iteration that explored truncation/min-width approaches.) | `customEvents.js`, `folder-common.css` | 2026.04.30 |
| 100 | Folder-name pill height now tracks the row fluidly during window resize and shrinks back when expand-mode chips re-fit on fewer rows. Two-part fix in [shared.js:1339](src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/shared.js:1339): (1) **Clear-measure-reset** in `fv3SizeFolderPills` — `sub.style.height = ''` before measuring `td.getBoundingClientRect().height`. Without this the pill's own inline height props the cell open, the measurement returns whatever the pill was last set to, and the pill never shrinks back when chips re-fit on fewer rows (the v7 lingering-tall-row bug). (2) **ResizeObserver attached to the preview CELL** (sibling of folder-name cell), not the folder row. Preview cell height is independent of the pill, so setting pill height does not feed back into the observer — it fires only on real chip reflow. Observing the row itself (or any ancestor of the pill) caused immediate runaway growth in earlier attempts (verified failure mode, see "preview-border-basic-view-failed-attempts" memory). Verified live in Chrome MCP: 1223 samples across resize sweep 1700→1100→900→1700, gap=8 throughout (one 30ms transient frame); 200 dispatched resize events plus 30 s idle, zero growth on all 10 folders. | `shared.js` | 2026.04.30 |
| 102 | Refresh advanced popup state on open and sum per-container `--memory=` limits when computing the folder RAM total — popup state was previously stale on re-open, and folder RAM total ignored explicit per-container memory caps | `docker.js` | 2026.04.30 |
| 103 | Strip inline styles from switches added to the DOM after page load so the custom toggle style applies to advanced-popup autostart switches (which are added dynamically and inherited Unraid's inline `width`/`height` props that overrode the styled-switch CSS) | `customEvents.js` | 2026.04.30 |
| 82 | Fix scroll/expand overflow modes inflating Docker/VM table past viewport (max-width:0 on preview td, min-width:0 on preview flex) | `folder-common.css` | 2026.04.30 |
| 84 | `align-content: safe center` on preview flex — stops row 1 shifting when row 2 briefly appears before `clipPreview()` runs | `folder-common.css` | 2026.04.30 |
| 95 | Fix volume mappings rendering at full height with no chevron after toggling Basic↔Advanced view while a folder was collapsed. Unraid's `listview()` re-runs the readmore plugin on view toggle but skips elements that are currently hidden — child rows tucked inside `.folder-storage` (collapsed folder state) end up unwrapped, so when you later expand the folder the volumes show in full with no `readmore-js-collapsed` wrapper or chevron. Fix: in `fv3DropDownButton`, after revealing child rows, call `$readmoreEls.readmore('destroy').readmore({...})` with Unraid's canonical options (`maxHeight: 32`, chevron-down/up icons) on `.folder-${id}-element .docker_readmore`. Idempotent across multiple expand/collapse cycles. Gated to `eventPrefix === 'docker'`. | `shared.js` | 2026.04.30 |
| 67 | Fix Add Folder button missing on Unraid 7.0.1 | `docker.js`, `vm.js`, `dashboard.js` | 2026.04.14 |
| 68 | Fix incognito button placement on Unraid < 7.2 | `shared.js` | 2026.04.14 |
| 69 | Fix VM page crash: load `libvirt_helpers.php` at top level | `lib.php` | 2026.04.14 |
| 70 | Defensive loadlist patching in vm.js and dashboard.js | `vm.js`, `dashboard.js` | 2026.04.14 |
| 71 | Fix CSS: incognito bar overlap, settings toggle alignment, button spacing | `folderview3.css`, `folder-common.css` | 2026.04.14 |
| 72 | Fix grid layouts, incognito timing, float fixes for 7.0.x | `docker.js`, `shared.js`, CSS | 2026.04.14 |
| 73 | Fix table margin overrides: incognito gap, backup table, folder accordion | `folderview3.css`, `docker.css` | 2026.04.14 |
| 74 | Fix TDZ errors on slow connections: hoist global variable declarations | `docker.js`, `dashboard.js` | 2026.04.14 |
| 75 | Fix folder editor crash when editing legacy folders without settings | `folder.js` | 2026.04.14 |
| 76 | Fix dashboard settings tab toggle/label alignment | `folderview3.css` | 2026.04.14 |
| 77 | Fix media query breakpoint consistency (769px → 768px) | CSS | 2026.04.14 |
| 78 | Fix incognito image tag scrubbing and tooltip DOM error | `shared.js` | 2026.04.14 |
| 79 | Fix incognito folder name and update column scrubbing | `shared.js` | 2026.04.14 |
| 30 | Fix tooltip resize: ResizeObserver replaces setTimeout | `docker.js` | 2026.04.14 |
| 31 | Fix dropdown chevrons and tooltip repositioning on accordion toggle | `docker.css`, `docker.js` | 2026.04.14 |
| 32 | Fix graph axis label clipping and container overflow | `docker.css`, `docker.js` | 2026.04.14 |
| 33 | Fix CSS preset cards to 2-column grid layout | `csstool.css` | 2026.04.14 |
| 34 | Fix transparent tooltip background on advanced preview | `docker.css` | 2026.04.14 |
| 61 | Fix preview clipping hiding containers due to sub-pixel rounding with custom CSS themes — `clipPreview` and `checkExpand` used strict `offsetTop` equality, replaced with `offsetHeight/2` tolerance | `shared.js` | 2026.04.08 |
| 62 | Fix row separator false row breaks from sub-pixel rounding — same tolerance pattern as #61 | `shared.js` | 2026.04.08 |
| 63 | Fix dashboard fullwidth panel row detection — replace `Math.round() ===` with `Math.abs() <= 2` tolerance | `dashboard.js` | 2026.04.08 |
| 64 | Fix VM name column width selector targeting non-existent `#vm_list` — changed to `#kvm_table` (dead code since original fork) | `vm.js` | 2026.04.08 |
| 65 | Fix incognito mode not hiding "By:" registry/image info — walk text nodes for both link and plain-text repos, label as `registry/image` | `shared.js` | 2026.04.08 |
| 66 | Fix incognito race condition — remove 500ms auto-apply timeout that fired before `createFolders()`, causing VM name matching to fail. Now only applies via `folderEvents` post-creation listeners | `shared.js` | 2026.04.08 |
| 60 | Fix CSS presets overriding orange update-available text — removed accent override on `.folder-update-text`, added `:not(.orange-text)` exclusion on preview appname selectors | `folder-common.css` | 2026.04.07 |
| 59 | Fix folder settings page toggles showing wrong ON/OFF state on load (race condition between CSS config fetch and folder data fetch) | `folder.js` | 2026.04.06 |
| 58 | Use text node walking instead of innerHTML for table cell scrubbing (preserves event handlers) | `shared.js` | 2026.04.05 |
| 101 | CSS-only chevron positioning (deleted `fv3PositionChevrons()` entirely) | `dashboard.js`, `dashboard.css` | 2026.04.04 |
| 102 | Dashboard CSS variable gaps wired up | `dashboard.css`, `folder-common.css` | 2026.04.04 |
| 103 | Switch button alignment/specificity fixes (beat ID selectors) | `folder-common.css`, `csstool.css` | 2026.04.04 |
| 104 | Mobile dashboard overflow for all layout styles | `dashboard.css` | 2026.04.04 |
| 105 | Fullwidth expanded folder alignment | `dashboard.css`, `dashboard.js` | 2026.04.04 |
| 106 | Theme branch naming in GitHub imports | `csstool.js`, `upload_theme.php` | 2026.04.04 |
| 107 | VNC websocket port validation | `folder.js` | 2026.04.04 |
| 108 | JSON double-parse fix after Content-Type header addition | `docker.js`, `vm.js`, `dashboard.js` | 2026.04.04 |
| 109 | Incognito mode destroying folder name DOM structure | `docker.js` | 2026.04.04 |
| 110 | Apply Defaults applying stale server values instead of form state | `folderview3.js` | 2026.04.04 |
| 111 | VM detail rows positioned correctly in expanded folders | `vm.js` | 2026.04.04 |
| 112 | MutationObserver loop prevention for VM detail row adoption | `vm.js` | 2026.04.04 |
| 113 | Non-folder VM detail rows stay in correct position | `vm.js` | 2026.04.04 |
| 114 | Zebra striping preserved after VM detail toggle (event delegation) | `vm.js` | 2026.04.04 |

---

## Quick Reference: All Changes vs Upstream (folder.view2)

### Rebrand

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Full rebrand from folder.view2 to folder.view3 | 67 files | 2026.02.16 |
| 2 | Docker label changed from `folder.view2` to `folder.view3` | `docker.js`, `dashboard.js`, `folder.js` | 2026.02.16 |
| 3 | CSS variables renamed `--folder-view2-graph-*` to `--folder-view3-graph-*` | `docker.css`, `docker.js` | 2026.02.16 |
| 4 | Debug prefix renamed `FV2_DEBUG` to `FV3_DEBUG` | `docker.js`, `lib.php` | 2026.02.16 |
| 5 | Language key renamed `folderview2-desc` to `folderview3-desc` | All 7 `langs/*.json` | 2026.02.16 |
| 6 | Plugin file renamed `folder.view2.plg` to `folder.view3.plg` | `.plg` | 2026.02.16 |

### New Features

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Split border and vertical bars into separate color pickers | `Folder.page`, `folder.js`, `docker.js`, `vm.js` | 2026.02.04 |
| 16 | Per-container "Hide Preview" toggle in folder editor | `Folder.page`, `folder.js`, `folder.css`, `docker.js`, `vm.js` | 2026.03.05 |
| 2 | Nested color pickers under parent toggles | `Folder.page`, `folder.js` | 2026.02.04 |
| 3 | Container order sync on folder save (`syncContainerOrder`) | `lib.php`, `folder.js`, `sync_order.php` (new) | 2026.02.10 |
| 4 | Autostart order synced with folder container layout | `lib.php` | 2026.02.10 |
| 5 | Folder WebUI toggle + URL input in folder editor | `Folder.page`, `folder.js` | 2026.02.11 |
| 6 | WebUI button in Docker tab context menu | `docker.js` | 2026.02.11 |
| 7 | WebUI button in Dashboard context menu | `dashboard.js` | 2026.02.11 |
| 8 | Stale autostart cleanup on page load | `lib.php` (readInfo) | 2026.02.11 |
| 9 | Export/Delete tooltips on Settings page folder buttons | `folderview3.js` | 2026.02.16 |
| 10 | Docker Compose and 3rd Party container awareness (`managerTypes` Set) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 11 | Compose/3rd Party/mixed labels in folder update column | `docker.js` | 2026.02.24 |
| 12 | Compose/3rd Party labels in advanced preview tooltip | `docker.js` | 2026.02.24 |
| 13 | Hide autostart toggle for non-dockerman folders | `docker.js`, `dashboard.js` | 2026.02.24 |
| 14 | i18n keys for Compose and 3rd Party labels (all 7 languages) | `langs/*.json` | 2026.02.24 |
| 15 | Stacked Compose + 3rd Party labels for mixed folders | `docker.js` | 2026.02.24 |
| 17 | Dashboard layout options: Classic, Full-width Panel, Accordion, Inset Panel | `dashboard.js`, `dashboard.css`, `FolderView3.page`, `folderview3.js`, `folderview3.css`, `lib.php`, `read_settings.php` (new), `update_settings.php` (new), `langs/*.json` | 2026.03.17 |
| 18 | Separate Docker and VM dashboard layout settings | `FolderView3.page`, `folderview3.js`, `dashboard.js` | 2026.03.17 |
| 19 | Folder name label in child panels for non-classic layouts | `dashboard.js`, `dashboard.css` | 2026.03.17 |
| 20 | Allow Unicode characters in folder names (CJK, Cyrillic, etc) — blocklist approach | `Folder.page`, `langs/*.json` | 2026.03.17 |
| 21 | Quick collapse (expand toggle) for non-Classic dashboard layouts | `dashboard.js`, `dashboard.css`, `FolderView3.page`, `folderview3.js`, `folderview3.css`, `langs/*.json` | 2026.03.19 |
| 22 | Per-folder preview overflow setting (Default / Expand Row / Scroll) | `Folder.page`, `folder.js`, `docker.js`, `docker.css`, `langs/*.json` | 2026.03.19 |
| 23 | Responsive mobile breakpoints for dashboard child tiles (3-col at 768px, 2-col at 480px) | `dashboard.css` | 2026.03.19 |
| 24 | Auto-width dashboard tiles for folders with ≤3 children | `dashboard.js` | 2026.03.19 |
| 25 | Dynamic NAME column width on VM page based on longest name | `vm.js` | 2026.03.19 |
| 26 | Embossed dashboard layout with CSS borders and themed backgrounds | `dashboard.js`, `dashboard.css`, `FolderView3.page`, `folderview3.js`, `lib.php`, `langs/*.json` | 2026.03.21 |
| 27 | Expand/collapse animation toggle for dashboard layouts | `dashboard.js`, `dashboard.css`, `FolderView3.page`, `folderview3.js`, `lib.php`, `langs/*.json` | 2026.03.21 |
| 28 | CSS custom properties for embossed and inset panel theming | `dashboard.css`, `dashboard.js` | 2026.03.21 |

### Security

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Switch delete operations from GET to POST | `dashboard.js`, `docker.js`, `vm.js`, `folderview3.js`, `delete.php` | 2026.03.04 |
| 2 | Add `escapeHtml()` for XSS prevention on user-controlled data in HTML templates | `customEvents.js`, `folder.js`, `folderview3.js`, `docker.js`, `dashboard.js`, `vm.js` | 2026.03.04 |
| 3 | Add `fv3_validate_type()` allowlist validation on all PHP endpoints | `lib.php`, all `server/*.php` | 2026.03.04 |
| 4 | Add CSRF token to AJAX POST requests | `customEvents.js`, `folder.js`, `folderview3.js` | 2026.03.04 |
| 5 | Wrap buttons in `buttons-spaced` for responsive layout | `Folder.page` | 2026.03.04 |
| 6 | Use CSS variables with fallbacks for theme compatibility | `docker.css` | 2026.03.04 |
| 7 | Responsive fixes for preview tooltip and dialog widths | `docker.css`, `folder.js` | 2026.03.04 |
| 8 | Sanitize debug exports — strip env vars, network settings, ports, redact IPs | `docker.js`, `dashboard.js` | 2026.04.01 |

### Bug Fixes

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Docker Compose containers not grouped into folders | `docker.js` | 2026.02.03 |
| 2 | CPU/Memory stats not updating in advanced view (SSE) | `docker.js` | 2026.02.03 |
| 3 | Plugin download URL: `raw.github.com` + `master` branch | `.plg` | 2026.02.03 |
| 4 | nginx 404 errors from missing Docker Manager CSS | `Folder.page` | 2026.02.03 |
| 5 | Expanded folder bottom border using user's border color | `docker.js`, `vm.js` | 2026.02.04 |
| 6 | Archive packaging structure (build/ prefix) | `pkg_build.sh` | 2026.02.05 |
| 7 | VM folder assignment bug (index-based matching) | `vm.js` | 2026.02.07 |
| 8 | CPU/Memory text wrapping "GiB" on own line | `docker.css` | 2026.02.07 |
| 9 | Folder name wrapping in basic view | `docker.css`, `vm.css` | 2026.02.08 |
| 10 | Autostart toggles showing OFF after plugin update | `docker.js`, `vm.js` | 2026.02.09 |
| 11 | Color reset button appearing below color swatch | `folder.css` | 2026.02.09 |
| 12 | Dashboard showing wrong containers in folders (index-based) | `dashboard.js` | 2026.02.09.1 |
| 13 | Autostart toggle race condition (overlapping AJAX) | `docker.js` | 2026.02.10 |
| 14 | `readUserPrefs()` returning JSON object instead of array | `lib.php` | 2026.02.10 |
| 15 | VM folder image missing `folder-img-vm` class on Dashboard | `dashboard.js` | 2026.02.15 |
| 16 | VM folder name missing `folder-appname-vm` wrapper on Dashboard | `dashboard.js` | 2026.02.15 |
| 17 | Settings page folder table staggered layout | `folderview3.css` | 2026.02.16 |
| 18 | VM folder column misalignment (hardcoded colspan) | `vm.js` | 2026.02.16.1 |
| 19 | VM folder collapse button stuck (hardcoded `td[colspan=5]` selector) | `vm.js` | 2026.02.17 |
| 20 | VM folder crash on invalid regex in folder config | `vm.js` | 2026.02.17 |
| 21 | VM folder crash when deleted VM still in folder config | `vm.js` | 2026.02.17 |
| 22 | VM context menu crash if `globalFolders[id]` is undefined | `vm.js` | 2026.02.17 |
| 23 | VM folder action errors showing `false` instead of error text | `vm.js` | 2026.02.17 |
| 24 | VM folder action error title not translated (hardcoded English) | `vm.js` | 2026.02.17 |
| 25 | Folder export/debug download triggers Unraid external link warning (`data:` URL) | `folderview3.js`, `docker.js`, `vm.js`, `dashboard.js` | 2026.02.17.1 |
| 26 | Container autostart with wait timer disabled on tab switch (wrong delimiter parsing autostart file) | `lib.php` | 2026.02.19 |
| 27 | Improved folder expand button shifting when folder is toggled (table recalculates column width) | `docker.css`, `vm.css` | 2026.02.23 |
| 28 | Dashboard folder title uses `blue-text` instead of `orange-text` when `preview_update` is enabled | `dashboard.js` | 2026.02.23 |
| 29 | Dashboard container names in folder showcase not styled orange when updates available | `dashboard.js` | 2026.02.23 |
| 30 | Unsorted containers on folder settings page appear in Docker creation order instead of alphabetical | `folder.js` | 2026.02.23 |
| 31 | False orange update text on Compose/3rd Party containers (`Updated` field unreliable for non-dockerman) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 32 | Autostart count incorrectly including Compose containers (Autostart undefined passes check) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 33 | Tooltip operator precedence bug: `!Updated === false` evaluates wrong for null/undefined | `docker.js` | 2026.02.24 |
| 34 | Compose container duplicate on folder settings page (`choose.filter` not removing label-matched items) | `folder.js` | 2026.02.24 |
| 35 | Autostart toggle visible for non-dockerman folders (Compose/3rd Party don't support autostart) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 36 | Folder drag-and-drop not working for compose/3rd-party-only folders (jQuery UI Sortable not refreshed) | `docker.js` | 2026.02.24 |
| 37 | jQuery selector crash for container names with CSS special characters (e.g. `Dash.`) | `docker.js` | 2026.02.26 |
| 38 | `customEvents.js` not using `autov()` cache-busting (stale scripts after update) | `folder.view3.Docker.page`, `folder.view3.VMs.page`, `folder.view3.Dashboard.page` | 2026.03.04.1 |
| 39 | VM folder template had orphan hidden child row | `vm.js` | 2026.03.04.1 |
| 40 | VM tab row alternating colors broken by folder insertion (nth-child CSS counts hidden rows) | `vm.js` | 2026.03.06 |
| 41 | `customEvents.js` `const` declarations cause SyntaxError when Compose Manager re-declares same identifiers | `customEvents.js` | 2026.03.06 |
| 42 | VM `applyVmZebra()` inline styles block custom CSS row color overrides — added `--fv3-row-alt-bg` / `--fv3-row-bg` CSS variable fallbacks | `vm.js` | 2026.03.07 |
| 43 | Unconditional `libvirt_helpers.php` include crashes Docker page when VM manager/libvirt is unavailable — lazy-load only when VM operations are requested | `lib.php` | 2026.03.16 |
| 44 | Dashboard "Started Only" toggle causes blank rows in accordion/inset layouts — `fv3UpdateHidden` used `css('display')` check (timing-dependent) instead of `.stopped` class | `dashboard.js` | 2026.03.17 |
| 45 | Full-width panel appearing at bottom instead of after folder's grid row — `offsetTop` unreliable, switched to `getBoundingClientRect().top` with `display: contents` on wrapper divs | `dashboard.js`, `dashboard.css` | 2026.03.17 |
| 46 | Inset panel broken with multiple folders — expanded `.folder-showcase-outer` constrained to single tile width, added `flex-wrap` and `flex-basis: 100%` | `dashboard.css` | 2026.03.17 |
| 47 | Full-width panel overhanging container box — missing `box-sizing: border-box` | `dashboard.css` | 2026.03.17 |
| 48 | Dashboard child tiles showing different background than classic mode — removed tile chrome (background, border, box-shadow) inside expansion panels | `dashboard.css` | 2026.03.17 |
| 49 | Folder name/icon not vertically centered in Docker and VM rows — Unraid's `span.outer` sets `margin-bottom: 20px`, override with higher-specificity selector | `docker.css`, `vm.css` | 2026.03.19 |
| 50 | Chevron button not centered in dropdown box on Docker and VM pages — adjusted padding | `docker.css`, `vm.css` | 2026.03.19 |
| 51 | Inset SVG border not resizing when toggling Started Only — replaced `setTimeout` with `ResizeObserver` on `.folder-showcase` elements | `dashboard.js` | 2026.03.19 |
| 52 | Negative SVG rect dimensions when all children hidden in Inset layout — check for visible children before drawing | `dashboard.js` | 2026.03.19 |
| 53 | Dashboard settings race condition — concurrent `update_settings.php` requests cause read-modify-write collision, wiping other keys. Fixed with `flock(LOCK_EX)` for atomic file access and `fv3SuppressToggle` flag to prevent `switchButton` change events firing duplicate saves during programmatic resets | `lib.php`, `folderview3.js` | 2026.03.19.1 |
| 54 | Blank gaps in classic dashboard layout — folder wrapper divs (`folder-showcase-outer`) were block-level elements disrupting tile flow. Fixed with `display: contents` to remove wrappers from layout, `display: flex; flex-wrap: wrap` on the `<td>`, and fixed pixel `max-width` on folder names instead of circular percentage dependency | `dashboard.css` | 2026.03.20 |
| 55 | Dashboard items wrap right/center on narrow screens for inset, embossed, fullwidth — missing `display: flex` on td (only `flex-wrap` was set). Added explicit `display: flex` | `dashboard.css` | 2026.03.22 |
| 56 | Expanded fullwidth panel stays visible when folder hidden by Started Only toggle — `fv3-fullwidth-panel` is a sibling, not child. Added panel toggle in `fv3UpdateHidden()` and `:not(.fv3-hidden)` guard in `fv3FullwidthReflow()` | `dashboard.js` | 2026.03.22 |
| 57 | Chevron position wrong after toggling Started Only back — stale absolute-positioned chevrons not refreshed. Added chevron removal + double-rAF re-injection in change handler | `dashboard.js` | 2026.03.22 |
| 58 | Dashboard expand/collapse animation fires when disabled — CSS transitions applied unconditionally. Gated behind `.fv3-animate` parent class toggled by `applyDashboardLayouts()` | `dashboard.css`, `dashboard.js` | 2026.03.22 |
| 59 | Removed all `!important` from dashboard CSS — replaced with element+class selectors (`button.fv3-expand-toggle`), layout-specific compound selectors, and cascade ordering for custom CSS compatibility | `dashboard.css` | 2026.03.22 |
| 60 | Fullwidth panel wrong row after Started Only toggle — panels were destroyed and recreated with stale layout. Changed to preserve panels in place via `fv3UpdateHidden` toggle, trigger ResizeObserver with layout nudge, make `fv3FullwidthExpand` idempotent, skip `fv3FullwidthReflowSync` when panels exist | `dashboard.js` | 2026.03.23 |
| 61 | Chevron position wrong after Started Only toggle — tabs report zero dimensions after unhide. Added `offsetWidth`/`offsetHeight` guard to both inset and fullwidth positioning, 200ms retry with `fv3UpdateInsetBorders` redraw for SVG borders | `dashboard.js` | 2026.03.23 |
| 62 | Renamed `fv3-expand-toggle` to `fv3-collapse-toggle`, `fv3InjectExpandToggles` to `fv3InjectCollapseToggles`, `fv3DockerExpandToggle`/`fv3VmExpandToggle` to collapse variants. `fv3-expanded-tab` class now only added when collapse toggle is enabled | `dashboard.js`, `dashboard.css` | 2026.03.23 |
| 63 | Added `fv3-*` CSS classes to all dashboard folder elements: `fv3-folder-hand`, `fv3-folder-icon`, `fv3-folder-inner`, `fv3-folder-appname-docker`/`-vm`, `fv3-folder-status-icon`, `fv3-folder-state`, `fv3-folder-storage`, `fv3-folder-showcase`, `fv3-standalone`. Generic + type-suffixed variants | `dashboard.js` | 2026.03.23 |
| 64 | Added 10px right padding on fullwidth folder/container tiles when collapse toggle is enabled — `fv3-collapse-padded` on td, `fv3-collapse-enabled` on outers | `dashboard.js`, `dashboard.css` | 2026.03.23 |
| 65 | Row separators not updating on window resize — positions calculated once at creation, never recalculated. Extracted into `fv3UpdateRowSeparators()` with debounced resize listener | `docker.js`, `vm.js` | 2026.03.24 |
| 66 | Mobile responsive spacing for folder previews — added `@media (max-width: 768px)` reducing divider margins, icon spacing, and expand row-gap | `docker.css`, `vm.css` | 2026.03.24 |
| 67 | Containers ejected from folders after rename — Unraid recreates containers (new ID) on rename, so container ID matching never worked. Replaced with image-based matching: stores `containerImages` map, matches renamed containers by finding unclaimed containers with same image. VMs keep UUID matching (libvirt preserves UUIDs) | `customEvents.js`, `folder.js`, `lib.php` | 2026.03.24 |
| 68 | Preview borders adapt to advanced view row height — `fv3SyncPreviewHeights()` measures CPU cell height and sets preview height + wrapper/divider margins. Click-based toggle detection (cookie polling) replaces MutationObserver. Resize listener also syncs heights | `docker.js`, `vm.js` | 2026.03.24 |
| 69 | Scroll overflow wrapper height mismatch — scrollbar track reduced content area. Added explicit `height: calc(3.5em - 7px)` and `margin-top: 10px` for scroll wrappers, `margin-top: 10px` for scroll dividers | `docker.css`, `vm.css` | 2026.03.24 |
| 70 | Mobile preview icon/text alignment — added `vertical-align: middle` to preview icons and inner text spans in mobile media query | `docker.css`, `vm.css` | 2026.03.24 |
| 71 | Mobile preview wrapper centering — reduced base wrapper `margin-top` from 7px to 4px and divider `margin-top` from -7px to -4px on mobile | `docker.css`, `vm.css` | 2026.03.24 |
| 72 | Row separator as configurable folder setting — per-folder toggle with custom color picker. Separators drawn between rows in expanded preview using absolute positioning | `Folder.page`, `folder.js`, `docker.js`, `vm.js`, `docker.css`, `vm.css`, `lib.php`, all 7 lang files | 2026.03.24 |
| 73 | Container name/icon stacking fix — folder name and icon layout corrected, overflow-expand preview height fixed | `docker.js` | 2026.03.24 |
| 74 | Fix `setTimeout(loadlist(), 500)` immediate invocation — parentheses invoke function immediately, 500ms delay applied to undefined return value. Removed parentheses so `loadlist` is passed as callback | `dashboard.js`, `vm.js` | 2026.03.27 |
| 75 | Fix `loadedFolder = !loadedFolder` toggle bug — toggling instead of setting true causes missed folder renders on 3rd+ call. Changed to `= true` | `vm.js`, `dashboard.js` | 2026.03.27 |
| 76 | Fix invalid CSS `align-items: left` — not a valid value, changed to `flex-start` | `vm.css` | 2026.03.27 |
| 77 | Fix implicit global `buttons = {}` — missing `let` keyword creates global variable | `folder.js` | 2026.03.27 |
| 78 | Add `fv3SafeParse()` for safe JSON parsing — 28 unguarded `JSON.parse()` calls across all JS files now use try/catch with fallback values. Prevents page crashes on malformed server responses | `docker.js`, `vm.js`, `dashboard.js`, `folder.js`, `folderview3.js`, `customEvents.js` | 2026.03.27 |
| 79 | Wrap unguarded `new RegExp()` in try/catch — invalid regex patterns in folder config no longer crash the page | `dashboard.js`, `folder.js` | 2026.03.27 |
| 80 | Add `autov()` cache-busting to Chart.js library includes — `chart.min.js`, `moment.min.js`, `chartjs-adapter-moment.min.js`, `chartjs-plugin-streaming.min.js` now use `?v=HASH` | `folder.view3.Docker.page` | 2026.03.27 |
| 81 | Fix preview divider vertical alignment — scroll and expand dividers use fixed 36px height instead of percentage to prevent scrollbar from affecting height calculation. Default divider `margin-top` adjusted from -7px to -6px | `docker.css`, `vm.css` | 2026.03.27 |
| 82 | Equal wrapper margins — added `margin-right` matching `margin-left` via CSS variable, divider `margin-left` set to 0 (spacing handled by wrapper margins) | `docker.css`, `vm.css` | 2026.03.27 |
| 83 | Smart overflow detection — scroll/expand classes only applied when content actually overflows. `ResizeObserver` dynamically toggles classes on window resize. Expand measures `scrollHeight > clientHeight` after removing class; scroll measures `scrollWidth > clientWidth` after re-adding class | `docker.js`, `vm.js` | 2026.03.27 |
| 84 | Theme-aware custom action dialog — uses `hsl(var(--background))` for Unraid's HSL component CSS variables with solid fallbacks for dark mode. Type select `min-width: 120px` | `folder.css` | 2026.03.27 |
| 85 | Mobile preview alignment — default rows get `padding-bottom: 3px` to prevent status icon clipping at bottom border. Expand dividers: 42px height, `align-self: flex-start` on mobile | `docker.css`, `vm.css` | 2026.03.27 |
| 86 | Deduplicate PHP API requests — pending-state check prevents `loadlist()` from firing new PHP requests when previous ones haven't resolved. Unraid's `loadlist_original()` still runs for native rendering. Halves API calls per page load (8→4) | `docker.js`, `vm.js` | 2026.03.27 |
| 87 | Fix README description — "next to" changed to "above" for Add Container/VM button | `README.md` | 2026.03.27 |
| 88 | Fix preview divider and wrapper vertical alignment — replaced `float: left`, `height: 100%`, `margin-top: 7px` on wrappers and `margin-top: -6px` on dividers with `align-self: center` on both. Eliminates JS margin manipulation in `fv3SyncPreviewHeights` | `docker.css`, `vm.css`, `docker.js`, `vm.js` | 2026.03.28 |
| 89 | Fix expand mode containers overlapping on page refresh — stale inline heights from `fv3SyncPreviewHeights` interfered with expand detection. Changed to `offsetTop` comparison (class ON) and `scrollWidth > clientWidth` (class OFF) for nowrap-compatible detection | `docker.js`, `vm.js` | 2026.03.28 |
| 90 | Fix row separator timing on basic/advanced toggle — toggle click uses capture phase to bypass `stopPropagation()`, 100ms+300ms timing matches main. Separator draws debounced with `_fv3SepTimer` to prevent ghost separators from stacking draws | `docker.js`, `vm.js` | 2026.03.28 |
| 91 | Fix default folders wrapping on narrow screens — changed base `.folder-preview` from `flex-wrap: wrap` to `nowrap`, added `flex-shrink: 0` to wrappers. Expand mode gets explicit `flex-wrap: wrap` override | `docker.css`, `vm.css` | 2026.03.28 |
| 92 | Add Firefox scrollbar fallback — `@supports not selector(::-webkit-scrollbar)` block with `scrollbar-width: thin` for Firefox compatibility | `docker.css`, `vm.css` | 2026.03.28 |
| 93 | Add expand row separator gap spacing — `fv3-has-separators` class applies `row-gap: 13px` (6px above + 1px separator + 6px below) when row separators are enabled, default `row-gap: 7px` otherwise | `docker.css`, `vm.css`, `docker.js`, `vm.js` | 2026.03.28 |
| 94 | Enhanced mobile UI — removed stale `padding-bottom: 3px` mobile override (align-self handles centering), removed scroll `padding-top` on mobile (no visible scrollbar on touch), tightened `line-height: 1.1` on wrapper inner text to reduce gap between container name and status | `docker.css`, `vm.css` | 2026.03.28 |
| 95 | Add form accessibility attributes — `name`, `for`, `autocomplete="off"` on folder editor and settings page form fields | `Folder.page`, `FolderView3.page` | 2026.03.28 |
| 96 | Build system auto-detect branch and auto-increment version numbers — `pkg_build.sh` detects current git branch, supports `--beta`/`--develop`/`--main` overrides, auto-increments build numbers per date | `pkg_build.sh` | 2026.03.28 |
| 97 | Fix preview overflow causing table expansion in Firefox/Edge — changed base `.folder-preview` from `flex-wrap: nowrap` back to `wrap`. Added `clipPreview()` JS that hides containers wrapping to second row via `display: none` with `ResizeObserver` for responsive re-clipping. Added `flex-wrap: nowrap` override on `.fv3-overflow-scroll`. Fixed expand mode detection to use `offsetTop` instead of `scrollWidth` (which fails with `flex-wrap: wrap`) | `docker.css`, `vm.css`, `docker.js`, `vm.js` | 2026.03.30 |
| 98 | Mobile UI — removed CSS override that switched clip mode to horizontal scroll on mobile. Clip mode now uses JS `clipPreview()` consistently across all screen sizes | `docker.css`, `vm.css`, `docker.js`, `vm.js` | 2026.03.30 |
| 99 | Remove dead `.folder-preview.expanded` CSS rule — class never applied by any JS | `docker.css` | 2026.03.30 |
| 100 | Align docker.js divider insertion with vm.js — added `.not(':last')` to prevent trailing divider after last wrapper | `docker.js` | 2026.03.30 |

### Theme Compatibility (Advanced Preview Tooltip)

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Tooltip colors: hardcoded `#fff`/`#333` to `inherit` | `docker.css` | 2026.02.03 |
| 2 | Tooltip sizing: fixed 700x500px to responsive `90vw`/`80vh` | `docker.css` | 2026.02.03 |
| 3 | Tooltip content: `overflow: initial` to `overflow: visible` | `docker.css` | 2026.02.03 |
| 4 | First row header: `#f2f2f2`/`#c5c5c5` to `rgba()` | `docker.css` | 2026.02.03 |
| 5 | Status header cells: `#ced1d3` to `rgba(128,128,128,0.2)` | `docker.css` | 2026.02.03 |
| 6 | Action links: `#303030` + gradient to `inherit` + `rgba()` hover | `docker.css` | 2026.02.03 |
| 7 | Info container: `#fcf6e1`/`#c8c4c1` to `rgba()` | `docker.css` | 2026.02.03 |
| 8 | Tab styling: all hardcoded colors to `rgba()` | `docker.css` | 2026.02.03 |
| 9 | Port/volume links: `#486dba` to `#6a9fd4` (readable on dark) | `docker.css` | 2026.02.03 |
| 10 | Memory bar missing color variable | `docker.css` | 2026.02.03 |
| 11 | Docker context menu: new theme-agnostic styles | `docker.css` | 2026.02.03 |
| 12 | Folder expanded state styling | `docker.css` | 2026.02.03 |

### UI/Layout Improvements

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Order table: `92vw` to responsive `100%` + fixed layout | `folder.css`, `Folder.page` | 2026.02.03 |
| 2 | Order section: removed `115em` inline width, flexbox column | `folder.css`, `Folder.page` | 2026.02.03 |
| 3 | Tooltip bullet points removed from settings form | `folder.css` | 2026.02.03 |
| 4 | Reset button: oversized to matching 44x28px | `Folder.page` | 2026.02.04 |
| 5 | Backward-compatible Docker Manager CSS for Unraid 6 | `Folder.page` | 2026.02.08 |
| 6 | Folder name sub: `align-items: flex-start` to `center` | `docker.css`, `vm.css` | 2026.02.09 |
| 7 | New folder defaults: all toggles OFF | `Folder.page` | 2026.02.09 |
| 8 | Settings page button and table overflow fixes for mobile | `folderview3.css` | 2026.03.04.1 |
| 9 | Center Included/Hide Preview toggles under column headings | `folder.css` | 2026.03.05 |
| 10 | Restrict drag cursor to container name content in folder editor | `folder.css`, `folder.js` | 2026.03.05 |
| 11 | Reorganize dashboard settings with Docker/VM section headings and indented sub-options | `FolderView3.page`, `folderview3.js`, `folderview3.css` | 2026.03.19 |
| 12 | Convert Yes/No settings to Unraid-native On/Off toggle switches (switchButton) | `FolderView3.page`, `folderview3.js` | 2026.03.19 |
| 13 | Inset dashboard style improved — SVG L-shape border with ResizeObserver, tighter child tile spacing | `dashboard.js`, `dashboard.css` | 2026.03.19 |
| 14 | Dynamic folder name column width — shrinks/expands to fit folder name instead of fixed 220px | `docker.css`, `vm.css` | 2026.03.23.2 |
| 15 | Fix chevron position shift when expanding/collapsing folders — add min-width to match Unraid container cell width | `docker.css`, `vm.css` | 2026.03.23.3 |

### Translation Updates

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Split border/bars color labels in all 7 languages | All `langs/*.json` | 2026.02.04 |
| 2 | German (`de.json`): 3 strings translated | `de.json` | 2026.02.07 |
| 3 | Spanish (`es.json`): 3 strings translated | `es.json` | 2026.02.07 |
| 4 | Italian (`it.json`): 3 keys translated | `it.json` | 2026.02.07 |
| 5 | Chinese (`zh.json`): 4+ keys translated | `zh.json` | 2026.02.07 |
| 6 | Polish (`pl.json`): 62 missing keys added for full parity | `pl.json` | 2026.02.07 |
| 7 | WebUI feature: 4 new i18n keys added to all 7 language files (English text only) | All `langs/*.json` | 2026.02.11 |
| 8 | Removed unused autostart i18n keys (2 per file) | All `langs/*.json` | 2026.02.16 |
| 9 | Compose/3rd Party i18n keys (`compose`, `third-party`) in all 7 languages | All `langs/*.json` | 2026.02.24 |
| 10 | WebUI feature: 4 keys translated in 6 non-English languages (previously English-only) | `de.json`, `es.json`, `fr.json`, `it.json`, `pl.json`, `zh.json` | 2026.02.11 |
| 11 | Hide Preview i18n key (`table-hide-preview`) in all 7 languages | All `langs/*.json` | 2026.03.05 |
| 12 | Dashboard settings i18n keys (expand toggle, preview overflow) in all 7 languages | All `langs/*.json` | 2026.03.19 |

### Build System & Infrastructure

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Build script rewrite: `--beta` flag, branch-aware URLs, collision detection | `pkg_build.sh` | 2026.02.03 |
| 2 | `.gitattributes`: line endings + binary file handling | `.gitattributes` | 2026.02.03, 2026.02.16 |
| 3 | GitHub Actions: `release-beta.yml` workflow | New file | 2026.02.03 |
| 4 | GitHub Actions: `release-stable.yml` workflow | New file | 2026.02.03 |
| 5 | Plugin manifest: author, URLs, branch updated | `.plg` | 2026.02.03 |
| 6 | Stale files removed: `orig_folder.js` + 6 old archives | Deleted | 2026.02.03 |
| 7 | Beta branch target: `develop` to `beta` | `pkg_build.sh` | 2026.02.11 |
| 8 | Dead autostart indicator code archived | `docker.js` → `dev/archived/` | 2026.02.16 |

### Cleanup

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Removed upstream CSS comments throughout | `docker.css` | 2026.02.03 |
| 2 | Removed trailing debug comment on line 1 | `docker.js` | 2026.02.03 |
| 3 | Added EOF newlines (POSIX compliance) | `docker.css`, `folder.css` | 2026.02.03 |
| 4 | Removed commented-out debug code | `docker.js`, `lib.php` | 2026.02.10 |

---

## Detailed Changes by File

### `scripts/docker.js`

**Docker Compose container grouping (2026.02.03):**
Upstream selector `td.ct-name .appname a` returned empty text for Docker Compose containers (which lack an `<a>` tag). Changed to `td.ct-name .appname` to match both standard and Compose containers.

**SSE CPU/Memory stats (2026.02.03):**
Unraid's `dockerload` SSE passes data as `e.data` in some versions and directly as `e` in others. Added compatibility shim: `const sseData = (typeof e_sse.data === 'string') ? e_sse.data : (typeof e_sse === 'string' ? e_sse : null)`.

**Autostart toggle race condition (2026.02.10):**
Made `folderAutostart()` async. After each container's autostart click, waits for AJAX completion (via `ajaxComplete` event) before proceeding to the next, with a 3-second timeout fallback.

**Autostart toggles showing OFF (2026.02.09):**
Deferred `switchButton` initialization until autostart state is calculated, then initialized with correct `checked` value directly. Added `.off()` before `.on()` to prevent duplicate handlers.

**WebUI context menu button (2026.02.11):**
When `folder_webui` is enabled and URL is set, a globe-icon "WebUI" button appears in the folder's right-click context menu, opening the URL in a new tab.

**Expanded folder bottom border (2026.02.04):**
Changed last container's bottom border from `preview_border_color` to neutral `rgba(128, 128, 128, 0.3)`.

**Vertical bars separate color (2026.02.04):**
Divider bars now use `preview_vertical_bars_color` with fallback to `preview_border_color` for backwards compatibility.

**Dead autostart indicator removed (2026.02.16):**
Removed ~22 lines of code that toggled a green/red indicator on `.nav-item.AutostartOrder.util` — the HTML element was never added to page templates. Archived to `dev/archived/autostart-indicator.js`.

**jQuery selector crash for container names with special characters (2026.02.26):**
`$('#ct-${name}')` threw a jQuery syntax error when the container name contained CSS special characters (e.g. `Dash.` became `#ct-Dash.` — invalid CSS). Replaced with `$(document.getElementById('ct-${name}'))` which treats the string as a literal ID.

---

### `scripts/dashboard.js`

**Wrong containers in folders (2026.02.09.1):**
Dashboard used positional index matching (`.children().eq(index)`) which shifted as containers were moved into folders. Changed to name-based matching via `.filter()` on `span.inner` text content, matching the approach in `docker.js` and `vm.js`.

**VM folder missing CSS classes (2026.02.15):**
Added `folder-img-vm` class to icon image and wrapped folder name in `<span class="folder-appname-vm">` to match the Docker folder pattern, enabling custom CSS themes.

**WebUI context menu button (2026.02.11):**
Same WebUI context menu feature as `docker.js`, mirrored for Dashboard folder entries.

---

### `scripts/vm.js`

**VM folder assignment bug (2026.02.07):**
VMs were grabbed by positional DOM index. Changed to name-based lookup: `$(this).find('td.vm-name span.outer span.inner a').first().text().trim() === container`.

**Autostart toggles showing OFF (2026.02.09):**
Same fix as `docker.js` — deferred `switchButton` initialization with correct `checked` value.

**VM folder column misalignment (2026.02.16.1):**
Folder row used hardcoded `colspan="5"` which was one column short on Unraid versions with an IP ADDRESS column, causing the autostart toggle to be misaligned. Changed to dynamically calculate colspan from the actual `#kvm_table` header column count, matching the approach used in `docker.js`.

**VM folder collapse button stuck (2026.02.17):**
The `dropDownButton()` collapse branch used `$('tr.folder-id-${id} > td[colspan=5] > .folder-storage')` with a hardcoded `colspan=5`. If the actual colspan differed (dynamically calculated from `#kvm_table` header), the selector matched nothing and the append silently failed, leaving the folder stuck expanded. Changed to `$('tr.folder-id-${id} .folder-storage')`, matching `docker.js`.

**VM folder crash on invalid regex (2026.02.17):**
`new RegExp(folder.regex)` was called without try/catch. An invalid regex in the folder config would throw an uncaught exception and break all folder rendering. Also added: deduplication (`!folder.containers.includes(el)`) to prevent containers matching both explicit list and regex from appearing twice, existence check (`vmInfo[el]`) to skip regex matches for VMs that don't exist, and string validation before attempting regex construction.

**VM folder crash on deleted VM (2026.02.17):**
`vmInfo[container]` was accessed without a null check. If a VM was deleted but still referenced in a folder's container list, accessing `ct.uuid` / `ct.state` would throw a TypeError. Added early `continue` when `vmInfo[container]` is falsy.

**VM context menu crash (2026.02.17):**
`addVMFolderContext()` accessed `globalFolders[id].settings` without checking if `globalFolders[id]` exists. During folder rebuilds (e.g., when `loadlist()` is called), clicking the folder icon could race with the rebuild and throw. Added null guard matching `docker.js`'s `addDockerFolderContext()`.

**VM folder action error handling (2026.02.17):**
`actionFolder()` had three issues: (1) error title was hardcoded `'Execution error'` instead of `$.i18n('exec-error')`, breaking translations; (2) errors were mapped via `e.success` (boolean) instead of `e.text || JSON.stringify(e)`, showing `false` instead of actual error messages; both fixed to match `docker.js`.

**Expanded folder bottom border (2026.02.04):**
Same fix as `docker.js` — neutral gray border.

**Vertical bars separate color (2026.02.04):**
Same pattern as `docker.js`.

**Orphan hidden child row removed (2026.03.04.1):**
The folder template included a hidden `<tr child-id="${id}" id="name-${id}">` row that was unused. Removed to clean up the DOM output.

---

### `scripts/folder.js`

**Container order sync on save (2026.02.10):**
After creating/updating a Docker folder, calls `sync_order.php` to synchronize container order in Unraid's `userprefs.cfg`.

**Folder WebUI form handling (2026.02.11):**
Loads `folder_webui` checkbox and `folder_webui_url` from saved config. Shows/hides URL input via constraint system. Saves both fields to folder settings JSON.

**Split color pickers (2026.02.04):**
Added `preview_vertical_bars_color` field handling — load (with fallback to `preview_border_color`), visibility (independent `border-color`/`bars-color` constraints), and submit.

---

### `scripts/folderview3.js` (formerly `folderview2.js`)

**Export/Delete button tooltips (2026.02.16):**
Added `title="Export"` and `title="Delete"` to Settings page folder action buttons.

**Folder export triggering Unraid external link warning (2026.02.17.1):**
The `downloadFile()` function used a `data:text/plain;charset=utf-8,...` URL to trigger file downloads. Unraid's security interceptor treats `data:` URLs as external links and shows a warning dialog. Changed to `Blob` URL (`URL.createObjectURL(new Blob(...))`) which produces a same-origin `blob:http://...` URL. Same fix applied to debug JSON downloads in `docker.js`, `vm.js`, and `dashboard.js`.

---

### `server/lib.php`

**Container order synchronization (2026.02.10):**
New function `syncContainerOrder()` (79 lines). Reads `userprefs.cfg`, expands folder members (including regex patterns), rebuilds order with members before their folder placeholder, writes back. Also reorders `/var/lib/docker/unraid-autostart` to match.

**`readUserPrefs()` JSON fix (2026.02.10):**
`parse_ini_file()` returns 1-based associative arrays which `json_encode()` serializes as objects. Wrapped in `array_values()` to force JSON array output, fixing `unraidOrder.includes is not a function` crash.

**Stale autostart cleanup (2026.02.11):**
Added cleanup logic to `readInfo()` — filters autostart file against currently-existing container names on every page load.

---

### `server/sync_order.php` (new file, 2026.02.10)

POST endpoint that receives `type` (docker/vm) and delegates to `syncContainerOrder()` in `lib.php`.

---

### `styles/docker.css`

**Theme-agnostic Advanced Preview tooltip (2026.02.03):**
Replaced all hardcoded colors throughout the tooltip with theme-agnostic values:
- `color: initial` → `inherit`, `background-color: #fff` → `inherit`
- `overflow: initial` → `visible`, sizing from fixed `700x500px` to `90vw`/`80vh`
- Header backgrounds: `#f2f2f2`, `#ced1d3` → `rgba(128, 128, 128, 0.1-0.2)`
- Borders: `#c5c5c5` → `rgba(128, 128, 128, 0.3)`
- Action links: `#303030` → `inherit`, gradient hover → `rgba()` overlay
- Info container: `#fcf6e1`/`#c8c4c1` → `rgba()`
- Port/volume links: `#486dba` → `#6a9fd4`
- Added missing memory bar color variable (`--folder-view3-graph-mem`)
- New docker context menu styles and folder expanded state styling
- Removed upstream inline comments throughout

**CPU/Memory text wrapping (2026.02.07):**
Added `white-space: nowrap` to `.folder-cpu` and `.folder-mem` spans.

**Folder name layout (2026.02.08):**
Changed `.folder-name-sub` to flexbox, `.folder-outer` gets ellipsis truncation, `.folder-dropdown` pinned right with `margin-left: auto`.

**Folder name alignment (2026.02.09):**
Changed `.folder-name-sub` from `align-items: flex-start` to `center`.

---

### `styles/vm.css`

All changes mirror `docker.css`:
- Folder name flexbox layout (2026.02.08)
- Folder name alignment center (2026.02.09)

---

### `styles/folder.css`

**Order table responsive (2026.02.03):**
`width: 92vw` → `100%` with `table-layout: fixed`, explicit column proportions (75%/25%).

**Tooltip bullets removed (2026.02.03):**
`list-style: none` on form lists.

**Order section layout (2026.02.03):**
Flexbox column layout replacing float-based `<dl>`/`<dt>`/`<dd>`.

**Color reset button alignment (2026.02.09):**
Override `flex-direction: row` on `<dd>` elements containing color inputs using `:has()` selector.

---

### `styles/folderview3.css` (formerly `folderview2.css`)

**Settings page table layout (2026.02.16):**
Replaced generic `.folder-table > *` with specific rules: buttons get `flex: 1 1 25%` (side-by-side), table gets `flex: 1 1 100%` (full-width row).

**Settings page mobile overflow fixes (2026.03.04.1):**
Replaced `align-content: center` with `overflow: visible` on `.custom-css` and `.folder-table` containers. Added `min-height: 28px` and `box-sizing: border-box` to buttons. Added `overflow: visible` on `.folder-table > table td:last-child` to prevent action button tooltips from being clipped.

---

### `Folder.page`

**Removed missing CSS reference (2026.02.03):**
Removed `dynamix.docker.manager/styles/style-{theme}.css` link (doesn't exist on Unraid 7).

**Backward-compatible CSS (2026.02.08):**
Wrapped the removed CSS link in `file_exists()` check so Unraid 6 users still get theme CSS.

**Order section restructure (2026.02.03):**
Merged label and table into single `<div class="basic order-section">`, removed inline `width: 115em`.

**Split color pickers (2026.02.04):**
Two separate color pickers with nested constraint visibility under their respective toggles.

**Folder WebUI fields (2026.02.11):**
New toggle and URL input using existing constraint pattern.

**New folder defaults (2026.02.09):**
Removed `checked` from 5 preview checkboxes.

### `folder.view3.Docker.page`, `folder.view3.VMs.page`, `folder.view3.Dashboard.page`

**`autov()` cache-busting for `customEvents.js` (2026.03.04.1):**
Changed `<script src="/plugins/folder.view3/scripts/include/customEvents.js">` to use `<?php autov(...)?>` wrapper. Without `autov()`, browsers could serve a stale cached version of `customEvents.js` after a plugin update, preventing new code from taking effect until the user manually cleared their cache.

---

### `folder.view3.plg` (formerly `folder.view2.plg`)

**Author and URLs (2026.02.03):**
Author changed to `chodeus`, download URL changed from `raw.github.com`/`master` to `raw.githubusercontent.com`/`main`.

**Archive packaging fix (2026.02.05):**
Removed `build/` prefix from archive structure that prevented plugin install.

---

### Language Files (`langs/*.json`)

**Polish: 62 missing keys added (2026.02.07):**
Full parity with `en.json`.

**German, Spanish, Italian, Chinese translations completed (2026.02.07):**
3-4 remaining English strings translated per file.

**Split color labels (2026.02.04):**
`"border-color"` shortened, new `"bars-color"` and `"bars-color-tooltip"` keys added across all 7 languages.

**WebUI feature keys (2026.02.11):**
4 new keys (`folder-webui`, `folder-webui-tooltip`, `folder-webui-url`, `folder-webui-url-tooltip`) added to all 7 languages.

**Unused autostart keys removed (2026.02.16):**
`"correct-autostart"` and `"incorrect-autostart"` removed from all 7 languages.

---

### Build System

**`pkg_build.sh` rewrite (2026.02.03):**
Added `--beta` flag for beta builds, branch-aware plg URL updating via sed, collision detection (`.N` suffix), and `chmod` limited to temp directory only.

**Beta branch target (2026.02.11):**
Changed `--beta` flag from targeting `develop` branch to `beta` branch.

**`.gitattributes` binary handling (2026.02.16):**
Added `*.txz binary` rule to prevent git from mangling binary archives via `text=auto eol=lf`.

**GitHub Actions (2026.02.03):**
- `release-beta.yml`: Manual trigger, builds beta on beta branch, auto-increments beta number
- `release-stable.yml`: Manual trigger, merges beta→main, builds stable, creates GitHub release
- `release-main.yml`: Manual trigger, builds stable directly from main (no beta merge), creates GitHub release

### Settings Page & Security (2026.03.16)

#### Bug Fixes

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 44 | Fix Settings page delete buttons — global variables initialized before `populateTable()` call | `folderview3.js` | 2026.03.16 |
| 45 | Fix delete validation — accept variable-length folder IDs for backward compatibility | `lib.php`, `delete.php` | 2026.03.16 |
| 46 | Fix Settings page folder order to match current Docker/VM container page order | `folderview3.js` | 2026.03.16 |
| 47 | Fix folder editor tooltip to click-only, help cursor on label text only | `folder.js` | 2026.03.16 |
| 48 | Fix import error handling — early return on JSON parse failure instead of falling through | `folderview3.js` | 2026.03.16 |

#### New Features

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 17 | Bulk export preserves folder order via JSON key ordering (mapped from container page order) | `folderview3.js` | 2026.03.16 |
| 18 | Hover tooltip on folder editor labels — shows help text beneath heading on dt hover | `folder.css` | 2026.03.16 |

#### Security

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 8 | Folder ID format validation on delete and update endpoints | `lib.php`, `delete.php`, `update.php` | 2026.03.16 |
| 9 | JSON decode safety — validate parsed data before use | `lib.php` | 2026.03.16 |
| 10 | File permission hardening (0660) on config writes | `lib.php` | 2026.03.16 |
| 11 | Path traversal protection on custom script/style loaders via `realpath()` + baseDir check | `scripts/custom.php`, `styles/custom.php` | 2026.03.16 |

#### UI/Layout Improvements

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 11 | 14 new CSS variables for customizable folder layout and colors | `docker.css`, `vm.css` | 2026.03.16 |

#### Cleanup

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 5 | Extract `orderFolderIds()` and `buildOrderedExport()` helpers, remove duplicated ordering logic | `folderview3.js` | 2026.03.16 |
| 6 | Remove dead CSS variables (`--fv3-folder-icon-size`, `--fv3-separator-color`) | `docker.css`, `vm.css` | 2026.03.16 |
| 7 | Remove unused `fv3_validate_id()` function | `lib.php` | 2026.03.16 |
| 8 | Remove no-op VM `sync_order` call on import | `folderview3.js` | 2026.03.16 |
