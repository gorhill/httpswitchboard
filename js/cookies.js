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

var cookieHunterQueue = {
    queue: {},

    add: function(pageStats) {
        // store the page stats objects so that it doesn't go away
        // before we handle the job.
        this.queue[pageUrlFromPageStats(pageStats)] = pageStats;
    },

    process: function() {
        var me = this;
        Object.keys(this.queue).forEach(function(pageUrl) {
            findAndRecordCookies(me.queue[pageUrl]);
            delete me.queue[pageUrl];
        });
    }
}

setInterval(function(){cookieHunterQueue.process();}, 5000);

/******************************************************************************/

function removeCookiesCallback(details) {
    if ( !details ) {
        console.debug('HTTP Switchboard > cookie removal failed because "%s"', chrome.runtime.lastError);
    } else {
        // console.debug('HTTP Switchboard > removed cookie "%s" from %s', details.name, getHostnameFromURL(details.url));
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

function findAndRecordCookies(pageStats) {
    chrome.cookies.getAll({}, function(cookies) {
        // quickProfiler.start();
        var httpsb = HTTPSB;
        var i = cookies.length;
        if ( !i ) { return; }
        var domains = ' ' + Object.keys(pageStats.domains).sort().join(' ') + ' ';
        var cookie;
        var domain;
        var block;
        var cookieUrl;
        while ( i-- ) {
            cookie = cookies[i];
            domain = cookie.domain.charAt(0) === '.' ? cookie.domain.slice(1) : cookie.domain;
            if ( quickIndexOf(domains, domain, ' ') < 0 ) {
                continue;
            }
            block = blacklisted('cookie', domain);
            cookieUrl = cookie.secure ? 'https://' : 'http://';
            cookieUrl += domain + '/{cookie:' + cookie.name.toLowerCase() + '}';
            recordFromPageStats(pageStats, 'cookie', cookieUrl, block);
            if ( block ) {
                addStateFromPageStats(pageStats, 'cookie', domain);
                if ( httpsb.userSettings.deleteCookies ) {
                    chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
                    // console.debug('HTTP Switchboard > removed cookie "%s"', cookieUrl);
                }
            }
        }
        // quickProfiler.stop('findAndRecordCookies');
    });
}

/******************************************************************************/

// http://stackoverflow.com/questions/4003823/javascript-getcookie-functions/4004010#4004010
// Thanks!

// TODO: This is not ok: the comma is often used in a json string, it can not
// simply used mindlessly to split the cookie strings as it is done below.

function parseRawCookies(c) {
    var v = 0,
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
                value = $1.charAt(0) === '"' ?
                    $1.substr(1, -1).replace(/\\(.)/g, "$1") :
                    $1;
            cookies[name] = value;
        });
    }
    return cookies;
}

// I reused the code snippet above to create a function which just returns
// the number of cookies without the overhead of creating and returning an
// associative array.
// TODO: Not really accurate because of issue above.
function countRawCookies(c) {
    if (document.cookie.match(/^\s*\$Version=(?:"1"|1);\s*(.*)/)) {
        c = RegExp.$1;
        return c.match(/(?:^|\s+)([!#$%&'*+\-.0-9A-Z^`a-z|~]+)=([!#$%&'*+\-.0-9A-Z^`a-z|~]*|"(?:[\x20-\x7E\x80\xFF]|\\[\x00-\x7F])*")(?=\s*[,;]|$)/g).length;
    }
    return c.split(/[,;]/).length;
}

/******************************************************************************/

// Listen to any change in cookieland, we will update page stats accordingly.

// TODO: use timer

chrome.cookies.onChanged.addListener(function(changeInfo) {
    var removed = changeInfo.removed;
    if ( removed ) {
        return;
    }
    var httpsb = HTTPSB;
    var cookie = changeInfo.cookie;
    var domain = cookie.domain.charAt(0) == '.' ? cookie.domain.slice(1) : cookie.domain;
    var cookieUrl = cookie.secure ? 'https://' : 'http://';
    cookieUrl += domain + '/{cookie:' + cookie.name.toLowerCase() + '}';

    // Go through all pages and update if needed
    var domains;
    Object.keys(httpsb.pageStats).forEach(function(pageUrl) {
        domains = ' ' + Object.keys(httpsb.pageStats[pageUrl].domains).sort().join(' ') + ' ';
        if ( quickIndexOf(domains, domain, ' ') >= 0 ) {
            cookieHunterQueue.add(httpsb.pageStats[pageUrl]);
        }
        // console.debug('HTTP Switchboard > chrome.cookies.onChanged: "%s" (cookie=%O)', cookieUrl, cookie);
    });
});

/******************************************************************************/

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Base64_encoding_and_decoding#Solution_.232_.E2.80.93_rewriting_atob()_and_btoa()_using_TypedArrays_and_UTF-8
// Thanks!

// Convert anArrayBuffer to a unicode string, for those cookies encoded into
// a binary value.

/*jshint bitwise: false*/
function stringFromArrayBuffer(ab) {
    var s = '';
    for (var nPart, nLen = ab.length, nIdx = 0; nIdx < nLen; nIdx++) {
        nPart = ab[nIdx];
        s += String.fromCharCode(
            nPart > 251 && nPart < 254 && nIdx + 5 < nLen ? /* six bytes */
            /* (nPart - 252 << 32) is not possible in ECMAScript! So...: */
            (nPart - 252) * 1073741824 + (ab[++nIdx] - 128 << 24) + (ab[++nIdx] - 128 << 18) + (ab[++nIdx] - 128 << 12) + (ab[++nIdx] - 128 << 6) + ab[++nIdx] - 128
            : nPart > 247 && nPart < 252 && nIdx + 4 < nLen ? /* five bytes */
            (nPart - 248 << 24) + (ab[++nIdx] - 128 << 18) + (ab[++nIdx] - 128 << 12) + (ab[++nIdx] - 128 << 6) + ab[++nIdx] - 128
            : nPart > 239 && nPart < 248 && nIdx + 3 < nLen ? /* four bytes */
            (nPart - 240 << 18) + (ab[++nIdx] - 128 << 12) + (ab[++nIdx] - 128 << 6) + ab[++nIdx] - 128
            : nPart > 223 && nPart < 240 && nIdx + 2 < nLen ? /* three bytes */
            (nPart - 224 << 12) + (ab[++nIdx] - 128 << 6) + ab[++nIdx] - 128
            : nPart > 191 && nPart < 224 && nIdx + 1 < nLen ? /* two bytes */
            (nPart - 192 << 6) + ab[++nIdx] - 128
            : /* nPart < 127 ? */ /* one byte */
            nPart
        );
    }
    return s;
}
/*jshint bitwise: true*/

