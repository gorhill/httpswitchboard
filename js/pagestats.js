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

(function() {

/******************************************************************************/

// Caching useful global vars

var httpsb = HTTPSB;
var httpsburi = null;

/******************************************************************************/

// Hidden vars

var charCodes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

var typeToCode = {
    'main_frame'    : 'a',
    'sub_frame'     : 'b',
    'stylesheet'    : 'c',
    'script'        : 'd',
    'image'         : 'e',
    'object'        : 'f',
    'xmlhttprequest': 'g',
    'other'         : 'h',
    'cookie'        : 'i'
};

var codeToType = {
    'a': 'main_frame',
    'b': 'sub_frame',
    'c': 'stylesheet',
    'd': 'script',
    'e': 'image',
    'f': 'object',
    'g': 'xmlhttprequest',
    'h': 'other',
    'i': 'cookie'
};

/******************************************************************************/

// It's just a dict-based "packer"

var stringPacker = {
    codeGenerator: 1,
    codeJunkyard: [],
    mapStringToEntry: {},
    mapCodeToString: {},
    base64Chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',

    Entry: function(code) {
        this.count = 0;
        this.code = code;
    },

    remember: function(code) {
        if ( code === '' ) {
            return;
        }
        var s = this.mapCodeToString[code];
        if ( s ) {
            var entry = this.mapStringToEntry[s];
            entry.count++;
        }
    },

    forget: function(code) {
        if ( code === '' ) {
            return;
        }
        var s = this.mapCodeToString[code];
        if ( s ) {
            var entry = this.mapStringToEntry[s];
            entry.count--;
            if ( !entry.count ) {
                // console.debug('stringPacker > releasing code "%s" (aka "%s")', code, s);
                this.codeJunkyard.push(entry);
                delete this.mapCodeToString[code];
                delete this.mapStringToEntry[s];
            }
        }
    },

    pack: function(s) {
        var entry = this.entryFromString(s);
        if ( !entry ) {
            return '';
        }
        return entry.code;
    },

    unpack: function(packed) {
        return this.mapCodeToString[packed] || '';
    },

    base64: function(code) {
        var s = '';
        var base64Chars = this.base64Chars;
        while ( code ) {
            s += String.fromCharCode(base64Chars.charCodeAt(code & 63));
            code >>>= 6;
        }
        return s;
    },

    entryFromString: function(s) {
        if ( s === '' ) {
            return null;
        }
        var entry = this.mapStringToEntry[s];
        if ( !entry ) {
            entry = this.codeJunkyard.pop();
            if ( !entry ) {
                entry = new this.Entry(this.base64(this.codeGenerator++));
            } else {
                // console.debug('stringPacker > recycling code "%s" (aka "%s")', entry.code, s);
                entry.count = 0;
            }
            this.mapStringToEntry[s] = entry;
            this.mapCodeToString[entry.code] = s;
        }
        return entry;
    }
};

/******************************************************************************/

// To export

var pageRequestStats = {
    factory: function() {
        var pageRequests = new PageRequestStats();
        pageRequests.resizeLogBuffer(httpsb.userSettings.maxLoggedRequests);
        return pageRequests;
    }
};

/******************************************************************************/

var LogEntry = function() {
    this.url = '';
    this.type = '';
    this.when = 0;
    this.block = false;
    this.reason = '';
};

var logEntryJunkyard = [];

LogEntry.prototype.dispose = function() {
    // Let's not grab and hold onto too much memory..
    if ( logEntryJunkyard.length < 200 ) {
        logEntryJunkyard.push(this);
    }
};

var logEntryFactory = function() {
    var entry = logEntryJunkyard.pop();
    if ( entry ) {
        return entry;
    }
    return new LogEntry();
};

/******************************************************************************/

var PageRequestStats = function() {
    this.requests = {};
    this.ringBuffer = null;
    this.ringBufferPointer = 0;
    if ( !httpsburi ) {
        httpsburi = httpsb.URI;
    }
};

/******************************************************************************/

// Request key:
// index: 01234567...
//        HHHHHHTN...
//        ^     ^^
//        |     ||
//        |     |+--- short string code for hostname (dict-based)
//        |     +--- single char code for type of request
//        +--- FNV32a hash of whole URI (irreversible)

var makeRequestKey = function(uri, reqType) {
    // Ref: Given a URL, returns a unique 7-character long hash string
    // Based on: FNV32a
    // http://www.isthe.com/chongo/tech/comp/fnv/index.html#FNV-reference-source
    // The rest is custom, suited for HTTPSB.
    var hint = 0x811c9dc5;
    var i = uri.length;
    while ( i-- ) {
        hint ^= uri.charCodeAt(i);
        hint += hint<<1 + hint<<4 + hint<<7 + hint<<8 + hint<<24;
    }
    hint = hint >>> 0;

    // convert 32-bit hash to str
    var hstr = '';
    i = 6;
    while ( i-- ) {
        hstr += charCodes.charAt(hint & 0x3F);
        hint >>= 6;
    }

    // append code for type
    hstr += typeToCode[reqType] || 'z';

    // append code for hostname
    hstr += stringPacker.pack(httpsburi.hostnameFromURI(uri));

    return hstr;
};

/******************************************************************************/

var rememberRequestKey = function(reqKey) {
    stringPacker.remember(reqKey.slice(7));
};

var forgetRequestKey = function(reqKey) {
    stringPacker.forget(reqKey.slice(7));
};

/******************************************************************************/

// Exported

var hostnameFromRequestKey = function(reqKey) {
    return stringPacker.unpack(reqKey.slice(7));
};

pageRequestStats.hostnameFromRequestKey = hostnameFromRequestKey;
PageRequestStats.prototype.hostnameFromRequestKey = hostnameFromRequestKey;

var typeFromRequestKey = function(reqKey) {
    return codeToType[reqKey.charAt(6)];
};

pageRequestStats.typeFromRequestKey = typeFromRequestKey;
PageRequestStats.prototype.typeFromRequestKey = typeFromRequestKey;

/******************************************************************************/

PageRequestStats.prototype.createEntryIfNotExists = function(url, type, block) {
    var reqKey = makeRequestKey(url, type);
    if ( this.requests[reqKey] ) {
        return false;
    }
    rememberRequestKey(reqKey);
    this.requests[reqKey] = Date.now();
    return true;
};

/******************************************************************************/

PageRequestStats.prototype.resizeLogBuffer = function(size) {
    if ( !this.ringBuffer ) {
        this.ringBuffer = new Array(0);
        this.ringBufferPointer = 0;
    }
    if ( size === this.ringBuffer.length ) {
        return;
    }
    if ( !size ) {
        this.ringBuffer = new Array(0);
        this.ringBufferPointer = 0;
        return;
    }
    var newBuffer = new Array(size);
    var copySize = Math.min(size, this.ringBuffer.length);
    var newBufferPointer = (copySize % size) | 0;
    var isrc = this.ringBufferPointer;
    var ides = newBufferPointer;
    while ( copySize-- ) {
        isrc--;
        if ( isrc < 0 ) {
            isrc = this.ringBuffer.length - 1;
        }
        ides--;
        if ( ides < 0 ) {
            ides = size - 1;
        }
        newBuffer[ides] = this.ringBuffer[isrc];
    }
    this.ringBuffer = newBuffer;
    this.ringBufferPointer = newBufferPointer;
};

/******************************************************************************/

PageRequestStats.prototype.logRequest = function(url, type, block, reason) {
    var buffer = this.ringBuffer;
    var len = buffer.length;
    if ( !len ) {
        return;
    }
    var pointer = this.ringBufferPointer;
    if ( !buffer[pointer] ) {
        buffer[pointer] = logEntryFactory();
    }
    var logEntry = buffer[pointer];
    logEntry.url = url;
    logEntry.type = type;
    logEntry.when = Date.now();
    logEntry.block = block;
    logEntry.reason = reason;
    this.ringBufferPointer = ((pointer + 1) % len) | 0;
};

/******************************************************************************/

PageRequestStats.prototype.getLoggedRequests = function() {
    var buffer = this.ringBuffer;
    if ( !buffer.length ) {
        return [];
    }
    // [0 - pointer] = most recent
    // [pointer - length] = least recent
    // thus, ascending order:
    //   [pointer - length] + [0 - pointer]
    var pointer = this.ringBufferPointer;
    return buffer.slice(pointer).concat(buffer.slice(0, pointer)).reverse();
};

/******************************************************************************/

PageRequestStats.prototype.getLoggedRequestEntry = function(reqURL, reqType) {
    return this.requests[makeRequestKey(reqURL, reqType)];
};

/******************************************************************************/

PageRequestStats.prototype.getRequestKeys = function() {
    return Object.keys(this.requests);
};

/******************************************************************************/

PageRequestStats.prototype.getRequestDict = function() {
    return this.requests;
};

/******************************************************************************/

PageRequestStats.prototype.disposeOne = function(reqKey) {
    if ( this.requests[reqKey] ) {
        delete this.requests[reqKey];
        forgetRequestKey(reqKey);
    }
};

/******************************************************************************/

PageRequestStats.prototype.dispose = function() {
    var requests = this.requests;
    for ( var reqKey in requests ) {
        if ( requests.hasOwnProperty(reqKey) ) {
            stringPacker.forget(reqKey.slice(7));
            delete requests[reqKey];
        }
    }
    var i = this.ringBuffer.length;
    while ( i-- ) {
        this.ringBuffer[i] = null;
    }
    this.ringBufferPointer = 0;
};

/******************************************************************************/

// Export

httpsb.PageRequestStats = pageRequestStats;

/******************************************************************************/

})();

/******************************************************************************/

