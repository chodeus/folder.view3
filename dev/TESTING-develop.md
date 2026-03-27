# FolderView3 Develop Branch — Test Plan

Version: `2026.03.27-develop`
Unraid: 7.2.4

## Installation

Push develop branch to origin, then install on Unraid:
```
https://raw.githubusercontent.com/chodeus/folder.view3/develop/folder.view3.plg
```

Or manually copy the .txz to `/boot/config/plugins/folder.view3/` and install.

---

## Test 1: Docker Tab — Basic Rendering

- [ ] Docker tab loads without console errors
- [ ] All folders render with correct names and icons
- [ ] Folder previews show container icons
- [ ] Collapsed folders expand on click
- [ ] Expanded-by-default folders start expanded
- [ ] Row separators appear (if enabled in folder settings)
- [ ] Scroll overflow mode works (horizontal scroll, scrollbar visible on hover)
- [ ] Expand overflow mode works (rows wrap, auto-height)

## Test 2: VM Tab — Basic Rendering

- [ ] VM tab loads without console errors
- [ ] All VM folders render with correct names and icons
- [ ] Folder previews show VM icons
- [ ] Collapsed/expanded states work
- [ ] Row separators and overflow modes work (same as Docker)

## Test 3: Dashboard — Basic Rendering

- [ ] Dashboard loads without console errors
- [ ] Docker folders appear in Docker section
- [ ] VM folders appear in VM section
- [ ] All layout modes work: Classic, Accordion, Embossed, Inset
- [ ] Fullwidth panel expands correctly
- [ ] Collapse toggle works

## Test 4: Folder Actions (Docker)

- [ ] Start all containers in a folder
- [ ] Stop all containers in a folder
- [ ] Restart all containers in a folder
- [ ] Custom actions work (if configured)
- [ ] Context menu (right-click) actions work
- [ ] Folder autostart toggle works

## Test 5: Folder Actions (VM)

- [ ] Start all VMs in a folder
- [ ] Stop all VMs in a folder
- [ ] Custom actions work (if configured)

## Test 6: Dashboard Actions

- [ ] Docker folder actions work from dashboard
- [ ] VM folder actions work from dashboard
- [ ] Custom actions work from dashboard

## Test 7: Advanced Preview (Docker Tooltip)

- [ ] Hover over a container in folder preview → tooltip appears
- [ ] Tooltip shows container info, ports, volumes
- [ ] CPU/memory graphs render (Chart.js)
- [ ] Action buttons in tooltip work (start/stop/restart/logs/console)
- [ ] Tab switching works (Ports, Volumes, Graphs)

## Test 8: GraphQL API Integration (7.2+ Only)

### How to verify which path is being used

1. Open browser DevTools (F12) → Console tab
2. Type `fv3debug` anywhere on the page → should see `[FV3] Debug mode ON`
3. Reload the page (Ctrl+R)

**Check API detection** — look for one of these messages on reload:
- `[FV3] API: Unraid GraphQL API detected, version: 7.2.4` — GraphQL is active
- `[FV3] API: GraphQL not available, using PHP fallback` — using legacy PHP

**Check actions** — stop or start a container in a folder, then check console:
- `[FV3] API: Docker start <id> OK` — action went through GraphQL
- `[FV3] API: Docker GraphQL failed, falling back: <error>` — GraphQL failed, PHP took over
- No `[FV3] API:` message at all — PHP fallback was used directly (API not detected)

### Checklist

- [ ] Enable debug mode (type `fv3debug`, reload)
- [ ] Confirm API detection message appears: `Unraid GraphQL API detected`
- [ ] Stop a Docker container via folder action → confirm `[FV3] API: Docker stop` in console
- [ ] Start it back → confirm `[FV3] API: Docker start` in console
- [ ] Stop a VM via folder action → confirm `[FV3] API: VM stop` in console
- [ ] Start it back → confirm `[FV3] API: VM start` in console
- [ ] Dashboard: repeat a Docker start/stop → same GraphQL messages appear
- [ ] All actions complete successfully (containers actually start/stop)
- [ ] Network tab (DevTools): actions go to `/graphql` as POST, not to PHP endpoints

## Test 9: Debug System

- [ ] Type `fv3debug` on Docker tab → console shows debug mode ON
- [ ] Reload page → debug messages appear: `[FV3] createFolders: Entry`, etc.
- [ ] Type `fv3debug` again → console shows debug mode OFF
- [ ] Reload → no debug messages
- [ ] Debug persists across page navigations (localStorage)

## Test 10: Resize / Advanced-Basic Toggle

- [ ] Resize browser window → row separators and preview heights recalculate
- [ ] Toggle Advanced/Basic view → preview heights adjust
- [ ] No visual glitches during resize

## Test 11: CSS Variables (Custom CSS)

If you have custom CSS installed (Tyree's themes, masterwishx, hernandito):

- [ ] Custom CSS still applies correctly
- [ ] No visual regressions compared to stable release
- [ ] Override test: add to custom CSS `--fv3-accent-color: red;` → accordion borders turn red
- [ ] Override test: `--fv3-scrollbar-color: blue;` → scroll preview scrollbar turns blue

If no custom CSS, skip this section.

## Test 12: Mobile / Touch (if testing on phone/tablet)

- [ ] Folder previews are visible without hovering (touch devices can't hover)
- [ ] Dropdown buttons are large enough to tap (44px minimum)
- [ ] Firefox: scrollbar is visible (not just webkit)
- [ ] Dashboard at 360px width: single column layout

## Test 13: Folder Editor

- [ ] Create a new folder → works
- [ ] Edit existing folder → works
- [ ] Delete a folder → works
- [ ] Settings page (FolderView3.page) loads without errors

## Test 14: Self-Healing JSON

To test (advanced):
1. Enable debug mode (type `fv3debug`)
2. Load Docker tab normally → check localStorage for `fv3-docker-folders` key
3. Corrupt the server response (not easy to do, skip if not practical)
4. Verify folders still load from localStorage backup

## Test 15: Regression Check

Compare against the stable 2026.03.27 release:

- [ ] No visual differences on Docker tab (same layout, colors, spacing)
- [ ] No visual differences on VM tab
- [ ] No visual differences on Dashboard
- [ ] Container start/stop/restart timing feels the same
- [ ] No new console errors or warnings

---

## How to Report Issues

For each failing test, note:
1. Which test number failed
2. Browser console errors (if any)
3. Screenshot if visual
4. Whether the issue also exists on the stable 2026.03.27 release (pre-existing vs new)
