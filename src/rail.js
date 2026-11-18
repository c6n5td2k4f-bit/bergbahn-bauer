// Railway: track along the valley (map edge -> tunnel), catenary, level crossings, village station
// and a regional train that stops at the station and shuttles back and forth.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rbox } from './shapes.js';
import { heightAt } from './terrain.js';
import { clamp, lerp } from './noise.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const M = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const geo = (g, m) => { const c = g.index ? g.toNonIndexed() : g.clone(); if (c.attributes.uv) c.deleteAttribute('uv'); if (m) c.applyMatrix4(m); return c; };

function signTex(text, bg = '#1b3a6b') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#fff'; x.font = 'bold 54px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Railway {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.ok = world.rail && world.rail.length > 10;
    this.crossings = [];
    this.cars = [];
    if (!this.ok) return;
    const R = world.rail;
    this.cum = [0];
    for (let k = 1; k < R.length; k++) this.cum.push(this.cum[k - 1] + Math.hypot(R[k].x - R[k - 1].x, R[k].z - R[k - 1].z));
    this.len = this.cum[this.cum.length - 1];
    this.buildTrack();
    this.buildCrossings();
    if (world.railStation) this.buildStation();
    if (world.railTunnel) this.buildPortal(world.railTunnel);
    if (world.railTunnel0) this.buildPortal(world.railTunnel0);
    this.buildTrain();
    // schedule
    this.dir = 1; this.s = -60; this.state = 'run'; this.wait = 0; this.v = 22; this.stopDone = false;
    this.stS = world.railStation ? this.cum[world.railStation.k] + 10 : -1;
  }

  // position on the track at arc length s (clamped), lateral offset off
  at(s, off = 0) {
    const R = this.world.rail, cum = this.cum;
    s = clamp(s, 0, this.len - 0.001);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = R[lo], b = R[lo + 1], t = (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    const rx = -dz / L, rz = dx / L;
    return { x: lerp(a.x, b.x, t) + rx * off, z: lerp(a.z, b.z, t) + rz * off, y: lerp(a.h, b.h, t), dx: dx / L, dz: dz / L, rx, rz };
  }

  buildTrack() {
    const ballast = [], rails = [], posts = [];
    const step = 5;
    const n = Math.floor(this.len / step);
    // ballast bed: trapezoid ribbon
    const pos = [];
    const prof = [[-2.4, -0.25], [-1.5, 0.28], [1.5, 0.28], [2.4, -0.25]];
    for (let i = 0; i <= n; i++) {
      const p = this.at(i * step);
      for (const [o, h] of prof) pos.push(p.x + p.rx * o, p.y + h, p.z + p.rz * o);
    }
    const idx = [];
    for (let i = 0; i < n; i++) for (let q = 0; q < 3; q++) { const a = i * 4 + q, b = a + 1, c = a + 4, d = a + 5; idx.push(a, b, c, b, d, c); }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
    ballast.push(bg.toNonIndexed());
    // rails per 5 m segment
    for (let i = 0; i < n; i++) {
      const a = this.at(i * step), b = this.at((i + 1) * step);
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x), len = Math.hypot(b.x - a.x, b.z - a.z), pitch = Math.atan2(b.y - a.y, len);
      for (const o of [-0.72, 0.72]) {
        const x = (a.x + b.x) / 2 + a.rx * o, z = (a.z + b.z) / 2 + a.rz * o;
        rails.push(geo(new THREE.BoxGeometry(len + 0.05, 0.16, 0.09), M(x, (a.y + b.y) / 2 + 0.42, z, yaw, 1, 1, 1, pitch)));
      }
      // catenary masts every 50 m on the road side
      if (i % 10 === 0) {
        const mx = a.x + a.rx * 3.3, mz = a.z + a.rz * 3.3, g = heightAt(this.world, mx, mz);
        posts.push(geo(new THREE.CylinderGeometry(0.13, 0.17, 1, 8), M(mx, (g + a.y + 6.8) / 2, mz, 0, 1, a.y + 6.8 - g, 1)));
        posts.push(geo(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6).rotateZ(Math.PI / 2), M(a.x + a.rx * 1.6, a.y + 6.4, a.z + a.rz * 1.6, -Math.atan2(a.rz, a.rx))));
      }
    }
    const bm = new THREE.Mesh(mergeGeometries(ballast), lam(0x6f675e)); bm.receiveShadow = true;
    const rm = new THREE.Mesh(mergeGeometries(rails), lam(0x8a8d90));
    const pm = new THREE.Mesh(mergeGeometries(posts), lam(0x7d8186));
    this.group.add(bm, rm, pm);
    this.ballastMat = bm.material;
    // sleepers (instanced)
    const ns = Math.floor(this.len / 0.75);
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.14, 2.5), lam(0x5a5550), ns);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < ns; i++) { const p = this.at(i * 0.75); m4.compose(new THREE.Vector3(p.x, p.y + 0.33, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(p.dz, p.dx), 0)), new THREE.Vector3(1, 1, 1)); sl.setMatrixAt(i, m4); }
    sl.instanceMatrix.needsUpdate = true;
    this.group.add(sl);
    // contact wire
    const wpts = [];
    for (let s = 0; s <= this.len; s += 10) { const p = this.at(s); wpts.push(new THREE.Vector3(p.x, p.y + 6.15 - 0.15 * Math.sin((s % 50) / 50 * Math.PI), p.z)); }
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wpts), new THREE.LineBasicMaterial({ color: 0x333333 })));
  }

  // where village streets cross the track: planks + barriers that close when the train comes
  buildCrossings() {
    const w = this.world, R = w.rail;
    for (const st of w.streets) {
      for (let k = 0; k < R.length - 1; k++) {
        const a = R[k], b = R[k + 1];
        const d1x = b.x - a.x, d1z = b.z - a.z, d2x = st.b.x - st.a.x, d2z = st.b.z - st.a.z;
        const den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-6) continue;
        const t = ((st.a.x - a.x) * d2z - (st.a.z - a.z) * d2x) / den, u = ((st.a.x - a.x) * d1z - (st.a.z - a.z) * d1x) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const s = this.cum[k] + t * Math.hypot(d1x, d1z);
        if (this.crossings.some((c) => Math.abs(c.s - s) < 12)) continue;
        const p = this.at(s), yaw = -Math.atan2(p.dz, p.dx);
        const g = new THREE.Group();
        g.add(new THREE.Mesh(rbox(st.w + 1.5, 0.12, 3.4, 0.04, 1), lam(0x4b4744)));
        g.children[0].position.y = 0.46; g.children[0].rotation.y = 0;
        const arms = [];
        for (const sd of [-1, 1]) {
          const px = sd * (st.w / 2 + 1.2), pz = sd * 3.6;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 8), lam(0xdddddd)); post.position.set(px, 0.9, pz); g.add(post);
          const light = new THREE.Mesh(rbox(0.35, 0.35, 0.2, 0.08), lam(0x330000, { emissive: 0x000000 })); light.position.set(px, 1.7, pz); g.add(light);
          const pivot = new THREE.Group(); pivot.position.set(px, 1.25, pz);
          const arm = new THREE.Mesh(rbox(st.w + 1.6, 0.14, 0.14, 0.05, 1), lam(0xffffff)); arm.position.x = -sd * (st.w + 1.6) / 2;
          for (let q = 0; q < 3; q++) { const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.16), lam(0xd62020)); red.position.x = -sd * (0.5 + q * 1.4); pivot.add(red); }
          pivot.add(arm); g.add(pivot); arms.push({ pivot, sd, light });
        }
        g.position.set(p.x, p.y - 0.05, p.z); g.rotation.y = yaw;
        // arms rotate around the local axis along the track -> use z rotation of pivot
        this.group.add(g);
        this.crossings.push({ s, arms, down: 0 });
      }
    }
  }

  buildStation() {
    const st = this.world.railStation;
    const s0 = this.cum[st.k];
    const parts = { plat: [], house: [], roof: [], glass: [], steel: [], wood: [] };
    // platform on the village side (-right), 120 m long
    const PL = 120;
    for (let s = s0 - PL / 2; s < s0 + PL / 2; s += 10) {
      const a = this.at(s, -4.6), b = this.at(s + 10, -4.6);
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      const g = heightAt(this.world, (a.x + b.x) / 2, (a.z + b.z) / 2);
      const top = (a.y + b.y) / 2 + 0.95;
      const hgt = Math.max(1.2, top - g + 1);
      parts.plat.push(geo(rbox(10.05, hgt, 4.6, 0.12), M((a.x + b.x) / 2, top - hgt / 2, (a.z + b.z) / 2, yaw)));
      parts.steel.push(geo(new THREE.BoxGeometry(10.05, 0.03, 0.3), M((a.x + b.x) / 2 + a.rx * 1.9, top + 0.02, (a.z + b.z) / 2 + a.rz * 1.9, yaw)));
    }
    // canopy over the middle 50 m
    for (let s = s0 - 25; s <= s0 + 25; s += 12.5) {
      const p = this.at(s, -5.2), top = p.y + 0.95;
      parts.steel.push(geo(new THREE.CylinderGeometry(0.14, 0.14, 3.6, 10), M(p.x, top + 1.8, p.z)));
    }
    {
      const p = this.at(s0, -5.0), yaw = -Math.atan2(p.dz, p.dx);
      parts.roof.push(geo(rbox(54, 0.3, 4.2, 0.12), M(p.x, p.y + 0.95 + 3.7, p.z, yaw)));
      // benches
      for (const o of [-14, 0, 14]) { const q = this.at(s0 + o, -6.2); parts.wood.push(geo(rbox(2.2, 0.45, 0.6, 0.1), M(q.x, q.y + 0.95 + 0.25, q.z, yaw))); }
      // station building behind the platform
      const b = this.at(s0 + 8, -12.5), g = heightAt(this.world, b.x, b.z);
      const base = Math.min(g, p.y + 0.95);
      const H = 4.2 + (p.y + 0.95 - base);
      parts.house.push(geo(rbox(18, H + 3.6, 8, 0.35), M(b.x, base + (H + 3.6) / 2 - 0.5, b.z, yaw)));
      parts.glass.push(geo(rbox(18.08, 1.5, 8.08, 0.36), M(b.x, p.y + 0.95 + 2.0, b.z, yaw)));
      parts.glass.push(geo(rbox(18.08, 1.2, 8.08, 0.36), M(b.x, p.y + 0.95 + 5.2, b.z, yaw)));
      const roofSh = new THREE.Shape(); roofSh.moveTo(-5.2, 0); roofSh.lineTo(5.2, 0); roofSh.lineTo(0, 2.6); roofSh.lineTo(-5.2, 0);
      const rg = new THREE.ExtrudeGeometry(roofSh, { depth: 20, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 }).translate(0, 0, -10);
      parts.roof.push(geo(rg, M(b.x, base + H + 3.1 - 0.5, b.z, yaw + Math.PI / 2)));
      this.roofSnow = new THREE.Mesh(geo(new THREE.ExtrudeGeometry((() => { const q = new THREE.Shape(); q.moveTo(-5.0, 0.12); q.lineTo(5.0, 0.12); q.lineTo(0, 2.72); q.lineTo(-5.0, 0.12); return q; })(), { depth: 19.6, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 }).translate(0, 0.12, -9.8), M(b.x, base + H + 3.1 - 0.5, b.z, yaw + Math.PI / 2)), lam(0xf4f7fb));
      this.group.add(this.roofSnow);
      // sign + clock
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshLambertMaterial({ map: signTex('🚉 Bahnhof'), side: THREE.DoubleSide }));
      const q = this.at(s0 - 4, -7.0); sign.position.set(q.x, q.y + 0.95 + 4.4, q.z); sign.rotation.y = yaw; this.group.add(sign);
      const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateX(Math.PI / 2), lam(0xffffff));
      const q2 = this.at(s0 + 6, -4.5); clock.position.set(q2.x, q2.y + 0.95 + 3.2, q2.z); clock.rotation.y = yaw; this.group.add(clock);
    }
    const mats = { plat: lam(0xb4b0a8), house: lam(0xe9e1cf), roof: lam(0x8a2f24), glass: lam(0x6d93ad), steel: lam(0x6a6e73), wood: lam(0x7a5536) };
    for (const k in parts) if (parts[k].length) { const m = new THREE.Mesh(mergeGeometries(parts[k]), mats[k]); m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  buildPortal(t) {
    const shape = new THREE.Shape();
    shape.moveTo(-6.5, -1); shape.lineTo(6.5, -1); shape.lineTo(6.5, 10); shape.lineTo(-6.5, 10); shape.lineTo(-6.5, -1);
    const hole = new THREE.Path();
    hole.moveTo(-3.6, -1); hole.lineTo(3.6, -1); hole.lineTo(3.6, 4.4); hole.absarc(0, 4.4, 3.6, 0, Math.PI, false); hole.lineTo(-3.6, -1);
    shape.holes.push(hole);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 14, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2 }), lam(0x9a9a98)));
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(8, 9), new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide }));
    inner.position.set(0, 3.5, 5); g.add(inner);
    g.position.set(t.x, t.h - 0.2, t.z); g.rotation.y = Math.PI / 2 - t.dir;
    this.group.add(g);
  }

  // several train types (regional, InterCity, panorama, freight); each car is a group, built once
  buildTrain() {
    const L = (c, o = {}) => lam(c, o);
    const red = L(0xc8102e), white = L(0xf2f2f2), dark = L(0x1b2733), grey = L(0x55595e), black = L(0x161616), glass = L(0x2c3e50);
    const mk = (len, fn) => {
      const g = new THREE.Group();
      const add = (geom, m, x, y, z, rz = 0) => { const me = new THREE.Mesh(geom, m); me.position.set(x, y, z); me.rotation.z = rz; me.castShadow = true; g.add(me); return me; };
      // bogies
      for (const bx of [-len * 0.34, len * 0.34]) { add(rbox(2.6, 0.7, 2.2, 0.15), black, bx, 0.55, 0); for (const sz of [-0.72, 0.72]) for (const wx of [-0.7, 0.7]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 12).rotateX(Math.PI / 2), grey, bx + wx, 0.42, sz); }
      fn(add, len);
      g.visible = false; g.userData.len = len;
      this.group.add(g);
      return g;
    };
    const loco = (body, stripe, len = 18.5) => mk(len, (add) => {
      add(rbox(len, 3.6, 2.9, 0.45, 2), body, 0, 0.75 + 1.8, 0);
      add(rbox(len + 0.02, 0.35, 2.95, 0.12, 1), stripe, 0, 0.95, 0);
      add(rbox(len - 4, 0.6, 2.94, 0.2, 1), dark, 0, 3.0, 0);
      for (const sx of [-1, 1]) { add(rbox(0.3, 1.1, 2.4, 0.2), dark, sx * (len / 2 - 0.05), 3.25, 0); for (const z of [-0.9, 0.9]) add(rbox(0.2, 0.25, 0.4, 0.08), L(0xffffee, { emissive: 0x333322 }), sx * (len / 2 + 0.05), 1.45, z); }
      add(rbox(3.2, 0.5, 1.6, 0.2), grey, 0, 4.6, 0);
      add(new THREE.BoxGeometry(2.4, 0.08, 0.08), grey, -0.4, 5.3, 0, 0.5);
      add(new THREE.BoxGeometry(2.0, 0.08, 0.08), grey, 0.2, 5.7, 0, -0.4);
      add(new THREE.BoxGeometry(0.3, 0.06, 1.8), grey, 0.95, 6.05, 0);
    });
    const coachDD = (len = 25) => mk(len, (add) => {
      add(rbox(len, 4.3, 2.9, 0.45, 2), white, 0, 0.75 + 2.15, 0);
      add(rbox(len - 1.2, 0.9, 2.94, 0.3, 1), dark, 0, 0.75 + 4.3 * 0.62, 0);
      add(rbox(len - 1.2, 0.8, 2.94, 0.3, 1), dark, 0, 0.75 + 4.3 * 0.25, 0);
      add(rbox(len + 0.02, 0.35, 2.95, 0.12, 1), red, 0, 0.95, 0);
      add(rbox(len + 0.02, 0.18, 2.95, 0.08, 1), red, 0, 0.75 + 3.9, 0);
    });
    const coachIC = (len = 26) => mk(len, (add) => {
      add(rbox(len, 3.4, 2.9, 0.5, 2), white, 0, 0.75 + 1.7, 0);
      add(rbox(len - 1.4, 0.95, 2.94, 0.3, 1), dark, 0, 2.6, 0);
      add(rbox(len + 0.02, 0.22, 2.95, 0.08, 1), red, 0, 1.55, 0);
      add(rbox(len + 0.02, 0.5, 2.95, 0.15, 1), L(0x6f7378), 0, 1.0, 0);
    });
    const panorama = (len = 18) => mk(len, (add) => {
      add(rbox(len, 1.7, 2.8, 0.35, 2), red, 0, 0.75 + 0.85, 0);
      add(rbox(len - 0.4, 1.9, 2.82, 0.9, 3), glass, 0, 0.75 + 1.7 + 0.8, 0);
      add(rbox(len - 0.5, 0.3, 2.0, 0.12, 1), red, 0, 0.75 + 3.55, 0);
      add(rbox(len + 0.02, 0.18, 2.85, 0.06, 1), L(0xd4af37), 0, 0.75 + 1.65, 0);
    });
    const flat = (len, payload) => mk(len, (add) => {
      add(rbox(len, 0.5, 2.8, 0.1, 1), L(0x3b3f44), 0, 1.25, 0);
      payload(add, len);
    });
    const tank = (len = 14) => flat(len, (add) => { add(new THREE.CapsuleGeometry(1.35, len - 3.4, 4, 14).rotateZ(Math.PI / 2), L(0xd9dcdf), 0, 2.95, 0); add(rbox(len - 2, 0.25, 0.1, 0.04, 1), L(0xe86a10), 0, 2.95, 1.37); });
    const cont = (len = 16, c = 0x1d6fb8) => flat(len, (add) => { add(rbox(len - 1.2, 2.6, 2.5, 0.12, 1), L(c), 0, 2.8, 0); for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(0.08, 2.4, 2.52), L(c * 0 + 0x222222, {}), k * (len - 1.2) / 7, 2.8, 0); });
    const timber = (len = 15) => flat(len, (add) => { for (let r = 0; r < 3; r++) for (let q = 0; q < 4 - r; q++) add(new THREE.CylinderGeometry(0.32, 0.32, len - 1.5, 8).rotateZ(Math.PI / 2), L(0x8a6239), 0, 1.85 + r * 0.55, -0.85 + q * 0.58 + r * 0.29); for (const x of [-len / 2 + 0.8, len / 2 - 0.8]) for (const z of [-1.3, 1.3]) add(new THREE.BoxGeometry(0.15, 2.0, 0.15), L(0x333333), x, 2.3, z); });
    const freightLoco = mk(16.5, (add, len) => {
      add(rbox(len, 3.6, 2.9, 0.35, 2), L(0x1d4f91), 0, 2.55, 0);
      add(rbox(len + 0.02, 0.6, 2.95, 0.15, 1), L(0xffc20e), 0, 1.15, 0);
      for (const sx of [-1, 1]) add(rbox(0.3, 1.0, 2.4, 0.2), dark, sx * (len / 2 - 0.05), 3.3, 0);
      add(new THREE.BoxGeometry(2.4, 0.08, 0.08), grey, -0.4, 5.1, 0, 0.5); add(new THREE.BoxGeometry(0.3, 0.06, 1.8), grey, 0.4, 5.75, 0);
    });
    const p1 = [loco(red, white), coachDD(), coachDD(), coachDD(), coachDD()];
    const p2 = [loco(red, white), ...Array.from({ length: 7 }, () => coachIC()), loco(red, white)];
    const p3 = [loco(red, L(0xd4af37)), panorama(), panorama(), panorama(), panorama()];
    const fr = [freightLoco, tank(), tank(), cont(16, 0x1d6fb8), cont(16, 0xb83a1d), timber(), timber(), cont(16, 0x2b8a3e), tank(), cont(16, 0xe0a100), timber()];
    this.types = [
      { name: 'Regio', cars: p1, vmax: 22, stop: 25 },
      { name: 'InterCity', cars: p2, vmax: 30, stop: 15 },
      { name: 'Panoramazug', cars: p3, vmax: 18, stop: 30 },
      { name: 'Güterzug', cars: fr, vmax: 20, stop: 0 },
    ];
    this.gap = 0.9;
    this.useType(0);
  }

  useType(i) {
    for (const t of this.types) for (const c of t.cars) c.visible = false;
    this.train = this.types[i];
    this.cars = this.train.cars;
    this.trainLen = this.cars.reduce((a, c) => a + c.userData.len, 0) + (this.cars.length - 1) * this.gap;
  }

  setSeason(s) {
    if (this.roofSnow) this.roofSnow.visible = s === 0;
  }

  update(dt) {
    if (!this.ok) return;
    const vmax = this.train.vmax, acc = 0.9;
    if (this.state === 'wait') {
      this.wait -= dt;
      if (this.wait <= 0) this.state = 'run';
    } else {
      // brake for the station stop
      let target = vmax;
      const front = this.s;
      if (this.stS > 0 && !this.stopDone && this.train.stop > 0) {
        const stopAt = this.stS + this.dir * this.trainLen / 2;
        const dist = (stopAt - front) * this.dir;
        if (dist > 0) target = Math.min(vmax, Math.sqrt(2 * acc * dist) + 0.3);
        if (dist <= 0.3) { this.v = 0; this.state = 'wait'; this.wait = this.train.stop; this.stopDone = true; target = 0; }
      }
      if (this.state === 'run') {
        this.v += clamp(target - this.v, -acc * 1.6 * dt, acc * dt);
        this.s += this.v * this.dir * dt;
      }
      // left the map / disappeared in the tunnel: turn around after a pause
      const out = this.dir > 0 ? this.s - this.trainLen > this.len + 20 : this.s + this.trainLen < -20;
      if (out) {
        // next train: random type and direction after a pause
        this.useType(Math.floor(Math.random() * this.types.length));
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.state = 'wait'; this.wait = 15 + Math.random() * 50; this.v = this.train.vmax * 0.8; this.stopDone = false;
        this.s = this.dir > 0 ? -10 : this.len + 10;
      }
    }
    // place the cars: car i behind the front
    let back = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i], cl = c.userData.len;
      const mid = this.s - this.dir * (back + cl / 2);
      back += cl + this.gap;
      if (mid < 4 || mid > this.len - 6) { c.visible = false; continue; }
      const a = this.at(mid - cl * 0.33), b = this.at(mid + cl * 0.33);
      c.visible = true;
      c.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.42, (a.z + b.z) / 2);
      c.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)), 'YXZ');
    }
    // level crossings: close when the train is within 160 m
    for (const cr of this.crossings) {
      const near = Math.abs(cr.s - (this.s - this.dir * this.trainLen / 2)) < this.trainLen / 2 + 160 && this.s > -50 && this.s < this.len + 50;
      cr.down += ((near ? 1 : 0) - cr.down) * Math.min(1, dt * 1.5);
      for (const a of cr.arms) { a.pivot.rotation.z = -a.sd * (1 - cr.down) * 1.45; a.light.material.emissive.setHex(near && Math.floor(performance.now() / 400) % 2 === (a.sd > 0 ? 0 : 1) ? 0xff2200 : 0x000000); }
    }
  }

  // closed crossing near (x,z)? (for traffic)
  blocked(x, z) {
    for (const cr of this.crossings) { if (cr.down < 0.3) continue; const p = this.at(cr.s); if (Math.hypot(p.x - x, p.z - z) < 14) return true; }
    return false;
  }

  dispose() { this.scene.remove(this.group); }
}
