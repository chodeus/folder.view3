# FolderView3 - Unraid Plugin

## Project Overview
Unraid 7+ plugin that organizes Docker containers and VMs into collapsible folders on Docker, VM, and Dashboard tabs. Fork of folder.view/folder.view2 (originally by scolcipitato), maintained by chodeus.
Version is date-based (YYYY.MM.DD), set by pkg_build.sh.

## Branches
- `beta` — active development (default working branch)
- `main` — stable releases, PR target

## Architecture
- **Frontend**: jQuery + vanilla JS (no bundler, no modules), CSS3, Chart.js for graphs
- **Backend**: PHP 7+ API with JSON file storage at `/boot/config/plugins/folder.view3/`
- **Pages**: Unraid `.page` files that inject into Docker, VM, and Dashboard tabs
- **Build**: `pkg_build.sh` creates `.txz` packages, GitHub Actions for releases
- **Versioning**: `YYYY.MM.DD` date-based, beta branch for pre-releases

## Key Source Paths
```
src/folder.view3/usr/local/emhttp/plugins/folder.view3/
  server/       - PHP API endpoints (lib.php is the core library)
  scripts/      - JS: docker.js, vm.js, dashboard.js, folder.js, folderview3.js
  styles/       - CSS: docker.css, vm.css, dashboard.css, folder.css, folderview3.css
  langs/        - i18n JSON files (en, de, es, fr, it, pl, zh)
  pages/        - Unraid page definitions
```

### JavaScript (`scripts/`)
| File | Lines | Purpose |
|------|-------|---------|
| `dashboard.js` | ~1858 | Dashboard view — shows both Docker and VM folders |
| `docker.js` | ~1678 | Docker tab folder rendering, bulk ops, SSE/WebSocket stats, advanced preview |
| `csstool.js` | ~1362 | CSS Tool — theme manager, variable editor, presets, custom CSS |
| `shared.js` | ~930 | **Shared utilities.** Debug system, JSON recovery, GraphQL API, WebSocket stats, error banners, folder defaults |
| `vm.js` | ~756 | VM tab folder rendering and bulk ops |
| `folder.js` | ~719 | Folder create/edit form logic (Folder.page) |
| `folderview3.js` | ~686 | Settings page — import/export/delete folders, folder defaults |
| `include/` | — | Third-party libs: Chart.js, moment.js, jquery.i18n, jquery.multiselect |
| `include/customEvents.js` | ~112 | Shared event bus (`folderEvents`), `escapeHtml()` utility, CSRF token ajaxPrefilter |

### PHP Backend (`server/`)
| File | Purpose |
|------|---------|
| `lib.php` | **Core library (~1358 lines).** All CRUD, readInfo(), Tailscale, CSS config, theme management, folder defaults |
| `create.php` | Thin wrapper → lib.php createFolder |
| `read.php` | Thin wrapper → lib.php readFolder |
| `read_info.php` | Thin wrapper → lib.php readInfo (container/VM details) |
| `read_order.php` | Thin wrapper → user prefs order |
| `read_unraid_order.php` | Thin wrapper → Unraid display order |
| `update.php` | Thin wrapper → lib.php updateFolder |
| `delete.php` | Thin wrapper → lib.php deleteFolder |
| `cpu.php` | Returns CPU core count |
| `version.php` | Returns plugin version string |
| `read_css_config.php` | Returns CSS variable/preset configuration |
| `save_css_config.php` | Saves CSS variable/preset configuration |
| `default_css.php` | Returns default CSS variable values |
| `list_themes.php` | Lists installed custom themes |
| `upload_theme.php` | Imports theme from GitHub repo URL |
| `delete_theme.php` | Removes installed theme |
| `read_settings.php` | Returns folder default settings |
| `save_settings.php` | Saves folder default settings |
| `export_all.php` | Exports all folder configs + CSS + settings |
| `import_all.php` | Imports full backup |

### Page Templates (root of plugin dir)
- `Folder.page` — Folder create/edit form (XMENU type, ~716 lines)
- `folder.view3.Docker.page` — Injects into Docker tab
- `folder.view3.VMs.page` — Injects into VMs tab
- `folder.view3.Dashboard.page` — Injects into Dashboard
- `FolderView3.page` — Settings/management page (~541 lines)

### CSS (`styles/`)
- `folder-common.css` — **Shared CSS variables (40+), common folder layouts, error banners** (~622 lines)
- `csstool.css` — CSS Tool UI styles (~606 lines)
- `dashboard.css` — Dashboard folder styles (~575 lines)
- `folderview3.css` — Settings page styles (~528 lines)
- `folder.css` — Folder editor form styles (~429 lines)
- `docker.css` — Docker-specific preview tooltips, folder preview (~329 lines)
- `vm.css` — VM-specific overrides (~29 lines, most rules in folder-common.css)

### i18n (`langs/`)
7 languages: en, de, es, fr, it, pl, zh. Uses jquery.i18n with `data-i18n` attributes.

## Tech Stack
- JavaScript (vanilla + jQuery), no build system/bundler
- PHP 7.4+ backend (JSON file storage, no SQL)
- Chart.js + chartjs-plugin-streaming + moment.js for real-time graphs
- jquery.i18n for internationalization
- jQuery UI MultiSelect for container selection
- Unraid SSE stream (`dockerload`) for live CPU/memory data

## Data Flow
```
Browser loads .page file → JS fetches in parallel:
  read.php (folder configs) + read_info.php (container details) + read_unraid_order.php
    → createFolders() renders DOM
    → SSE stream updates stats in real-time
```

## Config (on Unraid)
- `/boot/config/plugins/folder.view3/docker.json` — Docker folder definitions
- `/boot/config/plugins/folder.view3/vm.json` — VM folder definitions
- `/boot/config/plugins/folder.view3/version` — Version string

## Custom CSS/JS Extension System
- Users place custom files in `/boot/config/plugins/folder.view3/styles/` and `scripts/`
- Loaded via `custom.php` after built-in styles (natural cascade override)
- Files ending in `.disabled` are skipped
- Dev guide and examples in `dev/` directory

## Public API (Do NOT Rename - Used by Community Custom CSS)
### Frozen Class Names (used by masterwishx and hernandito custom CSS repos):
- Folder structure: `.folder`, `.folder-name`, `.folder-name-sub`, `.folder-outer`, `.folder-inner`, `.folder-appname`, `.folder-dropdown`
- Preview: `.folder-preview`, `.folder-preview-wrapper`, `.folder-preview-divider`
- Elements: `.folder-element`, `.folder-element-docker`, `.folder-element-vm`
- Dashboard: `.folder-showcase-outer`, `.folder-showcase`, `.folder-docker`, `.folder-vm`
- Images: `.folder-img-docker`, `.folder-img-vm`
- Layouts: `.fv3-layout-classic`, `.fv3-layout-accordion`, `.fv3-layout-embossed`, `.fv3-layout-inset`
- Modes: `.fv3-overflow-expand`, `.fv3-overflow-scroll`
- Controls: `.fv3-collapse-toggle`, `.fv3-expanded-tab`, `.fv3-folder-appname`, `.fv3-fullwidth-panel`
- Attribute: `[expanded="true"]` on `.folder-showcase-outer`

### Frozen CSS Variables (consumed by custom CSS community):
- `--folder-view3-graph-cpu`, `--folder-view3-graph-mem`
- `--fv3-surface-tint`, `--fv3-hover-bg`, `--fv3-border`
- `--fv3-inset-*` (6 vars), `--fv3-embossed-*` (6 vars)
- `--tooltip-spacing`

## Known Bugs
None currently tracked. Original 5 bugs (setTimeout, align-items, implicit global, toggle flag, unguarded JSON.parse) all fixed and shipped as of v2026.04.04.

## DOM Safety Rules
- **NEVER use `innerHTML` replacement on elements that may have jQuery/JS event handlers** (table cells, buttons, interactive containers). Use text node walking (`TreeWalker` with `NodeFilter.SHOW_TEXT`) to modify text while preserving DOM structure and event bindings.
- Before adding selectors to existing DOM manipulation loops, verify the new targets don't have bound event handlers. Docker table cells (`#docker_containers td`) and VM table cells (`#kvm_table td`) have jQuery-bound click handlers for expand/collapse — innerHTML replacement destroys them.
- Safe targets for innerHTML replacement: tooltips, info popups, status text — elements that are purely display with no interactivity.
- **shared.js changes always require Phase 3 verification** — no exceptions for "small" changes. Re-read the modified function, trace the DOM impact, verify restore/cleanup works.

## Regression-Prone Areas
- **Dashboard chevron positioning** (12+ fix commits) — RESOLVED: `fv3PositionChevrons()` deleted entirely, now CSS-only via `position: static` + `inline-flex`.
- **Fullwidth panel placement** (3 rounds of fixes) — DOM insertion order breaks with multiple expanded folders or Started Only toggle.
- **Vertical centering** (2 explicit reverts) — CSS conflicts with Unraid's own styles.
- **Incognito mode** — innerHTML replacement on table cells destroyed event handlers (2026.04.05). Fixed with text node walking. Any future incognito scrubbing on interactive elements MUST use text node approach.
- **dashboard.js + dashboard.css** are the highest-churn files (27 combined touches in 100 commits).

## Intentional Code Duplication
- `folderCustomAction()` x4 across docker.js, vm.js, dashboard.js (2x) — each has Docker/VM-specific action handling
- Context menu building x3 — each page has different menu items and handlers
- `escapeHtml()` in folder.js and folderview3.js — separate page loads, can't share with customEvents.js

## Remaining Architecture Work
- Break up `createFolder()` — still large, not yet refactored

## Build & Deploy

### Local Build
```bash
bash pkg_build.sh              # stable: YYYY.MM.DD, URLs → main
bash pkg_build.sh --beta       # beta: YYYY.MM.DD-beta, URLs → beta
bash pkg_build.sh --beta 2     # beta: YYYY.MM.DD-beta2, URLs → beta
```

### GitHub Actions Workflows
- `release-beta.yml` — Manual trigger. Builds beta on beta branch, auto-increments beta number per date.
- `release-stable.yml` — Manual trigger. Merges beta→main, builds stable, creates GitHub release.

### Beta Build Checklist
**Every beta build MUST follow this order:**
1. Commit all source changes to beta
2. Add changelog entry to `folder.view3.plg` CHANGES section (before building!)
3. Update `CHANGELOG-fixes.md` with detailed fix descriptions
4. Build the package (`pkg_build.sh --beta N`)
5. Commit the package + .plg → push beta

### Stable Build Checklist
**Every stable build MUST follow this order:**
1. Merge beta → main
2. Remove beta archive, build stable (`pkg_build.sh`)
3. Commit the package + .plg → push main
4. Create GitHub release (see GitHub Release section below)
5. If merging main back into beta (hotfix, changelog), **always verify** the beta `.plg` URL points to `beta` not `main` — the merge overwrites it

The .plg CHANGES entry must be added **before** building so the changelog is baked into the .txz package.

### GitHub Release
Always create a GitHub release after pushing stable to main. `gh release create` has a persistent scope bug — use the API instead:
```bash
gh api repos/chodeus/folder.view3/releases --method POST \
  -f tag_name=vVERSION -f target_commitish=main -f name="vVERSION" \
  -f body="changelog" --jq '.id'
# Then upload the asset:
gh api "https://uploads.github.com/repos/chodeus/folder.view3/releases/RELEASE_ID/assets?name=folder.view3-VERSION.txz" \
  --method POST -H "Content-Type: application/octet-stream" \
  --input archive/folder.view3-VERSION.txz
```

### Build Gotchas
- Collision detection: if `folder.view3-VERSION.txz` exists, script appends `.N` — delete old file before rebuilding same version
- `.plg` URLs use XML entities (`&github;`, `&name;`) — sed patterns must match these literally
- `copy_to_git.sh` — run on Unraid to sync live plugin files back to git repo

## Unraid Internals
- **Autostart file** (`/var/lib/docker/unraid-autostart`): space-delimited, format is `name` or `name delay` (NOT equals-delimited)
- **`var_split`** is an Unraid built-in (defined in DockerClient.php): `explode(' ', $item)[$i]` — splits by space, returns element at index `$i` (default 0)
- **Docker container autostart** is toggled by Unraid's own AJAX handler via `.switch-button-background` click — the plugin never writes to the autostart file directly for toggle operations
- **VM autostart** uses libvirt's `domain_get_autostart()` — no file parsing involved

## Security Patterns
- **XSS prevention:** `escapeHtml()` must wrap all user-controlled data (folder names, icons, container names) before inserting into HTML. Defined in `customEvents.js` (for docker/vm/dashboard pages), `folder.js` (for Folder.page), and `folderview3.js` (for settings page).
- **POST for mutations:** All state-changing operations (create, update, delete) use `$.post()`, never `$.get()`. Read-only endpoints can use GET.
- **Input validation:** `fv3_validate_type()` in `lib.php` allowlists the `type` parameter to `'docker'` or `'vm'` on all PHP endpoints.
- **CSRF tokens:** `ajaxPrefilter` in JS auto-appends `csrf_token` to all POST requests to plugin endpoints. Server-side validation is handled by Unraid's emhttp.

## Limetech Official Security Requirements
1. **GET vs POST**: GET for reading only, POST for actions. Never use `$_REQUEST`. CSRF token never in querystring. — COMPLIANT (10 GET read endpoints, 10 POST mutation endpoints, zero $_REQUEST).
2. **XSS**: Wrap variables with `htmlspecialchars($var)` before outputting to browser. — COMPLIANT: all JSON endpoints set `Content-Type: application/json` (prevents HTML rendering). CSS user input sanitized for `@import`, `url()`, `expression()`, `javascript:`.
3. **Config files**: Use `parse_plugin_cfg()` instead of raw `parse_ini_file()` for plugin settings. — N/A for us (we use JSON), but our 5 parse_ini_file() calls read other plugins' configs (dockerMan, VM prefs).
4. **Shell exec**: Always `escapeshellarg()` on user input. — COMPLIANT (both exec calls use it + regex pre-validation).
5. **CSRF**: Validated on all POST endpoints. — COMPLIANT (Unraid emhttp auto-validates).

## Script Loading per Page
Each page loads different JS files — `escapeHtml()` and the CSRF ajaxPrefilter are defined in 3 places to cover all pages without duplication:
| Page | Scripts loaded |
|------|---------------|
| Docker tab | `customEvents.js` → `shared.js` → `docker.js` |
| VM tab | `customEvents.js` → `shared.js` → `vm.js` |
| Dashboard | `customEvents.js` → `shared.js` → `dashboard.js` |
| Folder.page (editor) | `folder.js` only |
| FolderView3.page (settings) | `folderview3.js` → `csstool.js` |

Never add `escapeHtml` or `ajaxPrefilter` to `docker.js`, `vm.js`, or `dashboard.js` — they get it from `customEvents.js`.

## Key Patterns & Quirks
- **No state library:** Global `let globalFolders = {}` holds all folder state. Direct mutation.
- **SSE data varies by Unraid version:** Some pass `e_sse.data`, others pass `e_sse` directly as string. Code checks both.
- **Docker Compose containers** lack `<a>` tags in `.appname` — selectors use `.appname` not `.appname a`.
- **Custom actions** stored as base64-encoded JSON (`btoa`/`atob`) to work around form submission limits.
- **Folder IDs** are random 20-char base64 strings generated by PHP.
- **Constraint-based UI:** Settings visibility uses `constraint="preview-1 preview-3"` attributes toggled by JS.
- **Drag-and-drop** is custom jQuery (not HTML5 native), using dragstart/dragend/dragover.
- **Order calculation** is complex: merges Unraid user prefs order, webui order, and new containers. Fragile — be careful editing `createFolders()`.
- **Theme compatibility:** CSS uses `inherit`, `currentColor`, and `rgba(128,128,128,X)` instead of hardcoded colors.
- **Event system:** `folderEvents` dispatches `docker-pre/post-folders-creation`, `vm-pre/post-folders-creation` for extensions.
- **Extension point:** Users can add custom JS/CSS via `/boot/config/plugins/folder.view3/scripts/` and `/styles/`, loaded by `custom.php`.
- **Bulk folder actions** (start/stop/restart) fire all container requests in parallel via `Promise.all()` — no Docker Compose dependency ordering. This is by design.
- **VM rows** found by name text: `$(this).find('td.vm-name span.outer span.inner a').first().text().trim()`
- **Docker rows** found by `#ct-` ID or `.appname` text.
- **Folder row HTML** (docker.js line ~263): `td.ct-name.folder-name > div.folder-name-sub > span.folder-outer > span.folder-inner` — uses flexbox layout with `.folder-dropdown` pinned right via `margin-left: auto`.
- **Docker and VM CSS parity:** Common folder layout rules (`.folder-name-sub`, `.folder-outer`, `.folder-dropdown`) are now in `folder-common.css`. `docker.css` has Docker-specific overrides, `vm.css` has VM-specific overrides (minimal, 29 lines).

## Conventions
- Don't add unnecessary comments to code — keep changes minimal and focused
- Keep JS modular (one concern per file)
- No TypeScript, no bundler — plain JS loaded directly by Unraid
- Use theme-agnostic CSS (no hardcoded colors)
- No `!important` in CSS — use specificity/cascade instead
- Update all 7 language files when adding i18n keys
- Test on Unraid before merging to main
- Keep changelog entries brief — one short line per change
- Release notes: each date should be its own `###` heading. Never consolidate multiple dates.
- Mirror CSS changes between `docker.css` and `vm.css` when they share the same selectors
- Use PHP `file_exists()` checks for Unraid version-specific includes (see Folder.page for example)
- HTML `pattern` attributes: Chrome uses `/v` (Unicode Sets) regex flag — escape `/` and `-` inside character classes
- Git: `origin` = chodeus/folder.view3 (push here), `upstream` = VladoPortos/folder.view2 (never push). When checking out beta, use `git checkout --track origin/beta`.
- When switching to beta branch, always `git fetch origin beta && git reset --hard origin/beta` to avoid local divergence

## References
- Active custom CSS repos: masterwishx/folder.view.custom.css, hernandito/folder.view.custom
- Fork to avoid: alexphillips-dev/FolderView-Plus (over-engineered AI rewrite, 7x code size)
- Unraid plugin dev guide: mstrhakr/plugin-docs (unofficial but validated against 7.2.3)
- Unraid CSS variables: `--background`, `--header`, `--text`, `--border`, `--link`, `--button`, `--success`, `--warning`, `--error`, plus color scales `--gray-000` to `--gray-900`, `--orange-500`, etc.
