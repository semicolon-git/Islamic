// The 3D district: one ground texture (one pixel cell per 90 m block, with treatment rings and the
// brush footprint drawn on top) and one merged mesh for all buildings. Recolours in place.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MEASURE_COLOR, css, type RGB } from "./colors";
import type { Colorizer } from "./colorizer";
import type { District } from "./data";
import { MEASURES, type PlanModel } from "./model";

const CELL = 48; // ground texture pixels per block
const FADE_MS = 350;

export type Interaction = "inspect" | "paint" | "erase";

export interface SceneEvents {
  hover(block: number, clientX: number, clientY: number): void;
  strokeStart(block: number, erase: boolean): void;
  strokeMove(block: number): void;
  strokeEnd(): void;
  select(block: number): void;
}

export class DistrictScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private groundCanvas = document.createElement("canvas");
  private groundCtx: CanvasRenderingContext2D;
  private groundTex: THREE.CanvasTexture;
  private buildings!: THREE.Mesh;
  private buildingColors!: Float32Array;
  private roofRange: [number, number][] = [];
  private wallRange: [number, number][] = [];
  private sun: THREE.DirectionalLight;
  private width: number;
  private depth: number;

  // Current and target colours, for cross-fades between views.
  private groundShown: RGB[];
  private groundFrom: RGB[];
  private groundTo: RGB[];
  private fadeStart = -1;
  private buildFrom: Float32Array | null = null;
  private buildTo: Float32Array | null = null;

  hover = -1;
  selected = -1;
  footprint: number[] = [];
  interaction: Interaction = "inspect";
  showRings = true;
  /** True-colour satellite photo of the grid (north up), shown under tinted block colours. */
  private basemap: HTMLImageElement | null = null;
  satellite = false;
  private is2D = false;
  private dirty = true;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private host: HTMLElement,
    private d: District,
    private model: PlanModel,
    private colors: Colorizer,
    private events: SceneEvents,
  ) {
    this.width = d.cols * d.blockSize;
    this.depth = d.rows * d.blockSize;
    const n = d.rows * d.cols;
    this.groundShown = Array.from({ length: n }, () => [0.5, 0.5, 0.5] as RGB);
    this.groundFrom = this.groundShown.map((c) => [...c] as RGB);
    this.groundTo = this.groundShown.map((c) => [...c] as RGB);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", `3D map of ${d.name}, ${n} blocks`);
    this.renderer.domElement.setAttribute("role", "img");

    this.camera = new THREE.PerspectiveCamera(32, 1, 10, 30000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(this.width / 2, 0, -this.depth / 2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 250;
    this.controls.maxDistance = 12000;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener("change", () => (this.dirty = true));

    // Light: soft sky fill plus a late-morning sun from the south-east (Landsat passes ~10:30).
    this.scene.add(new THREE.HemisphereLight(0xfdf6ea, 0x5a5348, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.sun.position.set(this.width / 2 + 1400, 2200, -this.depth / 2 + 1500);
    this.sun.target.position.set(this.width / 2, 0, -this.depth / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = Math.max(this.width, this.depth) * 0.75;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 100, far: 7000 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.groundCanvas.width = d.cols * CELL;
    this.groundCanvas.height = d.rows * CELL;
    this.groundCtx = this.groundCanvas.getContext("2d")!;
    this.groundTex = new THREE.CanvasTexture(this.groundCanvas);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = 8;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, this.depth),
      new THREE.MeshLambertMaterial({ map: this.groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.width / 2, 0, -this.depth / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.buildBuildings();
    this.setDefaultView(false);
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- geometry ----------

  private buildBuildings() {
    const b = this.d.buildings;
    const pos: number[] = [], nor: number[] = [];
    for (let i = 0; i < b.count; i++) {
      const ring: THREE.Vector2[] = [];
      const s = b.vertexStart[i];
      for (let k = 0; k < b.vertexCount[i]; k++) ring.push(new THREE.Vector2(b.xz[2 * (s + k)], b.xz[2 * (s + k) + 1]));
      if (ring.length > 3 && ring[0].distanceTo(ring[ring.length - 1]) < 1e-3) ring.pop();
      const h = Math.max(3, b.heightM[i]);

      const roofStart = pos.length / 3;
      for (const [a, c, e] of THREE.ShapeUtils.triangulateShape(ring, [])) {
        for (const p of [ring[a], ring[c], ring[e]]) { pos.push(p.x, h, -p.y); nor.push(0, 1, 0); }
      }
      this.roofRange.push([roofStart, pos.length / 3 - roofStart]);

      const wallStart = pos.length / 3;
      for (let k = 0; k < ring.length; k++) {
        const p = ring[k], q = ring[(k + 1) % ring.length];
        const nx = q.y - p.y, nz = q.x - p.x; // horizontal normal (sign fixed by double-sided lighting)
        const len = Math.hypot(nx, nz) || 1;
        const quad = [[p, 0], [q, 0], [q, h], [p, 0], [q, h], [p, h]] as const;
        for (const [v, y] of quad) { pos.push(v.x, y, -v.y); nor.push(nx / len, 0, nz / len); }
      }
      this.wallRange.push([wallStart, pos.length / 3 - wallStart]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    this.buildingColors = new Float32Array(pos.length).fill(0.8);
    geo.setAttribute("color", new THREE.BufferAttribute(this.buildingColors, 3));
    this.buildings = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.buildings.castShadow = true;
    this.buildings.receiveShadow = true;
    this.scene.add(this.buildings);
  }

  // ---------- colours ----------

  /** Recolour everything for the current view and plan; `fade` cross-fades (view changes). */
  refresh(fade = false) {
    const n = this.d.rows * this.d.cols;
    for (let i = 0; i < n; i++) this.groundTo[i] = this.colors.ground(i);
    const target = new Float32Array(this.buildingColors.length);
    const b = this.d.buildings;
    for (let k = 0; k < b.count; k++) {
      const { roof, wall } = this.colors.building(b.blockIndex[k]);
      fill(target, this.roofRange[k], roof);
      fill(target, this.wallRange[k], wall);
    }
    if (fade && !this.reducedMotion) {
      this.groundFrom = this.groundShown.map((c) => [...c] as RGB);
      this.buildFrom = this.buildingColors.slice();
      this.buildTo = target;
      this.fadeStart = performance.now();
    } else {
      this.fadeStart = -1;
      for (let i = 0; i < n; i++) this.groundShown[i] = this.groundTo[i];
      this.buildingColors.set(target);
      this.buildings.geometry.attributes.color.needsUpdate = true;
    }
    this.dirty = true;
  }

  private stepFade(now: number) {
    if (this.fadeStart < 0 || !this.buildFrom || !this.buildTo) return;
    const raw = Math.min(1, (now - this.fadeStart) / FADE_MS);
    const t = raw * raw * (3 - 2 * raw);
    for (let i = 0; i < this.groundShown.length; i++) {
      const a = this.groundFrom[i], c = this.groundTo[i];
      this.groundShown[i] = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    }
    const f = this.buildFrom, to = this.buildTo, out = this.buildingColors;
    for (let k = 0; k < out.length; k++) out[k] = f[k] + (to[k] - f[k]) * t;
    this.buildings.geometry.attributes.color.needsUpdate = true;
    if (raw >= 1) this.fadeStart = -1;
    this.dirty = true;
  }

  private drawGround() {
    const ctx = this.groundCtx, d = this.d;
    const rowsY = (r: number) => (d.rows - 1 - r) * CELL;
    const photo = this.satellite && this.basemap?.complete ? this.basemap : null;
    if (photo) ctx.drawImage(photo, 0, 0, this.groundCanvas.width, this.groundCanvas.height);
    // Over the photo, block colours become a light tint so streets and parks stay readable.
    ctx.globalAlpha = photo ? 0.42 : 1;
    for (let i = 0; i < this.groundShown.length; i++) {
      ctx.fillStyle = css(this.groundShown[i]);
      ctx.fillRect((i % d.cols) * CELL, rowsY(Math.floor(i / d.cols)), CELL, CELL);
    }
    ctx.globalAlpha = 1;
    // Faint block grid: blocks are the unit of every number.
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < d.cols; c++) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, d.rows * CELL); }
    for (let r = 1; r < d.rows; r++) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(d.cols * CELL, r * CELL + 0.5); }
    ctx.stroke();

    // Treatment rings: one nested ring per measure applied, so a plan stays visible in every view.
    if (this.showRings) {
      for (let i = 0; i < this.groundShown.length; i++) {
        let inset = 3;
        for (const m of MEASURES) {
          const v = this.model.getShare(m, i);
          if (v < 0.01) continue;
          ctx.strokeStyle = MEASURE_COLOR[m];
          ctx.globalAlpha = 0.45 + 0.55 * v;
          ctx.lineWidth = 3.5;
          ctx.strokeRect((i % d.cols) * CELL + inset, rowsY(Math.floor(i / d.cols)) + inset, CELL - 2 * inset, CELL - 2 * inset);
          inset += 5;
        }
      }
      ctx.globalAlpha = 1;
    }

    // Brush footprint (what one dab will change) and the selected block.
    if (this.footprint.length && this.interaction !== "inspect") {
      ctx.fillStyle = this.interaction === "erase" ? "rgba(255,90,60,0.28)" : "rgba(255,255,255,0.30)";
      ctx.strokeStyle = this.interaction === "erase" ? "#FF6A4D" : "#FFFFFF";
      ctx.lineWidth = 2.5;
      for (const i of this.footprint) {
        const x = (i % d.cols) * CELL, y = rowsY(Math.floor(i / d.cols));
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      }
    } else if (this.hover >= 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2.5;
      ctx.strokeRect((this.hover % d.cols) * CELL + 1.5, rowsY(Math.floor(this.hover / d.cols)) + 1.5, CELL - 3, CELL - 3);
    }
    if (this.selected >= 0) {
      const x = (this.selected % d.cols) * CELL, y = rowsY(Math.floor(this.selected / d.cols));
      ctx.strokeStyle = "#0B0F14";
      ctx.lineWidth = 7;
      ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = "#FFD23F";
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
    }
    this.groundTex.needsUpdate = true;
  }

  markDirty() { this.dirty = true; }

  setBackground(color: string) {
    this.scene.background = new THREE.Color(color);
    this.dirty = true;
  }

  setShadows(on: boolean) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    (this.buildings.material as THREE.Material).needsUpdate = true;
    this.dirty = true;
  }

  setBasemap(url: string) {
    const img = new Image();
    img.onload = () => (this.dirty = true);
    img.src = url;
    this.basemap = img;
  }

  setSatellite(on: boolean) {
    this.satellite = on;
    this.dirty = true;
  }

  setBuildingsVisible(on: boolean) {
    this.buildings.visible = on;
    this.dirty = true;
  }

  // ---------- camera ----------

  private flight: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number; ms: number } | null = null;

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, ms: number) {
    if (this.reducedMotion || ms <= 0) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.dirty = true;
      return;
    }
    this.flight = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, start: performance.now(), ms };
  }

  private homeTarget() { return new THREE.Vector3(this.width / 2, 0, -this.depth / 2); }

  setDefaultView(animate = true) {
    const t = this.homeTarget();
    // Fit the district to the viewport: portrait screens need the camera further back.
    const a = this.camera.aspect;
    const dist = Math.max(this.width, this.depth) * (a < 1 ? 0.6 + 1.7 / a : 1.45);
    const pos = this.is2D
      ? new THREE.Vector3(t.x, dist * 1.1, t.z + 0.01)
      : new THREE.Vector3(t.x - dist * (a < 1 ? 0.05 : 0.18), dist * 0.72, t.z + dist * 0.78);
    this.flyTo(pos, t, animate ? 900 : 0);
  }

  /** Opening shot: descend from high above onto the district. */
  intro() {
    const t = this.homeTarget();
    this.camera.position.set(t.x + 1200, 14000, t.z + 6000);
    this.controls.target.copy(t);
    this.controls.update();
    this.setDefaultView(false);
    const to = this.camera.position.clone();
    this.camera.position.set(t.x + 1200, 14000, t.z + 6000);
    this.flyTo(to, t, 2200);
  }

  set2D(on: boolean) {
    this.is2D = on;
    this.controls.enableRotate = !on;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = on ? 0.0001 : THREE.MathUtils.degToRad(78);
    this.setDefaultView(true);
  }

  focusBlock(i: number) {
    const c = new THREE.Vector3(((i % this.d.cols) + 0.5) * this.d.blockSize, 0, -(Math.floor(i / this.d.cols) + 0.5) * this.d.blockSize);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(900);
    this.flyTo(c.clone().add(offset), c, 700);
  }

  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(offset.length(), this.controls.minDistance, this.controls.maxDistance);
    this.flyTo(this.controls.target.clone().add(offset.setLength(len)), this.controls.target.clone(), 250);
  }

  setInteraction(mode: Interaction) {
    this.interaction = mode;
    const nav = mode === "inspect";
    // Inspect: left-drag orbits. Paint/erase: left-drag paints, right-drag orbits, two fingers pan.
    this.controls.mouseButtons = {
      LEFT: nav ? THREE.MOUSE.ROTATE : (null as unknown as THREE.MOUSE),
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: nav ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    };
    this.controls.touches = { ONE: nav ? THREE.TOUCH.ROTATE : (null as unknown as THREE.TOUCH), TWO: THREE.TOUCH.DOLLY_PAN };
    this.renderer.domElement.style.cursor = nav ? "grab" : "crosshair";
    this.dirty = true;
  }

  // ---------- input ----------

  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ray = new THREE.Raycaster();

  blockAt(clientX: number, clientY: number): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return -1;
    const col = Math.floor(hit.x / this.d.blockSize), row = Math.floor(-hit.z / this.d.blockSize);
    if (col < 0 || col >= this.d.cols || row < 0 || row >= this.d.rows) return -1;
    return row * this.d.cols + col;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    let stroke: number | null = null;
    let down: { x: number; y: number; id: number } | null = null;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      if (this.interaction === "inspect" || e.button !== 0) return;
      const b = this.blockAt(e.clientX, e.clientY);
      if (b < 0) return;
      stroke = e.pointerId;
      el.setPointerCapture(e.pointerId);
      this.events.strokeStart(b, this.interaction === "erase" || e.altKey || e.shiftKey);
    });
    el.addEventListener("pointermove", (e) => {
      const b = this.blockAt(e.clientX, e.clientY);
      if (b !== this.hover) { this.hover = b; this.dirty = true; }
      this.events.hover(b, e.clientX, e.clientY);
      if (stroke === e.pointerId && b >= 0) this.events.strokeMove(b);
    });
    const end = (e: PointerEvent) => {
      if (stroke === e.pointerId) { stroke = null; this.events.strokeEnd(); }
      if (down && down.id === e.pointerId && this.interaction === "inspect" && e.type === "pointerup"
          && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && e.button === 0) {
        this.events.select(this.blockAt(e.clientX, e.clientY));
      }
      down = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", () => {
      if (stroke === null) { this.hover = -1; this.events.hover(-1, 0, 0); this.dirty = true; }
    });
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private frame() {
    const now = performance.now();
    if (this.flight) {
      const f = this.flight;
      const raw = Math.min(1, (now - f.start) / f.ms);
      const t = 1 - Math.pow(1 - raw, 3);
      this.camera.position.lerpVectors(f.from, f.to, t);
      this.controls.target.lerpVectors(f.tFrom, f.tTo, t);
      if (raw >= 1) this.flight = null;
      this.dirty = true;
    }
    this.stepFade(now);
    const moved = this.controls.update();
    if (!this.dirty && !moved) return;
    this.drawGround();
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  /** Map snapshot as a PNG data URL (for the plan report). */
  snapshot(): string {
    this.drawGround();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}

// Vertex colours are linear; the palette is sRGB (as the ground texture), so convert.
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

function fill(target: Float32Array, [start, count]: [number, number], srgb: RGB) {
  const c = [lin(srgb[0]), lin(srgb[1]), lin(srgb[2])];
  for (let v = start; v < start + count; v++) { target[3 * v] = c[0]; target[3 * v + 1] = c[1]; target[3 * v + 2] = c[2]; }
}
