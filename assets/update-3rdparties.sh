#!/bin/bash
#
# This script assumes a linux environment

TEMPFILE=/tmp/httpsb-asset

echo "*** HTTP Switchboard: updating remote assets..."

THIRDPARTY_REMOTEURLS=(
    'http://mirror1.malwaredomains.com/files/immortal_domains.txt'
    'http://mirror1.malwaredomains.com/files/justdomains'
    'http://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=1&startdate%5Bday%5D=&startdate%5Bmonth%5D=&startdate%5Byear%5D=&mimetype=plaintext'
    'http://www.malwaredomainlist.com/hostslist/hosts.txt'
    'http://hosts-file.net/.%5Cad_servers.txt'
    'http://someonewhocares.org/hosts/hosts'
    'http://winhelp2002.mvps.org/hosts.txt'
    'http://hosts-file.net/download/hosts.txt'
    'http://publicsuffix.org/list/effective_tld_names.dat'
    'https://easylist-downloads.adblockplus.org/easylist.txt'
    'https://easylist-downloads.adblockplus.org/easyprivacy.txt'
    'https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt'
    'http://www.fanboy.co.nz/enhancedstats.txt'
    'https://easylist-downloads.adblockplus.org/easylistgermany.txt'
    'https://easylist-downloads.adblockplus.org/easylistitaly.txt'
    'https://easylist-downloads.adblockplus.org/easylistdutch.txt'
    'https://easylist-downloads.adblockplus.org/liste_fr.txt'
    'http://adblock-chinalist.googlecode.com/svn/trunk/adblock.txt'
    'http://stanev.org/abp/adblock_bg.txt'
    'http://indonesianadblockrules.googlecode.com/hg/subscriptions/abpindo.txt'
    'http://liste-ar-adblock.googlecode.com/hg/Liste_AR.txt'
    'http://adblock-czechoslovaklist.googlecode.com/svn/filters.txt'
    'https://gitorious.org/adblock-latvian/adblock-latvian/raw/5f5fc83eb1a2d0e97df9a5c382febaa651511757:lists/latvian-list.txt'
    'https://raw.github.com/AdBlockPlusIsrael/EasyListHebrew/master/EasyListHebrew.txt'
    )

THIRDPARTY_LOCALURLS=(
    'thirdparties/mirror1.malwaredomains.com/files/immortal_domains.txt'
    'thirdparties/mirror1.malwaredomains.com/files/justdomains'
    'thirdparties/pgl.yoyo.org/as/serverlist'
    'thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt'
    'thirdparties/hosts-file.net/ad-servers'
    'thirdparties/someonewhocares.org/hosts/hosts'
    'thirdparties/winhelp2002.mvps.org/hosts.txt'
    'thirdparties/hosts-file.net/hosts.txt'
    'thirdparties/publicsuffix.org/list/effective_tld_names.dat'
    'thirdparties/easylist-downloads.adblockplus.org/easylist.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easyprivacy.txt'
    'thirdparties/easylist-downloads.adblockplus.org/fanboy-annoyance.txt'
    'thirdparties/www.fanboy.co.nz/enhancedstats.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistgermany.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistitaly.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistdutch.txt'
    'thirdparties/easylist-downloads.adblockplus.org/liste_fr.txt'
    'thirdparties/adblock-chinalist.googlecode.com/svn/trunk/adblock.txt'
    'thirdparties/stanev.org/abp/adblock_bg.txt'
    'thirdparties/indonesianadblockrules.googlecode.com/hg/subscriptions/abpindo.txt'
    'thirdparties/liste-ar-adblock.googlecode.com/hg/Liste_AR.txt'
    'thirdparties/adblock-czechoslovaklist.googlecode.com/svn/filters.txt'
    'thirdparties/gitorious.org/adblock-latvian/adblock-latvian/raw/5f5fc83eb1a2d0e97df9a5c382febaa651511757:lists/latvian-list.txt'
    'thirdparties/raw.github.com/AdBlockPlusIsrael/EasyListHebrew/master/EasyListHebrew.txt'
    )

ENTRY_INDEX=0
for THIRDPARTY_REMOTEURL in ${THIRDPARTY_REMOTEURLS[@]}; do
    THIRDPARTY_LOCALURL=${THIRDPARTY_LOCALURLS[ENTRY_INDEX]}
    echo "*** Downloading" $THIRDPARTY_REMOTEURL
    if wget -q -O $TEMPFILE -- $THIRDPARTY_REMOTEURL; then
        if [ -s $TEMPFILE ]; then
            if ! cmp -s $TEMPFILE $THIRDPARTY_LOCALURL; then
                echo "    New version found, copying to $THIRDPARTY_LOCALURL"
                mv $TEMPFILE $THIRDPARTY_LOCALURL
            fi
        fi
    fi
    let ENTRY_INDEX+=1
done

echo "*** HTTP Switchboard: remote assets updated."

