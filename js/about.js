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

var updateList = {};
var assetListSwitches = ['o', 'o', 'o'];
var commitHistoryURLPrefix = 'https://github.com/gorhill/httpswitchboard/commits/master/';

/******************************************************************************/

var getHTTPSB = function() {
    return chrome.extension.getBackgroundPage().HTTPSB;
};

/******************************************************************************/

var backupUserDataToFile = function() {
    var httpsb = getHTTPSB();

    var allUserData = {
        timeStamp: Date.now(),
        version: '',
        userSettings: {},
        scopes: '',
        remoteBlacklists: {},
        ubiquitousBlacklist: '',
        ubiquitousWhitelist: ''
    };

    var userWhitelistReady = function(details) {
        allUserData.ubiquitousWhitelist = details.content;
        chrome.downloads.download({
            'url': 'data:text/plain,' + encodeURIComponent(JSON.stringify(allUserData)),
            'filename': 'httpsb-alluserdata-backup.txt',
            'saveAs': true
        });
    };

    var userBlacklistReady = function(details) {
        allUserData.ubiquitousBlacklist = details.content;
        httpsb.assets.get(httpsb.userWhitelistPath, userWhitelistReady);
    };

    var ruleDataReady = function(store) {
        allUserData.version = store.version;
        allUserData.scopes = store.scopes;
        allUserData.remoteBlacklists = store.remoteBlacklists;
        httpsb.assets.get(httpsb.userBlacklistPath, userBlacklistReady);
    };

    var userSettingsReady = function(store) {
        allUserData.userSettings = store;
        chrome.storage.local.get(['version', 'scopes', 'remoteBlacklists'], ruleDataReady);
    };

    chrome.storage.local.get(httpsb.userSettings, userSettingsReady);
};

/******************************************************************************/

var restoreUserDataFromFile = function() {
    var input = $('<input />').attr({
        type: 'file',
        accept: 'text/plain'
    });

    var restartCountdown = 2;
    var doCountdown = function() {
        restartCountdown -= 1;
        if ( restartCountdown > 0 ) {
            return;
        }
        chrome.runtime.reload();
    };

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
        httpsb.assets.put(httpsb.userBlacklistPath, data.ubiquitousBlacklist, doCountdown);
        httpsb.assets.put(httpsb.userWhitelistPath, data.ubiquitousWhitelist, doCountdown);
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

    var fileReaderOnLoadHandler = function() {
        var data = validateBackup(this.result);
        if ( !data ) {
            return;
        }
        var time = new Date(data.timeStamp);
        var msg = chrome.i18n
            .getMessage('aboutUserDataRestoreConfirm')
            .replace('{{time}}', time.toLocaleString());
        var proceed = window.confirm(msg);
        if ( proceed ) {
            restoreBackup(data);
        }
    };

    var filePickerOnChangeHandler = function() {
        $(this).off('change', filePickerOnChangeHandler);
        var file = this.files[0];
        if ( !file ) {
            return;
        }
        if ( file.type.indexOf('text') !== 0 ) {
            return;
        }
        var fr = new FileReader();
        fr.onload = fileReaderOnLoadHandler;
        fr.readAsText(file);
        input.off('change', filePickerOnChangeHandler);
    };

    input.on('change', filePickerOnChangeHandler);
    input.trigger('click');
};

/******************************************************************************/

var resetUserData = function() {
    chrome.runtime.sendMessage({
        what: 'gotoExtensionURL',
        url: 'setup.html'
    });
};

/******************************************************************************/

var setAssetListClassBit = function(bit, state) {
    assetListSwitches[assetListSwitches.length-1-bit] = !state ? 'o' : 'x';
    $('#assetList')
        .removeClass()
        .addClass(assetListSwitches.join(''));
};

/******************************************************************************/

var renderAssetList = function(details) {
    var dirty = false;
    var paths = Object.keys(details.list).sort();
    if ( paths.length > 0 ) {
        $('#assetList .assetEntry').remove();
        var assetTable = $('#assetList table');
        var i = 0;
        var path, status, html;
        while ( path = paths[i++] ) {
            status = details.list[path].status;
            dirty = dirty || status !== 'Unchanged';
            html = [];
            html.push('<tr class="assetEntry ' + status.toLowerCase().replace(/ +/g, '-') + '">');
            html.push('<td>');
            html.push('<a href="' + commitHistoryURLPrefix + path + '">');
            html.push(path.replace(/^(assets\/[^/]+\/)(.+)$/, '$1<b>$2</b>'));
            html.push('</a>');
            html.push('<td>');
            html.push(chrome.i18n.getMessage('aboutAssetsUpdateStatus' + status));
            assetTable.append(html.join(''));
        }
        $('#assetList a').attr('target', '_blank');
        updateList = details.list;
    }
    setAssetListClassBit(0, paths.length !== 0);
    setAssetListClassBit(1, dirty);
    setAssetListClassBit(2, false);
};

/******************************************************************************/

var updateAssets = function() {
    var httpsb = getHTTPSB();
    setAssetListClassBit(2, true);
    var onDone = function() {
        httpsb.loadUpdatableAssets(false);
    };
    httpsb.assetUpdater.update(updateList, onDone);
};

/******************************************************************************/

var updateAssetsList = function() {
    getHTTPSB().assetUpdater.getList(renderAssetList);
};

/******************************************************************************/

// Updating all assets could be done from elsewhere and if so the
// list here needs to be updated.

var onMessage = function(request) {
    if ( request && request.what === 'allLocalAssetsUpdated' ) {
        updateAssetsList();
    }
};
chrome.runtime.onMessage.addListener(onMessage);

/******************************************************************************/

(function() {
    var httpsb = getHTTPSB();
    $('#aboutVersion').html(httpsb.manifest.version);
    $('#aboutStorageUsed').html(chrome.i18n.getMessage('aboutStorageUsed').replace('{{storageUsed}}', httpsb.storageQuota ? (httpsb.storageUsed / httpsb.storageQuota * 100).toFixed(1) : 0));
})();

/******************************************************************************/

$('#aboutAssetsUpdateButton').on('click', updateAssets);
$('#backupUserDataButton').on('click', backupUserDataToFile);
$('#restoreUserDataButton').on('click', restoreUserDataFromFile);
$('#resetUserDataButton').on('click', resetUserData);

/******************************************************************************/

updateAssetsList();

/******************************************************************************/

});
