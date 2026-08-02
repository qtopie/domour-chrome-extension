#!/bin/bash
echo "Starting Chrome..." > chrome_cdp.log
/usr/bin/google-chrome --headless=new --remote-debugging-port=19222 --load-extension="$(pwd)/frontend/dist" --user-data-dir="$(pwd)/.chrome-profile-test" --disable-gpu >> chrome_cdp.log 2>&1 &
echo $!
