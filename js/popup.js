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

/******************************************************************************/

var tabId; // these will be set later
var pageUrl = '';

var port = chrome.extension.connect();
var background = chrome.extension.getBackgroundPage();
var httpsb = background.HTTPSB;
var matrixStats = {};
var matrixHeaderTypes = ['*'];
var matrixHeaderPrettyNames = { };
var matrixCellMenu = null;
var matrixHasRows = false; // useful to know for various housekeeping task

/******************************************************************************/

function DomainStats() {
    this['*'] = new EntryStats();
    this.main_frame = new EntryStats();
    this.cookie = new EntryStats();
    this.image = new EntryStats();
    this.object = new EntryStats();
    this.script = new EntryStats();
    this.xmlhttprequest = new EntryStats();
    this.sub_frame = new EntryStats();
    this.other = new EntryStats();
}

function EntryStats() {
    this.count = 0;
    this.temporaryColor = '';
    this.permanentColor = '';
}

/******************************************************************************/

var initMatrixStats = function(pageStats) {
    if ( !pageStats ) {
        return;
    }

    // domain '*' always present
    matrixStats['*'] = new DomainStats();

    // collect all domains and ancestors from net traffic
    var url, domain, type, parent, reqKey;
    var reqKeys = Object.keys(pageStats.requests);
    var iReqKeys = reqKeys.length;

    matrixHasRows = iReqKeys > 0;

    while ( iReqKeys-- ) {
        reqKey = reqKeys[iReqKeys];
        url = background.urlFromReqKey(reqKey);
        domain = background.getHostnameFromURL(url);
        type = background.typeFromReqKey(reqKey);
        // we want a row for self and ancestors
        parent = domain;
        while ( parent ) {
            if ( !matrixStats[parent] ) {
                matrixStats[parent] = new DomainStats();
            }
            parent = background.getParentDomainFromDomain(parent);
        }
        matrixStats[domain][type].count += 1;
        // Issue #12: Count requests for whole row.
        matrixStats[domain]['*'].count += 1;
    }

    updateMatrixStats(matrixStats);

    return matrixStats;
};

/******************************************************************************/

var updateMatrixStats = function(matrixStats) {
    // for each domain/type occurrence, evaluate various stats
    var domains = Object.keys(matrixStats);
    var iDomain = domains.length;
    var domain;
    var types, iType, type;
    var entry;
    while ( iDomain-- ) {
        domain = domains[iDomain];
        types = Object.keys(matrixStats[domain]);
        iType = types.length;
        while ( iType-- ) {
            type = types[iType];
            entry = matrixStats[domain][type];
            entry.temporaryColor = background.getTemporaryColor(type, domain);
            entry.permanentColor = background.getPermanentColor(type, domain);
        }
    }
};

/******************************************************************************/

// For display purpose, create four distinct groups rows:
// 1st: page domain's related
// 2nd: whitelisted
// 3rd: graylisted
// 4th: blacklisted

var domainGroupsSnapshot = [];
var domainListSnapshot = 'dont leave this initial string empty';

var getGroupStats = function() {

    // Try to not reshuffle groups around while popup is opened if
    // no new domain added.
    var latestDomainListSnapshot = Object.keys(matrixStats).sort().join();
    if ( latestDomainListSnapshot === domainListSnapshot ) {
        return domainGroupsSnapshot;
    }
    domainListSnapshot = latestDomainListSnapshot;

    var domainGroups = [
        {},
        {},
        {},
        {}
    ];

    // first group according to whether at least one node in the domain
    // hierarchy is white or blacklisted
    var pageDomain = background.getDomainFromURL(pageUrl);
    var domain, rootDomain, parent;
    var temporaryColor;
    var dark, group;
    var domains = Object.keys(matrixStats);
    var iDomain = domains.length;
    while ( iDomain-- ) {
        domain = domains[iDomain];
        // '*' is for header, ignore, since header is always at the top
        if ( domain === '*' ) {
            continue;
        }
        // Issue #12: Ignore rows with no request for now.
        if ( matrixStats[domain]['*'].count === 0 ) {
            continue;
        }
        // Walk upward the chain of domain names and find at least one which
        // is expressly whitelisted or blacklisted.
        parent = domain;
        while ( parent ) {
            temporaryColor = matrixStats[parent]['*'].temporaryColor;
            dark = temporaryColor.charAt(1) === 'd';
            if ( dark ) {
                break;
            }
            parent = background.getParentDomainFromDomain(parent);
        }
        // Domain of the page comes first
        if ( background.getDomainFromHostname(domain) === pageDomain ) {
            group = 0;
        }
        // Whitelisted domains are second, blacklisted are fourth
        else if ( dark ) {
            group = temporaryColor.charAt(0) === 'g' ? 1 : 3;
        // Graylisted are third
        } else {
            group = 2
        }
        rootDomain = background.getTopMostDomainFromDomain(domain);
        if ( !domainGroups[group][rootDomain] ) {
            domainGroups[group][rootDomain] = { all: {}, directs: {} };
        }
        domainGroups[group][rootDomain].directs[domain] = true;
    }
    // At this point, one root domain could end up in two different groups.
    // Should we merge data from these two (or more) groups so that we
    // avoid duplicated cells in the matrix?
    // For now, I am undecided on this.

    // Generate all nodes possible for each groups, this is useful
    // to allow users to toggle permissions for higher domains which are
    // not explicitly part of the web page.
    var iGroup = domainGroups.length;
    var rootDomains, iRootDomain;
    while ( iGroup-- ) {
        group = domainGroups[iGroup];
        rootDomains = Object.keys(group);
        iRootDomain = rootDomains.length;
        while ( iRootDomain-- ) {
            rootDomain = rootDomains[iRootDomain];
            domains = Object.keys(group[rootDomain].directs);
            iDomain = domains.length;
            while ( iDomain-- ) {
                domain = domains[iDomain];
                while ( domain ) {
                    group[rootDomain].all[domain] = group[rootDomain].directs[domain];
                    domain = background.getParentDomainFromDomain(domain);
                }
            }
        }
    }

    domainGroupsSnapshot = domainGroups;

    return domainGroups;
};

/******************************************************************************/

// helpers

var getCellStats = function(domain, type) {
    if ( matrixStats[domain] ) {
        return matrixStats[domain][type];
    }
    return null;
};

var getTemporaryColor = function(domain, type) {
    var entry = getCellStats(domain, type);
    if ( entry ) {
        return entry.temporaryColor;
    }
    return '';
};

var getPermanentColor = function(domain, type) {
    var entry = getCellStats(domain, type);
    if ( entry ) {
        return entry.permanentColor;
    }
    return '';
};

var getCellClass = function(domain, type) {
    var temporaryColor = getTemporaryColor(domain, type);
    var permanentColor = getPermanentColor(domain, type);
    if ( permanentColor === 'xxx' ) {
        return temporaryColor;
    }
    return temporaryColor + ' ' + permanentColor;
};

// compute next state
var getNextAction = function(domain, type) {
    var entry = matrixStats[domain][type];
    var temporaryColor = entry.temporaryColor;
    // special case: root toggle only between two states
    if ( type === '*' && domain === '*' ) {
        return temporaryColor === 'gdt' ? 'blacklist' : 'whitelist';
    }
    if ( temporaryColor === 'rpt' || temporaryColor === 'gpt' ) {
        return 'blacklist';
    }
    if ( temporaryColor === 'rdt' ) {
        return 'whitelist';
    }
    return 'graylist';
};

/******************************************************************************/

// update visual of filter button(s)

var updateFilterButtons = function() {
    $('.filter-button').each(function() {
        var button = $(this);
        // Need to cast to string or else data() method will convert to
        // numbers if it thinks it's a number (likewhen domain is '127.0.0.1'
        var data = button.data();
        var type = String(data.filterType);
        var domain = String(data.filterDomain);
        var newClass = getCellClass(domain, type);
        button.removeClass('rdt gdt rpt gpt rdp gdp rpp gpp');
        button.addClass(newClass);
        port.postMessage({});
    });
};

/******************************************************************************/

// handle user interaction with filters

var handleFilter = function(button) {
    var data = button.data();
    var type = String(data.filterType);
    var domain = String(data.filterDomain);
    var nextAction = getNextAction(domain, type);
    if ( nextAction === 'blacklist' ) {
        background.disallow(type, domain);
    } else if ( nextAction === 'whitelist' ) {
        background.allow(type, domain);
    } else {
        background.graylist(type, domain);
    }
    updateMatrixStats(matrixStats);
    updateFilterButtons();
    handleFilterMessage(button);
};

/******************************************************************************/

// handle user interaction with persistence buttons

var handlePersistence = function(button) {
    // our parent cell knows who we are
    var cell = button.closest('div.filter-button');
    var data = cell.data();
    var type = String(data.filterType);
    var domain = String(data.filterDomain);
    var entry = getCellStats(domain, type);
    if ( !entry ) { return; }
    if ( entry.temporaryColor.charAt(1) === 'd' && entry.temporaryColor !== entry.permanentColor ) {
        if ( entry.temporaryColor === 'rdt' ) {
            background.disallowPermanently(type, domain);
        } else if ( entry.temporaryColor === 'gdt' ) {
            background.allowPermanently(type, domain);
        }
        entry.permanentColor = background.getPermanentColor(type, domain);
        var newClass = getCellClass(domain, type);
        cell.removeClass('rdt gdt rpt gpt rdp gdp rpp gpp');
        cell.addClass(newClass);
    }
};

var handleUnpersistence = function(button) {
    // our parent cell knows who we are
    var cell = button.closest('div.filter-button');
    var data = cell.data();
    var type = String(data.filterType);
    var domain = String(data.filterDomain);
    var entry = getCellStats(domain, type);
    if ( !entry ) { return; }
    if ( entry.permanentColor.charAt(1) === 'd' ) {
        background.graylistPermanently(type, domain);
        entry.permanentColor = background.getPermanentColor(type, domain);
        var newClass = getCellClass(domain, type);
        cell.removeClass('rdt gdt rpt gpt rdp gdp rpp gpp');
        cell.addClass(newClass);
    }
};

/******************************************************************************/

// build menu according to white and black lists
// TODO: update incrementally

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

var makeMenu = function() {
    var pageStats = background.pageStatsFromTabId(tabId);
    var matrixStats = initMatrixStats(pageStats);
    var groupStats = getGroupStats();

    $('#message').html(formatHeader(pageUrl));

    if ( Object.keys(groupStats).length === 0 ) {
        return;
    }

    var matrixRow, matrixCells, matrixCell;
    var types, iType, type;

    // header row
    matrixRow = $('#matrix-head .matrix-row');
    matrixCells = $('div', matrixRow).toArray();
    $(matrixCells[0]).addClass(getCellClass('*', '*'));
    for ( iType = 1; iType < matrixCells.length; iType++ ) {
        matrixCell = $(matrixCells[iType]);
        type = matrixCell.data('filterType');
        if ( matrixHeaderTypes.length < matrixCells.length ) {
            matrixHeaderTypes.push(type);
            matrixHeaderPrettyNames[type] = matrixCell.text();
        }
        matrixCell.addClass(getCellClass('*', type));
    }
    matrixRow.css('display', '');
    $('#matrix-list').empty();

    // main rows, grouped logically
    var rootDomains;
    var domains, domain;
    var count;
    for ( var iGroup = 0; iGroup < groupStats.length; iGroup++ ) {
        group = groupStats[iGroup];
        rootDomains = Object.keys(group).sort(background.domainNameCompare);
        if ( rootDomains.length === 0 ) {
            continue;
        }
        if ( iGroup > 0 ) {
            $('#templates .groupSeparator').clone().appendTo('#matrix-list');
        }
        for ( var iRoot = 0; iRoot < rootDomains.length; iRoot++ ) {
            if ( iRoot > 0 ) {
                $('#templates .domainSeparator').clone().appendTo('#matrix-list');
            }
            domains = Object.keys(group[rootDomains[iRoot]].all);
            domains.sort(background.domainNameCompare);
            for ( var iDomain = 0; iDomain < domains.length; iDomain++ ) {
                domain = domains[iDomain];
                matrixRow = $('#templates .matrix-row').clone();
                matrixCells = $('div', matrixRow).toArray();
                matrixCell = $(matrixCells[0]);
                matrixCell.data('filterDomain', domain);
                matrixCell.addClass(getCellClass(domain, '*'));
                matrixCell.text(domain);
                // type of requests
                for ( iType = 1; iType < matrixHeaderTypes.length; iType++ ) {
                    type = matrixHeaderTypes[iType];
                    matrixCell = $(matrixCells[iType]);
                    matrixCell.data({ 'filterDomain': domain, 'filterType': type });
                    matrixCell.addClass(getCellClass(domain, type));
                    count = matrixStats[domain][type] ? matrixStats[domain][type].count : 0;
                    if ( count ) {
                        matrixCell.text(count);
                    }
                }
            $('#matrix-list').append(matrixRow);
            }
        }
    }
};

/******************************************************************************/

// handle user mouse over filter buttons

var mouseOverPrompts = {
    '+**': 'Click to <span class="gdt">allow</span> all graylisted types and domains',
    '-**': 'Click to <span class="rdt">block</span> all graylisted types and domains',
    '+?*': 'Click to <span class="gdt">allow</span> <strong>{{what}}</strong> from <strong>everywhere</strong> except blacklisted domains',
    '+*?': 'Click to <span class="gdt">allow</span> <strong>everything</strong> from <strong>{{where}}</strong>',
    '+??': 'Click to <span class="gdt">allow</span> <strong>{{what}}</strong> from <strong>{{where}}</strong>',
    '-?*': 'Click to <span class="rdt">block</span> <strong>{{what}}</strong> from <strong>everywhere</strong> except whitelisted domains',
    '-*?': 'Click to <span class="rdt">block</span> <strong>everything</strong> from <strong>{{where}}</strong>',
    '-??': 'Click to <span class="rdt">block</span> <strong>{{what}}</strong> from <strong>{{where}}</strong>',
    '.?*': 'Click to graylist <strong>{{what}}</strong> from <strong>everywhere</strong>',
    '.*?': 'Click to graylist <strong>everything</strong> from <strong>{{where}}</strong>',
    '.??': 'Click to graylist <strong>{{what}}</strong> from <strong>{{where}}</strong>'
};

var handleFilterMessage = function(button) {
    var data = button.data();
    var type = String(data.filterType);
    var domain = String(data.filterDomain);
    var nextAction = getNextAction(domain, type);
    var action = nextAction === 'whitelist' ? '+' : (nextAction === 'blacklist' ? '-' : '.');
    var what = type === '*' ? '*' : '?';
    var where = domain === '*' ? '*' : '?';
    var prompt = mouseOverPrompts[action + what + where];
    prompt = prompt.replace('{{what}}', matrixHeaderPrettyNames[type]);
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

/******************************************************************************/

function handlePersistMessage(button) {
    if ( button.closest('.rdt').length ) {
        $('#message').html('Permanently <span class="rdt">blacklist</span> this cell');
    } else if ( button.closest('.rdt').length ) {
        $('#message').html('Permanently <span class="gdt">whitelist</span> this cell');
    }
}

function handleUnpersistMessage(button) {
    if ( button.closest('.rdp').length ) {
        $('#message').html('Cancel the permanent <span class="rdt">blacklist</span> status of this cell');
    } else if ( button.closest('.gdp').length ) {
        $('#message').html('Cancel the permanent <span class="gdt">whitelist</span> status of this cell');
    }
}

/******************************************************************************/

// make menu only when popup html is fully loaded

document.addEventListener('DOMContentLoaded', function () {
    chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
        // TODO: can tabs be empty?
        tabId = tabs[0].id; // Important!
        pageUrl = background.pageUrlFromTabId(tabId);
        makeMenu();
        if ( !matrixHasRows ) {
            $('#no-traffic').css('display', '');
            $('#matrix-head').css('display', 'none');
        }
    });

    // to handle filter button
    $('body').delegate('.filter-button', 'click', function() {
        handleFilter($(this));
        return false;
    });

    // to handle cell menu item
    $('body').delegate('#cellMenu span:nth-of-type(1)', 'click', function() {
        handlePersistence($(this));
        return false;
    });

    // to handle cell menu item
    $('body').delegate('#cellMenu span:nth-of-type(2)', 'click', function() {
        handleUnpersistence($(this));
        return false;
    });

    // to prevent spurious selection
// doesn't work...
//    $('body').delegate('.filter-button', 'dblclick', function(event) {
//        event.preventDefault();
//    });

    // to display useful message
    $('body').delegate('.filter-button', 'mouseenter', function() {
        matrixCellMenu.prependTo(this);
        handleFilterMessage($(this));
    });

    // to display useful message
    $('body').delegate('#cellMenu span:nth-of-type(1)', 'mouseenter', function() {
        handlePersistMessage($(this));
    });

    // to display useful message
    $('body').delegate('#cellMenu span:nth-of-type(2)', 'mouseenter', function() {
        handleUnpersistMessage($(this));
    });

    // to blank message
    $('body').delegate('.filter-button', 'mouseleave', function() {
        matrixCellMenu.detach();
        $('#message').html(formatHeader(pageUrl));
    });

    // to know when to rebuild the matrix
    chrome.runtime.onMessage.addListener(function(request) {
        if ( request.what === 'urlStatsChanged' ) {
            makeMenu();
        }
    });

    $('#button-revert').click(function() {
        background.resetLists();
        updateMatrixStats(matrixStats);
        updateFilterButtons();
    });

    $('#button-info').click(function() {
        chrome.runtime.sendMessage({ what: 'gotoExtensionUrl', url: 'info.html' });
    });

    matrixCellMenu = $('#cellMenu').detach();
});

/******************************************************************************/

})();
