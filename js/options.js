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

// TODO: refactor this mess.

(function(){

/******************************************************************************/

$('a').attr('target', '_blank');

var background = chrome.extension.getBackgroundPage();
var httpsb = background.HTTPSB;

var data = {
    whitelistCount: Object.keys(httpsb.whitelist).length,
    blacklistCount: Object.keys(httpsb.blacklist).length,
    blockedRequestCounters: httpsb.blockedRequestCounters,

    last: 0
};

var template = Tempo.prepare('stats');

template.render(data);

// TODO: listen to stats changed messages
setInterval(function() {
    template.render(data);
}, 5000);

/******************************************************************************/

})();
