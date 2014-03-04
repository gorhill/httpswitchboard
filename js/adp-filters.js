/*******************************************************************************

    httpblockade - a Chromium browser extension to black/white list requests.
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

    Home: https://github.com/gorhill/httpblockade
*/

/******************************************************************************/

(function(){

/******************************************************************************/

var runtimeId = 1;

var filterDict = {};
var filterDictFrozen = false;

var filterIndex = {};

var reIgnoreFilter = /^!|##|@#|@@|^\|http/;
var reToken = /[%0-9A-Za-z]+/g;
var reAfterHostname = /^[^a-z0-9.-]/;
var reAfterPath = /^[&=?]/;
var reHostnameRule = /^\|\|[a-z0-9.-]+\*?$/;

/******************************************************************************/

var FilterEntry = function(token) {
    this.id = runtimeId++;
    this.token = token;
    this.prefix = '';
    this.suffix = '';
};

/******************************************************************************/

var add = function(s) {
    // Ignore unsupported filters
    if ( reIgnoreFilter.test(s) ) {
        return false;
    }

    // Ignore conditions for now
    s = s.replace(/\$.*$/g, '');

    // Ignore some directives for now
    s = s.replace(/\^/g, '*');
    s = s.replace(/\*\*+/g, '*');

    // Ignore hostname rules, these will be taken care of by HTTPSB.
    if ( reHostnameRule.test(s) ) {
        return;
    }

    // Remove pipes
    s = s.replace(/^\|\|/, '');

    // Already in dictionary?
    var filter = filterDict[s];
    if ( filter !== undefined ) {
        return;
    }

    // Index based on 1st token
    reToken.lastIndex = 0;
    var matches = reToken.exec(s);
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
    var prefixClass;
    if ( prefix.length > 0 ) {
        prefixClass = prefix.charAt(prefix.length-1);
    } else {
        prefixClass = '0';
    }

    var suffix = s.slice(reToken.lastIndex);
    // Eliminate trailing wildcards
    pos = suffix.length;
    while ( suffix.charAt(pos-1) === '*' ) {
        pos -= 1;
    }
    suffix = suffix.slice(0, pos);
    filter.suffix = suffix;
    var suffixClass;
    if ( suffix.length > 0 ) {
        suffixClass = suffix.charAt(0);
    } else {
        suffixClass = '0';
    }

    // The filter index to use depends on the first character of prefix
    var fidx = filterIndex;

    if ( fidx[token] === undefined ) {
        fidx[token] = {};
    }
    var classkey = prefixClass + suffixClass;
    if ( fidx[token][classkey] === undefined ) {
        fidx[token][classkey] = filter.id;
    } else {
        fidx[token][classkey] += ' ' + filter.id;
    }

    return true;
};


/******************************************************************************/

var freezeDict = function() {
    var fdict = filterDict;
    var farr = [];
    var f;
    for ( var s in fdict ) {
        if ( !fdict.hasOwnProperty(s) ) {
            continue;
        }
        f = fdict[s];
        farr[f.id] = f;
    }
    filterDict = farr;

    var classKeys;
    for ( var token in filterIndex ) {
        if ( !filterIndex.hasOwnProperty(token) ) {
            continue;
        }
        classKeys = Object.keys(filterIndex[token]);
        if ( classKeys.length < 2 ) { 
            filterIndex[token] = filterIndex[token][classKeys[0]];
        }
    }

    filterDictFrozen = true;
};

/******************************************************************************/

var matchFromIdList = function(s, tokenBeg, tokenEnd, idListStr) {
    if ( idListStr === undefined ) {
        return false;
    }
    if ( typeof idListStr === 'number' ) {
        idListStr = idListStr.toFixed();
    }
    var idListEnd = idListStr.length;
    var f, idBeg = 0, idEnd;
    while ( idBeg < idListEnd ) {
        idEnd = idListStr.indexOf(' ', idBeg);
        if ( idEnd < 0 ) {
            idEnd = idListEnd;
        }
        f = filterDict[idListStr.slice(idBeg, idEnd)];
        idBeg = idEnd + 1;
        if ( s.lastIndexOf(f.prefix, tokenBeg) !== (tokenBeg - f.prefix.length) ) {
            continue;
        }
        if ( s.indexOf(f.suffix, tokenEnd) !== tokenEnd ) {
            continue;
        }
        // console.log('HTTPBA.filters.matchFromIdList(): "%s" matches "%s"', f.prefix + f.token + f.suffix, s);
        return true;
    }
    return false;
};

/******************************************************************************/

var matchFromString = function(s) {
    if ( !filterDictFrozen ) {
        freezeDict();
    }

    var matches;
    var token, tokenEntry;
    var tokenBeg, tokenEnd;
    var prefixClass;
    var suffixClass;
    var classKey = prefixClass + suffixClass;

    reToken.lastIndex = 0;
    while ( matches = reToken.exec(s) ) {
        token = matches[0];
        tokenBeg = matches.index;
        tokenEnd = reToken.lastIndex;
        tokenEntry = filterIndex[token];
        if ( tokenEntry === undefined ) {
            continue;
        }
        if ( typeof tokenEntry !== 'object' ) {
            if ( matchFromIdList(s, tokenBeg, tokenEnd, tokenEntry) ) {
                return true;
            }
            continue;
        }
        prefixClass = tokenBeg > 0 ? s.charAt(matches.index-1) : '0';
        suffixClass = tokenEnd < s.length ? s.charAt(tokenEnd) : '0';
        classKey = prefixClass + suffixClass;
        if ( matchFromIdList(s, tokenBeg, tokenEnd, tokenEntry[classKey]) ) {
            return true;
        }
        if ( matchFromIdList(s, tokenBeg, tokenEnd, tokenEntry[prefixClass + '0']) ) {
            return true;
        }
        if ( matchFromIdList(s, tokenBeg, tokenEnd, tokenEntry['0' + suffixClass]) ) {
            return true;
        }
    }

    return false;
};

/******************************************************************************/

HTTPBA.filters = {
    add: add,
    matchFromString: matchFromString
};

/******************************************************************************/

})();

/******************************************************************************/
