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

// https://github.com/gorhill/httpswitchboard/issues/252

(function() {

/******************************************************************************/

// If you play with this code, mind:
//   https://github.com/gorhill/httpswitchboard/issues/261
//   https://github.com/gorhill/httpswitchboard/issues/252

var navigatorSpoofer = " \
;(function() { \
    try { \
        var spoofedUserAgent = {{ua-json}}; \
        if ( spoofedUserAgent === navigator.userAgent ) { \
            return; \
        } \
        var realNavigator = navigator; \
        var SpoofedNavigator = function(ua) { \
            this.navigator = navigator; \
        }; \
        var spoofedNavigator = new SpoofedNavigator(spoofedUserAgent); \
        var makeFunction = function(n, k) { \
            n[k] = function() { \
                return this.navigator[k].apply(this.navigator, arguments); }; \
        }; \
        for ( var k in realNavigator ) { \
            if ( typeof realNavigator[k] === 'function' ) { \
                makeFunction(spoofedNavigator, k); \
            } else { \
                spoofedNavigator[k] = realNavigator[k]; \
            } \
        } \
        spoofedNavigator.userAgent = spoofedUserAgent; \
        var pos = spoofedUserAgent.indexOf('/'); \
        spoofedNavigator.appName = pos < 0 ? '' : spoofedUserAgent.slice(0, pos); \
        spoofedNavigator.appVersion = pos < 0 ? spoofedUserAgent : spoofedUserAgent.slice(pos + 1); \
        navigator = window.navigator = spoofedNavigator; \
    } catch (e) { \
    } \
})();";

/******************************************************************************/

// Because window.userAgent is read-only, we need to create a fake Navigator
// object to contain our fake user-agent string.
// Because objects created by a content script are local to the content script
// and not visible to the web page itself (and vice versa), we need the context
// of the web page to create the fake Navigator object directly, and the only
// way to do this is to inject appropriate javascript code into the web page.

var injectNavigatorSpoofer = function(spoofedUserAgent) {
    if ( typeof spoofedUserAgent !== 'string' ) {
        return;
    }
    if ( spoofedUserAgent === navigator.userAgent ) {
        return;
    }
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.id = 'httpsb-ua-spoofer';
    var js = document.createTextNode(navigatorSpoofer.replace('{{ua-json}}', JSON.stringify(spoofedUserAgent)));
    script.appendChild(js);
    document.documentElement.appendChild(script, document.documentElement.firstChild);
};

chrome.runtime.sendMessage({ what: 'getUserAgentReplaceStr' }, injectNavigatorSpoofer);

/******************************************************************************/

})();
