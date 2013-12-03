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

