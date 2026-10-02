#!/usr/bin/env python3
"""Count 'moon' (qamar) in the Quran three ways, so the number on the card states its rule.
Inputs: ../data/raw/quran_kfgqpc_hafs_v18.json, ../data/raw/qac-morphology-0.4.txt (run ../fetch_sources.sh first)."""
import collections, json, os, re

RAW = os.path.dirname(os.path.abspath(__file__)) + '/../data/raw'
DIAC = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]')

def clean(t):
    t = DIAC.sub('', t).replace('ٱ', 'ا')
    return re.sub('[أإآ]', 'ا', t)

tokens = []
for r in json.load(open(f'{RAW}/quran_kfgqpc_hafs_v18.json')):
    for w in clean(r['aya_text_emlaey']).split():
        tokens.append((r['sora'], r['aya_no'], w))

exact = [t for t in tokens if t[2] == 'القمر']
any_form = [t for t in tokens if 'قمر' in t[2]]
verses = sorted({(s, a) for s, a, _ in any_form})
print(f"exact standalone token 'القمر': {len(exact)}")
print(f"any token containing 'قمر': {len(any_form)} tokens in {len(verses)} verses")
print('forms:', dict(collections.Counter(t[2] for t in any_form)))
print('verses:', ' '.join(f'{s}:{a}' for s, a in verses))

lem = set()
for line in open(f'{RAW}/qac-morphology-0.4.txt', encoding='utf-8'):
    if line.startswith('(') and 'LEM:qamar' in line:
        s, a, w, _ = map(int, line.split('\t')[0].strip('()').split(':'))
        lem.add((s, a, w))
print(f"QAC 0.4 lemma qamar: {len(lem)} word tokens in {len({(s, a) for s, a, _ in lem})} verses  <- rule qac-lemma-word-token@0.4")
