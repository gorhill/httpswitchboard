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

var updateBadgeTimers = {};

function updateBadge(pageUrl) {
    if ( updateBadgeTimers[pageUrl] ) {
        clearTimeout(updateBadgeTimers[pageUrl]);
    }
    updateBadgeTimers[pageUrl] = setTimeout(function() {
        delete updateBadgeTimers[pageUrl];
        // Chromium tab may not exist, like when prerendering a web page for
        // example.
        var tabId = tabIdFromPageUrl(pageUrl);
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

var urlStatsChangedTimers = {};

function urlStatsChanged(pageUrl) {
    if ( urlStatsChangedTimers[pageUrl] ) {
        clearTimeout(urlStatsChangedTimers[pageUrl]);
    }
    urlStatsChangedTimers[pageUrl] = setTimeout(function() {
        delete urlStatsChangedTimers[pageUrl];
        chrome.runtime.sendMessage({
            what: 'urlStatsChanged',
            pageUrl: pageUrl
        });
    }, 200);
}

/******************************************************************************/

// Handling stuff asynchronously simplifies code

chrome.runtime.onMessage.addListener(function(request, sender, callback) {
    var response = undefined;

    if ( request && request.what ) {
        switch ( request.what ) {

        case 'mergeRemoteBlacklist':
            mergeRemoteBlacklist(request.list);
            break;

        case 'parseRemoteBlacklist':
            parseRemoteBlacklist(request.list);
            break;

        case 'queryRemoteBlacklist':
            queryRemoteBlacklist(request.location);
            break;

        case 'localSaveRemoteBlacklist':
            localSaveRemoteBlacklist(request.list);
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

        case 'updateBadge':
            updateBadge(request.pageUrl);
            break;

        case 'urlStatsChanged':
            break;

        case 'reloadTabs':
            smartReloadTabs();
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
});

