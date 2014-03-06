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

(function(){

/*******************************************************************************

Some stats gathered on 2014-03-04

Token size: 1
Dict stats:
	Token count: 10239
	Largest list: "ad /_" has 223 ids

Token size: 2
Dict stats:
	Token count: 10251
	Largest list: "ad /_" has 223 ids

Token size: 3
Dict stats:
	Token count: 10347
	Largest list: "ads //" has 253 ids

HTTPSB AA/BX
URLs visited:	15
Domains (3rd party / all):	39 / 40
Hosts (3rd party / all):	83 / 134
Scripts (3rd party / all):	161 / 255
Outbound cookies (3rd party / all):	1 / 28
Net requests (3rd party / all):	919 / 1,666
Bandwidth:	25,102,732 bytes
Requests blocked using Adblock+ filters: 449
Idle mem after: 39 MB

ABP
URLs visited:	15
Domains (3rd party / all):	52 / 53
Hosts (3rd party / all):	95 / 151
Scripts (3rd party / all):	175 / 283
Outbound cookies (3rd party / all):	1 / 35
Net requests (3rd party / all):	906 / 1,690
Bandwidth:	25,440,697 bytes
Idle mem after: 120 MB

*/

var filterDict = {};
var filterCount = 0;
var filterIndex = {};

var reIgnoreFilter = /^\[|^!|##|@#|@@|^\|http/;
var reConditionalRule = /\$/;
var reHostnameRule = /^\|\|[a-z0-9.-]+\^?$/;
var reWildcardRule = /[^*][*]+[^*]/;
var reToken = /[%0-9A-Za-z]{2,}/g;

// My favorite regex tester: http://regexpal.com/

/******************************************************************************/

var FilterEntry = function(s, tokenBeg, tokenLen) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.tokenLen = tokenLen;
    this.next = undefined;
};

/******************************************************************************/

// Reset all, thus reducing to a minimum memory footprint of the context.

var reset = function() {
    filterDict = {};
    filterCount = 0;
    filterIndex = {};
};

/******************************************************************************/

// Given a string, find a good token. Tokens which are too generic, i.e. very
// common with a high probability of ending up as a false positive, are not
// good. Avoid if possible. This has a *significant* positive impact on
// performance.
// These "bad tokens" are collated manually.

var badTokens = {
    'com': true,
    'http': true,
    'https': true,
    'js': true,
    'www': true
};

var findGoodToken = function(s) {
    reToken.lastIndex = 0;
    var matches;
    while ( matches = reToken.exec(s) ) {
        if ( badTokens[matches[0]] === undefined ) {
            return matches;
        }
    }
    // No good token found, just return the first token from left
    reToken.lastIndex = 0;
    return reToken.exec(s);
};

/******************************************************************************/

var add = function(s) {
    // Ignore unsupported filters
    if ( reIgnoreFilter.test(s) ) {
        return false;
    }

    // Ignore rules with conditions for now
    if ( reConditionalRule.test(s) ) {
        return false;
    }

    // Ignore some directives for now
    s = s.replace(/\^/g, '*');
    s = s.replace(/\*\*+/g, '*');

    // Ignore rules with a wildcard in the middle
    if ( reWildcardRule.test(s) ) {
        return false;
    }

    // Ignore hostname rules, these will be taken care of by HTTPSB.
    if ( reHostnameRule.test(s) ) {
        return false;
    }

    // Remove pipes
    s = s.replace(/^\|\|/, '');

    // Remove leading and trailing wildcards
    var pos = 0;
    while ( s.charAt(pos) === '*' ) {
        pos += 1;
    }
    s = s.slice(pos);
    pos = s.length;
    while ( s.charAt(pos-1) === '*' ) {
        pos -= 1;
    }
    s = s.slice(0, pos);

    // Already in dictionary?
    var filter = filterDict[s];
    if ( filter !== undefined ) {
        return false;
    }

    // Index based on 1st good token
    var matches = findGoodToken(s);
    if ( !matches || !matches[0].length ) {
        return false;
    }
    var token = matches[0];
    var tokenBeg = matches.index;
    var tokenEnd = reToken.lastIndex;

    filter = new FilterEntry(s, tokenBeg, token.length);
    filterDict[s] = filter;

    var prefixKey = tokenBeg > 0 ? s.charAt(tokenBeg-1) : '';
    var suffixKey = s.substr(tokenEnd, 2);

    var fidx = filterIndex;
    var tokenKey = prefixKey + token + suffixKey;
    filter.next = fidx[tokenKey];
    fidx[tokenKey] = filter;
    filterCount += 1;

    return true;
};

/******************************************************************************/

var freeze = function() {
    filterDict = {};
};

/******************************************************************************/

var matchStringToFilterChain = function(filter, s, tokenBeg) {
    var filterBeg;
    while ( filter ) {
        // rhill 2014-03-05: Benchmarking shows that's the fastest way to do this.
        filterBeg = tokenBeg - filter.tokenBeg;
        if ( s.indexOf(filter.s, filterBeg) === filterBeg ) {
            return true
        }
        filter = filter.next;
    }
    return false;
};

/******************************************************************************/

var matchString = function(s) {
    var fidx = filterIndex;
    var matches;
    var token;
    var tokenBeg, tokenEnd;
    var prefixKey, suffixKey;
    var matchFn = matchStringToFilterChain;

    reToken.lastIndex = 0;
    while ( matches = reToken.exec(s) ) {
        token = matches[0];
        tokenBeg = matches.index;
        tokenEnd = reToken.lastIndex;
        prefixKey = tokenBeg > 0 ? s.charAt(matches.index-1) : '';
        suffixKey = s.substr(tokenEnd, 2);

        if ( prefixKey && suffixKey.length > 1 ) {
            if ( matchFn(fidx[prefixKey + token + suffixKey], s, tokenBeg) ) {
                return true;
            }
        }
        if ( prefixKey && suffixKey ) {
            if ( matchFn(fidx[prefixKey + token + suffixKey.charAt(0)], s, tokenBeg) ) {
                return true;
            }
        }
        if ( prefixKey ) {
            if ( matchFn(fidx[prefixKey + token], s, tokenBeg) ) {
                return true;
            }
        }
        if ( suffixKey.length > 1 ) {
            if ( matchFn(fidx[token + suffixKey], s, tokenBeg) ) {
                return true;
            }
        }
        if ( suffixKey ) {
            if ( matchFn(fidx[token + suffixKey.charAt(0)], s, tokenBeg) ) {
                return true;
            }
        }
        if ( matchFn(fidx[token], s, tokenBeg) ) {
            return true;
        }
    }

    return false;
};

/******************************************************************************/

var getFilterCount = function() {
    return filterCount;
};

/******************************************************************************/

HTTPSB.abpFilters = {
    add: add,
    freeze: freeze,
    reset: reset,
    matchString: matchString,
    getFilterCount: getFilterCount
};

/******************************************************************************/

})();

/******************************************************************************/
