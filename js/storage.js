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

// This object allows me to perform read-modify-write operations on
// objects in chrome.store (otherwise not reliable because of asynchronicity).
// Arguments for acquire() are same as with chrome.storage.{local|sync}.get(),
// and release() *must* be called when done with stored object (or else changes
// won't be committed).

var storageBufferer = {
    lock: 0,
    store: {},
    callbacks: [],
    acquire: function(arg, callback) {
        this.lock++;
        var wantedKeys;
        if ( typeof arg === 'string' ) {
            wantedKeys = [arg];
        } else if ( arg instanceof Array ) {
            wantedKeys = arg.slice(0);
        } else {
            wantedKeys = Object.keys(arg);
        }
        var i = wantedKeys.length;
        while ( i-- ) {
            if ( wantedKeys[i] in this.store ) {
                wantedKeys.splice(i, 1);
            }
        }
        if ( wantedKeys.length ) {
            var self = this;
            this.callbacks.push(callback);
            chrome.storage.local.get(arg, function(store) {
                var i = wantedKeys.length;
                var key;
                while ( i-- ) {
                    key = wantedKeys[i];
                    if ( key in store ) {
                        self.store[key] = store[key];
                    } else if ( typeof arg === 'object' && key in arg ) {
                        self.store[key] = arg[key];
                    }
                }
                while ( self.callbacks.length ) {
                    (self.callbacks.pop())(self.store);
                }
            });
        } else {
            callback(this.store);
        }
    },
    release: function() {
        this.lock--;
        console.assert(this.lock >= 0, 'storageBufferer.lock is negative!');
        if ( this.lock === 0 ) {
            chrome.storage.local.set(this.store, function() {
                console.debug('HTTP Switchboard > saved buffered local storage');
            });
            // rhill 20131017: Once all is persisted, no need to hold onto
            // whatever is in the store, this reduce memory footprint of
            // exension.
            this.store = {};
        }
    }
};

/******************************************************************************/

function saveUserSettings() {
    chrome.storage.local.set(HTTPSB.userSettings, function() {
        console.log('HTTP Switchboard > saved user settings');
    });
}

/******************************************************************************/

function loadUserSettings() {
    chrome.storage.local.get(HTTPSB.userSettings, function(store) {
        HTTPSB.userSettings = store;
        console.log('HTTP Switchboard > loaded user settings');
    });
}

/******************************************************************************/

function loadUserLists() {
    var httpsb = HTTPSB;
    var defaults = {
        version: httpsb.manifest.version,
        whitelist: '',
        blacklist: '',
        graylist: '',
        scopes: ''
    };
    chrome.storage.local.get(defaults, function(store) {
        if ( store.scopes !== '' ) {
            httpsb.permanentScopes.fromString(store.scopes);
            httpsb.temporaryScopes.fromString(store.scopes);
        } else if ( store.whitelist !== '' || store.blacklist !== '' || store.graylist !== '') {
            // Pre v0.5.0
            console.log('HTTP Switchboard > loadUserLists > using default white/black/gray lists');
            httpsb.permanentScopes.scopes['*'].black.fromString(store.blacklist);
            httpsb.temporaryScopes.scopes['*'].black.fromString(store.blacklist);
            httpsb.permanentScopes.scopes['*'].gray.fromString(store.graylist);
            httpsb.temporaryScopes.scopes['*'].gray.fromString(store.graylist);
            httpsb.permanentScopes.scopes['*'].white.fromString(store.whitelist);
            httpsb.temporaryScopes.scopes['*'].white.fromString(store.whitelist);
        } else {
            // Sensible defaults
            httpsb.whitelistTemporarily('*', 'image', '*');
            httpsb.whitelistPermanently('*', 'image', '*');
            httpsb.blacklistTemporarily('*', 'object', '*');
            httpsb.blacklistPermanently('*', 'object', '*');
            httpsb.blacklistTemporarily('*', 'sub_frame', '*');
            httpsb.blacklistPermanently('*', 'sub_frame', '*');
        }

        // rhill 2013-09-23: ok, there is no point in blacklisting
        // 'main_frame|*', since there is only one such page per tab. It is
        // reasonable to whitelist by default 'main_frame|*', and top page of
        // blacklisted domain name will not be loaded anyways (because domain
        // name has precedence over type). Now this way we save precious real
        // estate pixels in popup menu.
        httpsb.whitelistTemporarily('*', 'main_frame', '*');
        httpsb.whitelistPermanently('*', 'main_frame', '*');

        chrome.runtime.sendMessage({
            'what': 'startWebRequestHandler',
            'from': 'listsLoaded'
        });
    });
}

/******************************************************************************/

function loadRemoteBlacklists() {
    // Get remote blacklist data (which may be saved locally)
    chrome.storage.local.get(
        { 'remoteBlacklists': HTTPSB.remoteBlacklists },
        loadRemoteBlacklistsHandler
        );
}

/******************************************************************************/

function loadRemoteBlacklistsHandler(store) {
    var httpsb = HTTPSB;
    var age;

    for ( var location in store.remoteBlacklists ) {

        if ( !store.remoteBlacklists.hasOwnProperty(location) ) {
            continue;
        }
        // If loaded list location is not part of default list location,
        // remove its content from local storage.
        if ( !httpsb.remoteBlacklists[location] ) {
            chrome.runtime.sendMessage({
                what: 'localRemoveRemoteBlacklist',
                location: location
            });
            continue;
        }

        // This is useful to know when it is worth to pack the read-only
        // blacklist. From this point on, a merge is expected, whether \
        // by loading the cached copy, or by downloading the remote content.
        httpsb.remoteBlacklistMergeCounter++;

        // Local copy of remote list out of date?
        if ( store.remoteBlacklists[location].timeStamp === undefined ) {
            store.remoteBlacklists[location].timeStamp = 0;
        }
        httpsb.remoteBlacklists[location].timeStamp = store.remoteBlacklists[location].timeStamp;

        // If it is project's local list, always query
        if ( location.search('httpsb') < 0 ) {
            age = Date.now() - store.remoteBlacklists[location].timeStamp;
            if ( age < httpsb.remoteBlacklistLocalCopyTTL ) {
                mergeRemoteBlacklist(store.remoteBlacklists[location]);

                // TODO: I am wondering if chromium leaks items in store...
                // I can see them in heap snapshot, while nowhere I am holding
                // onto them..

                continue;
            }
        }

        // No local version, we need to fetch it from remote server.
        chrome.runtime.sendMessage({
            what: 'queryRemoteBlacklist',
            location: location
        });
    }
}

/******************************************************************************/

function normalizeRemoteContent(s) {
    var normal = [];
    var keys = s.split("\n");
    var i = keys.length;
    var j, k;
    while ( i-- ) {
        k = keys[i];
        j = k.indexOf('#');
        if ( j >= 0 ) {
            k = k.slice(0, j);
        }
        // https://github.com/gorhill/httpswitchboard/issues/15
        // Ensure localhost et al. don't end up on the read-only blacklist.
        k = k.replace(/127\.0\.0\.1\b|::1\b|localhost\b/g, '');
        k = k.trim();
        if ( k.length ) {
            normal.push(k.toLowerCase());
        }
    }
    return normal.join('\n');
}

/******************************************************************************/

function queryRemoteBlacklist(location) {
    // If location is local, assume local directory
    var url = location;
    if ( url.search(/^https?:\/\//) < 0 ) {
        url = chrome.runtime.getURL(location);
    }
    console.log('HTTP Switchboard > queryRemoteBlacklist > "%s"', url);

    // rhill 2013-10-24: Beware, our own requests could be blocked by our own
    // behind-the-scene requests processor.
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'text';
    xhr.timeout = 30 * 1000;
    xhr.onload = function() {
        queryRemoteBlacklistSuccess(location, this.responseText);
        };
    xhr.onerror = function() {
        queryRemoteBlacklistFailure(location);
        };
    xhr.ontimeout = function() {
        queryRemoteBlacklistFailure(location);
        };
    xhr.open('GET', url, true);
    xhr.send();
}

function queryRemoteBlacklistSuccess(location, content) {
    // console.log('HTTP Switchboard > fetched third party blacklist from remote location "%s"', location);
    HTTPSB.remoteBlacklists[location].timeStamp = Date.now();

    // rhill 2013-10-25: using toLowerCase() here instead of at
    // populateListFromString() time appears to be beneficial to memory
    // footprint, I suspect this has to do with maybe chromium merely referring
    // to the larger string using [s,e] when slicing substrings as long as
    // these substrings are not processed further.
    chrome.runtime.sendMessage({
        what: 'parseRemoteBlacklist',
        list: {
            url: location,
            timeStamp: Date.now(),
            raw: content.toLowerCase()
        }
    });
}

function queryRemoteBlacklistFailure(location) {
    // console.error('HTTP Switchboard > failed to load third party blacklist from remote location "%s"\n\tWill fall back on local copy if any.', location);
    chrome.storage.local.get({ 'remoteBlacklists': {} }, function(store) {
        if ( store.remoteBlacklists[location] ) {
            mergeRemoteBlacklist(store.remoteBlacklists[location]);
        } else {
            // That sucks, we can't even merge, so we need to release
            // pending merge counter
            HTTPSB.remoteBlacklistMergeCounter--;
        }
    });
}

/******************************************************************************/

function parseRemoteBlacklist(list) {
    // console.log('HTTP Switchboard > parseRemoteBlacklist > "%s"', list.url);

    // rhill 2013-10-21: no need to prefix with '* ', the hostname is just what
    // we need for preset blacklists. The prefix '* ' is ONLY needed when
    // used as a filter in temporary blacklist.
    list.raw = normalizeRemoteContent(list.raw);

    // Save locally in order to load efficiently in the future.
    localSaveRemoteBlacklist(list);

    // Convert and merge content into internal representation.
    mergeRemoteBlacklist(list);
}

/******************************************************************************/

function localSaveRemoteBlacklist(list) {
    // rhill 2013-10-24: Don't pointlessly save lists which are already
    // stored locally.
    if ( list.url.search('assets/') === 0 ) {
        return;
    }

    storageBufferer.acquire('remoteBlacklists', function(store) {
        if ( store.remoteBlacklists === undefined ) {
            store.remoteBlacklists = {};
        }
        store.remoteBlacklists[list.url] = list;
        // *important*
        storageBufferer.release();
    });
}

/******************************************************************************/

function localRemoveRemoteBlacklist(location) {
    storageBufferer.acquire('remoteBlacklists', function(store) {
        if ( store.remoteBlacklists ) {
            delete store.remoteBlacklists[location];
        }
        // *important*
        storageBufferer.release();
        console.log('HTTP Switchboard > removed cached %s', location);
    });
}

/******************************************************************************/

function mergeRemoteBlacklist(list) {
    // console.log('HTTP Switchboard > mergeRemoteBlacklist from "%s": "%s..."', list.url, list.raw.slice(0, 40));
    var httpsb = HTTPSB;

    // https://github.com/gorhill/httpswitchboard/issues/15
    // TODO: Will remove this one when all lists have been refreshed
    // on all user's cache: let's wait two week than we can
    // remove it (now it is 2013-10-21)
    var raw = list.raw.replace(/\*\/localhost\b|\*\/127\.0\.0\.1\b|\*\/::1\b|\*\//g, '');
    var blacklistReadonly = httpsb.blacklistReadonly;

    if ( blacklistReadonly.count === undefined ) {
        blacklistReadonly.count = 0;
    }

    var keys = raw.split(/\s+/);
    var i = keys.length;
    var key;
    while ( i-- ) {
        key = keys[i];
        if ( key.length && !blacklistReadonly[key] ) {
            blacklistReadonly[key] = true;
            blacklistReadonly.count++;
        }
    }
}

/******************************************************************************/

// load white/blacklist
function load() {
    loadUserSettings();
    loadUserLists();
    loadRemoteBlacklists();
}

