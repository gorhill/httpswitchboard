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

Useful ref.: // Ref.: http://www.html5rocks.com/en/tutorials/file/filesystem/

*/

/******************************************************************************/
//
// Low-level asset files manager
//
/******************************************************************************/

(function() {

/******************************************************************************/

var fileSystem;
var fileSystemQuota = 24 * 1024 * 1024;
var remoteRoot = HTTPSB.projectServerRoot;

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

    var onLocalFileError = function(ev) {
        console.error('HTTP Switchboard> readLocalFile() / onLocalFileError("%s"):', path, this.statusText);
        sendMessage('', this.statusText);
        this.onload = this.onerror = null;
    };

    var onCacheFileLoaded = function() {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheFileLoaded()');
        sendMessage(this.responseText);
        this.onload = this.onerror = null;
    };

    var onCacheFileError = function(ev) {
        console.error('HTTP Switchboard> readLocalFile() / onCacheFileError("%s"):', path, this.statusText);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded);
        this.onload = this.onerror = null;
    };

    var onCacheEntryFound = function(file) {
        // console.log('HTTP Switchboard> readLocalFile() / onCacheEntryFound():', file.toURL());
        getTextFileFromURL(file.toURL(), onCacheFileLoaded, onCacheFileError);
    };

    var onCacheEntryError = function(err) {
        if ( err.name !== 'NotFoundError' ) {
            console.error('HTTP Switchboard> readLocalFile() / onCacheEntryError("%s"):', path, err.name);
        }
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
    };

    var onRequestFileSystemError = function(err) {
        console.error('HTTP Switchboard> readLocalFile() / onRequestFileSystemError():', err.name);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
    };

    var onRequestFileSystem = function(fs) {
        fs.root.getFile(cachePathFromPath(path), null, onCacheEntryFound, onCacheEntryError);
    };

    requestFileSystem(onRequestFileSystem, onRequestFileSystemError);
};

/******************************************************************************/

var readRemoteFile = function(path, msg) {
    var sendMessage = function(content, err) {
        var details = {
            'what': msg,
            'path': path,
            'content': content,
            'error': err
        };
        chrome.runtime.sendMessage(details);
    };

    var onRemoteFileLoaded = function() {
        // console.log('HTTP Switchboard> readRemoteFile() / onRemoteFileLoaded()');
        sendMessage(this.responseText);
        this.onload = this.onerror = null;
    };

    var onRemoteFileError = function(ev) {
        console.error('HTTP Switchboard> readRemoteFile() / onRemoteFileError("%s")', path);
        sendMessage('', 'Error');
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
        console.error('HTTP Switchboard> writeLocalFile() / onFileWriteError("%s"):', path, err.name);
        sendMessage(err.name);
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
        sendMessage(err.name);
    };

    var onCreateFileWriterSuccess = function(fwriter) {
        fwriter.onwriteend = onFileTruncateSuccess;
        fwriter.onerror = onFileTruncateError;
        fwriter.truncate(0);
    };

    var onCreateFileWriterError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onCreateFileWriterError("%s"):', path, err.name);
        sendMessage(err.name);
    };

    var onCacheEntryFound = function(file) {
        // console.log('HTTP Switchboard> writeLocalFile() / onCacheEntryFound():', file.toURL());
        file.createWriter(onCreateFileWriterSuccess, onCreateFileWriterError);
    };

    var onCacheEntryError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onCacheEntryError("%s"):', path, err.name);
        sendMessage(err.name);
    };

    var onRequestFileSystemError = function(err) {
        console.error('HTTP Switchboard> writeLocalFile() / onRequestFileSystemError():', err.name);
        sendMessage(err.name);
    };

    var onRequestFileSystem = function(fs) {
        fs.root.getFile(cachePathFromPath(path), { create: true }, onCacheEntryFound, onCacheEntryError);
    };

    requestFileSystem(onRequestFileSystem, onRequestFileSystemError);
};

/******************************************************************************/

var updateFromRemote = function(path, msg) {
    // 'httpsb=...' is to skip browser cache
    var remoteURL = remoteRoot + path + '?httpsb=' + Date.now();

    var onRemoteFileLoaded = function() {
        // console.log('HTTP Switchboard> updateFromRemote() / onRemoteFileLoaded()');
        if ( this.responseText && this.responseText.length ) {
            writeLocalFile(path, this.responseText, msg);
        }
        this.onload = this.onerror = null;
    };

    var onRemoteFileError = function(ev) {
        console.error('HTTP Switchboard> updateFromRemote() / onRemoteFileError("%s"):', remoteURL, this.statusText);
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'error': 'Error'
        });
        this.onload = this.onerror = null;
    };

    getTextFileFromURL(
        remoteURL,
        onRemoteFileLoaded,
        onRemoteFileError
        );
};

/******************************************************************************/

var getFileList = function(msg) {
    var fsReader;
    var fsEntries = [];
    var fsEntryCount;
    var allEntries = [];

    var getMetadata = function(fsEntry) {
        fsEntry.getMetadata(function(metadata) {
            allEntries.push({
                path: pathFromCachePath(fsEntry.name),
                modificationTime: metadata.modificationTime.getTime(),
                size: metadata.size
            });
            fsEntryCount -= 1;
            if ( fsEntryCount === 0 ) {
                chrome.runtime.sendMessage({
                    'what': msg,
                    'entries': allEntries
                });
            }
        });
    };
    var getAllMetadata = function() {
        fsEntryCount = fsEntries.length;
        var i = fsEntries.length;
        while ( i-- ) {
            getMetadata(fsEntries[i]);
        }
    };
    var onReadEntries = function(entries) {
        if ( entries.length ) {
            fsEntries = fsEntries.concat(entries);
            fsReader.readEntries(onReadEntries, onReadEntriesError);
        } else {
            getAllMetadata();
        }
    };
    var onReadEntriesError = function(err) {
        console.error('HTTP Switchboard> getFileList() / onReadEntriesError("%s"):', err.name);
    };
    var onRequestFileSystemError = function(err) {
        console.error('HTTP Switchboard> getFileList() / onRequestFileSystemError():', err.name);
    };
    var onRequestFileSystem = function(fs) {
        fsReader = fs.root.createReader();
        fsReader.readEntries(onReadEntries, onReadEntriesError);
    };
    requestFileSystem(onRequestFileSystem, onRequestFileSystemError);
};

/******************************************************************************/

// Export API

HTTPSB.assets = {
    'get': readLocalFile,
    'getRemote': readRemoteFile,
    'put': writeLocalFile,
    'update': updateFromRemote,
    'getEntries': getFileList
};

/******************************************************************************/

})();

/******************************************************************************/

