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
            chrome.storage.local.set(this.store, getBytesInUse);
            // rhill 20131017: Once all is persisted, no need to hold onto
            // whatever is in the store, this reduce memory footprint of
            // exension.
            this.store = {};
        }
    }
};

/******************************************************************************/

// Support async (let caller choose)

function readLocalTextFile(path) {
    var text = null;
    try {
        // If location is local, assume local directory
        var url = path;
        if ( url.search(/^https?:\/\//) < 0 ) {
            url = chrome.runtime.getURL(path);
        }
        // console.log('HTTP Switchboard > readLocalTextFile > "%s"', url);

        // rhill 2013-10-24: Beware, our own requests could be blocked by our own
        // behind-the-scene requests processor.
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'text';
        xhr.open('GET', url, false);
        xhr.send();
        if ( xhr.status === 200 ) {
            text = xhr.responseText;
        }
    }
    catch (err) {
        console.error('HTTP Switchboard > readLocalTextFile(): %o', err);
    }
    return text;
}

/******************************************************************************/

function getBytesInUseHandler(bytesInUse) {
    HTTPSB.storageUsed = bytesInUse;
}

function getBytesInUse() {
    chrome.storage.local.getBytesInUse(null, getBytesInUseHandler);
}

/******************************************************************************/

function saveUserSettings() {
    chrome.storage.local.set(HTTPSB.userSettings, getBytesInUse);
}

/******************************************************************************/

function loadUserSettings() {
    chrome.storage.local.get(HTTPSB.userSettings, function(store) {
        HTTPSB.userSettings = store;
        // console.log('HTTP Switchboard > loaded user settings');
    });
}

/******************************************************************************/

function loadUserLists() {
    var httpsb = HTTPSB;
    var defaults = {
        version: httpsb.manifest.version,
        scopes: ''
    };
    chrome.storage.local.get(defaults, function(store) {
        if ( store.scopes !== '' ) {
            httpsb.temporaryScopes.fromString(store.scopes);
            // All this ugly special handling to smoothly transition between
            // versions will disappear once it is reasonable to think nobody
            // is using older versions.
            // rhill 2013-12-15: New type `stylesheet`. Sensible default:
            // - If `stylesheet` is graylisted, whitelist `stylesheet`
            if ( store.version.slice(0, 5).localeCompare('0.7.0') < 0 ) {
                httpsb.whitelistTemporarily('*', 'stylesheet', '*');
            }
            if ( store.version.slice(0, 5).localeCompare('0.7.5') < 0 ) {
                httpsb.createTemporaryScopeFromScopeKey(httpsb.behindTheSceneScopeKey);
                if ( httpsb.userSettings.processBehindTheSceneRequests ) {
                    httpsb.blacklistTemporarily(httpsb.behindTheSceneScopeKey, '*', '*');
                } else {
                    httpsb.whitelistTemporarily(httpsb.behindTheSceneScopeKey, '*', '*');
                }
            } else if ( store.version.slice(0, 5).localeCompare('0.7.6') < 0 ) {
                var scope = httpsb.temporaryScopes.scopes[httpsb.behindTheSceneScopeKey];
                if ( scope && scope.white.count <= 1 && scope.black.count <= 1 && scope.gray.count === 0 ) {
                    if ( httpsb.userSettings.processBehindTheSceneRequests ) {
                        httpsb.blacklistTemporarily(httpsb.behindTheSceneScopeKey, '*', '*');
                    } else {
                        httpsb.whitelistTemporarily(httpsb.behindTheSceneScopeKey, '*', '*');
                    }
                }
            }
        } else {
            // Sensible defaults
            httpsb.whitelistTemporarily('*', 'stylesheet', '*');
            httpsb.whitelistTemporarily('*', 'image', '*');
            httpsb.blacklistTemporarily('*', 'sub_frame', '*');
            httpsb.createTemporaryScopeFromScopeKey(httpsb.behindTheSceneScopeKey);
            httpsb.whitelistTemporarily(httpsb.behindTheSceneScopeKey, '*', '*');
        }

        // rhill 2013-09-23: ok, there is no point in blacklisting
        // 'main_frame|*', since there is only one such page per tab. It is
        // reasonable to whitelist by default 'main_frame|*', and top page of
        // blacklisted domain name will not load anyways (because domain
        // name has precedence over type). Now this way we save precious real
        // estate pixels in popup menu.
        httpsb.whitelistTemporarily('*', 'main_frame', '*');
        httpsb.commitPermissions(true);

        chrome.runtime.sendMessage({
            'what': 'startWebRequestHandler',
            'from': 'listsLoaded'
        });
    });
}

/******************************************************************************/

function loadRemoteBlacklists() {
    // Get remote blacklist data (which may be saved locally).
    // No need for storageBufferer.acquire() here because the fetched data
    // won't be modified.
    // rhill 2013-12-10: no need to use storageBufferer.
    chrome.storage.local.get(
        { 'remoteBlacklists': HTTPSB.remoteBlacklists },
        loadRemoteBlacklistsHandler
        );
}

/******************************************************************************/

// rhill 2013-12-10: preset blacklists can now be reloaded after they have
// been loaded, and the resulting preset blacklisted entries might differ from
// the original.
// This means, as opposed to the first time we load, there might be entries to
// remove.
//
// So this will work this way:
// - Set all existing entries as `false`.
// - Reload will create or mark all valid entries as `true`.
// - Post-reload, all entries which are false are removed. This is not really
//   necessary, but I expect the result would be reduced memory footprint
//   without having to reload the extension (maybe this is the reason the user
//   disabled one or more preset blacklists).

function loadRemoteBlacklistsHandler(store) {
    var httpsb = HTTPSB;
    var responseText;

    // rhill 2013-12-10: set all existing entries to `false`.
    disableAllPresetBlacklistEntries();

    // Load each preset blacklist which is not disabled.
    for ( var location in store.remoteBlacklists ) {

        if ( !store.remoteBlacklists.hasOwnProperty(location) ) {
            continue;
        }

        // rhill 2014-01-24: HTTPSB-maintained lists sit now in their
        // own directory, "asset/httpsb/". Ensure smooth transition.
        // TODO: Remove this code when everybody upgraded beyond 0.7.7.1
        if ( location === 'assets/httpsb-blacklist.txt' &&
             store.remoteBlacklists[location].off === true )
        {
            // In case it was already processed
            httpsb.remoteBlacklists['assets/httpsb/blacklist.txt'].off = true;
            // In case it was not yet processed
            store.remoteBlacklists['assets/httpsb/blacklist.txt'].off = true;
        }

        // If loaded list location is not part of default list locations,
        // remove its entry from local storage.
        if ( !httpsb.remoteBlacklists[location] ) {
            chrome.runtime.sendMessage({
                what: 'localRemoveRemoteBlacklist',
                location: location
            });
            continue;
        }

        // Store details of this preset blacklist
        httpsb.remoteBlacklists[location] = store.remoteBlacklists[location];

        // rhill 2013-12-09:
        // Ignore list if disabled
        // https://github.com/gorhill/httpswitchboard/issues/78
        if ( store.remoteBlacklists[location].off ) {
            continue;
        }

        responseText = readLocalTextFile(location);
        if ( !responseText ) {
            httpsb.remoteBlacklists[location].error = 'Unable to read content';
            console.error('HTTP Switchboard > Unable to read content of "%s"', location);
            continue;
        }

        // rhill 2013-12-10: now merging synchronously.
        mergeRemoteBlacklist({
            url: location,
            raw: responseText
        });
    }

    chrome.runtime.sendMessage({ what: 'presetBlacklistsLoaded' });

    // rhill 2013-12-10: prune read-only blacklist entries.
    prunePresetBlacklistEntries();
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
    var raw = list.raw;
    var rawEnd = raw.length;

    // rhill 2013-10-21: No need to prefix with '* ', the hostname is just what
    // we need for preset blacklists. The prefix '* ' is ONLY needed when
    // used as a filter in temporary blacklist.

    // rhill 2014-01-22: Transpose possible Adblock Plus-filter syntax
    // into a plain hostname if possible.
    // Useful references:
    //    https://adblockplus.org/en/filter-cheatsheet
    //    https://adblockplus.org/en/filters
    var adblock = /^\[Adblock +Plus\ +\d\.\d]/.test(raw);
    var hostFromAdblockFilter = function(s) {
        var matches = s.match(/^\|\|([a-z0-9.-]+)\^(\$third-party|$)/);
        if ( matches && matches.length > 1 ) {
            return matches[1];
        }
        return '';
    };

    var blacklistReadonly = httpsb.blacklistReadonly;
    var thisListCount = 0;
    var thisListUsedCount = 0;
    var localhostRegex = /(^|\b)(localhost\.localdomain|localhost|local|broadcasthost|0\.0\.0\.0|127\.0\.0\.1|::1|fe80::1%lo0)(\b|$)/g;
    var lineBeg = 0;
    var lineEnd;
    var key, pos;
    while ( lineBeg < rawEnd ) {
        lineEnd = raw.indexOf('\n', lineBeg);
        if ( lineEnd < 0 ) {
            lineEnd = rawEnd;
        }
        key = raw.slice(lineBeg, lineEnd);
        lineBeg = lineEnd + 1;

        // rhill 2014-01-22: Transpose possible Adblock Plus-filter syntax
        // into a plain hostname if possible.
        // Useful reference: https://adblockplus.org/en/filter-cheatsheet#blocking2
        if ( adblock ) {
            if ( key.indexOf('||') !== 0 ) {
                continue;
            }
            key = hostFromAdblockFilter(key);
        }

        pos = key.indexOf('#');
        if ( pos >= 0 ) {
            key = key.slice(0, pos);
        }
        key = key.toLowerCase();
        // https://github.com/gorhill/httpswitchboard/issues/15
        // Ensure localhost et al. don't end up on the read-only blacklist.
        key = key.replace(localhostRegex, ' ');
        key = key.trim();
        if ( !key.length ) {
            continue;
        }
        thisListCount++;
        if ( !blacklistReadonly[key] ) {
            blacklistReadonly[key] = true;
            httpsb.blacklistReadonlyCount++;
            thisListUsedCount++;
        }
    }

    // For convenience, store the number of entries for this
    // blacklist, user might be happy to know this information.
    httpsb.remoteBlacklists[list.url].entryCount = thisListCount;
    httpsb.remoteBlacklists[list.url].entryUsedCount = thisListUsedCount;
}

/******************************************************************************/

// `switches` contains the preset blacklists for which the switch must be
// revisited.

function reloadPresetBlacklists(switches) {
    var presetBlacklists = HTTPSB.remoteBlacklists;

    // Toggle switches
    var i = switches.length;
    while ( i-- ) {
        if ( !presetBlacklists[switches[i].location] ) {
            continue;
        }
        presetBlacklists[switches[i].location].off = !!switches[i].off;
    }

    // Save switch states
    // rhill 2013-12-10: I don't think there is any chance of a
    // read-modify-write issue here, so I won't use storageBufferer
    chrome.storage.local.set({ 'remoteBlacklists': presetBlacklists }, getBytesInUse);

    // Now force reload
    loadRemoteBlacklists();
}

/******************************************************************************/

// Disable all entries.

function disableAllPresetBlacklistEntries() {
    var blacklistReadonly = HTTPSB.blacklistReadonly;
    for ( var hostname in blacklistReadonly ) {
        if ( !blacklistReadonly.hasOwnProperty(hostname) ) {
            continue;
        }
        blacklistReadonly[hostname] = false;
    }
    HTTPSB.blacklistReadonlyCount = 0;
}

/******************************************************************************/

// Remove all entries which are disabled. This result in some memory being
// reclaimed, but not as if the entries were never allocated in the first
// place. Better than nothing.

function prunePresetBlacklistEntries() {
    var blacklistReadonly = HTTPSB.blacklistReadonly;
    for ( var hostname in blacklistReadonly ) {
        if ( blacklistReadonly[hostname] === false && blacklistReadonly.hasOwnProperty(hostname) ) {
            delete blacklistReadonly[hostname];
        }
    }
}

/******************************************************************************/

function loadPublicSuffixList() {
    var list = readLocalTextFile('assets/thirdparties/mxr.mozilla.org/effective_tld_names.dat');
    publicSuffixList.parse(list, punycode.toASCII);
}

/******************************************************************************/

HTTPSB.PresetRecipe = function() {
    this.name = '';
    this.embedded = false;
    this.facode = 0;
    this.keys = {};
    this.whitelist = {};
};

HTTPSB.PresetRecipe.prototype.doesMatch = function(set, pageHostname) {
    var keys = this.keys;
    var pos;
    for ( var k in keys ) {
        if ( !keys.hasOwnProperty(k) ) {
            continue;
        }
        pos = pageHostname.lastIndexOf(k);
        if ( pos >= 0 ) {
            if ( pos === 0 || pageHostname.charAt(pos - 1) === '.' ) {
                if ( this.embedded ) {
                    continue;
                }
            } else {
                if ( !this.embedded ) {
                    continue;
                }
            }
        } else {
            if ( !this.embedded ) {
                continue;
            }
        }
        if ( set[k] !== undefined ) {
            return true;
        }
    }
    return false;
};

HTTPSB.PresetRecipe.prototype.getHash = function() {
    return this.name + '-' + (this.embedded ? '1' : '0') + '-' + Object.keys(this.keys).join('-');
};

HTTPSB.loadPresets = function() {
    var httpsb = this;
    var parseEntry = function(entry) {
        var typeMapper = {
            '*': '*',
            'cookie': 'cookie',
            'img': 'image',
            'image': 'image',
            'css': 'stylesheet',
            'stylesheet': 'stylesheet',
            'plugin': 'object',
            'object': 'object',
            'script': 'script',
            'xhr': 'xmlhttprequest',
            'xmlhttprequest': 'xmlhttprequest',
            'frame': 'sub_frame',
            'sub_frame': 'sub_frame',
            'other': 'other'
        };
        var p = new httpsb.PresetRecipe();
        var lines = entry.split('\n');
        var n = lines.length;
        var context = '';
        var line, pos, fname, fvalue, type, hostname;
        for ( var i = 0; i < n; i++ ) {
            line = lines[i];
            // Remove comment
            pos = line.indexOf('#');
            if ( pos >= 0 ) {
                line = line.slice(0, pos);
            }
            // Split in name & value fields
            pos = line.indexOf(':');
            if ( pos < 0 ) {
                fname = line.trim();
                fvalue = '';
            } else {
                fname = line.slice(0, pos).trim();
                fvalue = line.slice(pos + 1).trim();
            }
            if ( fname === 'name' ) {
                p.name = fvalue;
                context = '';
                continue;
            }
            if ( fname === 'facode' ) {
                p.facode = parseInt(fvalue, 16);
                context = '';
                continue;
            }
            if ( fname === 'embedded' ) {
                p.embedded = true;
                context = '';
                continue;
            }
            if ( fname === 'keys' ) {
                context = 'keys';
                continue;
            }
            if ( fname === 'whitelist' ) {
                context = 'whitelist';
                continue;
            }
            if ( context === 'keys' ) {
                p.keys[fname.toLowerCase()] = true;
                continue;
            }
            if ( context === 'whitelist' ) {
                fname = fname.toLowerCase();
                pos = fname.indexOf(' ');
                // Ignore invalid rules
                if ( pos < 0 )  {
                    continue;
                }
                type = typeMapper[fname.slice(0, pos).trim()];
                hostname = fname.slice(pos).trim();
                // Ignore invalid rules
                if ( type === '' || hostname === '' ) {
                    continue;
                }
                p.whitelist[type + '|' + hostname] = true;
                continue;
            }
            context = '';
        }
        if ( p.name === '' ||
             Object.keys(p.keys).length === 0 ||
             Object.keys(p.whitelist).length === 0 ) {
            return null;
        }
        return p;
    };

    var preset, presetKey;
    var content = readLocalTextFile('assets/httpsb/presets.txt');
    var entries = content.split(/\n\s*\n/);
    var i = entries.length;
    while ( i-- ) {
        preset = parseEntry(entries[i]);
        if ( !preset ) {
            continue;
        }
        this.presets[preset.getHash()] = preset;
    }
};

/******************************************************************************/

// Load white/blacklist

function load() {
    loadUserSettings();
    loadUserLists();
    loadRemoteBlacklists();
    loadPublicSuffixList();
    HTTPSB.loadPresets();
    getBytesInUse();
}

