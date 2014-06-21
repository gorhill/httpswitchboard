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

/* global HTTPSB, PermissionScopes, PermissionScope, PermissionList */

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


// rhill 2014-06-21: re-factoring idea:
//
// Currently `pale` and `dark` refer to whether the request is directly or
// indirectly blocked/allowed. Because of
// <https://github.com/gorhill/httpswitchboard/issues/66>, a higher granularity
// is desirable:
//
// - self: `type|domain`
// - ancestor: inherit from `type|ancestor domain`
// - domain: inherit from `*|domain` or `*|ancestor domain`
// - type: inherit from `type|*`
// - all: inherit from `*|*`
//
// So `pale` and `dark` stays (ie. `rDt`, `gPp`, etc.), but a new character
// would be added in order to convey more details about how the status
// was inherited.

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
    while ( i-- ) {
        this.addOne(filters[i]);
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

PermissionList.prototype.add = function(other) {
    for ( var kother in other.list ) {
        if ( other.list.hasOwnProperty(kother) && !this.list[kother] ) {
            this.list[kother] = true;
            this.count++;
        }
    }
};

/******************************************************************************/

// How much this list differs from the other

PermissionList.prototype.diffCount = function(other) {
    var count = 0;
    // In this one but not the other
    for ( var kthis in this.list ) {
        if ( this.list.hasOwnProperty(kthis) && this.list[kthis] && !other.list[kthis] ) {
            count++;
        }
    }
    // In the other but not this one
    for ( var kother in other.list ) {
        if ( other.list.hasOwnProperty(kother) && other.list[kother] && !this.list[kother] ) {
            count++;
        }
    }
    return count;
};

/******************************************************************************/

PermissionList.prototype.typeFromRuleKey = function(ruleKey) {
    var pos = ruleKey.indexOf('|');
    return pos < 0 ? '' : ruleKey.slice(0, pos);
};
PermissionList.prototype.hostnameFromRuleKey = function(ruleKey) {
    var pos = ruleKey.indexOf('|');
    return pos < 0 ? '' : ruleKey.slice(pos + 1);
};

/******************************************************************************/
/******************************************************************************/

// A scope exhibits three lists: white, black and gray.

PermissionScope.prototype.toString = function() {
    var bin = {
        whiteStr: this.white.toString(),
        blackStr: this.black.toString(),
        grayStr: this.gray.toString(),
        mtxFiltering: this.mtxFiltering,
        abpFiltering: this.abpFiltering
    };
    return JSON.stringify(bin);
};

PermissionScope.prototype.fromString = function(s) {
    var bin = JSON.parse(s);
    this.white.fromString(bin.whiteStr);
    this.black.fromString(bin.blackStr);
    this.gray.fromString(bin.grayStr);
    this.mtxFiltering = bin.mtxFiltering !== undefined ? bin.mtxFiltering : true;
    this.abpFiltering = bin.abpFiltering !== undefined ? bin.abpFiltering : true;
};

/******************************************************************************/

PermissionScope.prototype.assign = function(other) {
    this.white.assign(other.white);
    this.black.assign(other.black);
    this.gray.assign(other.gray);
    this.off = other.off;
    this.mtxFiltering = other.mtxFiltering;
    this.abpFiltering = other.abpFiltering;
};

/******************************************************************************/

PermissionScope.prototype.add = function(other) {
    this.white.add(other.white);
    this.black.add(other.black);
    this.gray.add(other.gray);
};

/******************************************************************************/

PermissionScope.prototype.removeAllRules = function() {
    this.white.removeAll();
    this.black.removeAll();
    this.gray.removeAll();
};

/******************************************************************************/

PermissionScope.prototype.diffCount = function(other) {
    if ( !other ) {
        return this.white.count + this.black.count + this.gray.count + 2;
    }
    var count =
        this.white.diffCount(other.white) +
        this.black.diffCount(other.black) +
        this.gray.diffCount(other.gray);
    if ( !this.mtxFiltering !== !other.mtxFiltering ) {
        count += 1;
    }
    if ( !this.abpFiltering !== !other.abpFiltering ) {
        count += 1;
    }
    return count;
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

PermissionScope.prototype.evaluate = function(type, hostname) {
    // rhill 2013-12-03: When matrix filtering is turned off, all requests are
    // considered being "allowed temporarily".
    if ( this.mtxFiltering === false ) {
        return 'gpt';
    }

    // cell's own rules
    var cellKey = type + '|' + hostname;
    if ( this.white.list[cellKey] ) { return 'gdt'; }
    if ( this.black.list[cellKey] ) { return 'rdt'; }
    // cell doesn't have own rules, inherit

    // [specific hostname, ?]: [parent hostname, ?]
    if ( hostname !== '*' ) {
        // [specific hostname, specific type]: [parent hostname, specific type]
        if ( type !== '*' ) {
            if ( this.httpsb.userSettings.strictBlocking ) {
                return this.evaluateTypeHostnameCellStrict(type, hostname);
            }
            return this.evaluateTypeHostnameCellRelax(type, hostname);
        }
        // [specific hostname, any type]: inherits from ubiquitous rules, then [parent hostname, any type]
        return this.evaluateHostnameCell(hostname);
    }

    // [any hostname, specific type]: inherits from [any hostname, any type]
    if ( type !== '*' ) {
        if ( this.white.list['*|*'] ) { return 'gpt'; }
        return 'rpt';
    }

    // [any hostname, any type]: inherits from hard-coded block
    return 'rdt';
};

/******************************************************************************/

PermissionScope.prototype.evaluateTypeHostnameCellStrict = function(type, hostname) {
    // https://github.com/gorhill/httpswitchboard/issues/29
    // direct: specific type, specific hostname
    var whitelist = this.white.list;
    var blacklist = this.black.list;

    var typeKey = type + '|*';
    var cellKey = '*|' + hostname;

    var parents = this.httpsb.URI.parentHostnamesFromHostname(hostname);
    var i = 0, parent;

    if ( whitelist[cellKey] ) {
        // Strict blocking: the type column must not be blacklisted
        while ( parent = parents[i++] ) {
            cellKey = type + '|' + parent;
            if ( whitelist[cellKey] ) { return 'gpt'; }
            if ( blacklist[cellKey] ) { return 'rpt'; }
        }
        if ( whitelist[typeKey] ) { return 'gpt'; }
        if ( blacklist[typeKey] ) { return 'rpt'; }
        return 'gpt';
    }
    if ( blacklist[cellKey] ) { return 'rpt'; }

    var graylist = this.gray.list;
    var ubiquitousWhitelist = this.httpsb.ubiquitousWhitelist;
    var ubiquitousBlacklist = this.httpsb.ubiquitousBlacklist;

    if ( !graylist[cellKey] ) {
        if ( ubiquitousWhitelist.test(hostname) ) {
            // Strict blocking: the type column must not be blacklisted
            while ( parent = parents[i++] ) {
                cellKey = type + '|' + parent;
                if ( whitelist[cellKey] ) { return 'gpt'; }
                if ( blacklist[cellKey] ) { return 'rpt'; }
            }
            if ( whitelist[typeKey] ) { return 'gpt'; }
            if ( blacklist[typeKey] ) { return 'rpt'; }
            return 'gpt';
        }
        if ( ubiquitousBlacklist.test(hostname) ) {
            return 'rpt';
        }
    }
    // rhill 2013-12-18:
    // If the type is blocked and strict blocking is on,
    // than the only way for the cell to be whitelisted is
    // by having an ancestor explicitly whitelisted
    while ( parent = parents[i++] ) {
        cellKey = type + '|' + parent;
        if ( whitelist[cellKey] ) { return 'gpt'; }
        if ( blacklist[cellKey] ) { return 'rpt'; }
        cellKey = '*|' + parent;
        if ( whitelist[cellKey] ) {
            while ( parent = parents[i++] ) {
                cellKey = type + '|' + parent;
                if ( whitelist[cellKey] ) { return 'gpt'; }
                if ( blacklist[cellKey] ) { return 'rpt'; }
            }
            if ( whitelist[typeKey] ) { return 'gpt'; }
            if ( blacklist[typeKey] ) { return 'rpt'; }
            return 'gpt';
        }
        if ( blacklist[cellKey] ) { return 'rpt'; }
        if ( !graylist[cellKey] ) {
            if ( ubiquitousWhitelist.test(parent) ) {
                // Strict blocking: the type column must not be blacklisted
                while ( parent = parents[i++] ) {
                    cellKey = type + '|' + parent;
                    if ( whitelist[cellKey] ) { return 'gpt'; }
                    if ( blacklist[cellKey] ) { return 'rpt'; }
                }
                if ( whitelist[typeKey] ) { return 'gpt'; }
                if ( blacklist[typeKey] ) { return 'rpt'; }
                return 'gpt';
            }
            if ( ubiquitousBlacklist.test(parent) ) { return 'rpt'; }
        }
    }
    // specific type, any hostname
    if ( whitelist[typeKey] ) { return 'gpt'; }
    if ( blacklist[typeKey] ) { return 'rpt'; }
    // any type, any hostname
    if ( whitelist['*|*'] ) { return 'gpt'; }
    return 'rpt';
};

/******************************************************************************/

PermissionScope.prototype.evaluateTypeHostnameCellRelax = function(type, hostname) {
    // https://github.com/gorhill/httpswitchboard/issues/29
    // direct: specific type, specific hostname
    var httpsb = this.httpsb;
    var ubiquitousWhitelist = httpsb.ubiquitousWhitelist;
    var ubiquitousBlacklist = httpsb.ubiquitousBlacklist;
    var whitelist = this.white.list;
    var blacklist = this.black.list;
    var graylist = this.gray.list;

    var typeKey = type + '|*';
    var cellKey = '*|' + hostname;

    var parents = httpsb.URI.parentHostnamesFromHostname(hostname);

    if ( whitelist[cellKey] ) { return 'gpt'; }
    if ( blacklist[cellKey] ) { return 'rpt'; }
    if ( !graylist[cellKey] ) {
        if ( ubiquitousWhitelist.test(hostname) ) { return 'gpt'; }
        if ( ubiquitousBlacklist.test(hostname) ) { return 'rpt'; }
    }
    // rhill 2013-12-18:
    // If the type is blocked and strict blocking is on,
    // than the only way for the cell to be whitelisted is
    // by having an ancestor explicitly whitelisted
    var i = 0, parent;
    while ( parent = parents[i++] ) {
        cellKey = type + '|' + parent;
        if ( whitelist[cellKey] ) { return 'gpt'; }
        if ( blacklist[cellKey] ) { return 'rpt'; }
        cellKey = '*|' + parent;
        if ( whitelist[cellKey] ) { return 'gpt'; }
        if ( blacklist[cellKey] ) { return 'rpt'; }
        if ( !graylist[cellKey] ) {
            if ( ubiquitousWhitelist.test(parent) ) { return 'gpt'; }
            if ( ubiquitousBlacklist.test(parent) ) { return 'rpt'; }
        }
    }
    // indirect: specific type, any hostname
    if ( whitelist[typeKey] ) { return 'gpt'; }
    if ( blacklist[typeKey] ) { return 'rpt'; }
    // indirect: any type, any hostname
    if ( whitelist['*|*'] ) { return 'gpt'; }
    return 'rpt';
};

/******************************************************************************/

PermissionScope.prototype.evaluateHostnameCell = function(hostname) {
    // direct: any type, specific hostname
    var ubiquitousWhitelist = this.httpsb.ubiquitousWhitelist;
    var ubiquitousBlacklist = this.httpsb.ubiquitousBlacklist;
    var graylist = this.gray.list;
    if ( !graylist['*|' + hostname] ) {
        if ( ubiquitousWhitelist.test(hostname) ) { return 'gdt'; }
        if ( ubiquitousBlacklist.test(hostname) ) { return 'rdt'; }
    }
    var whitelist = this.white.list;
    var blacklist = this.black.list;
    var parents = this.httpsb.URI.parentHostnamesFromHostname(hostname);
    var i = 0, parent, cellKey;
    while ( parent = parents[i++] ) {
        cellKey = '*|' + parent;
        if ( whitelist[cellKey] ) { return 'gpt'; }
        if ( blacklist[cellKey] ) { return 'rpt'; }
        if ( !graylist[cellKey] ) {
            if ( ubiquitousWhitelist.test(parent) ) { return 'gpt'; }
            if ( ubiquitousBlacklist.test(parent) ) { return 'rpt'; }
        }
    }
    if ( whitelist['*|*'] ) { return 'gpt'; }
    return 'rpt';
};

/******************************************************************************/

PermissionScope.prototype.addRule = function(listKey, type, hostname) {
    var list = this[listKey];
    if ( !list ) {
        throw new Error('PermissionScope.addRule() > invalid list name');
    }
    return list.addOne(type + '|' + hostname);
};

PermissionScope.prototype.removeRule = function(listKey, type, hostname) {
    var list = this[listKey];
    if ( !list ) {
        throw new Error('PermissionScope.removeRule() > invalid list name');
    }
    return list.removeOne(type + '|' + hostname);
};

/******************************************************************************/

PermissionScope.prototype.whitelist = function(type, hostname) {
    var key = type + '|' + hostname;
    var changed = false;
    changed = this.black.removeOne(key) || changed;
    changed = this.gray.removeOne(key) || changed;
    // Avoid duplicating ubiquitously whitelisted entries
    if ( type !== '*' || !HTTPSB.ubiquitousWhitelist.test(hostname) ) {
        changed = this.white.addOne(key) || changed;
    }
    return changed;
};

/******************************************************************************/

PermissionScope.prototype.blacklist = function(type, hostname) {
    var key = type + '|' + hostname;
    var changed = false;
    changed = this.white.removeOne(key) || changed;
    changed = this.gray.removeOne(key) || changed;
    // Avoid duplicating ubiquitously blacklisted entries
    // TODO: Is this really a good idea? If user explicitly blocked an entry
    // which is already in read-only blacklist (after graylisting or
    // whitelisting it), user expects entry to still be blacklisted if ever
    // same entry is removed from read-only blacklist.
    if ( type !== '*' || !HTTPSB.ubiquitousBlacklist.test(hostname) ) {
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
    if ( type === '*' ) {
        if ( HTTPSB.ubiquitousBlacklist.test(hostname) || HTTPSB.ubiquitousWhitelist.test(hostname) ) {
            changed = this.gray.addOne(key) || changed;
        }
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
        scope = new PermissionScope();
        scopeBin = bin.scopes[i];
        scope.fromString(scopeBin.scopeStr);
        this.scopes[scopeBin.scopeKey] = scope;
    }
    // rhill 2014-01-27: Remove scheme from scopes and merge resulting scope
    // duplicates if any.
    // https://github.com/gorhill/httpswitchboard/issues/165
    // TODO: Remove once all users are beyond v0.7.9.0
    var newScopeKey;
    for ( var oldScopeKey in this.scopes ) {
        if ( !this.scopes.hasOwnProperty(oldScopeKey) ) {
            continue;
        }
        newScopeKey = oldScopeKey.replace(/^https?:\/\//, '');
        if ( newScopeKey === oldScopeKey ) {
            continue;
        }
        if ( this.scopes[newScopeKey] ) {
            this.scopes[newScopeKey].add(this.scopes[oldScopeKey]);
        } else {
            this.scopes[newScopeKey] = this.scopes[oldScopeKey];
        }
        delete this.scopes[oldScopeKey];
    }
};

/******************************************************************************/

PermissionScopes.prototype.assign = function(other) {
    var scopeKeys, i, scopeKey;
    var thisScope, otherScope;

    // Remove scopes found here but not found in other
    // Overwrite scopes found both here and in other
    scopeKeys = Object.keys(this.scopes);
    i = scopeKeys.length;
    while ( i-- ) {
        scopeKey = scopeKeys[i];
        otherScope = other.scopes[scopeKey];
        if ( otherScope && otherScope.off ) {
            otherScope = null;
        }
        if ( !otherScope ) {
            delete this.scopes[scopeKey];
        } else {
            this.scopes[scopeKey].assign(otherScope);
        }
    }

    // Add scopes not found here but found in other
    scopeKeys = Object.keys(other.scopes);
    i = scopeKeys.length;
    while ( i-- ) {
        scopeKey = scopeKeys[i];
        otherScope = other.scopes[scopeKey];
        if ( otherScope.off ) {
            continue;
        }
        thisScope = this.scopes[scopeKey];
        if ( thisScope && thisScope.off ) {
            thisScope = null;
        }
        if ( !thisScope ) {
            this.scopes[scopeKey] = new PermissionScope();
            this.scopes[scopeKey].assign(other.scopes[scopeKey]);
        }
    }
};

/******************************************************************************/

PermissionScopes.prototype.scopeKeyFromPageURL = function(url) {
    if ( !url || url === '*' ) {
        return '*';
    }
    var httpsburi = HTTPSB.URI;
    var hostname = httpsburi.hostnameFromURI(url);
    if ( hostname === '' ) {
        return '*';
    }
    // if ( (/[^a-z0-9.-])/.test(scopeKey) ) {
    //    throw new Error('Invalid URL: ' + url);
    // }
    // From narrowest scope to broadest scope.
    // Try site scope.
    var scope = this.scopes[hostname];
    if ( scope && !scope.off ) {
        return hostname;
    }
    // Try domain scope.
    var domain = httpsburi.domainFromHostname(hostname);
    if ( domain === '' ) {
        domain = hostname;
    }
    var scopeKey = '*.' + domain;
    scope = this.scopes[scopeKey];
    if ( scope && !scope.off ) {
        return scopeKey;
    }
    return '*';
};

/******************************************************************************/

PermissionScopes.prototype.scopeFromScopeKey = function(scopeKey) {
    var scope = this.scopes[scopeKey];
    if ( scope ) {
        return scope;
    }
    return this.scopes['*'];
};

/******************************************************************************/

PermissionScopes.prototype.evaluate = function(scopeKey, type, hostname) {
    // rhill 2013-11-04: A caller which does not want an inexistant scope
    // to fall back on global scope will have to create explicitly the
    // inexistant scope before calling.
    return this.scopeFromScopeKey(scopeKey).evaluate(type, hostname);
};

/******************************************************************************/

PermissionScopes.prototype.addRule = function(scopeKey, list, type, hostname) {
    return this.scopeFromScopeKey(scopeKey).addRule(list, type, hostname);
};

PermissionScopes.prototype.removeRule = function(scopeKey, list, type, hostname) {
    return this.scopeFromScopeKey(scopeKey).removeRule(list, type, hostname);
};

PermissionScopes.prototype.whitelist = function(scopeKey, type, hostname) {
    return this.scopeFromScopeKey(scopeKey).whitelist(type, hostname);
};

PermissionScopes.prototype.blacklist = function(scopeKey, type, hostname) {
    return this.scopeFromScopeKey(scopeKey).blacklist(type, hostname);
};

PermissionScopes.prototype.graylist = function(scopeKey, type, hostname) {
    return this.scopeFromScopeKey(scopeKey).graylist(type, hostname);
};

/******************************************************************************/

PermissionScopes.prototype.getMtxFiltering = function(scopeKey) {
    var scope = this.scopeFromScopeKey(scopeKey);
    if ( scope ) {
        return scope.mtxFiltering;
    }
    return undefined;
};

PermissionScopes.prototype.toggleMtxFiltering = function(scopeKey, state) {
    var scope = this.scopeFromScopeKey(scopeKey);
    if ( !scope ) {
        return undefined;
    }
    if ( state === undefined ) {
        scope.mtxFiltering = !scope.mtxFiltering;
    } else {
        scope.mtxFiltering = !!state;
    }
    return scope.mtxFiltering;
};

/******************************************************************************/

PermissionScopes.prototype.getABPFiltering = function(scopeKey) {
    var scope = this.scopeFromScopeKey(scopeKey);
    if ( scope ) {
        return scope.abpFiltering;
    }
    return undefined;
};

PermissionScopes.prototype.toggleABPFiltering = function(scopeKey, state) {
    var scope = this.scopeFromScopeKey(scopeKey);
    if ( !scope ) {
        return undefined;
    }
    if ( state === undefined ) {
        scope.abpFiltering = !scope.abpFiltering;
    } else {
        scope.abpFiltering = !!state;
    }
    return scope.abpFiltering;
};

/******************************************************************************/

PermissionScopes.prototype.applyRuleset = function(scopeKey, rules) {
    var scope = this.scopeFromScopeKey(scopeKey);
    if ( !scope ) {
        console.error('HTTP Switchboard> PermissionScopes.applyRuleset(): scope not found');
        return false;
    }
    var addRules = function(rules, scope, listKey) {
        var changed = false;
        var i = rules.length, rule;
        while ( i-- ) {
            rule = rules[i];
            changed = scope.addRule(listKey, rule.type, rule.hostname) || changed;
        }
        return changed;
    };
    var removeRules = function(rules, scope, listKey) {
        var changed = false;
        var i = rules.length, rule;
        while ( i-- ) {
            rule = rules[i];
            changed = scope.removeRule(listKey, rule.type, rule.hostname) || changed;
        }
        return changed;
    };
    var changed = false;
    changed = addRules(rules.add.white, scope, 'white') || changed;
    changed = addRules(rules.add.black, scope, 'black') || changed;
    changed = addRules(rules.add.gray, scope, 'gray') || changed;
    changed = removeRules(rules.remove.white, scope, 'white') || changed;
    changed = removeRules(rules.remove.black, scope, 'black') || changed;
    changed = removeRules(rules.remove.gray, scope, 'gray') || changed;
    if ( rules.mtxFiltering !== scope.mtxFiltering ) {
        scope.mtxFiltering = !!rules.mtxFiltering;
        changed = true;
    }
    if ( rules.abpFiltering !== scope.abpFiltering ) {
        scope.abpFiltering = !!rules.abpFiltering;
        changed = true;
    }
    return changed;
};

