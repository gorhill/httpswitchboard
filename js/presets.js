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
    this.firstParty = undefined;
    this.id = undefined;
    this.name = '';
    this.facode = 0;
    this.keys = {};
    this.requires = null;
    this.scopeStr = '';
    this.barrier = 0;
};

/******************************************************************************/

HTTPSB.PresetManager = function() {
    this.presets = {};
    this.hostnameTo1stPartyPresetMap = {};
    this.hostnameTo3rdPartyPresetMap = {};
    this.firstPartyNameToPresetMap = {};
    this.idGenerator = 1;
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.rememberFirstParty = function(preset) {
    preset.firstParty = true;
    preset.id = this.idGenerator++;
    this.presets[preset.id] = preset;
    this.firstPartyNameToPresetMap[preset.name] = preset;
    var hostnameTo1stPartyPresetMap = this.hostnameTo1stPartyPresetMap;
    var ut = uriTools;
    var hostnames = Object.keys(preset.keys);
    var i = hostnames.length;
    var hostname;
    while ( i-- ) {
        hostname = hostnames[i];
        if ( !hostnameTo1stPartyPresetMap[hostname] ) {
            hostnameTo1stPartyPresetMap[hostname] = preset;
        } else {
            if ( hostnameTo1stPartyPresetMap[hostname] instanceof HTTPSB.PresetRecipe ) {
                hostnameTo1stPartyPresetMap[hostname] = [hostnameTo1stPartyPresetMap[hostname]];
            }
            hostnameTo1stPartyPresetMap[hostname].push(preset);
        }
    }
};

HTTPSB.PresetManager.prototype.rememberThirdParty = function(preset) {
    preset.firstParty = false;
    preset.id = this.idGenerator++;
    this.presets[preset.id] = preset;
    var hostnameTo3rdPartyPresetMap = this.hostnameTo3rdPartyPresetMap;
    var hostnames = Object.keys(preset.keys);
    var i = hostnames.length;
    var hostname;
    while ( i-- ) {
        hostname = hostnames[i];
        if ( !hostnameTo3rdPartyPresetMap[hostname] ) {
            hostnameTo3rdPartyPresetMap[hostname] = preset;
        } else {
            if ( hostnameTo3rdPartyPresetMap[hostname] instanceof HTTPSB.PresetRecipe ) {
                hostnameTo3rdPartyPresetMap[hostname] = [hostnameTo3rdPartyPresetMap[hostname]];
            }
            this.hostnameTo3rdPartyPresetMap[hostname].push(preset);
        }
    }
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.presetFromId = function(presetId) {
    return this.presets[presetId];
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.firstPartyFromHostname = function(hostname) {
    var presets = this.hostnameTo1stPartyPresetMap[hostname];
    if ( presets ) {
        return presets[0];
    }
    return null;
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.firstPartyFromName = function(name) {
    return this.firstPartyNameToPresetMap[name];
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.findMatches = function(firstParty, thirdParties) {
    var presets, preset;
    var matches = [];
    var matchDict = {};
    var i, j;

    presets = this.hostnameTo1stPartyPresetMap[firstParty];
    if ( !presets ) {
        presets = this.hostnameTo1stPartyPresetMap[HTTPSB.domainScopeKeyFromHostname(firstParty)];
    }

    if ( presets ) {
        if ( presets instanceof HTTPSB.PresetRecipe ) {
            presets = [presets];
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
    var hostnameTo1stPartyPresetMap = {};
    var firstPartyList = uriTools.allHostnamesFromHostname(firstParty);
    i = 0;
    while ( firstParty = firstPartyList[i++] ) {
        hostnameTo1stPartyPresetMap[firstParty] = true;
    }
    for ( var thirdParty in thirdParties ) {
        if ( !thirdParties.hasOwnProperty(thirdParty) ) {
            continue;
        }
        // Skip 3rd-parties same as 1st-party
        if ( hostnameTo1stPartyPresetMap[thirdParty] ) {
            continue;
        }
        presets = this.hostnameTo3rdPartyPresetMap[thirdParty];
        if ( !presets ) {
            continue;
        }
        if ( presets instanceof HTTPSB.PresetRecipe ) {
            presets = [presets];
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

HTTPSB.PresetManager.prototype.applyToScope = function(targetScopeKey, presetId) {
    var preset = this.presets[presetId];
    if ( !preset ) {
        return;
    }

    // This is to avoid potential circular references
    if ( preset.barrier ) {
        return;
    }
    preset.barrier++;

    var i, j;

    // Process required preset recipes
    if ( preset.firstParty && preset.requires ) {
        var other;
        if ( typeof preset.requires === 'string' ) {
            if ( other = this.firstPartyFromName(preset.requires) ) {
                this.applyToScope(targetScopeKey, other.id);
            }
        } else {
            i = preset.requires.length;
            while ( i-- ) {
                if ( other = this.firstPartyFromName(preset.requires[i]) ) {
                    this.applyToScope(targetScopeKey, other.id);
                }
            }
        }
    }

    // Scoped rules
    // When scopeKey is '*', this means uses target scope.
    var httpsb = HTTPSB;
    var scopeKey, rules, ruleKey, pos;

    var scopes = preset.scopeStr.trim().split(/\n+/);
    var i = scopes.length;
    var scopeFields;
    while ( i-- ) {
        scopeFields = scopes[i].split(/\s*:\s*/);
        if ( scopeFields.length < 2 ) {
            continue;
        }
        scopeKey = scopeFields[0].trim();
        if ( scopeKey === '' ) {
            continue;
        }
        if ( scopeKey !== '*' && httpsb.temporaryScopeExists(scopeKey) === false ) {
            httpsb.createTemporaryScopeFromScopeKey(scopeKey);
            httpsb.whitelistTemporarily(scopeKey, 'main_frame', '*');
            httpsb.whitelistTemporarily(scopeKey, 'stylesheet', '*');
            httpsb.whitelistTemporarily(scopeKey, 'image', '*');
            httpsb.copyTemporaryBlackRules(scopeKey, '*');
        }
        rules = scopeFields[1].split(',');
        j = rules.length;
        while ( j-- ) {
            ruleKey = rules[j].trim();
            if ( ruleKey === '' ) {
                continue;
            }
            pos = ruleKey.indexOf('|');
            httpsb.whitelistTemporarily(
                scopeKey !== '*' ? scopeKey : targetScopeKey,
                ruleKey.slice(0, pos),
                ruleKey.slice(pos + 1)
            );
        }
        // Remove site-level scopes which could occlude domain-level scope.
        if ( scopeKey !== '*' && httpsb.isDomainScopeKey(scopeKey) ) {
            httpsb.revealTemporaryDomainScope(scopeKey);
        }
    }

    preset.barrier--;
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.applyFromPresetName = function(presetName) {
    var preset = this.firstPartyFromName(presetName);
    if ( !preset ) {
        return;
    }
    this.applyToScope('*', preset.id);
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
        // Remove quotes if any.
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
        case 'preset/requires':
            break;
        case 'preset/scope':
            if ( fkey === 'whitelist' ) {
                contextStack.push(fkey);
            }
            break;
        case 'preset':
            if ( fkey === 'facode' ||
                 fkey === 'keys' ||
                 fkey === 'requires' ||
                 fkey === 'scope' ||
                 fkey === 'whitelist' ) {
                contextStack.push(fkey);
                if ( fkey === 'whitelist' ) {
                    p.scopeStr += '\n*:';
                }
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
            p.facode = parseInt(fvalue, 16);
            break;
        case 'preset/keys':
            if ( fvalue !== '' ) {
                p.keys[fvalue] = true;
            }
            break;
        case 'preset/requires':
            if ( fvalue !== '' ) {
                if ( p.requires === null ) {
                    p.requires = fvalue;
                } else if ( typeof p.requires === 'string') {
                    p.requires = [p.requires, fvalue];
                } else {
                    p.requires.push(fvalue);
                }
            }
            break;
        case 'preset/scope':
            p.scopeStr += '\n' + fvalue + ':';
            break;
        case 'preset/whitelist':
        case 'preset/scope/whitelist':
            ruleKey = this.parseRule(fvalue);
            if ( ruleKey ) {
                p.scopeStr += ',' + ruleKey;
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

HTTPSB.PresetManager.prototype.merge1stPartyPresets = function(details) {
    var preset;
    var content = details.content
        // Remove comments
        .replace(/(^|\s)#[^\n]*/g, '$1')
        // Remove empty lines
        .replace(/(^|\n)\s*\n/g, '$1');
    var entryBeg = 0,
        entryEnd = 0;
    while ( content.charAt(entryEnd) !== '' ) {
        entryEnd = content.indexOf('\n', entryEnd);
        if ( entryEnd >= 0 ) {
            entryEnd += 1;
        } else {
            entryEnd = content.length;
        }
        if ( content.charAt(entryEnd) !== ' ' ) {
            preset = this.parseEntry(content.slice(entryBeg, entryEnd, true));
            if ( preset ) {
                this.rememberFirstParty(preset);
            }
            entryBeg = entryEnd;
        }
    }
};

/******************************************************************************/

HTTPSB.PresetManager.prototype.merge3rdPartyPresets = function(details) {
    var preset;
    var content = details.content
        // Remove comments
        .replace(/(^|\s)#[^\n]*/g, '$1')
        // Remove empty lines
        .replace(/(^|\n)\s*\n/g, '$1');
    var entryBeg = 0,
        entryEnd = 0;
    while ( content.charAt(entryEnd) !== '' ) {
        entryEnd = content.indexOf('\n', entryEnd);
        if ( entryEnd >= 0 ) {
            entryEnd += 1;
        } else {
            entryEnd = content.length;
        }
        if ( content.charAt(entryEnd) !== ' ' ) {
            preset = this.parseEntry(content.slice(entryBeg, entryEnd, true));
            if ( preset ) {
                this.rememberThirdParty(preset);
            }
            entryBeg = entryEnd;
        }
    }
};

/******************************************************************************/

HTTPSB.loadPresets = function() {
    if ( !this.presetManager ) {
        this.presetManager = new this.PresetManager();
    }
    HTTPSB.assets.get('assets/httpsb/preset-recipes-1st.yaml', 'merge1stPartyPresets');
    HTTPSB.assets.get('assets/httpsb/preset-recipes-3rd.yaml', 'merge3rdPartyPresets');
};

/******************************************************************************/

