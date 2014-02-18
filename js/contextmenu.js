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

chrome.contextMenus.create({
    type: 'normal',
    id: 'gdt-group0',
    title: 'Temporarily whitelist ...',
    documentUrlPatterns: ['http://*/*', 'https://*/*']
    }
);

chrome.contextMenus.create({
    type: 'normal',
    id: 'revertScopeRules',
    title: 'Remove temporary permissions',
    documentUrlPatterns: ['http://*/*', 'https://*/*']
    }
);

chrome.contextMenus.create({
    type: 'separator',
    documentUrlPatterns: ['http://*/*', 'https://*/*']
    }
);

chrome.contextMenus.create({
    type: 'normal',
    id: 'gotoDashboard',
    title: 'Dashboard...',
    documentUrlPatterns: ['http://*/*', 'https://*/*']
    }
);

function contextMenuClickHandler(info, tab) {
    // "If the click did not take place in a tab,
    // "this parameter will be missing"
    if ( !tab ) {
        return;
    }

    var pageURL = uriTools.normalizeURI(tab.url);
    var pageDomain = uriTools.domainFromURI(pageURL);

    if ( !pageDomain ) {
        return;
    }

    switch ( info.menuItemId ) {
        case 'gdt-group0':
            HTTPSB.whitelistTemporarily(pageURL, '*', pageDomain);
            HTTPSB.smartReloadTab(tab.id);
            break;

        case 'revertScopeRules':
            HTTPSB.revertScopeRules(HTTPSB.temporaryScopeKeyFromPageURL(pageURL));
            smartReloadTabs();
            break;

        case 'gotoDashboard':
            chrome.runtime.sendMessage({
                what: 'gotoExtensionURL',
                url: 'dashboard.html'
            });
            break;
    }
}

chrome.contextMenus.onClicked.addListener(contextMenuClickHandler);

/******************************************************************************/

function updateContextMenuHandler(tabs) {
    if ( !tabs.length ) {
        return;
    }
    var tab = tabs[0];
    if ( !tab.url || !tab.url.length ) {
        return;
    }
    var pageUrl = uriTools.normalizeURI(tab.url);
    var pageDomain = uriTools.domainFromURI(pageUrl);
    var color = HTTPSB.evaluate(pageUrl, '*', pageDomain);
    chrome.contextMenus.update('gdt-group0', {
        title: 'Temporarily whitelist *.' + punycode.toUnicode(pageDomain),
        enabled: color.charAt(0) !== 'g' && !HTTPSB.off
    });
    chrome.contextMenus.update('revertScopeRules', {
        enabled: !HTTPSB.off
    });
}

function updateContextMenu() {
    chrome.tabs.query({ active: true }, updateContextMenuHandler);
}

