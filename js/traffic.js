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

// Intercept and filter web requests according to white and black lists.

function webRequestHandler(details) {
/*
    console.debug('Request: tab=%d parent=%d frame=%d type=%s, url=%s',
        details.tabId,
        details.parentFrameId,
        details.frameId,
        details.type,
        details.url
        );
*/

    var tabId = details.tabId;

    // ignore traffic outside tabs
    // TODO: when might this happen?
    if ( tabId < 0 ) {
        return;
    }

    var type = details.type;
    var url = normalizeChromiumUrl(details.url);
    var isMainFrame = type === 'main_frame';
    var isRootFrame = isMainFrame && details.parentFrameId < 0;

    // don't block extensions, especially myself...
   if ( url.search(/^chrome-extension:\/\//) === 0 ) {
        // special case (that's my solution for now):
        // if it is HTTP Switchboard's frame.html, verify that
        // the page that was blacklisted is still blacklisted, and if not,
        // redirect to the previously blacklisted page.
        // TODO: is there a bette rway to do this? Works well though...
        // chrome-extension://bgdnahgfnkneapahgkejhjcenmopifdi/frame.html?domain={domain}&url={url}
        if ( isRootFrame ) {
            var matches = url.match(/^chrome-extension:\/\/[a-z]+\/frame\.html\?domain=(.+)&url=(.+)$/);
            if ( matches && whitelisted('main_frame', matches[1]) ) {
                return { "redirectUrl": decodeURIComponent(matches[2]) };
            }
        }
        return;
    }

    // If it's a top frame, bind to a new page stats store
    // TODO: favicon is sent before top main frame...
    if ( isRootFrame ) {
        bindTabToPageStats(tabId, url);
    }

    // Log request
    recordFromTabId(tabId, type, url);

    var domain = getUrlDomain(url);

    // whitelisted?
    if ( whitelisted(type, domain) ) {
        // console.debug('webRequestHandler > allowing %s from %s', type, domain);
        // if it is a root frame and scripts are blacklisted for the
        // domain, disable scripts for this domain, necessary since inline
        // script tags are not passed through web request handler.
        // TODO: not only root frame...
        if ( isMainFrame ) {
            var blacklistScript = blacklisted('script', domain);
            chrome.contentSettings.javascript.set({
                primaryPattern: '*://*.' + domain + '/*',
                setting: blacklistScript ? 'block' : 'allow'
            });
            // console.debug('Blacklisting scripts for *://%s/* is %o', domain, blacklistScript);

            // when the tab is updated, we will check if page has at least one
            // script tag, this takes care of inline scripting, which doesn't
            // generate 'script' type web requests.
        }
        return;
    }

    // blacklisted
    // console.debug('webRequestHandler > blocking %s from %s', type, domain);

    // remember this blacklisting, used to create a snapshot of the state
    // of the tab, which is useful for smart reload of the page (reload the
    // page only when state efectively change)
    // TODO: makes more sense to care about whitelisted items
    addStateFromTabId(tabId, type, domain);

    // if it's a blacklisted frame, redirect to frame.html
    if ( isMainFrame || type === 'sub_frame' ) {
        var q = chrome.runtime.getURL('frame.html') + '?';
        q += 'domain=' + encodeURIComponent(domain);
        q += '&';
        q += 'url=' + encodeURIComponent(url);
        // console.debug('webRequestHandler > redirecting %s to %s', url, q);
        return { "redirectUrl": q };
    }

    return { "cancel": true };
}

/******************************************************************************/

// This is to handle cookies leaving the browser.

function webHeaderRequestHandler(details) {

    // ignore traffic outside tabs
    // TODO: when might this happen?
    // Apparently from within extensions
    var tabId = details.tabId;
    if ( details.tabId < 0 ) {
        return;
    }

    // Any cookie in there?
    var cookieJar = [];
    var i = details.requestHeaders.length;
    while ( i-- ) {
        if ( details.requestHeaders[i].name.toLowerCase() === 'cookie' ) {
            cookieJar.push(i);
        }
    }
    // Nope, bye
    if ( cookieJar.length < 0 ) {
        return;
    }

    var domain = getUrlDomain(details.url);
    var blacklistCookie = blacklisted('cookie', domain);

    // remove cookie headers if domain is blacklisted
    if ( blacklistCookie ) {
        cookieJar.reverse();
        var headers;
        while ( cookieJar.length ) {
            i = cookieJar.pop();
            headers = details.requestHeaders.splice(i, 1);
            // console.debug('HTTP Switchboard > foiled chromium attempt to send cookie "%s..." to %s', headers[0].value.slice(0,40), details.url);
        }

        return { requestHeaders: details.requestHeaders };
    }
}

/******************************************************************************/

var webRequestHandlerRequirements = {
    'tabsBound': 0,
    'listsLoaded': 0
    };

function startWebRequestHandler(from) {
    // Do not launch traffic handler if not all requirements are fullfilled.
    // This takes care of pages being blocked when chromium is launched
    // because there is no whitelist loaded and default is to block everything.
    var o = webRequestHandlerRequirements;
    o[from] = 1;
    if ( Object.keys(o).map(function(k){return o[k];}).join().search('0') >= 0 ) {
        return;
    }

    chrome.webRequest.onBeforeRequest.addListener(
        webRequestHandler,
        {
            "urls": [
                "<all_urls>"
            ],
            "types": [
                "main_frame",
                "sub_frame",
                "script",
                "image",
                "object",
                "xmlhttprequest",
                "other"
            ]
        },
        [ "blocking" ]
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
        webHeaderRequestHandler,
        {
            'urls': [
                '<all_urls>'
            ]
        },
        ['blocking', 'requestHeaders']
    );

    HTTPSB.webRequestHandler = true;
}
