# <img src="img/folder-icon.png" width="32" height="32" alt="FolderView2"> FolderView2 for Unraid 7+

Organize your Docker containers and VMs into collapsible folders on the Docker, VM, and Dashboard tabs.

## Features

- **Collapsible folders** on Docker, VM, and Dashboard tabs
- **Docker label assignment** — add `folder.view2: FolderName` to any container or Compose service to auto-assign it to a folder
- **Per-folder colors** — customize border and vertical bar colors per folder
- **Real-time stats** — live CPU/memory graphs in Advanced Preview
- **Bulk actions** — start, stop, or restart all containers in a folder at once
- **Autostart sync** — container autostart order stays aligned with your folder layout automatically
- **Custom CSS/JS extensions** — drop files into the plugin's `styles/` or `scripts/` directory
- **7 languages** — English, German, Spanish, French, Italian, Polish, Chinese

## Project History

FolderView2 was originally created by [scolcipitato](https://github.com/scolcipitato/folder.view), then ported to Unraid 7 and maintained by [VladoPortos](https://github.com/VladoPortos/folder.view2). This fork is actively maintained by [chodeus](https://github.com/chodeus/folder.view2) with additional bug fixes and new features.

## Installation

Paste this URL into the Unraid Plugins page (**Plugins → Install Plugin**):

```
https://raw.githubusercontent.com/chodeus/folder.view2/main/folder.view2.plg
```

![Install FolderView2](img/plugin_install.png)

### Migrating from folder.view or VladoPortos's fork

1. In your old plugin, go to **Plugins → FolderView2** and click **Export All** for both Docker and VM folders
2. Backup your custom CSS if you're using them in the styles folder **config\plugins\folder.view2\styles\**
3. Uninstall the old plugin
4. Install this fork using the URL above
5. Go to **Plugins → FolderView2** and **Import** your exported files
6. Copy your custom CSS files back into the styles folder

## Getting Started

After installation, an **Add Folder** button appears at the bottom of the Docker and VM tabs, next to "Add Container" / "Add VM".

### Assigning containers to folders

There are two ways to assign containers to a folder:

1. **Manual selection** — pick containers from the list when creating/editing a folder
2. **Docker label** — add the label `folder.view2` with the folder name as the value to any container or Docker Compose service:
   ```yaml
   services:
     myapp:
       labels:
         - folder.view2: MyFolder
   ```

## What's Different in This Fork

This fork includes changes beyond the upstream VladoPortos version:

- **Active autostart sync** — container autostart order is automatically rewritten to match your folder layout whenever you save or reorder. Stale entries from removed containers are cleaned up automatically. This replaces the old passive indicator from the original plugin.
- **Folder WebUI setting** — open a container's WebUI directly from the folder context menu
- **Dashboard fixes** — VM folder icons and names now have correct CSS classes

See [CHANGELOG-fixes.md](CHANGELOG-fixes.md) for the full list of changes.

## Custom CSS Themes

FolderView2 supports custom CSS and JavaScript extensions. Place files in:

- **CSS:** `/boot/config/plugins/folder.view2/styles/`
- **JS:** `/boot/config/plugins/folder.view2/scripts/`

Files must follow the naming pattern `name.tab.css` or `name.tab.js`, where `tab` is one of `dashboard`, `docker`, or `vm` (chain with `-` for multiple tabs, e.g., `mytheme.dashboard-docker.css`).

See the [Developer Guide](dev/README.md) for full details.

### Community Themes

- [hernandito](https://github.com/hernandito/folder.view.custom) — Compact and Midsize layout designs
- [Mattaton](https://github.com/Tyree/folder.view.custom.css) — urblack, urgray, urwhite themes
- [masterwishx](https://github.com/masterwishx/folder.view.custom.css) — urblack theme with CSS variables

> **Note:** These themes were originally created for folder.view / earlier versions of folder.view2. Check each repo for compatibility with the current version.

## Support

- **Unraid Forum:** [FolderView2 Support Thread](https://forums.unraid.net/topic/189167-plugin-folderview2)
- **GitHub Issues:** [chodeus/folder.view2](https://github.com/chodeus/folder.view2/issues)

## Libraries

- [Chart.js](https://www.chartjs.org/)
- [chartjs-adapter-moment](https://github.com/chartjs/chartjs-adapter-moment)
- [Moment.js](https://momentjs.com/)
- [chartjs-plugin-streaming](https://github.com/nagix/chartjs-plugin-streaming)
- [jquery.i18n](https://github.com/wikimedia/jquery.i18n)
- [jQuery UI MultiSelect](https://github.com/ehynds/jquery-ui-multiselect-widget)

## Credits

- [scolcipitato](https://github.com/scolcipitato) — original creator
- [VladoPortos](https://github.com/VladoPortos) — Unraid 7 port and maintenance
- [bmartino1](https://github.com/bmartino1) — testing and feedback
- [Masterwishx](https://github.com/masterwishx) — testing and feedback
