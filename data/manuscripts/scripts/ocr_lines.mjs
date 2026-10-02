// Step 2: Tesseract (open-source OCR) draft for every line crop produced by build_pages.py.
//
//   cd scripts && npm install && node ocr_lines.mjs
//
// env: MS_WORK   scratch dir holding crops/index.json (default /home/user/scratch/msprep/work)
//      TESSDATA  dir containing ara.traineddata (tesseract-ocr/tessdata_best; default ./tessdata)
//                 (tesseract.js's default CDN, cdn.jsdelivr.net, is blocked here, so a local model is used)
//      OCR_WORKERS  parallel workers (default 4)
// Output: <MS_WORK>/ocr.json  { "<page_id>/<line_id>": {text, conf, words:[{t, conf}], psm, engine} }
import { createWorker, OEM, PSM } from 'tesseract.js';
import fs from 'node:fs';
import path from 'node:path';

const WORK = process.env.MS_WORK || '/home/user/scratch/msprep/work';
const TESSDATA = process.env.TESSDATA || new URL('../tessdata', import.meta.url).pathname;
const N = Number(process.env.OCR_WORKERS || 4);
const crops = JSON.parse(fs.readFileSync(path.join(WORK, 'crops', 'index.json'), 'utf8'));
const outPath = path.join(WORK, 'ocr.json');
const out = {};
const cache = path.join(WORK, 'tesseract-cache');
fs.mkdirSync(cache, { recursive: true });

async function makeWorker() {
  const w = await createWorker('ara', OEM.LSTM_ONLY, { langPath: TESSDATA, gzip: false, cachePath: cache });
  await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: '1' });
  return w;
}

const queue = crops.slice();
let done = 0;
async function run() {
  const w = await makeWorker();
  for (let c = queue.shift(); c; c = queue.shift()) {
    const r = await w.recognize(c.path, {}, { text: true, blocks: true });
    const words = (r.data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
    out[`${c.page_id}/${c.line_id}`] = {
      text: r.data.text.replace(/\s+/g, ' ').trim(),
      conf: Math.round(r.data.confidence * 10) / 10,
      words: words.map(x => ({ t: x.text, conf: Math.round(x.confidence * 10) / 10 })),
      psm: 'single_line', deskew_deg: c.deskew_deg,
    };
    if (++done % 50 === 0) console.log(`${done}/${crops.length}`);
  }
  await w.terminate();
}
const t0 = Date.now();
await Promise.all(Array.from({ length: N }, run));
const engine = { name: 'tesseract.js', version: JSON.parse(fs.readFileSync(new URL('./node_modules/tesseract.js/package.json', import.meta.url))).version,
  model: 'ara.traineddata (local file, LSTM)', model_path: path.join(TESSDATA, 'ara.traineddata'), oem: 'LSTM_ONLY', psm: 'SINGLE_LINE (7)' };
fs.writeFileSync(outPath, JSON.stringify({ engine, lines: out }, null, 0));
console.log(`OCR ${done} lines in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outPath}`);
