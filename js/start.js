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

// For privacy reasons, ensure all exceptions are removed from settings.
chrome.contentSettings.javascript.clear({});

// rhill 2013-12-05: now we allow all by default, and insert a
// `Content-Policy-Directive` header to disable inline javascript.
// External javascript will still be blocked the old way, by preventing the
// resource from being fetched.
//   https://github.com/gorhill/httpswitchboard/issues/35
chrome.contentSettings.javascript.set({
    primaryPattern: 'https://*/*',
    setting: 'allow'
});
chrome.contentSettings.javascript.set({
    primaryPattern: 'http://*/*',
    setting: 'allow'
});

/******************************************************************************/

function injectedCodeCallback(r) {
    // `r` tells whether there was at least one script tag in the page
    if ( !r || !r.length ) {
        return;
    }
    r = r[0];
    // TODO: Investigate "Error in response to tabs.executeScript: TypeError:
    // Cannot read property 'pageUrl' of null" (2013-11-12). When can this
    // happens? 
    if ( !r || !r.pageUrl ) {
        return;
    }
    var httpsb = HTTPSB;
    var pageUrl = uriTools.normalizeURI(r.pageUrl);
    var pageHostname = uriTools.hostnameFromURI(pageUrl);
    var sources, i;
    var url, domain, block;
    // scripts
    // https://github.com/gorhill/httpswitchboard/issues/25
    sources = Object.keys(r.scriptSources);
    i = sources.length;
    while ( i-- ) {
        url = sources[i];
        if ( url === '{inline_script}' ) {
            domain = pageHostname;
            url = pageUrl + '{inline_script}';
        } else {
            url = uriTools.normalizeURI(url);
            domain = uriTools.hostnameFromURI(url);
        }
        block = httpsb.blacklisted(pageUrl, 'script', domain);
        recordFromPageUrl(pageUrl, 'script', url, block);
    }
    // plugins
    // https://github.com/gorhill/httpswitchboard/issues/25
    sources = Object.keys(r.pluginSources);
    i = sources.length;
    while ( i-- ) {
        url = uriTools.normalizeURI(sources[i]);
        domain = uriTools.hostnameFromURI(url);
        block = httpsb.blacklisted(pageUrl, 'object', domain);
        recordFromPageUrl(pageUrl, 'object', url, block);
    }
}

/******************************************************************************/

function onUpdatedTabsHandler(tabId, changeInfo, tab) {
    // Can this happen?
    if ( !tab.url || !tab.url.length ) {
        return;
    }

    var pageUrl = uriTools.normalizeURI(tab.url);

    // console.debug('tabs.onUpdated > tabId=%d changeInfo=%o tab=%o', tabId, changeInfo, tab);
    var protocol = uriTools.schemeFromURI(pageUrl);
    if ( protocol !== 'http' && protocol !== 'https' ) {
        return;
    }

    // Following code is for script injection, which makes sense only if
    // web page in tab is completely loaded.
    if ( changeInfo.status !== 'complete' ) {
        return;
    }

    // Ensure we have a url stats store and that the tab is bound to it.
    var pageStats = pageStatsFromTabId(tab.id);
    if ( !pageStats ) {
        pageStats = bindTabToPageStats(tab.id, pageUrl);
    }

    // Chrome webstore can't be injected with foreign code, following is to
    // avoid error message.
    if ( HTTPSB.excludeRegex.test(tab.url) ) {
        return;
    }

    // Check if page has at least one script tab. We must do that here instead
    // of at web request intercept time, because we can't inject code at web
    // request time since the url hasn't been set in the tab.
    // TODO: For subframe though, we might need to do it at web request time.
    //       Need to investigate using trace, doc does not say everything.
    // console.debug('tabs.onUpdated > injecting code to check for <script> tags');
    chrome.tabs.executeScript(
        tabId,
        {
            file: 'js/inject.js',
            runAt: 'document_idle'
        },
        injectedCodeCallback
    );

    updateContextMenu();
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

chrome.tabs.onActivated.addListener(updateContextMenu)

/******************************************************************************/

// Might help.
//   https://github.com/gorhill/httpswitchboard/issues/35

function onBeforeNavigateCallback(details) {
    if ( details.url.search(/^https?:\/\//) < 0 ) {
        return;
    }
    if ( HTTPSB.excludeRegex.test(details.url) ) {
        return;
    }
    var hostname = uriTools.hostnameFromURI(details.url);

    // No longer needed, but I will just comment out for now.
    //   https://github.com/gorhill/httpswitchboard/issues/35
    // setJavascript(hostname, HTTPSB.whitelisted(details.url, 'script', hostname));
}

chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigateCallback);

/******************************************************************************/

// Load user settings

load();

/******************************************************************************/

// rhill 2013-11-24: bind behind-the-scene virtual tab/url manually, since the
// normal way forbid binding behind the scene tab.
// https://github.com/gorhill/httpswitchboard/issues/67

(function(tabId, pageUrl) {
    var pageStats = createPageStats(pageUrl);
    HTTPSB.pageUrlToTabId[pageUrl] = tabId;
    HTTPSB.tabIdToPageUrl[tabId] = pageUrl;
})(HTTPSB.behindTheSceneTabId, HTTPSB.behindTheSceneURL);

/******************************************************************************/

// Initialize internal state with maybe already existing tabs

(function(){
    chrome.tabs.query({ url: '<all_urls>' }, function(tabs) {
        var i = tabs.length;
        // console.debug('HTTP Switchboard > preparing to bind %d tabs', i);
        var tab;
        while ( i-- ) {
            tab = tabs[i];
            bindTabToPageStats(tab.id, uriTools.normalizeURI(tab.url));
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
    HTTPSB.port = port;
    port.onDisconnect.addListener(onDisconnectHandler);
}

function onDisconnectHandler() {
    HTTPSB.port = null;
    smartReloadTabs();
}

chrome.extension.onConnect.addListener(onConnectHandler);

