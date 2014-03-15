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

/******************************************************************************/

// Local scope

(function() {

/******************************************************************************/

var firstInstall = false;
var presetsLoaded = false;

/******************************************************************************/

var onInstalledHandler = function(details) {
    if ( details.reason !== 'install' ) {
        return;
    }
    firstInstall = true;
    operaFirstInstall();
};

chrome.runtime.onInstalled.addListener(onInstalledHandler);

/******************************************************************************/

var onMessageHandler = function(request) {
    if ( !request || !request.what || request.what !== '1stPartyPresetRecipesLoaded' ) {
        return;
    }
    presetsLoaded = true;
    operaFirstInstall();
};

chrome.runtime.onMessage.addListener(onMessageHandler);

/******************************************************************************/

var operaFirstInstall = function() {
    if ( !firstInstall || !presetsLoaded ) {
        return;
    }

    chrome.runtime.onMessage.removeListener(onMessageHandler);
    chrome.runtime.onInstalled.removeListener(onInstalledHandler);

    // rhill 2014-01-29: Opera requires that Youtube works out-of-the-box.
    // Actually, why not do that for everybody, not just Opera.
    var httpsb = HTTPSB;
    if ( httpsb.isOpera() ) {
        httpsb.presetManager.applyFromPresetName('Youtube');
        httpsb.commitPermissions(true);
    }
};

/******************************************************************************/

})();

/******************************************************************************/

