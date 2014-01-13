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

    // console.debug('beforeRequestHandler()> "%s"', details.url);

    var canEvaluate = true;
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

    // If it's a root frame or an app, bind to a new page stats store
    var type = details.type;
    var isSubFrame = type === 'sub_frame';
    var isMainFrame = type === 'main_frame';
    var isWebPage = isMainFrame && details.parentFrameId < 0;
    var pageStats = pageStatsFromTabId(tabId);

    // rhill 2013-12-16: Do not interfere with apps. For now the heuristic is:
    // If we have a `sub_frame` and no pageStats store, this is an app.
    // https://github.com/gorhill/httpswitchboard/issues/91
    var isApp = isSubFrame && !pageStats;

    if ( isWebPage || isApp ) {
        bindTabToPageStats(tabId, url);
    }

    pageStats = pageStatsFromTabId(tabId);

    // rhill 2013-12-16: I don't remember... Can pageStats still be nil at
    // this point?
    // Answer: Yes. Requests might still be dispatched after
    // closing a tab it appears.
    // if ( !pageStats ) {
    //    console.error('beforeRequestHandler() > no pageStats: %o', details);
    // }

    if ( isApp && pageStats ) {
        pageStats.ignore = true;
    }

    hostname = uriTools.hostnameFromURI(url);
    pageURL = pageUrlFromPageStats(pageStats);

    // rhill 2013-12-15:
    // Try to transpose generic `other` category into something more
    // meaningful.
    if ( type === 'other' ) {
        type = httpsb.transposeType(type, url);
    }

    if ( pageStats && pageStats.ignore ) {
        canEvaluate = false;
    }

    // Block request?
    // https://github.com/gorhill/httpswitchboard/issues/27
    var block = false;
    if ( canEvaluate ) {
        block = httpsb.blacklisted(pageURL, type, hostname);
    }

    if ( pageStats ) {
        pageStats.recordRequest(type, url, block);
    }

    // Collect global stats
    httpsb.requestStats.record(type, block);

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
        if ( isWebPage && tabId !== httpsb.behindTheSceneTabId ) {
            cookieHunter.recordPageCookiesAsync(pageStats);
        }

        // quickProfiler.stop('beforeRequestHandler');
        return;
    }

    // blacklisted
    // console.debug('beforeRequestHandler > blocking %s from %s', type, hostname);

    // If it's a blacklisted frame, redirect to frame.html
    // rhill 2013-11-05: The root frame contains a link to noop.css, this
    // allows to later check whether the root frame has been unblocked by the
    // user, in which case we are able to force a reload using a redirect.
    var html, dataURI;
    if ( isWebPage ) {
        html = rootFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, httpsb.fontCSSURL);
        html = html.replace(/{{cssURL}}/g, httpsb.noopCSSURL);
        html = html.replace(/{{hostname}}/g, encodeURIComponent(hostname));
        html = html.replace(/{{originalURL}}/g, encodeURIComponent(url));
        html = html.replace(/{{now}}/g, String(Date.now()));
        dataURI = 'data:text/html;base64,' + btoa(html);
        // quickProfiler.stop('beforeRequestHandler');
        return { "redirectUrl": dataURI };
    } else if ( isSubFrame ) {
        html = subFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, httpsb.fontCSSURL);
        html = html.replace(/{{hostname}}/g, hostname);
        dataURI = 'data:text/html;base64,' + btoa(html);
        // quickProfiler.stop('beforeRequestHandler');
        return { "redirectUrl": dataURI };
    }

    // quickProfiler.stop('beforeRequestHandler');
    return { "cancel": true };
}

/******************************************************************************/

// This is to handle cookies leaving the browser.

function beforeSendHeadersHandler(details) {

    var httpsb = HTTPSB;

    // Do not ignore traffic outside tabs
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }

    // rhill 2013-12-16: do not interfere with apps.
    // https://github.com/gorhill/httpswitchboard/issues/91
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats && pageStats.ignore ) {
        return;
    }

    // Any cookie in there?
    var ut = uriTools;
    var hostname = ut.hostnameFromURI(details.url);
    var pageURL = pageUrlFromTabId(tabId);
    var blacklistCookie = httpsb.blacklisted(pageURL, 'cookie', hostname);
    var processReferer = httpsb.userSettings.processReferer;

    if ( !blacklistCookie && !processReferer ) {
        return;
    }

    var headerName, fromDomain, toDomain;
    var headers = details.requestHeaders;
    var i = headers.length;
    var changed = false;

    // I am no fan of deeply indented code paths, but for performance reasons
    // I will tolerate it here. Thing is, here it is best to reuse as much
    // already computed data as possible. (also, not sure if 'switch' would be
    // a gain here, so far there is only two cases to treat).
    while ( i-- ) {
        headerName = headers[i].name.toLowerCase();
        if ( headerName === 'referer' ) {
            if ( processReferer ) {
                fromDomain = ut.domainFromURI(headers[i].value);
                toDomain = ut.domainFromHostname(hostname);
                if ( fromDomain !== toDomain ) {
                    if ( httpsb.blacklisted(pageURL, '*', hostname) ) {
                        // console.debug('beforeSendHeadersHandler()> nulling referer "%s" for "%s"', fromDomain, toDomain);
                        headers[i].value = '';
                        httpsb.refererHeaderFoiledCounter++;
                        changed = true;
                    }
                }
            }
            continue;
        }
        if ( headerName === 'cookie' ) {
            if ( blacklistCookie ) {
                // console.debug('HTTP Switchboard > foiled browser attempt to send cookie(s) to %o', details);
                headers.splice(i, 1);
                httpsb.cookieHeaderFoiledCounter++;
                changed = true;
            }
            continue;
        }
    }

    if ( changed ) {
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

    // console.debug('headersReceivedHandler()> "%s": "%s"', details.url, details.statusLine);

    // Ignore schemes other than 'http...'
    if ( details.url.indexOf('http') !== 0 ) {
        return;
    }

    // Ignore anything which is not an html doc
    if ( details.type !== 'main_frame' ) {
        return;
    }
    var isWebPage = details.parentFrameId < 0;

    // rhill 2013-12-08: ALWAYS evaluate for javascript, do not rely too much
    // on the top page to be bound to a tab.
    // https://github.com/gorhill/httpswitchboard/issues/75
    var tabId = details.tabId;
    var pageURL = uriTools.normalizeURI(details.url);
    var httpsb = HTTPSB;

    // rhill 2013-12-07:
    // Apparently in Opera, onBeforeRequest() is triggered while the
    // URL is not yet bound to a tab (-1), which caused the code here
    // to not be able to lookup the pageStats. So let the code here bind
    // the page to a tab if not done yet.
    // https://github.com/gorhill/httpswitchboard/issues/75
    if ( tabId >= 0 && isWebPage ) {
        bindTabToPageStats(tabId, pageURL);
    }
    var pageStats = pageStatsFromTabId(tabId);

    // rhill 2014-01-11: Auto-scope and/or auto-whitelist only when the
    // `main_frame` object is really received (status = 200 OK), i.e. avoid
    // redirection, because the final URL might differ. This ensures proper
    // scope is looked-up before auto-site-scoping and/or auto-whitelisting.
    // https://github.com/gorhill/httpswitchboard/issues/119
    if ( isWebPage && details.statusLine.indexOf(' 200') > 0 ) {
        // rhill 2014-01-10: Auto-site scope?
        if ( httpsb.userSettings.autoCreateSiteScope ) {
            httpsb.autoCreateTemporarySiteScope(pageURL);
        }
        // rhill 2013-12-23: Auto-whitelist page domain?
        if ( httpsb.userSettings.autoWhitelistPageDomain ) {
            httpsb.autoWhitelistTemporarilyPageDomain(pageURL);
        }
    }

    // Evaluate according to scope
    // rhill 2013-12-07:
    // Worst case scenario, if no pageURL can be found for this
    // request, use global scope to evaluate whether it should be blocked
    // or allowed.
    // https://github.com/gorhill/httpswitchboard/issues/75
    var pageURL = pageStats ? pageUrlFromPageStats(pageStats) : '*';
    var hostname = uriTools.hostnameFromURI(details.url);

    if ( httpsb.whitelisted(pageURL, 'script', hostname) ) {
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
