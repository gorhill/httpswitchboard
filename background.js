/*******************************************************************************

    scripthq - a Chromium browser extension to black/white list requests.
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

    Home: https://github.com/gorhill/scripthq
*/

var NoBloat = {
    // for later, I had something in mind but I forgot..
    birth: new Date(),

    // map[tabid] => map[url] => map[type]
    requests: {},

    // these two lists must be persisted
    // map["{type}/{domain}"]true
    whitelist: {
    },
    // map[type/domain]true
    blacklist: {
        '*/*': true
    },

    // to easily parse urls
    urlParser: document.createElement('a'),

    // constants
    DISALLOWED_DIRECT: 1,
    ALLOWED_DIRECT: 2,
    DISALLOWED_INDIRECT: 3,
    ALLOWED_INDIRECT: 4,

    // log a request
    record: function(details) {
        // console.log("%cblock: %o", 'color:red', details);
        var tab = this.requests[details.tabId];
        if ( !tab ) {
            tab = { urls: {} };
            this.requests[details.tabId] = tab;
        }
        var url = details.url;
        var taburls = tab.urls;
        if ( !taburls[url] ) {
            taburls[url] = { types: {} };
        }
        taburls[url].types[details.type] = true;

        // TODO: async... ?
        this.updateBadge(details.tabId);
    },

    // update visual of extension icon
    // TODO: should be async maybe ?
    updateBadge: function(tabId) {
        var count = this.requests[tabId] ? Object.keys(this.requests[tabId].urls).length : 0;
        chrome.browserAction.setBadgeText({ tabId: tabId, text: String(count) });
    },

    // whitelist something
    allow: function(type, domain) {
        var key = type + "/" + domain;
        var whitelisted = !this.whitelist[key]
        var unblacklisted = this.blacklist[key];
        if ( whitelisted ) {
            this.whitelist[key] = true;
        }
        if ( unblacklisted ) {
            delete this.blacklist[key];
        }
        console.log('whitelisting %s from %s', type, domain);
        if ( whitelisted || unblacklisted ) {
            this.save();
        }
    },

    // blacklist something
    disallow: function(type, domain) {
        var key = type + "/" + domain;
        var unwhitelisted = this.whitelist[key]
        var blacklisted = !this.blacklist[key];
        if ( unwhitelisted ) {
            delete this.whitelist[key];
        }
        if ( blacklisted ) {
            this.blacklist[key] = true;
        }
        console.log('blacklisting %s from %s', type, domain);
        if ( unwhitelisted || blacklisted ) {
            this.save();
        }
    },

    // remove something from both black and white lists
    graylist: function(type, domain) {
        var key = type + "/" + domain;
        // special case: root cannot be gray listed
        if ( key === '*/*' ) {
            return;
        }
        var unwhitelisted = this.whitelist[key]
        var unblacklisted = this.blacklist[key];
        if ( unwhitelisted ) {
            delete this.whitelist[key];
        }
        if ( unblacklisted ) {
            delete this.blacklist[key];
        }
        console.log('graylisting %s from %s', type, domain);
        if ( unwhitelisted || unblacklisted ) {
            this.save();
        }
    },

    // check whether something is white or black listed, direct or indirectly
    evaluate: function(type, domain) {
        var key, nodes, ancestor;
        if ( type !== '*' && domain !== '*' ) {
            // direct: specific type, specific domain
            key = type + "/" + domain;
            if ( this.blacklist[key] ) {
                return this.DISALLOWED_DIRECT;
            }
            if ( this.whitelist[key] ) {
                return this.ALLOWED_DIRECT;
            }
            // indirect: any type, specific domain
            key = "*/" + domain;
            if ( this.blacklist[key] ) {
                return this.DISALLOWED_INDIRECT;
            }
            if ( this.whitelist[key] ) {
                return this.ALLOWED_INDIRECT;
            }
            // indirect: ancestor domain nodes
            nodes = domain.split('.');
            while ( nodes.length > 1 ) {
                nodes = nodes.slice(1);
                ancestor = nodes.join('.');
                key = type + "/" + ancestor;
                // specific type, specific ancestor
                if ( this.blacklist[key] ) {
                    return this.DISALLOWED_INDIRECT;
                }
                if ( this.whitelist[key] ) {
                    return this.ALLOWED_INDIRECT;
                }
                // any type, specific ancestor
                key = "*/" + ancestor;
                if ( this.blacklist[key] ) {
                    return this.DISALLOWED_INDIRECT;
                }
                if ( this.whitelist[key] ) {
                    return this.ALLOWED_INDIRECT;
                }
            }
            // indirect: specific type, any domain
            key = type + "/*";
            if ( this.blacklist[key] ) {
                return this.DISALLOWED_INDIRECT;
            }
            if ( this.whitelist[key] ) {
                return this.ALLOWED_INDIRECT;
            }
            // indirect: any type, any domain
            if ( this.whitelist['*/*'] ) {
                return this.ALLOWED_INDIRECT;
            }
            return this.DISALLOWED_INDIRECT;
        } else if ( type === '*' && domain !== '*' ) {
            // direct: any type, specific domain
            key = "*/" + domain;
            if ( this.blacklist[key] ) {
                return this.DISALLOWED_DIRECT;
            }
            if ( this.whitelist[key] ) {
                return this.ALLOWED_DIRECT;
            }
            // indirect: ancestor domain nodes
            nodes = domain.split('.');
            while ( nodes.length > 1 ) {
                nodes = nodes.slice(1);
                ancestor = nodes.join('.');
                // any type, specific domain
                key = "*/" + ancestor;
                if ( this.blacklist[key] ) {
                    return this.DISALLOWED_INDIRECT;
                }
                if ( this.whitelist[key] ) {
                    return this.ALLOWED_INDIRECT;
                }
            }
            // indirect: any type, any domain
            if ( this.whitelist["*/*"] ) {
                return this.ALLOWED_INDIRECT;
            }
            return this.DISALLOWED_INDIRECT;
        } else if ( type !== '*' && domain === '*' ) {
            // indirect: specific type, any domain
            key = type + "/*";
            if ( this.blacklist[key] ) {
                return this.DISALLOWED_DIRECT;
            }
            if ( this.whitelist[key] ) {
                return this.ALLOWED_DIRECT;
            }
            // indirect: any type, any domain
            if ( this.whitelist["*/*"] ) {
                return this.ALLOWED_INDIRECT;
            }
            return this.DISALLOWED_INDIRECT;
        }
        // global default decide
        if ( this.whitelist['*/*'] ) {
            return this.ALLOWED_DIRECT;
        }
        return this.DISALLOWED_DIRECT;
    },

    // check whether something is blacklisted
    blacklisted: function(type, domain) {
        var result = this.evaluate(type, domain);
        return result === this.DISALLOWED_DIRECT || result === this.DISALLOWED_INDIRECT;
    },

    // check whether something is whitelisted
    whitelisted: function(type, domain) {
        var result = this.evaluate(type, domain);
        return result === this.ALLOWED_DIRECT || result === this.ALLOWED_INDIRECT;
    },

    // save white/blacklist
    save: function() {
        var bin = {
            name: "scripthq",
            version: "0.1",
            whitelist: this.whitelist,
            blacklist: this.blacklist
        };
        chrome.storage.sync.set(bin, function() {
            console.log('saved white and black lists');
        });
    },

    // load white/blacklist
    load: function() {
        var self = this;
        chrome.storage.sync.get(function(bin) {
            if ( bin.whitelist ) {
                self.whitelist = bin.whitelist;
            }
            if ( bin.blacklist ) {
                self.blacklist = bin.blacklist;
            }
            console.log('loaded white and black lists');
        });
    },

    // parse a url and return only interesting parts
    getUrlParts: function(url) {
        var parts = { domain: "", subdomain: "" };
        // Ref.: https://gist.github.com/jlong/2428561
        this.urlParser.href = url;
        var matches = this.urlParser.hostname.split('.').slice(-8);
        if ( matches.length ) {
            parts.domain = matches.join('.');
        }
        return parts;
    }
};

// intercept and filter web requests according to white and black lists
function webRequestHandler(details) {
    if ( details.tabId < 0 ) {
        return {"cancel": false};
    }
    // log request attempt
    NoBloat.record(details);

    // see if whitelisted
    var urlParts = NoBloat.getUrlParts(details.url);
    if ( NoBloat.whitelisted(details.type, urlParts.domain) ) {
        console.log('allowing %s from %s', details.type, urlParts.domain);
        return { "cancel": false };
    }
    // default is to blacklist
    console.log('disallowing %s from %s', details.type, urlParts.domain);
    return {"cancel": true};
}

// hook to intercept web requests
chrome.webRequest.onBeforeRequest.addListener(
    webRequestHandler,
    {"urls": [
        "<all_urls>"
        ],
    "types": [
        "sub_frame",
        "script",
        "image",
        "object",
        "xmlhttprequest",
        "other"
        ]
    },
    ["blocking"]
    );

// reset tab data
chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
    if ( details.frameId === 0 ) {
        console.log("resetting data for tab %d", details.tabId);
        delete NoBloat.requests[details.tabId];
    }
});

// time to reset visual of extension icon
chrome.webNavigation.onCommitted.addListener(function(details) {
    if ( details.frameId === 0 ) {
        console.log("initializing extension button/menu for tab %d", details.tabId);
        chrome.browserAction.setBadgeBackgroundColor({ tabId: details.tabId, color: '#000' });
    }
});

// hooks to let popup let us know whether page must be reloaded
chrome.extension.onConnect.addListener(function(port) {
    var mustReload = false;
    port.onMessage.addListener(function() {
        mustReload = true;
    });
    port.onDisconnect.addListener(function() {
        if ( mustReload ) {
            chrome.tabs.reload();
        }
    });
});

NoBloat.load();
