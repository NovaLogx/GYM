#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

rm -rf .git
git init -b main
git remote add origin https://github.com/NovaLogx/GYM.git

git add .
git commit -m "Initial BODY FIT Software deployment"
git branch dev

git push -u origin main dev

