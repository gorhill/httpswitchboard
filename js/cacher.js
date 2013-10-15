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

var Cacher = {
    questions: {},

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
    }
};

