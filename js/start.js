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

// rhill 20131017 > https://github.com/gorhill/httpswitchboard/issues/9:
// HTTP Switchboard relinquishes all control of cookies settings (it will
// however keep removing outbound cookies from headers, so this is equivalent
// to a recording machine which can never be played back).

chrome.contentSettings.cookies.clear({});

/******************************************************************************/

function injectedCodeCallback(r) {
    // `r` tells whether there was at least one script tag in the page
    if ( r && r.length ) {
        var r = r[0];
        var pageUrl = normalizeChromiumUrl(r.pageUrl);
        var sources, i;
        var url, domain, block;
        // scripts
        // https://github.com/gorhill/httpswitchboard/issues/25
        sources = Object.keys(r.scriptSources);
        i = sources.length;
        while ( i-- ) {
            url = sources[i];
            if ( url === '{inline_script}' ) {
                domain = getHostnameFromURL(pageUrl);
                url = pageUrl + '{inline_script}';
            } else {
                url = normalizeChromiumUrl(url);
                domain = getHostnameFromURL(url);
            }
            block = blacklisted('script', domain);
            recordFromPageUrl(pageUrl, 'script', url, block);
            if ( block ) {
                addStateFromPageUrl(pageUrl, 'script', domain);
            }
        }
        // plugins
        // https://github.com/gorhill/httpswitchboard/issues/25
        sources = Object.keys(r.pluginSources);
        i = sources.length;
        while ( i-- ) {
            url = normalizeChromiumUrl(sources[i]);
            domain = getHostnameFromURL(url);
            block = blacklisted('object', domain);
            recordFromPageUrl(pageUrl, 'object', url, block);
            if ( block ) {
                addStateFromPageUrl(pageUrl, 'object', domain);
            }
        }
    }
}

function onUpdatedTabsHandler(tabId, changeInfo, tab) {
    // Can this happen?
    if ( !tab.url || !tab.url.length ) {
        return;
    }

    var pageUrl = normalizeChromiumUrl(tab.url);

    // console.debug('tabs.onUpdated > tabId=%d changeInfo=%o tab=%o', tabId, changeInfo, tab);
    var protocol = getUrlProtocol(pageUrl);
    if ( protocol !== 'http' && protocol !== 'https' ) {
        return;
    }

    // Ensure we have a url stats store and that the tab is bound to it.
    var pageStats = bindTabToPageStats(tab.id, pageUrl);

    // Following code is for script injection, which makes sense only if
    // web page in tab is completely loaded.
    if ( changeInfo.status !== 'complete' ) {
        return;
    }

    // Chrome webstore can't be injected with foreign code following is to
    // avoid error message.
    if ( pageStats.ignore ) {
        return;
    }

    // Check if page has at least one script tab. We must do that here instead
    // of at web request intercept time, because we can't inject code at web
    // request time since the url hasn't been set in the tab.
    // TODO: For subframe though, we might need to do it at web request time.
    //       Need to investigate using trace, doc does not say everything.
    // console.debug('tabs.onUpdated > injecting code to check for at least one <script> tag');
    chrome.tabs.executeScript(
        tabId,
        {
            file: 'js/inject.js',
            runAt: 'document_idle'
        },
        injectedCodeCallback
    );
}

chrome.tabs.onUpdated.addListener(onUpdatedTabsHandler);

/******************************************************************************/

// Load user settings

load();

/******************************************************************************/

// Virtual tab to collect behind the scene traffic: we want to know what is
// going on in there.

bindTabToPageStats(HTTPSB.behindTheSceneTabId, HTTPSB.behindTheSceneURL);

/******************************************************************************/

// Initialize internal state with maybe already existing tabs

(function(){
    chrome.tabs.query({ url: '<all_urls>' }, function(tabs) {
        var i = tabs.length;
        // console.debug('HTTP Switchboard > preparing to bind %d tabs', i);
        var tab;
        while ( i-- ) {
            tab = tabs[i];
            bindTabToPageStats(tab.id, normalizeChromiumUrl(tab.url));
        }
        // Tabs are now bound to url stats stores, therefore it is now safe
        // to handle net traffic.
        chrome.runtime.sendMessage({
            'what': 'startWebRequestHandler',
            'from': 'tabsBound'
            });
    });
})();

/******************************************************************************/

// Listeners to let popup let us know when pages must be reloaded.

function onConnectHandler(port) {
    port.onDisconnect.addListener(onDisconnectHandler);
}

function onDisconnectHandler() {
    smartReloadTabs();
}

chrome.extension.onConnect.addListener(onConnectHandler);

/******************************************************************************/

// Garbage collect stale url stats entries
// rhill 2013-10-23: revised to avoid closures.

function gcPageStatsExistingTabsHandler(tabs) {
    var httpsb = HTTPSB;
    var visibleTabs = {};
    tabs.map(function(tab) {
        visibleTabs[tab.id] = true;
    });
    var pageUrls = Object.keys(httpsb.pageStats);
    var i = pageUrls.length;
    var pageUrl, tabId, pageStats;
    while ( i-- ) {
        pageUrl = pageUrls[i];
        // Do not dispose of chromium-behind-the-scene virtual tab,
        // GC is done differently on this one (i.e. just pruning).
        if ( pageUrl === httpsb.behindTheSceneURL ) {
            continue;
        }
        tabId = tabIdFromPageUrl(pageUrl);
        pageStats = httpsb.pageStats[pageUrl];
        if ( !visibleTabs[tabId] && !pageStats.visible ) {
            cookieHunter.erase(pageStats);
            delete httpsb.pageStats[pageUrl];
            // console.debug('HTTP Switchboard > GC: disposed of "%s"', pageUrl);
        }
        pageStats.visible = !!visibleTabs[tabId];
        if ( !pageStats.visible ) {
            unbindTabFromPageStats(tabId);
        }
    }
}

function gcPageStatsCallback() {
    var httpsb = HTTPSB;

    // Get rid of stale pageStats, those not bound to a tab for more than
    // {duration placeholder}.
    chrome.tabs.query({ 'url': '<all_urls>' }, gcPageStatsExistingTabsHandler);

    // Prune content of chromium-behind-the-scene virtual tab
    var pageStats = httpsb.pageStats[httpsb.behindTheSceneURL];
    if ( pageStats ) {
        var reqKeys = Object.keys(pageStats.requests)
        if ( reqKeys > httpsb.behindTheSceneMaxReq ) {
            reqKeys = reqKeys.sort(function(a,b){
                var ra = pageStats.requests[a];
                var rb = pageStats.requests[b];
                if ( rb < ra ) { return -1; }
                if ( ra < rb ) { return 1; }
                return 0;
            }).slice(httpsb.behindTheSceneMaxReq);
            var iReqKey = reqKeys.length;
            while ( iReqKey-- ) {
                delete pageStats.requests[reqKeys[iReqKey]];
            }
        }
    }
}

asyncJobQueue.add('gcPageStats', null, gcPageStatsCallback, HTTPSB.gcPeriod / 2, true);

