# <img src="img/folder-icon.png" width="32" height="32" alt="FolderView3"> FolderView3 for Unraid 7+

Organize your Docker containers and VMs into collapsible folders on the Docker, VM, and Dashboard tabs.

## Features

- **Collapsible folders** on Docker, VM, and Dashboard tabs
- **Dashboard layouts** — Classic, Full-width Panel, Accordion, Inset Panel, and Embossed views with per-section settings for Docker and VMs
- **Expand/collapse animation** with optional greyscale dimming of collapsed folders
- **Docker label assignment** — add `folder.view3: "FolderName"` to any container or Compose service to auto-assign
- **Per-folder colors** — customize border and vertical bar colors
- **Preview overflow** — Default, Expand Row, or Scroll behavior with row separators
- **Real-time stats** — live CPU/memory graphs in Advanced Preview via WebSocket (7.2+) or SSE
- **Unraid 7.2+ API integration** — hybrid GraphQL/PHP with automatic fallback for older versions
- **Native organizer sync** — folder structure syncs to Unraid's built-in Docker Organizer on 7.2+
- **Bulk actions** — start, stop, restart, pause all containers in a folder
- **Autostart sync** — container autostart order stays aligned with folder layout
- **Compose & 3rd Party awareness** — handles Docker Compose and 3rd party containers
- **Custom CSS/JS extensions** — full theming support with 40+ CSS variables
- **7 languages** — English, German, Spanish, French, Italian, Polish, Chinese
- **Debug mode** — type `fv3debug` on any page to toggle console logging

## Installation

Paste this URL into **Plugins → Install Plugin**:

```
https://raw.githubusercontent.com/chodeus/folder.view3/main/folder.view3.plg
```

For the beta channel:

```
https://raw.githubusercontent.com/chodeus/folder.view3/beta/folder.view3.plg
```

### Migrating from folder.view / folder.view2

1. Export All (Docker + VM) from old plugin's settings page
2. Backup custom CSS from `config/plugins/folder.view3/styles/`
3. Uninstall old plugin, install this fork
4. Import exported files, restore custom CSS

## Getting Started

After installation, an **Add Folder** button appears at the bottom of the Docker and VM tabs.

### Assigning containers to folders

1. **Manual selection** — pick containers when creating/editing a folder
2. **Regex matching** — auto-assign containers matching a pattern
3. **Docker label** — add `folder.view3: "FolderName"` to any container:
   ```yaml
   services:
     myapp:
       labels:
         folder.view3: "MyFolder"
   ```

## Custom CSS/JS

FolderView3 supports custom CSS and JavaScript extensions. Place files in:

- **CSS:** `/boot/config/plugins/folder.view3/styles/`
- **JS:** `/boot/config/plugins/folder.view3/scripts/`

Files follow the pattern `name.tab.css` where `tab` is `docker`, `vm`, `dashboard` (chain with `-` for multiple tabs).

A [CSS template](dev/examples/custom-template.css) is included as a starting point. See the [Developer Guide](dev/README.md) for the full CSS variables reference, DOM structure, and JS events API.

### CSS Variables (Quick Reference)

```css
:root {
    /* Colors */
    --fv3-accent-color: var(--color-orange, #f0a30a);
    --fv3-surface-tint: rgba(128, 128, 128, 0.1);
    --fv3-hover-bg: rgba(128, 128, 128, 0.2);
    --folder-view3-graph-cpu: #2b8da3;
    --folder-view3-graph-mem: #5d6db6;

    /* Folder appearance */
    --fv3-folder-preview-bg: transparent;
    --fv3-folder-name-bg: transparent;
    --fv3-folder-preview-height: 3.5em;
    --fv3-preview-icon-size: 32px;
    --fv3-scrollbar-color: rgba(255, 140, 47, 0.5);

    /* Dashboard */
    --fv3-toggle-color: #ff8c2f;
    --fv3-panel-border: rgba(128, 128, 128, 0.2);
    --fv3-panel-bg: rgba(128, 128, 128, 0.08);
}
```

### Community Themes

- [hernandito](https://github.com/hernandito/folder.view.custom) — Compact and Midsize designs
- [Mattaton](https://github.com/Tyree/folder.view.custom.css) — urblack, urgray, urwhite themes
- [masterwishx](https://github.com/masterwishx/folder.view.custom.css) — urblack with CSS variables

## Unraid 7.2+ API

On Unraid 7.2+, FolderView3 automatically detects and uses the GraphQL API for:

- **Container actions** — start/stop/restart/pause via GraphQL mutations with PHP fallback
- **Real-time stats** — WebSocket subscription replaces SSE for lower latency
- **Update checking** — container update status via API
- **Organizer sync** — folder structure mirrors to Unraid's native Docker Organizer

All features fall back gracefully on older Unraid versions — no configuration needed.

## Debug Mode

Type **fv3debug** on any FolderView3 page to toggle debug logging. Console shows folder creation, API calls, organizer sync activity, and stats updates with `[FV3]` prefix. State persists across page loads.

For PHP server-side debug: `touch /tmp/fv3_debug_enabled` on the Unraid console. Logs write to `/tmp/folder_view3_php_debug.log`.

## Project History

Originally created by [scolcipitato](https://github.com/scolcipitato/folder.view), ported to Unraid 7 by [VladoPortos](https://github.com/VladoPortos/folder.view2), actively maintained by [chodeus](https://github.com/chodeus/folder.view3).

## Support

- **Unraid Forum:** [FolderView3 Support Thread](https://forums.unraid.net/topic/197223-plugin-folderview3/)
- **GitHub Issues:** [chodeus/folder.view3](https://github.com/chodeus/folder.view3/issues)

## Credits

- [scolcipitato](https://github.com/scolcipitato) — original creator
- [VladoPortos](https://github.com/VladoPortos) — Unraid 7 port and maintenance
- [bmartino1](https://github.com/bmartino1) — testing and feedback
- [Masterwishx](https://github.com/masterwishx) — testing and feedback

## License

The original codebase (scolcipitato/folder.view, VladoPortos/folder.view2) is unlicensed. This license applies to contributions made in this fork only.
