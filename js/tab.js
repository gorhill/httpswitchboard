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

// Experimental

function UrlPackerEntry(code) {
    this.count = 1;
    this.code = code;
}

var urlPacker = {
    uri: new URI(),
    codeGenerator: 0,
    codeJunkyard: [],
    fragmentToCode: {},
    codeToFragment: {},
    codeDigits: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',

    remember: function(url) {
        this.uri.href(url);
        var scheme = this.uri.scheme();
        var hostname = this.uri.hostname();
        var directory = this.uri.directory();
        var leaf = this.uri.filename() + this.uri.search();
        var entry;
        var packedScheme;
        if ( scheme !== '' ) {
            entry = this.fragmentToCode[scheme];
            if ( !entry ) {
                entry = this.codeJunkyard.pop();
                packedScheme = this.strFromCode(this.codeGenerator++);
                if ( !entry ) {
                    entry = new UrlPackerEntry(packedScheme);
                } else {
                    entry.code = packedScheme;
                    entry.count = 1;
                }
                this.fragmentToCode[scheme] = entry;
                this.codeToFragment[packedScheme] = scheme;
            } else {
                packedScheme = entry.code;
                entry.count++;
            }
        } else {
            packedScheme = '';
        }
        var packedHostname;
        if ( hostname !== '' ) {
            entry = this.fragmentToCode[hostname];
            if ( !entry ) {
                entry = this.codeJunkyard.pop();
                packedHostname = this.strFromCode(this.codeGenerator++);
                if ( !entry ) {
                    entry = new UrlPackerEntry(packedHostname);
                } else {
                    entry.code = packedHostname;
                    entry.count = 1;
                }
                this.fragmentToCode[hostname] = entry;
                this.codeToFragment[packedHostname] = hostname;
            } else {
                packedHostname = entry.code;
                entry.count++;
            }
        } else {
            packedHostname = '';
        }
        var packedDirectory;
        if ( directory !== '' ) {
            entry = this.fragmentToCode[directory];
            if ( !entry ) {
                packedDirectory = this.strFromCode(this.codeGenerator++);
                entry = this.codeJunkyard.pop();
                if ( !entry ) {
                    entry = new UrlPackerEntry(packedDirectory);
                } else {
                    entry.code = packedDirectory;
                    entry.count = 1;
                }
                this.fragmentToCode[directory] = entry;
                this.codeToFragment[packedDirectory] = directory;
            } else {
                packedDirectory = entry.code;
                entry.count++;
            }
        } else {
            packedDirectory = '';
        }
        // Return assembled packed fragments
        return packedScheme + '/' + packedHostname + '/' + packedDirectory + '/' + leaf;
    },

    forget: function() {
    },

    strFromCode: function(code) {
        var s = '';
        var codeDigits = this.codeDigits;
        while ( code ) {
            s = s + String.fromCharCode(codeDigits.charCodeAt(code & 63));
            code = code >> 6;
        }
        return s;
    },

};

/******************************************************************************/

function createRequestStatsEntry() {
    var requestStatsEntry = requestStatsEntryJunkyard.pop();
    if ( requestStatsEntry ) {
        return requestStatsEntry;
    }
    return new RequestStatsEntry();
}

function RequestStatsEntry() {
    this.when = 0;
    this.blocked = false;
}

RequestStatsEntry.prototype.dispose = function() {
    if ( requestStatsEntryJunkyard.length < 200 ) {
        requestStatsEntryJunkyard.push(this);
    }
};

var requestStatsEntryJunkyard = [];

/******************************************************************************/

function createPageStatsEntry(pageUrl) {
    var pageStatsEntry = pageStatsEntryJunkyard.pop();
    if ( pageStatsEntry ) {
        return pageStatsEntry.init(pageUrl);
    }
    return new pageStatsEntry(pageUrl);
}

function PageStatsEntry(pageUrl) {
    this.pageUrl = '';
    this.requests = {};
    this.packedRequests = null;
    this.requestCount = 0;
    this.domains = {};
    this.state = {};
    this.requestStats = new WebRequestStats();
    this.visible = false;
    this.ignore = false;
    this.init(pageUrl);
}

PageStatsEntry.prototype.init = function(pageUrl) {
    this.pageUrl = pageUrl;
    this.ignore = HTTPSB.excludeRegex.test(pageUrl);
    return this;
};

PageStatsEntry.prototype.dispose = function() {
    this.pageUrl = '';
    // Iterate through all requests and return them to the junkyard for
    // later reuse.
    var reqKeys = Object.keys(this.requests);
    var i = reqKeys.length;
    var reqKey;
    while ( i-- ) {
        reqKey = reqKeys[i];
        this.requests[reqKey].dispose();
        delete this.requests[reqKey];
    }
    this.requestCount = 0;
    this.domains = {};
    this.state = {};
    this.requestStats.reset();
    this.visible = true;
    pageStatsEntryJunkyard.push(this);
};

var pageStatsEntryJunkyard = [];

/******************************************************************************/

// Garbage collect stale url stats entries
// rhill 2013-10-23: revised to avoid closures.

function garbageCollectStalePageStatsWithNoTabsCallback(tabs) {
    var httpsb = HTTPSB;
    var visibleTabs = {};
    tabs.map(function(tab) {
        visibleTabs[tab.id] = true;
    });
    var pageUrls = Object.keys(httpsb.pageStats);
    var i = pageUrls.length;
    var pageUrl, tabId, pageStats;
    while ( i-- ) {
        pageUrl = pageUrls[i];
        // Do not dispose of chromium-behind-the-scene virtual tab,
        // GC is done differently on this one (i.e. just pruning).
        if ( pageUrl === httpsb.behindTheSceneURL ) {
            continue;
        }
        tabId = tabIdFromPageUrl(pageUrl);
        pageStats = httpsb.pageStats[pageUrl];
        if ( !visibleTabs[tabId] && !pageStats.visible ) {
            cookieHunter.erase(pageStats);
            httpsb.pageStats[pageUrl].dispose();
            delete httpsb.pageStats[pageUrl];
            // console.debug('HTTP Switchboard > GC: disposed of "%s"', pageUrl);
        }
        pageStats.visible = !!visibleTabs[tabId];
        if ( !pageStats.visible ) {
            unbindTabFromPageStats(tabId);
        }
    }
}

function garbageCollectStalePageStatsCallback() {
    var httpsb = HTTPSB;

    // Get rid of stale pageStats, those not bound to a tab for more than
    // {duration placeholder}.
    chrome.tabs.query({ 'url': '<all_urls>' }, garbageCollectStalePageStatsWithNoTabsCallback);

    // Prune content of chromium-behind-the-scene virtual tab
    var pageStats = httpsb.pageStats[httpsb.behindTheSceneURL];
    if ( pageStats ) {
        var reqKeys = Object.keys(pageStats.requests);
        if ( reqKeys > httpsb.behindTheSceneMaxReq ) {
            reqKeys = reqKeys.sort(function(a,b){
                var ra = pageStats.requests[a];
                var rb = pageStats.requests[b];
                if ( rb.when < ra.when ) { return -1; }
                if ( ra.when < rb.when ) { return 1; }
                return 0;
            }).slice(httpsb.behindTheSceneMaxReq);
            var iReqKey = reqKeys.length;
            var reqKey;
            while ( iReqKey-- ) {
                reqKey = reqKeys[iReqKey];
                pageStats.requests[reqKey].dispose();
                delete pageStats.requests[reqKey];
            }
        }
    }
}

// Time somewhat arbitrary: If a web page has not been in a tab for 10 minutes,
// flush its stats.
//                                                                          min  sec  1-sec
asyncJobQueue.add('gcPageStats', null, garbageCollectStalePageStatsCallback, 10 * 60 * 1000, true);

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
        httpsb.pageStats[pageUrl] = new PageStatsEntry(pageUrl);
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
    unbindTabFromPageStats(tabId);
    HTTPSB.pageUrlToTabId[pageUrl] = tabId;
    HTTPSB.tabIdToPageUrl[tabId] = pageUrl;
    return pageStats;
}

function unbindTabFromPageStats(tabId) {
    var httpsb = HTTPSB;
    var pageUrl = httpsb.tabIdToPageUrl[tabId];
    if ( pageUrl ) {
        delete httpsb.pageUrlToTabId[pageUrl];
    }
    delete httpsb.tabIdToPageUrl[tabId];
}

/******************************************************************************/

function urlFromReqKey(reqKey) {
    return reqKey.slice(0, reqKey.indexOf('#'));
}

function typeFromReqKey(reqKey) {
    return reqKey.slice(reqKey.indexOf('#') + 1);
}

/******************************************************************************/

// Log a request

function recordFromTabId(tabId, type, url, blocked) {
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats ) {
        recordFromPageStats(pageStats, type, url, blocked);
    }
}

function recordFromPageUrl(pageUrl, type, url, blocked) {
    var pageStats = pageStatsFromPageUrl(pageUrl);
    if ( pageStats ) {
        recordFromPageStats(pageStats, type, url, blocked);
    }
}

function recordFromPageStats(pageStats, type, url, blocked) {
    if ( !pageStats ) {
        // console.error('HTTP Switchboard > recordFromPageStats > no pageStats');
        return;
    }

    var reqKey = url + '#' + type;

//    var packedUrl = urlPacker.remember(url) + '#' + type;

    var requestStatsEntry = pageStats.requests[reqKey];
    if ( requestStatsEntry ) {
        requestStatsEntry.when = Date.now();
        requestStatsEntry.blocked = blocked;
        return;
    }

    requestStatsEntry = createRequestStatsEntry();
    requestStatsEntry.when = Date.now();
    requestStatsEntry.blocked = blocked;
    pageStats.requests[reqKey] = requestStatsEntry;
    pageStats.requestCount++;
    pageStats.domains[getHostnameFromURL(url)] = true;

    updateBadge(pageStats.pageUrl);
    urlStatsChanged(pageStats.pageUrl);
    // console.debug("HTTP Switchboard > recordFromPageStats > %o: %s @ %s", pageStats, type, url);
}

/******************************************************************************/

// Reload content of a tabs.
// rhill 2013-10-23: revised to avoid closures.

function smartReloadExistingTabsCallback(chromeTabs) {
    var tabId;
    var i = chromeTabs.length;
    while ( i-- ) {
        tabId = chromeTabs[i].id;
        if ( tabExists(tabId) ) {
            smartReloadTab(tabId);
        }
    }
}

function smartReloadTabsCallback() {
    chrome.tabs.query({ status: 'complete' }, smartReloadExistingTabsCallback);
}

function smartReloadTabs() {
    asyncJobQueue.add('smartReloadTabs', null, smartReloadTabsCallback, 250);
}

/******************************************************************************/

// reload content of a tab

function smartReloadTab(tabId) {
    var newState = computeTabState(tabId);
    var pageUrl = pageUrlFromTabId(tabId);
    if ( !pageUrl ) {
        //console.error('HTTP Switchboard > smartReloadTab > page url for tab id %d not found', tabId);
        return;
    }
    var pageStats = pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        //console.error('HTTP Switchboard > smartReloadTab > page stats for tab id %d not found', tabId);
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
    // console.error('HTTP Switchboard > addStateFromTabId > page stats for tab id %d not found', tabId);
}

function addStateFromPageUrl(pageUrl, type, domain) {
    var pageStats = pageStatsFromPageUrl(pageUrl);
    if ( pageStats ) {
        addStateFromPageStats(pageStats, type, domain);
        return;
    }
    // console.error('HTTP Switchboard > addStateFromPageUrl > page stats for page url %s not found', pageUrl);
}

function addStateFromPageStats(pageStats, type, domain) {
    if ( pageStats ) {
        pageStats.state[type +  '/' + domain] = true;
        return;
    }
    // console.error('HTTP Switchboard > addStateFromPageStats > page stats is null');
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
        //console.error('HTTP Switchboard > computeTabState > page stats for tab id %d not found', tabId);
        return {};
    }
    // Go through all recorded requests, apply filters to create state
    // It is a critical error for a tab to not be defined here
    var computedState = {};
    var url, domain, type;
    for ( var reqKey in pageStats.requests ) {
        url = urlFromReqKey(reqKey);
        domain = getHostnameFromURL(url);
        type = typeFromReqKey(reqKey);
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

