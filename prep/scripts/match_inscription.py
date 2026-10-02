#!/usr/bin/env python3
"""Match Arabic text (an OCR'd inscription, or a quote typed by a user) to the Quran.

One component serves two jobs:
  * art track: photo of a calligraphy/inscription -> vision transcribes it -> this finds the verse(s)
  * R6 Q11: a user quotes a verse wrongly -> this finds the real verse and shows the difference

Output status:
  exact     the text appears verbatim (after normalisation) in the Quran; every location is listed
  near      a close but different passage exists (misquote, OCR noise, swapped words); show canonical text
  none      no passage is close enough -> say "not a Quranic verse we can identify", never guess
  too_short fewer than MIN_CHARS letters: common phrases (e.g. الله أكبر) can't identify a verse

Matching works on letters with spaces removed, so Uthmani spellings (يامريم / يا مريم) and OCR word
splits don't break it. Inputs: ../data/raw/quran_kfgqpc_hafs_v18.json (run ../fetch_sources.sh first).

usage: match_inscription.py "قل هو الله أحد الله الصمد"      (or --test to run the built-in cases)
"""
import bisect
import collections
import difflib
import json
import os
import re
import sys

RAW = os.path.dirname(os.path.abspath(__file__)) + '/../data/raw'
MIN_CHARS = 8           # letters (alef excluded); shorter text is a phrase, not an identifiable verse
NEAR_THRESHOLD = 0.82   # char-level similarity for a "near" match
PREFIXES = set('وفبل')  # a quote may start mid-token after a clitic (والقمر -> القمر)

MARKS = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ‌-‏]')


def norm(s):
    s = MARKS.sub('', s)
    s = re.sub('[إأآٱ]', 'ا', s)
    s = s.replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي').replace('ة', 'ه').replace('ء', '')
    s = re.sub('[^ء-ي ]', ' ', s)
    s = s.replace('ا', '')  # Uthmani writes many long-a as a dagger alef: السموات vs السماوات, الرحمن vs الرحمان
    return re.sub(r'\s+', ' ', s).strip()


def load():
    verses = json.load(open(f'{RAW}/quran_kfgqpc_hafs_v18.json'))
    toks, tok_key = [], []                      # global token stream across verse boundaries
    for r in verses:
        for t in norm(r['aya_text_emlaey']).split():
            toks.append(t)
            tok_key.append((r['sora'], r['aya_no']))
    starts, G = [], []                          # no-space string + char offset of each token
    off = 0
    for t in toks:
        starts.append(off)
        G.append(t)
        off += len(t)
    by_key = {(r['sora'], r['aya_no']): r for r in verses}
    return toks, tok_key, starts, ''.join(G), by_key


TOKS, TOK_KEY, STARTS, G, BY_KEY = load()
INDEX = collections.defaultdict(list)
for i, t in enumerate(TOKS):
    INDEX[t].append(i)


def tok_at(char_off):
    return bisect.bisect_right(STARTS, char_off) - 1


def span(t0, t1):
    keys = []
    for i in range(t0, t1 + 1):
        if not keys or keys[-1] != TOK_KEY[i]:
            keys.append(TOK_KEY[i])
    whole_first = t0 == 0 or TOK_KEY[t0 - 1] != keys[0]
    whole_last = t1 == len(TOKS) - 1 or TOK_KEY[t1 + 1] != keys[-1]
    return {
        'verses': [f'{s}:{a}' for s, a in keys],
        'partial': not (whole_first and whole_last),
        'sura_ar': BY_KEY[keys[0]]['sora_name_ar'],
        'canonical_uthmani': [BY_KEY[k]['aya_text'] for k in keys],
    }


def exact_hits(q):
    hits, i = [], G.find(q)
    while i != -1:
        t0 = tok_at(i)
        ok_start = i == STARTS[t0] or (i == STARTS[t0] + 1 and G[STARTS[t0]] in PREFIXES)
        end = i + len(q)
        t1 = tok_at(end - 1)
        ok_end = end == STARTS[t1] + len(TOKS[t1])
        if ok_start and ok_end:
            hits.append((t0, t1))
        i = G.find(q, i + 1)
    return hits


def bag_ratio(a, b):
    strip = lambda ts: collections.Counter(t[1:] if len(t) > 2 and t[0] in 'وف' else t for t in ts)
    ca, cb = strip(a), strip(b)
    return sum((ca & cb).values()) / max(sum(ca.values()), sum(cb.values()))


def near_hits(qtoks, q):
    votes = collections.Counter()
    for j, t in enumerate(qtoks):
        for pos in INDEX.get(t, ())[:2000]:
            votes[pos - j] += 1
    best = []
    n = len(qtoks)
    for start, _ in votes.most_common(40):
        for s in range(max(0, start - 2), start + 3):
            for length in range(max(1, n - 2), n + 3):
                e = min(len(TOKS) - 1, s + length - 1)
                w = ''.join(TOKS[s:e + 1])
                r = max(difflib.SequenceMatcher(None, q, w, autojunk=False).ratio(),
                        bag_ratio(qtoks, TOKS[s:e + 1]))  # catches swapped word order
                best.append((r, s, e))
    best.sort(reverse=True)
    out, seen = [], set()
    for r, s, e in best:
        if r < NEAR_THRESHOLD or (s, e) in seen or any(abs(s - s2) < 3 for _, s2, _ in out):
            continue
        seen.add((s, e))
        out.append((r, s, e))
        if len(out) == 3:
            break
    return out


def diff_words(qtoks, s, e):  
    sm = difflib.SequenceMatcher(None, qtoks, TOKS[s:e + 1], autojunk=False)
    return [{'op': op, 'given': ' '.join(qtoks[a1:a2]), 'quran': ' '.join(TOKS[s:e + 1][b1:b2])}
            for op, a1, a2, b1, b2 in sm.get_opcodes() if op != 'equal']


def match(text):
    nt = norm(text)
    q, qtoks = nt.replace(' ', ''), nt.split()
    if len(q) < MIN_CHARS:
        return {'status': 'too_short', 'input': text}
    hits = exact_hits(q)
    if hits:
        return {'status': 'exact', 'input': text, 'locations': [span(a, b) for a, b in hits]}
    near = near_hits(qtoks, q)
    if near:
        return {'status': 'near', 'input': text,
                'candidates': [dict(span(s, e), similarity=round(r, 3), differences=diff_words(qtoks, s, e))
                               for r, s, e in near]}
    return {'status': 'none', 'input': text}


TESTS = [  # (text, expected status, expected first verse key or None)
    ('قُلْ هُوَ اللَّهُ أَحَدٌ اللَّهُ الصَّمَدُ', 'exact', '112:1'),             # crosses a verse boundary
    ('هو الذي جعل الشمس ضياء والقمر نورا', 'exact', '10:5'),
    ('هو الذي جعل القمر ضياء والشمس نورا', 'near', '10:5'),                     # R6 Q11: swapped words
    ('الله لا إله إلا هو الحي القيوم', 'exact', '2:255'),                        # also 3:2 -> 2 locations
    ('بسم الله الرحمن الرحيم', 'exact', '1:1'),                                  # also inside 27:30
    ('ولا غالب إلا الله', 'none', None),                                          # Alhambra motto, not a verse
    ('لا إله إلا الله محمد رسول الله', 'none', None),                             # shahada: phrases, not one verse
    ('ما شاء الله لا قوة إلا بالله', 'exact', '18:39'),
    ('قل هو الله احد الله الصمد لم يلد ولم يولد', 'exact', '112:1'),             # OCR without hamza
    ('الله أكبر', 'too_short', None),
    ('النظافة من الإيمان', 'none', None),                                          # popular saying, not Quran
    ('إن الله وملائكته يصلون على النبي', 'exact', '33:56'),
    ('قال يا مريم أنى لك هذا', 'exact', '3:37'),
    ('الله نور السماوات والارض', 'exact', '24:35'),                               # modern spelling vs Uthmani السموات
    ('الله لا اله الا هو الحي القيم لا تاخذه سنة ولا نوم', 'near', '2:255'),    # OCR dropped a letter
]


def run_tests():
    bad = 0
    for text, want, key in TESTS:
        r = match(text)
        got_key = None
        if r['status'] == 'exact':
            got_key = r['locations'][0]['verses'][0]
            extra = f"  ({len(r['locations'])} location(s): " + ', '.join(
                '-'.join([l['verses'][0], l['verses'][-1]]) if len(l['verses']) > 1 else l['verses'][0]
                for l in r['locations']) + ')'
        elif r['status'] == 'near':
            c = r['candidates'][0]
            got_key = c['verses'][0]
            extra = f"  (sim {c['similarity']}, diff {c['differences']})"
        else:
            extra = ''
        ok = r['status'] == want and (key is None or got_key == key)
        bad += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {r['status']:9} {got_key or '-':7} {text}{extra}")
    print(f"\n{len(TESTS) - bad}/{len(TESTS)} passed")
    return bad


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        sys.exit(1 if run_tests() else 0)
    print(json.dumps(match(' '.join(sys.argv[1:])), ensure_ascii=False, indent=1))
