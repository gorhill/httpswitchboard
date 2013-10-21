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

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
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
    bindTabToPageStats(tab.id, pageUrl);

    // Following code is for script injection, which makes sense only if
    // web page in tab is completely loaded.
    if ( changeInfo.status !== 'complete' ) {
        return;
    }

    // Chrome webstore can't be injected with foreign code following is to
    // avoid error message.
    if ( pageUrl.search(/^https?:\/\/chrome\.google\.com\/webstore\//) === 0 ) {
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
        // `r` tells whether there was at least one script tag in the page
        function(r) {
            if ( r && r.length && r[0] ) {
                var domain = getHostnameFromURL(pageUrl);
                var block = blacklisted('script', domain);
                recordFromPageUrl(pageUrl, 'script', pageUrl + '{inline_script}', block);
                if ( block ) {
                    addStateFromPageUrl(pageUrl, 'script', domain);
                }
            }
        }
    );
});

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

// hooks to let popup let us know whether page must be reloaded

chrome.extension.onConnect.addListener(function(port) {
    port.onDisconnect.addListener(function() {
        chrome.runtime.sendMessage({ what: 'reloadTabs' });
    });
});

/******************************************************************************/

// Garbage collect stale url stats entries

(function(){
    var httpsb = HTTPSB;
    var gcFunc = function() {
        // Get rid of stale pageStats, those not bound to a tab for more than
        // {duration placeholder}.
        chrome.tabs.query({ 'url': '<all_urls>' }, function(tabs){
            var visibleTabs = {};
            tabs.map(function(tab) {
                visibleTabs[tab.id] = true;
            });
            var pageUrls = Object.keys(httpsb.pageStats);
            var i = pageUrls.length;
            var pageUrl, tabId, pageStats;
            while ( i-- ) {
                pageUrl = pageUrls[i];
                tabId = tabIdFromPageUrl(pageUrl);
                // Do not dispose of chromium-behind-the-scene virtual tab,
                // GC is done differently on this one (i.e. just pruning).
                if ( tabId === httpsb.chromiumBehindTheSceneTabId ) {
                    continue;
                }
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
            };
        });

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
    };

    setInterval(gcFunc, httpsb.gcPeriod / 2);
})();

