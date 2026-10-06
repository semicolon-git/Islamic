"""Generates the film's narration with ElevenLabs and keeps only takes that match the script word for word.

    ELEVENLABS_API_KEY=… python3 narrate.py film.json OUT_DIR

For each scene: synthesize `tts` (fully vowelized) with film.json → voice, transcribe the take twice with faster-whisper
large-v3 (beam 5 and greedy), compare with the scene's captions after normalizing Arabic spelling, and retake (up to
MAX_TAKES) until both passes match. Allowed differences are listed in film.json → allowed (spelling-only variants such as
«الأسطرلاب/الأسترلاب»). Writes OUT_DIR/s<n>.mp3 and OUT_DIR/narration.json (take count and remaining differences).
"""
import difflib, json, os, re, sys, urllib.request

film = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
KEY = os.environ["ELEVENLABS_API_KEY"]
V = film["voice"]
MAX_TAKES = int(os.environ.get("MAX_TAKES", "4"))
allowed = {tuple(x) for x in film.get("allowed", [])}


def norm(s):
    s = re.sub(r"[ً-ٰٟۖ-ۭـ]", "", s)
    s = re.sub("[إأآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ؤ", "ء").replace("ئ", "ء")
    return re.sub(r"[^ء-ي ]", " ", s).split()


halluc = {t for h in film.get("hallucinations", []) for t in norm(h)}


def tts(text, out):
    body = {"text": text, "model_id": V["model_id"], "voice_settings": V.get("settings", {"stability": 0.55, "similarity_boost": 0.8, "style": 0.0, "use_speaker_boost": True})}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{V['voice_id']}?output_format={V.get('format', 'mp3_44100_128')}",
                                 data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "content-type": "application/json"})
    open(out, "wb").write(urllib.request.urlopen(req, timeout=180).read())


from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cpu", compute_type="int8", cpu_threads=8)


def diffs(path, ref):
    out = []
    for kw in ({"beam_size": 5}, {"beam_size": 1}):
        segs, _ = model.transcribe(path, language="ar", **kw)
        a = norm(ref)
        b = [t for t in norm(" ".join(s.text for s in segs)) if not (t in halluc and t not in a)]
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        out += [(" ".join(a[i:j]), " ".join(b[x:y])) for op, i, j, x, y in sm.get_opcodes() if op != "equal"]
    return sorted(set(out))


report = {}
for sc in film["scenes"]:
    n, ref = sc["n"], " ".join(sc["captions"])
    best = None
    for take in range(1, MAX_TAKES + 1):
        f = os.path.join(OUT, f"s{n}_t{take}.mp3")
        tts(sc["tts"], f)
        d = diffs(f, ref)
        bad = [e for e in d if e not in allowed]
        print(f"scene {n} take {take}: {'OK' if not bad else 'RETAKE'} {d}", flush=True)
        if best is None or len(bad) < len(best[1]):
            best = (f, bad, d, take)
        if not bad:
            break
    os.replace(best[0], os.path.join(OUT, f"s{n}.mp3"))
    report[n] = {"takes": best[3], "differences": best[2], "unexplained": best[1]}
json.dump(report, open(os.path.join(OUT, "narration.json"), "w"), ensure_ascii=False, indent=1)
bad = {n: r["unexplained"] for n, r in report.items() if r["unexplained"]}
print("NARRATION_OK" if not bad else f"NARRATION_UNRESOLVED {bad}", flush=True)
