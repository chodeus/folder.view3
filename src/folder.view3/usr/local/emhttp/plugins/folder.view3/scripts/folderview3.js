const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

let dockers = {};
let vms = {};

if (typeof $ !== 'undefined' && typeof csrf_token !== 'undefined') {
    $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
        if (options.type?.toUpperCase() === 'POST' && options.url?.includes('/plugins/folder.view3/')) {
            if (typeof options.data === 'string') {
                options.data += (options.data ? '&' : '') + 'csrf_token=' + encodeURIComponent(csrf_token);
            } else if (options.data && typeof options.data === 'object') {
                options.data.csrf_token = csrf_token;
            }
        }
    });
}

const orderFolderIds = (folders, itemOrder) => {
    try {
        const ordered = [];
        const seen = new Set();
        for (const name of itemOrder) {
            for (const [folderId, folder] of Object.entries(folders)) {
                if (folder.containers && folder.containers.includes(name)) {
                    if (!seen.has(folderId)) {
                        ordered.push(folderId);
                        seen.add(folderId);
                    }
                    break;
                }
            }
        }
        for (const folderId of Object.keys(folders)) {
            if (!seen.has(folderId)) {
                ordered.push(folderId);
            }
        }
        return ordered;
    } catch (error) {
        return Object.keys(folders);
    }
};

const populateTable = async () => {
    const proms = await Promise.all([
        $.get('/plugins/folder.view3/server/read.php?type=docker').promise(),
        $.get('/plugins/folder.view3/server/read.php?type=vm').promise(),
        $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise(),
        $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise()
    ]);
    const dockerData = JSON.parse(proms[0]);
    const vmData = JSON.parse(proms[1]);
    const currentDockerContainerOrder = JSON.parse(proms[2]);
    const currentVmOrder = JSON.parse(proms[3]);

    dockers = dockerData;
    vms = vmData;

    const dockerTable = $('tbody#docker');
    const vmsTable = $('tbody#vms');

    dockerTable.empty();
    vmsTable.empty();

    for (const id of orderFolderIds(dockers, currentDockerContainerOrder)) {
        const folder = dockers[id];
        const fld = `<tr><td>${escapeHtml(id)}</td><td><img src="${escapeHtml(folder.icon)}" class="img" onerror="this.src='/plugins/dynamix.docker.manager/images/question.png';">${escapeHtml(folder.name)}</td><td><button title="Export" onclick="downloadDocker('${escapeHtml(id)}')"><i class="fa fa-download"></i></button><button title="Delete" onclick="clearDocker('${escapeHtml(id)}')"><i class="fa fa-trash"></i></button></td></tr>`;
        dockerTable.append($(fld));
    }

    for (const id of orderFolderIds(vms, currentVmOrder)) {
        const folder = vms[id];
        const fld = `<tr><td>${escapeHtml(id)}</td><td><img src="${escapeHtml(folder.icon)}" class="img" onerror="this.src='/plugins/dynamix.docker.manager/images/question.png';">${escapeHtml(folder.name)}</td><td><button title="Export" onclick="downloadVm('${escapeHtml(id)}')"><i class="fa fa-download"></i></button><button title="Delete" onclick="clearVm('${escapeHtml(id)}')"><i class="fa fa-trash"></i></button></td></tr>`;
        vmsTable.append($(fld));
    }
};

populateTable();

const buildOrderedExport = async (folders, type) => {
    const order = JSON.parse(await $.get(`/plugins/folder.view3/server/read_unraid_order.php?type=${type}`).promise());
    const orderedIds = orderFolderIds(folders, order);
    const exportData = {};
    for (const folderId of orderedIds) {
        if (folders[folderId]) {
            exportData[folderId] = folders[folderId];
        }
    }
    return exportData;
};

const downloadDocker = async (id) => {
    if (id) {
        downloadFile(`${dockers[id].name}.json`, JSON.stringify(dockers[id]));
    } else {
        try {
            downloadFile(`Docker.json`, JSON.stringify(await buildOrderedExport(dockers, 'docker')));
        } catch (error) {
            downloadFile(`Docker.json`, JSON.stringify(dockers));
        }
    }
};

const importDocker = () => {
    let input = $('input[type*=file]')[0];
    input.onchange = (e) => {

        // getting a hold of the file reference
        let file = e.target.files[0];

        // setting up the reader
        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        // here we tell the reader what to do when it's done reading...
        reader.onload = async (readerEvent) => {
            let content = readerEvent.target.result; // this is the content!
            $(input).off();
            try {
                content = JSON.parse(content);
            } catch (error) {
                swal({
                    title: 'Error',
                    text: 'Error parsing the input file, please select a JSON file',
                    type: 'error',
                });
                return;
            }

            if(content.name) {
                await $.post('/plugins/folder.view3/server/create.php', { type: 'docker', content: JSON.stringify(content) });
            } else {
                for (const [id, folder] of Object.entries(content)) {
                    await $.post('/plugins/folder.view3/server/update.php', { type: 'docker', content: JSON.stringify(folder), id: id });
                }
                await $.post('/plugins/folder.view3/server/sync_order.php', { type: 'docker' });
            }
            populateTable();
        }
    }
    input.click();
};

const importVm = () => {
    let input = $('input[type*=file]')[0];
    input.onchange = (e) => {

        // getting a hold of the file reference
        let file = e.target.files[0];

        // setting up the reader
        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        // here we tell the reader what to do when it's done reading...
        reader.onload = async (readerEvent) => {
            let content = readerEvent.target.result; // this is the content!
            $(input).off();
            try {
                content = JSON.parse(content);
            } catch (error) {
                swal({
                    title: 'Error',
                    text: 'Error parsing the input file, please select a JSON file',
                    type: 'error',
                });
                return;
            }

            if(content.name) {
                await $.post('/plugins/folder.view3/server/create.php', { type: 'vm', content: JSON.stringify(content) });
            } else {
                for (const [id, folder] of Object.entries(content)) {
                    await $.post('/plugins/folder.view3/server/update.php', { type: 'vm', content: JSON.stringify(folder), id: id });
                }
            }
            populateTable();
        }
    }
    input.click();
};

const clearDocker = (id) => {
    if (id) {
        swal({
            title: 'Are you sure?',
            text: `Remove folder: ${escapeHtml(dockers[id].name)}`,
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                await $.post('/plugins/folder.view3/server/delete.php', { type: 'docker', id: id }).promise();
            } catch (error) {
                console.error('Docker delete error:', error);
                swal({ title: 'Error', text: 'Failed to delete folder: ' + error.statusText, type: 'error' });
                return;
            }
            populateTable();
        });
    } else {
        swal({
            title: 'Are you sure?',
            text: 'Remove ALL folders',
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                for (const cid of Object.keys(dockers)) {
                    await $.post('/plugins/folder.view3/server/delete.php', { type: 'docker', id: cid }).promise();
                }
            } catch (error) {
                console.error('Docker clear all error:', error);
                swal({ title: 'Error', text: 'Failed to clear all folders', type: 'error' });
                return;
            }
            populateTable();
        });
    }
};

const downloadVm = async (id) => {
    if (id) {
        downloadFile(`${vms[id].name}.json`, JSON.stringify(vms[id]));
    } else {
        try {
            downloadFile(`VM.json`, JSON.stringify(await buildOrderedExport(vms, 'vm')));
        } catch (error) {
            downloadFile(`VM.json`, JSON.stringify(vms));
        }
    }
};

const clearVm = (id) => {
    if (id) {
        swal({
            title: 'Are you sure?',
            text: `Remove folder: ${escapeHtml(vms[id].name)}`,
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                await $.post('/plugins/folder.view3/server/delete.php', { type: 'vm', id: id }).promise();
            } catch (error) {
                console.error('VM delete error:', error);
                swal({ title: 'Error', text: 'Failed to delete folder', type: 'error' });
                return;
            }
            populateTable();
        });
    } else {
        swal({
            title: 'Are you sure?',
            text: 'Remove ALL folders',
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                for (const cid of Object.keys(vms)) {
                    await $.post('/plugins/folder.view3/server/delete.php', { type: 'vm', id: cid }).promise();
                }
            } catch (error) {
                console.error('VM clear all error:', error);
                swal({ title: 'Error', text: 'Failed to clear all folders', type: 'error' });
                return;
            }
            populateTable();
        });
    }
};

const downloadFile = (name, content) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = name;
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
};

const fileManager = async (type) => {
    location.href = location.pathname + '/Browse?dir=/boot/config/plugins/folder.view3';
};