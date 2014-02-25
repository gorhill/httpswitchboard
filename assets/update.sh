#!/bin/bash
#
# This script assumes a linux environment

TEMPFILE=/tmp/httpsb-asset

echo "*** HTTP Switchboard: updating assets..."

THIRDPARTY_REMOTEURLS=(
    'http://mirror1.malwaredomains.com/files/immortal_domains.txt'
    'http://mirror1.malwaredomains.com/files/justdomains'
    'http://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=1&startdate%5Bday%5D=&startdate%5Bmonth%5D=&startdate%5Byear%5D=&mimetype=plaintext'
    'http://www.malwaredomainlist.com/hostslist/hosts.txt'
    'http://hosts-file.net/.%5Cad_servers.txt'
    'http://someonewhocares.org/hosts/hosts'
    'https://easylist-downloads.adblockplus.org/easylist.txt'
    'https://easylist-downloads.adblockplus.org/easyprivacy.txt'
    'https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt'
    'http://www.fanboy.co.nz/enhancedstats.txt'
    'http://winhelp2002.mvps.org/hosts.txt'
    'http://hosts-file.net/download/hosts.txt'
    'http://publicsuffix.org/list/effective_tld_names.dat'
    )

THIRDPARTY_LOCALURLS=(
    'thirdparties/mirror1.malwaredomains.com/files/immortal_domains.txt'
    'thirdparties/mirror1.malwaredomains.com/files/justdomains'
    'thirdparties/pgl.yoyo.org/as/serverlist'
    'thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt'
    'thirdparties/hosts-file.net/ad-servers'
    'thirdparties/someonewhocares.org/hosts/hosts'
    'thirdparties/easylist-downloads.adblockplus.org/easylist.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easyprivacy.txt'
    'thirdparties/easylist-downloads.adblockplus.org/fanboy-annoyance.txt'
    'thirdparties/www.fanboy.co.nz/enhancedstats.txt'
    'thirdparties/winhelp2002.mvps.org/hosts.txt'
    'thirdparties/hosts-file.net/hosts.txt'
    'thirdparties/publicsuffix.org/list/effective_tld_names.dat'
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

echo "*** Generating checksums.txt file..."
truncate -s 0 checksums.txt
pushd ..
LIST="$(find assets/httpsb assets/thirdparties -type f)"
for ENTRY in $LIST; do
    echo `md5sum $ENTRY` >> assets/checksums.txt
done
popd

echo "*** Git adding changed assets..."
git add --update --ignore-removal --ignore-errors ./*
echo "*** Git committing assets..."
git commit -m 'automatic update of third-party assets'
echo "*** Git pushing assets to remote master..."
git push origin master

echo "Done."

