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

/******************************************************************************/

function changeUserSettings(name, value) {
    chrome.runtime.sendMessage({
        what: 'userSettings',
        name: name,
        value: value
    });
}

/******************************************************************************/

function onChangeValueHandler(elem, setting, min, max) {
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

function prepareToDie() {
    onChangeValueHandler($('#delete-unused-session-cookies-after'), 'deleteUnusedSessionCookiesAfter', 15, 1440);
    onChangeValueHandler($('#clear-browser-cache-after'), 'clearBrowserCacheAfter', 15, 1440);
    onChangeValueHandler($('#spoof-user-agent-every'), 'spoofUserAgentEvery', 2, 999);
}

/******************************************************************************/

$(function() {
    var httpsb = gethttpsb();
    var userSettings = httpsb.userSettings;

    $('input[name="displayTextSize"]').attr('checked', function(){
        return $(this).attr('value') === userSettings.displayTextSize;
        });
    $('#strict-blocking').attr('checked', userSettings.strictBlocking === true);
    $('#auto-create-scope').attr('checked', userSettings.autoCreateScope !== '');
    $('#auto-create-scope-level').val(userSettings.autoCreateScope !== '' ? userSettings.autoCreateScope : 'domain');
    $('#auto-whitelist-page-domain').attr('checked', userSettings.autoWhitelistPageDomain === true);
    $('#smart-auto-reload').val(userSettings.smartAutoReload);
    $('#delete-unused-temporary-scopes').attr('checked', userSettings.deleteUnusedTemporaryScopes === true);
    $('#delete-unused-session-cookies').attr('checked', userSettings.deleteUnusedSessionCookies === true);
    $('#delete-unused-session-cookies-after').val(userSettings.deleteUnusedSessionCookiesAfter);
    $('#delete-blacklisted-cookies').attr('checked', userSettings.deleteCookies === true);
    $('#delete-blacklisted-localstorage').attr('checked', userSettings.deleteLocalStorage);
    $('#clear-browser-cache').attr('checked', userSettings.clearBrowserCache === true);
    $('#clear-browser-cache-after').val(userSettings.clearBrowserCacheAfter);
    $('#process-referer').attr('checked', userSettings.processReferer);
    $('#spoof-user-agent').attr('checked', userSettings.spoofUserAgent);
    $('#spoof-user-agent-every').val(userSettings.spoofUserAgentEvery);
    $('#spoof-user-agent-with').val(userSettings.spoofUserAgentWith);

    // Handle user interaction
    $('input[name="displayTextSize"]').on('change', function(){
        changeUserSettings('displayTextSize', $(this).attr('value'));
    });
    $('#strict-blocking').on('change', function(){
        changeUserSettings('strictBlocking', $(this).is(':checked'));
    });
    $('#auto-create-scope').on('change', function(){
        if ( $(this).is(':checked') === false ) {
            changeUserSettings('autoCreateScope', '');
            return;
        }
        changeUserSettings('autoCreateScope', $('#auto-create-scope-level').val());
    });
    $('#auto-create-scope-level').on('change', function(){
       if ( $('#auto-create-scope').is(':checked') !== false ) {
            changeUserSettings('autoCreateScope', this.value);
        }
    });
    $('#auto-whitelist-page-domain').on('change', function(){
        changeUserSettings('autoWhitelistPageDomain', $(this).is(':checked'));
    });
    $('#smart-auto-reload').on('change', function(){
        changeUserSettings('smartAutoReload', this.value);
    });
    $('#delete-unused-temporary-scopes').on('change', function(){
        changeUserSettings('deleteUnusedTemporaryScopes', $(this).is(':checked'));
    });
    $('#delete-unused-session-cookies').on('change', function(){
        changeUserSettings('deleteUnusedSessionCookies', $(this).is(':checked'));
    });
    $('#delete-unused-session-cookies-after').on('change', function(){
        onChangeValueHandler($(this), 'deleteUnusedSessionCookiesAfter', 15, 1440);
    });
    $('#delete-blacklisted-cookies').on('change', function(){
        changeUserSettings('deleteCookies', $(this).is(':checked'));
    });
    $('#delete-blacklisted-localstorage').on('change', function(){
        changeUserSettings('deleteLocalStorage', $(this).is(':checked'));
    });
    $('#clear-browser-cache').on('change', function(){
        changeUserSettings('clearBrowserCache', $(this).is(':checked'));
    });
    $('#clear-browser-cache-after').on('change', function(){
        onChangeValueHandler($(this), 'clearBrowserCacheAfter', 15, 1440);
    });
    $('#process-referer').on('change', function(){
        changeUserSettings('processReferer', $(this).is(':checked'));
    });
    $('#spoof-user-agent').on('change', function(){
        changeUserSettings('spoofUserAgent', $(this).is(':checked'));
    });
    $('#spoof-user-agent-every').on('change', function(){
        onChangeValueHandler($(this), 'spoofUserAgentEvery', 2, 999);
    });
    $('#spoof-user-agent-with').on('change', function(){
        changeUserSettings('spoofUserAgentWith', $(this).val());
    });

    // https://github.com/gorhill/httpswitchboard/issues/197
    $(window).one('beforeunload', prepareToDie);
});

/******************************************************************************/

})();
