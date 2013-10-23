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
function whitelistTemporarily(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
    var whitelisted = !httpsb.whitelist[key];
    var unblacklisted = httpsb.blacklist[key];
    if ( whitelisted ) {
        httpsb.whitelist[key] = true;
        // console.log('HTTP Switchboard > temporary whitelisting %s from %s', type, hostname);
    }
    if ( unblacklisted ) {
        delete httpsb.blacklist[key];
    }
}

function whitelistPermanently(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
    var whitelisted = !httpsb.whitelistUser[key];
    var unblacklisted = httpsb.blacklistUser[key];
    if ( whitelisted ) {
        httpsb.whitelistUser[key] = true;
    }
    if ( unblacklisted ) {
        delete httpsb.blacklistUser[key];
    }
    if ( whitelisted || unblacklisted ) {
        // console.log('HTTP Switchboard > permanent whitelisting %s from %s', type, hostname);
        save();
    }
}

/******************************************************************************/

// Blacklist something
function blacklistTemporarily(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
    var unwhitelisted = httpsb.whitelist[key];
    var blacklisted = !httpsb.blacklist[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelist[key];
    }
    if ( blacklisted ) {
        httpsb.blacklist[key] = true;
        // console.log('HTTP Switchboard > temporary blacklisting %s from %s', type, hostname);
    }
}

function blacklistPermanently(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
    var unwhitelisted = httpsb.whitelistUser[key];
    var blacklisted = !httpsb.blacklistUser[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelistUser[key];
    }
    if ( blacklisted ) {
        httpsb.blacklistUser[key] = true;
    }
    if ( unwhitelisted || blacklisted ) {
        // console.log('HTTP Switchboard > permanent blacklisting %s from %s', type, hostname);
        save();
    }
}

/******************************************************************************/

// Remove something from both black and white lists.

// If key is [specific hostname]/[any type], remove also any existing
// auto-blacklisted types for the specific hostname.

function graylist(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
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
    // console.log('HTTP Switchboard > temporary graylisting %s from %s', type, hostname);
}

function graylistPermanently(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
    var unwhitelisted = httpsb.whitelistUser[key];
    var unblacklisted = httpsb.blacklistUser[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelistUser[key];
    }
    if ( unblacklisted ) {
        delete httpsb.blacklistUser[key];
    }
    if ( unwhitelisted || unblacklisted ) {
        // console.log('HTTP Switchboard > permanent graylisting %s from %s', type, hostname);
        save();
    }
}

/******************************************************************************/

// Reset lists to their default state.

function restoreTemporaryLists() {
    var httpsb = HTTPSB;
    httpsb.blacklist = {};

    // restore read-only blacklists
    httpsb.blacklistReadonly.toFilters(httpsb.blacklist);

    // Reduce mem usage + avoid noticeable delay for when packing is needed,
    // like when we need to lookup a hostname in the read-only list.
    httpsb.blacklistReadonly.pack();

    // restore user blacklist
    populateListFromList(httpsb.blacklist, httpsb.blacklistUser);

    // rhill 2013-10-19: https://github.com/gorhill/httpswitchboard/issues/18
    // Be sure a hostname doesn't end up in both the effective black and whitelist
    restoreTemporaryWhitelist();
}


// rhill 2013-10-19: https://github.com/gorhill/httpswitchboard/issues/18
// I create a separate function so it can also be called at launch time.
function restoreTemporaryWhitelist() {
    var httpsb = HTTPSB;
    httpsb.whitelist = {};
    var filters = Object.keys(httpsb.whitelistUser);
    var i = filters.length;
    var filter;
    while ( i-- ) {
        filter = filters[i];
        delete httpsb.blacklist[filter];
        httpsb.whitelist[filter] = true;
    }
}

/******************************************************************************/

// check whether something is white or black listed, direct or indirectly
function evaluate(type, hostname) {
    var httpsb = HTTPSB;
    var blacklist = httpsb.blacklist;
    var whitelist = httpsb.whitelist;
    var key, ancestor;
    if ( type !== '*' && hostname !== '*' ) {
        // direct: specific type, specific hostname
        key = type + '/' + hostname;
        if ( blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, specific hostname
        key = '*/' + hostname;
        if ( blacklist[key] ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( whitelist[key] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        // indirect: ancestor hostname nodes
        ancestor = hostname;
        while ( ancestor ) {
            key = type + '/' + ancestor;
            // specific type, specific ancestor
            if ( blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            // any type, specific ancestor
            key = '*/' + ancestor;
            if ( blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            ancestor = getParentHostnameFromHostname(ancestor);
        }
        // indirect: specific type, any hostname
        key = type + '/*';
        if ( blacklist[key] ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( whitelist[key] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        // indirect: any type, any hostname
        if ( whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    } else if ( type === '*' && hostname !== '*' ) {
        // direct: any type, specific hostname
        key = '*/' + hostname;
        if ( blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: ancestor hostname nodes
        ancestor = hostname;
        while ( ancestor ) {
            // any type, specific hostname
            key = '*/' + ancestor;
            if ( blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            ancestor = getParentHostnameFromHostname(ancestor);
        }
        // indirect: any type, any hostname
        if ( whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    } else if ( type !== '*' && hostname === '*' ) {
        // indirect: specific type, any hostname
        key = type + '/*';
        if ( blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, any hostname
        if ( whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    }
    // global default decide
    if ( whitelist['*/*'] ) {
        return httpsb.ALLOWED_DIRECT;
    }
    return httpsb.DISALLOWED_DIRECT;
}

/******************************************************************************/

// check whether something is blacklisted
function blacklisted(type, hostname) {
    var httpsb = HTTPSB;
    var result = evaluate(type, hostname);
    return result === httpsb.DISALLOWED_DIRECT || result === httpsb.DISALLOWED_INDIRECT;
}

// check whether something is whitelisted
function whitelisted(type, hostname) {
    var httpsb = HTTPSB;
    var result = evaluate(type, hostname);
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

function getTemporaryColor(type, hostname) {
    var httpsb = HTTPSB;
    var what = evaluate(type, hostname);
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

function getPermanentColor(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
    if ( httpsb.whitelistUser[key] ) {
        return 'gdp';
    }
    if ( httpsb.blacklistUser[key] ) {
        return 'rdp';
    }
    // rhill 2013-10-13 > optimization: if type is not '*', hostname is not
    // in the remote blacklists.
    if ( type !== '*' ) {
        return 'xxx';
    }

    if ( httpsb.blacklistReadonly.find(hostname) ) {
        return 'rdp';
    }
    return 'xxx';
}

/******************************************************************************/
