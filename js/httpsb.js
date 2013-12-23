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

HTTPSB.createPageScopeIfNotExists = function(url) {
    if ( url && url === '*' ) {
        return true;
    }
    if ( !url ) {
        return false;
    }
    url = uriTools.rootURLFromURI(url);
    var tscope = this.temporaryScopes.scopes[url];
    var pscope = this.permanentScopes.scopes[url];
    if ( !tscope !== !pscope ) {
        throw 'HTTP Switchboard.createPageScopeIfNotExists(): corrupted internal state';
    }
    // Skip everything if scopes exist and are switched on
    if ( tscope && !tscope.off && pscope && !pscope.off ) {
        return false;
    }
    // Create temporary scope or switch it on
    if ( !tscope ) {
        tscope = new PermissionScope();
        tscope.whitelist('main_frame', '*');
        tscope.whitelist('stylesheet', '*');
        tscope.whitelist('image', '*');
        this.temporaryScopes.scopes[url] = tscope;
    } else {
        tscope.off = false;
    }
    // Create permanent scope or switch it on
    if ( !pscope ) {
        pscope = new PermissionScope();
        pscope.whitelist('main_frame', '*');
        pscope.whitelist('stylesheet', '*');
        pscope.whitelist('image', '*');
        this.permanentScopes.scopes[url] = pscope;
    } else {
        pscope.off = false;
    }

    // Page-scoped permissions are always persisted, so that the
    // entry is present, in order to be sure at least '*|main_frame' is
    // persisted.
    this.savePermissions();    

    return true;
};

/******************************************************************************/

HTTPSB.destroyPageScopeIfExists = function(url) {
    if ( !url || url === '*' ) {
        return false;
    }
    url = uriTools.rootURLFromURI(url);
    var tscope = this.temporaryScopes.scopes[url];
    var pscope = this.permanentScopes.scopes[url];
    if ( !tscope !== !pscope ) {
        throw 'HTTP Switchboard.destroyPageScopeIfExists(): corrupted internal state';
    }
    if ( !tscope && !pscope ) {
        return false;
    }
    if ( tscope.off && pscope.off ) {
        return false;
    }
    tscope.off = true;
    pscope.off = true;

    // Flush out the page permissions from storage.
    this.savePermissions();

    return true;
};

/******************************************************************************/

HTTPSB.scopePageExists = function(url) {
    if ( !url ) {
        return false;
    }
    // Global scope always exists
    if ( url === '*' ) {
        return true;
    }
    url = uriTools.rootURLFromURI(url);
    var tscope = this.temporaryScopes.scopes[url];
    var pscope = this.permanentScopes.scopes[url];
    if ( !tscope !== !pscope ) {
        throw 'HTTP Switchboard.scopePageExists(): corrupted internal state';
    }
    return tscope && !tscope.off && pscope && !pscope.off;
};

/******************************************************************************/

HTTPSB.globalScopeKey = function() {
    return '*';
};

HTTPSB.siteScopeKeyFromURL = function(url) {
    return uriTools.rootURLFromURI(url);
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
}

/******************************************************************************/

// Of course this doesn't make sense as there is always a global scope, but
// what makes sense is that we need to remove site and domain scopes for
// global scope to take effect.

HTTPSB.createTemporaryGlobalScope = function(url) {
    var scopeKey, scope;
    scopeKey = this.siteScopeKeyFromURL(url);
    scope = this.removeTemporaryScope(scopeKey);
    if ( scope ) {
        this.temporaryScopeJunkyard[scopeKey] = scope;
    }
    scopeKey = this.domainScopeKeyFromURL(url);
    scope = this.removeTemporaryScope(scopeKey);
    if ( scope ) {
        this.temporaryScopeJunkyard[scopeKey] = scope;
    }
};

HTTPSB.createPermanentGlobalScope = function(url) {
    var changed = false;
    // Remove potentially occulting domain/site scopes.
    var scopeKey = this.siteScopeKeyFromURL(url);
    var scope = this.removePermanentScope(scopeKey);
    if ( scope ) {
        changed = true;
    }
    scopeKey = this.domainScopeKeyFromURL(url);
    scope = this.removePermanentScope(scopeKey);
    if ( scope ) {
        changed = true;
    }
    if ( changed ) {
        this.savePermissions();
    }
    return changed;
};

/******************************************************************************/

HTTPSB.createTemporaryDomainScope = function(url) {
    var scopeKey, scope;

    // Already created?
    scopeKey = this.domainScopeKeyFromURL(url);
    if ( !this.temporaryScopes.scopes[scopeKey] ) {
        // See if there is a match in junkyard
        scope = this.temporaryScopeJunkyard[scopeKey];
        if ( !scope ) {
            scope = new PermissionScope();
            scope.whitelist('main_frame', '*');
        } else {
            delete this.temporaryScopeJunkyard[scopeKey];
        }
        this.temporaryScopes.scopes[scopeKey] = scope;
    }

    // Remove potentially occulting site scope.
    scopeKey = this.siteScopeKeyFromURL(url);
    scope = this.removeTemporaryScope(scopeKey);
    if ( scope ) {
        this.temporaryScopeJunkyard[scopeKey] = scope;
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
    scope = this.removePermanentScope(scopeKey);
    if ( scope ) {
        changed = true;
    }

    if ( changed ) {
        this.savePermissions();
    }
    return changed;
};

/******************************************************************************/

HTTPSB.createTemporarySiteScope = function(url) {
    var scopeKey, scope;

    // Already created?
    scopeKey = this.siteScopeKeyFromURL(url);
    if ( this.temporaryScopes.scopes[scopeKey] ) {
        return false;
    }

    // See if there is a match in junkyard
    scope = this.temporaryScopeJunkyard[scopeKey];
    if ( !scope ) {
        scope = new PermissionScope();
        scope.whitelist('main_frame', '*');
    } else {
        delete this.temporaryScopeJunkyard[scopeKey];
    }
    this.temporaryScopes.scopes[scopeKey] = scope;
    return true;
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

HTTPSB.removeTemporaryScope = function(scopeKey) {
    var scope = this.temporaryScopes.scopes[scopeKey];
    if ( scope ) {
        delete this.temporaryScopes.scopes[scopeKey];
    }
    return scope;
};

HTTPSB.removePermanentScope = function(scopeKey) {
    var scope = this.permanentScopes.scopes[scopeKey];
    if ( scope ) {
        delete this.permanentScopes.scopes[scopeKey];
    }
    return scope;
};

/******************************************************************************/

HTTPSB.removePermanentScope = function(scopeKey) {
    var scope = this.permanentScopes.scopes[scopeKey];
    if ( !scope ) {
        return null;
    }
    delete this.permanentScopes.scopes[scopeKey];
    return scope;
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

// Whitelist something

HTTPSB.whitelistTemporarily = function(scopeKey, type, hostname) {
    this.temporaryScopes.whitelist(scopeKey, type, hostname);
};

HTTPSB.whitelistPermanently = function(scopeKey, type, hostname) {
    if ( this.permanentScopes.whitelist(scopeKey, type, hostname) ) {
        this.savePermissions();
    }
};

HTTPSB.autoWhitelistTemporarilyPageDomain = function(pageURL, pageHostname) {
    if ( this.userSettings.autoWhitelistPageDomain ) {
        var scopeKey = this.temporaryScopeKeyFromPageURL(pageURL);
        var domain = uriTools.domainFromHostname(pageHostname);
        // 'p' as in 'pale' (green or red), i.e. graylisted
        if ( this.evaluateFromScopeKey(scopeKey, '*', domain).charAt(1) === 'p' ) {
            this.whitelistTemporarily(scopeKey, '*', domain);
        }
    }
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
