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

// Enable/disable javascript for a specific hostname.

/*
function setJavascriptCallback(windows, hostname, setting) {
    // Need to do this to avoid "You cannot set a preference with scope
    // 'incognito_session_only' when no incognito window is open."
    var i = windows.length;
    while ( i-- ) {
        if ( windows[i].incognito ) {
            chrome.contentSettings.javascript.set({
                scope: 'incognito_session_only',
                primaryPattern: hostname,
                setting: setting
            });
            break;
        }
    }
}

function setJavascript(hostname, state) {
    var hostname = '*://' + hostname + '/*';
    var setting = state ? 'allow' : 'block';
    chrome.contentSettings.javascript.set({
        primaryPattern: hostname,
        setting: setting
    });
    // Apply to incognito scope as well:
    // https://github.com/gorhill/httpswitchboard/issues/53
    // Until chromium fixes:
    //   https://code.google.com/p/chromium/issues/detail?id=319400
    chrome.windows.getAll(function(windows) {
        setJavascriptCallback(windows, hostname, setting);
    });
}
*/
