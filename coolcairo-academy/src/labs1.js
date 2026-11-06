// Labs for Acts 1 and 2. Each lab builds its own interface inside `box` and calls api.award()
// once the learner has really used it.

const LABS = {};

// Shared chart frame: an SVG with a plot area and linear scales.
function frame(w, h, { l = 44, r = 14, t = 14, b = 34, x = [0, 1], y = [0, 1], xlog = false } = {}) {
  const svg = S("svg", { viewBox: `0 0 ${w} ${h}`, class: "viz", role: "img" });
  const X = xlog
    ? (v) => l + ((Math.log10(v) - Math.log10(x[0])) / (Math.log10(x[1]) - Math.log10(x[0]))) * (w - l - r)
    : (v) => l + ((v - x[0]) / (x[1] - x[0])) * (w - l - r);
  const Y = (v) => t + (1 - (v - y[0]) / (y[1] - y[0])) * (h - t - b);
  return { svg, X, Y, l, r, t, b, w, h };
}
function gridY(f, ticks, label = (v) => v) {
  for (const v of ticks) {
    f.svg.append(S("line", { x1: f.l, x2: f.w - f.r, y1: f.Y(v), y2: f.Y(v), stroke: "var(--grid)" }));
    f.svg.append(S("text", { x: f.l - 6, y: f.Y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--muted)", text: label(v) }));
  }
}
function gridX(f, ticks, label = (v) => v) {
  for (const v of ticks) {
    f.svg.append(S("line", { x1: f.X(v), x2: f.X(v), y1: f.t, y2: f.h - f.b, stroke: "var(--grid)" }));
    f.svg.append(S("text", { x: f.X(v), y: f.h - f.b + 16, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", text: label(v) }));
  }
}
function path(points, attrs) { return S("path", { d: points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(""), fill: "none", ...attrs }); }
function ctl(id, label, min, max, step, value, fmtOut = (v) => v) {
  const out = el("output", { for: id, text: fmtOut(value) });
  const input = el("input", { type: "range", id, min, max, step, value });
  const wrap = el("div", { class: "ctl" }, [el("label", { for: id }, [document.createTextNode(label), out]), input]);
  input.addEventListener("input", () => (out.textContent = fmtOut(+input.value)));
  return { wrap, input, out };
}
function ro(label, cls = "") { const b = el("b", { class: cls, text: "—" }); return { wrap: el("div", { class: "ro" }, [el("span", { text: label }), b]), b }; }
function seg(options, value, onPick) {
  const s = el("div", { class: "seg", role: "group" });
  const btns = options.map(([v, label]) => {
    const b = el("button", { type: "button", "aria-pressed": String(v === value), text: label });
    b.addEventListener("click", () => { btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); onPick(v); });
    return b;
  });
  s.append(...btns);
  return s;
}

// ---------------------------------------------------------------- 1. urban heat island
LABS.uhi = (box, api) => {
  const SURF = [
    { k: "Dark roof", min: 29, max: 66, decay: 0.22, col: "#5a5a64" },
    { k: "Asphalt road", min: 31, max: 61, decay: 0.16, col: "#2f3036" },
    { k: "Open sand", min: 22, max: 60, decay: 0.42, col: "#d6b37d" },
    { k: "Pale concrete", min: 29, max: 49, decay: 0.18, col: "#cfc6b4" },
    { k: "Irrigated grass, trees", min: 24, max: 37, decay: 0.3, col: "#548c45" },
    { k: "Air (2 m)", min: 26, max: 38, decay: 0.12, col: "#3fc1d4", dash: "5 4" },
  ];
  // Daytime: half-sine from sunrise 5.5 h with peak near 14 h; night: exponential decay to the minimum.
  function T(s, h) {
    const rise = 5.5, set = 19, peak = 14;
    const d = (hh) => (hh < rise ? 0 : hh <= peak ? Math.sin(((hh - rise) / (peak - rise)) * Math.PI / 2) : hh <= set ? Math.cos(((hh - peak) / (set - peak)) * Math.PI / 2) * 0.9 + 0.1 * Math.cos(((hh - peak) / (set - peak)) * Math.PI / 2) : 0);
    if (h >= rise && h <= set) return s.min + (s.max - s.min) * Math.max(d(h), 0.05);
    const since = h > set ? h - set : h + 24 - set;
    const atSet = s.min + (s.max - s.min) * 0.05;
    return s.min + (atSet - s.min + (s.max - s.min) * 0.25) * Math.exp(-s.decay * since);
  }
  const f = frame(640, 300, { x: [0, 24], y: [15, 70] });
  gridY(f, [20, 30, 40, 50, 60, 70], (v) => `${v}°`);
  gridX(f, [0, 3, 6, 9, 12, 15, 18, 21, 24], (v) => `${v}h`);
  f.svg.append(S("rect", { x: f.X(10.25), y: f.t, width: f.X(10.75) - f.X(10.25), height: f.h - f.t - f.b, fill: "var(--gold)", opacity: 0.25 }));
  f.svg.append(S("text", { x: f.X(10.5), y: f.t + 12, "text-anchor": "middle", "font-size": 10, fill: "var(--gold)", text: "Landsat 10:30" }));
  for (const s of SURF) {
    const pts = []; for (let h = 0; h <= 24; h += 0.25) pts.push([f.X(h), f.Y(T(s, h))]);
    f.svg.append(path(pts, { stroke: s.col, "stroke-width": s.dash ? 2 : 2.4, "stroke-dasharray": s.dash || null }));
  }
  const cursor = S("line", { y1: f.t, y2: f.h - f.b, stroke: "var(--ink)", "stroke-width": 1.2 });
  const dots = SURF.map((s) => S("circle", { r: 4.5, fill: s.col, stroke: "var(--bg-2)", "stroke-width": 1.5 }));
  f.svg.append(cursor, ...dots);

  // street cross-section coloured by current temperature
  const xs = S("svg", { viewBox: "0 0 640 120", class: "viz", role: "img", "aria-label": "Street cross-section" });
  const parts = [
    { s: 4, x: 0, w: 110, y: 70, h: 50 }, { s: 0, x: 110, w: 120, y: 30, h: 90, bld: 1 }, { s: 1, x: 230, w: 150, y: 100, h: 20 },
    { s: 3, x: 380, w: 120, y: 45, h: 75, bld: 1 }, { s: 2, x: 500, w: 140, y: 96, h: 24 },
  ];
  const rects = parts.map((p) => S("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: p.bld ? 2 : 0 }));
  xs.append(...rects);
  const labels = parts.map((p) => S("text", { x: p.x + p.w / 2, y: p.y - 6, "text-anchor": "middle", "font-size": 11, fill: "var(--ink)" }));
  xs.append(...labels);

  const hour = ctl("uhiHour", "Time of day", 0, 24, 0.25, 10.5, (v) => `${String(Math.floor(v)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`);
  const outs = SURF.map((s) => ro(s.k));
  const gap = ro("Hottest surface above the air", "heat");
  function update() {
    const h = +hour.input.value;
    cursor.setAttribute("x1", f.X(h)); cursor.setAttribute("x2", f.X(h));
    SURF.forEach((s, i) => { const v = T(s, h); dots[i].setAttribute("cx", f.X(h)); dots[i].setAttribute("cy", f.Y(v)); outs[i].b.textContent = `${v.toFixed(1)} °C`; });
    const temps = SURF.slice(0, 5).map((s) => T(s, h));
    gap.b.textContent = `+${(Math.max(...temps) - T(SURF[5], h)).toFixed(1)} °C`;
    parts.forEach((p, i) => { const v = T(SURF[p.s], h); rects[i].setAttribute("fill", heatColor((v - 25) / 40)); labels[i].textContent = `${SURF[p.s].k.split(",")[0]} ${v.toFixed(0)}°`; });
  }
  hour.input.addEventListener("input", () => { update(); api.award("Lab: a day of surface heat"); });
  update();
  box.append(
    el("div", { class: "viz-box" }, f.svg),
    el("div", { class: "legend-row" }, SURF.map((s) => el("span", {}, [el("i", { style: `background:${s.col}` }), document.createTextNode(s.k)]))),
    el("div", { class: "viz-box" }, xs),
    hour.wrap,
    el("div", { class: "readout" }, [...outs.map((o) => o.wrap), gap.wrap]),
    el("div", { class: "note", html: "<b>What to notice:</b> by day, dark roofs, asphalt and sand run 20–30 °C above the air; plants stay close to it. After sunset sand cools fastest, while asphalt and concrete release stored heat all night, which is why the <b>air</b> heat island peaks at night. At 10:30 Landsat already sees big differences between surfaces." }),
  );
};

// ---------------------------------------------------------------- 2. spectrum & Planck
LABS.spectrum = (box, api) => {
  const h = 6.626e-34, c = 2.998e8, k = 1.381e-23;
  const planck = (lamUm, T) => { const l = lamUm * 1e-6; return (2 * h * c * c) / (l ** 5) / (Math.exp((h * c) / (l * k * T)) - 1); };
  const f = frame(660, 300, { x: [0.3, 20], y: [0, 1.08], xlog: true, b: 40 });
  gridX(f, [0.4, 0.7, 1, 2, 3, 5, 10, 15, 20], (v) => `${v}`);
  f.svg.append(S("text", { x: f.w / 2, y: f.h - 4, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", text: "wavelength (µm, log scale)" }));
  // atmospheric absorption (approximate)
  for (const [a, b2] of [[1.35, 1.45], [1.8, 1.95], [2.5, 3.4], [4.2, 4.4], [5.2, 7.8], [14, 20]]) {
    f.svg.append(S("rect", { x: f.X(a), y: f.t, width: f.X(b2) - f.X(a), height: f.h - f.t - f.b, fill: "var(--muted)", opacity: 0.13 }));
  }
  f.svg.append(S("text", { x: f.X(6.2), y: f.t + 14, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)", text: "absorbed by water vapour" }));
  // visible rainbow strip
  const grad = S("linearGradient", { id: "vis", x1: 0, x2: 1 }, [["#7b2cff", 0], ["#2a6bff", 0.2], ["#21c25b", 0.45], ["#ffd23f", 0.7], ["#ff3b30", 1]].map(([col, o]) => S("stop", { offset: o, "stop-color": col })));
  f.svg.append(S("defs", {}, grad));
  f.svg.append(S("rect", { x: f.X(0.4), y: f.h - f.b - 6, width: f.X(0.7) - f.X(0.4), height: 6, fill: "url(#vis)" }));
  const BANDS = [
    { n: "B2 blue", a: 0.458, b: 0.523, col: "#2a78d6", d: "Blue: part of visible brightness and the soil index." },
    { n: "B3 green", a: 0.543, b: 0.578, col: "#21a35b", d: "Green: part of visible brightness." },
    { n: "B4 red", a: 0.65, b: 0.68, col: "#e0452f", d: "Red: plants absorb it to photosynthesise, so it is low for vegetation (NDVI)." },
    { n: "B8 NIR", a: 0.785, b: 0.9, col: "#9c6ade", d: "Near-infrared: healthy leaves reflect it strongly. High NIR + low red = high NDVI." },
    { n: "B11 SWIR", a: 1.565, b: 1.655, col: "#c08a3e", d: "Short-wave infrared: sand and soil reflect it strongly (soil index)." },
    { n: "B12 SWIR", a: 2.1, b: 2.28, col: "#a8692a", d: "Second short-wave infrared band: also sensitive to soil and minerals." },
    { n: "Landsat B10 thermal", a: 10.6, b: 11.19, col: "#f06a35", d: "Thermal infrared at ~10.9 µm: the heat glow that gives land surface temperature." },
  ];
  const bandRects = BANDS.map((bd) => {
    const r = S("rect", { x: f.X(bd.a), y: f.t, width: Math.max(3, f.X(bd.b) - f.X(bd.a)), height: f.h - f.t - f.b, fill: bd.col, opacity: 0.32, style: "cursor:pointer" });
    r.addEventListener("click", () => { info.innerHTML = `<b>${bd.n}</b> (${bd.a}–${bd.b} µm). ${bd.d}`; api.award("Lab: bands explored"); });
    f.svg.append(r);
    return r;
  });
  void bandRects;
  const sunPath = S("path", { fill: "none", stroke: "var(--gold)", "stroke-width": 2.4 });
  const earthPath = S("path", { fill: "none", stroke: "var(--heat)", "stroke-width": 2.4 });
  const peakLine = S("line", { y1: f.t, y2: f.h - f.b, stroke: "var(--heat)", "stroke-dasharray": "3 3" });
  const peakTxt = S("text", { "font-size": 11, fill: "var(--heat)" });
  f.svg.append(sunPath, earthPath, peakLine, peakTxt);
  f.svg.append(S("text", { x: f.X(0.5), y: f.Y(1.04), "text-anchor": "middle", "font-size": 11, fill: "var(--gold)", text: "Sun, 5,800 K" }));
  const sunPts = []; const lams = []; for (let i = 0; i <= 260; i++) lams.push(0.3 * Math.pow(20 / 0.3, i / 260));
  const sunMax = Math.max(...lams.map((l) => planck(l, 5800)));
  for (const l of lams) sunPts.push([f.X(l), f.Y(planck(l, 5800) / sunMax)]);
  sunPath.setAttribute("d", sunPts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(""));
  const temp = ctl("specT", "Surface temperature", -20, 80, 1, 47, (v) => `${v} °C`);
  const peak = ro("Peak glow (Wien's law)", "heat"), ratio = ro("Glow vs a 25 °C surface", "gold");
  const info = el("div", { class: "note", html: "Click a coloured band to see what CoolCairo uses it for." });
  function update() {
    const T = +temp.input.value + 273.15;
    const mx = Math.max(...lams.map((l) => planck(l, T)));
    earthPath.setAttribute("d", lams.map((l, i) => `${i ? "L" : "M"}${f.X(l)},${f.Y(planck(l, T) / mx)}`).join(""));
    const pk = 2898 / T;
    peakLine.setAttribute("x1", f.X(pk)); peakLine.setAttribute("x2", f.X(pk));
    peakTxt.setAttribute("x", f.X(pk) + 4); peakTxt.setAttribute("y", f.Y(0.95)); peakTxt.textContent = `ground peak ${pk.toFixed(1)} µm`;
    peak.b.textContent = `${pk.toFixed(2)} µm`;
    ratio.b.textContent = `×${(T ** 4 / 298.15 ** 4).toFixed(2)}`;
  }
  temp.input.addEventListener("input", () => { update(); api.award("Lab: Planck curves"); });
  update();
  box.append(el("div", { class: "viz-box" }, f.svg), el("div", { class: "lab-row" }, [
    el("div", { class: "lab-ctrl" }, [temp.wrap, el("div", { class: "readout" }, [peak.wrap, ratio.wrap])]),
    el("div", { class: "lab-ctrl" }, [info, el("p", { class: "hint", text: "Each curve is scaled to its own peak so both fit: in absolute terms the Sun's glow is millions of times stronger. 'Glow vs 25 °C' uses the Stefan–Boltzmann law (T⁴)." })]),
  ]));
};

// ---------------------------------------------------------------- 3. resolution
LABS.resolution = (box, api) => {
  // A made-up 540 m × 540 m neighbourhood at 2 m per pixel (270 × 270), as material codes.
  const N = 270, M = new Uint8Array(N * N); // 0 pale ground 1 asphalt 2 pale roof 3 dark roof 4 veg 5 sand
  const rand = mulberry32(42);
  M.fill(0);
  const fill = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < N && y < N) M[y * N + x] = v; };
  for (let k = 0; k < N; k += 45) { fill(k, 0, 6, N, 1); fill(0, k, N, 6, 1); }
  for (let by = 0; by < 6; by++) for (let bx = 0; bx < 6; bx++) {
    const x0 = bx * 45 + 7, y0 = by * 45 + 7;
    const type = (bx === 4 && by === 1) ? "park" : (bx >= 4 && by >= 4) || (bx === 0 && by === 5) ? "sand" : "built";
    if (type === "park") { fill(x0, y0, 37, 37, 4); continue; }
    if (type === "sand") { fill(x0, y0, 37, 37, 5); if (rand() < 0.5) fill(x0 + 6, y0 + 8, 10, 12, 2); continue; }
    for (let i = 0; i < 6; i++) {
      const w = 8 + Math.floor(rand() * 8), hh = 8 + Math.floor(rand() * 8);
      fill(x0 + Math.floor(rand() * (37 - w)), y0 + Math.floor(rand() * (37 - hh)), w, hh, rand() < 0.2 ? 3 : 2);
    }
    for (let i = 0; i < 5; i++) fill(x0 + Math.floor(rand() * 34), y0 + Math.floor(rand() * 34), 3, 3, 4);
  }
  const RGB = [[219, 212, 194], [56, 56, 61], [236, 230, 214], [90, 90, 100], [84, 140, 69], [214, 179, 125]];
  const TEMP = [45.8, 46.0, 47.0, 44.5, 42.7, 49.2]; // illustrative surface °C per material
  const cv = el("canvas", { class: "viz", width: N, height: N, style: "aspect-ratio:1;max-width:520px;margin:0 auto" });
  const ctx = cv.getContext("2d");
  let px = 2, mode = "colour";
  function draw() {
    const step = px / 2; // in 2 m cells
    const img = ctx.createImageData(N, N);
    for (let by = 0; by < N; by += step) for (let bx = 0; bx < N; bx += step) {
      let r = 0, g = 0, b = 0, t = 0, n = 0;
      for (let y = by; y < Math.min(N, by + step); y++) for (let x = bx; x < Math.min(N, bx + step); x++) { const m = M[y * N + x]; r += RGB[m][0]; g += RGB[m][1]; b += RGB[m][2]; t += TEMP[m]; n++; }
      let col = [r / n, g / n, b / n];
      if (mode === "heat") { const c2 = heatColor((t / n - 42) / 8).match(/\d+/g).map(Number); col = c2; }
      for (let y = by; y < Math.min(N, by + step); y++) for (let x = bx; x < Math.min(N, bx + step); x++) { const o = (y * N + x) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
    if (px >= 30) { ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.6; for (let k = 0; k <= N; k += px / 2) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, N); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(N, k); ctx.stroke(); } }
    caption.textContent = { 2: "2 m: an aerial photo. Every roof and tree is visible.", 10: "10 m: Sentinel-2. Roofs blur, but streets, the park and sand lots are clear: good for materials.", 30: "30 m: Landsat optical and EnMAP. Single buildings are gone; each pixel is a mix.", 90: "90 m: one CoolCairo block (3 × 3 Landsat pixels). This is the scale the heat sensor can honestly support." }[px];
  }
  const caption = el("p", { class: "hint" });
  const sizes = seg([[2, "2 m aerial"], [10, "10 m Sentinel-2"], [30, "30 m Landsat"], [90, "90 m block"]], 2, (v) => { px = v; draw(); api.award("Lab: resolution"); });
  const modes = seg([["colour", "Colour"], ["heat", "Surface heat (illustrative)"]], "colour", (v) => { mode = v; draw(); api.award("Lab: resolution"); });

  // revisit timeline over one summer (Jun–Aug, 92 days)
  const tl = frame(640, 130, { x: [0, 92], y: [0, 3], l: 110, b: 24 });
  gridX(tl, [0, 30, 61, 92], (v) => ["1 Jun", "1 Jul", "1 Aug", "31 Aug"][[0, 30, 61, 92].indexOf(v)]);
  const rows = [["Landsat 8", 16, 0, "var(--heat)"], ["Landsat 9", 16, 8, "#ff9a6a"], ["Sentinel-2 A+B", 5, 2, "var(--cool)"]];
  rows.forEach(([n, every, off, col], i) => {
    tl.svg.append(S("text", { x: 8, y: tl.Y(2.5 - i) + 4, "font-size": 11, fill: "var(--muted)", text: `${n} · ${every} d` }));
    for (let d = off; d <= 92; d += every) tl.svg.append(S("rect", { x: tl.X(d) - 2, y: tl.Y(2.5 - i) - 7, width: 4, height: 14, rx: 1.5, fill: col }));
  });
  draw();
  box.append(
    el("div", { class: "lab-row" }, [
      el("div", { class: "viz-box", style: "padding:10px" }, cv),
      el("div", { class: "lab-ctrl" }, [el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "Pixel size" }), sizes]), el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "View" }), modes]), caption,
        el("div", { class: "legend-row" }, ["Pale ground", "Asphalt", "Pale roof", "Dark roof", "Vegetation", "Sand"].map((n, i) => el("span", {}, [el("i", { style: `background:rgb(${RGB[i].join(" ")})` }), document.createTextNode(n)])))]),
    ]),
    el("h3", { text: "Temporal resolution: one summer of passes" }),
    el("div", { class: "viz-box" }, tl.svg),
    el("p", { class: "hint", text: "Landsat 8 and 9 together give a pass every 8 days, about 11–12 per summer; three summers and cloud filtering left CoolCairo 65 clear scenes." }),
  );
};

// ---------------------------------------------------------------- 4. thermal sensor
LABS.thermal = (box, api) => {
  const h = 6.626e-34, c = 2.998e8, k = 1.381e-23, LAM = 10.9e-6;
  const B = (T) => (2 * h * c * c) / LAM ** 5 / (Math.exp((h * c) / (LAM * k * T)) - 1);
  const Binv = (L) => (h * c) / (LAM * k) / Math.log(1 + (2 * h * c * c) / (LAM ** 5 * L));
  const ts = ctl("thTs", "True roof surface temperature", 20, 70, 0.5, 48, (v) => `${v} °C`);
  const em = ctl("thEm", "Emissivity", 0.3, 1, 0.01, 0.94, (v) => v.toFixed(2));
  const wv = ctl("thWv", "Water vapour in the air", 0.3, 5, 0.1, 1.5, (v) => `${v.toFixed(1)} g/cm²`);
  const presets = seg([["concrete", "Concrete 0.94"], ["grass", "Grass 0.98"], ["metal", "Bare metal 0.30"], ["paint", "White paint 0.90"]], "concrete", (v) => { em.input.value = { concrete: 0.94, grass: 0.98, metal: 0.3, paint: 0.9 }[v]; em.input.dispatchEvent(new Event("input")); });
  const truth = ro("True surface", "heat"), seen = ro("Seen from space (brightness temp.)", "cool"), err = ro("Error before correction", "bad"), fixed = ro("After USGS-style correction", "good");
  const svg = S("svg", { viewBox: "0 0 640 230", class: "viz", role: "img", "aria-label": "Radiation path from roof to satellite" });
  svg.append(S("rect", { x: 0, y: 190, width: 640, height: 40, fill: "#5a5348" }));
  const roof = S("rect", { x: 250, y: 170, width: 140, height: 24, rx: 2 });
  const atm = S("rect", { x: 0, y: 70, width: 640, height: 80, fill: "var(--cool)" });
  svg.append(atm, roof);
  svg.append(S("text", { x: 12, y: 88, "font-size": 11, fill: "var(--ink)", text: "atmosphere: absorbs part of the glow and adds its own" }));
  svg.append(S("rect", { x: 300, y: 12, width: 40, height: 16, rx: 3, fill: "var(--gold)" }), S("rect", { x: 270, y: 16, width: 26, height: 8, fill: "var(--cool)" }), S("rect", { x: 344, y: 16, width: 26, height: 8, fill: "var(--cool)" }));
  svg.append(S("text", { x: 380, y: 26, "font-size": 11, fill: "var(--muted)", text: "Landsat TIRS, 10.9 µm" }));
  const up = S("line", { x1: 320, y1: 166, x2: 320, y2: 32, stroke: "var(--heat)", "stroke-linecap": "round" });
  const path2 = S("line", { x1: 200, y1: 148, x2: 300, y2: 34, stroke: "var(--cool)", "stroke-width": 2, "stroke-dasharray": "4 4" });
  const refl = S("line", { x1: 420, y1: 120, x2: 375, y2: 168, stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "2 4" });
  svg.append(up, path2, refl);
  svg.append(S("text", { x: 206, y: 140, "font-size": 10, fill: "var(--cool)", text: "air's own glow" }), S("text", { x: 426, y: 128, "font-size": 10, fill: "var(--muted)", text: "sky glow reflected (1 − ε)" }));
  const roofTxt = S("text", { x: 320, y: 214, "text-anchor": "middle", "font-size": 12, fill: "#fff" });
  svg.append(roofTxt);
  let corrected = false;
  const fixBtn = el("button", { class: "btn primary small", text: "Apply the correction" });
  fixBtn.addEventListener("click", () => { corrected = true; update(); api.award("Lab: thermal correction"); });
  function update() {
    const Ts = +ts.input.value + 273.15, e = +em.input.value, w = +wv.input.value;
    const tau = Math.exp(-0.11 * w), Tair = 273.15 + 33;
    const Lup = (1 - tau) * B(Tair - 6), Ldown = (1 - tau) * B(Tair - 2) * 1.15;
    const L = tau * (e * B(Ts) + (1 - e) * Ldown) + Lup;
    const Tb = Binv(L);
    truth.b.textContent = `${(Ts - 273.15).toFixed(1)} °C`;
    seen.b.textContent = `${(Tb - 273.15).toFixed(1)} °C`;
    err.b.textContent = `${fmt(Tb - Ts)} °C`;
    // Correction: invert with known tau, Lup, Ldown and emissivity.
    const Lsurf = ((L - Lup) / tau - (1 - e) * Ldown) / e;
    fixed.b.textContent = corrected ? `${(Binv(Lsurf) - 273.15).toFixed(1)} °C` : "press the button";
    roof.setAttribute("fill", heatColor((Ts - 273.15 - 25) / 40));
    roofTxt.textContent = `roof ${(Ts - 273.15).toFixed(0)} °C · ε ${e.toFixed(2)}`;
    atm.setAttribute("opacity", (0.08 + (1 - tau) * 0.5).toFixed(2));
    up.setAttribute("stroke-width", (2 + 6 * tau * e).toFixed(1));
  }
  for (const c2 of [ts, em, wv]) c2.input.addEventListener("input", () => { corrected = false; update(); api.award("Lab: thermal sensor"); });
  update();
  box.append(el("div", { class: "viz-box" }, svg), el("div", { class: "lab-row" }, [
    el("div", { class: "lab-ctrl" }, [ts.wrap, em.wrap, el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "Emissivity presets" }), presets]), wv.wrap]),
    el("div", { class: "lab-ctrl" }, [el("div", { class: "readout" }, [truth.wrap, seen.wrap, err.wrap, fixed.wrap]), fixBtn,
      el("p", { class: "hint", text: "Try bare metal at 0.30: it looks tens of degrees colder than it is. Then raise the water vapour. The correction needs to know both the air and the emissivity, which is what USGS's Level-2 product does for every scene." })]),
  ]));
};

// ---------------------------------------------------------------- 5. clouds & median
LABS.median = (box, api) => {
  let rand = mulberry32(5), data = [];
  function newPixel() {
    const base = 45.5 + rand() * 2;
    data = Array.from({ length: 13 }, (_, i) => ({ d: i, v: +(base + gauss(rand) * 0.8).toFixed(1), bad: null, flag: false }));
    const idx = shuffle([...Array(13).keys()], rand).slice(0, 3);
    data[idx[0]].v = +(14 + rand() * 10).toFixed(1); data[idx[0]].bad = "cloud";
    data[idx[1]].v = +(26 + rand() * 6).toFixed(1); data[idx[1]].bad = "cloud edge";
    data[idx[2]].v = +(base - 6 - rand() * 3).toFixed(1); data[idx[2]].bad = "cloud shadow";
  }
  newPixel();
  const f = frame(640, 260, { x: [0, 13], y: [0, 55], b: 30 });
  const g = S("g"); f.svg.append(g);
  const meanR = ro("Mean of kept", "bad"), medR = ro("Median of kept", "good"), truthR = ro("Typical clear morning", "gold"), status = el("p", { class: "note" });
  function update() {
    g.innerHTML = "";
    gridY({ ...f, svg: g }, [0, 10, 20, 30, 40, 50], (v) => `${v}°`);
    const kept = data.filter((p) => !p.flag).map((p) => p.v);
    const mv = mean(kept), md = median(kept);
    data.forEach((p, i) => {
      const x = f.X(i + 0.15), w = f.X(0.7) - f.X(0);
      const bar = S("rect", { x, y: f.Y(p.v), width: w, height: f.Y(0) - f.Y(p.v), rx: 3, fill: p.flag ? "var(--line)" : heatColor((p.v - 25) / 30), stroke: p.flag ? "var(--muted)" : "none", "stroke-dasharray": "3 3", style: "cursor:pointer" });
      bar.addEventListener("click", () => { p.flag = !p.flag; update(); api.award("Lab: cleaning a pixel"); });
      g.append(bar, S("text", { x: x + w / 2, y: f.Y(p.v) - 5, "text-anchor": "middle", "font-size": 10.5, fill: "var(--ink)", text: p.v.toFixed(0) }));
      g.append(S("text", { x: x + w / 2, y: f.h - 12, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)", text: `d${i + 1}` }));
    });
    g.append(S("line", { x1: f.l, x2: f.w - f.r, y1: f.Y(mv), y2: f.Y(mv), stroke: "var(--bad)", "stroke-width": 2, "stroke-dasharray": "6 4" }));
    g.append(S("line", { x1: f.l, x2: f.w - f.r, y1: f.Y(md), y2: f.Y(md), stroke: "var(--good)", "stroke-width": 2 }));
    const clear = data.filter((p) => !p.bad).map((p) => p.v);
    meanR.b.textContent = `${mv.toFixed(1)} °C`; medR.b.textContent = `${md.toFixed(1)} °C`; truthR.b.textContent = `${median(clear).toFixed(1)} °C`;
    const caught = data.filter((p) => p.bad && p.flag).length, wrong = data.filter((p) => !p.bad && p.flag).length;
    status.innerHTML = caught === 3 && !wrong
      ? "<b>All three contaminated readings flagged.</b> The mean and median now agree. Notice the median was already close before you flagged anything: that is why CoolCairo uses it."
      : `<b>${caught} of 3</b> contaminated readings flagged${wrong ? `, ${wrong} clear reading${wrong > 1 ? "s" : ""} flagged by mistake` : ""}. Clouds read far too cold; shadows a few degrees too cold.`;
  }
  const again = el("button", { class: "btn small", text: "New pixel", onclick: () => { newPixel(); update(); } });
  update();
  box.append(el("div", { class: "viz-box" }, f.svg), el("div", { class: "legend-row" }, [el("span", { html: '<i style="background:var(--bad)"></i>Mean (dashed)' }), el("span", { html: '<i style="background:var(--good)"></i>Median' }), el("span", { text: "Click a bar to flag or unflag it." })]),
    el("div", { class: "readout" }, [meanR.wrap, medR.wrap, truthR.wrap]), status, again);
};

// ---------------------------------------------------------------- 6. spectral fingerprints
const MATERIALS = {
  // Sentinel-2 band reflectances: blue, green, red, NIR, SWIR1, SWIR2
  Vegetation: { b: [0.04, 0.08, 0.05, 0.40, 0.22, 0.12], col: "#548c45" },
  "Desert sand": { b: [0.22, 0.27, 0.32, 0.36, 0.50, 0.44], col: "#d6b37d" },
  Asphalt: { b: [0.07, 0.08, 0.09, 0.11, 0.13, 0.12], col: "#55555c" },
  "Pale concrete roof": { b: [0.30, 0.32, 0.33, 0.36, 0.38, 0.34], col: "#cfc6b4" },
  Water: { b: [0.08, 0.07, 0.05, 0.02, 0.01, 0.005], col: "#2a78d6" },
  "Shadow on concrete": { b: [0.09, 0.10, 0.10, 0.11, 0.11, 0.10], col: "#3a4150" },
};
const S2C = [0.49, 0.56, 0.665, 0.842, 1.61, 2.19];
function indices(b) {
  const [bl, gr, rd, nir, sw1] = b;
  return { ndvi: (nir - rd) / (nir + rd), bright: (bl + gr + rd) / 3, bsi: ((sw1 + rd) - (nir + bl)) / ((sw1 + rd) + (nir + bl)) };
}
function classify(b) {
  const x = indices(b);
  if (x.ndvi > 0.3) return ["Vegetation", 1, x];
  if (x.bright <= 0.14) return ["Dark surface", 2, x];
  if (x.bsi > 0.137) return ["Bare sand / soil", 3, x];
  return ["Pale surface", 4, x];
}
function spectrumCurve(b) {
  // Smooth display curve through the six band values (plus visible-edge anchors).
  const xs = [0.42, ...S2C, 2.45], ys = [b[0] * 0.9, ...b, b[5] * 0.9];
  const pts = [];
  for (let l = 0.42; l <= 2.45; l += 0.01) {
    let i = 0; while (i < xs.length - 2 && l > xs[i + 1]) i++;
    const t = (l - xs[i]) / (xs[i + 1] - xs[i]); const s = t * t * (3 - 2 * t);
    let v = lerp(ys[i], ys[i + 1], s);
    if (l > 1.35 && l < 1.45) v *= 0.55; if (l > 1.8 && l < 1.95) v *= 0.4; // water-vapour gaps
    pts.push([l, v]);
  }
  return pts;
}
LABS.spectra = (box, api) => {
  const f = frame(640, 270, { x: [0.4, 2.5], y: [0, 0.6], b: 36 });
  gridY(f, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], (v) => v.toFixed(1));
  gridX(f, [0.5, 1, 1.5, 2, 2.5], (v) => `${v} µm`);
  const names = ["blue", "green", "red", "NIR", "SWIR1", "SWIR2"];
  S2C.forEach((x, i) => { f.svg.append(S("line", { x1: f.X(x), x2: f.X(x), y1: f.t, y2: f.h - f.b, stroke: "var(--cool)", "stroke-dasharray": "2 4", opacity: 0.6 })); f.svg.append(S("text", { x: f.X(x), y: f.t + 10, "text-anchor": "middle", "font-size": 9.5, fill: "var(--cool)", text: names[i] })); });
  const curves = {};
  for (const [n, m] of Object.entries(MATERIALS)) { curves[n] = path(spectrumCurve(m.b).map(([l, v]) => [f.X(l), f.Y(v)]), { stroke: m.col, "stroke-width": 2, opacity: 0.25 }); f.svg.append(curves[n]); }
  let sel = "Vegetation";
  const nd = ro("NDVI"), br = ro("Visible brightness"), bs = ro("Soil index (BSI)"), lab = ro("Label from the rules", "gold");
  const steps = el("ol", { class: "small", style: "margin:0;padding-left:18px;display:grid;gap:4px" });
  function update() {
    for (const [n, p] of Object.entries(curves)) { p.setAttribute("opacity", n === sel ? 1 : 0.18); p.setAttribute("stroke-width", n === sel ? 3 : 2); }
    const [label, rule, x] = classify(MATERIALS[sel].b);
    nd.b.textContent = x.ndvi.toFixed(2); br.b.textContent = x.bright.toFixed(2); bs.b.textContent = x.bsi.toFixed(3); lab.b.textContent = label;
    const r = [["NDVI > 0.3 → Vegetation", x.ndvi > 0.3], ["Brightness ≤ 0.14 → Dark surface", x.bright <= 0.14], ["BSI > 0.137 → Bare sand / soil", x.bsi > 0.137], ["Otherwise → Pale surface", true]];
    steps.innerHTML = "";
    r.forEach(([t], i) => steps.append(el("li", { style: `color:${i + 1 === rule ? "var(--gold)" : "var(--muted)"};${i + 1 === rule ? "font-weight:700" : ""}`, text: `${t}${i + 1 < rule ? "  ✗ no" : i + 1 === rule ? "  ✓ first match" : ""}` })));
  }
  const picker = seg(Object.keys(MATERIALS).map((n) => [n, n]), sel, (v) => { sel = v; update(); api.award("Lab: spectral fingerprints"); });
  update();

  // classifier game
  const game = el("div", { class: "lab", style: "background:var(--bg-2)" });
  let round = 0, score = 0, cur = null;
  const rand = mulberry32(11);
  function newRound() {
    game.innerHTML = "";
    if (round >= 8) {
      game.append(el("h3", { text: `Classifier game: ${score}/8` }), el("p", { class: "hint", text: score >= 6 ? "You apply the rules like the pipeline does." : "Remember: check NDVI first, then brightness, then the soil index." }));
      if (score >= 6) api.award("Classifier game passed");
      game.append(el("button", { class: "btn small", text: "Play again", onclick: () => { round = 0; score = 0; newRound(); } }));
      return;
    }
    const keys = Object.keys(MATERIALS);
    const a = MATERIALS[keys[Math.floor(rand() * keys.length)]].b, bb = MATERIALS[keys[Math.floor(rand() * keys.length)]].b;
    const mix = 0.6 + rand() * 0.4;
    cur = a.map((v, i) => clamp(v * mix + bb[i] * (1 - mix) + gauss(rand) * 0.01, 0.001, 0.9));
    const x = indices(cur);
    const showIdx = el("div", { class: "small muted", hidden: true, text: `NDVI ${x.ndvi.toFixed(2)} · brightness ${x.bright.toFixed(2)} · BSI ${x.bsi.toFixed(3)}` });
    const tbl = el("div", { class: "table-wrap" }, el("table", { class: "t" }, [el("tr", {}, names.map((n) => el("th", { class: "n", text: n }))), el("tr", {}, cur.map((v) => el("td", { class: "n", text: v.toFixed(3) })))]));
    const fb = el("div", { class: "explain", hidden: true });
    const opts = el("div", { class: "seg" });
    ["Vegetation", "Dark surface", "Bare sand / soil", "Pale surface"].forEach((n) => opts.append(el("button", { type: "button", text: n, onclick: () => {
      const [ans] = classify(cur);
      const ok = ans === n; if (ok) score++;
      fb.innerHTML = `<b>${ok ? "Right" : `It's ${ans}`}.</b> NDVI ${x.ndvi.toFixed(2)}, brightness ${x.bright.toFixed(2)}, BSI ${x.bsi.toFixed(3)}: the first rule that matches wins.`;
      fb.hidden = false; opts.querySelectorAll("button").forEach((b2) => (b2.disabled = true));
      setTimeout(() => { round++; newRound(); }, 2200);
    } })));
    game.append(el("h3", { text: `Classifier game · pixel ${round + 1} of 8 · score ${score}` }), el("p", { class: "hint", text: "Band reflectances of a mystery 10 m pixel (often a mix). Which label do the four rules give?" }), tbl,
      el("button", { class: "btn small", text: "Show the three indices", onclick: (e) => { showIdx.hidden = false; e.target.remove(); } }), showIdx, opts, fb);
  }
  newRound();
  box.append(el("div", { class: "viz-box" }, f.svg), el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "Material" }), picker]),
    el("div", { class: "lab-row" }, [el("div", { class: "readout" }, [nd.wrap, br.wrap, bs.wrap, lab.wrap]), el("div", { class: "lab-ctrl" }, [el("span", { class: "eyebrow", text: "The rules, top to bottom" }), steps])]),
    el("p", { class: "hint", text: "Water and shadow both come out 'dark': brightness alone cannot tell them from asphalt. That is the dark-class problem." }), game);
};

// ---------------------------------------------------------------- 7. threshold & balanced accuracy
LABS.threshold = (box, api) => {
  const pdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const cdf = (x, m, s) => 0.5 * (1 + erf((x - m) / (s * Math.SQRT2)));
  function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
  const R = { m: 0.08, s: 0.08 }, O = { m: 0.2, s: 0.09 }; // roofs, open ground (illustrative, tuned to the real 0.137 / 75%)
  const f = frame(640, 250, { x: [-0.15, 0.45], y: [0, 5.2], b: 34 });
  gridX(f, [-0.1, 0, 0.1, 0.2, 0.3, 0.4], (v) => v.toFixed(1));
  f.svg.append(S("text", { x: f.w / 2, y: f.h - 2, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", text: "bare soil index (BSI)" }));
  const area = (d, col) => { const pts = [[f.X(-0.15), f.Y(0)]]; for (let x = -0.15; x <= 0.45; x += 0.004) pts.push([f.X(x), f.Y(d(x))]); pts.push([f.X(0.45), f.Y(0)]); return S("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("") + "Z", fill: col, opacity: 0.35, stroke: col, "stroke-width": 2 }); };
  f.svg.append(area((x) => pdf(x, R.m, R.s), "#2a78d6"), area((x) => pdf(x, O.m, O.s), "#f06a35"));
  f.svg.append(S("text", { x: f.X(0.0), y: f.Y(4.6), "font-size": 11, fill: "#2a78d6", text: "known roofs" }), S("text", { x: f.X(0.25), y: f.Y(4.0), "font-size": 11, fill: "#f06a35", text: "known open ground" }));
  const cut = S("line", { y1: f.t, y2: f.h - f.b, stroke: "var(--ink)", "stroke-width": 2 });
  const cutTxt = S("text", { "font-size": 11, fill: "var(--ink)" });
  f.svg.append(cut, cutTxt);
  const t = ctl("thrT", "Cut-off: above = sand / soil", -0.05, 0.35, 0.001, 0.05, (v) => v.toFixed(3));
  const sens = ro("Roofs labelled right"), spec = ro("Open ground labelled right"), ba = ro("Balanced accuracy", "gold"), acc = ro("Plain accuracy (1 roof : 19 desert)", "muted");
  const note = el("div", { class: "note" });
  let best = 0, bestT = 0;
  for (let x = -0.05; x <= 0.35; x += 0.001) { const b = (cdf(x, R.m, R.s) + 1 - cdf(x, O.m, O.s)) / 2; if (b > best) { best = b; bestT = x; } }
  function update() {
    const x = +t.input.value;
    const se = cdf(x, R.m, R.s), sp = 1 - cdf(x, O.m, O.s), b = (se + sp) / 2, a = (se * 1 + sp * 19) / 20;
    cut.setAttribute("x1", f.X(x)); cut.setAttribute("x2", f.X(x)); cutTxt.setAttribute("x", f.X(x) + 5); cutTxt.setAttribute("y", f.t + 12); cutTxt.textContent = `cut ${x.toFixed(3)}`;
    sens.b.textContent = `${(se * 100).toFixed(0)}%`; spec.b.textContent = `${(sp * 100).toFixed(0)}%`; ba.b.textContent = `${(b * 100).toFixed(1)}%`; acc.b.textContent = `${(a * 100).toFixed(1)}%`;
    const near = Math.abs(b - best) < 0.004;
    note.innerHTML = near ? `<b>Found it.</b> Best balanced accuracy ${(best * 100).toFixed(1)}% at about ${bestT.toFixed(3)}, the same as CoolCairo's 0.137 and 75%.` : `Move the cut-off to maximise <b>balanced</b> accuracy. Watch plain accuracy: push the cut-off far left and it climbs towards 95% by calling almost everything desert, while roofs fail.`;
    if (near) api.award("Lab: found the best cut-off");
  }
  t.input.addEventListener("input", update);
  update();
  box.append(el("div", { class: "viz-box" }, f.svg), t.wrap, el("div", { class: "readout" }, [sens.wrap, spec.wrap, ba.wrap, acc.wrap]), note,
    el("button", { class: "btn small", text: "Show me the best cut-off", onclick: () => { t.input.value = bestT.toFixed(3); t.input.dispatchEvent(new Event("input")); } }));
};

// ---------------------------------------------------------------- 8. block fusion & unmixing
LABS.fusion = (box, api) => {
  const MAT = [
    ["Pale ground", "#dbd4c2", "pale"], ["Asphalt", "#38383d", "dark_ground"], ["Sand", "#d6b37d", "sand"],
    ["Vegetation", "#548c45", "veg"], ["Pale roof", "#f4efe2", "pale_roof"], ["Dark roof", "#6a6a74", "dark_roof"],
  ];
  const G = Array.from({ length: 81 }, (_, i) => { const x = i % 9, y = Math.floor(i / 9); return y === 4 ? 1 : (x < 3 && y < 3) ? 4 : (x > 5 && y > 5) ? 2 : (x > 5 && y < 3) ? 3 : 0; });
  let brush = 4;
  const cv = el("canvas", { class: "viz", width: 270, height: 270, style: "aspect-ratio:1;max-width:300px;cursor:crosshair" });
  const ctx = cv.getContext("2d");
  function draw() {
    for (let i = 0; i < 81; i++) { ctx.fillStyle = MAT[G[i]][1]; ctx.fillRect((i % 9) * 30, Math.floor(i / 9) * 30, 30, 30); }
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; for (let k = 0; k <= 270; k += 30) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 270); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(270, k); ctx.stroke(); }
    ctx.strokeStyle = "rgba(240,106,53,0.9)"; ctx.lineWidth = 2; for (let k = 0; k <= 270; k += 90) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 270); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(270, k); ctx.stroke(); } ctx.lineWidth = 1;
  }
  let painting = false;
  const paint = (e) => { const r = cv.getBoundingClientRect(); const x = Math.floor(((e.clientX - r.left) / r.width) * 9), y = Math.floor(((e.clientY - r.top) / r.height) * 9); if (x < 0 || y < 0 || x > 8 || y > 8) return; G[y * 9 + x] = brush; draw(); update(); api.award("Lab: built a block"); };
  cv.addEventListener("pointerdown", (e) => { painting = true; cv.setPointerCapture(e.pointerId); paint(e); });
  cv.addEventListener("pointermove", (e) => painting && paint(e));
  cv.addEventListener("pointerup", () => (painting = false));
  const pal = seg(MAT.map((m, i) => [i, m[0]]), brush, (v) => (brush = v));
  const ht = ctl("fuH", "Mean building height", 0, 40, 1, 15, (v) => `${v} m`);
  const pop = ctl("fuP", "Residents (WorldPop)", 0, 3000, 10, 600, (v) => fint(v));
  const tbody = el("tbody");
  const temp = ro("Model temperature", "heat"), expo = ro("Heat exposure", "gold");
  function update() {
    const share = {}; MAT.forEach((m) => (share[m[2]] = 0)); G.forEach((g) => (share[MAT[g][2]] += 1 / 81));
    const roofs = share.pale_roof + share.dark_roof;
    // The app's model; dark roofs counted as roofs only (the dark-roof coefficient fails the sign check).
    const T = 45.83 - 3.15 * share.veg + 3.36 * share.sand + 0.12 * share.dark_ground + 2.29 * roofs - 0.062 * (roofs > 0 ? +ht.input.value : 0);
    const E = +pop.input.value * Math.max(0, T - 45.66);
    temp.b.textContent = `${T.toFixed(2)} °C`; expo.b.textContent = `${fint(E)} person·°C`;
    tbody.innerHTML = "";
    const rows = [["Vegetation share", share.veg], ["Sand share", share.sand], ["Dark ground share", share.dark_ground], ["Roof share (all)", roofs], ["Dark roof share", share.dark_roof], ["Pale ground (reference)", share.pale]];
    rows.forEach(([n, v]) => tbody.append(el("tr", {}, [el("td", { text: n }), el("td", { class: "n", text: `${(v * 100).toFixed(0)}%` })])));
    tbody.append(el("tr", {}, [el("td", { text: "Height" }), el("td", { class: "n", text: roofs > 0 ? `${ht.input.value} m` : "no buildings" })]), el("tr", {}, [el("td", { text: "Residents" }), el("td", { class: "n", text: fint(+pop.input.value) })]));
  }
  ht.input.addEventListener("input", update); pop.input.addEventListener("input", update);
  draw(); update();

  // unmixing puzzle
  const END = { Vegetation: MATERIALS.Vegetation.b, Sand: MATERIALS["Desert sand"].b, Asphalt: MATERIALS.Asphalt.b };
  const truthF = [0.45, 0.35, 0.2];
  const target = [0, 1, 2, 3, 4, 5].map((i) => truthF[0] * END.Vegetation[i] + truthF[1] * END.Sand[i] + truthF[2] * END.Asphalt[i]);
  const uv = ctl("unV", "Vegetation share", 0, 1, 0.05, 0.2, (v) => `${Math.round(v * 100)}%`);
  const us = ctl("unS", "Sand share", 0, 1, 0.05, 0.6, (v) => `${Math.round(v * 100)}%`);
  const uf = frame(420, 200, { x: [0, 5], y: [0, 0.5], b: 26 });
  gridY(uf, [0, 0.1, 0.2, 0.3, 0.4, 0.5], (v) => v.toFixed(1));
  ["blue", "green", "red", "NIR", "SWIR1", "SWIR2"].forEach((n, i) => uf.svg.append(S("text", { x: uf.X(i), y: uf.h - 8, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)", text: n })));
  uf.svg.append(path(target.map((v, i) => [uf.X(i), uf.Y(v)]), { stroke: "var(--gold)", "stroke-width": 3 }));
  const mine = S("path", { fill: "none", stroke: "var(--cool)", "stroke-width": 2.4, "stroke-dasharray": "6 4" });
  uf.svg.append(mine);
  const fit = ro("Mismatch (RMSE)"), asph = ro("Asphalt share (the rest)");
  const unNote = el("p", { class: "hint" });
  function uupd() {
    let v = +uv.input.value, s = +us.input.value; if (v + s > 1) { s = +(1 - v).toFixed(2); us.input.value = s; us.out.textContent = `${Math.round(s * 100)}%`; }
    const a = 1 - v - s;
    const mix = [0, 1, 2, 3, 4, 5].map((i) => v * END.Vegetation[i] + s * END.Sand[i] + a * END.Asphalt[i]);
    mine.setAttribute("d", mix.map((m, i) => `${i ? "L" : "M"}${uf.X(i)},${uf.Y(m)}`).join(""));
    const rmse = Math.sqrt(mean(mix.map((m, i) => (m - target[i]) ** 2)));
    fit.b.textContent = rmse.toFixed(4); fit.b.className = rmse < 0.006 ? "good" : ""; asph.b.textContent = `${Math.round(a * 100)}%`;
    unNote.innerHTML = rmse < 0.006 ? "<b>Unmixed.</b> 45% vegetation, 35% sand, 20% asphalt: exactly how the mixed pixel was made. Real unmixing solves this with least squares across hundreds of bands." : "Match the dashed blue spectrum to the gold one. Six bands make this possible for three materials; hundreds of bands can separate many more.";
    if (rmse < 0.006) api.award("Lab: unmixed a pixel");
  }
  uv.input.addEventListener("input", uupd); us.input.addEventListener("input", uupd); uupd();

  box.append(
    el("div", { class: "lab-row" }, [
      el("div", { class: "lab-ctrl" }, [el("div", { class: "viz-box", style: "padding:10px;justify-self:start" }, cv), el("div", { class: "ctl" }, [el("span", { class: "lbl", text: "Paint with" }), pal]),
        el("p", { class: "hint", text: "81 Sentinel-2 pixels of 10 m make one 90 m block. Orange lines mark the 9 Landsat pixels (30 m) inside it." })]),
      el("div", { class: "lab-ctrl" }, [el("span", { class: "eyebrow", text: "This block's row of facts" }), el("div", { class: "table-wrap" }, el("table", { class: "t" }, tbody)), ht.wrap, pop.wrap, el("div", { class: "readout" }, [temp.wrap, expo.wrap])]),
    ]),
    el("h3", { text: "Unmix a mixed pixel" }),
    el("div", { class: "lab-row" }, [el("div", { class: "viz-box" }, uf.svg), el("div", { class: "lab-ctrl" }, [uv.wrap, us.wrap, el("div", { class: "readout" }, [fit.wrap, asph.wrap]), unNote])]),
    el("div", { class: "legend-row" }, [el("span", { html: '<i style="background:var(--gold)"></i>Measured mixed pixel' }), el("span", { html: '<i style="background:var(--cool)"></i>Your blend of pure endmembers' })]),
  );
};
