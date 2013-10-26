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

var HTTPSB = {
    manifest: chrome.runtime.getManifest(),

    userSettings: {
        deleteCookies: false,
        deleteLocalStorage: false,
        processBehindTheSceneRequests: false,
        strictBlocking: false
    },

    // memo:
    // unicode for hourglass: &#x231B;

    runtimeId: 1,

    inlineFieldSeparator: '#',

    // list of remote blacklist locations
    remoteBlacklists: {
        'assets/httpsb-blacklist.txt': {},
        'assets/thirdparties/mirror1.malwaredomains.com/files/immortal_domains.txt': {},
        'assets/thirdparties/mirror1.malwaredomains.com/files/justdomains': {},
        'assets/thirdparties/pgl.yoyo.org/as/serverlist.php': {},
        'assets/thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt': {}
        // 'assets/thirdparties/hosts-file.net/ad-servers.asp': {}
        // 'assets/thirdparties/hosts-file.net/hosts.txt': {} // Huge!
        },
    // remoteBlacklistLocalCopyTTL: 10 * 1000, // for debugging
    // Look for new version every 7 days
    remoteBlacklistLocalCopyTTL: 7 * 24 * 60 * 60 * 1000,
    remoteBlacklistMergeCounter: 0,

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
    graylist: { },
    // user lists
    whitelistUser: {},
    blacklistUser: {},
    graylistUser: {}, // this will override preset blacklists

    // Current entries from remote blacklists
    blacklistReadonly: {},

    // https://github.com/gorhill/httpswitchboard/issues/19
    excludeRegex: /^https?:\/\/chrome\.google\.com\/(extensions|webstore)/,

    // constants
    GRAY: 0,
    DISALLOWED_DIRECT: 1,
    ALLOWED_DIRECT: 2,
    DISALLOWED_INDIRECT: 3,
    ALLOWED_INDIRECT: 4,

    // various stats
    requestStats: new WebRequestStats(),
    cookieRemovedCounter: 0,

    // internal state
    webRequestHandler: false,

    // record what chromium is soing behind the scene
    behindTheSceneURL: 'http://chromium.behind.the.scene',
    behindTheSceneTabId: 0x7FFFFFFFFFFFFFFF,
    behindTheSceneMaxReq: 250,

    // so that I don't have to care for last comma
    dummy: 0
};

/******************************************************************************/

function _WebRequestStats() {
    this.all =
    this.main_frame =
    this.sub_frame =
    this.script =
    this.image =
    this.object =
    this.xmlhttprequest =
    this.other =
    this.cookie = 0;
}

_WebRequestStats.prototype.reset = function() {
    this.all = 
    this.main_frame =
    this.sub_frame =
    this.script =
    this.image =
    this.object =
    this.xmlhttprequest =
    this.other =
    this.cookie = 0;
};

function WebRequestStats() {
    this.allowed = new _WebRequestStats();
    this.blocked = new _WebRequestStats();
}

WebRequestStats.prototype.record = function(type, blocked) {
    if ( blocked ) {
        this.blocked[type] += 1;
        this.blocked.all += 1;
    } else {
        this.allowed[type] += 1;
        this.allowed.all += 1;
    }
};

WebRequestStats.prototype.reset = function() {
    this.blocked.reset();
    this.allowed.reset();
};
