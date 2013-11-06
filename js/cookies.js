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
    queueErase: {},
    queueRemove: [],
    processCounter: 0,

    record: function(pageStats) {
        // store the page stats objects so that it doesn't go away
        // before we handle the job.
        // rhill 2013-10-19: pageStats could be nil, for example, this can
        // happens if a file:// ... makes an xmlHttpRequest
        if ( pageStats ) {
            this.queueRecord[pageUrlFromPageStats(pageStats)] = pageStats;
        }
    },

    erase: function(pageStats) {
        // Hold onto pageStats objects so that it doesn't go away
        // before we handle the job.
        // rhill 2013-10-19: pageStats could be nil, for example, this can
        // happens if a file:// ... makes an xmlHttpRequest
        if ( pageStats ) {
            this.queueErase[pageUrlFromPageStats(pageStats)] = pageStats;
        }
    },

    remove: function(cookie) {
        this.queueRemove.push(cookie);
    },

    processRecord: function() {
        var me = this;
        // record cookies from a specific page
        // TODO: use internal counter and avoid closures
        Object.keys(this.queueRecord).forEach(function(pageUrl) {
            chrome.cookies.getAll({}, function(cookies) {
                me._record(pageUrl, cookies);
                delete me.queueRecord[pageUrl];
            });
        });
    },

    processRemove: function() {
        var me = this;
        // erase cookies from a specific page
        // TODO: use internal counter and avoid closures
        Object.keys(this.queueErase).forEach(function(pageUrl) {
            chrome.cookies.getAll({}, function(cookies) {
                me._erase(pageUrl, cookies);
                delete me.queueErase[pageUrl];
            });
        });
        // then perform real removal
        var cookie;
        while ( cookie = this.queueRemove.pop() ) {
            chrome.cookies.remove({ url: cookie.url, name: cookie.name });
            HTTPSB.cookieRemovedCounter++;
            // console.debug('HTTP Switchboard > removed cookie "%s" from "%s"', cookie.name, cookie.url);
        }
    },

    // Once in a while, we go ahead and clean everything that might have been
    // left behind.
    processClean: function() {
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
                if ( httpsb.blacklisted(undefined, 'cookie', domain) ) {
                    cookieUrl = (cookie.secure ? 'https://' : 'http://') + domain + cookie.path;
                    // be mindful of https://github.com/gorhill/httpswitchboard/issues/19
                    if ( !httpsb.excludeRegex.test(cookieUrl) ) {
                        me.remove({ url: cookieUrl, name: cookie.name });
                    }
                }
            }
            // quickProfiler.stop('cookieHunter.processClean()');
        });
    },

    // find and record cookies for a specific web page
    _record: function(pageUrl, cookies) {
        // quickProfiler.start();
        var httpsb = HTTPSB;
        var pageStats = this.queueRecord[pageUrl];
        var domains = ' ' + Object.keys(pageStats.domains).join(' ') + ' ';
        var i = cookies.length;
        if ( !i ) { return; }
        var cookie, cookieDomain, block, rootUrl, matchSubdomains;
        while ( i-- ) {
            cookie = cookies[i];
            matchSubdomains = cookie.domain.charAt(0) === '.';
            cookieDomain = matchSubdomains ? cookie.domain.slice(1) : cookie.domain;
            if ( domains.indexOf(' ' + cookieDomain + ' ') < 0 ) {
                if ( !matchSubdomains ) {
                    continue;
                }
                if ( domains.indexOf('.' + cookieDomain + ' ') < 0 ) {
                    continue;
                }
            }
            block = httpsb.blacklisted(pageUrl, 'cookie', cookieDomain);
            rootUrl = (cookie.secure ? 'https://' : 'http://') + cookieDomain;
            pageStats.recordRequest('cookie', rootUrl + '/{cookie:' + cookie.name.toLowerCase() + '}', block);
            httpsb.requestStats.record('cookie', block);
            if ( block && httpsb.userSettings.deleteCookies ) {
                this.remove({
                    url: rootUrl + cookie.path,
                    name: cookie.name
                });
            }
        }
        // quickProfiler.stop('cookieHunter._record()');
    },

    // remove cookies for a specific web page
    _erase: function(pageUrl, cookies) {
        // quickProfiler.start();
        var httpsb = HTTPSB;
        if ( !httpsb.userSettings.deleteCookies ) {
            return;
        }
        var pageStats = this.queueErase[pageUrl];
        var domains = ' ' + Object.keys(pageStats.domains).join(' ') + ' ';
        var i = cookies.length;
        if ( !i ) { return; }
        var cookie, cookieDomain, block, rootUrl, matchSubdomains;
        while ( i-- ) {
            cookie = cookies[i];
            matchSubdomains = cookie.domain.charAt(0) === '.';
            cookieDomain = matchSubdomains ? cookie.domain.slice(1) : cookie.domain;
            if ( domains.indexOf(' ' + cookieDomain + ' ') < 0 ) {
                if ( !matchSubdomains ) {
                    continue;
                }
                if ( domains.indexOf('.' + cookieDomain + ' ') < 0 ) {
                    continue;
                }
            }
            block = httpsb.blacklisted(pageUrl, 'cookie', cookieDomain);
            rootUrl = (cookie.secure ? 'https://' : 'http://') + cookieDomain;
            if ( block ) {
                this.remove({ url: rootUrl + cookie.path, name: cookie.name });
            }
        }
        // quickProfiler.stop('cookieHunter._erase()');
    }

};

// Every five seconds, so that cookies are reported soon enough after a
// web page loads.
function cookieHunterRecordCallback() {
    cookieHunter.processRecord();
}
asyncJobQueue.add('cookieHunterRecord', null, cookieHunterRecordCallback, 500, true);

function cookieHunterRemoveCallback() {
    cookieHunter.processRemove();
}
asyncJobQueue.add('cookieHunterRemove', null, cookieHunterRemoveCallback, 30 * 1000, true);

function cookieHunterCleanCallback() {
    cookieHunter.processClean();
}
asyncJobQueue.add('cookieHunterClean', null, cookieHunterCleanCallback, 5 * 60 * 1000, true);

/******************************************************************************/

// Listen to any change in cookieland, we will update page stats accordingly.

chrome.cookies.onChanged.addListener(function(changeInfo) {
    var removed = changeInfo.removed;
    if ( removed ) {
        return;
    }
    var httpsb = HTTPSB;
    var cookie = changeInfo.cookie;
    var cookieDomain = cookie.domain.charAt(0) == '.' ? cookie.domain.slice(1) : cookie.domain;
    var cookieUrl = cookie.secure ? 'https://' : 'http://';
    cookieUrl += cookieDomain + '/{cookie:' + cookie.name.toLowerCase() + '}';

    // Go through all pages and update if needed, as one cookie can be used
    // by many web pages, so they need to be recorded for all these pages.
    var pageUrls = Object.keys(httpsb.pageStats);
    var iPageUrl = pageUrls.length;
    var pageUrl;
    while ( iPageUrl-- ) {
        pageUrl = pageUrls[iPageUrl];
        if ( httpsb.pageStats[pageUrl].domains[cookieDomain] ) {
            cookieHunter.record(httpsb.pageStats[pageUrl]);
        }
        // console.debug('HTTP Switchboard > chrome.cookies.onChanged: "%s" (cookie=%O)', cookieUrl, cookie);
    }
});

