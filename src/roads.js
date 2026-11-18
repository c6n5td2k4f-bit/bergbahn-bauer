// Player roads: a chain of waypoints along a (painted) road. Cars drive on them from waypoint to
// waypoint, back and forth (or round and round when the road is a loop). Bus lines use them too.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { carMesh } from './props.js';

const CAR_COLS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x2980b9, 0x7f8c8d, 0x27ae60, 0xf1c40f, 0x111111, 0x8e44ad, 0xe67e22];

// nearest point on a polyline: { d, k (segment), t, px, pz, s (distance along) }
export function nearestOnPoly(pts, x, z) {
  let best = { d: Infinity, k: 0, t: 0, px: 0, pz: 0, s: 0 }, acc = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, k, t, px, pz, s: acc + L * t };
    acc += L;
  }
  return best;
}

export class RoadRoutes {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.roads = [];
    this.show = false;
  }

  add(pts, nCars = 3) {
    const r = { pts: pts.map((p) => ({ x: p.x, z: p.z })), nCars };
    this.build(r); this.roads.push(r);
    return r;
  }

  build(r) {
    if (r.group) { this.group.remove(r.group); r.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const g = new THREE.Group(); r.group = g; this.group.add(g);
    const P = r.pts, cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
    r.cum = cum; r.len = cum[cum.length - 1];
    r.loop = P.length > 2 && Math.hypot(P[0].x - P[P.length - 1].x, P[0].z - P[P.length - 1].z) < 25;
    // route line and waypoint posts (only visible while the road tool is open)
    const w = this.world;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(P.map((p) => new THREE.Vector3(p.x, heightAt(w, p.x, p.z) + 0.8, p.z))), new THREE.LineBasicMaterial({ color: 0xff8c1a }));
    const posts = new THREE.Group();
    for (const p of P) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6), new THREE.MeshBasicMaterial({ color: 0xff8c1a })); m.position.set(p.x, heightAt(w, p.x, p.z) + 1.5, p.z); posts.add(m); }
    r.helpers = [line, posts]; line.visible = posts.visible = this.show;
    g.add(line, posts);
    r.cars = [];
    for (let i = 0; i < r.nCars; i++) {
      const m = carMesh(CAR_COLS[(i * 3 + this.roads.length) % CAR_COLS.length]); g.add(m);
      r.cars.push({ m, s: r.len * (i + 0.5) / Math.max(1, r.nCars), dir: i % 2 ? -1 : 1, v: 11 + (i % 3) * 2, wait: 0 });
    }
  }

  remove(r) { const i = this.roads.indexOf(r); if (i < 0) return; this.roads.splice(i, 1); this.group.remove(r.group); r.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  setCars(r, n) { r.nCars = Math.max(0, Math.min(12, n)); this.build(r); }
  setShow(v) { this.show = v; for (const r of this.roads) for (const h of r.helpers) h.visible = v; }

  posAt(r, s, out) {
    const P = r.pts, cum = r.cum;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = P[lo], b = P[Math.min(P.length - 1, lo + 1)], L = (cum[lo + 1] ?? cum[lo]) - cum[lo] || 1, u = Math.max(0, Math.min(1, (s - cum[lo]) / L));
    out.x = a.x + (b.x - a.x) * u; out.z = a.z + (b.z - a.z) * u; out.dx = (b.x - a.x) / L; out.dz = (b.z - a.z) / L;
    return out;
  }
  // the part of a road between two distances along it (for bus paths)
  slice(r, s0, s1) {
    const out = [], o = { x: 0, z: 0 }, n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 6));
    for (let i = 0; i <= n; i++) { this.posAt(r, s0 + (s1 - s0) * i / n, o); out.push({ x: o.x, z: o.z }); }
    return out;
  }

  update(dt, night) {
    const w = this.world, p = { x: 0, z: 0, dx: 1, dz: 0 };
    for (const r of this.roads) {
      if (r.len < 10) continue;
      for (const c of r.cars) {
        // keep distance to the car ahead in the same direction
        let v = c.v;
        for (const o of r.cars) { if (o === c || o.dir !== c.dir) continue; const d = (o.s - c.s) * c.dir; if (d > 0 && d < 14) v = Math.min(v, Math.max(0, (d - 7) * 1.5)); }
        if (c.wait > 0) { c.wait -= dt; v = 0; }
        c.s += c.dir * v * dt;
        if (c.s >= r.len) { if (r.loop) c.s -= r.len; else { c.s = r.len; c.dir = -1; c.wait = 2 + Math.random() * 6; } }
        if (c.s <= 0) { if (r.loop && c.dir < 0) c.s += r.len; else { c.s = 0; c.dir = 1; c.wait = 2 + Math.random() * 6; } }
        this.posAt(r, c.s, p);
        const fx = p.dx * c.dir, fz = p.dz * c.dir, x = p.x - fz * 1.9, z = p.z + fx * 1.9;
        c.m.position.set(x, heightAt(w, x, z), z);
        c.m.rotation.y = -Math.atan2(fz, fx);
        if (c.m.userData.head) c.m.userData.head.emissive.setHex(night ? 0xfff2cc : 0x000000);
      }
    }
  }

  serialize() { return this.roads.map((r) => ({ p: r.pts.map((q) => ({ x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10 })), n: r.nCars })); }
  load(arr) { for (const r of arr || []) if (r.p && r.p.length >= 2) this.add(r.p, r.n ?? 3); }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
