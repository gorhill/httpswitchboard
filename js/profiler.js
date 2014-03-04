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

function Profiler() {
    this.time = 0;
    this.count = -3;
    this._start = 0;
    this._lastlog = 0;
}

Profiler.prototype.reset = function() {
    this.time = 0;
    this.count = -3;
    this._start = 0;
};

Profiler.prototype.start = function() {
    this._start = Date.now();
};

Profiler.prototype.stop = function(s) {
    this.count += 1;
    if ( this.count > 0 ) {
        var now = Date.now();
        this.time += now - this._start;
        if ( (now - this._lastlog) > 10000 ) {
            console.log('HTTP Switchboard Profiler() > %s: %f ms per iteration', s, this.avg());
            this._lastlog = now;
        }
    }
};

Profiler.prototype.avg = function() {
    return this.count > 0 ? this.time / this.count : 0;
};

var quickProfiler = new Profiler();

