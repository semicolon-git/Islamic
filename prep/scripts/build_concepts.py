#!/usr/bin/env python3
"""Build + verify the closed concept list for the nature track.
Inputs : ../data/raw/quran_kfgqpc_hafs_v18.json (KFGQPC Hafs v18 Unicode), ../data/raw/qac-morphology-0.4.txt (QAC 0.4),
         ../data/raw/translations/eng-ummmuhammad.json (Saheeh Intl, fallback mirror - display check only)
         (run ../fetch_sources.sh first)
Outputs: ../data/concepts_verified.json, ../data/concept_counts.csv
Counting rule (deterministic): a concept = explicit set of QAC lemmas. Count = number of WORD tokens
(chapter:verse:word) having >=1 segment whose LEM is in the set. Also report distinct verses.
A verse key is VERIFIED iff (a) it exists in KFGQPC v18 and (b) QAC tags >=1 word in it with a concept lemma
and (c) the Arabic keyword (imlaei, normalized) is a substring of KFGQPC aya_text_emlaey."""
import json, re, csv, collections, os, sys
D = os.path.dirname(os.path.abspath(__file__)) + '/../data'
RAW = D + '/raw'
K = {(r['sora'], r['aya_no']): r for r in json.load(open(f'{RAW}/quran_kfgqpc_hafs_v18.json'))}
EN = {(r['chapter'], r['verse']): r['text'] for r in json.load(open(f'{RAW}/translations/eng-ummmuhammad.json'))['quran']}
lem_words = collections.defaultdict(set)  # lemma -> set of (s,a,w)
for line in open(f'{RAW}/qac-morphology-0.4.txt', encoding='utf-8'):
    if not line.startswith('('): continue
    loc, form, tag, feat = line.rstrip('\n').split('\t')
    s, a, w, _ = map(int, loc.strip('()').split(':'))
    m = re.search(r'LEM:([^|]+)', feat)
    if m: lem_words[m.group(1)].add((s, a, w))

def norm(t):
    t = re.sub('[ً-ٰٟۖ-ۭـ]', '', t)          # tashkeel, small marks, tatweel
    t = re.sub('[إأآٱ]', 'ا', t); t = t.replace('ى', 'ي').replace('ة', 'ه')
    return t

# id, en, ar, lemmas(QAC Buckwalter), keyword(s) imlaei for text check, candidate verses, camera, demo, sensitivity
C = [
 ("moon","Moon","القمر",["qamar"],["قمر"],["10:5","36:39","41:37"],"High (night sky / printed photo / screen)","Photo on screen or print; real moon only outdoors at night","A. Avoid presenting 54:1 (splitting) in MVP; keep to signs & calendar (10:5)."),
 ("sun","Sun","الشمس",["$amos"],["شمس"],["91:1","36:38","10:5"],"High outdoors; lamp may be confused","Window/outdoor shot or print","A/B. Do NOT frame 36:38 'mustaqarr' as modern astrophysics proof (i'jaz overclaim)."),
 ("stars","Stars","النجوم والكواكب",["n~ajom","kawokab"],["نجم","نجوم","كوكب","كواكب"],["6:97","16:16","37:6"],"Medium (night photos are dark; prefer print/planetarium image)","Print/screen","A. 6:97/16:16 navigation = good bridge to astronomy heritage."),
 ("night_day","Night & day (sunset)","الليل والنهار",["layol","nahaAr"],["ليل","نهار"],["3:190","36:37","25:62"],"Medium (sunset/sunrise scene)","Print/screen","A. 3:190 already used on S3."),
 ("clouds","Clouds","السحاب",["saHaAb"],["سحاب"],["24:43","2:164","7:57"],"High","Window or print","A/B. 24:43 'mountains of hail' - avoid meteorology-proof framing."),
 ("rain_water","Rain / water from the sky","الماء النازل من السماء",["maA^'"],["ماء"],["50:9","2:164","16:10"],"Medium for rain; High for water bottle/glass","Water bottle/glass (very demoable)","A. Use lemma maA' (water). Do NOT count 'maTar' as 'rain' - in the Quran it mostly denotes punishment-rain (e.g., 7:84)."),
 ("water_life","Water & life","الماء والحياة",["maA^'"],["ماء"],["21:30","24:45"],"High (water bottle)","Water bottle","B/C RISK: 21:30 is a classic i'jaz 'ilmi claim (biology). Present as reflection, not proof."),
 ("lightning","Lightning & thunder","البرق والرعد",["baroq","raEod"],["برق","رعد"],["13:12","13:13","30:24"],"Medium (print/video)","Print/screen","A."),
 ("wind","Wind","الرياح",["riyH"],["ريح","رياح"],["2:164","30:46","45:5"],"Low (wind is invisible -> use flag/trees bending/wind turbine)","Fan + ribbon? weak","A. Note scholarly observation: plural riyah often mercy, singular rih often punishment - pick verses accordingly. 15:22 'lawaqih' = i'jaz claim -> B/C."),
 ("shadow","Shadow","الظل",["Zil~"],["ظل"],["25:45","16:81","16:48"],"Medium (shadow on floor)","Desk lamp + object (very demoable, links to sundial/timekeeping)","A/B. 25:45 links to timekeeping heritage (sundials)."),
 ("mountain","Mountain","الجبل",["jabal"],["جبل","جبال"],["88:19","16:81","7:143"],"High (print/landscape)","Print/screen","A for 88:19. B/C RISK: 78:7 'awtad' (pegs/roots) is a classic i'jaz geology claim - keep out of MVP or flag."),
 ("sea","Sea","البحر",["baHor"],["بحر"],["16:14","2:164","45:12"],"High (print)","Print/screen","A. B/C RISK: 25:53 & 55:19-20 'barzakh' marketed as oceanography proof - avoid."),
 ("river","River","النهر",["nahar"],["نهر","انهار"],["13:3","14:32","16:15"],"Medium","Print","A. Many 'anhar' verses describe Paradise - prefer earthly ones."),
 ("stone","Stone / rock","الحجر",["Hajar","HijaArap"],["حجر","حجاره"],["2:74"],"Medium (pebble)","Pebble/rock on table","A. 2:74 is a rebuke (hearts harder than stone) - tone note for non-Muslim audience."),
 ("soil","Soil / dust","التراب",["turaAb"],["تراب"],["30:20","35:11"],"Medium (potted soil)","Potted plant soil","A/B. Human creation from dust: keep to text; avoid embryology claims (22:5, 23:12-14 = B/C)."),
 ("iron","Iron (metal object)","الحديد",["Hadiyd"],["حديد"],["57:25","34:10","18:96"],"Medium (metal key/tool)","Metal object","B/C RISK: 57:25 'sent down iron' = classic meteoritic-iron i'jaz claim. Use 34:10 (David & iron) heritage framing instead."),
 ("ships","Ship / boat","الفلك والسفن",["fulok","safiynap"],["فلك","سفين"],["2:164","14:32","17:66"],"High (print/toy)","Toy boat/print","A."),
 ("salt_fresh","Salt & fresh water","العذب والملح",["miloH"],["ملح"],["25:53","35:12"],"Low (salt vs sugar indistinguishable)","Salt shaker + water glass (camera weak)","B/C RISK: 25:53 barzakh i'jaz framing - keep to 35:12 blessings framing."),
 ("pearl_coral","Pearls & coral","اللؤلؤ والمرجان",["lu&olu&","marojaAn"],["لؤلؤ","مرجان"],["55:22","52:24"],"Medium (jewelry)","Pearl necklace/print","A. 52:24/56:23 are Paradise similes."),
 ("date_palm","Date palm / dates","النخل والتمر",["naxol","n~axiyl","n~axolap","ruTab"],["نخل","رطب"],["19:25","6:99","50:10"],"High (dates box is the best Saudi demo prop)","Box of dates / palm print","A. 19:25 = Maryam story (bridge to shared heritage with Christians - handle respectfully)."),
 ("olive","Olive / olive oil","الزيتون والزيت",["z~ayotuwn","zayotuwnap","zayot"],["زيتون","زيت"],["95:1","24:35","6:141"],"High (olives/oil bottle)","Olive oil bottle, olives","A for 95:1; 24:35 (Light verse) is metaphor-heavy -> tafsir needed (B)."),
 ("fig","Fig","التين",["t~iyn"],["تين"],["95:1"],"High (dried figs)","Dried figs","A. Only one occurrence."),
 ("pomegranate","Pomegranate","الرمان",["r~um~aAn"],["رمان"],["6:99","6:141","55:68"],"High","Pomegranate","A. 55:68 is Paradise context."),
 ("grapes","Grapes","العنب",["Einab"],["عنب","اعناب"],["6:99","16:11","80:28"],"High","Grapes","A."),
 ("tree_leaf","Tree / leaf","الشجر والورق",["$ajarap","$ajar","waraqap"],["شجر","ورقه"],["6:59","36:80","14:24"],"High (potted plant/leaf)","Potted plant","A. 6:59 (no leaf falls but He knows it) = strong 'signs around you' moment."),
 ("grain","Grain / seed / wheat ear","الحب والسنبلة",["Hab~","Hab~ap"],["حب"],["6:95","2:261","6:59"],"Medium (seeds/wheat ear)","Seeds, bread? wheat ear","A. 2:261 = charity parable (good intro to values)."),
 ("milk","Milk","اللبن",["l~aban"],["لبن"],["16:66","47:15"],"High (milk carton)","Milk carton","A/B. 16:66 'between digested food and blood' - avoid physiology-proof framing."),
 ("honey_bee","Bee & honey","النحل والعسل",["n~aHol","Easal"],["نحل","عسل"],["16:68","16:69","47:15"],"High (honey jar; bee print)","Honey jar","A/B. 16:69 'healing for people' - do NOT present as medical claim (level D-adjacent if user asks for treatment)."),
 ("onion_garlic","Onion, garlic, lentils","البصل والفوم والعدس",["baSal","fuwm","Eadas"],["بصل","فوم","عدس"],["2:61"],"High","Onion/garlic","A but context: Bani Israel asking for lesser food - explain story context."),
 ("ant","Ant","النمل",["n~amol","namolap"],["نمل"],["27:18"],"Medium (print)","Print","A. Sulayman story."),
 ("spider","Spider / web","العنكبوت",["Eankabuwt"],["عنكبوت"],["29:41"],"Medium (print/web)","Print","A. 29:41 is a parable about false protectors - tone note."),
 ("birds","Birds","الطير",["Tayor"],["طير"],["67:19","16:79","24:41"],"High (print/pigeons)","Print","A."),
 ("camel","Camel","الإبل",["<ibil","naAqap","baEiyr"],["ابل"],["88:17"],"High (toy/print; Saudi-relevant)","Camel toy/print","A. naAqah verses = Thamud story (punishment) - keep card on 88:17."),
 ("livestock","Livestock (cattle, sheep)","الأنعام",["n~aEam"],["انعام"],["16:5","16:66","16:80"],"Medium","Wool/leather item","A. 16:80 (wool, hair, skins -> tents/furnishings) = bridge to crafts heritage."),
 ("horse","Horse","الخيل",["xayol"],["خيل"],["16:8","3:14"],"High (print)","Print/toy","A. Avoid claim that 16:8 'creates what you do not know' predicts cars (overclaim)."),
 ("fish","Fish / whale","الحوت",["Huwt"],["حوت"],["37:142","18:61"],"Medium","Print","A. Yunus story - prophet shared with Bible (Jonah)."),
 ("pen","Pen / writing","القلم",["qalam"],["قلم","اقلام"],["96:4","68:1","31:27"],"High (any pen - best indoor demo)","Pen on table","A. Direct bridge to manuscripts/heritage track (S3 uses 96:1)."),
 ("lamp","Lamp / light","السراج والمصباح",["siraAj","miSobaAH"],["سراج","مصباح"],["25:61","71:16","24:35"],"High (lamp)","Desk lamp","B. 24:35 parable needs tafsir; 25:61/71:16 sun as lamp, moon as light."),
 ("qibla","Kaaba / qibla direction (compass, prayer mat)","القبلة",["qibolap"],["قبله","قبلت"],["2:144","2:142"],"Medium (compass/prayer-mat photo)","Phone compass/prayer mat","A. Directly answers test Q1 (R7 'Why do Muslims worship the Kaaba?'): qibla is direction, worship is for Allah."),
 ("time_asr","Time / clock (afternoon)","العصر والوقت",["EaSor"],["عصر"],["103:1"],"Medium (clock)","Wall clock/phone","A. Bridge to timekeeping & astronomy heritage (prayer times)."),
]
CONTEXT={'16:69'}  # verse exists in KFGQPC; continuation of 16:68 (bee addressed by pronoun), keyword absent by design
out=[]; rows=[]
for cid,en,ar,lems,kws,verses,cam,demo,sens in C:
    toks=set(); 
    for l in lems:
        if l not in lem_words: print('MISSING LEMMA', cid, l, file=sys.stderr)
        toks |= lem_words.get(l,set())
    vset=sorted({(s,a) for s,a,w in toks})
    vv=[]
    for vk in verses:
        s,a=map(int,vk.split(':'))
        r=K.get((s,a)); qac=any((s,a)==(x,y) for x,y,_ in toks)
        em=norm(r['aya_text_emlaey']) if r else ''
        kw=any(norm(k) in em for k in kws)
        status='VERIFIED' if (r and qac and kw) else ('VERIFIED-CONTEXT' if (r and vk in CONTEXT) else 'TO-VERIFY')
        vv.append({"key":vk,"status":status,"qac_lemma_in_verse":qac,"keyword_in_kfgqpc_text":kw,
                   "arabic_kfgqpc_v18":r['aya_text'] if r else None,"sura_ar":r['sora_name_ar'] if r else None,
                   "en_saheeh_fallback_mirror":EN.get((s,a))})
    out.append({"id":cid,"label_en":en,"label_ar":ar,"qac_lemmas":lems,"count_rule":"word tokens with LEM in qac_lemmas (QAC v0.4)",
                "count_tokens":len(toks),"count_verses":len(vset),"verses":vv,"camera":cam,"demo":demo,"sensitivity":sens})
    rows.append([cid,en,ar,'|'.join(lems),len(toks),len(vset),' '.join(f"{v['key']}({ {'VERIFIED':'V','VERIFIED-CONTEXT':'Vc'}.get(v['status'],'?') })" for v in vv)])
json.dump(out,open(f'{D}/concepts_verified.json','w'),ensure_ascii=False,indent=1)
with open(f'{D}/concept_counts.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','label_en','label_ar','qac_lemmas','tokens','verses','verse_keys(V=verified)']); w.writerows(rows)
for r in rows: print('\t'.join(map(str,r)))
