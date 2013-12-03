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
    queuePageRecord: {},
    queuePageRemove: {},
    queueRemove: {},
    processCounter: 0,

    // Look for cookies to record for a specific web page
    record: function(pageStats) {
        // store the page stats objects so that it doesn't go away
        // before we handle the job.
        // rhill 2013-10-19: pageStats could be nil, for example, this can
        // happens if a file:// ... makes an xmlHttpRequest
        if ( pageStats ) {
            var pageURL = pageUrlFromPageStats(pageStats);
            cookieHunter.queuePageRecord[pageURL] = pageStats;
            asyncJobQueue.add(
                'cookieHunterPageRecord',
                null,
                function() { cookieHunter.processPageRecord(); },
                1000,
                false);
        }
    },

    // Look for cookies to potentially remove for a specific web page
    erase: function(pageStats) {
        // Hold onto pageStats objects so that it doesn't go away
        // before we handle the job.
        // rhill 2013-10-19: pageStats could be nil, for example, this can
        // happens if a file:// ... makes an xmlHttpRequest
        if ( pageStats ) {
            var pageURL = pageUrlFromPageStats(pageStats);
            cookieHunter.queuePageRemove[pageURL] = pageStats;
            asyncJobQueue.add(
                'cookieHunterPageRemove',
                null,
                function() { cookieHunter.processPageRemove(); },
                60 * 1000,
                false);
        }
    },

    // Candidate for removal
    remove: function(cookie) {
        cookieHunter.queueRemove[cookie.url + '|' + cookie.name] = cookie;
    },

    processPageRecord: function() {
        // record cookies from a specific page
        var pageUrls = Object.keys(cookieHunter.queuePageRecord);
        var i = pageUrls.length;
        while ( i-- ) {
            cookieHunter._processPageRecord(pageUrls[i]);
        }
    },

    _processPageRecord: function(pageUrl) {
        chrome.cookies.getAll({}, function(cookies) {
            cookieHunter._hunt(cookieHunter.queuePageRecord[pageUrl], cookies, true);
            delete cookieHunter.queuePageRecord[pageUrl];
        });
    },

    processPageRemove: function() {
        // erase cookies from a specific page
        var pageUrls = Object.keys(cookieHunter.queuePageRemove);
        var i = pageUrls.length;
        while ( i-- ) {
            cookieHunter._processPageRemove(pageUrls[i]);
        }
    },

    _processPageRemove: function(pageUrl) {
        chrome.cookies.getAll({}, function(cookies) {
            cookieHunter._hunt(cookieHunter.queuePageRemove[pageUrl], cookies, false);
            delete cookieHunter.queuePageRemove[pageUrl];
        });
    },

    // Once in a while, we go ahead and clean everything that might have been
    // left behind.
    processClean: function() {
        var httpsb = HTTPSB;
        // Avoid useless work
        if ( !httpsb.userSettings.deleteCookies ) {
            return;
        }
        chrome.cookies.getAll({}, function(cookies) {
            // quickProfiler.start();
            var i = cookies.length;
            if ( !i ) { return; }
            var cookie, domain, cookieUrl;
            while ( i-- ) {
                cookie = cookies[i];
                domain = cookie.domain.charAt(0) === '.' ? cookie.domain.slice(1) : cookie.domain;
                if ( httpsb.blacklisted('*', 'cookie', domain) ) {
                    cookieUrl = (cookie.secure ? 'https://' : 'http://') + domain + cookie.path;
                    // be mindful of https://github.com/gorhill/httpswitchboard/issues/19
                    if ( !httpsb.excludeRegex.test(cookieUrl) ) {
                        cookieHunter.remove({
                            url: cookieUrl,
                            domain: cookie.domain,
                            name: cookie.name
                        });
                    }
                }
            }
            // quickProfiler.stop('cookieHunter.processClean()');
        });
    },

    // Effectively remove cookies.
    processRemove: function() {
        var httpsb = HTTPSB;
        // Remove only some of the cookies which are candidate for removal:
        // who knows, maybe a user has 1000s of cookies sitting in his
        // browser...
        var cookieKeys = Object.keys(cookieHunter.queueRemove);
        if ( cookieKeys.length > 50 ) {
            cookieKeys = cookieKeys.sort(function(){return Math.random() < Math.random();}).splice(0, 50);
        }
        var cookieKey, cookie;
        while ( cookieKey = cookieKeys.pop() ) {
            cookie = cookieHunter.queueRemove[cookieKey];
            delete cookieHunter.queueRemove[cookieKey];
            // Just in case setting was changed after cookie was put in queue.
            if ( !httpsb.userSettings.deleteCookies ) {
                continue;
            }
            // Ensure cookie is not allowed on ALL current web pages: It can
            // happen that a cookie is blacklisted on one web page while
            // being whitelisted on another (because of per-page permissions).
            if ( cookieHunter._dontRemoveCookie(cookie) ) {
                // console.debug('HTTP Switchboard > cookieHunter.processRemove(): Will NOT remove cookie %s/{%s}', cookie.url, cookie.name);
                continue;
            }
            chrome.cookies.remove({ url: cookie.url, name: cookie.name });
            httpsb.cookieRemovedCounter++;
            // console.debug('HTTP Switchboard > removed cookie "%s" from "%s"', cookie.name, cookie.url);
        }
    },

    _hunt: function(pageStats, cookies, record) {
        var i = cookies.length;
        if ( !i ) {
            return;
        }
        var httpsb = HTTPSB;
        var deleteCookies = httpsb.userSettings.deleteCookies;
        if ( !record && !deleteCookies ) {
            return;
        }
        // quickProfiler.start();
        var pageUrl = pageUrlFromPageStats(pageStats);
        var domains = ' ' + Object.keys(pageStats.domains).join(' ') + ' ';
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
            if ( record ) {
                // rhill 2013-11-20:
                // https://github.com/gorhill/httpswitchboard/issues/60
                // Need to URL-encode cookie name
                pageStats.recordRequest('cookie', rootUrl + '/{cookie:' + encodeURIComponent(cookie.name.toLowerCase()) + '}', block);
                httpsb.requestStats.record('cookie', block);
            }
            // rhill 2013-11-21:
            // https://github.com/gorhill/httpswitchboard/issues/65
            // Leave alone cookies from behind-the-scene requests if
            // behind-the-scene processing is disabled.
            if ( block && deleteCookies && (pageUrl !== httpsb.behindTheSceneURL || httpsb.userSettings.processBehindTheSceneRequests) ) {
                cookieHunter.remove({
                    url: rootUrl + cookie.path,
                    domain: cookie.domain,
                    name: cookie.name
                });
            }
        }
        // quickProfiler.stop('cookieHunter._hunt()');
    },

    _dontRemoveCookie: function(cookie) {
        var httpsb = HTTPSB;
        var pageUrls = Object.keys(httpsb.pageStats);
        var i = pageUrls.length;
        var pageUrl, pageStats, domains, matchSubdomains, cookieDomain;
        while ( i-- ) {
            pageUrl = pageUrls[i];
            pageStats = httpsb.pageStats[pageUrl];
            domains = ' ' + Object.keys(pageStats.domains).join(' ') + ' ';
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
            if ( httpsb.whitelisted(pageUrl, 'cookie', cookieDomain) ) {
                return true;
            }
        }
        return false;
    }
};

function cookieHunterRemoveCallback() {
    cookieHunter.processRemove();
}
asyncJobQueue.add('cookieHunterRemove', null, cookieHunterRemoveCallback, 5 * 60 * 1000, true);

function cookieHunterCleanCallback() {
    cookieHunter.processClean();
}
// rhill 2013-11-21:
// https://github.com/gorhill/httpswitchboard/issues/65
// TODO: Remove the unused code.
// asyncJobQueue.add('cookieHunterClean', null, cookieHunterCleanCallback, 15 * 60 * 1000, true);

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

