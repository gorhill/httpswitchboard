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

function contentScriptSummaryHandler(details, sender) {
    // TODO: Investigate "Error in response to tabs.executeScript: TypeError:
    // Cannot read property 'locationURL' of null" (2013-11-12). When can this
    // happens? 
    if ( !details || !details.locationURL ) {
        return;
    }
    var httpsb = HTTPSB;
    var pageURL = httpsb.pageUrlFromTabId(sender.tab.id);
    var httpsburi = httpsb.URI.set(details.locationURL);
    var frameURL = httpsburi.normalizedURI();
    var pageHostname = httpsburi.hostname;
    var urls, url, hostname, block;

    // rhill 2014-01-17: I try not to use Object.keys() anymore when it can
    // be avoided, because extracting the keys this way results in a
    // transient javascript array being created, which means mem allocation,
    // and with all that come with it (mem fragmentation, GC, whatever).

    // scripts
    // https://github.com/gorhill/httpswitchboard/issues/25
    urls = details.scriptSources;
    for ( url in urls ) {
        if ( !urls.hasOwnProperty(url) ) {
            continue;
        }
        hostname = false;
        if ( url === '{inline_script}' ) {
            url = frameURL + '{inline_script}';
        } else {
            url = httpsburi.set(url).normalizedURI();
            hostname = httpsburi.hostname;
        }
        if ( !hostname ) {
            hostname = pageHostname;
        }
        block = httpsb.blacklisted(pageURL, 'script', hostname);
        httpsb.recordFromPageUrl(pageURL, 'script', url, block);
    }

    // plugins
    // https://github.com/gorhill/httpswitchboard/issues/25
    urls = details.pluginSources;
    for ( url in urls ) {
        if ( !urls.hasOwnProperty(url) ) {
            continue;
        }
        url = httpsburi.set(url).normalizedURI();
        hostname = httpsburi.hostname;
        if ( !hostname ) {
            hostname = pageHostname;
        }
        block = httpsb.blacklisted(pageURL, 'object', hostname);
        httpsb.recordFromPageUrl(pageURL, 'object', url, block);
    }

    // https://github.com/gorhill/httpswitchboard/issues/181
    httpsb.onPageLoadCompleted(pageURL);
}

/******************************************************************************/

function contentScriptLocalStorageHandler(pageURL) {
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
}

