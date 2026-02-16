/**
 * ARCHIVED: Autostart Order Indicator (removed 2026-02-16)
 *
 * Origin: scolcipitato's original folder.view, partially ported to folder.view2 by VladoPortos.
 *
 * What it did:
 *   Built an array of containers with autostart enabled (sorted by autostart order),
 *   then compared that to the actual DOM order after folder rendering. If the orders
 *   didn't match, it toggled a green/red indicator on a `.nav-item.AutostartOrder.util`
 *   element in the page header.
 *
 * Why it was removed:
 *   1. The HTML element `.nav-item.AutostartOrder.util` was never added to folder.view2's
 *      page templates, so the JS ran silently against non-existent DOM — pure dead code.
 *   2. Our fork's syncContainerOrder() in lib.php actively syncs the autostart file on
 *      every folder save, making a passive visual indicator redundant.
 *
 * i18n keys also removed from all 7 language files:
 *   - "correct-autostart"
 *   - "incorrect-autostart"
 *
 * To re-implement:
 *   1. Add a nav element to folder.view2.Docker.page:
 *      <span class="nav-item AutostartOrder util">
 *        <a><b class="green-text">&#x2605;</b> <span data-i18n="correct-autostart">Correct autostart order</span></a>
 *      </span>
 *   2. Restore the i18n keys to all langs/*.json files.
 *   3. Restore the two JS blocks below into docker.js createFolders().
 */

// --- Block 1: Build autostart order array (was near top of createFolders) ---

const autostartOrder = Object.values(containersInfo).filter(el => !(el.info.State.Autostart===false)).sort((a, b) => {
    if(a.info.State.Autostart < b.info.State.Autostart) {
      return -1;
    }
      if(a.info.State.Autostart > b.info.State.Autostart) {
      return 1;
    }
      return 0;
}).map(el => el.info.Name);
if (FOLDER_VIEW_DEBUG_MODE) console.log('[FV2_DEBUG] createFolders: autostartOrder', autostartOrder);

// --- Block 2: Compare DOM order and toggle indicator (was near end of createFolders) ---

const autostartActual = $('.ct-name .appname').map(function() {return $(this).text()}).get().filter(x => autostartOrder.includes(x));
if (FOLDER_VIEW_DEBUG_MODE) console.log('[FV2_DEBUG] createFolders: autostartActual (from DOM)', autostartActual);

if(!(autostartOrder.length === autostartActual.length && autostartOrder.every((value, index) => value === autostartActual[index]))) {
    if (FOLDER_VIEW_DEBUG_MODE) console.warn('[FV2_DEBUG] createFolders: Autostart order is incorrect. Updating UI elements.');
    $('.nav-item.AutostartOrder.util > a > b').removeClass('green-text').addClass('red-text');
    $('.nav-item.AutostartOrder.util > a > span').text($.i18n('incorrect-autostart'));
    $('.nav-item.AutostartOrder.util > a').attr('title', $.i18n('incorrect-autostart'));
} else {
    if (FOLDER_VIEW_DEBUG_MODE) console.log('[FV2_DEBUG] createFolders: Autostart order is correct.');
}
