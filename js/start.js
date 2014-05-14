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

// ORDER IS IMPORTANT

/******************************************************************************/

HTTPSB.turnOn();

/******************************************************************************/

function onUpdatedTabsHandler(tabId, changeInfo, tab) {
    // Following code is for script injection, which makes sense only if
    // web page in tab is completely loaded.
    if ( changeInfo.status !== 'complete' ) {
        return;
    }

    // Can this happen?
    if ( !tab.url || !tab.url.length ) {
        return;
    }

    // rhill 2013-12-23: Compute state after whole page is loaded. This is
    // better than building a state snapshot dynamically when requests are
    // recorded, because here we are not afflicted by the browser cache
    // mechanism.

    // rhill 2014-03-05: Use tab id instead of page URL: this allows a
    // blocked page using HTTPSB internal data URI-based page to be properly
    // unblocked when user un-blacklist the hostname.
    // https://github.com/gorhill/httpswitchboard/issues/198

    var pageStats = HTTPSB.pageStatsFromTabId(tabId);
    if ( pageStats ) {
        pageStats.state = HTTPSB.computeTabState(tabId);
    }
}

chrome.tabs.onUpdated.addListener(onUpdatedTabsHandler);

/******************************************************************************/

function onRemovedTabHandler(tabId) {
    // Can this happen?
    if ( tabId < 0 ) {
        return;
    }

    HTTPSB.unbindTabFromPageStats(tabId);
}

chrome.tabs.onRemoved.addListener(onRemovedTabHandler);

/******************************************************************************/

// Bind a top URL to a specific tab

function onBeforeNavigateCallback(details) {
    // Don't bind to a subframe
    if ( details.frameId > 0 ) {
        return;
    }
    // console.debug('onBeforeNavigateCallback() > "%s" = %o', details.url, details);

    HTTPSB.bindTabToPageStats(details.tabId, HTTPSB.URI.set(details.url).normalizedURI());
}

chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigateCallback);

/******************************************************************************/

// Load everything

HTTPSB.load();

/******************************************************************************/

// rhill 2013-11-24: bind behind-the-scene virtual tab/url manually, since the
// normal way forbid binding behind the scene tab.
// https://github.com/gorhill/httpswitchboard/issues/67

(function(tabId, pageUrl) {
    HTTPSB.createPageStats(pageUrl);
    HTTPSB.pageUrlToTabId[pageUrl] = tabId;
    HTTPSB.tabIdToPageUrl[tabId] = pageUrl;
})(HTTPSB.behindTheSceneTabId, HTTPSB.behindTheSceneURL);

/******************************************************************************/

// Initialize internal state with maybe already existing tabs

chrome.tabs.query({ url: '<all_urls>' }, function(tabs) {
    var i = tabs.length;
    // console.debug('HTTP Switchboard > preparing to bind %d tabs', i);
    var tab;
    while ( i-- ) {
        tab = tabs[i];
        HTTPSB.bindTabToPageStats(tab.id, HTTPSB.URI.set(tab.url).normalizedURI());
    }
    // Tabs are now bound to url stats stores, therefore it is now safe
    // to handle net traffic.
    chrome.runtime.sendMessage({
        'what': 'startWebRequestHandler',
        'from': 'tabsBound'
        });
});

/******************************************************************************/

// Listeners to let popup let us know when pages must be reloaded.

(function() {
    var onDisconnectHandler = function() {
        var httpsb = HTTPSB;
        var tabid;
        if ( httpsb.port ) {
            var matches = httpsb.port.name.match(/^httpsb-matrix-tabid-(\d+)$/);
            if ( matches && matches.length > 1 ) {
                tabid = parseInt(matches[1], 10);
            }
        }
        httpsb.port = null;
        // https://github.com/gorhill/httpswitchboard/issues/94
        if ( httpsb.userSettings.smartAutoReload ) {
            httpsb.smartReloadTabs(httpsb.userSettings.smartAutoReload, tabid);
        }
    };

    var onConnectHandler = function(port) {
        HTTPSB.port = port;
        port.onDisconnect.addListener(onDisconnectHandler);
    };

    chrome.extension.onConnect.addListener(onConnectHandler);
})();

/******************************************************************************/

// Browser data jobs

function clearBrowserCacheCallback() {
    var httpsb = HTTPSB;
    if ( httpsb.userSettings.clearBrowserCache ) {
        httpsb.clearBrowserCacheCycle -= 15;
        if ( httpsb.clearBrowserCacheCycle <= 0 ) {
            httpsb.clearBrowserCacheCycle = httpsb.userSettings.clearBrowserCacheAfter;
            httpsb.browserCacheClearedCounter++;
            chrome.browsingData.removeCache({ since: 0 });
            // console.debug('clearBrowserCacheCallback()> chrome.browsingData.removeCache() called');
        }
    }
}

HTTPSB.asyncJobs.add('clearBrowserCache', null, clearBrowserCacheCallback, 15 * 60 * 1000, true);

/******************************************************************************/
