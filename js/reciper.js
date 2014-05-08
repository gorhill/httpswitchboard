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

HTTPSB.reciper = (function() {

/******************************************************************************/

// http://stackoverflow.com/a/106223
// Thanks!
var reValidHostname = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;

var fromFriendlyType = {
    '*': '*',
    'main_frame': 'main_frame',
    'page': 'main_frame',
    'cookie': 'cookie',
    'stylesheet': 'stylesheet',
    'css': 'stylesheet',
    'image': 'image',
    'img': 'image',
    'script': 'script',
    'object': 'object',
    'plugin': 'object',
    'xmlhttprequest': 'xmlhttprequest',
    'xhr': 'xmlhttprequest',
    'sub_frame': 'sub_frame',
    'frame': 'sub_frame',
    'other': 'other'
};

var toFriendlyType = {
    '*': '*',
    'main_frame': 'page',
    'page': 'page',
    'cookie': 'cookie',
    'stylesheet': 'css',
    'css': 'css',
    'image': 'image',
    'img': 'image',
    'script': 'script',
    'object': 'plugin',
    'plugin': 'plugin',
    'xmlhttprequest': 'xhr',
    'xhr': 'xhr',
    'sub_frame': 'frame',
    'frame': 'frame',
    'other': 'other'
};

var fromFriendlyList = {
    'white': 'white',
    'whitelist': 'white',
    'black': 'black',
    'blacklist': 'black',
    'gray': 'gray',
    'graylist': 'gray'
};

var toFriendlyList = {
    'white': 'whitelist',
    'whitelist': 'whitelist',
    'black': 'blacklist',
    'blacklist': 'blacklist',
    'gray': 'graylist',
    'graylist': 'graylist'
};

/******************************************************************************/

// A journal is just an array of directives to create rules in one or
// more scopes

// Example:
// scopeKey
// \tlistKey
// \t\ttype hostname

var journalFromRecipe = function(s) {
    var recipe;
    try {
        recipe = decodeURIComponent(s.replace(/\s+/g, ''));
        // rhill 2014-27-01: Remove scheme from scope keys.
        // https://github.com/gorhill/httpswitchboard/issues/165
        recipe = recipe.replace(/(^|\n)https?:\/\//g, '$1');
    }
    catch (e) {
        return [];
    }

    var httpsb = HTTPSB;
    var journal = [];
    var lines = recipe.split('\n');
    var scopeKey, listKey;
    var type, hostname;
    var line, pos;
    while ( lines.length ) {
        line = lines.shift();
        if ( line.length === 0 ) {
            continue;
        }
        type = hostname = undefined;
        if ( line.charAt(0) !== '\t' ) {
            scopeKey = line.trim();
            listKey = undefined;
        } else if ( line.charAt(1) !== '\t' ) {
            listKey = fromFriendlyList[line.trim()];
        } else if ( line.charAt(2) !== '\t' ) {
            pos = line.indexOf(' ');
            if ( pos > 0 ) {
                type = fromFriendlyType[line.slice(0, pos).trim()];
                hostname = line.slice(pos).trim();
            }
        }
        if ( scopeKey === undefined || listKey === undefined || type === undefined || hostname === undefined ) {
            continue;
        }
        if ( httpsb.isValidScopeKey(scopeKey) === false ) {
            continue;
        }
        if ( hostname !== '*' && reValidHostname.test(hostname) === false ) {
            continue;
        }

        journal.push(['addRule', scopeKey, listKey, type, hostname].join('|'));
    }

    return journal;
};

/******************************************************************************/

var recipeFromJournal = function(journal) {
    var recipe = [];
    var entry, parts;
    var scopeKey, listKey;
    while ( entry = journal.shift() ) {
        if ( !entry ) {
            continue;
        }
        parts = entry.split('|');
        switch ( parts[0] ) {
        case 'addRule':
            if ( parts[1] !== scopeKey ) {
                scopeKey = parts[1];
                recipe.push(scopeKey);
                listKey = undefined;
            }
            if ( parts[2] !== listKey ) {
                listKey = toFriendlyList[parts[2]];
                recipe.push('\t' + listKey);
            }
            recipe.push('\t\t' + toFriendlyType[parts[3]] + ' ' + parts[4]);
            break;
        default:
            break;
        }
    }
    recipe = encodeURIComponent(recipe.join('\n'));

    var s = [];
    while ( recipe.length ) {
        s.push(recipe.slice(0, 40));
        recipe = recipe.slice(40);
    }
    return s.join('\n');
};

/******************************************************************************/

var journalFromScope = function(scopeKey) {
    var journal = [];
    var scope = HTTPSB.temporaryScopeFromScopeKey(scopeKey);
    var listKeys = ['white', 'black', 'gray'];
    var listKey, list, ruleKey;

    while ( listKey = listKeys.shift() ) {
        list = scope[listKey].list;
        listKey += 'list';
        for ( ruleKey in list ) {
            if ( list.hasOwnProperty(ruleKey) === false ) {
                continue;
            }
            journal.push(['addRule', scopeKey, listKey, ruleKey].join('|'));
        }
    }

    return journal;
};

/******************************************************************************/

var recipeFromScope = function(scopeKey) {
    return recipeFromJournal(journalFromScope(scopeKey));
};

/******************************************************************************/

var applyRules = function(scopeKey, rules) {
    var httpsb = HTTPSB;
    var rule;
    while ( rule = rules.pop() ) {
        httpsb.addTemporaryRule(scopeKey, rule.list, rule.type, rule.host);
    }
};

/******************************************************************************/

var applyEverywhereRules = function(scopeKey, rules) {
    var httpsb = HTTPSB;
    var rule;
    while ( rule = rules.pop() ) {
        if ( rule.host !== '*' ) {
            continue;
        }
        httpsb.addTemporaryRule(scopeKey, rule.list, rule.type, rule.host);
    }
};

/******************************************************************************/

// Logic to determine what rules get copied where, depending on source and
// destination scopes.
//
// global into global: copy rules
// global into domain: copy rules
//   global into site: copy rules
//
// domain into global: create scope
//                     copy rules
// domain into domain: copy rules if same domain
//   domain into site: create domain scope
//                     copy rules
//                     copy site scope rule if same domain
//                     remove site scope if same domain
//
//   site into global: create scope
//                     copy rules
//   site into domain: copy rules if same domain
//     site into site: copy rules if same domain

var applyJournalEntries = function(srcScopeKey, rules, dstScopeKey) {
    var httpsb = HTTPSB;

    // global to global:
    //      copy rules
    // global to domain:
    //      copy rules
    // global to site:
    //      copy rules
    if ( httpsb.isGlobalScopeKey(srcScopeKey) ) {
        applyRules(dstScopeKey, rules);
        return;
    }

    var srcDomain = httpsb.domainFromScopeKey(srcScopeKey);
    var dstDomain = httpsb.domainFromScopeKey(dstScopeKey);
    var sameDomain = !!srcDomain && !!dstDomain && srcDomain === dstDomain;
    var srcScope, dstScope;

    // domain to global:
    //      create scope
    //      copy rules
    // domain to domain:
    //      copy rules if same domain
    // domain to site
    //      create domain scope
    //      copy rules
    //      copy site scope rule if same domain
    //      remove site scope if same domain
    if ( httpsb.isDomainScopeKey(srcScopeKey) ) {
        // domain to global:
        //      create scope
        //      copy rules
        if ( httpsb.isGlobalScopeKey(dstScopeKey) ) {
            httpsb.createTemporaryScopeFromScopeKey(srcScopeKey);
            applyRules(srcScopeKey, rules);
            return;
        }
        // domain to domain:
        //      copy rules if same domain
        if ( httpsb.isDomainScopeKey(dstScopeKey) ) {
            if ( sameDomain ) {
                applyRules(dstScopeKey, rules);
            } else {
                applyEverywhereRules(dstScopeKey, rules);
            }
            return;
        }
        // domain to site
        //      create domain scope
        //      copy rules
        //      copy site scope rule if same domain
        //      remove site scope if same domain
        if ( httpsb.isSiteScopeKey(dstScopeKey) ) {
            if ( sameDomain ) {
                srcScope = httpsb.createTemporaryScopeFromScopeKey(srcScopeKey);
                applyRules(srcScopeKey, rules);
                dstScope = httpsb.temporaryScopeFromScopeKey(dstScopeKey);
                if ( dstScope ) {
                    srcScope.add(dstScope);
                    httpsb.removeTemporaryScopeFromScopeKey(dstScopeKey);
                }
            } else {
                applyEverywhereRules(dstScopeKey, rules);
            }
            return;
        }
        return;
    }

    // site to global:
    //      create scope
    //      copy rules
    // site to domain:
    //      copy rules if same domain
    // site to site:
    //      copy rules if same domain
    if ( httpsb.isSiteScopeKey(srcScopeKey) ) {
        // site to global:
        //      create scope
        //      copy rules
        if ( httpsb.isGlobalScopeKey(dstScopeKey) ) {
            httpsb.createTemporaryScopeFromScopeKey(srcScopeKey);
            applyRules(srcScopeKey, rules);
            return;
        }
        // site to domain:
        //      copy rules if same domain
        if ( httpsb.isDomainScopeKey(dstScopeKey) ) {
            if ( sameDomain ) {
                applyRules(dstScopeKey, rules);
            } else {
                applyEverywhereRules(dstScopeKey, rules);
            }
            return;
        }
        // site to site:
        //      copy rules if same domain
        if ( httpsb.isSiteScopeKey(dstScopeKey) ) {
            if ( sameDomain ) {
                applyRules(dstScopeKey, rules);
            } else {
                applyEverywhereRules(dstScopeKey, rules);
            }
            return;
        }
        return;
    }
};

/******************************************************************************/

var applyJournal = function(journal, dstScopeKey) {
    var entry, parts;
    var srcScopeKey;
    var scopeKeyToRulesMap = {};
    while ( entry = journal.shift() ) {
        if ( !entry ) {
            continue;
        }
        parts = entry.split('|');
        if ( parts.length === 0 ) {
            continue;
        }
        if ( parts[0] !== 'addRule' ) {
            continue;
        }
        srcScopeKey = parts[1];
        if ( scopeKeyToRulesMap.hasOwnProperty(srcScopeKey) === false ) {
            scopeKeyToRulesMap[srcScopeKey] = [];
        }
        scopeKeyToRulesMap[srcScopeKey].push({
            list: parts[2],
            type: parts[3],
            host: parts[4]
        });
    }

    for ( srcScopeKey in scopeKeyToRulesMap ) {
        if ( scopeKeyToRulesMap.hasOwnProperty(srcScopeKey) === false ) {
            continue;
        }
        applyJournalEntries(
            srcScopeKey,
            scopeKeyToRulesMap[srcScopeKey],
            dstScopeKey
        );
    }
};

/******************************************************************************/

var applyRecipe = function(recipe, dstScopeKey) {
    applyJournal(journalFromRecipe(recipe), dstScopeKey);
};

/******************************************************************************/

var validateRecipe = function(recipe) {
    return journalFromRecipe(recipe).length > 0;
};

/******************************************************************************/

return {
    extract: recipeFromScope,
    apply: applyRecipe,
    validate: validateRecipe
};

/******************************************************************************/

})();
