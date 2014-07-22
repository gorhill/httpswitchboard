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

/* global chrome, HTTPSB, YaMD5 */

/*******************************************************************************

Assets
    Read:
        If in cache
            Use cache
        If not in cache
            Use local
    Update:
        Use remote
        Save in cache

    Import:
        Use textarea
        Save in cache [user directory]

File system structure:
    assets
        httpsb
            ...
        thirdparties
            ...
        user
            blacklisted-hosts.txt
                ...

*/

// Ref: http://www.w3.org/TR/2012/WD-file-system-api-20120417/
// Ref: http://www.html5rocks.com/en/tutorials/file/filesystem/

/******************************************************************************/

// Low-level asset files manager

HTTPSB.assets = (function() {

/******************************************************************************/

var fileSystem;
var fileSystemQuota = 40 * 1024 * 1024;
var remoteRoot = HTTPSB.projectServerRoot;
var nullFunc = function() {};

/******************************************************************************/

var cachedAssetsManager = (function() {
    var exports = {};
    var entries = null;
    var cachedAssetPathPrefix = 'cached_asset_content://';

    var getEntries = function(callback) {
        if ( entries !== null ) {
            callback(entries);
            return;
        }
        var onLoaded = function(bin) {
            if ( chrome.runtime.lastError ) {
                console.error(
                    'HTTP Switchboard> cachedAssetsManager> getEntries():',
                    chrome.runtime.lastError.message
                );
            }
            entries = bin.cached_asset_entries || {};
            callback(entries);
        };
        chrome.storage.local.get('cached_asset_entries', onLoaded);
    };

    exports.load = function(path, cbSuccess, cbError) {
        cbSuccess = cbSuccess || nullFunc;
        cbError = cbError || cbSuccess;
        var details = {
            'path': path,
            'content': ''
        };
        var cachedContentPath = cachedAssetPathPrefix + path;
        var onLoaded = function(bin) {
            if ( chrome.runtime.lastError ) {
                details.error = 'Error: ' + chrome.runtime.lastError.message;
                console.error('HTTP Switchboard> cachedAssetsManager.load():', details.error);
                cbError(details);
            } else {
                details.content = bin[cachedContentPath];
                cbSuccess(details);
            }
        };
        var onEntries = function(entries) {
            if ( entries[path] === undefined ) {
                details.error = 'Error: not found';
                cbError(details);
                return;
            }
            chrome.storage.local.get(cachedContentPath, onLoaded);
        };
        getEntries(onEntries);
    };

    exports.save = function(path, content, cbSuccess, cbError) {
        cbSuccess = cbSuccess || nullFunc;
        cbError = cbError || cbSuccess;
        var details = {
            path: path,
            content: content
        };
        var cachedContentPath = cachedAssetPathPrefix + path;
        var bin = {};
        bin[cachedContentPath] = content;
        var onSaved = function() {
            if ( chrome.runtime.lastError ) {
                details.error = 'Error: ' + chrome.runtime.lastError.message;
                console.error('HTTP Switchboard> cachedAssetsManager.save():', details.error);
                cbError(details);
            } else {
                cbSuccess(details);
            }
        };
        var onEntries = function(entries) {
            if ( entries[path] === undefined ) {
                entries[path] = true;
                bin.cached_asset_entries = entries;
            }
            chrome.storage.local.set(bin, onSaved);
        };
        getEntries(onEntries);
    };

    exports.remove = function(pattern) {
        var onEntries = function(entries) {
            var keystoRemove = [];
            var paths = Object.keys(entries);
            var i = paths.length;
            var path;
            while ( i-- ) {
                path = paths[i];
                if ( typeof pattern === 'string' && path !== pattern ) {
                    continue;
                }
                if ( pattern instanceof RegExp && !pattern.test(path) ) {
                    continue;
                }
                keystoRemove.push(cachedAssetPathPrefix + path);
                delete entries[path];
            }
            if ( keystoRemove.length ) {
                chrome.storage.local.remove(keystoRemove);
                chrome.storage.local.set({ 'cached_asset_entries': entries });
            }
        };
        getEntries(onEntries);
    };

    return exports;
})();

/******************************************************************************/

var getTextFileFromURL = function(url, onLoad, onError) {
    // console.log('HTTP Switchboard> getTextFileFromURL("%s"):', url);
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'text';
    xhr.onload = onLoad;
    xhr.onerror = onError;
    xhr.ontimeout = onError;
    xhr.open('get', url, true);
    xhr.send();
};

/******************************************************************************/

// https://github.com/gorhill/httpswitchboard/issues/379
// Remove when I am confident everybody moved to the new storage

// Useful to avoid having to manage a directory tree

var cachePathFromPath = function(path) {
    return path.replace(/\//g, '___');
};

/******************************************************************************/

// https://github.com/gorhill/httpswitchboard/issues/379
// Remove when I am confident everybody moved to the new storage

var requestFileSystem = function(onSuccess, onError) {
    if ( fileSystem ) {
        onSuccess(fileSystem);
        return;
    }

    var onRequestFileSystem = function(fs) {
        fileSystem = fs;
        onSuccess(fs);
    };

    var onRequestQuota = function(grantedBytes) {
        window.webkitRequestFileSystem(window.PERSISTENT, grantedBytes, onRequestFileSystem, onError);
    };

    navigator.webkitPersistentStorage.requestQuota(fileSystemQuota, onRequestQuota, onError);
};

/******************************************************************************/

// https://github.com/gorhill/httpswitchboard/issues/379
// Remove when I am confident everybody moved to the new storage

var oldReadCachedFile = function(path, callback) {
    var reportBack = function(content, err) {
        var details = {
            'path': path,
            'content': content,
            'error': err
        };
        callback(details);
    };

    var onCacheFileLoaded = function() {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheFileLoaded()');
        reportBack(this.responseText);
        this.onload = this.onerror = null;
    };

    var onCacheFileError = function() {
        // This handler may be called under normal circumstances: it appears
        // the entry may still be present even after the file was removed.
        // console.error('HTTP Switchboard> readLocalFile() / onCacheFileError("%s")', path);
        reportBack('', 'Error');
        this.onload = this.onerror = null;
    };

    var onCacheEntryFound = function(entry) {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheEntryFound():', entry.toURL());
        // rhill 2014-04-18: `httpsb` query parameter is added to ensure
        // the browser cache is bypassed.
        getTextFileFromURL(entry.toURL() + '?httpsb=' + Date.now(), onCacheFileLoaded, onCacheFileError);
    };

    var onCacheEntryError = function(err) {
        if ( err.name !== 'NotFoundError' ) {
            console.error('HTTP Switchboard> readLocalFile() / onCacheEntryError("%s"):', path, err.name);
        }
        reportBack('', 'Error');
    };

    var onRequestFileSystemSuccess = function(fs) {
        fs.root.getFile(cachePathFromPath(path), null, onCacheEntryFound, onCacheEntryError);
    };

    var onRequestFileSystemError = function(err) {
        console.error('HTTP Switchboard> readLocalFile() / onRequestFileSystemError():', err.name);
        reportBack('', 'Error');
    };

    requestFileSystem(onRequestFileSystemSuccess, onRequestFileSystemError);
};

/******************************************************************************/

// Flush cached non-user assets if these are from a prior version.
// https://github.com/gorhill/httpswitchboard/issues/212

var cacheSynchronized = false;

var synchronizeCache = function() {
    if ( cacheSynchronized ) {
        return;
    }
    cacheSynchronized = true;

    // https://github.com/gorhill/httpswitchboard/issues/379
    // Remove when I am confident everybody moved to the new storage

    var directoryReader;
    var done = function() {
        directoryReader = null;
    };

    var onReadEntries = function(entries) {
        var n = entries.length;
        if ( !n ) {
            return done();
        }
        var entry;
        for ( var i = 0; i < n; i++ ) {
            entry = entries[i];
            entry.remove(nullFunc);
        }
        // Read entries until none returned.
        directoryReader.readEntries(onReadEntries, onReadEntriesError);
    };

    var onReadEntriesError = function(err) {
        console.error('HTTP Switchboard> synchronizeCache() / onReadEntriesError("%s"):', err.name);
        done();
    };

    var onRequestFileSystemSuccess = function(fs) {
        directoryReader = fs.root.createReader();
        directoryReader.readEntries(onReadEntries, onReadEntriesError);
    };

    var onRequestFileSystemError = function(err) {
        console.error('HTTP Switchboard> synchronizeCache() / onRequestFileSystemError():', err.name);
        done();
    };

    var onLastVersionRead = function(store) {
        var currentVersion = chrome.runtime.getManifest().version;
        var lastVersion = store.extensionLastVersion || '0.0.0.0';
        if ( currentVersion === lastVersion ) {
            return done();
        }
        chrome.storage.local.set({ 'extensionLastVersion': currentVersion });
        cachedAssetsManager.remove(/^assets\/(httpsb|thirdparties)\//);
        cachedAssetsManager.remove('assets/checksums.txt');
        requestFileSystem(onRequestFileSystemSuccess, onRequestFileSystemError);
    };

    // https://github.com/gorhill/httpswitchboard/issues/89
    // Backward compatiblity.

    var countDown = 2;

    var onUserFiltersSaved = function() {
        countDown -= 1;
        if ( countDown === 0 ) {
            chrome.storage.local.get('extensionLastVersion', onLastVersionRead);
        }
    };

    var onUserFiltersLoaded = function(details) {
        if ( details.content !== '' ) {
            cachedAssetsManager.save(details.path, details.content, onUserFiltersSaved);
        } else {
            onUserFiltersSaved();
        }
    };

    oldReadCachedFile('assets/user/ubiquitous-blacklisted-hosts.txt', onUserFiltersLoaded);
    oldReadCachedFile('assets/user/ubiquitous-whitelisted-hosts.txt', onUserFiltersLoaded);
};

/******************************************************************************/

var readLocalFile = function(path, callback) {
    var reportBack = function(content, err) {
        var details = {
            'path': path,
            'content': content
        };
        if ( err ) {
            details.error = err;
        }
        callback(details);
    };

    var onLocalFileLoaded = function() {
        // console.log('HTTP Switchboard> onLocalFileLoaded()');
        reportBack(this.responseText);
        this.onload = this.onerror = null;
    };

    var onLocalFileError = function() {
        console.error('HTTP Switchboard> readLocalFile() / onLocalFileError("%s")', path);
        reportBack('', 'Error');
        this.onload = this.onerror = null;
    };

    var onCachedContentLoaded = function(details) {
        // console.log('HTTP Switchboard> readLocalFile() / onCachedContentLoaded()');
        reportBack(details.content);
    };

    var onCachedContentError = function(details) {
        // console.error('HTTP Switchboard> readLocalFile() / onCachedContentError("%s")', path);
        getTextFileFromURL(chrome.runtime.getURL(details.path), onLocalFileLoaded, onLocalFileError);
    };

    cachedAssetsManager.load(path, onCachedContentLoaded, onCachedContentError);
};

/******************************************************************************/

var readRemoteFile = function(path, callback) {
    var reportBack = function(content, err) {
        var details = {
            'path': path,
            'content': content,
            'error': err
        };
        callback(details);
    };

    var onRemoteFileLoaded = function() {
        // console.log('HTTP Switchboard> readRemoteFile() / onRemoteFileLoaded()');
        // https://github.com/gorhill/httpswitchboard/issues/263
        if ( this.status === 200 ) {
            reportBack(this.responseText);
        } else {
            reportBack('', 'Error ' + this.statusText);
        }
        this.onload = this.onerror = null;
    };

    var onRemoteFileError = function() {
        console.error('HTTP Switchboard> readRemoteFile() / onRemoteFileError("%s")', path);
        reportBack('', 'Error');
        this.onload = this.onerror = null;
    };

    // 'httpsb=...' is to skip browser cache
    getTextFileFromURL(
        remoteRoot + path + '?httpsb=' + Date.now(),
        onRemoteFileLoaded,
        onRemoteFileError
    );
};

/******************************************************************************/

var writeLocalFile = function(path, content, callback) {
    cachedAssetsManager.save(path, content, callback);
};

/******************************************************************************/

var updateFromRemote = function(details, callback) {
    // 'httpsb=...' is to skip browser cache
    var remoteURL = remoteRoot + details.path + '?httpsb=' + Date.now();
    var targetPath = details.path;
    var targetMd5 = details.md5 || '';

    var reportBackError = function() {
        callback({
            'path': targetPath,
            'error': 'Error'
        });
    };

    var onRemoteFileLoaded = function() {
        this.onload = this.onerror = null;
        if ( typeof this.responseText !== 'string' ) {
            console.error('HTTPSB> updateFromRemote("%s") / onRemoteFileLoaded(): no response', remoteURL);
            reportBackError();
            return;
        }
        if ( YaMD5.hashStr(this.responseText) !== targetMd5 ) {
            console.error('HTTPSB> updateFromRemote("%s") / onRemoteFileLoaded(): bad md5 checksum', remoteURL);
            reportBackError();
            return;
        }
        // console.debug('HTTPSB> updateFromRemote("%s") / onRemoteFileLoaded()', remoteURL);
        writeLocalFile(targetPath, this.responseText, callback);
    };

    var onRemoteFileError = function() {
        this.onload = this.onerror = null;
        console.error('HTTPSB> updateFromRemote() / onRemoteFileError("%s"):', remoteURL, this.statusText);
        reportBackError();
    };

    getTextFileFromURL(
        remoteURL,
        onRemoteFileLoaded,
        onRemoteFileError
    );
};

/******************************************************************************/

// Flush cached assets if cache content is from an older version: the extension
// always ships with the most up-to-date assets.

synchronizeCache();

/******************************************************************************/

// Export API

return {
    'get': readLocalFile,
    'getRemote': readRemoteFile,
    'put': writeLocalFile,
    'update': updateFromRemote
};

/******************************************************************************/

})();

/******************************************************************************/

