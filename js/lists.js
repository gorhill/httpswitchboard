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

// whitelist something
function allow(type, domain) {
    var httpsb = HTTPSB;
    var key = type + "/" + domain;
    var whitelisted = !httpsb.whitelist[key]
    var unblacklisted = httpsb.blacklist[key];
    if ( whitelisted ) {
        httpsb.whitelist[key] = true;
        httpsb.whitelistUser[key] = true;
    }
    if ( unblacklisted ) {
        delete httpsb.blacklist[key];
        // TODO: handle case where user override third-party blacklists
        delete httpsb.blacklistUser[key];
    }
    // console.log('HTTP Switchboard > whitelisting %s from %s', type, domain);
    if ( whitelisted || unblacklisted ) {
        save();
    }
}

/******************************************************************************/

// blacklist something
function disallow(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    var unwhitelisted = httpsb.whitelist[key]
    var blacklisted = !httpsb.blacklist[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelist[key];
        delete httpsb.whitelistUser[key];
    }
    if ( blacklisted ) {
        httpsb.blacklist[key] = true;
        httpsb.blacklistUser[key] = true;
    }
    // console.log('HTTP Switchboard > blacklisting %s from %s', type, domain);
    if ( unwhitelisted || blacklisted ) {
        save();
    }
}

/******************************************************************************/

// remove something from both black and white lists
function graylist(type, domain) {
    var httpsb = HTTPSB;
    var key = type + '/' + domain;
    // special case: master switch cannot be gray listed
    if ( key === '*/*' ) {
        return;
    }
    var unwhitelisted = httpsb.whitelist[key]
    var unblacklisted = httpsb.blacklist[key];
    if ( unwhitelisted ) {
        delete httpsb.whitelist[key];
        delete httpsb.whitelistUser[key];
    }
    if ( unblacklisted ) {
        delete httpsb.blacklist[key];
        delete httpsb.blacklistUser[key];
    }
    // console.log('HTTP Switchboard > graylisting %s from %s', type, domain);
    if ( unwhitelisted || unblacklisted ) {
        save();
    }
}

/******************************************************************************/

// check whether something is white or black listed, direct or indirectly
function evaluate(type, domain) {
    var httpsb = HTTPSB;
    var key, ancestor;
    if ( type !== '*' && domain !== '*' ) {
        // direct: specific type, specific domain
        key = type + "/" + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, specific domain
        key = "*/" + domain;
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_INDIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        // indirect: ancestor domain nodes
        ancestor = domain;
        while ( ancestor ) {
            key = type + "/" + ancestor;
            // specific type, specific ancestor
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            // any type, specific ancestor
            key = "*/" + ancestor;
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            ancestor = getParentDomainFromDomain(ancestor);
        }
        // indirect: specific type, any domain
        key = type + "/*";
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
        key = "*/" + domain;
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
            key = "*/" + ancestor;
            if ( httpsb.blacklist[key] ) {
                return httpsb.DISALLOWED_INDIRECT;
            }
            if ( httpsb.whitelist[key] ) {
                return httpsb.ALLOWED_INDIRECT;
            }
            ancestor = getParentDomainFromDomain(ancestor);
        }
        // indirect: any type, any domain
        if ( httpsb.whitelist["*/*"] ) {
            return httpsb.ALLOWED_INDIRECT;
        }
        return httpsb.DISALLOWED_INDIRECT;
    } else if ( type !== '*' && domain === '*' ) {
        // indirect: specific type, any domain
        key = type + "/*";
        if ( httpsb.blacklist[key] ) {
            return httpsb.DISALLOWED_DIRECT;
        }
        if ( httpsb.whitelist[key] ) {
            return httpsb.ALLOWED_DIRECT;
        }
        // indirect: any type, any domain
        if ( httpsb.whitelist["*/*"] ) {
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

