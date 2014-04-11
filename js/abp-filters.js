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


Complex filters count no '*' support: 16,637
Complex filters count with '*' support: 18,741
*/

var filterDict = {};
var filterCount = 0;
var filterIndex = {};

var reIgnoreFilter = /^\[|^!|##|@#|@@|^\|http/;
var reConditionalRule = /\$/;
var reHostnameRule = /^\|\|[a-z0-9.-]+\^?$/;
var reToken = /[%0-9A-Za-z]{2,}/g;
var reThirdPartyCondition = /\$third-party$/;

// My favorite regex tester: http://www.gethifi.com/tools/regex#

/******************************************************************************/

var FilterPlain = function(s, tokenBeg) {
    this.s = s;
    this.next = undefined;
    this.tokenBeg = tokenBeg;
};

FilterPlain.prototype.match = function(s, tokenBeg) {
    return s.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainThirdParty = function(s, tokenBeg) {
    this.s = s;
    this.next = undefined;
    this.tokenBeg = tokenBeg;
};

FilterPlainThirdParty.prototype.match = function(s, tokenBeg, thirdParty) {
    return s.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s && thirdParty;
};

/******************************************************************************/

var FilterPlainPrefix0 = function(s) {
    this.s = s;
    this.next = undefined;
};

FilterPlainPrefix0.prototype.match = function(s, tokenBeg) {
    return s.substr(tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix0ThirdParty = function(s) {
    this.s = s;
    this.next = undefined;
};

FilterPlainPrefix0ThirdParty.prototype.match = function(s, tokenBeg, thirdParty) {
    return s.substr(tokenBeg, this.s.length) === this.s && thirdParty;
};

/******************************************************************************/

var FilterPlainPrefix1 = function(s) {
    this.s = s;
    this.next = undefined;
};

FilterPlainPrefix1.prototype.match = function(s, tokenBeg) {
    return s.substr(tokenBeg - 1, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix1ThirdParty = function(s) {
    this.s = s;
    this.next = undefined;
};

FilterPlainPrefix1ThirdParty.prototype.match = function(s, tokenBeg, thirdParty) {
    return s.substr(tokenBeg - 1, this.s.length) === this.s && thirdParty;
};

/******************************************************************************/

// With a single wildcard, regex is not optimal.
// See:
//   http://jsperf.com/regexp-vs-indexof-abp-miss/3
//   http://jsperf.com/regexp-vs-indexof-abp-hit/3

var FilterSingleWildcard = function(s, tokenBeg) {
    this.s = s;
    this.next = undefined;
    this.tokenBeg = tokenBeg;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
};

FilterSingleWildcard.prototype.match = function(s, tokenBeg) {
    tokenBeg -= this.tokenBeg;
    return s.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           s.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

var FilterSingleWildcardThirdParty = function(s, tokenBeg) {
    this.s = s;
    this.next = undefined;
    this.tokenBeg = tokenBeg;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
};

FilterSingleWildcardThirdParty.prototype.match = function(s, tokenBeg, thirdParty) {
    tokenBeg -= this.tokenBeg;
    return s.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           s.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0 &&
           thirdParty;
};

/******************************************************************************/

var FilterSingleWildcardPrefix0 = function(s) {
    this.s = s;
    this.next = undefined;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
};

FilterSingleWildcardPrefix0.prototype.match = function(s, tokenBeg) {
    return s.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           s.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

var FilterSingleWildcardPrefix0ThirdParty = function(s) {
    this.s = s;
    this.next = undefined;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
};

FilterSingleWildcardPrefix0ThirdParty.prototype.match = function(s, tokenBeg, thirdParty) {
    return s.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           s.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0 &&
           thirdParty;
};

/******************************************************************************/

// With many wildcards, a regex is best.

var FilterManyWildcards = function(s, tokenBeg) {
    this.s = s;
    this.next = undefined;
    this.tokenBeg = tokenBeg;
    // Ref: escaper taken from:
    // https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
    // Except modified for the purpose here.
    this.re = new RegExp('^' + s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '.*'));
};

FilterManyWildcards.prototype.match = function(s, tokenBeg) {
    return this.re.test(s.slice(tokenBeg - this.tokenBeg));
};

/******************************************************************************/

var FilterManyWildcardsThirdParty = function(s, tokenBeg) {
    this.s = s;
    this.next = undefined;
    this.tokenBeg = tokenBeg;
    // Ref: escaper taken from:
    // https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
    // Except modified for the purpose here.
    this.re = new RegExp('^' + s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '.*'));
};

FilterManyWildcardsThirdParty.prototype.match = function(s, tokenBeg, thirdParty) {
    return this.re.test(s.slice(tokenBeg - this.tokenBeg)) && thirdParty;
};

/******************************************************************************/

var FilterFactory = function(s, tokenBeg, tokenLen, thirdParty) {
    var wcOffset = s.indexOf('*');
    if ( wcOffset > 0 ) {
        return FilterWildcardFactory(s, tokenBeg, thirdParty);
    }
    return FilterPlainFactory(s, tokenBeg, thirdParty);
};

var FilterPlainFactory = function(s, tokenBeg, thirdParty) {
    if ( tokenBeg === false ) {
        if ( thirdParty ) {
            return new FilterPlainPrefix0ThirdParty(s);
        }
        return new FilterPlainPrefix0(s);
    }
    if ( tokenBeg === 1 ) {
        if ( thirdParty ) {
            return new FilterPlainPrefix1ThirdParty(s);
        }
        return new FilterPlainPrefix1(s);
    }
    if ( thirdParty ) {
        return new FilterPlainThirdParty(s, tokenBeg);
    }
    return new FilterPlain(s, tokenBeg);
};

var FilterWildcardFactory = function(s, tokenBeg, thirdParty) {
    if ( (/\*[^*]\*/).test(s) ) {
        if ( thirdParty ) {
            return new FilterManyWildcardsThirdParty(s, tokenBeg);
        }
        return new FilterManyWildcards(s, tokenBeg);
    }
    if ( tokenBeg === 0 ) {
        if ( thirdParty ) {
            return new FilterSingleWildcardPrefix0ThirdParty(s);
        }
        return new FilterSingleWildcardPrefix0(s);
    }
    if ( thirdParty ) {
        return new FilterSingleWildcardThirdParty(s, tokenBeg);
    }
    return new FilterSingleWildcard(s, tokenBeg);
};

/******************************************************************************/

// Reset all, thus reducing to a minimum memory footprint of the context.

var reset = function() {
    filterDict = {};
    filterCount = 0;

    // Give chromium's GC a helpful hand
//    var stats = {}, n = 0;
    var fidx = filterIndex;
    var f, fn;
    for ( var k in fidx ) {
        if ( !fidx.hasOwnProperty(k) ) {
            continue;
        }
        f = fidx[k];
        while ( f ) {
            fn = f.next;
            f.next = null;
            f = fn;
//            n++;
        }
        fidx[k] = null;
//        stats[k] = n; n = 0;
    }
    filterIndex = {};
//    console.log('abp-filters.js stats:\n', Object.keys(stats).sort(function(a,b){return stats[b]-stats[a]}).map(function(a){return '\t'+a+': '+stats[a]}).join('\n'));
};

/******************************************************************************/

// Given a string, find a good token. Tokens which are too generic, i.e. very
// common with a high probability of ending up as a miss, are not
// good. Avoid if possible. This has a *significant* positive impact on
// performance.
// These "bad tokens" are collated manually.

var badTokens = {
    'com': true,
    'http': true,
    'https': true,
    'images': true,
    'img': true,
    'js': true,
    'news': true,
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

// Trim leading/trailing char "c"

var trimChar = function(s, c) {
    // Remove leading and trailing wildcards
    var pos = 0;
    while ( s.charAt(pos) === c ) {
        pos += 1;
    }
    s = s.slice(pos);
    if ( pos = s.length ) {
        while ( s.charAt(pos-1) === c ) {
            pos -= 1;
        }
        s = s.slice(0, pos);
    }
    return s;
};

/******************************************************************************/

var add = function(s) {
    // ORDER OF TESTS IS IMPORTANT!

    // Ignore unsupported filters
    if ( reIgnoreFilter.test(s) ) {
        return false;
    }

    // Accept `third-party` condition if it is the only condition
    var thirdParty = reThirdPartyCondition.test(s);
    if ( thirdParty ) {
        s = s.replace('$third-party', '');
    }

    // Ignore rules with other conditions for now
    if ( reConditionalRule.test(s) ) {
        return false;
    }

    // Ignore unconditional hostname rules, these will be taken care of by HTTPSB.
    if ( thirdParty === false ) {
        if ( reHostnameRule.test(s) ) {
            return false;
        }
    }

    // Ignore some directives for now
    s = s.replace(/\^/g, '*');
    s = s.replace(/\*\*+/g, '*');

    // Remove leading and trailing pipes
    s = s.replace(/^\|+|\|+$/, '');

    // Remove leading and trailing wildcards
    s = trimChar(s, '*');

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

    filter = FilterFactory(s, tokenBeg, token.length, thirdParty);
    if ( !filter ) {
        return false;
    }
    filterDict[s] = filter;

    var prefixKey = trimChar(s.substring(tokenBeg - 1, tokenBeg), '*');
    var suffixKey = trimChar(s.substring(tokenEnd, tokenEnd + 2), '*');
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

var matchStringToFilterChain = function(f, s, tokenBeg, thirdParty) {
    while ( f !== undefined ) {
        if ( f.match(s, tokenBeg, thirdParty) ) {
            // console.log('abp-filters.js> matchStringToFilterChain(): "%s" matches "%s"', f.s, s);
            return f.s;
        }
        f = f.next;
    }
    return false;
};

/******************************************************************************/

var matchString = function(s, srcHostname, dstHostname) {
    // rhill 2014-03-12: need to skip ABP filtering if HTTP is turned off.
    // https://github.com/gorhill/httpswitchboard/issues/208
    if ( HTTPSB.off ) {
        return false;
    }

    var fidx = filterIndex, f;
    var matches;
    var token;
    var tokenBeg, tokenEnd;
    var prefixKey, suffixKey;
    var matchFn = matchStringToFilterChain;
    var thirdParty = dstHostname.lastIndexOf(srcHostname) !== (dstHostname.length - srcHostname.length);

    reToken.lastIndex = 0;
    while ( matches = reToken.exec(s) ) {
        token = matches[0];
        tokenBeg = matches.index;
        tokenEnd = reToken.lastIndex;
        prefixKey = s.substring(tokenBeg - 1, tokenBeg);
        suffixKey = s.substring(tokenEnd, tokenEnd + 2);

        if ( suffixKey.length > 1 ) {
            if ( prefixKey !== '' ) {
                f = matchFn(fidx[prefixKey + token + suffixKey], s, tokenBeg, thirdParty);
                if ( f !== false ) {
                    return f;
                }
            }
            f = matchFn(fidx[token + suffixKey], s, tokenBeg, thirdParty);
            if ( f !== false ) {
                return f;
            }
        }
        if ( suffixKey !== '' ) {
            if ( prefixKey !== '' ) {
                f = matchFn(fidx[prefixKey + token + suffixKey.charAt(0)], s, tokenBeg, thirdParty);
                if ( f !== false ) {
                    return f;
                }
            }
            f = matchFn(fidx[token + suffixKey.charAt(0)], s, tokenBeg, thirdParty);
            if ( f !== false ) {
                return f;
            }
        }
        if ( prefixKey !== '' ) {
            f = matchFn(fidx[prefixKey + token], s, tokenBeg, thirdParty);
            if ( f !== false ) {
                return f;
            }
        }
        f = matchFn(fidx[token], s, tokenBeg, thirdParty);
        if ( f !== false ) {
            return f;
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
