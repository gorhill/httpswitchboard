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

var tabId; // these will be set later
var pageUrl = '';

// Just so the background page will be notified when popup menu is closed
var port = chrome.extension.connect();

var matrixStats = {};
var matrixHeaderTypes = ['*'];
var matrixHeaderPrettyNames = { };
var matrixCellMenu = null;
var matrixHasRows = false; // useful to know for various housekeeping task

/******************************************************************************/

// Don't hold permanently onto background page. I don't know if this help,
// but I am trying to keep memory footprint as low as possible.

function backgroundPage() {
    return chrome.extension.getBackgroundPage();
}

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
    // bit 0 = http
    // bit 1 = https
    // thus:
    // 1 = http
    // 2 = https
    // 3 = mixed
    this.protocol = 0;
}

/******************************************************************************/

function initMatrixStats(pageStats) {
    if ( !pageStats ) {
        return;
    }

    // hostname '*' always present
    matrixStats['*'] = new DomainStats();

    // collect all domains and ancestors from net traffic
    var background = backgroundPage();
    var pageUrl = pageStats.pageUrl;
    var url, hostname, type, parent, reqKey;
    var reqKeys = Object.keys(pageStats.requests);
    var iReqKeys = reqKeys.length;

    matrixHasRows = iReqKeys > 0;

    while ( iReqKeys-- ) {
        reqKey = reqKeys[iReqKeys];
        url = background.urlFromReqKey(reqKey);
        hostname = background.getHostnameFromURL(url);
        // rhill 2013-10-23: hostname can be empty if the request is a data url
        // https://github.com/gorhill/httpswitchboard/issues/26
        if ( hostname === '' ) {
            hostname = background.getHostnameFromURL(pageUrl);
        }
        type = background.typeFromReqKey(reqKey);
        // we want a row for self and ancestors
        parent = hostname;
        while ( parent ) {
            if ( !matrixStats[parent] ) {
                matrixStats[parent] = new DomainStats();
            }
            parent = background.getParentHostnameFromHostname(parent);
        }
        matrixStats[hostname][type].count += 1;
        // Issue #12: Count requests for whole row.
        matrixStats[hostname]['*'].count += 1;
    }

    updateMatrixStats(matrixStats);

    return matrixStats;
}

/******************************************************************************/

function updateMatrixStats(matrixStats) {
    // for each domain/type occurrence, evaluate various stats
    var background = backgroundPage();
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
}

/******************************************************************************/

// For display purpose, create four distinct groups rows:
// 1st: page domain's related
// 2nd: whitelisted
// 3rd: graylisted
// 4th: blacklisted

var domainGroupsSnapshot = [];
var domainListSnapshot = 'dont leave this initial string empty';

function getGroupStats() {

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
    var background = backgroundPage();
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
            parent = background.getParentHostnameFromHostname(parent);
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
            group = 2;
        }
        rootDomain = background.getDomainFromHostname(domain);
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
                    domain = background.getParentHostnameFromHostname(domain);
                }
            }
        }
    }

    domainGroupsSnapshot = domainGroups;

    return domainGroups;
}

/******************************************************************************/

// helpers

function getCellStats(domain, type) {
    if ( matrixStats[domain] ) {
        return matrixStats[domain][type];
    }
    return null;
}

function getTemporaryColor(domain, type) {
    var entry = getCellStats(domain, type);
    if ( entry ) {
        return entry.temporaryColor;
    }
    return '';
}

function getPermanentColor(domain, type) {
    var entry = getCellStats(domain, type);
    if ( entry ) {
        return entry.permanentColor;
    }
    return '';
}

function getCellClass(domain, type) {
    var temporaryColor = getTemporaryColor(domain, type);
    var permanentColor = getPermanentColor(domain, type);
    if ( permanentColor === 'xxx' ) {
        return temporaryColor;
    }
    return temporaryColor + ' ' + permanentColor;
}

// compute next state
function getNextAction(domain, type) {
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
}

/******************************************************************************/

// update visual of matrix cells(s)

function updateMatrixCells() {
    var cells = $('.filter-button').toArray();
    var i = cells.length;
    var cell, type, domain, newClass;
    while ( i-- ) {
        cell = $(cells[i]);
        // Need to cast to string or else data() method will convert to
        // numbers if it thinks it's a number (likewhen domain is '127.0.0.1'
        type = cell.prop('filterType');
        domain = cell.prop('filterDomain');
        newClass = getCellClass(domain, type);
        cell.removeClass();
        cell.addClass('filter-button ' + newClass);
    }
}

/******************************************************************************/

// handle user interaction with filters

function handleFilter(button) {
    var background = backgroundPage();
    var type = button.prop('filterType');
    var domain = button.prop('filterDomain');
    var nextAction = getNextAction(domain, type);
    if ( nextAction === 'blacklist' ) {
        background.blacklistTemporarily(type, domain);
    } else if ( nextAction === 'whitelist' ) {
        background.whitelistTemporarily(type, domain);
    } else {
        background.graylist(type, domain);
    }
    updateMatrixStats(matrixStats);
    updateMatrixCells();
    handleFilterMessage(button);
}

/******************************************************************************/

// handle user interaction with persistence buttons

function handlePersistence(button) {
    var background = backgroundPage();
    // our parent cell knows who we are
    var cell = button.closest('div.filter-button');
    var type = cell.prop('filterType');
    var domain = cell.prop('filterDomain');
    var entry = getCellStats(domain, type);
    if ( !entry ) { return; }
    if ( entry.temporaryColor.charAt(1) === 'd' && entry.temporaryColor !== entry.permanentColor ) {
        if ( entry.temporaryColor === 'rdt' ) {
            background.blacklistPermanently(type, domain);
        } else if ( entry.temporaryColor === 'gdt' ) {
            background.whitelistPermanently(type, domain);
        }
        entry.permanentColor = background.getPermanentColor(type, domain);
        var newClass = getCellClass(domain, type);
        cell.removeClass('rdt gdt rpt gpt rdp gdp rpp gpp');
        cell.addClass(newClass);
    }
}

function handleUnpersistence(button) {
    var background = backgroundPage();
    // our parent cell knows who we are
    var cell = button.closest('div.filter-button');
    var type = cell.prop('filterType');
    var domain = cell.prop('filterDomain');
    var entry = getCellStats(domain, type);
    if ( !entry ) { return; }
    if ( entry.permanentColor.charAt(1) === 'd' ) {
        background.graylistPermanently(type, domain);
        entry.permanentColor = background.getPermanentColor(type, domain);
        var newClass = getCellClass(domain, type);
        cell.removeClass('rdt gdt rpt gpt rdp gdp rpp gpp');
        cell.addClass(newClass);
    }
}

/******************************************************************************/

// build menu according to white and black lists
// TODO: update incrementally

function formatHeader(s) {
    var maxLength = 80;
    var msg = s.slice(0, maxLength);
    if ( s.length > maxLength ) {
        msg += '...';
    } else if ( s.length === 0 ) {
        msg = '&nbsp;';
    }
    return msg;
}

/******************************************************************************/

function createMatrixRow(matrixRow, domain) {
    var matrixCells = $('div', matrixRow).toArray();
    var matrixCell = $(matrixCells[0]);

    matrixCell.prop({filterType: '*', filterDomain: domain});
    matrixCell.addClass(getCellClass(domain, '*'));
    matrixCell.text(domain);

    // type of requests
    var count;
    for ( var iType = 1; iType < matrixHeaderTypes.length; iType++ ) {
        type = matrixHeaderTypes[iType];
        matrixCell = $(matrixCells[iType]);
        matrixCell.prop({filterType: type, filterDomain: domain});
        matrixCell.addClass(getCellClass(domain, type));
        count = matrixStats[domain][type] ? matrixStats[domain][type].count : 0;
        if ( count ) {
            matrixCell.text(count);
        }
    }
}

/******************************************************************************/

function makeMenu() {
    var background = backgroundPage();
    var pageStats = background.pageStatsFromTabId(tabId);
    var matrixStats = initMatrixStats(pageStats);
    var groupStats = getGroupStats();

    $('#message').html(formatHeader(pageUrl));

    if ( Object.keys(groupStats).length === 0 ) {
        return;
    }

    var matrixRow, matrixCells, matrixCell;
    var iType, type;

    // header row
    matrixRow = $('#matrix-head .matrix-row');
    matrixCells = $('div', matrixRow).toArray();
    matrixCell = $(matrixCells[0]);
    matrixCell.prop({filterType: '*', filterDomain: '*'});
    matrixCell.addClass(getCellClass('*', '*'));
    for ( iType = 1; iType < matrixCells.length; iType++ ) {
        matrixCell = $(matrixCells[iType]);
        type = matrixCell.data('filterType');
        if ( matrixHeaderTypes.length < matrixCells.length ) {
            matrixHeaderTypes.push(type);
            matrixHeaderPrettyNames[type] = matrixCell.text();
        }
        matrixCell.prop({filterType: type, filterDomain: '*'});
        matrixCell.addClass(getCellClass('*', type));
    }
    matrixRow.css('display', '');
    $('#matrix-list').empty();

    // main rows, grouped logically
    var group;
    var rootDomains, iRoot;
    var domains, iDomain;
    for ( var iGroup = 0; iGroup < groupStats.length; iGroup++ ) {
        group = groupStats[iGroup];
        rootDomains = Object.keys(group).sort(background.domainNameCompare);
        if ( rootDomains.length === 0 ) {
            continue;
        }
        if ( iGroup > 0 ) {
            $('#templates .groupSeparator').clone().appendTo('#matrix-list');
        }
        for ( iRoot = 0; iRoot < rootDomains.length; iRoot++ ) {
            if ( iRoot > 0 ) {
                $('#templates .domainSeparator').clone().appendTo('#matrix-list');
            }
            domains = Object.keys(group[rootDomains[iRoot]].all);
            domains.sort(background.domainNameCompare);
            for ( iDomain = 0; iDomain < domains.length; iDomain++ ) {
                matrixRow = $('#templates .matrix-row').clone();
                createMatrixRow(matrixRow, domains[iDomain]);
                $('#matrix-list').append(matrixRow);
            }
        }
    }
}

/******************************************************************************/

// handle user mouse over filter buttons

// TODO: localize
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

function handleFilterMessage(button) {
    var type = button.prop('filterType');
    var domain = button.prop('filterDomain');
    var nextAction = getNextAction(domain, type);
    var action = nextAction === 'whitelist' ? '+' : (nextAction === 'blacklist' ? '-' : '.');
    var what = type === '*' ? '*' : '?';
    var where = domain === '*' ? '*' : '?';
    var prompt = mouseOverPrompts[action + what + where];
    prompt = prompt.replace('{{what}}', matrixHeaderPrettyNames[type]);
    prompt = prompt.replace('{{where}}', domain);
    $('#message').html(prompt);
}

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

function onMessage(request) {
    if ( request.what === 'urlStatsChanged' ) {
        makeMenu();
    }
}

/******************************************************************************/

// Because chrome.tabs.query() is async
function bindToTabHandler(tabs) {
    // TODO: can tabs be empty?
    if ( !tabs.length ) {
        return;
    }

    // Important! Before calling makeMenu()
    var background = backgroundPage();
    tabId = tabs[0].id;
    pageUrl = background.pageUrlFromTabId(tabId);

    // Now that tabId and pageUrl are set, we can build our menu
    makeMenu();

    // After popup menu is built, we check whether there is a non-empty matrix
    if ( !matrixHasRows ) {
        $('#no-traffic').css('display', '');
        $('#matrix-head').css('display', 'none');
    }

    // We reuse for all cells the one and only cell menu.
    matrixCellMenu = $('#cellMenu').detach();

    // To know when to rebuild the matrix
    // TODO: What if this event is triggered before bindToTabHandler()
    // is called?
    chrome.runtime.onMessage.addListener(onMessage);
}

/******************************************************************************/

function revert() {
    var background = backgroundPage();
    background.restoreTemporaryLists();
    updateMatrixStats(matrixStats);
    updateMatrixCells();
}

/******************************************************************************/

// make menu only when popup html is fully loaded

function initAll() {
    chrome.tabs.query({currentWindow: true, active: true}, bindToTabHandler);

    // to handle filter button
    $('body').on('click', '.filter-button', function() {
        handleFilter($(this));
        return false;
    });

    // to handle cell menu item
    $('body').on('click', '#cellMenu span:nth-of-type(1)', function() {
        handlePersistence($(this));
        return false;
    });

    // to handle cell menu item
    $('body').on('click', '#cellMenu span:nth-of-type(2)', function() {
        handleUnpersistence($(this));
        return false;
    });

    // to prevent spurious selection
// doesn't work...
//    $('body').delegate('.filter-button', 'dblclick', function(event) {
//        event.preventDefault();
//    });

    // to display useful message
    $('body').on('mouseenter', '.filter-button', function() {
        matrixCellMenu.prependTo(this);
        handleFilterMessage($(this));
    });

    // to display useful message
    $('body').on('mouseenter', '#cellMenu span:nth-of-type(1)', function() {
        handlePersistMessage($(this));
    });

    // to display useful message
    $('body').on('mouseenter', '#cellMenu span:nth-of-type(2)', function() {
        handleUnpersistMessage($(this));
    });

    // to blank message
    $('body').on('mouseleave', '.filter-button', function() {
        matrixCellMenu.detach();
        $('#message').html(formatHeader(pageUrl));
    });

    $('#button-revert').on('click', revert);

    $('#button-info').on('click', function() {
        chrome.runtime.sendMessage({ what: 'gotoExtensionUrl', url: 'info.html' });
    });

    $('#button-settings').on('click', function() {
        chrome.runtime.sendMessage({ what: 'gotoExtensionUrl', url: 'settings.html' });
    });
}

/******************************************************************************/

// Entry point

$(function(){
    initAll();
});
