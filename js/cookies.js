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

function findAndRecordCookies(pageUrl) {
    var pageStats = pageStatsFromPageUrl(pageUrl);
    chrome.cookies.getAll({}, function(cookies) {
        var i = cookies.length;
        if ( !i ) { return; }
        var domains = Object.keys(pageStats.domains).join(' ') + ' ';
        var cookie;
        var domain;
        var block;
        var cookieUrl;
        while ( i-- ) {
            cookie = cookies[i];
            domain = cookie.domain.charAt(0) == '.' ? cookie.domain.slice(1) : cookie.domain;
            if ( domains.search(domain) < 0 ) {
                continue;
            }
            block = blacklisted('cookie', domain);
            cookieUrl = cookie.secure ? 'https://' : 'http://';
            cookieUrl += domain + '/{cookie:' + cookie.name.toLowerCase() + '}';
            recordFromPageUrl(pageUrl, 'cookie', cookieUrl, block);
            if ( block ) {
                addStateFromPageStats(pageStats, 'cookie', domain);
            }
            chrome.contentSettings.cookies.set({
                primaryPattern: '*://*.' + domain + '/*',
                secondaryPattern: '<all_urls>',
                setting: block ? 'block' : 'allow'
            });
            // console.debug('HTTP Switchboard > findAndRecordCookies: "%s" (cookie=%O)', cookieUrl, cookie);
        }
    });
}

/******************************************************************************/

// http://stackoverflow.com/questions/4003823/javascript-getcookie-functions/4004010#4004010
// Thanks!

function parseRawCookies(cookieStr) {
    var c = cookieStr,
        v = 0,
        cookies = {};
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

// I reused the code snippet above to create a function which just returns
// the number of cookies without the overhead of creating and returning an
// associative array.
function countRawCookies(cookieStr) {
    var c = cookieStr,
        v = 0;
    if (document.cookie.match(/^\s*\$Version=(?:"1"|1);\s*(.*)/)) {
        c = RegExp.$1;
        v = 1;
    }
    if (v === 0) {
        return c.split(/[,;]/).length;
    } else {
        return c.match(/(?:^|\s+)([!#$%&'*+\-.0-9A-Z^`a-z|~]+)=([!#$%&'*+\-.0-9A-Z^`a-z|~]*|"(?:[\x20-\x7E\x80\xFF]|\\[\x00-\x7F])*")(?=\s*[,;]|$)/g).length;
    }
    return 0;
}

/******************************************************************************/

// Listen to any change in cookieland, we will update page stats accordingly.

// TODO: use timer

chrome.cookies.onChanged.addListener(function(changeInfo) {
    var httpsb = HTTPSB;
    var cookie = changeInfo.cookie;
    var domain = cookie.domain.charAt(0) == '.' ? cookie.domain.slice(1) : cookie.domain;
    var block = blacklisted('cookie', domain);
    var removed = changeInfo.removed;
    var cookieUrl = cookie.secure ? 'https://' : 'http://';
    cookieUrl += domain + '/{cookie:' + cookie.name.toLowerCase() + '}';

    // Go through all pages and update if needed
    var pageStats;
    var domains;
    for ( var pageUrl in httpsb.pageStats ) {
        pageStats = httpsb.pageStats[pageUrl];
        var domains = Object.keys(pageStats.domains).join(' ') + ' ';
        if ( domains.search(domain) < 0 ) {
            continue;
        }
        if ( removed ) {
            continue;
        }
        recordFromPageStats(pageStats, 'cookie', cookieUrl, block);
        if ( block ) {
            addStateFromPageStats(pageStats, 'cookie', domain);
        }
        chrome.contentSettings.cookies.set({
            primaryPattern: '*://*.' + domain + '/*',
            secondaryPattern: '<all_urls>',
            setting: block ? 'block' : 'allow'
        });
        // console.debug('HTTP Switchboard > chrome.cookies.onChanged: "%s" (cookie=%O)', cookieUrl, cookie);
    }
});

