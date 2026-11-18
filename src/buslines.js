// Bus lines built by the player: stops tapped one after the other; between two stops near the main
// road the bus follows the road, otherwise it drives straight (along the painted roads). Buses shuttle
// back and forth (or run in a loop when the first and last stop are the same place) and wait at stops.
import * as THREE from 'three';
import { heightAt, nearestOnLine } from './terrain.js';
import { busMesh } from './props.js';
import { nearestOnPoly } from './roads.js';

export const LINE_COLORS = [0xffcc00, 0xd62020, 0x1d6fd6, 0x1f9a4a, 0xff7a00, 0x8e44ad];
const ROAD_SNAP = 25;

export class BusLines {
  constructor(world, scene, roads = null) {
    this.world = world; this.scene = scene; this.roads = roads;
    this.group = new THREE.Group(); scene.add(this.group);
    this.lines = [];
  }

  // snap a tapped point to the main road or to one of the player's roads if it is close
  snap(x, z, stop = true) {
    const road = this.world.road;
    if (road && road.length > 1) { const r = nearestOnLine(road, x, z); if (r.d < ROAD_SNAP) return { x: r.px, z: r.pz, k: r.k, road: true, stop }; }
    if (this.roads) {
      let best = null;
      this.roads.roads.forEach((rd, i) => { const q = nearestOnPoly(rd.pts, x, z); if (q.d < 20 && (!best || q.d < best.q.d)) best = { q, i }; });
      if (best) return { x: best.q.px, z: best.q.pz, ri: best.i, s: best.q.s, road: false, stop };
    }
    return { x, z, road: false, stop };
  }

  pathBetween(a, b) {
    const road = this.world.road, pts = [];
    if (a.road && b.road && road) {
      pts.push({ x: a.x, z: a.z });
      if (a.k < b.k) for (let k = a.k + 1; k <= b.k; k++) pts.push({ x: road[k].x, z: road[k].z });
      else for (let k = a.k; k > b.k; k--) pts.push({ x: road[k].x, z: road[k].z });
      pts.push({ x: b.x, z: b.z });
      return pts;
    }
    if (a.ri != null && a.ri === b.ri && this.roads && this.roads.roads[a.ri]) return this.roads.slice(this.roads.roads[a.ri], a.s, b.s);
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 6));
    for (let i = 0; i <= n; i++) pts.push({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n });
    return pts;
  }

  add(stops, nBus = 1, color = null) {
    const line = { stops: stops.map((s) => this.snap(s.x, s.z, s.stop !== false && !s.w)), nBus, color: color ?? LINE_COLORS[this.lines.length % LINE_COLORS.length] };
    this.build(line);
    this.lines.push(line);
    return line;
  }

  build(line) {
    if (line.group) { this.group.remove(line.group); line.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const g = new THREE.Group(); line.group = g; this.group.add(g);
    const st = line.stops;
    line.loop = st.length > 2 && Math.hypot(st[0].x - st[st.length - 1].x, st[0].z - st[st.length - 1].z) < 30;
    // path with cumulative distance; s of each stop
    const path = [], stopS = [];
    for (let i = 0; i < st.length - 1; i++) {
      const seg = this.pathBetween(st[i], st[i + 1]);
      if (i > 0) seg.shift();
      for (const p of seg) path.push(p);
    }
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    for (const s of st) { if (!s.stop) continue; let best = 0, bd = Infinity; path.forEach((p, i) => { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = i; } }); stopS.push(cum[best]); }
    line.path = path; line.cum = cum; line.len = cum[cum.length - 1]; line.stopS = stopS;
    // route line on the ground (coloured) and stops (shelter + sign)
    const w = this.world, mat = new THREE.LineBasicMaterial({ color: line.color });
    const lp = path.map((p) => new THREE.Vector3(p.x, heightAt(w, p.x, p.z) + 0.6, p.z));
    const routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(lp), mat); routeLine.visible = !!this.showRoutes; g.add(routeLine); line.routeLine = routeLine;
    st.forEach((s, i) => {
      if ((line.loop && i === st.length - 1) || !s.stop) return;
      const k = Math.min(path.length - 2, Math.max(0, path.findIndex((p) => Math.hypot(p.x - s.x, p.z - s.z) < 0.5)));
      const a = path[Math.max(0, k)], b = path[Math.min(path.length - 1, k + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const ox = -dz * 6, oz = dx * 6, x = s.x + ox, z = s.z + oz, y = heightAt(w, x, z), yaw = -Math.atan2(dz, dx);
      const shelter = new THREE.Group();
      const add = (geo, m, px, py, pz) => { const me = new THREE.Mesh(geo, m); me.position.set(px, py, pz); me.castShadow = true; shelter.add(me); };
      const steel = new THREE.MeshLambertMaterial({ color: 0x5d636a }), glass = new THREE.MeshLambertMaterial({ color: 0x9fb7c8, transparent: true, opacity: 0.55 });
      add(new THREE.BoxGeometry(3.4, 0.12, 1.6), steel, 0, 2.4, 0);
      add(new THREE.BoxGeometry(3.2, 1.9, 0.05), glass, 0, 1.3, -0.7);
      for (const sx of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.08, 2.4, 0.08), steel, sx, 1.2, -0.7);
      add(new THREE.BoxGeometry(2.6, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a5a33 }), 0, 0.5, -0.4);
      add(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), steel, 2.1, 1.4, 0.3);
      add(new THREE.BoxGeometry(0.06, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: line.color }), 2.1, 2.7, 0.3);
      add(new THREE.BoxGeometry(0.07, 0.25, 0.4), new THREE.MeshLambertMaterial({ color: 0x1f5a2a }), 2.1, 2.3, 0.3);
      shelter.position.set(x, y, z); shelter.rotation.y = yaw + Math.PI;
      g.add(shelter);
    });
    // buses spread along the line
    line.buses = [];
    for (let i = 0; i < line.nBus; i++) {
      const m = busMesh(line.color); g.add(m);
      line.buses.push({ m, s: line.len * i / Math.max(1, line.nBus), dir: i % 2 ? -1 : 1, wait: 0, lastStop: -1 });
    }
  }

  remove(line) { const i = this.lines.indexOf(line); if (i < 0) return; this.lines.splice(i, 1); this.group.remove(line.group); line.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  setBuses(line, n) { line.nBus = Math.max(1, Math.min(6, n)); this.build(line); }
  setShowRoutes(v) { this.showRoutes = v; for (const l of this.lines) if (l.routeLine) l.routeLine.visible = v; }

  posAt(line, s, out) {
    const { path, cum } = line;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = path[lo], b = path[Math.min(path.length - 1, lo + 1)], L = (cum[lo + 1] ?? cum[lo]) - cum[lo] || 1, u = Math.min(1, Math.max(0, (s - cum[lo]) / L));
    out.x = a.x + (b.x - a.x) * u; out.z = a.z + (b.z - a.z) * u; out.dx = (b.x - a.x) / L; out.dz = (b.z - a.z) / L;
    return out;
  }

  update(dt, night) {
    const w = this.world, p = { x: 0, z: 0, dx: 1, dz: 0 };
    for (const line of this.lines) {
      if (line.len < 5) continue;
      for (const b of line.buses) {
        if (b.wait > 0) b.wait -= dt;
        else {
          const ns = b.s + b.dir * 11 * dt;
          // stop at the next stop it passes
          let hit = -1;
          line.stopS.forEach((ss, i) => { if (i !== b.lastStop && (b.s - ss) * (ns - ss) <= 0) hit = i; });
          if (hit >= 0) { b.s = line.stopS[hit]; b.wait = 7; b.lastStop = hit; }
          else b.s = ns;
          if (b.s >= line.len) { if (line.loop) { b.s -= line.len; b.lastStop = -1; } else { b.s = line.len; b.dir = -1; } }
          if (b.s <= 0) { if (line.loop && b.dir < 0) b.s += line.len; else { b.s = 0; b.dir = 1; } }
        }
        this.posAt(line, b.s, p);
        const fx = p.dx * b.dir, fz = p.dz * b.dir, side = 2.2; // drive on the right
        const x = p.x - fz * side, z = p.z + fx * side;
        b.m.position.set(x, heightAt(w, x, z), z);
        b.m.rotation.y = -Math.atan2(fz, fx);
        if (b.m.userData.head) b.m.userData.head.emissive.setHex(night ? 0xfff2cc : 0x000000);
      }
    }
  }

  serialize() { return this.lines.map((l) => ({ s: l.stops.map((q) => ({ x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10, ...(q.stop ? {} : { w: 1 }) })), n: l.nBus, c: l.color })); }
  // after the player's roads changed: re-snap and rebuild all lines
  rebuildAll() { for (const l of this.lines) { l.stops = l.stops.map((q) => this.snap(q.x, q.z, q.stop)); this.build(l); } }
  load(arr) { for (const l of arr || []) if (l.s && l.s.length >= 2) this.add(l.s, l.n || 1, l.c); }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
