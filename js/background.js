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

var HTTPSB = {
    manifest: chrome.runtime.getManifest(),

    // memo:
    // unicode for hourglass: &#x231B;

    gcPeriod: 20 * 60 * 1000, // 20 minutes...

    inlineFieldSeparator: '#',

    // list of remote blacklist locations
    remoteBlacklists: {
        'http://pgl.yoyo.org/as/serverlist.php?mimetype=plaintext': {},
        'http://www.malwaredomainlist.com/hostslist/hosts.txt': {},
        'http://malwaredomains.lehigh.edu/files/justdomains': {},
        'http://malwaredomains.lehigh.edu/files/immortal_domains.txt': {}
        },
    // remoteBlacklistLocalCopyTTL: 10 * 1000, // for debugging
    // Look for new version every 7 days
    remoteBlacklistLocalCopyTTL: 7 * 24 * 60 * 60 * 1000,

    // urls stats are kept on the back burner while waiting to be reactivated
    // in a tab or another.
    pageStats: {},

    // tabs are used to redirect stats collection to a specific url stats
    // structure.
    pageUrlToTabId: {},
    tabIdToPageUrl: {},

    // map["{type}/{domain}"]true
    // effective lists
    whitelist: { },
    blacklist: { '*/*': true },
    // user lists
    whitelistUser: {},
    blacklistUser: {},
    // current entries from remote blacklists
    remoteBlacklist: {},

    // constants
    GRAY: 0,
    DISALLOWED_DIRECT: 1,
    ALLOWED_DIRECT: 2,
    DISALLOWED_INDIRECT: 3,
    ALLOWED_INDIRECT: 4,

    // various stats
    blockedRequestCounters: {
        all: 0,
        main_frame: 0,
        sub_frame: 0,
        script: 0,
        image: 0,
        object: 0,
        xmlhttprequest: 0,
        other: 0,
        cookie: 0
    },
    allowedRequestCounters: {
        all: 0,
        main_frame: 0,
        sub_frame: 0,
        script: 0,
        image: 0,
        object: 0,
        xmlhttprequest: 0,
        other: 0,
        cookie: 0
    },

    // internal state
    webRequestHandler: false,

    // so that I don't have to care for last comma
    dummy: 0
};

