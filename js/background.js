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

var HTTPSB = {
    manifest: chrome.runtime.getManifest(),

    userSettings: {
        autoWhitelistPageDomain: false,
        autoCreateSiteScope: false,
        clearBrowserCache: true,
        clearBrowserCacheAfter: 60,
        deleteCookies: false,
        deleteUnusedSessionCookies: false,
        deleteUnusedSessionCookiesAfter: 60,
        deleteLocalStorage: false,
        displayTextSize: '13px',
        maxLoggedRequests: 50,
        popupHideBlacklisted: false,
        popupCollapseDomains: false,
        popupCollapseSpecificDomains: {},
        processBehindTheSceneRequests: false,
        processReferer: false,
        smartAutoReload: true,
        statsFilters: {},
        strictBlocking: true
    },

    runtimeId: 1,
    clearBrowserCacheCycle: 0,
    inlineFieldSeparator: '#',

    // list of remote blacklist locations
    remoteBlacklists: {
        // User
        'assets/user/ubiquitous-blacklisted-hosts.txt': {},

        // HTTPSB
        'assets/httpsb/blacklist.txt': {},

        // Third parties

        // Various
        'assets/thirdparties/mirror1.malwaredomains.com/files/immortal_domains.txt': {},
        'assets/thirdparties/mirror1.malwaredomains.com/files/justdomains': {},
        'assets/thirdparties/pgl.yoyo.org/as/serverlist': {},
        'assets/thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt': {},
        'assets/thirdparties/hosts-file.net/ad-servers': {},
        'assets/thirdparties/someonewhocares.org/hosts/hosts': {},

        // From here on, any new list is 'off' by default
        // Adblock Plus
        'assets/thirdparties/easylist-downloads.adblockplus.org/easylist.txt': {},
        'assets/thirdparties/easylist-downloads.adblockplus.org/easyprivacy.txt': {},
        'assets/thirdparties/easylist-downloads.adblockplus.org/fanboy-annoyance.txt': {},

        // Fanboy
        'assets/thirdparties/www.fanboy.co.nz/enhancedstats.txt': {},

        // Various
        'assets/thirdparties/winhelp2002.mvps.org/hosts.txt': {},
        'assets/thirdparties/hosts-file.net/hosts.txt': { off: true }
        },

    // Used for update of assets: when an update is fired, these will be
    // filled with the respective checksums, and once both are filled, the
    // real update steps will be performed.
    localAssetChecksums: null,
    remoteAssetChecksums: null,
    assetToUpdateCount: 0,

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

    // Current entries from remote blacklists --
    // just hostnames, '*/' is implied, this saves significantly on memory.
    blacklistReadonly: {},
    blacklistReadonlyCount: 0,

    // https://github.com/gorhill/httpswitchboard/issues/19
    // https://github.com/gorhill/httpswitchboard/issues/91
    excludeRegex: /^https:\/\/(talkgadget\.google\.com\/talkgadget)/,

    // various stats
    requestStats: new WebRequestStats(),
    cookieRemovedCounter: 0,
    localStorageRemovedCounter: 0,
    cookieHeaderFoiledCounter: 0,
    refererHeaderFoiledCounter: 0,
    browserCacheClearedCounter: 0,
    storageQuota: chrome.storage.local.QUOTA_BYTES,
    storageUsed: 0,

    // internal state
    webRequestHandler: false,

    // record what chromium is doing behind the scene
    behindTheSceneURL: 'http://chromium-behind-the-scene',
    behindTheSceneTabId: 0x7FFFFFFF,
    behindTheSceneMaxReq: 250,
    behindTheSceneScopeKey: 'chromium-behind-the-scene',

    // Popup menu
    port: null,

    // Commonly encountered strings
    chromeExtensionURLPrefix: 'chrome-extension://',
    noopCSSURL: chrome.runtime.getURL('css/noop.css'),
    fontCSSURL: chrome.runtime.getURL('css/fonts/Roboto_Condensed/RobotoCondensed-Regular.ttf'),

    // so that I don't have to care for last comma
    dummy: 0
};

/******************************************************************************/

