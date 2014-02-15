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
        Go to read

    Import:
        Read file
        Save in cache [user directory]

File system structure:
    assets
        httpsb
        thirdparties
        user
            blacklists
                ...
*/

/******************************************************************************/

(function() {

/******************************************************************************/

var fileSystem;

/******************************************************************************/

// Support async (let caller choose)

var getTextFileFromURL = function(url, onLoad, onError) {
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'text';
    xhr.onload = onLoad;
    xhr.onerror = onError;
    xhr.ontimeout = onError;
    xhr.open('get', url, true);
    xhr.send();
}

/******************************************************************************/

var readLocalFile = function(path, msg) {
    var onLocalFileLoaded = function() {
        console.log('HTTP Switchboard> onLocalFileLoaded()');
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'content': this.responseText
        });
        this.onload = this.onerror = null;
    };

    var onLocalFileError = function(err) {
        console.log('HTTP Switchboard> onLocalFileError("%s"):', path, err.message);
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'content': '',
            'error': err
        });
        this.onload = this.onerror = null;
    };

    var onCacheFileLoaded = function() {
        console.log('HTTP Switchboard> onCacheFileLoaded()');
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'content': this.responseText
        });
        this.onload = this.onerror = null;
    };

    var onCacheFileError = function(err) {
        console.log('HTTP Switchboard> onCacheFileError("%s"):', path, err.message);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded);
        this.onload = this.onerror = null;
    };

    var onCacheEntryFound = function(file) {
        console.log('HTTP Switchboard> onCacheEntryFound():', file.toURL());
        getTextFileFromURL(file.toURL(), onCacheFileLoaded, onCacheFileError);
    };

    var onCacheEntryError = function(err) {
        console.log('HTTP Switchboard> onCacheEntryError("%s"):', path, err.message);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded);
    };

    // From cache?
    if ( fileSystem ) {
        fileSystem.root.getFile(path, null, onCacheEntryFound, onCacheEntryError);
        return;
    }

    // From built-in local directory
    getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded);
};

/******************************************************************************/

var updateFromRemote = function(localPath) {

}

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
    'update': updateFromRemote
};

/******************************************************************************/

})();

