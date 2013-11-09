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

function EntryStats() {
    this.count = 0;
    this.temporaryColor = '';
    this.permanentColor = '';
}

EntryStats.prototype.reset = function() {
    this.count = 0;
};

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

DomainStats.prototype.junkyard = [];

DomainStats.prototype.factory = function() {
    var domainStats = DomainStats.prototype.junkyard.pop();
    if ( domainStats ) {
        domainStats.reset();
    } else {
        domainStats = new DomainStats();
    }
    return domainStats;
};

DomainStats.prototype.reset = function() {
    this['*'].reset();
    this.main_frame.reset();
    this.cookie.reset();
    this.image.reset();
    this.object.reset();
    this.script.reset();
    this.xmlhttprequest.reset();
    this.sub_frame.reset();
    this.other.reset();
};

DomainStats.prototype.dispose = function() {
    DomainStats.prototype.junkyard.push(this);
};

/******************************************************************************/

function MatrixStats() {
    // hostname '*' always present
    this['*'] = DomainStats.prototype.factory();
}

MatrixStats.prototype.createMatrixStats = function() {
    return new MatrixStats();
};

MatrixStats.prototype.reset = function() {
    var hostnames = Object.keys(this);
    var i = hostnames.length;
    var hostname, prop;
    while ( i-- ) {
        hostname = hostnames[i];
        prop = this[hostname];
        if ( hostname !== '*' && prop instanceof DomainStats ) {
            prop.dispose();
            delete this[hostname];
        }
    }
    this['*'].reset();
};

/******************************************************************************/

var HTTPSBPopup = {
    tabId: -1,
    pageURL: '',
    scopeURL: '*'
};

// Just so the background page will be notified when popup menu is closed
var port = chrome.extension.connect();

var matrixStats = MatrixStats.prototype.createMatrixStats();
var matrixHeaderTypes = ['*'];
var matrixHeaderPrettyNames = { };
var matrixCellMenu = null;
var matrixCellHotspots = null;
var matrixHasRows = false; // useful to know for various housekeeping task

/******************************************************************************/

// Don't hold permanently onto background page. I don't know if this help,
// but I am trying to keep memory footprint as low as possible.

function getBackgroundPage() {
    return chrome.extension.getBackgroundPage();
}

function getHTTPSB() {
    return getBackgroundPage().HTTPSB;
}

function getPageStats() {
    return getBackgroundPage().pageStatsFromTabId(HTTPSBPopup.tabId);
}

/******************************************************************************/

function initMatrixStats() {
    var pageStats = getPageStats();
    if ( !pageStats ) {
        return;
    }

    matrixStats.reset();

    // collect all domains and ancestors from net traffic
    var background = getBackgroundPage();
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
                matrixStats[parent] = DomainStats.prototype.factory();
            }
            parent = background.getParentHostnameFromHostname(parent);
        }
        matrixStats[hostname][type].count += 1;
        // https://github.com/gorhill/httpswitchboard/issues/12
        // Count requests for whole row.
        matrixStats[hostname]['*'].count += 1;
    }

    updateMatrixStats(matrixStats);

    return matrixStats;
}

/******************************************************************************/

function updateMatrixStats(matrixStats) {
    // For each domain/type occurrence, evaluate colors
    var httpsb = getHTTPSB();
    var scopeURL = HTTPSBPopup.scopeURL;
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
            entry.temporaryColor = httpsb.getTemporaryColor(scopeURL, type, domain);
            entry.permanentColor = httpsb.getPermanentColor(scopeURL, type, domain);
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
    var background = getBackgroundPage();
    var pageDomain = background.getDomainFromURL(HTTPSBPopup.pageURL);
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
function getNextAction(domain, type, leaning) {
    var entry = matrixStats[domain][type];
    var temporaryColor = entry.temporaryColor;
    // special case: root toggle only between two states
    if ( type === '*' && domain === '*' ) {
        return temporaryColor.charAt(0) === 'g' ? 'blacklist' : 'whitelist';
    }
    // Lean toward whitelisting?
    if ( leaning === 'whitelisting' ) {
        if ( temporaryColor.charAt(1) === 'p' ) {
            return 'whitelist';
        }
        return 'graylist';
    }
    // Lean toward blacklisting
    if ( temporaryColor.charAt(1) === 'p' ) {
        return 'blacklist';
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

function handleFilter(button, leaning) {
    var httpsb = getHTTPSB();
    // our parent cell knows who we are
    var cell = button.closest('div.filter-button');
    var type = cell.prop('filterType');
    var domain = cell.prop('filterDomain');
    var nextAction = getNextAction(domain, type, leaning);
    if ( nextAction === 'blacklist' ) {
        httpsb.blacklistTemporarily(HTTPSBPopup.scopeURL, type, domain);
    } else if ( nextAction === 'whitelist' ) {
        httpsb.whitelistTemporarily(HTTPSBPopup.scopeURL, type, domain);
    } else {
        httpsb.graylistTemporarily(HTTPSBPopup.scopeURL, type, domain);
    }
    updateMatrixStats(matrixStats);
    updateMatrixCells();
    handleFilterMessage(button, leaning);
}

function handleWhitelistFilter(button) {
    handleFilter(button, 'whitelisting');
}

function handleBlacklistFilter(button) {
    handleFilter(button, 'blacklisting');
}

/******************************************************************************/

// handle user interaction with persistence buttons

function handlePersistence(button) {
    var httpsb = getHTTPSB();
    // our parent cell knows who we are
    var cell = button.closest('div.filter-button');
    var type = cell.prop('filterType');
    var domain = cell.prop('filterDomain');
    var entry = getCellStats(domain, type);
    if ( !entry ) { return; }
    if ( entry.temporaryColor.charAt(1) === 'd' && entry.temporaryColor !== entry.permanentColor ) {
        if ( entry.temporaryColor === 'rdt' ) {
            httpsb.blacklistPermanently(HTTPSBPopup.scopeURL, type, domain);
        } else if ( entry.temporaryColor === 'gdt' ) {
            httpsb.whitelistPermanently(HTTPSBPopup.scopeURL, type, domain);
        }
        entry.permanentColor = httpsb.getPermanentColor(HTTPSBPopup.scopeURL, type, domain);
        var newClass = getCellClass(domain, type);
        cell.removeClass('rdt gdt rpt gpt rdp gdp rpp gpp');
        cell.addClass(newClass);
    }
}

function handleUnpersistence(button) {
    var httpsb = getHTTPSB();
    // our parent cell knows who we are
    var cell = button.closest('div.filter-button');
    var type = cell.prop('filterType');
    var domain = cell.prop('filterDomain');
    var entry = getCellStats(domain, type);
    if ( !entry ) { return; }
    if ( entry.permanentColor.charAt(1) === 'd' ) {
        httpsb.graylistPermanently(HTTPSBPopup.scopeURL, type, domain);
        entry.permanentColor = httpsb.getPermanentColor(HTTPSBPopup.scopeURL, type, domain);
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
    var msg = '&nbsp;';
    if ( !s || !s.length ) {
        msg = '&nbsp;';
    } else {
        msg = s.slice(0, maxLength);
        if ( s.length > maxLength ) {
            msg += '...';
        }
    }
    return msg;
}

/******************************************************************************/

function createMatrixRow(matrixRow, hostname, domain) {
    var cells = $('div', matrixRow).toArray();
    var cell = $(cells[0]);
    cell.prop({filterType: '*', filterDomain: hostname});
    cell.addClass(getCellClass(hostname, '*'));
    var b = $('b', cell);
    var i = hostname.lastIndexOf(domain);
    if ( i <= 0 ) {
        b.text(hostname);
    } else {
        b.text(hostname.slice(0, i-1) + '.');
        b.after(domain);
    }
    // type of requests
    var type, count;
    for ( var iType = 1; iType < matrixHeaderTypes.length; iType++ ) {
        type = matrixHeaderTypes[iType];
        cell = $(cells[iType]);
        cell.prop({filterType: type, filterDomain: hostname});
        cell.addClass(getCellClass(hostname, type));
        count = matrixStats[hostname][type] ? matrixStats[hostname][type].count : 0;
        if ( count ) {
            cell.text(count);
        }
    }
}

/******************************************************************************/

// TODO: build incrementally, i.e. reuse any existing rows rather than
// dispose then re-create all of them.

function makeMenu() {
    var background = getBackgroundPage();
    initMatrixStats();
    var groupStats = getGroupStats();

    $('#page-switch').removeClass();
    $('#message').html(formatHeader(HTTPSBPopup.pageURL));

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

    // https://github.com/gorhill/httpswitchboard/issues/31
    if ( matrixCellHotspots ) {
        matrixCellHotspots.detach();
    }
    if ( matrixCellMenu ) {
        matrixCellMenu.detach();
    }

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
                createMatrixRow(matrixRow, domains[iDomain], rootDomains[iRoot]);
                $('#matrix-list').append(matrixRow);
            }
        }
    }
}

/******************************************************************************/

// Create page scopes for the web page

function toggleScopePage() {
    var toolbars = $('#toolbars');
    var button = $('#button-toggle-scope');
    button.tooltip('hide');
    if ( toolbars.hasClass('scope-is-page') ) {
        toolbars.removeClass('scope-is-page');
        getHTTPSB().destroyPageScopeIfExists(HTTPSBPopup.pageURL);
    } else {
        toolbars.addClass('scope-is-page');
        getHTTPSB().createPageScopeIfNotExists(HTTPSBPopup.pageURL);
    }
    updateMatrixStats(matrixStats);
    updateMatrixCells();
}

function getScopePageButtonTip() {
    var toolbars = $('#toolbars');
    if ( toolbars.hasClass('scope-is-page') ) {
        return 'Remove all permissions specific to <span style="border-bottom:1px dotted #aaa;">' +
            HTTPSBPopup.scopeURL +
            '</span>';
    }
    return 'Create permissions specific to web pages which URL starts exactly with ' +
        '<span style="border-bottom:1px dotted #aaa;">' +
        HTTPSBPopup.scopeURL +
        '</span>';
}

/******************************************************************************/

// Handle user mouse over filter buttons

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

function handleFilterMessage(hotspot, leaning) {
    var cell = hotspot.closest('div.filter-button');
    var type = cell.prop('filterType');
    var domain = cell.prop('filterDomain');
    var nextAction = getNextAction(domain, type, leaning);
    var action = nextAction === 'whitelist' ? '+' : (nextAction === 'blacklist' ? '-' : '.');
    var what = type === '*' ? '*' : '?';
    var where = domain === '*' ? '*' : '?';
    var prompt = mouseOverPrompts[action + what + where];
    prompt = prompt.replace('{{what}}', matrixHeaderPrettyNames[type]);
    prompt = prompt.replace('{{where}}', domain);
    $('#message').html(prompt);
}

function handleWhitelistFilterMessage(hotspot) {
    handleFilterMessage(hotspot, 'whitelisting');
}

function handleBlacklistFilterMessage(hotspot) {
    handleFilterMessage(hotspot, 'blacklisting');
}

/******************************************************************************/

function handlePersistMessage(button) {
    if ( button.closest('.rdt').length ) {
        $('#message').html('Permanently <span class="rdt">blacklist</span> this cell');
    } else if ( button.closest('.gdt').length ) {
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

function blankMessage() {
    $('#message').html(formatHeader(HTTPSBPopup.pageURL));
}

/******************************************************************************/

function onMessage(request) {
    if ( request.what === 'urlStatsChanged' ) {
        makeMenu();
    }
}

/******************************************************************************/

function revert() {
    getHTTPSB().revertPermissions();
    updateMatrixStats(matrixStats);
    updateMatrixCells();
}

/******************************************************************************/

// Because chrome.tabs.query() is async
function bindToTabHandler(tabs) {
    // TODO: can tabs be empty?
    if ( !tabs.length ) {
        return;
    }

    // Important! Before calling makeMenu()
    var background = getBackgroundPage();
    var httpsb = getHTTPSB();
    HTTPSBPopup.tabId = tabs[0].id;
    HTTPSBPopup.pageURL = background.pageUrlFromTabId(HTTPSBPopup.tabId);
    HTTPSBPopup.scopeURL = httpsb.normalizeScopeURL(HTTPSBPopup.pageURL);

    // Now that tabId and pageURL are set, we can build our menu
    makeMenu();

    // After popup menu is built, check whether there is a non-empty matrix
    if ( !matrixHasRows ) {
        $('#no-traffic').css('display', '');
        $('#matrix-head').css('display', 'none');
        $('#scope-toolbar').css('display', 'none');
    }

    // Activate page scope if there is one
    if ( httpsb.scopePageExists(HTTPSBPopup.scopeURL) ) {
        toggleScopePage();
    }

    // To know when to rebuild the matrix
    // TODO: What if this event is triggered before bindToTabHandler()
    // is called?
    chrome.runtime.onMessage.addListener(onMessage);
}

/******************************************************************************/

// make menu only when popup html is fully loaded

function initAll() {
    chrome.tabs.query({currentWindow: true, active: true}, bindToTabHandler);

    // TODO: prevent spurious selection

    // We reuse for all cells the one and only cell menu.
    matrixCellMenu = $('#cellMenu').detach();
    $('span:nth-of-type(1)', matrixCellMenu).on('click', function() {
        handlePersistence($(this));
        return false;
    });
    $('span:nth-of-type(2)', matrixCellMenu).on('click', function() {
        handleUnpersistence($(this));
        return false;
    });
    $('span:nth-of-type(1)', matrixCellMenu).on('mouseenter', function() {
        handlePersistMessage($(this));
        return false;
    });
    // to display useful message
    $('span:nth-of-type(2)', matrixCellMenu).on('mouseenter', function() {
        handleUnpersistMessage($(this));
        return false;
    });


    // We reuse for all cells the one and only cell hotspots.
    matrixCellHotspots = $('#cellHotspots').detach();
    $('div:nth-of-type(1)', matrixCellHotspots).on('click', function() {
        handleWhitelistFilter($(this));
        return false;
    });
    $('div:nth-of-type(2)', matrixCellHotspots).on('click', function() {
        handleBlacklistFilter($(this));
        return false;
    });
    $('div:nth-of-type(1)', matrixCellHotspots).on('mouseenter', function() {
        handleWhitelistFilterMessage($(this));
        return false;
    });
    $('div:nth-of-type(2)', matrixCellHotspots).on('mouseenter', function() {
        handleBlacklistFilterMessage($(this));
        return false;
    });

    // to attach widgets to matrix cell
    $('body').on('mouseenter', '.filter-button', function() {
        matrixCellHotspots.prependTo(this);
        matrixCellMenu.prependTo(this);
    });

    // to detach widgets from matrix cell and blank message
    $('body').on('mouseleave', '.filter-button', function() {
        matrixCellHotspots.detach();
        matrixCellMenu.detach();
        blankMessage();
    });

    $('#button-toggle-scope').on('click', toggleScopePage);
    $('#button-revert').on('click', revert);
    $('#button-info').on('click', function() {
        chrome.runtime.sendMessage({ what: 'gotoExtensionUrl', url: 'info.html' });
    });
    $('#button-settings').on('click', function() {
        chrome.runtime.sendMessage({ what: 'gotoExtensionUrl', url: 'settings.html' });
    });

    // Tooltips
    // TODO: localize
    var tips = [
        {   sel: '#button-toggle-scope',
            tip: getScopePageButtonTip
            },
        {   sel: '#button-revert',
            tip: 'Undo all temporary changes &mdash; those which were not padlocked'
            },
        {   sel: '#button-info',
            tip: 'Statistics and detailed net requests'
            },
        {   sel: '#button-settings',
            tip: 'Settings: how HTTP&nbsp;Switchboard behaves'
            }
        ];
    var i = tips.length;
    while ( i-- ) {
        $(tips[i].sel).tooltip({
            html: true,
            placement: 'auto bottom',
            trigger: 'hover',
            delay: { show: 750, hide: 0 },
            container: 'body',
            title: tips[i].tip
        });
    }
}

/******************************************************************************/

// Entry point

$(function(){
    initAll();
});
