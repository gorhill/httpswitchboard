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

// update visual of extension icon
// TODO: should be async maybe ?
function updateBadge(tabId) {
    var httpsb = HTTPSB;
    var count = httpsb.requests[tabId] ? Object.keys(httpsb.requests[tabId].urls).length : 0;
    chrome.browserAction.setBadgeText({ tabId: tabId, text: String(count) });
    chrome.browserAction.setBadgeBackgroundColor({ tabId: tabId, color: '#000' });
}

/******************************************************************************/

    // whitelist something
function allow(type, domain) {
    var httpsb = HTTPSB;

    var key = type + "/" + domain;
    var whitelisted = !httpsb.whitelist[key]
    var unblacklisted = httpsb.blacklist[key];
    if ( whitelisted ) {
        httpsb.whitelist[key] = true;
        httpsb.whitelistUser[key] = true;
    }
    if ( unblacklisted ) {
        delete httpsb.blacklist[key];
        // TODO: handle case where user override third-party blacklists
        delete httpsb.blacklistUser[key];
    }
    console.debug('whitelisting %s from %s', type, domain);
    if ( whitelisted || unblacklisted ) {
        save();
    }
}

/******************************************************************************/

// blacklist something
function disallow(type, domain) {
    var httpsb = HTTPSB;

    var key = type + "/" + domain;
    var unwhitelisted = httpsb.whitelist[key]
    var blacklisted = !httpsb.blacklist[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelist[key];
        delete httpsb.whitelistUser[key];
    }
    if ( blacklisted ) {
        httpsb.blacklist[key] = true;
        httpsb.blacklistUser[key] = true;
    }
    console.debug('blacklisting %s from %s', type, domain);
    if ( unwhitelisted || blacklisted ) {
        save();
    }
}

/******************************************************************************/

// remove something from both black and white lists
function graylist(type, domain) {
    var httpsb = HTTPSB;

    var key = type + "/" + domain;
    // special case: root cannot be gray listed
    if ( key === '*/*' ) {
        return;
    }
    var unwhitelisted = httpsb.whitelist[key]
    var unblacklisted = httpsb.blacklist[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelist[key];
        delete httpsb.whitelistUser[key];
    }
    if ( unblacklisted ) {
        delete httpsb.blacklist[key];
        delete httpsb.blacklistUser[key];
    }
    console.debug('graylisting %s from %s', type, domain);
    if ( unwhitelisted || unblacklisted ) {
        save();
    }
}

/******************************************************************************/

// check whether something is white or black listed, direct or indirectly
function evaluate(type, domain) {
    var httpsb = HTTPSB;

    var key, nodes, ancestor;
    if ( type !== '*' && domain !== '*' ) {
        // direct: specific type, specific domain
        key = type + "/" + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, specific domain
        key = "*/" + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        // indirect: ancestor domain nodes
        nodes = domain.split('.');
        while ( nodes.length > 1 ) {
            nodes = nodes.slice(1);
            ancestor = nodes.join('.');
            key = type + "/" + ancestor;
            // specific type, specific ancestor
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            // any type, specific ancestor
            key = "*/" + ancestor;
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
        }
        // indirect: specific type, any domain
        key = type + "/*";
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        // indirect: any type, any domain
        if ( httpsb.whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    } else if ( type === '*' && domain !== '*' ) {
        // direct: any type, specific domain
        key = "*/" + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: ancestor domain nodes
        nodes = domain.split('.');
        while ( nodes.length > 1 ) {
            nodes = nodes.slice(1);
            ancestor = nodes.join('.');
            // any type, specific domain
            key = "*/" + ancestor;
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
        }
        // indirect: any type, any domain
        if ( httpsb.whitelist["*/*"] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    } else if ( type !== '*' && domain === '*' ) {
        // indirect: specific type, any domain
        key = type + "/*";
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, any domain
        if ( httpsb.whitelist["*/*"] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    }
    // global default decide
    if ( httpsb.whitelist['*/*'] ) {
        return httpsb.ALLOWED_DIRECT;
    }
    return httpsb.DISALLOWED_DIRECT;
}

/******************************************************************************/

// check whether something is blacklisted
function blacklisted(type, domain) {
    var httpsb = HTTPSB;

    var result = evaluate(type, domain);
    return result === httpsb.DISALLOWED_DIRECT || result === httpsb.DISALLOWED_INDIRECT;
}

// check whether something is whitelisted
function whitelisted(type, domain) {
    var httpsb = HTTPSB;

    var result = evaluate(type, domain);
    return result === httpsb.ALLOWED_DIRECT || result === httpsb.ALLOWED_INDIRECT;
}

/******************************************************************************/

// log a request
function record(tabId, type, url) {
    var httpsb = HTTPSB;

    // console.debug("record() > %o: %s @ %s", details, details.type, details.url);
    var tab = httpsb.requests[tabId];
    if ( !tab ) {
        tab = { urls: {} };
        httpsb.requests[tabId] = tab;
    }
    var taburls = tab.urls;
    if ( !taburls[url] ) {
        taburls[url] = { types: {} };
    }
    taburls[url].types[type] = true;

    // TODO: async... ?
    updateBadge(tabId);
}

/******************************************************************************/

// intercept and filter web requests according to white and black lists
function webRequestHandler(details) {
    var tabId = details.tabId;

    // ignore traffic outside tabs
    // TODO: when might this happen?
    if ( tabId < 0 ) {
        return { "cancel": false };
    }

    var type = details.type;
    var url = details.url;
    var isMainFrame = type === 'main_frame';
    var isRootFrame = isMainFrame && details.parentFrameId < 0;

    // don't block extensions, especially myself...
   if ( url.search(/^chrome-extension:\/\/.*$/) === 0 ) {
        // special case (that's my solution for now):
        // if it is HTTP Switchboard's frame.html, verify that
        // the page that was blacklisted is still blacklisted, and if not,
        // redirect to the previously blacklisted page.
        // TODO: is there a bette rway to do this? Works well though...
        // chrome-extension://bgdnahgfnkneapahgkejhjcenmopifdi/frame.html?domain={domain}&url={url}
        if ( isRootFrame ) {
            var matches = url.match(/^chrome-extension:\/\/[a-z]+\/frame\.html\?domain=(.+)&url=(.+)$/);
            if ( matches && whitelisted('main_frame', matches[1]) ) {
                return { "redirectUrl": decodeURIComponent(matches[2]) };
            }
        }
        return { "cancel": false };
    }

    // if root frame, we need to reset potentially existing entry in db
    if ( isRootFrame ) {
        console.debug("webRequestHandler > reset tab %d", tabId);
        delete HTTPSB.requests[tabId];
    }

    // log request attempt
    record(tabId, type, url);

    var urlParts = getUrlParts(url);
    var domain = urlParts.domain;

    // whitelisted?
    if ( whitelisted(type, domain) ) {
        console.debug('webRequestHandler > allowing %s from %s', type, domain);
        // if it is a root frame and scripts are blacklisted for the
        // domain, disable scripts for this domain.
        // TODO: not only root frame...
        if ( isMainFrame ) {
            chrome.contentSettings.javascript.set({
                primaryPattern: '*://' + domain + '/*',
                setting: blacklisted('script', domain) ? 'block' : 'allow'
            });
            // when the tab is updated, we will check if page has at least one
            // script tag.
        }
        return { "cancel": false };
    }

    // blacklisted
    console.debug('webRequestHandler > blocking %s from %s', type, domain);

    // if it's a frame, redirect to frame.html
    if ( isMainFrame || type === 'sub_frame' ) {
        var q = chrome.runtime.getURL('frame.html') + '?';
        q += 'domain=' + encodeURIComponent(domain);
        q += '&';
        q += 'url=' + encodeURIComponent(url);
        console.debug('webRequestHandler > redirecting %s to %s', url, q);
        return { "redirectUrl": q };
    }

    return { "cancel": true };
}

/******************************************************************************/

// hook to intercept web requests
chrome.webRequest.onBeforeRequest.addListener(
    webRequestHandler,
    {
        "urls": [
            "<all_urls>"
        ],
        "types": [
            "main_frame",
            "sub_frame",
            "script",
            "image",
            "object",
            "xmlhttprequest",
            "other"
        ]
    },
    [ "blocking" ]
);

/******************************************************************************/

// Check if page has at least one script tab. We must do that here instead of
// at web request intercept time, because we can't inject code at web request
// time since the url hasn't been set in the tab.
// TODO: For subframe though, we might need to do it at web request time.
//       Need to investigate using trace, doc does not say everything.
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if ( changeInfo.status === 'complete' ) {
        console.debug('tabs.onUpdated > injecting code to check for at least one <script> tag');
        chrome.tabs.executeScript(
            tabId,
            {
                code: '!!document.querySelector("script");',
                runAt: 'document_idle'
            },
            function(r) {
                if ( r ) {
                    record(tabId, 'script', tab.url);
                }
            }
        );
    }
})
