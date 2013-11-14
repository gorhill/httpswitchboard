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

var globalURI = new URI();

/******************************************************************************/

// Normalize a URL passed by chromium

function normalizeChromiumUrl(url) {
    // remove fragment...
    return globalURI.href(url).fragment('').href();
}

/******************************************************************************/

// extract everything from url

function getUrlParts(url) {
    return URI.parse(url);
}

/******************************************************************************/

// extract hostname from url

function getHostnameFromURL(url) {
    return globalURI.href(url).hostname();
}

/******************************************************************************/

// extract domain from url

function getDomainFromURL(url) {
    if ( !url ) {
        return '';
    }
    return globalURI.href(url).domain();
}

/******************************************************************************/

// extract domain from hostname

function getDomainFromHostname(hostname) {
    return globalURI.hostname(hostname).domain();
}

/******************************************************************************/

// extract domain from url

function getUrlProtocol(url) {
    return globalURI.href(url).protocol();
}

/******************************************************************************/

function getRootURLFromURL(url) {
    var uri = globalURI.href(url);
    return uri.scheme() + '://' + uri.hostname();
}

/******************************************************************************/

// Return the parent domain. For IP address, there is no parent domain.

function getParentHostnameFromHostname(hostname) {
    var uri = globalURI;
    var subdomain = uri.hostname(hostname).subdomain();
    if ( subdomain === '' ) {
        return undefined;
    }
    var domain = uri.domain();
    var dot = subdomain.indexOf('.');
    if ( dot < 0 ) {
        return domain;
    }
    return subdomain.slice(dot+1) + '.' + domain;
}

/******************************************************************************/

// Enable/disable javascript for a specific hostname.

function setJavascriptCallback(windows, hostname, setting) {
    // Need to do this to avoid "You cannot set a preference with scope
    // 'incognito_session_only' when no incognito window is open."
    var i = windows.length;
    while ( i-- ) {
        if ( windows[i].incognito ) {
            chrome.contentSettings.javascript.set({
                scope: 'incognito_session_only',
                primaryPattern: hostname,
                setting: setting
            });
            break;
        }
    }
}

function setJavascript(hostname, state) {
    var hostname = '*://' + hostname + '/*';
    var setting = state ? 'allow' : 'block';
    // https://github.com/gorhill/httpswitchboard/issues/53
    // Until chromium fixes:
    //   https://code.google.com/p/chromium/issues/detail?id=319400
    chrome.contentSettings.javascript.set({
        primaryPattern: hostname,
        setting: setting
    });
    chrome.windows.getAll(function(windows) {
        setJavascriptCallback(windows, hostname, setting);
    });
}

