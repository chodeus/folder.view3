// Event triggered BEFORE all the folders are created
folderEvents.addEventListener('docker-pre-folders-creation',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folders All the folders
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Containers data, everything I could get
     */
    ({detail}) => {
        // Code here
    }
);

// Event triggered AFTER all the folders are created
folderEvents.addEventListener('docker-post-folders-creation',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folders All the folders
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Containers data, everything I could get
     */
    ({detail}) => {
        // Code here
    }
);




// Event triggered BEFORE the creation of every folder
folderEvents.addEventListener('docker-pre-folder-creation',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {number} detail.position Position in the order
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Containers data, everything I could get
     * @param {Object} detail.foldersDone Folder that are already processed
     */
    ({detail}) => {
        // Code here
    }
);

// Event triggered AFTER the creation of every folder
folderEvents.addEventListener('docker-post-folder-creation',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {number} detail.position Position in the order
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Containers data, everything I could get
     * @param {Object} detail.foldersDone Folder that are already processed
     */
    ({detail}) => {
        // Code here
    }
);




// Event triggered BEFORE the insertion of every element in the docker preview of every folder
folderEvents.addEventListener('docker-pre-folder-preview',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {number} detail.position Position in the order
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Containers data, everything I could get
     * @param {Object} detail.foldersDone Folder that are already processed
     * @param {string} detail.container Name of the conatiner
     * @param {Object} detail.ct Info about the current container
     * @param {number} detail.index The true position of the container in the order, with the undone folder removed
     * @param {number} detail.offsetIndex The position of the conatiner in the order with the undone folder
     */
    ({detail}) => {
        // Code here
    }
);

// Event triggered AFTER the insertion of every element in the docker preview of every folder
folderEvents.addEventListener('docker-post-folder-preview',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {number} detail.position Position in the order
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Containers data, everything I could get
     * @param {Object} detail.foldersDone Folder that are already processed
     * @param {string} detail.container Name of the conatiner
     * @param {Object} detail.ct Info about the current container
     * @param {number} detail.index The true position of the container in the order, with the undone folder removed
     * @param {number} detail.offsetIndex The position of the conatiner in the order with the undone folder
     * @param {Object} detail.states State of the container
     * @param {boolean} detail.states.upToDate Indicate if the folder containers are ALL up to date or not
     * @param {number} detail.states.started Number of started containers inside the folder
     * @param {number} detail.states.autostart Number of containers set to autostart inside the folder
     * @param {number} detail.states.autostartStarted Number of containers set to autostart that are started inside the folder
     * @param {number} detail.states.managed Number of containers that are managed by dockerman
     */
    ({detail}) => {
        // Code here
    }
);




// Event triggered BEFORE the creation of the tooltip, triggered with functionBefore from tooltipster
// https://calebjacob.github.io/tooltipster for docs
folderEvents.addEventListener('docker-tooltip-before',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Info about the current container
     * @param {any} detail.origin parameter of the functionBefore Function form tooltipster
     * @param {any} detail.continueTooltip parameter of the functionBefore Function form tooltipster
     * @param {Array} detail.charts Info about the current container
     * @param {Object} detail.stats The stats of the container
     * @param {Array} detail.stats.CPU CPU data needed for the cahrt
     * @param {Array} detail.stats.MEM MEM data needed for the cahrt
     */
    ({detail}) => {
        // Code here
    }
);

// Event triggered AFTER the creation of the tooltip, triggered with functionReady from tooltipster before my code
// https://calebjacob.github.io/tooltipster for docs
folderEvents.addEventListener('docker-tooltip-ready-start',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Info about the current container
     * @param {any} detail.origin parameter of the functionBefore Function form tooltipster
     * @param {any} detail.tooltip parameter of the functionBefore Function form tooltipster
     * @param {Array} detail.charts Info about the current container
     * @param {Object} detail.stats The stats of the container
     * @param {Array} detail.stats.CPU CPU data needed for the cahrt
     * @param {Array} detail.stats.MEM MEM data needed for the cahrt
     */
    ({detail}) => {
        // Code here
    }
);

// Event triggered AFTER the creation of the tooltip, triggered with functionReady from tooltipster after my code
// https://calebjacob.github.io/tooltipster for docs
folderEvents.addEventListener('docker-tooltip-ready-end',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Info about the current container
     * @param {any} detail.origin parameter of the functionBefore Function form tooltipster
     * @param {any} detail.tooltip parameter of the functionBefore Function form tooltipster
     * @param {Array} detail.charts Info about the current container
     * @param {Array} detail.tootltipObserver Observer that watch for changes of the CPU value and change the width of the bar on the tooltip
     * @param {Object} detail.stats The stats of the container
     * @param {Array} detail.stats.CPU CPU data needed for the cahrt
     * @param {Array} detail.stats.MEM MEM data needed for the cahrt
     */
    ({detail}) => {
        // Code here
    }
);

// Event triggered AFTER the removal of the tooltip, triggered with functionAfter from tooltipster before my code
// https://calebjacob.github.io/tooltipster for docs
folderEvents.addEventListener('docker-tooltip-after',
    /**
     * @param {Object} detail Yes
     * @param {Object} detail.folder Current folder being processed
     * @param {string} detail.id ID of the current folder
     * @param {Array<string>} detail.order The order of the containers and folder as how they should appear
     * @param {Object} detail.containersInfo Info about the current container
     * @param {any} detail.origin parameter of the functionBefore Function form tooltipster
     * @param {Array} detail.charts Info about the current container
     * @param {Array} detail.tootltipObserver Observer that watch for changes of the CPU value and change the width of the bar on the tooltip
     * @param {Object} detail.stats The stats of the container
     * @param {Array} detail.stats.CPU CPU data needed for the cahrt
     * @param {Array} detail.stats.MEM MEM data needed for the cahrt
     */
    ({detail}) => {
        // Code here
    }
);




// Event triggered BEFORE the expansion of the folder
folderEvents.addEventListener('docker-pre-folder-expansion',
    /**
     * @param {Object} detail Yes
     * @param {string} detail.id ID of the current folder
     */
    ({detail}) => {
        // Code here
    }
);

// Event triggered AFTER the expansion of the folder
folderEvents.addEventListener('docker-post-folder-expansion',
    /**
     * @param {Object} detail Yes
     * @param {string} detail.id ID of the current folder
     */
    ({detail}) => {
        // Code here
    }
);




// Event triggered BEFORE the creation of the context menu of the folder, after my code
// http://lab.jakiestfu.com/contextjs for docs
folderEvents.addEventListener('docker-folder-context',
    /**
     * @param {Object} detail Yes
     * @param {string} detail.id ID of the current folder
     * @param {Array} detail.opts Array of the option to show on the context menu
     */
    ({detail}) => {
        // Code here
    }
);