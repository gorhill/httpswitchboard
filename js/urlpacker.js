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
    this.count = 0;
    this.code = code;
}

var uriPacker = {
    codeGenerator: 1,
    codeJunkyard: [], // once "released", candidates for "recycling"
    mapSegmentToCode: {},
    mapCodeToSegment: {},
    base64Chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',

    remember: function(packedURL) {
        // {scheme}/{hostname}/{directory}/filename?query#{fragment}
        // {scheme}
        var end = packedURL.indexOf('/');
        this.acquireCode(packedURL.slice(0, end));
        // {hostname}
        var beg = end + 1;
        end = packedURL.indexOf('/', beg);
        this.acquireCode(packedURL.slice(beg, end));
        // {directory}
        beg = end + 1;
        end = packedURL.indexOf('/', beg);
        this.acquireCode(packedURL.slice(beg, end));
        // {fragment}
        beg = end + 1;
        end = packedURL.indexOf('#', beg);
        this.acquireCode(packedURL.slice(end + 1));
    },

    forget: function(packedURL) {
        // {scheme}/{hostname}/{directory}/filename?query#{fragment}
        // {scheme}
        var end = packedURL.indexOf('/');
        this.releaseCode(packedURL.slice(0, end));
        // {hostname}
        var beg = end + 1;
        end = packedURL.indexOf('/', beg);
        this.releaseCode(packedURL.slice(beg, end));
        // {directory}
        beg = end + 1;
        end = packedURL.indexOf('/', beg);
        this.releaseCode(packedURL.slice(beg, end));
        // {fragment}
        beg = end + 1;
        end = packedURL.indexOf('#', beg);
        this.releaseCode(packedURL.slice(end + 1));
    },

    pack: function(url) {
        var ut = uriTools;
        ut.uri(url);
        return this.codeFromSegment(ut.scheme()) + '/' +
               this.codeFromSegment(ut.hostname()) + '/' +
               this.codeFromSegment(ut.directory()) + '/' +
               ut.filename() + '?' + ut.query() + '#' +
               this.codeFromSegment(ut.fragment());
    },

    unpack: function(packedURL) {
        // {scheme}/{hostname}/{directory}/filename?query#{fragment}
        // {scheme}
        var end = packedURL.indexOf('/');
        var uri = this.mapCodeToSegment[packedURL.slice(0, end)] + ':';
        // {hostname}
        var beg = end + 1;
        end = packedURL.indexOf('/', beg);
        var segment = this.mapCodeToSegment[packedURL.slice(beg, end)];
        if ( segment ) {
            uri += '//' + segment + '/';
        }
        // {directory}
        beg = end + 1;
        end = packedURL.indexOf('/', beg);
        segment = this.mapCodeToSegment[packedURL.slice(beg, end)];
        if ( segment ) {
            uri += segment;
        }
        // filename
        beg = end + 1;
        end = packedURL.indexOf('?', beg);
        segment = packedURL.slice(beg, end);
        if ( segment !== '' ) {
            uri += segment;
        }
        // query
        beg = end + 1;
        end = packedURL.indexOf('#', beg);
        segment = packedURL.slice(beg, end);
        if ( segment !== '' ) {
            uri += '?' + segment;
        }
        // {fragment}
        beg = end + 1;
        segment = this.mapCodeToSegment[packedURL.slice(beg)];
        if ( segment ) {
            uri += '#' + segment;
        }
        return uri;
    },

    unpackHostname: function(packedURL) {
        // {scheme}/{hostname}/{directory}/filename?query#{fragment}
        var beg = packedURL.indexOf('/') + 1;
        var end = packedURL.indexOf('/', beg);
        var code = packedURL.slice(beg, end);
        if ( code ) {
            return this.mapCodeToSegment[code];
        }
        return '';
    },

    unpackFragment: function(packedURL) {
        // {scheme}/{hostname}/{directory}/filename?query#{fragment}
        var beg = packedURL.lastIndexOf('#') + 1;
        var code = packedURL.slice(beg);
        if ( code ) {
            return this.mapCodeToSegment[code];
        }
        return '';
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

    codeFromSegment: function(segment) {
        if ( segment === '' ) {
            return '';
        }
        var entry = this.mapSegmentToCode[segment];
        if ( !entry ) {
            entry = this.codeJunkyard.pop();
            if ( !entry ) {
                entry = new UrlPackerEntry(this.base64(this.codeGenerator++));
            } else {
                console.debug('uriPacker > recycling code "%s" (aka "%s")', entry.code, segment);
                entry.count = 0;
            }
            var code = entry.code;
            this.mapSegmentToCode[segment] = entry;
            this.mapCodeToSegment[code] = segment;
            return code;
        }
        return entry.code;
    },

    acquireCode: function(code) {
        if ( code === '' ) {
            return;
        }
        var segment = this.mapCodeToSegment[code];
        var entry = this.mapSegmentToCode[segment];
        entry.count++;
    },

    releaseCode: function(code) {
        if ( code === '' ) {
            return;
        }
        var segment = this.mapCodeToSegment[code];
        var entry = this.mapSegmentToCode[segment];
        entry.count--;
        if ( !entry.count ) {
            console.debug('uriPacker > releasing code "%s" (aka "%s")', code, segment);
            this.codeJunkyard.push(entry);
            delete this.mapCodeToSegment[code];
            delete this.mapSegmentToCode[segment];
        }
    }
};

