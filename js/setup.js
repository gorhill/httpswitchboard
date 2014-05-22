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

$(function() {

/******************************************************************************/

var getHTTPSB = function() {
    return chrome.extension.getBackgroundPage().HTTPSB;
};

/******************************************************************************/

var restoreUserDataFromFile = function() {
    var setupElem = $(this).parents('.setup');
    var inputElem = setupElem.find('input[type="hidden"]');
    if ( inputElem.length === 0 ) {
        return;
    }
    var setupUrl = chrome.runtime.getURL(inputElem.val());

    var restoreBackup = function(data) {
        var httpsb = getHTTPSB();
        chrome.storage.local.set(data.userSettings);
        var store = {
            'version': data.version,
            'scopes': data.scopes
        };
        // This case may happen if data was backed up without the user having
        // changed default selection of lists.
        if ( data.remoteBlacklists !== undefined ) {
            store.remoteBlacklists = data.remoteBlacklists;
        }
        chrome.storage.local.set(store);
        httpsb.assets.put(httpsb.userBlacklistPath, data.ubiquitousBlacklist, 'restoreUserDataFromFileUserRestartCountdown');
        httpsb.assets.put(httpsb.userWhitelistPath, data.ubiquitousWhitelist, 'restoreUserDataFromFileUserRestartCountdown');
    };

    var validateBackup = function(s) {
        var data;
        try {
            data = JSON.parse(s);
        }
        catch (e) {
            data = undefined;
        }
        if ( typeof data !== 'object' ||
             typeof data.timeStamp !== 'number' ||
             typeof data.version !== 'string' ||
             typeof data.userSettings !== 'object' ||
             typeof data.scopes !== 'string' ||
             typeof data.ubiquitousBlacklist !== 'string' ||
             typeof data.ubiquitousWhitelist !== 'string' ) {
            alert('File content is not valid backed up data.');
        }
        return data;
    };

    var onLoadHandler = function() {
        var data = validateBackup(this.responseText);
        if ( !data ) {
            return;
        }
        var time = new Date(data.timeStamp);
        var msg = chrome.i18n.getMessage('setupRestoreConfirm');
        var proceed = window.confirm(msg);
        if ( proceed ) {
            restoreBackup(data);
        }
    };

    var getSetupDataFromURL = function(url, onLoad, onError) {
        // console.log('HTTP Switchboard> getTextFileFromURL("%s"):', url);
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'text';
        xhr.onload = onLoad;
        xhr.onerror = onError;
        xhr.ontimeout = onError;
        xhr.open('get', url, true);
        xhr.send();
    };


    var restartCountdown = 2;
    var onMessageHandler = function(request) {
        if ( !request || !request.what ) {
            return;
        }
        if ( request.what === 'restoreUserDataFromFileUserRestartCountdown' ) {
            restartCountdown -= 1;
            if ( restartCountdown > 0 ) {
                return;
            }
        }
        chrome.runtime.onMessage.removeListener(onMessageHandler);
        chrome.runtime.reload();
    };

    chrome.runtime.onMessage.addListener(onMessageHandler);

    getSetupDataFromURL(setupUrl, onLoadHandler, function(){});
};

$('.setup img').on('click', restoreUserDataFromFile);

/******************************************************************************/

});
