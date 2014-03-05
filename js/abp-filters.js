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
var filterDictFrozenCount = 0;
var filterIndex = {};

var reIgnoreFilter = /^\[|^!|##|@#|@@|^\|http/;
var reConditionalRule = /\$/;
var reHostnameRule = /^\|\|[a-z0-9.-]+\^?$/;
var reWildcardRule = /[^*][*]+[^*]/;
var reToken = /[%0-9A-Za-z]{2,}/g;

// My favorite regex tester: http://regexpal.com/

/******************************************************************************/

var FilterEntry = function(token) {
    this.token = token;
    this.prefix = '';
    this.suffix = '';
};

FilterEntry.prototype.matchString = function(s, tokenBeg, tokenEnd) {
    if ( s.indexOf(this.suffix, tokenEnd) !== tokenEnd ) {
        return false;
    }
    tokenBeg -= this.prefix.length;
    return s.indexOf(this.prefix, tokenBeg) === tokenBeg;
};

/******************************************************************************/

// Reset all, thus reducing to a minimum memory footprint of the context.

var reset = function() {
    filterDict = {};
    filterDictFrozenCount = 0;
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
    if ( filterDictFrozenCount !== 0 ) {
        console.error("abpFilter.add()> Can't add, I'm frozen!");
        return false;
    }

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

    // Already in dictionary?
    var filter = filterDict[s];
    if ( filter !== undefined ) {
        return false;
    }

    // Index based on 1st good token
    var matches = findGoodToken(s);
    if ( !matches ) {
        return false;
    }
    var token = matches[0];

    filter = new FilterEntry(token);
    filterDict[s] = filter;

    var prefix = s.slice(0, matches.index);
    // Eliminate leading wildcards
    var pos = 0;
    while ( prefix.charAt(pos) === '*' ) {
        pos += 1;
    }
    prefix = prefix.slice(pos);
    filter.prefix = prefix;
    var prefixKey = prefix.length > 0 ? prefix.charAt(prefix.length-1) : '0';

    var suffix = s.slice(reToken.lastIndex);
    // Eliminate trailing wildcards
    pos = suffix.length;
    while ( suffix.charAt(pos-1) === '*' ) {
        pos -= 1;
    }
    suffix = suffix.slice(0, pos);
    filter.suffix = suffix;
    var suffixKey = suffix.length > 0 ? suffix.charAt(0) : '0';

    var fidx = filterIndex;
    var tokenKey = prefixKey + token + suffixKey;
    var tokenEntry = fidx[tokenKey];
    if ( tokenEntry === undefined ) {
        fidx[tokenKey] = filter;
    } else if ( tokenEntry instanceof FilterEntry ) {
        fidx[tokenKey] = [tokenEntry, filter];
    } else {
        tokenEntry.push(filter);
    }

    return true;
};

/******************************************************************************/

var freeze = function() {
    filterDictFrozenCount = Object.keys(filterDict).length;
    filterDict = null;
};

/******************************************************************************/

var matchFromFilterArray = function(s, tokenBeg, tokenEnd, filters) {
    var i = filters.length;
    while ( i-- ) {
        if ( filters[i].matchString(s, tokenBeg, tokenEnd) ) {
            return true;
        }
    }
    return false;
};

/******************************************************************************/

var matchFromSomething = function(s, tokenBeg, tokenEnd, something) {
    if ( something === undefined ) {
        return false;
    }
    if ( something instanceof FilterEntry ) {
        return something.matchString(s, tokenBeg, tokenEnd);
    }
    return matchFromFilterArray(s, tokenBeg, tokenEnd, something);
};

/******************************************************************************/

var matchString = function(s) {
    var sLen = s.length;
    var matches;
    var token;
    var tokenBeg, tokenEnd;
    var prefixKey, suffixKey;
    var fidx = filterIndex;

    reToken.lastIndex = 0;
    while ( matches = reToken.exec(s) ) {
        token = matches[0];
        tokenBeg = matches.index;
        tokenEnd = reToken.lastIndex;
        prefixKey = tokenBeg > 0 ? s.charAt(matches.index-1) : false;
        suffixKey = tokenEnd < sLen ? s.charAt(tokenEnd) : false;

        if ( prefixKey && suffixKey ) {
            if ( matchFromSomething(s, tokenBeg, tokenEnd, fidx[prefixKey + token + suffixKey]) ) {
                return true;
            }
        }
        if ( prefixKey ) {
            if ( matchFromSomething(s, tokenBeg, tokenEnd, fidx[prefixKey + token + '0']) ) {
                return true;
            }
        }
        if ( suffixKey ) {
            if ( matchFromSomething(s, tokenBeg, tokenEnd, fidx['0' + token + suffixKey]) ) {
                return true;
            }
        }
        if ( matchFromSomething(s, tokenBeg, tokenEnd, fidx['0' + token + '0']) ) {
            return true;
        }
    }

    return false;
};

/******************************************************************************/

var getFilterCount = function() {
    return filterDictFrozenCount;
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
