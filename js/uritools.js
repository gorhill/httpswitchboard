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

/*******************************************************************************

 `uriParser` deals *only* with absolute URI.

 RFC 3986 as reference: http://tools.ietf.org/html/rfc3986#appendix-A

*/

/******************************************************************************/

/******************************************************************************/

var uriTools = {

    schemeBit:     (1 << 0),
    userBit:       (1 << 1),
    passwordBit:   (1 << 2),
    hostnameBit:   (1 << 3),
    portBit:       (1 << 4),
    pathBit:       (1 << 5),
    queryBit:      (1 << 6),
    fragmentBit:   (1 << 7),
    allBit:        (0xFFFF),

    /*--------------------------------------------------------------------*/

    //     URI = scheme ":" hier-part [ "?" query ] [ "#" fragment ]
    //
    //       foo://example.com:8042/over/there?name=ferret#nose
    //       \_/   \______________/\_________/ \_________/ \__/
    //        |           |            |            |        |
    //     scheme     authority       path        query   fragment
    //        |   _____________________|__
    //       / \ /                        \
    //       urn:example:animal:ferret:nose


    uri: function(uri) {
        if ( uri === undefined ) {
            return this.toString();
        }

        this.reset();

        var s = typeof uri === 'string' ? uri : '';

        // URI = scheme ":" hier-part [ "?" query ] [ "#" fragment ]
        //                                           ^^^^^^^^^^^^^^
        var pos = s.indexOf('#');
        if ( pos >= 0 ) {
            this._fragment = s.slice(pos + 1);
            s = s.slice(0, pos);
        }

        // URI = scheme ":" hier-part [ "?" query ]
        //                             ^^^^^^^^^^^

        pos = s.indexOf('?');
        if ( pos >= 0 ) {
            this._query = s.slice(pos + 1);
            s = s.slice(0, pos);
        }

        // URI = scheme ":" hier-part
        //       ^^^^^^

        pos = s.indexOf(':');
        if ( pos < 0 ) {
            throw new TypeError('uriParser.uri(): no scheme in "' + uri + '"');
        }
        this._scheme = s.slice(0, pos);
        s = s.slice(pos + 1);

        // URI =            hier-part
        //                  ^^^^^^^^^
        // hier-part = "//" authority path-abempty
        //           / path-absolute
        //           / path-rootless
        //           / path-empty

        pos = s.indexOf('//');

        // URN (no authority)
        if ( pos < 0 ) {
            this._path = s;
            return this;
        }

        // URL
        s = s.slice(pos + 2);
        pos = s.indexOf('/');
        if ( pos < 0 ) {
            // RFC3986 6.2.3.:
            // "In general, a URI that uses the generic syntax
            // for authority with an empty path should be
            // normalized to a path of '/' "
            this._path = '/';
        } else {
            this._path = s.slice(pos);
            s = s.slice(0, pos);
        }
        return this.authority(s);
    },

    /*--------------------------------------------------------------------*/

    scheme: function(scheme) {
        if ( scheme === undefined ) {
            return this._scheme;
        }
        throw 'Not yet implemented';
        return this;
    },

    /*--------------------------------------------------------------------*/

    // authority = [ userinfo "@" ] host [ ":" port ]
    // port      = *DIGIT
    // host      = IP-literal / IPv4address / reg-name

    authority: function(authority) {
        if ( authority === undefined ) {
            return this._hostname;
        }

        var s = authority;

        // HTTPSB ignores completely userinfo

        // authority = [ userinfo "@" ] host [ ":" port ]
        //              ^^^^^^^^^^^^^^

        var pos = s.indexOf('@');
        if ( pos >= 0 ) {
            s = s.slice(0, pos+ 1);
        }

        // authority =                  host [ ":" port ]
        //                                    ^^^^^^^^^^

        // Port for:
        //   IP-literal    = "[" ( IPv6address / IPvFuture  ) "]"
        pos = s.indexOf(']:');
        if ( pos >= 0 ) {
            if ( s.charAt(0) !== '[' ) {
                throw new TypeError('uriParser.authority(): invalid hostname: "' + authority + '"');
            }
            this._port = s.slice(pos + 2);
            s = s.slice(0, pos + 1);
        }

        // Port for other cases:
        //   IPv4address   = dec-octet "." dec-octet "." dec-octet "." dec-octet
        //   reg-name      = *( unreserved / pct-encoded / sub-delims )
        pos = s.indexOf(':');
        if ( pos >= 0 ) {
            this._port = s.slice(pos + 1);
            s = s.slice(0, pos);
        }

        // What is left is the hostname or ip (v4 or v6) address
        return this.hostname(s.toLowerCase());
    },

    /*--------------------------------------------------------------------*/

    fragment: function(fragment) {
        if ( fragment === undefined ) {
            return this._fragment;
        }
        this._fragment = fragment;
        return this;
    },

    /*--------------------------------------------------------------------*/

    hostname: function(hostname) {
        if ( hostname === undefined ) {
            return this._hostname;
        }
        this._hostname = hostname.toLowerCase();
        this._ipv4 = undefined;
        this._ipv6 = undefined;
        return this;
    },

    /*--------------------------------------------------------------------*/

    domain: function(domain) {
        if ( domain !== undefined ) {
            return this.hostname(domain);
        }
        if ( !this._hostname ) {
            return '';
        }
        if ( this._ipv4 === undefined && this._ipv6 === undefined ) {
            this._ipv4 = this.ipv4Regex.test(this._hostname);
            this._ipv6 = this.ipv6Regex.test(this._hostname);
        }
        if ( this._ipv4 || this._ipv6 ) {
            return this._hostname;
        }
        // Definition of `domain`:
        // The hostname with the least number of labels for which cookies can
        // be set.
        // The shortest hostname matching the above definition is determined
        // from the "Public Suffix List" found at:
        // http://publicsuffix.org/list/

        return this;
    },

    /*--------------------------------------------------------------------*/

    // Normalize the way HTTPSB expects it

    normalizeURI: function(uri) {
        // Will be removed:
        // - port
        // - user id/password
        // - fragment
        return this.uri(uri).assemble(this.normalizeBits);
    },

    /*--------------------------------------------------------------------*/

    schemeFromURI: function(uri) {
        return this.uri(uri)._scheme;
    },

    /*--------------------------------------------------------------------*/

    domainFromHostname: function(hostname) {
        if ( this.notAnIPAddressRegex.test(hostname) ) {
            return this._publicSuffixList.getDomain(hostname);
        }
        return hostname;
    },

    /*--------------------------------------------------------------------*/

    hostnameFromURI: function(uri) {
        return this.uri(uri)._hostname;
    },

    /*--------------------------------------------------------------------*/

    domainFromURI: function(uri) {
        if ( !uri ) {
            return '';
        }
        return this.domainFromHostname(this.hostnameFromURI(uri));
    },

    /*--------------------------------------------------------------------*/

    rootURLFromURI: function(uri) {
        this.uri(uri);
        if ( !this._hostname ) {
            return '';
        }
        return this.assemble(this.schemeBit | this.hostnameBit);
    },

    /*--------------------------------------------------------------------*/

    isValidHostname: function(hostname) {
        var r;
        try {
            r = this.validHostnameRegex.test(hostname);
        }
        catch (e) {
            return false;
        }
        return r;
    },

    /*--------------------------------------------------------------------*/

    isValidRootURL: function(uri) {
        return !!uri && uri === this.rootURLFromURI(uri);
    },

    /*--------------------------------------------------------------------*/

    tld: function() {
        if ( !this._hostname ) {
            return '';
        }
        var pos = this._hostname.lastIndexOf('.');
        if ( pos < 0 ) {
            return this._hostname;
        }
        return this._hostname.slice(pos + 1);
    },

    /*--------------------------------------------------------------------*/

    // Return the parent domain. For IP address, there is no parent domain.

    parentHostnameFromHostname: function(hostname) {
        // `locahost` => ``
        // `example.org` => `example.org`
        // `www.example.org` => `example.org`
        // `tomato.www.example.org` => `example.org`
        var domain = this.domainFromHostname(hostname);

        // `locahost` === `` => bye
        // `example.org` === `example.org` => bye
        // `www.example.org` !== `example.org` => stay
        // `tomato.www.example.org` !== `example.org` => stay
        if ( !domain || domain === hostname ) {
            return undefined;
        }

        // Parent is hostname minus first label
        return hostname.slice(hostname.indexOf('.') + 1);
    },

    /*--------------------------------------------------------------------*/

    // Return all possible parent hostnames which can be derived from `hostname`,
    // ordered from direct parent up to domain inclusively.

    parentHostnamesFromHostname: function(hostname) {
        // TODO: I should create an object which is optimized to receive
        // the list of hostnames by making it reusable (junkyard etc.) and which
        // has its own element counter property in order to avoid memory
        // alloc/dealloc.
        var nodes = [];
        var domain = this.domainFromHostname(hostname);
        if ( domain && domain !== hostname ) {
            var pos;
            while ( true ) {
                pos = hostname.indexOf('.');
                if ( pos < 0 ) {
                    break;
                }
                hostname = hostname.slice(pos + 1);
                nodes.push(hostname);
                if ( hostname === domain ) {
                    break;
                }
            }
        }
        return nodes;
    },

    /*--------------------------------------------------------------------*/

    // Return all possible hostnames which can be derived from `hostname`,
    // ordered from self up to domain inclusively.

    allHostnamesFromHostname: function(hostname) {
        var nodes = this.parentHostnamesFromHostname(hostname);
        nodes.unshift(hostname);
        return nodes;
    },

    /*--------------------------------------------------------------------*/

    //     URI = scheme ":" hier-part [ "?" query ] [ "#" fragment ]
    //
    //       foo://example.com:8042/over/there?name=ferret#nose
    //       \_/   \______________/\_________/ \_________/ \__/
    //        |           |            |            |        |
    //     scheme     authority       path        query   fragment
    //        |   _____________________|__
    //       / \ /                        \
    //       urn:example:animal:ferret:nose

    assemble: function(bits) {
        if ( bits === undefined ) {
            bits = this.allBits;
        }
        var s = '';
        if ( this._scheme && (bits & this.schemeBit) ) {
            s += this._scheme + ':';
        }
        if ( this._hostname && (bits & this.hostnameBit) ) {
            s += '//' + this._hostname;
        }
        if ( this._port && (bits & this.portBit) ) {
            s += ':' + this._port;
        }
        if ( this._path && (bits & this.pathBit) ) {
            s += this._path;
        }
        if ( this._query && (bits & this.queryBit) ) {
            s += '?' + this._query;
        }
        if ( this._fragment && (bits & this.fragmentBit) ) {
            s += '#' + this._fragment;
        }
        return s;
    },

    /*--------------------------------------------------------------------*/

    toString: function() {
        return this.assemble();
    },

    /*--------------------------------------------------------------------*/

    validateHostname: function(hostname) {
    },

    /*--------------------------------------------------------------------*/
    _scheme: '',
    _hostname: '',
    _ipv4: undefined,
    _ipv6: undefined,
    _port: '',
    _path: '',
    _query: '',
    _fragment: '',

    _publicSuffixList: publicSuffixList,

    /*--------------------------------------------------------------------*/

    reset: function() {
        this._scheme = '';
        this._hostname = '';
        this._ipv4 = undefined;
        this._ipv6 = undefined;
        this._port = '';
        this._path = '';
        this._query = '';
        this._fragment = '';
    },

    /*--------------------------------------------------------------------*/

    validHostnameRegex: /^([a-z\d]+(-*[a-z\d]+)*)(\.[a-z\d]+(-*[a-z\d])*)*$/,

    // Source.: http://stackoverflow.com/questions/5284147/validating-ipv4-addresses-with-regexp/5284410#5284410
    ipv4Regex: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)(\.|$)){4}/,

    // Source: http://forums.intermapper.com/viewtopic.php?p=1096#1096
    ipv6Regex: /^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/,

    notAnIPAddressRegex: /[^\dA-Fa-f.:]/,
};

/******************************************************************************/

// Here we run code to further initialize that which cannot be initialized
// using literals.

uriTools.authorityBit =  (uriTools.userBit | uriTools.passwordBit | uriTools.hostnameBit | uriTools.portBit);
uriTools.normalizeBits = (uriTools.schemeBit | uriTools.hostnameBit | uriTools.pathBit | uriTools.queryBit);

/******************************************************************************/

