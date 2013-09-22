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

// to easily parse urls
var urlParser = document.createElement('a');

/******************************************************************************/

// parse a url and return only interesting parts

function getUrlParts(url) {
    var parts = { protocol: "", domain: ""};
    // Ref.: https://gist.github.com/jlong/2428561
    urlParser.href = url;
    parts.protocol = urlParser.protocol;
    // TODO: create user settings for this (`-8`)
    var matches = urlParser.hostname.split('.').slice(-8);
    if ( matches.length ) {
        parts.domain = matches.join('.');
    }
    return parts;
}

/******************************************************************************/

// extract domain from url

function getUrlDomain(url) {
    urlParser.href = url;
    return urlParser.hostname;
}

/******************************************************************************/

// extract domain from url

function getUrlProtocol(url) {
    urlParser.href = url;
    return urlParser.protocol;
}

