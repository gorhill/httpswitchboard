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
};

/******************************************************************************/

HTTPSB.PresetRecipe.prototype.applyToScope = function(scopeKey) {
    var httpsb = HTTPSB;
    var rules = this.whitelist;
    var pos;
    for ( var ruleKey in rules ) {
        if ( !rules.hasOwnProperty(ruleKey) ) {
            continue;
        }
        pos = ruleKey.indexOf('|');
        httpsb.whitelistTemporarily(scopeKey, ruleKey.slice(0, pos), ruleKey.slice(pos + 1));
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

HTTPSB.PresetManager.prototype.parseEntry = function(entry) {
    var typeMapper = {
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
    var p = new HTTPSB.PresetRecipe(this.idGenerator);
    var lines = entry.split('\n');
    var n = lines.length;
    var context = '';
    var line, pos, fname, fvalue, type, hostname;
    for ( var i = 0; i < n; i++ ) {
        line = lines[i];
        // Remove comment
        pos = line.indexOf('#');
        if ( pos >= 0 ) {
            line = line.slice(0, pos);
        }
        // Split in name & value fields
        pos = line.indexOf(':');
        if ( pos < 0 ) {
            fname = line.trim();
            fvalue = '';
        } else {
            fname = line.slice(0, pos).trim();
            fvalue = line.slice(pos + 1).trim();
        }
        if ( fname === 'name' ) {
            p.name = fvalue;
            context = '';
            continue;
        }
        if ( fname === 'facode' ) {
            p.facode = parseInt(fvalue, 16);
            context = '';
            continue;
        }
        if ( fname === 'keys' ) {
            context = 'keys';
            continue;
        }
        if ( fname === 'whitelist' ) {
            context = 'whitelist';
            continue;
        }
        if ( context === 'keys' ) {
            p.keys[fname.toLowerCase()] = true;
            continue;
        }
        if ( context === 'whitelist' ) {
            fname = fname.toLowerCase();
            pos = fname.indexOf(' ');
            // Ignore invalid rules
            if ( pos < 0 )  {
                continue;
            }
            type = typeMapper[fname.slice(0, pos).trim()];
            hostname = fname.slice(pos).trim();
            // Ignore invalid rules
            if ( type === '' || hostname === '' ) {
                continue;
            }
            p.whitelist[type + '|' + hostname] = true;
            continue;
        }
        context = '';
    }

    if ( p.name === '' ||
         Object.keys(p.keys).length === 0 ||
         Object.keys(p.whitelist).length === 0 ) {
        return null;
    }

    return p;
};

/******************************************************************************/

HTTPSB.loadPresets = function() {
    var content, entries, i, preset;

    var presetManager = new this.PresetManager();
    this.presetManager = presetManager;

    content = readLocalTextFile('assets/httpsb/preset-recipes-1st.txt');
    entries = content.split(/\n\s*\n/);
    i = entries.length;
    while ( i-- ) {
        preset = presetManager.parseEntry(entries[i], true);
        if ( !preset ) {
            continue;
        }
        presetManager.rememberFirstParty(preset);
    }

    content = readLocalTextFile('assets/httpsb/preset-recipes-3rd.txt');
    entries = content.split(/\n\s*\n/);
    i = entries.length;
    while ( i-- ) {
        preset = presetManager.parseEntry(entries[i], false);
        if ( !preset ) {
            continue;
        }
        presetManager.rememberThirdParty(preset);
    }
};

/******************************************************************************/

