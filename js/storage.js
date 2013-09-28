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
                    } else if ( key in arg ) {
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
        }
    }
};

/******************************************************************************/

// save white/blacklist
function save() {
    var httpsb = HTTPSB;
    var bin = {
        'name': 'httpswitchboard',
        version: httpsb.version,
        // version < 0.1.3
        // whitelist: httpsb.whitelistUser,
        // blacklist: httpsb.blacklistUser
        // version == 0.1.3
        'whitelist': Object.keys(httpsb.whitelistUser).join('\n'),
        'blacklist': Object.keys(httpsb.blacklistUser).join('\n'),
    };
    chrome.storage.local.set(bin, function() {
        console.log('HTTP Switchboard > saved user white and black lists (%d bytes)', bin.blacklist.length + bin.whitelist.length);
    });
}

/******************************************************************************/

function loadUserLists() {
    var httpsb = HTTPSB;

    chrome.storage.local.get({ version: HTTPSB.version, whitelist: '', blacklist: '' }, function(store) {
        if ( store.whitelist ) {
            // console.log('HTTP Switchboard > loadUserLists > whitelist: "%s"', store.whitelist);
            // TODO: remove this, surely all of the 7 users are up to date?
            if ( store.version.localeCompare(httpsb.version) < '0.1.3' ) {
                httpsb.whitelistUser = store.whitelist;
            } else {
                populateListFromString(httpsb.whitelistUser, store.whitelist);
            }
        } else {
            console.log('HTTP Switchboard > loadUserLists > using default whitelist');
            populateListFromString(httpsb.whitelistUser, 'image/*\nmain_frame/*');
        }
        populateListFromList(httpsb.whitelist, httpsb.whitelistUser);

        if ( store.blacklist ) {
           // console.log('HTTP Switchboard > loadUserLists > blacklist: "%s"', store.blacklist);
           // TODO: remove this, surely all of the 7 users are up to date?
           if ( store.version.localeCompare(httpsb.version) < '0.1.3' ) {
                httpsb.blacklistUser = store.blacklist;
            } else {
                populateListFromString(httpsb.blacklistUser, store.blacklist);
            }
        }
        populateListFromList(httpsb.blacklist, httpsb.blacklistUser);

        // gorhill 20130923: ok, there is no point in blacklisting
        // 'main_frame/*', since there is only one such page per tab. It is
        // reasonable to whitelist by default 'main_frame/*', and top page of
        // blacklisted domain name will not be loaded anyways (because domain
        // name has precedence over type). Now this way we save precious real
        // estate pixels in popup menu.
        allow('main_frame', '*');

        chrome.runtime.sendMessage({
            'what': 'startWebRequestHandler',
            'from': 'listsLoaded'
        });
    });
}

/******************************************************************************/

function loadRemoteBlacklists() {
    var httpsb = HTTPSB;
    // v <= 0.1.3
    chrome.storage.local.remove(Object.keys(httpsb.remoteBlacklists));
    chrome.storage.local.remove('remoteBlacklistLocations');

    // Get remote blacklist data (which may be saved locally)
    chrome.storage.local.get({ 'remoteBlacklists': httpsb.remoteBlacklists }, function(store) {
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
            // Local copy of remote list out of date?
            if ( store.remoteBlacklists[location].timeStamp ) {
                var age = Date.now() - store.remoteBlacklists[location].timeStamp;
                if ( age < httpsb.remoteBlacklistLocalCopyTTL ) {
                    chrome.runtime.sendMessage({
                        what: 'mergeRemoteBlacklist',
                        list: store.remoteBlacklists[location]
                    });
                    continue;
                }
            }
            // No local version, we need to fetch it from remote server.
            chrome.runtime.sendMessage({
                what: 'queryRemoteBlacklist',
                location: location
            });
        }
    });
}

/******************************************************************************/

function normalizeRemoteContent(prefix, s, suffix) {
    var normal = [];
    var keys = s.split("\n");
    var i = keys.length;
    var k;
    while ( i-- ) {
        k = keys[i];
        j = k.indexOf('#');
        if ( j >= 0 ) {
            k = k.slice(0, j);
        }
        k = k.replace('127.0.0.1', '');
        k = k.trim();
        if ( k.length === 0 ) {
            continue;
        }
        normal.push(prefix + k + suffix);
    }
    return normal.join('\n');
}

/******************************************************************************/

function queryRemoteBlacklist(location) {
    console.log('HTTP Switchboard > queryRemoteBlacklist > "%s"', location);
    $.get(location, function(remoteData) {
        if ( !remoteData || remoteData === '' ) {
            console.error('HTTP Switchboard > failed to load third party blacklist from remote location "%s"', location);
            return;
        }
        console.log('HTTP Switchboard > fetched third party blacklist from remote location "%s"', location);
        chrome.runtime.sendMessage({
            what: 'parseRemoteBlacklist',
            list: {
                url: location,
                timeStamp: Date.now(),
                raw: remoteData
            }
        });
    });
}

/******************************************************************************/

function parseRemoteBlacklist(list) {
    console.log('HTTP Switchboard > parseRemoteBlacklist > "%s"', list.url);
    list.raw = normalizeRemoteContent('*/', list.raw, '');
    // Save locally in order to load efficiently in the future.
    chrome.runtime.sendMessage({
        what: 'localSaveRemoteBlacklist',
        list: list
    });
    // Convert and merge content into internal representation.
    chrome.runtime.sendMessage({
        what: 'mergeRemoteBlacklist',
        list: list
    });
}

/******************************************************************************/

function localSaveRemoteBlacklist(list) {
    storageBufferer.acquire('remoteBlacklists', function(store) {
        store.remoteBlacklists[list.url] = list;
        // *important*
        storageBufferer.release();
    });
}

/******************************************************************************/

function localRemoveRemoteBlacklist(location) {
    storageBufferer.acquire('remoteBlacklists', function(store) {
        delete store.remoteBlacklists[list.url];
        // *important*
        storageBufferer.release();
    });
}

/******************************************************************************/

function mergeRemoteBlacklist(list) {
    console.log('HTTP Switchboard > mergeRemoteBlacklist from "%s": "%s..."', list.url, list.raw.slice(0, 40));
    var httpsb = HTTPSB;
    var entries = {};
    populateListFromString(entries, list.raw);
    populateListFromList(httpsb.remoteBlacklist, entries);
    populateListFromList(httpsb.blacklist, entries);
}

/******************************************************************************/

// load white/blacklist
function load() {
    loadUserLists();
    loadRemoteBlacklists();
}

/******************************************************************************/

// parse and merge normalized content into a list
function populateListFromString(des, s) {
    var keys = s.split("\n");
    var i = keys.length;
    while ( i-- ) {
        des[keys[i]] = true;
    }
}

 // merge a list into another list
function populateListFromList(des, src) {
    for ( var k in src ) {
        if ( src.hasOwnProperty(k) ) {
            des[k] = src[k];
        }
    }
}

