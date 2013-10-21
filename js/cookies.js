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

var cookieHunter = {
    queueRecord: {},
    queueRemove: [],
    processCounter: 0,
    cleanCycle: 60,

    record: function(pageStats) {
        // store the page stats objects so that it doesn't go away
        // before we handle the job.
        // rhill 2013-10-19: pageStats could be nil, for example, this can
        // happens if a file:// ... makes an xmlHttpRequest
        if ( pageStats ) {
            this.queueRecord[pageUrlFromPageStats(pageStats)] = pageStats;
        }
    },

    remove: function(cookie) {
        this.queueRemove.push(cookie);
    },

    process: function() {
        var me = this;
        Object.keys(this.queueRecord).forEach(function(pageUrl) {
            chrome.cookies.getAll({}, function(cookies) {
                me._record(pageUrl, cookies);
                delete me.queueRecord[pageUrl];
            });
        });
        this.processCounter++;
        if ( (this.processCounter % this.cleanCycle) === 0 ) {
            this.clean();
        }
        var cookie;
        while ( cookie = this.queueRemove.pop() ) {
            chrome.cookies.remove({ url: cookie.url, name: cookie.name });
            HTTPSB.cookieRemovedCounter++;
            console.debug('HTTP Switchboard > removed cookie "%s" from "%s"', cookie.name, cookie.url);
        }
    },

    // Once in a while, we go ahead and clean everything that might have been
    // left behind.
    clean: function() {
        var httpsb = HTTPSB;
        if ( !httpsb.userSettings.deleteCookies ) {
            return;
        }
        var me = this;
        chrome.cookies.getAll({}, function(cookies) {
            // quickProfiler.start();
            var i = cookies.length;
            if ( !i ) { return; }
            var cookie, domain, cookieUrl;
            while ( i-- ) {
                cookie = cookies[i];
                domain = cookie.domain.charAt(0) === '.' ? cookie.domain.slice(1) : cookie.domain;
                if ( blacklisted('cookie', domain) ) {
                    cookieUrl = (cookie.secure ? 'https://' : 'http://') + domain + cookie.path;
                    // be mindful of https://github.com/gorhill/httpswitchboard/issues/19
                    if ( !httpsb.excludeRegex.test(cookieUrl) ) {
                        me.remove({ url: cookieUrl, name: cookie.name });
                    }
                }
            }
            // quickProfiler.stop('cookieHunter.clean()');
        });
    },

    _record: function(pageUrl, cookies) {
        // quickProfiler.start();
        var httpsb = HTTPSB;
        var pageStats = this.queueRecord[pageUrl];
        var i = cookies.length;
        if ( !i ) { return; }
        var domains = ' ' + Object.keys(pageStats.domains).sort().join(' ') + ' ';
        var cookie, domain, block, rootUrl;
        while ( i-- ) {
            cookie = cookies[i];
            domain = cookie.domain.charAt(0) === '.' ? cookie.domain.slice(1) : cookie.domain;
            if ( quickIndexOf(domains, domain, ' ') < 0 ) {
                continue;
            }
            block = blacklisted('cookie', domain);
            rootUrl = (cookie.secure ? 'https://' : 'http://') + domain;
            recordFromPageStats(pageStats, 'cookie', rootUrl + '/{cookie:' + cookie.name.toLowerCase() + '}', block);
            // TODO: I forgot whether pageStats can be null here...
            if ( pageStats ) {
                pageStats.requestStats.record('cookie', block);
            }
            httpsb.requestStats.record('cookie', block);
            if ( block ) {
                addStateFromPageStats(pageStats, 'cookie', domain);
                if ( httpsb.userSettings.deleteCookies ) {
                    this.remove({
                        url: rootUrl + cookie.path,
                        name: cookie.name
                    });
                }
            }
        }
        delete this.queueRecord[pageUrl];
        // quickProfiler.stop('cookieHunter.record()');
    }
}

setInterval(function(){cookieHunter.process();}, 5000);

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
            cookieHunter.record(httpsb.pageStats[pageUrl]);
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

