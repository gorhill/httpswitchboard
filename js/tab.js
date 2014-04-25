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

PageStatsEntry.junkyard = [];

PageStatsEntry.factory = function(pageUrl) {
    var entry = PageStatsEntry.junkyard.pop();
    if ( entry ) {
        return entry.init(pageUrl);
    }
    return new PageStatsEntry(pageUrl);
};

/******************************************************************************/

PageStatsEntry.prototype.init = function(pageUrl) {
    this.pageUrl = pageUrl;
    this.pageHostname = HTTPSB.URI.hostnameFromURI(pageUrl);
    this.pageDomain = HTTPSB.URI.domainFromHostname(this.pageHostname);
    this.pageScriptBlocked = false;
    this.thirdpartyScript = false;
    this.requests = HTTPSB.PageRequestStats.factory();
    this.domains = {};
    this.state = {};
    this.requestStats.reset();
    this.distinctRequestCount = 0;
    this.perLoadAllowedRequestCount = 0;
    this.perLoadBlockedRequestCount = 0;
    this.ignore = false;
    this.abpBlockCount = 0;
    return this;
};

/******************************************************************************/

PageStatsEntry.prototype.dispose = function() {
    this.requests.dispose();

    // rhill 2013-11-07: Even though at init time these are reset, I still
    // need to release the memory taken by these, which can amount to
    // sizeable enough chunks (especially requests, through the request URL
    // used as a key).
    this.pageUrl = '';
    this.pageHostname = '';
    this.pageDomain = '';
    this.domains = {};
    this.state = {};

    PageStatsEntry.junkyard.push(this);
};

/******************************************************************************/

// rhill 2014-03-11: If `block` !== false, then block.toString() may return
// user legible information about the reason for the block.

PageStatsEntry.prototype.recordRequest = function(type, url, block, reason) {
    // TODO: this makes no sense, I forgot why I put this here.
    if ( !this ) {
        // console.error('HTTP Switchboard > PageStatsEntry.recordRequest() > no pageStats');
        return;
    }

    // rhill 2013-10-26: This needs to be called even if the request is
    // already logged, since the request stats are cached for a while after
    // the page is no longer visible in a browser tab.
    updateBadge(this.pageUrl);

    // Count blocked/allowed requests
    this.requestStats.record(type, block);

    if ( block !== false ) {
        this.perLoadBlockedRequestCount++;
    } else {
        this.perLoadAllowedRequestCount++;
    }

    this.requests.logRequest(url, type, block, reason);

    if ( !this.requests.createEntryIfNotExists(url, type, block) ) {
        return;
    }

    var hostname = HTTPSB.URI.hostnameFromURI(url);

    // https://github.com/gorhill/httpswitchboard/issues/181
    if ( type === 'script' && hostname !== this.pageHostname ) {
        this.thirdpartyScript = true;
    }

    // rhill 2013-12-24: put blocked requests in dict on the fly, since
    // doing it only at one point after the page has loaded completely will
    // result in unnecessary reloads (because requests can be made *after*
    // the page load has completed).
    // https://github.com/gorhill/httpswitchboard/issues/98
    // rhill 2014-03-12: disregard blocking operations which do not originate
    // from matrix evaluation, or else this can cause a useless reload of the
    // page if something important was blocked through ABP filtering.
    if ( block !== false && reason === undefined ) {
        this.state[type + '|' + hostname] = true;
    }

    this.distinctRequestCount++;
    this.domains[hostname] = true;

    urlStatsChanged(this.pageUrl);
    // console.debug("HTTP Switchboard > PageStatsEntry.recordRequest() > %o: %s @ %s", this, type, url);
};

/******************************************************************************/

PageStatsEntry.prototype.getPageURL = function() {
    if ( !this ) {
        return undefined;
    }
    return this.pageUrl;
};

/******************************************************************************/

// Update badge, incrementally

// rhill 2013-11-09: well this sucks, I can't update icon/badge
// incrementally, as chromium overwrite the icon at some point without
// notifying me, and this causes internal cached state to be out of sync.

PageStatsEntry.prototype.updateBadge = function(tabId) {
    var httpsb = HTTPSB;

    // Icon
    var iconPath;
    var total = this.perLoadAllowedRequestCount + this.perLoadBlockedRequestCount;
    if ( total ) {
        var squareSize = 19;
        var greenSize = squareSize * Math.sqrt(this.perLoadAllowedRequestCount / total);
        greenSize = greenSize < squareSize/2 ? Math.ceil(greenSize) : Math.floor(greenSize);
        iconPath = 'img/browsericons/icon19-' + greenSize + '.png';
    } else {
        iconPath = 'img/browsericons/icon19.png';
    }
    chrome.browserAction.setIcon({ tabId: tabId, path: iconPath });

    // Badge text & color
    var badgeColor;
    var badgeStr = httpsb.formatCount(this.distinctRequestCount);
    var scopeKey = httpsb.temporaryScopeKeyFromPageURL(this.pageUrl);
    if ( httpsb.isDomainScopeKey(scopeKey) ) {
        badgeColor = '#24c';
    } else if ( httpsb.isSiteScopeKey(scopeKey) ) {
        badgeColor = '#48c';
    } else {
        badgeColor = '#000';
    }

    chrome.browserAction.setBadgeText({ tabId: tabId, text: badgeStr });
    chrome.browserAction.setBadgeBackgroundColor({ tabId: tabId, color: badgeColor });
};

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
        tabId = httpsb.tabIdFromPageUrl(pageUrl);
        pageStats = httpsb.pageStats[pageUrl];
        if ( !visibleTabs[tabId] && !pageStats.visible ) {
            cookieHunter.removePageCookiesAsync(pageStats);
            httpsb.pageStats[pageUrl].dispose();
            delete httpsb.pageStats[pageUrl];
            // console.debug('HTTP Switchboard > GC: disposed of "%s"', pageUrl);
        }
        pageStats.visible = !!visibleTabs[tabId];
        if ( !pageStats.visible ) {
            httpsb.unbindTabFromPageStats(tabId);
        }
    }
}

function garbageCollectStalePageStatsCallback() {
    var httpsb = HTTPSB;

    // Get rid of stale pageStats, those not bound to a tab for more than
    // {duration placeholder}.
    chrome.tabs.query({ 'url': '<all_urls>' }, garbageCollectStalePageStatsWithNoTabsCallback);

    // Prune content of chromium-behind-the-scene virtual tab
    // When `suggest-as-you-type` is on in Chromium, this can lead to a
    // LOT of uninteresting behind the scene requests.
    var pageStats = httpsb.pageStats[httpsb.behindTheSceneURL];
    if ( pageStats ) {
        var reqKeys = pageStats.requests.getRequestKeys();
        if ( reqKeys.length > httpsb.behindTheSceneMaxReq ) {
            reqKeys = reqKeys.sort(function(a,b){
                return pageStats.requests[b] - pageStats.requests[a];
            }).slice(httpsb.behindTheSceneMaxReq);
            var iReqKey = reqKeys.length;
            while ( iReqKey-- ) {
                pageStats.requests.disposeOne(reqKeys[iReqKey]);
            }
        }
    }
}

// Time somewhat arbitrary: If a web page has not been in a tab for 10 minutes,
// flush its stats.
//                                                                              min  sec   1sec
HTTPSB.asyncJobs.add('gcPageStats', null, garbageCollectStalePageStatsCallback, 10 * 60 * 1000, true);

/******************************************************************************/

// Create a new page url stats store (if not already present)

HTTPSB.createPageStats = function(pageUrl) {
    // do not create stats store for urls which are of no interest
    if ( pageUrl.search(/^https?:\/\//) !== 0 ) {
        return undefined;
    }
    var pageStats = this.pageStats[pageUrl];
    if ( !pageStats ) {
        pageStats = PageStatsEntry.factory(pageUrl);
        // These counters are used so that icon presents an overview of how
        // much allowed/blocked.
        pageStats.perLoadAllowedRequestCount =
        pageStats.perLoadBlockedRequestCount = 0;
        this.pageStats[pageUrl] = pageStats;
    } else if ( pageStats.pageUrl !== pageUrl ) {
        pageStats.init(pageUrl);
    }

    return pageStats;
};

/******************************************************************************/

// Create an entry for the tab if it doesn't exist

HTTPSB.bindTabToPageStats = function(tabId, pageURL) {
    var pageStats = this.createPageStats(pageURL);

    // console.debug('HTTP Switchboard> HTTPSB.bindTabToPageStats(): dispatching traffic in tab id %d to url stats store "%s"', tabId, pageUrl);

    // rhill 2013-11-24: Never ever rebind chromium-behind-the-scene
    // virtual tab.
    // https://github.com/gorhill/httpswitchboard/issues/67
    if ( tabId !== this.behindTheSceneTabId ) {
        this.unbindTabFromPageStats(tabId);

        // rhill 2014-02-08: Do not create an entry if no page store
        // exists (like when visiting about:blank)
        // https://github.com/gorhill/httpswitchboard/issues/186
        if ( pageStats ) {
            this.pageUrlToTabId[pageURL] = tabId;
            this.tabIdToPageUrl[tabId] = pageURL;
        }
    }

    return pageStats;
};

HTTPSB.unbindTabFromPageStats = function(tabId) {
    var pageUrl = this.tabIdToPageUrl[tabId];
    if ( pageUrl ) {
        delete this.pageUrlToTabId[pageUrl];
    }
    delete this.tabIdToPageUrl[tabId];
};

/******************************************************************************/

// Log a request

HTTPSB.recordFromTabId = function(tabId, type, url, blocked) {
    var pageStats = this.pageStatsFromTabId(tabId);
    if ( pageStats ) {
        pageStats.recordRequest(type, url, blocked);
    }
};

HTTPSB.recordFromPageUrl = function(pageUrl, type, url, blocked, reason) {
    var pageStats = this.pageStatsFromPageUrl(pageUrl);
    if ( pageStats ) {
        pageStats.recordRequest(type, url, blocked, reason);
    }
};

/******************************************************************************/

HTTPSB.onPageLoadCompleted = function(pageURL) {
    var pageStats = this.pageStatsFromPageUrl(pageURL);
    if ( !pageStats ) {
        return;
    }

    // https://github.com/gorhill/httpswitchboard/issues/181
    if ( pageStats.thirdpartyScript ) {
        pageStats.recordRequest('script', pageURL + '{3rd-party_scripts}', pageStats.pageScriptBlocked);
    }
};

/******************************************************************************/

// Reload content of a tabs.

HTTPSB.smartReloadTabs = function(which, tabId) {
    if ( which === 'none' ) {
        return;
    }

    if ( which === 'current' && typeof tabId === 'number' ) {
        this.smartReloadTab(tabId);
        return;
    }

    // which === 'all'
    var reloadTabs = function(chromeTabs) {
        var httpsb = HTTPSB;
        var tabId;
        var i = chromeTabs.length;
        while ( i-- ) {
            tabId = chromeTabs[i].id;
            if ( httpsb.tabExists(tabId) ) {
                httpsb.smartReloadTab(tabId);
            }
        }
    };

    var getTabs = function() {
        chrome.tabs.query({ status: 'complete' }, reloadTabs);
    };

    this.asyncJobs.add('smartReloadTabs', null, getTabs, 500);
}

/******************************************************************************/

// Reload content of a tab

HTTPSB.smartReloadTab = function(tabId) {
    var pageStats = this.pageStatsFromTabId(tabId);
    if ( !pageStats || pageStats.ignore ) {
        //console.error('HTTP Switchboard> HTTPSB.smartReloadTab(): page stats for tab id %d not found', tabId);
        return;
    }

    // rhill 2013-12-23: Reload only if something previously blocked is now
    // unblocked.
    var blockRule;
    var oldState = pageStats.state;
    var newState = this.computeTabState(tabId);
    var mustReload = false;
    for ( blockRule in oldState ) {
        if ( !oldState.hasOwnProperty(blockRule) ) {
            continue;
        }
        // General rule, reload...
        // If something previously blocked is no longer blocked.
        if ( !newState[blockRule] ) {
            // console.debug('HTTP Switchboard> HTTPSB.smartReloadTab(): will reload because "%s" is no longer blocked', blockRule);
            mustReload = true;
            break;
        }
    }
    // Exceptions: blocking these previously unblocked types must result in a
    // reload:
    // - a script
    // - a frame
    // Related issues:
    // https://github.com/gorhill/httpswitchboard/issues/94
    // https://github.com/gorhill/httpswitchboard/issues/141
    if ( !mustReload ) {
        var blockRuleType;
        for ( blockRule in newState ) {
            if ( !newState.hasOwnProperty(blockRule) ) {
                continue;
            }
            blockRuleType = blockRule.slice(0, blockRule.indexOf('|'));
            if ( blockRuleType !== 'script' && blockRuleType !== 'sub_frame' ) {
                continue;
            }
            if ( !oldState[blockRule] ) {
                // console.debug('HTTP Switchboard> HTTPSB.smartReloadTab(): will reload because "%s" is now blocked', blockRule);
                mustReload = true;
                break;
            }
        }
    }

    if ( mustReload ) {
        chrome.tabs.reload(tabId);
    }
    // pageStats.state = newState;
};

/******************************************************************************/

// Required since not all tabs are of interests to HTTP Switchboard.
// Examples:
//      `chrome://extensions/`
//      `chrome-devtools://devtools/devtools.html`
//      etc.

HTTPSB.tabExists = function(tabId) {
    return !!this.pageUrlFromTabId(tabId);
};

/******************************************************************************/

HTTPSB.computeTabState = function(tabId) {
    var pageStats = this.pageStatsFromTabId(tabId);
    if ( !pageStats ) {
        //console.error('HTTP Switchboard> HTTPSB.computeTabState(): page stats for tab id %d not found', tabId);
        return {};
    }
    // Go through all recorded requests, apply filters to create state
    // It is a critical error for a tab to not be defined here
    var pageURL = pageStats.pageUrl;
    var scopeKey = this.temporaryScopeKeyFromPageURL(pageURL);
    var requestDict = pageStats.requests.getRequestDict();
    var computedState = {};
    var hostname, type;
    for ( var reqKey in requestDict ) {
        if ( !requestDict.hasOwnProperty(reqKey) ) {
            continue;
        }

        // The evaluation code here needs to reflect the evaluation code in
        // beforeRequestHandler()
        hostname = this.PageRequestStats.hostnameFromRequestKey(reqKey);

        // rhill 2013-12-10: mind how stylesheets are to be evaluated:
        // `stylesheet` or `other`? Depends of domain of request.
        // https://github.com/gorhill/httpswitchboard/issues/85
        type = this.PageRequestStats.typeFromRequestKey(reqKey);
        if ( this.blacklistedFromScopeKey(scopeKey, type, hostname) ) {
            computedState[type +  '|' + hostname] = true;
        }
    }
    return computedState;
};

/******************************************************************************/

HTTPSB.tabIdFromPageUrl = function(pageUrl) {
    return this.pageUrlToTabId[pageUrl];
};

HTTPSB.tabIdFromPageStats = function(pageStats) {
    return this.tabIdFromPageUrl(pageStats.pageUrl);
};

HTTPSB.pageUrlFromTabId = function(tabId) {
    return this.tabIdToPageUrl[tabId];
};

HTTPSB.pageUrlFromPageStats = function(pageStats) {
    if ( pageStats ) {
        return pageStats.getPageURL();
    }
    return undefined;
};

HTTPSB.pageStatsFromTabId = function(tabId) {
    var pageUrl = this.tabIdToPageUrl[tabId];
    if ( pageUrl ) {
        return this.pageStats[pageUrl];
    }
    return undefined;
};

HTTPSB.pageStatsFromPageUrl = function(pageUrl) {
    if ( pageUrl ) {
        return this.pageStats[pageUrl];
    }
    return null;
};

/******************************************************************************/

HTTPSB.forceReload = function(pageURL) {
    var tabId = this.tabIdFromPageUrl(pageURL);
    if ( tabId ) {
        chrome.tabs.reload(tabId, { bypassCache: true });
    }
};

