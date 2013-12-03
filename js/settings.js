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

    $('input[name="displayTextSize"]').attr('checked', function(){
        return $(this).attr('value') === httpsb.userSettings.displayTextSize;
        });
    $('#strict-blocking').attr('checked', httpsb.userSettings.strictBlocking);
    $('#delete-blacklisted-cookies').attr('checked', httpsb.userSettings.deleteCookies);
    $('#delete-blacklisted-localstorage').attr('checked', httpsb.userSettings.deleteLocalStorage);
    $('#cookie-removed-counter').html(httpsb.cookieRemovedCounter);
    $('#localstorage-removed-counter').html(httpsb.localStorageRemovedCounter);
    $('#process-behind-the-scene').attr('checked', httpsb.userSettings.processBehindTheSceneRequests);
    $('#max-logged-requests').val(httpsb.userSettings.maxLoggedRequests);

    // Handle user interaction

    $('input[name="displayTextSize"]').on('change', function(){
        changeUserSettings('displayTextSize', $(this).attr('value'));
    });
    $('#strict-blocking').on('change', function(){
        changeUserSettings('strictBlocking', $(this).is(':checked'));
    });
    $('#delete-blacklisted-cookies').on('change', function(){
        changeUserSettings('deleteCookies', $(this).is(':checked'));
    });
    $('#delete-blacklisted-localstorage').on('change', function(){
        changeUserSettings('deleteLocalStorage', $(this).is(':checked'));
    });
    $('#process-behind-the-scene').on('change', function(){
        changeUserSettings('processBehindTheSceneRequests', $(this).is(':checked'));
    });
    $('#max-logged-requests').on('change', function(){
        var oldVal = gethttpsb().userSettings.maxLoggedRequests;
        var newVal = Math.round(parseFloat($(this).val()));
        if ( typeof newVal !== 'number' ) {
            newVal = oldVal;
        } else {
            newVal = Math.max(newVal, 0);
            newVal = Math.min(newVal, 999);
        }
        $(this).val(newVal);
        if ( newVal !== oldVal ) {
            changeUserSettings('maxLoggedRequests', newVal);
        }
    });

    $('.whatisthis').on('click', function() {
        $(this).parents('li')
        .first()
        .find('.expandable')
        .toggleClass('expanded');
    });
}

/******************************************************************************/

$(function() {
    initAll();
});

/******************************************************************************/

})();
