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

/* global chrome, $ */

/******************************************************************************/

(function() {

/******************************************************************************/

var userListHref = '#userUbiquitousBlacklistedHostsPrompt';
var cachedUserUbiquitousBlacklistedHosts = '';
var cachedUserUbiquitousWhitelistedHosts = '';
var selectedBlacklistsHash = '';

/******************************************************************************/

messaging.start('ubiquitous-rules.js');

var onMessage = function(msg) {
    switch ( msg.what ) {
        case 'loadUbiquitousBlacklistCompleted':
            renderBlacklists();
            selectedBlacklistsChanged();
            break;

        default:
            break;
    }
};

messaging.listen(onMessage);

/******************************************************************************/

function gethttpsb() {
    return chrome.extension.getBackgroundPage().HTTPSB;
}

/******************************************************************************/

function changeUserSettings(name, value) {
    messaging.tell({
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

// TODO: get rid of background page dependencies

function renderBlacklists() {
    // empty list first
    $('#blacklists .blacklistDetails').remove();

    var httpsb = gethttpsb();

    $('#ubiquitousListsOfBlockedHostsPrompt2').text(
        chrome.i18n.getMessage('ubiquitousListsOfBlockedHostsPrompt2')
            .replace('{{ubiquitousBlacklistCount}}', renderNumber(httpsb.ubiquitousBlacklist.count))
    );

    // Assemble a pretty blacklist name if possible
    var prettifyListName = function(blacklistTitle, blacklistHref) {
        if ( !blacklistTitle ) {
            return blacklistHref;
        }
        if ( blacklistHref.indexOf('assets/thirdparties/') !== 0 ) {
            return blacklistTitle;
        }
        var matches = blacklistHref.match(/^assets\/thirdparties\/([^\/]+)/);
        if ( matches === null || matches.length !== 2 ) {
            return blacklistTitle;
        }
        var hostname = matches[1];
        var domain = httpsb.URI.domainFromHostname(hostname);
        if ( domain === '' ) {
            return blacklistTitle;
        }
        var html = [
            blacklistTitle,
            ' <i>(<a href="http://',
            hostname,
            '" target="_blank">',
            domain,
            '</a>)</i>'
        ];
        return html.join('');
    };

    var blacklists = httpsb.remoteBlacklists;
    var ul = $('#blacklists');
    var keys = Object.keys(blacklists);
    var i = keys.length;
    var blacklist, blacklistHref;
    var liTemplate = $('#blacklistTemplate .blacklistDetails').first();
    var li, child, text;
    while ( i-- ) {
        blacklistHref = keys[i];
        blacklist = blacklists[blacklistHref];
        li = liTemplate.clone();
        child = $('input', li);
        child.prop('checked', !blacklist.off);
        child = $('a', li);
        // Special rendering: user list
        if ( blacklistHref === httpsb.userBlacklistPath ) {
            child.attr('href', userListHref);
            child.text($(userListHref).text());
        } else {
            child.attr('href', encodeURI(blacklistHref));
            child.html(prettifyListName(blacklist.title, blacklistHref));
        }
        child = $('span', li);
        text = child.text()
            .replace('{{used}}', !blacklist.off && !isNaN(+blacklist.entryUsedCount) ? renderNumber(blacklist.entryUsedCount) : '0')
            .replace('{{total}}', !isNaN(+blacklist.entryCount) ? renderNumber(blacklist.entryCount) : '?')
            ;
        child.text(text);
        ul.prepend(li);
    }
    $('#parseAllABPFilters').attr('checked', httpsb.userSettings.parseAllABPFilters === true);
    $('#ubiquitousParseAllABPFiltersPrompt2').text(
        chrome.i18n.getMessage("ubiquitousParseAllABPFiltersPrompt2")
            .replace('{{abpFilterCount}}', renderNumber(httpsb.abpFilters.getFilterCount()))
    );
    $('#parseAllABPHideFilters').attr('checked', httpsb.userSettings.parseAllABPHideFilters === true);
    $('#ubiquitousParseAllABPHideFiltersPrompt2').text(
        chrome.i18n.getMessage("ubiquitousParseAllABPHideFiltersPrompt2")
            .replace('{{abpHideFilterCount}}', renderNumber(httpsb.abpHideFilters.getFilterCount()))
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
    hash += $('#parseAllABPHideFilters').prop('checked').toString();

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
    var onRead = function(details) {
        if ( details.error ) {
            return;
        }
        cachedUserUbiquitousBlacklistedHosts = details.content.trim();
        $('#userUbiquitousBlacklistedHosts').val(details.content);
        renderBlacklists();
    };
    messaging.ask({ what: 'readUserUbiquitousBlockRules' }, onRead);
}

/******************************************************************************/

function renderUserWhitelist() {
    var onRead = function(details) {
        if ( details.error ) {
            return;
        }
        cachedUserUbiquitousWhitelistedHosts = details.content.trim();
        $('#userUbiquitousWhitelistedHosts').val(details.content);
    };
    messaging.ask({ what: 'readUserUbiquitousAllowRules' }, onRead);
}

/******************************************************************************/

function blacklistsApplyHandler() {
    var newHash = getSelectedBlacklistsHash();
    if ( newHash === selectedBlacklistsHash ) {
        return;
    }
    // Reload blacklists
    var userBlacklistPath = gethttpsb().userBlacklistPath;
    var switches = [];
    var lis = $('#blacklists .blacklistDetails');
    var i = lis.length;
    var path;
    while ( i-- ) {
        path = $(lis[i]).children('a').attr('href');
        if ( path === userListHref ) {
            path = userBlacklistPath;
        }
        switches.push({
            location: path,
            off: $(lis[i]).children('input').prop('checked') === false
        });
    }
    messaging.tell({
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

function abpHideFiltersCheckboxChanged() {
    changeUserSettings('parseAllABPHideFilters', $(this).is(':checked'));
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
    var onWritten = function(details) {
        if ( details.error ) {
            return;
        }
        cachedUserUbiquitousBlacklistedHosts = details.content.trim();
        userBlacklistChanged();
        blacklistsApplyHandler();
    };
    var request = {
        what: 'writeUserUbiquitousBlockRules',
        content: $('#userUbiquitousBlacklistedHosts').val()
    };
    messaging.ask(request, onWritten);
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
    var onWritten = function(details) {
        if ( details.error ) {
            return;
        }
        cachedUserUbiquitousWhitelistedHosts = details.content.trim();
        userWhitelistChanged();
        messaging.tell({ what: 'loadUbiquitousAllowRules' });
    };
    var request = {
        what: 'writeUserUbiquitousAllowRules',
        content: $('#userUbiquitousWhitelistedHosts').val()
    };
    messaging.ask(request, onWritten);
}

/******************************************************************************/

$(function() {
    // Handle user interaction
    $('#blacklists').on('change', '.blacklistDetails', selectedBlacklistsChanged);
    $('#blacklistsApply').on('click', blacklistsApplyHandler);
    $('#parseAllABPFilters').on('change', abpFiltersCheckboxChanged);
    $('#parseAllABPHideFilters').on('change', abpHideFiltersCheckboxChanged);

    $('#importUserBlacklistFromFile').on('click', appendToUserBlacklistFromFile);
    $('#exportUserBlacklistToFile').on('click', exportUserBlacklistToFile);
    $('#userUbiquitousBlacklistedHosts').on('input propertychange', userBlacklistChanged);
    $('#userUbiquitousBlacklistApply').on('click', userBlacklistApplyHandler);

    $('#importUserWhitelistFromFile').on('click', appendToUserWhitelistFromFile);
    $('#exportUserWhitelistToFile').on('click', exportUserWhitelistToFile);
    $('#userUbiquitousWhitelistedHosts').on('input propertychange', userWhitelistChanged);
    $('#userUbiquitousWhitelistApply').on('click', userWhitelistApplyHandler);

    renderBlacklists();
    renderUserBlacklist();
    renderUserWhitelist();
});

/******************************************************************************/

})();

