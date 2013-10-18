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

// Whitelist something
function allow(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    var whitelisted = !httpsb.whitelist[key];
    var unblacklisted = httpsb.blacklist[key];
    if ( whitelisted ) {
        httpsb.whitelist[key] = true;
        console.log('HTTP Switchboard > temporary whitelisting %s from %s', type, domain);
    }
    if ( unblacklisted ) {
        delete httpsb.blacklist[key];
    }
}

function allowPermanently(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    var whitelisted = !httpsb.whitelistUser[key];
    var unblacklisted = httpsb.blacklistUser[key];
    if ( whitelisted ) {
        httpsb.whitelistUser[key] = true;
    }
    if ( unblacklisted ) {
        delete httpsb.blacklistUser[key];
    }
    if ( whitelisted || unblacklisted ) {
        console.log('HTTP Switchboard > permanent whitelisting %s from %s', type, domain);
        save();
    }
}

/******************************************************************************/

// Blacklist something
function disallow(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    var unwhitelisted = httpsb.whitelist[key];
    var blacklisted = !httpsb.blacklist[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelist[key];
    }
    if ( blacklisted ) {
        httpsb.blacklist[key] = true;
        console.log('HTTP Switchboard > temporary blacklisting %s from %s', type, domain);
    }
}

function disallowPermanently(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    var unwhitelisted = httpsb.whitelistUser[key];
    var blacklisted = !httpsb.blacklistUser[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelistUser[key];
    }
    if ( blacklisted ) {
        httpsb.blacklistUser[key] = true;
    }
    if ( unwhitelisted || blacklisted ) {
        console.log('HTTP Switchboard > permanent blacklisting %s from %s', type, domain);
        save();
    }
}

/******************************************************************************/

// Remove something from both black and white lists.

// If key is [specific domain]/[any type], remove also any existing
// auto-blacklisted types for the specific domain.

function graylist(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    // special case: master switch cannot be gray listed
    if ( key === '*/*' ) {
        return;
    }
    var unwhitelisted = httpsb.whitelist[key];
    var unblacklisted = httpsb.blacklist[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelist[key];
    }
    if ( unblacklisted ) {
        delete httpsb.blacklist[key];
    }
    console.log('HTTP Switchboard > temporary graylisting %s from %s', type, domain);
}

function graylistPermanently(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    var unwhitelisted = httpsb.whitelistUser[key];
    var unblacklisted = httpsb.blacklistUser[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelistUser[key];
    }
    if ( unblacklisted ) {
        delete httpsb.blacklistUser[key];
    }
    if ( unwhitelisted || unblacklisted ) {
        console.log('HTTP Switchboard > permanent graylisting %s from %s', type, domain);
        save();
    }
}

/******************************************************************************/

// Reset lists to their default state.

function resetLists() {
    var httpsb = HTTPSB;
    httpsb.whitelist = {};
    httpsb.blacklist = {};
    populateListFromList(httpsb.whitelist, httpsb.whitelistUser);
    populateListFromList(httpsb.blacklist, httpsb.blacklistUser);
    populateListFromString(httpsb.blacklist, httpsb.blacklistRemote);
}

/******************************************************************************/

// check whether something is white or black listed, direct or indirectly
function evaluate(type, domain) {
    var httpsb = HTTPSB;
    var key, ancestor;
    if ( type !== '*' && domain !== '*' ) {
        // direct: specific type, specific domain
        key = type + '/' + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, specific domain
        key = '*/' + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        // indirect: ancestor domain nodes
        ancestor = domain;
        while ( ancestor ) {
            key = type + '/' + ancestor;
            // specific type, specific ancestor
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            // any type, specific ancestor
            key = '*/' + ancestor;
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            ancestor = getParentDomainFromDomain(ancestor);
        }
        // indirect: specific type, any domain
        key = type + '/*';
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
        key = '*/' + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: ancestor domain nodes
        ancestor = domain;
        while ( ancestor ) {
            // any type, specific domain
            key = '*/' + ancestor;
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            ancestor = getParentDomainFromDomain(ancestor);
        }
        // indirect: any type, any domain
        if ( httpsb.whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    } else if ( type !== '*' && domain === '*' ) {
        // indirect: specific type, any domain
        key = type + '/*';
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, any domain
        if ( httpsb.whitelist['*/*'] ) {
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

function getTemporaryColor(type, domain) {
    var httpsb = HTTPSB;
    var what = evaluate(type, domain);
    if ( what === httpsb.ALLOWED_DIRECT ) {
        return 'gdt';
    }
    if ( what === httpsb.DISALLOWED_DIRECT ) {
        return 'rdt';
    }
    if ( what === httpsb.ALLOWED_INDIRECT ) {
        return 'gpt';
    }
    if ( what === httpsb.DISALLOWED_INDIRECT ) {
        return 'rpt';
    }
    return 'xxx';
}

/******************************************************************************/

function getPermanentColor(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    if ( httpsb.whitelistUser[key] ) {
        return 'gdp';
    }
    if ( httpsb.blacklistUser[key] ) {
        return 'rdp';
    }
    // rhill 2013-10-13 > optimization: if type is not '*', domain is not
    // in the remote blacklists.
    if ( type !== '*' ) {
        return 'xxx';
    }

//    var r = httpsb.blacklistRemote.indexOf('\n' + key + '\n');
    var r = quickIndexOf(httpsb.blacklistRemote, key, '\n');
    if ( r >= 0 ) {
        return 'rdp';
    }
    return 'xxx';
}

