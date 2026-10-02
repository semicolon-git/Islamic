#!/usr/bin/env python3
"""Builds card_example_moon.json from local verified data (texts injected by code, never typed by an LLM)."""
import json, hashlib, os
D = os.path.dirname(os.path.abspath(__file__)) + '/../data'
RAW = D + '/raw'
K={(r['sora'],r['aya_no']):r for r in json.load(open(f'{RAW}/quran_kfgqpc_hafs_v18.json'))}
EN={(r['chapter'],r['verse']):r['text'] for r in json.load(open(f'{RAW}/translations/eng-ummmuhammad.json'))['quran']}
C={c['id']:c for c in json.load(open(f'{D}/concepts_verified.json'))}
H={(h['collection'],str(h.get('number') or h.get('number_abd_al_baqi'))):h for h in json.load(open(f'{D}/hadith_seed_verified.json'))}
sha=lambda s: hashlib.sha256(s.encode()).hexdigest()[:16]
def verse(key,role):
    s,a=map(int,key.split(':')); r=K[(s,a)]
    return {"key":key,"role":role,"arabic":r['aya_text'],"arabic_sha":sha(r['aya_text']),"text_source":"kfgqpc-hafs-v18",
            "translation":{"lang":"en","edition_id":"quranenc:english_saheeh","text":EN[(s,a)],
                           "text_status":"FROM-MIRROR(fawazahmed0 eng-ummmuhammad) - replace with QuranEnc/Quranpedia fetch before publish"}}
tabari=json.load(open(f'{RAW}/tafsir/ar-tafsir-al-tabari-10-5.json'))['text']
ex="هو الذي أضاء الشمسَ وأنار القمر= ﴿وقدّره منازل﴾ ، يقول: قضاه فسوّاه منازلَ، لا يجاوزها ولا يقصر دُونها، على حالٍ واحدةٍ أبدًا."
assert ex in tabari, 'excerpt must be verbatim'
card={
 "id":"card.nature.moon.v1","track":"nature","concept_id":"moon","level":"A","languages":["ar","en"],
 "title":{"ar":"القمر","en":"The Moon"},
 "verses":[verse("10:5","primary"),verse("41:37","supporting"),verse("36:39","supporting")],
 "count":{"lemmas":C['moon']['qac_lemmas'],"tokens":C['moon']['count_tokens'],"verses":C['moon']['count_verses'],
          "rule_id":"qac-lemma-word-token@0.4","source":"Quranic Arabic Corpus v0.4 (corpus.quran.com) - GPL, verbatim",
          "display":{"en":"The word for 'moon' (qamar) occurs 27 times in 26 verses.","ar":"وردت كلمة «القمر» 27 مرة في 26 آية."}},
 "tafsir":[{"source_id":"tafsir.tabari","book":"جامع البيان عن تأويل آي القرآن","author":"ابن جرير الطبري (ت 310هـ)","verse_key":"10:5",
            "excerpt_ar":ex,"excerpt_sha":sha(ex),"is_commentator_words":True,
            "retrieved_from":"spa5k/tafsir_api mirror (ar-tafsir-al-tabari/10/5) -> re-fetch from Quranpedia dump/API before publish",
            "translation_en":None,"translation_status":"to be written by researcher; or use Al-Mukhtasar EN if organizers approve"}],
 "hadith":[{k:v for k,v in H[('bukhari','1042')].items() if k in('collection','number','arabic','english_mirror','grade','topic')} |
            {"numbering_scheme":"bukhari-fath-al-bari","grader":"inclusion in Sahih al-Bukhari","grade_source_url":None,"status":"VERIFY on dorar.net/hadith"},
           {k:v for k,v in H[('bukhari','1909')].items() if k in('collection','number','arabic','english_mirror','grade','topic')} |
            {"numbering_scheme":"bukhari-fath-al-bari","grader":"inclusion in Sahih al-Bukhari","grade_source_url":None,"status":"VERIFY on dorar.net/hadith"}],
 "civilizational_note":{"kind":"historical (non-sharia)","en":"Because the Islamic months begin with the crescent moon, Muslim astronomers developed tables and instruments for timekeeping and crescent visibility.",
     "sources":[{"citation":"King, D. A. (1996). Astronomy and Islamic society: Qibla, gnomonics and timekeeping. In R. Rashed (Ed.), Encyclopedia of the History of Arabic Science, Vol. 1, pp. 128-184. Routledge.","status":"TO-VERIFY page range"}]},
 "claims":[{"id":"c1","text_en":"Allah made the sun a shining light and the moon a light, and determined phases for it so people know the count of years.","evidence":["v:10:5"]},
           {"id":"c2","text_en":"Muslims do not worship the sun or moon; the Quran forbids prostrating to them.","evidence":["v:41:37"]},
           {"id":"c3","text_en":"The Prophet taught that eclipses are signs of Allah, not caused by anyone's death or birth.","evidence":["h:bukhari:1042"]},
           {"id":"c4","text_en":"Islamic months (e.g., Ramadan) begin by sighting the crescent.","evidence":["h:bukhari:1909"]}],
 "sensitivity":{"flags":["no-ijaz-framing","no-numerology"],"notes":"Do not present 54:1 or counts as scientific/numerical miracles."},
 "review":{"stage":"auto_draft","history":[{"stage":"auto_draft","actor":"script:make_example_card.py","at":"2026-10-03T00:00:00Z"}],
           "reviewer_id":None,"institution_id":None},
 "version":1,"provenance":{"data_versions":{"kfgqpc":"hafs v18 (2021-10-25)","qac":"0.4","hadith_mirror":"fawazahmed0/hadith-api@1","tafsir_mirror":"spa5k/tafsir_api@main"}}
}
json.dump(card,open(f'{D}/card_example_moon.json','w'),ensure_ascii=False,indent=1)
print('ok', len(json.dumps(card,ensure_ascii=False)))
