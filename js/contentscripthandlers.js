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

function contentScriptSummaryHandler(details) {
    // TODO: Investigate "Error in response to tabs.executeScript: TypeError:
    // Cannot read property 'pageUrl' of null" (2013-11-12). When can this
    // happens? 
    if ( !details || !details.pageUrl ) {
        return;
    }
    var ut = uriTools;
    var httpsb = HTTPSB;
    var pageURL = ut.normalizeURI(details.pageUrl);
    var pageHostname = ut.hostnameFromURI(pageURL);
    var sources, i;
    var url, hostname, block;

    // scripts
    // https://github.com/gorhill/httpswitchboard/issues/25
    sources = Object.keys(details.scriptSources);
    i = sources.length;
    while ( i-- ) {
        url = sources[i];
        hostname = false;
        if ( url === '{inline_script}' ) {
            url = pageURL + '{inline_script}';
        } else {
            url = ut.normalizeURI(url);
            hostname = ut.hostnameFromURI(url);
        }
        if ( !hostname ) {
            hostname = pageHostname;
        }
        block = httpsb.blacklisted(pageURL, 'script', hostname);
        recordFromPageUrl(pageURL, 'script', url, block);
    }

    // plugins
    // https://github.com/gorhill/httpswitchboard/issues/25
    sources = Object.keys(details.pluginSources);
    i = sources.length;
    while ( i-- ) {
        url = ut.normalizeURI(sources[i]);
        hostname = ut.hostnameFromURI(url);
        if ( !hostname ) {
            hostname = pageHostname;
        }
        block = httpsb.blacklisted(pageURL, 'object', hostname);
        recordFromPageUrl(pageURL, 'object', url, block);
    }
}

/******************************************************************************/

function contentScriptLocalStorageHandler(pageURL) {
    var httpsb = HTTPSB;
    var response = httpsb.blacklisted(pageURL, 'cookie', uriTools.hostnameFromURI(pageURL));
    recordFromPageUrl(pageURL, 'cookie', uriTools.rootURLFromURI(pageURL) + '/{localStorage}', response);
    response = response && httpsb.userSettings.deleteLocalStorage;
    if ( response ) {
        httpsb.localStorageRemovedCounter++;
    }
    return response;
}

