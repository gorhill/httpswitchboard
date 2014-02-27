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

var userListPath = 'assets/user/ubiquitous-blacklisted-hosts.txt';
var userListHref = '#userUbiquitousBlacklistedHostsPrompt';
var cachedUserUbiquitousBlacklistedHosts = '';
var selectedBlacklistsHash = '';

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

function renderBlacklists() {
    // empty list first
    $('#blacklists .blacklistDetails').remove();

    var httpsb = gethttpsb();

    $('#ubiquitousBlacklistCount').text(renderNumber(httpsb.ubiquitousBlacklist.count));

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
        if ( blacklistName === userListPath ) {
            child.attr('href', userListHref);
            child.text($(userListHref).text());
        } else {
            child.attr('href', blacklistName);
            child.text(blacklistName);
        }
        child = $('span:nth-of-type(1)', li);
        child.text(!blacklist.off && !isNaN(+blacklist.entryUsedCount) ? renderNumber(blacklist.entryUsedCount) : '0');
        child = $('span:nth-of-type(2)', li);
        child.text(!isNaN(+blacklist.entryCount) ? renderNumber(blacklist.entryCount) : '?');
        ul.prepend(li);
    }
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
    return hash;
}

/******************************************************************************/

// This is to give a visual hint that the selection of blacklists has changed.

function selectedBlacklistsChanged() {
    $('#blacklistsApply').attr('disabled', getSelectedBlacklistsHash() === selectedBlacklistsHash);
}

// This is to give a visual hint that the content of user blacklist has changed.

function userBlacklistChanged() {
    $('#userBlacklistApply')
        .attr('disabled', $('#userUbiquitousBlacklistedHosts')
        .val()
        .trim() === cachedUserUbiquitousBlacklistedHosts);
    selectedBlacklistsChanged();
}

/******************************************************************************/

function renderUserBlacklist() {
    gethttpsb().assets.get(userListPath, 'dashboardGetUbiquitousUserBlacklist');
}

/******************************************************************************/

function blacklistsApplyHandler() {
    var newHash = getSelectedBlacklistsHash();
    if ( newHash === selectedBlacklistsHash ) {
        return;
    }
    // Reload blacklists
    var switches = [];
    var lis = $('#blacklists .blacklistDetails');
    var i = lis.length;
    var path;
    while ( i-- ) {
        path = $(lis[i]).children('a').attr('href');
        if ( path === userListHref ) {
            path = userListPath;
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

function userBlacklistApplyHandler() {
    gethttpsb().assets.put(
        userListPath,
        $('#userUbiquitousBlacklistedHosts').val(),
        'dashboardPutUbiquitousUserBlacklist'
    );
}

/******************************************************************************/

function fileReaderOnLoadHandler() {
    var textarea = $('#userUbiquitousBlacklistedHosts');
    textarea.val(textarea.val() + '\n' + this.result);
    userBlacklistChanged();
}

function filePickerOnChangeHandler() {
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
}

function appentToUserBlacklistFromFile() {
    var input = $('<input />').attr({
        type: 'file',
        accept: 'text/plain'
        
    });
    input.on('change', filePickerOnChangeHandler);
    input.trigger('click');
}

/******************************************************************************/

function exportUserBlacklistToFile() {
    chrome.downloads.download({
        'url': 'data:text/plain,' + encodeURIComponent($('#userUbiquitousBlacklistedHosts').val()),
        'filename': 'ubiquitous-blacklisted-hosts.txt',
        'saveAs': true
    });
}

/******************************************************************************/

function onMessageHandler(request, sender) {
    if ( request && request.what ) {
        switch ( request.what ) {
        case 'loadUbiquitousBlacklistCompleted':
            renderBlacklists();
            selectedBlacklistsChanged();
            break;
        case 'dashboardGetUbiquitousUserBlacklist':
            if ( !request.error ) {
                cachedUserUbiquitousBlacklistedHosts = request.content.trim();
                $('#userUbiquitousBlacklistedHosts').val(request.content);
                renderBlacklists();
            }
            break;
        case 'dashboardPutUbiquitousUserBlacklist':
            if ( !request.error ) {
                cachedUserUbiquitousBlacklistedHosts = request.content.trim();
                userBlacklistChanged();
                blacklistsApplyHandler();
            }
            break;
        }
    }
}

/******************************************************************************/

$(function() {
    // Handle user interaction
    $('#blacklistsApply').on('click', blacklistsApplyHandler);
    $('#blacklists').on('change', '.blacklistDetails', selectedBlacklistsChanged);
    $('#userBlacklistApply').on('click', userBlacklistApplyHandler);
    $('#userUbiquitousBlacklistedHosts').on('input propertychange', userBlacklistChanged);
    $('#importUserBlacklistFromFile').on('click', appentToUserBlacklistFromFile);
    $('#exportUserBlacklistToFile').on('click', exportUserBlacklistToFile);

    chrome.runtime.onMessage.addListener(onMessageHandler);

    renderBlacklists();
    renderUserBlacklist();
});

/******************************************************************************/

})();

