// Piste marker poles and guests: skiers (winter) follow pistes to valley stations,
// bikers follow trails, hikers wander on hiking trails (summer)
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { heightAt, normalAt, distToLine } from './terrain.js';
import { skierGeometry, bikerGeometry, hikerGeometry, sledderGeometry, JACKETS, skierPartGeometries, boarderPartGeometries, SkierPose, BoarderPose, SKIER_PARTS, PANTS_COLS } from './figures.js';
import { mulberry32, clamp } from './noise.js';

const MARK_COL = { 1: 0x1f63d6, 2: 0xd62020, 3: 0x111111, 4: 0xf2c200, 5: 0x9b3fd1, 6: 0x1fa65f };
const TRAIL_COL = { 1: 0xf4c400, 2: 0xe03030, 3: 0x2a8de0, 4: 0x111111 };

export class PisteMarkers {
  constructor(world, scene, tv) {
    this.world = world; this.tv = tv; this.scene = scene;
    this.max = 8000;
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 1.8, 6).translate(0, 0.9, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.max);
    this.caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.35, 6).translate(0, 1.45, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.max);
    this.signs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.25, 0.5).translate(0, 1.1, 0.25), new THREE.MeshLambertMaterial({ color: 0xffffff }), 3000);
    for (const m of [this.mesh, this.caps, this.signs]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
    this.season = 0;
  }
  update() {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const list = this.season === 0 ? this.tv.computeMarkers('piste', 34) : [];
    list.forEach((p, i) => {
      m.makeTranslation(p.x, heightAt(this.world, p.x, p.z) - 0.25, p.z);
      this.mesh.setMatrixAt(i, m); this.caps.setMatrixAt(i, m);
      this.mesh.setColorAt(i, c.setHex(MARK_COL[p.p]));
      this.caps.setColorAt(i, c.setHex(p.p === 4 ? 0x111111 : 0xff7a00));
    });
    this.mesh.count = this.caps.count = list.length;
    // summer: small trail signs along trails
    const tl = this.season === 1 ? this.tv.computeMarkers('trail', 70).slice(0, 3000) : [];
    tl.forEach((p, i) => {
      m.makeTranslation(p.x, heightAt(this.world, p.x, p.z) - 0.2, p.z);
      this.signs.setMatrixAt(i, m); this.signs.setColorAt(i, c.setHex(TRAIL_COL[p.p]));
    });
    this.signs.count = tl.length;
    for (const x of [this.mesh, this.caps, this.signs]) { x.instanceMatrix.needsUpdate = true; if (x.instanceColor) x.instanceColor.needsUpdate = true; }
  }
  setSeason(s) { this.season = s; this.update(); }
  setVisible(v) { this.mesh.visible = this.caps.visible = this.signs.visible = v; }
  dispose() { this.scene.remove(this.mesh, this.caps, this.signs); }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Guests {
  constructor(world, scene, tv) {
    this.world = world; this.scene = scene; this.tv = tv;
    this.P = 512;
    this.cs = world.S / this.P;
    this.max = 1500;
    this.target = 150;
    this.factor = 1;
    this.season = 0;
    this.list = [];
    this.rand = mulberry32(4242);
    const mk = (geo) => {
      const j = new THREE.InstancedMesh(geo.jacket, new THREE.MeshLambertMaterial({ color: 0xffffff }), this.max);
      const r = new THREE.InstancedMesh(geo.rest, new THREE.MeshLambertMaterial({ vertexColors: true }), this.max);
      j.frustumCulled = r.frustumCulled = false; j.count = r.count = 0;
      const c = new THREE.Color();
      for (let i = 0; i < this.max; i++) j.setColorAt(i, c.setHex(JACKETS[(i * 5) % JACKETS.length]));
      scene.add(j, r);
      return { j, r };
    };
    this.meshes = { bike: mk(bikerGeometry()), hike: mk(hikerGeometry()), sled: mk(sledderGeometry()) };
    // skiers: articulated parts (skis on the slope, knees, upper body, poles), 2 ski variants
    this.skiParts = [];
    for (let vI = 0; vI < (GFX.potato ? 1 : 2); vI++) {
      const geo = skierPartGeometries(vI * 2 + 1), parts = {};
      for (const k of SKIER_PARTS) {
        parts[k] = {};
        for (const [cg, g] of Object.entries(geo[k])) {
          const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial(cg === 'f' ? { vertexColors: true } : { color: 0xffffff }), this.max);
          im.frustumCulled = false; im.count = 0; im.castShadow = true;
          if (cg !== 'f') { const c = new THREE.Color(); for (let i = 0; i < this.max; i++) im.setColorAt(i, c.setHex(cg === 'c' ? JACKETS[(i * 5 + vI * 3) % JACKETS.length] : PANTS_COLS[(i * 3 + vI) % PANTS_COLS.length])); }
          scene.add(im); parts[k][cg] = im;
        }
      }
      this.skiParts.push(parts);
    }
    // snowboarders: same part layout as the skiers (board, legs, upper body)
    this.boardParts = [];
    for (let vI = 0; vI < (GFX.potato ? 1 : 2); vI++) {
      const geo = boarderPartGeometries(vI * 3 + 1), parts = {};
      for (const k of SKIER_PARTS) {
        parts[k] = {};
        for (const [cg, g] of Object.entries(geo[k])) {
          const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial(cg === 'f' ? { vertexColors: true } : { color: 0xffffff }), Math.ceil(this.max / 2));
          im.frustumCulled = false; im.count = 0; im.castShadow = true;
          if (cg !== 'f') { const c = new THREE.Color(); for (let i = 0; i < Math.ceil(this.max / 2); i++) im.setColorAt(i, c.setHex(cg === 'c' ? JACKETS[(i * 7 + vI * 5 + 2) % JACKETS.length] : PANTS_COLS[(i * 5 + vI + 1) % PANTS_COLS.length])); }
          scene.add(im); parts[k][cg] = im;
        }
      }
      this.boardParts.push(parts);
    }
    this.bpose = new BoarderPose();
    this.pose = new SkierPose();
    const P = this.P;
    this.h = new Float32Array(P * P);
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) { const [x, z] = this.cellCenter(i, j); this.h[j * P + i] = heightAt(world, x, z); }
    this.dist = new Int32Array(P * P).fill(-1);
    this.sdist = new Int32Array(P * P).fill(-1); // sledge runs: distance to the bottom
    this.xcCells = new Uint8Array(P * P);
    this.goal = new Int16Array(P * P).fill(-1);
    this.hikeCells = new Uint8Array(P * P);
    this.free = new Uint8Array(P * P);
    this.lifts = [];
    this.spawnAcc = 0;
  }

  refreshHeights() {
    const P = this.P;
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) { const [x, z] = this.cellCenter(i, j); this.h[j * P + i] = heightAt(this.world, x, z); }
  }

  cellCenter(i, j) { const S = this.world.S; return [-S / 2 + (i + 0.5) * this.cs, -S / 2 + (j + 0.5) * this.cs]; }
  cellOf(x, z) { const S = this.world.S; return [Math.floor((x + S / 2) / this.cs), Math.floor((z + S / 2) / this.cs)]; }

  setSeason(s) { this.season = s; this.list.length = 0; }

  // flow field: distance (in cells) along pistes/trails to the nearest valley station
  rebuild(lifts) {
    this.lifts = lifts.filter((l) => l.running && l.seasonOk && l.type.kind !== 'carpet');
    const P = this.P, T = this.tv.T;
    const winter = this.season === 0;
    const pass = new Uint8Array(P * P);
    const f = T / P;
    this.hikeCells.fill(0);
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
      let any = 0, hike = 0;
      for (let b = 0; b < f && !any; b++) for (let a = 0; a < f; a++) {
        const k = (j * f + b) * T + i * f + a;
        if (winter) { const pv = this.tv.piste[k]; if (pv && pv < 5) { any = 1; break; } }
        else { const t = this.tv.trail[k]; if (t >= 3) { any = 1; break; } if (t) hike = 1; }
      }
      if (any) pass[j * P + i] = 1;
      if (winter && any) { let fr = 0, norm = 0; for (let b = 0; b < f; b += 2) for (let a = 0; a < f; a += 2) { const v = this.tv.piste[(j * f + b) * T + i * f + a]; if (v === 4) fr++; else if (v) norm++; } this.free[j * P + i] = fr > 0 && norm === 0 ? 1 : 0; } else this.free[j * P + i] = 0;
      if (hike) this.hikeCells[j * P + i] = 1;
    }
    const dist = this.dist.fill(-1), goal = this.goal.fill(-1);
    const queue = new Int32Array(P * P);
    let qh = 0, qt = 0;
    const markArea = (x, z, r, cb) => {
      const [ci, cj] = this.cellOf(x, z);
      const rc = Math.ceil(r / this.cs);
      for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
        if (i < 0 || j < 0 || i >= P || j >= P) continue;
        const [px, pz] = this.cellCenter(i, j);
        if ((px - x) ** 2 + (pz - z) ** 2 <= r * r) cb(j * P + i);
      }
    };
    this.lifts.forEach((l) => { markArea(l.B.x, l.B.z, 40, (k) => { pass[k] = 1; }); markArea(l.A.x, l.A.z, 34, (k) => { pass[k] = 1; }); });
    this.lifts.forEach((l, li) => { markArea(l.A.x, l.A.z, 26, (k) => { if (dist[k] !== 0) { dist[k] = 0; goal[k] = li; queue[qt++] = k; } }); });
    // mid-stations: guests can also board there
    this.lifts.forEach((l, li) => { if (!l.midRange || !l.midRange()) return; const q = l.pointAt(l.mid.d); markArea(q.x, q.z, 30, (k) => { pass[k] = 1; }); markArea(q.x, q.z, 22, (k) => { if (dist[k] !== 0) { dist[k] = 0; goal[k] = li; queue[qt++] = k; } }); });
    while (qh < qt) {
      const k = queue[qh++];
      const i = k % P, j = (k / P) | 0;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= P || nj >= P) continue;
        const nk = nj * P + ni;
        if (!pass[nk] || dist[nk] >= 0) continue;
        if (this.h[k] > this.h[nk] + 1.5) continue;
        dist[nk] = dist[k] + 1; goal[nk] = goal[k];
        queue[qt++] = nk;
      }
    }
    // lifts guests can reach from the village / road / parking / railway station without skiing there first
    const w = this.world;
    const isAccess = (l) => {
      const A = l.A;
      if (w.villages.some((v) => Math.hypot(v.x - A.x, v.z - A.z) < v.r + 380)) return true;
      if (w.parking && Math.hypot(w.parking.x - A.x, w.parking.z - A.z) < 320) return true;
      if (w.railStation && Math.hypot(w.railStation.x - A.x, w.railStation.z - A.z) < 380) return true;
      return distToLine(w.road, A.x, A.z) < 220;
    };
    this.access = this.lifts.filter(isAccess);
    this.hikeList = [];
    for (let k = 0; k < P * P; k++) if (this.hikeCells[k]) this.hikeList.push(k);
    // winter: sledge runs (5) and cross-country trails (6)
    const sled = new Uint8Array(P * P); this.xcCells.fill(0); this.xcList = []; this.sledTops = [];
    const sd = this.sdist.fill(-1);
    if (winter) {
      for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
        let sl = 0, xc = 0;
        for (let b = 0; b < f; b += 2) for (let a = 0; a < f; a += 2) { const v = this.tv.piste[(j * f + b) * T + i * f + a]; if (v === 5) sl = 1; else if (v === 6) xc = 1; }
        if (sl) sled[j * P + i] = 1;
        if (xc) { this.xcCells[j * P + i] = 1; this.xcList.push(j * P + i); }
      }
      // bottoms of the sledge runs: cells without a lower sledge neighbour; distance grows uphill
      qh = 0; qt = 0;
      for (let k = 0; k < P * P; k++) {
        if (!sled[k]) continue;
        const i = k % P, j = (k / P) | 0; let low = false;
        for (const [di, dj] of DIRS) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= P || nj >= P) continue; const nk = nj * P + ni; if (sled[nk] && this.h[nk] < this.h[k] - 0.3) { low = true; break; } }
        if (!low) { sd[k] = 0; queue[qt++] = k; }
      }
      while (qh < qt) {
        const k = queue[qh++], i = k % P, j = (k / P) | 0;
        for (const [di, dj] of DIRS) {
          const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= P || nj >= P) continue;
          const nk = nj * P + ni; if (!sled[nk] || sd[nk] >= 0 || this.h[k] > this.h[nk] + 1.0) continue;
          sd[nk] = sd[k] + 1; queue[qt++] = nk;
        }
      }
      let mx = 0; for (let k = 0; k < P * P; k++) if (sd[k] > mx) mx = sd[k];
      if (mx >= 6) for (let k = 0; k < P * P; k++) if (sd[k] >= mx * 0.75) this.sledTops.push(k);
    }
  }

  spawn(forced = null) {
    const winter = this.season === 0;
    let kind = winter ? 'ski' : (this.hikeList && this.hikeList.length && (this.rand() < 0.45 || !this.lifts.length)) ? 'hike' : 'bike';
    if (winter && !forced) {
      const hasAcc = (this.access || []).some((l) => l.open !== false && !l.garaging);
      const sl = this.sledTops && this.sledTops.length, xc = this.xcList && this.xcList.length;
      const r = this.rand();
      if (sl && (r < 0.14 || (!hasAcc && (!xc || r < 0.55)))) kind = 'sled';
      else if (xc && (r > 0.88 || !hasAcc)) kind = 'xc';
    }
    if (kind === 'sled') {
      const k = this.sledTops[Math.floor(this.rand() * this.sledTops.length)];
      const [x, z] = this.cellCenter(k % this.P, (k / this.P) | 0);
      return { kind, x, z, speed: 1, vmax: 6 + this.rand() * 6, ph: this.rand() * 6, freq: 0.08, amp: 0.15, ride: 0, stuck: 0, lastX: x, lastZ: z, yaw: 0, lean: 0, lane: this.rand() * 1.4 - 0.7, latErr: 0, halfW: 3, probeT: 0 };
    }
    if (kind === 'xc') {
      const k = this.xcList[Math.floor(this.rand() * this.xcList.length)];
      const [x, z] = this.cellCenter(k % this.P, (k / this.P) | 0);
      const a = this.rand() * 6.28;
      return { kind, x, z, speed: 3 + this.rand() * 2.5, ph: this.rand() * 6, ride: 0, life: 150 + this.rand() * 250, dx: Math.cos(a), dz: Math.sin(a), yaw: 0, lean: 0, stuck: 0, lastX: x, lastZ: z, skate: this.rand() < 0.5 };
    }
    if (kind === 'hike') {
      const k = this.hikeList[Math.floor(this.rand() * this.hikeList.length)];
      const [x, z] = this.cellCenter(k % this.P, (k / this.P) | 0);
      return { kind, x, z, speed: 1.2 + this.rand() * 0.5, vmax: 1.6, ph: this.rand() * 6, ride: 0, life: 120 + this.rand() * 200, dx: this.rand() - 0.5, dz: this.rand() - 0.5, yaw: 0, lean: 0, stuck: 0, lastX: x, lastZ: z };
    }
    const accOpen = (this.access || []).filter((l) => l.open !== false && !l.garaging);
    const acc = accOpen.length ? accOpen : null;
    if (!acc && !(forced && this.lifts.includes(forced))) return null;
    let l = forced && this.lifts.includes(forced) ? forced : null;
    if (!l) {
      const total = acc.reduce((s2, x) => s2 + x.capacity, 0);
      let r = this.rand() * total; l = acc[0];
      for (const x of acc) { r -= x.capacity; if (r <= 0) { l = x; break; } }
    }
    const side = this.rand() < 0.5 ? 1 : -1;
    const off = l.type.gauge / 2 + 6 + this.rand() * 6;
    const back = 4 + this.rand() * 8;
    const rb = l.rightB || l.right, db = l.dirB || l.dir; const x = l.B.x + rb.x * off * side - db.x * back, z = l.B.z + rb.z * off * side - db.z * back;
    return { kind, board: kind === 'ski' && this.rand() < 0.3, x, z, speed: 2, vmax: kind === 'ski' ? 7 + this.rand() * 9 : 5 + this.rand() * 6, ph: this.rand() * 6, freq: 0.12 + this.rand() * 0.16, amp: 0.45 + this.rand() * 0.45, ride: 0, lift: l, stuck: 0, lastX: x, lastZ: z, yaw: 0, lean: 0, lane: this.rand() * 2 - 1, latErr: 0, halfW: 10, probeT: 0, freerider: this.rand() < 0.15 };
  }

  update(dt) {
    const P = this.P, w = this.world;
    const want = Math.round(this.target * this.factor * ((this.access && this.access.length) || (this.season === 1 && this.hikeList && this.hikeList.length) || (this.season === 0 && ((this.sledTops && this.sledTops.length) || (this.xcList && this.xcList.length))) ? 1 : 0));
    if (this.list.length > want) {
      // remove invisible guests first (riding / gone home); skiers on the slope finish their run
      this.list = this.list.filter((g, i) => !(g.ride > 0 && this.list.length - i > 0 && (g.home || this.list.length > want)) || g.kind === 'hike');
      if (want === 0) this.list = this.list.filter((g) => g.ride <= 0 && !g.home && g.kind !== 'hike' && g.kind !== 'xc' && g.kind !== 'sled');
      if (this.list.length > want * 2 + 60) this.list.length = want * 2 + 60;
    }
    this.spawnAcc += dt * clamp(want / 50, 0.6, 5);
    while (this.list.length < want && this.spawnAcc > 1) {
      this.spawnAcc -= 1;
      const g = this.spawn();
      if (!g) break;
      if (this.list.length > 20 && g.kind !== 'hike' && g.kind !== 'xc') g.ride = this.rand() * (g.kind === 'sled' ? 20 : 60);
      this.list.push(g);
    }
    if (this.spawnAcc > 5) this.spawnAcc = 5;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), nUp = new THREE.Vector3(0, 1, 0);
    const cnt = { ski: 0, bike: 0, hike: 0, sled: 0 };
    const put = (g, mtx) => { const ms = this.meshes[g.kind]; const n = cnt[g.kind]++; ms.j.setMatrixAt(n, mtx); ms.r.setMatrixAt(n, mtx); };
    const sCnt = [0, 0], bCnt = [0, 0], pm = new THREE.Matrix4(), nl = new THREE.Vector3(), qi = new THREE.Quaternion();
    const putSki = (g, base, nW, flex, twist, ang, pl, pr, edge, tuck) => {
      qi.setFromRotationMatrix(base).invert();
      nl.copy(nW).applyQuaternion(qi);
      if (g.board) {
        const mb = this.bpose.compute(nl, flex, twist, ang, edge);
        const vI = (g.vB ??= (this.rand() * this.boardParts.length) | 0), parts = this.boardParts[vI], n = bCnt[vI]++;
        if (n >= Math.ceil(this.max / 2)) return;
        for (const k of SKIER_PARTS) { pm.multiplyMatrices(base, mb[k]); for (const cg in parts[k]) parts[k][cg].setMatrixAt(n, pm); }
        return;
      }
      const mm = this.pose.compute(nl, flex, twist, ang, pl, pr, edge, tuck);
      const vI = (g.vI ??= (this.rand() * this.skiParts.length) | 0), parts = this.skiParts[vI], n = sCnt[vI]++;
      for (const k of SKIER_PARTS) { pm.multiplyMatrices(base, mm[k]); for (const cg in parts[k]) parts[k][cg].setMatrixAt(n, pm); }
    };
    for (let gi = 0; gi < this.list.length; gi++) {
      let g = this.list[gi];
      if (g.ride > 0) {
        g.ride -= dt;
        if (g.ride <= 0) { const ng = this.spawn(g.nextLift); if (ng) { this.list[gi] = ng; } }
        continue;
      }
      let [ci, cj] = this.cellOf(g.x, g.z);
      ci = clamp(ci, 0, P - 1); cj = clamp(cj, 0, P - 1);
      const k = cj * P + ci;
      let dx = 0, dz = 0;
      if (g.kind === 'hike') {
        g.life -= dt;
        if (g.life <= 0) { const ng = this.spawn(); if (ng) this.list[gi] = ng; continue; }
        // follow hiking cells, keep direction, turn when the trail ends
        let best = -1, bs = -1e9;
        for (const [di, dj] of DIRS) {
          const ni = ci + di * 2, nj = cj + dj * 2;
          if (ni < 0 || nj < 0 || ni >= P || nj >= P) continue;
          if (!this.hikeCells[nj * P + ni]) continue;
          const sc = di * g.dx + dj * g.dz + this.rand() * 0.3;
          if (sc > bs) { bs = sc; best = nj * P + ni; }
        }
        if (best >= 0) { const [tx, tz] = this.cellCenter(best % P, (best / P) | 0); dx = tx - g.x; dz = tz - g.z; }
        else { dx = -g.dx; dz = -g.dz; }
        const l = Math.hypot(dx, dz) || 1; g.dx = dx / l; g.dz = dz / l;
        g.x += g.dx * g.speed * dt; g.z += g.dz * g.speed * dt;
        const ty = -Math.atan2(g.dz, g.dx); let dy = ty - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.yaw += dy * Math.min(1, dt * 4);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw);
        v.set(g.x, heightAt(w, g.x, g.z), g.z);
        m.compose(v, q, s); put(g, m);
        continue;
      }
      if (g.kind === 'xc') {
        g.life -= dt;
        if (g.life <= 0) { const ng = this.spawn(); if (ng) this.list[gi] = ng; continue; }
        let best = -1, bs = -1e9;
        for (const [di, dj] of DIRS) {
          const ni = ci + di * 2, nj = cj + dj * 2;
          if (ni < 0 || nj < 0 || ni >= P || nj >= P || !this.xcCells[nj * P + ni]) continue;
          const l0 = Math.hypot(di, dj), sc = (di * g.dx + dj * g.dz) / l0 + this.rand() * 0.15;
          if (sc > bs) { bs = sc; best = nj * P + ni; }
        }
        if (best >= 0) { const [tx, tz] = this.cellCenter(best % P, (best / P) | 0); dx = tx - g.x; dz = tz - g.z; } else { dx = -g.dx; dz = -g.dz; }
        const l = Math.hypot(dx, dz) || 1;
        g.dx += (dx / l - g.dx) * Math.min(1, dt * 2); g.dz += (dz / l - g.dz) * Math.min(1, dt * 2);
        const l2 = Math.hypot(g.dx, g.dz) || 1; g.dx /= l2; g.dz /= l2;
        const nrm = normalAt(w, g.x, g.z), up = -(nrm.x * g.dx + nrm.z * g.dz); // > 0: uphill
        const sp = clamp(g.speed * (1 - up * 2.5), 1.2, 9);
        g.x += g.dx * sp * dt; g.z += g.dz * sp * dt;
        // own lane across the trail (classic tracks left / right, skating in the middle)
        const lo = (g.lane ?? (g.lane = (this.rand() - 0.5) * 4)) - (g.lo || 0); g.lo = (g.lo || 0) + lo * Math.min(1, dt);
        const rx = -g.dz * g.lo, rz = g.dx * g.lo;
        const ty = -Math.atan2(g.dz, g.dx); let dy = ty - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.yaw += dy * Math.min(1, dt * 4);
        g.ph += dt * sp * 0.75;
        const st = Math.sin(g.ph * 2.2);
        e.set(g.skate ? st * 0.12 : 0, g.yaw + (g.skate ? st * 0.25 : 0), 0); q.setFromEuler(e);
        v.set(g.x + rx, heightAt(w, g.x + rx, g.z + rz), g.z + rz); m.compose(v, q, s);
        // diagonal stride / skating: poles push alternately (classic) or together (skating double pole)
        const pa = g.skate ? -0.3 - 0.9 * Math.max(0, Math.sin(g.ph * 2.2)) : -0.35 + st * 0.75, pb = g.skate ? pa : -0.35 - st * 0.75;
        putSki(g, m, nrm, 0.25 + Math.abs(st) * 0.15, st * 0.2, 0, pa, pb, 0, 0.15);
        continue;
      }
      // injured skier: lies in the snow until the rescue arrives
      if (g.injured) {
        e.set(1.45, g.yaw, 0); q.setFromEuler(e);
        v.set(g.x, heightAt(w, g.x, g.z) + 0.25, g.z); m.compose(v, q, s);
        if (g.kind === 'ski') putSki(g, m, nUp, 0.6, 0.4, 0.2, -1.2, 0.4, 0, 0); else put(g, m);
        continue;
      }
      const sledG = g.kind === 'sled', DF = sledG ? this.sdist : this.dist;
      const d0 = DF[k];
      if (d0 === 0 && sledG) { g.ride = 25 + this.rand() * 50; continue; } // bottom: walk / ride back up
      if (d0 === 0) {
        const l = this.lifts[this.goal[k]] || g.lift;
        if (l && l.open === false || (l && l.garaging)) { g.ride = 1e9; g.home = true; continue; } // lift closed: go home
        g.nextLift = l;
        g.ride = (l ? l.rideTime : 200) + 10 + this.rand() * 40;
        continue;
      }
      if (d0 > 0) {
        let ci2 = ci, cj2 = cj;
        for (let step = 0; step < 4; step++) {
          let best = -1, bd = DF[cj2 * P + ci2];
          for (const [di, dj] of DIRS) {
            const ni = ci2 + di, nj = cj2 + dj;
            if (ni < 0 || nj < 0 || ni >= P || nj >= P) continue;
            const dd = DF[nj * P + ni];
            // normal guests avoid freeride runs when they have another way down
            const pen = !g.freerider && this.free[nj * P + ni] && !this.free[cj2 * P + ci2] ? 6 : 0;
            if (dd >= 0 && dd + pen < bd) { bd = dd + pen; best = nj * P + ni; }
          }
          if (best < 0) { // no way without freeride: take it anyway
            for (const [di, dj] of DIRS) { const ni = ci2 + di, nj = cj2 + dj; if (ni < 0 || nj < 0 || ni >= P || nj >= P) continue; const dd = DF[nj * P + ni]; if (dd >= 0 && dd < bd) { bd = dd; best = nj * P + ni; } }
          }
          if (best < 0) break;
          ci2 = best % P; cj2 = (best / P) | 0;
        }
        const [tx, tz] = this.cellCenter(ci2, cj2);
        dx = tx - g.x; dz = tz - g.z;
      } else {
        const nrm = normalAt(w, g.x, g.z);
        dx = nrm.x; dz = nrm.z;
        let found = null, fd = 1e9;
        for (let r = 2; r <= 12 && !found; r += 2) for (const [di, dj] of DIRS) {
          const ni = ci + di * r, nj = cj + dj * r;
          if (ni < 0 || nj < 0 || ni >= P || nj >= P) continue;
          const dd = DF[nj * P + ni];
          if (dd >= 0 && this.h[nj * P + ni] <= this.h[k] + 1 && dd < fd) { fd = dd; found = [ni, nj]; }
        }
        if (found) { const [tx, tz] = this.cellCenter(found[0], found[1]); dx = tx - g.x; dz = tz - g.z; }
      }
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      // every guest keeps its own "lane" across the full piste width (left edge … right edge),
      // measured by probing sideways; the lane wanders slowly so the piste is used everywhere
      const winter = this.season === 0;
      const onNet = (x, z) => { if (!winter) return this.tv.trailAt(x, z) >= 3; const v = this.tv.pisteAt(x, z); if (sledG) return v === 5; return v > 0 && v < 5 && (v !== 4 || g.freerider || this.tv.pisteAt(g.x, g.z) === 4); };
      const px = -dz, pz = dx;
      g.probeT = (g.probeT || 0) - dt;
      if (g.probeT <= 0 && d0 > 0) {
        g.probeT = 0.3 + this.rand() * 0.25;
        let a = 0, b = 0;
        for (let o = 2.5; o <= 100; o += 2.5) { if (!onNet(g.x - px * o, g.z - pz * o)) break; a = o; }
        for (let o = 2.5; o <= 100; o += 2.5) { if (!onNet(g.x + px * o, g.z + pz * o)) break; b = o; }
        const half = (a + b) / 2;
        g.halfW = half;
        g.latErr = (b - a) / 2 + (g.lane ?? 0) * Math.max(0, half - 3);
      }
      g.lane = clamp((g.lane ?? 0) + (this.rand() - 0.5) * dt * 0.35, -1, 1);
      if (this.rand() < dt * 0.02) g.lane = this.rand() * 2 - 1;
      const steer = clamp((g.latErr || 0) / 9, -1.4, 1.4);
      dx += px * steer; dz += pz * steer;
      const L2 = Math.hypot(dx, dz) || 1; dx /= L2; dz /= L2;
      // S-turns around the lane, smaller on narrow pistes; turn back before leaving the piste
      g.ph += dt * g.freq * Math.PI * 2;
      const amp = g.kind === 'ski' ? (g.amp || 0.7) * clamp((g.halfW || 10) / 12, 0.35, 1) : 0.25;
      const base = Math.atan2(dz, dx);
      let ang = base + Math.sin(g.ph) * amp;
      const look = (a) => { const [ai, aj] = this.cellOf(g.x + Math.cos(a) * 7, g.z + Math.sin(a) * 7); return ai >= 0 && aj >= 0 && ai < P && aj < P && DF[aj * P + ai] >= 0; };
      if (d0 > 0 && !look(ang)) { g.ph += Math.PI; ang = base + Math.sin(g.ph) * amp; if (!look(ang)) ang = base; }
      const fx = Math.cos(ang), fz = Math.sin(ang);
      const fl = 1;
      const nrm = normalAt(w, g.x, g.z);
      const grade = Math.sqrt(Math.max(0, 1 - nrm.y * nrm.y)) / nrm.y;
      const targetV = sledG ? clamp(1.5 + grade * 20, 1.5, g.vmax) : clamp(2.5 + grade * 22, 3, g.vmax);
      g.speed += (targetV - g.speed) * Math.min(1, dt * 0.8);
      g.x += (fx / fl) * g.speed * dt; g.z += (fz / fl) * g.speed * dt;
      g.latErr = (g.latErr || 0) - (fx * px + fz * pz) * g.speed * dt;
      g.x = clamp(g.x, -w.S / 2 + 2, w.S / 2 - 2); g.z = clamp(g.z, -w.S / 2 + 2, w.S / 2 - 2);
      const targetYaw = -Math.atan2(fz, fx);
      let dy = targetYaw - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.yaw += dy * Math.min(1, dt * 6);
      // lean into the turn like a real carver: tan(incl) = v * turn rate / g
      const psi = Math.atan2(fz, fx);
      let dpsi = psi - (g.psi ?? psi); dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi)); g.psi = psi;
      const rate = dt > 0 ? dpsi / dt : 0;
      g.rate = (g.rate || 0) + (rate - (g.rate || 0)) * Math.min(1, dt * 5);
      const inclT = g.kind === 'ski' ? clamp(Math.atan(g.speed * g.rate / 9.81), -0.8, 0.8) : clamp(g.speed * g.rate * 0.03, -0.3, 0.3);
      g.lean = (g.lean || 0) + (inclT - (g.lean || 0)) * Math.min(1, dt * 6);
      if (g.kind === 'ski' && Math.sign(g.rate) !== (g.turnSign || 0) && Math.abs(g.rate) > 0.08) { g.turnSign = Math.sign(g.rate); g.plant = 0.45; g.plantSide = g.turnSign; }
      g.plant = Math.max(0, (g.plant || 0) - dt);
      g.stuck += dt;
      if (g.stuck > 6) {
        if (Math.hypot(g.x - g.lastX, g.z - g.lastZ) < 6) { const ng = this.spawn(); if (ng) { this.list[gi] = ng; continue; } }
        g.stuck = 0; g.lastX = g.x; g.lastZ = g.z;
      }
      e.set(g.kind === 'ski' ? g.lean : g.lean, g.yaw, 0);
      q.setFromEuler(e);
      v.set(g.x, heightAt(w, g.x, g.z), g.z);
      m.compose(v, q, s);
      if (g.kind === 'ski') {
        const ai = Math.abs(g.lean), tuck = g.speed > 13 && ai < 0.2 ? clamp((g.speed - 13) / 6, 0, 1) : 0;
        g.tuck = (g.tuck || 0) + (tuck - (g.tuck || 0)) * Math.min(1, dt * 2);
        // upper body faces down the fall line, rolls back against the lean (angulation)
        let tw = Math.atan2(nrm.z, nrm.x) - psi; tw = Math.atan2(Math.sin(tw), Math.cos(tw));
        const twist = -clamp(tw * 0.45, -0.55, 0.55);
        const pp = g.plant > 0 ? Math.sin((1 - g.plant / 0.45) * Math.PI) : 0;
        const pl = -0.75 - g.tuck * 0.7 + (g.plantSide < 0 ? pp * 0.95 : 0), pr = -0.75 - g.tuck * 0.7 + (g.plantSide > 0 ? pp * 0.95 : 0);
        if (g.board) putSki(g, m, nrm, 0.2 + ai * 0.4, twist * 0.5, g.lean * 0.3, 0, 0, g.lean * 0.25, 0);
        else putSki(g, m, nrm, 0.12 + ai * 0.35, twist, g.lean * 0.45, pl, pr, g.lean * 0.15, g.tuck);
      } else put(g, m);
    }
    // how full each lift looks = guests currently riding it
    this.occT = (this.occT || 0) + dt;
    if (this.occT > 1) {
      this.occT = 0;
      const cnt2 = new Map();
      for (const g of this.list) if (g.ride > 0 && g.kind !== 'hike') { const l = g.nextLift || g.lift; if (l) cnt2.set(l, (cnt2.get(l) || 0) + 1); }
      for (const l of this.lifts) {
        const t = l.type, seats = t.kind === 'tbar' ? 2 : t.kind === 'gondola' ? (t.seats || 8) : (t.seats || 1);
        const up = Math.max(1, (l.nCarriers || 20) / 2 * seats);
        const rate = clamp((cnt2.get(l) || 0) / up * 100 * 1.6, 0, 100);
        l.riderRate = l.riderRate == null ? rate : l.riderRate + (rate - l.riderRate) * 0.35;
      }
    }
    this.skiParts.forEach((parts, vI) => { for (const k of SKIER_PARTS) for (const cg in parts[k]) { parts[k][cg].count = sCnt[vI]; parts[k][cg].instanceMatrix.needsUpdate = true; } });
    this.boardParts.forEach((parts, vI) => { for (const k of SKIER_PARTS) for (const cg in parts[k]) { parts[k][cg].count = Math.min(bCnt[vI], Math.ceil(this.max / 2)); parts[k][cg].instanceMatrix.needsUpdate = true; } });
    for (const kind in this.meshes) {
      const ms = this.meshes[kind];
      ms.j.count = ms.r.count = cnt[kind];
      ms.j.instanceMatrix.needsUpdate = true; ms.r.instanceMatrix.needsUpdate = true;
    }
  }

  get count() { return this.list.filter((g) => g.ride <= 0 && !g.home).length; }

  // a random skier on a piste falls and gets hurt (returns the guest or null)
  injureRandom() {
    const c = this.list.filter((g) => g.kind === 'ski' && g.ride <= 0 && !g.injured && this.tv.pisteAt(g.x, g.z));
    if (!c.length) return null;
    const g = c[Math.floor(this.rand() * c.length)];
    g.injured = true; g.speed = 0;
    return g;
  }
  // rescued: the guest leaves the piste (comes back later as a new guest)
  rescued(g) { g.injured = false; g.ride = 120 + this.rand() * 120; }

  dispose() { for (const k in this.meshes) this.scene.remove(this.meshes[k].j, this.meshes[k].r); for (const parts of [...this.skiParts, ...this.boardParts]) for (const k of SKIER_PARTS) for (const cg in parts[k]) { this.scene.remove(parts[k][cg]); parts[k][cg].dispose(); } }
}
