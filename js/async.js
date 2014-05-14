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

// Async job queue module

(function() {

    var timeResolution = 200;
    var jobs = {};
    var jobCount = 0;
    var jobJunkyard = [];

    var asyncJobEntry = function(name) {
        this.name = name;
        this.data = null;
        this.callback = null;
        this.when = 0;
        this.period = 0;
    };

    asyncJobEntry.prototype.destroy = function() {
        this.name = '';
        this.data = null;
        this.callback = null;
    };

    var addJob = function(name, data, callback, delay, recurrent) {
        var job = jobs[name];
        if ( !job ) {
            job = jobJunkyard.pop();
            if ( !job ) {
                job = new asyncJobEntry(name);
            } else {
                job.name = name;
            }
            jobs[name] = job;
            jobCount++;
        }
        job.data = data;
        job.callback = callback;
        job.when = Date.now() + delay;
        job.period = recurrent ? delay : 0;
    };

    var processJobs = function() {
        var now = Date.now();
        var job;
        for ( var jobName in jobs ) {
            if ( jobs.hasOwnProperty(jobName) === false ) {
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
                job.destroy();
                jobCount--;
                jobJunkyard.push(job);
            }
        }
    };

    setInterval(processJobs, timeResolution);

    // Publish async jobs module
    HTTPSB.asyncJobs = {
        add: addJob
    };
})();

/******************************************************************************/

// Update visual of extension icon.
// A time out is used to coalesce adjacents requests to update badge.

function updateBadgeCallback(pageUrl) {
    var httpsb = HTTPSB;
    if ( pageUrl === httpsb.behindTheSceneURL ) {
        return;
    }
    var tabId = httpsb.tabIdFromPageUrl(pageUrl);
    if ( !tabId ) {
        return;
    }
    var pageStats = httpsb.pageStatsFromTabId(tabId);
    if ( pageStats ) {
        pageStats.updateBadge(tabId);
    } else {
        chrome.browserAction.setIcon({ tabId: tabId, path: 'img/browsericons/icon19.png' });
        chrome.browserAction.setBadgeText({ tabId: tabId, text: '?' });
    }
}

function updateBadge(pageUrl) {
    HTTPSB.asyncJobs.add('updateBadge ' + pageUrl, pageUrl, updateBadgeCallback, 250);
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
    HTTPSB.asyncJobs.add('permissionsChanged', null, permissionChangedCallback, 250);
}

/******************************************************************************/

function gotoExtensionURL(url) {

    var hasFragment = function(url) {
        return url.indexOf('#') >= 0;
    };

    var removeFragment = function(url) {
        var pos = url.indexOf('#');
        if ( pos < 0 ) {
            return url;
        }
        return url.slice(0, pos);
    };

    var tabIndex = 9999;
    var targetUrl = chrome.extension.getURL(url);
    var urlToFind = removeFragment(targetUrl);

    var currentWindow = function(tabs) {
        var updateProperties = { active: true };
        var i = tabs.length;
        while ( i-- ) {
            if ( removeFragment(tabs[i].url) !== urlToFind ) {
                continue;
            }
            // If current tab in dashboard is different, force the new one, if
            // there is one, to be activated.
            if ( tabs[i].url !== targetUrl ) {
                if ( hasFragment(targetUrl) ) {
                    updateProperties.url = targetUrl;
                }
            }
            // Activate found matching tab
            // Commented out as per:
            // https://github.com/gorhill/httpswitchboard/issues/150#issuecomment-32683726
            // chrome.tabs.move(tabs[0].id, { index: index + 1 });
            chrome.tabs.update(tabs[i].id, updateProperties);
            return;
        }
        chrome.tabs.create({ 'url': targetUrl, index: tabIndex + 1 });
    };

    var currentTab = function(tabs) {
        if ( tabs.length ) {
            tabIndex = tabs[0].index;
        }
        chrome.tabs.query({ currentWindow: true }, currentWindow);
    };

    // https://github.com/gorhill/httpswitchboard/issues/150
    // Logic:
    // - If URL is already opened in a tab, just activate tab
    // - Otherwise find the current active tab and open in a tab immediately
    //   to the right of the active tab
    chrome.tabs.query({ active: true }, currentTab);
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
    HTTPSB.asyncJobs.add('urlStatsChanged ' + pageUrl, pageUrl, urlStatsChangedCallback, 1000);
}

/******************************************************************************/

// Handling stuff asynchronously simplifies code

function onMessageHandler(request, sender, callback) {
    var response;

    if ( request && request.what ) {
        switch ( request.what ) {

        case 'allLocalAssetsUpdated':
            HTTPSB.reloadAllLocalAssets();
            break;

        case 'forceReloadTab':
            HTTPSB.forceReload(request.pageURL);
            break;

        case 'gotoExtensionURL':
            gotoExtensionURL(request.url);
            break;

        case 'gotoURL':
            if ( request.tabId ) {
                chrome.tabs.update(request.tabId, { url: request.url });
            } else {
                chrome.tabs.create({ url: request.url });
            }
            break;

        case 'localAssetUpdated':
            HTTPSB.onLocalAssetUpdated(request);
            break;

        case 'reloadPresetBlacklists':
            HTTPSB.reloadPresetBlacklists(request.switches);
            break;

        case 'userSettings':
            if ( typeof request.name === 'string' && request.name !== '' ) {
                response = changeUserSettings(request.name, request.value);
            }
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
