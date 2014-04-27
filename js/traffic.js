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


/******************************************************************************/

// Start isolation from global scope

(function() {

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

var subFrameReplacement = "<!DOCTYPE html>\
<html>\
<head>\
<style>\
@font-face{\
font-family:'httpsb';\
font-style:normal;\
font-weight:400;\
src:local('httpsb'), url('{{fontUrl}}') format('truetype');\
}\
body{\
margin:0;\
border:0;\
padding:0;\
font:13px httpsb,sans-serif;\
text-align:center;\
}\
#bg{\
position:absolute;\
top:0;\
right:0;\
bottom:0;\
left:0;\
background:transparent url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAjCAYAAAAe2bNZAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QkOFgcvc4DETwAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAACGSURBVFjD7ZZBCsAgEAMT6f+/nJ5arYcqiKtIPAaFYR2DFCAAgEQ8iwzLCLxZWglSZgKUdgHJk2kdLEY5C4QAUxeIFOINfwUOBGkLPBnkAIEDQPoEDiw+uoGHBQ4ovv4GnvTMS4EvC+wvhBvYAltgC2yBLbAFPlTgvKG6vxXZB6QOl2S7gNw6ktgOp+IH7wAAAABJRU5ErkJggg==') repeat;\
opacity:{{opacity}};\
}\
#bgov{\
border:1px dotted #c00;\
position:absolute;\
top:0;\
right:0;\
bottom:0;\
left:0;\
z-index:1;\
opacity:{{opacity}};\
}\
#fg{\
padding:0 2px;\
display:inline-block;\
position:relative;\
z-index:9;\
color:white;\
background:#c00;\
}\
</style>\
<title>Blocked by HTTPSB</title>\
</head>\
<body title='&ldquo;{{hostname}}&rdquo; frame\nblocked by HTTP Switchboard'>\
<div id='bg'></div>\
<div id='bgov'></div>\
<span id='fg'>{{hostname}}</span>\
</body>\
</html>";

/******************************************************************************/

// If it is HTTP Switchboard's root frame replacement URL, verify that
// the page that was blacklisted is still blacklisted, and if not,
// redirect to the previously blacklisted page.

var onBeforeChromeExtensionRequestHandler = function(details) {
    var requestURL = details.url;

    // console.debug('onBeforeChromeExtensionRequestHandler()> "%s": %o', details.url, details);

    // Is it me?
    if ( requestURL.indexOf(chrome.runtime.id) < 0 ) {
        return;
    }

    // Is it a top frame?
    if ( details.parentFrameId >= 0 ) {
        return;
    }

    // Is it the noop css file?
    var httpsb = HTTPSB;
    if ( requestURL.indexOf(httpsb.noopCSSURL) !== 0 ) {
        return;
    }

    // rhill 2013-12-10: Avoid regex whenever a faster indexOf() can be used:
    // here we can use fast indexOf() as a first filter -- which is executed
    // for every single request (so speed matters).
    var matches = requestURL.match(/url=([^&]+)&hostname=([^&]+)/);
    if ( !matches ) {
        return;
    }

    // Is the target page still blacklisted?
    var pageURL = decodeURIComponent(matches[1]);
    var hostname = decodeURIComponent(matches[2]);
    if ( httpsb.blacklisted(pageURL, 'main_frame', hostname) ) {
        return;
    }

    // Reload to cancel jailing
    chrome.runtime.sendMessage({
        what: 'gotoURL',
        tabId: details.tabId,
        url: pageURL
    });
};

/******************************************************************************/

// Intercept and filter web requests according to white and black lists.

var onBeforeRootFrameRequestHandler = function(details) {
    var httpsb = HTTPSB;
    var httpsburi = httpsb.URI.set(details.url);
    var requestURL = httpsburi.normalizedURI();
    var requestHostname = httpsburi.hostname;

    // Do not ignore traffic outside tabs
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }
    // It's a root frame, bind to a new page stats store
    else {
        httpsb.bindTabToPageStats(tabId, requestURL);
    }

    var pageStats = httpsb.pageStatsFromTabId(tabId);
    var pageURL = httpsb.pageUrlFromPageStats(pageStats);
    var block = httpsb.blacklisted(pageURL, 'main_frame', requestHostname);

    // console.debug('onBeforeRequestHandler()> block=%s "%s": %o', block, details.url, details);

    // Collect global stats
    httpsb.requestStats.record('main_frame', block);

    // whitelisted?
    if ( !block ) {
        // rhill 2013-11-07: Senseless to do this for behind-the-scene requests.
        // rhill 2013-12-03: Do this here only for root frames.
        if ( tabId !== httpsb.behindTheSceneTabId ) {
            cookieHunter.recordPageCookiesAsync(pageStats);
        }
        return;
    }

    // blacklisted

    // rhill 2014-01-15: Delay logging of non-blocked top `main_frame`
    // requests, in order to ensure any potential redirects is reported
    // in proper chronological order.
    // https://github.com/gorhill/httpswitchboard/issues/112
    pageStats.recordRequest('main_frame', requestURL, block);

    // If it's a blacklisted frame, redirect to frame.html
    // rhill 2013-11-05: The root frame contains a link to noop.css, this
    // allows to later check whether the root frame has been unblocked by the
    // user, in which case we are able to force a reload using a redirect.
    var html = rootFrameReplacement;
    html = html.replace(/{{fontUrl}}/g, httpsb.fontCSSURL);
    html = html.replace(/{{cssURL}}/g, httpsb.noopCSSURL);
    html = html.replace(/{{hostname}}/g, encodeURIComponent(requestHostname));
    html = html.replace(/{{originalURL}}/g, encodeURIComponent(requestURL));
    html = html.replace(/{{now}}/g, String(Date.now()));
    var dataURI = 'data:text/html;base64,' + btoa(html);
    // quickProfiler.stop('onBeforeRequestHandler');

    return { "redirectUrl": dataURI };
};

/******************************************************************************/

// Intercept and filter web requests according to white and black lists.

var onBeforeRequestHandler = function(details) {
    var httpsb = HTTPSB;
    var httpsburi = httpsb.URI;
    var requestURL = details.url;
    var requestScheme = httpsburi.schemeFromURI(requestURL);

    // rhill 2014-02-17: Ignore 'filesystem:': this can happen when listening
    // to 'chrome-extension://'.
    if ( requestScheme === 'filesystem' ) {
        return;
    }

    // Don't block chrome extensions
    if ( requestScheme === 'chrome-extension' ) {
        return onBeforeChromeExtensionRequestHandler(details);
    }

    // Ignore non-http schemes
    if ( requestScheme.indexOf('http') !== 0 ) {
        return;
    }

    var type = details.type;

    if ( type === 'main_frame' && details.parentFrameId < 0 ) {
        return onBeforeRootFrameRequestHandler(details);
    }

    // console.debug('onBeforeRequestHandler()> "%s": %o', details.url, details);

    // Do not block myself from updating assets
    // https://github.com/gorhill/httpswitchboard/issues/202
    if ( requestURL.indexOf(httpsb.projectServerRoot) === 0 ) {
        return;
    }

    // quickProfiler.start();

    // Normalizing will get rid of the fragment part
    requestURL = httpsburi.set(requestURL).normalizedURI();

    var requestHostname = httpsburi.hostname;
    var requestPath = httpsburi.path;

    // Do not ignore traffic outside tabs
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }

    // Re-classify orphan HTTP requests as behind-the-scene requests. There is
    // not much else which can be done, because there are URLs
    // which cannot be handled by HTTP Switchboard, i.e. `opera://startpage`,
    // as this would lead to complications with no obvious solution, like how
    // to scope on unknown scheme? Etc.
    // https://github.com/gorhill/httpswitchboard/issues/191
    // https://github.com/gorhill/httpswitchboard/issues/91#issuecomment-37180275
    var pageStats = httpsb.pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        tabId = httpsb.behindTheSceneTabId;
        pageStats = httpsb.pageStatsFromTabId(tabId);
    }
    var pageURL = httpsb.pageUrlFromPageStats(pageStats);

    // rhill 2013-12-15:
    // Try to transpose generic `other` category into something more
    // meaningful.
    if ( type === 'other' ) {
        type = httpsb.transposeType(type, requestPath);
    }

    // Block request?
    var scopeKey = httpsb.temporaryScopeKeyFromPageURL(pageURL);
    var block = httpsb.evaluateFromScopeKey(scopeKey, type, requestHostname).charAt(0) === 'r';
    var reason;

    // Block using ABP filters?
    if ( block === false ) {
        var scope = httpsb.temporaryScopeFromScopeKey(scopeKey);
        if ( scope.abpFiltering === true ) {
            block = httpsb.abpFilters.matchString(requestURL, pageStats.pageDomain, requestHostname);
            if ( block !== false ) {
                pageStats.abpBlockCount += 1;
                httpsb.abpBlockCount += 1;
                reason = 'ABP filter: ' + block;
            }
        }
    }

    // Page stats
    pageStats.recordRequest(type, requestURL, block, reason);

    // Global stats
    httpsb.requestStats.record(type, block);

    // whitelisted?
    if ( !block ) {
        // console.debug('onBeforeRequestHandler()> ALLOW "%s": %o', details.url, details);
        // quickProfiler.stop('onBeforeRequestHandler');
        return;
    }

    // blacklisted
    // console.debug('onBeforeRequestHandler()> BLOCK "%s": %o', details.url, details);

    // If it's a blacklisted frame, redirect to frame.html
    // rhill 2013-11-05: The root frame contains a link to noop.css, this
    // allows to later check whether the root frame has been unblocked by the
    // user, in which case we are able to force a reload using a redirect.
    if ( type === 'sub_frame' ) {
        var html = subFrameReplacement
            .replace(/{{fontUrl}}/g, httpsb.fontCSSURL)
            .replace(/{{hostname}}/g, requestHostname)
            .replace(/{{opacity}}/g, httpsb.userSettings.subframeOpacity.toFixed(2));
        // quickProfiler.stop('onBeforeRequestHandler');
        return { 'redirectUrl': 'data:text/html,' + encodeURIComponent(html) };
    }

    // quickProfiler.stop('onBeforeRequestHandler');

    return { "cancel": true };
};

/******************************************************************************/

// This is to handle cookies leaving the browser.

var onBeforeSendHeadersHandler = function(details) {

    // console.debug('onBeforeSendHeadersHandler()> "%s": %o', details.url, details);

    var httpsb = HTTPSB;
    var tabId = details.tabId;

    // Re-classify orphan HTTP requests as behind-the-scene requests. There is
    // not much else which can be done, because there are URLs
    // which cannot be handled by HTTP Switchboard, i.e. `opera://startpage`,
    // as this would lead to complications with no obvious solution, like how
    // to scope on unknown scheme? Etc.
    // https://github.com/gorhill/httpswitchboard/issues/191
    // https://github.com/gorhill/httpswitchboard/issues/91#issuecomment-37180275
    var pageStats = httpsb.pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        tabId = httpsb.behindTheSceneTabId;
        pageStats = httpsb.pageStatsFromTabId(tabId);
    }

    var pageURL = httpsb.pageUrlFromPageStats(pageStats);
    var reqHostname = httpsb.URI.hostnameFromURI(details.url);
    var changed = false;

    if ( httpsb.blacklisted(pageURL, 'cookie', reqHostname) ) {
        changed = foilCookieHeaders(httpsb, details) || changed;
    }

    if ( httpsb.userSettings.processReferer && httpsb.blacklisted(pageURL, '*', reqHostname) ) {
        changed = foilRefererHeaders(httpsb, reqHostname, details) || changed;
    }

    if ( httpsb.userSettings.spoofUserAgent ) {
        changed = foilUserAgent(httpsb, details) || changed;
    }

    if ( changed ) {
        // console.debug('onBeforeSendHeadersHandler()> CHANGED "%s": %o', details.url, details);
        return { requestHeaders: details.requestHeaders };
    }
};

/******************************************************************************/

var foilCookieHeaders = function(httpsb, details) {
    var changed = false;
    var headers = details.requestHeaders;
    var header;
    var i = headers.length;
    while ( i-- ) {
        header = headers[i];
        if ( header.name.toLowerCase() !== 'cookie' ) {
            continue;
        }
        // console.debug('foilCookieHeaders()> foiled browser attempt to send cookie(s) to "%s"', details.url);
        headers.splice(i, 1);
        httpsb.cookieHeaderFoiledCounter++;
        changed = true;
    }
    return changed;
};

/******************************************************************************/

var foilRefererHeaders = function(httpsb, toHostname, details) {
    var changed = false;
    var headers = details.requestHeaders;
    var header;
    var fromDomain, toDomain;
    var i = headers.length;
    while ( i-- ) {
        header = headers[i];
        if ( header.name.toLowerCase() !== 'referer' ) {
            continue;
        }
        fromDomain = httpsb.URI.domainFromURI(header.value);
        if ( !toDomain ) {
            toDomain = httpsb.URI.domainFromHostname(toHostname);
        }
        if ( toDomain === fromDomain ) {
            continue;
        }
        // console.debug('foilRefererHeaders()> nulling referer "%s" for "%s"', fromDomain, toDomain);
        headers[i].value = '';
        httpsb.refererHeaderFoiledCounter++;
        changed = true;
    }
    return changed;
};

/******************************************************************************/

var foilUserAgent = function(httpsb, details) {
    var changed = false;
    var headers = details.requestHeaders;
    var header;
    var i = 0;
    while ( header = headers[i] ) {
        if ( header.name.toLowerCase() === 'user-agent' ) {
            header.value = httpsb.userAgentReplaceStr;
            return true; // Assuming only one `user-agent` entry
        }
        i += 1;
    }
    return false;
};

/******************************************************************************/

// To prevent inline javascript from being executed.

// Prevent inline scripting using `Content-Security-Policy`:
// https://dvcs.w3.org/hg/content-security-policy/raw-file/tip/csp-specification.dev.html

// This fixes:
// https://github.com/gorhill/httpswitchboard/issues/35

var onHeadersReceived = function(details) {

    // console.debug('onHeadersReceived()> "%s": %o', details.url, details);

    // Ignore schemes other than 'http...'
    if ( details.url.indexOf('http') !== 0 ) {
        return;
    }

    var requestType = details.type;
    if ( requestType === 'sub_frame' ) {
        return onSubDocHeadersReceived(details);
    }
    if ( requestType === 'main_frame' ) {
        return onMainDocHeadersReceived(details);
    }
};

/******************************************************************************/

var onMainDocHeadersReceived = function(details) {

    // console.debug('onMainDocHeadersReceived()> "%s": %o', details.url, details);

    var httpsb = HTTPSB;

    // Do not ignore traffic outside tabs.
    // https://github.com/gorhill/httpswitchboard/issues/91#issuecomment-37180275
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }

    var httpsburi = httpsb.URI.set(details.url);
    var requestURL = httpsburi.normalizedURI();
    var requestScheme = httpsburi.scheme;
    var requestHostname = httpsburi.hostname;

    // rhill 2013-12-07:
    // Apparently in Opera, onBeforeRequest() is triggered while the
    // URL is not yet bound to a tab (-1), which caused the code here
    // to not be able to lookup the pageStats. So let the code here bind
    // the page to a tab if not done yet.
    // https://github.com/gorhill/httpswitchboard/issues/75
    httpsb.bindTabToPageStats(tabId, requestURL);

    // Re-classify orphan HTTP requests as behind-the-scene requests. There is
    // not much else which can be done, because there are URLs
    // which cannot be handled by HTTP Switchboard, i.e. `opera://startpage`,
    // as this would lead to complications with no obvious solution, like how
    // to scope on unknown scheme? Etc.
    // https://github.com/gorhill/httpswitchboard/issues/191
    // https://github.com/gorhill/httpswitchboard/issues/91#issuecomment-37180275
    var pageStats = httpsb.pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        tabId = httpsb.behindTheSceneTabId;
        pageStats = httpsb.pageStatsFromTabId(tabId);
    }

    var headers = details.responseHeaders;

    // Simplify code paths by splitting func in two different handlers, one
    // for main docs, one for sub docs.
    // rhill 2014-01-15: Report redirects.
    // https://github.com/gorhill/httpswitchboard/issues/112
    // rhill 2014-02-10: Handle all redirects.
    // https://github.com/gorhill/httpswitchboard/issues/188
    if ( /\s+30[12378]\s+/.test(details.statusLine) ) {
        var i = headerIndexFromName('location', headers);
        if ( i >= 0 ) {
            // rhill 2014-01-20: Be ready to handle relative URLs.
            // https://github.com/gorhill/httpswitchboard/issues/162
            var locationURL = httpsburi.set(headers[i].value.trim()).normalizedURI();
            if ( httpsburi.authority === '' ) {
                locationURL = requestScheme + '://' + requestHostname + httpsburi.path;
            }
            httpsb.redirectRequests[locationURL] = requestURL;
        }
        // console.debug('onMainDocHeadersReceived()> redirect "%s" to "%s"', requestURL, headers[i].value);
    }

    // rhill 2014-01-11: Auto-scope and/or auto-whitelist only when the
    // `main_frame` object is really received (status = 200 OK), i.e. avoid
    // redirection, because the final URL might differ. This ensures proper
    // scope is looked-up before auto-site-scoping and/or auto-whitelisting.
    // https://github.com/gorhill/httpswitchboard/issues/119
    if ( details.statusLine.indexOf(' 200') > 0 ) {
        // rhill 2014-01-15: Report redirects if any.
        // https://github.com/gorhill/httpswitchboard/issues/112
        var mainFrameStack = [requestURL];
        var destinationURL = requestURL;
        var sourceURL;
        while ( sourceURL = httpsb.redirectRequests[destinationURL] ) {
            mainFrameStack.push(sourceURL);
            delete httpsb.redirectRequests[destinationURL];
            destinationURL = sourceURL;
        }

        while ( destinationURL = mainFrameStack.pop() ) {
            pageStats.recordRequest('main_frame', destinationURL, false);
        }

        // rhill 2014-01-10: Auto-site scope?
        if ( httpsb.userSettings.autoCreateScope !== '' ) {
            httpsb.autoCreateTemporarySiteScope(requestURL);
        }
        // rhill 2013-12-23: Auto-whitelist page domain?
        if ( httpsb.userSettings.autoWhitelistPageDomain ) {
            httpsb.autoWhitelistTemporarilyPageDomain(requestURL);
        }
    }

    // Evaluate
    if ( httpsb.whitelisted(httpsb.pageUrlFromPageStats(pageStats), 'script', requestHostname) ) {
        // https://github.com/gorhill/httpswitchboard/issues/181
        pageStats.pageScriptBlocked = false;
        return;
    }

    // https://github.com/gorhill/httpswitchboard/issues/181
    pageStats.pageScriptBlocked = true;

    // If javascript not allowed, say so through a `Content-Security-Policy`
    // directive.
    // console.debug('onMainDocHeadersReceived()> PAGE CSP "%s": %o', details.url, details);
    headers.push({
        'name': 'Content-Security-Policy',
        'value': "script-src 'none'"
    });

    return { responseHeaders: headers };
};

/******************************************************************************/

var onSubDocHeadersReceived = function(details) {

    // console.debug('onSubDocHeadersReceived()> "%s": %o', details.url, details);

    var httpsb = HTTPSB;

    // Do not ignore traffic outside tabs.
    // https://github.com/gorhill/httpswitchboard/issues/91#issuecomment-37180275
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }

    // Re-classify orphan HTTP requests as behind-the-scene requests. There is
    // not much else which can be done, because there are URLs
    // which cannot be handled by HTTP Switchboard, i.e. `opera://startpage`,
    // as this would lead to complications with no obvious solution, like how
    // to scope on unknown scheme? Etc.
    // https://github.com/gorhill/httpswitchboard/issues/191
    // https://github.com/gorhill/httpswitchboard/issues/91#issuecomment-37180275
    var pageStats = httpsb.pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        tabId = httpsb.behindTheSceneTabId;
        pageStats = httpsb.pageStatsFromTabId(tabId);
    }

    // Evaluate
    if ( httpsb.whitelisted(httpsb.pageUrlFromPageStats(pageStats), 'script', httpsb.URI.set(details.url).hostname) ) {
        return;
    }

    // If javascript not allowed, say so through a `Content-Security-Policy`
    // directive.

    // For inline javascript within iframes, we need to sandbox.
    // https://github.com/gorhill/httpswitchboard/issues/73
    // Now because sandbox cancels all permissions, this means
    // not just javascript is disabled. To avoid negative side
    // effects, I allow some other permissions, but...
    // TODO: Reuse CSP `sandbox` directive if it's already in the
    // headers (strip out `allow-scripts` if present),
    // and find out if the `sandbox` in the header interfere with a
    // `sandbox` attribute which might be present on the iframe.
    // console.debug('onSubDocHeadersReceived()> FRAME CSP "%s": %o, scope="%s"', details.url, details, pageURL);
    details.responseHeaders.push({
        'name': 'Content-Security-Policy',
        'value': 'sandbox allow-forms allow-same-origin'
    });

    return { responseHeaders: details.responseHeaders };
};

/******************************************************************************/

// As per Chrome API doc, webRequest.onErrorOccurred event is the last
// one called in the sequence of webRequest events.
// http://developer.chrome.com/extensions/webRequest.html

var onErrorOccurredHandler = function(details) {
    // console.debug('onErrorOccurred()> "%s": %o', details.url, details);

    // Ignore all that is not a main document
    if ( details.type !== 'main_frame' || details.parentFrameId >= 0 ) {
        return;
    }

    var httpsb = HTTPSB;
    var pageStats = httpsb.pageStatsFromPageUrl(details.url);
    if ( !pageStats ) {
        return;
    }

    // rhill 2014-01-28: Unwind the stack of redirects if any. Chromium will
    // emit an error when a web page redirects apparently endlessly, so
    //  we need to unravel and report all these redirects upon error.
    // https://github.com/gorhill/httpswitchboard/issues/171
    var requestURL = httpsb.URI.set(details.url).normalizedURI();
    var mainFrameStack = [requestURL];
    var destinationURL = requestURL;
    var sourceURL;
    while ( sourceURL = httpsb.redirectRequests[destinationURL] ) {
        mainFrameStack.push(sourceURL);
        delete httpsb.redirectRequests[destinationURL];
        destinationURL = sourceURL;
    }

    while ( destinationURL = mainFrameStack.pop() ) {
        pageStats.recordRequest('main_frame', destinationURL, false);
    }
};

/******************************************************************************/

// Caller must ensure headerName is normalized to lower case.

var headerIndexFromName = function(headerName, headers) {
    var i = headers.length;
    while ( i-- ) {
        if ( headers[i].name.toLowerCase() === headerName ) {
            return i;
        }
    }
    return -1;
};

/******************************************************************************/

var onMessageHandler = function(request) {
    if ( request && request.what && request.what === 'startWebRequestHandler' ) {
        startWebRequestHandler(request.from);
    }
};

var webRequestHandlerRequirements = {
    'tabsBound': 0,
    'listsLoaded': 0
};

var startWebRequestHandler = function(from) {
    // Do not launch traffic handler if not all requirements are fullfilled.
    // This takes care of pages being blocked when chromium is launched
    // because there is no whitelist loaded and default is to block everything.
    var o = webRequestHandlerRequirements;
    o[from] = 1;
    if ( Object.keys(o).map(function(k){return o[k];}).join().search('0') >= 0 ) {
        return;
    }

    chrome.runtime.onMessage.removeListener(onMessageHandler);

    chrome.webRequest.onBeforeRequest.addListener(
        onBeforeRequestHandler,
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

    console.log('HTTP Switchboard> Beginning to intercept net requests at %s', (new Date()).toISOString());

    chrome.webRequest.onBeforeSendHeaders.addListener(
        onBeforeSendHeadersHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        },
        ['blocking', 'requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
        onHeadersReceived,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        },
        ['blocking', 'responseHeaders']
    );

    chrome.webRequest.onErrorOccurred.addListener(
        onErrorOccurredHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        }
    );
};

chrome.runtime.onMessage.addListener(onMessageHandler);

/******************************************************************************/

// End isolation from global scope

})();

/******************************************************************************/

