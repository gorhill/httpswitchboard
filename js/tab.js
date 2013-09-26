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

// Check if a URL stats store exists

function normalizeChromiumUrl(url) {
    // remove fragment...
    var i = url.search('#');
    if ( i >= 0 ) {
        return url.slice(0,i);
    }
    return url;
}

/******************************************************************************/

// Check if a page url stats store exists

function pageStatsExists(pageUrl) {
    return !!pageStatsFromPageUrl(pageUrl);
}

/******************************************************************************/

// Create a new page url stats store (if not already present)

function createPageStats(pageUrl) {
    // do not create stats store for urls which are of no interest
    if ( pageUrl.search(/^https?:\/\//) !== 0 ) {
        return undefined;
    }
    var httpsb = HTTPSB;
    if ( !httpsb.pageStats[pageUrl] ) {
        httpsb.pageStats[pageUrl] = {
            pageUrl: pageUrl,
            requests: {},
            domains: {},
            state: {},
            lastTouched: Date.now()
            };
    }
    return httpsb.pageStats[pageUrl];
}

/******************************************************************************/

// Create an entry for the tab if it doesn't exist

function bindTabToPageStats(tabId, pageUrl) {
    var pageStats = createPageStats(pageUrl);
    if ( !pageStats ) {
        return undefined;
    }
    // console.debug('bindTabToPageStats > dispatching traffic in tab id %d to url stats store "%s"', tabId, pageUrl);
    var httpsb = HTTPSB;
    if ( httpsb.tabIdToPageUrl[tabId] ) {
        httpsb.pageUrlToTabId[httpsb.tabIdToPageUrl[tabId]] = undefined;
    }
    httpsb.pageUrlToTabId[pageUrl] = tabId;
    httpsb.tabIdToPageUrl[tabId] = pageUrl;
    return pageStats;
}

/******************************************************************************/

// Log a request

function recordFromTabId(tabId, type, url) {
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats ) {
        recordFromPageStats(pageStats, type, url);
    }
}

function recordFromPageUrl(pageUrl, type, url) {
    var pageStats = pageStatsFromPageUrl(pageUrl);
    if ( pageStats ) {
        recordFromPageStats(pageStats, type, url);
    }
}

function recordFromPageStats(pageStats, type, url) {
    if ( !pageStats ) {
        console.error('HTTP Switchboard > recordFromPageStats > no pageStats');
        return;
    }
    pageStats.lastTouched = Date.now();

    // TODO: if an obnoxious web page keep generating traffic, this could suck.
    updateBadge(pageStats.pageUrl);

    if ( pageStats.requests[url] ) {
        console.assert(pageStats.requests[url] === type, 'HTTP Switchboard.recordFromPageStats >', url, ':', pageStats.requests[url], '===', type);
        return;
    }

    // TODO: create an easily parsed key from url & type, and use bool instead.
    // That will also take care of the above assertion failure seen once in a
    // while.
    pageStats.requests[url] = type;
    pageStats.domains[getUrlDomain(url)] = true;
    urlStatsChanged(pageStats.pageUrl);
    // console.debug("HTTP Switchboard > recordFromPageStats > %o: %s @ %s", pageStats, type, url);
}

/******************************************************************************/

// reload content of a tabs

var smartReloadTabsTimer = null;

function smartReloadTabs() {
    if ( smartReloadTabsTimer ) {
        clearTimeout(smartReloadTabsTimer);
    }
    smartReloadTabsTimer = setTimeout(function() {
        smartReloadTabsTimer = null;
        chrome.tabs.query({ status: 'complete' }, function(chromeTabs){
            var tabId;
            for ( var i = 0; i < chromeTabs.length; i++ ) {
                tabId = chromeTabs[i].id;
                if ( tabExists(tabId) ) {
                    smartReloadTab(tabId);
                }
            }
        });
    }, 250);
}

/******************************************************************************/

// reload content of a tab

function smartReloadTab(tabId) {
    var newState = computeTabState(tabId);
    var pageUrl = pageUrlFromTabId(tabId);
    if ( !pageUrl ) {
        console.error('HTTP Switchboard > smartReloadTab > page url for tab id %d not found', tabId);
        return;
    }
    var pageStats = pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        console.error('HTTP Switchboard > smartReloadTab > page stats for tab id %d not found', tabId);
        return;
    }

    if ( getStateHash(newState) != getStateHash(pageStats.state) ) {
        // console.debug('reloaded content of tab id %d', tabId);
        // console.debug('old="%s"\nnew="%s"', getStateHash(pageStats.state), getStateHash(newState));
        pageStats.state = newState;
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
    return !!pageUrlFromTabId(tabId);
}

/******************************************************************************/

function getTabStateHash(tabId) {
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats ) {
        return getStateHash(pageStats.state);
    }
    console.error('HTTP Switchboard > getTabStateHash > page stats for tab id %d not found', tabId);
    return '';
}

/******************************************************************************/

function addStateFromTabId(tabId, type, domain) {
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats ) {
        addStateFromPageStats(pageStats, type, domain);
        return;
    }
    console.error('HTTP Switchboard > addStateFromTabId > page stats for tab id %d not found', tabId);
}

function addStateFromPageUrl(pageUrl, type, domain) {
    var pageStats = pageStatsFromPageUrl(pageUrl);
    if ( pageStats ) {
        addStateFromPageStats(pageStats, type, domain);
        return;
    }
    console.error('HTTP Switchboard > addStateFromPageUrl > page stats for page url %s not found', pageUrl);
}

function addStateFromPageStats(pageStats, type, domain) {
    if ( pageStats ) {
        pageStats.state[type +  '/' + domain] = true;
        return;
    }
    console.error('HTTP Switchboard > addStateFromPageStats > page stats is null');
}

/******************************************************************************/

function getStateHash(state) {
    var keys = Object.keys(state);
    if ( !keys.length ) {
        return '';
    }
    keys.sort();
    return keys.join();
}

/******************************************************************************/

function computeTabState(tabId) {
    var pageStats = pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        console.error('HTTP Switchboard > computeTabState > page stats for tab id %d not found', tabId);
        return {};
    }
    // Go through all recorded requests, apply filters to create state
    // It is a critical error for a tab to not be defined here
    var computedState = {};
    var domain, type;
    for ( var url in pageStats.requests ) {
        domain = getUrlDomain(url);
        type = pageStats.requests[url];
        if ( blacklisted(type, domain) ) {
            computedState[type +  '/' + domain] = true;
        }
    }
    return computedState;
}

/******************************************************************************/

function tabStateChanged(tabId) {
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats ) {
        return getStateHash(computeTabState(tabId)) != getStateHash(pageStats.state);
    }
    console.error('HTTP Switchboard > tabStateChanged > page stats for tab id %d not found', tabId);
    return false;
}

/******************************************************************************/

function tabIdFromPageUrl(pageUrl) {
    return HTTPSB.pageUrlToTabId[pageUrl];
}

function tabIdFromPageStats(pageStats) {
    return tabIdFromPageUrl(pageStats.pageUrl);
}

function pageUrlFromTabId(tabId) {
    return HTTPSB.tabIdToPageUrl[tabId];
}

function pageUrlFromPageStats(pageStats) {
    return pageStats.pageUrl;
}

function pageStatsFromTabId(tabId) {
    var pageUrl = HTTPSB.tabIdToPageUrl[tabId];
    if ( pageUrl ) {
        return HTTPSB.pageStats[pageUrl];
    }
    return undefined;
}

function pageStatsFromPageUrl(pageUrl) {
    return HTTPSB.pageStats[pageUrl];
}

