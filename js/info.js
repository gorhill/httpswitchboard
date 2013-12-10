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

var targetUrl = 'All';
var maxRequests = 500;
var selectedRemoteBlacklistsHash = '';

/******************************************************************************/

function gethttpsb() {
    return chrome.extension.getBackgroundPage().HTTPSB;
}

function pageStatsFromPageUrl(pageUrl) {
    return chrome.extension.getBackgroundPage().HTTPSB.pageStats[pageUrl];
}

/******************************************************************************/

// Get a list of latest net requests

function requestDetails(url, type, when, blocked) {
    this.url = url;
    this.when = type;
    this.type = when;
    this.blocked = blocked;
}

function updateRequestData() {
    var requests = [];
    var pageUrls = targetUrl === 'All' ?
          Object.keys(gethttpsb().pageStats) :
          [targetUrl];
    var iPageUrl, nPageUrls, pageUrl;
    var reqKeys, iReqKey, nReqKeys, reqKey;
    var pageStats, pageRequests;
    var pos, reqURL, reqType, entry;

    nPageUrls = pageUrls.length;
    for ( iPageUrl = 0; iPageUrl < nPageUrls; iPageUrl++ ) {
        pageUrl = pageUrls[iPageUrl];
        pageStats = pageStatsFromPageUrl(pageUrl);
        // Unsure if it can happen... Just in case
        if ( !pageStats ) {
            continue;
        }
        pageRequests = pageStats.requests;
        reqKeys = pageRequests.getLoggedRequests();
        nReqKeys = reqKeys.length;
        for ( iReqKey = 0; iReqKey < nReqKeys; iReqKey++ ) {
            reqKey = reqKeys[iReqKey];
            // rhill 2013-12-04: `reqKey` can be null since a ring buffer is
            // now used, and it might not have been filled yet.
            if ( !reqKey ) {
                continue;
            }
            pos = reqKey.indexOf('#');
            reqURL = reqKey.slice(0, pos);
            reqType = reqKey.slice(pos + 1);
            entry = pageRequests.getLoggedRequestEntry(reqURL, reqType);
            if ( !entry ) {
                continue;
            }
            requests.push(new requestDetails(
                reqURL,
                entry.when,
                reqType,
                entry.blocked
            ));
        }
    }

    return requests
        .sort(function(a,b){return b.when-a.when;})
        .slice(0, maxRequests);
}

/******************************************************************************/

function renderNumber(value) {
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

function renderBlacklistDetails() {
    // empty list first
    $('#remoteBlacklists .remoteBlacklistDetails').remove();

    // then fill it
    var httpsb = gethttpsb();
    var blacklists = httpsb.remoteBlacklists;
    var ul = $('#remoteBlacklists');
    var keys = Object.keys(blacklists);
    var i = keys.length;
    var blacklist;
    var liTemplate = $('#remoteBlacklistsTemplate .remoteBlacklistDetails').first();
    var li, child;
    while ( i-- ) {
        blacklist = blacklists[keys[i]];
        li = liTemplate.clone();
        child = $('input', li);
        child.prop('checked', !blacklist.off);
        child = $('a', li);
        child.attr('href', keys[i]);
        child.text(keys[i]);
        child = $('span', li);
        child.text(!isNaN(+blacklist.entryCount) ? renderNumber(blacklist.entryCount) : '?');
        ul.prepend(li);
    }
    selectedRemoteBlacklistsHash = getSelectedRemoteBlacklistsHash();
}

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
    if ( targetUrl !== 'All' && !httpsb.pageStats[targetUrl] ) {
        targetUrl = 'All';
    }

    var requestStats = targetUrl === 'All' ? httpsb.requestStats : httpsb.pageStats[targetUrl].requestStats;
    var blockedStats = requestStats.blocked;
    var allowedStats = requestStats.allowed;
    renderNumbers({
        '#whitelistCount': httpsb.temporaryScopes.scopes['*'].white.count,
        '#blacklistCount': httpsb.temporaryScopes.scopes['*'].black.count,
        '#blacklistReadonlyCount': httpsb.blacklistReadonly.count,
        '#blockedAllCount': requestStats.blocked.all,
        '#blockedMainFrameCount': blockedStats.main_frame,
        '#blockedCookieCount': blockedStats.cookie,
        '#blockedImageCount': blockedStats.image,
        '#blockedObjectCount': blockedStats.object,
        '#blockedScriptCount': blockedStats.script,
        '#blockedXHRCount': blockedStats.xmlhttprequest,
        '#blockedSubFrameCount': blockedStats.sub_frame,
        '#blockedOtherCount': blockedStats.other,
        '#allowedAllCount': allowedStats.all,
        '#allowedMainFrameCount': allowedStats.main_frame,
        '#allowedCookieCount': allowedStats.cookie,
        '#allowedImageCount': allowedStats.image,
        '#allowedObjectCount': allowedStats.object,
        '#allowedScriptCount': allowedStats.script,
        '#allowedXHRCount': allowedStats.xmlhttprequest,
        '#allowedSubFrameCount': allowedStats.sub_frame,
        '#allowedOtherCount': allowedStats.other,
        '#maxLoggedRequests': httpsb.userSettings.maxLoggedRequests
    });
}

/******************************************************************************/

function renderRequestRow(row, request) {
    var jqRow = $(row);
    row = jqRow[0];
    jqRow.attr('id', '');
    jqRow.css('display', '');
    jqRow.removeClass();
    if ( request.blocked ) {
        jqRow.addClass('blocked-true');
    } else {
        jqRow.addClass('blocked-false');
    }
    jqRow.addClass('type-' + request.type);
    var cells = row.cells;
    var when = new Date(request.when);
    $(cells[0]).text(when.toLocaleTimeString());
    $(cells[1]).text(request.type);
    var a = $('a', cells[2]);
    // Well I got back full control since not using Tempo.js, I can now
    // generate smarter hyperlinks, that is, not hyperlinking fake
    // request URLs, which are recognizable with their curly braces inside.
    if ( request.url.search('{') < 0 ) {
        a.attr('href', request.url);
        a.css('display', '');
    } else {
        a.css('display', 'none');
    }
    $(cells[3]).text(request.url);
}

/*----------------------------------------------------------------------------*/

function renderRequests() {
    var table = $('#requestsTable tbody');
    var requests = updateRequestData();
    var row;
    var rowTemplate = $('#requestRowTemplate', table);

    // Reuse whatever rows is already in there.
    // Remember: order of elements returned by prevAll() is closest to farthest.
    var rows = $(rowTemplate).prevAll().toArray();
    var i = 0;
    while ( i < requests.length && rows.length ) {
        renderRequestRow(rows.pop(), requests[i]);
        i++;
    }
    // Create new rows to receive what is left
    if ( i < requests.length ) {
        do {
            row = rowTemplate.clone();
            renderRequestRow(row, requests[i]);
            row.insertBefore(rowTemplate);
            i++;
        } while ( i < requests.length );
    }
    // Remove extra rows
    else if ( rows.length ) {
        $(rows).remove();
    }

    syncWithFilters();
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

    chrome.runtime.sendMessage({
        what: 'userSettings',
        name: 'statsFilters',
        value: statsFilters
    });

    syncWithFilters();
}

/******************************************************************************/

// Synchronize list of net requests with filter states

function syncWithFilters() {
    var blocked = ['blocked','allowed'];
    var type = ['main_frame','cookie','image','object','script','xmlhttprequest','sub_frame','other'];
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

function reloadRemoteBlacklistsHandler() {
    var newHash = getSelectedRemoteBlacklistsHash();
    if ( newHash === selectedRemoteBlacklistsHash ) {
        return;
    }
    // Reload blacklists
    var switches = [];
    var lis = $('#remoteBlacklists .remoteBlacklistDetails');
    var i = lis.length;
    while ( i-- ) {
        switches.push({
            location: $(lis[i]).children('a').attr('href'),
            off: $(lis[i]).children('input').prop('checked') === false
        });
    }
    chrome.runtime.sendMessage({
        what: 'reloadPresetBlacklists',
        switches: switches
    });
    $('#reloadRemoteBlacklists').attr('disabled', true );
}

/******************************************************************************/

// Create a hash so that we know whether the selection of preset blacklists
// has changed.

function getSelectedRemoteBlacklistsHash() {
    var hash = '';
    var inputs = $('#remoteBlacklists .remoteBlacklistDetails > input');
    var i = inputs.length;
    while ( i-- ) {
        hash += $(inputs[i]).prop('checked').toString();
    }
    return hash;
}

// This is to give a visual hint that the selection of preset blacklists has
// changed and thus user needs to explicitly click the reload button.

function remoteBlacklistDetailsChangeHandler() {
    $('#reloadRemoteBlacklists').attr('disabled', getSelectedRemoteBlacklistsHash() === selectedRemoteBlacklistsHash);
}

/******************************************************************************/

function onMessageHandler(request, sender) {
    if ( request && request.what ) {
        switch ( request.what ) {
            case 'presetBlacklistsLoaded':
                renderBlacklistDetails();
                remoteBlacklistDetailsChangeHandler();
                break;
        }
    }
}

/******************************************************************************/

function initAll() {
    $('#version').html(gethttpsb().manifest.version);
    $('a:not([target])').prop('target', '_blank');

    $('#reloadRemoteBlacklists').on('click', reloadRemoteBlacklistsHandler);
    $('#remoteBlacklists').on('change', '.remoteBlacklistDetails', remoteBlacklistDetailsChangeHandler);

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

    // To know when the preset blacklist stats change
    chrome.runtime.onMessage.addListener(onMessageHandler);

    renderTransientData(true);
    renderRequests();
    renderBlacklistDetails();
}

/******************************************************************************/

// Handle user interaction

$(function(){
    initAll();
});

/******************************************************************************/

})();
