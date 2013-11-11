// Injected into content pages

// rhill 2013-11-09: Weird... This code is executed from HTTP Switchboard
// context first time extension is launched. Avoid this.
if ( window.location.href.match(/^https?:\/\//) ) {

/******************************************************************************/

// This is to take care of
// https://code.google.com/p/chromium/issues/detail?id=232410
// We look up noscript tags and force the DOM parser to parse
// them.
(function() {
    var a = document.querySelectorAll('noscript');
    var i = a.length;
    var html;
    while ( i-- ) {
        html = a[i].innerHTML;
        html = html.replace(/&lt;/g, '<');
        html = html.replace(/&gt;/g, '>');
        a[i].innerHTML = html;
    }
})();

// Can extension remove localStorage of pages (like when cookies for 
// page are blacklisted)? Need to investigate. (Well at least when
// scripts are blocked, localStorage won't happen..)

// This must be last, so that result is returned to extension.
// This is used so that inline script tags and preemptively blocked scripts
// (which won't generate web requests) are logged in the stats.
// TODO: Do same with <object>, <embed>, they are currently underreported
// when preemptively blocked.
(function() {
    var r = {
        pageUrl: window.location.href,
        scriptSources: {}, // to avoid duplicates
        pluginSources: {}, // to avoid duplicates
        localStorage: false
    };
    var i, elem, elems;
    // https://github.com/gorhill/httpswitchboard/issues/25
    elems = document.scripts;
    i = elems.length;
    while ( i-- ) {
        elem = elems[i];
        if ( elem.innerText.trim() !== '' ) {
            r.scriptSources['{inline_script}'] = true;
        }
        if ( elem.src && elem.src.trim() !== '' ) {
            r.scriptSources[elem.src.trim()] = true;
        }
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
            what: 'contentHasLocalStorage',
            url: r.pageUrl
        }, function(mustRemove) {
            if ( mustRemove ) {
                window.localStorage.clear();
                // console.debug('HTTP Switchboard > found and removed non-empty localStorage');
            }
        });
    }
    // TODO: indexedDB
    // Doesn't seem possible as of 2013-11-09

    // Important!!
    return r;
})();

/******************************************************************************/

}

