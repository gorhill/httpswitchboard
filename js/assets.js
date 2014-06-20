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

/* global chrome, HTTPSB */

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

/******************************************************************************/

var nullFunc = function() { };

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

// Useful to avoid having to manage a directory tree

var cachePathFromPath = function(path) {
    return path.replace(/\//g, '___');
};

var pathFromCachePath = function(path) {
    return path.replace(/___/g, '/');
};

/******************************************************************************/

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

// Flush cached non-user assets if these are from a prior version.
// https://github.com/gorhill/httpswitchboard/issues/212

var cacheSynchronized = false;

var synchronizeCache = function() {
    if ( cacheSynchronized ) {
        return;
    }
    cacheSynchronized = true;

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
            // Ignore whatever is in 'user' folder: these are NOT cached entries.
            if ( pathFromCachePath(entry.fullPath).indexOf('/assets/user/') >= 0 ) {
                continue;
            }
            entry.remove(nullFunc);
        }
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
        requestFileSystem(onRequestFileSystemSuccess, onRequestFileSystemError);
    };

    chrome.storage.local.get('extensionLastVersion', onLastVersionRead);
};

/******************************************************************************/

var readLocalFile = function(path, callback) {
    var reportBack = function(content, err) {
        var details = {
            'path': path,
            'content': content,
            'error': err
        };
        callback(details);
    };

    var onLocalFileLoaded = function() {
        // console.log('HTTP Switchboard> onLocalFileLoaded()');
        reportBack(this.responseText);
        this.onload = this.onerror = null;
    };

    var onLocalFileError = function(ev) {
        console.error('HTTP Switchboard> readLocalFile() / onLocalFileError("%s")', path);
        reportBack('', 'Error');
        this.onload = this.onerror = null;
    };

    var onCacheFileLoaded = function() {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheFileLoaded()');
        reportBack(this.responseText);
        this.onload = this.onerror = null;
    };

    var onCacheFileError = function(ev) {
        // This handler may be called under normal circumstances: it appears
        // the entry may still be present even after the file was removed.
        // console.error('HTTP Switchboard> readLocalFile() / onCacheFileError("%s")', path);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
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
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
    };

    var onRequestFileSystemSuccess = function(fs) {
        fs.root.getFile(cachePathFromPath(path), null, onCacheEntryFound, onCacheEntryError);
    };

    var onRequestFileSystemError = function(err) {
        console.error('HTTP Switchboard> readLocalFile() / onRequestFileSystemError():', err.name);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
    };

    requestFileSystem(onRequestFileSystemSuccess, onRequestFileSystemError);
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

    var onRemoteFileError = function(ev) {
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
    var reportBack = function(err) {
        var details = {
            'path': path,
            'content': content,
            'error': err
        };
        callback(details);
    };

    var onFileWriteSuccess = function() {
        // console.log('HTTP Switchboard> writeLocalFile() / onFileWriteSuccess("%s")', path);
        reportBack();
    };

    var onFileWriteError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onFileWriteError("%s"):', path, err.name);
        reportBack(err.name);
    };

    var onFileTruncateSuccess = function() {
        // console.log('HTTP Switchboard> writeLocalFile() / onFileTruncateSuccess("%s")', path);
        this.onwriteend = onFileWriteSuccess;
        this.onerror = onFileWriteError;
        var blob = new Blob([content], { type: 'text/plain' });
        this.write(blob);
    };

    var onFileTruncateError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onFileTruncateError("%s"):', path, err.name);
        reportBack(err.name);
    };

    var onCreateFileWriterSuccess = function(fwriter) {
        fwriter.onwriteend = onFileTruncateSuccess;
        fwriter.onerror = onFileTruncateError;
        fwriter.truncate(0);
    };

    var onCreateFileWriterError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onCreateFileWriterError("%s"):', path, err.name);
        reportBack(err.name);
    };

    var onCacheEntryFound = function(file) {
        // console.log('HTTP Switchboard> writeLocalFile() / onCacheEntryFound():', file.toURL());
        file.createWriter(onCreateFileWriterSuccess, onCreateFileWriterError);
    };

    var onCacheEntryError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onCacheEntryError("%s"):', path, err.name);
        reportBack(err.name);
    };

    var onRequestFileSystemError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onRequestFileSystemError():', err.name);
        reportBack(err.name);
    };

    var onRequestFileSystem = function(fs) {
        fs.root.getFile(cachePathFromPath(path), { create: true }, onCacheEntryFound, onCacheEntryError);
    };

    requestFileSystem(onRequestFileSystem, onRequestFileSystemError);
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

    var onRemoteFileError = function(ev) {
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

