// node .github/scripts/docker_new_folder_order_test.js — where the Docker page draws folders and containers missing from userprefs.cfg (npm ci in this folder first)
// page_order_test.php holds the order the server works out to the same fixture.
'use strict';
const fs = require('fs');
const path = require('path');
const { drawDocker, check, done } = require('./preview_pages_harness.js');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'new-folder-order.json'), 'utf8'));

(async () => {
    const page = await drawDocker(fixture);
    check('createFolders finished', await page.draw());
    check('new folders on top, the last one the page meets first; new containers below them', JSON.stringify(page.rows()) === JSON.stringify(fixture.rows), page.rows());
    check('the order the server works out is the order drawn', JSON.stringify(page.drawn()) === JSON.stringify(fixture.autostart), page.drawn());
    check('no page errors', page.p.errors.length === 0, page.p.errors);
    done();
})();
