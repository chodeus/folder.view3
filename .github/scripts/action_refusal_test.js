// node .github/scripts/action_refusal_test.js — a folder action Unraid refuses shows Unraid's own reason: the real docker.js and vm.js
// folder actions and shared.js, answered as Unraid's Events.php ({success: true|reason}) and VMajax.php ({success: true}|{error: reason}) answer
'use strict';
const { drawDocker, drawVms, check, done } = require('./preview_pages_harness.js');

const folder = (name, containers = [], regex = '') => ({ name, containers, regex });

// Each action post answered by `answer(data)` (or failed when it returns an Error); the dialogs as the user reads them
const stub = (p, answer) => {
    const posts = [];
    const dialogs = [];
    p.$.post = (url, data) => {
        posts.push({ url, data });
        const a = answer(data);
        return a instanceof Error ? p.$.Deferred().reject({ status: 500, statusText: a.message }) : p.$.Deferred().resolve(a);
    };
    p.w.swal = (o) => {
        const box = p.w.document.createElement('div');
        box.innerHTML = String(o.text);
        dialogs.push({ title: o.title, lines: box.innerHTML.split('<br>').map((part) => { box.innerHTML = part; return box.textContent; }) });
    };
    p.w.swal.close = () => {};
    return { posts, dialogs };
};

// Runs a folder action to the end on the page's manual clock
const act = async (p, call) => {
    let finished = false;
    p.g(call).then(() => { finished = true; }, (e) => { p.errors.push(`${call}: ${e && e.stack || e}`); finished = true; });
    for (let i = 0; i < 50 && !finished; i++) await p.tick(100);
    return finished;
};

(async () => {
    const REFUSED = 'Error response from daemon: cannot stop container: web: permission denied';
    {
        const page = await drawDocker({ folders: { f: folder('Apps', ['web', 'db']) }, containers: ['web', 'db'], prefs: ['folder-f', 'web', 'db'] });
        await page.draw();
        const { posts, dialogs } = stub(page.p, (data) => (data.container === page.p.g("globalFolders['f'].containers['web'].id") ? { success: REFUSED } : { success: true }));
        const finished = await act(page.p, "actionFolder('f', 'stop')");
        check("a container Unraid refuses to stop: the dialog shows Unraid's reason, not its JSON answer",
            finished && posts.length === 2 && dialogs.length === 1 && dialogs[0].title === 'exec-error' && JSON.stringify(dialogs[0].lines) === JSON.stringify([REFUSED]),
            { finished, posts: posts.length, dialogs, errors: page.p.errors });
    }
    {
        const page = await drawDocker({ folders: { f: folder('Apps', ['web', 'db']) }, containers: ['web', 'db'], prefs: ['folder-f', 'web', 'db'] });
        await page.draw();
        const { posts, dialogs } = stub(page.p, () => ({ success: true }));
        const finished = await act(page.p, "actionFolder('f', 'stop')");
        check('every container accepted: no dialog', finished && posts.length === 2 && dialogs.length === 0, { finished, posts: posts.length, dialogs });
    }
    {
        const page = await drawDocker({ folders: { f: folder('Apps', ['web']) }, containers: ['web'], prefs: ['folder-f', 'web'] });
        await page.draw();
        const { dialogs } = stub(page.p, () => new Error('Internal Server Error'));
        const finished = await act(page.p, "actionFolder('f', 'stop')");
        check('a request that fails outright is still in the dialog, named by its failure',
            finished && dialogs.length === 1 && JSON.stringify(dialogs[0].lines) === JSON.stringify(['Internal Server Error']), { finished, dialogs });
    }
    {
        const NO_NETWORK = "Requested operation is not valid: network 'br0' is not active";
        const p = await drawVms({ folders: { v: folder('VMs', ['vm-a', 'vm-b']) }, names: ['vm-a', 'vm-b'], prefs: ['folder-v', 'vm-a', 'vm-b'] });
        const { posts, dialogs } = stub(p, (data) => (data.uuid === 'u0' ? { error: NO_NETWORK } : { success: true, state: 'running' }));
        const finished = await act(p, "actionFolder('v', 'domain-start')");
        check("a VM Unraid refuses to start: the dialog shows libvirt's reason, not the JSON answer",
            finished && posts.length === 2 && dialogs.length === 1 && JSON.stringify(dialogs[0].lines) === JSON.stringify([NO_NETWORK]),
            { finished, posts: posts.length, dialogs, errors: p.errors });
    }
    {
        // An answer with no reason in it is still a failure, shown as Unraid sent it
        const page = await drawDocker({ folders: { f: folder('Apps', ['web']) }, containers: ['web'], prefs: ['folder-f', 'web'] });
        await page.draw();
        const { dialogs } = stub(page.p, () => ({ success: '' }));
        const finished = await act(page.p, "actionFolder('f', 'stop')");
        check('an Events.php answer with an empty reason is a failure, not a success',
            finished && dialogs.length === 1 && JSON.stringify(dialogs[0].lines) === JSON.stringify(['{"success":""}']), { finished, dialogs });
    }
    done();
})().catch((e) => { console.error(e); process.exit(1); });
