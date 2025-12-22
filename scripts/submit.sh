#!/bin/bash

proxychains -q pnpx wxt submit $1 \
--chrome-zip .output/*-chrome.zip \
--edge-zip .output/*-edge.zip \
--firefox-zip .output/*-firefox.zip \
--firefox-sources-zip .output/*-sources.zip

