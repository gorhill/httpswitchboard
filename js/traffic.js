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
    console.log('HTTP Switchboard > whitelisting %s from %s', type, domain);
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
    console.log('HTTP Switchboard > blacklisting %s from %s', type, domain);
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
    console.log('HTTP Switchboard > graylisting %s from %s', type, domain);
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

// Intercept and filter web requests according to white and black lists.

function webRequestHandler(details) {
/*
    console.debug('Request: tab=%d parent=%d frame=%d type=%s, url=%s',
        details.tabId,
        details.parentFrameId,
        details.frameId,
        details.type,
        details.url
        );
*/

    var tabId = details.tabId;

    // ignore traffic outside tabs
    // TODO: when might this happen?
    if ( tabId < 0 ) {
        return;
    }

    var type = details.type;
    var url = normalizeChromiumUrl(details.url);
    var isMainFrame = type === 'main_frame';
    var isRootFrame = isMainFrame && details.parentFrameId < 0;

    // don't block extensions, especially myself...
   if ( url.search(/^chrome-extension:\/\//) === 0 ) {
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
        return;
    }

    var httpsb = HTTPSB;

    // dispatch traffic from tab to a new url stats store 
    if ( isRootFrame ) {
        bindTabToUrlstatsStore(tabId, url);
    }
    var tab = httpsb.tabs[tabId];

    // It is possible at this point that there is no url stats store: this
    // happens if the extension was launched after tabs were already opened.
    if ( tab.pageUrl.length > 0 && httpsb.urls[tab.pageUrl] ) {
        httpsb.urls[tab.pageUrl].lastTouched = Date.now();

        // TODO: garbage collect orphan tabs (unless tab ids are reused by the
        // browser?)

        // log request attempt
        record(tabId, type, url);
    }

    var domain = getUrlDomain(url);

    // whitelisted?
    if ( whitelisted(type, domain) ) {
        // console.debug('webRequestHandler > allowing %s from %s', type, domain);
        // if it is a root frame and scripts are blacklisted for the
        // domain, disable scripts for this domain, necessary since inline
        // script tags are not passed through web request handler.
        // TODO: not only root frame...
        if ( isMainFrame ) {
            var blacklistScript = blacklisted('script', domain);
            chrome.contentSettings.javascript.set({
                primaryPattern: '*://*.' + domain + '/*',
                setting: blacklistScript ? 'block' : 'allow'
            });
            // console.debug('Blacklisting scripts for *://%s/* is %o', domain, blacklistScript);

            // when the tab is updated, we will check if page has at least one
            // script tag, this takes care of inline scripting, which doesn't
            // generate 'script' type web requests.
        }
        return;
    }

    // blacklisted
    // console.debug('webRequestHandler > blocking %s from %s', type, domain);

    // remember this blacklisting, used to create a snapshot of the state
    // of the tab, which is useful for smart reload of the page (reload the
    // page only when state efectively change)
    // TODO: makes more sense to care about whitelisted items
    addTabState(tabId, type, domain);

    // if it's a blacklisted frame, redirect to frame.html
    if ( isMainFrame || type === 'sub_frame' ) {
        var q = chrome.runtime.getURL('frame.html') + '?';
        q += 'domain=' + encodeURIComponent(domain);
        q += '&';
        q += 'url=' + encodeURIComponent(url);
        // console.debug('webRequestHandler > redirecting %s to %s', url, q);
        return { "redirectUrl": q };
    }

    return { "cancel": true };
}

/******************************************************************************/

function webHeaderRequestHandler(details) {

    // ignore traffic outside tabs
    // TODO: when might this happen?
    // Apparently from within extensions
    var tabId = details.tabId;
    if ( details.tabId < 0 ) {
        return;
    }

    // Any cookie in there?
    var cookieJar = [];
    var i = details.requestHeaders.length;
    while ( i-- ) {
        if ( details.requestHeaders[i].name.toLowerCase() === 'cookie' ) {
            cookieJar.push(i);
        }
    }
    // Nope, bye
    if ( cookieJar.length < 0 ) {
        return;
    }

    var url = normalizeChromiumUrl(details.url);
    var domain = getUrlDomain(url);

    var blacklistCookie = blacklisted('cookie', domain);
    if ( blacklistCookie ) {

        // this domain attempted to get cookies, so we block cookies for this
        // particular domain.
        // rhill 20130924: No, can't do that here, doing this risks permanently
        // blocking cookies for a site even after whitelisting. The only
        // sensible way is to block at `set-cookie` time, and here to resort
        // to removing cookies from headers.
        // chrome.contentSettings.cookies.set({
        //    primaryPattern: '*://*.' + domain + '/*',
        //    secondaryPattern: '<all_urls>',
        //    setting: blacklistCookie ? 'block' : 'allow'
        // });

        // remove cookie headers
        cookieJar.reverse();
        var headers;
        while ( cookieJar.length ) {
            i = cookieJar.pop();
            headers = details.requestHeaders.splice(i, 1);
            // remove cookies: even if cookies are blocked, scripts can create
            // cookies, so this here is to take careof removing these kind of
            // cookies.
            chrome.runtime.sendMessage({
                what: 'removeCookies',
                url: url,
                domain: domain,
                cookieStr: headers[0].value
            });
            console.debug('HTTP Switchboard > foiled chromium attempt to send cookie "%s..." to %s', headers[0].value.slice(0,40), url);
        }

        return { requestHeaders: details.requestHeaders };
    }

    return;
}

/******************************************************************************/

function webHeadersReceivedHandler(details) {
    var tabId = details.tabId;

    // ignore traffic outside tabs
    // TODO: when might this happen?
    // Apparently from within extensions
    if ( tabId < 0 ) {
        return;
    }

    // Any cookie in there?
    var cookieJar = [];
    var i = details.responseHeaders.length;
    while ( i-- ) {
        if ( details.responseHeaders[i].name.toLowerCase() === 'set-cookie' ) {
            cookieJar.push(details.responseHeaders[i].value);
        }
    }
    // Nope, bye
    if ( cookieJar.length === 0 ) {
        return;
    }

    var url = normalizeChromiumUrl(details.url);
    var domain = getUrlDomain(url);
    var blacklistCookie = blacklisted('cookie', domain);

    chrome.contentSettings.cookies.set({
        primaryPattern: '*://*.' + domain + '/*',
        secondaryPattern: '<all_urls>',
        setting: blacklistCookie ? 'block' : 'allow'
    });
    // console.debug('HTTP Switchboard > %sing cookies from "*://*.%s/*"', blacklistCookie ? 'block' : 'allow', domain);

    // Message instead of handling on the spot cookie parsing, which is not
    // time-critical.
    chrome.runtime.sendMessage({
        what: 'recordSetCookies',
        tabId: tabId,
        url: url,
        cookieJar: cookieJar
        });

    // remove cookies potentially left behind
    if ( blacklistCookie ) {
        chrome.runtime.sendMessage({
            what: 'removeCookies',
            url: url,
            domain: domain,
            cookieStr: cookieJar.join(';')
        });
    }
}

/******************************************************************************/

var webRequestHandlerRequirements = {
    'tabsBound': 0,
    'listsLoaded': 0
    };

function startWebRequestHandler(from) {
    // Do not launch traffic handler if not all requirements are fullfilled.
    // This takes care of pages being blocked when chromium is launched
    // because there is no whitelist loaded and default is to block everything.
    var o = webRequestHandlerRequirements;
    o[from] = 1;
    if ( Object.keys(o).map(function(k){return o[k];}).join().search('0') >= 0 ) {
        return;
    }

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

    chrome.webRequest.onBeforeSendHeaders.addListener(
        webHeaderRequestHandler,
        {
            'urls': [
                '<all_urls>'
            ]
        },
        ['blocking', 'requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
        webHeadersReceivedHandler,
        {
            'urls': [
                '<all_urls>'
            ]
        },
        ['responseHeaders']
    );

    HTTPSB.webRequestHandler = true;
}
