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

// TODO: refactor this mess.
// TODO: Use Tempo.js

(function(){

/******************************************************************************/

// tell the extension what we are doing
var tabId; // this will be set later
var port = chrome.extension.connect();
var background = chrome.extension.getBackgroundPage();
var httpsb = background.HTTPSB;
var pageUrl = '';

var domainGroupsSnapshot = {};
var domainListSnapshot = 'dont leave this initial string empty';

var getDomainStats = function(pageStats) {
    if ( !pageStats ) { return {}; }

    // Try to not reshuffle permission groups around.
    var latestDomainListSnapshot = Object.keys(pageStats.domains).sort().join();
    if ( latestDomainListSnapshot === domainListSnapshot ) {
        return domainGroupsSnapshot;
    }
    domainListSnapshot = latestDomainListSnapshot;

    var domainGroups = {};

    // first group according to whether at least one node in the domain
    // hierarchy is white or blacklisted
    var domain;
    var rootDomain;
    var ancestor;
    var permission;
    for ( domain in pageStats.domains ) {
        rootDomain = background.getTopMostDomainFromDomain(domain);
        ancestor = domain;
        while ( ancestor ) {
            permission = background.evaluate('*', ancestor);
            if ( permission === httpsb.ALLOWED_DIRECT || permission === httpsb.DISALLOWED_DIRECT ) {
                break;
            }
            ancestor = background.getParentDomainFromDomain(ancestor);
        }
        if ( permission !== httpsb.ALLOWED_DIRECT && permission !== httpsb.DISALLOWED_DIRECT ) {
            permission = httpsb.GRAY;
        }
        if ( !domainGroups[permission] ) {
            domainGroups[permission] = {};
        }
        if ( !domainGroups[permission][rootDomain] ) {
            domainGroups[permission][rootDomain] = { all: {}, directs: {} };
        }
        domainGroups[permission][rootDomain].directs[domain] = true;
    }
    // Generate all nodes possible for each groups, this is useful
    // to allow users to toggle permissions for higher domains which is
    // not explicitly part of the web page.
    for ( permission in domainGroups ) {
        for ( rootDomain in domainGroups[permission] ) {
            for ( domain in domainGroups[permission][rootDomain].directs ) {
               ancestor = domain;
                while ( ancestor ) {
                    domainGroups[permission][rootDomain].all[ancestor] = domainGroups[permission][rootDomain].directs[ancestor];
                    ancestor = background.getParentDomainFromDomain(ancestor);
                }
            }
        }
    }

    domainGroupsSnapshot = domainGroups;

    return domainGroups;
}

// make internal tree representation of white/black lists
var getTypeStats = function(pageStats) {
    var typeStats = {};
    if ( pageStats ) {
        var domain;
        var type, url;
        for ( var reqKey in pageStats.requests ) {
            url = background.urlFromReqKey(reqKey);
            domain = background.getUrlDomain(url);
            type = background.typeFromReqKey(reqKey);
            if ( !typeStats[type] ) {
                typeStats[type] = {};
            }
            if ( !typeStats[type][domain] ) {
                typeStats[type][domain] = 1;
            } else {
                typeStats[type][domain] += 1;
            }
        }
    }
    return typeStats;
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
        // Need to cast to string or else data() method will convert to
        // numbers if it thinks it's a number (likewhen domain is '127.0.0.1'
        var type = String(button.data('filterType'));
        var domain = String(button.data('filterDomain'));
        var newClass = getCurrentClass(domain, type);
        if ( newClass === '' || !button.hasClass(newClass) ) {
            button.removeClass('filter-allowed filter-disallowed filter-allowed-indirect filter-disallowed-indirect');
            button.addClass(newClass);
            port.postMessage({});
        }
    });
};

var formatHeader = function(s) {
    var maxLength = 50;
    var msg = s.slice(0, maxLength);
    if ( s.length > maxLength ) {
        msg += '...';
    } else if ( s.length === 0 ) {
        msg = '&nbsp;';
    }
    return msg;
};

// pretty names
var typeNames = {
    'cookie': 'cookie',
    'image': 'image',
    'object': 'object',
    'script': 'script',
    'xmlhttprequest': 'XHR',
    'sub_frame': 'frame',
    'other': 'other'
};

// build menu according to white and black lists
// TODO: update incrementally

var makeMenu = function() {
    $('#message').html(formatHeader(pageUrl));

    var pageStats = background.pageStatsFromTabId(tabId);
    var domainStats = getDomainStats(pageStats);
    var typeStats = getTypeStats(pageStats);

    if ( Object.keys(domainStats).length === 0 ) {
        return;
    }

    var html = [];

    // header row
    html.push('<div class="matrix-row">');
    html.push(
        '<div',
        ' class="filter-button ', getCurrentClass('*', '*'), '"',
        ' data-filter-type="*" data-filter-domain="*"',
        '>all</div>'
        );

    // type of requests
    var iType;
    var typeKey;
    var types = Object.keys(typeNames);
    var type;
    for ( var i = 0; i < types.length; i++ ) {
        type = types[i];
        html.push(
        '<div',
        ' class="filter-button ', getCurrentClass('*', type), '"',
        ' data-filter-type="', type, '"',
        ' data-filter-domain="*"',
        '>',
        typeNames[type],
        '</div>'
        );
    }
    html.push('</div>');
    $('#matrix-head').html(html.join(''));

    html = [];

    // main rows, order by explicit permissions
    var permissions = [httpsb.ALLOWED_DIRECT, httpsb.GRAY, httpsb.DISALLOWED_DIRECT];
    var permissionNames = {};
    permissionNames[httpsb.ALLOWED_DIRECT] = 'whitelisted';
    permissionNames[httpsb.GRAY] = 'graylisted';
    permissionNames[httpsb.DISALLOWED_DIRECT] = 'blacklisted';

    var permission;
    var rootDomains;
    var rootDomain;
    var domains;
    var domain;
    var count;
    for ( var iPermission = 0; iPermission < permissions.length; iPermission++ ) {
        permission = permissions[iPermission];
        if ( !domainStats[permission] ) {
            continue;
        }
        if ( iPermission > 0 ) {
            html.push('<div class="permissionSeparator"></div>');
        }
        rootDomains = Object.keys(domainStats[permission]);
        rootDomains.sort(background.domainNameCompare)
        for ( var iRoot = 0; iRoot < rootDomains.length; iRoot++ ) {
            if ( iRoot > 0 ) {
                html.push('<div class="domainSeparator"></div>');
            }
            domains = Object.keys(domainStats[permission][rootDomains[iRoot]].all);
            domains.sort(background.domainNameCompare);
            for ( var iDomain = 0; iDomain < domains.length; iDomain++ ) {
                domain = domains[iDomain];
                html.push('<div>');
                html.push(
                    '<div',
                    ' class="filter-button ', getCurrentClass(domain, '*'), '"',
                    ' data-filter-type="*"',
                    ' data-filter-domain="', domain, '"',
                    '>',
                    domain,
                    '</div>'
                    );
                // type of requests
                for ( var iType = 0; iType < types.length; iType++ ) {
                    type = types[iType];
                    count = typeStats[type] ? typeStats[type][domain] : 0;
                    html.push(
                        '<div',
                        ' class="filter-button ', getCurrentClass(domain, type),
                        count ? '' : ' zero',
                        '"',
                        ' data-filter-type="', type, '"',
                        ' data-filter-domain="', domain, '"',
                        '>',
                        count ? count : '&nbsp;',
                        '</div>'
                        );
                }
                html.push('</div>');
            }
        }
    }

    // inject html in popup menu
    $('#matrix-list').html(html.join(''));
};

// handle user interaction with filters
var handleFilter = function(button) {
    var type = String(button.data('filterType'));
    var domain = String(button.data('filterDomain'));
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
    '+**': '<span class="filter-allowed">allow</span> all graylisted types and domains',
    '-**': '<span class="filter-disallowed">block</span> all graylisted types and domains',
    '+?*': '<span class="filter-allowed">allow</span> <strong>{{what}}</strong> from <strong>everywhere</strong> except blacklisted domains',
    '+*?': '<span class="filter-allowed">allow</span> <strong>everything</strong> from <strong>{{where}}</strong>',
    '+??': '<span class="filter-allowed">allow</span> <strong>{{what}}</strong> from <strong>{{where}}</strong>',
    '-?*': '<span class="filter-disallowed">block</span> <strong>{{what}}</strong> from <strong>everywhere</strong> except whitelisted domains',
    '-*?': '<span class="filter-disallowed">block</span> <strong>everything</strong> from <strong>{{where}}</strong>',
    '-??': '<span class="filter-disallowed">block</span> <strong>{{what}}</strong> from <strong>{{where}}</strong>',
    '.?*': 'graylist <strong>{{what}}</strong> from <strong>everywhere</strong>',
    '.*?': 'graylist <strong>everything</strong> from <strong>{{where}}</strong>',
    '.??': 'graylist <strong>{{what}}</strong> from <strong>{{where}}</strong>'
};

var handleFilterMessage = function(button) {
    var type = String(button.data('filterType'));
    var domain = String(button.data('filterDomain'));
    var currentClass = getCurrentClass(domain, type);
    var nextClass = getNextClass(currentClass, domain, type);
    var action = nextClass === 'filter-allowed' ? '+' : (nextClass === 'filter-disallowed' ? '-' : '.');
    var what = type === '*' ? '*' : '?';
    var where = domain === '*' ? '*' : '?';
    var prompt = mouseOverPrompts[action + what + where];
    prompt = prompt.replace('{{what}}', typeNames[type]);
    prompt = prompt.replace('{{where}}', domain);
    $('#message').html(prompt);
/*
    var pageStats = background.pageStatsFromTabId(tabId);
    var regex = new RegExp('^(.+\\/\\/' + domain + '\\/.*)#' + type + '$');
    var matches;
    var html = [];
    for ( var reqKey in pageStats.requests ) {
        matches = reqKey.match(regex);
        if ( matches ) {
            html.push('<p>);
            html.push(matches[1]);
            html.push('</p>);
        }
    }
    $('.pane-status').html(requests.join(''));
*/
};

// make menu only when popup html is fully loaded
document.addEventListener('DOMContentLoaded', function () {
    chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
        // TODO: can tabs be empty?
        tabId = tabs[0].id; // Important!
        pageUrl = background.pageUrlFromTabId(tabId);
        makeMenu();
    });

    // to handle filter button
    $('body').delegate('.filter-button', 'click', function() {
        handleFilter($(this));
    });

    // to display useful message
    $('body').delegate('.filter-button', 'mouseenter', function() {
        handleFilterMessage($(this));
    });

    // to blank message
    $('body').delegate('.filter-button', 'mouseout', function() {
        $('#message').html(formatHeader(pageUrl));
    });

    // to know when to rebuild the matrix
    chrome.runtime.onMessage.addListener(function(request, sender, callback) {
        if ( request.what === 'urlStatsChanged' ) {
            makeMenu();
        }
    });

    $('#button-info').click(function() {
        chrome.runtime.sendMessage({ what: 'gotoExtensionUrl', url: 'info.html' });
    });
});

/******************************************************************************/

})();
