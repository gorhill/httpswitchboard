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
    var maxDisplayLength = 28;

    var qparse = function() {
        var values = {};
        var q = window.location.search.substr(1);
        var args = q.split('&');
        var i = args.length;
        var arg;
        while ( i-- ) {
            arg = args[i].split('=');
            values[decodeURIComponent(arg[0])] = decodeURIComponent(arg[1]);
        }
        return values;
    }

    var values = qparse();
    var html = [];

    html.push(
        values.domain,
        '<br>'
        );
    var e = document.getElementById('httpsb-pre');
    if ( e ) {
        e.innerHTML = html.join('');
    }
/*
    html.push(
        '<br><a href="',
        values.url,
        '" title="',
        values.url,
        '">',
        values.url.slice(0, maxDisplayLength),
        values.url.length > maxDisplayLength ? '...' : '',
        '</a>'
        );
*/
})();
