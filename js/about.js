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

var renderAssetList = function(entries) {
    var html = [];

    if ( entries.length ) {
        var i = 0;
        var entry;
        html.push('<table>');
        html.push('<tr>');
        html.push('<th>Path');
        html.push('<th>Updated');
        while ( entry = entries[i] ) {
            html.push('<tr>');
            html.push('<td>');
            html.push('<a href="https://raw2.github.com/gorhill/httpswitchboard/master/' + entry.path + '">' + entry.path + '</a>');
            html.push('<td>');
            html.push(renderTime(entry.modificationTime));
            html.push('<br>');
            i++;
        }
        html.push('</table>');
    } else {
        html.push('No assets have been updated from built-in versions');
    }
    $('#assetList').html(html.join(''));
    $('#assetList a').attr('target', '_blank');
};

/******************************************************************************/

var updateAssets = function() {
    httpsb.startUpdateAssets();
};

/******************************************************************************/

var onAllLocalAssetsUpdated = function() {
    httpsb.assets.getEntries('dashboardAboutCachedAssetList');
    $('#allLocalAssetsUpdated').text('All local assets have been updated.');
};

/******************************************************************************/

var onMessageHandler = function(request, sender) {
    if ( request && request.what ) {
        switch ( request.what ) {

        case 'dashboardAboutCachedAssetList':
            renderAssetList(request.entries);
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

httpsb.assets.getEntries('dashboardAboutCachedAssetList');

/******************************************************************************/

});
