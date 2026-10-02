#!/usr/bin/env python3
"""Step 1: ALTO XML + page image  ->  web JPEG, thumbnail, page JSON (layout + ground truth), OCR line crops.

For every page listed in config.MANUSCRIPTS:
  * <OUT>/<ms>/pages/<page>.jpg   long side 2000 px, JPEG q82
  * <OUT>/<ms>/thumbs/<page>.jpg  long side 400 px
  * <OUT>/<ms>/pages/<page>.json  regions + lines, coordinates scaled to the web JPEG
  * <WORK>/crops/<page>/<line>.png  deskewed, polygon-masked, Otsu-binarised line crops at FULL source
                                    resolution (input for ocr_lines.mjs)
  * <WORK>/crops/index.json         list of crops for ocr_lines.mjs

ALTO notes (eScriptorium export, ALTO v4):
  <Tags><OtherTag ID="BT2" LABEL="Main"/> ...       region types referenced by TextBlock/@TAGREFS
  <TextBlock TAGREFS=..><Shape><Polygon POINTS="x y x y ..."/></Shape>
  <TextLine BASELINE="x y x y ..."><Shape><Polygon/></Shape><String CONTENT="ground truth"/></TextLine>
  Lines that were never assigned to a region sit in a block with ID "eSc_dummyblock_" and no TAGREFS;
  each such line gets its own synthetic region (polygon = line polygon) whose type is inferred from
  position (margin if the line centre lies outside the main text block, else other); source_type says so.
  Line ids/order follow reading order: title, main, catchword, marginal material, unassigned.
  Empty CONTENT = segmented but not transcribed (mostly marginal glosses) -> gt_text null, gt_status untranscribed.
  gt_status is 'reference_unverified' for copies whose source transcription is known to be derived from
  another copy (config gt_reliability == 'low'), else 'transcribed'.
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFilter, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402

Image.MAX_IMAGE_PIXELS = None


def pts(s):
    v = [float(t) for t in (s or '').replace(',', ' ').split()]
    return [(v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]


def bbox(p):
    xs, ys = [a for a, _ in p], [b for _, b in p]
    return min(xs), min(ys), max(xs), max(ys)


def parse_alto(path):
    root = ET.parse(path).getroot()
    ns = '{' + root.tag.split('}')[0][1:] + '}'
    tags = {t.get('ID'): t.get('LABEL') for t in root.iter(ns + 'OtherTag')}
    page = root.find(f'.//{ns}Page')
    W, H = int(float(page.get('WIDTH'))), int(float(page.get('HEIGHT')))
    blocks = []
    for b in root.iter(ns + 'TextBlock'):
        poly = b.find(f'{ns}Shape/{ns}Polygon')
        label = tags.get(b.get('TAGREFS')) if b.get('TAGREFS') else None
        lines = []
        for l in b.findall(ns + 'TextLine'):
            lp = l.find(f'{ns}Shape/{ns}Polygon')
            st = l.find(ns + 'String')
            txt = (st.get('CONTENT') if st is not None else '') or ''
            lines.append({
                'alto_id': l.get('ID'),
                'polygon': pts(lp.get('POINTS')) if lp is not None else [],
                'baseline': pts(l.get('BASELINE')),
                'text': ' '.join(txt.split()),
            })
        blocks.append({'alto_id': b.get('ID'), 'label': label,
                       'polygon': pts(poly.get('POINTS')) if poly is not None else [], 'lines': lines})
    return W, H, tags, blocks


def inside(pt, box, pad=0):
    x, y = pt
    return box[0] - pad <= x <= box[2] + pad and box[1] - pad <= y <= box[3] + pad


def centroid(p):
    return sum(a for a, _ in p) / len(p), sum(b for _, b in p) / len(p)


def save_jpeg(im, path, long_side):
    im = im.copy()
    s = long_side / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(path, 'JPEG', quality=C.JPEG_QUALITY, optimize=True, progressive=True)
    return im.size


def line_crop(gray, bg, poly, baseline, pad=6):
    """Polygon-masked, baseline-deskewed crop of one line at source resolution."""
    x0, y0, x1, y1 = bbox(poly)
    m = 40  # extra margin so rotation does not cut ink
    X0, Y0 = max(0, int(x0) - m), max(0, int(y0) - m)
    X1, Y1 = min(gray.width, int(math.ceil(x1)) + m), min(gray.height, int(math.ceil(y1)) + m)
    crop = gray.crop((X0, Y0, X1, Y1))
    mask = Image.new('L', crop.size, 0)
    ImageDraw.Draw(mask).polygon([(x - X0, y - Y0) for x, y in poly], fill=255)
    mask = mask.filter(ImageFilter.MaxFilter(2 * pad + 1))  # dilate by `pad` px
    hist = crop.histogram(mask)  # local paper tone = 75th percentile of the pixels inside the polygon
    tot, acc = sum(hist), 0
    for v in range(256):
        acc += hist[v]
        if acc >= tot * 0.75:
            bg = v
            break
    out = Image.new('L', crop.size, bg)
    out.paste(crop, (0, 0), mask)
    angle = 0.0
    if len(baseline) >= 2:
        (bx0, by0), (bx1, by1) = baseline[0], baseline[-1]
        if abs(bx1 - bx0) > 1:
            angle = math.degrees(math.atan2(by1 - by0, bx1 - bx0))
            if abs(angle) > 90:  # baseline drawn right-to-left
                angle = angle - 180 if angle > 0 else angle + 180
    if abs(angle) > 0.3:
        out = out.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=bg)
        mask = mask.rotate(angle, resample=Image.NEAREST, expand=True, fillcolor=0)
    bb = mask.getbbox()
    if bb:
        out = out.crop(bb)
    # tesseract wants some white border
    canvas = Image.new('L', (out.width + 2 * pad, out.height + 2 * pad), bg)
    canvas.paste(out, (pad, pad))
    # contrast stretch + global Otsu binarisation (small but consistent CER gain in a 45-line A/B test)
    canvas = ImageOps.autocontrast(canvas, cutoff=1)
    t = otsu(canvas)
    return canvas.point(lambda v: 255 if v > t else 0), round(angle, 2)


def otsu(im):
    h = im.histogram()
    tot, sum_t = sum(h), sum(i * h[i] for i in range(256))
    wb = sb = 0
    best, th = -1, 128
    for t in range(256):
        wb += h[t]
        if wb == 0:
            continue
        wf = tot - wb
        if wf == 0:
            break
        sb += t * h[t]
        v = wb * wf * (sb / wb - (sum_t - sb) / wf) ** 2
        if v > best:
            best, th = v, t
    return th


def build_page(ms, pg, idx):
    src = os.path.join(C.SOURCE, C.WORK_DIR, pg['src'])
    W, H, tags, blocks = parse_alto(src + '.xml')
    img = Image.open(f"{src}.{pg['img_ext']}")
    img.load()
    assert img.size == (W, H), (src, img.size, W, H)
    rgb = img.convert('RGB')
    gray = rgb.convert('L')
    hist = gray.histogram()  # background = brightest dominant tone (median of upper half)
    tot, acc, bg = sum(hist), 0, 255
    for v in range(256):
        acc += hist[v]
        if acc >= tot * 0.6:
            bg = v
            break

    gt_ok = 'reference_unverified' if ms.get('gt_reliability') == 'low' else 'transcribed'
    page_id = f"{ms['id']}_{idx:02d}"
    ms_dir = os.path.join(C.OUT, ms['id'])
    os.makedirs(f'{ms_dir}/pages', exist_ok=True)
    os.makedirs(f'{ms_dir}/thumbs', exist_ok=True)
    w, h = save_jpeg(rgb, f'{ms_dir}/pages/{page_id}.jpg', C.WEB_LONG_SIDE)
    save_jpeg(rgb, f'{ms_dir}/thumbs/{page_id}.jpg', C.THUMB_LONG_SIDE)
    sx, sy = w / W, h / H
    sc = lambda p: [[round(x * sx), round(y * sy)] for x, y in p]

    main_boxes = [bbox(b['polygon']) for b in blocks if b['label'] == 'Main' and b['polygon']]
    regions, lines, crops = [], [], []
    crop_dir = os.path.join(C.WORK, 'crops', page_id)
    os.makedirs(crop_dir, exist_ok=True)
    # reading order: title, main text, catchword, then marginal/other material; unassigned lines last
    prio = {'Title': 0, 'Main': 1, 'Catchword': 2, 'Marginal Material': 3}
    groups = []
    for b in blocks:
        if b['label']:
            groups.append((prio.get(b['label'], 4), b['label'], b['polygon'], b['alto_id'], b['lines']))
        else:  # eSc_dummyblock_: no region in the source -> one synthetic region per line, type from position
            for l in b['lines']:
                if len(l['polygon']) < 3:
                    continue
                c = centroid(l['polygon'])
                outside = main_boxes and not any(inside(c, mb, -15) for mb in main_boxes)
                groups.append((5, None, l['polygon'], b['alto_id'] or 'none', [l],
                               'margin' if outside else 'other'))
    groups.sort(key=lambda g: g[0])
    for g in groups:
        _, label, poly, alto_id, blines = g[:5]
        if not poly and not blines:
            continue
        if label:
            rtype, stype = C.REGION_TYPE.get(label, 'other'), label
        else:
            rtype = g[5]
            stype = '(none: line not assigned to any region in the source; type inferred from position)'
        if not poly:
            lp = [p for l in blines for p in l['polygon']]
            x0, y0, x1, y1 = bbox(lp)
            poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        rid = f'r{len(regions) + 1}'
        regions.append({'id': rid, 'type': rtype, 'polygon': sc(poly), 'source_type': stype,
                        'source_id': alto_id})
        for l in blines:
            if len(l['polygon']) < 3:
                continue
            lid = f'l{len(lines) + 1}'
            gt = l['text'] or None
            lines.append({'id': lid, 'region_id': rid, 'order': len(lines) + 1,
                          'polygon': sc(l['polygon']), 'baseline': sc(l['baseline']),
                          'gt_text': gt, 'gt_status': (gt_ok if gt else 'untranscribed'),
                          'source_id': l['alto_id']})
            crop, angle = line_crop(gray, bg, l['polygon'], l['baseline'])
            cpath = f'{crop_dir}/{lid}.png'
            crop.save(cpath)
            crops.append({'page_id': page_id, 'line_id': lid, 'path': cpath, 'deskew_deg': angle})

    page = {
        'page_id': page_id, 'manuscript_id': ms['id'], 'folio': None, 'label': pg['label'],
        'image': f'pages/{page_id}.jpg', 'thumb': f'thumbs/{page_id}.jpg', 'width': w, 'height': h,
        'source': {'repo': C.SOURCE_REPO, 'commit': C.SOURCE_COMMIT,
                   'alto': f"{C.WORK_DIR}/{pg['src']}.xml", 'image': f"{C.WORK_DIR}/{pg['src']}.{pg['img_ext']}",
                   'source_width': W, 'source_height': H, 'scale': round(sx, 6)},
        'gt_source': {'by': 'OpenITI arabic_ms_data (human transcription, eScriptorium)',
                      'reliability': ms.get('gt_reliability'), 'note': ms.get('gt_note')},
        'regions': regions, 'lines': lines,
    }
    with open(f'{ms_dir}/pages/{page_id}.json', 'w', encoding='utf-8') as f:
        json.dump(page, f, ensure_ascii=False, indent=1)
    n_gt = sum(1 for l in lines if l['gt_text'])
    print(f'{page_id}: {w}x{h}  regions={len(regions)} lines={len(lines)} transcribed={n_gt}')
    return crops


def main():
    all_crops = []
    for ms in C.MANUSCRIPTS:
        for i, pg in enumerate(ms['pages'], 1):
            all_crops += build_page(ms, pg, i)
    os.makedirs(os.path.join(C.WORK, 'crops'), exist_ok=True)
    with open(os.path.join(C.WORK, 'crops', 'index.json'), 'w') as f:
        json.dump(all_crops, f, indent=0)
    print(f'{len(all_crops)} line crops -> {C.WORK}/crops')


if __name__ == '__main__':
    main()
