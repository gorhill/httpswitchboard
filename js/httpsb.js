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

HTTPSB.temporaryScopes = new PermissionScopes();
HTTPSB.permanentScopes = new PermissionScopes();

/******************************************************************************/

HTTPSB.normalizeScopeURL = function(url) {
    if ( !url ) {
        return null;
    }
    if ( url !== '*' ) {
        url = uriTools.rootURLFromURI(url);
    }
    return url;
};

/******************************************************************************/

HTTPSB.globalScopeKey = function() {
    return '*';
};

HTTPSB.domainScopeKeyFromURL = function(url) {
    var ut = uriTools.uri(url);
    var scheme = ut.scheme();
    if ( scheme.indexOf('http') !== 0 ) {
        return '';
    }
    var hostname = ut.hostname();
    var domain = ut.domainFromHostname(hostname);
    if ( domain === '' ) {
        domain = hostname;
    }
    return scheme + '://*.' + domain;
};

HTTPSB.siteScopeKeyFromURL = function(url) {
    return uriTools.rootURLFromURI(url);
};

/******************************************************************************/

HTTPSB.isGlobalScopeKey = function(scopeKey) {
    return scopeKey === '*';
};

HTTPSB.isDomainScopeKey = function(scopeKey) {
    return (/^https?:\/\/[*]/).test(scopeKey);
};

HTTPSB.isSiteScopeKey = function(scopeKey) {
    return (/^https?:\/\/[^*]/).test(scopeKey);
};

HTTPSB.isValidScopeKey = function(scopeKey) {
    return this.isGlobalScopeKey(scopeKey) ||
           this.isDomainScopeKey(scopeKey) ||
           this.isSiteScopeKey(scopeKey);
};

/******************************************************************************/

// Of course this doesn't make sense as there is always a global scope, but
// what makes sense is that we need to remove site and domain scopes for
// global scope to take effect.

HTTPSB.createTemporaryGlobalScope = function(url) {
    var scopeKey;
    scopeKey = this.siteScopeKeyFromURL(url);
    this.removeTemporaryScopeFromScopeKey(scopeKey);
    if ( scopeKey.indexOf('https:') === 0 ) {
        scopeKey = 'http:' + scopeKey.slice(6);
        this.removeTemporaryScopeFromScopeKey(scopeKey);
    }
    scopeKey = this.domainScopeKeyFromURL(url);
    this.removeTemporaryScopeFromScopeKey(scopeKey);
    if ( scopeKey.indexOf('https:') === 0 ) {
        scopeKey = 'http:' + scopeKey.slice(6);
        this.removeTemporaryScopeFromScopeKey(scopeKey);
    }
};

HTTPSB.createPermanentGlobalScope = function(url) {
    var changed = false;
    // Remove potentially occulting domain/site scopes.
    var scopeKey = this.siteScopeKeyFromURL(url);
    if ( this.removePermanentScopeFromScopeKey(scopeKey) ) {
        changed = true;
    }
    if ( scopeKey.indexOf('https:') === 0 ) {
        scopeKey = 'http:' + scopeKey.slice(6);
        if ( this.removeTemporaryScopeFromScopeKey(scopeKey) ) {
            changed = true;
        }
    }
    scopeKey = this.domainScopeKeyFromURL(url);
    if ( this.removePermanentScopeFromScopeKey(scopeKey) ) {
        changed = true;
    }
    if ( scopeKey.indexOf('https:') === 0 ) {
        scopeKey = 'http:' + scopeKey.slice(6);
        if ( this.removeTemporaryScopeFromScopeKey(scopeKey) ) {
            changed = true;
        }
    }
    if ( changed ) {
        this.savePermissions();
    }
    return changed;
};

/******************************************************************************/

HTTPSB.createTemporaryDomainScope = function(url) {
    // Already created?
    var scopeKey = this.domainScopeKeyFromURL(url);
    var scope = this.temporaryScopes.scopes[scopeKey];
    if ( !scope ) {
        scope = new PermissionScope();
        scope.whitelist('main_frame', '*');
        this.temporaryScopes.scopes[scopeKey] = scope;
        this.copyRulesTemporarily(scopeKey, this.globalScopeKey(), url);
    } else if ( scope.off ) {
        scope.off = false;
    }

    // Remove potentially occulting site scope.
    scopeKey = this.siteScopeKeyFromURL(url);
    this.removeTemporaryScopeFromScopeKey(scopeKey);
    if ( scopeKey.indexOf('https:') === 0 ) {
        scopeKey = 'http:' + scopeKey.slice(6);
        this.removeTemporaryScopeFromScopeKey(scopeKey);
    }
};

HTTPSB.createPermanentDomainScope = function(url) {
    var changed = false;
    var scopeKey = this.domainScopeKeyFromURL(url);
    var scope = this.permanentScopes.scopes[scopeKey];
    if ( !scope ) {
        scope = new PermissionScope();
        scope.whitelist('main_frame', '*');
        this.permanentScopes.scopes[scopeKey] = scope;
        changed = true;
    }

    // Remove potentially existing site scope: it would occlude domain scope.
    scopeKey = this.siteScopeKeyFromURL(url);
    if ( this.removePermanentScopeFromScopeKey(scopeKey) ) {
        changed = true;
    }
    if ( scopeKey.indexOf('https:') === 0 ) {
        scopeKey = 'http:' + scopeKey.slice(6);
        if ( this.removeTemporaryScopeFromScopeKey(scopeKey) ) {
            changed = true;
        }
    }

    if ( changed ) {
        this.savePermissions();
    }
    return changed;
};

/******************************************************************************/

HTTPSB.createTemporarySiteScope = function(url) {
    // Already created?
    var scopeKey = this.siteScopeKeyFromURL(url);
    var scope = this.temporaryScopes.scopes[scopeKey];
    if ( !scope ) {
        scope = new PermissionScope();
        scope.whitelist('main_frame', '*');
        this.temporaryScopes.scopes[scopeKey] = scope;
        this.copyRulesTemporarily(scopeKey, this.globalScopeKey(), url);
        this.copyRulesTemporarily(scopeKey, this.domainScopeKeyFromURL(url), url);
    } else {
        scope.off = false;
    }
};

HTTPSB.createPermanentSiteScope = function(url) {
    var scopeKey = this.siteScopeKeyFromURL(url);
    var scope = this.permanentScopes.scopes[scopeKey];
    if ( scope ) {
        return false;
    }
    scope = new PermissionScope();
    scope.whitelist('main_frame', '*');
    this.permanentScopes.scopes[scopeKey] = scope;
    this.savePermissions();
    return true;
};

/******************************************************************************/

HTTPSB.createTemporaryScopeFromScopeKey = function(scopeKey, empty) {
    var scope = this.temporaryScopes.scopes[scopeKey];
    if ( !scope ) {
        scope = new PermissionScope();
        scope.whitelist('main_frame', '*');
        this.temporaryScopes.scopes[scopeKey] = scope;
    } else if ( scope.off ) {
        scope.off = false;
    }
    return scope;
};

/******************************************************************************/

HTTPSB.removeTemporaryScopeFromScopeKey = function(scopeKey) {
    if ( scopeKey === '*' ) {
        return null;
    }
    var scope = this.temporaryScopes.scopes[scopeKey];
    if ( scope ) {
        scope.off = true;
    }
    return scope;
};

HTTPSB.removePermanentScopeFromScopeKey = function(scopeKey, persist) {
    // Can't remove global scope
    if ( scopeKey === '*' ) {
        return null;
    }
    var pscope = this.permanentScopes.scopes[scopeKey];
    if ( pscope ) {
        delete this.permanentScopes.scopes[scopeKey];
        if ( persist ) {
            this.savePermissions();
        }
    }
    return pscope;
};

/******************************************************************************/

HTTPSB.temporaryScopeKeyFromPageURL = function(url) {
    return this.temporaryScopes.scopeKeyFromPageURL(url);
};

HTTPSB.permanentScopeKeyFromPageURL = function(url) {
    return this.permanentScopes.scopeKeyFromPageURL(url);
};

/******************************************************************************/

HTTPSB.evaluate = function(src, type, hostname) {
    // rhill 2013-12-03: When HTTPSB is disengaged, all requests are
    // considered being "allowed temporarily".
    if ( this.off ) {
        return 'gpt';
    }
    return this.temporaryScopes.evaluate(
        this.temporaryScopes.scopeKeyFromPageURL(src),
        type,
        hostname);
};

HTTPSB.evaluateFromScopeKey = function(scopeKey, type, hostname) {
    // rhill 2013-12-03: When HTTPSB is disengaged, all requests are
    // considered being "allowed temporarily".
    if ( this.off ) {
        return 'gpt';
    }
    return this.temporaryScopes.evaluate(scopeKey, type, hostname);
};

/******************************************************************************/

HTTPSB.transposeType = function(type, url) {
    if ( type === 'other' ) {
        var path = uriTools.uri(url).path();
        var pos = path.lastIndexOf('.');
        if ( pos > 0 && path.slice(pos+1).search(/^eot|ttf|otf|svg|woff$/i) === 0 ) {
            return 'stylesheet';
        }
    }
    return type;
};

/******************************************************************************/

HTTPSB.addRuleTemporarily = function(scopeKey, list, type, hostname) {
    this.temporaryScopes.addRule(scopeKey, list, type, hostname);
};

HTTPSB.removeRuleTemporarily = function(scopeKey, list, type, hostname) {
    this.temporaryScopes.removeRule(scopeKey, list, type, hostname);
};

/******************************************************************************/

HTTPSB.autoCreateTemporarySiteScope = function(pageURL) {
    // Do not auto-create a site-level scope if a scope already present.
    var scopeKey = this.temporaryScopeKeyFromPageURL(pageURL);
    if ( !this.isGlobalScopeKey(scopeKey) ) {
        return;
    }
    // Do not auto-create a site-level scope if there is a whitelist rule
    // for the domain or hostname of the pageURL
    var pageDomain = uriTools.domainFromURI(pageURL);
    var pageDomainLen = pageDomain.length;
    var scope = this.temporaryScopes.scopes['*'];
    var rules = scope.white.list;
    var hostname, pos;
    for ( var rule in rules ) {
        if ( !rules.hasOwnProperty(rule) ) {
            continue;
        }
        hostname = rule.slice(rule.indexOf('|') + 1);
        pos = hostname.indexOf(pageDomain);
        if ( pos >= 0 && pos === (hostname.length - pageDomainLen) ) {
            return;
        }
    }
    // If we reach this point, it makes sense to auto-create a
    // site-level scope.
    this.createTemporarySiteScope(pageURL);
};

/******************************************************************************/

// Copy rules from another scope. If a pageURL is provided,
// it will be used to filter the rules according to the hostname.

HTTPSB.copyRulesTemporarily = function(toScopeKey, fromScopeKey, pageURL) {
    var toScope = this.temporaryScopes.scopes[toScopeKey];
    var fromScope = this.temporaryScopes.scopes[fromScopeKey];
    if ( !toScope || !fromScope ) {
        return;
    }
    var ut = uriTools;
    var pageStats = pageStatsFromPageUrl(pageURL);
    var hostnames = pageStats ? pageStats.domains : {};
    var domains = {};
    for ( var hostname in hostnames ) {
        if ( !hostnames.hasOwnProperty(hostname) ) {
            continue;
        }
        domains[ut.domainFromHostname(hostname)] = true;
    }
    var whitelist = fromScope.white.list;
    var pos, ruleHostname;
    for ( var ruleKey in whitelist ) {
        if ( !whitelist.hasOwnProperty(ruleKey) ) {
            continue;
        }
        pos = ruleKey.indexOf('|');
        ruleHostname = ruleKey.slice(pos + 1);
        if ( ruleHostname !== '*' && !domains[ut.domainFromHostname(ruleHostname)] ) {
            continue;
        }
        toScope.white.addOne(ruleKey);
    }
    toScope.black.fromList(fromScope.black);
    toScope.gray.fromList(fromScope.gray);
};

/******************************************************************************/

// Whitelist something

HTTPSB.whitelistTemporarily = function(scopeKey, type, hostname) {
    this.temporaryScopes.whitelist(scopeKey, type, hostname);
};

HTTPSB.whitelistPermanently = function(scopeKey, type, hostname) {
    if ( this.permanentScopes.whitelist(scopeKey, type, hostname) ) {
        this.savePermissions();
    }
};

HTTPSB.autoWhitelistTemporarilyPageDomain = function(pageURL) {
    var scopeKey = this.temporaryScopeKeyFromPageURL(pageURL);
    var domain = uriTools.domainFromURI(pageURL);
    // 'rp' as in 'red pale', i.e. graylisted-blocked:
    // Autowhitelist only if the domain is graylisted and blocked.
    if ( this.evaluateFromScopeKey(scopeKey, '*', domain).indexOf('rp') === 0 ) {
        // console.log('autoWhitelistTemporarilyPageDomain()> "%s"', pageURL);
        this.whitelistTemporarily(scopeKey, '*', domain);
        return true;
    }
    return false;
};

/******************************************************************************/

// Blacklist something

HTTPSB.blacklistTemporarily = function(scopeKey, type, hostname) {
    this.temporaryScopes.blacklist(scopeKey, type, hostname);
};

HTTPSB.blacklistPermanently = function(scopeKey, type, hostname) {
    if ( this.permanentScopes.blacklist(scopeKey, type, hostname) ) {
        this.savePermissions();
    }
};

/******************************************************************************/

// Remove something from both black and white lists.

// If key is [specific hostname]/[any type], remove also any existing
// auto-blacklisted types for the specific hostname.

HTTPSB.graylistTemporarily = function(scopeKey, type, hostname) {
    this.temporaryScopes.graylist(scopeKey, type, hostname);
};

HTTPSB.graylistPermanently = function(scopeKey, type, hostname) {
    if ( this.permanentScopes.graylist(scopeKey, type, hostname) ) {
        // console.log('HTTP Switchboard > permanent graylisting %s from %s', type, hostname);
        this.savePermissions();
    }
};

/******************************************************************************/

// Apply a set of rules

HTTPSB.applyRulesetPermanently = function(scopeKey, rules) {
    if ( this.permanentScopes.applyRuleset(scopeKey, rules) ) {
        this.savePermissions();
    }
};

/******************************************************************************/

// check whether something is blacklisted
HTTPSB.blacklisted = function(src, type, hostname) {
    return this.evaluate(src, type, hostname).charAt(0) === 'r';
};

HTTPSB.blacklistedFromScopeKey = function(scopeKey, type, hostname) {
    return this.evaluateFromScopeKey(scopeKey, type, hostname).charAt(0) === 'r';
};

// check whether something is whitelisted
HTTPSB.whitelisted = function(src, type, hostname) {
    return this.evaluate(src, type, hostname).charAt(0) === 'g';
};

HTTPSB.whitelistedFromScopeKey = function(scopeKey, type, hostname) {
    return this.evaluateFromScopeKey(scopeKey, type, hostname).charAt(0) === 'g';
};

/******************************************************************************/

HTTPSB.getTemporaryColor = function(scopeKey, type, hostname) {
    // console.debug('HTTP Switchboard > getTemporaryColor(%s, %s, %s) = %s', src, type, hostname, evaluate(src, type, hostname));
    // rhill 2013-12-03: When HTTPSB is disengaged, all requests are
    // considered being "allowed temporarily".
    if ( this.off ) {
        return 'gpt';
    }
    return this.temporaryScopes.evaluate(scopeKey, type, hostname);
};

HTTPSB.getPermanentColor = function(scopeKey, type, hostname) {
    var scope = this.permanentScopes.scopes[scopeKey];
    if ( scope ) {
        var key = type + '|' + hostname;
        if ( scope.white.list[key] ) {
            return 'gdp';
        }
        if ( scope.black.list[key] ) {
            return 'rdp';
        }
        if ( type !== '*' || scope.gray.list[key] ) {
            return 'xxx';
        }
    }
    if ( type === '*' && this.blacklistReadonly[hostname] ) {
        return 'rdp';
    }
    return 'xxx';
};

/******************************************************************************/

// Commit temporary permissions.

HTTPSB.commitPermissions = function(persist) {
    this.permanentScopes.assign(this.temporaryScopes);
    if ( persist ) {
        this.savePermissions();
    }
};

/******************************************************************************/

// Reset permission lists to their default state.

HTTPSB.revertPermissions = function() {
    this.temporaryScopes.assign(this.permanentScopes);
};

/******************************************************************************/

// save white/blacklist
HTTPSB.savePermissions = function() {
    var bin = {
        'name': this.manifest.name,
        'version': this.manifest.version,
        // version < 0.1.3
        // whitelist: this.whitelistUser,
        // blacklist: this.blacklistUser

        // version < 0.5.0
        // 'whitelist': this.whitelistUser.toString(),
        // 'blacklist': this.blacklistUser.toString(),
        // 'graylist': this.graylistUser.toString(),

        // version = 0.5.0
        'scopes': this.permanentScopes.toString()
    };
    // console.debug('HTTP Switchboard > HTTPSB.savePermissions(): persisting %o', bin);
    chrome.storage.local.set(bin, function() {
        if ( chrome.runtime.lastError ) {
            console.error('HTTP Switchboard > saved permissions: %s', chrome.runtime.lastError.message());
        }
        chrome.storage.local.getBytesInUse('scopes', function(bytesInUse) {
            // console.log('HTTP Switchboard > saved permissions: %d bytes used', bytesInUse);
        });
        // Remove pre-v0.5.0 obsolete entries
        // TODO: Can be removed once everybody is using v0.5.0 or above
        chrome.storage.local.remove(['whitelist','blacklist','graylist']);
    });
};

/******************************************************************************/

HTTPSB.turnOff = function() {
    this.off = true;
    // rhill 2013-12-07:
    // Relinquish control over javascript execution to the user.
    //   https://github.com/gorhill/httpswitchboard/issues/74
    chrome.contentSettings.javascript.clear({});
};

HTTPSB.turnOn = function() {
    chrome.contentSettings.javascript.clear({});

    // rhill 2013-12-07:
    // Tell Chromium to all javascript: HTTPSB will control whether
    // javascript execute through `Content-Policy-Directive` and webRequest.
    //   https://github.com/gorhill/httpswitchboard/issues/74
    chrome.contentSettings.javascript.set({
        primaryPattern: 'https://*/*',
        setting: 'allow'
    });
    chrome.contentSettings.javascript.set({
        primaryPattern: 'http://*/*',
        setting: 'allow'
    });

    this.off = false;
};
