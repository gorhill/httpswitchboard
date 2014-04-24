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

var userAgentRandomPicker = function() {
    var httpsb = HTTPSB;
    var userAgents = httpsb.userSettings.spoofUserAgentWith.split(/[\n\r]+/);
    var i, s, pos;
    while ( userAgents.length ) {
        i = Math.floor(userAgents.length * Math.random());
        s = userAgents[i];
        if ( s.charAt(0) === '#' ) {
            s = '';
        } else {
            s = s.trim();
        }
        if ( s !== '' ) {
            return s;
        }
        userAgents.splice(i, 1);
    }
    return '';
};

/******************************************************************************/

var userAgentSpoofer = function() {
    var httpsb = HTTPSB;
    if ( httpsb.userSettings.spoofUserAgent !== true ) {
        return;
    }
    var uaStr = httpsb.userAgentReplaceStr;
    var now = Date.now() / 60000;
    if ( (now - httpsb.userAgentReplaceStrBirth) >= httpsb.userSettings.spoofUserAgentEvery ) {
        uaStr = '';
    }
    if ( uaStr === '' ) {
        httpsb.userAgentReplaceStr = userAgentRandomPicker();
        httpsb.userAgentReplaceStrBirth = now;
    }
};

userAgentSpoofer();

/******************************************************************************/

HTTPSB.asyncJobs.add('userAgentSwitcher', null, userAgentSpoofer, 120 * 1000, true);

/******************************************************************************/

})();

/******************************************************************************/

