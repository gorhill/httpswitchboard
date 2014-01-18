// Injected into content pages

// rhill 2013-11-09: Weird... This code is executed from HTTP Switchboard
// context first time extension is launched. Avoid this.
if ( /^https?:\/\/./.test(window.location.href) ) {

/******************************************************************************/

function localStorageHandler(mustRemove) {
    if ( mustRemove ) {
        window.localStorage.clear();
        // console.debug('HTTP Switchboard > found and removed non-empty localStorage');
    }
}

/*----------------------------------------------------------------------------*/

// This is to take care of
// https://code.google.com/p/chromium/issues/detail?id=232410
// We look up noscript tags and force the DOM parser to parse
// them.
function fixNoscriptTags() {
    var a = document.querySelectorAll('noscript');
    var i = a.length;
    var html;
    while ( i-- ) {
        html = a[i].innerHTML;
        html = html.replace(/&lt;/g, '<');
        html = html.replace(/&gt;/g, '>');
        a[i].innerHTML = html;
    }
}

/*----------------------------------------------------------------------------*/

function collectExternalResources() {
    var r = {
        refCounter: 0,
        pageUrl: window.location.href,
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
            url: r.pageUrl
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
}

/*----------------------------------------------------------------------------*/

function loadHandler() {
    fixNoscriptTags();
    collectExternalResources();
}

window.addEventListener('load', loadHandler);

/******************************************************************************/

}

