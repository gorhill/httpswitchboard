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

var HTTPSwitchboard = {
    version: '0.1.3',

    // unicode for hourglass: &#x231B;
    // for later use
    birth: new Date(),

    // list of remote blacklist locations
    remoteBlacklistLocations: {
        'http://pgl.yoyo.org/as/serverlist.php?mimetype=plaintext': {},
        'http://www.malwaredomainlist.com/hostslist/hosts.txt': {}
        },

    // map[tabid] => map[url] => map[type]
    requests: {},

    // map["{type}/{domain}"]true
    // effective lists
    whitelist: { },
    blacklist: { '*/*': true },
    // user lists
    whitelistUser: {},
    blacklistUser: {},
    // current entries from remote blacklists
    remoteBlacklist: {
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
            this.whitelistUser[key] = true;
        }
        if ( unblacklisted ) {
            delete this.blacklist[key];
            // TODO: handle case where user override third-party blacklists
            delete this.blacklistUser[key];
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
            delete this.whitelistUser[key];
        }
        if ( blacklisted ) {
            this.blacklist[key] = true;
            this.blacklistUser[key] = true;
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
            delete this.whitelistUser[key];
        }
        if ( unblacklisted ) {
            delete this.blacklist[key];
            delete this.blacklistUser[key];
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
            name: 'httpswitchboard',
            version: self.version,
            // version < 0.1.3
            // whitelist: this.whitelistUser,
            // blacklist: this.blacklistUser
            // version == 0.1.3
            whitelist: Object.keys(this.whitelistUser).join('\n'),
            blacklist: Object.keys(this.blacklistUser).join('\n'),
        };
        chrome.storage.sync.set(bin, function() {
            console.log('saved white and black lists (%d bytes)', bin.blacklist.length + bin.whitelist.length);
        });
    },

    // load white/blacklist
    load: function() {
        this.loadUserLists();
        this.loadRemoteBlacklists();
    },

    loadUserLists: function() {
        var self = this;
        chrome.storage.sync.get(function(bin) {
            console.log('loaded user white and black lists');
            if ( bin.whitelist ) {
                if ( bin.version.localeCompare(self.version) < '0.1.3' ) {
                    self.whitelistUser = bin.whitelist;
                } else {
                    self.populateListFromString(self.whitelistUser, '', bin.whitelist, '');
                }
                self.populateListFromList(self.whitelist, self.whitelistUser);
            }
            if ( bin.blacklist ) {
                if ( bin.version.localeCompare(self.version) < '0.1.3' ) {
                    self.blacklistUser = bin.blacklist;
                } else {
                    self.populateListFromString(self.blacklistUser, '', bin.blacklist, '');
                }
                self.populateListFromList(self.blacklist, self.blacklistUser);
            }
        });
    },

    loadRemoteBlacklists: function() {
        var self = this;

        // load stored remote location list of names
        chrome.storage.local.get({ 'remoteBlacklistLocations': {} }, function(localData) {
            // purge stored remote blacklist which are not part of current default list
            for ( var location in localData.remoteBlacklistLocations ) {
                if ( !localData.hasOwnProperty(location) ) {
                    continue;
                }
                if ( !self.remoteBlacklistLocations[location] ) {
                    chrome.storage.local.remove(location);
                }
            }
        });

        // save up to date list of remote location names
        chrome.storage.local.set({ 'remoteBlacklistLocations': self.remoteBlacklistLocations });

        var remoteLoad = function(location) {
            $.get(location, function(remoteData) {
                if ( !remoteData || remoteData === '' ) {
                    console.log('failed to load third party blacklist "%s" from remote location', location);
                    return;
                }
                console.log('loaded third party blacklist "%s" from remote location', location);
                // save locally in order to load efficiently in the future
                // TODO: expiration date
                var bin = {};
                bin[location] = remoteData;
                chrome.storage.local.set(bin);
                // send message to ourself to simplify async handling
                chrome.runtime.sendMessage({
                    command: 'remoteBlacklistLoaded',
                    location: location,
                    content: remoteData
                });
            });
        };

        // load locally or remotely remote blacklists
        chrome.storage.local.get(self.remoteBlacklistLocations, function(localData) {
            // console.log('loadRemoteBlacklists() > chrome.storage.local.get(%o): %o', self.remoteBlacklistLocations, localData);
            for ( var k in localData ) {
                if ( !localData.hasOwnProperty(k) ) {
                    continue;
                }
                if ( localData[k].length ) {
                    console.log('loaded third party blacklist "%s" (%d bytes) from local storage', k, localData[k].length);
                    // send message to ourself to simplify async handling
                    chrome.runtime.sendMessage({
                        command: 'remoteBlacklistLoaded',
                        location: k,
                        content: localData[k]
                    });
                } else {
                    remoteLoad(k);
                }
            }
        });
    },

    mergeRemoteBlacklist: function(location, content) {
        var list = {};
        this.populateListFromString(list, '*/', content, '');
        this.populateListFromList(this.remoteBlacklist, list);
        this.populateListFromList(this.blacklist, list);
    },

    // parse and merge a string into a list
    populateListFromString: function(des, prefix, s, suffix) {
        var keys = s.split("\n");
        var i = keys.length;
        var k;
        while ( i-- ) {
            k = keys[i];
            j = k.indexOf('#');
            if ( j >= 0 ) {
                k = k.slice(0, j);
            }
            k = k.trim();
            if ( k.length === 0 ) {
                continue;
            }
            des[prefix + k + suffix] = true;
        }
    },

     // merge a list into another list
    populateListFromList: function(des, src) {
        for ( var k in src ) {
            des[k] = src[k];
        }
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

// to simplify handling of async stuff
chrome.runtime.onMessage.addListener(function(request, sender, callback) {
    switch ( request.command ) {

    // parse and activate remote blacklist
    case 'remoteBlacklistLoaded':
        HTTPSwitchboard.mergeRemoteBlacklist(request.location, request.content);
        break;

    default:
        break;
    }

    callback();
});

// intercept and filter web requests according to white and black lists
function webRequestHandler(details) {
    if ( details.tabId < 0 ) {
        return {"cancel": false};
    }
    // log request attempt
    HTTPSwitchboard.record(details);

    // see if whitelisted
    var urlParts = HTTPSwitchboard.getUrlParts(details.url);
    if ( HTTPSwitchboard.whitelisted(details.type, urlParts.domain) ) {
        console.log('allowing %s from %s', details.type, urlParts.domain);
        return { "cancel": false };
    }
    // default is to blacklist
    console.log('blocking %s from %s', details.type, urlParts.domain);
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
        delete HTTPSwitchboard.requests[details.tabId];
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

HTTPSwitchboard.load();
