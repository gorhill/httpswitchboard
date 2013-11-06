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

// Experimental

function UrlPackerEntry(code) {
    this.count = 1;
    this.code = code;
}

var urlPacker = {
    uri: new URI(),
    codeGenerator: 0,
    codeJunkyard: [],
    fragmentToCode: {},
    codeToFragment: {},
    codeDigits: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',

    remember: function(url) {
        this.uri.href(url);
        var scheme = this.uri.scheme();
        var hostname = this.uri.hostname();
        var directory = this.uri.directory();
        var leaf = this.uri.filename() + this.uri.search();
        var entry;
        var packedScheme;
        if ( scheme !== '' ) {
            entry = this.fragmentToCode[scheme];
            if ( !entry ) {
                entry = this.codeJunkyard.pop();
                packedScheme = this.strFromCode(this.codeGenerator++);
                if ( !entry ) {
                    entry = new UrlPackerEntry(packedScheme);
                } else {
                    entry.code = packedScheme;
                    entry.count = 1;
                }
                this.fragmentToCode[scheme] = entry;
                this.codeToFragment[packedScheme] = scheme;
            } else {
                packedScheme = entry.code;
                entry.count++;
            }
        } else {
            packedScheme = '';
        }
        var packedHostname;
        if ( hostname !== '' ) {
            entry = this.fragmentToCode[hostname];
            if ( !entry ) {
                entry = this.codeJunkyard.pop();
                packedHostname = this.strFromCode(this.codeGenerator++);
                if ( !entry ) {
                    entry = new UrlPackerEntry(packedHostname);
                } else {
                    entry.code = packedHostname;
                    entry.count = 1;
                }
                this.fragmentToCode[hostname] = entry;
                this.codeToFragment[packedHostname] = hostname;
            } else {
                packedHostname = entry.code;
                entry.count++;
            }
        } else {
            packedHostname = '';
        }
        var packedDirectory;
        if ( directory !== '' ) {
            entry = this.fragmentToCode[directory];
            if ( !entry ) {
                packedDirectory = this.strFromCode(this.codeGenerator++);
                entry = this.codeJunkyard.pop();
                if ( !entry ) {
                    entry = new UrlPackerEntry(packedDirectory);
                } else {
                    entry.code = packedDirectory;
                    entry.count = 1;
                }
                this.fragmentToCode[directory] = entry;
                this.codeToFragment[packedDirectory] = directory;
            } else {
                packedDirectory = entry.code;
                entry.count++;
            }
        } else {
            packedDirectory = '';
        }
        // Return assembled packed fragments
        return packedScheme + '/' + packedHostname + '/' + packedDirectory + '/' + leaf;
    },

    forget: function() {
    },

    strFromCode: function(code) {
        var s = '';
        var codeDigits = this.codeDigits;
        while ( code ) {
            s = s + String.fromCharCode(codeDigits.charCodeAt(code & 63));
            code = code >> 6;
        }
        return s;
    },

};

