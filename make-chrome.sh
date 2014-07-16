#!/bin/bash
#
# This script assumes a linux environment

echo "*** HTTP Switchboard: Creating web store package"
echo "*** HTTP Switchboard: Copying files"
cp -R assets dist/httpswitchboard/
rm dist/httpswitchboard/assets/*.sh
cp -R css dist/httpswitchboard/
cp -R img dist/httpswitchboard/
cp -R js dist/httpswitchboard/
cp -R lib dist/httpswitchboard/
cp -R _locales dist/httpswitchboard/
cp *.html dist/httpswitchboard/
cp *.txt dist/httpswitchboard/
cp *.md dist/httpswitchboard/
cp *.png dist/httpswitchboard/
cp manifest.json dist/httpswitchboard/
echo "*** HTTP Switchboard: Package done."
