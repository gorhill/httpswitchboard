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

var runtimeId = 1;

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
    this.id = runtimeId++;
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
    runtimeId = 1;
    filterDict = {};
    filterDictFrozenCount = 0;
    filterIndex = {};
};

/******************************************************************************/

// Given a string, find a good token. Tokens which are too generic, i.e. very
// common while likely to be false positives, are not good, if possible.
// These are collated manually. This has a *significant* positive impact on
// performance.

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
    if ( fidx[token] === undefined ) {
        fidx[token] = {};
    }
    var listkey = prefixKey + suffixKey;
    if ( fidx[token][listkey] === undefined ) {
        fidx[token][listkey] = [filter.id];
    } else {
        fidx[token][listkey].push(filter.id);
    }

    return true;
};


/******************************************************************************/

var mergeSubdict = function(token) {
    var tokenEntry = filterIndex[token];
    if ( tokenEntry === undefined ) {
        return;
    }
    var list = [];
    var value;
    for ( var key in tokenEntry ) {
        if ( !tokenEntry.hasOwnProperty(key) ) {
            continue;
        }
        value = tokenEntry[key];
        if ( typeof value === 'number' ) {
            list.push(value);
        } else {
            list = list.concat(value);
        }
    }
    filterIndex[token] = list.join(' ');
};

/******************************************************************************/

var freeze = function() {
    // TODO: find out if JS engine translate the stringified id into
    // a number internally. I would think not, but if so, than there might
    // be a performance hit. The JS array results in a smaller memory
    // footprint... Need to evaluate the optimal representation.
    var farr = [];
    var fdict = filterDict;

    var f;
    for ( var s in fdict ) {
        if ( !fdict.hasOwnProperty(s) ) {
            continue;
        }
        f = fdict[s];
        farr[f.id] = f;
    }
    filterDict = farr;

    var tokenEntry;
    var key, value;
    var lastKey;
    var kCount, vCount, vCountTotal;
    var tokenCountMax, kCountMax, vCountMax = 0;
    for ( var token in filterIndex ) {
        if ( !filterIndex.hasOwnProperty(token) ) {
            continue;
        }
        tokenEntry = filterIndex[token];
        kCount = vCount = vCountTotal = 0;
        for ( key in tokenEntry ) {
            if ( !tokenEntry.hasOwnProperty(key) ) {
                continue;
            }
            // No need to mutate to a string if there is only one
            // element in the array.
            lastKey = key;
            value = tokenEntry[key];
            kCount += 1;
            vCount = value.length;
            vCountTotal += vCount;
            if ( vCount < 2 ) {
                tokenEntry[key] = value[0];
            } else {
                tokenEntry[key] = value.join(' ');
            }
            if ( vCount > vCountMax ) {
                tokenCountMax = token;
                kCountMax = key;
                vCountMax = vCount;
            }
        }
        // Merge all sub-dicts into a single one at token dict level, if there
        // is not enough keys or values to justify the overhead.
        // Also, no need for a sub-dict if there is only one key.
        if ( kCount < 2 ) { 
            filterIndex[token] = tokenEntry[lastKey];
            continue;
        }
        if ( vCountTotal < 4 ) {
            mergeSubdict(token);
            continue;
        }
    }

    filterDictFrozenCount = farr.length;

    // console.log('Dict stats:');
    // console.log('\tToken count:', Object.keys(filterIndex).length);
    // console.log('\tLargest list: "%s %s" has %d ids', tokenCountMax, kCountMax, vCountMax);
};

/******************************************************************************/

var matchFromFilterIndex = function(s, tokenBeg, tokenEnd, index) {
    return filterDict[index].matchString(s, tokenBeg, tokenEnd);
};

/******************************************************************************/

var matchFromFilterIndices = function(s, tokenBeg, tokenEnd, indices) {
    var indicesEnd = indices.length;
    var indexBeg = 0, indexEnd;
    while ( indexBeg < indicesEnd ) {
        indexEnd = indices.indexOf(' ', indexBeg);
        if ( indexEnd < 0 ) {
            indexEnd = indicesEnd;
        }
        if ( filterDict[indices.slice(indexBeg, indexEnd)].matchString(s, tokenBeg, tokenEnd) ) {
            return true;
        }
        indexBeg = indexEnd + 1;
    }
    return false;
};

/******************************************************************************/

var matchFromSomething = function(s, tokenBeg, tokenEnd, something) {
    if ( something === undefined ) {
        return false;
    }
    if ( typeof something === 'number') {
        return filterDict[something].matchString(s, tokenBeg, tokenEnd);
    }
    if ( typeof something === 'string') {
        return matchFromFilterIndices(s, tokenBeg, tokenEnd, something);
    }
    if ( something instanceof FilterEntry ) {
        return something.matchString(s, tokenBeg, tokenEnd);
    }
    return false;
};

/******************************************************************************/

var matchString = function(s) {
    if ( filterDictFrozenCount === 0 ) {
        return false;
    }

    var matches;
    var token, tokenEntry;
    var tokenBeg, tokenEnd;
    var prefixKey, suffixKey;

    reToken.lastIndex = 0;
    while ( matches = reToken.exec(s) ) {
        token = matches[0];
        tokenEntry = filterIndex[token];
        if ( tokenEntry === undefined ) {
            continue;
        }
        tokenBeg = matches.index;
        tokenEnd = reToken.lastIndex;
        if ( typeof tokenEntry !== 'object' ) {
            if ( matchFromSomething(s, tokenBeg, tokenEnd, tokenEntry) ) {
                return true;
            }
            continue;
        }
        prefixKey = tokenBeg > 0 ? s.charAt(matches.index-1) : '0';
        suffixKey = tokenEnd < s.length ? s.charAt(tokenEnd) : '0';
        if ( matchFromSomething(s, tokenBeg, tokenEnd, tokenEntry[prefixKey + suffixKey]) ) {
            return true;
        }
        if ( matchFromSomething(s, tokenBeg, tokenEnd, tokenEntry[prefixKey + '0']) ) {
            return true;
        }
        if ( matchFromSomething(s, tokenBeg, tokenEnd, tokenEntry['0' + suffixKey]) ) {
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
