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

/* global chrome, HTTPSB, punycode, publicSuffixList */

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
    var settingsLoaded = function(store) {
        // console.log('HTTP Switchboard > loaded user settings');

        // Ensure backward-compatibility
        // https://github.com/gorhill/httpswitchboard/issues/229
        if ( store.smartAutoReload === true ) {
            store.smartAutoReload = 'all';
        } else if ( store.smartAutoReload === false ) {
            store.smartAutoReload = 'none';
        }
        // https://github.com/gorhill/httpswitchboard/issues/250
        if ( typeof store.autoCreateSiteScope === 'boolean' ) {
            store.autoCreateScope = store.autoCreateSiteScope ? 'site' : '';
            delete store.autoCreateSiteScope;
        }
        // https://github.com/gorhill/httpswitchboard/issues/299
        // No longer needed.
        delete store.subframeFgColor;

        HTTPSB.userSettings = store;
    };

    chrome.storage.local.get(this.userSettings, settingsLoaded);
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
            httpsb.toggleTemporaryMtxFiltering(httpsb.behindTheSceneScopeKey, false);
            httpsb.toggleTemporaryABPFiltering(httpsb.behindTheSceneScopeKey, false);
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
            var httpsb = HTTPSB;
            httpsb.ubiquitousWhitelist.reset();
            httpsb.mergeUbiquitousWhitelist(details);
            httpsb.ubiquitousWhitelist.freeze();
        }
        chrome.runtime.onMessage.removeListener(onMessageHandler);
    };

    chrome.runtime.onMessage.addListener(onMessageHandler);

    // ONLY the user decides what to whitelist uniquitously, so no need
    // for code to handle 3rd-party lists.
    this.assets.get(
        'assets/user/ubiquitous-whitelisted-hosts.txt',
        'userUbiquitousWhitelistLoaded'
    );
};

/******************************************************************************/

HTTPSB.mergeUbiquitousWhitelist = function(details) {
    var ubiquitousWhitelist = this.ubiquitousWhitelist;
    var reAdblockHideFilter = /#@#/;
    var reAdblockNetFilter = /^@@/;
    var abpNetFilters = this.userSettings.parseAllABPFilters ? this.abpFilters : null;
    var abpHideFilters = this.userSettings.parseAllABPHideFilters ? this.abpHideFilters : null;
    var rawText = details.content;
    var rawEnd = rawText.length;
    var lineBeg = 0;
    var lineEnd;
    var line, pos, c;
    while ( lineBeg < rawEnd ) {
        lineEnd = rawText.indexOf('\n', lineBeg);
        if ( lineEnd < 0 ) {
            lineEnd = rawText.indexOf('\r', lineBeg);
            if ( lineEnd < 0 ) {
                lineEnd = rawEnd;
            }
        }
        line = rawText.slice(lineBeg, lineEnd).trim();
        lineBeg = lineEnd + 1;

        if ( reAdblockHideFilter.test(line) ) {
            if ( abpHideFilters !== null ) {
                abpHideFilters.add(line);
            }
            continue;
        }

        c = line.charAt(0);
        if ( c === '#' || c === '!' ) {
            continue;
        }

        pos = line.indexOf('#');
        if ( pos >= 0 ) {
            line = line.slice(0, pos).trim();
        }

        if ( line === '' ) {
            continue;
        }

        line = line.toLowerCase();

        if ( reAdblockNetFilter.test(line) ) {
            if ( abpNetFilters !== null ) {
                abpNetFilters.add(line);
            }
            continue;
        }

        ubiquitousWhitelist.add(line);
    }
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
        if ( details.what === 'mergeUbiquitousBlacklist' ) {
            mergeBlacklist(details);
            return;
        }
        if ( details.what === 'listOfBlockListsLoaded' ) {
            onListOfBlockListsLoaded(details);
            return;
        }
    };
    chrome.runtime.onMessage.addListener(onMessageHandler);

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
        HTTPSB.mergeUbiquitousBlacklist(details);
        blacklistLoadCount -= 1;
        if ( blacklistLoadCount === 0 ) {
            loadBlacklistsEnd();
        }
    };

    var loadBlacklistsEnd = function() {
        HTTPSB.ubiquitousBlacklist.freeze();
        HTTPSB.abpFilters.freeze();
        HTTPSB.abpHideFilters.freeze();
        removeObsoleteBlacklists();
        chrome.runtime.onMessage.removeListener(onMessageHandler);
        chrome.runtime.sendMessage({ what: 'loadUbiquitousBlacklistCompleted' });
    };

    var loadBlacklistsStart = function(store) {
        var httpsb = HTTPSB;
        // rhill 2013-12-10: set all existing entries to `false`.
        httpsb.ubiquitousBlacklist.reset();
        httpsb.abpFilters.reset();
        httpsb.abpHideFilters.reset();
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
            // If loaded list location is not part of default list locations,
            // remove its entry from local storage.
            if ( !httpsb.remoteBlacklists[location] ) {
                obsoleteBlacklists.push(location);
                blacklistLoadCount -= 1;
                continue;
            }
            // https://github.com/gorhill/httpswitchboard/issues/218
            // Transfer potentially existing list title into restored list data.
            if ( store.remoteBlacklists[location].title !== httpsb.remoteBlacklists[location].title ) {
                store.remoteBlacklists[location].title = httpsb.remoteBlacklists[location].title;
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
            httpsb.assets.get(location, 'mergeUbiquitousBlacklist');
        }
    };

    var onListOfBlockListsLoaded = function(details) {
        var httpsb = HTTPSB;
        // Initialize built-in list of 3rd-party block lists.
        var lists = JSON.parse(details.content);
        for ( var location in lists ) {
            if ( lists.hasOwnProperty(location) === false ) {
                continue;
            }
            httpsb.remoteBlacklists['assets/thirdparties/' + location] = lists[location];
        }
        // Now get user's selection of list of block lists.
        chrome.storage.local.get(
            { 'remoteBlacklists': httpsb.remoteBlacklists },
            loadBlacklistsStart
        );
    };

    // Reset list of 3rd-party block lists.
    for ( var location in this.remoteBlacklists ) {
        if ( location.indexOf('assets/thirdparties/') === 0 ) {
            delete this.remoteBlacklists[location];
        }
    }

    // Get new list of 3rd-party block lists.
    this.assets.get('assets/httpsb/ubiquitous-block-lists.json', 'listOfBlockListsLoaded');
};

/******************************************************************************/

HTTPSB.mergeUbiquitousBlacklist = function(details) {
    // console.log('HTTP Switchboard > mergeUbiquitousBlacklist from "%s": "%s..."', details.path, details.content.slice(0, 40));

    var rawText = details.content;
    var rawEnd = rawText.length;

    // rhill 2013-10-21: No need to prefix with '* ', the hostname is just what
    // we need for preset blacklists. The prefix '* ' is ONLY needed when
    // used as a filter in temporary blacklist.

    // rhill 2014-01-22: Transpose possible Adblock Plus-filter syntax
    // into a plain hostname if possible.
    // Useful references:
    //    https://adblockplus.org/en/filter-cheatsheet
    //    https://adblockplus.org/en/filters
    var abpFilters = this.userSettings.parseAllABPFilters ? this.abpFilters : null;
    var abpHideFilters = this.userSettings.parseAllABPHideFilters ? this.abpHideFilters : null;
    var ubiquitousBlacklist = this.ubiquitousBlacklist;
    var thisListCount = 0;
    var thisListUsedCount = 0;
    var reLocalhost = /(^|\s)(localhost\.localdomain|localhost|local|broadcasthost|0\.0\.0\.0|127\.0\.0\.1|::1|fe80::1%lo0)(?=\s|$)/g;
    var reAdblockFilter = /^[^a-z0-9:]|[^a-z0-9]$|[^a-z0-9_:.-]/;
    var reAdblockHostFilter = /^\|\|([a-z0-9.-]+[a-z0-9])\^?$/;
    var reAsciiSegment = /^[\x21-\x7e]+$/;
    var matches;
    var lineBeg = 0, lineEnd, currentLineBeg;
    var line, c;

    while ( lineBeg < rawEnd ) {
        lineEnd = rawText.indexOf('\n', lineBeg);
        if ( lineEnd < 0 ) {
            lineEnd = rawText.indexOf('\r', lineBeg);
            if ( lineEnd < 0 ) {
                lineEnd = rawEnd;
            }
        }

        // rhill 2014-04-18: The trim is important here, as without it there
        // could be a lingering `\r` which would cause problems in the
        // following parsing code.
        line = rawText.slice(lineBeg, lineEnd).trim();
        currentLineBeg = lineBeg;
        lineBeg = lineEnd + 1;

        // Strip comments
        c = line.charAt(0);
        if ( c === '!' || c === '[' ) {
            continue;
        }

        // 2014-05-18: ABP element hide filters are allowed to contain space
        // characters
        if ( abpHideFilters !== null ) {
            if ( abpHideFilters.add(line) ) {
                continue;
            }
        }

        if ( c === '#' ) {
            continue;
        }

        // https://github.com/gorhill/httpswitchboard/issues/15
        // Ensure localhost et al. don't end up in the ubiquitous blacklist.
        line = line
            .replace(/\s+#.*$/, '')
            .toLowerCase()
            .replace(reLocalhost, '')
            .trim();

        // The filter is whatever sequence of printable ascii character without
        // whitespaces
        matches = reAsciiSegment.exec(line);
        if ( !matches || matches.length === 0 ) {
            continue;
        }

        // Bypass anomalies
        // For example, when a filter contains whitespace characters, or
        // whatever else outside the range of printable ascii characters.
        if ( matches[0] !== line ) {
            // console.error('"%s": "%s" !== "%s"', details.path, matches[0], line);
            continue;
        }

        line = matches[0];

        // Likely an ABP net filter?
        if ( reAdblockFilter.test(line) ) {
            if ( abpFilters !== null ) {
                if ( abpFilters.add(line) ) {
                    continue;
                }
            }
            // rhill 2014-01-22: Transpose possible Adblock Plus-filter syntax
            // into a plain hostname if possible.
            matches = reAdblockHostFilter.exec(line);
            if ( !matches || matches.length < 2 ) {
                continue;
            }
            line = matches[1];
        }

        if ( line === '' ) {
            continue;
        }

        thisListCount++;
        if ( ubiquitousBlacklist.add(line) ) {
            thisListUsedCount++;
        }
    }

    // For convenience, store the number of entries for this
    // blacklist, user might be happy to know this information.
    this.remoteBlacklists[details.path].entryCount = thisListCount;
    this.remoteBlacklists[details.path].entryUsedCount = thisListUsedCount;
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

HTTPSB.reloadAllLocalAssets = function() {
    this.loadUbiquitousBlacklists();
    this.loadPublicSuffixList();
    this.reloadAllPresets();
};

/******************************************************************************/

// Load all

HTTPSB.load = function() {
    // user
    this.loadUserSettings();
    this.loadScopedRules();
    this.loadUbiquitousBlacklists();
    this.loadUbiquitousWhitelists();

    // system
    this.loadPublicSuffixList();
    this.reloadAllPresets();
    this.getBytesInUse();
};

