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

(function(){

/******************************************************************************/

var background = chrome.extension.getBackgroundPage();
var httpsb = background.HTTPSB;
var data = {
    whitelistCount: 0,
    blacklistCount: 0,
    blockedRequestCounters: httpsb.blockedRequestCounters,
    allowedRequestCounters: httpsb.allowedRequestCounters,
    requests: [],

    last: 0
};
var maxRequests = 200;

var updateStatsData = function() {
    data.whitelistCount = Object.keys(httpsb.whitelist).length;
    data.blacklistCount = Object.keys(httpsb.blacklist).length;
};

var updateRequestData = function() {
    data.requests = [];

    var pages = Object.keys(httpsb.pageStats);
    var pageToRequests = pages.map(function(pageUrl) {
        var pageStats = httpsb.pageStats[pageUrl];
        var requests = pageStats.requests;
        var reqKeys = Object.keys(requests);
        reqKeys.sort(function(a, b) {
            return requests[b].localeCompare(requests[a]);
        });
        reqKeys = reqKeys.slice(0, maxRequests);
        requests = reqKeys.map(function(reqKey) {
            // Using parseFloat because of
            // http://jsperf.com/performance-of-parseint
            return {
                url: reqKey.slice(0, reqKey.indexOf('|')),
                when: parseFloat(requests[reqKey].slice(0, requests[reqKey].indexOf('|'))),
                blocked: requests[reqKey].slice(requests[reqKey].indexOf('|') + 1) === '0'
            };
        });
        data.requests = data.requests.concat(requests);
    });
    data.requests.sort(function(a, b) {
        return b.when - a.when;
    });
    data.requests = data.requests.slice(0, maxRequests);
};

var statsTemplate = Tempo.prepare('stats');
var requestTemplate = Tempo.prepare('requests');

var updateStats = function() {
    updateStatsData();
    statsTemplate.render(data);
};

var updateRequests = function() {
    updateRequestData();
    requestTemplate.render(data.requests);
};

updateStats();
updateRequests();

setInterval(function(){ updateStats(); }, 5000);

/******************************************************************************/

// Ensure links are opened in another tab
$('a').attr('target', '_blank');

$('#refresh-requests').click(updateRequests);

/******************************************************************************/

})();
