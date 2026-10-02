#!/usr/bin/env python3
"""Step 3: merge the Tesseract draft into the page JSONs, score it, scan for Quran quotations,
align overlapping passages between copies (collation), and write manifests + index + stats.

Inputs : <OUT>/<ms>/pages/*.json (build_pages.py), <WORK>/ocr.json (ocr_lines.mjs),
         KFGQPC Quran via prep/scripts/match_inscription.py (run prep/fetch_sources.sh once).
Outputs: page JSONs updated in place; <OUT>/<ms>/manifest.json; <OUT>/index.json;
         <OUT>/collation.json; <OUT>/stats.json
"""
import collections
import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402

sys.path.insert(0, C.QURAN_MATCHER)
import match_inscription as MI  # noqa: E402  (loads the KFGQPC text on import)

DRAFT_LABEL = 'Tesseract (open-source OCR) draft'
DRAFT_LABEL_AR = 'مسودة آلية (Tesseract، تعرّف ضوئي مفتوح المصدر)'

# ---------------------------------------------------------------- normalisation / CER
MARKS = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]')  # harakat, tatweel...
NON_ARABIC = re.compile('[^ء-غف-يٱ-ۓ ]')


def norm_cer(s):
    """Diacritics + tatweel stripped, punctuation/separators (• ⊙ ، digits, Latin) removed, spaces collapsed."""
    s = MARKS.sub('', s or '')
    s = NON_ARABIC.sub(' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def fold(s):
    """Extra letter folding for the lenient score: alef/hamza seats, ya/alef maqsura, ta marbuta."""
    s = re.sub('[إأآٱ]', 'ا', s)
    return s.replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')


def lev(a, b):
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def words_norm(s):
    return fold(norm_cer(s)).split()


# ---------------------------------------------------------------- Quran scan
def quran_scan(page):
    """Exact/near hits for every GT line and every 2-line window (same region), plus exact hits for
    sub-line word windows of >= 5 words (a lexicon quotes verses inside a line)."""
    hits, seen = [], set()
    L = [l for l in page['lines'] if l['gt_text']]

    def add(kind, line_ids, text, r):
        if r['status'] == 'exact':
            for loc in r['locations']:
                key = (tuple(loc['verses']), tuple(line_ids))
                if key not in seen:
                    seen.add(key)
                    hits.append({'kind': kind, 'status': 'exact', 'line_ids': line_ids, 'text': text,
                                 'verses': loc['verses'], 'partial_verse': loc['partial'], 'sura_ar': loc['sura_ar'],
                                 'canonical_uthmani': loc['canonical_uthmani']})
        elif r['status'] == 'near':
            for c in r['candidates']:
                key = (tuple(c['verses']), tuple(line_ids))
                if key not in seen:
                    seen.add(key)
                    hits.append({'kind': kind, 'status': 'near', 'similarity': c['similarity'], 'line_ids': line_ids,
                                 'text': text, 'verses': c['verses'], 'sura_ar': c['sura_ar'],
                                 'canonical_uthmani': c['canonical_uthmani'], 'differences': c['differences']})

    for l in L:
        add('line', [l['id']], l['gt_text'], MI.match(l['gt_text']))
    for a, b in zip(L, L[1:]):
        if a['region_id'] == b['region_id']:
            add('two_lines', [a['id'], b['id']], a['gt_text'] + ' ' + b['gt_text'], MI.match(a['gt_text'] + ' ' + b['gt_text']))
    # embedded quotations: word windows over the running text (crossing line breaks), exact only
    toks = [(w, l['id']) for l in L for w in l['gt_text'].split()]
    for n in range(5, 13):
        for i in range(len(toks) - n + 1):
            seg = toks[i:i + n]
            text = ' '.join(w for w, _ in seg)
            q = MI.norm(text).replace(' ', '')
            if len(q) < 14:
                continue
            for t0, t1 in MI.exact_hits(q):
                loc = MI.span(t0, t1)
                ids = sorted({lid for _, lid in seg}, key=lambda x: int(x[1:]))
                key = (tuple(loc['verses']), tuple(ids))
                if key in seen:
                    continue
                seen.add(key)
                hits.append({'kind': f'window_{n}w', 'status': 'exact', 'line_ids': ids, 'text': text,
                             'verses': loc['verses'], 'partial_verse': loc['partial'], 'sura_ar': loc['sura_ar'],
                             'canonical_uthmani': loc['canonical_uthmani']})
    # keep only the longest window per (verse, overlapping position)
    hits.sort(key=lambda h: -len(h['text']))
    kept = []
    for h in hits:
        if h['kind'].startswith('window') and any(
                k['kind'].startswith('window') and set(k['verses']) == set(h['verses']) and set(h['line_ids']) <= set(k['line_ids'])
                and MI.norm(h['text']).replace(' ', '') in MI.norm(k['text']).replace(' ', '') for k in kept):
            continue
        kept.append(h)
    return kept


# ---------------------------------------------------------------- collation
def page_words(page):
    out = []
    for l in page['lines']:
        if l['gt_text'] and l['region_id'] in {r['id'] for r in page['regions'] if r['type'] in ('main', 'title')}:
            raw = l['gt_text'].split()
            for w in raw:
                n = fold(norm_cer(w)).replace(' ', '')
                if n:
                    out.append((n, w, l['id']))
    return out


def collate(pa, pb, min_block=3):
    A, B = page_words(pa), page_words(pb)
    sm = difflib.SequenceMatcher(None, [w for w, _, _ in A], [w for w, _, _ in B], autojunk=False)
    blocks = [m for m in sm.get_matching_blocks() if m.size >= min_block]
    if not blocks or sum(m.size for m in blocks) < 25:
        return None
    a0, a1 = blocks[0].a, blocks[-1].a + blocks[-1].size
    b0, b1 = blocks[0].b, blocks[-1].b + blocks[-1].size
    sub = difflib.SequenceMatcher(None, [w for w, _, _ in A[a0:a1]], [w for w, _, _ in B[b0:b1]], autojunk=False)
    variants, same = [], 0
    for op, i1, i2, j1, j2 in sub.get_opcodes():
        if op == 'equal':
            same += i2 - i1
            continue
        variants.append({'op': op,
                         'a': ' '.join(w for _, w, _ in A[a0 + i1:a0 + i2]),
                         'b': ' '.join(w for _, w, _ in B[b0 + j1:b0 + j2]),
                         'a_lines': sorted({l for _, _, l in A[a0 + i1:a0 + i2]}, key=lambda x: int(x[1:])),
                         'b_lines': sorted({l for _, _, l in B[b0 + j1:b0 + j2]}, key=lambda x: int(x[1:]))})
    raw_a = ' '.join(w for _, w, _ in A[a0:a1])
    raw_b = ' '.join(w for _, w, _ in B[b0:b1])
    return {
        'a': {'page_id': pa['page_id'], 'manuscript_id': pa['manuscript_id'], 'from_line': A[a0][2], 'to_line': A[a1 - 1][2],
              'words': a1 - a0, 'start_text': raw_a[:60], 'end_text': raw_a[-60:]},
        'b': {'page_id': pb['page_id'], 'manuscript_id': pb['manuscript_id'], 'from_line': B[b0][2], 'to_line': B[b1 - 1][2],
              'words': b1 - b0, 'start_text': raw_b[:60], 'end_text': raw_b[-60:]},
        'shared_words': same,
        'word_agreement': round(2 * same / ((a1 - a0) + (b1 - b0)), 3),
        'gt_identical_incl_diacritics': round(difflib.SequenceMatcher(None, raw_a, raw_b, autojunk=False).ratio(), 3),
        'n_variants': len(variants),
        'variants': variants,
    }


# ---------------------------------------------------------------- main
def main():
    ocr = json.load(open(os.path.join(C.WORK, 'ocr.json'), encoding='utf-8'))
    engine, OCR = ocr['engine'], ocr['lines']
    stats = {'engine': engine, 'draft_label': DRAFT_LABEL, 'normalisation':
             'CER = Levenshtein(draft, gt) / len(gt) on text with diacritics/tatweel stripped, punctuation and '
             'separators removed, whitespace collapsed (spaces count). cer_folded additionally folds alef/hamza '
             'seats, alef maqsura and ta marbuta. chance_baseline_cer scores every line against the draft of a '
             'different line of the same copy: a draft is only informative where cer is clearly below it.', 'pages': {}, 'manuscripts': {}}
    pages_by_ms = {}
    all_q = []
    tot = {'e': 0, 'n': 0, 'ef': 0, 'nf': 0, 'lines': 0}
    for ms in C.MANUSCRIPTS:
        mdir = os.path.join(C.OUT, ms['id'])
        msum = {'e': 0, 'n': 0, 'ef': 0, 'nf': 0}
        pages_by_ms[ms['id']] = []
        for i in range(1, len(ms['pages']) + 1):
            pid = f"{ms['id']}_{i:02d}"
            path = f'{mdir}/pages/{pid}.json'
            page = json.load(open(path, encoding='utf-8'))
            pe = pn = pef = pnf = 0
            for l in page['lines']:
                o = OCR.get(f'{pid}/{l["id"]}', {'text': '', 'conf': 0, 'words': []})
                l['draft_text'] = o['text']
                l['draft_conf'] = o['conf']
                l['draft_words'] = [{'t': w['t'], 'conf': w['conf']} for w in o['words']]
                if l['gt_text']:
                    g, d = norm_cer(l['gt_text']), norm_cer(o['text'])
                    e = lev(d, g)
                    gf, df = fold(g), fold(d)
                    ef = lev(df, gf)
                    l['cer'] = round(e / max(1, len(g)), 4)
                    l['cer_folded'] = round(ef / max(1, len(gf)), 4)
                    pe, pn, pef, pnf = pe + e, pn + len(g), pef + ef, pnf + len(gf)
                    tot['lines'] += 1
                else:
                    l['cer'] = l['cer_folded'] = None
            q = quran_scan(page)
            page['draft'] = {'label': DRAFT_LABEL, 'label_ar': DRAFT_LABEL_AR, 'engine': engine,
                             'line_crop': 'source-resolution crop of the line polygon (dilated 6 px, outside masked to '
                                          'paper tone), rotated by the baseline angle, autocontrast + Otsu binarisation, 6 px padding',
                             'cer_page': round(pe / max(1, pn), 4), 'cer_folded_page': round(pef / max(1, pnf), 4),
                             'gt_chars': pn, 'note': 'Draft only - expected to be poor on manuscripts. Ground truth '
                             '(gt_text) is the human transcription from OpenITI arabic_ms_data.'}
            page['quran_hits'] = q
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(page, f, ensure_ascii=False, indent=1)
            for h in q:
                all_q.append(dict(h, page_id=pid))
            gw = [w for l in page['lines'] if l['gt_text'] for w in words_norm(l['gt_text'])]
            dw = collections.Counter(w for l in page['lines'] if l['gt_text'] for w in words_norm(l['draft_text']))
            hit = sum(min(c, dw[w]) for w, c in collections.Counter(gw).items())
            page['draft']['gt_words_found'] = round(hit / max(1, len(gw)), 4)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(page, f, ensure_ascii=False, indent=1)
            stats['pages'][pid] = {'cer': page['draft']['cer_page'], 'cer_folded': page['draft']['cer_folded_page'],
                                   'gt_words_found_in_draft': page['draft']['gt_words_found'],
                                   'gt_chars': pn, 'lines': len(page['lines']),
                                   'transcribed_lines': sum(1 for l in page['lines'] if l['gt_text']),
                                   'mean_line_cer': round(sum(l['cer'] for l in page['lines'] if l['cer'] is not None) /
                                                          max(1, sum(1 for l in page['lines'] if l['cer'] is not None)), 4),
                                   'lines_cer_below_0.3': sum(1 for l in page['lines'] if l['cer'] is not None and l['cer'] < 0.3),
                                   'quran_hits': len(q)}
            for k, v in (('e', pe), ('n', pn), ('ef', pef), ('nf', pnf)):
                msum[k] += v
                tot[k] += v
            pages_by_ms[ms['id']].append(page)
            print(f"{pid}: CER {page['draft']['cer_page']:.3f} (folded {page['draft']['cer_folded_page']:.3f}) "
                  f"over {pn} chars; quran hits {len(q)}")
        # chance control: score each line against the draft of a DIFFERENT line (shift by 7) of the same copy
        TL = [l for pg in pages_by_ms[ms['id']] for l in pg['lines'] if l['gt_text']]
        ce = sum(lev(norm_cer(TL[(k + 7) % len(TL)]['draft_text']), norm_cer(l['gt_text'])) for k, l in enumerate(TL))
        stats['manuscripts'][ms['id']] = {'chance_baseline_cer': round(ce / max(1, msum['n']), 4),
                                          'cer': round(msum['e'] / max(1, msum['n']), 4),
                                          'cer_folded': round(msum['ef'] / max(1, msum['nf']), 4), 'gt_chars': msum['n']}
    stats['overall'] = {'cer': round(tot['e'] / tot['n'], 4), 'cer_folded': round(tot['ef'] / tot['nf'], 4),
                        'gt_chars': tot['n'], 'transcribed_lines': tot['lines'],
                        'chars_right_approx': round(1 - tot['e'] / tot['n'], 4)}
    stats['quran_hits'] = all_q

    # ---- collation between copies
    coll = []
    ids = [m['id'] for m in C.MANUSCRIPTS]
    for x in range(len(ids)):
        for y in range(x + 1, len(ids)):
            for pa in pages_by_ms[ids[x]]:
                for pb in pages_by_ms[ids[y]]:
                    c = collate(pa, pb)
                    if c:
                        coll.append(c)
    coll.sort(key=lambda c: -c['shared_words'])
    with open(os.path.join(C.OUT, 'collation.json'), 'w', encoding='utf-8') as f:
        json.dump({'description': 'Passages that occur in more than one copy (same lexicon entries), aligned word by '
                                  'word on normalised ground-truth text of the main-text lines. "variants" are the '
                                  'differences between the two transcriptions inside the shared span (real copy variants '
                                  'AND transcription noise). gt_identical_incl_diacritics near 1.0 means the two ground '
                                  'truths are character-identical - see README caveat.', 'pairs': coll},
                  f, ensure_ascii=False, indent=1)
    stats['collation'] = [{k: c[k] for k in ('shared_words', 'word_agreement', 'gt_identical_incl_diacritics', 'n_variants')} |
                          {'a': f"{c['a']['page_id']} {c['a']['from_line']}-{c['a']['to_line']}",
                           'b': f"{c['b']['page_id']} {c['b']['from_line']}-{c['b']['to_line']}"} for c in coll]

    # ---- manifests + index
    index = {'corpus': 'Signs Around You - manuscript transcription demo corpus',
             'work': C.WORK_COMMON, 'source': {'repo': C.SOURCE_REPO, 'commit': C.SOURCE_COMMIT,
                                                'licence_note': 'Layout + ground-truth transcriptions come from the '
                                                'OpenITI arabic_ms_data repository (no licence file in the repo at this '
                                                'commit - see README). Page images: see each manuscript\'s licence.'},
             'draft_engine': DRAFT_LABEL, 'collation': 'collation.json', 'stats': 'stats.json', 'manuscripts': []}
    for ms in C.MANUSCRIPTS:
        meta = {k: v for k, v in ms.items() if k != 'pages'}
        meta = {'id': meta.pop('id'), **C.WORK_COMMON, **meta}
        plist = []
        for page in pages_by_ms[ms['id']]:
            plist.append({'page_id': page['page_id'], 'label': page['label'], 'folio': page['folio'],
                          'image': f"{ms['id']}/{page['image']}", 'thumb': f"{ms['id']}/{page['thumb']}",
                          'json': f"{ms['id']}/pages/{page['page_id']}.json", 'width': page['width'], 'height': page['height'],
                          'lines': len(page['lines']), 'transcribed_lines': sum(1 for l in page['lines'] if l['gt_text']),
                          'region_types': sorted({r['type'] for r in page['regions']}),
                          'draft_cer': page['draft']['cer_page'], 'quran_hits': len(page['quran_hits']),
                          'source_alto': page['source']['alto']})
        man = dict(meta, pages=[dict(p, image=p['image'].split('/', 1)[1], thumb=p['thumb'].split('/', 1)[1],
                                     json=p['json'].split('/', 1)[1]) for p in plist],
                   draft_cer=stats['manuscripts'][ms['id']]['cer'])
        with open(os.path.join(C.OUT, ms['id'], 'manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(man, f, ensure_ascii=False, indent=1)
        index['manuscripts'].append(dict(meta, manifest=f"{ms['id']}/manifest.json", pages=plist))
    with open(os.path.join(C.OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    with open(os.path.join(C.OUT, 'stats.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)
    print('overall', stats['overall'])
    print('quran hits', len(all_q))
    for c in stats['collation']:
        print('collation', c)


if __name__ == '__main__':
    main()
