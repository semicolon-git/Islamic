#!/usr/bin/env bash
# Download the pinned raw inputs for the prep scripts into prep/data/raw/ and verify checksums.
# These files are third-party data (see prep/README.md for licences) and are not committed.
set -euo pipefail
cd "$(dirname "$0")"
RAW=data/raw
mkdir -p "$RAW/translations" "$RAW/tafsir" "$RAW/hadith" "$RAW/fonts"

GH=https://raw.githubusercontent.com
fetch() { # url dest sha256
  local url=$1 dest=$2 sum=$3
  if [ ! -s "$dest" ]; then
    echo "fetch  $dest"
    curl -fsSL --retry 3 -m 300 -o "$dest.part" "$url" && mv "$dest.part" "$dest"
  fi
  echo "$sum  $dest" | sha256sum -c --quiet - || { echo "CHECKSUM MISMATCH: $dest (source changed?)" >&2; exit 1; }
}

# Quran text: King Fahd Complex (KFGQPC) Hafs v18 Unicode + its font
fetch $GH/thetruetruth/quran-data-kfgqpc/main/hafs/data/hafsData_v18.json "$RAW/quran_kfgqpc_hafs_v18.json" 5d8bb91726e482839d0057633cb1973031e4d706fa9604eea5e08892f20ba140
fetch $GH/thetruetruth/quran-data-kfgqpc/main/hafs/font/hafs.18.woff2     "$RAW/fonts/hafs.18.woff2"          8c00e7a7d5f773bcfb1642fdcfba505dbd81975fef39f14718827a32d075020c
# Quranic Arabic Corpus morphology 0.4 (GPL; verbatim only) - used for lemma counts
fetch $GH/cltk/arabic_morphology_quranic-corpus/master/quranic-corpus-morphology-0.4.txt "$RAW/qac-morphology-0.4.txt" a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46
# Saheeh International mirror (display check only; publish from Quranpedia edition 1947)
fetch $GH/fawazahmed0/quran-api/1/editions/eng-ummmuhammad.json "$RAW/translations/eng-ummmuhammad.json" 5ac5aab3e152dd76b615d8748e2198c428f88cd3bd19d240b3e8feb89de6f28c
# Tafsir al-Tabari 10:5 (mirror; re-fetch from an approved source before publishing)
fetch $GH/spa5k/tafsir_api/main/tafsir/ar-tafsir-al-tabari/10/5.json "$RAW/tafsir/ar-tafsir-al-tabari-10-5.json" e7c00c5dcb650e058ee01e6df5d74fa9cbf12784ab999eba13b061102af66452
# Bukhari & Muslim (mirror). Muslim: use the `arabicnumber` field (Abd al-Baqi), NOT `hadithnumber`.
fetch $GH/fawazahmed0/hadith-api/1/editions/ara-bukhari.json "$RAW/hadith/ara-bukhari.json" e34a3402889ca378871da3c5984b7875c680920e93f1c8738ac7afe502179562
fetch $GH/fawazahmed0/hadith-api/1/editions/ara-muslim.json  "$RAW/hadith/ara-muslim.json"  194073b24090c5368e4d14a3f55c9e0ef144c7437bd7e5aa83aa4d2bc54a8ea0
fetch $GH/fawazahmed0/hadith-api/1/editions/eng-bukhari.json "$RAW/hadith/eng-bukhari.json" b3a10b8d50949e86cec82b0d323ce0eae3e2f713fa2f3daa5361638feb795988
fetch $GH/fawazahmed0/hadith-api/1/editions/eng-muslim.json  "$RAW/hadith/eng-muslim.json"  2ef51a2a1980fb91e395fbf1580cc9c9413297f54bb8cad271e1499417299488

python3 - <<'PY'
import json
q = json.load(open('data/raw/quran_kfgqpc_hafs_v18.json'))
assert len(q) == 6236, len(q)
print(f"ok: {len(q)} ayat in KFGQPC Hafs v18")
PY
# Library: tafsir and hadith collections (pinned commits, every file sha256-checked against data/library/manifest.json).
if command -v node >/dev/null 2>&1; then
  (cd .. && node scripts/library/fetch.mjs)
else
  echo "note: node not found — run 'node scripts/library/fetch.mjs' to download the library (deploy/install.sh does this in a container)"
fi
echo "done: raw inputs in prep/data/raw/"
