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
1. customEvents.js (shared utilities)
2. Custom JS files (your scripts)
3. Plugin JS (docker.js / vm.js / dashboard.js)
4. Plugin CSS (docker.css / vm.css / dashboard.css)
5. Custom CSS files (your styles — loaded last, highest priority)
```

---

## CSS Variables Reference

Override these in your custom CSS by redefining them in `:root`. All are defined in both `docker.css` and `vm.css`.

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

### VM Row Backgrounds (Override Hooks)

These are **not defined** by the plugin — they exist as CSS variable fallbacks in `vm.js` inline styles. Define them in your custom CSS to control VM table row colors:

| Variable | Fallback | Description |
|----------|----------|-------------|
| `--fv3-row-bg` | `transparent` | Normal VM row background |
| `--fv3-row-alt-bg` | Unraid's `--dynamix-tablesorter-tbody-row-alt-bg-color` | Alternating VM row background |

**Example override:**
```css
:root {
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
| `.fv3-folder-appname` | `span` inside folder tile | The folder's name text — target with `[expanded="true"]` parent for expanded-only styling |
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

**Embossed Panel (CSS borders):**

| Variable | Default | Description |
|----------|---------|-------------|
| `--fv3-embossed-border` | `rgba(128,128,128,0.3)` | Outer border color |
| `--fv3-embossed-accent` | `rgba(128,128,128,0.4)` | Left accent border color |
| `--fv3-embossed-bg` | `rgba(128,128,128,0.08)` | Outer background color |
| `--fv3-embossed-showcase-border` | `rgba(128,128,128,0.2)` | Showcase border color |
| `--fv3-embossed-showcase-bg` | `rgba(128,128,128,0.05)` | Showcase background color |

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
    --fv3-embossed-showcase-border: #c1c1c1;
    --fv3-embossed-showcase-bg: #fbf5e3;
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
    --fv3-embossed-showcase-border: rgba(255, 165, 0, 0.2);
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
          <!-- Folder tile: icon, name (.fv3-folder-appname), status -->
        </span>
        <div class="folder-showcase" data-folder-name="Folder Name">
          <!-- Expanded child tiles (inset/accordion) -->
          <span class="outer solid">
            <span class="inner fv3-child-appname">
              <span class="fv3-child-appname-text">Container Name</span>
            </span>
          </span>
        </div>
        <div class="folder-storage">
          <!-- Hidden/collapsed children -->
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

- [docker.css](../src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/docker.css)
- [vm.css](../src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/vm.css)
- [dashboard.css](../src/folder.view3/usr/local/emhttp/plugins/folder.view3/styles/dashboard.css)
