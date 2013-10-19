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
var frameReplacement = "<!DOCTYPE html> \
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
<link href='{{cssURL}}?domain={{domain}}&t={{now}}' rel='stylesheet' type='text/css'> \
<title>Blocked by HTTPSB</title> \
</head> \
<body title='&ldquo;{{domain}}&rdquo; blocked by HTTP Switchboard'> \
<div>{{domain}}</div> \
<script> \
window.onload = function() { \
 if ( window.getComputedStyle(document.body).visibility === 'hidden' ) { \
  window.location = '{{originalURL}}'; \
 } \
}; \
</script> \
</body> \
</html>";

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

    // Ignore traffic outside tabs
    if ( tabId < 0 ) {
        return;
    }

    var type = details.type;
    var url = normalizeChromiumUrl(details.url);

    // Don't block chrome extensions
    var matches = url.match(/^chrome-extension:\/\/([^\/]+)\/(.+)$/);
    if ( matches ) {
        // If it is HTTP Switchboard's frame-replacement URL, verify that
        // the page that was blacklisted is still blacklisted, and if not,
        // redirect to the previously blacklisted page.
        if ( details.parentFrameId < 0 && matches[1] === chrome.runtime.id ) {
             matches = matches[2].match(/^css\/noop\.css\?domain=([^&]+).*$/);
             if ( matches && whitelisted('main_frame', decodeURIComponent(matches[1])) ) {
                return { "redirectUrl": 'data:text/css;base64,' + btoa('body {visibility:hidden;}') };
            }
        }
        return;
    }

    // Ignore stylesheet requests
    if ( type === 'stylesheet' ) {
        // console.log("HTTPSB > %s @ url=%s", details.type, details.url);
        return;
    }

    // If it's a top frame, bind to a new page stats store
    // TODO: favicon (type = "other") is sent before top main frame...
    var isMainFrame = type === 'main_frame';
    var isRootFrame = isMainFrame && details.parentFrameId < 0;
    if ( isRootFrame ) {
        bindTabToPageStats(tabId, url);
    }

    // block request?
    var domain = getHostnameFromURL(url);
    var block = blacklisted(type, domain);

    // Log request
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats ) {
        recordFromPageStats(pageStats, type, url, block);
    }

    // whitelisted?
    if ( !block ) {
        // console.debug('webRequestHandler > allowing %s from %s', type, domain);
        // if it is a root frame and scripts are blacklisted for the
        // domain, disable scripts for this domain, necessary since inline
        // script tags are not passed through web request handler.
        if ( isMainFrame ) {
            chrome.contentSettings.javascript.set({
                primaryPattern: '*://' + domain + '/*',
                setting: blacklisted('script', domain) ? 'block' : 'allow'
            });
            chrome.contentSettings.plugins.set({
                primaryPattern: '*://' + domain + '/*',
                setting: blacklisted('object', domain) ? 'block' : 'allow'
            });

            // when the tab is updated, we will check if page has at least one
            // script tag, this takes care of inline scripting, which doesn't
            // generate 'script' type web requests.
        }

        // If the request is not blocked, this means the response could contain
        // cookies. Thus, we go cookie hunting for this page url and record all
        // those we find which hit any domain found on this page.
        // No worry, this is async.
        cookieHunterQueue.add(pageStats);

        // Collect stats
        if ( pageStats ) {
            pageStats.requestStats.record(type, false);
        }
        HTTPSB.requestStats.record(type, false);

        // console.log("HTTPSB > %s @ url=%s", details.type, details.url);
        return;
    }

    // blacklisted
    // console.debug('webRequestHandler > blocking %s from %s', type, domain);

    // Collect stats
    if ( pageStats ) {
        pageStats.requestStats.record(type, true);
    }
    HTTPSB.requestStats.record(type, true);

    // remember this blacklisting, used to create a snapshot of the state
    // of the tab, which is useful for smart reload of the page (reload the
    // page only when state effectively change)
    addStateFromTabId(tabId, type, domain);

    // if it's a blacklisted frame, redirect to frame.html
    if ( isMainFrame || type === 'sub_frame' ) {
        var html = frameReplacement;
        html = html.replace(/{{fontUrl}}/g, chrome.runtime.getURL('css/fonts/Roboto_Condensed/RobotoCondensed-Regular.ttf'));
        html = html.replace(/{{cssURL}}/g, chrome.runtime.getURL('css/noop.css'));
        html = html.replace(/{{domain}}/g, domain);
        html = html.replace(/{{originalURL}}/g, url);
        html = html.replace(/{{now}}/g, String(Date.now()));
        var dataUrl = 'data:text/html;base64,' + btoa(html);
        // console.debug('webRequestHandler > redirecting %s to %s', url, q);
        return { "redirectUrl": dataUrl };
    }

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
    var domain = getHostnameFromURL(details.url);
    var blacklistCookie = blacklisted('cookie', domain);
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
