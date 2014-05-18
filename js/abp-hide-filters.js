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

// Good for id- and class-based filters

var FilterPlain = function(s) {
    this.s = s;
};

FilterPlain.prototype.retrieve = function(s, out) {
    if ( s === this.s.slice(0, s.length) ) {
        out.push(this.s);
    }
};

/******************************************************************************/

var FilterPlainHostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainHostname.prototype.retrieve = function(s, out) {
    if ( s === this.s.slice(0, s.length) && pageHostname === this.hostname ) {
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
        this.anchor = s.indexOf('#@');
        if ( this.anchor < 0 ) {
            this.invalid = true;
            return this;
        }
    }
    this.filterType = s.charAt(this.anchor + 1);
    if ( this.anchor > 0 ) {
        this.hostnames = s.slice(0, this.anchor).split(/\s*,\s*/);
    }
    this.f = s.slice(this.anchor + 2);

    // selector
    var selectorType = this.f.charAt(0);
    if ( selectorType === '#' || selectorType === '.' ) {
        return this;
    }

    this.unspported = true;

    return this;
};

/******************************************************************************/

var FilterContainer = function() {
    this.filterParser = new FilterParser();
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.filters = {};
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
    // histogram('allFilters', this.filters);
};

/******************************************************************************/

FilterContainer.prototype.makeHash = function(filterType, selector, domain) {
    var i = (selector.length - 1) >> 2;
    var hash = String.fromCharCode(
        filterType.charCodeAt(0) << 8 |
        selector.charCodeAt(0)
        ,
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
    if ( parsed.hostnames.length ) {
        return this.addPlainFilterHostname(parsed);
    }
    var f = new FilterPlain(parsed.f);
    var hash = this.makeHash(parsed.filterType, parsed.f);
    this.addFilterEntry(hash, f);
    return true;
};

/******************************************************************************/

FilterContainer.prototype.addPlainFilterHostname = function(parsed) {
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
    return { hide: hideSelectors, donthide: donthideSelectors };
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
