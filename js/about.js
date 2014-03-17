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

var httpsb = chrome.extension.getBackgroundPage().HTTPSB;
var updateList = {};
var assetListSwitches = ['o', 'o', 'o'];
var commitHistoryURLPrefix = 'https://github.com/gorhill/httpswitchboard/commits/master/';

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
    setAssetListClassBit(2, true);
    httpsb.assetUpdater.update(updateList);
};

/******************************************************************************/

var onAllLocalAssetsUpdated = function() {
    httpsb.assetUpdater.getList('dashboardAboutCachedAssetList');
};

/******************************************************************************/

var onMessageHandler = function(request, sender) {
    if ( request && request.what ) {
        switch ( request.what ) {

        case 'dashboardAboutCachedAssetList':
            renderAssetList(request);
            break;

        case 'allLocalAssetsUpdated':
            onAllLocalAssetsUpdated();
            break;
        }
    }
};

/******************************************************************************/

$('#aboutVersion').html(httpsb.manifest.version);
$('#aboutStorageUsed').html(httpsb.storageQuota ? (httpsb.storageUsed / httpsb.storageQuota * 100).toFixed(1) : 0);
$('#aboutAssetsUpdateButton').on('click', updateAssets);

chrome.runtime.onMessage.addListener(onMessageHandler);

httpsb.assetUpdater.getList('dashboardAboutCachedAssetList');

/******************************************************************************/

});
