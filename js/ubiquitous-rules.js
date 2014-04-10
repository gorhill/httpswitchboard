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

var userListHref = '#userUbiquitousBlacklistedHostsPrompt';
var cachedUserUbiquitousBlacklistedHosts = '';
var cachedUserUbiquitousWhitelistedHosts = '';
var selectedBlacklistsHash = '';

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

function renderBlacklists() {
    // empty list first
    $('#blacklists .blacklistDetails').remove();

    var httpsb = gethttpsb();

    $('#ubiquitousListsOfBlockedHostsPrompt2').text(
        chrome.i18n.getMessage('ubiquitousListsOfBlockedHostsPrompt2')
            .replace('{{ubiquitousBlacklistCount}}', renderNumber(httpsb.ubiquitousBlacklist.count))
    );

    var blacklists = httpsb.remoteBlacklists;
    var ul = $('#blacklists');
    var keys = Object.keys(blacklists);
    var i = keys.length;
    var blacklist, blacklistName;
    var liTemplate = $('#blacklistTemplate .blacklistDetails').first();
    var li, child;
    while ( i-- ) {
        blacklistName = keys[i];
        blacklist = blacklists[blacklistName];
        li = liTemplate.clone();
        child = $('input', li);
        child.prop('checked', !blacklist.off);
        child = $('a', li);
        // Special rendering: user list
        if ( blacklistName === httpsb.userBlacklistPath ) {
            child.attr('href', userListHref);
            child.text($(userListHref).text());
        } else {
            child.attr('href', encodeURI(blacklistName));
            child.text(blacklistName);
        }
        child = $('span span:nth-of-type(1)', li);
        child.text(!blacklist.off && !isNaN(+blacklist.entryUsedCount) ? renderNumber(blacklist.entryUsedCount) : '0');
        child = $('span span:nth-of-type(2)', li);
        child.text(!isNaN(+blacklist.entryCount) ? renderNumber(blacklist.entryCount) : '?');
        ul.prepend(li);
    }
    $('#parseAllABPFilters').attr('checked', httpsb.userSettings.parseAllABPFilters === true);
    $('#ubiquitousParseAllABPFiltersPrompt2').text(
        chrome.i18n.getMessage("ubiquitousParseAllABPFiltersPrompt2")
            .replace('{{abpFilterCount}}', renderNumber(httpsb.abpFilters.getFilterCount()))
    );

    selectedBlacklistsHash = getSelectedBlacklistsHash();
}

/******************************************************************************/

// Create a hash so that we know whether the selection of preset blacklists
// has changed.

function getSelectedBlacklistsHash() {
    var hash = '';
    var inputs = $('#blacklists .blacklistDetails > input');
    var i = inputs.length;
    var input, entryHash;
    while ( i-- ) {
        input = $(inputs[i]);
        if ( input.siblings('a').prop('hash') === userListHref ) {
            entryHash = input.prop('checked') ? cachedUserUbiquitousBlacklistedHosts : '';
        } else {
            entryHash = input.prop('checked').toString();
        }
        hash += entryHash;
    }
    // Factor in whether ABP filters are to be processed
    hash += $('#parseAllABPFilters').prop('checked').toString();
    
    return hash;
}

/******************************************************************************/

// This is to give a visual hint that the selection of blacklists has changed.

function selectedBlacklistsChanged() {
    $('#blacklistsApply').attr(
        'disabled',
        getSelectedBlacklistsHash() === selectedBlacklistsHash
    );
}

// This is to give a visual hint that the content of user blacklist has changed.

function userBlacklistChanged() {
    $('#userUbiquitousBlacklistApply')
        .attr(
            'disabled',
            $('#userUbiquitousBlacklistedHosts').val().trim() === cachedUserUbiquitousBlacklistedHosts
        );
    selectedBlacklistsChanged();
}

/******************************************************************************/

function userWhitelistChanged() {
    $('#userUbiquitousWhitelistApply')
        .attr(
            'disabled',
             $('#userUbiquitousWhitelistedHosts').val().trim() === cachedUserUbiquitousWhitelistedHosts
        );
}

/******************************************************************************/

function renderUserBlacklist() {
    var onMessageHandler = function(details) {
        if ( !details || !details.what ) {
            return;
        }
        if ( details.what !== 'dashboardGetUbiquitousUserBlacklist' ) {
            return;
        }
        if ( !details.error ) {
            cachedUserUbiquitousBlacklistedHosts = details.content.trim();
            $('#userUbiquitousBlacklistedHosts').val(details.content);
            renderBlacklists();
        }
        chrome.runtime.onMessage.removeListener(onMessageHandler);
    };
    chrome.runtime.onMessage.addListener(onMessageHandler);
    var httpsb = gethttpsb();
    httpsb.assets.get(httpsb.userBlacklistPath, 'dashboardGetUbiquitousUserBlacklist');
}

/******************************************************************************/

function renderUserWhitelist() {
    var onMessageHandler = function(details) {
        if ( !details || !details.what ) {
            return;
        }
        if ( details.what !== 'dashboardGetUbiquitousUserWhitelist' ) {
            return;
        }
        if ( !details.error ) {
            cachedUserUbiquitousWhitelistedHosts = details.content.trim();
            $('#userUbiquitousWhitelistedHosts').val(details.content);
        }
        chrome.runtime.onMessage.removeListener(onMessageHandler);
    };
    chrome.runtime.onMessage.addListener(onMessageHandler);
    var httpsb = gethttpsb();
    httpsb.assets.get(httpsb.userWhitelistPath, 'dashboardGetUbiquitousUserWhitelist');
}

/******************************************************************************/

function blacklistsApplyHandler() {
    var newHash = getSelectedBlacklistsHash();
    if ( newHash === selectedBlacklistsHash ) {
        return;
    }
    // Reload blacklists
    var httpsb = gethttpsb();
    var switches = [];
    var lis = $('#blacklists .blacklistDetails');
    var i = lis.length;
    var path;
    while ( i-- ) {
        path = $(lis[i]).children('a').attr('href');
        if ( path === userListHref ) {
            path = httpsb.userBlacklistPath;
        }
        switches.push({
            location: path,
            off: $(lis[i]).children('input').prop('checked') === false
        });
    }
    chrome.runtime.sendMessage({
        what: 'reloadPresetBlacklists',
        switches: switches
    });
    $('#blacklistsApply').attr('disabled', true );
}

/******************************************************************************/

function abpFiltersCheckboxChanged() {
    changeUserSettings('parseAllABPFilters', $(this).is(':checked'));
    selectedBlacklistsChanged();
}

/******************************************************************************/

function appendToUserBlacklistFromFile() {
    var input = $('<input />').attr({
        type: 'file',
        accept: 'text/plain'
    });
    var fileReaderOnLoadHandler = function() {
        var textarea = $('#userUbiquitousBlacklistedHosts');
        textarea.val(textarea.val() + '\n' + this.result);
        userBlacklistChanged();
    };
    var filePickerOnChangeHandler = function() {
        $(this).off('change', filePickerOnChangeHandler);
        var file = this.files[0];
        if ( !file ) {
            return;
        }
        if ( file.type.indexOf('text') !== 0 ) {
            return;
        }
        var fr = new FileReader();
        fr.onload = fileReaderOnLoadHandler;
        fr.readAsText(file);
        input.off('change', filePickerOnChangeHandler);
    };
    input.on('change', filePickerOnChangeHandler);
    input.trigger('click');
}

function exportUserBlacklistToFile() {
    chrome.downloads.download({
        'url': 'data:text/plain,' + encodeURIComponent($('#userUbiquitousBlacklistedHosts').val()),
        'filename': 'ubiquitous-blacklisted-hosts.txt',
        'saveAs': true
    });
}

function userBlacklistApplyHandler() {
    var onMessageHandler = function(details) {
        if ( !details || !details.what ) {
            return;
        }
        if ( details.what !== 'dashboardPutUbiquitousUserBlacklist' ) {
            return;
        }
        if ( !details.error ) {
            cachedUserUbiquitousBlacklistedHosts = details.content.trim();
            userBlacklistChanged();
            blacklistsApplyHandler();
        }
        chrome.runtime.onMessage.removeListener(onMessageHandler);
    };
    chrome.runtime.onMessage.addListener(onMessageHandler);
    var httpsb = gethttpsb();
    httpsb.assets.put(
        httpsb.userBlacklistPath,
        $('#userUbiquitousBlacklistedHosts').val(),
        'dashboardPutUbiquitousUserBlacklist'
    );
}

/******************************************************************************/

function appendToUserWhitelistFromFile() {
    var input = $('<input />').attr({
        type: 'file',
        accept: 'text/plain'
    });
    var fileReaderOnLoadHandler = function() {
        var textarea = $('#userUbiquitousWhitelistedHosts');
        textarea.val(textarea.val() + '\n' + this.result);
        userWhitelistChanged();
    };
    var filePickerOnChangeHandler = function() {
        $(this).off('change', filePickerOnChangeHandler);
        var file = this.files[0];
        if ( !file ) {
            return;
        }
        if ( file.type.indexOf('text') !== 0 ) {
            return;
        }
        var fr = new FileReader();
        fr.onload = fileReaderOnLoadHandler;
        fr.readAsText(file);
        input.off('change', filePickerOnChangeHandler);
    };
    input.on('change', filePickerOnChangeHandler);
    input.trigger('click');
}

function exportUserWhitelistToFile() {
    chrome.downloads.download({
        'url': 'data:text/plain,' + encodeURIComponent($('#userUbiquitousWhitelistedHosts').val()),
        'filename': 'ubiquitous-whitelisted-hosts.txt',
        'saveAs': true
    });
}

function userWhitelistApplyHandler() {
    var httpsb = gethttpsb();
    var onMessageHandler = function(details) {
        if ( !details || !details.what ) {
            return;
        }
        if ( details.what !== 'dashboardPutUbiquitousUserWhitelist' ) {
            return;
        }
        if ( !details.error ) {
            cachedUserUbiquitousWhitelistedHosts = details.content.trim();
            userWhitelistChanged();
            httpsb.loadUbiquitousWhitelists();
        }
        chrome.runtime.onMessage.removeListener(onMessageHandler);
    };
    chrome.runtime.onMessage.addListener(onMessageHandler);
    httpsb.assets.put(
        httpsb.userWhitelistPath,
        $('#userUbiquitousWhitelistedHosts').val(),
        'dashboardPutUbiquitousUserWhitelist'
    );
}

/******************************************************************************/

function onMessageHandler(details) {
    if ( details && details.what ) {
        switch ( details.what ) {
        case 'loadUbiquitousBlacklistCompleted':
            renderBlacklists();
            selectedBlacklistsChanged();
            break;
        }
    }
}

/******************************************************************************/

$(function() {
    // Handle user interaction
    $('#blacklists').on('change', '.blacklistDetails', selectedBlacklistsChanged);
    $('#blacklistsApply').on('click', blacklistsApplyHandler);
    $('#parseAllABPFilters').on('change', abpFiltersCheckboxChanged);

    $('#importUserBlacklistFromFile').on('click', appendToUserBlacklistFromFile);
    $('#exportUserBlacklistToFile').on('click', exportUserBlacklistToFile);
    $('#userUbiquitousBlacklistedHosts').on('input propertychange', userBlacklistChanged);
    $('#userUbiquitousBlacklistApply').on('click', userBlacklistApplyHandler);

    $('#importUserWhitelistFromFile').on('click', appendToUserWhitelistFromFile);
    $('#exportUserWhitelistToFile').on('click', exportUserWhitelistToFile);
    $('#userUbiquitousWhitelistedHosts').on('input propertychange', userWhitelistChanged);
    $('#userUbiquitousWhitelistApply').on('click', userWhitelistApplyHandler);

    chrome.runtime.onMessage.addListener(onMessageHandler);

    renderBlacklists();
    renderUserBlacklist();
    renderUserWhitelist();
});

/******************************************************************************/

})();

