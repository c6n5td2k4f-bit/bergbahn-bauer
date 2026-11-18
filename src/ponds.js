// Ponds: fill a hole in the terrain with water. The water rises up to the lowest point of the rim
// (where it would run out) and stays inside that hole - never spreads over the map.
import * as THREE from 'three';

// binary min-heap on (key, index) in typed arrays
class Heap {
  constructor(n) { this.k = new Float32Array(n); this.v = new Int32Array(n); this.n = 0; }
  push(key, val) {
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], last = --this.n;
    if (last <= 0) return top;
    const key = k[last], val = v[last];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= last) break;
      if (c + 1 < last && k[c + 1] < k[c]) c++;
      if (k[c] >= key) break;
      k[i] = k[c]; v[i] = v[c]; i = c;
    }
    k[i] = key; v[i] = val;
    return top;
  }
}

export class Ponds {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.list = []; // { x, z, drop } drop = metres below the brim
    this.group = new THREE.Group(); scene.add(this.group);
    this.waterMat = new THREE.MeshPhongMaterial({ color: 0x2c6e82, specular: 0xaaccdd, shininess: 90, transparent: true, opacity: 0.9 });
    this.iceMat = new THREE.MeshLambertMaterial({ color: 0xe3edf3 });
    this.season = 0;
    this.filled = null;
  }

  // the surface water would have everywhere if every hole were filled up to its outlet
  // (priority flood from the map border)
  fill() {
    if (this.filled) return this.filled;
    const { N, heights } = this.world, R = N + 1, n = R * R;
    const F = new Float32Array(n), seen = new Uint8Array(n), hp = new Heap(n);
    for (let i = 0; i < R; i++) for (const j of [0, N]) { for (const id of [j * R + i, i * R + j]) if (!seen[id]) { seen[id] = 1; F[id] = heights[id]; hp.push(F[id], id); } }
    while (hp.n) {
      const id = hp.pop(), lvl = F[id], i = id % R, j = (id / R) | 0;
      for (let k = 0; k < 4; k++) {
        const ii = i + (k === 0 ? 1 : k === 1 ? -1 : 0), jj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const q = jj * R + ii; if (seen[q]) continue;
        seen[q] = 1; F[q] = Math.max(heights[q], lvl); hp.push(F[q], q);
      }
    }
    this.filled = F;
    return F;
  }

  invalidate() { this.filled = null; }

  vertexAt(x, z) {
    const { N, cell, S } = this.world, R = N + 1;
    const i = Math.max(0, Math.min(N, Math.round((x + S / 2) / cell))), j = Math.max(0, Math.min(N, Math.round((z + S / 2) / cell)));
    return j * R + i;
  }

  // water body of a pond: { level, brim, ids (Int32Array of covered vertices), area, depth } or null
  body(p) {
    const F = this.fill(), { N, heights, cell } = this.world, R = N + 1;
    // the click may hit the slope of the hole: look a few cells around for the deepest filled spot
    let seed = this.vertexAt(p.x, p.z), best = F[seed] - heights[seed];
    const si = seed % R, sj = (seed / R) | 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = si + di, jj = sj + dj; if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
      const q = jj * R + ii, d = F[q] - heights[q]; if (d > best) { best = d; seed = q; }
    }
    if (best < 0.25) return null;
    const brim = F[seed];
    // the whole hole: vertices connected to the seed that are flooded at the brim level
    const hole = [], mark = new Uint8Array(R * R), st = [seed]; mark[seed] = 1;
    let pit = seed;
    while (st.length) {
      const id = st.pop(); hole.push(id); if (heights[id] < heights[pit]) pit = id;
      const i = id % R, j = (id / R) | 0;
      for (let k = 0; k < 4; k++) {
        const ii = i + (k === 0 ? 1 : k === 1 ? -1 : 0), jj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const q = jj * R + ii; if (mark[q]) continue;
        if (Math.abs(F[q] - brim) < 1e-3 && heights[q] < brim) { mark[q] = 1; st.push(q); }
      }
      if (hole.length > 400000) break;
    }
    const level = Math.max(heights[pit] + 0.1, brim - (p.drop || 0));
    // vertices actually under water at that level, connected to the deepest point
    const ids = [], m2 = new Uint8Array(R * R), s2 = [pit]; m2[pit] = 1;
    while (s2.length) {
      const id = s2.pop(); ids.push(id);
      const i = id % R, j = (id / R) | 0;
      for (let k = 0; k < 4; k++) {
        const ii = i + (k === 0 ? 1 : k === 1 ? -1 : 0), jj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const q = jj * R + ii; if (m2[q] || !mark[q] || heights[q] >= level) continue;
        m2[q] = 1; s2.push(q);
      }
    }
    return { level, brim, pitH: heights[pit], ids: Int32Array.from(ids), mask: m2, area: ids.length * cell * cell, depth: level - heights[pit] };
  }

  add(x, z) {
    const p = { x, z, drop: 0 };
    const b = this.body(p);
    if (!b) return null;
    // the same hole already has water: just top it up
    const old = this.list.find((q) => { const ob = this.body(q); return ob && ob.mask[this.vertexAt(x, z)]; });
    if (old) { old.drop = 0; this.build(); return { pond: old, body: this.body(old), again: true }; }
    this.list.push(p); this.build();
    return { pond: p, body: b };
  }

  pondAt(x, z) {
    const v = this.vertexAt(x, z);
    for (const p of this.list) { const b = this.body(p); if (b && b.mask[v]) return p; }
    // also accept a click right next to the shore
    let best = null, bd = 1e9;
    for (const p of this.list) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return bd < 25 ? best : null;
  }

  remove(p) { this.list = this.list.filter((q) => q !== p); this.build(); }

  setDrop(p, drop) { const b = this.body({ ...p, drop: 0 }); if (!b) return; p.drop = Math.max(0, Math.min(drop, b.brim - b.pitH - 0.1)); this.build(); }

  build() {
    for (const m of [...this.group.children]) { m.geometry.dispose(); this.group.remove(m); }
    const { N, cell, S } = this.world, R = N + 1;
    this.list = this.list.filter((p) => this.body(p)); // holes that were filled in by terraforming vanish
    for (const p of this.list) {
      const b = this.body(p); if (!b) continue;
      // one quad per cell touching a flooded vertex; where the ground is higher it simply hides the
      // water, so the shore line follows the terrain exactly
      const cells = new Set();
      for (const id of b.ids) { const i = id % R, j = (id / R) | 0; for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) { const ci = i + di, cj = j + dj; if (ci >= 0 && cj >= 0 && ci < N && cj < N) cells.add(cj * N + ci); } }
      const pos = new Float32Array(cells.size * 18); let o = 0;
      const y = b.level;
      for (const c of cells) {
        const ci = c % N, cj = (c / N) | 0, x0 = -S / 2 + ci * cell, z0 = -S / 2 + cj * cell, x1 = x0 + cell, z1 = z0 + cell;
        pos.set([x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1], o); o += 18;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.season === 0 ? this.iceMat : this.waterMat); m.receiveShadow = true; m.renderOrder = 2;
      this.group.add(m);
    }
  }

  setSeason(s) { this.season = s; for (const m of this.group.children) m.material = s === 0 ? this.iceMat : this.waterMat; }

  serialize() { return this.list.map((p) => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, d: Math.round((p.drop || 0) * 10) / 10 })); }
  load(arr) { this.list = (arr || []).map((q) => ({ x: q.x, z: q.z, drop: q.d || 0 })); this.invalidate(); this.build(); }
}
