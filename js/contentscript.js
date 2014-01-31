// Injected into content pages

/******************************************************************************/

var localStorageHandler = function(mustRemove) {
    if ( mustRemove ) {
        window.localStorage.clear();
        // console.debug('HTTP Switchboard > found and removed non-empty localStorage');
    }
};

/******************************************************************************/

var nodesAddedHandler = function(nodeList, summary) {
    var i = 0;
    var node, src, text;
    while ( node = nodeList.item(i++) ) {
        switch ( node.tagName ) {

        case 'SCRIPT':
            text = node.textContent.trim();
            if ( text !== '' ) {
                summary.scriptSources['{inline_script}'] = true;
                summary.mustReport = true;
            }
            src = (node.src || '').trim();
            if ( src !== '' ) {
                summary.scriptSources[src] = true;
                summary.mustReport = true;
            }
            break;

        case 'A':
            if ( node.href.indexOf('javascript:') === 0 ) {
                summary.scriptSources['{inline_script}'] = true;
                summary.mustReport = true;
            }
            break;

        case 'OBJECT':
            src = (node.data || '').trim();
            if ( src !== '' ) {
                summary.pluginSources[src] = true;
                summary.mustReport = true;
            }
            break;

        case 'EMBED':
            src = (node.src || '').trim();
            if ( src !== '' ) {
                summary.pluginSources[src] = true;
                summary.mustReport = true;
            }
            break;
        }
    }
};

/******************************************************************************/

var mutationObservedHandler = function(mutations) {
    var summary = {
        what: 'contentScriptSummary',
        locationURL: window.location.href,
        scriptSources: {}, // to avoid duplicates
        pluginSources: {}, // to avoid duplicates
        mustReport: false
    };
    var iMutation = mutations.length;
    var mutation;
    var nodes, iNode, node;
    while ( iMutation-- ) {
        mutation = mutations[iMutation];
        if ( !mutation.addedNodes ) {
            // TODO: attr changes also must be dealth with, but then, how
            // likely is it...
            continue;
        }
        nodesAddedHandler(mutation.addedNodes, summary);
    }

    if ( summary.mustReport ) {
        chrome.runtime.sendMessage(summary);
    }
};

/******************************************************************************/

var firstObservationHandler = function() {
    var summary = {
        what: 'contentScriptSummary',
        locationURL: window.location.href,
        scriptSources: {}, // to avoid duplicates
        pluginSources: {}, // to avoid duplicates
        localStorage: false,
        indexedDB: false,
        mustReport: true
    };
    // https://github.com/gorhill/httpswitchboard/issues/25
    // &
    // Looks for inline javascript also in at least one a[href] element.
    // https://github.com/gorhill/httpswitchboard/issues/131
    nodesAddedHandler(document.querySelectorAll('script, a[href^="javascript:"], object, embed'), summary);

    // Check with extension whether local storage must be emptied
    if ( window.localStorage && window.localStorage.length ) {
        summary.localStorage = true;
        chrome.runtime.sendMessage({
            what: 'contentScriptHasLocalStorage',
            url: summary.locationURL
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

    chrome.runtime.sendMessage(summary);
};

/******************************************************************************/

var loadHandler = function() {
    firstObservationHandler();

    // Observe changes in the DOM
    // https://github.com/gorhill/httpswitchboard/issues/176
    var observer = new MutationObserver(mutationObservedHandler);
    var config = {
        attributes: false,
        childList: true,
        characterData: false,
        subtree: true
    };

    observer.observe(document.body, config);
};

/******************************************************************************/

// rhill 2013-11-09: Weird... This code is executed from HTTP Switchboard
// context first time extension is launched. Avoid this.
// TODO: Investigate if this was a fluke or if it can really happen.
// I suspect this could only happen when I was using chrome.tabs.executeScript(),
// because now a delarative content script is used, along with "http{s}" URL
// pattern matching.
if ( /^https?:\/\/./.test(window.location.href) ) {
    // rhill 2014-01-26: If document is already loaded, handle all immediately,
    // otherwise defer to later when document is loaded.
    // https://github.com/gorhill/httpswitchboard/issues/168
    if ( document.readyState === 'interactive' ) {
        loadHandler();
    } else {
        window.addEventListener('load', loadHandler);
    }
}

