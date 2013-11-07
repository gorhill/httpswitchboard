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

var globalURI = new URI();

/******************************************************************************/

// Normalize a URL passed by chromium

function normalizeChromiumUrl(url) {
    // remove fragment...
    return globalURI.href(url).fragment('').href();
}

/******************************************************************************/

// extract everything from url

function getUrlParts(url) {
    return URI.parse(url);
}

/******************************************************************************/

// extract hostname from url

function getHostnameFromURL(url) {
    return globalURI.href(url).hostname();
}

/******************************************************************************/

// extract domain from url

function getDomainFromURL(url) {
    if ( !url ) {
        return '';
    }
    return globalURI.href(url).domain();
}

/******************************************************************************/

// extract domain from hostname

function getDomainFromHostname(hostname) {
    return globalURI.hostname(hostname).domain();
}

/******************************************************************************/

// extract domain from url

function getUrlProtocol(url) {
    return globalURI.href(url).protocol();
}

/******************************************************************************/

function getRootURLFromURL(url) {
    var uri = globalURI.href(url);
    return uri.scheme() + '://' + uri.hostname();
}

/******************************************************************************/

// Return the parent domain. For IP address, there is no parent domain.

function getParentHostnameFromHostname(hostname) {
    var uri = globalURI;
    var subdomain = uri.hostname(hostname).subdomain();
    if ( subdomain === '' ) {
        return undefined;
    }
    var domain = uri.domain();
    var dot = subdomain.indexOf('.');
    if ( dot < 0 ) {
        return domain;
    }
    return subdomain.slice(dot+1) + '.' + domain;
}

/******************************************************************************/

// Compare domain helper, to order domain in a logical manner:
// top-most < bottom-most, take into account whether IP address or
// named domain

function domainNameCompare(a,b) {
    // Normalize: most significant parts first
    if ( !a.match(/^\d+(\.\d+){1,3}$/) ) {
        var aa = a.split('.');
        a = aa.slice(-2).concat(aa.slice(0,-2).reverse()).join('.');
    }
    if ( !b.match(/^\d+(\.\d+){1,3}$/) ) {
        var bb = b.split('.');
        b = bb.slice(-2).concat(bb.slice(0,-2).reverse()).join('.');
    }
    return a.localeCompare(b);
}

/******************************************************************************/

function cloneCanvas(other) {
    var canvas = document.createElement('canvas');
    canvas.width = other.width;
    canvas.height = other.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(other, 0, 0);
    return canvas;
}

