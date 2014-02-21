#!/bin/bash
#

echo "HTTP Switchboard: updating assets..."

echo "Generating checksums.txt file..."
truncate -s 0 checksums.txt
LIST="$(find httpsb thirdparties -type f)"
for i in $LIST; do
    echo `md5sum $i` >> checksums.txt
done

GITADDLIST="$(git add -un --ignore-errors --ignore-missing ./*)"
for i in $GITADDLIST; do
    echo $i
done

