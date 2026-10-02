#!/usr/bin/env python3
"""Visual QA: draw region polygons, line polygons and baselines on the web JPEGs.

usage: render_check.py [page_id ...]      (default: every page)  -> <WORK>/check/<page_id>.png
Colours: region main=blue margin=orange other=grey; line polygon=green (transcribed) / red (untranscribed);
baseline=magenta; line id printed at the line's right end (Arabic lines start on the right).
"""
import glob
import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402

RC = {'main': (30, 90, 255), 'margin': (255, 140, 0), 'title': (160, 0, 200), 'catchword': (0, 160, 160)}


def render(path):
    p = json.load(open(path, encoding='utf-8'))
    im = Image.open(os.path.join(os.path.dirname(os.path.dirname(path)), p['image'])).convert('RGB')
    d = ImageDraw.Draw(im, 'RGBA')
    for r in p['regions']:
        d.polygon([tuple(x) for x in r['polygon']], outline=RC.get(r['type'], (128, 128, 128)) + (255,), width=4)
    for l in p['lines']:
        col = (0, 170, 0) if l['gt_text'] else (220, 0, 0)
        d.polygon([tuple(x) for x in l['polygon']], outline=col + (255,), fill=col + (28,), width=2)
        if len(l['baseline']) >= 2:
            d.line([tuple(x) for x in l['baseline']], fill=(230, 0, 230, 255), width=2)
        xs = [x for x, _ in l['polygon']]
        ys = [y for _, y in l['polygon']]
        d.text((max(xs) + 3, (min(ys) + max(ys)) / 2 - 5), l['id'], fill=(200, 0, 0, 255))
    out = os.path.join(C.WORK, 'check')
    os.makedirs(out, exist_ok=True)
    im.save(f"{out}/{p['page_id']}.png")
    print(f"{out}/{p['page_id']}.png")


if __name__ == '__main__':
    want = set(sys.argv[1:])
    for f in sorted(glob.glob(os.path.join(C.OUT, '*', 'pages', '*.json'))):
        if not want or os.path.basename(f)[:-5] in want:
            render(f)
