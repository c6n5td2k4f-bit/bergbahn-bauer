// Fixed road bridges created with the world (gen 4): an overpass carrying the village road over the
// railway (deck + two ramps with retaining walls) and a stone road bridge over the river.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rbox } from './shapes.js';
import { heightAt } from './terrain.js';
import { clamp } from './noise.js';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const geo = (g, m) => { const c = g.index ? g.toNonIndexed() : g.clone(); if (c.attributes.uv) c.deleteAttribute('uv'); c.applyMatrix4(m); return c; };
const smooth = (t) => t * t * (3 - 2 * t);

export class FixedBridges {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.parts = { conc: [], asph: [], para: [], stone: [], steel: [], line: [], snow: [] };
    for (const o of world.overpasses || []) this.buildOverpass(o);
    for (const b of world.riverBridges || []) this.buildRiver(b);
    const mats = { conc: lam(0xa9a7a1), asph: lam(0x4a4d52), para: lam(0xc9c6bf), stone: lam(0x968f84), steel: lam(0x5d6a74), line: lam(0xeeeeee), snow: lam(0xf3f6fa) };
    this.snowMeshes = [];
    for (const k in this.parts) if (this.parts[k].length) {
      const m = new THREE.Mesh(mergeGeometries(this.parts[k]), mats[k]);
      m.castShadow = k !== 'line' && k !== 'snow'; m.receiveShadow = true;
      this.group.add(m);
      if (k === 'snow') this.snowMeshes.push(m);
    }
    world.fixedSurface = (x, z) => this.surfaceAt(x, z);
  }

  // box in the bridge's local frame: a along u (across), b along v (sideways), pitch about v
  box(list, o, a, b, y, la, h, wb, pitch = 0, round = 0) {
    const x = o.x + o.u.x * a + o.v.x * b, z = o.z + o.u.z * a + o.v.z * b;
    const yaw = Math.atan2(-o.u.z, o.u.x);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch, 'YXZ')), new THREE.Vector3(1, 1, 1));
    list.push(geo(round ? rbox(la, h, wb, round) : new THREE.BoxGeometry(la, h, wb), m));
  }

  // road level of the overpass at local a (across the track)
  static ovY(o, a) {
    if (Math.abs(a) <= o.half) return o.deckY;
    if (a > 0) { const t = clamp((a - o.half) / (o.aS - o.half), 0, 1); return o.deckY + (o.yS - o.deckY) * (0.5 * t + 0.5 * smooth(t)); }
    const t = clamp((-a - o.half) / (o.aN - o.half), 0, 1); return o.deckY + (o.yN - o.deckY) * (0.5 * t + 0.5 * smooth(t));
  }

  buildOverpass(o) {
    const w = this.world, P = this.parts;
    if (!o.v) o.v = { x: o.u.z, z: -o.u.x };
    o.yS = o.roadH + 0.05;
    o.yN = heightAt(w, o.n.x, o.n.z) + 0.05;
    const RW = 4.3, step = 1.5;
    const g = (a, b) => heightAt(w, o.x + o.u.x * a + o.v.x * b, o.z + o.u.z * a + o.v.z * b);
    for (let a = -o.aN; a < o.aS - 0.01; a += step) {
      const a1 = Math.min(o.aS, a + step), am = (a + a1) / 2;
      const y0 = FixedBridges.ovY(o, a), y1 = FixedBridges.ovY(o, a1), ym = (y0 + y1) / 2;
      const pitch = Math.atan2(y1 - y0, a1 - a);
      const len = (a1 - a) / Math.cos(pitch) + 0.06;
      const deck = Math.abs(am) <= o.half;
      // asphalt top + white edge lines
      this.box(P.asph, o, am, 0, ym - 0.12, len, 0.26, RW * 2 - 1.4, pitch);
      for (const sd of [-1, 1]) this.box(P.line, o, am, sd * (RW - 1.25), ym + 0.015, len, 0.02, 0.15, pitch);
      // sidewalks / curbs + parapets
      for (const sd of [-1, 1]) {
        this.box(P.conc, o, am, sd * (RW - 0.35), ym + 0.0, len, 0.36, 0.7, pitch);
        this.box(P.para, o, am, sd * (RW + 0.05), ym + 0.55, len, 0.75, 0.32, pitch);
        this.box(P.snow, o, am, sd * (RW + 0.05), ym + 0.98, len, 0.12, 0.42, pitch);
      }
      if (deck) {
        // deck slab with a girder edge
        this.box(P.conc, o, am, 0, ym - 0.85, a1 - a + 0.04, 1.2, RW * 2 + 0.5);
      } else {
        // solid ramp body with retaining walls down into the ground
        const gb = Math.min(g(am, -RW), g(am, RW), g(am, 0));
        const top = Math.min(y0, y1) - 0.2;
        if (top > gb - 0.5) { const hgt = top - gb + 1.6; this.box(P.conc, o, am, 0, top - hgt / 2, a1 - a + 0.04, hgt, RW * 2 + 0.1); }
      }
    }
    // abutments beside the track and small piers holding the deck
    for (const sd of [-1, 1]) {
      const a = sd * (o.half + 0.6), gb = Math.min(o.railH, g(a, 0)) - 1.0, top = o.deckY - 0.3;
      this.box(P.stone, o, a, 0, (top + gb) / 2, 1.6, top - gb, RW * 2 + 1.2, 0, 0.15);
    }
    // street lamps on the deck
    for (const sd of [-1, 1]) {
      const b = sd * (RW + 0.05);
      this.box(P.steel, o, 0, b, o.deckY + 3.6, 0.16, 6.2, 0.16);
      this.box(P.steel, o, 0, b - sd * 0.7, o.deckY + 6.6, 0.16, 0.12, 1.5);
    }
  }

  buildRiver(r) {
    const P = this.parts, w = this.world;
    const o = { x: r.x, z: r.z, u: r.u, v: { x: r.u.z, z: -r.u.x } };
    const RW = 4.0, step = 1.5;
    const yAt = (a) => {
      // slight hump in the middle, meeting the banks at both ends
      const span = a < 0 ? r.aN : r.aS, t = clamp(Math.abs(a) / span, 0, 1);
      const yEnd = heightAt(w, o.x + o.u.x * a, o.z + o.u.z * a);
      const mid = r.deckY + 0.35;
      return mid + (Math.max(yEnd, r.deckY - 0.5) - mid) * smooth(Math.max(0, (t - 0.55) / 0.45));
    };
    r.yAt = yAt;
    for (let a = -r.aN - 1.5; a < r.aS + 1.5 - 0.01; a += step) {
      const a1 = a + step, am = (a + a1) / 2;
      const y0 = yAt(a), y1 = yAt(a1), ym = (y0 + y1) / 2, pitch = Math.atan2(y1 - y0, a1 - a), len = (a1 - a) / Math.cos(pitch) + 0.06;
      this.box(P.asph, o, am, 0, ym - 0.12, len, 0.26, RW * 2 - 1.2, pitch);
      for (const sd of [-1, 1]) {
        this.box(P.stone, o, am, sd * (RW - 0.3), ym + 0.1, len, 0.45, 0.6, pitch);
        this.box(P.stone, o, am, sd * (RW + 0.1), ym + 0.5, len, 0.8, 0.45, pitch);
        this.box(P.snow, o, am, sd * (RW + 0.1), ym + 0.95, len, 0.12, 0.5, pitch);
      }
      // arch spandrel: thick near the abutments, thin at the crown
      const span = am < 0 ? r.aN : r.aS, t = clamp(Math.abs(am) / span, 0, 1);
      const thick = 0.9 + 2.6 * t * t;
      this.box(P.stone, o, am, 0, ym - 0.25 - thick / 2, a1 - a + 0.04, thick, RW * 2 + 0.6);
    }
    // piers standing in the water and abutments on the banks
    const bed = r.wl - 3.4;
    for (const a of [-r.aN * 0.4, r.aN * 0 + r.aS * 0.4]) {
      const top = yAt(a) - 0.6;
      this.box(P.stone, o, a, 0, (top + bed) / 2, 2.2, top - bed, RW * 2 + 1.6, 0, 0.4);
      for (const sd of [-1, 1]) this.box(P.stone, o, a, sd * (RW + 1.2), (r.wl + 1.2 + bed) / 2, 2.0, r.wl + 1.2 - bed, 1.4, 0, 0.6); // cutwaters
    }
    for (const sd of [-1, 1]) {
      const a = sd * ((sd < 0 ? r.aN : r.aS) + 0.5), top = yAt(a) - 0.3, gb = heightAt(w, o.x + o.u.x * a, o.z + o.u.z * a) - 2.5;
      this.box(P.stone, o, a, 0, (top + gb) / 2, 2.4, top - gb, RW * 2 + 1.4, 0, 0.3);
    }
  }

  surfaceAt(x, z) {
    let best = -Infinity;
    for (const o of this.world.overpasses || []) {
      const dx = x - o.x, dz = z - o.z;
      const a = dx * o.u.x + dz * o.u.z, b = dx * o.v.x + dz * o.v.z;
      if (Math.abs(b) <= 4.4 && a >= -o.aN && a <= o.aS) best = Math.max(best, FixedBridges.ovY(o, a) + 0.02);
    }
    for (const r of this.world.riverBridges || []) {
      if (!r.yAt) continue;
      const dx = x - r.x, dz = z - r.z, vx = r.u.z, vz = -r.u.x;
      const a = dx * r.u.x + dz * r.u.z, b = dx * vx + dz * vz;
      if (Math.abs(b) <= 4.0 && a >= -r.aN - 1.5 && a <= r.aS + 1.5) best = Math.max(best, r.yAt(a) + 0.02);
    }
    return best;
  }

  // under a bridge deck? (keeps tree planting / houses away)
  near(x, z, m = 0) {
    for (const o of this.world.overpasses || []) {
      const dx = x - o.x, dz = z - o.z, a = dx * o.u.x + dz * o.u.z, b = dx * o.v.x + dz * o.v.z;
      if (Math.abs(b) <= 6 + m && a >= -o.aN - m && a <= o.aS + m) return true;
    }
    for (const r of this.world.riverBridges || []) {
      const dx = x - r.x, dz = z - r.z, a = dx * r.u.x + dz * r.u.z, b = dx * r.u.z - dz * r.u.x;
      if (Math.abs(b) <= 6 + m && a >= -r.aN - 3 - m && a <= r.aS + 3 + m) return true;
    }
    return false;
  }

  setSeason(s) { for (const m of this.snowMeshes) m.visible = s === 0; }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    if (this.world.fixedSurface) this.world.fixedSurface = null;
  }
}
