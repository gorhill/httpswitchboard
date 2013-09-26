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

// Update visual of extension icon.
// A time out is used to coalesce adjacents requests to update badge.

function updateBadge(pageStats) {
    if ( pageStats.updateBadgeTimer ) {
        clearTimeout(pageStats.updateBadgeTimer);
    }
    pageStats.updateBadgeTimer = setTimeout(function() {
        pageStats.updateBadgeTimer = null;
        // Chromium tab may not exist, like when prerendering a web page for
        // example.
        var tabId = tabIdFromPageStats(pageStats);
        if ( !tabId ) { return; }
        chrome.tabs.get(tabId, function(tab) {
            if ( tab ) {
                var pageStats = pageStatsFromTabId(tab.id);
                var count = pageStats ? Object.keys(pageStats.requests).length : 0;
                var countStr = String(count);
                if ( count >= 1000 ) {
                    if ( count < 10000 ) {
                        countStr = countStr.slice(0,1) + '.' + countStr.slice(1,-2) + 'K';
                    } else if ( count < 1000000 ) {
                        countStr = countStr.slice(0,-3) + 'K';
                    } else if ( count < 10000000 ) {
                        countStr = countStr.slice(0,1) + '.' + countStr.slice(1,-5) + 'M';
                    } else {
                        countStr = countStr.slice(0,-6) + 'M';
                    }
                }
                chrome.browserAction.setBadgeText({ tabId: tab.id, text: countStr });
                chrome.browserAction.setBadgeBackgroundColor({ tabId: tab.id, color: '#000' });
            }
        });
    }, 200);
}

/******************************************************************************/

// Notify whoever care that whitelist/blacklist have changed (they need to
// refresh their matrix).

var permissionsChangedTimer = null;

function permissionsChanged() {
    if ( permissionsChangedTimer ) {
        clearTimeout(permissionsChangedTimer);
    }
    permissionsChangedTimer = setTimeout(function() {
        permissionsChangedTimer = null;
        chrome.runtime.sendMessage({ 'what': 'permissionsChanged' });
    }, 200);
}

/******************************************************************************/

// Notify whoever care that url stats have changed (they need to
// rebuild their matrix).

var urlStatsChangedTimer = null;

function urlStatsChanged() {
    if ( urlStatsChangedTimer ) {
        clearTimeout(urlStatsChangedTimer);
    }
    urlStatsChangedTimer = setTimeout(function() {
        urlStatsChangedTimer = null;
        chrome.runtime.sendMessage({ 'what': 'urlStatsChanged' });
    }, 200);
}

/******************************************************************************/

// Handling stuff asynchronously simplifies code

chrome.runtime.onMessage.addListener(function(request, sender, callback) {
    if ( request && request.what ) {
        switch ( request.what ) {

        case 'mergeRemoteBlacklist':
            mergeRemoteBlacklist(request.content);
            break;

        case 'parseRemoteBlacklist':
            parseRemoteBlacklist(request.location, request.content);
            break;

        case 'queryRemoteBlacklist':
            queryRemoteBlacklist(request.location);
            break;

        case 'localSaveRemoteBlacklist':
            localSaveRemoteBlacklist(request.location, request.content);
            break;

        case 'localRemoveRemoteBlacklist':
            localRemoveRemoteBlacklist(request.location);
            break;

        case 'startWebRequestHandler':
            startWebRequestHandler(request.from);
            break;

        case 'removeCookies':
            removeCookies(request);
            break;

        case 'removeAllCookies':
            removeAllCookies(request.url);
            break;

        case 'findAndRecordCookies':
            findAndRecordCookies(request.pageUrl);
            break;

        default:
             // console.error('HTTP Switchboard > onMessage > unknown request: %o', request);
            break;
        }
    }

    if ( callback ) {
        callback();
    }
});

