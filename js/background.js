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

// unpacked:
//      map[hostname] = true/false
// packed
//      map[tld].[leftover.length] = haystack on which to perform binary search
//
// Idea for mapping according to length inspired from reading the section
// "String-based Binary Search" @ http://ejohn.org/blog/revised-javascript-dictionary-search/
// Except for the core binary search I reused my own faithful version which has
// served me well over time.
//
// Figuratively speaking, this means when looking up a hostname, aka the needle,
// the TLD of the hostname tells us on which farm we must go, and the length
// of the hostname minus TLD tells us which haystack on that farm with must
// look into.
//
// Before, with quickIndexOf(), I was binary-searching one big ass haystack,
// now, using very easy to compute hostname patterns, I lookup a smaller
// haystack before binary-searching. But I appreciate especially the reduced
// memory footprint -- through the removal of all redundant information within
// a single haystack.
//
// Stats:
// Using Object for farm: sizeof(blacklistReadonly): 1,050,028
// Using Array for farm: sizeof(blacklistReadonly): 1,050,640
// So I will stick to using an Array because:
// http://jsperf.com/performance-of-array-vs-object/49

var blacklistReadonly = {
    packed: {},
    unpacked: null,

    unpack: function() {
        var unpacked = this.unpacked;
        if ( unpacked ) {
            return unpacked;
        }
        unpacked = {};
        this._unpack(unpacked, '');
        this.packed = null;
        this.unpacked = unpacked;
        return unpacked;
    },

    pack: function() {
        var packed = this.packed;
        if ( packed ) {
            return packed;
        }
        packed = {};
        var unpacked = this.unpacked;
        var hostnames = Object.keys(unpacked);
        var iHostname = hostnames.length;
        var hostname, idot, tld, hnPrefix;
        var len, farm, haystack;
        while ( iHostname-- ) {
            hostname = hostnames[iHostname];
            idot = hostname.lastIndexOf('.');
            hnPrefix = hostname.slice(0, idot);
            tld = hostname.slice(idot+1);
            len = hnPrefix.length;
            if ( !packed[tld] ) {
                packed[tld] = [];
            }
            farm = packed[tld];
            if ( !farm[len] ) {
                farm[len] = {};
            }
            haystack = farm[len];
            haystack[hnPrefix] = true;
        }
        var tldKeys = Object.keys(packed);
        var iTld = tldKeys.length;
        while ( iTld-- ) {
            tld = tldKeys[iTld];
            farm = packed[tld];
            len = farm.length;
            while ( len-- ) {
                if ( farm[len] !== undefined ) {
                    farm[len] = Object.keys(farm[len]).sort().join('');
                }
            }
        }
        this.unpacked = null;
        this.packed = packed;
        return packed;
    },

    toFilters: function(des) {
        var unpacked = this.unpacked;
        if ( unpacked ) {
            var hostnames = Object.keys(unpacked);
            var i = hostnames.length;
            while ( i-- ) {
                des['*/' + hostnames[i]] = true;
            }
            return;
        }
        this._unpack(des, '*/');
    },

    addOne: function(hostname) {
        var unpacked = this.unpacked || this.unpack();
        unpacked[hostname] = true;
    },

    addMany: function(s) {
        var unpacked = this.unpacked || this.unpack();
        var hostnames = s.split(/\s+/);
        var i = hostnames.length;
        var hostname;
        while ( i-- ) {
            hostname = hostnames[i];
            if ( hostname.length ) {
                unpacked[hostname.toLowerCase()] = true;
            }
        }
    },

    find: function(hostname) {
        var packed = this.packed || this.pack();
        var idot = hostname.lastIndexOf('.');
        var tld = hostname.slice(idot+1);
        var farm = packed[tld];
        if ( !farm ) {
            return false;
        }
        var hnPrefix = hostname.slice(0, idot);
        var len = hnPrefix.length;
        var haystack = farm[len];
        if ( !haystack ) {
            return false;
        }
        var left = 0;
        var right = Math.round(haystack.length / len);
        var i, needle;
        while ( left < right ) {
            i = left + right >> 1;
            needle = haystack.substr(i * len, len);
            if ( hnPrefix < needle ) {
                right = i;
            } else if ( hnPrefix > needle ) {
                left = i + 1;
            } else {
                return true;
            }
        }
        return false;
    },

    // this exists only in order to avoid code duplication
    _unpack: function(des, prefix) {
        var packed = this.packed;
        var tlds = Object.keys(packed);
        var iTld = tlds.length;
        var tld, farm, len;
        var haystack, iStraw;
        while ( iTld-- ) {
            tld = tlds[iTld];
            farm = packed[tld];
            len = farm.length;
            while ( len-- ) {
                haystack = farm[len];
                if ( haystack ) {
                    iStraw = haystack.length;
                    while ( iStraw ) {
                        iStraw -= len;
                        des[prefix + haystack.substr(iStraw, len) + '.' + tld] = true;
                    }
                }
            }
        }
    }
};

/******************************************************************************/

var HTTPSB = {
    manifest: chrome.runtime.getManifest(),

    userSettings: {
        deleteCookies: false,
        deleteLocalStorage: false,
        processBehindTheSceneRequests: false
    },

    // memo:
    // unicode for hourglass: &#x231B;

    gcPeriod: 20 * 60 * 1000, // 20 minutes...
    runtimeId: 1,

    inlineFieldSeparator: '#',

    // list of remote blacklist locations
    remoteBlacklists: {
        'assets/httpsb-blacklist.txt': {},
        'assets/thirdparties/mirror1.malwaredomains.com/files/immortal_domains.txt': {},
        'assets/thirdparties/mirror1.malwaredomains.com/files/justdomains': {},
        'assets/thirdparties/pgl.yoyo.org/as/serverlist.php': {},
        'assets/thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt': {}
        // 'http://pgl.yoyo.org/as/serverlist.php?mimetype=plaintext': {},
        // 'http://www.malwaredomainlist.com/hostslist/hosts.txt': {},
        // 'http://malwaredomains.lehigh.edu/files/justdomains': {},
        // 'http://malwaredomains.lehigh.edu/files/immortal_domains.txt': {}
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
    graylist: { },  // this will override preset blacklists
    // user lists
    whitelistUser: {},
    blacklistUser: {},
    graylistUser: {}, // this will override preset blacklists

    // Current entries from remote blacklists
    blacklistReadonly: blacklistReadonly,

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
    this.all = 0;
    this.main_frame = 0;
    this.sub_frame = 0;
    this.script = 0;
    this.image = 0;
    this.object = 0;
    this.xmlhttprequest = 0;
    this.other = 0;
    this.cookie = 0;
}

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
