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

HTTPSB.LiquidDict = function() {
    this.dict = {};
    this.count = 0;
    this.bucketCount = 0;

    // Somewhat arbitrary: I need to come up with hard data to know at which
    // point binary search is better than indexOf.
    this.cutoff = 500;
};

/******************************************************************************/

// How the key is derived dictates the number and size of buckets.

// Currently, key = 'k' + [2 lsb of 4 chars] + [len]
// [len] at the end is convenient because we can look it up easily using
// String.slice() since the first part of the key is fixed width.

HTTPSB.LiquidDict.prototype.makeKey = function(word) {
    var len = word.length;
    var i = len >> 2;
    return 'k' +
        (word.charCodeAt(    0) & 0x03) +
        (word.charCodeAt(    i) & 0x03) +
        (word.charCodeAt(  i+i) & 0x03) +
        (word.charCodeAt(i+i+i) & 0x03) +
        len;
};

/******************************************************************************/

HTTPSB.LiquidDict.prototype.test = function(word) {
    var key = this.makeKey(word);
    var bucket = this.dict[key];
    if ( bucket === undefined ) {
        return false;
    }
    if ( typeof bucket === 'object' ) {
        this.dict[key] = bucket = this.freezeBucket(bucket);
    }
    if ( bucket.charAt(0) === ' ' ) {
        return bucket.indexOf(' ' + word + ' ') >= 0;
    }
    // binary search
    var len = word.length;
    var left = 0;
    // http://jsperf.com/or-vs-floor/3
    var right = ~~(bucket.length / len + 0.5);
    var i, needle;
    while ( left < right ) {
        i = left + right >> 1;
        needle = bucket.substr( len * i, len );
        if ( word < needle ) {
            right = i;
        } else if ( word > needle ) {
            left = i + 1;
        } else {
            return true;
        }
    }
    return false;
};

/******************************************************************************/

HTTPSB.LiquidDict.prototype.add = function(word) {
    var key = this.makeKey(word);
    var bucket = this.dict[key];
    if ( bucket === undefined ) {
        this.dict[key] = bucket = {};
        this.bucketCount += 1;
        bucket[word] = true;
        this.count += 1;
        return true;
    } else if ( typeof bucket === 'string' ) {
        this.dict[key] = bucket = this.meltBucket(word.len, bucket);
    }
    if ( bucket[word] === undefined ) {
        bucket[word] = true;
        this.count += 1;
        return true;
    }
    return false;
};

/******************************************************************************/

HTTPSB.LiquidDict.prototype.freezeBucket = function(bucket) {
    var words = Object.keys(bucket);
    var wordLen = words[0].length;
    if ( wordLen * words.length < this.cutoff ) {
        return ' ' + words.join(' ') + ' ';
    }
    return words.sort().join('');
};

HTTPSB.LiquidDict.prototype.freeze = function() {
    var buckets = this.dict;
    var bucket;
    for ( var key in buckets ) {
        bucket = buckets[key];
        if ( typeof bucket === 'object' ) {
            buckets[key] = this.freezeBucket(bucket);
        }
    }
};

/******************************************************************************/

HTTPSB.LiquidDict.prototype.meltBucket = function(len, bucket) {
    var map = {};
    if ( bucket.charAt(0) === ' ' ) {
        bucket.trim().split(' ').map(function(k) {
            map[k] = true;
        });
    } else {
        var offset = 0;
        while ( offset < bucket.length ) {
            map[bucket.substring(offset, len)] = true;
            offset += len;
        }
    }
    return map;
};

HTTPSB.LiquidDict.prototype.melt = function() {
    var buckets = this.dict;
    var bucket;
    for ( var key in buckets ) {
        bucket = buckets[key];
        if ( typeof bucket === 'string' ) {
            buckets[key] = this.meltBucket(parseInt(key.slice(5), 10), bucket);
        }
    }
};

/******************************************************************************/

HTTPSB.LiquidDict.prototype.reset = function() {
    this.dict = {};
    this.count = 0;
    this.bucketCount = 0;
};

/******************************************************************************/

HTTPSB.ubiquitousBlacklist = new HTTPSB.LiquidDict();
// HTTPSB.ubiquitousWhitelist = new HTTPSB.LiquidDict();

