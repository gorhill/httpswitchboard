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

/* global chrome */

/******************************************************************************/

var HTTPSB = (function() {

/******************************************************************************/

var defaultUserAgentStrings = [
    '# http://www.useragentstring.com/pages/Chrome/',
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2049.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.67 Safari/537.36',
    'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.67 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1944.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36'
];

var getDefaultUserAgentStrings = function() {
    return defaultUserAgentStrings.join('\n');
};


return {
    manifest: chrome.runtime.getManifest(),

    userSettings: {
        autoWhitelistPageDomain: false,
        autoCreateScope: '',
        clearBrowserCache: true,
        clearBrowserCacheAfter: 60,
        copyGlobalScopeIntoNewScope: false,
        colorBlindFriendly: false,
        deleteCookies: false,
        deleteUnusedTemporaryScopes: false,
        deleteUnusedTemporaryScopesAfter: 30,
        deleteUnusedSessionCookies: false,
        deleteUnusedSessionCookiesAfter: 60,
        deleteLocalStorage: false,
        displayTextSize: '13px',
        maxLoggedRequests: 50,
        parseAllABPFilters: true,
        parseAllABPHideFilters: false,
        popupHideBlacklisted: false,
        popupCollapseDomains: false,
        popupCollapseSpecificDomains: {},
        processBehindTheSceneRequests: false,
        processHyperlinkAuditing: true,
        processReferer: false,
        smartAutoReload: 'all',
        spoofUserAgent: false,
        spoofUserAgentEvery: 5,
        spoofUserAgentWith: getDefaultUserAgentStrings(),
        statsFilters: {},
        strictBlocking: true,
        subframeColor: '#cc0000',
        subframeOpacity: 100
    },

    clearBrowserCacheCycle: 0,
    updateAssetsEvery: 5 * 24 * 60 * 60 * 1000,
    projectServerRoot: 'https://raw.githubusercontent.com/gorhill/httpswitchboard/master/',

    // list of remote blacklist locations
    remoteBlacklists: {
        // User
        'assets/user/ubiquitous-blacklisted-hosts.txt': {},

        // HTTPSB
        'assets/httpsb/blacklist.txt': { title: 'HTTP Switchboard' },
        
        // 3rd-party lists now fetched dynamically
        },

    // urls stats are kept on the back burner while waiting to be reactivated
    // in a tab or another.
    pageStats: {},

    // Preset recipes
    presetManager: null,

    // A map of redirects, to allow reverse lookup of redirects from landing
    // page, so that redirection can be reported to the user.
    redirectRequests: {}, 

    // tabs are used to redirect stats collection to a specific url stats
    // structure.
    pageUrlToTabId: {},
    tabIdToPageUrl: {},

    // Power switch to disengage HTTPSB
    off: false,

    // page url => permission scope
    temporaryScopes: null,
    permanentScopes: null,
    factoryScope: null,

    // Current entries from ubiquitous lists --
    // just hostnames, '*/' is implied, this saves significantly on memory.
    ubiquitousBlacklist: null,
    ubiquitousWhitelist: null,

    userBlacklistPath: 'assets/user/ubiquitous-blacklisted-hosts.txt',
    userWhitelistPath: 'assets/user/ubiquitous-whitelisted-hosts.txt',

    // various stats
    requestStats: new WebRequestStats(),
    cookieRemovedCounter: 0,
    localStorageRemovedCounter: 0,
    cookieHeaderFoiledCounter: 0,
    refererHeaderFoiledCounter: 0,
    hyperlinkAuditingFoiledCounter: 0,
    browserCacheClearedCounter: 0,
    storageQuota: chrome.storage.local.QUOTA_BYTES,
    storageUsed: 0,
    abpBlockCount: 0,
    userAgentReplaceStr: '',
    userAgentReplaceStrBirth: 0,

    // record what chromium is doing behind the scene
    behindTheSceneURL: 'http://chromium-behind-the-scene/',
    behindTheSceneTabId: 0x7FFFFFFF,
    behindTheSceneMaxReq: 250,
    behindTheSceneScopeKey: 'chromium-behind-the-scene',

    // Commonly encountered strings
    chromeExtensionURLPrefix: 'chrome-extension://',
    noopCSSURL: chrome.runtime.getURL('css/noop.css'),
    fontCSSURL: chrome.runtime.getURL('css/fonts/Roboto_Condensed/RobotoCondensed-Regular.ttf'),

    // so that I don't have to care for last comma
    dummy: 0
};

/******************************************************************************/

})();

/******************************************************************************/

