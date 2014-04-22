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

(function() {

/******************************************************************************/

var targetUrl = 'all';
var maxRequests = 500;

var tableFriendlyTypeNames = {
   'main_frame': 'page',
   'stylesheet': 'css',
   'sub_frame': 'frame',
   'xmlhttprequest': 'xhr'
};

/******************************************************************************/

function gethttpsb() {
    return chrome.extension.getBackgroundPage().HTTPSB;
}

function pageStatsFromPageUrl(pageUrl) {
    return gethttpsb().pageStatsFromPageUrl(pageUrl);
}

/******************************************************************************/

// Get a list of latest net requests

function updateRequestData() {
    var requests = [];
    var pageUrls = targetUrl === 'all' ?
          Object.keys(gethttpsb().pageStats) :
          [targetUrl];
    var pageUrl;
    var logEntries, i, n, logEntry;
    var pageStats, pageRequests;

    var nPageUrls = pageUrls.length;
    for ( var iPageUrl = 0; iPageUrl < nPageUrls; iPageUrl++ ) {
        pageUrl = pageUrls[iPageUrl];
        pageStats = pageStatsFromPageUrl(pageUrl);
        // Unsure if it can happen... Just in case
        if ( !pageStats ) {
            continue;
        }
        pageRequests = pageStats.requests;
        logEntries = pageRequests.getLoggedRequests();
        n = logEntries.length;
        for ( i = 0; i < n; i++ ) {
            logEntry = logEntries[i];
            // rhill 2013-12-04: `logEntry` can be null since a ring buffer is
            // now used, and it might not have been filled yet.
            if ( !logEntry ) {
                continue;
            }
            requests.push(logEntry);
        }
    }

    return requests
        .sort(function(a,b){return b.when-a.when;})
        .slice(0, maxRequests);
}

/******************************************************************************/

function renderNumber(value) {
    if ( isNaN(value) ) {
        return '0';
    }
    // TODO: localization
    if ( +value > 1000 ) {
        value = value.toString();
        var i = value.length - 3;
        while ( i > 0 ) {
            value = value.slice(0, i) + ',' + value.slice(i);
            i -= 3;
        }
    }
    return value;
}

/******************************************************************************/

function renderNumbers(set) {
    var keys = Object.keys(set);
    var i = keys.length;
    var key;
    while ( i-- ) {
        key = keys[i];
        $(key).text(renderNumber(set[key]));
    }
}

/******************************************************************************/

var renderLocalized = function(id, map) {
    var el = $('#' + id);
    var msg = chrome.i18n.getMessage(id);
    for ( var k in map ) {
        if ( map.hasOwnProperty(k) === false ) {
            continue;
        }
        msg = msg.replace('{{' + k + '}}', map[k]);
    }
    el.html(msg);
};

/******************************************************************************/

function renderPageUrls() {
    var httpsb = gethttpsb();
    var select = $('#selectPageUrls');

    // One of the permanent entry will serve as a template
    var optionTemplate = $('#selectPageUrlTemplate', select);

    // Remove whatever was put there in a previous call
    $(optionTemplate).nextAll().remove();

    var pageUrls = Object.keys(httpsb.pageUrlToTabId).sort();
    var pageUrl, option;
    for ( var i = 0; i < pageUrls.length; i++ ) {
        pageUrl = pageUrls[i];
        // Avoid duplicating
        if ( pageUrl === httpsb.behindTheSceneURL ) {
            continue;
        }
        option = optionTemplate.clone();
        option.attr('id', '');
        option.attr('value', pageUrl);
        option.text(pageUrl);
        select.append(option);
    }
    // Deselect whatever is currently selected
    $('option:selected', select).prop('selected', false);
    // Select whatever needs to be selected
    $('option[value="'+targetUrl+'"]', select).prop('selected', true);
}

/******************************************************************************/

function renderStats() {
    var httpsb = gethttpsb();

    // Make sure targetUrl is valid
    if ( targetUrl !== 'all' && !httpsb.pageStats[targetUrl] ) {
        targetUrl = 'all';
    }

    var requestStats = targetUrl === 'all' ? httpsb.requestStats : httpsb.pageStats[targetUrl].requestStats;
    var blockedStats = requestStats.blocked;
    var allowedStats = requestStats.allowed;

    renderLocalized('statsPageCookieHeadersFoiled', { count: renderNumber(httpsb.cookieHeaderFoiledCounter) });
    renderLocalized('statsPageRefererHeadersFoiled', { count: renderNumber(httpsb.refererHeaderFoiledCounter) });
    renderLocalized('statsPageCookiesRemoved', { count: renderNumber(httpsb.cookieRemovedCounter) });
    renderLocalized('statsPageLocalStoragesCleared', { count: renderNumber(httpsb.localStorageRemovedCounter) });
    renderLocalized('statsPageBrowserCacheCleared', { count: renderNumber(httpsb.browserCacheClearedCounter) });
    renderLocalized('statsPageABPHits', { count: renderNumber(httpsb.abpBlockCount), percent: (httpsb.abpBlockCount * 100 / httpsb.requestStats.blocked.all).toFixed(1) });

    renderNumbers({
        '#blockedAllCount': requestStats.blocked.all,
        '#blockedMainFrameCount': blockedStats.main_frame,
        '#blockedCookieCount': blockedStats.cookie,
        '#blockedStylesheetCount': blockedStats.stylesheet,
        '#blockedImageCount': blockedStats.image,
        '#blockedObjectCount': blockedStats.object,
        '#blockedScriptCount': blockedStats.script,
        '#blockedXHRCount': blockedStats.xmlhttprequest,
        '#blockedSubFrameCount': blockedStats.sub_frame,
        '#blockedOtherCount': blockedStats.other,
        '#allowedAllCount': allowedStats.all,
        '#allowedMainFrameCount': allowedStats.main_frame,
        '#allowedCookieCount': allowedStats.cookie,
        '#allowedStylesheetCount': allowedStats.stylesheet,
        '#allowedImageCount': allowedStats.image,
        '#allowedObjectCount': allowedStats.object,
        '#allowedScriptCount': allowedStats.script,
        '#allowedXHRCount': allowedStats.xmlhttprequest,
        '#allowedSubFrameCount': allowedStats.sub_frame,
        '#allowedOtherCount': allowedStats.other,
        '#maxLoggedRequests': httpsb.userSettings.maxLoggedRequests
    });

    // because some i18n messages may contain links
    $('a').attr('target', '_blank');
}

/******************************************************************************/

function renderRequestRow(row, request) {
    var jqRow = $(row);
    row = jqRow[0];
    jqRow.attr('id', '');
    jqRow.css('display', '');
    jqRow.removeClass();
    if ( request.block !== false ) {
        jqRow.addClass('blocked-true');
    } else {
        jqRow.addClass('blocked-false');
    }
    jqRow.addClass('type-' + request.type);
    var cells = row.cells;

    // when
    var when = new Date(request.when);
    $(cells[0]).text(when.toLocaleTimeString());

    // request type
    var text = tableFriendlyTypeNames[request.type] || request.type;
    $(cells[1]).text(text);

    // Well I got back full control since not using Tempo.js, I can now
    // generate smarter hyperlinks, that is, not hyperlinking fake
    // request URLs, which are recognizable with their curly braces inside.
    var a = $('a', cells[2]);
    if ( request.url.search('{') < 0 ) {
        a.attr('href', request.url);
        a.css('display', '');
    } else {
        a.css('display', 'none');
    }

    // reason of why block, if available
    text = request.reason;
    if ( typeof text === 'string' && text.length > 0 ) {
        $(cells[3]).text('\uf0b0');
        $(cells[3]).attr('data-tip', text);
    } else {
        $(cells[3]).text('\u00a0');
        $(cells[3]).removeAttr('data-tip');
    }

    // request URL
    $(cells[4]).text(request.url);
}

/*----------------------------------------------------------------------------*/

function renderRequests() {
    var table = $('#requestsTable');
    var requests = updateRequestData();
    var i, row;
    var rowTemplate = table.find('#requestRowTemplate').first();

    // Reuse whatever rows is already in there.
    var rows = table.find('tr:not(.ro)').toArray();
    var n = Math.min(requests.length, rows.length);
    for ( i = 0; i < n; i++ ) {
        renderRequestRow(rows[i], requests[i]);
    }

    // Hide extra rows
    $(rows.slice(0, i)).removeClass('unused');
    $(rows.slice(i)).addClass('unused');

    // Create new rows to receive what is left
    n = requests.length;
    for ( ; i < n; i++ ) {
        row = rowTemplate.clone();
        renderRequestRow(row, requests[i]);
        row.insertBefore(rowTemplate);
    }

    syncWithFilters();
}

/******************************************************************************/

function changeUserSettings(name, value) {
    chrome.runtime.sendMessage({
        what: 'userSettings',
        name: name,
        value: value
    });
}

/******************************************************************************/

function changeValueHandler(elem, setting, min, max) {
    var oldVal = gethttpsb().userSettings[setting];
    var newVal = Math.round(parseFloat(elem.val()));
    if ( typeof newVal !== 'number' ) {
        newVal = oldVal;
    } else {
        newVal = Math.max(newVal, min);
        newVal = Math.min(newVal, max);
    }
    elem.val(newVal);
    if ( newVal !== oldVal ) {
        changeUserSettings(setting, newVal);
    }
}

/******************************************************************************/

function changeFilterHandler() {
    // Save new state of filters in user settings
    // Initialize request filters as per user settings:
    // https://github.com/gorhill/httpswitchboard/issues/49
    var statsFilters = gethttpsb().userSettings.statsFilters;
    $('input[id^="show-"][type="checkbox"]').each(function() {
        var input = $(this);
        statsFilters[input.attr('id')] = !!input.prop('checked');
    });
    changeUserSettings('statsFilters', statsFilters);

    syncWithFilters();
}

/******************************************************************************/

// Synchronize list of net requests with filter states

function syncWithFilters() {
    var blocked = ['blocked','allowed'];
    var type = ['main_frame','cookie','stylesheet','image','object','script','xmlhttprequest','sub_frame','other'];
    var i = blocked.length;
    var j;
    var display, selector;
    while ( i-- ) {
        j = type.length;
        while ( j-- ) {
            display = $('#show-' + blocked[i]).prop('checked') &&
                      $('#show-' + type[j]).prop('checked') ? '' : 'none';
            selector = '.blocked-' + (blocked[i] === 'blocked') + '.type-' + type[j];
            $(selector).css('display', display);
        }
    }
}

/******************************************************************************/

var renderTransientTimer;

function renderTransientData(internal) {
    // This is in case this function is not called from timeout event
    if ( internal && renderTransientTimer ) {
        clearTimeout(renderTransientTimer);
    }
    renderPageUrls();
    renderStats();
    renderTransientTimer = setTimeout(renderTransientData, 10000); // every 10s
}

/******************************************************************************/

function targetUrlChangeHandler() {
    targetUrl = this[this.selectedIndex].value;
    renderStats();
    renderRequests();
}

/******************************************************************************/

function prepareToDie() {
    changeValueHandler($('#max-logged-requests'), 'maxLoggedRequests', 0, 999);
    $('input,button,select').off();
}

/******************************************************************************/

// Handle user interaction

$(function(){
    var httpsb = gethttpsb();
    var userSettings = httpsb.userSettings;

    $('#max-logged-requests').val(userSettings.maxLoggedRequests);
    // Initialize request filters as per user settings:
    // https://github.com/gorhill/httpswitchboard/issues/49
    $('input[id^="show-"][type="checkbox"]').each(function() {
        var statsFilters = gethttpsb().userSettings.statsFilters;
        var input = $(this);
        var filter = statsFilters[input.attr('id')];
        input.prop('checked', filter === undefined || filter === true);
    });

    // Event handlers
    $('#refresh-requests').on('click', renderRequests);
    $('input[id^="show-"][type="checkbox"]').on('change', changeFilterHandler);
    $('#selectPageUrls').on('change', targetUrlChangeHandler);
    $('#max-logged-requests').on('change', function(){ changeValueHandler($(this), 'maxLoggedRequests', 0, 999); });

    // https://github.com/gorhill/httpswitchboard/issues/197
    $(window).one('beforeunload', prepareToDie);

    renderTransientData(true);
    renderRequests();
});

/******************************************************************************/

})();
