// Rocks and boulders: procedural, faceted stones (displaced icosahedra) with lichen tints and snow
// lying on the top faces in winter. Scattered on steep / high ground and as single boulders in
// meadows and forests; also used for the placeable "Felsbrocken" objects.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, normalAt } from './terrain.js';
import { mulberry32, makeSimplex, clamp, lerp } from './noise.js';
import { GFX } from './gfx.js';
import { applySeasonColors } from './houses.js';

// one rock: about 2 m wide, origin at its base; attributes color (winter) and color2 (summer)
export function rockGeometry(seed = 1, kind = 'boulder') {
  const rnd = mulberry32(seed * 977 + 13), sim = makeSimplex(rnd);
  const detail = GFX.potato ? 1 : GFX.ultra ? 3 : 2;
  let g = new THREE.IcosahedronGeometry(1, detail);
  g = g.toNonIndexed();
  const p = g.attributes.position, v = new THREE.Vector3();
  const sx = lerp(0.9, 1.5, rnd()), sy = kind === 'slab' ? lerp(0.45, 0.6, rnd()) : lerp(0.75, 1.15, rnd()), sz = lerp(0.8, 1.3, rnd());
  // displace a smooth copy of each unique vertex so the faces stay closed
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let o = cache.get(key);
    if (!o) {
      const n1 = sim(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3 - seed), n2 = sim(v.x * 3.1, v.y * 3.1 + seed, v.z * 3.1);
      let r = 1 + n1 * 0.22 + n2 * 0.08;
      // a few flat fracture planes make it look like broken rock
      if (v.y > 0.6) r = Math.min(r, (0.82 + 0.08 * n2) / Math.max(0.2, v.y));
      if (Math.abs(v.x) > 0.75) r = Math.min(r, (0.86 + 0.06 * n1) / Math.abs(v.x));
      o = new THREE.Vector3(v.x * r * sx, v.y * r * sy, v.z * r * sz);
      if (o.y < -0.4) o.y = -0.4 + (o.y + 0.4) * 0.5; // flat-ish bottom (buried)
      cache.set(key, o);
    }
    p.setXYZ(i, o.x, o.y + 0.4, o.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, cw = new Float32Array(p.count * 3), cs = new Float32Array(p.count * 3);
  const base = [new THREE.Color(0x7a7874), new THREE.Color(0x6a6864), new THREE.Color(0x85817a), new THREE.Color(0x5f5d5a)][seed % 4];
  const lichen = new THREE.Color(0x8a8a5a), snow = new THREE.Color(0xf3f6fa), moss = new THREE.Color(0x5d6b3a), c = new THREE.Color();
  for (let f = 0; f < p.count; f += 3) {
    // per face: a little colour variation, lichen patches, snow on faces looking up
    const ny = (n.getY(f) + n.getY(f + 1) + n.getY(f + 2)) / 3, cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const shade = 0.82 + rnd() * 0.3, li = rnd() < 0.18 ? 0.45 : 0;
    for (let k = 0; k < 3; k++) {
      c.copy(base).multiplyScalar(shade).lerp(lichen, li);
      if (cy < 0.35) c.multiplyScalar(0.8);
      const sn = clamp((ny - 0.62) / 0.25, 0, 1) * (rnd() < 0.8 ? 0.9 : 0.3);
      const w = c.clone().lerp(snow, sn);
      cw[(f + k) * 3] = w.r; cw[(f + k) * 3 + 1] = w.g; cw[(f + k) * 3 + 2] = w.b;
      const s = c.clone().lerp(moss, ny > 0.6 && cy < 0.9 ? 0.25 : 0);
      cs[(f + k) * 3] = s.r; cs[(f + k) * 3 + 1] = s.g; cs[(f + k) * 3 + 2] = s.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cw, 3));
  g.setAttribute('color2', new THREE.BufferAttribute(cs, 3));
  g.deleteAttribute('uv');
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export class Rocks {
  constructor(world, scene, tv, trees) {
    this.world = world; this.scene = scene; this.tv = tv; this.trees = trees;
    this.kinds = GFX.potato ? 2 : 4;
    this.geos = [];
    for (let k = 0; k < this.kinds; k++) this.geos.push(rockGeometry(k + 1, k === 3 ? 'slab' : 'boulder'));
    this.max = GFX.potato ? 700 : GFX.ultra ? 4500 : 2600;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.meshes = this.geos.map((g) => { const m = new THREE.InstancedMesh(g, this.mat, this.max); m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; });
    this.list = [];
    this.generate();
    this.rebuild();
  }

  generate() {
    const w = this.world, S = w.S, rand = mulberry32(w.params.seed + 4321), sim = makeSimplex(rand);
    const want = this.max * 0.85;
    for (let tries = 0; tries < want * 30 && this.list.length < want; tries++) {
      const x = (rand() - 0.5) * (S - 40), z = (rand() - 0.5) * (S - 40);
      const h = heightAt(w, x, z), n = normalAt(w, x, z);
      const steep = 1 - n.y, high = h > w.treeline - 60;
      // rocks gather in groups (noise), on steep ground and up high; a few lonely boulders elsewhere
      const field = sim(x / 260, z / 260) * 0.5 + 0.5;
      let p = 0;
      if (steep > 0.12 && steep < 0.5) p = 0.25 + steep * 1.4;
      if (high) p += 0.35;
      p *= 0.3 + field * 1.1;
      p += 0.015;
      if (rand() > p) continue;
      if (this.trees.blockedAt(x, z, 2)) continue;
      if (this.tv.pisteAt(x, z) || this.tv.trailAt(x, z)) continue;
      const big = high && rand() < 0.25 ? lerp(2.5, 5.5, rand()) : lerp(0.4, 1.8, rand());
      const k = Math.floor(rand() * this.kinds);
      this.list.push({ x, z, s: big, k, r: rand() * 6.28, t: (rand() - 0.5) * 0.4 });
      // a few small stones around a big one
      if (big > 1.5) for (let q = 0; q < 3; q++) { const a = rand() * 6.28, d = big * lerp(1.1, 2.2, rand()); this.list.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, s: big * lerp(0.15, 0.35, rand()), k: Math.floor(rand() * this.kinds), r: rand() * 6.28, t: 0 }); }
    }
  }

  rebuild() {
    const cnt = this.meshes.map(() => 0), w = this.world;
    for (const r of this.list) {
      const m = this.meshes[r.k], i = cnt[r.k];
      if (i >= this.max) continue;
      const n = normalAt(w, r.x, r.z);
      _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x * 0.6, 1, n.z * 0.6).normalize());
      _q.multiply(new THREE.Quaternion().setFromEuler(_e.set(r.t, r.r, 0)));
      _p.set(r.x, heightAt(w, r.x, r.z) - 0.25 * r.s, r.z);
      _s.set(r.s, r.s, r.s);
      m.setMatrixAt(i, _m.compose(_p, _q, _s));
      cnt[r.k]++;
    }
    this.meshes.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; });
  }

  // brush: scatter rocks inside the circle. kind 'small' | 'mix' | 'big'
  addCircle(x, z, r, kind = 'mix', rand = Math.random) {
    const count = Math.max(1, Math.round((Math.PI * r * r) / (kind === 'big' ? 420 : kind === 'small' ? 70 : 160)));
    let added = 0;
    for (let k = 0; k < count * 5 && added < count; k++) {
      if (this.list.length >= this.max) break;
      const a = rand() * 6.28, d = Math.sqrt(rand()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (Math.abs(px) > this.world.S / 2 - 6 || Math.abs(pz) > this.world.S / 2 - 6) continue;
      if (this.tv.pisteAt(px, pz) || this.tv.trailAt(px, pz)) continue;
      if (this.trees.blockedAt(px, pz, 1)) continue;
      const s = kind === 'small' ? lerp(0.25, 0.9, rand()) : kind === 'big' ? lerp(2.2, 5, rand()) : (rand() < 0.2 ? lerp(1.8, 3.5, rand()) : lerp(0.35, 1.5, rand()));
      let close = false;
      for (let i = this.list.length - 1; i >= Math.max(0, this.list.length - 600); i--) { const q = this.list[i]; if ((q.x - px) ** 2 + (q.z - pz) ** 2 < ((q.s + s) * 0.75) ** 2) { close = true; break; } }
      if (close) continue;
      this.list.push({ x: px, z: pz, s, k: Math.floor(rand() * this.kinds), r: rand() * 6.28, t: (rand() - 0.5) * 0.4 });
      added++;
    }
    if (added) { this.edited = true; this.rebuild(); }
    return added;
  }
  // save only when the player changed the rocks (otherwise they are re-generated from the seed)
  serialize() {
    if (!this.edited) return null;
    const a = new Int16Array(this.list.length * 5);
    this.list.forEach((q, i) => { const o = i * 5; a[o] = Math.round(q.x * 4); a[o + 1] = Math.round(q.z * 4); a[o + 2] = Math.round(q.s * 1000); a[o + 3] = Math.round(q.r * 1000); a[o + 4] = q.k * 64 + Math.round(clamp(q.t + 0.3, 0, 0.6) * 100); });
    let s = ''; const b = new Uint8Array(a.buffer);
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  }
  load(str) {
    if (!str) return;
    const bin = atob(str), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const a = new Int16Array(b.buffer, 0, Math.floor(b.length / 10) * 5);
    this.list = [];
    for (let o = 0; o + 4 < a.length; o += 5) this.list.push({ x: a[o] / 4, z: a[o + 1] / 4, s: a[o + 2] / 1000, r: a[o + 3] / 1000, k: Math.min(this.kinds - 1, a[o + 4] >> 6), t: (a[o + 4] & 63) / 100 - 0.3 });
    this.edited = true;
    this.rebuild();
  }
  userRemove(x, z, r) { const n0 = this.list.length; this.removeCircle(x, z, r); if (this.list.length !== n0) this.edited = true; return n0 - this.list.length; }

  removeCircle(x, z, r) { const n0 = this.list.length; this.list = this.list.filter((q) => (q.x - x) ** 2 + (q.z - z) ** 2 > (r + q.s) ** 2); if (this.list.length !== n0) this.rebuild(); }
  removeWhere(fn) { const n0 = this.list.length; this.list = this.list.filter((q) => !fn(q)); if (this.list.length !== n0) this.rebuild(); }
  // after loading a save: no rocks on pistes / trails / roads
  cull() { this.removeWhere((q) => this.tv.pisteAt(q.x, q.z) || this.tv.trailAt(q.x, q.z) || this.trees.blockedAt(q.x, q.z, 1)); }
  nearest(x, z, r) { let best = null, bd = r; for (const q of this.list) { const dx = q.x - x; if (dx > r + 6 || dx < -r - 6) continue; const d = Math.hypot(dx, q.z - z) - q.s * 0.9; if (d < bd) { bd = d; best = q; } } return best ? { x: best.x, z: best.z, d: bd, s: best.s } : null; }

  setSeason(s) { for (const g of this.geos) applySeasonColors(g, s); }
  dispose() { for (const m of this.meshes) { this.scene.remove(m); m.geometry.dispose(); } this.mat.dispose(); }
}
