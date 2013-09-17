/*******************************************************************************

    scripthq - a Chromium browser extension to black/white list requests.
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

    Home: https://github.com/gorhill/scripthq
*/

(function(){
    // tell the extension what we are doing
    var port = chrome.extension.connect();

    // make internal tree representation of white/black lists
    var makeTrees = function(nobloat, tab) {
        var tree = {
            domains: {},
            types: {}
        };
        var types = tree.types;
        var domains = tree.domains;
        var urlParts;
        var domain;
        var nodes, nodeName;
        for ( var urlKey in tab.urls ) {
            urlParts = nobloat.getUrlParts(urlKey);
            domain = urlParts.domain;
            nodes = domain.split('.');
            while ( nodes.length > 1 ) {
                nodeName = nodes.join('.');
                if ( !domains[nodeName] ) {
                    domains[nodeName] = 1;
                } else {
                    domains[nodeName] += 1;
                }
                nodes = nodes.slice(1);
            }
            for ( var typeKey in tab.urls[urlKey].types ) {
                if ( !types[typeKey] ) {
                    types[typeKey] = {};
                }
                nodes = domain.split('.');
                while ( nodes.length > 1 ) {
                    nodeName = nodes.join('.');
                    if ( !types[typeKey][nodeName] ) {
                        types[typeKey][nodeName] = 1;
                    } else {
                        types[typeKey][nodeName] += 1;
                    }
                    nodes = nodes.slice(1);
                }
            }
        }
        return tree;
    };

    // translate black/white list status of something into a css class
    // allowed (direct implied)
    // disallowed (direct implied)
    // allowed-inherited
    // disallowed-inherited
    var getPermissionClass = function(nobloat, type, domain) {
        var result = nobloat.evaluate(type, domain);
        if ( result === nobloat.DISALLOWED_DIRECT ) {
            return 'filter-disallowed';
        }
        if ( result === nobloat.ALLOWED_DIRECT ) {
            return 'filter-allowed';
        }
        if ( result === nobloat.ALLOWED_INDIRECT ) {
            return 'filter-allowed-indirect';
        }
        if ( result === nobloat.DISALLOWED_INDIRECT ) {
            return 'filter-disallowed-indirect';
        }
        return 'filter-disallowed';
    };

    // pretty names
    var typeNames = {
        "image": "images",
        "object": "objects",
        "script": "scripts",
        "xmlhttprequest": "XHR",
        "sub_frame": "frames",
        "other": "others"
    };

    // build menu according to white and black lists
    var makeMenu = function(tabs) {
        var nobloat = chrome.extension.getBackgroundPage().NoBloat;
        var chromeTab = tabs[0];
        var tab = nobloat.requests[chromeTab.id];
        var topUrlParts = nobloat.getUrlParts(chromeTab.url);
        var trees = makeTrees(nobloat, tab);

        var html = [];

        html.push('<table>');

        // few top sites with most requests
        var domainKeys = Object.keys(trees.domains);
        domainKeys.sort(function(a,b) {
            a = a.split('.').reverse().join('.');
            b = b.split('.').reverse().join('.');
            return a.localeCompare(b);
        });
        var domainKey, typeKey;
        var iDomain, iType;
        var nDomains = Math.min(domainKeys.length);
        var typeKeys = Object.keys(typeNames);

        // header
        html.push(
            '<tr>',
            '<td',
            ' class="filter-button ', getPermissionClass(nobloat, '*', '*'), '"',
            ' data-filter-type="*" data-filter-domain="*"',
            '>'
            );

        // type of requests
        for ( iType = 0; iType < typeKeys.length; iType++ ) {
            typeKey = typeKeys[iType];
            html.push(
            '<td',
            ' class="filter-button ', getPermissionClass(nobloat, typeKey, '*'), '"',
            ' data-filter-type="', typeKey, '"',
            ' data-filter-domain="*"',
            '>',
            typeNames[typeKey]
            );
        }

        // domains
        for ( iDomain = 0; iDomain < nDomains; iDomain++ ) {
            domainKey = domainKeys[iDomain];
            html.push(
                '<tr>',
                '<td',
                ' class="filter-button ', getPermissionClass(nobloat, '*', domainKey), '"',
                ' data-filter-type="*"',
                ' data-filter-domain="', domainKey, '"',
                '>',
                domainKey
                );

            // type of requests
            for ( iType = 0; iType < typeKeys.length; iType++ ) {
                typeKey = typeKeys[iType];
                var domains = trees.types[typeKey];
                if ( domains && domains[domainKey] ) {
                    html.push(
                        '<td',
                        ' class="filter-button ', getPermissionClass(nobloat, typeKey, domainKey), '"',
                        ' data-filter-type="', typeKey, '"',
                        ' data-filter-domain="', domainKey, '"',
                        '>',
                        domains[domainKey]
                        );
                } else {
                    html.push('<td>');
                }
            }
        }
        html.push('</table>');

        // inject html in popup menu
        $('#filters').html(html.join(''));
    };

    // update visual of all filter buttons
    var updateFilterButtons = function(nobloat) {
        $('.filter-button').each(function() {
            var button = $(this);
            var type = button.data('filterType');
            var domain = button.data('filterDomain');
            var newClass = getPermissionClass(nobloat, type, domain);
            if ( newClass === '' || !button.hasClass(newClass) ) {
                button.removeClass('filter-allowed filter-disallowed filter-allowed-indirect filter-disallowed-indirect');
                button.addClass(newClass);
                port.postMessage({});
            }
        });
    };

    // handle user interaction with filters
    var handleFilter = function() {
        var nobloat = chrome.extension.getBackgroundPage().NoBloat;
        var button = $(this);
        var type = button.data('filterType');
        var domain = button.data('filterDomain');
        var currentClass = getPermissionClass(nobloat, type, domain);
        // special case: root toggle only between two states
        if ( type === '*' && domain === '*' ) {
            if ( currentClass === 'filter-allowed' ) {
                nobloat.disallow(type, domain);
            } else {
                nobloat.allow(type, domain);
            }
        } else {
            if ( currentClass === 'filter-allowed-indirect' || currentClass === 'filter-disallowed-indirect' ) {
                nobloat.allow(type, domain);
            } else if ( button.hasClass('filter-allowed') ) {
                nobloat.disallow(type, domain);
            } else {
                nobloat.graylist(type, domain);
            }
        }
        updateFilterButtons(nobloat);
    };

    // make menu only when popup html is fully loaded
    document.addEventListener('DOMContentLoaded', function () {
        chrome.tabs.query({currentWindow: true, active: true}, makeMenu);
        $('#filters').delegate('.filter-button', 'click', handleFilter);
    });
})();
