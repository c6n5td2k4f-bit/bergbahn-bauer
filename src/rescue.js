// Rescue of injured guests: helicopter from the heli base (flies, lands next to the patient, flies back)
// or the piste rescue with snowmobile + sled. Without any rescue the patient waits long (bad reviews).
import * as THREE from 'three';
import { rbox } from './shapes.js';
import { heightAt } from './terrain.js';
import { clamp, lerp } from './noise.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

function heliMesh() {
  const g = new THREE.Group();
  const red = lam(0xd8262c), white = lam(0xf4f4f4), dark = lam(0x1d2a36), grey = lam(0x55595e);
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, p = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; p.add(me); return me; };
  add(rbox(4.4, 1.9, 2.0, 0.7, 3), red, 0, 1.75, 0);
  add(rbox(2.0, 1.0, 2.04, 0.45, 2), dark, 1.3, 2.05, 0);
  add(rbox(4.0, 0.25, 2.04, 0.1, 1), white, -0.1, 1.25, 0);
  add(new THREE.CylinderGeometry(0.28, 0.42, 4.6, 10).rotateZ(Math.PI / 2), red, -4.3, 2.05, 0);
  add(rbox(1.2, 1.4, 0.15, 0.1), red, -6.4, 2.6, 0);
  add(rbox(0.9, 0.12, 1.6, 0.05), white, -6.1, 2.05, 0);
  for (const sd of [-1, 1]) { add(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 6).rotateZ(Math.PI / 2), grey, 0.1, 0.12, sd * 1.05); for (const x of [-0.9, 1.0]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), grey, x, 0.45, sd * 0.95, sd * 0.25); }
  add(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 10), grey, 0, 2.9, 0);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.2, 0); g.add(rotor);
  for (let k = 0; k < 4; k++) add(rbox(10.5, 0.06, 0.32, 0.03, 1), dark, 0, 0, 0, 0, k * Math.PI / 4 * 2 / 2 * 2 / 2 + k * Math.PI / 4, 0, rotor);
  const tail = new THREE.Group(); tail.position.set(-6.5, 2.4, 0.18); g.add(tail);
  for (let k = 0; k < 2; k++) add(rbox(1.6, 0.05, 0.15, 0.02, 1), dark, 0, 0, 0, k * Math.PI / 2, 0, 0, tail);
  const beacon = add(new THREE.SphereGeometry(0.14, 8, 6), lam(0xff2200, { emissive: 0x000000 }), -1.5, 2.75, 0);
  g.userData = { rotor, tail, beacon };
  return g;
}

function sledMesh() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
  add(rbox(2.4, 0.5, 1.0, 0.2), lam(0xffcc00), 0, 0.55, 0);
  add(rbox(1.0, 0.6, 0.9, 0.2), lam(0x111111), 0.7, 0.95, 0);
  add(rbox(2.4, 0.35, 0.8, 0.15), lam(0xff6a00), -2.4, 0.25, 0);
  return g;
}

export class Rescue {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.heli = heliMesh(); this.heli.visible = false; scene.add(this.heli);
    this.sled = sledMesh(); this.sled.visible = false; scene.add(this.sled);
    this.task = null;
    this.home = null;
  }

  // park the helicopter on the pad of the heli base (or hide it)
  setHome(pad) {
    this.home = pad;
    if (!this.task) {
      this.heli.visible = !!pad;
      if (pad) { this.heli.position.set(pad.x, heightAt(this.world, pad.x, pad.z) + 0.45, pad.z); this.heli.rotation.set(0, pad.yaw || 0, 0); }
    }
  }

  get busy() { return !!this.task; }

  // start a rescue: mode 'heli' (from pad), 'sled' (from hut), 'none'
  start(guest, mode, from) {
    const w = this.world;
    const gy = heightAt(w, guest.x, guest.z);
    const t = { guest, mode, phase: 'go', t: 0, from, wait: 0 };
    if (mode === 'heli') {
      const ox = guest.x + 14, oz = guest.z + 6;
      t.land = { x: ox, z: oz, y: Math.max(heightAt(w, ox, oz), gy - 3) + 0.45 };
      t.cruise = Math.max(from.y, t.land.y) + 90;
      this.heli.visible = true;
      this.heli.position.set(from.x, from.y, from.z);
    } else if (mode === 'sled') {
      this.sled.visible = true;
      this.sled.position.set(from.x, heightAt(w, from.x, from.z), from.z);
    }
    this.task = t;
  }

  // returns 'picked' when the patient is on board, 'done' when finished, else null
  update(dt, time) {
    const t = this.task;
    if (this.heli.visible) { this.heli.userData.rotor.rotation.y += dt * (t ? 28 : 0); this.heli.userData.tail.rotation.z += dt * (t ? 40 : 0); this.heli.userData.beacon.material.emissive.setHex(t && Math.sin(time * 9) > 0 ? 0xff2200 : 0x000000); }
    if (!t) return null;
    t.t += dt;
    const w = this.world;
    let ev = null;
    if (t.mode === 'heli') {
      const H = this.heli, p = H.position;
      const goal = t.phase === 'go' || t.phase === 'down' ? t.land : t.from;
      const flyTo = (x, z, y, sp) => {
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        if (d > 0.5) { const yaw = Math.atan2(-dz, dx); let dy = yaw - H.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); H.rotation.y += dy * Math.min(1, dt * 2); }
        const st = Math.min(d, sp * dt);
        if (d > 0.01) { p.x += dx / d * st; p.z += dz / d * st; }
        p.y += clamp(y - p.y, -8 * dt, 8 * dt);
        H.rotation.z = -clamp(d / 200, 0, 0.12);
        return d;
      };
      if (t.phase === 'go' || t.phase === 'back') {
        const cruise = p.y < t.cruise - 2 && Math.hypot(goal.x - p.x, goal.z - p.z) > 60 ? null : t.cruise;
        const d = flyTo(goal.x, goal.z, cruise === null ? t.cruise : t.cruise, p.y < t.cruise - 10 ? 8 : 45);
        if (d < 3) t.phase = t.phase === 'go' ? 'down' : 'land';
      } else if (t.phase === 'down' || t.phase === 'land') {
        flyTo(goal.x, goal.z, goal.y, 6);
        H.rotation.z = 0;
        if (p.y - goal.y < 0.2) {
          if (t.phase === 'down') { t.phase = 'load'; t.wait = 18; }
          else { this.task = null; ev = 'done'; if (!this.home) H.visible = false; }
        }
      } else if (t.phase === 'load') {
        t.wait -= dt;
        if (t.wait <= 0) { t.phase = 'back'; ev = 'picked'; if (!this.home) t.from = { x: t.land.x + 3000, z: t.land.z, y: t.cruise }; }
      }
    } else if (t.mode === 'sled') {
      const S = this.sled, p = S.position;
      const goal = t.phase === 'go' ? t.guest : t.from;
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
      if (t.phase === 'load') { t.wait -= dt; if (t.wait <= 0) { t.phase = 'back'; ev = 'picked'; } }
      else if (d < 3) { if (t.phase === 'go') { t.phase = 'load'; t.wait = 12; } else { this.task = null; S.visible = false; ev = 'done'; } }
      else { const st = Math.min(d, 9 * dt); p.x += dx / d * st; p.z += dz / d * st; S.rotation.y = Math.atan2(-dz, dx); }
      p.y = heightAt(w, p.x, p.z);
    } else {
      // nobody comes: after a long wait somebody brings the patient down
      if (t.t > 90) { this.task = null; ev = 'picked'; }
    }
    return ev;
  }

  dispose() { this.scene.remove(this.heli, this.sled); }
}
