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

/******************************************************************************/

(function() {

/******************************************************************************/

var fileSystem;
var remoteRoot = 'https://raw2.github.com/gorhill/httpswitchboard/master/';

/******************************************************************************/

var getTextFileFromURL = function(url, onLoad, onError) {
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

/******************************************************************************/

var readLocalFile = function(path, msg) {
    var sendMessage = function(content, err) {
        var details = {
            'what': msg,
            'path': path,
            'content': content,
            'error': err
        };
        chrome.runtime.sendMessage(details);
    };

    var onLocalFileLoaded = function() {
        // console.log('HTTP Switchboard> onLocalFileLoaded()');
        sendMessage(this.responseText);
        this.onload = this.onerror = null;
    };

    var onLocalFileError = function(err) {
        // console.log('HTTP Switchboard> readLocalFile() / onLocalFileError("%s"):', path, err.message);
        sendMessage('', err);
        this.onload = this.onerror = null;
    };

    var onCacheFileLoaded = function() {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheFileLoaded()');
        sendMessage(this.responseText);
        this.onload = this.onerror = null;
    };

    var onCacheFileError = function(err) {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheFileError("%s"):', path, err.message);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded);
        this.onload = this.onerror = null;
    };

    var onCacheEntryFound = function(file) {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheEntryFound():', file.toURL());
        getTextFileFromURL(file.toURL(), onCacheFileLoaded, onCacheFileError);
    };

    var onCacheEntryError = function(err) {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheEntryError("%s"):', path, err.message);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
    };

    // From cache?
    if ( fileSystem ) {
        fileSystem.root.getFile(cachePathFromPath(path), null, onCacheEntryFound, onCacheEntryError);
        return;
    }

    // From built-in local directory
    getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
};

/******************************************************************************/

var writeLocalFile = function(path, content, msg) {
    var sendMessage = function(err) {
        var details = {
            'what': msg,
            'path': path,
            'content': content,
            'error': err
        };
        chrome.runtime.sendMessage(details);
    };

    var onFileWriteSuccess = function() {
        // console.log('HTTP Switchboard> writeLocalFile() / onFileWriteSuccess("%s")', path);
        sendMessage();
    };

    var onFileWriteError = function(err) {
        // console.log('HTTP Switchboard> writeLocalFile() / onFileWriteError("%s"):', path, err.message);
        sendMessage(err);
    };

    var onFileTruncateSuccess = function() {
        // console.log('HTTP Switchboard> writeLocalFile() / onFileTruncateSuccess("%s")', path);
        this.onwriteend = onFileWriteSuccess;
        this.onerror = onFileWriteError;
        var blob = new Blob([content], { type: 'text/plain' });
        this.write(blob);
    };

    var onFileTruncateError = function(err) {
        // console.log('HTTP Switchboard> writeLocalFile() / onFileTruncateError("%s"):', path, err.message);
        sendMessage(err);
    };

    var onCreateFileWriterSuccess = function(fwriter) {
        fwriter.onwriteend = onFileTruncateSuccess;
        fwriter.onerror = onFileTruncateError;
        fwriter.truncate(0);
    };

    var onCreateFileWriterError = function(err) {
        // console.log('HTTP Switchboard> writeLocalFile() / onCreateFileWriterError("%s"):', path, err.message);
        sendMessage(err);
    };

    var onCacheEntryFound = function(file) {
        // console.log('HTTP Switchboard> writeLocalFile() / onCacheEntryFound():', file.toURL());
        file.createWriter(onCreateFileWriterSuccess, onCreateFileWriterError);
    };

    var onCacheEntryError = function(err) {
        // console.log('HTTP Switchboard> writeLocalFile() / onCacheEntryError("%s"):', path, err.message);
        sendMessage(err);
    };

    if ( fileSystem ) {
        fileSystem.root.getFile(cachePathFromPath(path), { create: true }, onCacheEntryFound, onCacheEntryError);
    }
};

/******************************************************************************/

var updateFromRemote = function(path, msg) {
    var remoteURL = remoteRoot + path;

    var onRemoteFileLoaded = function() {
        // console.log('HTTP Switchboard> updateFromRemote() / onRemoteFileLoaded()');
        if ( this.responseText && this.responseText.length ) {
            writeLocalFile(path, this.responseText, msg);
        }
        this.onload = this.onerror = null;
    };

    var onRemoteFileError = function(err) {
        // console.log('HTTP Switchboard> updateFromRemote() / onRemoteFileError("%s"):', remoteURL, err.message);
        this.onload = this.onerror = null;
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'error': err
        });
    };

    if ( fileSystem ) {
        getTextFileFromURL(remoteURL, onRemoteFileLoaded, onRemoteFileError);
    }
};

/******************************************************************************/

// Ref.: http://www.html5rocks.com/en/tutorials/file/filesystem/

var onError = function() {
    console.error('HTTP Switchboard> Could not get virtual file system');
};

var onRequestFileSystem = function(fs) {
    fileSystem = fs;
};

var onRequestQuota = function(grantedBytes) {
    window.webkitRequestFileSystem(window.PERSISTENT, grantedBytes, onRequestFileSystem, onError);
};

navigator.webkitPersistentStorage.requestQuota(16*1024*1024, onRequestQuota, onError);

/******************************************************************************/

// Export API

HTTPSB.assets = {
    'get': readLocalFile,
    'put': writeLocalFile,
    'update': updateFromRemote
};

/******************************************************************************/

})();

