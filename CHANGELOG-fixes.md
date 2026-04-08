# FolderView3 Changelog

## Summary

This fork (`chodeus/folder.view3`) is a maintained continuation of `VladoPortos/folder.view2` (originally `scolcipitato/folder.view`). It includes bug fixes, new features, theme compatibility, Unraid 7 support, and a full rebrand.

---

## 2026.04.07 — Stable Release

### Bug Fixes

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 60 | Fix CSS presets overriding orange update-available text — removed accent override on `.folder-update-text`, added `:not(.orange-text)` exclusion on preview appname selectors | `folder-common.css` | 2026.04.07 |

---

## 2026.04.06 — Stable Release

### Bug Fixes

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 59 | Fix folder settings page toggles showing wrong ON/OFF state on load (race condition between CSS config fetch and folder data fetch) | `folder.js` | 2026.04.06 |

---

## 2026.04.05 — Stable Release

### Incognito Mode Improvements

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 51 | Scrub container/VM names in volume paths (preserves path structure) | `shared.js` | 2026.04.05 |
| 52 | Hide public IPv6 addresses (keeps private fe80/fc/fd) | `shared.js` | 2026.04.05 |
| 53 | Hide MAC addresses | `shared.js` | 2026.04.05 |
| 54 | Scrub disk image filenames (qcow2/img/iso/raw/vmdk/vdi/vhd/vhdx) | `shared.js` | 2026.04.05 |
| 55 | Scrub /domains/ directory names in VM disk paths | `shared.js` | 2026.04.05 |
| 56 | Hide non-standard interface names (keeps eth/enp/docker/br/etc) | `shared.js` | 2026.04.05 |
| 57 | VM folder previews show "VM 1" instead of "Container 1" | `shared.js` | 2026.04.05 |
| 58 | Use text node walking instead of innerHTML for table cell scrubbing (preserves event handlers) | `shared.js` | 2026.04.05 |

---

## 2026.04.04 — Stable Release

### New Features

| # | Change | File(s) | Version |
|---|--------|---------|---------|
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

### Security

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 12 | Content-Type: application/json on all JSON endpoints | All `server/*.php` | 2026.04.04 |
| 13 | CSS injection sanitization (strips @import, url(), expression(), javascript:) | `lib.php` | 2026.04.04 |
| 14 | Recursive delete for theme removal | `lib.php`, `delete_theme.php` | 2026.04.04 |

### Bug Fixes

| # | Change | File(s) | Version |
|---|--------|---------|---------|
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

### Mobile/Touch

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | 44px dropdown tap targets for touch devices | `folder-common.css` | 2026.04.04 |
| 2 | hover:none visibility for touch-only devices | `folder-common.css` | 2026.04.04 |
| 3 | Firefox scrollbar fallback (`scrollbar-width`, `scrollbar-color`) | `folder-common.css` | 2026.04.04 |
| 4 | Dashboard responsive breakpoints for all layouts | `dashboard.css` | 2026.04.04 |

### i18n

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | ~40 new keys across all 7 language files (settings, CSS tool, folder defaults, incognito) | `langs/*.json` | 2026.04.04 |

### Infrastructure

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | PLG pre-install cleanup: removes stale package DB entries before install | `folder.view3.plg` | 2026.04.04 |
| 2 | PLG post-install cleanup: safety net for lingering package entries | `folder.view3.plg` | 2026.04.04 |
| 3 | PLG old .txz cleanup moved from post-install to pre-install | `folder.view3.plg` | 2026.04.04 |
| 4 | .DS_Store files removed and added to .gitignore | `.gitignore` | 2026.04.04 |

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
