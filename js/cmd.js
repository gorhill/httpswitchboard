(function() {

var MAX_HISTORY = 10;
var inputHistory = [];
var iHistoryIndex = 0;
var didUpKey = false;

var findMatchIndexArray = [];
var findCurrentIndex = 0;
var rowHeight;

//var autoStartCommandLine = true;
var autoNumberLinks = true;

function keepInputHistory( input ) {
   if ( inputHistory.length > 0 ) {
      var lastIndex = iHistoryIndex - ( (didUpKey) ? 1 : 0 );
      if ( lastIndex < 0 ) {
         lastIndex = inputHistory.length - 1;
      }
      if( input === inputHistory[lastIndex] ) {
         inputHistory.splice( lastIndex, 1 );
      }
   }
   inputHistory.unshift( input );
   if ( inputHistory.length > MAX_HISTORY ) {
      inputHistory.splice( MAX_HISTORY, 1 );
   }
   iHistoryIndex = 0;
   didUpKey = false;
}

function setShowFilters( strFilters ) {
   var filters = $('input[id^="show-"]');
   if ( strFilters === 'all' || strFilters === '' ) {
      filters.prop('checked', true).trigger( 'change' );
   } else {
      filters.prop('checked', false);
      if ( strFilters.length > 0 ) {
         checkCheckboxes( strFilters );
      }
   }
   $('#refresh-requests').click();
}

function checkCheckboxes( strFilterKeys, doToggle ) {
   var validFilterKeys = 'pbakicosxft';
   var i, cb;
   if ( strFilterKeys === 'all' ) {
      strFilterKeys = validFilterKeys;
   } else {
      // Remove duplicate & invalid keys
      var tmpStr = '';
      i = validFilterKeys.length;
      while( i-- ) {
         var tmpChar = validFilterKeys[i];
         if( strFilterKeys.indexOf( tmpChar ) > -1 ) {
             tmpStr += tmpChar;
         }
      }
      strFilterKeys = tmpStr;
   }
   i = strFilterKeys.length;
   while( i-- ) {
      switch ( strFilterKeys[i].toLowerCase() ) {
      case 'p': cb = $('#show-main_frame'); break;
      case 'b': cb = $('#show-blocked'); break;
      case 'a': cb = $('#show-allowed'); break;
      case 'k': cb = $('#show-cookie'); break;
      case 'i': cb = $('#show-image'); break;
      case 'c': cb = $('#show-stylesheet'); break;
      case 'o': cb = $('#show-object'); break;
      case 's': cb = $('#show-script'); break;
      case 'x': cb = $('#show-xmlhttprequest'); break;
      case 'f': cb = $('#show-sub_frame'); break;
      case 't': cb = $('#show-other'); break;
      }
      if ( doToggle ) {
         cb.click();
      } else {
         cb.prop( 'checked' , true ).trigger( 'change' );
      }
   }
}

function findAndHighlight( arg, useRegexp ) {
   var pattern = arg;
   var index = arg.indexOf( ' ' );
   var regX;
   if ( index > 0 ) {
      pattern = pattern.substr( 0, index );
      arg = arg.substr( index + 1 ).trim();
      setShowFilters( arg );
   }
   if ( useRegexp ) {
      try {
         regX = new RegExp( pattern );
      } catch (e) {
         return;
      }
   }
   findMatchIndexArray = [];
   findCurrentIndex = 0;
   var matchCount = 0;
   var requestRows = $('#requestsTable tbody tr:not(#requestRowTemplate):visible');
   var foundFirstMatch = false;
   for( var i=0, len=requestRows.length; i < len; i++ ) {
      var row = requestRows[i]
      var rowURL = row.lastChild.textContent;
      if ( ( !useRegexp && rowURL.indexOf( pattern ) > -1 )
         || ( useRegexp && regX.test( rowURL )) ) {
         $(row).addClass('highlight');
         findMatchIndexArray[ matchCount++ ] = i;
         if ( !foundFirstMatch ) {
            foundFirstMatch = true;
            scrollToRow( findCurrentIndex );
         }
      } else {
         $(row).removeClass('highlight');
      }
   }
}

function numberRows() {
   resetLinks();
   var rowsLinks = $('#requestsTable tbody tr:not(#requestRowTemplate) a:visible');
   for( var i=0, len=rowsLinks.length; i < len; i++ ) {
      var link = rowsLinks[i];
      if ( !link.id ) {
         var num = i + 1;
         link.textContent = '<'+ num +'>';
         link.id = 'a-'+ num;
      }
   }
}

function scrollToRow( index ) {
   var cmd = $('#commandline');
   var tableTop = cmd[0].offsetTop;
   if ( !cmd.hasClass( 'fixedPos' ) ) {
      tableTop += cmd[0].clientHeight;
   }
   window.scrollTo( 0, ( findMatchIndexArray[index] * rowHeight) + tableTop );
}

function resetLinks() {
   $('#requestsTable tbody tr:not(#requestRowTemplate) a')
   .text('<a>')
   .removeAttr('id');
}

function pageChangeReset() {
   findMatchIndexArray = [];
   findCurrentIndex = 0;
   var cmd = $('#commandline');
   if ( cmd.hasClass( 'fixedPos' ) ) {
      window.scrollTo( 0, cmd[0].offsetTop );
   }
   resetLinks();
   $('#requestsTable').parent().scrollLeft(0);
   $('#pageURL').text( $('#selectPageUrls')[0].selectedOptions[0].textContent );
   if ( autoNumberLinks ) {
      numberRows();
   }
}

function navigateHighlightedRows( increment ) {
   if ( findMatchIndexArray.length > 0 ) {
      findCurrentIndex += increment;
      if ( findCurrentIndex < 0 ) {
         findCurrentIndex = findMatchIndexArray.length - 1;
      } else if ( findCurrentIndex >= findMatchIndexArray.length ) {
         findCurrentIndex = 0;
      }
      scrollToRow( findCurrentIndex );
   }
}

function toggleCommandlineMode() {
   window.scrollTo( 0, 0 );
   $('#requestsTable').parent().scrollLeft(0);
   $('#requests').toggleClass( 'justDetails' );
   $('#all-stats').toggle();
   var cmdLine = $('#commandline')
   cmdLine.toggleClass( 'fixedPos' );
}

function goToLinkNumber( num ) {
   var link = document.getElementById( 'a-' + num );
   if ( link ) {
      openNewTabNavigateURL( link.href, true );
   }
}

function changePageUrlValue( page ) {
   $('#selectPageUrls').val( page ).trigger( 'change' );
   pageChangeReset();
}

function openNewTabNavigateURL( url, active ) {
   if ( !active ) {
      active = false;
   }
   chrome.tabs.getCurrent( function ( tab ) {
      chrome.tabs.create( {'url': url, active: active, index: tab.index + 1} );
   });
}

function doRefresh() {
   $('#refresh-requests').click();
   if ( autoNumberLinks ) {
      numberRows();
   } else {
      resetLinks();
   }
}

function reloadAllTabs() {
   chrome.tabs.getAllInWindow( function ( tabs ) {
      console.info( tabs );
      var i = tabs.length;
      while( i-- ) {
         var tab = tabs[i];
         if ( /^https?:\/\/./.test( tab.url ) ) {
            chrome.tabs.reload( tab.id, {bypassCache: true} );
         }
      }
   });
}

function keyDownHandler( keyEvent ) {
   // Enter key
   if ( keyEvent.which === 13 ) {
      var cmd = keyEvent.target.value;
      keepInputHistory( cmd );

      var index = cmd.indexOf( ' ' );
      var arg = '';
      if ( index > 0 ) {
         arg = cmd.substr( index + 1 ).trim();
         cmd = cmd.substr( 0, index );
      }

      keyEvent.target.value = '';

      switch ( cmd.toLowerCase() ) {
      // Selects 'All' in pageUrls
      case 'all':
         changePageUrlValue( 'All' );
         break;

      // Toggle Automatic link numbering (done after filter or pageUrl change)
      case 'an':
      case 'auto#':
         autoNumberLinks = !autoNumberLinks;
         if ( autoNumberLinks ) {
            numberRows();
         }
         break;

      // Selects 'Chromium: Behind the scene' in pageUrls
      case 'bts':
         changePageUrlValue( 'http://chromium-behind-the-scene' );
         break;

      // Clears highlights
      case 'c':
      case 'clear':
         findMatchIndexArray = [];
         findCurrentIndex = 0;
         $('#requestsTable tbody tr:not(#requestRowTemplate)')
         .removeClass('highlight');
         break;

      // Searches for string in row's URL
      // usage: find [String] [ShowFilter(optional)]
      // 'find .webm'     Finds '.webm' using fitlers already set
      // 'find net as'    Finds 'net' using filters 'Allowed, Scripts'
      // 'f /ad/ all'     Finds '/ad/' using all filters
      case 'f':
      case 'find':
         if ( arg.length > 0 ) {
            findAndHighlight( arg );
         }
         break;

      // Searches for patterns in row's URL using regular expressions
      // usage: regx [RegexPattern] [ShowFilter(optional)]
      // 'regx (png|jpg)'  Finds 'png' or 'jpg' using fitlers already set
      // 'x \.swf bo'      Finds rows of blocked objects with '.swf' in the URL
      case 'x':
      case 'regx':
         if ( arg.length > 0 ) {
            findAndHighlight( arg , true );
         }
         break;

      // Sets 'Show' filters
      // 'filter bsx'   Sets 'Show' fitler to 'Blocked, Scripts, XHRs'
      // 'sf all'       Sets all filters
      case 'sf':
      case 'setf':
      case 'filter':
         setShowFilters( arg );
         doRefresh();
         break;

      // Navigates to row's URL at link number
      // Must call 'num' or '#' command first for this command to work
      // 'link 20'
      case 'l':
      case 'link':
         goToLinkNumber( arg );
         break;

      // Numbers row's link
      case '#':
      case 'num':
         numberRows();
         break;

      // Refresh stats page
      case 'r':
      case 're':
      case 'refresh':
         doRefresh();
         break;

      // Reloads all tabs
      case 'rt':
      case 'rat':
         reloadAllTabs();
         break;

      // Toggles 'Show' filters
      // 'show a'       Toggles 'Allowed'
      // 's kic'        Toggles 'Cookies, Imgaes, CSS'
      // 'toggle all'   Toggles all
      case 's':
      case 'show':
      case 't':
      case 'toggle':
         //resetLinks();
         checkCheckboxes( arg , true );
         doRefresh();
         break;

      // Hides/Shows HTTPSB Stats
      case '>':
      case 'stats':
         toggleCommandlineMode();
         window.scrollTo( 0, 0 );
         break;

      // Scroll to top
      case 'top':
         window.scrollTo( 0, document.getElementById('commandline').offsetTop );
         $('#requestsTable').parent().scrollLeft( 0 );
         break;

      // Open a new window and navigates to a URL
      // 'url google.com'   Navigates to http://google.com
      case 'url':
      case 'open':
         if ( ! /^https?:\/\/./.test( arg ) ) {
            arg = 'http://' + arg;
         }
         openNewTabNavigateURL( arg );
         break;
      default:
         // If input ia a number, treat it as a 'link' command ( Navigate to <#> )
         // or
         // If input is a URL, navigate to it
         if( !isNaN( cmd ) ) {
            goToLinkNumber( cmd );
         } else if ( /^https?:\/\/./.test( cmd ) ) {
            openNewTabNavigateURL( cmd , true );
         }
      }
   }

   // Up or Down Key
   // UP only cycles through input history
   // Ctrl + ( UP or Down ) scrolls page up or down
   // Alt + ( UP or Down ) scrolls to next/previous highlighted row
   else if ( keyEvent.which === 38 || keyEvent.which === 40 ) {
      if( keyEvent.ctrlKey ) {
         var scrollY = ( keyEvent.which === 38 ) ? -100 : 100;
         window.scrollBy( 0, scrollY );
         keyEvent.preventDefault();
      } else if ( keyEvent.altKey ) {
         navigateHighlightedRows( ( keyEvent.which === 40 ) ? 1 : -1 );
         keyEvent.preventDefault();
      } else {
         // Up key
         if( keyEvent.which === 38 && inputHistory.length > 0 ) {
            didUpKey = true;
            keyEvent.target.value = inputHistory[iHistoryIndex++];
            if ( iHistoryIndex >= inputHistory.length ) {
               iHistoryIndex = 0;
            }
         }
      }
   }

   // Left or Right Key
   // Ctrl + ( Left or Right ) scrolls page left or right
   // Alt + ( Left or Right ) scrolls to next/previous highlighted row
   else if ( keyEvent.which === 39 || keyEvent.which === 37 ) {
      if( keyEvent.ctrlKey ) {
         var tableParent = $('#requestsTable').parent();
         var scrollX = tableParent.scrollLeft()
                       + (( keyEvent.which === 39 ) ? 100 : -100);
         tableParent.scrollLeft( scrollX );
         keyEvent.preventDefault();
      } else if ( keyEvent.altKey ) {
         navigateHighlightedRows( ( keyEvent.which === 39 ) ? 1 : -1 );
         keyEvent.preventDefault();
      }
   }

   // Tab Key
   // Cycles through pageUrls
   // Tab Only cycles ->
   // Shift + Tab cycles <-
   else if ( keyEvent.which === 9 ) {
      var selectPageUrl = $('#selectPageUrls')[0];
      var increment = ( keyEvent.shiftKey ) ? -1 : 1;
      var nextIndex = selectPageUrl.selectedIndex + increment;
      if ( nextIndex >= selectPageUrl.childElementCount ) {
         nextIndex = 0;
      } else if ( nextIndex < 0 ) {
         nextIndex = selectPageUrl.childElementCount - 1;
      }
      selectPageUrl.selectedIndex = nextIndex;
      $('#selectPageUrls').trigger( 'change' );
      pageChangeReset();
      keyEvent.preventDefault();
   }

   // Escape Key
   // Clears input
   else if ( keyEvent.which === 27 ) {
      keyEvent.target.value = '';
   }
}

function initAll() {
   rowHeight = document.querySelector('#requestsTable tr').clientHeight;
   $('#pageURL').text( $('#selectPageUrls option:selected').text() );
   var inputCommand = $('#inputCommand');
   inputCommand.keydown( keyDownHandler );
   autoStartCommandLine = chrome.extension.getBackgroundPage()
                          .HTTPSB
                          .userSettings
                          .startStatsPageInCommandLineMode;
   console.info('userSettings.startStatsPageInCommandLineMode = ' + autoStartCommandLine);
   if ( autoStartCommandLine ) {
      toggleCommandlineMode();
      inputCommand.focus();
   }
   if ( autoNumberLinks ) {
      numberRows();
   }
}

/******************************************************************************/
// Handle user interaction
$(function(){
   initAll();
});
/******************************************************************************/

})();