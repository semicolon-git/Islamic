// CoolCairo Academy engine: state, routing, mission map, mission pages, quizzes, exam, glossary.

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "html") e.innerHTML = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
}
function S(tag, attrs = {}, kids = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v != null) e.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const MINUS = "−";
const fmt = (v, d = 1) => (v < 0 ? MINUS : "") + Math.abs(v).toFixed(d);
const fint = (v) => Math.round(v).toLocaleString("en-US");
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function shuffle(a, rand = Math.random) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const median = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

// Report-style diverging heat ramp: blue (cool) - light grey - orange (hot). Fixed in both themes.
const HEAT_STOPS = [[0, [23, 74, 139]], [0.25, [42, 120, 214]], [0.5, [240, 239, 236]], [0.75, [235, 104, 52]], [1, [156, 58, 20]]];
function heatColor(t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (t <= HEAT_STOPS[i][0]) {
      const [t0, c0] = HEAT_STOPS[i - 1], [t1, c1] = HEAT_STOPS[i];
      const f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((c, k) => Math.round(lerp(c, c1[k], f))).join(" ")})`;
    }
  }
  return "rgb(156 58 20)";
}
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- state ----------
const STORE_KEY = "coolcairo-academy-v1";
let state = { xp: 0, labs: {}, answered: {}, done: {}, exam: { best: 0 }, flash: {} };
try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (s) state = Object.assign(state, s); } catch { /* storage off */ }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage off */ } }

const RANKS = [[0, "Cadet"], [400, "Observer"], [1000, "Analyst"], [1800, "Specialist"], [2600, "Expert"]];
const MAX_XP = 16 * (40 + 4 * 30 + 50) + 20 * 15;
function rank() {
  const done = Object.keys(state.done).length;
  if (done >= 16 && state.exam.best >= 16) return "Super Expert";
  let r = RANKS[0][1];
  for (const [x, n] of RANKS) if (state.xp >= x) r = n;
  return r;
}
function addXP(n, why) {
  if (n <= 0) return;
  const before = rank();
  state.xp += n;
  save();
  renderHud();
  const after = rank();
  toast(`<span class="xp">+${n} XP</span> ${why}${after !== before ? ` · Rank up: <b>${after}</b>` : ""}`);
}
function renderHud() {
  $("#xpNow").textContent = fint(state.xp);
  $("#rankName").textContent = rank();
  $("#doneCount").textContent = Object.keys(state.done).length;
  $("#xpBar").style.width = `${Math.min(100, (100 * state.xp) / MAX_XP)}%`;
}
let toastT = 0;
function toast(html) {
  const t = $("#toast");
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 2800);
}

// ---------- routing ----------
const view = $("#view");
let cleanup = [];
function route() {
  cleanup.forEach((f) => f()); cleanup = [];
  const h = location.hash.slice(1) || "home";
  view.innerHTML = "";
  const m = h.match(/^m(\d+)$/);
  if (m && CHAPTERS[+m[1] - 1]) renderChapter(CHAPTERS[+m[1] - 1]);
  else if (h === "exam") renderExam();
  else renderHome();
  window.scrollTo(0, 0);
  renderHud();
}
window.addEventListener("hashchange", route);

// ---------- home ----------
function starsFor(ch) {
  const a = state.answered[ch.id] || {};
  const right = Object.values(a).filter((v) => v === 1).length;
  return right >= 4 ? 3 : right >= 3 ? 2 : right >= 1 ? 1 : 0;
}
function renderHome() {
  const done = Object.keys(state.done).length;
  const next = CHAPTERS.find((c) => !state.done[c.id]) || CHAPTERS[15];
  const hero = el("section", { class: "hero" }, [
    el("div", {}, [
      el("div", { class: "eyebrow", text: "Team 46 · Hyperspectral course prep" }),
      el("h1", { html: "From a glow in space<br>to a cooler street." }),
      el("p", { class: "lead", text: "Sixteen missions take you from what an urban heat island is, through how satellites measure heat and materials, to every number in CoolCairo and how to defend it. Each mission has a briefing, a hands-on lab, real-world cases and a checkpoint." }),
      el("div", { class: "hero-stats" }, [
        el("div", { class: "stat" }, [el("b", { text: `${done}/16` }), el("span", { text: "missions" })]),
        el("div", { class: "stat" }, [el("b", { text: fint(state.xp) }), el("span", { text: "XP earned" })]),
        el("div", { class: "stat" }, [el("b", { text: rank() }), el("span", { text: "rank" })]),
        el("div", { class: "stat" }, [el("b", { text: state.exam.best ? `${state.exam.best}/20` : "—" }), el("span", { text: "best exam" })]),
      ]),
      el("div", { class: "hero-cta" }, [
        el("a", { class: "btn primary", href: `#m${next.id}`, text: done ? `Continue: ${next.title}` : "Start mission 1" }),
        el("a", { class: "btn", href: "#exam", text: "Final exam" }),
      ]),
    ]),
    globeCanvas(),
  ]);
  view.append(hero);
  const acts = el("div", { class: "acts" });
  for (const act of ACTS) {
    const sec = el("section", {}, [
      el("div", { class: "act-head" }, [el("span", { class: "eyebrow", text: `Act ${act.n}` }), el("h2", { text: act.name }), el("p", { text: act.sub })]),
    ]);
    const grid = el("div", { class: "stations" });
    for (const ch of CHAPTERS.filter((c) => c.act === act.n)) {
      const st = starsFor(ch);
      grid.append(el("a", { class: `station${state.done[ch.id] ? " done" : ""}`, href: `#m${ch.id}` }, [
        el("span", { class: "st-no", text: state.done[ch.id] ? "✓" : String(ch.id) }),
        el("span", { class: "st-title", text: ch.title }),
        el("span", { class: "st-sub", text: ch.sub }),
        el("span", { class: "st-meta" }, [el("span", { class: "stars", text: "★".repeat(st) + "☆".repeat(3 - st) }), el("span", { text: state.labs[ch.id] ? "lab done" : "lab" })]),
      ]));
    }
    sec.append(grid);
    acts.append(sec);
  }
  const badges = el("div", { class: "badges" }, CHAPTERS.map((c) => el("span", { class: `badge${state.done[c.id] ? " on" : ""}`, text: `${state.done[c.id] ? "★" : "☆"} ${c.title}` })));
  acts.append(el("section", {}, [el("div", { class: "act-head" }, [el("span", { class: "eyebrow", text: "Badges" }), el("h2", { text: "Your collection" }), el("p", { text: "Pass a mission's checkpoint (3 of 4) to earn its badge. All 16 badges and 16/20 on the final exam make you a Super Expert." })]), badges]));
  view.append(acts);
}

// Animated hero: a thermal Earth limb with a satellite sweeping its swath.
function globeCanvas() {
  const c = el("canvas", { class: "globe", width: 460, height: 460, role: "img", "aria-label": "A satellite crossing a thermal view of Earth" });
  const ctx = c.getContext("2d");
  const rand = mulberry32(7);
  const spots = Array.from({ length: 160 }, () => ({ a: rand() * Math.PI * 2, r: Math.sqrt(rand()) * 0.92, t: rand(), s: 4 + rand() * 14 }));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, t0 = performance.now();
  function draw(now) {
    const t = reduced ? 1.2 : (now - t0) / 1000;
    const W = 460, cx = 230, cy = 230, R = 170;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#16263f"; ctx.fillRect(0, 0, W, W);
    for (const p of spots) {
      const ang = p.a + t * 0.05;
      const x = cx + Math.cos(ang) * p.r * R, y = cy + Math.sin(ang) * p.r * R * 0.96;
      ctx.fillStyle = heatColor(p.t);
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(x, y, p.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // swath
    const sx = cx + Math.sin(t * 0.6) * R * 0.7;
    const g = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
    g.addColorStop(0, "rgba(63,193,212,0)"); g.addColorStop(0.5, "rgba(63,193,212,0.28)"); g.addColorStop(1, "rgba(63,193,212,0)");
    ctx.fillStyle = g; ctx.fillRect(sx - 40, 0, 80, W);
    ctx.restore();
    // limb + orbit
    ctx.strokeStyle = "rgba(147,163,184,0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.22, R * 0.38, -0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const oa = t * 0.6;
    const ox = cx + Math.cos(oa) * R * 1.22, oy = cy + Math.sin(oa) * R * 0.38;
    const rx = (ox - cx) * Math.cos(-0.5) - (oy - cy) * Math.sin(-0.5) + cx;
    const ry = (ox - cx) * Math.sin(-0.5) + (oy - cy) * Math.cos(-0.5) + cy;
    ctx.fillStyle = "#f2c14e"; ctx.fillRect(rx - 6, ry - 3, 12, 6);
    ctx.fillStyle = "#3fc1d4"; ctx.fillRect(rx - 16, ry - 2, 8, 4); ctx.fillRect(rx + 8, ry - 2, 8, 4);
    ctx.font = "12px IBM Plex Mono, monospace"; ctx.fillStyle = "rgba(230,237,245,0.85)";
    ctx.fillText("LANDSAT · 10:30 am pass", 18, 444);
    if (!reduced) raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);
  cleanup.push(() => cancelAnimationFrame(raf));
  return c;
}

// ---------- mission page ----------
function renderChapter(ch) {
  const act = ACTS[ch.act - 1];
  view.append(el("div", { class: "crumbs" }, [el("a", { href: "#home", text: "Mission map" }), el("span", { text: "/" }), el("span", { text: `Act ${act.n} · ${act.name}` })]));
  view.append(el("header", { class: "ch-head" }, [
    el("div", { class: "eyebrow", text: `Mission ${ch.id} of 16${state.done[ch.id] ? " · badge earned" : ""}` }),
    el("h1", { text: ch.title }),
    el("p", { text: ch.sub }),
  ]));
  view.append(el("nav", { class: "tabs", "aria-label": "Sections" }, [
    el("a", { href: `#m${ch.id}`, onclick: (e) => jump(e, "brief"), text: "Briefing" }),
    el("a", { href: `#m${ch.id}`, onclick: (e) => jump(e, "lab"), text: "Lab" }),
    el("a", { href: `#m${ch.id}`, onclick: (e) => jump(e, "field"), text: "In the field" }),
    el("a", { href: `#m${ch.id}`, onclick: (e) => jump(e, "check"), text: "Checkpoint" }),
  ]));

  // briefing
  const keys = el("aside", { class: "keybox" }, [el("div", { class: "eyebrow", text: "Numbers to remember" }), ...ch.keys.map(([b, s]) => el("div", { class: "kv" }, [el("b", { text: b }), el("span", { text: s })]))]);
  const brief = el("section", { class: "sec", id: "brief" }, [
    el("div", { class: "sec-title" }, [el("span", { class: "tag", text: "Briefing" }), el("h2", { text: "What you need to know" })]),
    el("div", { class: "brief" }, [el("div", { class: "prose", html: ch.brief }), keys]),
  ]);
  if (ch.note) brief.append(el("div", { class: `note ${ch.note.kind}`, html: ch.note.html }));
  view.append(brief);

  // lab
  const labBox = el("div", { class: "lab" });
  view.append(el("section", { class: "sec", id: "lab" }, [
    el("div", { class: "sec-title" }, [el("span", { class: "tag t-lab", text: "Lab" }), el("h2", { text: ch.labTitle })]),
    el("p", { class: "muted", text: ch.labHint }),
    labBox,
  ]));
  const api = {
    award(why = "Lab explored") {
      if (state.labs[ch.id]) return;
      state.labs[ch.id] = 1; save(); addXP(40, why);
    },
    onCleanup(f) { cleanup.push(f); },
  };
  try { LABS[ch.lab](labBox, api); } catch (err) { labBox.append(el("p", { class: "muted", text: `This lab could not start: ${err.message}` })); console.error(err); }

  // field
  view.append(el("section", { class: "sec", id: "field" }, [
    el("div", { class: "sec-title" }, [el("span", { class: "tag t-field", text: "In the field" }), el("h2", { text: "Where this is used in the real world" })]),
    el("div", { class: "fields" }, ch.field.map((f) => el("article", { class: "fcard" }, [
      el("span", { class: "where", text: f.where }), el("h3", { text: f.title }), el("p", { text: f.text }),
      el("div", { class: "link", html: `<b>Link to CoolCairo:</b> ${f.link}` }),
    ]))),
  ]));

  // checkpoint
  const qbox = el("div");
  view.append(el("section", { class: "sec", id: "check" }, [
    el("div", { class: "sec-title" }, [el("span", { class: "tag t-quiz", text: "Checkpoint" }), el("h2", { text: "Earn the badge" })]),
    el("p", { class: "muted", text: "Four questions. First-try right answers earn 30 XP each; 3 of 4 earns the badge and a 50 XP bonus." }),
    qbox,
  ]));
  runQuiz(qbox, ch.quiz.map((q, i) => ({ ...q, key: `${ch.id}:${i}` })), {
    onAnswer(q, right) {
      const a = (state.answered[ch.id] ||= {});
      const idx = q.key.split(":")[1];
      if (a[idx] === undefined) { a[idx] = right ? 1 : 0; save(); if (right) addXP(30, "Correct"); }
    },
    onFinish(score) {
      if (score >= 3 && !state.done[ch.id]) { state.done[ch.id] = 1; save(); addXP(50, `Badge: ${ch.title}`); }
      return score >= 3 ? `Badge earned: ${ch.title}` : "Score 3 of 4 to earn the badge. Read the explanations and try again.";
    },
  });

  // pager
  const prev = CHAPTERS[ch.id - 2], next = CHAPTERS[ch.id];
  view.append(el("nav", { class: "pager" }, [
    prev ? el("a", { class: "btn", href: `#m${prev.id}`, text: `← ${prev.title}` }) : el("a", { class: "btn", href: "#home", text: "← Mission map" }),
    next ? el("a", { class: "btn primary", href: `#m${next.id}`, text: `${next.title} →` }) : el("a", { class: "btn primary", href: "#exam", text: "Final exam →" }),
  ]));
}
function jump(e, id) { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }

// ---------- quiz engine ----------
function runQuiz(box, questions, { onAnswer, onFinish, shuffleOpts = false, label = "Question" }) {
  let i = 0, score = 0;
  const order = questions.map((q) => {
    const idx = q.opts.map((_, k) => k);
    return shuffleOpts ? shuffle(idx) : idx;
  });
  function show() {
    box.innerHTML = "";
    const q = questions[i];
    const card = el("div", { class: "quiz" });
    card.append(el("div", { class: "q-top" }, [el("span", { text: `${label} ${i + 1} of ${questions.length}` }), el("span", { text: `Score ${score}` })]));
    card.append(el("div", { class: "q-text", text: q.q }));
    const opts = el("div", { class: "opts" });
    const explain = el("div", { class: "explain", hidden: true });
    const foot = el("div", { class: "q-foot" });
    const nextBtn = el("button", { class: "btn primary", hidden: true, text: i === questions.length - 1 ? "See result" : "Next question" });
    const buttons = order[i].map((oi, k) => el("button", { class: "opt", "data-oi": oi }, [el("span", { class: "k", text: "ABCD"[k] }), el("span", { text: q.opts[oi] })]));
    function choose(btn) {
      const oi = +btn.dataset.oi;
      const right = oi === q.a;
      if (right) score++;
      buttons.forEach((b) => { b.disabled = true; if (+b.dataset.oi === q.a) b.classList.add("right"); });
      if (!right) btn.classList.add("wrong");
      explain.innerHTML = `<b>${right ? "Right." : "Not quite."}</b> ${q.why}`;
      explain.hidden = false;
      nextBtn.hidden = false;
      nextBtn.focus();
      onAnswer?.(q, right);
    }
    buttons.forEach((b) => b.addEventListener("click", () => choose(b)));
    opts.append(...buttons);
    nextBtn.addEventListener("click", () => { i++; if (i < questions.length) show(); else finish(); });
    foot.append(el("span", { class: "muted small", text: "Keys 1–4 answer · Enter continues" }), nextBtn);
    card.append(opts, explain, foot);
    box.append(card);
    keyHandler = (e) => {
      if (document.querySelector("dialog[open]")) return;
      const tag = (e.target.tagName || "");
      if (tag === "INPUT") return;
      if (e.key >= "1" && e.key <= "4" && !buttons[0].disabled) { const b = buttons[+e.key - 1]; if (b) choose(b); }
      else if (e.key === "Enter" && !nextBtn.hidden && document.activeElement !== nextBtn) nextBtn.click();
    };
  }
  function finish() {
    keyHandler = null;
    box.innerHTML = "";
    const msg = onFinish?.(score) || "";
    box.append(el("div", { class: "quiz" }, [el("div", { class: "result" }, [
      el("div", { class: "big", text: `${score}/${questions.length}` }),
      el("p", { text: msg }),
      el("button", { class: "btn", text: "Try again", onclick: () => { i = 0; score = 0; show(); } }),
    ])]));
  }
  show();
}
let keyHandler = null;
document.addEventListener("keydown", (e) => keyHandler?.(e));

// ---------- final exam ----------
function renderExam() {
  view.append(el("div", { class: "crumbs" }, [el("a", { href: "#home", text: "Mission map" }), el("span", { text: "/" }), el("span", { text: "Final exam" })]));
  view.append(el("header", { class: "ch-head" }, [
    el("div", { class: "eyebrow", text: "Certification" }),
    el("h1", { text: "The expert exam" }),
    el("p", { text: "Twenty questions drawn at random from all sixteen missions, answers shuffled. Score 16 or more, with all sixteen badges, to become a CoolCairo Super Expert." }),
  ]));
  const box = el("div");
  view.append(box);
  const pool = CHAPTERS.flatMap((c) => c.quiz.map((q) => ({ ...q, from: c.title })));
  const start = () => {
    const qs = shuffle(pool).slice(0, 20).map((q) => ({ ...q, why: `${q.why} <span class="muted">(Mission: ${q.from})</span>` }));
    runQuiz(box, qs, {
      shuffleOpts: true,
      onFinish(score) {
        const gain = Math.max(0, score - state.exam.best) * 15;
        if (score > state.exam.best) { state.exam.best = score; save(); }
        if (gain) addXP(gain, "Exam best improved");
        const done = Object.keys(state.done).length;
        setTimeout(() => {
          if (score >= 16) box.prepend(el("div", { class: "cert" }, [
            el("div", { class: "eyebrow", text: "CoolCairo Academy" }),
            el("h2", { text: done >= 16 ? "Super Expert" : "Exam passed" }),
            el("p", { text: done >= 16 ? `Certified: ${score}/20 on the expert exam with all sixteen badges. You can explain and defend every part of CoolCairo.` : `You scored ${score}/20. Earn the remaining ${16 - done} badges to become a Super Expert.` }),
          ]));
        }, 0);
        return score >= 16 ? "Passed. Every explanation above links back to its mission." : `You need 16 to pass. Revisit the missions named in the explanations.`;
      },
    });
  };
  box.append(el("div", { class: "quiz" }, [el("div", { class: "result" }, [
    el("div", { class: "big", text: state.exam.best ? `${state.exam.best}/20` : "20 Qs" }),
    el("p", { text: state.exam.best ? "Your best score so far. Each attempt draws new questions." : "About 10 minutes. You can retake it as often as you like." }),
    el("button", { class: "btn primary", text: "Start the exam", onclick: start }),
  ])]));
}

// ---------- glossary ----------
function renderGlossary(filter = "") {
  const f = filter.trim().toLowerCase();
  const list = $("#glossList");
  list.innerHTML = "";
  for (const [term, meaning, m] of GLOSSARY) {
    if (f && !(term + " " + meaning).toLowerCase().includes(f)) continue;
    list.append(el("div", {}, [el("dt", { text: term }), el("dd", {}, [document.createTextNode(meaning + " "), el("a", { class: "go", href: `#m${m}`, text: `Mission ${m} →`, onclick: () => $("#glossDlg").close() })])]));
  }
  if (!list.children.length) list.append(el("p", { class: "muted", text: "No term matches. Try a shorter word." }));
}
$("#glossBtn").addEventListener("click", () => { renderGlossary($("#glossSearch").value); $("#glossDlg").showModal(); $("#glossSearch").focus(); });
$("#glossSearch").addEventListener("input", (e) => renderGlossary(e.target.value));
$("#glossDlg").addEventListener("click", (e) => { if (e.target.id === "glossDlg" || e.target.closest("[data-close]")) $("#glossDlg").close(); });
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "g" && !document.querySelector("dialog[open]") && !/INPUT|TEXTAREA/.test(e.target.tagName) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $("#glossBtn").click(); }
});

// ---------- theme ----------
$("#themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("coolcairo-academy-theme", root.dataset.theme); } catch { /* storage off */ }
  route();
});
try { const t = localStorage.getItem("coolcairo-academy-theme"); if (t) document.documentElement.dataset.theme = t; } catch { /* storage off */ }
