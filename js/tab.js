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

PageStatsRequestEntry.junkyard = [];

/*----------------------------------------------------------------------------*/

PageStatsRequestEntry.factory = function() {
    var entry = PageStatsRequestEntry.junkyard.pop();
    if ( entry ) {
        return entry;
    }
    return new PageStatsRequestEntry();
};

/*----------------------------------------------------------------------------*/

PageStatsRequestEntry.prototype.dispose = function() {
    // Let's not grab and hold onto too much memory..
    if ( PageStatsRequestEntry.junkyard.length < 200 ) {
        PageStatsRequestEntry.junkyard.push(this);
    }
};

/******************************************************************************/

PageStatsRequests.factory = function() {
    var requests = new PageStatsRequests();
    requests.ringBuffer = new Array(HTTPSB.userSettings.maxLoggedRequests);
    return requests;
};

/*----------------------------------------------------------------------------*/

// Request key:
// index: 01234567...
//        HHHHHHTN...
//        ^     ^^
//        |     ||
//        |     |+--- short string code for hostname (dict-based)
//        |     +--- single char code for type of request
//        +--- FNV32a hash of whole URI (irreversible)

PageStatsRequests.makeRequestKey = function(uri, reqType) {
    // Ref: Given a URL, returns a unique 7-character long hash string
    // Based on: FNV32a
    // http://www.isthe.com/chongo/tech/comp/fnv/index.html#FNV-reference-source
    // The rest is custom, suited for HTTPSB.
    var hint = 0x811c9dc5;
    var i = uri.length;
    while ( i-- ) {
        hint ^= uri.charCodeAt(i);
        hint += hint<<1 + hint<<4 + hint<<7 + hint<<8 + hint<<24;
    }
    hint = hint >>> 0;

    // convert 32-bit hash to str
    var hstr = '';
    i = 6;
    while ( i-- ) {
        hstr += PageStatsRequests.charCodes.charAt(hint & 0x3F);
        hint >>= 6;
    }

    // append code for type
    hstr += PageStatsRequests.typeToCode[reqType] || 'z';

    // append code for hostname
    hstr += stringPacker.pack(uriTools.hostnameFromURI(uri));

    return hstr;
};

PageStatsRequests.charCodes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
PageStatsRequests.typeToCode = {
    'main_frame'    : 'a',
    'sub_frame'     : 'b',
    'stylesheet'    : 'c',
    'script'        : 'd',
    'image'         : 'e',
    'object'        : 'f',
    'xmlhttprequest': 'g',
    'other'         : 'h',
    'cookie'        : 'i'
};
PageStatsRequests.codeToType = {
    'a': 'main_frame',
    'b': 'sub_frame',
    'c': 'stylesheet',
    'd': 'script',
    'e': 'image',
    'f': 'object',
    'g': 'xmlhttprequest',
    'h': 'other',
    'i': 'cookie'
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.rememberRequestKey = function(reqKey) {
    stringPacker.remember(reqKey.slice(7));
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.forgetRequestKey = function(reqKey) {
    stringPacker.forget(reqKey.slice(7));
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.hostnameFromRequestKey = function(reqKey) {
    return stringPacker.unpack(reqKey.slice(7));
};
PageStatsRequests.prototype.hostnameFromRequestKey = PageStatsRequests.hostnameFromRequestKey;

/*----------------------------------------------------------------------------*/

PageStatsRequests.typeFromRequestKey = function(reqKey) {
    return PageStatsRequests.codeToType[reqKey.charAt(6)];
};
PageStatsRequests.prototype.typeFromRequestKey = PageStatsRequests.typeFromRequestKey;

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.createEntryIfNotExists = function(url, type, block) {
    this.logRequest(url, type);
    var reqKey = PageStatsRequests.makeRequestKey(url, type);
    var entry = this.requests[reqKey];
    if ( entry ) {
        entry.when = Date.now();
        entry.blocked = block;
        return false;
    }
    PageStatsRequests.rememberRequestKey(reqKey);
    entry = PageStatsRequestEntry.factory();
    entry.when = Date.now();
    entry.blocked = block;
    this.requests[reqKey] = entry;
    return true;
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.resizeLogBuffer = function(size) {
    if ( size === this.ringBuffer.length ) {
        return;
    }
    if ( !size ) {
        this.ringBuffer = new Array(0);
        this.ringBufferPointer = 0;
        return;
    }
    var newBuffer = new Array(size);
    var copySize = Math.min(size, this.ringBuffer.length);
    var newBufferPointer = (copySize % size) | 0;
    var isrc = this.ringBufferPointer;
    var ides = newBufferPointer;
    while ( copySize-- ) {
        isrc--;
        if ( isrc < 0 ) {
            isrc = this.ringBuffer.length - 1;
        }
        ides--;
        if ( ides < 0 ) {
            ides = size - 1;
        }
        newBuffer[ides] = this.ringBuffer[isrc];
    }
    this.ringBuffer = newBuffer;
    this.ringBufferPointer = newBufferPointer;
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.logRequest = function(url, type) {
    var buffer = this.ringBuffer;
    var len = buffer.length;
    if ( !len ) {
        return;
    }
    var pointer = this.ringBufferPointer;
    buffer[pointer] = url + '#' + type;
    this.ringBufferPointer = ((pointer + 1) % len) | 0;
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.getLoggedRequests = function() {
    var buffer = this.ringBuffer;
    if ( !buffer.length ) {
        return [];
    }
    // [0 - pointer] = most recent
    // [pointer - length] = least recent
    // thus, ascending order:
    //   [pointer - length] + [0 - pointer]
    var pointer = this.ringBufferPointer;
    return buffer.slice(pointer).concat(buffer.slice(0, pointer)).reverse();
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.getLoggedRequestEntry = function(reqURL, reqType) {
    return this.requests[PageStatsRequests.makeRequestKey(reqURL, reqType)];
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.getRequestKeys = function() {
    return Object.keys(this.requests);
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.getEntry = function(reqKey) {
    return this.requests[reqKey];
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.disposeOne = function(reqKey) {
    if ( this.requests[reqKey] ) {
        this.requests[reqKey].dispose();
        delete this.requests[reqKey];
        PageStatsRequests.forgetRequestKey(reqKey);
    }
};

/*----------------------------------------------------------------------------*/

PageStatsRequests.prototype.dispose = function() {
    var requests = this.requests;
    for ( var reqKey in requests ) {
        if ( requests.hasOwnProperty(reqKey) ) {
            stringPacker.forget(reqKey.slice(7));
            requests[reqKey].dispose();
            delete requests[reqKey];
        }
    }
    var i = this.ringBuffer.length;
    while ( i-- ) {
        this.ringBuffer[i] = '';
    }
    this.ringBufferPointer = 0;
};

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
    this.pageHostname = uriTools.uri(pageUrl).hostname();
    this.pageDomain = uriTools.domainFromHostname(this.pageHostname);
    this.requests = PageStatsRequests.factory();
    this.domains = {};
    this.state = {};
    this.requestStats.reset();
    this.distinctRequestCount = 0;
    this.perLoadAllowedRequestCount = 0;
    this.perLoadBlockedRequestCount = 0;
    this.ignore = HTTPSB.excludeRegex.test(pageUrl);
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

PageStatsEntry.prototype.recordRequest = function(type, url, block) {
    if ( !this ) {
        // console.error('HTTP Switchboard > PageStatsEntry.recordRequest() > no pageStats');
        return;
    }

    // rhill 2013-10-26: This needs to be called even if the request is
    // already logged, since the request stats are cached for a while after the
    // page is no longer in the browser.
    updateBadge(this.pageUrl);

    var hostname = uriTools.hostnameFromURI(url);

    // remember this blacklisting, used to create a snapshot of the state
    // of the page, which is useful for smart reload of the page (reload the
    // page only when permissions effectively change)
    if ( block ) {
        this.state[type +  '|' + hostname] = true;
    }

    // Count blocked/allowed requests
    this.requestStats.record(type, block);

    if ( block ) {
        this.perLoadBlockedRequestCount++;
    } else {
        this.perLoadAllowedRequestCount++;
    }

    if ( !this.requests.createEntryIfNotExists(url, type, block) ) {
        return;
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
    var badgeStr, badgeColor;
    if ( httpsb.off ) {
        badgeStr = '!!!';
        badgeColor = '#F00';
    } else {
        var count = this.distinctRequestCount;
        badgeStr = count.toFixed(0);
        if ( count >= 1000 ) {
            if ( count < 10000 ) {
                badgeStr = badgeStr.slice(0,1) + '.' + badgeStr.slice(1,-2) + 'K';
            } else if ( count < 1000000 ) {
                badgeStr = badgeStr.slice(0,-3) + 'K';
            } else if ( count < 10000000 ) {
                badgeStr = badgeStr.slice(0,1) + '.' + badgeStr.slice(1,-5) + 'M';
            } else {
                badgeStr = badgeStr.slice(0,-6) + 'M';
            }
        }
        badgeColor = httpsb.scopePageExists(this.pageUrl) ? '#66F' : '#000';
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
        tabId = tabIdFromPageUrl(pageUrl);
        pageStats = httpsb.pageStats[pageUrl];
        if ( !visibleTabs[tabId] && !pageStats.visible ) {
            cookieHunter.removePageCookiesAsync(pageStats);
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
        var reqKeys = pageStats.requests.getRequestKeys();
        if ( reqKeys.length > httpsb.behindTheSceneMaxReq ) {
            reqKeys = reqKeys.sort(function(a,b){
                var ra = pageStats.requests[a];
                var rb = pageStats.requests[b];
                if ( rb.when < ra.when ) { return -1; }
                if ( ra.when < rb.when ) { return 1; }
                return 0;
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
//                                                                          min  sec   1sec
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
    var pageStats = httpsb.pageStats[pageUrl];
    if ( !pageStats ) {
        pageStats = PageStatsEntry.factory(pageUrl);
        httpsb.pageStats[pageUrl] = pageStats;
    } else if ( pageStats.pageUrl !== pageUrl ) {
        pageStats.init(pageUrl);
    }

    return pageStats;
}

/******************************************************************************/

// Create an entry for the tab if it doesn't exist

function bindTabToPageStats(tabId, pageURL) {
    var pageStats = createPageStats(pageURL);
    if ( !pageStats ) {
        return undefined;
    }

    // console.debug('bindTabToPageStats > dispatching traffic in tab id %d to url stats store "%s"', tabId, pageUrl);
    // rhill 2013-11-24: Never ever rebind chromium-behind-the-scene
    // virtual tab.
    // https://github.com/gorhill/httpswitchboard/issues/67
    if ( tabId !== HTTPSB.behindTheSceneTabId ) {
        unbindTabFromPageStats(tabId);
        HTTPSB.pageUrlToTabId[pageURL] = tabId;
        HTTPSB.tabIdToPageUrl[tabId] = pageURL;
    }

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
        pageStats.recordRequest(type, url, blocked);
    }
}

function recordFromPageUrl(pageUrl, type, url, blocked) {
    var pageStats = pageStatsFromPageUrl(pageUrl);
    if ( pageStats ) {
        pageStats.recordRequest(type, url, blocked);
    }
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
    asyncJobQueue.add('smartReloadTabs', null, smartReloadTabsCallback, 500);
}

/******************************************************************************/

// reload content of a tab

function smartReloadTab(tabId) {
    var pageStats = pageStatsFromTabId(tabId);
    if ( !pageStats || pageStats.ignore ) {
        //console.error('HTTP Switchboard > smartReloadTab > page stats for tab id %d not found', tabId);
        return;
    }
    var pageUrl = pageUrlFromPageStats(pageStats);
    if ( !pageUrl ) {
        //console.error('HTTP Switchboard > smartReloadTab > page url for tab id %d not found', tabId);
        return;
    }
    var newState = computeTabState(tabId);
    if ( getStateHash(newState) != getStateHash(pageStats.state) ) {
        // console.debug('reloaded content of tab id %d', tabId);
        // console.debug('old="%s"\nnew="%s"', getStateHash(pageStats.state), getStateHash(newState));
        pageStats.state = newState;
        chrome.tabs.reload(tabId, { bypassCache: true });
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
    var httpsb = HTTPSB;
    var pageUrl = pageStats.pageUrl;
    var reqKeys = pageStats.requests.getRequestKeys();
    var i = reqKeys.length;
    var computedState = {};
    var hostname, reqKey;
    var type, typeToEval, typeToRecord;
    while ( i-- ) {
        reqKey = reqKeys[i];

        // The evaluation code here needs to reflect the evaluation code in
        // beforeRequestHandler()
        hostname = PageStatsRequests.hostnameFromRequestKey(reqKey);

        // rhill 2013-12-10: mind how stylesheets are to be evaluated:
        // `stylesheet` or `other`? Depends of domain of request.
        // https://github.com/gorhill/httpswitchboard/issues/85
        type = PageStatsRequests.typeFromRequestKey(reqKey);
        typeToEval = typeToRecord = type;
        if ( type === 'stylesheet' ) {
            if ( uriTools.domainFromHostname(hostname) === pageStats.pageDomain ) {
                typeToEval = 'main_frame';
            } else {
                typeToEval = typeToRecord = 'other';
            }
        }

        if ( httpsb.blacklisted(pageUrl, typeToEval, hostname) ) {
            computedState[typeToRecord +  '|' + hostname] = true;
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
    if ( pageStats ) {
        return pageStats.getPageURL();
    }
    return undefined;
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

