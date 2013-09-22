// injected into content pages

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

// This must be last, so that result is returned to extension.
// This is used so that inline script tags are logged in the stats
!!document.querySelector("script");
