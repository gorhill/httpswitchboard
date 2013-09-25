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

// to easily parse urls
var urlParser = document.createElement('a');

/******************************************************************************/

// parse a url and return only interesting parts

function getUrlParts(url) {
    var parts = { protocol: "", domain: ""};
    // Ref.: https://gist.github.com/jlong/2428561
    urlParser.href = url;
    parts.protocol = urlParser.protocol;
    // TODO: create user settings for this (`-8`)
    var matches = urlParser.hostname.split('.').slice(-8);
    if ( matches.length ) {
        parts.domain = matches.join('.');
    }
    return parts;
}

/******************************************************************************/

// extract domain from url

function getUrlDomain(url) {
    urlParser.href = url;
    return urlParser.hostname;
}

/******************************************************************************/

// extract domain from url

function getUrlProtocol(url) {
    urlParser.href = url;
    return urlParser.protocol;
}

/******************************************************************************/

function getUrlPath(url) {
    urlParser.href = url;
    var path = urlParser.protocol + '//' + urlParser.host + '/' + urlParser.pathname
    var i = path.lastIndexOf('/');
    if ( i >= 0 ) {
        path = path.slice(0, i);
    }
    return path;
}

/******************************************************************************/

function getUrlHrefRoot(url) {
    urlParser.href = url;
    return urlParser.protocol + '//' + urlParser.host;
}

/******************************************************************************/

function getUrlHrefPath(url) {
    urlParser.href = url;
    var path = urlParser.protocol + '//' + urlParser.host + '/' + urlParser.pathname
    var i = path.lastIndexOf('/');
    if ( i >= 0 ) {
        path = path.slice(0, i);
    }
    return path;
}

/******************************************************************************/

function removeCookiesCallback(details) {
    if ( !details ) {
        console.debug('HTTP Switchboard > cookie removal failed because "%s"', chrome.runtime.lastError);
    } else {
        // console.debug('HTTP Switchboard > removed cookie "%s" from %s', details.name, getUrlDomain(details.url));
    }
}

var removeCookiesTimers = {};

function removeCookies(request) {
    // coalesce multiple same requests
    var k = '{' + request.domain + '}{' + request.cookieStr + '}';
    var timer = removeCookiesTimers[k];
    if ( timer ) {
        clearTimeout(timer);
    }
    removeCookiesTimers[k] = setTimeout(function() {
        delete removeCookiesTimers[k];
        var rootUrl = getUrlHrefRoot(request.url);
        var cookies = parseRawCookies(request.cookieStr);
        var cookieNames = Object.keys(cookies);
        var cookieName;
        while ( cookieNames.length > 0 ) {
            cookieName = cookieNames.pop();
            chrome.cookies.remove({ url: rootUrl, name: cookieName }, removeCookiesCallback);
        }
    }, 5000);
}

/******************************************************************************/

function removeAllCookies(url) {
    chrome.cookies.getAll({ url: url }, function(cookies) {
        var i = cookies.length;
        var cookie;
        var blacklistCookie;
        while ( i-- ) {
            cookie = cookies[i];
            chrome.cookies.remove({ url: url, name: cookie.name });
            // console.debug('HTTP Switchboard > removed cookie "%s"="%s..." from %s', cookie.name, cookie.value.slice(0,40), url);
        }
    });
}

/******************************************************************************/

// http://stackoverflow.com/questions/4003823/javascript-getcookie-functions/4004010#4004010
// Thanks!

function parseRawCookies(cookieStr) {
    var c = cookieStr, v = 0, cookies = {};
    if (document.cookie.match(/^\s*\$Version=(?:"1"|1);\s*(.*)/)) {
        c = RegExp.$1;
        v = 1;
    }
    if (v === 0) {
        c.split(/[,;]/).map(function(cookie) {
            var parts = cookie.split(/=/, 2),
                name = decodeURIComponent(parts[0].trimLeft()),
                value = parts.length > 1 ? decodeURIComponent(parts[1].trimRight()) : null;
            cookies[name] = value;
        });
    } else {
        c.match(/(?:^|\s+)([!#$%&'*+\-.0-9A-Z^`a-z|~]+)=([!#$%&'*+\-.0-9A-Z^`a-z|~]*|"(?:[\x20-\x7E\x80\xFF]|\\[\x00-\x7F])*")(?=\s*[,;]|$)/g).map(function($0, $1) {
            var name = $0,
                value = $1.charAt(0) === '"'
                          ? $1.substr(1, -1).replace(/\\(.)/g, "$1")
                          : $1;
            cookies[name] = value;
        });
    }
    return cookies;
}

