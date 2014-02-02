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

HTTPSB.PresetRecipe = function() {
    this.id = undefined;
    this.name = '';
    this.facode = 0;
    this.keys = {};
    this.whitelist = {};
    this.scopes = {};
};

/******************************************************************************/

HTTPSB.PresetRecipe.prototype.applyToScope = function(scopeKey) {
    var httpsb = HTTPSB;
    var rules, ruleKey, pos;

    // Unscoped rules
    rules = this.whitelist;
    for ( ruleKey in rules ) {
        if ( !rules.hasOwnProperty(ruleKey) ) {
            continue;
        }
        pos = ruleKey.indexOf('|');
        httpsb.whitelistTemporarily(scopeKey, ruleKey.slice(0, pos), ruleKey.slice(pos + 1));
    }

    // Scoped rules
    var scopes = this.scopes;
    for ( scopeKey in scopes ) {
        if ( !scopes.hasOwnProperty(scopeKey) ) {
            continue;
        }
        httpsb.createTemporaryScopeFromScopeKey(scopeKey);
        rules = scopes[scopeKey].whitelist;
        for ( ruleKey in rules ) {
            if ( !rules.hasOwnProperty(ruleKey) ) {
                continue;
            }
            pos = ruleKey.indexOf('|');
            httpsb.whitelistTemporarily(scopeKey, ruleKey.slice(0, pos), ruleKey.slice(pos + 1));
        }
    }
};

/******************************************************************************/

HTTPSB.PresetManager = function() {
    this.presets = {};
    this.firstPartyDict = {};
    this.thirdPartyDict = {};
    this.idGenerator = 1;
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.rememberFirstParty = function(preset) {
    preset.id = this.idGenerator++;
    this.presets[preset.id] = preset;
    var ut = uriTools;
    var pageHostnames = Object.keys(preset.keys);
    var i = pageHostnames.length;
    var pageHostname, hostnames, j, hostname;
    while ( i-- ) {
        pageHostname = pageHostnames[i];
        hostnames = ut.allHostnamesFromHostname(pageHostname);
        j = hostnames.length;
        while ( j-- ) {
            hostname = hostnames[j];
            if ( !this.firstPartyDict[hostname] ) {
                this.firstPartyDict[hostname] = [preset];
            } else {
                this.firstPartyDict[hostname].push(preset);
            }
        }
    }
};

HTTPSB.PresetManager.prototype.rememberThirdParty = function(preset) {
    preset.id = this.idGenerator++;
    this.presets[preset.id] = preset;
    var hostnames = Object.keys(preset.keys);
    var i = hostnames.length;
    var hostname;
    while ( i-- ) {
        hostname = hostnames[i];
        if ( !this.thirdPartyDict[hostname] ) {
            this.thirdPartyDict[hostname] = [preset];
        } else {
            this.thirdPartyDict[hostname].push(preset);
        }
    }
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.presetFromId = function(presetId) {
    return this.presets[presetId];
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.firstPartyFromHostname = function(hostname) {
    var presets = this.firstPartyDict[hostname];
    if ( presets ) {
        return presets[0];
    }
    return null;
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.findMatches = function(firstParty, thirdParties) {
    var presets, preset;
    var matches = [];
    var matchDict = {};
    // TODO: 1st-party hostnames are already available somewhere on the
    // caller's side, reuse this information, for performance purpose.
    var firstPartyList = uriTools.allHostnamesFromHostname(firstParty);
    var firstPartyDict = {};
    var i = 0, j;
    while ( firstParty = firstPartyList[i++] ) {
        firstPartyDict[firstParty] = true;
        presets = this.firstPartyDict[firstParty];
        if ( !presets ) {
            continue;
        }
        j = 0;
        while ( preset = presets[j++] ) {
            if ( matchDict[preset.id] ) {
                continue;
            }
            matches.push(preset);
            matchDict[preset.id] = true;
        }
    }
    // TODO: Ideally, only the hostnames for which there was effectively a
    // request should be in the input collection, for performance purpose.
    for ( var thirdParty in thirdParties ) {
        if ( !thirdParties.hasOwnProperty(thirdParty) ) {
            continue;
        }
        // Skip 3rd-parties same as 1st-party
        if ( firstPartyDict[thirdParty] ) {
            continue;
        }
        presets = this.thirdPartyDict[thirdParty];
        if ( !presets ) {
            continue;
        }
        j = 0;
        while ( preset = presets[j++] ) {
            if ( matchDict[preset.id] ) {
                continue;
            }
            matches.push(preset);
            matchDict[preset.id] = true;
        }
    }
    return matches;
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.typeMapper = {
    '*': '*',
    'cookie': 'cookie',
    'img': 'image',
    'image': 'image',
    'css': 'stylesheet',
    'stylesheet': 'stylesheet',
    'plugin': 'object',
    'object': 'object',
    'script': 'script',
    'xhr': 'xmlhttprequest',
    'xmlhttprequest': 'xmlhttprequest',
    'frame': 'sub_frame',
    'sub_frame': 'sub_frame',
    'other': 'other'
};

HTTPSB.PresetManager.prototype.parseRule = function(entry) {
    var pos = entry.indexOf(' ');
    if ( pos < 0 )  {
        return null;
    }
    var type = this.typeMapper[entry.slice(0, pos).trim()];
    if ( !type ) {
        return null;
    }
    var hostname = entry.slice(pos).trim();
    if ( hostname === '' ) {
        return null;
    }
    return type + '|' + hostname;
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.parseEntry = function(entry) {
    var p = new HTTPSB.PresetRecipe(this.idGenerator);
    var lines = entry.split('\n');
    var line, pos;
    var fkey, fvalue;
    var contextStack = [], context, level;
    var scopeKey = '';
    var ruleKey;
    var i = 0;
    while ( line = lines[i++] ) {
        // Remove comment
        pos = line.indexOf('#');
        if ( pos >= 0 ) {
            line = line.slice(0, pos);
        }

        // Split into name & value fields, ignore indent
        pos = line.indexOf(':');
        if ( pos < 0 ) {
            fkey = '';
            fvalue = line.trim();
        } else {
            fkey = line.slice(0, pos).trim();
            fvalue = line.slice(pos + 1).trim();
            if ( fvalue === '|' ) {
                fvalue = '';
            }
        }
        fvalue = fvalue.replace(/^(["']?)(.*)\1$/, '$2');

        // Skip empty lines
        if ( fkey === '' && fvalue === '' ) {
            continue;
        }

        // Ensure stack matches indentation
        level = 0;
        while ( line.indexOf('    ') === 0 ) {
            line = line.slice(4);
            level++;
        }
        contextStack = contextStack.slice(0, level);
        context = contextStack.join('/');

        switch ( context ) {
        case 'preset/scope':
            if ( fkey === 'whitelist' ) {
                contextStack.push(fkey);
            }
            break;
        case 'preset':
            if ( fkey === 'facode' || fkey === 'keys' || fkey === 'scope' || fkey === 'whitelist' ) {
                contextStack.push(fkey);
            }
            break;
        case '':
            if ( fkey !== '' ) {
                contextStack.push('preset');
                fvalue = fkey;
            }
            break;
        }
        context = contextStack.join('/');

        switch ( context ) {
        case '':
            break;
        case 'preset':
            p.name = fvalue;
            break;
        case 'preset/facode':
            p.facode = fvalue;
            break;
        case 'preset/keys':
            if ( fvalue !== '' ) {
                p.keys[fvalue] = true;
            }
            break;
        case 'preset/scope':
            scopeKey = fvalue;
            break;
        case 'preset/whitelist':
            ruleKey = this.parseRule(fvalue);
            if ( ruleKey ) {
                p.whitelist[ruleKey] = true;
            }
            break;
        case 'preset/scope/whitelist':
            ruleKey = this.parseRule(fvalue);
            if ( ruleKey ) {
                if ( p.scopes[scopeKey] === undefined ) {
                    p.scopes[scopeKey] = { whitelist: {} };
                }
                p.scopes[scopeKey].whitelist[ruleKey] = true;
            }
            break;
        default:
            throw new Error('HTTP Switchboard> HTTPSB.PresetManager.parseEntry(): Bad preset entry.');
        }
    }

    if ( p.name === '' || Object.keys(p.keys).length === 0 ) {
        return null;
    }

    return p;
};

/******************************************************************************/

HTTPSB.loadPresets = function() {
    var content;
    var entryBeg, entryEnd;
    var preset;

    var presetManager = new this.PresetManager();
    this.presetManager = presetManager;

    content = readLocalTextFile('assets/httpsb/preset-recipes-1st.yaml')
        // Remove comments
        .replace(/(^|\s)#[^\n]*/g, '$1')
        // Remove empty lines
        .replace(/(^|\n)\s*\n/g, '$1');
    entryBeg = entryEnd = 0;
    while ( content.charAt(entryEnd) !== '' ) {
        entryEnd = content.indexOf('\n', entryEnd);
        if ( entryEnd >= 0 ) {
            entryEnd += 1;
        } else {
            entryEnd = content.length;
        }
        if ( content.charAt(entryEnd) !== ' ' ) {
            preset = presetManager.parseEntry(content.slice(entryBeg, entryEnd, true));
            if ( preset ) {
                presetManager.rememberFirstParty(preset);
            }
            entryBeg = entryEnd;
        }
    }

    content = readLocalTextFile('assets/httpsb/preset-recipes-3rd.yaml')
        // Remove comments
        .replace(/(^|\s)#[^\n]*/g, '$1')
        // Remove empty lines
        .replace(/(^|\n)\s*\n/g, '$1');
    entryBeg = entryEnd = 0;
    while ( content.charAt(entryEnd) !== '' ) {
        entryEnd = content.indexOf('\n', entryEnd);
        if ( entryEnd >= 0 ) {
            entryEnd += 1;
        } else {
            entryEnd = content.length;
        }
        if ( content.charAt(entryEnd) !== ' ' ) {
            preset = presetManager.parseEntry(content.slice(entryBeg, entryEnd, true));
            if ( preset ) {
                presetManager.rememberThirdParty(preset);
            }
            entryBeg = entryEnd;
        }
    }
};

/******************************************************************************/

