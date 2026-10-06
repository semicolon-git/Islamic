"""Assembles the Arabic promo film from the verified narration, the B-roll and the real-app screen shots.

    python3 assemble.py film.json OUT_DIR [--dry]

1. Narration: silence trimmed, gently tightened (atempo), then transcribed again with faster-whisper; every scene must
   match the script word for word (allowed: the elisions listed in film.json), or the build stops.
2. Captions: the script's caption chunks, timed from the transcription's word timestamps.
3. Picture: each scene's parts (B-roll, phone shot, desktop shot, title, end card) fill the scene's narration time.
   Arabic text is rendered by Chromium (render.mjs), never by ffmpeg's drawtext.
"""
import difflib, json, os, re, subprocess, sys, shutil

W, H, FPS = 1920, 1080, 30
film = json.load(open(sys.argv[1]))
OUT = os.path.abspath(sys.argv[2])
DRY = "--dry" in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
L = os.path.join(OUT, "layers"); os.makedirs(L, exist_ok=True)
SEG = os.path.join(OUT, "seg"); os.makedirs(SEG, exist_ok=True)


def sh(*a, **k):
    return subprocess.run(list(a), check=True, **k)


def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).strip())


def fetch(url, f):
    if not os.path.exists(f):
        sh("curl", "-sfL", "-o", f, url)
    return f


def norm(s):
    s = re.sub(r"[ً-ٰٟۖ-ۭـ]", "", s)
    s = re.sub("[إأآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ؤ", "ء").replace("ئ", "ء")
    s = re.sub(r"[^ء-ي ]", " ", s)
    return s.split()


# ───────────────────────── 1. narration
scenes = film["scenes"]
for sc in scenes:
    n = sc["n"]
    raw = fetch(sc["audio"], os.path.join(OUT, f"n{n}.mp3"))
    wav = os.path.join(OUT, f"n{n}.wav")
    tempo = sc.get("tempo", film.get("tempo", 1.0))
    # leading silence only: trimming the tail (areverse) clipped final words; tempo stays 1.0 unless asked
    trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05"
    af = f"{trim},aresample=48000" + (f",atempo={tempo}" if tempo != 1.0 else "")
    sh("ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", af, "-ac", "2", wav)
    sc["wav"], sc["dur"] = wav, dur(wav)

timing_file = os.path.join(OUT, "timing.json")
if "--preview" in sys.argv:  # layout check only: spread the words evenly
    timing = {str(sc["n"]): [{"w": w, "s": i * sc["dur"] / len(" ".join(sc["captions"]).split()), "e": 0}
              for i, w in enumerate(" ".join(sc["captions"]).split())] for sc in scenes}
elif os.path.exists(timing_file) and film.get("reuse_timing"):
    timing = json.load(open(timing_file))
else:
    from faster_whisper import WhisperModel
    model = WhisperModel("large-v3", device="cpu", compute_type="int8", cpu_threads=8)
    timing = {}
    for sc in scenes:
        segs, _ = model.transcribe(sc["wav"], language="ar", beam_size=5, word_timestamps=True)
        words = [{"w": w.word.strip(), "s": w.start, "e": w.end} for s in segs for w in s.words]
        timing[str(sc["n"])] = words
    json.dump(timing, open(timing_file, "w"), ensure_ascii=False)

report, failed = [], False
allowed = {tuple(x) for x in film.get("allowed", [])}
for sc in scenes:
    words = timing[str(sc["n"])]
    ref = norm(" ".join(sc["captions"]))
    hyp_tokens, owner = [], []
    for i, w in enumerate(words):
        for t in norm(w["w"]):
            hyp_tokens.append(t); owner.append(i)
    sm = difflib.SequenceMatcher(None, ref, hyp_tokens, autojunk=False)
    errs = [(" ".join(ref[a:b]), " ".join(hyp_tokens[c:d])) for op, a, b, c, d in sm.get_opcodes() if op != "equal"]
    bad = [e for e in errs if e not in allowed]
    failed |= bool(bad)
    report.append({"scene": sc["n"], "dur": round(sc["dur"], 2), "errors": errs, "unexplained": bad})
    # ref word index -> word start time
    starts = {}
    for op, a, b, c, d in sm.get_opcodes():
        for k in range(b - a):
            j = min(c + k, max(c, d - 1)) if d > c else None
            if j is not None and j < len(owner):
                starts[a + k] = words[owner[j]]["s"]
    times, k = [], 0
    for chunk in sc["captions"]:
        nwords = len(norm(chunk))
        t = next((starts[i] for i in range(k, k + nwords) if i in starts), None)
        times.append(t)
        k += nwords
    for i, t in enumerate(times):  # fill gaps
        if t is None:
            times[i] = times[i - 1] + 0.8 if i else 0.0
    sc["chunk_times"] = times
json.dump(report, open(os.path.join(OUT, "verify.json"), "w"), ensure_ascii=False, indent=1)
for r in report:
    print("scene", r["scene"], r["dur"], "s", "OK" if not r["unexplained"] else f"MISMATCH {r['unexplained']}", r["errors"] if r["errors"] else "")
if failed and not film.get("force"):
    sys.exit("narration does not match the script — stopping")

# ───────────────────────── 2. timeline
GAP, LEAD = film.get("gap", 0.45), film.get("lead", 0.7)
t = LEAD
for i, sc in enumerate(scenes):
    sc["a0"] = t
    seg = sc["dur"] + (GAP if i < len(scenes) - 1 else film.get("tail", 0.9))
    sc["v0"], sc["vdur"] = (0.0, seg + LEAD) if i == 0 else (t, seg)
    t += seg
END = film.get("endcard", 5.5)
TOTAL = t + END
print(f"total {TOTAL:.1f} s")

# captions in absolute time
caps = []
for sc in scenes:
    ts = [sc["a0"] + x for x in sc["chunk_times"]]
    for i, text in enumerate(sc["captions"]):
        end = ts[i + 1] - 0.06 if i + 1 < len(ts) else sc["a0"] + sc["dur"] + 0.25
        caps.append({"text": text, "t0": ts[i] - 0.08, "t1": end})

# ───────────────────────── 3. layers (Chromium)
FONT_CSS = """@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;600;700&family=Amiri:wght@400;700&family=Readex+Pro:wght@400;600&display=block');
@font-face{font-family:"KFGQPC Hafs";src:url("data:font/woff2;base64,%s") format("woff2");font-display:block}""" % __import__("base64").b64encode(
    open(fetch(film["hafs_font"], os.path.join(OUT, "hafs.woff2")), "rb").read()).decode()
KHATAM = '<svg viewBox="-50 -50 100 100" width="{s}" height="{s}"><g fill="none" stroke="{c}" stroke-width="{w}"><rect x="-26" y="-26" width="52" height="52" rx="4"/><rect x="-26" y="-26" width="52" height="52" rx="4" transform="rotate(45)"/></g><circle r="11" fill="{c}"/></svg>'
BG = f"""<div style="position:absolute;inset:0;background:radial-gradient(900px 600px at 85% 15%,rgba(54,220,184,.14),transparent 60%),radial-gradient(1000px 700px at 10% 90%,rgba(160,148,255,.14),transparent 60%),linear-gradient(180deg,#0d1130,#090c24)"></div>
<div style="position:absolute;inset:0;background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,.06) 1px,transparent 0);background-size:28px 28px"></div>
<svg style="position:absolute;right:-380px;top:-320px;opacity:.07" width="1300" height="1300" viewBox="-50 -50 100 100"><g fill="none" stroke="#36dcb8" stroke-width=".6"><rect x="-30" y="-30" width="60" height="60"/><rect x="-30" y="-30" width="60" height="60" transform="rotate(45)"/><circle r="18"/><circle r="44"/></g></svg>"""
PH = film["phone"]  # {x,y,w,h,r,bezel}
DK = film["desk"]   # {x,y,w,h,r}
layers = [
    {"file": f"{L}/bg.png", "w": W, "h": H, "html": BG},
    {"file": f"{L}/bezel.png", "w": W, "h": H, "transparent": True, "html":
        f'<div style="position:absolute;left:{PH["x"]-PH["bezel"]}px;top:{PH["y"]-PH["bezel"]}px;width:{PH["w"]+2*PH["bezel"]}px;height:{PH["h"]+2*PH["bezel"]}px;border-radius:{PH["r"]+PH["bezel"]}px;border:{PH["bezel"]}px solid #222a5c;box-shadow:0 0 0 2px rgba(255,255,255,.10),0 40px 120px rgba(0,0,0,.55),0 0 90px rgba(54,220,184,.12)"></div>'},
    {"file": f"{L}/phonemask.png", "w": PH["w"], "h": PH["h"], "html": f'<div style="width:100%;height:100%;background:#000"><div style="width:100%;height:100%;background:#fff;border-radius:{PH["r"]}px"></div></div>'},
    {"file": f"{L}/deskmask.png", "w": DK["w"], "h": DK["h"], "html": f'<div style="width:100%;height:100%;background:#000"><div style="width:100%;height:100%;background:#fff;border-radius:{DK["r"]}px"></div></div>'},
    {"file": f"{L}/deskshadow.png", "w": W, "h": H, "transparent": True, "html":
        f'<div style="position:absolute;left:{DK["x"]}px;top:{DK["y"]}px;width:{DK["w"]}px;height:{DK["h"]}px;border-radius:{DK["r"]}px;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 40px 120px rgba(0,0,0,.55),0 0 90px rgba(160,148,255,.14)"></div>'},
    {"file": f"{L}/shade.png", "w": W, "h": H, "transparent": True, "html": '<div style="position:absolute;left:0;right:0;bottom:0;height:380px;background:linear-gradient(180deg,rgba(5,7,20,0),rgba(5,7,20,.78))"></div>'},
    {"file": f"{L}/title.png", "w": W, "h": H, "html": BG + f"""<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">
        {KHATAM.format(s=150, c="#36dcb8", w=5)}
        <div style="font-family:Amiri;font-weight:700;font-size:150px;line-height:1.35;color:#36dcb8;margin-top:10px">آياتٌ حولك</div>
        <div style="font-family:'Readex Pro';font-size:40px;color:#b5badb;letter-spacing:.02em" dir="ltr">Signs Around You</div></div>"""},
    {"file": f"{L}/logo.png", "w": W, "h": H, "transparent": True, "html": f"""<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;filter:drop-shadow(0 6px 30px rgba(0,0,0,.6))">
        {KHATAM.format(s=120, c="#36dcb8", w=5)}
        <div style="font-family:Amiri;font-weight:700;font-size:128px;line-height:1.35;color:#fff">آياتٌ حولك</div></div>"""},
    {"file": f"{L}/endcard.png", "w": W, "h": H, "require_font": "66px \"KFGQPC Hafs\"", "html": BG + f"""<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 170px">
        <div style="font-family:'KFGQPC Hafs';font-size:66px;line-height:2.05;color:#f3eee4;text-align:center">{film["verse"]["text"]}</div>
        <div style="font-family:'IBM Plex Sans Arabic';font-weight:500;font-size:30px;color:#8b91ba;margin-top:18px">{film["verse"]["cite"]}</div>
        <div style="display:flex;align-items:center;gap:20px;margin-top:70px">{KHATAM.format(s=64, c="#36dcb8", w=5)}
          <span style="font-family:Amiri;font-weight:700;font-size:58px;color:#36dcb8">آياتٌ حولك</span>
          <span style="font-family:'Readex Pro';font-size:30px;color:#b5badb" dir="ltr">Signs Around You</span></div></div>"""},
]
SIDE = film["side"]  # {x,w}
for i, c in enumerate(caps):
    layers.append({"file": f"{L}/cb{i}.png", "w": W, "h": H, "transparent": True, "html":
        f'<div style="position:absolute;left:120px;right:120px;bottom:64px;text-align:center;font-family:\'IBM Plex Sans Arabic\';font-weight:600;font-size:50px;line-height:1.5;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.6)">{c["text"]}</div>'})
    layers.append({"file": f"{L}/cs{i}.png", "w": W, "h": H, "transparent": True, "html":
        f'<div style="position:absolute;left:{SIDE["x"]}px;width:{SIDE["w"]}px;top:0;bottom:0;display:flex;align-items:center"><div style="border-right:6px solid #36dcb8;padding-right:34px;font-family:\'IBM Plex Sans Arabic\';font-weight:600;font-size:62px;line-height:1.55;color:#eceefa;text-align:right">{c["text"]}</div></div>'})
spec = os.path.join(OUT, "layers.json")
json.dump(layers, open(spec, "w"), ensure_ascii=False)
if not DRY or not os.path.exists(f"{L}/bg.png"):
    sh("node", os.path.join(HERE, "render.mjs"), spec, env={**os.environ, "FONTS_CSS": FONT_CSS})

if "--layers" in sys.argv or "--preview" in sys.argv:
    sys.exit(0)

# ───────────────────────── 4. sources
src = {}
for k, url in film["broll"].items():
    src["b" + k] = fetch(url, os.path.join(OUT, f"b{k}.mp4"))
for k, url in film["shots"].items():
    src[k] = fetch(url, os.path.join(OUT, f"shot-{k}.mp4"))
srclen = {k: dur(v) for k, v in src.items()}

# ───────────────────────── 5. parts → segments
plan, segs = [], []
for sc in scenes + [{"n": "end", "v0": TOTAL - END, "vdur": END, "parts": [{"kind": "endcard"}]}]:
    parts = sc["parts"]
    fixed = sum(p.get("len", 0) for p in parts)
    flex = [p for p in parts if "len" not in p]
    weights = [p.get("weight", (p.get("out", srclen.get(p.get("src"), 1)) - p.get("in", 0))) for p in flex]
    rest = max(0.5, sc["vdur"] - fixed)
    for p, w in zip(flex, weights):
        p["len"] = rest * w / sum(weights)
    t0 = sc["v0"]
    for j, p in enumerate(parts):
        p["t0"], p["t1"] = t0, t0 + p["len"]
        t0 = p["t1"]
        if p["kind"] in ("phone", "desk", "broll"):
            a, b = p.get("in", 0), p.get("out", srclen[p["src"]])
            p["speed"] = max(film.get("min_speed", 0.8), (b - a) / p["len"])
        plan.append({"scene": sc["n"], **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in p.items()}})
print(json.dumps(plan, ensure_ascii=False, indent=0))
json.dump(plan, open(os.path.join(OUT, "plan.json"), "w"), ensure_ascii=False, indent=1)
if DRY:
    sys.exit(0)

ENC = ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS)]
for i, p in enumerate(plan):
    d = p["t1"] - p["t0"]
    out = os.path.join(SEG, f"s{i:03d}.mp4")
    inputs, fc = [], []

    def add(*a):
        inputs.extend(a); return len([x for x in inputs if x == "-i"]) - 1

    kind = p["kind"]
    if kind in ("phone", "desk", "broll"):
        a = p.get("in", 0); sp = p["speed"]
        add("-ss", f"{a:.3f}", "-i", src[p["src"]])
        clip = f"[0:v]setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration={d + 1:.2f},trim=duration={d:.3f},setpts=PTS-STARTPTS"
    if kind == "broll":
        fc.append(f"{clip},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},eq=saturation={p.get('sat', 1.0)}[base0]")
        sh_i = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/shade.png")
        fc.append(f"[base0][{sh_i}:v]overlay=0:0[base]")
        style = "cb"
    elif kind == "phone":
        bg = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/bg.png")
        mk = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/phonemask.png")
        bz = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/bezel.png")
        fc.append(f"{clip},scale={PH['w']}:{PH['h']}:flags=lanczos,format=rgba[scr0]")
        fc.append(f"[{mk}:v]format=gray,scale={PH['w']}:{PH['h']}[m]")
        fc.append("[scr0][m]alphamerge[scr]")
        fc.append(f"[{bg}:v][{bz}:v]overlay=0:0[bgb]")
        fc.append(f"[bgb][scr]overlay={PH['x']}:{PH['y']}[base]")
        style = "cs"
    elif kind == "desk":
        bg = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/bg.png")
        mk = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/deskmask.png")
        sd = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/deskshadow.png")
        fc.append(f"{clip},scale={DK['w']}:{DK['h']}:flags=lanczos,format=rgba[scr0]")
        fc.append(f"[{mk}:v]format=gray,scale={DK['w']}:{DK['h']}[m]")
        fc.append("[scr0][m]alphamerge[scr]")
        fc.append(f"[{bg}:v][{sd}:v]overlay=0:0[bgb]")
        fc.append(f"[bgb][scr]overlay={DK['x']}:{DK['y']}[base]")
        style = "cb"
    elif kind in ("title", "endcard"):
        im = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/{'title' if kind == 'title' else 'endcard'}.png")
        fc.append(f"[{im}:v]fps={FPS},format=yuv420p[base]")
        style = "cb"
    cur = "base"
    if p.get("logo"):
        lg = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/logo.png")
        st = max(0, d - p["logo"])
        fc.append(f"[{lg}:v]format=rgba,fade=t=in:st={st:.2f}:d=0.8:alpha=1[lg]")
        fc.append(f"[{cur}][lg]overlay=0:0[wl]"); cur = "wl"
    if not p.get("nocaps"):
        for ci, c in enumerate(caps):
            a0, a1 = max(c["t0"], p["t0"]), min(c["t1"], p["t1"])
            if a1 - a0 < 0.05:
                continue
            r0, r1 = a0 - p["t0"], a1 - p["t0"]
            ii = add("-loop", "1", "-t", f"{d:.3f}", "-i", f"{L}/{style}{ci}.png")
            fi = "fade=t=in:st={:.2f}:d=0.18:alpha=1,".format(r0) if c["t0"] >= p["t0"] else ""
            fo = "fade=t=out:st={:.2f}:d=0.18:alpha=1".format(max(r0, r1 - 0.18)) if c["t1"] <= p["t1"] else "null"
            fc.append(f"[{ii}:v]format=rgba,{fi}{fo}[c{ci}]")
            fc.append(f"[{cur}][c{ci}]overlay=0:0:enable='between(t,{r0:.3f},{r1:.3f})'[o{ci}]"); cur = f"o{ci}"
    fc.append(f"[{cur}]format=yuv420p[v]")
    sh("ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(fc), "-map", "[v]", "-t", f"{d:.3f}", *ENC, "-an", out)
    segs.append(out)
    print(f"segment {i} {p['kind']} {d:.2f}s", flush=True)

# ───────────────────────── 6. concat + audio
lst = os.path.join(OUT, "segs.txt")
open(lst, "w").write("\n".join(f"file '{s}'" for s in segs))
video = os.path.join(OUT, "video.mp4")
sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
   "-vf", f"fade=t=in:st=0:d=0.6,fade=t=out:st={TOTAL - 1.2:.2f}:d=1.2", *ENC, video)
ain, fa = [], []
for i, sc in enumerate(scenes):
    ain += ["-i", sc["wav"]]
    ms = int(sc["a0"] * 1000)
    fa.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
fa.append("".join(f"[a{i}]" for i in range(len(scenes))) + f"amix=inputs={len(scenes)}:normalize=0,apad=whole_dur={TOTAL:.2f},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]")
audio = os.path.join(OUT, "voice.wav")
sh("ffmpeg", "-y", "-loglevel", "error", *ain, "-filter_complex", ";".join(fa), "-map", "[a]", "-t", f"{TOTAL:.3f}", audio)
final = os.path.join(OUT, film.get("output", "promo-ar.mp4"))
sh("ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", final)
print("wrote", final, f"{dur(final):.2f}s")
