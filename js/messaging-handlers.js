/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2014 Raymond Hill

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

/* global chrome, HTTPSB */

/******************************************************************************/

(function() {

/******************************************************************************/

var smartReload = function(tabs) {
    var httpsb = HTTPSB;
    var i = tabs.length;
    while ( i-- ) {
        httpsb.smartReloadTabs(httpsb.userSettings.smartAutoReload, tabs[i].id);
    }
};

/******************************************************************************/

// popup.js

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'disconnected':
            // https://github.com/gorhill/httpswitchboard/issues/94
            if ( HTTPSB.userSettings.smartAutoReload ) {
                chrome.tabs.query({ active: true }, smartReload);
            }
            break;

        default:
            return HTTPSB.messaging.defaultHandler(request, sender, callback);
    }

    callback(response);
};

HTTPSB.messaging.listen('popup.js', onMessage);

})();

/******************************************************************************/

// content scripts

(function() {

var contentScriptSummaryHandler = function(details, sender) {
    // TODO: Investigate "Error in response to tabs.executeScript: TypeError:
    // Cannot read property 'locationURL' of null" (2013-11-12). When can this
    // happens? 
    if ( !details || !details.locationURL ) {
        return;
    }
    var httpsb = HTTPSB;
    var pageURL = httpsb.pageUrlFromTabId(sender.tab.id);
    var pageStats = httpsb.pageStatsFromPageUrl(pageURL);
    var httpsburi = httpsb.URI.set(details.locationURL);
    var frameURL = httpsburi.normalizedURI();
    var frameHostname = httpsburi.hostname;
    var urls, url, r;

    // https://github.com/gorhill/httpswitchboard/issues/333
    // Look-up here whether inline scripting is blocked for the frame.
    var inlineScriptBlocked = httpsb.blacklisted(pageURL, 'script', frameHostname);

    // scripts
    // https://github.com/gorhill/httpswitchboard/issues/25
    if ( pageStats && inlineScriptBlocked ) {
        urls = details.scriptSources;
        for ( url in urls ) {
            if ( !urls.hasOwnProperty(url) ) {
                continue;
            }
            if ( url === '{inline_script}' ) {
                url = frameURL + '{inline_script}';
            }
            r = httpsb.filterRequest(pageURL, 'script', url);
            pageStats.recordRequest('script', url, r !== false, r);
        }
    }

    // TODO: as of 2014-05-26, not sure this is needed anymore, since HTTPSB
    // no longer uses chrome.contentSettings API (I think that was the reason
    // this code was put in).
    // plugins
    // https://github.com/gorhill/httpswitchboard/issues/25
    if ( pageStats ) {
        urls = details.pluginSources;
        for ( url in urls ) {
            if ( !urls.hasOwnProperty(url) ) {
                continue;
            }
            r = httpsb.filterRequest(pageURL, 'object', url);
            pageStats.recordRequest('object', url, r !== false, r);
        }
    }

    // https://github.com/gorhill/httpswitchboard/issues/181
    httpsb.onPageLoadCompleted(pageURL);
};

var contentScriptLocalStorageHandler = function(pageURL) {
    var httpsb = HTTPSB;
    var httpsburi = httpsb.URI.set(pageURL);
    var response = httpsb.blacklisted(pageURL, 'cookie', httpsburi.hostname);
    httpsb.recordFromPageUrl(
        pageURL,
        'cookie',
        httpsburi.rootURL() + '/{localStorage}',
        response
    );
    response = response && httpsb.userSettings.deleteLocalStorage;
    if ( response ) {
        httpsb.localStorageRemovedCounter++;
    }
    return response;
};

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'contentScriptHasLocalStorage':
            response = contentScriptLocalStorageHandler(request.url);
            break;

        case 'contentScriptSummary':
            contentScriptSummaryHandler(request, sender);
            break;

        case 'checkScriptBlacklisted':
            response = {
                scriptBlacklisted: HTTPSB.blacklisted(
                    request.url,
                    'script',
                    HTTPSB.URI.hostnameFromURI(request.url)
                    )
                };
            break;

        case 'getUserAgentReplaceStr':
            response = HTTPSB.userSettings.spoofUserAgent ? HTTPSB.userAgentReplaceStr : undefined;
            break;


        case 'retrieveDomainCosmeticSelectors':
            response = HTTPSB.abpHideFilters.retrieveDomainSelectors(request);
            break;

        case 'retrieveGenericCosmeticSelectors':
            response = HTTPSB.abpHideFilters.retrieveGenericSelectors(request);
            break;

        default:
            return HTTPSB.messaging.defaultHandler(request, sender, callback);
    }

    callback(response);
};

HTTPSB.messaging.listen('contentscript-start.js', onMessage);
HTTPSB.messaging.listen('contentscript-end.js', onMessage);

})();

/******************************************************************************/

// settings.js

(function() {

var onMessage = function(request, sender, callback) {
    var httpsb = HTTPSB;

    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        default:
            return httpsb.messaging.defaultHandler(request, sender, callback);
    }

    callback(response);
};

HTTPSB.messaging.listen('settings.js', onMessage);

})();

/******************************************************************************/

// info.js

(function() {

// map(pageURL) => array of request log entries
var getRequestLog = function(pageURL) {
    var requestLogs = {};
    var pageStores = HTTPSB.pageStats;
    var pageURLs = pageURL ? [pageURL] : Object.keys(pageStores);
    var pageRequestLog, logEntries, i, j, logEntry;

    for ( var i = 0; i < pageURLs.length; i++ ) {
        pageURL = pageURLs[i];
        pageStore = pageStores[pageURL];
        if ( !pageStore ) {
            continue;
        }
        pageRequestLog = [];
        logEntries = pageStore.requests.getLoggedRequests();
        j = logEntries.length;
        while ( j-- ) {
            // rhill 2013-12-04: `logEntry` can be null since a ring buffer is
            // now used, and it might not have been filled yet.
            if ( logEntry = logEntries[j] ) {
                pageRequestLog.push(logEntry);
            }
        }
        requestLogs[pageURL] = pageRequestLog;
    }

    return requestLogs;
};

var onMessage = function(request, sender, callback) {
    var httpsb = HTTPSB;

    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'getPageURLs':
            response = {
                pageURLs: Object.keys(httpsb.pageUrlToTabId),
                behindTheSceneURL: httpsb.behindTheSceneURL
            };
            break;

        case 'getStats':
            var pageStore = httpsb.pageStats[request.pageURL];
            response = {
                globalNetStats: httpsb.requestStats,
                pageNetStats: pageStore ? pageStore.requestStats : null,
                cookieHeaderFoiledCounter: httpsb.cookieHeaderFoiledCounter,
                refererHeaderFoiledCounter: httpsb.refererHeaderFoiledCounter,
                hyperlinkAuditingFoiledCounter: httpsb.hyperlinkAuditingFoiledCounter,
                cookieRemovedCounter: httpsb.cookieRemovedCounter,
                localStorageRemovedCounter: httpsb.localStorageRemovedCounter,
                browserCacheClearedCounter: httpsb.browserCacheClearedCounter,
                abpBlockCount: httpsb.abpBlockCount
            };
            break;

        case 'getRequestLogs':
            response = getRequestLog(request.pageURL);
            break;

        default:
            return httpsb.messaging.defaultHandler(request, sender, callback);
    }

    callback(response);
};

HTTPSB.messaging.listen('info.js', onMessage);

})();

/******************************************************************************/

// ubiquitous-rules.js

(function() {

var onMessage = function(request, sender, callback) {
    var httpsb = HTTPSB;

    // Async
    switch ( request.what ) {
        case 'readUserUbiquitousBlockRules':
            return httpsb.assets.get(httpsb.userBlacklistPath, callback);

        case 'readUserUbiquitousAllowRules':
            return httpsb.assets.get(httpsb.userWhitelistPath, callback);

        case 'writeUserUbiquitousBlockRules':
            return httpsb.assets.put(httpsb.userBlacklistPath, request.content, callback);

        case 'writeUserUbiquitousAllowRules':
            return httpsb.assets.put(httpsb.userWhitelistPath, request.content, callback);

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        default:
            return httpsb.messaging.defaultHandler(request, sender, callback);
    }

    callback(response);
};

HTTPSB.messaging.listen('ubiquitous-rules.js', onMessage);

})();

/******************************************************************************/

// about.js

(function() {

var onMessage = function(request, sender, callback) {
    var httpsb = HTTPSB;

    // Async
    switch ( request.what ) {
        case 'getAssetUpdaterList':
            return httpsb.assetUpdater.getList(callback);

        case 'launchAssetUpdater':
            return httpsb.assetUpdater.update(request.list, callback);

        case 'readUserSettings':
            return chrome.storage.local.get(httpsb.userSettings, callback);

        case 'readUserUbiquitousBlockRules':
            return httpsb.assets.get(httpsb.userBlacklistPath, callback);

        case 'readUserUbiquitousAllowRules':
            return httpsb.assets.get(httpsb.userWhitelistPath, callback);

        case 'writeUserUbiquitousBlockRules':
            return httpsb.assets.put(httpsb.userBlacklistPath, request.content, callback);

        case 'writeUserUbiquitousAllowRules':
            return httpsb.assets.put(httpsb.userWhitelistPath, request.content, callback);

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'loadUpdatableAssets':
            response = httpsb.loadUpdatableAssets();
            break;

        case 'getSomeStats':
            response = {
                storageQuota: httpsb.storageQuota,
                storageUsed: httpsb.storageUsed
            };
            break;

        default:
            return httpsb.messaging.defaultHandler(request, sender, callback);
    }

    callback(response);
};

HTTPSB.messaging.listen('about.js', onMessage);

})();

/******************************************************************************/
