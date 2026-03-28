# FolderView3 Custom CSS & JS Developer Guide

## Overview

FolderView3 supports custom CSS and JavaScript extensions that load alongside the plugin on each tab. You can restyle folders, tooltips, container rows, and the dashboard — or add custom behavior via the JavaScript event system.

**Custom file locations on Unraid:**
- **CSS:** `/boot/config/plugins/folder.view3/styles/`
- **JS:** `/boot/config/plugins/folder.view3/scripts/`

These directories persist across reboots (they live on the USB flash drive).

---

## File Naming

Files must follow the pattern: **`name.tab.ext`**

| Part | Description |
|------|-------------|
| `name` | Any string (your theme name, a load-order prefix, etc.) |
| `tab` | One or more of: `docker`, `vm`, `dashboard` (chain with `-`) |
| `ext` | `.css` or `.js` |

**Examples:**

```
mytheme.docker.css              → Docker tab only
mytheme.vm.css                  → VM tab only
mytheme.dashboard.css           → Dashboard only
mytheme.docker-vm.css           → Docker + VM tabs
mytheme.dashboard-docker-vm.css → All three tabs
01-colors.docker-vm.css         → Prefixed for load ordering
```

**Will NOT work:**
```
mytheme-docker.css              → Hyphen instead of dot separator
mytheme_docker.css              → Underscore separator
mytheme.css                     → Missing tab name
```

**Disabling:** Append `.disabled` to any file to skip loading without deleting it:
```
mytheme.docker.css.disabled
```

---

## Load Order

Custom files load **after** the plugin's built-in CSS, so your rules naturally override defaults. No `!important` should be needed for most overrides — use CSS variables where possible.

```
1. customEvents.js (shared utilities: escapeHtml, CSRF, event bus)
2. shared.js (shared functions: debug, API, row separators, preview)
3. Custom JS files (your scripts)
4. Plugin JS (docker.js / vm.js / dashboard.js)
5. folder-common.css (shared CSS variables and rules)
6. Plugin CSS (docker.css / vm.css / dashboard.css)
7. Custom CSS files (your styles — loaded last, highest priority)
```

---

## CSS Variables Reference

Override these in your custom CSS by redefining them in `:root`. All are defined in `folder-common.css` (loaded on Docker and VM tabs).

### Layout

| Variable | Default | Description |
|----------|---------|-------------|
| `--fv3-folder-name-width` | `220px` | Width of the folder name cell |
| `--fv3-folder-preview-height` | `3.5em` | Height of the collapsed folder preview bar |
| `--fv3-folder-preview-radius` | `4px` | Border radius of the preview bar |
| `--fv3-folder-icon-spacing` | `4px` | Gap between container icons in preview |
| `--fv3-folder-preview-wrapper-margin` | `10px` | Left margin of each preview icon wrapper |

### Advanced Preview Tooltip

| Variable | Default | Description |
|----------|---------|-------------|
| `--fv3-tooltip-min-width` | `700px` | Minimum width of the advanced preview popup |
| `--fv3-tooltip-max-height` | `80vh` | Maximum height of the advanced preview popup |
| `--fv3-tooltip-action-pane-width` | `220px` | Width of the action button sidebar |

### Colors (Theme-Agnostic Defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `--fv3-surface-tint` | `rgba(128, 128, 128, 0.1)` | Subtle background tint |
| `--fv3-hover-bg` | `rgba(128, 128, 128, 0.2)` | Hover state background |
| `--fv3-border` | `1px solid rgba(128, 128, 128, 0.3)` | Standard border style |
| `--folder-view3-graph-cpu` | `#2b8da3` | CPU graph line color |
| `--folder-view3-graph-mem` | `#5d6db6` | Memory graph line color |
| `--fv3-accent-color` | `var(--color-orange, #f0a30a)` | Accent color for panels and borders |
| `--fv3-toggle-color` | `#ff8c2f` | Dashboard collapse toggle button color |
| `--fv3-toggle-hover-color` | `#ffad5c` | Dashboard collapse toggle hover color |
| `--fv3-scrollbar-color` | `rgba(255, 140, 47, 0.5)` | Scroll overflow scrollbar thumb color |
| `--fv3-separator-bg` | `rgba(128, 128, 128, 0.15)` | Row separator background |
| `--fv3-panel-border` | `rgba(128, 128, 128, 0.2)` | Accordion/fullwidth panel border |
| `--fv3-panel-bg` | `rgba(128, 128, 128, 0.08)` | Embossed inner panel background |

### Folder Appearance

| Variable | Default | Description |
|----------|---------|-------------|
| `--fv3-folder-preview-bg` | `transparent` | Preview bar background color |
| `--fv3-folder-name-bg` | `transparent` | Folder name cell background |
| `--fv3-preview-icon-size` | `32px` | Container icon size in preview |
| `--fv3-folder-icon-size` | `48px` | Folder icon size |
| `--fv3-appname-max-width` | `120px` | Max width of container names on dashboard |
| `--fv3-row-bg` | `transparent` | VM row background |
| `--fv3-row-alt-bg` | Unraid's `--dynamix-tablesorter-tbody-row-alt-bg-color` | Alternating VM row background |

**Example override:**
```css
:root {
    --fv3-accent-color: #e74c3c;
    --fv3-toggle-color: #e74c3c;
    --fv3-toggle-hover-color: #ff6b6b;
    --fv3-folder-preview-bg: rgba(0, 0, 0, 0.05);
    --fv3-row-bg: #191818;
    --fv3-row-alt-bg: #212121;
}
```

---

## Dashboard Layout Classes

FolderView3 adds layout classes to the container `<td>` when a non-classic dashboard layout is selected. These are useful for custom CSS targeting.

| Class | Applied to | Description |
|-------|-----------|-------------|
| `.fv3-layout-classic` | Container `<td>` | Classic mode — Unraid's native tile layout with `display: flex; flex-wrap: wrap` |
| `.fv3-layout-inset` | Container `<td>` | Inset panel mode — expanded folders shown with SVG L-shaped borders |
| `.fv3-layout-embossed` | Container `<td>` | Embossed mode — expanded folders shown with solid CSS borders and colored backgrounds |
| `.fv3-layout-accordion` | Container `<td>` | Accordion mode — all folders stacked vertically |
| `.fv3-layout-fullwidth` | Container `<td>` | Full-width panel mode — expanded children span the full row width |
| `.fv3-fullwidth-panel` | Injected `<div>` | The full-width child panel (inserted after the last tile in the folder's row) |
| `.folder-showcase-outer` | Wrapper `<div>` | Wraps each folder's tile + showcase + storage on the Dashboard |
| `.fv3-greyscale-active` | Container `<td>` | Applied when any folder is expanded and greyscale dimming is enabled — dims non-expanded folders and standalone tiles |
| `.fv3-hidden` | `.folder-showcase-outer` | Applied when "Started only" hides a stopped folder |
| `.fv3-standalone` | `span.outer` | Applied to containers/VMs on the Dashboard that are not inside any folder |
| `.fv3-collapse-toggle` | `button` inside folder tile | The collapse chevron button shown on expanded folders (positioned absolutely via JS) |
| `.fv3-expanded-tab` | `span.outer` folder tile | Applied to the folder tile when expanded — adds `position: relative` for collapse toggle positioning |
| `.fv3-folder-hand` / `.fv3-folder-hand-docker` / `.fv3-folder-hand-vm` | `span` inside folder tile | Icon wrapper (clickable area around folder icon) |
| `.fv3-folder-icon` / `.fv3-folder-icon-docker` / `.fv3-folder-icon-vm` | `img` inside `.fv3-folder-hand` | The folder icon image |
| `.fv3-folder-inner` / `.fv3-folder-inner-docker` / `.fv3-folder-inner-vm` | `span` inside folder tile | Text wrapper containing name + state |
| `.fv3-folder-appname` / `.fv3-folder-appname-docker` / `.fv3-folder-appname-vm` | `span` inside `.fv3-folder-inner` | The folder's name text — target with `[expanded="true"]` parent for expanded-only styling |
| `.fv3-folder-status-icon` / `.fv3-folder-status-icon-docker` / `.fv3-folder-status-icon-vm` | `i.fa` inside `.fv3-folder-inner` | Play/square status icon |
| `.fv3-folder-state` / `.fv3-folder-state-docker` / `.fv3-folder-state-vm` | `span` inside `.fv3-folder-inner` | The "X/Y started" or "stopped" status text |
| `.fv3-folder-storage` | `div` inside folder tile | Hidden container for collapsed children |
| `.fv3-folder-showcase` | `div` inside `.folder-showcase-outer` | Container for expanded children (inset/accordion/embossed) |
| `.fv3-child-appname` | `span.inner` inside child tiles | The child container/VM name wrapper inside an expanded folder's showcase |
| `.fv3-child-appname-text` | `span` inside `.fv3-child-appname` | The actual container/VM name text span — use this to style individual child names |
| `.fv3-label-hidden` | Container `<td>` | Applied when "Show folder name in expanded panel" is set to No |
| `.fv3-inset-border` | SVG element | The SVG wrapper for the inset layout's L-shape + inner box borders |
| `.fv3-inset-lshape` | SVG `path` | The L-shaped outer border path (tab + body) — styled via CSS custom properties |
| `.fv3-inset-innerbox` | SVG `rect` | The inner container box border — styled via CSS custom properties |

### Dashboard CSS Custom Properties

These variables can be set on the layout class (e.g., `.fv3-layout-inset`) or `:root` to customize dashboard panels.

**Inset Panel (SVG borders):**

| Variable | Default | Description |
|----------|---------|-------------|
| `--fv3-inset-border-color` | `rgba(128,128,128,0.3)` | SVG L-shape outer border stroke |
| `--fv3-inset-fill` | `none` | SVG L-shape fill (tab + content area background) |
| `--fv3-inset-showcase-border` | `rgba(128,128,128,0.2)` | SVG inner box stroke |
| `--fv3-inset-showcase-fill` | `none` | SVG inner box fill (showcase area background) |
| `--fv3-inset-bg` | `transparent` | CSS background of the expanded outer wrapper |
| `--fv3-showcase-bg` | `transparent` | CSS background of the showcase (child area) |

**Embossed Panel (two-box layout — outer wrapper + inner showcase):**

| Variable | Default | Description |
|----------|---------|-------------|
| `--fv3-embossed-border` | `rgba(128,128,128,0.3)` | Outer wrapper border color |
| `--fv3-embossed-accent` | `var(--color-orange, #f0a30a)` | Outer left accent border color |
| `--fv3-embossed-bg` | `transparent` | Outer wrapper background color |
| `--fv3-embossed-shadow` | `none` | Outer wrapper inset shadow |
| `--fv3-embossed-inner-border` | `rgba(128,128,128,0.2)` | Inner showcase border color |
| `--fv3-embossed-inner-bg` | `rgba(128,128,128,0.08)` | Inner showcase background color |

**Example — custom Inset colors:**
```css
.fv3-layout-inset {
    --fv3-inset-border-color: #cfcfcf;
    --fv3-inset-fill: rgba(235,235,235,0.5);
    --fv3-inset-showcase-border: #c1c1c1;
    --fv3-inset-showcase-fill: rgba(251,245,227,0.5);
}
```

**Example — custom Embossed colors:**
```css
.fv3-layout-embossed {
    --fv3-embossed-border: #cfcfcf;
    --fv3-embossed-accent: #bababa;
    --fv3-embossed-bg: #ebebeb;
    --fv3-embossed-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
    --fv3-embossed-inner-border: #c1c1c1;
    --fv3-embossed-inner-bg: #fbf5e3;
}
```

### Dashboard Child Panel Styling

Expanded folder children on the Dashboard are rendered inside `.folder-showcase` (inset/accordion) or `.fv3-fullwidth-panel` (fullwidth). The child `span.outer` tiles receive these overrides:

```css
/* Remove tile chrome inside expansion panels */
.fv3-layout-inset .folder-showcase > span.outer.solid,
.fv3-layout-embossed .folder-showcase > span.outer.solid,
.fv3-layout-accordion .folder-showcase > span.outer.solid,
.fv3-fullwidth-panel > span.outer.solid {
    transform: none;
    background: none;
    border: none;
    box-shadow: none;
    overflow: hidden;
}
```

The `.solid` / `.apps` suffix provides enough specificity to override Unraid's base `span.outer` styles without `!important`.

### Dashboard Layout Override Examples

```css
/* Change the expansion panel border color (accordion/fullwidth) */
.fv3-layout-accordion .folder-showcase:not(:empty),
.fv3-fullwidth-panel {
    border-color: rgba(255, 165, 0, 0.3);
}

/* Change inset SVG border colors via CSS variables */
.fv3-layout-inset {
    --fv3-inset-border-color: rgba(255, 165, 0, 0.3);
    --fv3-inset-showcase-border: rgba(255, 165, 0, 0.2);
}

/* Change embossed border colors via CSS variables */
.fv3-layout-embossed {
    --fv3-embossed-border: rgba(255, 165, 0, 0.3);
    --fv3-embossed-accent: rgba(255, 165, 0, 0.5);
}

/* Hide the folder name label in expansion panels */
.fv3-layout-inset .folder-showcase::after,
.fv3-layout-embossed .folder-showcase::after,
.fv3-layout-accordion .folder-showcase::after,
.fv3-fullwidth-panel::after {
    display: none !important;
}

/* Style accordion folder tiles to full width */
.fv3-layout-accordion .folder-showcase-outer > span.outer {
    width: 100%;
}
```

---

## DOM Structure

### Folder Row (Docker & VM Tabs)

```html
<tr class="sortable folder-id-{ID} folder">
  <td class="ct-name folder-name">
    <div class="folder-name-sub">
      <i class="fa fa-arrows-v mover orange-text"></i>
      <span class="outer folder-outer">
        <span class="hand folder-hand">
          <img class="img folder-img" src="...">
        </span>
        <span class="inner folder-inner">
          <a class="exec folder-appname">Folder Name</a>
          <i class="fa folder-load-status"></i>
          <span class="state folder-state">stopped</span>
        </span>
      </span>
      <button class="folder-dropdown">
        <i class="fa fa-chevron-down"></i>
      </button>
    </div>
  </td>
  <td class="updatecolumn folder-update">...</td>
  <td>
    <div class="folder-storage"><!-- expanded container rows --></div>
    <div class="folder-preview">
      <div class="folder-preview-wrapper">
        <!-- cloned container icon/name -->
      </div>
      <div class="folder-preview-divider"></div>
      <!-- more wrappers + dividers -->
    </div>
  </td>
  <td class="advanced folder-advanced">
    <span class="folder-cpu">0%</span>
    <div class="usage-disk mm folder-load">...</div>
    <span class="folder-mem">0 / 0</span>
  </td>
  <td class="folder-autostart">...</td>
</tr>
```

### Expanded Container Row

```html
<tr class="folder-{ID}-element folder-element">
  <td class="ct-name" style="padding-left: 30px;">
    <!-- original container row content -->
  </td>
</tr>
```

### Dashboard Folder (Tile Layout)

```html
<tbody id="docker_view">
  <tr class="updated">
    <td class="fv3-layout-{mode}">
      <!-- Regular tiles -->
      <span class="outer solid">...</span>
      <!-- Folder wrapper -->
      <div class="folder-showcase-outer folder-showcase-outer-{ID}" expanded="true|false">
        <span class="outer solid folder-docker">
          <span class="hand fv3-folder-hand fv3-folder-hand-docker">
            <img class="img fv3-folder-icon fv3-folder-icon-docker" src="...">
          </span>
          <span class="inner fv3-folder-inner fv3-folder-inner-docker">
            <span class="fv3-folder-appname fv3-folder-appname-docker">Folder Name</span>
            <i class="fa fv3-folder-status-icon fv3-folder-status-icon-docker"></i>
            <span class="state fv3-folder-state fv3-folder-state-docker">2/5 started</span>
          </span>
          <div class="folder-storage fv3-folder-storage"></div>
        </span>
        <div class="folder-showcase fv3-folder-showcase" data-folder-name="Folder Name">
          <!-- Expanded child tiles (inset/accordion) -->
          <span class="outer solid">
            <span class="inner fv3-child-appname">
              <span class="fv3-child-appname-text">Container Name</span>
            </span>
          </span>
        </div>
      </div>
      <!-- Fullwidth panel (injected after last tile in row) -->
      <div class="fv3-fullwidth-panel" data-folder-name="Folder Name">
        <span class="outer solid">...</span>
      </div>
    </td>
  </tr>
</tbody>
```

### Advanced Preview Tooltip

```html
<div class="preview-outbox preview-outbox-{shortId}">
  <div class="first-row">
    <div class="preview-img"><img class="folder-img"></div>
    <div class="preview-name">
      <span class="preview-actual-name">Folder Name</span>
    </div>
    <table class="preview-status">
      <tr class="status-header">
        <th class="status-header-version">...</th>
        <th class="status-header-stats">...</th>
        <th class="status-header-autostart">...</th>
      </tr>
    </table>
  </div>
  <div class="second-row">
    <div class="action-info">
      <div class="action action-left"><!-- bulk actions --></div>
      <div class="action action-right"><!-- quick actions --></div>
      <div class="info-ct"><!-- container ID, repo --></div>
    </div>
    <div class="info-section">
      <!-- jQuery UI tabs: graph, ports, volumes -->
    </div>
  </div>
</div>
```

---

## Common Styling Recipes

| Goal | CSS |
|------|-----|
| Change folder name width | `:root { --fv3-folder-name-width: 180px; }` |
| Change preview bar height | `:root { --fv3-folder-preview-height: 2.5em; }` |
| Style folder name text | `.folder-name-sub .folder-appname { font-size: 1.5rem; font-weight: bold; }` |
| Style folder icon | `.folder-img { width: 36px; height: 36px; }` |
| Style icon hover | `.folder-img:hover { transform: scale(1.2); }` |
| Change preview icon spacing | `:root { --fv3-folder-icon-spacing: 8px; }` |
| Style expanded container rows | `.folder-element { background-color: rgba(0,0,0,0.05); }` |
| Style CPU/Memory text | `.folder-cpu { color: #00BCD4; } .folder-mem { color: #673AB7; }` |
| Change graph colors | `:root { --folder-view3-graph-cpu: #00BCD4; --folder-view3-graph-mem: #673AB7; }` |
| Style tooltip background | `.preview-outbox { background-color: #1c1b1b; }` |
| Style preview dividers | `.folder-preview-divider { border-color: #444 !important; }` |
| Style expanded folder name | `.folder-showcase-outer[expanded="true"] .fv3-folder-appname { font-weight: bold; color: #f0a30a; }` |
| Style child container names | `.fv3-child-appname-text { font-weight: bold; color: #00698c; }` |
| Hide folder start/stop text | `.folder-state { display: none; }` |
| Style dropdown chevron | `.folder-dropdown { color: #607D8B; }` |

---

## JavaScript Extension Events

The plugin dispatches custom events via `folderEvents` (a shared `EventTarget`). Listen in your custom JS:

```javascript
folderEvents.addEventListener('docker-post-folder-creation', (e) => {
    const { id, folder } = e.detail;
    // DOM is ready — modify the folder row
});
```

### Available Events

**Docker tab:**

| Event | Fired | Detail |
|-------|-------|--------|
| `docker-pre-folders-creation` | Before any folders render | `{ folders, containerInfo, order }` |
| `docker-post-folders-creation` | After all folders render | `{ folders, containerInfo, order }` |
| `docker-pre-folder-creation` | Before a single folder renders | `{ id, folder }` |
| `docker-post-folder-creation` | After a single folder renders | `{ id, folder }` |
| `docker-pre-folder-preview` | Before preview icons are built | `{ id, folder }` |
| `docker-post-folder-preview` | After preview icons are built | `{ id, folder }` |
| `docker-pre-folder-expansion` | Before folder expands/collapses | `{ id }` |
| `docker-post-folder-expansion` | After folder expands/collapses | `{ id }` |
| `docker-tooltip-before` | Before advanced preview opens | `{ id }` |
| `docker-tooltip-ready-start` | Tooltip DOM created, before content | `{ id }` |
| `docker-tooltip-ready-end` | Tooltip fully populated | `{ id }` |
| `docker-tooltip-after` | After tooltip closes | `{ id }` |
| `docker-folder-context` | Right-click context menu opens | `{ id, opts }` |

**VM tab:** Same pattern with `vm-` prefix (no tooltip events).

**Dashboard:** Dispatches both `docker-` and `vm-` events for their respective folder types.

---

## Theme Compatibility Tips

1. **Never use hardcoded colors.** Use `inherit`, `currentColor`, or `rgba()` so your theme works on both Unraid dark and light themes.

2. **Prefer CSS variables over `!important`.** Override `--fv3-*` variables in `:root` — this is the intended customization mechanism.

3. **Docker and VM share selectors.** `.folder-name-sub`, `.folder-outer`, `.folder-preview`, `.folder-dropdown` — if you style one, consider whether you need to style both.

4. **Dashboard has a different DOM structure** than Docker/VM tabs. Dashboard uses tile-based layout, not table rows. Test your theme on all three tabs.

5. **Scope your selectors.** Use `#docker_containers` or `#kvm_table` to target specific tabs and avoid accidentally styling other plugins' elements.

6. **Unraid theme variables** are available. For example, `--dynamix-tablesorter-tbody-row-alt-bg-color` provides the current theme's alternating row color.

7. **Cache busting.** Unraid's `autov()` appends a version hash to file URLs. If your changes aren't appearing, rename the file or clear your browser cache.

---

## Community Themes

These community themes serve as working examples:

- [hernandito/folder.view.custom](https://github.com/hernandito/folder.view.custom) — Compact and Midsize designs
- [Mattaton/folder.view.custom.css](https://github.com/Tyree/folder.view.custom.css) — urblack, urgray, urwhite themes
- [masterwishx/folder.view.custom.css](https://github.com/masterwishx/folder.view.custom.css) — urblack theme with extensive CSS variable system

---

## Default Styles

The plugin's built-in stylesheets for reference:

- [folder-common.css](../src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/folder-common.css) — shared variables and rules (Docker + VM)
- [docker.css](../src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/docker.css) — Docker-specific (tooltips, context menu)
- [vm.css](../src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/vm.css) — VM-specific
- [dashboard.css](../src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/dashboard.css) — Dashboard layouts

## CSS Template

A starter template for custom themes is available at [examples/custom-template.css](examples/custom-template.css). Copy it to `/boot/config/plugins/folder.view3/styles/` on your Unraid server and rename it following the naming convention above.

## CSS Tool & Theme Manager

The FolderView3 settings page includes a built-in CSS Tool with:

- **Themes** — Import community CSS themes from GitHub (`owner/repo`). One theme active at a time. Automatic update checking via GitHub API SHA comparison.
- **Variables** — Edit all 27 CSS variables with color pickers and sliders. Per-page scope (Global/Dashboard/Docker/VM).
- **Presets** — One-click preset themes (Default, Compact, Blue Accent, Muted).
- **Advanced CSS** — Free-form CSS textarea for custom rules.

### Generated CSS File

The CSS Tool generates `_fv3-generated.docker-vm-dashboard.css` in the styles directory. It loads before user CSS (underscore prefix sorts first) and contains:
- `:root {}` block with overridden variable values
- Custom CSS from the Advanced tab

### Theme File Convention

Imported themes are stored as subdirectories in `/boot/config/plugins/folder.view3/styles/`:
- `masterwishx/` — active theme folder
- `masterwishx.disabled/` — disabled theme (`.disabled` suffix)
- `.fv3-source` — JSON file inside theme folder with repo URL and file SHAs for update checking

### PHP Endpoints (CSS Tool)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `read_css_config.php` | GET | Read CSS config |
| `read_css_defaults.php` | GET | Get all variable defaults |
| `update_css_config.php` | POST | Save CSS config + generate CSS |
| `list_themes.php` | GET | List installed themes |
| `toggle_theme.php` | POST | Enable/disable theme |
| `import_theme.php` | POST | Import from GitHub |
| `delete_theme.php` | POST | Delete theme |
| `export_all.php` | GET | Full backup (all configs + CSS) |
| `import_all.php` | POST | Restore full backup |

## Debug Mode

Type **fv3debug** on any FolderView3 page to toggle debug logging. When enabled, the browser console shows folder creation, API calls, organizer sync, and stats updates with `[FV3]` prefix. State persists in localStorage across page loads.
