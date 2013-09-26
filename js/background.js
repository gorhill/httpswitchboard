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
    version: '0.2.00',

    // memo:
    // unicode for hourglass: &#x231B;

    gcPeriod: 30 * 60 * 1000, // 30 minutes...

    // list of remote blacklist locations
    // TODO: ttl (2-weeks?)
    remoteBlacklists: {
        'http://pgl.yoyo.org/as/serverlist.php?mimetype=plaintext': {},
        'http://www.malwaredomainlist.com/hostslist/hosts.txt': {},
        'http://malwaredomains.lehigh.edu/files/justdomains': {},
        'http://malwaredomains.lehigh.edu/files/immortal_domains.txt': {}
        },

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
    remoteBlacklist: {
    },

    // constants
    GRAY: 0,
    DISALLOWED_DIRECT: 1,
    ALLOWED_DIRECT: 2,
    DISALLOWED_INDIRECT: 3,
    ALLOWED_INDIRECT: 4,

    // internal state
    webRequestHandler: false,

    // so that I don't have to care for last comma
    dummy: 0
};

