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
        var keys = Object.keys(this.jobs);
        var i = keys.length;
        var job;
        while ( i-- ) {
            job = this.jobs[keys[i]];
            if ( job.when > now ) {
                continue;
            }
            job.callback(job.data);
            if ( job.period ) {
                job.when = now + job.period;
            } else {
                job._nullify();
                delete this.jobs[job.name];
                this.jobCount--;
                this.junkyard.push(job);
            }
        }
    }
};

function asyncJobQueueHandler() {
    if ( asyncJobQueue.jobCount ) {
        asyncJobQueue._process();
    }
}

setInterval(asyncJobQueueHandler, 100);

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

// Notify whoever care that url stats have changed (they need to
// rebuild their matrix).

function urlStatsChangedCallback(pageUrl) {
    chrome.runtime.sendMessage({
        what: 'urlStatsChanged',
        pageUrl: pageUrl
    });
}

function urlStatsChanged(pageUrl) {
    asyncJobQueue.add('urlStatsChanged ' + pageUrl, pageUrl, urlStatsChangedCallback, 250);
}

/******************************************************************************/

// Handling stuff asynchronously simplifies code

function onMessageHandler(request, sender, callback) {
    var response;

    if ( request && request.what ) {
        switch ( request.what ) {

        case 'parseRemoteBlacklist':
            parseRemoteBlacklist(request.list);
            break;

        case 'queryRemoteBlacklist':
            queryRemoteBlacklist(request.location);
            break;

        case 'localRemoveRemoteBlacklist':
            localRemoveRemoteBlacklist(request.location);
            break;

        case 'startWebRequestHandler':
            startWebRequestHandler(request.from);
            break;

        case 'gotoURL':
            chrome.tabs.update(request.tabId, { url: request.url });
            break;

        case 'gotoExtensionUrl':
            chrome.tabs.create({'url': chrome.extension.getURL(request.url)});
            break;

        case 'userSettings':
            if ( typeof request.name === 'string' && request.name !== '' ) {
                if ( HTTPSB.userSettings[request.name] !== undefined && request.value !== undefined ) {
                    HTTPSB.userSettings[request.name] = request.value;
                }
                response = HTTPSB.userSettings[request.name];
                saveUserSettings();
            }
            break;

        default:
             // console.error('HTTP Switchboard > onMessage > unknown request: %o', request);
            break;
        }
    }

    if ( callback ) {
        callback(response);
    }
}

chrome.runtime.onMessage.addListener(onMessageHandler);
