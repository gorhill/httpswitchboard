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

(function() {
    var httpsb = HTTPSB;
    httpsb.temporaryScopes = new PermissionScopes();
    httpsb.permanentScopes = new PermissionScopes();

    // Hard-coded scope to restore out-of-the-box rules
    httpsb.factoryScope = new PermissionScope();
    httpsb.factoryScope.whitelist('main_frame', '*');
    httpsb.factoryScope.whitelist('stylesheet', '*');
    httpsb.factoryScope.whitelist('image', '*');
    httpsb.factoryScope.blacklist('sub_frame', '*');
})();

/******************************************************************************/

HTTPSB.globalScopeKey = function() {
    return '*';
};

HTTPSB.domainScopeKeyFromURL = function(url) {
    if ( url.slice(0, 4) !== 'http' ) {
        return '';
    }
    return this.domainScopeKeyFromHostname(this.URI.hostnameFromURI(url));
};

HTTPSB.domainScopeKeyFromHostname = function(hostname) {
    var domain = this.URI.domainFromHostname(hostname);
    if ( domain === '' ) {
        domain = hostname;
    }
    return '*.' + domain;
};

HTTPSB.siteScopeKeyFromURL = function(url) {
    return this.URI.hostnameFromURI(url);
};

HTTPSB.siteScopeKeyFromHostname = function(hostname) {
    return hostname;
};

/******************************************************************************/

HTTPSB.isGlobalScopeKey = function(scopeKey) {
    return scopeKey === '*';
};

HTTPSB.isDomainScopeKey = function(scopeKey) {
    return scopeKey.indexOf('*.') === 0;
};

HTTPSB.isSiteScopeKey = function(scopeKey) {
    return scopeKey.charAt(0) !== '*';
};

HTTPSB.isValidScopeKey = function(scopeKey) {
    return this.isGlobalScopeKey(scopeKey) ||
           this.isDomainScopeKey(scopeKey) ||
           this.isSiteScopeKey(scopeKey);
};

/******************************************************************************/

HTTPSB.temporaryScopeFromScopeKey = function(scopeKey) {
    var scope = this.temporaryScopes.scopes[scopeKey];
    if ( !scope || scope.off ) {
        return null;
    }
    return scope;
};

HTTPSB.permanentScopeFromScopeKey = function(scopeKey) {
    var scope = this.permanentScopes.scopes[scopeKey];
    if ( !scope || scope.off ) {
        return null;
    }
    return scope;
};

/******************************************************************************/

HTTPSB.temporaryScopeExists = function(scopeKey) {
    return !!this.temporaryScopeFromScopeKey(scopeKey);
};

/******************************************************************************/

// Of course this doesn't make sense as there is always a global scope, but
// what makes sense is that we need to remove site and domain scopes for
// global scope to take effect.

HTTPSB.createTemporaryGlobalScope = function(url) {
    var scopeKey = this.siteScopeKeyFromURL(url);
    this.removeTemporaryScopeFromScopeKey(scopeKey, true);
    scopeKey = this.domainScopeKeyFromURL(url);
    this.removeTemporaryScopeFromScopeKey(scopeKey, true);
};

HTTPSB.createPermanentGlobalScope = function(url) {
    var changed = false;
    // Remove potentially occulting domain/site scopes.
    var scopeKey = this.siteScopeKeyFromURL(url);
    if ( this.removePermanentScopeFromScopeKey(scopeKey) ) {
        changed = true;
    }
    scopeKey = this.domainScopeKeyFromURL(url);
    if ( this.removePermanentScopeFromScopeKey(scopeKey) ) {
        changed = true;
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
        this.copyTemporaryRules(scopeKey, this.globalScopeKey(), url);
    } else if ( scope.off ) {
        scope.off = false;
    }

    // Remove potentially occulting site scope.
    scopeKey = this.siteScopeKeyFromURL(url);
    this.removeTemporaryScopeFromScopeKey(scopeKey, true);
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
        this.copyTemporaryRules(scopeKey, this.globalScopeKey(), url);
        this.copyTemporaryRules(scopeKey, this.domainScopeKeyFromURL(url), url);
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

HTTPSB.createTemporaryScopeFromScopeKey = function(scopeKey) {
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

HTTPSB.removeTemporaryScopeFromScopeKey = function(scopeKey, keepAround) {
    if ( scopeKey === '*' ) {
        return null;
    }
    var scope = this.temporaryScopes.scopes[scopeKey];
    if ( scope ) {
        if ( keepAround ) {
            scope.off = true;
        } else {
            delete this.temporaryScopes.scopes[scopeKey];
        }
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

HTTPSB.revealTemporaryDomainScope = function(domainScopeKey) {
    if ( !this.isDomainScopeKey(domainScopeKey) ) {
        return;
    }
    // Remove '*' prefix
    var keySuffix = domainScopeKey.slice(1);
    var keySuffixLen = keySuffix.length;
    var scopes = this.temporaryScopes.scopes;
    var pos;
    for ( var scopeKey in scopes ) {
        if ( !scopes.hasOwnProperty(scopeKey) ) {
            continue;
        }
        if ( scopeKey === domainScopeKey ) {
            continue;
        }
        // Example: '.twitter.com' in scope 'support.twitter.com'?
        pos = scopeKey.lastIndexOf(keySuffix);
        if ( pos < 0 ) {
            // Example: scope 'twitter.com' in '.twitter.com'?
            if ( keySuffix.indexOf(scopeKey) !== 1 ) {
                continue;
            }
        } else if ( pos !== scopeKey.length - keySuffixLen ) {
            continue;
        }
        // Turn off scope
        scopes[scopeKey].off = true;
    }
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

HTTPSB.transposeType = function(type, path) {
    if ( type === 'other' ) {
        var pos = path.lastIndexOf('.');
        if ( pos > 0 ) {
            var ext = path.slice(pos);
            if ( '.eot.ttf.otf.svg.woff'.indexOf(ext) >= 0 ) {
                return 'stylesheet';
            }
            if ( '.ico.png'.indexOf(ext) >= 0 ) {
                return 'image';
            }
        }
    }
    return type;
};

/******************************************************************************/

HTTPSB.addTemporaryRule = function(scopeKey, list, type, hostname) {
    this.temporaryScopes.addRule(scopeKey, list, type, hostname);
};

HTTPSB.removeTemporaryRule = function(scopeKey, list, type, hostname) {
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
    var pageDomain = this.URI.domainFromURI(pageURL);
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

HTTPSB.copyTemporaryRules = function(toScopeKey, fromScopeKey, pageURL) {
    this.copyTemporaryWhiteRules(toScopeKey, fromScopeKey, pageURL);
    this.copyTemporaryGrayRules(toScopeKey, fromScopeKey);
    this.copyTemporaryBlackRules(toScopeKey, fromScopeKey);
};

HTTPSB.copyTemporaryWhiteRules = function(toScopeKey, fromScopeKey, pageURL) {
    var toScope = this.temporaryScopeFromScopeKey(toScopeKey);
    var fromScope = this.temporaryScopeFromScopeKey(fromScopeKey);
    if ( !toScope || !fromScope ) {
        return;
    }
    var httpsburi = this.URI;
    var pageStats = this.pageStatsFromPageUrl(pageURL);
    var hostnames = pageStats ? pageStats.domains : {};
    var domains = {};
    for ( var hostname in hostnames ) {
        if ( !hostnames.hasOwnProperty(hostname) ) {
            continue;
        }
        domains[httpsburi.domainFromHostname(hostname)] = true;
    }
    var whitelist = fromScope.white.list;
    var pos, ruleHostname;
    for ( var ruleKey in whitelist ) {
        if ( !whitelist.hasOwnProperty(ruleKey) ) {
            continue;
        }
        pos = ruleKey.indexOf('|');
        ruleHostname = ruleKey.slice(pos + 1);
        if ( ruleHostname !== '*' && !domains[httpsburi.domainFromHostname(ruleHostname)] ) {
            continue;
        }
        toScope.white.addOne(ruleKey);
    }
};

HTTPSB.copyTemporaryGrayRules = function(toScopeKey, fromScopeKey) {
    var toScope = this.temporaryScopeFromScopeKey(toScopeKey);
    var fromScope = this.temporaryScopeFromScopeKey(fromScopeKey);
    if ( !toScope || !fromScope ) {
        return;
    }
    toScope.gray.fromList(fromScope.gray);
};

HTTPSB.copyTemporaryBlackRules = function(toScopeKey, fromScopeKey) {
    var toScope = this.temporaryScopeFromScopeKey(toScopeKey);
    var fromScope = this.temporaryScopeFromScopeKey(fromScopeKey);
    if ( !toScope || !fromScope ) {
        return;
    }
    toScope.black.fromList(fromScope.black);
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
    var domain = this.URI.domainFromURI(pageURL);
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
    if ( type === '*' ) {
        if ( this.ubiquitousWhitelist.test(hostname) ) {
            return 'gdp';
        }
        if ( this.ubiquitousBlacklist.test(hostname) ) {
            return 'rdp';
        }
    }
    return 'xxx';
};

/******************************************************************************/

HTTPSB.getTemporaryABPFiltering = function(scopeKey) {
    if ( this.off ) {
        return false;
    }
    return this.temporaryScopes.getABPFiltering(scopeKey);
};

HTTPSB.getPermanentABPFiltering = function(scopeKey) {
    return this.permanentScopes.getABPFiltering(scopeKey);
};

HTTPSB.toggleTemporaryABPFiltering = function(scopeKey, state) {
    return this.temporaryScopes.toggleABPFiltering(scopeKey, state);
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

// Reset all rules to their default state.

HTTPSB.revertAllRules = function() {
    this.temporaryScopes.assign(this.permanentScopes);
};

/******************************************************************************/

// Reset all rules to their default state.

HTTPSB.revertScopeRules = function(scopeKey) {
    var tscope = this.temporaryScopeFromScopeKey(scopeKey);
    if ( !tscope ) {
        return;
    }
    var pscope = this.permanentScopeFromScopeKey(scopeKey);
    // If no permanent scope found, use factory settings
    if ( !pscope ) {
        pscope = this.factoryScope;
    }
    tscope.assign(pscope);
};

/******************************************************************************/

HTTPSB.getTemporaryScopeDirtyCount = function(pageURL) {
    var tScopeKey = this.temporaryScopeKeyFromPageURL(pageURL);
    var tscope = this.temporaryScopeFromScopeKey(tScopeKey);
    // This should not happen
    if ( !tscope ) {
        return 0;
    }
    // If there is no matching permanent scope, count is all
    // items in temporary scope
    var pscope = this.permanentScopeFromScopeKey(tScopeKey);
    if ( !pscope ) {
        return tscope.white.count +
               tscope.black.count +
               tscope.gray.count +
               2;  // for new temporary scope and abpFiltering
    }
    // If there is a matching scope, return difference between both
    return tscope.diff(pscope);
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
    // Tell Chromium to allow all javascript: HTTPSB will control whether
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

/******************************************************************************/

HTTPSB.isOpera = function() {
    return navigator.userAgent.indexOf(' OPR/') > 0;
};
