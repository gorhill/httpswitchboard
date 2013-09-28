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

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    // Can this happen?
    if ( !tab.url || !tab.url.length ) {
        return;
    }
    // console.debug('tabs.onUpdated > tabId=%d changeInfo=%o tab=%o', tabId, changeInfo, tab);
    if ( getUrlProtocol(tab.url).search('http') !== 0 ) {
        return;
    }

    var pageUrl = normalizeChromiumUrl(tab.url);

    // Ensure we have a url stats store and that the tab is bound to it.
    bindTabToPageStats(tab.id, pageUrl);

    // Following code is for script injection, which makes sense only if
    // web page in tab is completely loaded.
    if ( changeInfo.status !== 'complete' ) {
        return;
    }
    // Chrome webstore can't be injected with foreign code (I can see why),
    // following is to avoid error message.
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
            if ( r ) {
                var domain = getUrlDomain(pageUrl);
                var block = blacklisted('script', domain);
                recordFromPageUrl(pageUrl, 'script', pageUrl + '{inline_script}', block);
                if ( block ) {
                    addStateFromPageUrl(pageUrl, 'script', domain);
                }
            }
        }
    );

    // Cookie hunting expedition for this page url and record all those we
    // find which hit any domain found on this page.
    // TODO: listen to cookie changes.
    chrome.runtime.sendMessage({
        what: 'findAndRecordCookies',
        pageUrl: pageUrlFromTabId(tabId)
    });
})

/******************************************************************************/

// Load user settings

load();

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
        chrome.tabs.query({ 'url': '<all_urls>' }, function(tabs){
            var interval;
            var pageUrl;
            var i = tabs.length;
            while ( i-- ) {
                // page is in a chrome tab
                pageUrl = pageUrlFromTabId(tabs[i].id);
                if ( pageUrl ) {
                    httpsb.pageStats[pageUrl].lastTouched = Date.now();
                }
            }
            for ( var pageUrl in httpsb.pageStats ) {
                interval = Date.now() - httpsb.pageStats[pageUrl].lastTouched;
                if ( interval >= httpsb.gcPeriod ) {
                    delete httpsb.pageStats[pageUrl];
                    // console.debug('HTTP Switchboard >  > GC: disposed of "%s"', pageUrl);
                }
            }
        });
    };

    setInterval(gcFunc, httpsb.gcPeriod / 2);
})();

