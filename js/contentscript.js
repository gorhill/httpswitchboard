// Injected into content pages

// rhill 2013-11-09: Weird... This code is executed from HTTP Switchboard
// context first time extension is launched. Avoid this.
if ( /^https?:\/\/./.test(window.location.href) ) {

/******************************************************************************/

var localStorageHandler = function(mustRemove) {
    if ( mustRemove ) {
        window.localStorage.clear();
        // console.debug('HTTP Switchboard > found and removed non-empty localStorage');
    }
};

/*------------[ Unrendered Noscript (because CSP) Workaround ]----------------*/

var fixNoscriptTags = function() {
    var a = document.querySelectorAll('noscript');
    var i = a.length;
    var realNoscript,
        fakeNoscript;
    while ( i-- ) {
        realNoscript = a[i];
        fakeNoscript = document.createElement('div');
        fakeNoscript.innerHTML = "<!--NOSCRIPT-->\n"+realNoscript.textContent;
        // Adding this class attribute to the <div> is not necessary.
        // Just adding it so we know that the <div> is actually a <noscript>
        fakeNoscript.setAttribute('class', 'fakeNoscript');
        realNoscript.parentNode.replaceChild(fakeNoscript, realNoscript);
    }
};

var checkScriptBlacklistedHandler = function(response) {
   if( response.scriptBlacklisted ) {
      fixNoscriptTags();
   }
}

// Checking to see if script is blacklisted
// Not sure if this is right place to check. I don't know if subframes with
// <noscript> tags will be fixed.  Should I call this from loadHandler() where
// the old fixNoscriptTags() was called?
chrome.runtime.sendMessage({ what: 'checkScriptBlacklisted',
                             url: window.location.href
                           }, checkScriptBlacklistedHandler );

/*----------------------------------------------------------------------------*/

var collectExternalResources = function() {
    var r = {
        refCounter: 0,
        locationURL: window.location.href,
        scriptSources: {}, // to avoid duplicates
        pluginSources: {}, // to avoid duplicates
        localStorage: false,
        indexedDB: false
    };
    var i, elem, elems;

    // https://github.com/gorhill/httpswitchboard/issues/25
    elems = document.querySelectorAll('script');
    i = elems ? elems.length : 0;
    while ( i-- ) {
        elem = elems[i];
        if ( elem.innerText.trim() !== '' ) {
            r.scriptSources['{inline_script}'] = true;
        }
        if ( elem.src && elem.src.trim() !== '' ) {
            r.scriptSources[elem.src.trim()] = true;
        }
    }

    // Looks for inline javascript also in at least one a[href] element.
    // https://github.com/gorhill/httpswitchboard/issues/131
    if ( document.querySelector('a[href^="javascript:"]') ) {
        r.scriptSources['{inline_script}'] = true;
    }

    // https://github.com/gorhill/httpswitchboard/issues/25
    elems = document.querySelectorAll('object');
    i = elems.length;
    while ( i-- ) {
        elem = elems[i];
        if ( elem.data && elem.data.trim() !== '' ) {
            r.pluginSources[elem.data.trim()] = true;
        }
    }

    // https://github.com/gorhill/httpswitchboard/issues/25
    elems = document.querySelectorAll('embed');
    i = elems.length;
    while ( i-- ) {
        elem = elems[i];
        if ( elem.src && elem.src.trim() !== '' ) {
            r.pluginSources[elem.src.trim()] = true;
        }
    }

    // Check for non-empty localStorage
    if ( window.localStorage && window.localStorage.length ) {
        r.localStorage = true;
        chrome.runtime.sendMessage({
            what: 'contentScriptHasLocalStorage',
            url: r.locationURL
        }, localStorageHandler);
    }

    // TODO: indexedDB
    if ( window.indexedDB && !!window.indexedDB.webkitGetDatabaseNames ) {
        // var db = window.indexedDB.webkitGetDatabaseNames().onsuccess = function(sender) {
        //    console.debug('webkitGetDatabaseNames(): result=%o', sender.target.result);
        // };
    }

    // TODO: Web SQL
    if ( window.openDatabase ) {
        // Sad:
        // "There is no way to enumerate or delete the databases available for an origin from this API."
        // Ref.: http://www.w3.org/TR/webdatabase/#databases
    }

    // Important!!
    chrome.runtime.sendMessage({
        what: 'contentScriptSummary',
        details: r
    });
};

/*----------------------------------------------------------------------------*/

var loadHandler = function() {
//    fixNoscriptTags();
    collectExternalResources();
};

/*----------------------------------------------------------------------------*/

// rhill 2014-01-26: If document is already loaded, handle all immediately,
// otherwise defer to later when document is loaded.
// https://github.com/gorhill/httpswitchboard/issues/168
if ( document.readyState === 'interactive' ) {
    loadHandler();
} else {
    window.addEventListener('load', loadHandler);
}

/******************************************************************************/

}

