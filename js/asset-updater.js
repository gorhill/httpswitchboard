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
//
// Asset update manager
//
/******************************************************************************/

(function() {

/******************************************************************************/

var getUpdateList = function(msg) {
    var localChecksumsText = '';
    var remoteChecksumsText = '';

    var onMessage = function(request, sender) {
        if ( !request || !request.what ) {
            return;
        }
        switch ( request.what ) {
        case 'assetManagerLocalAssetChecksumsLoaded':
            localChecksumsText = request.error ? 'Error' : request.content;
            if ( remoteChecksumsText !== '' ) {
                compareChecksums();
            }
            break;
        case 'assetManagerRemoteAssetChecksumsLoaded':
            remoteChecksumsText = request.error ? 'Error' : request.content;
            if ( localChecksumsText !== '' ) {
                compareChecksums();
            }
            break;
        default:
            break;
        }
    };

    var compareChecksums = function() {
        chrome.runtime.onMessage.removeListener(onMessage);

        var parseChecksumsText = function(text) {
            var result = {};
            var lines = text.split(/\n+/);
            var i = lines.length;
            var fields;
            while ( i-- ) {
                fields = lines[i].trim().split(/\s+/);
                if ( fields.length !== 2 ) {
                    continue;
                }
                result[fields[1]] = fields[0];
            }
            return result;
        };
        if ( remoteChecksumsText === 'Error' || localChecksumsText === 'Error' ) {
            remoteChecksumsText = localChecksumsText = '';
        }
        var localAssetChecksums = parseChecksumsText(localChecksumsText);
        var remoteAssetChecksums = parseChecksumsText(remoteChecksumsText);

        var toUpdate = {};
        for ( var path in remoteAssetChecksums ) {
            if ( !remoteAssetChecksums.hasOwnProperty(path) ) {
                continue;
            }
            if ( localAssetChecksums[path] === undefined ) {
                toUpdate[path] = {
                    status: 'Added',
                    remoteChecksum: remoteAssetChecksums[path],
                    localChecksum: ''
                };
                continue;
            }
            if ( localAssetChecksums[path] === remoteAssetChecksums[path] ) {
                toUpdate[path] = {
                    status: 'Unchanged',
                    remoteChecksum: remoteAssetChecksums[path],
                    localChecksum: localAssetChecksums[path]
                };
                continue;
            }
            toUpdate[path] = {
                status: 'Changed',
                remoteChecksum: remoteAssetChecksums[path],
                localChecksum: localAssetChecksums[path]
            };
        }
        for ( var path in localAssetChecksums ) {
            if ( !localAssetChecksums.hasOwnProperty(path) ) {
                continue;
            }
            if ( remoteAssetChecksums[path] === undefined ) {
                toUpdate[path] = {
                    status: 'Removed',
                    remoteChecksum: '',
                    localChecksum: localAssetChecksums[path]
                };
            }
        }

        chrome.runtime.sendMessage({
            'what': msg,
            'list': toUpdate
        });
    };

    chrome.runtime.onMessage.addListener(onMessage);
    HTTPSB.assets.getRemote('assets/checksums.txt', 'assetManagerRemoteAssetChecksumsLoaded');
    HTTPSB.assets.get('assets/checksums.txt', 'assetManagerLocalAssetChecksumsLoaded');
};

/******************************************************************************/

var updateList = function(list) {
    var assetToUpdateCount = Object.keys(list).length;
    var updatedAssetChecksums = [];

    var onMessage = function(request, sender) {
        if ( !request || !request.what ) {
            return;
        }
        switch ( request.what ) {
        case 'assetManagerLocalAssetUpdated':
            onLocalAssetUpdated(request);
            break;
        case 'assetManagerAllLocalAssetsUpdated':
            onAllLocalAssetUpdated(request);
            break;
        default:
            break;
        }
    };

    var onLocalAssetUpdated = function(details) {
        var path = details.path;
        var entry = list[path];
        if ( details.error ) {
            updatedAssetChecksums.push(entry.localChecksum + ' ' + path);
        } else {
            updatedAssetChecksums.push(entry.remoteChecksum + ' ' + path);
        }
        assetToUpdateCount -= 1;
        if ( assetToUpdateCount > 0 ) {
            return;
        }
        HTTPSB.assets.put('assets/checksums.txt', updatedAssetChecksums.join('\n'), 'assetManagerAllLocalAssetsUpdated');
    };

    var onAllLocalAssetUpdated = function(details) {
        chrome.runtime.onMessage.removeListener(onMessage);
        chrome.runtime.sendMessage({
            'what': 'allLocalAssetsUpdated'
        });
    };

    chrome.runtime.onMessage.addListener(onMessage);

    var entry;
    for ( var path in list ) {
        if ( !list.hasOwnProperty(path) ) {
            continue;
        }
        entry = list[path];
        if ( entry.status === 'New' || entry.status === 'Changed' ) {
            HTTPSB.assets.update(path, 'assetManagerLocalAssetUpdated');
        } else {
            if ( entry.status === 'Unchanged' ) {
                updatedAssetChecksums.push(entry.localChecksum + ' ' + path);
            }
            assetToUpdateCount -= 1;
        }
    }
};

/******************************************************************************/

// Export API

HTTPSB.assetUpdater = {
    'getList': getUpdateList,
    'update': updateList
};

/******************************************************************************/

})();

/******************************************************************************/

