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

// ORDER IS IMPORTANT

/******************************************************************************/

// hooks to let popup let us know whether page must be reloaded
chrome.extension.onConnect.addListener(function(port) {
    var mustReload = false;
    port.onMessage.addListener(function() {
        mustReload = true;
    });
    port.onDisconnect.addListener(function() {
        if ( mustReload ) {
            chrome.tabs.reload();
        }
    });
});

/******************************************************************************/

// to simplify handling of async stuff
chrome.runtime.onMessage.addListener(function(request, sender, callback) {
    switch ( request.command ) {

    // merge into effective blacklist
    case 'mergeRemoteBlacklist':
        mergeRemoteBlacklist(request.content);
        break;

    // parse remote blacklist
    case 'parseRemoteBlacklist':
        parseRemoteBlacklist(request.location, request.content);
        break;

    // query remoe blacklist
    case 'queryRemoteBlacklist':
        queryRemoteBlacklist(request.location);
        break;

    // local save parsed remote blacklist
    case 'localSaveRemoteBlacklist':
        localSaveRemoteBlacklist(request.location, request.content);
        break;

    // local removal of remote blacklist
    case 'localRemoveRemoteBlacklist':
        localRemoveRemoteBlacklist(request.location);
        break;

    default:
        break;
    }

    callback();
});

/******************************************************************************/

// load user settings
load();
