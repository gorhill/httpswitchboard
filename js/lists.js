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
    httpsb.whitelist[key] = true;
    delete httpsb.blacklist[key];
    delete httpsb.graylist[key];
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
    delete httpsb.whitelist[key];
    httpsb.blacklist[key] = true;
    delete httpsb.graylist[key];
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
    delete httpsb.whitelist[key];
    delete httpsb.blacklist[key];

    // rhill 2013-10-25: special case, we expressly graylist only if the
    // key is '*' and hostname is found in read-only blacklist, so that the
    // express graylisting occults the read-only blacklist status.
    if ( type === '*' && httpsb.blacklistReadonly[hostname] ) {
        httpsb.graylist[key] = true;
    } else {
        delete httpsb.graylist[key]; // just in case...
    }
}

function graylistPermanently(type, hostname) {
    var httpsb = HTTPSB;
    var key = type + '/' + hostname;
    var unwhitelisted = httpsb.whitelistUser[key];
    var unblacklisted = httpsb.blacklistUser[key];
    var graylisted = type === '*' && httpsb.blacklistReadonly[hostname] && !httpsb.graylistUser[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelistUser[key];
    }
    if ( unblacklisted ) {
        delete httpsb.blacklistUser[key];
    }
    if ( graylisted ) {
        // httpsb.graylistUser[key] = true;
    }
    if ( unwhitelisted || unblacklisted /*|| graylisted*/ ) {
    // console.log('HTTP Switchboard > permanent graylisting %s from %s', type, hostname);
        save();
    }
}

/******************************************************************************/

// Reset lists to their default state.

function restoreTemporaryLists() {
    var httpsb = HTTPSB;
    httpsb.whitelist = {};
    httpsb.blacklist = {};
    httpsb.graylist = {};
    populateListFromList(httpsb.whitelist, httpsb.whitelistUser);
    populateListFromList(httpsb.blacklist, httpsb.blacklistUser);
}

/******************************************************************************/

// Check whether something is white or blacklisted, direct or indirectly.
//
// Levels of evaluations (3 distinct algorithms):
//   while hostname !== empty:
//     type/hostname
//     */hostname
//     hostname = parent hostname
//   type/*
//   */*
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
// It is a naturally recursive function, but we unwind it completely here
// because it is a core function, used in  time critical part of the
// code, and we gain by making local references to global variables, which
// is better if done once, which would happen for each recursive call
// otherwise.

function evaluate(type, hostname) {
    var httpsb = HTTPSB;
    var blacklist = httpsb.blacklist;
    var whitelist = httpsb.whitelist;
    var graylist = httpsb.graylist;
    var blacklistReadonly = httpsb.blacklistReadonly;
    var typeKey;
    var cellKey, parent;

    // Pick proper entry point

    if ( type !== '*' && hostname !== '*' ) {
        // https://github.com/gorhill/httpswitchboard/issues/29
        typeKey = type + '/*';

        // direct: specific type, specific hostname
        cellKey = type + '/' + hostname;
        if ( blacklist[cellKey] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( whitelist[cellKey] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, specific hostname
        cellKey = '*/' + hostname;
        if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[hostname]) ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( whitelist[cellKey] ) {
            // https://github.com/gorhill/httpswitchboard/issues/29
            // The cell is indirectly whitelisted because of hostname, type
            // must nOT be blacklisted.
            if ( httpsb.userSettings.strictBlocking ) {
                return blacklist[typeKey] ? httpsb.DISALLOWED_INDIRECT : httpsb.ALLOWED_INDIRECT;
            }
            return httpsb.ALLOWED_INDIRECT;
        }

        // indirect: parent hostname nodes
        parent = hostname;
        while ( true ) {
            parent = getParentHostnameFromHostname(parent);
            if ( !parent ) {
                break;
            }
            cellKey = type + '/' + parent;
            // specific type, specific parent
            if ( blacklist[cellKey] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( whitelist[cellKey] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            // any type, specific parent
            cellKey = '*/' + parent;
            if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[parent]) ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( whitelist[cellKey] ) {
                // https://github.com/gorhill/httpswitchboard/issues/29
                // The cell is indirectly whitelisted because of hostname, type
                // must nOT be blacklisted.
                if ( httpsb.userSettings.strictBlocking ) {
                    return blacklist[typeKey] ? httpsb.DISALLOWED_INDIRECT : httpsb.ALLOWED_INDIRECT;
                }
                return httpsb.ALLOWED_INDIRECT;
            }
        }
        // indirect: specific type, any hostname
        if ( blacklist[typeKey] ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( whitelist[typeKey] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        // indirect: any type, any hostname
        if ( whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    }
    if ( type === '*' && hostname !== '*' ) {
        // direct: any type, specific hostname
        cellKey = '*/' + hostname;
        if ( whitelist[cellKey] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[hostname]) ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        // indirect: parent hostname nodes
        parent = hostname;
        while ( true ) {
            parent = getParentHostnameFromHostname(parent);
            if ( !parent ) {
                break;
            }
            // any type, specific hostname
            cellKey = '*/' + parent;
            if ( whitelist[cellKey] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            if ( blacklist[cellKey] || (!graylist[cellKey] && blacklistReadonly[parent]) ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
        }
        // indirect: any type, any hostname
        if ( whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    }
    if ( type !== '*' && hostname === '*' ) {
        // indirect: specific type, any hostname
        cellKey = type + '/*';
        if ( whitelist[cellKey] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        if ( blacklist[cellKey] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        // indirect: any type, any hostname
        if ( whitelist['*/*'] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    }
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
    // console.debug('httpsb.blacklistReadonly[%s] = %o', hostname, httpsb.blacklistReadonly[hostname]);
    if ( httpsb.blacklistReadonly[hostname] ) {
        return 'rdp';
    }
    return 'xxx';
}

/******************************************************************************/
