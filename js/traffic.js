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

function webRequestHandler(details) {
    var httpsb = HTTPSB;
    var tabId = details.tabId;

    // Do not ignore traffic outside tabs
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }

    var url = normalizeChromiumUrl(details.url);

    // Don't block chrome extensions
    var matches = url.match(/^chrome-extension:\/\/([^\/]+)\/(.+)$/);
    if ( matches ) {
        // If it is HTTP Switchboard's frame-replacement URL, verify that
        // the page that was blacklisted is still blacklisted, and if not,
        // redirect to the previously blacklisted page.
        if ( details.parentFrameId < 0 && matches[1] === chrome.runtime.id ) {
            matches = matches[2].match(/^css\/noop\.css\?url=([^&]+)&hostname=([^&]+).*$/);
            if ( matches ) {
                var pageURL = decodeURIComponent(matches[1]);
                var hostname = decodeURIComponent(matches[2]);
                if ( httpsb.whitelisted(pageURL, 'main_frame', hostname) ) {
                    chrome.runtime.sendMessage({
                        what: 'gotoURL',
                        tabId: tabId,
                        url: pageURL
                    });
                }
            }
        }
        return;
    }

    // Ignore stylesheet requests
    var type = details.type;
    if ( type === 'stylesheet' ) {
        // console.log("HTTPSB > %s @ url=%s", details.type, details.url);
        return;
    }

    // quickProfiler.start();

    // If it's a top frame, bind to a new page stats store
    // TODO: favicon (type = "other") is sent before top main frame...
    var isMainFrame = type === 'main_frame';
    var isRootFrame = isMainFrame && details.parentFrameId < 0;
    if ( isRootFrame ) {
        bindTabToPageStats(tabId, url);
    }

    // block request?
    var hostname = getHostnameFromURL(url);
    var pageStats = pageStatsFromTabId(tabId);
    var pageURL = pageUrlFromPageStats(pageStats) || '*';
    var block;

    // https://github.com/gorhill/httpswitchboard/issues/27
    if ( tabId !== httpsb.behindTheSceneTabId || httpsb.userSettings.processBehindTheSceneRequests ) {
        block = httpsb.blacklisted(pageURL, type, hostname);
    } else {
        block = false;
    }

    // Log request
    if ( pageStats ) {
        // These counters are used so that icon give an overview of ratio
        // allowed/blocked.
        if ( isRootFrame ) {
            pageStats.perLoadAllowedRequestCount =
            pageStats.perLoadBlockedRequestCount = 0;
        }
        pageStats.recordRequest(type, url, block);
    }

    // quickProfiler.stop('webRequestHandler | evaluate&record');

    // rhill 2013-10-20:
    // https://github.com/gorhill/httpswitchboard/issues/19
    if ( pageStats && pageStats.ignore ) {
        return;
    }

    // if it is a frame and scripts are blacklisted for the
    // hostname, disable scripts for this hostname, necessary since inline
    // script tags are not passed through web request handler.
    if ( isMainFrame ) {
        chrome.contentSettings.javascript.set({
            primaryPattern: '*://' + hostname + '/*',
            setting: httpsb.blacklisted(pageURL, 'script', hostname) ? 'block' : 'allow'
            });
        // when the tab is updated, we will check if page has at least one
        // script tag, this takes care of inline scripting, which doesn't
        // generate 'script' type web requests.
    }

    // whitelisted?
    if ( !block ) {
        // console.debug('webRequestHandler > allowing %s from %s', type, hostname);
        // If the request is not blocked, this means the response could contain
        // cookies. Thus, we go cookie hunting for this page url and record all
        // those we find which hit any hostname found on this page.
        // No worry, this is async.
        cookieHunter.record(pageStats);

        // Collect stats
        httpsb.requestStats.record(type, false);

        // quickProfiler.stop('webRequestHandler');
        // console.log("HTTPSB > %s @ url=%s", details.type, details.url);
        return;
    }

    // blacklisted
    // console.debug('webRequestHandler > blocking %s from %s', type, hostname);

    // Collect stats
    httpsb.requestStats.record(type, true);

    // If it's a blacklisted frame, redirect to frame.html
    var html, dataURI;
    if ( isRootFrame ) {
        html = rootFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, chrome.runtime.getURL('css/fonts/Roboto_Condensed/RobotoCondensed-Regular.ttf'));
        html = html.replace(/{{cssURL}}/g, chrome.runtime.getURL('css/noop.css'));
        html = html.replace(/{{hostname}}/g, encodeURIComponent(hostname));
        html = html.replace(/{{originalURL}}/g, encodeURIComponent(url));
        html = html.replace(/{{now}}/g, String(Date.now()));
        dataURI = 'data:text/html;base64,' + btoa(html);
        return { "redirectUrl": dataURI };
    } else if ( isMainFrame || type === 'sub_frame' ) {
        html = subFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, chrome.runtime.getURL('css/fonts/Roboto_Condensed/RobotoCondensed-Regular.ttf'));
        html = html.replace(/{{hostname}}/g, hostname);
        dataURI = 'data:text/html;base64,' + btoa(html);
        return { "redirectUrl": dataURI };
    }

    // quickProfiler.stop('webRequestHandler');

    return { "cancel": true };
}

/******************************************************************************/

// This is to handle cookies leaving the browser.

function webHeaderRequestHandler(details) {

    // Ignore traffic outside tabs
    if ( details.tabId < 0 ) {
        return;
    }

    // Any cookie in there?
    var hostname = getHostnameFromURL(details.url);
    var blacklistCookie = HTTPSB.blacklisted(pageUrlFromTabId(details.tabId), 'cookie', hostname);
    var headers = details.requestHeaders;
    var i = details.requestHeaders.length;
    while ( i-- ) {
        if ( headers[i].name.toLowerCase() !== 'cookie' ) {
            continue;
        }
        if ( blacklistCookie ) {
            // console.debug('HTTP Switchboard > foiled browser attempt to send cookie(s) to %s', details.url);
            headers.splice(i, 1);
        }
    }

    if ( blacklistCookie ) {
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
        webHeaderRequestHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        },
        ['blocking', 'requestHeaders']
    );

    HTTPSB.webRequestHandler = true;
}
