/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2014  Raymond Hill

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

var retrieveHandler = function(selectors) {
    if ( !selectors ) {
        return;
    }
    var styleText = [];
    if ( selectors.hide.length > 0 ) {
        var hideStyleText = '{{hideSelectors}} {visibility:hidden;display:none;}';
        styleText.push(hideStyleText.replace('{{hideSelectors}}', selectors.hide.join(',')));
    }
    if ( selectors.donthide.length > 0 ) {
        var dontHideStyleText = '{{donthideSelectors}} {visibility:inherit;display:inherit;}';
        styleText.push(donthideStyleText.replace('{{donthideSelectors}}', selectors.donthide.join(',')));
    }
    if ( styleText.length > 0 ) {
        var style = document.createElement('style');
        style.appendChild(document.createTextNode(styleText.join('')));
        document.documentElement.appendChild(style);
    }
};

/******************************************************************************/

var allSelectors = function() {
    var id;
    var elems = document.querySelectorAll('*[id]');
    var i = elems.length;
    var idSelectors = new Array(i);
    while ( i-- ) {
        id = elems[i].id;
        if ( typeof id !== 'string' ) {
            continue;
        }
        id = id.trim();
        if ( id === '' ) {
            continue;
        }
        idSelectors[i] = '#' + id;
    }

    var classSelectors = {};
    var classNames, className, j;
    elems = document.querySelectorAll('*[class]');
    i = elems.length;
    while ( i-- ) {
        className = elems[i].className;
        if ( typeof className !== 'string' ) {
            continue;
        }
        classNames = className.trim().split(/\s+/);
        j = classNames.length;
        while ( j-- ) {
            className = classNames[j].trim();
            if ( className === '' ) {
                continue;
            }
            className = '.' + className;
            if ( !classSelectors[className] ) {
                classSelectors[className] = true;
            }
        }
    }

    return idSelectors.concat(Object.keys(classSelectors));
};

/******************************************************************************/

chrome.runtime.sendMessage({
    what: 'retrieveABPHideSelectors',
    selectors: allSelectors(),
    locationURL: window.location.href
}, retrieveHandler);

/******************************************************************************/
