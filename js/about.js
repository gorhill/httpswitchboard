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

/******************************************************************************/

var renderTime = function(time) {
    // value => minutes
    var value = (Date.now() - time) / 60000;
    if ( value < 1 ) {
        return 'just now';
    }
    if ( value < 60 ) {
        return Math.ceil(value) + ' minutes ago';
    }
    // value => hours
    value /= 60;
    if ( value < 24 ) {
        return Math.ceil(value) + ' hours ago';
    }
    // value => days
    value /= 24;
    return Math.ceil(value) + ' days ago';
};

/******************************************************************************/

var renderAssetList = function(details) {
    var paths = Object.keys(details.list).sort();
    if ( !paths.length ) {
        $('#assetList').addClass('error');
        return;
    }
    $('#assetList .assetEntry').remove();

    var assetTable = $('#assetList table');
    var i = 0;
    var upToDate = true;
    var path, status, html;
    while ( path = paths[i++] ) {
        status = details.list[path].status;
        upToDate = upToDate && status === 'Unchanged';
        html = [];
        html.push('<tr class="assetEntry ' + status.toLowerCase().replace(/ +/g, '-') + '">');
        html.push('<td>');
        html.push('<a href="https://raw2.github.com/gorhill/httpswitchboard/master/' + path + '">');
        html.push(path.replace(/^(assets\/[^/]+\/)(.+)$/, '$1<b>$2</b>'));
        html.push('</a>');
        html.push('<td>');
        html.push(chrome.i18n.getMessage('aboutUpdateStatus' + status));
        assetTable.append(html.join(''));
    }

    $('#assetList').toggleClass('up-to-date', upToDate);
    $('#assetList a').attr('target', '_blank');

    updateList = details.list;
};

/******************************************************************************/

var updateAssets = function() {
    httpsb.assetUpdater.update(updateList);
};

/******************************************************************************/

var onAllLocalAssetsUpdated = function() {
    httpsb.assetUpdater.getList('dashboardAboutCachedAssetList');
    $('#allLocalAssetsUpdated').text(chrome.i18n.getMessage('aboutUpdateSuccess'));
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

$('#version').html(httpsb.manifest.version);
$('#storageUsed').html(httpsb.storageQuota ? (httpsb.storageUsed / httpsb.storageQuota * 100).toFixed(1) : 0);
$('#aboutAssetsUpdateButton').on('click', updateAssets);

chrome.runtime.onMessage.addListener(onMessageHandler);

httpsb.assetUpdater.getList('dashboardAboutCachedAssetList');

/******************************************************************************/

});
