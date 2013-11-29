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


// TODO: cleanup

/******************************************************************************/

(function() {

var recipeWidth = 40;

/******************************************************************************/

var friendlyTypeNames = {
    '*': '*',
    'cookie': 'cookies/local storages',
    'image': 'images',
    'object': 'plugins',
    'script': 'scripts',
    'xmlhttprequest': 'XMLHttpRequests',
    'sub_frame': 'frames',
    'other': 'other'
};

var hostileTypeNames = {
    '*': '*',
    'cookies/local storages': 'cookie',
    'images': 'image',
    'plugins': 'object',
    'scripts': 'script',
    'XMLHttpRequests': 'xmlhttprequest',
    'frames': 'sub_frame',
    'other': 'other'
};

/******************************************************************************/

function getBackground() {
    return chrome.extension.getBackgroundPage();
}

function getHTTPSB() {
    return getBackground().HTTPSB;
}

/******************************************************************************/

// A recipe rule is always:
// "        {type} {hostname}\n"

function renderRuleToRecipeString(rule) {
    // Do not report '* main_frame' it is an internal
    // read-only rule
    if ( rule === 'main_frame|*' ) {
        return '';
    }
    return '        ' + rule.replace('|',' ') + '\n';
}

function renderRecipeStringToRule(recipe) {
    var parts = recipe.match(/^        ([a-z*_]+) +([-.:a-z0-9*]+)$/);
    if ( !parts ) {
        return false;
    }
    // Validate hostname
    var hostname = parts[2];
    if ( hostname !== '*' && !getBackground().uriTools.isValidHostname(hostname) ) {
        return false;
    }
    // Validate type
    var type = parts[1];
    if ( !friendlyTypeNames[parts[1]] ) {
        return false;
    }
    return type + '|' + hostname;
}

/******************************************************************************/

// A recipe list name is always:
// "    {list name}\n"

function renderPermissionToRecipeString(permissionName, permission) {
    var s = '';
    var rules = Object.keys(permission.list);
    var i = rules.length;
    if ( i ) {
        s = '    ' + permissionName + '\n';
        while ( i-- ) {
            s += renderRuleToRecipeString(rules[i]);
        }
    }
    return s;
}

function renderRecipeStringToListKey(recipe) {
    var parts = recipe.match(/^    (whitelist|blacklist|graylist)$/);
    if ( !parts ) {
        return false;
    }
    return parts[1];
}

/******************************************************************************/

// A recipe scope key is always:
// "{root url}" or "*"

function renderScopeToRecipeString(scopeKey, scope) {
    var s = scopeKey + '\n';
    s += renderPermissionToRecipeString('whitelist', scope.white);
    s += renderPermissionToRecipeString('blacklist', scope.black);
    s += renderPermissionToRecipeString('graylist', scope.gray);
    return s;
}

function renderRecipeStringToScopeKey(recipe) {
    var parts = recipe.match(/^(\*|https?:\/\/[-.:a-z0-9]+)$/);
    if ( !parts ) {
        return false;
    }
    var scopeKey = parts[1];
    if ( scopeKey !== '*' && !getBackground().uriTools.isValidRootURL(scopeKey) ) {
        return false;
    }
    return scopeKey;
}

/******************************************************************************/

function renderAllScopesToRecipeString(scopes) {
    var s = '';
    var scopeKeys = Object.keys(scopes);
    var i = scopeKeys.length;
    var scopeKey;
    while ( i-- ) {
        scopeKey = scopeKeys[i];
        s += renderScopeToRecipeString(scopeKey, scopes[scopeKey]);
    }
    return s;
}

/******************************************************************************/

function renderRuleToHTML(rule) {
    // part[0] = type
    // part[1] = hostname
    var parts = rule.split('|');
    return document.createTextNode(friendlyTypeNames[parts[0]] + ' ' + (parts[1] === '*' ? '*' : parts[1]));
}

/******************************************************************************/

function renderScopeKeyToHTML(scopeKey) {
    if ( scopeKey === '*' ) {
        return $('<span>*</span>');
    }
    return $('<a>', {
        href: scopeKey,
        text: scopeKey
    });
}

/******************************************************************************/

function uglifyRecipe(recipe) {
    recipe = encodeURIComponent(recipe.replace(/    /g, '\t'));
    var s = '';
    while ( recipe.length ) {
        s += recipe.slice(0, recipeWidth) + '\n';
        recipe = recipe.slice(recipeWidth);
    }
    return s;
}

function updateUglyRecipeWidget() {
    try {
        decodeURIComponent($('#recipeUgly').val().replace(/\n/g, '').trim());
        $('#recipeUgly').removeClass('bad');
    }
    catch (e) {
        $('#recipeUgly').addClass('bad');
    }
}

function beautifyRecipe(recipe) {
    try {
        recipe = decodeURIComponent(recipe.replace(/\n/g, '').trim()).replace(/\t/g, '    ');
        $('#recipeUgly').removeClass('bad');
    }
    catch (e) {
        $('#recipeUgly').addClass('bad');
        return '';
    }
    return recipe;
}

/******************************************************************************/

function getPermanentColor(scopeKey, rule) {
    // part[0] = type
    // part[1] = hostname
    var parts = rule.split('|');
    return getHTTPSB().getPermanentColor(scopeKey, parts[0], parts[1]);
}

/******************************************************************************/

// I originally chose to have type first than hostname second... which means
// that using stock sort() doesn't give nice results.

function compareRules(a, b) {
    var aparts = a.split('|');
    var bparts = b.split('|');
    if ( aparts[0] < bparts[0] ) {
        return 1;
    }
    if ( aparts[0] > bparts[0] ) {
        return -1;
    }
    if ( aparts[1] < bparts[1] ) {
        return 1;
    }
    if ( aparts[1] > bparts[1] ) {
        return -1;
    }
    return 0;
}

/******************************************************************************/

function renderScopeToHTML(scopeKey) {
    var lists = ['gray', 'black', 'white'];
    var httpsb = getHTTPSB();
    var scope = httpsb.temporaryScopes.scopes[scopeKey];
    var liScope = $('<li>', {
        'class': 'scope'
    });
    liScope.append(renderScopeKeyToHTML(scopeKey));
    var ulScope = $('<ul>');
    liScope.append(ulScope);
    var iList = lists.length;
    var rules, iRule, rule;
    var liList, ulList, liRule;
    while ( iList-- ) {
        rules = Object.keys(scope[lists[iList]].list).sort(compareRules);
        iRule = rules.length;
        if ( iRule === 0 ) {
            continue;
        }
        liList = $('<li>', {
            'class': lists[iList],
            'text': lists[iList] + 'list',
        });
        ulList = $('<ul>', {});
        while ( iRule-- ) {
            rule = rules[iRule];
            // Skip '* main_frame', there is no matrix cell for this, which
            // means user wouldn't be able to add it back if he/she were to
            // remove this rule.
            if ( rule === 'main_frame|*' ) {
                continue;
            }
            liRule = $('<li>', {
                'class': 'rule ' + getPermanentColor(scopeKey, rule),
                'html': renderRuleToHTML(rule),
            });
            liRule.appendTo(ulList);
            $('<span>').appendTo(liRule);
        }
        ulList.appendTo(liList);
        liList.appendTo(ulScope);
    }
    var recipe = uglifyRecipe(renderScopeToRecipeString(scopeKey, httpsb.temporaryScopes.scopes[scopeKey]));
    $('<div>', {
        'class': 'recipe',
        'title': 'Recipe',
        'text': recipe
    }).appendTo(liScope);
    return liScope;
}

/******************************************************************************/

function renderPerpageScopes() {
    var httpsb = getHTTPSB();
    var ulRoot = $('<ul>');
    // Iterate scopes
    var scopeKeys = Object.keys(httpsb.temporaryScopes.scopes);
    var iScope = scopeKeys.length;
    var scopeKey, scope;
    var liScope;
    while ( iScope-- ) {
        scopeKey = scopeKeys[iScope];
        if ( scopeKey === '*' ) {
            continue;
        }
        scope = httpsb.temporaryScopes.scopes[scopeKey];
        if ( scope.off ) {
            continue;
        }
        liScope = renderScopeToHTML(scopeKey);
        liScope.appendTo(ulRoot);
    }
    $('#perpage').empty().append(ulRoot);
}

/******************************************************************************/

function renderGlobalScope() {
    var ulRoot = $('<ul>');
    var liScope = renderScopeToHTML('*');
    liScope.appendTo(ulRoot);
    $('#global').empty().append(ulRoot);
}

/******************************************************************************/

function renderRecipe() {
    $('#recipeUgly').val(uglifyRecipe(renderAllScopesToRecipeString(getHTTPSB().permanentScopes.scopes)));
}

/******************************************************************************/

function renderAll() {
    renderGlobalScope();
    renderPerpageScopes();
}

/******************************************************************************/

function selectRecipeText(elem) {
    var selection = window.getSelection();        
    var range = document.createRange();
    range.selectNodeContents(elem);
    selection.removeAllRanges();
    selection.addRange(range);
}

/******************************************************************************/

function deleteRule(li) {
}

/******************************************************************************/

function undeleteRule(li) {
}

/******************************************************************************/

function renderJournalFromImportField() {
    var rules = $('#recipeBeautiful').val();
    var journal = [];
    var lines = rules.split('\n');
    var scopeKey = false;
    var listKey = false;
    var line, r;
    while ( lines.length ) {
        line = lines.splice(0,1)[0];
        if ( line.trim() === '' ) {
            continue;
        }
        if ( r = renderRecipeStringToScopeKey(line) ) {
            scopeKey = r;
        } else if ( r = renderRecipeStringToListKey(line) ) {
            if ( !scopeKey ) {
                return false;
            }
            listKey = r;
        } else if ( r = renderRecipeStringToRule(line) ) {
            if ( !scopeKey || !listKey ) {
                return false;
            }
            journal.push({
                scopeKey: scopeKey,
                listKey: listKey,
                rule: r
            });
        } else {
            return false;
        }
    }

    return journal;
}

/******************************************************************************/

function renderImportFieldFromRecipe() {
    $('#recipeBeautiful').val(beautifyRecipe($('#recipeUgly').val()));
    $('#recipeBeautiful').toggleClass('bad', !renderJournalFromImportField());
}

/******************************************************************************/

function applyJournalTemporarily() {
    var journal = renderJournalFromImportField();
    if ( !journal ) {
        return;
    }
    var httpsb = getHTTPSB();
    var i = journal.length;
    var entry, scopeKey, pivot, type, hostname;
    while ( i-- ) {
        entry = journal[i];
        scopeKey = entry.scopeKey;
        pivot = entry.rule.indexOf('|');
        if ( pivot < 0 ) {
            continue;
        }
        type = entry.rule.slice(0, pivot);
        hostname = entry.rule.slice(pivot+1);
        httpsb.createPageScopeIfNotExists(scopeKey);
        if ( entry.listKey === 'whitelist' ) {
            httpsb.whitelistTemporarily(scopeKey, type, hostname);
        } else if ( entry.listKey === 'blacklist' ) {
            httpsb.blacklistTemporarily(scopeKey, type, hostname);
        } else if ( entry.listKey === 'graylist' ) {
            httpsb.graylistTemporarily(scopeKey, type, hostname);
        }
    }

    // Force a refresh of all scopes/rules
    renderAll();
}

/******************************************************************************/

function togglePersist(liRule) {
    var httpsb = getHTTPSB();
    liRule = $(liRule);
    var rule = liRule.text();
    // parts[0] = friendly type name
    // parts[1] = hostname
    var parts = rule.split(/\s+/);
    if ( parts.length !== 2 ) {
        return;
    }
    var hostname = parts[1];
    var type = hostileTypeNames[parts[0]];
    var liScope = liRule.parents('li.scope');
    var scopeKey = liScope.children('a').attr('href') || '*';
    if ( liRule.hasClass('rdp') || liRule.hasClass('gdp') ) {
        httpsb.graylistPermanently(scopeKey, type, hostname);
        liRule.removeClass('rdp gdp');
    } else if ( liRule.parents('li.white').length ) {
        httpsb.whitelistPermanently(scopeKey, type, hostname);
        liRule.addClass('gdp');
    } else if ( liRule.parents('li.black').length ) {
        httpsb.blacklistPermanently(scopeKey, type, hostname);
        liRule.addClass('rdp');
    }
    renderAll();
}

/******************************************************************************/

$(function() {
    $('#recipeDecode').on('click', function(){
        if ( !$('#recipeUgly').hasClass('bad') ) {
            renderImportFieldFromRecipe();
        }
    });

    $('#recipeEncode').on('click', function(){
        if ( !$('#recipeBeautiful').hasClass('bad') ) {
            $('#recipeUgly').val(uglifyRecipe($('#recipeBeautiful').val()));
            updateUglyRecipeWidget();
        }
    });

    $('#recipeUgly').on('input propertychange', function(){
        updateUglyRecipeWidget();
    });

    $('#recipeBeautiful').on('input propertychange', function(){
        $('#recipeBeautiful').toggleClass('bad', !renderJournalFromImportField());
    });

    $('#recipeImport').on('click', function(){
        applyJournalTemporarily();
    });

    $('#recipeExport').on('click', function(){
        $('#recipeBeautiful').val(renderAllScopesToRecipeString(getHTTPSB().permanentScopes.scopes));
        $('#recipeBeautiful').removeClass('bad');
    });

    // Auto-select all encoded recipe
    $('body').on('click', '#recipeUgly', function(){
        this.focus();
        this.select();
    });

    // Auto-select all contents of recipe
    $('body').on('click', 'div.recipe', function(){
        selectRecipeText(this);
    });

    // Toggle permanent status
    $('.scopes').on('click', '.rule', function(){
        togglePersist($(this));
    });

    renderAll();
});

/******************************************************************************/

})();
