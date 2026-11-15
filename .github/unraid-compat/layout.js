// The layout rules browser_test.js checks once FV3 has opened a folder, each from a fix FV3 has shipped, read in the page
'use strict';

// Whether the page, and the table wrapper where only the table scrolls (7.2's .TableContainer), fit without scrolling sideways
function widths() {
    const page = document.documentElement, table = document.querySelector('.TableContainer');
    const fits = (el) => el.scrollWidth <= el.clientWidth + 1;
    const size = (el) => `${el.scrollWidth} of ${el.clientWidth} px`;
    return { page: fits(page), table: table ? fits(table) : null, sizes: `page ${size(page)}${table ? `, table ${size(table)}` : ''}` };
}

// Each rule's failure, '' when it holds. A folder against a loose container on its page (Unraid's name element, a link only
// with a template): name no taller, row no taller than 1.5x; at desktop width, its preview on one line inside its cell
function layoutState({ page, desktop }) {
    const { seen, name, members } = window.fv3Test;
    const box = (el) => el.getBoundingClientRect();
    const tall = (node) => { const r = document.createRange(); r.selectNodeContents(node); return Math.round(r.getBoundingClientRect().height); };
    const shown = (label, nameEl, icon, other, loose) => [
        !nameEl || !seen(nameEl) ? `${label}'s name cannot be seen` : tall(nameEl) > 1.5 * tall(other) ? `${label}'s name is ${tall(nameEl)} px tall, ${loose}'s ${tall(other)} px` : '',
        !icon || !seen(icon) ? `${label}'s icon cannot be seen` : !icon.complete || !icon.naturalWidth ? `${label}'s icon did not load` : '',
    ].filter(Boolean);
    const rules = { name: [] };

    if (page === 'Dashboard') {
        const tile = [...document.querySelectorAll('tbody#docker_view span.outer')].find((o) => !o.closest('.folder-showcase-outer') && seen(o) && name(o) === 'app-d');
        const otherName = tile?.querySelector('.inner > *');
        if (!otherName) return { error: "no app-d tile to compare folders' tiles with" };
        rules.card = [];
        for (const folder of document.querySelectorAll('.folder-showcase-outer')) {
            const label = folder.querySelector('.fv3-folder-appname')?.innerText.trim() || 'a folder';
            rules.name.push(...shown(label, folder.querySelector('.fv3-folder-appname'), folder.querySelector('img.fv3-folder-icon'), otherName, 'app-d'));
            const card = box(folder.closest('tbody'));
            const out = [folder.querySelector(':scope > span.outer'), ...members(folder)].filter((o) => o && seen(o)).filter((o) => box(o).left < card.left - 1 || box(o).right > card.right + 1);
            if (out.length) rules.card.push(`${label}'s ${out.map((o) => name(o) || 'tile').join(', ')} leave the card (${Math.round(card.left)}-${Math.round(card.right)})`);
        }
    } else {
        const [list, cell, loose] = page === 'Docker' ? ['docker_list', 'ct-name', 'app-d'] : ['kvm_list', 'vm-name', 'Home Assistant'];
        const rows = [...document.querySelectorAll(`#${list} > tr`)].filter(seen);
        const other = rows.find((r) => !r.classList.contains('folder') && r.querySelector(`td.${cell} span.outer`) && name(r.querySelector(`td.${cell} span.outer`)) === loose);
        const otherName = other?.querySelector(`td.${cell} span.inner > *`);
        if (!otherName) return { error: `no ${loose} row to compare folders with` };
        rules.height = [];
        if (desktop) rules.preview = [];
        for (const row of rows.filter((r) => r.classList.contains('folder'))) {
            const label = row.querySelector('a.folder-appname')?.innerText.trim() || 'a folder';
            rules.name.push(...shown(label, row.querySelector('a.folder-appname'), row.querySelector('img.folder-img'), otherName, loose));
            if (box(row).height > 1.5 * box(other).height) rules.height.push(`${label}'s row is ${Math.round(box(row).height)} px tall, ${loose}'s ${Math.round(box(other).height)} px`);
            const items = [...row.querySelectorAll('.folder-preview span.outer')].filter(seen);
            if (!desktop || !items.length) continue;
            const c = box(row.querySelector('.folder-preview').closest('td')), top = box(items[0]).top;
            const off = items.filter((i) => Math.abs(box(i).top - top) > 2 || box(i).left < c.left - 1 || box(i).right > c.right + 1);
            if (off.length) rules.preview.push(`${label}'s preview wraps or leaves its cell at ${off.map(name).join(', ')}`);
        }
    }
    return { rules: Object.fromEntries(Object.entries(rules).map(([rule, problems]) => [rule, problems.join('; ')])) };
}

module.exports = { widths, layoutState };
