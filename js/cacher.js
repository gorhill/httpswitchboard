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

// This is the solution to avoid calling code which has shown to eat
// too many CPU cycles (profiling showed that URI.js/SLD.has and SLD.is
// are somewhat expensive calls in th context of analyzing net traffic).
// Trade-off is a larger memory footprint.
// For the record, profiling these two lines of code (used to handle web
// requests) showed:
//
//   var domain = getHostnameFromURL(url);
//   var block = blacklisted(type, domain);
//
// Without Cacher: 0.80 ms
//    With Cacher: 0.11 ms
// This on an 8 year old Inspiron 6000 running Linux Mint 15 and Chromium 28.

var Cacher = {
    questions: {},
    ttl: 15 * 60 * 1000,

    entry: function() {
        this.response = undefined;
        this.timeStamp = 0;
    },

    response: function(question) {
        var entry = this.questions[question];
        if ( entry === undefined ) {
            return undefined;
        }
        entry.timeStamp = Date.now();
        return entry.response;
    },

    remember: function(question, response) {
        var entry = this.questions[question];
        if ( entry === undefined ) {
            this.questions[question] = entry = new this.entry();
        }
        entry.timeStamp = Date.now();
        entry.response = response;
        return response;
    },

    forget: function(question) {
        delete this.questions[question];
    },

    exists: function(question) {
        return this.questions[question] !== undefined;
    },

    purge: function() {
        var count = 0;
        var now = Date.now();
        var ttl = this.ttl;
        var questions = this.questions;
        var keys = Object.keys(questions);
        var i = keys.length;
        var key;
        while ( i-- ) {
            key = keys[i];
            if ( (now - questions[key].timeStamp) >= ttl ) {
                delete questions[key];
                count += 1;
            }
        }
        console.debug('HTTP Switchboard > Cacher.purge() deleted %d entries', count);
    }
};

// purge obsolete questions, those not asked in the last, say, 15 minutes?
setInterval(function(){Cacher.purge();}, Cacher.ttl + 5 * 60 * 1000);

