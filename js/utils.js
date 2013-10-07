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

/******************************************************************************/

function getUrlPath(url) {
    urlParser.href = url;
    var path = urlParser.protocol + '//' + urlParser.host + '/' + urlParser.pathname
    var i = path.lastIndexOf('/');
    if ( i >= 0 ) {
        path = path.slice(0, i);
    }
    return path;
}

/******************************************************************************/

function getUrlHrefRoot(url) {
    urlParser.href = url;
    return urlParser.protocol + '//' + urlParser.host;
}

/******************************************************************************/

function getUrlHrefPath(url) {
    urlParser.href = url;
    var path = urlParser.protocol + '//' + urlParser.host + '/' + urlParser.pathname
    var i = path.lastIndexOf('/');
    if ( i >= 0 ) {
        path = path.slice(0, i);
    }
    return path;
}

/******************************************************************************/

// Return the parent domain. For IP address, there is no parent domain.

function getParentDomainFromDomain(domain) {
    // Do not return top node alone, way too broad
    var nodes = domain.split('.');
    if ( nodes.length <= 2 ) {
        return undefined;
    }
    // With plain IP address, top node is left-most
    if ( isIpAddress(domain) ) {
        return nodes.slice(0, nodes.length-1).join('.');
    }
    // With name address, top node is right-most
    return nodes.slice(1).join('.');
}

/******************************************************************************/

// Return the top-most domain. For IP address, there is no parent domain.

function getTopMostDomainFromDomain(domain) {
    // Do not return top node alone, way too broad
    var nodes = domain.split('.');
    // With plain IP address, top node is left-most
    if ( isIpAddress(domain) ) {
        return nodes.slice(0, 2).join('.');
    }
    // With name address, top node is right-most
    return nodes.slice(-2).join('.');
}

/******************************************************************************/

// Compare domain helper, to order domain in a logical manner:
// top-most < bottom-most, take into account whether IP address or
// named domain

function domainNameCompare(a,b) {
    // Normalize: most significant parts first
    if ( !isIpAddress(a) ) {
        var aa = a.split('.');
        a = aa.slice(-2).concat(aa.slice(0,-2).reverse()).join('.');
    }
    if ( !isIpAddress(b) ) {
        var bb = b.split('.');
        b = bb.slice(-2).concat(bb.slice(0,-2).reverse()).join('.');
    }
    return a.localeCompare(b);
}

/******************************************************************************/

function isIpAddress(domain) {
    return domain.match(/^\d+(\.\d+){1,3}$/);
}
