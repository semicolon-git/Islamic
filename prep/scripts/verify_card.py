#!/usr/bin/env python3
"""Deterministic pre-publish gate for a card JSON (S8 'fidelity' + 'counts from code' checks).
usage: verify_card.py card.json [...]   exit 1 if any card has FAIL."""
import json, re, sys, os, collections
D = os.path.dirname(os.path.abspath(__file__)) + '/../data'
RAW = D + '/raw'
K={(r['sora'],r['aya_no']):r['aya_text'] for r in json.load(open(f'{RAW}/quran_kfgqpc_hafs_v18.json'))}
LEM=collections.defaultdict(set)
for line in open(f'{RAW}/qac-morphology-0.4.txt',encoding='utf-8'):
    if line.startswith('('):
        loc,_,_,feat=line.rstrip('\n').split('\t'); s,a,w,_=map(int,loc.strip('()').split(':'))
        m=re.search(r'LEM:([^|]+)',feat)
        if m: LEM[m.group(1)].add((s,a,w))
BANNED=[r'scientific miracle',r'\bprove[sd]?\b',r'modern science (confirms|discovered)',r'إعجاز علمي',r'أثبت العلم',r'numerical miracle']
APPROVED_HADITH_COLL={'bukhari','muslim'}            # Sunan allowed only with grade+grader+dorar url (R3)
SUNAN={'abudawud','tirmidhi','nasai','ibnmajah'}
def check(card):
    out=[]; P=lambda ok,msg: out.append(('PASS' if ok else 'FAIL', msg))
    ev=set()
    for v in card.get('verses',[]):
        s,a=map(int,v['key'].split(':')); ev.add('v:'+v['key'])
        P(K.get((s,a))==v.get('arabic'), f"verse {v['key']} Arabic == KFGQPC v18 exact")
        P(bool(v.get('translation',{}).get('edition_id')), f"verse {v['key']} translation has edition_id")
    c=card.get('count')
    if c:
        toks=set().union(*(LEM.get(l,set()) for l in c['lemmas']))
        P(len(toks)==c['tokens'] and len({(s,a) for s,a,_ in toks})==c['verses'], f"count recomputed {len(toks)} tokens == stored {c['tokens']}")
    for h in card.get('hadith',[]):
        ev.add(f"h:{h['collection']}:{h['number']}")
        P(bool(h.get('grade')) and bool(h.get('grader')), f"hadith {h['collection']} {h['number']} has grade+grader")
        if h['collection'] in SUNAN: P(bool(h.get('grade_source_url')), f"Sunan hadith {h['number']} has dorar grade_source_url")
        elif h['collection'] not in APPROVED_HADITH_COLL: P(False, f"hadith collection {h['collection']} outside R3 list")
    for t in card.get('tafsir',[]):
        ev.add(f"t:{t['source_id']}:{t['verse_key']}"); P(t.get('is_commentator_words') is True, f"tafsir {t['source_id']} labelled as commentator's words")
    for cl in card.get('claims',[]):
        P(bool(cl.get('evidence')) and all(e in ev for e in cl['evidence']), f"claim {cl['id']} grounded in card evidence")
        for b in BANNED:
            if re.search(b, cl.get('text_en','')+cl.get('text_ar',''), re.I): P(False, f"claim {cl['id']} uses banned framing /{b}/")
    if card.get('review',{}).get('stage')=='published':
        P(bool(card['review'].get('reviewer_id')) and bool(card['review'].get('institution_id')), 'published card has reviewer+institution')
    return out
bad=0
for f in sys.argv[1:]:
    res=check(json.load(open(f)))
    for st,msg in res: print(f"{st}\t{os.path.basename(f)}\t{msg}")
    bad+=sum(1 for st,_ in res if st=='FAIL')
sys.exit(1 if bad else 0)
