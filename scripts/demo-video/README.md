# Demo video

The latest cut is committed at [`docs/demo/signs-around-you-demo.mp4`](../../docs/demo/signs-around-you-demo.mp4) (1080p, 3:07).

This folder produces a ~3-minute 1080p demo of the **real, running platform**. A script drives the app; nothing is mocked up or generated. The app runs inside a branded stage with a phone frame and a desktop frame, and the stage adds animated bilingual captions, a cursor, click ripples and highlight rings.

```bash
npm run build
DATA_DIR=.data/demo-video npx tsx scripts/seed.ts --reset          # fresh demo data (the film changes it)
DATA_DIR=.data/demo-video INSECURE_COOKIES=1 npx next start -p 3400 &
npx tsx scripts/demo-video/record.mts                              # → out/demo/signs-around-you-demo.mp4
```

- **Before re-recording**, reseed the database. The film approves a card, keys a hard word, decides a dispute and confirms a Quran quotation.
- **Concept images:** run `npm run assets:fetch` first on a normal network, so the tiles show their images instead of the coloured fallbacks.
- **Capture:** Chrome screencast frames go to `out/demo/frames`, and ffmpeg encodes them at a constant 30 fps (H.264, CRF 18).
- **Scenes:** edit `film()` in `record.mts`. The stage API (`S.mode`, `S.caption`, `S.ring`, `S.cursor`, …) lives in `stage.html`.
- **Narration:** see `voiceover.md`. The video is silent by design.
