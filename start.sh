#!/bin/sh
set -eu

cd "$(dirname "$0")"
python3 scripts/build_video_manifest.py
python3 -m http.server 8080
