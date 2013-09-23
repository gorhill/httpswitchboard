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
    chrome.storage.sync.set(bin, function() {
        console.log('HTTP Switchboard > saved user white and black lists (%d bytes)', bin.blacklist.length + bin.whitelist.length);
    });
}

/******************************************************************************/

function loadUserLists() {
    var httpsb = HTTPSB;

    chrome.storage.sync.get({ version: '0.1.4', whitelist: '', blacklist: ''}, function(store) {
        console.log('HTTP Switchboard > loadUserLists > loaded user white and black lists');

        if ( store.whitelist ) {
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
            if ( store.version.localeCompare(httpsb.version) < '0.1.3' ) {
                httpsb.blacklistUser = store.blacklist;
            } else {
                populateListFromString(httpsb.blacklistUser, store.blacklist);
            }
        }
        populateListFromList(httpsb.blacklist, httpsb.blacklistUser);
    });
}

/******************************************************************************/

function loadRemoteBlacklists() {
    var httpsb = HTTPSB;
    // v <= 0.1.3
    chrome.storage.local.remove(Object.keys(httpsb.remoteBlacklists));
    chrome.storage.local.remove('remoteBlacklistLocations');

    // get remote blacklist data
    chrome.storage.local.get({ 'remoteBlacklists': httpsb.remoteBlacklists }, function(store) {
        for ( var location in store.remoteBlacklists ) {
            if ( !store.remoteBlacklists.hasOwnProperty(location) ) {
                continue;
            }
            if ( !httpsb.remoteBlacklists[location] ) {
                chrome.runtime.sendMessage({
                    command: 'localRemoveRemoteBlacklist',
                    location: location
                });
            } else if ( store.remoteBlacklists[location].length ) {
                chrome.runtime.sendMessage({
                    command: 'mergeRemoteBlacklist',
                    location: location,
                    content: store.remoteBlacklists[location]
                });
            } else {
                chrome.runtime.sendMessage({
                    command: 'queryRemoteBlacklist',
                    location: location
                });
            }
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
            console.log('HTTP Switchboard > failed to load third party blacklist "%s" from remote location', location);
            return;
        }
        console.log('HTTP Switchboard > queried third party blacklist "%s" from remote location', location);
        chrome.runtime.sendMessage({
            command: 'parseRemoteBlacklist',
            location: location,
            content: remoteData
        });
    });
}

/******************************************************************************/

function parseRemoteBlacklist(location, content) {
    console.log('HTTP Switchboard > parseRemoteBlacklist > "%s"', location);
    content = normalizeRemoteContent('*/', content, '');
    // save locally in order to load efficiently in the future
    chrome.runtime.sendMessage({
        command: 'localSaveRemoteBlacklist',
        location: location,
        content: content
    });
    // convert and merge content into internal representation
    chrome.runtime.sendMessage({
        command: 'mergeRemoteBlacklist',
        location: location,
        content: content
    });
}

/******************************************************************************/

function localSaveRemoteBlacklist(location, content) {
    console.log('HTTP Switchboard > localSaveRemoteBlacklist > "%s"', location);
    // TODO: expiration date
    chrome.storage.local.get({ 'remoteBlacklists': {} }, function(store) {
        store.remoteBlacklists[location] = content;
        chrome.storage.local.set(store);
    });
}

/******************************************************************************/

function localRemoveRemoteBlacklist(location) {
    chrome.storage.local.get({ 'remoteBlacklists': {} }, function(store) {
        delete store.remoteBlacklists[location];
        chrome.storage.local.set(store);
    });
}

/******************************************************************************/

function mergeRemoteBlacklist(content) {
    var httpsb = HTTPSB;
    console.log('HTTP Switchboard > mergeRemoteBlacklist > "%s..."', content.slice(0, 40));
    var list = {};
    populateListFromString(list, content);
    populateListFromList(httpsb.remoteBlacklist, list);
    populateListFromList(httpsb.blacklist, list);
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

