// Course markings painted on the snow (race dye): thin, clean vector ribbons lying on the terrain.
// Any width from 5 cm upwards stays crisp because it is geometry, not a texture brush.
import * as THREE from 'three';
import { heightAt, normalAt } from './terrain.js';

export const MARK_COLORS = { blau: [0x1d5fe0, '🔵 Blau'], dunkel: [0x0c2f8a, '🫐 Dunkelblau'], rot: [0xd8242c, '🔴 Rot'], gruen: [0x169a3c, '🟢 Grün'] };
const STEP = 0.35;

// soft 1-texel edges across the ribbon -> antialiased but sharp lines
function edgeTex() {
  const w = 64, d = new Uint8Array(w * 4);
  for (let i = 0; i < w; i++) {
    const u = (i + 0.5) / w, e = Math.min(u, 1 - u) * w; // distance to edge in texels
    const a = Math.min(1, e / 2.2);
    d.set([255, 255, 255, Math.round(a * 255)], i * 4);
  }
  const t = new THREE.DataTexture(d, w, 1, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

export class Marks {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.strokes = []; // { c, w, d, p: [x,z,x,z,...] } (resampled every STEP m)
    this.tex = edgeTex();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 4; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.prevMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.clone());
    this.prevMesh.material.opacity = 0.75;
    this.prevMesh.renderOrder = 5; this.prevMesh.frustumCulled = false;
    scene.add(this.prevMesh);
  }

  static resample(pts, step = STEP) {
    if (pts.length < 2) return pts.slice();
    const out = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z);
      let s = step - carry;
      while (s <= L) { const t = s / L; out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); s += step; }
      carry = L - (s - step);
    }
    const last = pts[pts.length - 1], o = out[out.length - 1];
    if (Math.hypot(last.x - o.x, last.z - o.z) > 0.05) out.push(last);
    return out;
  }

  // Chaikin smoothing for hand-drawn strokes (keeps the end points)
  static smooth(pts, it = 2) {
    let p = pts;
    for (let k = 0; k < it && p.length > 2; k++) {
      const q = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        q.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
      }
      q.push(p[p.length - 1]);
      p = q;
    }
    return p;
  }

  // ribbon quads for one stroke into the arrays
  emit(s, pos, nor, col, uv, idx) {
    const P = s.p, n = P.length / 2;
    if (n < 2) return;
    const c = new THREE.Color(MARK_COLORS[s.c] ? MARK_COLORS[s.c][0] : 0x1d5fe0);
    const hw = s.w / 2, dash = Math.max(0.9, s.w * 6), gap = dash * 0.75;
    const lift = 0.05 + s.w * 0.01;
    let along = 0, prev = -1;
    for (let i = 0; i < n; i++) {
      const x = P[i * 2], z = P[i * 2 + 1];
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      let tx = P[ib * 2] - P[ia * 2], tz = P[ib * 2 + 1] - P[ia * 2 + 1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (i > 0) along += Math.hypot(x - P[i * 2 - 2], z - P[i * 2 - 1]);
      const on = !s.d || (along % (dash + gap)) < dash;
      const nx = -tz, nz = tx;
      const base = pos.length / 3;
      for (const sg of [-1, 1]) {
        const vx = x + nx * hw * sg, vz = z + nz * hw * sg;
        pos.push(vx, heightAt(this.world, vx, vz) + lift, vz);
        const nn = normalAt(this.world, vx, vz); nor.push(nn.x, nn.y, nn.z);
        col.push(c.r, c.g, c.b);
        uv.push(sg < 0 ? 0 : 1, 0.5);
      }
      if (prev >= 0 && on) idx.push(prev, prev + 1, base, base, prev + 1, base + 1);
      prev = base;
    }
  }

  buildGeo(list) {
    const pos = [], nor = [], col = [], uv = [], idx = [];
    for (const s of list) this.emit(s, pos, nor, col, uv, idx);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  rebuild() { this.mesh.geometry.dispose(); this.mesh.geometry = this.buildGeo(this.strokes); }

  toStroke(pts, w, c, dashed, smooth) {
    let q = pts;
    if (smooth && q.length > 2) q = Marks.smooth(q, 2);
    q = Marks.resample(q);
    const p = [];
    for (const v of q) p.push(v.x, v.z);
    return { c, w, d: dashed ? 1 : 0, p };
  }

  preview(pts, w, c, dashed, smooth) {
    this.prevMesh.geometry.dispose();
    this.prevMesh.geometry = pts && pts.length > 1 ? this.buildGeo([this.toStroke(pts, w, c, dashed, smooth)]) : new THREE.BufferGeometry();
  }

  add(pts, w, c, dashed, smooth) {
    const s = this.toStroke(pts, w, c, dashed, smooth);
    if (s.p.length < 4) return 0;
    this.strokes.push(s);
    this.rebuild();
    let L = 0; for (let i = 2; i < s.p.length; i += 2) L += Math.hypot(s.p[i] - s.p[i - 2], s.p[i + 1] - s.p[i - 1]);
    return L;
  }

  undo() { if (!this.strokes.length) return false; this.strokes.pop(); this.rebuild(); return true; }
  clear() { this.strokes = []; this.rebuild(); }

  // erase everything within r of (x,z); strokes are split where they are cut
  erase(x, z, r) {
    let changed = false;
    const out = [];
    for (const s of this.strokes) {
      const runs = []; let cur = [];
      for (let i = 0; i < s.p.length; i += 2) {
        const hit = Math.hypot(s.p[i] - x, s.p[i + 1] - z) < r + s.w / 2;
        if (hit) { changed = true; if (cur.length >= 4) runs.push(cur); cur = []; } else cur.push(s.p[i], s.p[i + 1]);
      }
      if (cur.length >= 4) runs.push(cur);
      if (runs.length === 1 && runs[0].length === s.p.length) out.push(s);
      else for (const p of runs) out.push({ c: s.c, w: s.w, d: s.d, p });
    }
    if (changed) { this.strokes = out; this.rebuild(); }
    return changed;
  }

  length() { let L = 0; for (const s of this.strokes) for (let i = 2; i < s.p.length; i += 2) L += Math.hypot(s.p[i] - s.p[i - 2], s.p[i + 1] - s.p[i - 1]); return L; }

  // after terraforming: re-drape on the new ground
  refresh() { this.rebuild(); }

  setVisible(v) { this.mesh.visible = v; this.prevMesh.visible = v; }

  serialize() { return this.strokes.map((s) => ({ c: s.c, w: s.w, d: s.d, p: s.p.map((v) => Math.round(v * 100) / 100) })); }
  load(arr) {
    this.strokes = [];
    for (const s of arr || []) if (s && Array.isArray(s.p) && s.p.length >= 4) this.strokes.push({ c: MARK_COLORS[s.c] ? s.c : 'blau', w: +s.w || 0.3, d: s.d ? 1 : 0, p: s.p.map(Number) });
    this.rebuild();
  }

  dispose() {
    for (const m of [this.mesh, this.prevMesh]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.tex.dispose();
  }
}
