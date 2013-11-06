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

// https://github.com/gorhill/httpswitchboard/issues/37
chrome.contentSettings.plugins.clear({});

/******************************************************************************/

function injectedCodeCallback(r) {
    // `r` tells whether there was at least one script tag in the page
    if ( r && r.length ) {
        r = r[0];
        var httpsb = HTTPSB;
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
            block = httpsb.blacklisted(pageUrl, 'script', domain);
            recordFromPageUrl(pageUrl, 'script', url, block);
        }
        // plugins
        // https://github.com/gorhill/httpswitchboard/issues/25
        sources = Object.keys(r.pluginSources);
        i = sources.length;
        while ( i-- ) {
            url = normalizeChromiumUrl(sources[i]);
            domain = getHostnameFromURL(url);
            block = httpsb.blacklisted(pageUrl, 'object', domain);
            recordFromPageUrl(pageUrl, 'object', url, block);
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

function onRemovedTabHandler(tabId) {
    // Can this happen?
    if ( tabId < 0 ) {
        return;
    }

    unbindTabFromPageStats(tabId);
}

chrome.tabs.onRemoved.addListener(onRemovedTabHandler);

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

