# Arabic promo film (≈2:15, 1080p)

A narrated Arabic film about the platform's impact and use cases. Every screen in it is the real app, recorded in Arabic.

| Step | Tool | Output |
|---|---|---|
| Script | Proofread and fully vowelized for the voice. Captions are split at ≤ 42 characters. | `film.json` → `scenes[].captions` |
| Voice | ElevenLabs voice "Harrison", via Higgsfield `text2speech_v2`. Each scene is generated, then transcribed with faster-whisper large-v3; only takes that match the script word for word are kept. | `film.json` → `scenes[].audio` |
| B-roll | 10 cinematic shots from Higgsfield Cinema Studio 3.0. They contain no text or calligraphy, no mushaf pages, and everyone is modestly dressed. | `film.json` → `broll` |
| Screens | `record.mjs` drives the app with Playwright and adds taps, rings and Arabic labels. The camera shot uses Chromium's fake camera, so the viewfinder shows a real photo. Shots only read data and never change it. | `docs/demo/promo-ar/footage/*.mp4` |
| Edit | `assemble.py` builds the film (details below). | `signs-around-you-promo-ar.mp4` |

What `assemble.py` does:
1. It re-checks every narration take after the tempo change, and stops if any word differs from the script.
2. It times the captions from the transcript's word timestamps.
3. It renders all Arabic text with Chromium (`render.mjs`), never with ffmpeg `drawtext`.
4. It fits each scene's picture to its narration.

The end card shows Fussilat 41:53 in the KFGQPC Hafs font, using the exact text from the app's Quran data. The verse is shown, not recited. If the font isn't active, the build fails.

```bash
# screens (APP_URL may be the live site; the shots never write)
APP_URL=http://localhost:3400 CRF=20 node scripts/promo-ar/record.mjs sources badges sky astrolabe portal
APP_URL=https://… FAKE_CAMERA=camera.y4m node scripts/promo-ar/record.mjs camera

# film (needs ffmpeg, faster-whisper, Playwright/Chromium and internet for fonts and media)
python3 scripts/promo-ar/assemble.py scripts/promo-ar/film.json out/film            # full build
python3 scripts/promo-ar/assemble.py scripts/promo-ar/film.json out/film --preview  # layers only, no transcription
```
