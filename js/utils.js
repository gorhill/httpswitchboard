/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2014 Raymond Hill

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

/* global HTTPSB */

/******************************************************************************/

// This will inserted as a module in the HTTPSB object.

HTTPSB.utils = (function() {

/******************************************************************************/

// Report back through a callback or through a message. This is useful as I
// often change my mind when refactoring code about how async operations are
// handled between caller-callee.
// I went overboard with using messaging -- can't remember why I thought this
// was a good idea, so this helper will help to transition toward using plain
// callbacks.

var reportBack = function(how, details) {
    if ( typeof how === 'function' ) {
        how(details);
        return;
    }
    if ( typeof how === 'string' && how.length > 0 ) {
        details = details || {};
        details.what = how;
        chrome.runtime.sendMessage(details);
        return;
    }
};

/******************************************************************************/

return {
    reportBack: reportBack
};

/******************************************************************************/

})();

/******************************************************************************/
