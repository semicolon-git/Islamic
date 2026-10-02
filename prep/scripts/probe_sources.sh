#!/bin/bash
# probe endpoints: prints code, size, content-type, url
while read -r url; do
  [ -z "$url" ] && continue
  out=$(curl -sS -L -m 25 -o /dev/null -w "%{http_code}\t%{size_download}\t%{content_type}" -A "Mozilla/5.0 (hackathon-prep probe)" "$url" 2>&1 | tr '\n' ' ')
  echo -e "$out\t$url"
done
