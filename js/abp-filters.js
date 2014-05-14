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

/* jshint esnext: true, bitwise: false */
/* global HTTPSB */

/******************************************************************************/

(function(){

/******************************************************************************/

const BlockAction = 0 << 15;
const AllowAction = 1 << 15;

const AnyType = 1 << 11;

const AnyParty = 0 << 8;
const FirstParty = 1 << 8;
const ThirdParty = 2 << 8;
const SpecificParty = 3 << 8;
const SpecificNotParty = 4 << 8;

const BlockAnyTypeAnyParty = BlockAction | AnyType | AnyParty;
const BlockAnyType1stParty = BlockAction | AnyType | FirstParty;
const BlockAnyType3rdParty = BlockAction | AnyType | ThirdParty;
const BlockAnyTypeOneParty = BlockAction | AnyType | SpecificParty;
const BlockAnyTypeOtherParties = BlockAction | AnyType | SpecificNotParty;
const BlockAnyType = BlockAction | AnyType;
const BlockAnyParty = BlockAction | AnyParty;
const BlockOneParty = BlockAction | SpecificParty;
const BlockOtherParties = BlockAction | SpecificNotParty;

const AllowAnyTypeAnyParty = AllowAction | AnyType | AnyParty;
const AllowAnyType1stParty = AllowAction | AnyType | FirstParty;
const AllowAnyType3rdParty = AllowAction | AnyType | ThirdParty;
const AllowAnyTypeOneParty = AllowAction | AnyType | SpecificParty;
const AllowAnyTypeOtherParties = AllowAction | AnyType | SpecificNotParty;
const AllowAnyType = AllowAction | AnyType;
const AllowAnyParty = AllowAction | AnyParty;
const AllowOneParty = AllowAction | SpecificParty;
const AllowOtherParties = AllowAction | SpecificNotParty;

var pageHostname = '';

var reIgnoreEmpty = /^\s+$/;
var reIgnoreComment = /^\[|^!/;
var reHostnameRule = /^[0-9a-z.-]+[0-9a-z]$/;
var reHostnameToken = /^[0-9a-z]+/g;
var reGoodToken = /[%0-9a-z]{2,}/g;
var reAnyToken = /[%0-9a-z]+/g;

var typeNameToTypeValue = {
        'stylesheet': 2 << 11,
             'image': 3 << 11,
            'object': 4 << 11,
            'script': 5 << 11,
    'xmlhttprequest': 6 << 11,
         'sub_frame': 7 << 11,
             'other': 8 << 11
};

// regex tester: http://www.gethifi.com/tools/regex#

/******************************************************************************/

var FilterPlain = function(s, tokenBeg) {
    this.s = s;
    this.tokenBeg = tokenBeg;
};

FilterPlain.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.hostname = hostname;
};

FilterPlainHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainNotHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.hostname = hostname;
};

FilterPlainNotHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) !== this.hostname &&
           url.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix0 = function(s) {
    this.s = s;
};

FilterPlainPrefix0.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix0Hostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainPrefix0Hostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix0NotHostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainPrefix0NotHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) !== this.hostname &&
           url.substr(tokenBeg, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix1 = function(s) {
    this.s = s;
};

FilterPlainPrefix1.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg - 1, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix1Hostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainPrefix1Hostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg - 1, this.s.length) === this.s;
};

/******************************************************************************/

var FilterPlainPrefix1NotHostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainPrefix1NotHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) !== this.hostname &&
           url.substr(tokenBeg - 1, this.s.length) === this.s;
};

/******************************************************************************/

// With a single wildcard, regex is not optimal.
// See:
//   http://jsperf.com/regexp-vs-indexof-abp-miss/3
//   http://jsperf.com/regexp-vs-indexof-abp-hit/3

var FilterSingleWildcard = function(s, tokenBeg) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
};

FilterSingleWildcard.prototype.match = function(url, tokenBeg) {
    tokenBeg -= this.tokenBeg;
    return url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

var FilterSingleWildcardHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
    this.hostname = hostname;
};

FilterSingleWildcardHostname.prototype.match = function(url, tokenBeg) {
    tokenBeg -= this.tokenBeg;
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

var FilterSingleWildcardNotHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
    this.hostname = hostname;
};

FilterSingleWildcardNotHostname.prototype.match = function(url, tokenBeg) {
    tokenBeg -= this.tokenBeg;
    return pageHostname.slice(-this.hostname.length) !== this.hostname &&
           url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

var FilterSingleWildcardPrefix0 = function(s) {
    this.s = s;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
};

FilterSingleWildcardPrefix0.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

var FilterSingleWildcardPrefix0Hostname = function(s, hostname) {
    this.s = s;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
    this.hostname = hostname;
};

FilterSingleWildcardPrefix0Hostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

var FilterSingleWildcardPrefix0NotHostname = function(s, hostname) {
    this.s = s;
    var wcOffset = s.indexOf('*');
    this.lSegment = s.slice(0, wcOffset);
    this.rSegment = s.slice(wcOffset + 1);
    this.hostname = hostname;
};

FilterSingleWildcardPrefix0NotHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) !== this.hostname &&
           url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

/******************************************************************************/

// With many wildcards, a regex is best.

// Ref: regex escaper taken from:
// https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
// modified for the purpose here.

var FilterManyWildcards = function(s, tokenBeg) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.re = new RegExp('^' + s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '.*'));
};

FilterManyWildcards.prototype.match = function(url, tokenBeg) {
    return this.re.test(url.slice(tokenBeg - this.tokenBeg));
};

/******************************************************************************/

var FilterManyWildcardsHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.re = new RegExp('^' + s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '.*'));
    this.hostname = hostname;
};

FilterManyWildcardsHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           this.re.test(url.slice(tokenBeg - this.tokenBeg));
};

/******************************************************************************/

var FilterManyWildcardsNotHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.re = new RegExp('^' + s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '.*'));
    this.hostname = hostname;
};

FilterManyWildcardsNotHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) !== this.hostname &&
           this.re.test(url.slice(tokenBeg - this.tokenBeg));
};

/******************************************************************************/

var makeFilter = function(s, tokenBeg) {
    var wcOffset = s.indexOf('*');
    if ( wcOffset > 0 ) {
        if ( (/\*[^*]\*/).test(s) ) {
            return new FilterManyWildcards(s, tokenBeg);
        }
        if ( tokenBeg === 0 ) {
            return new FilterSingleWildcardPrefix0(s);
        }
        return new FilterSingleWildcard(s, tokenBeg);
    }
    if ( tokenBeg === 0 ) {
        return new FilterPlainPrefix0(s);
    }
    if ( tokenBeg === 1 ) {
        return new FilterPlainPrefix1(s);
    }
    return new FilterPlain(s, tokenBeg);
};

/******************************************************************************/

var makeHostnameFilter = function(s, tokenBeg, hostname) {
    var wcOffset = s.indexOf('*');
    if ( wcOffset > 0 ) {
        if ( (/\*[^*]\*/).test(s) ) {
            return new FilterManyWildcardsHostname(s, tokenBeg, hostname);
        }
        if ( tokenBeg === 0 ) {
            return new FilterSingleWildcardPrefix0Hostname(s, hostname);
        }
        return new FilterSingleWildcardHostname(s, tokenBeg, hostname);
    }
    if ( tokenBeg === 0 ) {
        return new FilterPlainPrefix0Hostname(s, hostname);
    }
    if ( tokenBeg === 1 ) {
        return new FilterPlainPrefix1Hostname(s, hostname);
    }
    return new FilterPlainHostname(s, tokenBeg, hostname);
};

/******************************************************************************/

var makeNotHostnameFilter = function(s, tokenBeg, hostname) {
    var wcOffset = s.indexOf('*');
    if ( wcOffset > 0 ) {
        if ( (/\*[^*]\*/).test(s) ) {
            return new FilterManyWildcardsNotHostname(s, tokenBeg, hostname);
        }
        if ( tokenBeg === 0 ) {
            return new FilterSingleWildcardPrefix0NotHostname(s, hostname);
        }
        return new FilterSingleWildcardNotHostname(s, tokenBeg, hostname);
    }
    if ( tokenBeg === 0 ) {
        return new FilterPlainPrefix0NotHostname(s, hostname);
    }
    if ( tokenBeg === 1 ) {
        return new FilterPlainPrefix1NotHostname(s, hostname);
    }
    return new FilterPlainNotHostname(s, tokenBeg, hostname);
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

var findFirstGoodToken = function(s) {
    reGoodToken.lastIndex = 0;
    var matches;
    while ( matches = reGoodToken.exec(s) ) {
        if ( badTokens[matches[0]] === undefined ) {
            return matches;
        }
    }
    // No good token found, just return the first token from left
    reGoodToken.lastIndex = 0;
    return reGoodToken.exec(s);
};

/******************************************************************************/

var findHostnameToken = function(s) {
    reHostnameToken.lastIndex = 0;
    return reHostnameToken.exec(s);
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

var FilterParser = function() {
    this.f = '';
    this.fopts = '';
    this.action = BlockAction;
    this.hostname = false;
    this.types = [];
    this.firstParty = false;
    this.thirdParty = false;
    this.hostnames = [];
    this.notHostnames = [];
    this.domains = [];
    this.notDomains = [];
    this.elemHiding = false;
    this.unsupported = false;
};

/******************************************************************************/

FilterParser.prototype.toNormalizedType = {
        'stylesheet': 'stylesheet',
             'image': 'image',
            'object': 'object',
 'object-subrequest': 'object',
            'script': 'script',
    'xmlhttprequest': 'xmlhttprequest',
       'subdocument': 'sub_frame',
             'other': 'other'
};

/******************************************************************************/

FilterParser.prototype.reset = function() {
    this.f = '';
    this.fopts = '';
    this.action = BlockAction;
    this.hostname = false;
    this.types.length = 0;
    this.firstParty = false;
    this.thirdParty = false;
    this.hostnames.length = 0;
    this.notHostnames.length = 0;
    this.domains.length = 0;
    this.notDomains.length = 0;
    this.elemHiding = false;
    this.unsupported = false;
    return this;
};

/******************************************************************************/

FilterParser.prototype.parseOptType = function(raw, not) {
    var type = this.toNormalizedType[raw];
    if ( not ) {
        for ( var k in typeNameToTypeValue ) {
            if ( k === type ) {
                continue;
            }
            this.types.push(typeNameToTypeValue[k]);
        }
    } else {
        this.types.push(typeNameToTypeValue[type]);
    }
};

/******************************************************************************/

FilterParser.prototype.parseOptParty = function(not) {
    if ( not ) {
        this.firstParty = true;
    } else {
        this.thirdParty = true;
    }
};

/******************************************************************************/

FilterParser.prototype.parseOptHostnames = function(raw) {
    var httpsburi = HTTPSB.URI;
    var hostnames = raw.split('|');
    var hostname, not, domain;
    for ( var i = 0; i < hostnames.length; i++ ) {
        hostname = hostnames[i];
        not = hostname.charAt(0) === '~';
        if ( not ) {
            hostname = hostname.slice(1);
        }
        domain = httpsburi.domainFromHostname(hostname);
        if ( not ) {
            this.notHostnames.push(hostname);
            this.notDomains.push(domain);
        } else {
            this.hostnames.push(hostname);
            this.domains.push(domain);
        }
    }
};

/******************************************************************************/

FilterParser.prototype.parse = function(s) {
    // important!
    this.reset();

    // element hiding filter?
    if ( s.indexOf('##') >= 0 || s.indexOf('#@') >= 0 ) {
        this.elemHiding = true;
        return this;
    }

    // block or allow filter?
    if ( s.slice(0, 2) === '@@' ) {
        this.action = AllowAction;
        s = s.slice(2);
    }

    // hostname anchoring
    if ( s.slice(0, 2) === '||' ) {
        this.hostname = true;
        s = s.slice(2);
    }

    // unsupported
    if ( s.charAt(0) === '|' ) {
        this.unsupported = true;
        s = s.slice(1);
    }

    // options
    var pos = s.indexOf('$');
    if ( pos > 0 ) {
        this.fopts = s.slice(pos + 1);
        s = s.slice(0, pos);
    }

    // normalize placeholders
    s = s.replace(/\^/g, '*');
    s = s.replace(/\*\*+/g, '*');
    // remove leading and trailing wildcards
    s = trimChar(s, '*');
    // remove leading and trailing pipes
    this.f = trimChar(s, '|');

    if ( !this.fopts ) {
        return this;
    }

    // parse options
    var opts = this.fopts.split(',');
    var opt, not;
    for ( var i = 0; i < opts.length; i++ ) {
        opt = opts[i];
        not = opt.charAt(0) === '~';
        if ( not ) {
            opt = opt.slice(1);
        }
        if ( opt === 'third-party' ) {
            this.parseOptParty(not);
            continue;
        }
        if ( this.toNormalizedType.hasOwnProperty(opt) ) {
            this.parseOptType(opt, not);
            continue;
        }
        if ( opt.slice(0,7) === 'domain=' ) {
            this.parseOptHostnames(opt.slice(7));
            continue;
        }
        if ( opt === 'popup' ) {
            this.elemHiding = true;
            break;
        }
        this.unsupported = true;
        // console.log('HTTP Switchboard> abp-filter.js/parseOptions(): unsupported option "%s" in filter "%s"', opts[i], s);
    }
    return this;
};

/******************************************************************************/
/******************************************************************************/

var FilterBucket = function(a, b) {
    this.filters = [a, b];
    this.s = '';
};

/******************************************************************************/

FilterBucket.prototype.add = function(a) {
    this.filters.push(a);
};

/******************************************************************************/

FilterBucket.prototype.match = function(url, tokenBeg) {
    var filters = this.filters;
    var i = filters.length;
    while ( i-- ) {
        if ( filters[i].match(url, tokenBeg) !== false ) {
            this.s = filters[i].s;
            return true;
        }
    }
    return false;
};

/******************************************************************************/
/******************************************************************************/

var FilterContainer = function() {
    this.categories = {};
    this.url = '';
    this.tokenBeg = 0;
    this.tokenEnd = 0;
    this.filterParser = new FilterParser();
    this.processedFilterCount = 0;
    this.supportedFilterCount = 0;
    this.allowFilterCount = 0;
    this.blockFilterCount = 0;
};

/******************************************************************************/

FilterContainer.prototype.toDomainBits = function(domain) {
    if ( domain === undefined ) {
        return 0;
    }
    var i = domain.length >> 2;
    return (domain.charCodeAt(    0) & 0x01) << 3 |
           (domain.charCodeAt(    i) & 0x01) << 2 |
           (domain.charCodeAt(  i+i) & 0x01) << 1 |
           (domain.charCodeAt(i+i+i) & 0x01) << 0;
};

/******************************************************************************/

FilterContainer.prototype.makeCategoryKey = function(category) {
    return String.fromCharCode(category);
};

/******************************************************************************/

FilterContainer.prototype.add = function(s) {
    // ORDER OF TESTS IS IMPORTANT!

    // Ignore empty lines
    if ( reIgnoreEmpty.test(s) ) {
        return false;
    }

    // Ignore comments
    if ( reIgnoreComment.test(s) ) {
        return false;
    }

    var parsed = this.filterParser.parse(s);

    // Ignore element-hiding filters
    if ( parsed.elemHiding ) {
        return false;
    }

    this.processedFilterCount += 1;

    // Ignore rules with other conditions for now
    if ( parsed.unsupported ) {
        return false;
    }

    this.supportedFilterCount += 1;

    // Ignore optionless hostname rules, these will be taken care of by HTTPSB.
    if ( parsed.hostname && !parsed.fopts && parsed.action === BlockAction && reHostnameRule.test(parsed.f) ) {
        return false;
    }

    if ( this.addFilter(parsed) === false ) {
        return false;
    }

    if ( parsed.action ) {
        this.allowFilterCount += 1;
    } else {
        this.blockFilterCount += 1;
    }
    return true;
};

/******************************************************************************/

FilterContainer.prototype.addFilter = function(parsed) {
    // TODO: avoid duplicates

    var matches = parsed.hostname ? findHostnameToken(parsed.f) : findFirstGoodToken(parsed.f);
    if ( !matches || !matches[0].length ) {
        return false;
    }
    var tokenBeg = matches.index;
    var tokenEnd = parsed.hostname ? reHostnameToken.lastIndex : reGoodToken.lastIndex;
    var i, n, filter;

    if ( parsed.hostnames.length || parsed.notHostnames.length ) {
        n = parsed.hostnames.length;
        for ( i = 0; i < n; i++ ) {
            filter = makeHostnameFilter(parsed.f, tokenBeg, parsed.hostnames[i]);
            this.addFilterEntry(
                filter,
                parsed,
                SpecificParty | this.toDomainBits(parsed.domains[i]),
                tokenBeg,
                tokenEnd
            );
        }
        n = parsed.notHostnames.length;
        for ( i = 0; i < n; i++ ) {
            filter = makeNotHostnameFilter(parsed.f, tokenBeg, parsed.notHostnames[i]);
            this.addFilterEntry(
                filter,
                parsed,
                SpecificNotParty | this.toDomainBits(parsed.notDomains[i]),
                tokenBeg,
                tokenEnd
            );
        }
    } else {
        filter = makeFilter(parsed.f, tokenBeg);
        if ( parsed.firstParty ) {
            this.addFilterEntry(filter, parsed, FirstParty, tokenBeg, tokenEnd);
        } else if ( parsed.thirdParty ) {
            this.addFilterEntry(filter, parsed, ThirdParty, tokenBeg, tokenEnd);
        } else {
            this.addFilterEntry(filter, parsed, AnyParty, tokenBeg, tokenEnd);
        }
    }
    return true;
};

/******************************************************************************/

FilterContainer.prototype.addFilterEntry = function(filter, parsed, party, tokenBeg, tokenEnd) {
    var s = parsed.f;
    var prefixKey = trimChar(s.substring(tokenBeg - 1, tokenBeg), '*');
    var suffixKey = trimChar(s.substring(tokenEnd, tokenEnd + 2), '*');
    var tokenKey = prefixKey + s.slice(tokenBeg, tokenEnd) + suffixKey;
    if ( parsed.types.length === 0 ) {
        this.addToCategory(parsed.action | AnyType | party, tokenKey, filter);
        return;
    }
    var n = parsed.types.length;
    for ( var i = 0; i < n; i++ ) {
        this.addToCategory(parsed.action | parsed.types[i] | party, tokenKey, filter);
    }
};

/******************************************************************************/

FilterContainer.prototype.addToCategory = function(category, tokenKey, filter) {
    var categoryKey = this.makeCategoryKey(category);
    var categoryBucket = this.categories[categoryKey];
    if ( !categoryBucket ) {
        categoryBucket = this.categories[categoryKey] = {};
    }
    var filterEntry = categoryBucket[tokenKey];
    if ( filterEntry === undefined ) {
        categoryBucket[tokenKey] = filter;
        return;
    }
    if ( filterEntry instanceof FilterBucket ) {
        filterEntry.add(filter);
        return;
    }
    categoryBucket[tokenKey] = new FilterBucket(filterEntry, filter);
};

/******************************************************************************/

// Reset all, thus reducing to a minimum memory footprint of the context.

FilterContainer.prototype.reset = function() {
    this.processedFilterCount = 0;
    this.supportedFilterCount = 0;
    this.allowFilterCount = 0;
    this.blockFilterCount = 0;
    this.categories = {};
};

/******************************************************************************/
/*
var adbProfiler = {
    testSwitch: false,
    testCount: 0,
    urlCount: 0,
    dumpEach: 200,
    countUrl: function() {
        this.urlCount += 1;
        if ( (this.urlCount % this.dumpEach) === 0 ) {
            this.dump();
        }
    },
    testCounter: function(on) {
        this.testSwitch = on;
    },
    countTest: function() {
        if ( this.testSwitch ) {
            this.testCount += 1;
        }
    },
    dump: function() {
        console.log('HTTPSB.adbProfiler> number or filters tested per URL: %d (sample: %d URLs)', this.testCount / this.urlCount, this.urlCount);
    },
    reset: function() {
        this.testCount = 0;
        this.urlCount = 0;
    },
    dummy: 0
};
*/
/*
var histogram = function(label, categories) {
    var h = [],
        categoryBucket;
    for ( var k in categories ) {
        if ( categories.hasOwnProperty(k) === false ) {
            continue;
        }
        categoryBucket = categories[k];
        for ( var kk in categoryBucket ) {
            if ( categoryBucket.hasOwnProperty(kk) === false ) {
                continue;
            }
            filterBucket = categoryBucket[kk];
            h.push({
                k: k + ' ' + kk,
                n: filterBucket instanceof FilterBucket ? filterBucket.filters.length : 1
            });
        }
    }

    console.log('Histogram %s', label);

    var total = h.length;
    h.sort(function(a, b) { return b.n - a.n; });

    // Find indices of entries of interest
    var target = 2;
    for ( var i = 0; i < total; i++ ) {
        if ( h[i].n === target ) {
            console.log('\tEntries with only %d filter(s) start at index %s (key = "%s")', target, i, h[i].k);
            target -= 1;
        }
    }

    h = h.slice(0, 50);

    h.forEach(function(v) {
        console.log('\tkey=%s  count=%d', v.k, v.n);
    });
    console.log('\tTotal buckets count: %d', total);
};
*/

/*
2014-04-13:
    Did collect some objective measurements today, using "15 top
    news web sites" benchmark. Here:

    Adblock Plus:
        ABP.adbProfiler> number or URLs tested: 8364
        ABP.adbProfiler> number or filters tested per URL: 114

    HTTPSB:
        HTTPSB.adbProfiler> number or URLs tested: 8307
        HTTPSB.adbProfiler> number or filters tested per URL: 4

    ABP on average tests 114 filters per URL.
    HTTPSB on average tests 4 filters per URL.

    The low average number of filters to per URL to test is key to
    HTTPSB excellent performance over ABP. It's all in the much smaller bucket
    size...

2014-05-05:
    Now supporting whitelist filters, so I ran another benchmark but this time
    taking into account hits to whitelist filters, and I completely disabled
    matrix filtering, in order to ensure all request URLs reach HTTPSB's
    ABP filtering engine, thus results are a worst case scenario for HTTPSB.
    Here:
    
    Adblock Plus:
        ABP.adbProfiler> number or URLs tested: 10600
        ABP.adbProfiler> number or filters tested per URL: 121
    
    HTTPSB:
        HTTPSB.adbProfiler> number or URLs tested: 12600
        HTTPSB.adbProfiler> number or filters tested per URL: 5

    ABP on average tests 121 filters per URL.
    HTTPSB on average tests 5 filters per URL.
    
    Note: Overall, less URLs were tested by ABP because it uses an internal
    cache mechanism to avoid testing URL, which is probably an attempt at
    mitigating the cost of testing so many filters for each URL. ABP's cache
    mechanism itself is another reason ABP is memory-hungry.
    
2014-05-13:

New histogram (see history on github for older histograms). All filters sit
in virtually one collection. 

Top 50 (key prefix removed because it displayed as garbage):
	key= doubleclick.n  count=91
	key= 2mdn.n  count=31
	key= google-a  count=28
	key= /ad_s  count=28
	key= 2mdn.n  count=26
	key= yahoo.c  count=25
	key= /cgi-b  count=24
	key= cloudfront.n  count=22
	key= pagead2.g  count=22
	key= /ads/s  count=21
	key= distrowatch.c  count=21
	key= amazonaws.c  count=20
	key= 2mdn.n  count=20
	key= google-a  count=20
	key= 2mdn.n  count=19
	key= doubleclick.n  count=19
	key= doubleclick.n  count=19
	key= 2mdn.n  count=19
	key= 2mdn.n  count=18
	key= .gif?  count=18
	key= /ad_l  count=18
	key= /ads/p  count=18
	key= 2mdn.n  count=17
	key= /ads/b  count=17
	key= /ads/  count=17
	key= /ad_c  count=17
	key= /ad_b  count=17
	key= pagead2.g  count=16
	key= messianictimes.c  count=16
	key= /ad_t  count=16
	key= /ad_f  count=15
	key= /ad_h  count=15
	key= /wp-c  count=15
	key= hulu.c  count=15
	key= 2mdn.n  count=14
	key= /google_a  count=14
	key= /ad/s  count=14
	key= /ad_r  count=14
	key= 2mdn.n  count=14
	key= /ad_p  count=13
	key= /ad-i  count=13
	key= /google-a  count=13
	key= /ss/  count=13
	key= /ads/a  count=13
	key= /ad-l  count=13
	key= g.d  count=13
	key= .net/a  count=12
	key= facebook.c  count=12
	key= 2mdn.n  count=12
	key= js.r  count=12
	Entries with only 2 filter(s) start at index 952 (key = " united-d")
	Entries with only 1 filter(s) start at index 2435 (key = " /analyticstracking_") 
    Total buckets count: 22149

TL;DR:
    Worst case scenario = 91 filters to test

    In both collections, worst case scenarios are a very small minority of the
    whole set.
    
    Memory footprint could be further reduced by using a hashed token for all
    those buckets which contain less than [?] filters (and splitting the maps
    in two, one for token-as-hash and the other for good-hash-from-token).
    Side effects: added overhead, improved memory footprint.

Need to measure average test count/URL, roughly under 10 last time I checked
with the new code.

*/

/******************************************************************************/

FilterContainer.prototype.freeze = function() {
    // histogram('allFilters', this.categories);
};

/******************************************************************************/

FilterContainer.prototype.matchToken = function(category) {
    var categoryBucket = this.categories[this.makeCategoryKey(category)];
    if ( categoryBucket === undefined ) {
        return false;
    }
    var url = this.url;
    var beg = this.tokenBeg;
    var end = this.tokenEnd;
    var right = url.length - end;
    var f;
    
    if ( right > 1 ) {
        if ( beg !== 0 ) {
            f = categoryBucket[url.slice(beg-1, end+2)];
            if ( f !== undefined && f.match(url, beg) !== false ) {
                return f.s;
            }
        }
        f = categoryBucket[url.slice(beg, end+2)];
        if ( f !== undefined && f.match(url, beg) !== false ) {
            return f.s;
        }
    }
    if ( right > 0 ) {
        if ( beg !== 0 ) {
            f = categoryBucket[url.slice(beg-1, end+1)];
            if ( f !== undefined && f.match(url, beg) !== false ) {
                return f.s;
            }
        }
        f = categoryBucket[url.slice(beg, end+1)];
        if ( f !== undefined && f.match(url, beg) !== false ) {
            return f.s;
        }
    }
    if ( beg !== 0 ) {
        f = categoryBucket[url.slice(beg-1, end)];
        if ( f !== undefined && f.match(url, beg) !== false ) {
            return f.s;
        }
    }
    f = categoryBucket[url.slice(beg, end)];
    if ( f !== undefined && f.match(url, beg) !== false ) {
        return f.s;
    }
    return false;
};

/******************************************************************************/

FilterContainer.prototype.matchString = function(pageStats, url, requestType, requestHostname) {
    // adbProfiler.countUrl();
    // adbProfiler.testCounter(true);

    // https://github.com/gorhill/httpswitchboard/issues/239
    // Convert url to lower case:
    //     `match-case` option not supported, but then, I saw only one
    //     occurrence of it in all the supported lists (bulgaria list).
    this.url = url.toLowerCase();

    // The logic here is simple:
    //
    // block = !whitelisted &&  blacklisted
    //   or equivalent
    // allow =  whitelisted || !blacklisted

    // Since statistically a hit on a block filter is more likely than a hit
    // on an allow filter, we test block filters first, and then if and only
    // if there is a hit on a block filter do we test against allow filters.
    // This helps performance compared to testing against both classes of
    // filters in the same loop.

    var matches;
    var pageDomain = pageStats.pageDomain;
    var party = requestHostname.slice(-pageDomain.length) === pageDomain ?
        FirstParty :
        ThirdParty;
    var domainParty = this.toDomainBits(pageDomain);
    var type = typeNameToTypeValue[requestType];
    var bf = false;

    // This will be used by hostname-based filter
    pageHostname = pageStats.pageHostname;

    // Test against block filters
    reAnyToken.lastIndex = 0;
    while ( matches = reAnyToken.exec(url) ) {
        this.tokenBeg = matches.index;
        this.tokenEnd = reAnyToken.lastIndex;
        bf = this.matchToken(BlockAnyTypeAnyParty);
        if ( bf !== false ) { break; }
        bf = this.matchToken(BlockAnyType | party);
        if ( bf !== false ) { break; }
        bf = this.matchToken(BlockAnyTypeOneParty | domainParty);
        if ( bf !== false ) { break; }
        bf = this.matchToken(BlockAnyTypeOtherParties | domainParty);
        if ( bf !== false ) { break; }
        bf = this.matchToken(BlockAnyParty | type);
        if ( bf !== false ) { break; }
        bf = this.matchToken(BlockAction | type | party);
        if ( bf !== false ) { break; }
        bf = this.matchToken(BlockOneParty | type | domainParty);
        if ( bf !== false ) { break; }
        bf = this.matchToken(BlockOtherParties | type | domainParty);
        if ( bf !== false ) { break; }
    }

    // If there was no block filter, no need to test against allow filters
    if ( bf === false ) {
        return false;
    }

    // Test against allow filters
    reAnyToken.lastIndex = 0;
    while ( matches = reAnyToken.exec(url) ) {
        this.tokenBeg = matches.index;
        this.tokenEnd = reAnyToken.lastIndex;
        if ( this.matchToken(AllowAnyTypeAnyParty) !== false )
            { return false; }
        if ( this.matchToken(AllowAnyType | party) !== false )
            { return false; }
        if ( this.matchToken(AllowAnyTypeOneParty | domainParty) !== false )
            { return false; }
        if ( this.matchToken(AllowAnyTypeOtherParties | domainParty) !== false )
            { return false; }
        if ( this.matchToken(AllowAnyParty | type) !== false )
            { return false; }
        if ( this.matchToken(AllowAction | type | party) !== false )
            { return false; }
        if ( this.matchToken(AllowOneParty | type | domainParty) !== false )
            { return false; }
        if ( this.matchToken(AllowOtherParties | type | domainParty) !== false )
            { return false; }
    }

    return bf;
};

/******************************************************************************/

FilterContainer.prototype.getFilterCount = function() {
    return this.blockFilterCount + this.allowFilterCount;
};

/******************************************************************************/

HTTPSB.abpFilters = new FilterContainer();

/******************************************************************************/

})();

/******************************************************************************/
