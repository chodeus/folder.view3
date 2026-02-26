# FolderView3 Changelog

## 2026-02-26

### Fix: jQuery selector crash for container names with special CSS characters

**Issue:** Container names containing CSS special characters (`.`, `:`, `[`, `]`, etc.) caused a jQuery `Syntax error, unrecognized expression` when FolderView3 tried to locate them via `$('#ct-ContainerName')`. This broke folder rendering — affected containers appeared outside folders.

**Root cause:** `docker.js` line 386 used the container name directly in a jQuery ID selector. A name like `Dash.` became `#ct-Dash.` — invalid CSS.

**Fix:** Replaced `$(\`#ct-${name}\`)` with `$(document.getElementById(\`ct-${name}\`))`. `getElementById` treats the string as a literal ID, bypassing CSS parsing entirely.

**File changed:** `scripts/docker.js` line 386

## Summary

This fork (`chodeus/folder.view3`) is a maintained continuation of `VladoPortos/folder.view2` (originally `scolcipitato/folder.view`). It includes bug fixes, new features, theme compatibility, Unraid 7 support, and a full rebrand.

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
| 1 | Folder WebUI toggle + URL input in folder editor | `Folder.page`, `folder.js` | 2026.02.11 |
| 2 | WebUI button in Docker tab context menu | `docker.js` | 2026.02.11 |
| 3 | WebUI button in Dashboard context menu | `dashboard.js` | 2026.02.11 |
| 4 | Container order sync on folder save (`syncContainerOrder`) | `lib.php`, `folder.js`, `sync_order.php` (new) | 2026.02.10 |
| 5 | Autostart order synced with folder container layout | `lib.php` | 2026.02.10 |
| 6 | Stale autostart cleanup on page load | `lib.php` (readInfo) | 2026.02.11 |
| 7 | Split border and vertical bars into separate color pickers | `Folder.page`, `folder.js`, `docker.js`, `vm.js` | 2026.02.04 |
| 8 | Nested color pickers under parent toggles | `Folder.page`, `folder.js` | 2026.02.04 |
| 9 | Export/Delete tooltips on Settings page folder buttons | `folderview3.js` | 2026.02.16 |
| 10 | Docker Compose and 3rd Party container awareness (`managerTypes` Set) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 11 | Compose/3rd Party/mixed labels in folder update column | `docker.js` | 2026.02.24 |
| 12 | Compose/3rd Party labels in advanced preview tooltip | `docker.js` | 2026.02.24 |
| 13 | Hide autostart toggle for non-dockerman folders | `docker.js`, `dashboard.js` | 2026.02.24 |
| 14 | i18n keys for Compose and 3rd Party labels (all 7 languages) | `langs/*.json` | 2026.02.24 |
| 15 | Stacked Compose + 3rd Party labels for mixed folders | `docker.js` | 2026.02.24 |

### Bug Fixes

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Docker Compose containers not grouped into folders | `docker.js` | 2026.02.03 |
| 2 | CPU/Memory stats not updating in advanced view (SSE) | `docker.js` | 2026.02.03 |
| 3 | Dashboard showing wrong containers in folders (index-based) | `dashboard.js` | 2026.02.09.1 |
| 4 | VM folder assignment bug (index-based matching) | `vm.js` | 2026.02.07 |
| 5 | Autostart toggles showing OFF after plugin update | `docker.js`, `vm.js` | 2026.02.09 |
| 6 | Autostart toggle race condition (overlapping AJAX) | `docker.js` | 2026.02.10 |
| 7 | `readUserPrefs()` returning JSON object instead of array | `lib.php` | 2026.02.10 |
| 8 | VM folder image missing `folder-img-vm` class on Dashboard | `dashboard.js` | 2026.02.15 |
| 9 | VM folder name missing `folder-appname-vm` wrapper on Dashboard | `dashboard.js` | 2026.02.15 |
| 10 | Color reset button appearing below color swatch | `folder.css` | 2026.02.09 |
| 11 | Expanded folder bottom border using user's border color | `docker.js`, `vm.js` | 2026.02.04 |
| 12 | Folder name wrapping in basic view | `docker.css`, `vm.css` | 2026.02.08 |
| 13 | CPU/Memory text wrapping "GiB" on own line | `docker.css` | 2026.02.07 |
| 14 | Settings page folder table staggered layout | `folderview3.css` | 2026.02.16 |
| 15 | VM folder column misalignment (hardcoded colspan) | `vm.js` | 2026.02.16.1 |
| 16 | VM folder collapse button stuck (hardcoded `td[colspan=5]` selector) | `vm.js` | 2026.02.17 |
| 17 | VM folder crash on invalid regex in folder config | `vm.js` | 2026.02.17 |
| 18 | VM folder crash when deleted VM still in folder config | `vm.js` | 2026.02.17 |
| 19 | VM context menu crash if `globalFolders[id]` is undefined | `vm.js` | 2026.02.17 |
| 20 | VM folder action errors showing `false` instead of error text | `vm.js` | 2026.02.17 |
| 21 | VM folder action error title not translated (hardcoded English) | `vm.js` | 2026.02.17 |
| 22 | Folder export/debug download triggers Unraid external link warning (`data:` URL) | `folderview3.js`, `docker.js`, `vm.js`, `dashboard.js` | 2026.02.17.1 |
| 23 | Container autostart with wait timer disabled on tab switch (wrong delimiter parsing autostart file) | `lib.php` | 2026.02.19 |
| 24 | Improved folder expand button shifting when folder is toggled (table recalculates column width) | `docker.css`, `vm.css` | 2026.02.23 |
| 25 | Dashboard folder title uses `blue-text` instead of `orange-text` when `preview_update` is enabled | `dashboard.js` | 2026.02.23 |
| 26 | Dashboard container names in folder showcase not styled orange when updates available | `dashboard.js` | 2026.02.23 |
| 27 | Unsorted containers on folder settings page appear in Docker creation order instead of alphabetical | `folder.js` | 2026.02.23 |
| 28 | False orange update text on Compose/3rd Party containers (`Updated` field unreliable for non-dockerman) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 29 | Autostart count incorrectly including Compose containers (Autostart undefined passes check) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 30 | Tooltip operator precedence bug: `!Updated === false` evaluates wrong for null/undefined | `docker.js` | 2026.02.24 |
| 31 | Compose container duplicate on folder settings page (`choose.filter` not removing label-matched items) | `folder.js` | 2026.02.24 |
| 32 | Autostart toggle visible for non-dockerman folders (Compose/3rd Party don't support autostart) | `docker.js`, `dashboard.js` | 2026.02.24 |
| 33 | Folder drag-and-drop not working for compose/3rd-party-only folders (jQuery UI Sortable not refreshed) | `docker.js` | 2026.02.24 |
| 34 | Archive packaging structure (build/ prefix) | `pkg_build.sh` | 2026.02.05 |
| 35 | Plugin download URL: `raw.github.com` + `master` branch | `.plg` | 2026.02.03 |
| 36 | nginx 404 errors from missing Docker Manager CSS | `Folder.page` | 2026.02.03 |

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
| 5 | Folder name sub: `align-items: flex-start` to `center` | `docker.css`, `vm.css` | 2026.02.09 |
| 6 | New folder defaults: all toggles OFF | `Folder.page` | 2026.02.09 |
| 7 | Backward-compatible Docker Manager CSS for Unraid 6 | `Folder.page` | 2026.02.08 |

### Translation Updates

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | German (`de.json`): 3 strings translated | `de.json` | 2026.02.07 |
| 2 | Spanish (`es.json`): 3 strings translated | `es.json` | 2026.02.07 |
| 3 | Italian (`it.json`): 3 keys translated | `it.json` | 2026.02.07 |
| 4 | Chinese (`zh.json`): 4+ keys translated | `zh.json` | 2026.02.07 |
| 5 | Polish (`pl.json`): 62 missing keys added for full parity | `pl.json` | 2026.02.07 |
| 6 | Split border/bars color labels in all 7 languages | All `langs/*.json` | 2026.02.04 |
| 7 | WebUI feature: 4 new i18n keys in all 7 languages | All `langs/*.json` | 2026.02.11 |
| 8 | Removed unused autostart i18n keys (2 per file) | All `langs/*.json` | 2026.02.16 |

### Build System & Infrastructure

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Build script rewrite: `--beta` flag, branch-aware URLs, collision detection | `pkg_build.sh` | 2026.02.03 |
| 2 | Beta branch target: `develop` to `beta` | `pkg_build.sh` | 2026.02.11 |
| 3 | `.gitattributes`: line endings + binary file handling | `.gitattributes` | 2026.02.03, 2026.02.16 |
| 4 | GitHub Actions: `release-beta.yml` workflow | New file | 2026.02.03 |
| 5 | GitHub Actions: `release-stable.yml` workflow | New file | 2026.02.03 |
| 6 | Plugin manifest: author, URLs, branch updated | `.plg` | 2026.02.03 |
| 7 | Dead autostart indicator code archived | `docker.js` → `dev/archived/` | 2026.02.16 |
| 8 | Stale files removed: `orig_folder.js` + 6 old archives | Deleted | 2026.02.03 |

### Cleanup

| # | Change | File(s) | Version |
|---|--------|---------|---------|
| 1 | Removed upstream CSS comments throughout | `docker.css` | 2026.02.03 |
| 2 | Removed commented-out debug code | `docker.js`, `lib.php` | 2026.02.10 |
| 3 | Removed trailing debug comment on line 1 | `docker.js` | 2026.02.03 |
| 4 | Added EOF newlines (POSIX compliance) | `docker.css`, `folder.css` | 2026.02.03 |

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
