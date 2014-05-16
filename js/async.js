// TEST 2
/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2013  Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/httpswitchboard
*/

/******************************************************************************/

function asyncJobEntry(name) {
    this.name = name;
    this.data = null;
    this.callback = null;
    this.when = 0;
    this.period = 0;
}

asyncJobEntry.prototype._nullify = function() {
    this.name = '';
    this.data = null;
    this.callback = null;
};

var asyncJobQueue = {
    jobs: {},
    jobCount: 0,
    junkyard: [],
    resolution: 200,

    add: function(name, data, callback, delay, recurrent) {
        var job = this.jobs[name];
        if ( !job ) {
            job = this.junkyard.pop();
            if ( !job ) {
                job = new asyncJobEntry(name);
            } else {
                job.name = name;
            }
            this.jobs[name] = job;
            this.jobCount++;
        }
        job.data = data;
        job.callback = callback;
        job.when = Date.now() + delay;
        job.period = recurrent ? delay : 0;
    },

    _process: function() {
        var now = Date.now();
        var jobs = this.jobs;
        var job;
        for ( var jobName in jobs ) {
            if ( !jobs.hasOwnProperty(jobName) ) {
                continue;
            }
            job = jobs[jobName];
            if ( job.when > now ) {
                continue;
            }
            job.callback(job.data);
            if ( job.period ) {
                job.when = now + job.period;
            } else {
                delete jobs[jobName];
                job._nullify();
                this.jobCount--;
                this.junkyard.push(job);
            }
        }
    }
};

function asyncJobQueueHandler() {
    asyncJobQueue._process();
}

setInterval(asyncJobQueueHandler, asyncJobQueue.resolution);

/******************************************************************************/

// Update visual of extension icon.
// A time out is used to coalesce adjacents requests to update badge.

function updateBadgeCallback(pageUrl) {
    if ( pageUrl === HTTPSB.behindTheSceneURL ) {
        return;
    }
    var tabId = tabIdFromPageUrl(pageUrl);
    if ( !tabId ) {
        return;
    }
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats ) {
        pageStats.updateBadge(tabId);
    } else {
        chrome.browserAction.setIcon({ tabId: tabId, path: 'img/browsericons/icon19.png' });
        chrome.browserAction.setBadgeText({ tabId: tabId, text: '?' });
    }
}

function updateBadge(pageUrl) {
    asyncJobQueue.add('updateBadge ' + pageUrl, pageUrl, updateBadgeCallback, 250);
}

/******************************************************************************/

// Notify whoever care that whitelist/blacklist have changed (they need to
// refresh their matrix).

function permissionChangedCallback() {
    chrome.runtime.sendMessage({
        'what': 'permissionsChanged'
    });
}

function permissionsChanged() {
    asyncJobQueue.add('permissionsChanged', null, permissionChangedCallback, 250);
}

/******************************************************************************/

function gotoExtensionURL(url) {
    url = chrome.extension.getURL(url);
    // https://github.com/gorhill/httpswitchboard/issues/150
    // Logic:
    // - If URL is already opened in a tab, just activate tab
    // - Otherwise find the current active tab and open in a tab immediately
    //   to the right of the active tab
    chrome.tabs.query({ active: true }, function(tabs) {
        var index = tabs.length ? tabs[0].index : 9999;
        chrome.tabs.query({ url: url }, function(tabs) {
            // Activate found matching tab
            if ( tabs.length ) {
                // Commented out as per:
                // https://github.com/gorhill/httpswitchboard/issues/150#issuecomment-32683726
                // chrome.tabs.move(tabs[0].id, { index: index + 1 });
                chrome.tabs.update(tabs[0].id, { active: true });
            }
            // If it doesn't exist, create new tab
            else {
                chrome.tabs.create({ 'url': url, index: index + 1 });
            }
        });
    });
}

/******************************************************************************/

// Notify whoever care that url stats have changed (they need to
// rebuild their matrix).

function urlStatsChangedCallback(pageUrl) {
    // rhill 2013-11-17: No point in sending this message if the popup menu
    // does not exist. I suspect this could be related to
    // https://github.com/gorhill/httpswitchboard/issues/58
    if ( HTTPSB.port ) {
        HTTPSB.port.postMessage({
            what: 'urlStatsChanged',
            pageURL: pageUrl
        });
    }
}

function urlStatsChanged(pageUrl) {
    asyncJobQueue.add('urlStatsChanged ' + pageUrl, pageUrl, urlStatsChangedCallback, 1000);
}

/******************************************************************************/

// Handling stuff asynchronously simplifies code

function onMessageHandler(request, sender, callback) {
    var response;

    if ( request && request.what ) {
        switch ( request.what ) {

        case 'mergeRemoteBlacklist':
            mergeRemoteBlacklist(request.list);
            break;

        case 'localRemoveRemoteBlacklist':
            localRemoveRemoteBlacklist(request.location);
            break;

         case 'reloadPresetBlacklists':
            reloadPresetBlacklists(request.switches);
            break;

        case 'startWebRequestHandler':
            startWebRequestHandler(request.from);
            break;

        case 'gotoURL':
            chrome.tabs.update(request.tabId, { url: request.url });
            break;

        case 'gotoExtensionURL':
            gotoExtensionURL(request.url);
            break;

        case 'userSettings':
            if ( typeof request.name === 'string' && request.name !== '' ) {
                response = changeUserSettings(request.name, request.value);
            }
            break;

        case 'contentScriptHasLocalStorage':
            response = contentScriptLocalStorageHandler(request.url);
            break;

        case 'contentScriptSummary':
            contentScriptSummaryHandler(request, sender);
            break;

        case 'forceReloadTab':
            forceReload(request.pageURL);
            break;

        case 'checkScriptBlacklisted':
            var requestHostname = uriTools.hostnameFromURI(request.url),
                boolScriptBlacklisted = HTTPSB.blacklisted(request.url,
                                                           'script',
                                                           requestHostname);
            response = { scriptBlacklisted : boolScriptBlacklisted };
            break;

        default:
             // console.error('HTTP Switchboard > onMessage > unknown request: %o', request);
            break;
        }
    }

    if ( response !== undefined && callback ) {
        callback(response);
    }
}

chrome.runtime.onMessage.addListener(onMessageHandler);
