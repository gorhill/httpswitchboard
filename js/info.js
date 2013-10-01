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

$(function(){

/******************************************************************************/


var background = chrome.extension.getBackgroundPage();
var httpsb = background.HTTPSB;
var targetUrl = 'All';
var data = {
    urls: [],
    whitelistCount: 0,
    blacklistCount: 0,
    blockedRequestCounters: httpsb.blockedRequestCounters,
    allowedRequestCounters: httpsb.allowedRequestCounters,
    requests: [],
    last: 0
};
var maxRequests = 500;

var updateStatsData = function() {
    data.urls = Object.keys(httpsb.pageUrlToTabId).concat('All').sort().map(function(v) {
        return { url: v, target: v === targetUrl };
    });
    data.blockedRequestCounters = targetUrl === 'All'
        ? httpsb.blockedRequestCounters
        : background.pageStatsFromPageUrl(targetUrl).blockedStats
        ;
    data.allowedRequestCounters = targetUrl === 'All'
        ? httpsb.allowedRequestCounters
        : background.pageStatsFromPageUrl(targetUrl).allowedStats
        ;
    data.whitelistCount = Object.keys(httpsb.whitelist).length;
    data.blacklistCount = Object.keys(httpsb.blacklist).length;
    data.remoteBlacklists = httpsb.remoteBlacklists;
};

/******************************************************************************/

// Get a list of latest net requests

var updateRequestData = function() {
    data.requests = [];
    var pages = targetUrl === 'All'
        ? Object.keys(httpsb.pageStats)
        : [targetUrl]
        ;
    var pageToRequests = pages.map(function(pageUrl) {
        var pageStats = httpsb.pageStats[pageUrl];
        var requests = pageStats.requests;
        var reqKeys = Object.keys(requests);
        reqKeys.sort(function(a, b) {
            return requests[b].localeCompare(requests[a]);
        });
        reqKeys = reqKeys.slice(0, maxRequests);
        requests = reqKeys.map(function(reqKey) {
            var v = requests[reqKey];
            var i = v.indexOf('#');
            // Using parseFloat because of
            // http://jsperf.com/performance-of-parseint
            return {
                url: background.urlFromReqKey(reqKey),
                when: parseFloat(v.slice(0, i)),
                type: background.typeFromReqKey(reqKey),
                blocked: v.slice(i+1) === '0'
            };
        });
        data.requests = data.requests.concat(requests);
    });
    data.requests.sort(function(a, b) {
        return b.when - a.when;
    });
    data.requests = data.requests.slice(0, maxRequests);
};

/******************************************************************************/

// Synchronize list of net requests with filter states

var syncWithFilters = function() {
    var blocked = ['blocked','allowed'];
    var type = ['main_frame','cookie','image','object','script','xmlhttprequest','sub_frame','other'];
    var i = blocked.length;
    var j;
    var display, selector;
    while ( i-- ) {
        j = type.length;
        while ( j-- ) {
            display = $('#show-' + blocked[i]).prop('checked') &&
                      $('#show-' + type[j]).prop('checked')
                ? ''
                : 'none'
                ;
            selector = '.blocked-' + (blocked[i] === 'blocked') + '.type-' + type[j];
            $(selector).css('display', display);
        }
    }
};

/******************************************************************************/

// Render page

var urlsTemplate = Tempo.prepare('urls');
var listsTemplate = Tempo.prepare('lists');
var statsTemplate = Tempo.prepare('stats');
var requestTemplate = Tempo.prepare('requests');

var updateStats = function() {
    updateStatsData();
    urlsTemplate.render(data.urls);
    listsTemplate.render(data);
    statsTemplate.render(data);
};

var updateRequests = function() {
    updateRequestData();
    requestTemplate.render(data.requests);
    syncWithFilters();
};

updateStats();
updateRequests();

/******************************************************************************/

// Auto update basic stats (not list of requests though, this is done through
// `refresh` button.

setInterval(function(){ updateStats(); }, 10000); // every 10s

/******************************************************************************/

// Handle user interaction

$('#version').html(httpsb.manifest.version);
$('a').prop('target', '_blank');
$('#refresh-requests').click(updateRequests);
$('input[id^="show-"][type="checkbox"]').change(syncWithFilters);

$('#urls').change(function(){
    targetUrl = this[this.selectedIndex].value.replace(/&amp;/g, '&');
    updateStats();
    updateRequests();
    });

/******************************************************************************/

});
