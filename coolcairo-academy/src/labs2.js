// Labs for Acts 3 and 4.

// ---------------------------------------------------------------- 9. regression recipe + fit the line
LABS.recipe = (box, api) => {
  const ING = [
    ["veg", "Vegetation", -3.15, "#548c45", 0.1], ["sand", "Sand", 3.36, "#d6b37d", 0.1], ["asph", "Asphalt", 0.12, "#55555c", 0.2],
    ["roof", "Roofs", 2.29, "#cfc6b4", 0.5], ["droof", "Dark roofs", -11.28, "#6a6a74", 0],
  ];
  const ctrls = ING.map(([id, n, , , v]) => ctl(`rc_${id}`, `${n} share`, 0, 1, 0.05, v, (x) => `${Math.round(x * 100)}%`));
  const ht = ctl("rc_h", "Average building height", 0, 40, 1, 15, (v) => `${v} m`);
  const out = ro("Predicted block temperature", "heat"), pale = ro("Pale ground (the rest)"), warn = el("div", { class: "note heat", hidden: true });
  const f = frame(640, 250, { l: 190, x: [-2.5, 2.5], y: [0, 7], b: 28 });
  const g = S("g"); f.svg.append(g);
  function update() {
    const v = Object.fromEntries(ING.map(([id], i) => [id, +ctrls[i].input.value]));
    if (v.droof > v.roof) { v.droof = v.roof; ctrls[4].input.value = v.roof; ctrls[4].out.textContent = `${Math.round(v.roof * 100)}%`; }
    const ground = v.veg + v.sand + v.asph, total = ground + v.roof;
    const over = total > 1.0001;
    const parts = [["Starting value (pale ground)", 45.83, "var(--muted)"], ...ING.map(([id, n, c, col]) => [`${n} ${Math.round(v[id] * 100)}% × ${fmt(c, 2)}`, c * v[id], col]), [`Height ${ht.input.value} m × ${MINUS}0.062`, -0.062 * +ht.input.value, "#8aa0b8"]];
    const T = parts.reduce((s, p) => s + p[1], 0);
    out.b.textContent = `${T.toFixed(2)} °C`;
    pale.b.textContent = over ? "over 100%!" : `${Math.round((1 - total) * 100)}%`;
    warn.hidden = !(v.droof > 0) && !over;
    warn.innerHTML = over ? "<b>The shares add up to more than 100%.</b> Lower one so the block is physically possible." : `<b>Dark roofs make this block ${fmt(11.28 * v.droof, 2)} °C cooler in the formula:</b> physically impossible. The sign check catches it, and the app uses published physics for cool roofs instead.`;
    g.innerHTML = "";
    gridX({ ...f, svg: g }, [-2, -1, 0, 1, 2], (x) => `${x > 0 ? "+" : ""}${x} °C`);
    parts.slice(1).forEach(([n, val, col], i) => {
      const y = f.Y(6 - i) - 10;
      g.append(S("text", { x: f.l - 8, y: y + 14, "text-anchor": "end", "font-size": 11, fill: "var(--ink)", text: n }));
      const x0 = f.X(0), x1 = f.X(clamp(val, -2.5, 2.5));
      g.append(S("rect", { x: Math.min(x0, x1), y, width: Math.max(1, Math.abs(x1 - x0)), height: 18, rx: 3, fill: col, stroke: "var(--line)" }));
      g.append(S("text", { x: val >= 0 ? x1 + 5 : x1 - 5, y: y + 13, "text-anchor": val >= 0 ? "start" : "end", "font-size": 11, fill: "var(--muted)", text: `${val >= 0 ? "+" : MINUS}${Math.abs(val).toFixed(2)}` }));
    });
    g.append(S("line", { x1: f.X(0), x2: f.X(0), y1: f.t, y2: f.h - f.b, stroke: "var(--ink)", opacity: 0.4 }));
  }
  [...ctrls, ht].forEach((c) => c.input.addEventListener("input", () => { update(); api.award("Lab: cooked a block"); }));
  update();

  // fit the line by hand
  const rand = mulberry32(21);
  const pts = Array.from({ length: 34 }, () => { const x = rand() * 0.8; return [x, 45.0 + 3.4 * x + gauss(rand) * 0.9]; });
  const n = pts.length, mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  const bOLS = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), aOLS = my - bOLS * mx;
  const sse = (a, b) => pts.reduce((s, p) => s + (p[1] - (a + b * p[0])) ** 2, 0);
  const best = sse(aOLS, bOLS);
  const lf = frame(640, 280, { x: [0, 0.8], y: [42, 50.5], b: 34 });
  gridY(lf, [42, 44, 46, 48, 50], (v) => `${v}°`);
  gridX(lf, [0, 0.2, 0.4, 0.6, 0.8], (v) => `${Math.round(v * 100)}%`);
  lf.svg.append(S("text", { x: lf.w / 2, y: lf.h - 2, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", text: "sand share of the block (made-up blocks)" }));
  const resid = S("g"); lf.svg.append(resid);
  pts.forEach((p) => lf.svg.append(S("circle", { cx: lf.X(p[0]), cy: lf.Y(p[1]), r: 4, fill: "var(--heat)", opacity: 0.85 })));
  const line = S("line", { stroke: "var(--cool)", "stroke-width": 3 }), olsLine = S("line", { stroke: "var(--gold)", "stroke-width": 2, "stroke-dasharray": "6 5", visibility: "hidden" });
  lf.svg.append(line, olsLine);
  const ia = ctl("ftA", "Starting value (intercept)", 42, 48, 0.05, 46.5, (v) => `${v.toFixed(2)} °C`);
  const ib = ctl("ftB", "Slope: °C per whole block of sand", -2, 8, 0.05, 0, (v) => fmt(v, 2));
  const yours = ro("Your squared misses"), comp = ro("Least squares (best possible)", "gold"), grade = el("p", { class: "note" });
  function lupd() {
    const a = +ia.input.value, b = +ib.input.value;
    line.setAttribute("x1", lf.X(0)); line.setAttribute("y1", lf.Y(a)); line.setAttribute("x2", lf.X(0.8)); line.setAttribute("y2", lf.Y(a + b * 0.8));
    resid.innerHTML = "";
    pts.forEach((p) => resid.append(S("line", { x1: lf.X(p[0]), x2: lf.X(p[0]), y1: lf.Y(p[1]), y2: lf.Y(a + b * p[0]), stroke: "var(--muted)", opacity: 0.6 })));
    const s = sse(a, b);
    yours.b.textContent = s.toFixed(1); comp.b.textContent = best.toFixed(1);
    const ratio = s / best;
    grade.innerHTML = ratio < 1.05 ? `<b>As good as least squares.</b> Your slope ${fmt(b, 2)} vs the computer's ${fmt(bOLS, 2)}; CoolCairo's real sand coefficient is +3.36.` : `Your misses are <b>${((ratio - 1) * 100).toFixed(0)}%</b> bigger than the best line. Least squares finds the line that makes the grey miss lines, squared and added, as small as possible.`;
    if (ratio < 1.05) api.award("Lab: matched least squares");
  }
  ia.input.addEventListener("input", lupd); ib.input.addEventListener("input", lupd); lupd();
  const reveal = el("button", { class: "btn small", text: "Show the least-squares line", onclick: () => { olsLine.setAttribute("x1", lf.X(0)); olsLine.setAttribute("y1", lf.Y(aOLS)); olsLine.setAttribute("x2", lf.X(0.8)); olsLine.setAttribute("y2", lf.Y(aOLS + bOLS * 0.8)); olsLine.setAttribute("visibility", "visible"); } });
  void n;
  box.append(
    el("div", { class: "lab-row" }, [el("div", { class: "lab-ctrl" }, [...ctrls.map((c) => c.wrap), ht.wrap]), el("div", { class: "lab-ctrl" }, [el("div", { class: "readout" }, [out.wrap, pale.wrap]), warn])]),
    el("div", { class: "viz-box" }, f.svg),
    el("h3", { text: "Fit the line yourself" }),
    el("div", { class: "lab-row" }, [el("div", { class: "viz-box" }, lf.svg), el("div", { class: "lab-ctrl" }, [ia.wrap, ib.wrap, el("div", { class: "readout" }, [yours.wrap, comp.wrap]), grade, reveal])]),
  );
};

// ---------------------------------------------------------------- 10. R² and MAE
LABS.score = (box, api) => {
  const rand = mulberry32(31), N = 140, M = 45.7, SD = 1.9;
  const z = Array.from({ length: N }, () => gauss(rand)), w = Array.from({ length: N }, () => gauss(rand));
  const zs = (() => { const m = mean(z), s = Math.sqrt(mean(z.map((v) => (v - m) ** 2))); return z.map((v) => (v - m) / s); })();
  const obs = zs.map((v) => M + SD * v);
  const f = frame(420, 360, { x: [40, 52], y: [40, 52], b: 34, l: 40 });
  gridY(f, [40, 42, 44, 46, 48, 50, 52], (v) => `${v}`); gridX(f, [40, 42, 44, 46, 48, 50, 52], (v) => `${v}`);
  f.svg.append(S("text", { x: f.w / 2, y: f.h - 2, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", text: "real block temperature (°C)" }));
  f.svg.append(S("line", { x1: f.X(40), y1: f.Y(40), x2: f.X(52), y2: f.Y(52), stroke: "var(--ink)", "stroke-dasharray": "4 4", opacity: 0.5 }));
  f.svg.append(S("line", { x1: f.X(40), y1: f.Y(M), x2: f.X(52), y2: f.Y(M), stroke: "var(--heat)", "stroke-dasharray": "2 4" }));
  f.svg.append(S("text", { x: f.X(51.8), y: f.Y(M) - 5, "text-anchor": "end", "font-size": 10, fill: "var(--heat)", text: "lazy guess: the average" }), S("text", { x: f.X(51.5), y: f.Y(51.2), "text-anchor": "end", "font-size": 10, fill: "var(--muted)", text: "perfect 1:1" }));
  const dots = obs.map(() => S("circle", { r: 3.4, fill: "var(--cool)", opacity: 0.75 }));
  f.svg.append(...dots);
  const bars = frame(420, 140, { x: [0, 1], y: [0, 2], l: 120, b: 10 });
  const bLazy = S("rect", { x: bars.X(0), y: bars.Y(1.7), height: 26, rx: 4, fill: "var(--heat)" }), bModel = S("rect", { x: bars.X(0), y: bars.Y(0.8), height: 26, rx: 4, fill: "var(--cool)" });
  bars.svg.append(S("text", { x: bars.l - 8, y: bars.Y(1.7) + 17, "text-anchor": "end", "font-size": 11, fill: "var(--ink)", text: "lazy guess misses²" }), S("text", { x: bars.l - 8, y: bars.Y(0.8) + 17, "text-anchor": "end", "font-size": 11, fill: "var(--ink)", text: "model misses²" }), bLazy, bModel);
  const sk = ctl("scR", "Model skill (how much it explains)", 0, 0.95, 0.01, 0.25, (v) => v.toFixed(2));
  const r2 = ro("R² (hidden areas)", "gold"), mae = ro("MAE", "cool"), spread = ro("Typical spread of blocks"), sq = ro("Spread of predictions");
  const msg = el("p", { class: "note" });
  function update() {
    const R = Math.sqrt(+sk.input.value);
    const x = zs.map((v, i) => R * v + Math.sqrt(1 - R * R) * w[i]);
    const pred = x.map((v) => M + SD * R * v);
    const sseM = obs.reduce((s, o, i) => s + (o - pred[i]) ** 2, 0), sst = obs.reduce((s, o) => s + (o - M) ** 2, 0);
    const R2 = 1 - sseM / sst;
    dots.forEach((d, i) => { d.setAttribute("cx", f.X(obs[i])); d.setAttribute("cy", f.Y(clamp(pred[i], 40, 52))); });
    r2.b.textContent = R2.toFixed(2); mae.b.textContent = `±${mean(obs.map((o, i) => Math.abs(o - pred[i]))).toFixed(2)} °C`;
    spread.b.textContent = `±${mean(obs.map((o) => Math.abs(o - M))).toFixed(2)} °C`;
    sq.b.textContent = `±${mean(pred.map((p) => Math.abs(p - M))).toFixed(2)} °C`;
    bLazy.setAttribute("width", bars.X(1) - bars.X(0)); bModel.setAttribute("width", Math.max(2, (bars.X(1) - bars.X(0)) * (sseM / sst)));
    msg.innerHTML = Math.abs(R2 - 0.25) < 0.03 ? "<b>This is CoolCairo.</b> The model removes a quarter of the lazy guess's error. See how the dots are <b>squeezed</b> towards the average: hot blocks predicted too cool, cool blocks too hot." : R2 > 0.8 ? "A strong model: dots hug the 1:1 line. Real urban heat has many causes not in the recipe (wind, moisture, exact materials), so 0.25 on hidden areas is realistic." : "Move the skill and watch the blue bar shrink against the orange one. R² is 1 minus their ratio.";
  }
  sk.input.addEventListener("input", () => { update(); api.award("Lab: scored a model"); });
  update();
  box.append(el("div", { class: "lab-row" }, [el("div", { class: "viz-box" }, f.svg), el("div", { class: "lab-ctrl" }, [sk.wrap,
    el("button", { class: "btn small", text: "Set to CoolCairo (R² 0.25)", onclick: () => { sk.input.value = 0.25; sk.input.dispatchEvent(new Event("input")); } }),
    el("div", { class: "readout" }, [r2.wrap, mae.wrap, spread.wrap, sq.wrap]), el("div", { class: "viz-box" }, bars.svg), msg])]));
};

// ---------------------------------------------------------------- 11. spatial cross-validation
LABS.spatialcv = (box, api) => {
  const N = 18, T = 3; // 18 × 18 blocks, tiles of 3 × 3 blocks = "1 km squares" in this toy
  const rand = mulberry32(17);
  const hot = Array.from({ length: 7 }, () => ({ x: rand() * N, y: rand() * N, a: (rand() - 0.4) * 5, s: 2 + rand() * 4 }));
  const field = Array.from({ length: N * N }, (_, i) => { const x = i % N, y = Math.floor(i / N); return 45.7 + hot.reduce((s, h) => s + h.a * Math.exp(-((x - h.x) ** 2 + (y - h.y) ** 2) / (2 * h.s * h.s)), 0) + gauss(rand) * 0.35; });
  const tileGroup = Array.from({ length: (N / T) ** 2 }, (_, i) => i % 5);
  const tg = shuffle(tileGroup, mulberry32(3));
  const groupOf = { spatial: field.map((_, i) => tg[Math.floor((i % N) / T) + (N / T) * Math.floor(Math.floor(i / N) / T)]), random: shuffle(field.map((_, i) => i % 5), mulberry32(9)) };
  let mode = "random", roundI = 0;
  const preds = { random: new Array(N * N).fill(null), spatial: new Array(N * N).fill(null) };
  const scores = { random: null, spatial: null };
  // "Copy the nearest learned block" model (k = 4 nearest neighbours, inverse distance).
  function predict(i, train) {
    const x = i % N, y = Math.floor(i / N);
    const near = train.map((j) => ({ j, d: Math.hypot((j % N) - x, Math.floor(j / N) - y) })).sort((a, b) => a.d - b.d).slice(0, 4);
    const wsum = near.reduce((s, n) => s + 1 / n.d, 0);
    return near.reduce((s, n) => s + field[n.j] / n.d, 0) / wsum;
  }
  const cv = el("canvas", { class: "viz", width: 360, height: 360, style: "aspect-ratio:1;max-width:380px" });
  const ctx = cv.getContext("2d");
  function draw() {
    const c = 20;
    for (let i = 0; i < N * N; i++) { ctx.fillStyle = heatColor((field[i] - 42.5) / 6.5); ctx.fillRect((i % N) * c, Math.floor(i / N) * c, c, c); }
    if (mode === "spatial") { ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.5; for (let k = 0; k <= N; k += T) { ctx.beginPath(); ctx.moveTo(k * c, 0); ctx.lineTo(k * c, N * c); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k * c); ctx.lineTo(N * c, k * c); ctx.stroke(); } }
    if (roundI > 0 && roundI <= 5) {
      const g = roundI - 1;
      for (let i = 0; i < N * N; i++) if (groupOf[mode][i] === g) { ctx.fillStyle = "rgba(10,15,25,0.55)"; ctx.fillRect((i % N) * c, Math.floor(i / N) * c, c, c); ctx.strokeStyle = "#f06a35"; ctx.lineWidth = 2; ctx.strokeRect((i % N) * c + 1, Math.floor(i / N) * c + 1, c - 2, c - 2); }
    }
  }
  const r2r = ro("R² · random folds", "bad"), r2s = ro("R² · spatial folds (1 km squares)", "good"), roundR = ro("Round");
  const msg = el("div", { class: "note" });
  const step = el("button", { class: "btn primary small", text: "Run round 1" });
  function r2of(p) { const o = field, m = mean(o); return 1 - o.reduce((s, v, i) => s + (v - p[i]) ** 2, 0) / o.reduce((s, v) => s + (v - m) ** 2, 0); }
  function updateText() {
    roundR.b.textContent = roundI === 0 ? "—" : `${Math.min(roundI, 5)} / 5`;
    r2r.b.textContent = scores.random == null ? "run it" : scores.random.toFixed(2);
    r2s.b.textContent = scores.spatial == null ? "run it" : scores.spatial.toFixed(2);
    step.textContent = roundI >= 5 ? "Reset this exam" : `Run round ${roundI + 1}`;
    msg.innerHTML = scores.random != null && scores.spatial != null
      ? `<b>Same model, two exams.</b> Random folds: R² ${scores.random.toFixed(2)}. Hidden squares: ${scores.spatial.toFixed(2)}. The gap is leakage: with random folds every hidden block has learned neighbours to copy from.`
      : mode === "random" ? "Random folds: hidden blocks (dark, outlined) are scattered, so each sits next to learned blocks." : "Spatial folds: whole 3 × 3 squares are hidden together, like CoolCairo's 1 km squares. The model must predict areas it never saw.";
  }
  step.addEventListener("click", () => {
    if (roundI >= 5) { roundI = 0; preds[mode].fill(null); draw(); updateText(); return; }
    const g = roundI;
    const train = []; for (let i = 0; i < N * N; i++) if (groupOf[mode][i] !== g) train.push(i);
    for (let i = 0; i < N * N; i++) if (groupOf[mode][i] === g) preds[mode][i] = predict(i, train);
    roundI++;
    if (roundI === 5) { scores[mode] = r2of(preds[mode]); if (scores.random != null && scores.spatial != null) api.award("Lab: both exams run"); }
    draw(); updateText();
  });
  const modes = seg([["random", "Random folds"], ["spatial", "Spatial folds"]], mode, (v) => { mode = v; roundI = 0; draw(); updateText(); });
  draw(); updateText();
  box.append(el("div", { class: "lab-row" }, [el("div", { class: "viz-box", style: "padding:10px;justify-self:start" }, cv),
    el("div", { class: "lab-ctrl" }, [el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "Exam type" }), modes]), step, el("div", { class: "readout" }, [roundR.wrap, r2r.wrap, r2s.wrap]), msg,
      el("p", { class: "hint", text: "Toy city: colours are block temperatures. The 'model' predicts a hidden block from its four nearest learned blocks, which is exactly how neighbour leakage inflates scores." })])]));
};

// ---------------------------------------------------------------- 12. albedo + targeting
LABS.targeting = (box, api) => {
  // albedo physics
  const a0 = ctl("alB", "Albedo before", 0.05, 0.5, 0.01, 0.12, (v) => v.toFixed(2));
  const a1 = ctl("alA", "Albedo after coating", 0.2, 0.9, 0.01, 0.7, (v) => v.toFixed(2));
  const dT = ro("Surface change, fully treated", "cool"), airR = ro("City-wide air effect (rough)", "muted");
  function aupd() { const d = -8 * (+a1.input.value - +a0.input.value); dT.b.textContent = `${fmt(d, 2)} °C`; const da = (+a1.input.value - +a0.input.value) / 0.1; airR.b.textContent = `${fmt(-0.1 * da, 1)} to ${fmt(-0.33 * da, 1)} °C`; }
  a0.input.addEventListener("input", aupd); a1.input.addEventListener("input", aupd); aupd();

  // toy district: 12 × 12 blocks, Nasr-City-like (hot north edge and a few hotspots, most blocks below the line)
  const N = 12, LINE = 45.66, rand = mulberry32(8);
  const B = Array.from({ length: N * N }, (_, i) => {
    const x = i % N, y = Math.floor(i / N);
    const edge = y === 0 ? 2.4 : y === 1 ? 1.2 : 0;
    const spot = (Math.hypot(x - 9, y - 4) < 1.5 ? 2.2 : 0) + (Math.hypot(x - 1, y - 10) < 1.6 ? 1.6 : 0);
    const t = 44.4 + edge + spot + gauss(rand) * 0.55;
    const roof = 0.15 + rand() * 0.4, dark = roof * rand() * 0.3, sand = clamp(0.05 + (t - 44) * 0.08 + rand() * 0.15, 0, 0.6);
    return { t, pop: Math.round(60 + Math.exp(gauss(rand) * 0.6 + 4.6)), dark, pale: roof - dark, sand, on: false };
  });
  const effect = (b) => -4.64 * b.dark - 3.6 * b.pale - 6.51 * 0.5 * b.sand;
  const area = (b) => (b.dark + b.pale + 0.5 * b.sand) * 0.81; // ha (block = 0.81 ha)
  const expo = (useOn, set) => B.reduce((s, b, i) => s + b.pop * Math.max(0, b.t + ((set ? set.has(i) : useOn && b.on) ? effect(b) : 0) - LINE), 0);
  const base = expo(false);
  const cv = el("canvas", { class: "viz", width: 360, height: 360, style: "aspect-ratio:1;max-width:380px;cursor:pointer" });
  const ctx = cv.getContext("2d");
  let view = "risk";
  function draw() {
    const c = 30, maxE = Math.max(...B.map((b) => b.pop * Math.max(0, b.t - LINE)));
    B.forEach((b, i) => {
      const t = b.t + (b.on ? effect(b) : 0), e = b.pop * Math.max(0, t - LINE);
      ctx.fillStyle = view === "heat" ? heatColor((t - 42) / 7) : e <= 0 ? "#6b7a93" : `rgb(${Math.round(lerp(253, 84, e / maxE))} ${Math.round(lerp(217, 18, e / maxE))} ${Math.round(lerp(158, 102, e / maxE))})`;
      ctx.fillRect((i % N) * c, Math.floor(i / N) * c, c, c);
      if (b.on) { ctx.strokeStyle = "#a8eeff"; ctx.lineWidth = 3; ctx.strokeRect((i % N) * c + 3, Math.floor(i / N) * c + 3, c - 6, c - 6); }
    });
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1; for (let k = 0; k <= 360; k += c) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 360); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(360, k); ctx.stroke(); }
  }
  const eNow = ro("Heat exposure", "gold"), pct = ro("Change vs today", "good"), nOn = ro("Blocks treated"), haR = ro("Area coated or greened");
  const above = B.filter((b) => b.t > LINE).length;
  const tbody = el("tbody");
  const results = {};
  function upd() {
    const e = expo(true), on = B.filter((b) => b.on);
    eNow.b.textContent = `${fint(e)} p·°C`; pct.b.textContent = `${base ? fmt((100 * (e - base)) / base, 0) : 0}%`;
    nOn.b.textContent = `${on.length} of ${N * N}`; haR.b.textContent = `${on.reduce((s, b) => s + area(b), 0).toFixed(1)} ha`;
    draw();
  }
  function apply(name, set) {
    B.forEach((b, i) => (b.on = set.has(i)));
    const e = expo(true);
    results[name] = { blocks: set.size, ha: [...set].reduce((s, i) => s + area(B[i]), 0), pct: (100 * (e - base)) / base };
    tbody.innerHTML = "";
    for (const [n, r] of Object.entries(results)) tbody.append(el("tr", {}, [el("td", { text: n }), el("td", { class: "n", text: r.blocks }), el("td", { class: "n", text: `${r.ha.toFixed(1)} ha` }), el("td", { class: "n", text: `${fmt(r.pct, 0)}%` })]));
    upd();
    if (Object.keys(results).length >= 3) api.award("Lab: knowing where pays");
  }
  const ranked = B.map((b, i) => i).sort((i, j) => B[j].pop * Math.max(0, B[j].t - LINE) - B[i].pop * Math.max(0, B[i].t - LINE) || B[j].t - B[i].t);
  const btns = el("div", { class: "seg" }, [
    el("button", { type: "button", text: "Riskiest third", onclick: () => apply("Riskiest third", new Set(ranked.slice(0, Math.floor(N * N / 3)))) }),
    el("button", { type: "button", text: `Only the ${above} hot blocks`, onclick: () => apply(`Only the ${above} blocks above the line`, new Set(B.map((b, i) => i).filter((i) => B[i].t > LINE))) }),
    el("button", { type: "button", text: "Every block", onclick: () => apply("Every block", new Set(B.map((_, i) => i))) }),
    el("button", { type: "button", text: "Random third", onclick: () => {
      const r = mulberry32(99), runs = [];
      for (let k = 0; k < 200; k++) { const s = new Set(shuffle([...Array(N * N).keys()], r).slice(0, Math.floor(N * N / 3))); runs.push({ s, e: expo(false, s) }); }
      runs.sort((a, b) => a.e - b.e); apply("Random third (median of 200)", runs[100].s);
    } }),
    el("button", { type: "button", text: "Clear", onclick: () => { B.forEach((b) => (b.on = false)); upd(); } }),
  ]);
  cv.addEventListener("click", (e) => { const r = cv.getBoundingClientRect(); const x = Math.floor(((e.clientX - r.left) / r.width) * N), y = Math.floor(((e.clientY - r.top) / r.height) * N); const b = B[y * N + x]; if (b) { b.on = !b.on; upd(); api.award("Lab: planned blocks"); } });
  const views = seg([["risk", "Heat risk"], ["heat", "Surface heat"]], view, (v) => { view = v; draw(); });
  upd();
  box.append(
    el("h3", { text: "Albedo: paint it white" }),
    el("div", { class: "lab-row" }, [el("div", { class: "lab-ctrl" }, [a0.wrap, a1.wrap]), el("div", { class: "lab-ctrl" }, [el("div", { class: "readout" }, [dT.wrap, airR.wrap]), el("p", { class: "hint", text: "−8 °C per unit of albedo (Wang, Huang & Li 2020). Dark roof 0.12 → 0.70 gives −4.64 °C; asphalt 0.12 → 0.40 gives −2.24 °C. Air changes far less, and only when a whole city does it." })])]),
    el("h3", { text: "Plan a toy district: cool roofs + pocket parks" }),
    el("div", { class: "lab-row" }, [el("div", { class: "lab-ctrl" }, [el("div", { class: "viz-box", style: "padding:10px;justify-self:start" }, cv), views]),
      el("div", { class: "lab-ctrl" }, [el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "Try each strategy (or click blocks)" }), btns]), el("div", { class: "readout" }, [eNow.wrap, pct.wrap, nOn.wrap, haR.wrap]),
        el("div", { class: "table-wrap" }, el("table", { class: "t" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Strategy" }), el("th", { class: "n", text: "Blocks" }), el("th", { class: "n", text: "Area" }), el("th", { class: "n", text: "Exposure" })])), tbody])),
        el("p", { class: "hint", text: `Toy district: ${above} of 144 blocks are above the 45.66 °C heat line. Grey blocks carry no excess heat. The real Nasr City result: 106 hot blocks, −74% for the riskiest third, every block or only the hot blocks; −25% for a random third.` })])]),
  );
};

// ---------------------------------------------------------------- 13. hyperspectral
LABS.hyper = (box, api) => {
  const S2 = [[0.458, 0.523], [0.543, 0.578], [0.65, 0.68], [0.785, 0.9], [1.565, 1.655], [2.1, 2.28]];
  const lam = []; for (let l = 0.42; l <= 2.45; l += 0.01) lam.push(+l.toFixed(3));
  const base = (l) => 0.28 + 0.06 * Math.sin(l * 2.2) + 0.03 * l;
  // Material B has narrow features placed inside S-2 bands that average out, and others between bands.
  const feat = (l) => -0.09 * Math.exp(-(((l - 2.2) / 0.012) ** 2)) + 0.09 * Math.exp(-(((l - 2.16) / 0.012) ** 2)) - 0.08 * Math.exp(-(((l - 1.2) / 0.03) ** 2)) - 0.07 * Math.exp(-(((l - 0.95) / 0.02) ** 2)) - 0.06 * Math.exp(-(((l - 2.34) / 0.02) ** 2));
  const A = lam.map((l) => (l > 1.35 && l < 1.45) || (l > 1.8 && l < 1.95) ? null : base(l));
  const Bm = lam.map((l, i) => (A[i] == null ? null : base(l) + feat(l)));
  const avg = (arr, [a, b]) => mean(lam.map((l, i) => (l >= a && l <= b && arr[i] != null ? arr[i] : null)).filter((v) => v != null));
  const f = frame(640, 260, { x: [0.42, 2.45], y: [0.1, 0.5], b: 34 });
  gridY(f, [0.1, 0.2, 0.3, 0.4, 0.5], (v) => v.toFixed(1)); gridX(f, [0.5, 1, 1.5, 2, 2.4], (v) => `${v} µm`);
  const g = S("g"); f.svg.append(g);
  let mode = "s2";
  function draw() {
    g.innerHTML = "";
    if (mode === "s2") {
      S2.forEach((bd) => {
        g.append(S("rect", { x: f.X(bd[0]), y: f.t, width: f.X(bd[1]) - f.X(bd[0]), height: f.h - f.t - f.b, fill: "var(--cool)", opacity: 0.12 }));
        g.append(S("line", { x1: f.X(bd[0]), x2: f.X(bd[1]), y1: f.Y(avg(A, bd)), y2: f.Y(avg(A, bd)), stroke: "#d6b37d", "stroke-width": 6, "stroke-linecap": "round" }));
        g.append(S("line", { x1: f.X(bd[0]), x2: f.X(bd[1]), y1: f.Y(avg(Bm, bd)), y2: f.Y(avg(Bm, bd)), stroke: "#9c6ade", "stroke-width": 2.5, "stroke-dasharray": "4 3" }));
      });
    } else {
      const seg2 = (arr, col, dash) => { let d = ""; arr.forEach((v, i) => { if (v == null) return; d += `${d && arr[i - 1] != null ? "L" : "M"}${f.X(lam[i])},${f.Y(v)}`; }); g.append(S("path", { d, fill: "none", stroke: col, "stroke-width": 2.4, "stroke-dasharray": dash || null })); };
      seg2(A, "#d6b37d"); seg2(Bm, "#9c6ade", "5 3");
      for (let k = 0; k < 203; k++) g.append(S("line", { x1: f.X(0.42 + (k / 203) * 2.03), x2: f.X(0.42 + (k / 203) * 2.03), y1: f.h - f.b, y2: f.h - f.b - 5, stroke: "var(--muted)", opacity: 0.5 }));
    }
  }
  const modes = seg([["s2", "Sentinel-2: 6 wide bands"], ["en", "EnMAP: 203 narrow bands"]], mode, (v) => { mode = v; draw(); api.award("Lab: hyperspectral view"); });
  draw();

  // control experiment
  const cf = frame(640, 220, { l: 220, x: [0, 0.65], y: [0, 4], b: 30 });
  gridX(cf, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], (v) => v.toFixed(1));
  const ROWS = [["Real Sentinel-2 (6 bands)", 0.31, "#2a78d6"], ["EnMAP cut to Sentinel-2's 6", 0.33, "#9c6ade"], ["Full EnMAP (203 bands)", 0.53, "#f06a35"]];
  const ctrlBars = ROWS.map(([n, v, col], i) => {
    cf.svg.append(S("text", { x: cf.l - 8, y: cf.Y(3.3 - i * 1.15) + 16, "text-anchor": "end", "font-size": 11.5, fill: "var(--ink)", text: n }));
    const r = S("rect", { x: cf.X(0), y: cf.Y(3.3 - i * 1.15), width: 0, height: 24, rx: 4, fill: col });
    const t = S("text", { y: cf.Y(3.3 - i * 1.15) + 16, "font-size": 12, fill: "var(--ink)", text: "" });
    cf.svg.append(r, t); return { r, t, v };
  });
  let stepI = 0;
  const ctrlMsg = el("div", { class: "note" });
  const MSG = ["Press next to run the control experiment, one bar at a time.", "<b>Real Sentinel-2:</b> spectra alone explain block heat at R² 0.31.", "<b>EnMAP cut down to Sentinel-2's six bands:</b> same date and pixels as EnMAP, fewer bands. 0.33, about the same as real Sentinel-2. So the date and satellite are not the reason.", "<b>Full EnMAP:</b> 0.53. The only thing that changed from bar 2 is the number of bands, so <b>the gain comes from spectral detail</b>."];
  const nextBtn = el("button", { class: "btn primary small", text: "Next step" });
  function cupd() { ctrlBars.forEach((b, i) => { const on = i < stepI; b.r.setAttribute("width", on ? cf.X(b.v) - cf.X(0) : 0); b.t.setAttribute("x", cf.X(b.v) + 6); b.t.textContent = on ? b.v.toFixed(2) : ""; }); ctrlMsg.innerHTML = MSG[stepI]; nextBtn.textContent = stepI >= 3 ? "Replay" : "Next step"; }
  nextBtn.addEventListener("click", () => { stepI = stepI >= 3 ? 0 : stepI + 1; cupd(); if (stepI === 3) api.award("Lab: ran the control"); });
  cupd();

  // PCA demo: two correlated bands
  const rand = mulberry32(55);
  const P = Array.from({ length: 160 }, () => { const t = gauss(rand), n = gauss(rand) * 0.25; return [0.3 + 0.08 * t + 0.02 * n, 0.32 + 0.075 * t - 0.03 * n]; });
  const pf = frame(360, 300, { x: [0.05, 0.55], y: [0.05, 0.6], b: 34, l: 40 });
  gridX(pf, [0.1, 0.2, 0.3, 0.4, 0.5], (v) => v.toFixed(1)); gridY(pf, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], (v) => v.toFixed(1));
  pf.svg.append(S("text", { x: pf.w / 2, y: pf.h - 2, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", text: "band 120 reflectance" }));
  P.forEach((p) => pf.svg.append(S("circle", { cx: pf.X(p[0]), cy: pf.Y(p[1]), r: 2.8, fill: "var(--cool)", opacity: 0.7 })));
  const mx = mean(P.map((p) => p[0])), my = mean(P.map((p) => p[1]));
  const sxx = mean(P.map((p) => (p[0] - mx) ** 2)), syy = mean(P.map((p) => (p[1] - my) ** 2)), sxy = mean(P.map((p) => (p[0] - mx) * (p[1] - my)));
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(tr * tr / 4 - det), l2 = tr - l1;
  const ang = Math.atan2(l1 - sxx, sxy);
  const pc1 = S("line", { x1: pf.X(mx - Math.cos(ang) * 0.25), y1: pf.Y(my - Math.sin(ang) * 0.25), x2: pf.X(mx + Math.cos(ang) * 0.25), y2: pf.Y(my + Math.sin(ang) * 0.25), stroke: "var(--heat)", "stroke-width": 3, visibility: "hidden" });
  const pc2 = S("line", { x1: pf.X(mx + Math.sin(ang) * 0.06), y1: pf.Y(my - Math.cos(ang) * 0.06), x2: pf.X(mx - Math.sin(ang) * 0.06), y2: pf.Y(my + Math.cos(ang) * 0.06), stroke: "var(--gold)", "stroke-width": 3, visibility: "hidden" });
  pf.svg.append(pc1, pc2);
  const pcaR = ro("Variance captured by PC1", "heat");
  const pcaBtn = el("button", { class: "btn small", text: "Find the principal components", onclick: () => { pc1.setAttribute("visibility", "visible"); pc2.setAttribute("visibility", "visible"); pcaR.b.textContent = `${((100 * l1) / (l1 + l2)).toFixed(0)}%`; api.award("Lab: PCA"); } });

  box.append(
    el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "Sensor" }), modes]),
    el("div", { class: "viz-box" }, f.svg),
    el("div", { class: "legend-row" }, [el("span", { html: '<i style="background:#d6b37d"></i>Material A: pale concrete roof' }), el("span", { html: '<i style="background:#9c6ade"></i>Material B: dusty sand-covered roof (dashed)' })]),
    el("p", { class: "hint", text: "Through six wide bands, A and B look almost identical: their narrow features average out. Through 203 bands, the differences at 0.95, 1.2, 2.2 and 2.34 µm separate them. This is the pale-roof-or-sand problem CoolCairo hopes hyperspectral data can solve." }),
    el("h3", { text: "The control experiment" }),
    el("div", { class: "viz-box" }, cf.svg), ctrlMsg, nextBtn,
    el("h3", { text: "PCA: squeezing hundreds of bands" }),
    el("div", { class: "lab-row" }, [el("div", { class: "viz-box" }, pf.svg), el("div", { class: "lab-ctrl" }, [el("p", { class: "hint", text: "Neighbouring hyperspectral bands are strongly correlated, so most of their information lies along one direction. PCA finds those directions; a few components can stand in for 203 bands, which helps models stay stable." }), pcaBtn, el("div", { class: "readout" }, [pcaR.wrap])])]),
  );
};

// ---------------------------------------------------------------- 14. growth & cities
LABS.growth = (box, api) => {
  const N = 20, rand = mulberry32(14);
  // Cells near the city (left) are built before 2016; growth advances east, with leapfrog patches.
  const year = Array.from({ length: N * N }, (_, i) => {
    const x = i % N, y = Math.floor(i / N), d = x + gauss(rand) * 2 + (Math.abs(y - 10) > 6 ? 2 : 0);
    if (d < 8) return 2010; if (d < 14 && rand() < 0.75) return 2016 + Math.floor(rand() * 8); if (rand() < 0.06) return 2017 + Math.floor(rand() * 7); return 9999;
  });
  const cv = el("canvas", { class: "viz", width: 300, height: 300, style: "aspect-ratio:1;max-width:320px" });
  const ctx = cv.getContext("2d");
  const yr = ctl("grY", "Year", 2016, 2023, 1, 2016, (v) => v);
  const builtR = ro("Built-up blocks"), newR = ro("New since 2016", "heat"), areaR = ro("Toy built area");
  function draw() {
    const Y = +yr.input.value, c = 15;
    let built = 0, nw = 0;
    year.forEach((y, i) => {
      const b = y <= Y; if (b) built++; if (b && y >= 2016 && y !== 2010) nw++;
      ctx.fillStyle = !b ? "#a08f6c" : y === 2010 ? "#737a8a" : "#eb6834";
      ctx.fillRect((i % N) * c, Math.floor(i / N) * c, c, c);
    });
    ctx.strokeStyle = "rgba(0,0,0,0.12)"; for (let k = 0; k <= 300; k += c) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 300); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(300, k); ctx.stroke(); }
    builtR.b.textContent = built; newR.b.textContent = nw; areaR.b.textContent = `${(built * 0.0081).toFixed(2)} km²`;
  }
  yr.input.addEventListener("input", () => { draw(); api.award("Lab: watched a city grow"); });
  draw();
  // temperatures by class (real)
  const tf = frame(420, 200, { l: 150, x: [44, 49.5], y: [0, 4], b: 28 });
  gridX(tf, [44, 45, 46, 47, 48, 49], (v) => `${v}°`);
  [["Built before 2016", 46.0, "#737a8a"], ["Built 2016–23", 46.9, "#eb6834"], ["Still open desert", 48.6, "#a08f6c"]].forEach(([n, v, col], i) => {
    const y = tf.Y(3.4 - i * 1.15);
    tf.svg.append(S("text", { x: tf.l - 8, y: y + 15, "text-anchor": "end", "font-size": 11.5, fill: "var(--ink)", text: n }), S("rect", { x: tf.X(44), y, width: tf.X(v) - tf.X(44), height: 22, rx: 4, fill: col }), S("text", { x: tf.X(v) + 6, y: y + 15, "font-size": 12, fill: "var(--ink)", text: `${v} °C` }));
  });
  tf.svg.append(S("line", { x1: tf.X(45.66), x2: tf.X(45.66), y1: tf.t, y2: tf.h - tf.b, stroke: "var(--ink)", "stroke-dasharray": "4 3" }));
  // cities (real)
  const CITIES = [["Cairo", 0.25, 0.40, 0.58, 44.6], ["Algiers", 0.16, 0.26, 0.49, 40.3], ["Casablanca", 0.20, null, null, 42.3], ["Dubai", 0.17, 0.31, 0.63, 49.5], ["Riyadh", 0.25, 0.37, 0.52, 52.2]];
  const cf = frame(640, 260, { x: [0, 5], y: [0, 0.7], b: 46 });
  gridY(cf, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7], (v) => v.toFixed(1));
  CITIES.forEach(([n, m, s2, en, typ], i) => {
    const x = cf.X(i + 0.18), w = (cf.X(1) - cf.X(0)) * 0.2;
    [[m, "#8aa0b8"], [s2, "#2a78d6"], [en, "#f06a35"]].forEach(([v, col], k) => { if (v == null) { cf.svg.append(S("text", { x: x + k * w + w / 2, y: cf.Y(0.03), "text-anchor": "middle", "font-size": 9, fill: "var(--muted)", text: "n/a" })); return; } cf.svg.append(S("rect", { x: x + k * w, y: cf.Y(v), width: w - 3, height: cf.Y(0) - cf.Y(v), rx: 2, fill: col })); cf.svg.append(S("text", { x: x + k * w + w / 2 - 1, y: cf.Y(v) - 4, "text-anchor": "middle", "font-size": 9.5, fill: "var(--ink)", text: v.toFixed(2) })); });
    cf.svg.append(S("text", { x: cf.X(i + 0.5), y: cf.h - 26, "text-anchor": "middle", "font-size": 11.5, fill: "var(--ink)", text: n }), S("text", { x: cf.X(i + 0.5), y: cf.h - 12, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)", text: `typical ${typ} °C` }));
  });
  box.append(
    el("div", { class: "lab-row" }, [el("div", { class: "lab-ctrl" }, [el("div", { class: "viz-box", style: "padding:10px;justify-self:start" }, cv), yr.wrap,
      el("div", { class: "legend-row" }, [el("span", { html: '<i style="background:#737a8a"></i>Built before 2016' }), el("span", { html: '<i style="background:#eb6834"></i>New since 2016' }), el("span", { html: '<i style="background:#a08f6c"></i>Open desert' })])]),
      el("div", { class: "lab-ctrl" }, [el("div", { class: "readout" }, [builtR.wrap, newR.wrap, areaR.wrap]), el("span", { class: "eyebrow", text: "Real east Cairo temperatures by class" }), el("div", { class: "viz-box" }, tf.svg),
        el("p", { class: "hint", text: "Dashed line: the 45.66 °C heat line. After allowing for building cover, sand and vegetation, the new-vs-old gap is about +0.2 °C." })])]),
    el("h3", { text: "Five test cities, same pipeline" }),
    el("div", { class: "viz-box" }, cf.svg),
    el("div", { class: "legend-row" }, [el("span", { html: '<i style="background:#8aa0b8"></i>App model R²' }), el("span", { html: '<i style="background:#2a78d6"></i>+ Sentinel-2' }), el("span", { html: '<i style="background:#f06a35"></i>+ EnMAP' }), el("span", { text: "Casablanca had no cloud-free EnMAP scene." })]),
  );
};

// ---------------------------------------------------------------- 15. claim checker
LABS.claims = (box, api) => {
  const CLAIMS = [
    ["CoolCairo proves that cool roofs lower Cairo's air temperature by 4 °C.", false, "Overclaim twice: it is a model scenario, and it is surface temperature. Air changes roughly 0.1–0.33 °C per +0.1 albedo, city-wide."],
    ["The heat model explains about a quarter of the differences between blocks, tested on whole areas it never saw.", true, "Supported: R² 0.25 with spatial cross-validation on hidden 1 km squares."],
    ["Targeting the riskiest third cuts more heat exposure than treating every block.", false, "Overclaim: every block also gives −74%. Targeting gives the same cut with far less area: 'knowing where pays'."],
    ["We know the temperature of every building in Nasr City.", false, "Overclaim: the heat sensor sees ~100 m, so results are per 90 m block only."],
    ["Hyperspectral EnMAP explained block heat better than Sentinel-2 in every test city with a scene.", true, "Supported: Cairo, Algiers, Dubai and Riyadh, different seasons and years."],
    ["Dark roofs are cooler than pale roofs in Cairo.", false, "Unsupported: the coefficient fails the sign check. Cause not confirmed; dark roofs cover only ~0.5% of an urban block."],
    ["Material labels agree with high-resolution imagery at 89% of 18 checked points, in a check that was not blind.", true, "Supported and honestly phrased. A blind repeat is the next step."],
    ["Heat exposure shows which residents are most vulnerable.", false, "Overclaim: it is residents × degrees above typical. Age, housing and cooling access are not included."],
    ["New districts are about 1 °C hotter than mature ones, mostly because they are still sandy and less built up.", true, "Supported: +0.95 °C raw, about +0.2 °C after allowing for cover, sand and vegetation."],
    ["The pipeline runs unchanged in other cities, so the results there are validated.", false, "Overclaim: it runs, but the test cities have no local checks yet, and three lack Google heights."],
  ];
  let i = 0, score = 0;
  const card = el("div", { class: "quiz" });
  function show() {
    card.innerHTML = "";
    if (i >= CLAIMS.length) {
      card.append(el("div", { class: "result" }, [el("div", { class: "big", text: `${score}/${CLAIMS.length}` }), el("p", { text: score >= 8 ? "Sharp. You can tell measured from modelled from assumed." : "Re-read the explanations: the traps are surface vs air, model vs measurement, and block vs building." }), el("button", { class: "btn", text: "Play again", onclick: () => { i = 0; score = 0; show(); } })]));
      if (score >= 8) api.award("Claim checker passed");
      return;
    }
    const [text, ok, why] = CLAIMS[i];
    const fb = el("div", { class: "explain", hidden: true });
    const next = el("button", { class: "btn primary", hidden: true, text: "Next claim", onclick: () => { i++; show(); } });
    const pick = (ans) => { const right = ans === ok; if (right) score++; fb.innerHTML = `<b>${right ? "Right" : "Not quite"}: ${ok ? "supported" : "overclaim"}.</b> ${why}`; fb.hidden = false; next.hidden = false; btns.querySelectorAll("button").forEach((b) => (b.disabled = true)); };
    const btns = el("div", { class: "opts" }, [el("button", { class: "opt", onclick: () => pick(true) }, [el("span", { class: "k", text: "✓" }), el("span", { text: "Supported by the data" })]), el("button", { class: "opt", onclick: () => pick(false) }, [el("span", { class: "k", text: "!" }), el("span", { text: "Overclaim or unsupported" })])]);
    card.append(el("div", { class: "q-top" }, [el("span", { text: `Claim ${i + 1} of ${CLAIMS.length}` }), el("span", { text: `Score ${score}` })]), el("div", { class: "q-text", text: `“${text}”` }), btns, fb, el("div", { class: "q-foot" }, [el("span"), next]));
  }
  show();
  box.append(card);
};

// ---------------------------------------------------------------- 16. flashcards
LABS.flash = (box, api) => {
  let i = 0;
  const wrap = el("div", { class: "flash" });
  const prog = ro("Mastered", "gold");
  const inner = el("div", { class: "card3d", tabindex: 0, role: "button", "aria-label": "Flip card" });
  const front = el("div", { class: "face" }), back = el("div", { class: "face back" });
  inner.append(front, back); wrap.append(inner);
  const flip = () => inner.classList.toggle("flip");
  inner.addEventListener("click", flip);
  inner.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
  function show() {
    const [q, a] = FLASHCARDS[i];
    inner.classList.remove("flip");
    front.innerHTML = ""; back.innerHTML = "";
    front.append(el("div", { class: "eyebrow", text: `Card ${i + 1} of ${FLASHCARDS.length} · ${state.flash[i] === "m" ? "mastered" : "tap to flip"}` }), el("div", { class: "q", text: q }), el("p", { class: "muted small", text: "Answer out loud first." }));
    back.append(el("div", { class: "eyebrow", text: "Model answer" }), el("div", { class: "a", text: a }));
    prog.b.textContent = `${Object.values(state.flash).filter((v) => v === "m").length} / ${FLASHCARDS.length}`;
  }
  const mark = (v) => { state.flash[i] = v; save(); if (Object.values(state.flash).filter((x) => x === "m").length >= 10) api.award("Drill: 10 cards mastered"); i = (i + 1) % FLASHCARDS.length; show(); };
  const ctrls = el("div", { class: "q-foot" }, [
    el("button", { class: "btn", text: "← Back", onclick: () => { i = (i - 1 + FLASHCARDS.length) % FLASHCARDS.length; show(); } }),
    el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [el("button", { class: "btn", text: "Again", onclick: () => mark("a") }), el("button", { class: "btn primary", text: "Mastered", onclick: () => mark("m") })]),
  ]);
  show();
  box.append(wrap, ctrls, el("div", { class: "readout" }, [prog.wrap]));
};

// ---------------------------------------------------------------- 17. band cleaning + ridge shares
LABS.cleanridge = (box, api) => {
  // An EnMAP-like sensor: VNIR 420–1000 nm (91 bands) and SWIR 900–2450 nm (133 bands), overlapping at 900–1000 nm.
  const bands = [];
  for (let i = 0; i < 91; i++) bands.push({ l: 0.42 + i * (0.58 / 90), det: "VNIR" });
  for (let i = 0; i < 133; i++) bands.push({ l: 0.9 + i * (1.55 / 132), det: "SWIR" });
  bands.sort((a, b) => a.l - b.l);
  const NB = bands.length, L = bands.map((b) => b.l);
  const g = (l, c, w) => Math.exp(-(((l - c) / w) ** 2));
  const END = {
    Vegetation: (l) => { let v = 0.05 + 0.04 * g(l, 0.55, 0.04) + 0.42 / (1 + Math.exp(-(l - 0.72) / 0.018)); if (l > 1.3) v *= Math.max(0.35, 1 - 0.55 * (l - 1.3)); return v - 0.04 * g(l, 0.97, 0.03) - 0.05 * g(l, 1.2, 0.04); },
    // Pale concrete roof and desert sand share the same broad brightness; they differ in narrow features
    // (iron oxide near 0.87 µm and clay near 2.2 µm for sand, carbonate near 2.33 µm for concrete).
    Sand: (l) => 0.27 + 0.08 * Math.min(l - 0.4, 1.6) - 0.045 * g(l, 0.87, 0.035) - 0.06 * g(l, 2.2, 0.014) - 0.02 * g(l, 0.5, 0.05),
    Roof: (l) => 0.27 + 0.08 * Math.min(l - 0.4, 1.6) - 0.06 * g(l, 2.33, 0.014) - 0.015 * g(l, 1.95, 0.02),
    Asphalt: (l) => 0.06 + 0.03 * (l - 0.4) - 0.015 * g(l, 1.73, 0.015) - 0.02 * g(l, 2.31, 0.02),
  };
  const MATS = Object.keys(END);
  // Signal reaching each band: sunlight × air transmission × detector response. SNR scales with it.
  const sun = (l) => { const T = 5800, c2 = 14388; return 1 / (l ** 5 * (Math.exp(c2 / (l * T)) - 1)); };
  const sunMax = sun(0.5);
  const tau = (l) => 1 - 0.35 * g(l, 0.94, 0.02) - 0.25 * g(l, 1.13, 0.025) - 0.97 * g(l, 1.4, 0.045) - 0.98 * g(l, 1.88, 0.06) - 0.5 * g(l, 2.5, 0.06);
  const resp = (b) => b.det === "VNIR" ? Math.min(1, (b.l - 0.415) / 0.05) * Math.min(1, Math.max(0.05, (1.0 - b.l) / 0.08)) : Math.min(1, Math.max(0.05, (b.l - 0.9) / 0.1)) * Math.min(1, Math.max(0.05, (2.455 - b.l) / 0.12));
  const SNR = bands.map((b) => Math.max(0.6, 260 * Math.sqrt((sun(b.l) / sunMax) * Math.max(0.005, tau(b.l)) * resp(b))));
  // A small dataset: pixels mixing the four materials, with brightness variability and band noise.
  function makeScene(n, seed) {
    const r = mulberry32(seed), X = [], Y = [];
    for (let p = 0; p < n; p++) {
      const w = MATS.map(() => -Math.log(r() + 1e-9)); const s = w.reduce((a, b) => a + b, 0); const f = w.map((v) => v / s);
      // Brightness varies by material (weathering, dust) and for the whole pixel (slope, illumination).
      const scale = MATS.map(() => 0.85 + 0.3 * r()), light = 0.9 + 0.2 * r();
      X.push(bands.map((b, k) => { const t = light * MATS.reduce((a, m, j) => a + f[j] * scale[j] * END[m](b.l), 0); return t + gauss(r) * (0.3 / SNR[k]) + (b.det === "SWIR" && b.l < 1.0 ? 0.012 : 0); }));
      Y.push(f);
    }
    return { X, Y };
  }
  const scene = makeScene(400, 71);
  // Spectral-neighbour residual SNR estimate.
  const est = L.map((_, k) => {
    const res = scene.X.map((x) => k === 0 ? (x[0] - x[1]) / Math.SQRT2 : k === NB - 1 ? (x[k] - x[k - 1]) / Math.SQRT2 : (x[k] - (x[k - 1] + x[k + 1]) / 2) / Math.sqrt(1.5));
    const md = median(res), mad = median(res.map((v) => Math.abs(v - md))) * 1.4826;
    return mean(scene.X.map((x) => x[k])) / Math.max(mad, 1e-6);
  });

  // --- Part A UI
  const thr = ctl("crThr", "Flag bands with estimated SNR below", 5, 60, 1, 20, (v) => v);
  const cbDrop = el("input", { type: "checkbox", id: "crDrop" }), cbOver = el("input", { type: "checkbox", id: "crOver" });
  const checks = el("div", { class: "ctl" }, [
    el("label", { for: "crDrop", style: "justify-content:flex-start;gap:8px;color:var(--ink)" }, [cbDrop, document.createTextNode("Drop the flagged bands")]),
    el("label", { for: "crOver", style: "justify-content:flex-start;gap:8px;color:var(--ink)" }, [cbOver, document.createTextNode("Keep one copy in the 900–1000 nm overlap")]),
  ]);
  const keptR = ro("Bands kept", "gold"), flagR = ro("Flagged", "bad"), overR = ro("Overlap duplicates removed");
  const sf = frame(640, 230, { x: [0.4, 2.5], y: [0, 0.65], b: 30 });
  gridY(sf, [0, 0.2, 0.4, 0.6], (v) => v.toFixed(1)); gridX(sf, [0.5, 1, 1.5, 2, 2.5], (v) => `${v} µm`);
  const sg = S("g"); sf.svg.append(sg);
  const nf = frame(640, 200, { x: [0.4, 2.5], y: [-0.2, 2.6], b: 30 });
  gridX(nf, [0.5, 1, 1.5, 2, 2.5], (v) => `${v} µm`); gridY(nf, [0, 1, 2], (v) => `${10 ** v}`);
  nf.svg.append(S("rect", { x: nf.X(0.9), y: nf.t, width: nf.X(1.0) - nf.X(0.9), height: nf.h - nf.t - nf.b, fill: "var(--gold)", opacity: 0.14 }));
  nf.svg.append(S("text", { x: nf.X(0.95), y: nf.t + 11, "text-anchor": "middle", "font-size": 9.5, fill: "var(--gold)", text: "overlap" }));
  const ng = S("g"); nf.svg.append(ng);
  let keep = new Array(NB).fill(true);
  const overlapDup = bands.map((b) => (b.det === "VNIR" && b.l > 0.95) || (b.det === "SWIR" && b.l < 0.95));
  const pix = scene.X[3];
  function updA() {
    const t = +thr.input.value;
    const flagged = est.map((s) => s < t);
    keep = bands.map((_, k) => !((cbDrop.checked && flagged[k]) || (cbOver.checked && overlapDup[k])));
    sg.innerHTML = ""; ng.innerHTML = "";
    let d = "";
    pix.forEach((v, k) => { if (!keep[k]) return; d += `${d ? "L" : "M"}${sf.X(L[k]).toFixed(1)},${sf.Y(clamp(v, 0, 0.65)).toFixed(1)}`; });
    sg.append(S("path", { d, fill: "none", stroke: "var(--cool)", "stroke-width": 1.4 }));
    pix.forEach((v, k) => { if (flagged[k] && keep[k]) sg.append(S("circle", { cx: sf.X(L[k]), cy: sf.Y(clamp(v, 0, 0.65)), r: 2.6, fill: "var(--bad)" })); });
    est.forEach((s, k) => ng.append(S("circle", { cx: nf.X(L[k]), cy: nf.Y(Math.log10(Math.max(s, 0.7))), r: 2.2, fill: !keep[k] ? "var(--muted)" : flagged[k] ? "var(--bad)" : "var(--good)", opacity: keep[k] ? 1 : 0.35 })));
    ng.append(S("line", { x1: nf.l, x2: nf.w - nf.r, y1: nf.Y(Math.log10(t)), y2: nf.Y(Math.log10(t)), stroke: "var(--ink)", "stroke-dasharray": "4 3" }));
    keptR.b.textContent = `${keep.filter(Boolean).length} / ${NB}`; flagR.b.textContent = flagged.filter(Boolean).length; overR.b.textContent = cbOver.checked ? overlapDup.filter(Boolean).length : 0;
    if (cbDrop.checked && cbOver.checked) api.award("Lab: cleaned the bands");
    clean = keep.slice();
  }
  let clean = keep.slice();
  [thr.input, cbDrop, cbOver].forEach((c) => c.addEventListener("input", updA));
  [cbDrop, cbOver].forEach((c) => c.addEventListener("change", updA));
  updA();

  // --- Part B: ridge shares in the browser
  function solveRidge(X, Y, lambda) { return prepRidge(X, Y)(lambda); }
  function prepRidge(X, Y) {
    const n = X.length, d = X[0].length, q = Y[0].length;
    const mu = new Array(d).fill(0), sd = new Array(d).fill(0), ym = new Array(q).fill(0);
    X.forEach((x) => x.forEach((v, j) => (mu[j] += v / n))); X.forEach((x) => x.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / n)));
    sd.forEach((v, j) => (sd[j] = Math.sqrt(v) || 1)); Y.forEach((y) => y.forEach((v, j) => (ym[j] += v / n)));
    const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
    const A = Array.from({ length: d }, () => new Float64Array(d)), B = Array.from({ length: d }, () => new Float64Array(q));
    for (let i = 0; i < n; i++) { const z = Z[i]; for (let a = 0; a < d; a++) { const za = z[a]; if (!za) continue; const Ar = A[a]; for (let b = a; b < d; b++) Ar[b] += za * z[b]; for (let c = 0; c < q; c++) B[a][c] += za * (Y[i][c] - ym[c]); } }
    for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) A[a][b] = A[b][a];
    const G = A.map((row) => Float64Array.from(row));
    return (lambda) => {
    const A = G.map((row) => Float64Array.from(row));
    for (let a = 0; a < d; a++) A[a][a] += lambda * n;
    // Cholesky solve
    for (let j = 0; j < d; j++) { let s = A[j][j]; for (let k = 0; k < j; k++) s -= A[j][k] ** 2; A[j][j] = Math.sqrt(Math.max(s, 1e-12)); for (let i = j + 1; i < d; i++) { let t = A[i][j]; for (let k = 0; k < j; k++) t -= A[i][k] * A[j][k]; A[i][j] = t / A[j][j]; } }
    const W = Array.from({ length: d }, () => new Float64Array(q));
    for (let c = 0; c < q; c++) { const yv = new Float64Array(d); for (let i = 0; i < d; i++) { let t = B[i][c]; for (let k = 0; k < i; k++) t -= A[i][k] * yv[k]; yv[i] = t / A[i][i]; } for (let i = d - 1; i >= 0; i--) { let t = yv[i]; for (let k = i + 1; k < d; k++) t -= A[k][i] * W[k][c]; W[i][c] = t / A[i][i]; } }
    return (Xt) => Xt.map((x) => { const p = ym.map((m, c) => m + x.reduce((s, v, j) => s + ((v - mu[j]) / sd[j]) * W[j][c], 0)); const cl = p.map((v) => Math.max(0, v)); const t = cl.reduce((a, b) => a + b, 0) || 1; return cl.map((v) => v / t); });
    };
  }
  const train = makeScene(600, 101), test = makeScene(400, 202);
  const LAMS = [1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1, 10];
  const rmse = (P, Y, cols = [1, 2]) => Math.sqrt(mean(P.flatMap((p, i) => cols.map((c) => (p[c] - Y[i][c]) ** 2))));
  const s2win = [[0.458, 0.523], [0.543, 0.578], [0.65, 0.68], [0.785, 0.9], [1.565, 1.655], [2.1, 2.28]];
  const toS2 = (X) => X.map((x) => s2win.map(([a, b]) => mean(x.filter((_, k) => L[k] >= a && L[k] <= b))));
  const pick = (X, cols) => X.map((x) => cols.map((c) => x[c]));
  function selectTop(X, Y, cols, k) {
    const sc = cols.map((c) => { const xs = X.map((x) => x[c]); const mx = mean(xs); let best = 0; for (const t of [1, 2]) { const ys = Y.map((y) => y[t]); const my = mean(ys); let sxy = 0, sxx = 0, syy = 0; xs.forEach((v, i) => { sxy += (v - mx) * (ys[i] - my); sxx += (v - mx) ** 2; syy += (ys[i] - my) ** 2; }); best += Math.abs(sxy / Math.sqrt(sxx * syy || 1)); } return { c, s: best }; });
    const chosen = [];
    for (const { c } of sc.sort((a, b) => b.s - a.s)) { if (chosen.every((o) => Math.abs(L[o] - L[c]) > 0.03)) chosen.push(c); if (chosen.length === k) break; }
    return chosen;
  }
  function cvLambda(Xtr, Ytr) {
    const n = Xtr.length, fold = Xtr.map((_, i) => i % 4);
    let best = LAMS[0], bestE = Infinity;
    const err = LAMS.map(() => 0);
    for (let f = 0; f < 4; f++) {
      const tr = [], te = []; fold.forEach((v, i) => (v === f ? te : tr).push(i));
      const prep = prepRidge(tr.map((i) => Xtr[i]), tr.map((i) => Ytr[i])), Xte = te.map((i) => Xtr[i]), Yte = te.map((i) => Ytr[i]);
      LAMS.forEach((lam, k) => (err[k] += rmse(prep(lam)(Xte), Yte)));
    }
    LAMS.forEach((lam, k) => { if (err[k] < bestE) { bestE = err[k]; best = lam; } });
    void n; return best;
  }
  const bf = frame(640, 210, { l: 230, x: [0, 0.2], y: [0, 4], b: 30 });
  const bg = S("g"); bf.svg.append(bg);
  const lf = frame(420, 220, { x: [-5, 1], y: [0, 0.2], b: 34, l: 44 });
  gridX(lf, [-5, -4, -3, -2, -1, 0, 1], (v) => `1e${v}`); gridY(lf, [0, 0.05, 0.1, 0.15, 0.2], (v) => `${Math.round(v * 100)}`);
  lf.svg.append(S("text", { x: lf.w / 2, y: lf.h - 2, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", text: "ridge penalty λ (log scale)" }));
  const lg = S("g"); lf.svg.append(lg);
  const lam = ctl("crLam", "Ridge penalty λ (log₁₀)", -5, 1, 1, -2, (v) => `1e${v}`);
  const status = el("p", { class: "note" });
  const runBtn = el("button", { class: "btn primary small", text: "Train and compare" });
  let curve = null;
  function compare() {
    const all = [...Array(NB).keys()], cl = all.filter((k) => clean[k]);
    const sets = [
      ["Sentinel-2-like (6 bands)", toS2(train.X), toS2(test.X), "#8aa0b8"],
      ["All 224 bands, uncleaned", train.X, test.X, "#5b9bea"],
      [`All clean bands (${cl.length})`, pick(train.X, cl), pick(test.X, cl), "var(--good)"],
      ["10 selected clean bands", null, null, "var(--gold)"],
    ];
    const sel = selectTop(train.X, train.Y, cl, 10);
    sets[3][1] = pick(train.X, sel); sets[3][2] = pick(test.X, sel);
    const out = sets.map(([n, Xa, Xb, col]) => { const l2 = cvLambda(Xa, train.Y); const m = solveRidge(Xa, train.Y, l2); return { n, col, e: rmse(m(Xb), test.Y), lam: l2 }; });
    bg.innerHTML = "";
    gridX({ ...bf, svg: bg }, [0, 0.05, 0.1, 0.15, 0.2], (v) => `${Math.round(v * 100)} pts`);
    out.forEach((o, i) => {
      const y = bf.Y(3.5 - i) - 10;
      bg.append(S("text", { x: bf.l - 8, y: y + 14, "text-anchor": "end", "font-size": 11.5, fill: "var(--ink)", text: o.n }), S("rect", { x: bf.X(0), y, width: Math.max(2, bf.X(Math.min(o.e, 0.2)) - bf.X(0)), height: 20, rx: 4, fill: o.col }), S("text", { x: bf.X(Math.min(o.e, 0.2)) + 6, y: y + 14, "font-size": 11.5, fill: "var(--ink)", text: `${(o.e * 100).toFixed(1)} pts` }));
    });
    const prepC = prepRidge(pick(train.X, cl), train.Y), XtC = pick(test.X, cl);
    curve = LAMS.map((l2) => ({ l: Math.log10(l2), e: rmse(prepC(l2)(XtC), test.Y) }));
    drawCurve();
    const best = out.reduce((a, b) => (a.e < b.e ? a : b));
    const [s2o, rawo, cleano, selo] = out;
    const parts = [`<b>Lowest share error: ${best.n}</b> (${(best.e * 100).toFixed(1)} points).`];
    if (s2o.e > cleano.e) parts.push(`All clean bands beat Sentinel-2-like bands by ${(s2o.e / cleano.e).toFixed(1)}×: the narrow features that tell roof from sand (iron oxide near 0.87 µm, clay near 2.2 µm, carbonate near 2.33 µm) survive in narrow bands and are averaged away in wide ones.`);
    if (cl.length === NB) parts.push("You have not cleaned the bands yet: do part 1, then train again.");
    else parts.push(Math.abs(rawo.e - cleano.e) < 0.004 ? "Cleaning barely changed ridge: it down-weights noisy bands by itself, as in the real experiment. Cleaning matters most for models that select bands." : `Cleaning changed ridge's error from ${(rawo.e * 100).toFixed(1)} to ${(cleano.e * 100).toFixed(1)} points.`);
    if (selo.e > cleano.e) parts.push(`Keeping only 10 bands cost ${((selo.e - cleano.e) * 100).toFixed(1)} points: selection throws information away.`);
    status.innerHTML = parts.join(" ");
    api.award("Lab: ridge shares");
  }
  function drawCurve() {
    lg.innerHTML = "";
    if (!curve) return;
    const ymax = Math.max(...curve.map((c) => c.e)) * 1.15;
    const Y = (v) => lf.t + (1 - v / Math.max(ymax, 0.05)) * (lf.h - lf.t - lf.b);
    lg.append(S("path", { d: curve.map((c, i) => `${i ? "L" : "M"}${lf.X(c.l)},${Y(c.e)}`).join(""), fill: "none", stroke: "var(--good)", "stroke-width": 2.4 }));
    const lv = +lam.input.value, near = curve.reduce((a, b) => (Math.abs(b.l - lv) < Math.abs(a.l - lv) ? b : a));
    lg.append(S("circle", { cx: lf.X(near.l), cy: Y(near.e), r: 6, fill: "var(--heat)" }), S("text", { x: lf.X(near.l) + 8, y: Y(near.e) - 8, "font-size": 11, fill: "var(--ink)", text: `${(near.e * 100).toFixed(1)} pts` }));
    lg.append(S("text", { x: lf.X(-4.9), y: lf.t + 12, "font-size": 10, fill: "var(--muted)", text: "too little: chases noise" }), S("text", { x: lf.X(0.9), y: lf.t + 12, "text-anchor": "end", "font-size": 10, fill: "var(--muted)", text: "too much: flattens the signal" }));
  }
  runBtn.addEventListener("click", () => { runBtn.disabled = true; runBtn.textContent = "Training…"; setTimeout(() => { compare(); runBtn.disabled = false; runBtn.textContent = "Train and compare again"; }, 30); });
  lam.input.addEventListener("input", drawCurve);

  // --- Part C: the real experiment
  const rf2 = frame(900, 240, { l: 250, x: [0, 0.18], y: [0, 5], b: 30 });
  gridX(rf2, [0, 0.04, 0.08, 0.12, 0.16], (v) => `${Math.round(v * 100)} pts`);
  [["Sentinel-2-like bands · ridge", 0.1134, 0.0649, "#8aa0b8"], ["All 162 bands · ridge", 0.0529, 0.0184, "#16865a"], ["20 selected bands · ridge", 0.0732, 0.033, "#a77b0f"], ["Layered · soft · ridge", 0.0615, 0.0237, "#c9501f"], ["Unmixing, simple endmembers", 0.126, 0.0879, "#93a3b8"]].forEach(([n, a, b2, col], i) => {
    const y = rf2.Y(4.6 - i) - 10;
    rf2.svg.append(S("text", { x: rf2.l - 8, y: y + 12, "text-anchor": "end", "font-size": 11.5, fill: "var(--ink)", text: n }));
    rf2.svg.append(S("rect", { x: rf2.X(0), y, width: rf2.X(a) - rf2.X(0), height: 9, rx: 2, fill: col, opacity: 0.45 }), S("rect", { x: rf2.X(0), y: y + 10, width: rf2.X(b2) - rf2.X(0), height: 9, rx: 2, fill: col }));
    rf2.svg.append(S("text", { x: rf2.X(a) + 5, y: y + 8, "font-size": 9.5, fill: "var(--muted)", text: `${(a * 100).toFixed(1)} per 10 m pixel` }), S("text", { x: rf2.X(b2) + 5, y: y + 18, "font-size": 10, fill: "var(--ink)", text: `${(b2 * 100).toFixed(1)} per 90 m block` }));
  });

  box.append(
    el("h3", { text: "1 · Find and remove the noisy bands" }),
    el("div", { class: "viz-box" }, nf.svg),
    el("div", { class: "legend-row" }, [el("span", { html: '<i style="background:var(--good)"></i>Estimated SNR, kept' }), el("span", { html: '<i style="background:var(--bad)"></i>Below the threshold' }), el("span", { html: '<i style="background:var(--muted)"></i>Removed' })]),
    el("div", { class: "lab-row" }, [el("div", { class: "lab-ctrl" }, [thr.wrap, checks]), el("div", { class: "lab-ctrl" }, [el("div", { class: "readout" }, [keptR.wrap, flagR.wrap, overR.wrap]), el("p", { class: "hint", text: "The SNR here is estimated from 400 pixels of the image alone, using the spectral-neighbour residual. Notice the collapse at both ends, in the water-vapour bands near 1.4 and 1.9 µm, and the overlap where both detectors are weak." })])]),
    el("div", { class: "viz-box" }, sf.svg),
    el("p", { class: "hint", text: "One pixel's measured spectrum. Red dots are bands still flagged as noisy. Clean the bands and watch the spectrum become readable." }),
    el("h3", { text: "2 · Predict roof and sand shares with ridge regression" }),
    el("div", { class: "lab-row" }, [el("div", { class: "lab-ctrl" }, [runBtn, el("div", { class: "viz-box" }, bf.svg)]), el("div", { class: "lab-ctrl" }, [el("div", { class: "viz-box" }, lf.svg), lam.wrap, el("p", { class: "hint", text: "Test error of ridge on all clean bands for each penalty λ. The best λ is picked by cross-validation on the training pixels only." })])]),
    status,
    el("h3", { text: "3 · The real experiment (HYDICE Urban, hidden tiles)" }),
    el("div", { class: "viz-box" }, rf2.svg),
    el("p", { class: "hint", text: "Root-mean-square error of material shares in percentage points of area. Faint bar: per 10 m mixed pixel. Solid bar: per 90 m block, CoolCairo's unit. All clean bands with ridge was the most accurate at both scales." }),
  );
};
