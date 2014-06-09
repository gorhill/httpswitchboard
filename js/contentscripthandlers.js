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

/* global chrome, HTTPSB */

/******************************************************************************/

(function() {

/******************************************************************************/

var contentScriptSummaryHandler = function(details, sender) {
    // TODO: Investigate "Error in response to tabs.executeScript: TypeError:
    // Cannot read property 'locationURL' of null" (2013-11-12). When can this
    // happens? 
    if ( !details || !details.locationURL ) {
        return;
    }
    var httpsb = HTTPSB;
    var pageURL = httpsb.pageUrlFromTabId(sender.tab.id);
    var pageStats = httpsb.pageStatsFromPageUrl(pageURL);
    var httpsburi = httpsb.URI.set(details.locationURL);
    var frameURL = httpsburi.normalizedURI();
    var frameHostname = httpsburi.hostname;
    var urls, url, r;

    // https://github.com/gorhill/httpswitchboard/issues/333
    // Look-up here whether inline scripting is blocked for the frame.
    var inlineScriptBlocked = httpsb.blacklisted(pageURL, 'script', frameHostname);

    // scripts
    // https://github.com/gorhill/httpswitchboard/issues/25
    if ( pageStats && inlineScriptBlocked ) {
        urls = details.scriptSources;
        for ( url in urls ) {
            if ( !urls.hasOwnProperty(url) ) {
                continue;
            }
            if ( url === '{inline_script}' ) {
                url = frameURL + '{inline_script}';
            }
            r = httpsb.filterRequest(pageURL, 'script', url);
            pageStats.recordRequest('script', url, r !== false, r);
        }
    }

    // TODO: as of 2014-05-26, not sure this is needed anymore, since HTTPSB
    // no longer uses chrome.contentSettings API (I think that was the reason
    // this code was put in).
    // plugins
    // https://github.com/gorhill/httpswitchboard/issues/25
    if ( pageStats ) {
        urls = details.pluginSources;
        for ( url in urls ) {
            if ( !urls.hasOwnProperty(url) ) {
                continue;
            }
            r = httpsb.filterRequest(pageURL, 'object', url);
            pageStats.recordRequest('object', url, r !== false, r);
        }
    }

    // https://github.com/gorhill/httpswitchboard/issues/181
    httpsb.onPageLoadCompleted(pageURL);
};

/******************************************************************************/

var contentScriptLocalStorageHandler = function(pageURL) {
    var httpsb = HTTPSB;
    var httpsburi = httpsb.URI.set(pageURL);
    var response = httpsb.blacklisted(pageURL, 'cookie', httpsburi.hostname);
    httpsb.recordFromPageUrl(
        pageURL,
        'cookie',
        httpsburi.rootURL() + '/{localStorage}',
        response
    );
    response = response && httpsb.userSettings.deleteLocalStorage;
    if ( response ) {
        httpsb.localStorageRemovedCounter++;
    }
    return response;
};

/******************************************************************************/

// Handling stuff asynchronously simplifies code

var onMessageHandler = function(request, sender, callback) {
    if ( !request || !request.what ) {
        return;
    }

    var response;

    switch ( request.what ) {

    case 'contentScriptHasLocalStorage':
        response = contentScriptLocalStorageHandler(request.url);
        break;

    case 'contentScriptSummary':
        contentScriptSummaryHandler(request, sender);
        break;

    case 'checkScriptBlacklisted':
        response = {
            scriptBlacklisted: HTTPSB.blacklisted(
                request.url,
                'script',
                HTTPSB.URI.hostnameFromURI(request.url)
                )
            };
        break;

    case 'getUserAgentReplaceStr':
        response = HTTPSB.userSettings.spoofUserAgent ? HTTPSB.userAgentReplaceStr : undefined;
        break;


    case 'retrieveDomainCosmeticSelectors':
        response = HTTPSB.abpHideFilters.retrieveDomainSelectors(request);
        break;

    case 'retrieveGenericCosmeticSelectors':
        response = HTTPSB.abpHideFilters.retrieveGenericSelectors(request);
        break;

    default:
         // console.error('HTTP Switchboard > onMessage > unknown request: %o', request);
        break;
    }

    if ( response !== undefined && callback ) {
        callback(response);
    }
};

chrome.runtime.onMessage.addListener(onMessageHandler);

/******************************************************************************/

})();
