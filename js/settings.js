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

function gethttpsb() {
    return chrome.extension.getBackgroundPage().HTTPSB;
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

function initAll() {
    var httpsb = gethttpsb();

    $('#delete-blacklisted-cookies').attr('checked', httpsb.userSettings.deleteCookies);
    $('#delete-blacklisted-localstorages').attr('checked', httpsb.userSettings.deleteLocalStorages);
    $('#cookie-removed-counter').html(httpsb.cookieRemovedCounter);
    $('#process-behind-the-scene').attr('checked', httpsb.userSettings.processBehindTheSceneRequests);

    // Handle user interaction

    $('#delete-blacklisted-cookies').change(function(){
        changeUserSettings('deleteCookies', $(this).is(':checked'));
    });

    $('#delete-blacklisted-localstorages').change(function(){
        changeUserSettings('deleteLocalStorages', $(this).is(':checked'));
    });

    $('#process-behind-the-scene').change(function(){
        changeUserSettings('processBehindTheSceneRequests', $(this).is(':checked'));
    });
}

/******************************************************************************/

$(function() {
    initAll();
});
