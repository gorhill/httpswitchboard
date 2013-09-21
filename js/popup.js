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

(function(){
    // tell the extension what we are doing
    var port = chrome.extension.connect();
    var background = chrome.extension.getBackgroundPage();
    var httpsb = background.HTTPSB;

    // make internal tree representation of white/black lists
    var makeTrees = function(tab) {
        var tree = {
            domains: {},
            types: {}
        };
        // this can happen if domain in tab is evil
        if ( !tab ) {
            return;
        }
        var types = tree.types;
        var domains = tree.domains;
        var urlParts;
        var domain;
        var nodes, nodeName;
        for ( var urlKey in tab.urls ) {
            urlParts = background.getUrlParts(urlKey);
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
    var getCurrentClass = function(domain, type) {
        var result = background.evaluate(type, domain);
        if ( result === httpsb.DISALLOWED_DIRECT ) {
            return 'filter-disallowed';
        }
        if ( result === httpsb.ALLOWED_DIRECT ) {
            return 'filter-allowed';
        }
        if ( result === httpsb.ALLOWED_INDIRECT ) {
            return 'filter-allowed-indirect';
        }
        if ( result === httpsb.DISALLOWED_INDIRECT ) {
            return 'filter-disallowed-indirect';
        }
        return 'filter-disallowed';
    };

    // compute next class from current class
    var getNextClass = function(currentClass, domain, type) {
        // special case: root toggle only between two states
        if ( type === '*' && domain === '*' ) {
            if ( currentClass === 'filter-allowed' ) {
                return 'filter-disallowed';
            }
            return 'filter-allowed';
        }
        if ( currentClass === 'filter-allowed-indirect' || currentClass === 'filter-disallowed-indirect' ) {
            return 'filter-disallowed';
        }
        if ( currentClass === 'filter-disallowed' ) {
            return 'filter-allowed';
        }
        // if ( currentClass === 'filter-allowed' )
        return '';
    };

    // update visual of all filter buttons
    var updateFilterButtons = function() {
        $('.filter-button').each(function() {
            var button = $(this);
            var type = button.data('filterType');
            var domain = button.data('filterDomain');
            var newClass = getCurrentClass(domain, type);
            if ( newClass === '' || !button.hasClass(newClass) ) {
                button.removeClass('filter-allowed filter-disallowed filter-allowed-indirect filter-disallowed-indirect');
                button.addClass(newClass);
                port.postMessage({});
            }
        });
    };

    // pretty names
    var typeNames = {
        "main_frame": "page",
        "image": "images",
        "object": "objects",
        "script": "scripts",
        "xmlhttprequest": "XHR",
        "sub_frame": "frames",
        "other": "others"
    };

    // build menu according to white and black lists
    var makeMenu = function(tabs) {
        var chromeTab = tabs[0];
        var tab = httpsb.requests[chromeTab.id];
        var topUrlParts = background.getUrlParts(chromeTab.url);
        var trees = makeTrees(tab);

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
            ' class="filter-button ', getCurrentClass('*', '*'), '"',
            ' data-filter-type="*" data-filter-domain="*"',
            '>&nbsp;'
            );

        // type of requests
        for ( iType = 0; iType < typeKeys.length; iType++ ) {
            typeKey = typeKeys[iType];
            html.push(
            '<td',
            ' class="filter-button ', getCurrentClass('*', typeKey), '"',
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
                ' class="filter-button ', getCurrentClass(domainKey, '*'), '"',
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
                        ' class="filter-button ', getCurrentClass(domainKey, typeKey), '"',
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

    // handle user interaction with filters
    var handleFilter = function(button) {
        var type = button.data('filterType');
        var domain = button.data('filterDomain');
        var currentClass = getCurrentClass(domain, type);
        var nextClass = getNextClass(currentClass, domain, type);
        if ( nextClass === 'filter-disallowed' ) {
            background.disallow(type, domain);
        } else if ( nextClass === 'filter-allowed' ) {
            background.allow(type, domain);
        } else {
            background.graylist(type, domain);
        }
        updateFilterButtons();
        handleFilterMessage(button);
    };

    // handle user mouse over filter buttons

    var mouseOverPrompts = {
        '+**': 'Click to <span class="filter-allowed">allow</span> all graylisted types and domains',
        '-**': 'Click to <span class="filter-disallowed">block</span> all graylisted types and domains',
        '+?*': 'Click to <span class="filter-allowed">allow</span> <strong>{{what}}</strong> from <strong>everywhere</strong> except blacklisted domains',
        '+*?': 'Click to <span class="filter-allowed">allow</span> <strong>everything</strong> from <strong>{{where}}</strong>',
        '+??': 'Click to <span class="filter-allowed">allow</span> <strong>{{what}}</strong> from <strong>{{where}}</strong>',
        '-?*': 'Click to <span class="filter-disallowed">block</span> <strong>{{what}}</strong> from <strong>everywhere</strong> except whitelisted domains',
        '-*?': 'Click to <span class="filter-disallowed">block</span> <strong>everything</strong> from <strong>{{where}}</strong>',
        '-??': 'Click to <span class="filter-disallowed">block</span> <strong>{{what}}</strong> from <strong>{{where}}</strong>',
        '.?*': 'Click to graylist <strong>{{what}}</strong> from <strong>everywhere</strong>',
        '.*?': 'Click to graylist <strong>everything</strong> from <strong>{{where}}</strong>',
        '.??': 'Click to graylist <strong>{{what}}</strong> from <strong>{{where}}</strong>'
    };

    var handleFilterMessage = function(button) {
        var type = button.data('filterType');
        var domain = button.data('filterDomain');
        var currentClass = getCurrentClass(domain, type);
        var nextClass = getNextClass(currentClass, domain, type);
        var action = nextClass === 'filter-allowed' ? '+' : (nextClass === 'filter-disallowed' ? '-' : '.');
        var what = type === '*' ? '*' : '?';
        var where = domain === '*' ? '*' : '?';
        var prompt = mouseOverPrompts[action + what + where];
        prompt = prompt.replace('{{what}}', typeNames[type]);
        prompt = prompt.replace('{{where}}', domain);
        $('#message').html(prompt);
    };

    // make menu only when popup html is fully loaded
    document.addEventListener('DOMContentLoaded', function () {
        chrome.tabs.query({currentWindow: true, active: true}, makeMenu);
        // to handle filter button
        $('#filters').delegate('.filter-button', 'click', function() {
            handleFilter($(this));
        });
        // to display useful message
        $('#filters').delegate('.filter-button', 'mouseenter', function() {
            handleFilterMessage($(this));
        });
        // to blank message
        $('#filters').delegate('.filter-button', 'mouseout', function() {
            $('#message').html('&nbsp;');
        });
    });
})();
