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

HTTPSB.temporaryScopes = new PermissionScopes(HTTPSB);
HTTPSB.permanentScopes = new PermissionScopes(HTTPSB);

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
        tscope = new PermissionScope(this);
        tscope.whitelist('main_frame', '*');
        tscope.whitelist('image', '*');
        this.temporaryScopes.scopes[url] = tscope;
    } else {
        tscope.off = false;
    }
    // Create permanent scope or switch it on
    if ( !pscope ) {
        pscope = new PermissionScope(this);
        pscope.whitelist('main_frame', '*');
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

HTTPSB.evaluate = function(src, type, hostname) {
    // rhill 2013-12-03: When HTTPSB is disengaged, all requests are
    // considered being "allowed temporarily".
    if ( this.off ) {
        return 'gpt';
    }
    return this.temporaryScopes.evaluate(src, type, hostname);
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
}

/******************************************************************************/

// Whitelist something

HTTPSB.whitelistTemporarily = function(src, type, hostname) {
    this.temporaryScopes.whitelist(src, type, hostname);
};

HTTPSB.whitelistPermanently = function(src, type, hostname) {
    if ( this.permanentScopes.whitelist(src, type, hostname) ) {
        this.savePermissions();
    }
};

/******************************************************************************/

// Blacklist something

HTTPSB.blacklistTemporarily = function(src, type, hostname) {
    this.temporaryScopes.blacklist(src, type, hostname);
};

HTTPSB.blacklistPermanently = function(src, type, hostname) {
    if ( this.permanentScopes.blacklist(src, type, hostname) ) {
        this.savePermissions();
    }
};

/******************************************************************************/

// Remove something from both black and white lists.

// If key is [specific hostname]/[any type], remove also any existing
// auto-blacklisted types for the specific hostname.

HTTPSB.graylistTemporarily = function(src, type, hostname) {
    this.temporaryScopes.graylist(src, type, hostname);
};

HTTPSB.graylistPermanently = function(src, type, hostname) {
    if ( this.permanentScopes.graylist(src, type, hostname) ) {
        // console.log('HTTP Switchboard > permanent graylisting %s from %s', type, hostname);
        this.savePermissions();
    }
};

/******************************************************************************/

// check whether something is blacklisted
HTTPSB.blacklisted = function(src, type, hostname) {
    return this.evaluate(src, type, hostname).charAt(0) === 'r';
};

// check whether something is whitelisted
HTTPSB.whitelisted = function(src, type, hostname) {
    return this.evaluate(src, type, hostname).charAt(0) === 'g';
};

/******************************************************************************/

HTTPSB.getTemporaryColor = function(src, type, hostname) {
    // console.debug('HTTP Switchboard > getTemporaryColor(%s, %s, %s) = %s', src, type, hostname, evaluate(src, type, hostname));
    return this.evaluate(src, type, hostname);
};

/******************************************************************************/

HTTPSB.getPermanentColor = function(src, type, hostname) {
    var key = type + '|' + hostname;
    var scope = this.permanentScopes.scopeFromURL(src);
    if ( !scope || scope.off ) {
        scope = this.permanentScopes.scopes['*'];
    }
    if ( scope.white.list[key] ) {
        return 'gdp';
    }
    if ( scope.black.list[key] ) {
        return 'rdp';
    }
    // rhill 2013-10-13: optimization: if type is not '*', hostname is not
    // in the remote blacklists.
    if ( type !== '*' ) {
        return 'xxx';
    }
    // rhill 2013-11-07: if in the graylist, this means a read-only blacklist
    // entry is occulted.
    if ( scope.gray.list[key] ) {
        return 'xxx';
    }
    // console.debug('this.blacklistReadonly[%s] = %o', hostname, this.blacklistReadonly[hostname]);
    if ( this.blacklistReadonly[hostname] ) {
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
            // console.log('HTTP Switchboard > saved permissions: %s', chrome.runtime.lastError.message());
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
}

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
}
