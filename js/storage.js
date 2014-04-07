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

HTTPSB.getBytesInUse = function() {
    var getBytesInUseHandler = function(bytesInUse) {
        HTTPSB.storageUsed = bytesInUse;
    };
    chrome.storage.local.getBytesInUse(null, getBytesInUseHandler);
};

/******************************************************************************/

HTTPSB.saveUserSettings = function() {
    chrome.storage.local.set(this.userSettings, function() {
        HTTPSB.getBytesInUse();
    });
};

/******************************************************************************/

HTTPSB.loadUserSettings = function() {
    chrome.storage.local.get(this.userSettings, function(store) {
        // console.log('HTTP Switchboard > loaded user settings');
        HTTPSB.userSettings = store;
    });
};

/******************************************************************************/

HTTPSB.loadScopedRules = function() {
    var loadHandler = function(store) {
        var httpsb = HTTPSB;
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
    };

    var defaults = {
        version: this.manifest.version,
        scopes: ''
    };
    chrome.storage.local.get(defaults, loadHandler);
};

/******************************************************************************/

HTTPSB.loadUbiquitousWhitelists = function() {
    var parseUbiquitousWhitelist = function(details) {
        var httpsb = HTTPSB;
        var ubiquitousWhitelist = httpsb.ubiquitousWhitelist;
        var raw = details.content.toLowerCase();
        var rawEnd = raw.length;
        var lineBeg = 0;
        var lineEnd;
        var line, pos;
        ubiquitousWhitelist.reset();
        while ( lineBeg < rawEnd ) {
            lineEnd = raw.indexOf('\n', lineBeg);
            if ( lineEnd < 0 ) {
                lineEnd = rawEnd;
            }
            line = raw.slice(lineBeg, lineEnd);
            lineBeg = lineEnd + 1;
            pos = line.indexOf('#');
            if ( pos >= 0 ) {
                line = line.slice(0, pos);
            }
            line = line.trim();
            if ( !line.length ) {
                continue;
            }
            ubiquitousWhitelist.add(line);
        }
        ubiquitousWhitelist.freeze();
    };

    var onMessageHandler = function(request) {
        if ( !request || !request.what ) {
            return;
        }
        if ( request.what === 'userUbiquitousWhitelistLoaded' ) {
            onLoadedHandler(request);
        }
    };

    var onLoadedHandler = function(details) {
        if ( !details.error ) {
            parseUbiquitousWhitelist(details);
        }
        chrome.runtime.onMessage.removeListener(onMessageHandler);
    };

    chrome.runtime.onMessage.addListener(onMessageHandler);

    // ONLY the user decides what to whitelist uniquitously, so no need
    // for code to handle 3rd-party lists.
    HTTPSB.assets.get(
        'assets/user/ubiquitous-whitelisted-hosts.txt',
        'userUbiquitousWhitelistLoaded'
    );
};

/******************************************************************************/

HTTPSB.loadUbiquitousBlacklists = function() {
    var blacklists;
    var blacklistLoadCount;
    var obsoleteBlacklists = [];

    var onMessageHandler = function(details) {
        if ( !details || !details.what ) {
            return;
        }
        if ( details.what === 'mergeBlacklistedHosts' ) {
            mergeBlacklist(details);
        }
    };

    var removeObsoleteBlacklistsHandler = function(store) {
        if ( !store.remoteBlacklists ) {
            return;
        }
        var location;
        while ( location = obsoleteBlacklists.pop() ) {
            delete store.remoteBlacklists[location];
        }
        chrome.storage.local.set(store);
    };

    var removeObsoleteBlacklists = function() {
        if ( obsoleteBlacklists.length === 0 ) {
            return;
        }
        chrome.storage.local.get(
            { 'remoteBlacklists': HTTPSB.remoteBlacklists },
            removeObsoleteBlacklistsHandler
        );
    };

    var mergeBlacklist = function(details) {
        HTTPSB.mergeBlacklistedHosts(details);
        blacklistLoadCount -= 1;
        if ( blacklistLoadCount === 0 ) {
            loadBlacklistsEnd();
        }
    };

    var loadBlacklistsEnd = function() {
        HTTPSB.ubiquitousBlacklist.freeze();
        HTTPSB.abpFilters.freeze();
        removeObsoleteBlacklists();
        chrome.runtime.onMessage.removeListener(onMessageHandler);
        chrome.runtime.sendMessage({ what: 'loadUbiquitousBlacklistCompleted' });
    };

    var loadBlacklistsStart = function(store) {
        var httpsb = HTTPSB;
        // rhill 2013-12-10: set all existing entries to `false`.
        httpsb.ubiquitousBlacklist.reset();
        httpsb.abpFilters.reset();

        blacklists = store.remoteBlacklists;
        var blacklistLocations = Object.keys(store.remoteBlacklists);

        blacklistLoadCount = blacklistLocations.length;
        if ( blacklistLoadCount === 0 ) {
            loadBlacklistsEnd();
            return;
        }

        // Load each preset blacklist which is not disabled.
        var location;
        while ( location = blacklistLocations.pop() ) {
            // rhill 2014-01-24: HTTPSB-maintained lists sit now in their
            // own directory, "asset/httpsb/". Ensure smooth transition.
            // TODO: Remove this code when everybody upgraded beyond 0.7.7.1
            if ( location === 'assets/httpsb-blacklist.txt' && store.remoteBlacklists[location].off === true ) {
                // In case it was already processed
                httpsb.remoteBlacklists['assets/httpsb/blacklist.txt'].off = true;
                // In case it was not yet processed
                store.remoteBlacklists['assets/httpsb/blacklist.txt'].off = true;
            }
            // If loaded list location is not part of default list locations,
            // remove its entry from local storage.
            if ( !httpsb.remoteBlacklists[location] ) {
                obsoleteBlacklists.push(location);
                blacklistLoadCount -= 1;
                continue;
            }
            // Store details of this preset blacklist
            httpsb.remoteBlacklists[location] = store.remoteBlacklists[location];
            // rhill 2013-12-09:
            // Ignore list if disabled
            // https://github.com/gorhill/httpswitchboard/issues/78
            if ( store.remoteBlacklists[location].off ) {
                blacklistLoadCount -= 1;
                continue;
            }
            HTTPSB.assets.get(location, 'mergeBlacklistedHosts');
        }
    };

    chrome.runtime.onMessage.addListener(onMessageHandler);

    // Get remote blacklist data (which may be saved locally).
    chrome.storage.local.get(
        { 'remoteBlacklists': HTTPSB.remoteBlacklists },
        loadBlacklistsStart
    );
};

/******************************************************************************/

HTTPSB.mergeBlacklistedHosts = function(details) {
    // console.log('HTTP Switchboard > mergeBlacklistedHosts from "%s": "%s..."', details.path, details.content.slice(0, 40));

    var httpsb = HTTPSB;
    var raw = details.content.toLowerCase();
    var rawEnd = raw.length;

    // rhill 2013-10-21: No need to prefix with '* ', the hostname is just what
    // we need for preset blacklists. The prefix '* ' is ONLY needed when
    // used as a filter in temporary blacklist.

    // rhill 2014-01-22: Transpose possible Adblock Plus-filter syntax
    // into a plain hostname if possible.
    // Useful references:
    //    https://adblockplus.org/en/filter-cheatsheet
    //    https://adblockplus.org/en/filters
    var adblock = (/^\[adblock +plus\ +\d\.\d\]/i).test(raw);
    var abpFilters = httpsb.userSettings.parseAllABPFilters ? httpsb.abpFilters : null;
    var hostFromAdblockFilter = function(s) {
        var matches = s.match(/^\|\|([a-z0-9.-]+)\^(\$third-party|$)/);
        if ( matches && matches.length > 1 ) {
            return matches[1];
        }
        return '';
    };

    var ubiquitousBlacklist = httpsb.ubiquitousBlacklist;
    var thisListCount = 0;
    var thisListUsedCount = 0;
    var localhostRegex = /(^|\b)(localhost\.localdomain|localhost|local|broadcasthost|0\.0\.0\.0|127\.0\.0\.1|::1|fe80::1%lo0)(\b|$)/g;
    var lineBeg = 0;
    var lineEnd;
    var line, pos;
    while ( lineBeg < rawEnd ) {
        lineEnd = raw.indexOf('\n', lineBeg);
        if ( lineEnd < 0 ) {
            lineEnd = rawEnd;
        }
        line = raw.slice(lineBeg, lineEnd);
        lineBeg = lineEnd + 1;

        // rhill 2014-01-22: Transpose possible Adblock Plus-filter syntax
        // into a plain hostname if possible.
        // Useful reference: https://adblockplus.org/en/filter-cheatsheet#blocking2
        if ( adblock ) {
            if ( abpFilters && abpFilters.add(line) ) {
                continue;
            }
            line = hostFromAdblockFilter(line);
        }

        pos = line.indexOf('#');
        if ( pos >= 0 ) {
            line = line.slice(0, pos);
        }
        // https://github.com/gorhill/httpswitchboard/issues/15
        // Ensure localhost et al. don't end up on the read-only blacklist.
        line = line.replace(localhostRegex, ' ');
        line = line.trim();
        if ( !line.length ) {
            continue;
        }
        thisListCount++;
        if ( ubiquitousBlacklist.add(line) ) {
            thisListUsedCount++;
        }
    }

    // For convenience, store the number of entries for this
    // blacklist, user might be happy to know this information.
    httpsb.remoteBlacklists[details.path].entryCount = thisListCount;
    httpsb.remoteBlacklists[details.path].entryUsedCount = thisListUsedCount;
};

/******************************************************************************/

// `switches` contains the preset blacklists for which the switch must be
// revisited.

HTTPSB.reloadPresetBlacklists = function(switches) {
    var presetBlacklists = this.remoteBlacklists;

    // Toggle switches
    var i = switches.length;
    while ( i-- ) {
        if ( !presetBlacklists[switches[i].location] ) {
            continue;
        }
        presetBlacklists[switches[i].location].off = !!switches[i].off;
    }

    // Save switch states
    chrome.storage.local.set({ 'remoteBlacklists': presetBlacklists }, function() {
        HTTPSB.getBytesInUse();
    });

    // Now force reload
    this.loadUbiquitousBlacklists();
};

/******************************************************************************/

HTTPSB.loadPublicSuffixList = function() {
    var onMessage = function(request) {
        if ( !request || !request.what ) {
            return;
        }
        if ( request.what === 'publicSuffixListLoaded' ) {
            applyPublicSuffixList(request);
        }
    };
    var applyPublicSuffixList = function(details) {
        if ( !details.error ) {
            publicSuffixList.parse(details.content, punycode.toASCII);
        }
        chrome.runtime.onMessage.removeListener(onMessage);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    this.assets.get(
        'assets/thirdparties/publicsuffix.org/list/effective_tld_names.dat',
        'publicSuffixListLoaded'
    );
};

/******************************************************************************/

// TODO: move to a new file-module, 'asset-loader.js', along with all
// logically related code.

HTTPSB.reloadAllLocalAssets = function() {
    this.loadUbiquitousBlacklists();
    this.loadPublicSuffixList();
    this.reloadAllPresets();
};

/******************************************************************************/

// Load white/blacklist

function load() {
    HTTPSB.loadUserSettings();
    HTTPSB.loadScopedRules();
    HTTPSB.loadUbiquitousBlacklists();
    HTTPSB.loadUbiquitousWhitelists();
    HTTPSB.loadPublicSuffixList();
    HTTPSB.reloadAllPresets();
    HTTPSB.getBytesInUse();
}

