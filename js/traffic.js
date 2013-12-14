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

/*jshint multistr: true */
var rootFrameReplacement = "<!DOCTYPE html> \
<html> \
<head> \
<style> \
@font-face { \
font-family: 'httpsb'; \
font-style: normal; \
font-weight: 400; \
src: local('httpsb'), url('{{fontUrl}}') format('truetype'); \
} \
body { \
margin: 0; \
border: 0; \
padding: 0; \
font: 13px httpsb,sans-serif; \
width: 100%; \
height: 100%; \
background: transparent url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAjCAYAAAAe2bNZAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QkOFgcvc4DETwAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAACGSURBVFjD7ZZBCsAgEAMT6f+/nJ5arYcqiKtIPAaFYR2DFCAAgEQ8iwzLCLxZWglSZgKUdgHJk2kdLEY5C4QAUxeIFOINfwUOBGkLPBnkAIEDQPoEDiw+uoGHBQ4ovv4GnvTMS4EvC+wvhBvYAltgC2yBLbAFPlTgvKG6vxXZB6QOl2S7gNw6ktgOp+IH7wAAAABJRU5ErkJggg==') repeat; \
text-align: center; \
} \
div { \
margin: 2px; \
border: 0; \
padding: 0 2px; \
display: inline-block; \
color: white; \
background: #c00; \
} \
</style> \
<link href='{{cssURL}}?url={{originalURL}}&hostname={{hostname}}&t={{now}}' rel='stylesheet' type='text/css'> \
<title>Blocked by HTTPSB</title> \
</head> \
<body title='&ldquo;{{hostname}}&rdquo; blocked by HTTP Switchboard'> \
<div>{{hostname}}</div> \
</body> \
</html>";

var subFrameReplacement = "<!DOCTYPE html> \
<html> \
<head> \
<style> \
@font-face { \
font-family: 'httpsb'; \
font-style: normal; \
font-weight: 400; \
src: local('httpsb'), url('{{fontUrl}}') format('truetype'); \
} \
body { \
margin: 0; \
border: 0; \
padding: 0; \
font: 13px httpsb,sans-serif; \
width: 100%; \
height: 100%; \
background: transparent url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAjCAYAAAAe2bNZAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QkOFgcvc4DETwAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAACGSURBVFjD7ZZBCsAgEAMT6f+/nJ5arYcqiKtIPAaFYR2DFCAAgEQ8iwzLCLxZWglSZgKUdgHJk2kdLEY5C4QAUxeIFOINfwUOBGkLPBnkAIEDQPoEDiw+uoGHBQ4ovv4GnvTMS4EvC+wvhBvYAltgC2yBLbAFPlTgvKG6vxXZB6QOl2S7gNw6ktgOp+IH7wAAAABJRU5ErkJggg==') repeat; \
text-align: center; \
} \
div { \
margin: 2px; \
border: 0; \
padding: 0 2px; \
display: inline-block; \
color: white; \
background: #c00; \
} \
</style> \
<title>Blocked by HTTPSB</title> \
</head> \
<body title='&ldquo;{{hostname}}&rdquo; blocked by HTTP Switchboard'> \
<div>{{hostname}}</div> \
</body> \
</html>";

/******************************************************************************/

// Intercept and filter web requests according to white and black lists.

function beforeRequestHandler(details) {
    // quickProfiler.start();

    var httpsb = HTTPSB;
    var tabId = details.tabId;

    // Do not ignore traffic outside tabs
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }

    var url = uriTools.normalizeURI(details.url);
    var hostname, pageURL;

    // Don't block chrome extensions
    // rhill 2013-12-10: Avoid regex whenever a faster indexOf() can be used:
    // here we can use fast indexOf() as a first filter -- which is executed
    // for every single request (so speed matters).
    if ( url.indexOf(httpsb.chromeExtensionURLPrefix) === 0 ) {
        // If it is HTTP Switchboard's root frame replacement URL, verify that
        // the page that was blacklisted is still blacklisted, and if not,
        // redirect to the previously blacklisted page.
        if ( details.parentFrameId < 0 && url.indexOf(httpsb.noopCSSURL) === 0 ) {
            var matches = url.match(/url=([^&]+)&hostname=([^&]+)/);
            if ( matches ) {
                pageURL = decodeURIComponent(matches[1]);
                hostname = decodeURIComponent(matches[2]);
                if ( httpsb.whitelisted(pageURL, 'main_frame', hostname) ) {
                    chrome.runtime.sendMessage({
                        what: 'gotoURL',
                        tabId: tabId,
                        url: pageURL
                    });
                }
            }
        }
        // Chrome extensions are not processed further
        // quickProfiler.stop('beforeRequestHandler');
        return;
    }

    // quickProfiler.start();

    // If it's a top frame, bind to a new page stats store
    var type = details.type;
    var isMainFrame = type === 'main_frame';
    var isRootFrame = isMainFrame && details.parentFrameId < 0;
    if ( isRootFrame ) {
        bindTabToPageStats(tabId, url);
    }

    var pageStats = pageStatsFromTabId(tabId);
    hostname = uriTools.hostnameFromURI(url);
    pageURL = pageUrlFromPageStats(pageStats) || '*';

    // rhill 2013-12-08:
    // Better handling of stylesheet requests: if domain of `stylesheet` object
    // is same as domain of `main_frame`, the `stylesheet` is evaluated as if
    // it is `main_frame` (permissive), else it is evaluated as `other`,
    // i.e. an external resources (restrictive).
    // This is for privacy reasons: a whole lot of web sites pull their fonts
    // from, say, `fonts.googleapis.com`, thus giving Google log data that one
    // specific IP address has been visiting one specific website.
    // We don't want that.
    var typeToEval = type;
    var typeToRecord = type;
    if ( type === 'stylesheet' ) {
        if ( uriTools.domainFromHostname(hostname) === pageStats.pageDomain ) {
            typeToEval = 'main_frame';
        } else {
            typeToEval = typeToRecord = 'other';
        }
    }

    // Block request?
    // https://github.com/gorhill/httpswitchboard/issues/27
    var block = false; // By default, don't block behind-the-scene requests
    if ( tabId !== httpsb.behindTheSceneTabId || httpsb.userSettings.processBehindTheSceneRequests ) {
        block = httpsb.blacklisted(pageURL, typeToEval, hostname);
    }

    if ( pageStats ) {
        // These counters are used so that icon presents an overview of how
        // much allowed/blocked.
        if ( isRootFrame ) {
            pageStats.perLoadAllowedRequestCount =
            pageStats.perLoadBlockedRequestCount = 0;
        }

        // Log request
        pageStats.recordRequest(typeToRecord, url, block);

        // rhill 2013-10-20:
        // https://github.com/gorhill/httpswitchboard/issues/19
        if ( pageStats.ignore ) {
            // quickProfiler.stop('beforeRequestHandler');
            return;
        }
    }

    // Collect global stats
    httpsb.requestStats.record(typeToRecord, block);

    // quickProfiler.stop('beforeRequestHandler | evaluate&record');

    // whitelisted?
    if ( !block ) {
        // console.debug('beforeRequestHandler > allowing %s from %s', type, hostname);

        // If the request is not blocked, this means the response could contain
        // cookies. Thus, we go cookie hunting for this page url and record all
        // those we find which hit any hostname found on this page.
        // No worry, this is async.

        // rhill 2013-11-07: Senseless to do this for behind-the-scene
        // requests.
        // rhill 2013-12-03: Do this here only for root frames.
        if ( isRootFrame && tabId !== httpsb.behindTheSceneTabId ) {
            cookieHunter.recordPageCookiesAsync(pageStats);
        }

        // quickProfiler.stop('beforeRequestHandler');
        // console.log("HTTPSB > %s @ url=%s", details.type, details.url);
        return;
    }

    // quickProfiler.stop('beforeRequestHandler');

    // blacklisted
    // console.debug('beforeRequestHandler > blocking %s from %s', type, hostname);

    // If it's a blacklisted frame, redirect to frame.html
    // rhill 2013-11-05: The root frame contains a link to noop.css, this
    // allows to later check whether the root frame has been unblocked by the
    // user, in which case we are able to force a reload using a redirect.
    var html, dataURI;
    if ( isRootFrame ) {
        html = rootFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, httpsb.fontCSSURL);
        html = html.replace(/{{cssURL}}/g, httpsb.noopCSSURL);
        html = html.replace(/{{hostname}}/g, encodeURIComponent(hostname));
        html = html.replace(/{{originalURL}}/g, encodeURIComponent(url));
        html = html.replace(/{{now}}/g, String(Date.now()));
        dataURI = 'data:text/html;base64,' + btoa(html);
        return { "redirectUrl": dataURI };
    } else if ( isMainFrame || type === 'sub_frame' ) {
        html = subFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, httpsb.fontCSSURL);
        html = html.replace(/{{hostname}}/g, hostname);
        dataURI = 'data:text/html;base64,' + btoa(html);
        return { "redirectUrl": dataURI };
    }

    // quickProfiler.stop('beforeRequestHandler');

    return { "cancel": true };
}

/******************************************************************************/

// This is to handle cookies leaving the browser.

function beforeSendHeadersHandler(details) {

    // Ignore traffic outside tabs
    if ( details.tabId < 0 ) {
        return;
    }

    // Any cookie in there?
    var hostname = uriTools.hostnameFromURI(details.url);
    var blacklistCookie = HTTPSB.blacklisted(pageUrlFromTabId(details.tabId), 'cookie', hostname);

    // rhill 2013-12-11: If cookies are not blacklisted, headers won't be
    // modified, so leave now.
    if ( !blacklistCookie ) {
        return;
    }

    var headers = details.requestHeaders;
    var i = headers.length;
    var foiled = false;
    while ( i-- ) {
        if ( headers[i].name.toLowerCase() !== 'cookie' ) {
            continue;
        }
        // console.debug('HTTP Switchboard > foiled browser attempt to send cookie(s) to %s', details.url);
        headers.splice(i, 1);
        foiled = true
    }

    if ( foiled ) {
        return { requestHeaders: headers };
    }
}

/******************************************************************************/

// To prevent inline javascript from being executed.

// Prevent inline scripting using `Content-Security-Policy`:
// https://dvcs.w3.org/hg/content-security-policy/raw-file/tip/csp-specification.dev.html

// This fixes:
// https://github.com/gorhill/httpswitchboard/issues/35

function headersReceivedHandler(details) {

    // Ignore anything which is not top frame
    var type = details.type;
    var isMainFrame = type === 'main_frame';
    if ( type !== 'main_frame' && type !== 'sub_frame' ) {
        return;
    }

    // rhill 2013-12-08: ALWAYS evaluate for javascript, do not rely too much
    // on the top page to be bound to a tab.
    // https://github.com/gorhill/httpswitchboard/issues/75
    var tabId = details.tabId;

    // rhill 2013-12-07:
    // Apparently in Opera, onBeforeRequest() is triggered while the
    // URL is not yet bound to a tab (-1), which caused the code here
    // to not be able to lookup the pageStats. So let the code here bind
    // the page to a tab if not done yet.
    // https://github.com/gorhill/httpswitchboard/issues/75
    if ( tabId >= 0 && isMainFrame && details.parentFrameId < 0 ) {
        bindTabToPageStats(tabId, uriTools.normalizeURI(details.url));
    }

    var pageStats = pageStatsFromTabId(tabId);

    // Evaluate according to scope
    // rhill 2013-12-07:
    // Worst case scenario, if no pageURL can be found for this
    // request, use global scope to evaluate whether it should be blocked
    // or allowed.
    // https://github.com/gorhill/httpswitchboard/issues/75
    var pageURL = pageStats ? pageUrlFromPageStats(pageStats) : '*';
    var hostname = uriTools.hostnameFromURI(details.url);

    if ( HTTPSB.whitelisted(pageURL, 'script', hostname) ) {
        return;
    }

    // If javascript not allowed, say so through a `Content-Security-Policy`
    // directive.
    details.responseHeaders.push({ 'name': 'Content-Security-Policy', 'value': "script-src 'none'" });
    return { responseHeaders: details.responseHeaders };
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
        beforeRequestHandler,
        {
            "urls": [
                "http://*/*",
                "https://*/*",
                "chrome-extension://*/*"
            ],
            "types": [
                "main_frame",
                "sub_frame",
                'stylesheet',
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
        beforeSendHeadersHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        },
        ['blocking', 'requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
        headersReceivedHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        },
        ['blocking', 'responseHeaders']
    );
}
