/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2014  Contributors to HTTP Switchboard

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

var gotoDashboard = function(which) {
    chrome.runtime.sendMessage({
        what: 'gotoExtensionURL',
        url: 'dashboard.html#' + which
    });
};

/******************************************************************************/

var onCommand = function(command) {
    switch ( command ) {
    case 'open-statistics':
        gotoDashboard('statistics');
        break;
    case 'open-ubiquitous-rules':
        gotoDashboard('ubiquitous-rules');
        break;
    case 'open-scoped-rules':
        gotoDashboard('scoped-rules');
        break;
    case 'open-settings':
        gotoDashboard('settings');
        break;
    }
};

/******************************************************************************/

chrome.commands.onCommand.addListener(onCommand);

/******************************************************************************/

})();
