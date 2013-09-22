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

// log a request
function record(tabId, type, url) {
    // console.debug("record() > %o: %s @ %s", details, details.type, details.url);
    var urls = HTTPSB.tabs[tabId].urls;
    if ( !urls[url] ) {
        urls[url] = { types: {} };
    }
    urls[url].types[type] = true;
    updateBadge(tabId);
}

/******************************************************************************/

// reload content of a tab

function smartReloadTab(tabId) {
    var newState = computeTabState(tabId);
    var httpsb = HTTPSB;
    var tab = httpsb.tabs[tabId];
    if ( getStateHash(newState) != getStateHash(httpsb.tabs[tabId].state) ) {
        // console.debug('reloaded content of tab id %d', tabId);
        // console.debug('old="%s"\nnew="%s"', getStateHash(httpsb.tabs[tabId].state, getStateHash(newState)));
        var domain = getUrlDomain(tab.pageUrl);
        chrome.contentSettings.javascript.set({
            primaryPattern: '*://' + domain + '/*',
            setting: blacklisted('script', domain) ? 'block' : 'allow'
        });
        httpsb.urls[tab.pageUrl].state = newState;
        chrome.tabs.reload(tabId);
    }
}

/******************************************************************************/

// Required since not all tabs are of interests to HTTP Switchboard.
// Examples:
//      `chrome://extensions/`
//      `chrome-devtools://devtools/devtools.html`
//      etc.

function tabExists(tabId) {
    return HTTPSB.tabs[tabId] !== undefined;
}

/******************************************************************************/

function getTabStateHash(tabId) {
    // It is a critical error for a tab to not be defnied here
    return getStateHash(HTTPSB.tabs[tabId].state);
}

/******************************************************************************/

function addTabState(tabId, type, domain) {
    // It is a critical error for a tab to not be defined here
    HTTPSB.tabs[tabId].state[type +  '/' + domain] = true;
}

/******************************************************************************/

function getStateHash(state) {
    var keys = Object.keys(state);
    keys.sort();
    return keys.join();
}

/******************************************************************************/

function computeTabState(tabId) {
    // Go through all recorded requests, apply filters to create state
    var tab = HTTPSB.tabs[tabId];
    // It is a critical error for a tab to not be defined here
    var computedState = {};
    var domain, type;
    for ( var url in tab.urls ) {
        for ( type in tab.urls[url].types ) {
            domain = getUrlDomain(url);
            if ( blacklisted(type, domain) ) {
                computedState[type +  '/' + domain] = true;
            }
        }
    }
    return computedState;
}

/******************************************************************************/

function tabStateChanged(tabId) {
    return getStateHash(computeTabState(tabId)) != getStateHash(HTTPSB.tabs[tabId].state);
}

