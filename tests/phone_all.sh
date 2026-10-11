#!/bin/bash
# Run the phone cut-off check on many pages at 360px and 390px. Usage: phone_all.sh BASE_URL
BASE=${1:-https://omarchystore.com}
cd ~/omarchy-store
for w in 360 390; do
  for p in / /ignite/ /get-omarchy/ /app/snapdock/ /app/obsidian/ /themes/ /theme/retropc/ /plugins/ /submit/ /category/ai/ /charts/ /get-desktop/ /legal/; do
    n=$(echo "$p" | tr '/' '_'); timeout 90 ~/omarchy-social/.venv/bin/python tests/phone_check.py "$BASE$p" "pc$n" $w 2>&1 | grep -vE "^\s*$" | head -6
  done
done
