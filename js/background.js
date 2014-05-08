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
        autoCreateScope: 'domain',
        clearBrowserCache: true,
        clearBrowserCacheAfter: 60,
        deleteCookies: false,
        deleteUnusedTemporaryScopes: true,
        deleteUnusedTemporaryScopesAfter: 30,
        deleteUnusedSessionCookies: false,
        deleteUnusedSessionCookiesAfter: 60,
        deleteLocalStorage: false,
        displayTextSize: '13px',
        maxLoggedRequests: 50,
        parseAllABPFilters: false,
        popupHideBlacklisted: false,
        popupCollapseDomains: false,
        popupCollapseSpecificDomains: {},
        processBehindTheSceneRequests: false,
        processReferer: false,
        smartAutoReload: 'all',
        spoofUserAgent: false,
        spoofUserAgentEvery: 5,
        spoofUserAgentWith: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.154 Safari/537.36\nMozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.152 Safari/537.36\nMozilla/5.0 (Windows NT 6.1; WOW64; rv:28.0) Gecko/20100101 Firefox/28.0\nMozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36\nMozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36\n',
        statsFilters: {},
        strictBlocking: true,
        subframeOpacity: 1
    },

    runtimeId: 1,
    clearBrowserCacheCycle: 0,
    inlineFieldSeparator: '#',

    projectServerRoot: 'https://raw2.github.com/gorhill/httpswitchboard/master/',

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

        // Various
        'assets/thirdparties/winhelp2002.mvps.org/hosts.txt': {},

        // From here on, any new list is 'off' by default
        // Adblock Plus
        'assets/thirdparties/easylist-downloads.adblockplus.org/easylist.txt': {},
        'assets/thirdparties/easylist-downloads.adblockplus.org/easyprivacy.txt': {},
        'assets/thirdparties/easylist-downloads.adblockplus.org/fanboy-annoyance.txt': { off: true },

        // Fanboy
        'assets/thirdparties/www.fanboy.co.nz/enhancedstats.txt': { off: true },

        'assets/thirdparties/easylist-downloads.adblockplus.org/easylistgermany.txt': { off: true },
        'assets/thirdparties/easylist-downloads.adblockplus.org/easylistitaly.txt': { off: true },
        'assets/thirdparties/easylist-downloads.adblockplus.org/easylistdutch.txt': { off: true },
        'assets/thirdparties/easylist-downloads.adblockplus.org/liste_fr.txt': { off: true },
        'assets/thirdparties/easylist-downloads.adblockplus.org/advblock.txt': { off: true },
        'assets/thirdparties/adblock-chinalist.googlecode.com/svn/trunk/adblock.txt': { off: true },
        'assets/thirdparties/stanev.org/abp/adblock_bg.txt': { off: true },
        'assets/thirdparties/indonesianadblockrules.googlecode.com/hg/subscriptions/abpindo.txt': { off: true },
        'assets/thirdparties/liste-ar-adblock.googlecode.com/hg/Liste_AR.txt': { off: true },
        'assets/thirdparties/adblock-czechoslovaklist.googlecode.com/svn/filters.txt': { off: true },
         // 'assets/thirdparties/gitorious.org/adblock-latvian/adblock-latvian/raw/5f5fc83eb1a2d0e97df9a5c382febaa651511757%3Alists/latvian-list.txt': { off: true },
        'assets/thirdparties/raw.github.com/AdBlockPlusIsrael/EasyListHebrew/master/EasyListHebrew.txt': { off: true },
        'assets/thirdparties/download.wiltteri.net/wiltteri.txt': { off: true },

        'assets/thirdparties/hosts-file.net/hosts.txt': { off: true }
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
    browserCacheClearedCounter: 0,
    storageQuota: chrome.storage.local.QUOTA_BYTES,
    storageUsed: 0,
    abpBlockCount: 0,
    userAgentReplaceStr: '',
    userAgentReplaceStrBirth: 0,

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

