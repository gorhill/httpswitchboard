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

// Re. "color":
//   'rdt' = red dark temporary
//   'rpt' = red pale temporary
//   'gdt' = green dark temporary
//   'gpt' = green pale temporary
//   'rdp' = red dark permanent
//   'rpp' = red pale permanent
//   'gdp' = green dark permanent
//   'gpp' = green pale permanent
//   'xxx' used at position without valid state

/******************************************************************************/
/******************************************************************************/

PermissionList.prototype.addOne = function(pattern) {
    if ( !this.list[pattern] ) {
        this.list[pattern] = true;
        this.count++;
        return true;
    }
    return false;
};

/******************************************************************************/

PermissionList.prototype.removeOne = function(pattern) {
    if ( this.list[pattern] ) {
        delete this.list[pattern];
        this.count--;
        return true;
    }
    return false;
};

/******************************************************************************/

PermissionList.prototype.removeAll = function() {
    this.list = {};
    this.count = 0;
};

/******************************************************************************/

PermissionList.prototype.toString = function() {
    // I sort() to allow deterministic output, this way I can compare
    // whether two lists are exactly the same just using string
    // comparison.
    return Object.keys(this.list).sort().join('\n');
};

PermissionList.prototype.fromString = function(s) {
    var patterns = s.split(/\s+/);
    var pattern;
    var i = patterns.length;
    while ( i-- ) {
        pattern = patterns[i];
        if ( !pattern.length ) {
            continue;
        }
        // rhill 2013-11-02:
        //   Old format: */*
        //   New format: *|*
        if ( pattern.indexOf('|') < 0 ) {
            pattern = pattern.replace('/', '|');
        }
        // rhill 2013-11-16: somehow (maybe during development), a
        // 'undefined|*' made it to the storage..
        if ( pattern === 'undefined|*' ) {
            continue;
        }
        if ( !this.list[pattern] ) {
            this.list[pattern] = true;
            this.count++;
        }
    }
};

/******************************************************************************/

PermissionList.prototype.fromList = function(other) {
    for ( var kother in other.list ) {
        if ( !other.list.hasOwnProperty(kother) ) {
            continue;
        }
        // rhill 2013-11-02:
        //   Old format: */*
        //   New format: *|*
        if ( kother.indexOf('|') < 0 ) {
            kother = kother.replace('/', '|');
        }
        if ( !this.list[kother] ) {
            this.list[kother] = true;
            this.count++;
        }
    }
};

/******************************************************************************/

PermissionList.prototype.fromArray = function(filters) {
    if ( Object.prototype.toString.call(filters) !== '[object Array]' ) {
        throw 'PermissionList.fromArray() > expecting an array';
    }
    var i = filters.length;
    var filter;
    while ( i-- ) {
        filter = filters[i];
        // rhill 2013-11-02:
        //   Old format: */*
        //   New format: *|*
        if ( filter.indexOf('|') < 0 ) {
            filter = filter.replace('/', '|');
        }
        this.addOne(filter);
    }
};

/******************************************************************************/

PermissionList.prototype.assign = function(other) {
    // This is done this way in order to reduce mem alloc/dealloc.
    // Remove all that is not in the other but found in this one.
    for ( var kthis in this.list ) {
        if ( this.list.hasOwnProperty(kthis) && !other.list[kthis] ) {
            delete this.list[kthis];
            this.count--;
        }
    }
    // Add all that is in the other list but not found in this one.
    for ( var kother in other.list ) {
        if ( other.list.hasOwnProperty(kother) && !this.list[kother] ) {
            this.list[kother] = true;
            this.count++;
        }
    }
};

/******************************************************************************/
/******************************************************************************/

// A scope exhibits three lists: white, black and gray.

PermissionScope.prototype.toString = function() {
    var bin = {
        whiteStr: this.white.toString(),
        blackStr: this.black.toString(),
        grayStr: this.gray.toString()
    };
    if ( bin.whiteStr === '' && bin.blackStr === '' && bin.grayStr === '' ) {
        return '';
    }
    return JSON.stringify(bin);
};

PermissionScope.prototype.fromString = function(s) {
    var bin = JSON.parse(s);
    this.white.fromString(bin.whiteStr);
    this.black.fromString(bin.blackStr);
    this.gray.fromString(bin.grayStr);
};

/******************************************************************************/

PermissionScope.prototype.assign = function(other) {
    this.white.assign(other.white);
    this.black.assign(other.black);
    this.gray.assign(other.gray);
};

/******************************************************************************/

// This is the heart of HTTP Switchboard:
//
// Check whether something is white or blacklisted, direct or indirectly.
//
// Levels of evaluations (3 distinct algorithms):
//   while hostname !== empty:
//     type|hostname
//     *|hostname
//     hostname = parent hostname
//   type|*
//   *|*
//
// For each evaluation:
//   In whitelist?
//      Yes: evaluated as whitelisted
//   In blacklist?
//      Yes: evaluated as blacklisted
//   Not in graylist and in read-only blacklist?
//      Yes: evaluated as blacklisted
//   Evaluated as graylisted
//      Evaluate next level
//
// It is a naturally recursive function, but I unwind it completely here
// because it is a core function, used in time critical parts of the
// code, and I gain by making local references to global variables, which
// is better if done once, which would happen for each recursive call
// otherwise.

PermissionScope.prototype.evaluate = function(type, hostname) {
    var blacklistReadonly = this.httpsb.blacklistReadonly;
    var blacklist = this.black.list;
    var whitelist = this.white.list;
    var graylist = this.gray.list;
    var typeKey, cellKey;
    var parents, parent;

    // Pick proper entry point

    if ( type !== '*' && hostname !== '*' ) {
        // https://github.com/gorhill/httpswitchboard/issues/29
        typeKey = type + '|*';

        // direct: specific type, specific hostname
        cellKey = type + '|' + hostname;
        if ( whitelist[cellKey] ) {
            return 'gdt';
        }
        if ( blacklist[cellKey] ) {
            return 'rdt';
        }
        // indirect: any type, specific hostname
        cellKey = '*|' + hostname;

        // rhill 2013-10-26: Whitelist MUST be checked before blacklist,
        // because read-only blacklists are, hum... read-only? (which means
        // they can only be overriden through occultation, which means
        // whitelists has to be checked first).
        if ( whitelist[cellKey] ) {
            // https://github.com/gorhill/httpswitchboard/issues/29
            // The cell is indirectly whitelisted because of hostname, type
            // must NOT be blacklisted.
            if ( this.httpsb.userSettings.strictBlocking && blacklist[typeKey] ) {
                return 'rpt';
            }
            return 'gpt';
        }
        if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[hostname]) ) {
            return 'rpt';
        }

        // indirect: parent hostname nodes
        parents = uriTools.parentHostnamesFromHostname(hostname);
        while ( true ) {
            parent = parents.shift();
            if ( !parent ) {
                break;
            }
            cellKey = type + '|' + parent;
            // specific type, specific parent
            if ( whitelist[cellKey] ) {
                return 'gpt';
            }
            if ( blacklist[cellKey] ) {
                return 'rpt';
            }
            // any type, specific parent
            cellKey = '*|' + parent;

            // rhill 2013-10-26: Whitelist MUST be checked before blacklist,
            // because read-only blacklists are, hum... read-only?
            if ( whitelist[cellKey] ) {
                // https://github.com/gorhill/httpswitchboard/issues/29
                // The cell is indirectly whitelisted because of hostname, type
                // must NOT be blacklisted.
                if ( this.httpsb.userSettings.strictBlocking && blacklist[typeKey] ) {
                    return 'rpt';
                }
                return 'gpt';
            }
            if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[parent]) ) {
                return 'rpt';
            }
        }
        // indirect: specific type, any hostname
        if ( whitelist[typeKey] ) {
            return 'gpt';
        }
        if ( blacklist[typeKey]  ) {
            return 'rpt';
        }
        // indirect: any type, any hostname
        if ( whitelist['*|*'] ) {
            return 'gpt';
        }
        return 'rpt';
    }
    if ( type === '*' && hostname !== '*' ) {
        // direct: any type, specific hostname
        cellKey = '*|' + hostname;
        if ( whitelist[cellKey] ) {
            return 'gdt';
        }
        if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[hostname]) ) {
            return 'rdt';
        }
        // indirect: parent hostname nodes
        parents = uriTools.parentHostnamesFromHostname(hostname);
        while ( true ) {
            parent = parents.shift();
            if ( !parent ) {
                break;
            }
            // any type, specific hostname
            cellKey = '*|' + parent;
            if ( whitelist[cellKey] ) {
                return 'gpt';
            }
            if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[parent]) ) {
                return 'rpt';
            }
        }
        // indirect: any type, any hostname
        if ( whitelist['*|*'] ) {
            return 'gpt';
        }
        return 'rpt';
    }
    if ( type !== '*' && hostname === '*' ) {
        // indirect: specific type, any hostname
        cellKey = type + '|*';
        if ( whitelist[cellKey] ) {
            return 'gdt';
        }
        if ( blacklist[cellKey] ) {
            return 'rdt';
        }
        // indirect: any type, any hostname
        if ( whitelist['*|*'] ) {
            return 'gpt';
        }
        return 'rpt';
    }
    if ( whitelist['*|*'] ) {
        return 'gdt';
    }
    return 'rdt';
};

/******************************************************************************/

PermissionScope.prototype.whitelist = function(type, hostname) {
    var key = type + '|' + hostname;
    var changed = false;
    changed = this.white.addOne(key) || changed;
    changed = this.black.removeOne(key) || changed;
    changed = this.gray.removeOne(key) || changed;
    return changed;
};

/******************************************************************************/

PermissionScope.prototype.blacklist = function(type, hostname) {
    var key = type + '|' + hostname;
    var changed = false;
    changed = this.white.removeOne(key) || changed;
    changed = this.gray.removeOne(key) || changed;
    // Avoid duplicating read-only blacklisted entries
    // TODO: Is this really a good idea? If user explicitly blocked an entry
    // which is already in read-only blacklist (after graylisting or
    // whitelisting it), user expects entry to still be blacklisted if ever
    // same entry is removed from read-only blacklist.
    if ( type !== '*' || !this.httpsb.blacklistReadonly[hostname] ) {
        changed = this.black.addOne(key) || changed;
    }
    return changed;
};

/******************************************************************************/

PermissionScope.prototype.graylist = function(type, hostname) {
    var key = type + '|' + hostname;
    // rhill 2013-11-04: No worry about master switch being graylisted, it will
    // never happens because evaluate() always return a dark color for the
    // master switch.
    var changed = false;
    changed = this.white.removeOne(key) || changed;
    changed = this.black.removeOne(key) || changed;
    // rhill 2013-10-25: special case, we expressly graylist only if the
    // key is '*' and hostname is found in read-only blacklist, so that the
    // express graylisting occults the read-only blacklist status.
    if ( type === '*' && this.httpsb.blacklistReadonly[hostname] ) {
        changed = this.gray.addOne(key) || changed;
    }
    return changed;
};

/******************************************************************************/
/******************************************************************************/

PermissionScopes.prototype.toString = function() {
    var bin = {
        scopes: []
    };
    var scopeKeys = Object.keys(this.scopes);
    var i = scopeKeys.length;
    var scopeKey, scope, scopeStr;
    while ( i-- ) {
        scopeKey = scopeKeys[i];
        scope = this.scopes[scopeKey];
        // Ignore scope if it is turned off
        if ( scope.off ) {
            continue;
        }
        scopeStr = scope.toString();
        if ( scopeStr !== '' ) {
            bin.scopes.push({
                scopeKey: scopeKey,
                scopeStr: scopeStr
            });
        }
    }
    return JSON.stringify(bin);
};

PermissionScopes.prototype.fromString = function(s) {
    var bin = JSON.parse(s);
    var i = bin.scopes.length;
    var scope, scopeBin;
    while ( i-- ) {
        scope = new PermissionScope(this.httpsb);
        scopeBin = bin.scopes[i];
        scope.fromString(scopeBin.scopeStr);
        this.scopes[scopeBin.scopeKey] = scope;
    }
};

/******************************************************************************/

PermissionScopes.prototype.assign = function(other) {
    var scopeKeys, i, scopeKey;

    // Remove scopes found here but not found in other
    // Overwrite scopes found both here and in other
    scopeKeys = Object.keys(this.scopes);
    i = scopeKeys.length;
    while ( i-- ) {
        scopeKey = scopeKeys[i];
        if ( !other.scopes[scopeKey] ) {
            delete this.scopes[scopeKey];
        } else {
            this.scopes[scopeKey].assign(other.scopes[scopeKey]);
        }
    }

    // Add scopes not found here but found in other
    scopeKeys = Object.keys(other.scopes);
    i = scopeKeys.length;
    while ( i-- ) {
        scopeKey = scopeKeys[i];
        if ( !this.scopes[scopeKey] ) {
            this.scopes[scopeKey] = new PermissionScope(this.httpsb);
            this.scopes[scopeKey].assign(other.scopes[scopeKey]);
        }
    }
};

/******************************************************************************/

PermissionScopes.prototype.normalizeScopeURL = function(url) {
    if ( !url ) {
        return null;
    }
    if ( url !== '*' ) {
        url = uriTools.rootURLFromURI(url);
    }
    return url;
};

/******************************************************************************/

PermissionScopes.prototype.scopeFromURL = function(url) {
    if ( !url ) {
        return this.scopes['*'];
    }
    if ( url !== '*' ) {
        url = uriTools.rootURLFromURI(url);
    }
    return this.scopes[url];
};

/******************************************************************************/

PermissionScopes.prototype.evaluate = function(url, type, hostname) {
    var scope = this.scopeFromURL(url);
    // rhill 2013-11-04: A caller which does not want an inexistant scope
    // to fall back on global scope will have to create explicitly the
    // inexistant scope before calling.
    if ( !scope || scope.off ) {
        scope = this.scopes['*'];
    }
    return scope.evaluate(type, hostname);
};

/******************************************************************************/

PermissionScopes.prototype.whitelist = function(url, type, hostname) {
    var scope = this.scopeFromURL(url);
    if ( !scope || scope.off ) {
        scope = this.scopes['*'];
    }
    return scope.whitelist(type, hostname);
};

/******************************************************************************/

PermissionScopes.prototype.blacklist = function(url, type, hostname) {
    var scope = this.scopeFromURL(url);
    if ( !scope || scope.off ) {
        scope = this.scopes['*'];
    }
    return scope.blacklist(type, hostname);
};

/******************************************************************************/

PermissionScopes.prototype.graylist = function(url, type, hostname) {
    var scope = this.scopeFromURL(url);
    if ( !scope || scope.off ) {
        scope = this.scopes['*'];
    }
    return scope.graylist(type, hostname);
};

/******************************************************************************/
