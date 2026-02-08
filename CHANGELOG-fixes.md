# FolderView2 Fork Changelog

## Summary

This fork (`chodeus/folder.view2`) contains fixes and improvements over upstream (`VladoPortos/folder.view2`). Changes include Docker Compose container grouping, SSE data handling for CPU/memory stats, theme-agnostic Advanced Preview tooltip, folder settings page layout, docker context menu styling, responsive sizing, plugin manifest corrections, and removal of broken CSS references.

---

## Version 2026.02.08-beta5

### Changes

#### Files: `styles/docker.css`, `styles/vm.css`

**Fix: Vertically center folder name, icon, and dropdown in folder row:**

```diff
 .folder-name-sub {
     display: flex;
-    align-items: flex-start;
+    align-items: center;
     overflow: hidden;
     gap: 4px;
 }
```

- **Problem:** The folder icon, name/status text, and dropdown button were aligned to the top of the row (`flex-start`), causing them to sit higher than the centered content in other columns (version, network, etc.).
- **Fix:** Changed `align-items` from `flex-start` to `center` on `.folder-name-sub` in both `docker.css` and `vm.css`. This vertically centers all folder row contents to align with the rest of the table row.

---

## Version 2026.02.08-beta3

### Changes

#### Files: `styles/docker.css`, `styles/vm.css`

**Fix: Folder name wrapping in basic view:**

```diff
+.folder-name-sub {
+    display: flex;
+    align-items: flex-start;
+    overflow: hidden;
+    gap: 4px;
+}
+
+.folder-outer {
+    overflow: hidden;
+    text-overflow: ellipsis;
+    white-space: nowrap;
+    min-width: 0;
+}
+
 .folder-dropdown {
     padding: 6px;
     min-width: 0;
     margin: 0;
-    margin-left: 1em;
-    float: right;
+    margin-left: auto;
+    flex-shrink: 0;
 }
```

- **Problem:** In basic view, folder names (e.g. "Media Automation", "File Management") would wrap to extra lines, causing rows to be taller than expected. The dropdown arrow button also floated incorrectly.
- **Fix:** Changed `.folder-name-sub` to flexbox layout with `gap: 4px` for consistent spacing. Applied `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to `.folder-outer` so long names truncate with ellipsis. Replaced `float: right` on `.folder-dropdown` with `margin-left: auto; flex-shrink: 0` to keep the button pinned right without wrapping issues. Same fix applied to both Docker and VM tabs.

---

## Version 2026.02.07-beta2

### Changes

#### File: `scripts/vm.js`

**Fix: VM folder assignment bug — containers matched by positional index instead of name (line 237):**

```diff
-    $(`tr.folder-id-${id} div.folder-storage`).append($('#kvm_list > tr.sortable').eq(index).addClass(`folder-${id}-element`).addClass(`folder-element`).removeClass('sortable'));
+    let $vmTR = $('#kvm_list > tr.sortable').filter(function() {
+        return $(this).find('td.vm-name span.outer span.inner a').first().text().trim() === container;
+    }).first();
+    $(`tr.folder-id-${id} div.folder-storage`).append($vmTR.addClass(`folder-${id}-element`).addClass(`folder-element`).removeClass('sortable'));
```

- **Problem:** VMs were grabbed by positional DOM index (`$('#kvm_list > tr.sortable').eq(index)`). When Folder A processed and removed VMs from the DOM, remaining row indices shifted, causing Folder B to grab wrong VMs.
- **Fix:** Changed to name-based lookup using `.filter()` to match VM name text. This matches the approach already used in `docker.js` (lines 403-409).

---

#### File: `styles/docker.css`

**Fix: CPU/memory text wrapping in advanced view (line 77):**

```diff
+.folder-cpu,
+.folder-mem {
+    white-space: nowrap;
+}
```

- **Problem:** The CPU & Memory Load column text (e.g. "439.00 MiB / 125.60 GiB") would wrap "GiB" to its own line when the column was narrow.
- **Fix:** Applied `white-space: nowrap` to `.folder-cpu` and `.folder-mem` spans directly. The parent `.folder-advanced` `<td>` nowrap was insufficient because the text lives inside child `<span>` elements.

---

#### File: Language files (`langs/de.json`, `es.json`, `it.json`, `pl.json`, `zh.json`)

**Translation completeness fixes:**

- **de.json**: Translated 3 remaining English strings in `custom-actions-folder-tooltip` (Arguments, Sync, Icon)
- **es.json**: Translated 3 remaining English strings in `custom-actions-folder-tooltip` (Argumentos, Sincronizar, Icono)
- **it.json**: Translated 3 keys left in English (`customizations` → "Personalizzazioni", `on` → "Sì", `off` → "No")
- **zh.json**: Translated `override-default-actions`, its tooltip, `custom-actions-arguments`, and 2 English strings in `custom-actions-folder-tooltip`
- **pl.json**: Added 62 missing keys (everything from `update-column` through `custom-actions-arguments`) to achieve full parity with en.json

---

### Quick Reference: All Fixes (Version 2026.02.07-beta2)

| # | Fix | File(s) | Impact |
|---|-----|---------|--------|
| 1 | VM folder assignment bug — wrong VMs in wrong folders | `vm.js:237` | Name-based lookup instead of positional index |
| 2 | CPU/memory text wrapping "GiB" on own line | `docker.css` | `white-space: nowrap` on `.folder-cpu`/`.folder-mem` spans |
| 3 | German translation incomplete | `de.json` | 3 English strings translated |
| 4 | Spanish translation incomplete | `es.json` | 3 English strings translated |
| 5 | Italian translation incomplete | `it.json` | 3 keys translated |
| 6 | Chinese translation incomplete | `zh.json` | 4+ keys translated |
| 7 | Polish translation missing 62 keys | `pl.json` | 62 keys added for full parity |

---

## Version 2026.02.04

### Changes

#### File: `Folder.page`

**Reordered folder settings UI:**
- Moved "Show preview border" and color picker from below Preview Context to directly underneath "Preview vertical bars"

**Split color pickers:**
- Replaced single "Preview border and vertical bars color" with two separate color pickers:
  - "Preview border color" — shown when "Show preview border" is ON (`constraint="border-color"`)
  - "Vertical bars color" — shown when "Preview vertical bars" is ON (`constraint="bars-color"`)
- Each has its own reset button (fa-repeat icon)

**Fixed reset button styling:**
- Changed from `padding:6px; min-width:0; margin-left:1em; position:relative; top:-0.54em` to `width:44px; height:28px; min-width:0; padding:0; margin:0; margin-left:0.5em; vertical-align:middle`
- Button now matches the color swatch dimensions (44×28px) and aligns inline instead of being oversized

**New settings structure (nested parent-child):**
1. Preview vertical bars *(toggle)*
   - Vertical bars color *(nested `<ul>`, only shown when vertical bars ON)*
2. Show preview border *(toggle, moved up from below Preview Context)*
   - Border color *(nested `<ul>`, only shown when border ON)*
3. Preview Context

---

#### File: `scripts/folder.js`

**Default initialization (line 18):**
```diff
 $('div.canvas > form')[0].preview_border_color.value = rgbToHex($('body').css('color'));
+$('div.canvas > form')[0].preview_vertical_bars_color.value = rgbToHex($('body').css('color'));
```

**Edit load (line 73) — with backwards compatibility:**
```diff
 form.preview_border_color.value = currFolder.settings.preview_border_color || rgbToHex($('body').css('color'));
+form.preview_vertical_bars_color.value = currFolder.settings.preview_vertical_bars_color || currFolder.settings.preview_border_color || rgbToHex($('body').css('color'));
```

Existing folders that only have `preview_border_color` saved will inherit that value for vertical bars.

**Visibility logic in `updateForm()` (lines 177-183):**
```diff
-    if(!form.preview_border.checked && !form.preview_vertical_bars.checked) {
-        $('[constraint*="color"]').hide();
-    } else {
-        $('[constraint*="color"]').show();
-    }
+    $('[constraint*="border-color"]').hide();
+    $('[constraint*="bars-color"]').hide();
+    if(form.preview_border.checked) {
+        $('[constraint*="border-color"]').show();
+    }
+    if(form.preview_vertical_bars.checked) {
+        $('[constraint*="bars-color"]').show();
+    }
```

**Form submit (line 269):**
```diff
 preview_border_color: e.preview_border_color.value.toString(),
+preview_vertical_bars_color: e.preview_vertical_bars_color.value.toString(),
```

---

#### File: `scripts/docker.js`

**Fix: Expanded folder bottom border no longer uses user's border color (line 945):**
```diff
-    $(`.folder-${id}-element:last`).css('border-bottom', `1px solid ${folder.settings.preview_border_color}`);
+    $(`.folder-${id}-element:last`).css('border-bottom', '1px solid rgba(128, 128, 128, 0.3)');
```

- **Problem:** The last container in an expanded folder had its bottom border set to `preview_border_color`. If the user chose a bright color (e.g. red), an unwanted colored line appeared under the last container.
- **Fix:** Changed to a neutral semi-transparent gray that matches the theme styling.

**Divider color — separate vertical bars color (line 957):**
```diff
-        $(`...`).after(`<div class="folder-preview-divider" style="border-color: ${folder.settings.preview_border_color};"></div>`);
+        const barsColor = folder.settings.preview_vertical_bars_color || folder.settings.preview_border_color;
+        $(`...`).after(`<div class="folder-preview-divider" style="border-color: ${barsColor};"></div>`);
```

Vertical bars now use the new `preview_vertical_bars_color` setting with fallback to `preview_border_color` for backwards compatibility.

---

#### File: `scripts/vm.js`

**Fix: Expanded folder bottom border (line 296):**
```diff
-    $(`.folder-${id}-element:last`).css('border-bottom', `1px solid ${folder.settings.preview_border_color}`);
+    $(`.folder-${id}-element:last`).css('border-bottom', '1px solid rgba(128, 128, 128, 0.3)');
```

Same fix as docker.js — neutral gray instead of user's border color.

**Divider color — separate vertical bars color (line 305):**
```diff
-        $(`...`).after(`<div class="folder-preview-divider" style="border-color: ${folder.settings.preview_border_color};"></div>`);
+        const barsColor = folder.settings.preview_vertical_bars_color || folder.settings.preview_border_color;
+        $(`...`).after(`<div class="folder-preview-divider" style="border-color: ${barsColor};"></div>`);
```

Same pattern as docker.js — vertical bars use new setting with fallback.

---

#### File: Language files (`langs/en.json`, `de.json`, `es.json`, `fr.json`, `it.json`, `pl.json`, `zh.json`)

**Split and renamed color labels across all 7 language files:**

```diff
-    "border-color": "Preview border and vertical bars color:",
-    "border-color-tooltip": "Will make the preview border and vertical bars a specific color.<br>The ... button will set the color to the current font color.",
+    "border-color": "Border color:",
+    "border-color-tooltip": "Set the color of the preview border.<br>The ... button will reset to the current font color.",
+    "bars-color": "Vertical bars color:",
+    "bars-color-tooltip": "Set the color of the vertical bars between containers.<br>The ... button will reset to the current font color.",
```

*(Above shows en.json — same structural change applied to all 7 files in their respective languages.)*

- `border-color` key: shortened from combined label to just "Border color:" (or equivalent translation)
- `border-color-tooltip`: updated to only reference the preview border
- Added new `bars-color` key: "Vertical bars color:" (or equivalent translation)
- Added new `bars-color-tooltip` key: describes vertical bars between containers

---

#### File: `folder.view2.plg` (Plugin Manifest)

**Version bump and new changelog entry:**

```diff
-<!ENTITY version "2026.02.03">
-<!ENTITY md5 "12b42502ee0bbffe95d0a49513c33716">
+<!ENTITY version "2026.02.04">
+<!ENTITY md5 "e084279c40291d0a4d2ddffbfda81315">
```

```diff
     <CHANGES>

+###2026.02.04
+- UI: Moved preview border and color settings underneath preview vertical bars in folder settings
+- UI: Split border and vertical bars into separate color pickers
+- UI: Each color picker nested directly under its associated toggle
+- UI: Border color only shows when border is enabled, bars color only shows when vertical bars is enabled
+- UI: Reset button now matches color swatch dimensions and alignment
+- UI: Updated all language files (en, de, es, fr, it, pl, zh) with split color labels
+- UI: Shortened border color label to "Border color:" to align with "Vertical bars color:"
+- Backwards compatible: existing folders inherit vertical bars color from border color
+- Fix: Expanded folder bottom border no longer uses preview border color

 ###2026.02.03
```

---

#### File: `archive/folder.view2-2026.02.04.txz` (New)

New binary archive package for the `2026.02.04` release. Contains the split color pickers, border-bottom fix, reset button fix, nested settings structure, and all language file updates.

---

## Version 2026.02.03

### All Changes from upstream (VladoPortos/folder.view2)

---

### 1. File: `scripts/docker.js`

#### 1a. Removed trailing debug comment (Line 1)

```diff
-const FOLDER_VIEW_DEBUG_MODE = false; // Added for debugging
+const FOLDER_VIEW_DEBUG_MODE = false;
```

Cleanup — removed leftover comment from upstream debug session.

---

#### 1b. Fix: Docker Compose containers not grouped into folders (Line 407)

```diff
-                return $(this).find("td.ct-name .appname a").text().trim() === container_name_in_folder;
+                return $(this).find("td.ct-name .appname").text().trim() === container_name_in_folder;
```

- **Problem:** Docker Compose containers do not render an `<a>` tag inside `.appname`. The upstream selector `td.ct-name .appname a` returned empty text for Compose containers, so they were never matched and never grouped into folders.
- **Fix:** Changed selector to `td.ct-name .appname` which matches the text content for both standard Docker containers (which have an `<a>` child) and Docker Compose containers (which do not).

---

#### 1c. Fix: Folder CPU and Memory stats not updating in advanced view (Lines 1560–1580)

```diff
-    dockerload.addEventListener('message', (e_sse) => { // Renamed e to e_sse to avoid conflict
-        // if (FOLDER_VIEW_DEBUG_MODE) console.log('[FV2_DEBUG] dockerload SSE: Message event received. Event object:', e_sse);
-
-        // --- START OF FIX ---
-        if (typeof e_sse.data !== 'string' || !e_sse.data.trim()) {
-            // if (FOLDER_VIEW_DEBUG_MODE) {
-            //     console.warn('[FV2_DEBUG] dockerload SSE: Received message without valid string data or empty data. Skipping. Data was:', e_sse.data);
-            // }
-            return; // Skip processing if data is not a string or is empty
+    dockerload.addEventListener('message', (e_sse) => {
+        // Unraid's dockerload passes data directly as the event in some versions, not in e.data
+        const sseData = (typeof e_sse.data === 'string') ? e_sse.data : (typeof e_sse === 'string' ? e_sse : null);
+
+        if (!sseData || !sseData.trim()) {
+            return; // Skip if no valid data
         }
-        // --- END OF FIX ---

-        if (FOLDER_VIEW_DEBUG_MODE) console.log('[FV2_DEBUG] dockerload SSE: Message received (e_sse.data):', e_sse.data);
+        if (FOLDER_VIEW_DEBUG_MODE) console.log('[FV2_DEBUG] dockerload SSE: Message received:', sseData.substring(0, 100) + '...');
         let load = {};
-        const lines = e_sse.data.split('\n');
+        const lines = sseData.split('\n');
         lines.forEach((line_str) => { // Renamed e to line_str
             if (!line_str.trim()) return; // Skip empty lines
             const exp = line_str.split(';');
```

- **Problem:** Unraid's `dockerload` SSE (Server-Sent Events) can pass data either as `e.data` (standard EventSource) or directly as the event value in some Unraid versions. The upstream code only checked `e_sse.data`, so on affected Unraid builds the data was silently discarded and CPU/memory stats never updated in folder advanced views.
- **Fix:** Added a compatibility shim that checks both `e_sse.data` (standard path) and `e_sse` itself (Unraid alternate path), normalizing the data into `sseData` before processing.
- **Cleanup:** Removed commented-out debug blocks (`// --- START OF FIX ---`, `// --- END OF FIX ---`) and truncated verbose debug log output to first 100 characters.

---

### 2. File: `styles/docker.css`

#### 2a. Removed unnecessary comments throughout

Stripped upstream inline comments such as `/* Consider removing float if flexbox is used more broadly */`, `/* align-content is for multi-line flex containers */`, `/* Be careful, if content is larger than box */`, etc. These were development notes not relevant to the shipped CSS.

Example selections:

```diff
 .folder-preview-wrapper {
-    float: left; /* Consider removing float if flexbox is used more broadly in .folder-preview */
+    float: left;
     height: 100%;
```

```diff
 .folder-preview-divider:not(:last-child) {
-    float: left; /* As above, consider flex for alignment if floats cause issues */
+    float: left;
     height: 80%;
     width: 0;
     border-right: 1px solid;
     margin-left: 5px;
-    margin-top: -7px; /* This negative margin might need care */
+    margin-top: -7px;
 }
```

```diff
 div.folder-preview-4 span.outer {
     display: flex;
     flex-direction: column;
-    align-items: flex-start; /* Changed from left for consistency */
-    /* align-content: center; /* align-content is for multi-line flex containers, not usually needed here */
+    align-items: flex-start;
 }
```

---

#### 2b. Fix: Tooltipster base — `color` and `overflow` changes

```diff
 .tooltipster-docker-folder>.tooltipster-box>.tooltipster-content {
-    color: initial;
+    color: inherit;
     padding: initial;
-    overflow: initial; /* Be careful, if content is larger than box, it will be cut. Maybe 'visible' or 'auto' if needed */
+    overflow: visible;
 }
```

- `color: initial` reset to browser default (black). `color: inherit` picks up the parent theme color.
- `overflow: initial` (same as `visible` in most cases but ambiguous) changed to explicit `overflow: visible` to prevent content cutoff in the tooltip.

---

#### 2c. New: Tooltipster theme inheritance

```diff
+/* Force the tooltip to pick up page styling */
+.tooltipster-docker-folder {
+    color: inherit;
+    background-color: inherit;
+}
```

Ensures the tooltip root element inherits colors from Unraid's body theme instead of rendering with browser defaults.

---

#### 2d. Fix: Theme-agnostic tooltip content (`.preview-outbox`)

```diff
 .preview-outbox {
-    min-width: 700px;  /* Increased slightly, adjust as needed based on your widest content */
-    max-width: 700px;
-    min-height: 500px; /* Increased slightly, adjust based on your tallest content */
-    max-height: 500px;
+    min-width: 700px;
+    max-width: 90vw;
+    min-height: 400px;
+    max-height: 80vh;
     padding: var(--tooltip-spacing);
-    background-color: #fff; /* Assuming you want a white background for the tooltip content */
-    color: #333; /* Assuming you want dark text on a light background */
+    background-color: inherit;
+    color: inherit;
+    border: 1px solid currentColor;
     border-radius: 5px;
```

- **Responsive sizing:** `max-width` changed from fixed `700px` to `90vw`, `max-height` from `500px` to `80vh`. Tooltip now scales to viewport.
- **Theme colors:** Hardcoded `#fff` background and `#333` text replaced with `inherit`. Added `border: 1px solid currentColor` to maintain a visible border that matches the theme's text color.

---

#### 2e. Fix: First row header (`.first-row`)

```diff
 .first-row {
     display: flex;
     flex-direction: row;
-    flex-wrap: nowrap; /* Ensure these items stay on one line */
-    border: 1px solid #c5c5c5;
+    flex-wrap: nowrap;
+    border: 1px solid rgba(128, 128, 128, 0.3);
     border-radius: 5px;
     padding: var(--tooltip-spacing);
-    background-color: #f2f2f2;
-    gap: var(--tooltip-spacing); /* Space between preview-name and preview-status */
-    flex-shrink: 0; /* Prevent this row from shrinking */
+    background-color: rgba(128, 128, 128, 0.1);
+    gap: var(--tooltip-spacing);
+    flex-shrink: 0;
 }
```

Replaced `#c5c5c5` border and `#f2f2f2` background with semi-transparent values that adapt to any theme.

---

#### 2f. Fix: Status header cells

```diff
 .status-header-version {
     border-radius: 5px 0 0 5px;
-    background-color: #ced1d3;
+    background-color: rgba(128, 128, 128, 0.2);
 }

 .status-header-stats {
-    background-color: #ced1d3;
+    background-color: rgba(128, 128, 128, 0.2);
 }

 .status-header-autostart {
     border-radius: 0 5px 5px 0;
-    background-color: #ced1d3;
+    background-color: rgba(128, 128, 128, 0.2);
 }
```

All three header cells changed from `#ced1d3` (light gray, invisible on dark themes) to `rgba(128, 128, 128, 0.2)`.

---

#### 2g. Fix: Action links

```diff
 .action a {
     display: block;
-    padding: 2px 6px; /* Adjusted padding for better fit */
+    padding: 2px 6px;
     line-height: 24px;
-    color: #303030;
+    color: inherit;
     white-space: nowrap;
     text-decoration: none;
-    /* min-width: 6.5em; /* Let content define width, or adjust if necessary */
-    border-radius: 3px; /* Slightly smaller radius */
+    border-radius: 3px;
     cursor: pointer;
 }

 .action a:hover {
-    background-image: linear-gradient(to bottom, #e6e6e6, #e9e9e9);
+    background-color: rgba(128, 128, 128, 0.2);
 }
```

- Link `color: #303030` (near-black) → `color: inherit` so links are visible on dark themes.
- Hover changed from a light-only gradient to a semi-transparent overlay.

---

#### 2h. Fix: Info container (`.info-ct`)

```diff
 .info-ct {
-    /* If keeping static positioning (recommended for simplicity unless abs is crucial) */
-    margin-top: auto; /* Pushes it to the bottom if .action-info is a flex column */
-    /* margin-top: 10px; /* Or fixed margin if not using margin-top: auto */
+    margin-top: auto;
     border-radius: 5px;
-    background-color: #fcf6e1;
-    border: 1px solid #c8c4c1;
+    background-color: rgba(128, 128, 128, 0.1);
+    border: 1px solid rgba(128, 128, 128, 0.3);
     padding: 5px;
     font-size: 0.9em;
-    word-break: break-all; /* Good for long IDs/repos */
+    word-break: break-all;
 }
```

Replaced yellow-tinted `#fcf6e1` background and `#c8c4c1` border with neutral semi-transparent values.

---

#### 2i. Fix: Tab styling (`.info-tabs`, `.ui-tabs-panel`)

```diff
-.info-tabs a { /* The clickable part of the tab */
-    padding: 8px 10px; /* More clickable area */
+.info-tabs a {
+    padding: 8px 10px;
     display: block;
     text-decoration: none;
-    color: #333; /* Or your theme's tab text color */
-    border: 1px solid transparent; /* Placeholder for active/hover states */
-    border-bottom: none; /* For typical tab appearance */
+    color: inherit;
+    border: 1px solid transparent;
+    border-bottom: none;
     border-radius: 4px 4px 0 0;
 }
```

```diff
 .info-tabs > li[aria-selected="true"] a {
-    background-color: #f2f2f2; /* Or your theme's active tab background */
-    border-color: #c5c5c5; /* Match border of tab panel */
-    position: relative; /* For z-index if needed */
+    background-color: rgba(128, 128, 128, 0.15);
+    border-color: rgba(128, 128, 128, 0.3);
+    position: relative;
 }
```

```diff
 .info-tabs > li:not([aria-selected="true"]) a:hover {
-    background-color: #e8e8e8; /* Hover for non-active tabs */
+    background-color: rgba(128, 128, 128, 0.1);
 }
```

```diff
-.info-section .ui-tabs-panel { /* The content panel of an active tab */
+.info-section .ui-tabs-panel {
     padding: var(--tooltip-spacing);
     clear: both;
-    background-color: #f2f2f2; /* Or a suitable panel background */
-    border: 1px solid #c5c5c5; /* Border to match active tab */
-    border-top: none; /* If tabs are on top */
+    background-color: rgba(128, 128, 128, 0.1);
+    border: 1px solid rgba(128, 128, 128, 0.3);
+    border-top: none;
     border-radius: 0 0 4px 4px;
-    flex-grow: 1; /* Allow panel to take available vertical space */
-    overflow-y: auto;     /* Make individual panels scrollable if their content is too tall for the grown panel */
-    min-height: 0; /* Helps flex-grow behave correctly in some scenarios with nested flex */
+    flex-grow: 1;
+    overflow-y: auto;
+    min-height: 0;
+    color: inherit;
 }
```

All tab colors changed from hardcoded light-theme values to semi-transparent. Added `color: inherit` to `.ui-tabs-panel` so tab content text inherits theme color.

---

#### 2j. Fix: jQuery UI tabs widget override and tab header border

```diff
 .info-section.ui-tabs.ui-widget.ui-widget-content {
     border: none;
     background: none;
     padding: 0;
-    display: flex; /* Ensure the main ui-tabs widget is also a flex column */
+    display: flex;
     flex-direction: column;
-    flex-grow: 1; /* Allow the entire tabs widget to grow */
+    flex-grow: 1;
 }
+
 .info-section .ui-tabs-nav.ui-helper-reset.ui-helper-clearfix.ui-widget-header {
     border: none;
     background: none;
-    border-bottom: 1px solid #c5c5c5; /* Optional: a line under the tabs */
+    border-bottom: 1px solid rgba(128, 128, 128, 0.3);
     padding: 0;
-    flex-shrink: 0; /* Prevent the tab headers from shrinking */
+    flex-shrink: 0;
 }
```

Tab header underline border changed from `#c5c5c5` to `rgba(128, 128, 128, 0.3)`.

---

#### 2k. Fix: Port/volume links and containers

```diff
 .info-ports, .info-volumes {
-    /* overflow: auto; /* Handled by .ui-tabs-panel now */
-    /* max-height: 200px; /* Remove this if you want them to fill the panel */
-    min-height: 100%; /* Attempt to make them take full height of the panel they are in */
-    box-sizing: border-box; /* If you add padding to these direct divs */
-    /* display: flex; flex-direction: column; /* If their internal content also needs to flex-grow */
+    min-height: 100%;
+    box-sizing: border-box;
+    color: inherit;
 }

 .info-ports a, .info-volumes a {
-    color: #486dba;
+    color: #6a9fd4;
 }
```

- Added `color: inherit` to `.info-ports` and `.info-volumes` containers.
- Link color changed from `#486dba` (dark blue, hard to read on dark themes) to `#6a9fd4` (lighter blue, readable on both light and dark backgrounds).

---

#### 2l. Fix: Missing memory graph color variable + EOF newline

```diff
 .preview-outbox div.status-stats div.usage-disk.mm span:first-of-type {
     background-color: var(--folder-view2-graph-cpu);
-}
\ No newline at end of file
+}
+
+.preview-outbox div.status-stats div.usage-disk.mm span:last-of-type {
+    background-color: var(--folder-view2-graph-mem);
+}
```

- **Bug:** Upstream only styled the CPU bar (`span:first-of-type`) and was missing the memory bar (`span:last-of-type`), so the memory usage bar had no color.
- **Fix:** Added the missing `span:last-of-type` rule using `--folder-view2-graph-mem`.
- Added trailing newline (POSIX compliance).

---

#### 2m. New: Folder expanded state styling

```diff
+/* === FOLDER EXPANDED STATE === */
+.folder-preview.expanded {
+    height: auto;
+    max-height: none;
+}
```

Allows folder preview to expand beyond its default constrained height when in expanded state.

---

#### 2n. New: Docker context menu styling

```diff
+/* === DOCKER CONTEXT MENU === */
+.docker-context {
+    position: absolute;
+    z-index: 1000;
+}
+
+.docker-context-menu {
+    background-color: inherit;
+    border: 1px solid rgba(128, 128, 128, 0.3);
+    border-radius: 4px;
+    padding: 5px 0;
+    min-width: 150px;
+}
+
+.docker-context-menu a {
+    display: block;
+    padding: 5px 15px;
+    color: inherit;
+    text-decoration: none;
+}
+
+.docker-context-menu a:hover {
+    background-color: rgba(128, 128, 128, 0.2);
+}
```

New context menu styles using the same theme-agnostic pattern (`inherit`, `rgba()`) as the rest of the tooltip changes.

---

### 3. File: `styles/folder.css`

#### 3a. Fix: Container order table — responsive layout

```diff
-table.sortable {
-    width: 92vw;
+/* Container order table - responsive for all screen sizes */
+table.sortable {
+    width: 100%;
+    margin: 0 auto;
+    table-layout: fixed;
+}
+
+table.sortable th,
+table.sortable td {
+    padding: 0.5em;
+}
+
+table.sortable th:first-child,
+table.sortable td:first-child {
+    width: 75%;
+    text-align: left;
+}
+
+table.sortable th:last-child,
+table.sortable td:last-child {
+    width: 25%;
+    text-align: center;
 }
```

- **Problem:** `width: 92vw` caused the table to overflow on mobile and not fill the container on widescreen.
- **Fix:** Changed to `width: 100%` with `table-layout: fixed`. Added explicit column proportions (75% Name, 25% Included) and cell padding.

---

#### 3b. Fix: Tooltip bullet points in folder settings form

```diff
+/* Fix tooltip bullet points - remove list markers and align with headings */
+.canvas form > ul,
+.canvas form ul {
+    list-style: none;
+    padding-left: 0;
+    margin-left: 0;
+}
+
+.canvas form > ul > li,
+.canvas form ul > li {
+    list-style: none;
+    margin-left: 0;
+    padding-left: 0;
+}
+
+/* Nested ul for sub-options */
+.canvas form ul ul {
+    margin-left: 1em;
+}
```

Removes default browser list bullets from the folder settings form. Nested sub-option lists are indented `1em` for visual hierarchy.

---

#### 3c. Fix: Order section layout

```diff
+/* Order section - display label above full-width table */
+.canvas form > .basic.order-section {
+    width: 100%;
+    padding: 0 1em;
+    box-sizing: border-box;
+}
+
+.canvas form > .basic.order-section dl {
+    display: flex;
+    flex-direction: column;
+}
+
+.canvas form > .basic.order-section dt {
+    margin-bottom: 1em;
+    float: none;
+    width: auto;
+    text-align: left;
+}
+
+.canvas form > .basic.order-section dd {
+    margin-left: 0;
+    width: 100%;
+    float: none;
+}
```

Overrides Unraid's default `<dl>`/`<dt>`/`<dd>` float-based layout with flexbox column layout. The "Order:" label now sits above the table instead of floating beside it.

---

#### 3d. EOF newline fix

```diff
-.multiselect-container {
-    overflow: hidden;
-    text-overflow: ellipsis;
-}
\ No newline at end of file
+.multiselect-container {
+    overflow: hidden;
+    text-overflow: ellipsis;
+}
```

Added trailing newline (POSIX compliance).

---

### 4. File: `Folder.page`

#### 4a. Fix: Removed missing CSS reference (Line 18)

```diff
 <link type="text/css" rel="stylesheet" href="<?autov('/plugins/folder.view2/styles/folder.css')?>">
-<link type="text/css" rel="stylesheet" href="<?autov("/plugins/dynamix.docker.manager/styles/style-{$display['theme']}.css")?>">
 <link type="text/css" rel="stylesheet" href="<?autov("/plugins/folder.view2/styles/include/jquery.multiselect.css")?>">
```

- **Problem:** `/plugins/dynamix.docker.manager/styles/style-{theme}.css` does not exist on Unraid 7.x and generated nginx 404 errors on every page load.
- **Fix:** Removed the `<link>` tag entirely. The tooltip is now styled via the theme-agnostic CSS in `docker.css` instead.

---

#### 4b. Fix: Order section restructure (Lines 425–455)

```diff
-        <div class="basic">
+        <div class="basic order-section">
             <dl>
                 <dt data-i18n="order">Order:</dt>
-                <dd></dd>
-            </dl>
-            <blockquote class="inline_help">
-                <p data-i18n="[html]order-tooltip">
-                    Drag and drop to make your desired order, if you edit the regex the selection will be deselected.
-                </p>
-            </blockquote>
-        </div>
-        <div class="basic" style="width: 115em; text-align: center; margin-top: 3em;">
-            <dl>
                 <dd>
                     <table class="sortable">
                         <thead>
@@ ... @@
                     </table>
                 </dd>
             </dl>
+            <blockquote class="inline_help">
+                <p data-i18n="[html]order-tooltip">
+                    Drag and drop to make your desired order, if you edit the regex the selection will be deselected.
+                </p>
+            </blockquote>
         </div>
```

- **Problem:** Upstream had the "Order:" label in one `<div>` and the table in a separate `<div>` with `style="width: 115em"`. The `115em` hardcoded width overflowed on smaller screens and caused horizontal scrolling.
- **Fix:** Merged both into a single `<div class="basic order-section">`. Removed the inline `width: 115em` style. The table now sits inside the same `<dd>` as the label, and layout is controlled by the CSS `.order-section` rules in `folder.css`. The `<blockquote>` help text was moved after the `</dl>` but still within the same section div.

---

### 5. File: `folder.view2.plg` (Plugin Manifest)

#### 5a. Author and version update

```diff
-<!ENTITY author "VladoPortos">
+<!ENTITY author "chodeus">
```

```diff
-<!ENTITY version "2025.04.13">
-<!ENTITY md5 "b3a00c47c4a549d6b97cc1e793f895d0">
+<!ENTITY version "2026.02.03">
+<!ENTITY md5 "12b42502ee0bbffe95d0a49513c33716">
```

Updated plugin author entity to fork maintainer, bumped version, and updated MD5 checksum for the new archive.

---

#### 5b. New changelog entry in plugin CHANGES section

```diff
     <CHANGES>

+###2026.02.03
+- Fix: Folder CPU and Memory stats not updating in advanced view
+- Fix: Docker Compose containers not being grouped into folders
+- Fix: Advanced Preview tooltip now works with all Unraid themes
+- Fix: Folder settings page layout issues on widescreen and mobile
+- Fix: Removed missing Docker Manager CSS reference causing nginx 404 errors
+
 ###2025.04.13
```

Added version `2026.02.03` release notes to the embedded CHANGES block that Unraid displays in the plugin manager.

---

#### 5c. Fix: Archive download URL

```diff
     <FILE Name="/boot/config/plugins/&name;/&name;-&version;.txz" Run="upgradepkg --install-new">
-        <URL>https://raw.github.com/&github;/master/archive/&name;-&version;.txz</URL>
+        <URL>https://raw.githubusercontent.com/&github;/main/archive/&name;-&version;.txz</URL>
         <MD5>&md5;</MD5>
     </FILE>
```

- **Problem:** Upstream used `raw.github.com` (deprecated redirect) and `master` branch. This fork uses `main` branch, and `raw.github.com` can fail or be blocked.
- **Fix:** Changed to `raw.githubusercontent.com` (canonical GitHub raw URL) and `main` branch.

---

#### 5d. Whitespace cleanup

```diff
 ###2023.08.16
 - Updated the link to folder icon in the folder creation/editing page
-
+
 ###2023.08.15
 - Fixed cpu load bars on docker advanced view
-
+
```

Removed trailing whitespace on blank lines between changelog entries.

---

### 6. File: `README.md`

#### 6a. Added fork installation link

```diff
 Use link: https://raw.githubusercontent.com/VladoPortos/folder.view2/refs/heads/main/folder.view2.plg

+For Chodeus's vibe coded beta use link: https://raw.githubusercontent.com/chodeus/folder.view2/main/folder.view2.plg
+You can find the changelog in the repository.
+
 That link can be posted directly into the plugin install without needing to copy it to the filesystem beforehand.
```

Added a separate install link pointing to the fork's plugin manifest so users can install this fork directly.

---

### 7. File: `.gitattributes` (New)

New file added to the repository for Git line-ending configuration. Not present in upstream.

---

### 8. File: `archive/folder.view2-2026.02.03.txz` (New)

New binary archive package for the `2026.02.03` release. Contains compiled plugin files for Unraid installation.

---

## Quick Reference: All Fixes

### Version 2026.02.08-beta5

| # | Fix | File(s) | Impact |
|---|-----|---------|--------|
| 1 | Vertically center folder row contents | `docker.css`, `vm.css` | `align-items: center` on `.folder-name-sub` aligns icon, name, dropdown with other columns |

### Version 2026.02.08-beta3

| # | Fix | File(s) | Impact |
|---|-----|---------|--------|
| 1 | Folder name wrapping in basic view | `docker.css`, `vm.css` | Flexbox layout on `.folder-name-sub`, ellipsis on `.folder-outer`, dropdown pinned right |

### Version 2026.02.04

| # | Fix | File(s) | Impact |
|---|-----|---------|--------|
| 1 | Split color pickers for border and vertical bars | `Folder.page`, `folder.js` | Independent color control per feature |
| 2 | Nested color pickers under parent toggles | `Folder.page`, `folder.js` | Color picker only shows when its toggle is ON |
| 3 | Reset button oversized and misaligned | `Folder.page` | Button matches color swatch dimensions (44×28px) |
| 4 | Expanded folder bottom border uses user color | `docker.js:945`, `vm.js:296` | Changed from `preview_border_color` to `rgba(128,128,128,0.3)` |
| 5 | Vertical bars use separate color setting | `docker.js:957`, `vm.js:305` | New `preview_vertical_bars_color` with fallback |
| 6 | Language files had combined border/bars label | All 7 `langs/*.json` | Split into "Border color:" + "Vertical bars color:" |
| 7 | Backwards compatibility for existing folders | `folder.js:73` | Vertical bars inherit border color if no separate value saved |

### Version 2026.02.03

| # | Fix | File(s) | Impact |
|---|-----|---------|--------|
| 1 | Docker Compose containers not grouped into folders | `docker.js:407` | Compose containers now appear in folders |
| 2 | CPU/Memory stats not updating in advanced view | `docker.js:1560-1580` | SSE data handling works across Unraid versions |
| 3 | Tooltip invisible/broken on dark Unraid themes | `docker.css` (throughout) | All hardcoded colors → theme-agnostic `inherit`/`rgba()` |
| 4 | Tooltip content cutoff | `docker.css` `.tooltipster-content` | `overflow: visible` |
| 5 | Tooltip too small / not responsive | `docker.css` `.preview-outbox` | `max-width: 90vw`, `max-height: 80vh` |
| 6 | Memory bar had no color | `docker.css` `span:last-of-type` | Added missing `--folder-view2-graph-mem` rule |
| 7 | Missing docker context menu styles | `docker.css` (new section) | Theme-agnostic context menu |
| 8 | nginx 404 errors on every page load | `Folder.page:18` | Removed non-existent CSS `<link>` |
| 9 | Order table overflow on mobile/widescreen | `folder.css`, `Folder.page` | `width: 100%` + `table-layout: fixed` |
| 10 | Misaligned bullet points in settings form | `folder.css` | `list-style: none` on form lists |
| 11 | Order label/table layout broken | `folder.css`, `Folder.page` | Flexbox column layout, removed `115em` inline width |
| 12 | Plugin download URL broken | `folder.view2.plg` | `raw.githubusercontent.com` + `main` branch |
| 13 | Port/volume link color unreadable on dark themes | `docker.css` `.info-ports a` | `#486dba` → `#6a9fd4` |
