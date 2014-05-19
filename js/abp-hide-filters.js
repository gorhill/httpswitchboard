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

/* jshint bitwise: false */
/* global HTTPSB */

/******************************************************************************/

HTTPSB.abpHideFilters = (function(){


/******************************************************************************/

var httpsb = HTTPSB;
var pageHostname = '';

/******************************************************************************/
/*
var histogram = function(label, buckets) {
    var h = [],
        bucket;
    for ( var k in buckets ) {
        if ( buckets.hasOwnProperty(k) === false ) {
            continue;
        }
        bucket = buckets[k];
        h.push({
            k: k,
            n: bucket instanceof FilterBucket ? bucket.filters.length : 1
        });
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
/******************************************************************************/

// Pure id- and class-based filters
// Examples:
//   #A9AdsMiddleBoxTop
//   .AD-POST

var FilterPlain = function(s) {
    this.s = s;
};

FilterPlain.prototype.retrieve = function(s, out) {
    if ( s === this.s ) {
        out.push(this.s);
    }
};

/******************************************************************************/

// Id- and class-based filters with extra selector stuff following.
// Examples:
//   #center_col > div[style="font-size:14px;margin-right:0;min-height:5px"] ...
//   #adframe:not(frameset)
//   .l-container > #fishtank

var FilterPlainMore = function(s) {
    this.s = s;
};

FilterPlainMore.prototype.retrieve = function(s, out) {
    if ( s === this.s.slice(0, s.length) ) {
        out.push(this.s);
    }
};

/******************************************************************************/

// Pure id- and class-based filters specific to a hostname
// Examples:
//   search.snapdo.com###ABottomD
//   facebook.com##.-cx-PRIVATE-fbAdUnit__root

var FilterPlainHostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainHostname.prototype.retrieve = function(s, out) {
    if ( s === this.s && pageHostname.slice(-this.hostname.length) === this.hostname ) {
        out.push(this.s);
    }
};

/******************************************************************************/

// Pure id- and class-based filters with extra selector stuff following and
// specific to a hostname
// Examples:
//   sltrib.com###BLContainer + div[style="height:90px;"]
//   myps3.com.au##.Boxer[style="height: 250px;"]

var FilterPlainMoreHostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainMoreHostname.prototype.retrieve = function(s, out) {
    if ( s === this.s.slice(0, s.length) && pageHostname.slice(-this.hostname.length) === this.hostname ) {
        out.push(this.s);
    }
};

/******************************************************************************/
/******************************************************************************/

var FilterBucket = function(a, b) {
    this.filters = [a, b];
};

FilterBucket.prototype.add = function(a) {
    this.filters.push(a);
};

FilterBucket.prototype.retrieve = function(s, out) {
    var i = this.filters.length;
    while ( i-- ) {
        this.filters[i].retrieve(s, out);
    }
};

/******************************************************************************/
/******************************************************************************/

var FilterParser = function() {
    this.f = '';
    this.anchor = 0;
    this.filterType = '#';
    this.hostnames = [];
    this.invalid = false;
    this.unsupported = false;
    this.rePlain = /#[#@]([#.][\w-]+)$/;
};

/******************************************************************************/

FilterParser.prototype.reset = function() {
    this.f = '';
    this.anchor = 0;
    this.filterType = '#';
    this.hostnames = [];
    this.invalid = false;
    this.unsupported = false;
    return this;
};

/******************************************************************************/

FilterParser.prototype.parse = function(s) {
    // important!
    this.reset();

    this.anchor = s.indexOf('##');
    if ( this.anchor < 0 ) {
        this.anchor = s.indexOf('#@#');
        if ( this.anchor < 0 ) {
            this.invalid = true;
            return this;
        }
    }
    this.filterType = s.charAt(this.anchor + 1);
    if ( this.anchor > 0 ) {
        this.hostnames = s.slice(0, this.anchor).split(/\s*,\s*/);
    }
    if ( this.filterType === '@' ) {
        this.f = s.slice(this.anchor + 3);
    } else {
        this.f = s.slice(this.anchor + 2);
    }

    // selector
    var selectorType = this.f.charAt(0);
    if ( selectorType === '#' || selectorType === '.' ) {
        return this;
    }

    this.unspported = true;

    return this;
};

/******************************************************************************/

FilterParser.prototype.extractPlain = function() {
    var matches = this.rePlain.exec(this.f);
    if ( matches && matches.length === 2 ) {
        return matches[1];
    }
    return '';
};

/******************************************************************************/

var FilterContainer = function() {
    this.filterParser = new FilterParser();
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.filters = {};
    this.rePlain = /^##[#.][\w-]+$/;
    this.rePlainMore = /^##[#.][\w-]+[^\w-]/;
};

/******************************************************************************/

// Reset all, thus reducing to a minimum memory footprint of the context.

FilterContainer.prototype.reset = function() {
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.filters = {};
};

/******************************************************************************/

FilterContainer.prototype.add = function(s) {
    var parsed = this.filterParser.parse(s);

    if ( parsed.invalid ) {
        return false;
    }

    var selectorType = parsed.f.charAt(0);
    if ( selectorType === '#' || selectorType === '.' ) {
        this.acceptedCount += 1;
        return this.addPlainFilter(parsed);
    }

    this.rejectedCount += 1;
    return false;
};

/******************************************************************************/

FilterContainer.prototype.freeze = function() {
    console.log('HTTPSB> adp-hide-filters.js: %d filters accepted', this.acceptedCount);
    console.log('HTTPSB> adp-hide-filters.js: %d filters rejected', this.rejectedCount);
    console.log('HTTPSB> adp-hide-filters.js: coverage is %s%', (this.acceptedCount * 100 / (this.acceptedCount+this.rejectedCount)).toFixed(1));

    // histogram('allFilters', this.filters);
};

/******************************************************************************/

FilterContainer.prototype.makeHash = function(filterType, selector, domain) {
    var i = (selector.length - 1) >> 2;
    var hash = String.fromCharCode(
        filterType.charCodeAt(0) << 8 |
        selector.charCodeAt(0),
        (selector.charCodeAt(1) & 0xF) << 12 |
        (selector.charCodeAt(1+i) & 0xF) << 8 |
        (selector.charCodeAt(1+i+i) & 0xF) << 4 |
        (selector.charCodeAt(1+i+i+i) & 0xF)
    );
    if ( !domain ) {
        return hash;
    }
    i = domain.length >> 2;
    return hash + String.fromCharCode(
        domain.charCodeAt(0) << 8 |
        domain.charCodeAt(i),
        domain.charCodeAt(i+i) << 8 |
        domain.charCodeAt(i+i+i)
    );
};

/******************************************************************************/

FilterContainer.prototype.addPlainFilter = function(parsed) {
    // Verify whether the plain selector is followed by extra selector stuff
    if ( this.rePlainMore.test(parsed.f) ) {
        return this.addPlainMoreFilter(parsed);
    }
    if ( parsed.hostnames.length ) {
        return this.addPlainHostnameFilter(parsed);
    }
    var f = new FilterPlain(parsed.f);
    var hash = this.makeHash(parsed.filterType, parsed.f);
    this.addFilterEntry(hash, f);
};

/******************************************************************************/

FilterContainer.prototype.addPlainHostnameFilter = function(parsed) {
    var httpsburi = HTTPSB.URI;
    var f, hash;
    var hostnames = parsed.hostnames;
    var i = hostnames.length;
    var hostname;
    while ( i-- ) {
        hostname = hostnames[i];
        if ( !hostname ) {
            continue;
        }
        f = new FilterPlainHostname(parsed.f, hostname);
        hash = this.makeHash(parsed.filterType, parsed.f, httpsburi.domainFromHostname(hostname));
        this.addFilterEntry(hash, f);
    }
};

/******************************************************************************/

FilterContainer.prototype.addPlainMoreFilter = function(parsed) {
    if ( parsed.hostnames.length ) {
        return this.addPlainMoreHostnameFilter(parsed);
    }
    var plainSelector = parsed.extractPlain();
    if ( plainSelector === '' ) {
        return;
    }
    var f = new FilterPlainMore(parsed.f);
    var hash = this.makeHash(parsed.filterType, plainSelector);
    this.addFilterEntry(hash, f);
};

/******************************************************************************/

FilterContainer.prototype.addPlainMoreHostnameFilter = function(parsed) {
    var plainSelector = parsed.extractPlain();
    if ( plainSelector === '' ) {
        return;
    }
    var httpsburi = HTTPSB.URI;
    var f, hash;
    var hostnames = parsed.hostnames;
    var i = hostnames.length;
    var hostname;
    while ( i-- ) {
        hostname = hostnames[i];
        if ( !hostname ) {
            continue;
        }
        f = new FilterPlainMoreHostname(parsed.f, hostname);
        hash = this.makeHash(parsed.filterType, parsed.f, httpsburi.domainFromHostname(hostname));
        this.addFilterEntry(hash, plainSelector);
    }
};

/******************************************************************************/

FilterContainer.prototype.addFilterEntry = function(hash, f) {
    var bucket = this.filters[hash];
    if ( bucket === undefined ) {
        this.filters[hash] = f;
    } else if ( bucket instanceof FilterBucket ) {
        bucket.add(f);
    } else {
        this.filters[hash] = new FilterBucket(bucket, f);
    }
};

/******************************************************************************/

FilterContainer.prototype.retrieve = function(url, inSelectors) {
    if ( !httpsb.getTemporaryABPFilteringFromPageURL(url) ) {
        return;
    }
    var hostname = pageHostname = httpsb.URI.hostnameFromURI(url);
    var domain = httpsb.URI.domainFromHostname(hostname);
    var hideSelectors = [];
    var donthideSelectors = [];
    var i = inSelectors.length;
    var selector, hash, bucket;
    while ( i-- ) {
        selector = inSelectors[i];
        if ( !selector ) {
            continue;
        }
        hash = this.makeHash('#', selector);
        bucket = this.filters[hash];
        if ( bucket ) {
            bucket.retrieve(selector, hideSelectors);
        }
        hash = this.makeHash('#', selector, domain);
        bucket = this.filters[hash];
        if ( bucket ) {
            bucket.retrieve(selector, hideSelectors);
        }
        hash = this.makeHash('@', selector, domain);
        bucket = this.filters[hash];
        if ( bucket ) {
            bucket.retrieve(selector, donthideSelectors);
        }
    }
    return {
        hide: hideSelectors.join(','),
        donthide: donthideSelectors.join(',')
    };
};

/******************************************************************************/

FilterContainer.prototype.getFilterCount = function() {
    return this.acceptedCount;
};

/******************************************************************************/

return new FilterContainer();

/******************************************************************************/

})();

/******************************************************************************/
