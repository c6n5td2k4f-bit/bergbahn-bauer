// Trees, village (houses, church, plaza, markets, barns, parking), traffic, pedestrians, snow cannons
import * as THREE from 'three';
import { rbox } from './shapes.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, normalAt, distToLine, nearestOnLine, inMap, inWater } from './terrain.js';
import { mulberry32, makeSimplex, fbm, clamp, lerp } from './noise.js';
import { addHouseParts, addBarnParts, applySeasonColors } from './houses.js';
import { GFX } from './gfx.js';
import { spruceGeometry } from './spruce.js';
import { bodyShell } from './figures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const matCache = {};
const mat = (hex, o = {}) => { const k = hex + JSON.stringify(o); return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial({ color: hex, ...o })); };

// ================= TREES =================
const _c = new THREE.Color();
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

export class Trees {
  constructor(world, scene, tv) {
    this.world = world; this.scene = scene; this.tv = tv;
    this.max = GFX.potato ? 22000 : world.S > 5000 ? 100000 : 70000;
    const parts = [];
    const colorize = (g, fn) => {
      g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
      const p = g.attributes.position, a = new Float32Array(p.count * 3), b = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const [w, s] = fn(p.getY(i)); a.set([w.r, w.g, w.b], i * 3); b.set([s.r, s.g, s.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('color2', new THREE.BufferAttribute(b, 3));
      return g;
    };
    const trunk = new THREE.Color(0x4a3426);
    parts.push(colorize(new THREE.CylinderGeometry(0.35, 0.5, 4, 5, 1, true).translate(0, 2, 0), () => [trunk, trunk]));
    // fir tiers with ragged, drooping branch tips instead of a smooth cone
    const ragged = (r, h, seed) => {
      const g = new THREE.ConeGeometry(r, h, 8, 1, true);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > -h / 2 + 0.01) continue;
        const a = Math.atan2(p.getX(i), p.getZ(i)), k = Math.round(a / (Math.PI / 4) + seed);
        const f = k % 2 ? 1.16 : 0.84;
        p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); p.setY(i, p.getY(i) - (k % 2 ? 0.45 : 0));
      }
      g.computeVertexNormals();
      return g;
    };
    const cone = (r, h, y, bot, tip, sumBot, sumTip) => colorize(ragged(r, h, y > 8 ? 1 : 0).rotateY(y * 0.7).translate(0, y, 0), (py) => {
      const t = clamp((py - (y - h / 2)) / h, 0, 1);
      return [new THREE.Color(bot).lerp(new THREE.Color(tip), Math.pow(t, 1.3) * 0.85), new THREE.Color(sumBot).lerp(new THREE.Color(sumTip), t)];
    });
    parts.push(cone(3.7, 6, 5.0, 0x13301f, 0xd9e3e6, 0x1c4a2c, 0x2d6438));
    parts.push(cone(3.0, 5.4, 7.9, 0x153422, 0xe1e9ec, 0x1e4e2e, 0x30693b));
    parts.push(cone(2.2, 4.8, 10.6, 0x173826, 0xe8eef1, 0x1f5030, 0x33703f));
    parts.push(cone(1.3, 4.2, 13.2, 0x1a3d2a, 0xf1f5f7, 0x235734, 0x3a7a47));
    this.geo = mergeGeometries(parts);
    this.mesh = new THREE.InstancedMesh(this.geo, new THREE.MeshLambertMaterial({ vertexColors: true }), this.max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    // PC Ultra: detailed spruces for the trees near the camera (level of detail)
    if (GFX.ultra) {
      this.nearMax = GFX.hyper && !GFX.lite ? 3200 : 2200;
      this.nearGeo = spruceGeometry(11);
      const mkNear = (geo) => {
        const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), this.nearMax);
        m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0;
        for (let i = 0; i < this.nearMax; i++) m.setColorAt(i, _c.setRGB(1, 1, 1)); // colour buffer must exist before the first render
        scene.add(m); return m;
      };
      this.near = mkNear(this.nearGeo);
      // HYPER: a second, differently grown spruce so the forest is not made of clones
      if (GFX.hyper && !GFX.lite) { this.nearGeo2 = spruceGeometry(29); this.near2 = mkNear(this.nearGeo2); }
      this.nearSet = [];
    }
    this.list = [];
    this.rand = mulberry32(world.params.seed + 555);
    this.generate();
    this.rebuild();
  }

  setSeason(s) { applySeasonColors(this.geo, s); if (this.nearGeo) applySeasonColors(this.nearGeo, s); if (this.nearGeo2) applySeasonColors(this.nearGeo2, s); }

  // swap the trees within ~350 m of the camera to the detailed model (called every frame, works ~1x/s)
  updateLOD(cam, force = false) {
    if (!this.near) return;
    const now = performance.now();
    const moved = !this.lodPos || Math.hypot(cam.x - this.lodPos.x, cam.z - this.lodPos.z) > 20 || Math.abs(cam.y - this.lodPos.y) > 30;
    if (!force && !this.lodDirty && (!moved || now - (this.lodT || 0) < 250) && now - (this.lodT || 0) < 1500) return;
    this.lodT = now; this.lodPos = { x: cam.x, y: cam.y, z: cam.z }; this.lodDirty = false;
    const L = this.list, n = Math.min(L.length, this.max), full = this.full, far = this.mesh.instanceMatrix.array;
    if (!full) return;
    const camH = Math.max(0, cam.y - heightAt(this.world, cam.x, cam.z));
    const R = GFX.hyper && !GFX.lite ? clamp(650 - camH * 0.4, 160, 650) : clamp(420 - camH * 0.35, 120, 420), R2 = R * R;
    const cand = [];
    for (let i = 0; i < n; i++) { const dx = L[i].x - cam.x, dz = L[i].z - cam.z, d2 = dx * dx + dz * dz; if (d2 < R2) cand.push(Math.floor(d2) * 1e6 + i); }
    const cap = this.nearMax * (this.near2 ? 2 : 1);
    if (cand.length > cap) { cand.sort((a, b) => a - b); cand.length = cap; }
    // restore the previous near trees in the simple mesh
    for (const i of this.nearSet) if (i < n) far.set(full.subarray(i * 16, i * 16 + 16), i * 16);
    const next = [], fc = this.mesh.instanceColor, meshes = this.near2 ? [this.near, this.near2] : [this.near], cnt = [0, 0];
    for (let k = 0; k < cand.length; k++) {
      const i = Math.round(cand[k] % 1e6), v = meshes.length > 1 ? i % 2 : 0, m = meshes[v];
      if (cnt[v] >= this.nearMax) continue;
      const kk = cnt[v]++;
      m.instanceMatrix.array.set(full.subarray(i * 16, i * 16 + 16), kk * 16);
      if (fc) m.setColorAt(kk, _c.fromArray(fc.array, i * 3));
      far.fill(0, i * 16, i * 16 + 16);
      next.push(i);
    }
    this.nearSet = next;
    meshes.forEach((m, v) => { m.count = cnt[v]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  blockedAt(x, z, margin = 0) {
    const w = this.world;
    if (!inMap(w, x, z, 5)) return true;
    const [px, py] = this.tv.toPx(x, z);
    const b = this.tv.blocked[Math.floor(py) * this.tv.T + Math.floor(px)];
    if (b) return true;
    if (inWater(w, x, z, 6 + margin)) return true;
    if (distToLine(w.road, x, z) < 12 + margin) return true;
    for (const o of w.overpasses || []) { const dx = x - o.x, dz = z - o.z, a = dx * o.u.x + dz * o.u.z, b = dx * o.u.z - dz * o.u.x; if (Math.abs(b) < 9 + margin && a > -o.aN - 4 && a < o.aS + 4) return true; }
    for (const r of w.riverBridges || []) { const dx = x - r.x, dz = z - r.z, a = dx * r.u.x + dz * r.u.z, b = dx * r.u.z - dz * r.u.x; if (Math.abs(b) < 8 + margin && a > -r.aN - 6 && a < r.aS + 6) return true; }
    for (const s of w.streets) { const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, L2 = dx * dx + dz * dz || 1; const t = clamp(((x - s.a.x) * dx + (z - s.a.z) * dz) / L2, 0, 1); if (Math.hypot(x - s.a.x - dx * t, z - s.a.z - dz * t) < s.w / 2 + 3) return true; }
    for (const v of w.villages) {
      if (Math.hypot(v.x - x, v.z - z) < v.plaza + 6) return true;
      if (Math.hypot(v.x - x, v.z - z) > v.r * 1.8 + 60) continue;
      for (const hs of v.houses) if (!hs.removed && Math.hypot(hs.x - x, hs.z - z) < Math.max(hs.w, hs.d) * 0.65 + 5) return true;
      if (v.church && Math.hypot(v.church.x - x, v.church.z - z) < 26) return true;
    }
    for (const b2 of w.barns) if (!b2.removed && Math.hypot(b2.x - x, b2.z - z) < 12) return true;
    if (w.parking && Math.abs(x - w.parking.x) < w.parking.w / 2 + 5 && Math.abs(z - w.parking.z) < w.parking.d / 2 + 5) return true;
    if (w.tunnel && Math.hypot(w.tunnel.x - x, w.tunnel.z - z) < 30) return true;
    return false;
  }

  canGrow(x, z) {
    const w = this.world;
    const h = heightAt(w, x, z);
    // tree line: varies smoothly over a few hundred metres (forest tongues and open alps) instead of
    // per tree, so a high plateau gets real patches of forest and open land, not a sprinkle everywhere
    if (!this.tlNoise) this.tlNoise = makeSimplex(mulberry32(w.params.seed + 77));
    const tl = w.treeline + this.tlNoise(x / 420, z / 420) * 70 + this.tlNoise(x / 90, z / 90) * 12;
    if (h > tl) return false;
    const n = normalAt(w, x, z);
    if (n.y < 0.74) return false;
    if (this.blockedAt(x, z)) return false;
    for (const v of w.villages) { const dv = Math.hypot((v.x - x) / 1.4, (v.z - z) / 0.9); if (dv < v.r * 1.15 && this.rand() > 0.07) return false; }
    if (this.tv.pisteAt(x, z) || this.tv.trailAt(x, z)) return false;
    return true;
  }

  generate() {
    const w = this.world, S = w.S, dens = w.params.forest;
    const sim = makeSimplex(mulberry32(w.params.seed + 42));
    const step = 12.5 * clamp(S / 6000, 1, 1.5) * (GFX.potato ? 1.8 : 1);
    let thr = lerp(0.45, -0.35, dens);
    // visit the cells in a scrambled order so a full tree budget still covers the whole map evenly
    const nx = Math.ceil(S / step), nc = nx * nx, P = 2654435761 % nc || 1;
    let mul = P; while (gcd(mul, nc) !== 1) mul++;
    // big maps with lots of forest land (e.g. a high plateau) would run out of the tree budget; then the
    // scrambled order thins every forest out to single trees. Instead keep fewer, but dense forests:
    // estimate how many cells would get a tree and raise the threshold until it fits the budget.
    {
      const budget = this.max - 8000, fs = [], NS = 3000;
      for (let i = 0; i < NS; i++) {
        const px = (this.rand() - 0.5) * S, pz = (this.rand() - 0.5) * S;
        let f = fbm(sim, px / 700, pz / 700, 4) + sim(px / 90, pz / 90) * 0.15;
        if (Math.abs(pz - w.valleyZAt(px)) < 170) f -= 0.25;
        if (f >= thr && this.canGrow(px, pz)) fs.push(f);
      }
      const per = (f) => 1.12 + (f > thr + 0.16 ? 3 : f > thr + 0.08 ? 2 : f > thr + 0.03 ? 1 : 0);
      const est = fs.reduce((a, f) => a + per(f), 0) / NS * nc;
      if (est > budget * 0.92) { fs.sort((a, b) => b - a); let acc = 0, k = 0; const lim = budget * 0.92 / nc * NS; while (k < fs.length && acc + 3.5 < lim) { acc += 3.5; k++; } if (k < fs.length) thr = Math.max(thr, fs[k]); }
    }
    for (let q = 0; q < nc; q++) {
      const cidx = (q * mul) % nc, x = -S / 2 + (cidx % nx) * step, z = -S / 2 + Math.floor(cidx / nx) * step;
      if (this.list.length >= this.max - 8000) return;
      const px = x + (this.rand() - 0.5) * step, pz = z + (this.rand() - 0.5) * step;
      let f = fbm(sim, px / 700, pz / 700, 4) + sim(px / 90, pz / 90) * 0.15;
      if (Math.abs(pz - w.valleyZAt(px)) < 170) f -= 0.25;
      if (f < thr) continue;
      if (!this.canGrow(px, pz)) continue;
      this.list.push({ x: px, z: pz, s: lerp(0.65, 1.35, this.rand()), r: this.rand() * 6.28 });
      // inside a forest the trees stand close together (real forest instead of a light sprinkle);
      // only at the edge of a patch they thin out
      const extra = f > thr + 0.16 ? 3 : f > thr + 0.08 ? 2 : f > thr + 0.03 ? 1 : 0;
      for (let e = 0; e < extra && this.list.length < this.max - 8000; e++) { const qx = px + (this.rand() - 0.5) * step * 0.95, qz = pz + (this.rand() - 0.5) * step * 0.95; if (this.canGrow(qx, qz)) this.list.push({ x: qx, z: qz, s: lerp(0.6, 1.3, this.rand()), r: this.rand() * 6.28 }); }
      // small clusters for a more natural edge
      if (this.rand() < 0.12) { const qx = px + (this.rand() - 0.5) * 6, qz = pz + (this.rand() - 0.5) * 6; if (this.canGrow(qx, qz)) this.list.push({ x: qx, z: qz, s: lerp(0.5, 0.9, this.rand()), r: this.rand() * 6.28 }); }
    }
  }

  rebuild() {
    const n = Math.min(this.list.length, this.max);
    for (let i = 0; i < n; i++) {
      const t = this.list[i];
      _p.set(t.x, heightAt(this.world, t.x, t.z) - 0.4, t.z);
      _q.setFromAxisAngle(UP, t.r);
      _s.set(t.s, t.s * (0.9 + (t.r % 0.3)), t.s);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      // every tree a little different: darker / lighter / bluer green
      const hsh = Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1;
      _c.setRGB(0.82 + hsh * 0.3, 0.86 + ((hsh * 7.3) % 1) * 0.24, 0.84 + ((hsh * 3.1) % 1) * 0.26);
      this.mesh.setColorAt(i, _c);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.near) { this.full = this.mesh.instanceMatrix.array.slice(0, n * 16); this.nearSet = []; this.lodDirty = true; }
    if (this.mesh.instanceColor) this.baseCol = this.mesh.instanceColor.array.slice(0, n * 3);
    if (this.sunTv) this.applySun(this.sunTv);
  }

  // HYPER: trees standing in the shadow of a mountain get darker
  applySun(tv) {
    this.sunTv = tv;
    const c = this.mesh.instanceColor; if (!c || !this.baseCol) return;
    const L = this.list, n = Math.min(L.length, this.max), a = c.array, b = this.baseCol;
    for (let i = 0; i < n; i++) { const f = 0.38 + 0.62 * tv.sunVisAt(L[i].x, L[i].z); a[i * 3] = b[i * 3] * f; a[i * 3 + 1] = b[i * 3 + 1] * f; a[i * 3 + 2] = b[i * 3 + 2] * f; }
    c.needsUpdate = true; this.lodDirty = true;
  }

  removeCircle(x, z, r) {
    const before = this.list.length;
    this.list = this.list.filter((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > r * r);
    if (this.list.length !== before) this.rebuild();
    return before - this.list.length;
  }
  removeWhere(fn) {
    const before = this.list.length;
    this.list = this.list.filter((t) => !fn(t));
    if (this.list.length !== before) this.rebuild();
  }
  nearestTree(x, z, r = 3) {
    let best = null, bd = r;
    for (const t of this.list) { const dx = t.x - x; if (dx > r || dx < -r) continue; const dz = t.z - z; if (dz > r || dz < -r) continue; const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = t; } }
    return best ? { x: best.x, z: best.z, d: bd } : null;
  }

  nearestDist(x, z, r = 3) {
    let best = r;
    for (const t of this.list) { const dx = t.x - x; if (dx > r || dx < -r) continue; const dz = t.z - z; if (dz > r || dz < -r) continue; const d = Math.hypot(dx, dz); if (d < best) best = d; }
    return best;
  }

  addCircle(x, z, r) {
    const count = Math.max(1, Math.round((Math.PI * r * r) / 240));
    let added = 0;
    for (let k = 0; k < count * 4 && added < count; k++) {
      const a = this.rand() * 6.28, d = Math.sqrt(this.rand()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.tv.pisteAt(px, pz) || this.tv.trailAt(px, pz)) continue;
      if (normalAt(this.world, px, pz).y < 0.6) continue;
      if (this.blockedAt(px, pz, -4)) continue;
      let close = false;
      for (let i = this.list.length - 1; i >= Math.max(0, this.list.length - 500); i--) { const t = this.list[i]; if ((t.x - px) ** 2 + (t.z - pz) ** 2 < 36) { close = true; break; } }
      if (close) continue;
      if (this.list.length >= this.max) break;
      this.list.push({ x: px, z: pz, s: lerp(0.6, 1.3, this.rand()), r: this.rand() * 6.28 });
      added++;
    }
    if (added) this.rebuild();
    return added;
  }

  serialize() {
    const a = new Int16Array(this.list.length * 4);
    this.list.forEach((t, i) => { a[i * 4] = Math.round(t.x * 4); a[i * 4 + 1] = Math.round(t.z * 4); a[i * 4 + 2] = Math.round(t.s * 1000); a[i * 4 + 3] = Math.round(t.r * 1000); });
    let s = ''; const b = new Uint8Array(a.buffer);
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  }
  load(str) {
    const bin = atob(str); const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const a = new Int16Array(b.buffer);
    this.list = [];
    for (let i = 0; i + 3 < a.length; i += 4) this.list.push({ x: a[i] / 4, z: a[i + 1] / 4, s: a[i + 2] / 1000, r: a[i + 3] / 1000 });
    this.rebuild();
  }

  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); if (this.near) { this.scene.remove(this.near); this.near.geometry.dispose(); this.near.material.dispose(); } if (this.near2) { this.scene.remove(this.near2); this.near2.geometry.dispose(); this.near2.material.dispose(); } }
}

// ================= VILLAGE =================
function roofGeo() {
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, 0.5,
    -0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, -0.5, 0, 0.5,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export class Village {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rand = mulberry32(world.params.seed + 77);
    this.glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
    // lit rooms glow, dark rooms stay dim (brightness from the red channel of the glass colour)
    this.glassMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= clamp(vColor.r * 3.4 - 0.15, 0.08, 1.2);'); };
    this.buildHouses();
    this.roofMats = [];
    for (const v of world.villages) { if (v.church) this.addChurch(v.church); this.addPlaza(v); }
    if (world.tunnel) this.addTunnel(world.tunnel);
    if (world.tunnel0) this.addTunnel(world.tunnel0);
    if (world.parking) this.addParking(world.parking);
    this.nightLights = [];
  }

  // generated village houses and barns (one merged mesh); houses can be torn down (h.removed)
  buildHouses() {
    const world = this.world;
    for (const m of this.houseMeshes || []) { this.group.remove(m); m.geometry.dispose(); }
    this.houseMeshes = [];
    const houses = world.villages.flatMap((v) => v.houses);
    const out = { solid: [], glass: [] };
    houses.forEach((h, i) => {
      if (h.removed) return;
      const hw = h.w / 2, hd = h.d / 2, c = Math.cos(h.rot), s = Math.sin(h.rot);
      const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]].map(([lx, lz]) => heightAt(world, h.x + lx * c + lz * s, h.z - lx * s + lz * c));
      // mix of house kinds (chalets stay the most common)
      const r = ((i * 2654435761) >>> 0) % 100;
      const kind = h.hotel ? (r < 30 ? 'apart' : 'hotel') : r < 52 ? 'chalet' : r < 66 ? 'stein' : r < 80 ? 'engadin' : r < 92 ? 'modern' : 'chalet';
      addHouseParts(out, { w: h.w, d: h.d, floors: h.hotel ? h.floors : kind === 'modern' ? Math.max(2, h.floors) : h.floors + 1, kind, seed: i * 13 + 5 }, h.x, h.z, h.rot, Math.min(...pts), Math.max(...pts) - 0.8);
    });
    world.barns.forEach((b, i) => {
      if (b.removed) return;
      const pts = [[-5, -4], [5, -4], [5, 4], [-5, 4]].map(([lx, lz]) => heightAt(world, b.x + lx, b.z + lz));
      addBarnParts(out, b.x, b.z, b.rot, Math.min(...pts), Math.max(...pts) - 0.6, i);
    });
    this.seasonGeos = this.seasonGeos ? this.seasonGeos.filter((g) => !this.houseGeo || g !== this.houseGeo) : [];
    this.houseGeo = null;
    if (out.solid.length) {
      const solid = new THREE.Mesh(mergeGeometries(out.solid), new THREE.MeshLambertMaterial({ vertexColors: true }));
      solid.castShadow = true; solid.receiveShadow = true;
      this.group.add(solid); this.houseMeshes.push(solid);
      this.seasonGeos.push(solid.geometry); this.houseGeo = solid.geometry;
      if (this.season != null) applySeasonColors(solid.geometry, this.season);
      if (out.glass.length) { const glass = new THREE.Mesh(mergeGeometries(out.glass), this.glassMat); this.group.add(glass); this.houseMeshes.push(glass); }
      out.solid.forEach((g) => g.dispose()); out.glass.forEach((g) => g.dispose());
    }
  }

  // tear down generated houses / barns inside a circle; returns how many
  removeHousesIn(x, z, r) {
    let n = 0;
    for (const v of this.world.villages) for (const h of v.houses) if (!h.removed && Math.hypot(h.x - x, h.z - z) < r) { h.removed = true; n++; }
    for (const b of this.world.barns) if (!b.removed && Math.hypot(b.x - x, b.z - z) < r) { b.removed = true; n++; }
    if (n) this.buildHouses();
    return n;
  }
  removedList() {
    const out = []; let k = 0;
    for (const v of this.world.villages) for (const h of v.houses) { if (h.removed) out.push(k); k++; }
    this.world.barns.forEach((b, i) => { if (b.removed) out.push('b' + i); });
    return out;
  }
  loadRemoved(list) {
    if (!list || !list.length) return;
    const set = new Set(list.map(String)); let k = 0;
    for (const v of this.world.villages) for (const h of v.houses) { if (set.has(String(k))) h.removed = true; k++; }
    this.world.barns.forEach((b, i) => { if (set.has('b' + i)) b.removed = true; });
    this.buildHouses();
  }

  addChurch(c) {
    const w = this.world;
    const g = new THREE.Group();
    const ground = heightAt(w, c.x, c.z) - 2;
    const white = mat(0xf5f1ea);
    const roof = new THREE.MeshLambertMaterial({ color: 0xf2f5f8 });
    this.roofMats.push([roof, 0xf2f5f8, 0x6b4a3a]);
    const dark = mat(0x3b2a20);
    const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
    add(new THREE.BoxGeometry(11, 11, 22), white, 0, 5.5, 0);
    const r = add(roofGeo(), roof, 0, 11, 0); r.scale.set(12.5, 5, 23.5);
    add(new THREE.BoxGeometry(5.5, 24, 5.5), white, 0, 12, 13.5);
    add(new THREE.CircleGeometry(1.2, 16), mat(0x222222), 0, 20, 16.27);
    add(new THREE.BoxGeometry(0.1, 0.9, 0.12), mat(0xd4af37), 0, 20.2, 16.32);
    const spire = add(new THREE.ConeGeometry(4.2, 12, 4), dark, 0, 30, 13.5); spire.rotation.y = Math.PI / 4;
    add(new THREE.BoxGeometry(0.25, 2.2, 0.25), mat(0xd4af37), 0, 37, 13.5);
    add(new THREE.BoxGeometry(1.3, 0.25, 0.25), mat(0xd4af37), 0, 37.3, 13.5);
    for (const z of [-6, 0, 6]) for (const x of [-5.6, 5.6]) add(new THREE.BoxGeometry(0.15, 3.2, 1.3), mat(0x6b8fb3), x, 6, z);
    add(new THREE.BoxGeometry(2.2, 3.4, 0.2), mat(0x4a2f1b), 0, 1.7 + 2, -11.05);
    g.position.set(c.x, ground, c.z); g.rotation.y = c.rot + Math.PI;
    this.group.add(g);
  }

  addPlaza(v) {
    const w = this.world;
    const y = heightAt(w, v.x, v.z);
    const add = (parent, geo, m, x, y2, z, ry = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y2, z); me.rotation.y = ry; me.castShadow = true; parent.add(me); return me; };
    // fountain
    const f = new THREE.Group();
    add(f, new THREE.CylinderGeometry(3.2, 3.4, 0.9, 20), mat(0x9a948c), 0, 0.45, 0);
    this.fountainWater = add(f, new THREE.CylinderGeometry(2.9, 2.9, 0.1, 20), new THREE.MeshPhongMaterial({ color: 0x3f8fa5, shininess: 80 }), 0, 0.8, 0);
    add(f, new THREE.CylinderGeometry(0.35, 0.45, 2.6, 10), mat(0x9a948c), 0, 1.3, 0);
    add(f, new THREE.CylinderGeometry(0.9, 0.5, 0.3, 12), mat(0x9a948c), 0, 2.5, 0);
    f.position.set(v.x, y - 0.1, v.z);
    this.group.add(f);
    // markets around the plaza: winter = christmas market, summer = farmers market + party stage
    const winter = new THREE.Group(), summer = new THREE.Group();
    const ring = v.plaza * 0.72;
    const nStalls = v.size === 'klein' ? 5 : v.size === 'gross' ? 10 : 7;
    for (let i = 0; i < nStalls; i++) {
      const a = (i / nStalls) * Math.PI * 2 + 0.3;
      if (Math.sin(a) > 0.75) continue; // leave the road side open
      const x = v.x + Math.cos(a) * ring, z = v.z + Math.sin(a) * ring, gy = heightAt(w, x, z);
      const rot = -a + Math.PI / 2;
      // christmas hut
      const hut = new THREE.Group();
      add(hut, new THREE.BoxGeometry(3.2, 2.4, 2.4), mat(0x7a4f2c), 0, 1.2, 0);
      add(hut, new THREE.BoxGeometry(2.6, 0.9, 0.1), mat(0x2b1a10), 0, 1.4, 1.22);
      add(hut, new THREE.BoxGeometry(3.3, 0.15, 0.7), mat(0x5a3a22), 0, 0.95, 1.5);
      // warm light inside the counter opening, corner posts, plank lines, goods, a sign and a fir garland
      const glow = add(hut, new THREE.BoxGeometry(2.5, 0.8, 0.05), new THREE.MeshLambertMaterial({ color: 0x6a4a2a, emissive: 0x000000 }), 0, 1.4, 1.18);
      (this._lights ||= []).push(glow.material);
      for (const sx of [-1.58, 1.58]) for (const sz of [-1.18, 1.18]) add(hut, new THREE.BoxGeometry(0.14, 2.4, 0.14), mat(0x4a2f1b), sx, 1.2, sz);
      if (GFX.ultra) for (let yy = 0.25; yy < 2.3; yy += 0.28) { if (yy > 0.95 && yy < 1.85) continue; add(hut, new THREE.BoxGeometry(3.22, 0.03, 0.02), mat(0x4a2f1b), 0, yy, 1.21); }
      for (let k = 0; k < 5; k++) add(hut, new THREE.BoxGeometry(0.4, 0.18 + (k % 2) * 0.12, 0.3), mat([0xc0392b, 0xf2b705, 0x8a5e3b, 0x2e7d4f, 0xf4f4f0][(k + i) % 5]), -1.2 + k * 0.6, 1.1 + (k % 2) * 0.05, 1.45);
      add(hut, new THREE.BoxGeometry(1.4, 0.35, 0.05), mat([0xc0392b, 0x2e7d4f, 0x1f4e8c][i % 3]), 0, 2.65, 1.45);
      add(hut, new THREE.TorusGeometry(1.6, 0.09, 5, 16, Math.PI), mat(0x1d4a2c), 0, 2.32, 1.38).scale.set(1, 0.18, 1);
      // gable roof: two wooden slabs with overhang, snow on top, triangle gables
      for (const sd of [-1, 1]) {
        const sl = add(hut, new THREE.BoxGeometry(3.9, 0.12, 1.75), mat(0x3b2616), 0, 2.78, sd * 0.78); sl.rotation.x = sd * 0.62;
        const sn = add(hut, rbox(3.85, 0.18, 1.7, 0.08, 2), mat(0xf6f9fc), 0, 2.88 + 0.02, sd * 0.72); sn.rotation.x = sd * 0.62;
      }
      for (const sx of [-1, 1]) { const gb = add(hut, new THREE.CylinderGeometry(1.25, 1.25, 0.12, 3, 1).rotateY(Math.PI / 2).rotateZ(Math.PI / 2), mat(0x7a4f2c), sx * 1.58, 2.7, 0); gb.scale.set(1, 0.48, 1.1); }
      if (GFX.ultra) for (let yy = 0.25; yy < 2.3; yy += 0.28) { add(hut, new THREE.BoxGeometry(3.22, 0.03, 0.02), mat(0x4a2f1b), 0, yy, -1.21); for (const sx of [-1, 1]) add(hut, new THREE.BoxGeometry(0.02, 0.03, 2.42), mat(0x4a2f1b), sx * 1.61, yy, 0); }
      const lights = add(hut, new THREE.BoxGeometry(3.4, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0xffe08a, emissive: 0x000000 }), 0, 2.35, 1.35);
      (this._lights ||= []).push(lights.material);
      hut.position.set(x, gy, z); hut.rotation.y = rot;
      winter.add(hut);
      // summer stall with awning
      const st = new THREE.Group();
      const awn = [0xd63031, 0x0984e3, 0x00b894, 0xfdcb6e, 0xe17055][i % 5];
      add(st, new THREE.BoxGeometry(3, 0.9, 1.6), mat(0x8a5e3b), 0, 0.45, 0);
      for (const sx of [-1.4, 1.4]) for (const sz of [-0.7, 0.7]) add(st, new THREE.BoxGeometry(0.08, 2.4, 0.08), mat(0xdddddd), sx, 1.2, sz);
      const aw = add(st, new THREE.BoxGeometry(3.4, 0.08, 2.0), mat(awn), 0, 2.45, 0.2); aw.rotation.x = 0.2;
      for (let k = 0; k < 4; k++) add(st, new THREE.BoxGeometry(0.5, 0.25, 0.4), mat([0xe74c3c, 0xf39c12, 0x27ae60, 0x8e44ad][k]), -1.05 + k * 0.7, 1.0, 0.1);
      st.position.set(x, gy, z); st.rotation.y = rot;
      summer.add(st);
    }
    // christmas tree
    const tree = new THREE.Group();
    add(tree, new THREE.CylinderGeometry(0.3, 0.4, 2, 6), mat(0x4a3426), 0, 1, 0);
    { const sp = new THREE.Mesh(spruceGeometry(5), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); sp.scale.set(0.85, 0.72, 0.85); sp.castShadow = true; tree.add(sp); this.seasonGeos.push(sp.geometry); }
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd34d, emissive: 0x000000 }), 90);
    for (let k = 0; k < 90; k++) { const hh = 1.8 + Math.random() * 8.6, r = (3.2 * Math.pow(1 - (hh - 1.4) / 9.6, 0.95) + 0.2) * 0.85, a = Math.random() * 6.28; _m.makeTranslation(Math.cos(a) * r, hh - 0.25, Math.sin(a) * r); bulbs.setMatrixAt(k, _m); }
    tree.add(bulbs);
    (this._lights ||= []).push(bulbs.material);
    add(tree, new THREE.OctahedronGeometry(0.5), new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x332200 }), 0, 10.3, 0);
    tree.position.set(v.x + v.plaza * 0.35, heightAt(w, v.x + v.plaza * 0.35, v.z - 3), v.z - 3);
    winter.add(tree);
    // summer party stage
    if (v.size !== 'klein') {
      const sg = new THREE.Group();
      add(sg, new THREE.BoxGeometry(8, 1, 5), mat(0x333333), 0, 0.5, 0);
      add(sg, new THREE.BoxGeometry(8.4, 0.3, 5.4), mat(0x222222), 0, 5, 0);
      for (const sx of [-4, 4]) for (const sz of [-2.5, 2.5]) add(sg, new THREE.BoxGeometry(0.2, 4.5, 0.2), mat(0x777777), sx, 2.75, sz);
      for (const sx of [-3.4, 3.4]) add(sg, new THREE.BoxGeometry(0.9, 1.6, 0.8), mat(0x111111), sx, 1.8, -1.6);
      const spot = add(sg, new THREE.BoxGeometry(8, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0xff66cc, emissive: 0x000000 }), 0, 4.7, 2.4);
      (this._lights ||= []).push(spot.material);
      const sx = v.x - v.plaza * 0.3, sz = v.z - v.plaza * 0.45;
      sg.position.set(sx, heightAt(w, sx, sz), sz); sg.rotation.y = 0;
      summer.add(sg);
    }
    // string lights across the plaza
    const strand = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshLambertMaterial({ color: 0xfff1b0, emissive: 0x000000 }), 80);
    // the wires the bulbs hang on
    for (const side of [1, -1]) {
      const pts = []; for (let k = 0; k <= 24; k++) { const t = k / 24, x = v.x - v.plaza * 0.8 + t * v.plaza * 1.6, z = v.z + side * v.plaza * 0.25 * Math.sin(t * Math.PI); pts.push(new THREE.Vector3(x, heightAt(w, x, z) + 5.28 - Math.sin(t * Math.PI) * 1.2, z)); }
      const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.015, 4), mat(0x1b1b1b)); winter.add(wire);
      for (const t of [0, 1]) { const p0 = pts[t ? 24 : 0], pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.6, 8), mat(0x4a3426)); pole.position.set(p0.x, p0.y - 2.7, p0.z); winter.add(pole); }
    }
    for (let k = 0; k < 80; k++) {
      const t = (k % 40) / 39, side = k < 40 ? 1 : -1;
      const x = v.x - v.plaza * 0.8 + t * v.plaza * 1.6, z = v.z + side * v.plaza * 0.25 * Math.sin(t * Math.PI);
      _m.makeTranslation(x, heightAt(w, x, z) + 5.2 - Math.sin(t * Math.PI) * 1.2, z); strand.setMatrixAt(k, _m);
    }
    this.group.add(strand);
    (this._lights ||= []).push(strand.material);
    this.winterGroups = (this.winterGroups || []).concat([winter]);
    this.summerGroups = (this.summerGroups || []).concat([summer]);
    this.group.add(winter, summer);
    summer.visible = false;
    // bus stop
    const bx = v.x + 14, bz = v.roadZ - 7.5;
    const stop = new THREE.Group();
    add(stop, new THREE.BoxGeometry(4, 0.12, 1.8), mat(0x555555), 0, 2.6, 0);
    add(stop, new THREE.BoxGeometry(4, 2.4, 0.08), mat(0x9fc7e0, { transparent: true, opacity: 0.6 }), 0, 1.3, -0.85);
    add(stop, new THREE.BoxGeometry(0.1, 2.6, 0.1), mat(0x555555), -1.9, 1.3, 0.8);
    add(stop, new THREE.BoxGeometry(0.1, 2.6, 0.1), mat(0x555555), 1.9, 1.3, 0.8);
    add(stop, new THREE.BoxGeometry(0.6, 0.6, 0.06), mat(0xffcc00), 2.4, 2.3, 0.6);
    stop.position.set(bx, heightAt(w, bx, bz), bz);
    this.group.add(stop);
    v.busStop = { x: bx, z: v.roadZ };
  }

  // parking lot: day guests arrive by car (from the road), park in the bays and leave again later.
  // updateParking(dt, want) drives cars in / out until "want" bays are taken.
  addParking(p) {
    const w = this.world;
    const cols = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x2980b9, 0x7f8c8d, 0x27ae60, 0xf1c40f, 0x111111, 0x8e44ad, 0xe67e22, 0x16a085, 0xd35400];
    const n = Math.max(2, Math.floor((p.w - 4) / 5.6));
    const ent = w.road && w.road.length ? nearestOnLine(w.road, p.x, p.z) : { px: p.x, pz: p.z - p.d };
    this.park = { p, slots: [], entry: { x: ent.px, z: ent.pz } };
    for (let i = 0; i < n * 2; i++) {
      const row = i < n ? -1 : 1, k = i % n;
      const x = p.x - p.w / 2 + 3 + k * 5.6, z = p.z + row * 6;
      const g = carMesh(cols[(i * 7) % cols.length]);
      g.visible = false; this.group.add(g);
      this.park.slots.push({ x, z, g, state: 'empty', t: 0, row });
    }
    // start with a few cars already parked
    for (const sl of this.park.slots) if (this.rand() < 0.35) this.setParked(sl);
  }
  setParked(sl) { const w = this.world; sl.state = 'parked'; sl.g.visible = true; sl.g.position.set(sl.x, heightAt(w, sl.x, sl.z), sl.z); sl.g.rotation.set(0, sl.row < 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
  updateParking(dt, want) {
    const P = this.park; if (!P) return;
    const w = this.world, sl = P.slots;
    const taken = sl.filter((q) => q.state === 'parked' || q.state === 'in').length;
    this.parkT = (this.parkT || 0) - dt;
    if (this.parkT <= 0) {
      this.parkT = 2 + this.rand() * 4;
      if (taken < want) { const free = sl.filter((q) => q.state === 'empty'); if (free.length) { const q = free[Math.floor(this.rand() * free.length)]; q.state = 'in'; q.t = 0; q.g.visible = true; } }
      else if (taken > want) { const pk = sl.filter((q) => q.state === 'parked'); if (pk.length) { const q = pk[Math.floor(this.rand() * pk.length)]; q.state = 'out'; q.t = 0; } }
    }
    // driving in / out: entry -> aisle in front of the bay -> bay (and back)
    for (const q of sl) {
      if (q.state !== 'in' && q.state !== 'out') continue;
      q.t += dt / 9;
      const u = q.state === 'in' ? q.t : 1 - q.t;
      const ax = q.x, az = P.p.z; // aisle between the rows
      let x, z, nx, nz;
      if (u < 0.75) { const v = u / 0.75; x = P.entry.x + (ax - P.entry.x) * v; z = P.entry.z + (az - P.entry.z) * v; nx = ax - P.entry.x; nz = az - P.entry.z; }
      else { const v = (u - 0.75) / 0.25; x = ax; z = az + (q.z - az) * v; nx = 0; nz = q.z - az; }
      if (q.state === 'out') { nx = -nx; nz = -nz; }
      q.g.position.set(x, heightAt(w, x, z), z);
      if (Math.hypot(nx, nz) > 0.01) q.g.rotation.set(0, -Math.atan2(nz, nx), 0);
      if (q.t >= 1) { if (q.state === 'in') this.setParked(q); else { q.state = 'empty'; q.g.visible = false; } }
    }
  }

  addTunnel(t) {
    const shape = new THREE.Shape();
    shape.moveTo(-8, 0); shape.lineTo(8, 0); shape.lineTo(8, 12); shape.lineTo(-8, 12); shape.lineTo(-8, 0);
    const hole = new THREE.Path();
    hole.moveTo(-5, 0); hole.lineTo(5, 0); hole.lineTo(5, 4.5); hole.absarc(0, 4.5, 5, 0, Math.PI, false); hole.lineTo(-5, 0);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 16, bevelEnabled: false });
    const portal = new THREE.Mesh(geo, mat(0x9a9a98));
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide }));
    inner.position.set(0, 4.8, 4);
    const g = new THREE.Group();
    g.add(portal, inner);
    g.position.set(t.x, t.h - 0.3, t.z);
    g.rotation.y = Math.PI / 2 - t.dir;
    this.group.add(g);
  }

  setSeason(s) {
    this.season = s;
    for (const g of this.seasonGeos) applySeasonColors(g, s);
    for (const [m, w, su] of this.roofMats) m.color.setHex(s === 1 ? su : w);
    for (const g of this.winterGroups || []) g.visible = s === 0;
    for (const g of this.summerGroups || []) g.visible = s === 1;
    if (this.fountainWater) this.fountainWater.material.color.setHex(s === 1 ? 0x3f8fa5 : 0xdde8ef);
  }

  setNight(f) {
    const on = f > 0.5;
    this.glassMat.emissive.setHex(on ? 0xffb347 : 0x000000);
    this.glassMat.emissiveIntensity = 0.9;
    for (const m of this._lights || []) m.emissive.setHex(on ? m.color.getHex() : 0x000000);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

// ================= TRAFFIC =================
const CAR_COLORS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x2980b9, 0x7f8c8d, 0x27ae60, 0xf1c40f, 0x111111, 0x8e44ad];
// cars: smooth bodies from side profiles (lower body in paint, glass house with a painted roof),
// real wheels with rims, head and tail lights, mirrors. Three body types picked by colour.
const CAR_TYPES = {
  kompakt: { L: 4.0, W: 1.76, wr: 0.31, wb: 2.5, body: [[2.0, 0.3], [2.03, 0.62], [1.95, 0.8], [1.15, 0.95], [-1.85, 1.0], [-2.0, 0.86], [-2.02, 0.35], [-1.9, 0.25], [1.9, 0.25]], house: [[1.12, 0.96], [0.25, 1.43], [-1.45, 1.45], [-1.92, 1.0]] },
  kombi: { L: 4.65, W: 1.82, wr: 0.32, wb: 2.75, body: [[2.32, 0.3], [2.35, 0.64], [2.2, 0.82], [1.05, 0.98], [-2.2, 1.0], [-2.33, 0.86], [-2.34, 0.36], [-2.2, 0.26], [2.2, 0.26]], house: [[1.02, 0.99], [0.15, 1.44], [-2.05, 1.44], [-2.22, 1.0]] },
  suv: { L: 4.6, W: 1.9, wr: 0.37, wb: 2.75, body: [[2.3, 0.42], [2.33, 0.82], [2.15, 1.02], [1.1, 1.12], [-2.15, 1.15], [-2.3, 1.0], [-2.32, 0.45], [-2.15, 0.36], [2.15, 0.36]], house: [[1.07, 1.13], [0.25, 1.68], [-1.95, 1.7], [-2.18, 1.15]] },
};
const carGeoCache = {};
function carGeos(type) {
  if (carGeoCache[type]) return carGeoCache[type];
  const T = CAR_TYPES[type];
  const ext = (pts, depth, bev) => {
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -depth / 2); g.deleteAttribute('uv'); g.deleteAttribute('normal'); const m2 = mergeVertices(g, 1e-4); m2.computeVertexNormals(); return m2;
  };
  const body = ext(T.body, T.W - 0.2, 0.1);
  const h = T.house, beltY = h[0][1];
  const house = ext([[h[0][0], beltY - 0.04], ...h.slice(1, 3), [h[3][0], beltY - 0.04]], T.W - 0.42, 0.08);
  // painted roof panel on top of the glass house
  const roofY = Math.max(h[1][1], h[2][1]);
  const roof = new THREE.BoxGeometry(h[1][0] - h[2][0] - 0.25, 0.07, T.W - 0.46); roof.translate((h[1][0] + h[2][0]) / 2 - 0.05, roofY + 0.07, 0);
  const tyre = new THREE.CylinderGeometry(T.wr, T.wr, 0.22, 16).rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(T.wr * 0.62, T.wr * 0.62, 0.24, 12).rotateX(Math.PI / 2);
  const arch = new THREE.CircleGeometry(T.wr + 0.08, 16, 0, Math.PI); arch.computeVertexNormals();
  return (carGeoCache[type] = { T, body, house, roof, tyre, rim, arch });
}
export function carMesh(color) {
  const g = new THREE.Group();
  const types = Object.keys(CAR_TYPES), type = types[Math.abs((color * 2654435761) | 0) % types.length];
  const { T, body, house, roof, tyre, rim, arch } = carGeos(type);
  const add = (geo, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
  const paint = mat(color), glass = mat(0x1e2a36), black = mat(0x141516), chrome = mat(0xc4c9ce);
  add(body, paint); add(house, glass); add(roof, paint);
  // B-pillar and dark sills / bumpers
  const hb = T.house; const bx = (hb[1][0] + hb[2][0]) / 2 + 0.3;
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.12, hb[1][1] - hb[0][1], 0.02), paint, bx, (hb[1][1] + hb[0][1]) / 2, sd * (T.W / 2 - 0.12));
  add(new THREE.BoxGeometry(T.L - 1.4, 0.08, T.W + 0.01), black, 0, T.body[8][1] + 0.04, 0);
  add(new THREE.BoxGeometry(0.03, 0.15, T.W * 0.42), black, T.body[1][0] + 0.09, T.body[1][1] - 0.2, 0); // grille
  // wheels in dark arches
  for (const x of [T.wb / 2, -T.wb / 2]) {
    for (const sd of [-1, 1]) {
      add(arch, mat(0x141516, { side: THREE.DoubleSide }), x, T.wr + 0.02, sd * (T.W / 2 + 0.005)); // dark wheel arch on the body side
      add(tyre, black, x, T.wr, sd * (T.W / 2 - 0.08));
      add(rim, chrome, x, T.wr, sd * (T.W / 2 - 0.07));
      if (GFX.ultra) for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const sp = add(new THREE.BoxGeometry(0.05, T.wr * 0.5, 0.02), black, x + Math.cos(a) * T.wr * 0.3, T.wr + Math.sin(a) * T.wr * 0.3, sd * (T.W / 2 + 0.05)); sp.rotation.z = a - Math.PI / 2; }
    }
  }
  // mirrors
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.16, 0.1, 0.18), paint, hb[0][0] - 0.15, hb[0][1] + 0.08, sd * (T.W / 2 + 0.02));
  // lights: head (glow at night), tail
  const head = new THREE.MeshLambertMaterial({ color: 0xf4f6f8, emissive: 0x000000 });
  const frontY = T.body[1][1] - 0.04;
  for (const sd of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.13, 0.36), head, T.body[1][0] + 0.06, frontY, sd * (T.W / 2 - 0.32));
    add(new THREE.BoxGeometry(0.06, 0.12, 0.34), mat(0xb3121a, { emissive: 0x3a0000 }), T.body[5][0] - 0.07, T.body[5][1] - 0.08, sd * (T.W / 2 - 0.28));
  }
  add(new THREE.BoxGeometry(0.04, 0.12, 0.5), mat(0xf2f2f2), T.body[0][0] + 0.1, T.body[0][1] + 0.15, 0); // number plate
  g.userData.head = head;
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return g;
}
export function busMesh(color = 0xffcc00) {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); };
  add(rbox(12, 2.6, 2.5, 0.45).clone(), mat(color), 0, 1.75, 0);
  add(rbox(11.7, 1.0, 2.54, 0.3).clone(), mat(0x2b3a48), 0, 2.2, 0);
  add(new THREE.BoxGeometry(12.02, 0.25, 2.52), mat(0xd62020), 0, 1.0, 0);
  add(new THREE.BoxGeometry(12, 0.15, 2.4), mat(0xffffff), 0, 3.1, 0);
  for (const x of [-3.8, 3.8]) for (const z of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10).rotateX(Math.PI / 2), mat(0x111111), x, 0.5, z);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 })); hl.position.set(6.01, 1.1, 0); g.add(hl);
  g.userData.head = hl.material;
  return g;
}
function truckMesh(winter) {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
  add(new THREE.BoxGeometry(2.4, 2.6, 2.4), mat(winter ? 0xff7a00 : 0xe8e8e8), 3, 1.8, 0);
  add(new THREE.BoxGeometry(2.42, 1.0, 2.42), mat(0x2b3a48), 3.1, 2.4, 0);
  add(new THREE.BoxGeometry(6, 2.8, 2.5), mat(winter ? 0xff7a00 : 0x2c6fb3), -1.4, 2.0, 0);
  if (winter) {
    const pl = add(rbox(0.35, 1.2, 3.6, 0.12).clone(), mat(0xffd000), 4.7, 0.65, 0); pl.rotation.y = 0.3;
    for (let k = 0; k < 4; k++) { const st = add(new THREE.BoxGeometry(0.06, 1.0, 0.25), mat(0xd62020), 4.9, 0.65, -1.3 + k * 0.85); st.rotation.y = 0.3; }
    g.userData.beacon = add(new THREE.CylinderGeometry(0.22, 0.25, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0xff8800, emissive: 0x000000 }), 3, 3.25, 0);
    add(new THREE.BoxGeometry(5.6, 0.5, 2.3), mat(0x9a9a9a), -1.4, 3.6, 0);
  }
  for (const x of [-3, -1.6, 3]) for (const z of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10).rotateX(Math.PI / 2), mat(0x111111), x, 0.55, z);
  const hl = add(new THREE.BoxGeometry(0.05, 0.3, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 }), 4.21, 1.0, 0);
  g.userData.head = hl.material;
  return g;
}

export class Traffic {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.rand = mulberry32(world.params.seed + 9);
    const road = world.road;
    this.cars = [];
    if (road.length < 4) return;
    this.cum = [0];
    for (let k = 1; k < road.length; k++) this.cum.push(this.cum[k - 1] + Math.hypot(road[k].x - road[k - 1].x, road[k].z - road[k - 1].z));
    this.len = this.cum[this.cum.length - 1];
    const nCars = 7 + world.villages.length * 4;
    const stops = world.villages.map((v) => { const r = nearestOnLine(road, v.busStop ? v.busStop.x : v.x, v.roadZ); return this.cum[r.k]; });
    for (let i = 0; i < nCars + 4; i++) {
      let g, v, kind = 'car';
      if (i >= nCars) { kind = i - nCars < 2 ? 'bus' : 'truck'; }
      if (kind === 'bus') { g = busMesh(); v = 12; } else if (kind === 'truck') { g = truckMesh(false); v = 11; } else { g = carMesh(CAR_COLORS[i % CAR_COLORS.length]); v = lerp(12, 18, this.rand()); }
      this.group.add(g);
      this.cars.push({ g, kind, s: this.rand() * this.len, dir: i % 2 ? 1 : -1, v, vmax: v, wait: 0, stops });
    }
    this.season = 0;
    this.buildSnow();
    // snow ploughs (come when the road gets snowy)
    this.ploughs = [];
    for (let i = 0; i < 3; i++) {
      const g = truckMesh(true); g.visible = false; this.group.add(g);
      this.ploughs.push({ g, active: false, s: 0, dir: 1, v: 0 });
    }
    this.ploughCount = 1; this.ploughAuto = true;
  }

  // ---- snow on the road: per road point, plus snow walls (banks) pushed aside by the ploughs
  buildSnow() {
    const road = this.world.road, n = road.length;
    this.snow = new Float32Array(n);
    this.bank = new Float32Array(n).fill(0.5);
    const L = [-6.8, -5.0, -2.7, 0, 2.7, 5.0, 6.8];
    this.lat = L;
    const pos = new Float32Array(n * L.length * 3), col = new Float32Array(n * L.length * 4);
    const idx = [];
    for (let k = 0; k < n - 1; k++) for (let q = 0; q < L.length - 1; q++) { const a = k * L.length + q, b = a + 1, c = a + L.length, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    this.snowGeo = g;
    this.snowMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.snowMesh.frustumCulled = false; this.snowMesh.renderOrder = 2;
    this.group.add(this.snowMesh);
    this.snowDirty = true; this.snowT = 0;
  }

  refreshSnow() {
    const road = this.world.road, L = this.lat, n = road.length, w = this.world;
    const pos = this.snowGeo.attributes.position.array, col = this.snowGeo.attributes.color.array;
    for (let k = 0; k < n; k++) {
      const a = road[Math.max(0, k - 1)], b = road[Math.min(n - 1, k + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l;
      const sn = this.snow[k], bk = this.bank[k];
      for (let q = 0; q < L.length; q++) {
        const o = L[q], x = road[k].x + rx * o, z = road[k].z + rz * o;
        const edge = Math.abs(o) > 6;
        const ridge = Math.abs(Math.abs(o) - 5) < 0.1;
        const y = heightAt(w, x, z) + 0.05 + (ridge ? bk * 0.9 + sn * 0.25 : sn * 0.12);
        const i = (k * L.length + q);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const alpha = edge ? 0 : ridge ? Math.min(1, Math.max(sn * 1.4, bk * 2.2)) : Math.min(1, Math.abs(o) > 1 ? sn * 1.05 : sn * 1.4);
        col[i * 4] = 1.0; col[i * 4 + 1] = 1.0; col[i * 4 + 2] = 1.0; col[i * 4 + 3] = alpha;
      }
    }
    this.snowGeo.attributes.position.needsUpdate = true; this.snowGeo.attributes.color.needsUpdate = true;
    this.snowGeo.computeVertexNormals();
  }

  // 0..1 snow on the road near (x,z) (null if not on the road)
  snowAt(x, z) {
    const road = this.world.road; if (!road.length || !this.snow) return null;
    const k = clamp(Math.round((x - road[0].x) / 10), 0, road.length - 1);
    if (Math.hypot(road[k].x - x, road[k].z - z) > 7) return null;
    return this.snow[k];
  }
  maxSnow() { let m = 0; if (this.snow) for (const v of this.snow) m = Math.max(m, v); return m; }
  avgSnow() { if (!this.snow || !this.snow.length) return 0; let m = 0; for (const v of this.snow) m += v; return m / this.snow.length; }
  sendPloughs() {
    let n = 0;
    for (const p of this.ploughs) {
      if (n >= Math.min(this.ploughCount, this.ploughCap ?? 3)) break;
      if (!p.active) { p.active = true; p.dir = n % 2 ? -1 : 1; p.s = p.dir > 0 ? 2 : this.len - 2; p.v = 0; }
      n++;
    }
  }

  pointAt(s) {
    const road = this.world.road, cum = this.cum;
    s = clamp(s, 0, this.len - 0.001);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const a = road[lo], b = road[lo + 1];
    const t = (s - cum[lo]) / (cum[lo + 1] - cum[lo]);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dx: b.x - a.x, dz: b.z - a.z };
  }

  setSeason(s) {
    this.season = s;
    if (this.snowMesh) this.snowMesh.visible = s === 0;
    if (s === 1 && this.snow) { this.snow.fill(0); this.bank.fill(0); for (const p of this.ploughs) { p.active = false; p.g.visible = false; } }
    if (s === 0 && this.bank) { for (let k = 0; k < this.bank.length; k++) this.bank[k] = Math.max(this.bank[k], 0.45); }
    this.snowDirty = true;
  }
  setNight(on) { for (const c of [...this.cars, ...(this.ploughs || [])]) if (c.g.userData.head) c.g.userData.head.emissive.setHex(on ? 0xfff2cc : 0x000000); }

  // env: { snowing: 0..1, temp, rail }
  update(dt, env = {}) {
    if (!this.cars.length) return;
    const road = this.world.road;
    // --- snow accumulation / melting
    if (this.season === 0 && this.snow) {
      const add = (env.snowing || 0) * dt / 110, melt = env.temp > 1 ? dt * env.temp / 900 : 0;
      if (add || melt) {
        for (let k = 0; k < this.snow.length; k++) { this.snow[k] = clamp(this.snow[k] + add - melt, 0, 1); if (melt) this.bank[k] = Math.max(0, this.bank[k] - melt * 0.3); }
        this.snowDirty = true;
      }
      if (this.ploughAuto && Math.min(this.ploughCount, this.ploughCap ?? 3) > 0 && this.maxSnow() > 0.18 && !this.ploughs.some((p) => p.active)) this.sendPloughs();
      for (let i = 0; i < this.ploughs.length; i++) {
        const p = this.ploughs[i];
        if (!p.active) { p.g.visible = false; continue; }
        const vm = 10;
        p.v += (vm - p.v) * Math.min(1, dt);
        p.s += p.v * p.dir * dt;
        const k0 = clamp(Math.round((this.pointAt(p.s).x - road[0].x) / 10), 0, road.length - 1);
        for (let k = Math.max(0, k0 - 1); k <= Math.min(road.length - 1, k0 + 1); k++) if (this.snow[k] > 0.02) { this.bank[k] = Math.min(1.4, this.bank[k] + this.snow[k] * 0.5); this.snow[k] = 0; this.snowDirty = true; }
        if (p.s > this.len - 1 || p.s < 1) {
          // turn around if there is still snow, else go home
          if (this.maxSnow() > 0.1) { p.dir *= -1; p.s = clamp(p.s, 2, this.len - 2); } else { p.active = false; p.g.visible = false; continue; }
        }
        const q = this.pointAt(p.s), L = Math.hypot(q.dx, q.dz) || 1, rx = -q.dz / L, rz = q.dx / L, lane = 2.4 * p.dir;
        p.g.position.set(q.x + rx * lane, heightAt(this.world, q.x + rx * lane, q.z + rz * lane) + 0.1, q.z + rz * lane);
        p.g.rotation.y = -Math.atan2(q.dz * p.dir, q.dx * p.dir);
        p.g.visible = p.s > 3 && p.s < this.len - 25;
        if (p.g.userData.beacon) p.g.userData.beacon.material.emissive.setHex(Math.sin(performance.now() / 120 + i) > 0 ? 0xff8800 : 0x331a00);
      }
      this.snowT += dt;
      if (this.snowDirty && this.snowT > 0.4) { this.snowT = 0; this.snowDirty = false; this.refreshSnow(); }
    }
    for (const c of this.cars) {
      if (c.wait > 0) { c.wait -= dt; continue; }
      // slow down behind another car
      let v = c.vmax;
      // snowy road: drive slowly
      if (this.snow && this.season === 0) { const k = clamp(Math.round((this.pointAt(c.s).x - road[0].x) / 10), 0, road.length - 1); v *= 1 - this.snow[k] * 0.65; }
      for (const p of this.ploughs || []) { if (!p.active || p.dir !== c.dir) continue; const d = (p.s - c.s) * c.dir; if (d > 0 && d < 30) v = Math.min(v, p.v * 0.9); }
      for (const o of this.cars) { if (o === c || o.dir !== c.dir || o.hidden) continue; const d = (o.s - c.s) * c.dir; if (d > 0 && d < 18) v = Math.min(v, o.wait > 0 ? 0 : o.v * 0.9); }
      c.v += (v - c.v) * Math.min(1, dt * 2);
      const ns = c.s + c.v * dt * c.dir;
      if (c.kind === 'bus') for (const st of c.stops) if ((c.s - st) * (ns - st) < 0) { c.wait = 12; }
      c.s = ns;
      if (c.s > this.len) c.s = 0;
      if (c.s < 0) c.s = this.len;
      const p = this.pointAt(c.s);
      const L = Math.hypot(p.dx, p.dz) || 1;
      const rx = -p.dz / L, rz = p.dx / L;
      const lane = 2.4 * c.dir;
      c.g.position.set(p.x + rx * lane, heightAt(this.world, p.x + rx * lane, p.z + rz * lane) + 0.1, p.z + rz * lane);
      c.g.rotation.y = -Math.atan2(p.dz * c.dir, p.dx * c.dir);
      c.g.visible = !c.hidden && c.s < this.len - 25 && c.s > 3 && (!env.cam || (env.cam.x - c.g.position.x) ** 2 + (env.cam.z - c.g.position.z) ** 2 < 1400 * 1400);
    }
  }

  dispose() { this.scene.remove(this.group); }
}

// ================= PEDESTRIANS =================
// ================= PEOPLE IN THE VILLAGE =================
// varied, realistically proportioned people: adults and kids, winter clothing, hats, scarves,
// backpacks, skis or snowboard; hips / knees / shoulders as pivots for a proper walk cycle. Faces +z.
const SKINS = [0xf1c7a5, 0xe5b48f, 0xc98e66, 0x8d5a3b, 0xf6d5bd, 0xb27a54];
const HAIRS = [0x2b1d14, 0x5a3a22, 0x8a6a3e, 0xc9a35c, 0x1a1a1a, 0x9a9a9a];
const JACKETS_P = [0xc0392b, 0x1f4e8c, 0x2e7d4f, 0xf2b705, 0x5b3f8c, 0xe86a33, 0x23272b, 0xf2f2f2, 0x0f7c8c, 0xb83261, 0x6b4a2b, 0x7a8b99];
const PANTS_P = [0x23272b, 0x2c3e50, 0x3b3f46, 0x4a3b2e, 0x1d2a3a, 0x6b6f75, 0xd7d2c8];
function pGeo(geo, color, m) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); if (m) g.applyMatrix4(m); const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
const PM = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function buildPerson(rand, material) {
  const U = GFX.ultra, sg = U ? 12 : 7;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const kid = rand() < 0.18, scale = kid ? lerp(0.55, 0.72, rand()) : lerp(0.93, 1.06, rand());
  const skin = pick(SKINS), jacket = pick(JACKETS_P), pants = pick(PANTS_P), boots = pick([0x3a2a1e, 0x1b1b1b, 0x5c4630, 0x7a1f1f]);
  const wide = lerp(0.92, 1.12, rand());
  const cyl = (r0, r1, h) => new THREE.CylinderGeometry(r1, r0, h, sg);
  const mk = (list) => new THREE.Mesh(mergeGeometries(list), material);
  const g = new THREE.Group(); g.scale.setScalar(scale);
  // body: pelvis, jacket, collar / scarf, neck, head, hair or hat, backpack
  const body = [
    pGeo(bodyShell([[0.86, 0.115, 0.165 * wide, 0], [0.95, 0.12, 0.18 * wide, 0], [1.02, 0.12, 0.18 * wide, 0]], pants, 'z'), pants),
    // jacket: hem, waist, chest, shoulders as one smooth shell (front = +z)
    pGeo(bodyShell([[0.93, 0.135, 0.2 * wide, 0], [1.03, 0.13, 0.195 * wide, 0], [1.13, 0.12, 0.18 * wide, 0.005], [1.27, 0.135, 0.205 * wide, 0.012], [1.39, 0.135, 0.228 * wide, 0.006], [1.47, 0.12, 0.238 * wide, -0.005], [1.52, 0.09, 0.17 * wide, -0.01], [1.555, 0.055, 0.075, 0]], jacket, 'z'), jacket),
    pGeo(new THREE.SphereGeometry(0.1, sg, 6), jacket, PM(0, 1.5, -0.1, 0, 0, 0, 1.35, 0.55, 0.75)), // hood folded on the back
    pGeo(cyl(0.06, 0.055, 0.08), skin, PM(0, 1.55, 0)),
  ];
  if (rand() < 0.5) body.push(pGeo(new THREE.TorusGeometry(0.085, 0.04, 6, sg), pick([0xc0392b, 0xf2f2f2, 0x2e7d4f, 0xf2b705, 0x23272b]), PM(0, 1.52, 0, Math.PI / 2)), pGeo(rbox(0.08, 0.22, 0.03, 0.01), pick([0xc0392b, 0x1f4e8c]), PM(0.07, 1.36, 0.14, 0.1)));
  else body.push(pGeo(rbox(0.24, 0.07, 0.2, 0.03), jacket, PM(0, 1.52, -0.01)));
  if (U) { body.push(pGeo(rbox(0.012, 0.5, 0.01, 0.004), 0x1b1b1b, PM(0, 1.24, 0.137))); for (const sd of [-1, 1]) body.push(pGeo(rbox(0.1, 0.012, 0.01, 0.004), 0x1b1b1b, PM(sd * 0.1, 1.12, 0.137))); }
  if (!kid && rand() < 0.3) body.push(pGeo(rbox(0.28, 0.36, 0.14, 0.05), pick([0x23272b, 0x8c2f2f, 0x2f5e8c, 0x556b2f]), PM(0, 1.26, -0.2)));
  const bodyM = mk(body);
  // head (own pivot so the person can look around)
  const head = new THREE.Group(); head.position.set(0, 1.6, 0);
  const hairCol = pick(HAIRS), longHair = rand() < 0.35;
  const hl = [pGeo(new THREE.SphereGeometry(0.105, sg + 2, sg), skin, PM(0, 0.07, 0, 0, 0, 0, 0.95, 1.12, 1)),
    pGeo(new THREE.SphereGeometry(0.11, sg + 2, sg, 0, Math.PI * 2, 0, Math.PI * 0.55), hairCol, PM(0, 0.085, -0.01)),
    pGeo(new THREE.SphereGeometry(0.02, 6, 4), 0x1b1b1b, PM(0.035, 0.09, 0.095)), pGeo(new THREE.SphereGeometry(0.02, 6, 4), 0x1b1b1b, PM(-0.035, 0.09, 0.095)),
    pGeo(new THREE.SphereGeometry(0.018, 6, 4), skin, PM(0, 0.06, 0.105))];
  if (U) {
    for (const sd of [-1, 1]) {
      hl.push(pGeo(new THREE.SphereGeometry(0.026, 6, 5), skin, PM(sd * 0.1, 0.065, 0, 0, 0, 0, 0.55, 1, 0.75))); // ears
      hl.push(pGeo(rbox(0.04, 0.008, 0.01, 0.003), hairCol, PM(sd * 0.036, 0.118, 0.098))); // eyebrows
    }
    hl.push(pGeo(rbox(0.045, 0.008, 0.01, 0.003), 0x8a3b32, PM(0, 0.022, 0.1))); // mouth
  }
  if (longHair) hl.push(pGeo(rbox(0.2, 0.2, 0.07, 0.03), hairCol, PM(0, 0.0, -0.07)));
  head.add(mk(hl));
  // winter hat: beanie with pompom or cap
  let hat = null;
  if (rand() < 0.8) {
    const hc = pick([0xc0392b, 0x1f4e8c, 0xf2f2f2, 0x23272b, 0xf2b705, 0x2e7d4f, 0xe86a33]);
    const hp = rand() < 0.75 ? [pGeo(new THREE.SphereGeometry(0.118, sg + 2, sg, 0, Math.PI * 2, 0, Math.PI * 0.52), hc, PM(0, 0.1, 0)), pGeo(cyl(0.12, 0.12, 0.04), hc === 0xf2f2f2 ? 0xc0392b : 0xf2f2f2, PM(0, 0.1, 0)), pGeo(new THREE.SphereGeometry(0.045, 8, 6), 0xf2f2f2, PM(0, 0.23, 0))]
      : [pGeo(new THREE.SphereGeometry(0.115, sg + 2, sg, 0, Math.PI * 2, 0, Math.PI * 0.5), hc, PM(0, 0.11, 0)), pGeo(rbox(0.16, 0.02, 0.12, 0.01), hc, PM(0, 0.12, 0.12))];
    hat = mk(hp); head.add(hat);
  }
  // limbs: legs with knees, arms with gloves
  const leg = (sd) => {
    const hip = new THREE.Group(); hip.position.set(sd * 0.09 * wide, 0.92, 0);
    hip.add(mk([pGeo(cyl(0.075, 0.068, 0.44), pants, PM(0, -0.22, 0))]));
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    knee.add(mk([pGeo(cyl(0.065, 0.055, 0.38), pants, PM(0, -0.19, 0)), pGeo(rbox(0.12, 0.12, 0.24, 0.04), boots, PM(0, -0.42, 0.04))]));
    return { hip, knee };
  };
  const L = leg(-1), R = leg(1);
  const arm = (sd) => {
    const sh = new THREE.Group(); sh.position.set(sd * 0.25 * wide, 1.46, 0);
    sh.add(mk([pGeo(new THREE.SphereGeometry(0.07, 8, 6), jacket, PM(0, 0, 0)), pGeo(cyl(0.062, 0.052, 0.58), jacket, PM(0, -0.29, 0)), pGeo(new THREE.SphereGeometry(0.05, 8, 6), rand() < 0.6 ? pick([0x23272b, 0xc0392b, 0x1f4e8c]) : skin, PM(0, -0.6, 0))]));
    return sh;
  };
  const armL = arm(-1), armR = arm(1);
  // skis over the shoulder (shown when walking to the lift), sometimes a snowboard
  const board = rand() < 0.3;
  const skis = board ? mk([pGeo(rbox(0.26, 1.45, 0.03, 0.1), pick([0x23272b, 0xe86a33, 0x0f7c8c]), PM(0, 0, 0))]) : mk([pGeo(rbox(0.08, 1.7, 0.03, 0.01), pick([0xc0392b, 0x1f4e8c, 0x111111]), PM(0.04, 0, 0)), pGeo(rbox(0.08, 1.7, 0.03, 0.01), pick([0xc0392b, 0x1f4e8c, 0x111111]), PM(-0.04, 0, 0.03))]);
  if (board) { skis.position.set(0.32, 1.0, 0.0); skis.rotation.set(0, Math.PI / 2, 0.1); } else { skis.position.set(0.25, 1.62, -0.05); skis.rotation.set(-1.1, 0, 0.15); }
  skis.visible = false;
  g.add(bodyM, head, L.hip, R.hip, armL, armR, skis);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, legL: L.hip, legR: R.hip, kneeL: L.knee, kneeR: R.knee, armL, armR, head, hat, skis, scale, kid, phone: !kid && rand() < 0.12 };
}

export class Pedestrians {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.rand = mulberry32(world.params.seed + 31);
    this.list = [];
    this.lifts = [];
    const n = Math.min(GFX.potato ? 30 : 110, world.villages.reduce((s, v) => s + Math.round(v.houses.length * 0.9) + 8, 0));
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let i = 0; i < n; i++) {
      const P = buildPerson(this.rand, this.mat);
      this.group.add(P.g);
      const v = world.villages[i % world.villages.length];
      const st = this.randomSpot(v);
      this.list.push({ ...P, v, x: st.x, z: st.z, tx: st.x, tz: st.z, wait: this.rand() * 5, speed: lerp(1.0, 1.5, this.rand()) * (P.kid ? 0.85 : 1), ph: this.rand() * 6, away: 0, toLift: false, look: 0 });
    }
    this.season = 0;
  }

  randomSpot(v) {
    const r = this.rand();
    if (r < 0.45) { const a = this.rand() * 6.28, d = this.rand() * v.plaza * 0.85; return { x: v.x + Math.cos(a) * d, z: v.z + Math.sin(a) * d }; }
    if (v.houses.length) {
      const h = v.houses[Math.floor(this.rand() * v.houses.length)];
      // in front of the house (towards the plaza)
      const dx = v.x - h.x, dz = v.z - h.z, l = Math.hypot(dx, dz) || 1, off = Math.max(h.w, h.d) / 2 + 3;
      return { x: h.x + dx / l * off, z: h.z + dz / l * off };
    }
    return { x: v.x, z: v.z };
  }

  setLifts(lifts) { this.lifts = lifts; }
  setSeason(s) { this.season = s; for (const p of this.list) { if (p.hat) p.hat.visible = s === 0; } }

  update(dt, time, cam) {
    const w = this.world;
    for (const p of this.list) {
      if (p.away > 0) { p.away -= dt; p.g.visible = false; if (p.away <= 0) { p.g.visible = true; p.toLift = false; const s = this.randomSpot(p.v); p.tx = s.x; p.tz = s.z; } continue; }
      // far away people are too small to see: skip drawing them (saves a lot of draw calls)
      p.g.visible = !cam || (cam.x - p.x) ** 2 + (cam.z - p.z) ** 2 < 450 * 450;
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      let moving = false;
      if (d < 0.6) {
        if (p.toLift) { p.away = 40 + this.rand() * 120; continue; }
        p.wait -= dt;
        if (p.wait <= 0) {
          p.wait = 2 + this.rand() * 9;
          // winter: some people walk to the nearest valley station of a lift
          const near = this.lifts.filter((l) => Math.hypot(l.A.x - p.v.x, l.A.z - p.v.z) < 900);
          if (this.season === 0 && near.length && this.rand() < 0.3) {
            const l = near[Math.floor(this.rand() * near.length)];
            p.tx = l.A.x - l.dir.x * 6 + (this.rand() - 0.5) * 6; p.tz = l.A.z - l.dir.z * 6 + (this.rand() - 0.5) * 6; p.toLift = true;
          } else { const s = this.randomSpot(p.v); p.tx = s.x; p.tz = s.z; }
        }
      } else {
        const sp = Math.min(p.speed, d) * dt;
        p.x += dx / d * sp; p.z += dz / d * sp;
        p.g.rotation.y = Math.atan2(dx, dz);
        moving = true;
      }
      p.skis.visible = this.season === 0 && p.toLift;
      const gy = heightAt(w, p.x, p.z);
      // walk cycle: legs swing from the hip, knees bend on the back swing, arms swing opposite, body bobs
      const ph = time * 5.2 * p.speed / p.scale + p.ph, sw = moving ? Math.sin(ph) * 0.5 : 0;
      p.g.position.set(p.x, gy + (moving ? Math.abs(Math.cos(ph)) * 0.035 * p.scale : 0), p.z);
      p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
      p.kneeL.rotation.x = moving ? Math.max(0, -Math.sin(ph - 0.6)) * 0.9 : 0; p.kneeR.rotation.x = moving ? Math.max(0, Math.sin(ph - 0.6)) * 0.9 : 0;
      p.armL.rotation.x = -sw * 0.75;
      p.armR.rotation.x = p.skis.visible ? -2.7 : p.phone ? -2.2 : -sw * 0.75;
      p.armR.rotation.z = p.phone && !p.skis.visible ? 0.5 : 0;
      // standing people look around now and then
      if (!moving) { p.look -= dt; if (p.look <= 0) { p.look = 1.5 + this.rand() * 4; p.lookT = (this.rand() - 0.5) * 1.4; } p.head.rotation.y += ((p.lookT || 0) - p.head.rotation.y) * Math.min(1, dt * 3); } else p.head.rotation.y *= 1 - Math.min(1, dt * 4);
      if (p.hat) p.hat.visible = this.season === 0;
    }
  }

  dispose() { this.scene.remove(this.group); }
}

// ================= SNOW CANNONS =================
export const CANNON_TYPES = {
  lanze: { name: 'Lanze', desc: 'Schlanke Schneilanze, leise', cost: 18000, reach: 9 },
  propeller: { name: 'Propeller', desc: 'Klassische Propellerkanone auf Rädern', cost: 45000, reach: 18 },
  turm: { name: 'Propeller auf Turm', desc: 'Propellerkanone auf hohem Mast', cost: 65000, reach: 26, mount: 'tower', h: 7 },
  propeller_blau: { name: 'Propeller blau-weiss', desc: 'Propellerkanone auf Rädern, blau-weisse Bauart', cost: 47000, reach: 19, body: 0xf1f3f5, frame: 0x1f5fd1 },
  kompakt: { name: 'Kompakt-Kanone', desc: 'Kleine, günstige Propellerkanone für schmale Pisten', cost: 28000, reach: 13, body: 0xd8262b, frame: 0x2d3033, bs: 0.75 },
  schlitten: { name: 'Propeller auf Schlitten', desc: 'Auf Kufen – lässt sich mit dem Pistenbully herumziehen', cost: 42000, reach: 17, mount: 'sled', body: 0xf08a00, frame: 0x2d3033 },
  turm_hoch: { name: 'Propeller auf hohem Turm (11 m)', desc: 'Sehr hoher Mast, wirft den Schnee weit', cost: 85000, reach: 32, mount: 'tower', h: 11 },
  schwenkarm: { name: 'Propeller auf Schwenkarm', desc: 'Kanone an einem langen Arm über der Piste', cost: 75000, reach: 28, mount: 'arm', body: 0xf1f3f5, frame: 0x8c9196 },
  lanze_kurz: { name: 'Kurze Lanze (5 m)', desc: 'Kurze Schneilanze für enge Stellen', cost: 12000, reach: 7, mount: 'lanze', L: 5, tilt: 0.35 },
  lanze_hoch: { name: 'Hohe Lanze (13 m)', desc: 'Sehr lange Lanze, wirft weiter', cost: 24000, reach: 12, mount: 'lanze', L: 13, tilt: 0.45 },
  lanze_rot: { name: 'Lanze mit rotem Kopf', desc: 'Lanze, Düsenkopf rot', cost: 18000, reach: 9, mount: 'lanze', head: 0xd8161b },
  mini: { name: 'Mini-Kanone (Kinderland)', desc: 'Ganz kleine Propellerkanone für Übungshänge', cost: 16000, reach: 9, body: 0xff8a1f, frame: 0x2d3033, bs: 0.55 },
  propeller_rot: { name: 'Propeller rot-weiss', desc: 'Propellerkanone auf Rädern, rot-weiss', cost: 46000, reach: 18, body: 0xd8262b, frame: 0xf1f3f5 },
  propeller_gruen: { name: 'Propeller grün', desc: 'Propellerkanone auf Rädern, grün', cost: 46000, reach: 18, body: 0x3a8f3e, frame: 0x2d3033 },
  turm_kurz: { name: 'Propeller auf kurzem Turm (4 m)', desc: 'Niedriger Mast', cost: 55000, reach: 22, mount: 'tower', h: 4 },
  turm_blau: { name: 'Propeller blau-weiss auf Turm', desc: 'Turmkanone in Blau-Weiss', cost: 66000, reach: 26, mount: 'tower', h: 7, body: 0xf1f3f5 },
  raupe: { name: 'Grosse Kanone auf Raupen', desc: 'Grosser Propeller auf Raupenfahrwerk, sehr viel Schnee', cost: 110000, reach: 34, mount: 'tracks', body: 0xf2c200, frame: 0x2d3033, bs: 1.3 },
};

// merge the plain meshes of a group by material (keeps sub-groups and the meshes in keep)
function mergeStatic(grp, keep) {
  const by = new Map();
  for (const ch of [...grp.children]) {
    if (!ch.isMesh || keep.has(ch)) continue;
    ch.updateMatrix();
    const geo = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(ch.matrix);
    if (!by.has(ch.material)) by.set(ch.material, []);
    by.get(ch.material).push(geo); grp.remove(ch);
  }
  for (const [m, list] of by) { const me = new THREE.Mesh(mergeGeometries(list), m); me.castShadow = true; me.receiveShadow = true; grp.add(me); }
}

export class SnowCannons {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.list = [];
    this.on = true;
    this.active = true; // false in summer
    this.perCannon = GFX.ultra ? 240 : GFX.potato ? 50 : 150;
    this.maxCannons = 120;
    const n = this.perCannon * this.maxCannons;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.life0 = new Float32Array(n).fill(1);
    this.age = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1));
    geo.setDrawRange(0, 0);
    // snow plume: soft mist puffs that grow and fade as they fly (size in metres, perspective-correct)
    const uni = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 }, uCol: { value: new THREE.Color(0xf4f8ff) } }]);
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: uni, fog: true, transparent: true, depthWrite: false,
      vertexShader: `attribute float aAge; uniform float uScale; varying float vA; varying float vAge;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float size = mix(0.3, 2.5, sqrt(clamp(aAge, 0.0, 1.0)));
          gl_PointSize = clamp(size * uScale / max(0.5, -mvPosition.z), 0.0, 220.0);
          vA = smoothstep(0.0, 0.06, aAge) * (1.0 - smoothstep(0.55, 1.0, aAge)) * (aAge > 0.0 ? 1.0 : 0.0);
          vAge = aAge;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; varying float vAge;
        #include <fog_pars_fragment>
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
          if (r > 1.0) discard;
          float a = (1.0 - r * r) * (1.0 - r * r) * vA * mix(0.75, 0.32, vAge);
          // dense ice core near the nozzle, thin mist later; shaded slightly darker at the bottom
          vec3 c = uCol * (0.9 + 0.1 * (0.5 - d.y));
          gl_FragColor = vec4(c, a);
          #include <fog_fragment>
        }`,
    }));
    const _sz = new THREE.Vector2();
    this.points.onBeforeRender = (r, sc, cam) => { r.getDrawingBufferSize(_sz); this.points.material.uniforms.uScale.value = _sz.y / (2 * Math.tan((cam.fov || 55) * Math.PI / 360)); };
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.rand = mulberry32(77);
    this.pileGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.pileMat = new THREE.MeshLambertMaterial({ color: 0xf7faff });
    this.mats = { yellow: mat(0xf2c200), grey: mat(0x8c9196), dark: mat(0x2d3033), white: mat(0xe8ecef), alu: mat(0xc3c9cf), red: mat(0xc0392b), black: mat(0x15171a), hose: mat(0x1f4fa8) };
  }

  build(type) {
    const g = new THREE.Group();
    const m = this.mats, U = GFX.ultra;
    const S = U ? 2 : 1;
    let nozzle = new THREE.Vector3(), aimUp = 0.5, speed = 18, spread = 0.25, fan = null;
    const add = (geo, mm, x, y, z, rx = 0, rz = 0, parent = g, ry = 0) => { const me = new THREE.Mesh(geo, mm); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; parent.add(me); return me; };
    const R = (w, h, d, r = 0.05) => rbox(w, h, d, r, S);
    const tube = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, U ? seg * 2 : seg);
    // a pipe between two points
    const pipe = (a, b2, r, mm, parent = g) => { const d = new THREE.Vector3().subVectors(b2, a), L = d.length(); const me = new THREE.Mesh(tube(r, L, 6), mm); me.position.copy(a).addScaledVector(d, 0.5); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); me.castShadow = true; parent.add(me); return me; };
    // hydrant shaft with a lid next to every cannon, and the water / power hoses
    const hydrant = (hx, hz, to) => {
      add(new THREE.CylinderGeometry(0.42, 0.48, 0.5, U ? 20 : 10), m.dark, hx, 0.2, hz);
      add(new THREE.CylinderGeometry(0.44, 0.44, 0.06, U ? 20 : 10), m.grey, hx, 0.47, hz);
      add(tube(0.07, 0.5), m.alu, hx + 0.15, 0.75, hz);
      add(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 8), m.red, hx + 0.15, 1.02, hz);
      if (U) add(R(0.35, 0.5, 0.2, 0.04), m.yellow, hx - 0.2, 0.75, hz + 0.25);
      // hoses lie on the snow and climb to the machine
      const pts = [new THREE.Vector3(hx + 0.15, 0.75, hz), new THREE.Vector3(hx + 0.4, 0.08, hz + 0.3), new THREE.Vector3((hx + to.x) / 2, 0.06, (hz + to.z) / 2 + 0.2), new THREE.Vector3(to.x, 0.08, to.z), to];
      const curve = new THREE.CatmullRomCurve3(pts);
      add(new THREE.TubeGeometry(curve, U ? 24 : 10, 0.05, U ? 8 : 5), m.hose, 0, 0, 0);
      if (U) { const c2 = new THREE.CatmullRomCurve3(pts.map((q, i) => q.clone().add(new THREE.Vector3(0, 0, i > 0 && i < pts.length - 1 ? -0.14 : -0.05)))); add(new THREE.TubeGeometry(c2, 20, 0.03, 6), m.black, 0, 0, 0); }
    };
    const cfg = CANNON_TYPES[type] || {};
    const bodyCol = cfg.body ?? 0xf2c200, frameM = cfg.frame != null ? mat(cfg.frame) : m.yellow, bs = cfg.bs || 1, mount = cfg.mount || 'wheels';
    if (type === 'lanze' || cfg.mount === 'lanze') {
      // snow lance: hydrant box, tripod foot, long tilted aluminium pipe with a nozzle head
      add(R(0.9, 0.5, 0.9, 0.06), m.grey, 0, 0.25, 0);
      add(new THREE.CylinderGeometry(0.22, 0.26, 0.9, U ? 16 : 8), m.grey, 0, 0.8, 0);
      add(R(0.55, 0.75, 0.38, 0.05), m.white, 0.75, 0.55, 0);
      if (U) { add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), m.red, 0.75, 0.8, 0.2, Math.PI / 2); add(R(0.3, 0.12, 0.02, 0.01), m.dark, 0.75, 0.62, 0.195); }
      const tilt = cfg.tilt || 0.42, L = cfg.L || 9.5;
      const base = new THREE.Vector3(0, 1.2, 0.1), dir = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)), top = base.clone().addScaledVector(dir, L);
      pipe(base, top, 0.085, m.alu);
      pipe(base.clone().addScaledVector(dir, 2.5), new THREE.Vector3(0, 0.05, -1.6), 0.05, m.alu); // support strut
      add(R(0.5, 0.06, 0.5, 0.02), m.grey, 0, 0.03, -1.6);
      for (const f of [0.35, 0.6, 0.85]) { const q = base.clone().addScaledVector(dir, L * f); add(tube(0.11, 0.08), m.grey, q.x, q.y, q.z, tilt); }
      const head = add(new THREE.CylinderGeometry(0.16, 0.12, 0.6, U ? 18 : 8), cfg.head ? mat(cfg.head) : m.yellow, top.x, top.y, top.z, tilt);
      void head;
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, U ? 18 : 8), m.dark, top.x, top.y + 0.3 * Math.cos(tilt), top.z + 0.3 * Math.sin(tilt), tilt);
      if (U) for (let k = 0; k < 6; k++) { const a2 = k / 6 * Math.PI * 2; add(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6), m.alu, top.x + Math.cos(a2) * 0.13, top.y + 0.05 + Math.sin(a2) * 0.13 * Math.cos(tilt), top.z + 0.12, tilt); }
      hydrant(1.4, -0.6, new THREE.Vector3(0.75, 0.3, -0.15));
      nozzle.copy(top).addScaledVector(dir, 0.35); aimUp = 0.15; speed = 7 * Math.sqrt((cfg.reach || 9) / 9); spread = 0.5;
    } else {
      let y0 = 0;
      if (mount === 'tower') {
        const TH = cfg.h || 7;
        // tubular mast with foot plate, ladder, slewing head and work platform
        add(R(1.4, 0.3, 1.4, 0.05), m.grey, 0, 0.15, 0);
        add(new THREE.CylinderGeometry(0.22, TH > 8 ? 0.42 : 0.34, TH, U ? 20 : 10), m.grey, 0, TH / 2 + 0.15, 0);
        for (let k = 0; k < 4; k++) { const a2 = k / 4 * Math.PI * 2 + Math.PI / 4; pipe(new THREE.Vector3(Math.cos(a2) * 0.6, 0.3, Math.sin(a2) * 0.6), new THREE.Vector3(Math.cos(a2) * 0.25, 1.4, Math.sin(a2) * 0.25), 0.05, m.grey); }
        for (const sd of [-0.18, 0.18]) pipe(new THREE.Vector3(0.38 + (TH > 8 ? 0.08 : 0), 0.4, sd), new THREE.Vector3(0.38, TH - 0.2, sd), 0.025, m.alu);
        for (let k = 0; k < Math.floor((TH - 1) / 0.32); k++) add(tube(0.018, 0.36), m.alu, 0.38, 0.6 + k * 0.32, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.75, 0.75, 0.12, U ? 24 : 12), m.dark, 0, TH + 0.15, 0);
        if (U) { for (let k = 0; k < 10; k++) { const a2 = k / 10 * Math.PI * 2; add(tube(0.02, 0.9), m.alu, Math.cos(a2) * 0.72, TH + 0.65, Math.sin(a2) * 0.72); } add(new THREE.TorusGeometry(0.72, 0.025, 6, 30), m.alu, 0, TH + 1.1, 0, Math.PI / 2); }
        add(R(0.45, 0.6, 0.35, 0.04), m.white, -0.5, TH - 0.6, 0);
        if (TH > 8) for (let k = 0; k < 4; k++) { const a2 = k / 4 * Math.PI * 2; pipe(new THREE.Vector3(Math.cos(a2) * 0.25, TH * 0.55, Math.sin(a2) * 0.25), new THREE.Vector3(Math.cos(a2) * 3.2, 0.05, Math.sin(a2) * 3.2), 0.012, m.dark); } // guy wires
        y0 = TH + 0.2;
        hydrant(1.6, 0.8, new THREE.Vector3(0, 0.3, 0.3));
      } else if (mount === 'sled') {
        // sled: two skids with bent-up tips, low frame, tow eye
        for (const sd of [-1, 1]) {
          add(R(2.4, 0.08, 0.22, 0.03), m.dark, 0, 0.06, sd * 0.75);
          add(R(0.5, 0.08, 0.22, 0.03), m.dark, 1.35, 0.2, sd * 0.75, 0, 0.55);
          for (const x of [-0.8, 0.8]) pipe(new THREE.Vector3(x, 0.1, sd * 0.75), new THREE.Vector3(x * 0.8, 0.5, sd * 0.55), 0.045, frameM);
        }
        add(R(1.8, 0.14, 1.3, 0.04), frameM, 0, 0.55, 0);
        pipe(new THREE.Vector3(1.0, 0.5, 0), new THREE.Vector3(1.9, 0.3, 0), 0.05, frameM);
        add(new THREE.TorusGeometry(0.09, 0.025, 6, 12), m.dark, 1.97, 0.3, 0, Math.PI / 2);
        add(R(0.5, 0.75, 0.42, 0.04), m.white, -0.6, 1.0, -0.38);
        y0 = 0.62;
        hydrant(-1.8, 1.5, new THREE.Vector3(-0.3, 0.6, 0.4));
      } else if (mount === 'arm') {
        // swing arm: concrete foot, short post, long boom reaching over the piste, gun at the tip
        const px = -4.2;
        add(R(1.4, 0.35, 1.4, 0.05), m.grey, px, 0.17, 0);
        add(new THREE.CylinderGeometry(0.25, 0.32, 3.2, U ? 18 : 10), m.grey, px, 1.9, 0);
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, U ? 18 : 10), m.dark, px, 3.55, 0);
        const tip = new THREE.Vector3(0, 5.2, 0);
        pipe(new THREE.Vector3(px, 3.6, 0), tip, 0.18, frameM);
        pipe(new THREE.Vector3(px, 2.3, 0), new THREE.Vector3(px * 0.45, 4.3, 0), 0.08, frameM);
        add(R(0.45, 0.6, 0.35, 0.04), m.white, px - 0.45, 2.4, 0);
        y0 = 5.2;
        hydrant(px + 1.2, 1.1, new THREE.Vector3(px, 0.4, 0.3));
      } else if (mount === 'tracks') {
        // tracked chassis: two rubber tracks with road wheels, platform and a big control cabinet
        for (const sd of [-1, 1]) {
          add(R(2.8, 0.55, 0.45, 0.2), m.black, 0, 0.3, sd * 1.0);
          for (const x of [-1.05, -0.35, 0.35, 1.05]) add(new THREE.CylinderGeometry(0.2, 0.2, 0.47, U ? 14 : 8), m.grey, x, 0.28, sd * 1.0, Math.PI / 2);
        }
        add(R(2.6, 0.3, 2.2, 0.05), frameM, 0, 0.75, 0);
        add(R(0.7, 1.0, 0.6, 0.05), m.white, -1.0, 1.4, -0.75);
        if (U) add(R(0.5, 0.3, 0.02, 0.01), m.dark, -1.0, 1.5, -0.44);
        y0 = 0.9;
        hydrant(-2.4, 1.8, new THREE.Vector3(-0.8, 0.8, 0.5));
      } else {
        // mobile fan gun: frame on two wheels with a tow bar, support legs, control box
        add(R(1.9, 0.18, 1.3, 0.04), frameM, 0, 0.72, 0);
        for (const sd of [-1, 1]) {
          add(new THREE.CylinderGeometry(0.42, 0.42, 0.28, U ? 24 : 12), m.dark, 0.1, 0.42, sd * 0.85, Math.PI / 2);
          add(new THREE.CylinderGeometry(0.22, 0.22, 0.3, U ? 16 : 8), m.grey, 0.1, 0.42, sd * 0.86, Math.PI / 2);
          if (U) for (let k = 0; k < 10; k++) { const a2 = k / 10 * Math.PI * 2; add(R(0.08, 0.06, 0.3, 0.01), m.black, 0.1 + Math.cos(a2) * 0.42, 0.42 + Math.sin(a2) * 0.42, sd * 0.85, 0, a2); }
          add(R(0.6, 0.06, 0.32, 0.02), frameM, 0.1, 0.9, sd * 0.85);
          pipe(new THREE.Vector3(-0.85, 0.7, sd * 0.55), new THREE.Vector3(-1.0, 0.05, sd * 0.7), 0.05, m.grey);
          add(R(0.25, 0.04, 0.25, 0.01), m.grey, -1.0, 0.03, sd * 0.7);
        }
        pipe(new THREE.Vector3(0.9, 0.7, 0.3), new THREE.Vector3(1.9, 0.45, 0), 0.05, frameM);
        pipe(new THREE.Vector3(0.9, 0.7, -0.3), new THREE.Vector3(1.9, 0.45, 0), 0.05, frameM);
        add(new THREE.TorusGeometry(0.09, 0.025, 6, 12), m.dark, 1.97, 0.45, 0, Math.PI / 2);
        add(R(0.55, 0.85, 0.45, 0.04), m.white, -0.55, 1.25, -0.35);
        if (U) { add(R(0.4, 0.25, 0.02, 0.01), m.dark, -0.55, 1.35, -0.12); add(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), m.red, -0.4, 1.1, -0.12, Math.PI / 2); }
        y0 = 0.82;
        hydrant(-1.8, 1.5, new THREE.Vector3(-0.3, 0.75, 0.4));
      }
      // turntable + yoke holding the fan barrel
      add(new THREE.CylinderGeometry(0.35, 0.4, 0.25, U ? 20 : 10), m.dark, 0, y0 + 0.12, 0);
      add(R(0.5 * bs, 0.9 * bs, 0.4 * bs, 0.05), mat(bodyCol), 0, y0 + 0.65 * bs, -0.1);
      const barrelG = new THREE.Group();
      const bodyM = new THREE.MeshLambertMaterial({ color: bodyCol, side: THREE.DoubleSide });
      const bodyMS = mat(bodyCol);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 1.7, U ? 40 : 18, 1, true), bodyM);
      barrel.rotation.x = Math.PI / 2; barrel.castShadow = true; barrelG.add(barrel);
      add(new THREE.CylinderGeometry(0.6, 0.6, 1.66, U ? 32 : 14, 1, true).rotateX(Math.PI / 2), m.dark, 0, 0, 0, 0, 0, barrelG); // inner wall
      for (const sd of [-1, 1]) add(R(0.12, 0.25, 0.5, 0.03), bodyMS, sd * 0.72, 0, 0, 0, 0, barrelG); // trunnions
      // rear: motor housing behind a safety grille
      add(new THREE.TorusGeometry(0.68, 0.05, 6, U ? 32 : 16), m.grey, 0, 0, -0.85, 0, 0, barrelG);
      for (let k = -4; k <= 4; k++) { add(R(0.025, 1.25 * Math.sqrt(1 - (k / 5) ** 2), 0.025, 0.008), m.grey, k * 0.135, 0, -0.84, 0, 0, barrelG); add(R(1.25 * Math.sqrt(1 - (k / 5) ** 2), 0.025, 0.025, 0.008), m.grey, 0, k * 0.135, -0.83, 0, 0, barrelG); }
      add(new THREE.CylinderGeometry(0.22, 0.26, 0.5, U ? 20 : 10).rotateX(Math.PI / 2), m.dark, 0, 0, -0.45, 0, 0, barrelG);
      // fan blades (rotating)
      fan = new THREE.Group(); fan.position.z = -0.15; barrelG.add(fan);
      const nb = 6;
      for (let k = 0; k < nb; k++) { const bl = new THREE.Mesh(R(0.55, 0.16, 0.025, 0.01), m.grey); const a2 = k / nb * Math.PI * 2; bl.position.set(Math.cos(a2) * 0.32, Math.sin(a2) * 0.32, 0); bl.rotation.set(0.45, 0, a2); fan.add(bl); }
      fan.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), m.dark));
      // front: stainless nozzle ring with nozzles
      add(new THREE.TorusGeometry(0.66, 0.06, 8, U ? 40 : 18), m.alu, 0, 0, 0.86, 0, 0, barrelG);
      for (let k = 0; k < (U ? 24 : 8); k++) { const a2 = k / (U ? 24 : 8) * Math.PI * 2; add(new THREE.CylinderGeometry(0.025, 0.02, 0.09, 6).rotateX(Math.PI / 2), m.dark, Math.cos(a2) * 0.66, Math.sin(a2) * 0.66, 0.93, 0, 0, barrelG); }
      if (U) { add(R(0.5, 0.18, 0.04, 0.02), m.dark, 0, 0.5, 0.2, 0, 0, barrelG); for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 10).rotateX(Math.PI / 2), m.alu, sd * 0.3, -0.7, 0.7, 0, 0, barrelG); }
      barrelG.position.set(0, y0 + 1.25 * bs, 0); barrelG.rotation.x = -0.38; barrelG.scale.setScalar(bs);
      g.add(barrelG);
      nozzle.set(0, y0 + (1.25 + Math.sin(0.38) * 1.0) * bs, Math.cos(0.38) * 1.0 * bs);
      aimUp = 0.42; speed = 16 * Math.sqrt(cfg.reach / 18); spread = 0.2;
      // fewer draw calls: merge the static parts of the barrel
      mergeStatic(barrelG, new Set([fan]));
    }
    mergeStatic(g, new Set());
    return { g, nozzle, aimUp, speed, spread, fan };
  }

  // no limit on the number of snow guns: the particle buffers grow when needed
  grow() {
    const old = this.maxCannons, nm = old * 2, n = this.perCannon * nm;
    const re = (a, k, fill = 0) => { const b = new Float32Array(n * k).fill(fill); b.set(a); return b; };
    this.pos = re(this.pos, 3); this.vel = re(this.vel, 3); this.life = re(this.life, 1); this.life0 = re(this.life0, 1, 1); this.age = re(this.age, 1);
    const geo = this.points.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1));
    geo.boundingSphere = null;
    this.maxCannons = nm;
  }

  add(type, x, z, yaw, size = 1) {
    if (this.list.length >= this.maxCannons) this.grow();
    const b = this.build(type);
    b.g.position.set(x, heightAt(this.world, x, z), z);
    b.g.rotation.y = yaw;
    b.g.scale.setScalar(size);
    b.nozzle.multiplyScalar(size); b.speed *= Math.sqrt(size); b.size = size;
    this.group.add(b.g);
    const pile = new THREE.Mesh(this.pileGeo, this.pileMat);
    pile.receiveShadow = true;
    this.group.add(pile);
    const c = { type, x, z, yaw, ...b, slot: this.list.length, pile, amount: 0 };
    this.list.push(c);
    this.placePile(c);
    const base = c.slot * this.perCannon;
    for (let i = 0; i < this.perCannon; i++) this.life[base + i] = -this.rand() * 3;
    this.points.geometry.setDrawRange(0, this.list.length * this.perCannon);
    return c;
  }

  placePile(c) {
    const reach = CANNON_TYPES[c.type].reach * Math.sqrt(c.size || 1);
    const px = c.x + Math.sin(c.yaw) * reach, pz = c.z + Math.cos(c.yaw) * reach;
    c.px = px; c.pz = pz;
    const a = c.amount;
    c.pile.visible = a > 0.02 && this.active;
    c.pile.position.set(px, heightAt(this.world, px, pz) - 0.3, pz);
    c.pile.scale.set(3 + a * 11, 0.3 + a * 2.6, 3 + a * 11);
  }

  removeCannon(c) {
    this.group.remove(c.g); this.group.remove(c.pile);
    this.list = this.list.filter((x) => x !== c);
    this.list.forEach((x, i) => { x.slot = i; });
    this.pos.fill(0); this.life.fill(-1);
    this.points.geometry.setDrawRange(0, this.list.length * this.perCannon);
  }
  setYaw(c, yaw) { c.yaw = yaw; c.g.rotation.y = yaw; this.placePile(c); }

  // groomer or nightly grooming flattens piles
  flattenNear(x, z, r) { for (const c of this.list) if (c.amount > 0 && Math.hypot(c.px - x, c.pz - z) < r + 4 + c.amount * 10) { c.amount = Math.max(0, c.amount - 0.05); this.placePile(c); } }
  flattenAll() { for (const c of this.list) { c.amount = 0; this.placePile(c); } }

  setActive(a) { this.active = a; for (const c of this.list) { c.g.visible = true; this.placePile(c); } }

  update(dt) {
    const p = this.pos, v = this.vel, life = this.life;
    const tmp = new THREE.Vector3();
    const running = this.on && this.active;
    // with very many guns each one sprays a bit fewer flakes, so the game stays smooth
    const use = this.list.length > 150 ? Math.max(20, Math.floor(this.perCannon * 150 / this.list.length)) : this.perCannon;
    for (const c of this.list) {
      if (c.fan && running) c.fan.rotation.z += dt * 25;
      if (running && c.amount < 1) { c.amount = Math.min(1, c.amount + dt / 150); this.placePile(c); }
      const base = c.slot * this.perCannon;
      const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      for (let i = 0; i < this.perCannon; i++) {
        const k = base + i;
        if (i >= use) { p[k * 3 + 1] = -9999; this.age[k] = 0; continue; }
        life[k] -= dt;
        if (life[k] <= 0) {
          if (!running) { p[k * 3 + 1] = -9999; life[k] = 0.2; this.age[k] = 0; continue; }
          tmp.copy(c.nozzle).applyAxisAngle(UP, c.yaw).add(c.g.position);
          p[k * 3] = tmp.x; p[k * 3 + 1] = tmp.y; p[k * 3 + 2] = tmp.z;
          const sp = c.speed * (0.7 + this.rand() * 0.5);
          const lx = (this.rand() - 0.5) * c.spread * 2;
          const fx = lx * cy + sy, fz = -lx * sy + cy;
          v[k * 3] = fx * sp; v[k * 3 + 1] = (c.aimUp + (this.rand() - 0.5) * c.spread) * sp; v[k * 3 + 2] = fz * sp;
          life[k] = 2.2 + this.rand() * 1.4; this.life0[k] = life[k];
        } else {
          v[k * 3 + 1] -= 4.5 * dt;
          v[k * 3] *= 1 - 0.4 * dt; v[k * 3 + 2] *= 1 - 0.4 * dt;
          p[k * 3] += v[k * 3] * dt + 0.6 * dt; p[k * 3 + 1] += v[k * 3 + 1] * dt; p[k * 3 + 2] += v[k * 3 + 2] * dt;
        }
        this.age[k] = life[k] > 0 && p[k * 3 + 1] > -9000 ? 1 - life[k] / this.life0[k] : 0;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAge.needsUpdate = true;
  }

  dispose() { this.scene.remove(this.group); }
}

// ================= LOCAL PLOUGH (painted roads) =================
// a small municipal plough that drives to snowy painted roads and clears them
export class LocalPlough {
  constructor(world, scene, tv) {
    this.world = world; this.scene = scene; this.tv = tv;
    this.g = truckMesh(true); this.g.scale.setScalar(0.7); this.g.visible = false; scene.add(this.g);
    this.active = false; this.x = 0; this.z = 0; this.yaw = 0; this.target = null; this.searchT = 0;
  }
  // count of snowy road pixels (sampled), 0..1
  snowShare() {
    const px = this.tv.getRoadPixels(); if (!px.length) return 0;
    let n = 0, c = 0;
    for (let i = 0; i < px.length; i += Math.max(1, Math.floor(px.length / 300))) { c++; if (this.tv.surfSnowAt(px[i]) > 0.25) n++; }
    return c ? n / c : 0;
  }
  findTarget() {
    const px = this.tv.getRoadPixels(); if (!px.length) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < 160; i++) {
      const k = px[Math.floor(Math.random() * px.length)];
      if (this.tv.surfSnowAtPx(k) < 0.15) continue;
      const [x, z] = this.tv.surfToWorld(k);
      const d = Math.hypot(x - this.x, z - this.z);
      if (d < bd) { bd = d; best = { x, z }; }
    }
    return best;
  }
  update(dt, allowed, home) {
    const tv = this.tv;
    if (!allowed) { this.active = false; this.g.visible = false; return; }
    this.searchT -= dt;
    if (!this.active) {
      if (this.searchT > 0) return;
      this.searchT = 3;
      const t = this.findTarget(); if (!t) return;
      this.active = true; this.target = t;
      const start = home || t; this.x = start.x + 6; this.z = start.z;
    }
    if (!this.target || Math.hypot(this.target.x - this.x, this.target.z - this.z) < 3) {
      this.target = this.findTarget();
      if (!this.target) { this.active = false; this.g.visible = false; return; }
    }
    const dx = this.target.x - this.x, dz = this.target.z - this.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(-dz, dx);
    let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += clamp(dy, -1, 1) * Math.min(1, dt * 2.5);
    const sp = Math.abs(dy) > 0.8 ? 3 : 8;
    this.x += Math.cos(this.yaw) * sp * dt; this.z -= Math.sin(this.yaw) * sp * dt;
    tv.clearSurfSnow(this.x + Math.cos(this.yaw) * 2.5, this.z - Math.sin(this.yaw) * 2.5, 3.2);
    this.g.visible = true;
    this.g.position.set(this.x, heightAt(this.world, this.x, this.z) + 0.05, this.z);
    this.g.rotation.y = this.yaw;
    if (this.g.userData.beacon) this.g.userData.beacon.material.emissive.setHex(Math.sin(performance.now() / 120) > 0 ? 0xff8800 : 0x331a00);
    void d;
  }
  dispose() { this.scene.remove(this.g); }
}
