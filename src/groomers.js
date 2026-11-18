// AI snow groomers that prepare the pistes at night (winter)
import * as THREE from 'three';
import { heightAt, normalAt } from './terrain.js';
import { buildBully } from './player.js';
import { mulberry32 } from './noise.js';

export class Groomers {
  constructor(world, scene, tv, cannons) {
    this.world = world; this.scene = scene; this.tv = tv; this.cannons = cannons;
    this.list = [];
    this.rand = mulberry32(world.params.seed + 999);
    this.glowMat = new THREE.SpriteMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  ensure(n) {
    while (this.list.length < n) {
      const i = this.list.length, cm = this.colorMode || 'rot';
      const col = cm === 'blau' ? 0x2f6fe0 : cm === 'mix' ? (i % 2 ? 0x2f6fe0 : 0xd42a1e) : 0xd42a1e;
      const mesh = buildBully([400, 600, 100][i % 3], col);
      for (const m of mesh.userData.lights) m.emissive.setHex(0xfff2cc);
      mesh.visible = false;
      this.scene.add(mesh);
      this.list.push({ mesh, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, placed: false });
    }
    this.list.forEach((g, i) => { if (i >= n) { g.mesh.visible = false; g.placed = false; } });
  }

  // body colour of the hired groomers: 'rot' | 'blau' | 'mix' (rebuilds the machines)
  setColors(mode) {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    const keep = this.list.map((g) => ({ x: g.x, z: g.z, yaw: g.yaw, tx: g.tx, tz: g.tz, placed: g.placed, vis: g.mesh.visible }));
    for (const g of this.list) { this.scene.remove(g.mesh); g.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const n = this.list.length; this.list = []; this.ensure(n);
    this.list.forEach((g, i) => { Object.assign(g, keep[i]); g.mesh.visible = keep[i].vis; });
  }

  randomPiste(cx, cz, r) {
    for (let k = 0; k < 40; k++) {
      const a = this.rand() * Math.PI * 2, d = 20 + this.rand() * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.abs(x) < this.world.S / 2 - 10 && Math.abs(z) < this.world.S / 2 - 10 && this.tv.pisteAt(x, z) && this.tv.pisteAt(x, z) !== 4) return { x, z };
    }
    return null;
  }

  update(dt, active, count, time) {
    const n = active ? count : 0;
    this.ensure(n);
    for (let gi = 0; gi < n; gi++) {
      const g = this.list[gi];
      if (!g.placed) {
        const S = this.world.S;
        let p = null;
        for (let k = 0; k < 30 && !p; k++) p = this.randomPiste((this.rand() - 0.5) * S * 0.8, (this.rand() - 0.5) * S * 0.8, 400);
        if (!p) { g.mesh.visible = false; continue; }
        g.x = p.x; g.z = p.z; g.tx = p.x; g.tz = p.z; g.placed = true;
      }
      g.mesh.visible = true;
      // real grooming pattern: straight up the fall line, shift over by one blade width, straight down
      // next to the last lane, shift again … until the piste is done, then move on to another piste
      const onP = (x, z) => { const v = this.tv.pisteAt(x, z); return v > 0 && v !== 4; };
      const nrm = normalAt(this.world, g.x, g.z);
      let fl = Math.hypot(nrm.x, nrm.z);
      const downX = fl > 0.02 ? nrm.x / fl : Math.cos(g.yaw), downZ = fl > 0.02 ? nrm.z / fl : -Math.sin(g.yaw);
      if (!g.mode) { g.mode = 'up'; g.side = this.rand() < 0.5 ? 1 : -1; g.laneLen = 0; g.fails = 0; }
      const laneW = (g.mesh.userData.groomW || 5.2) * 0.9;
      let hx, hz, sp;
      if (g.mode === 'up' || g.mode === 'down') {
        const sgn = g.mode === 'up' ? -1 : 1;
        hx = downX * sgn; hz = downZ * sgn;
        sp = g.mode === 'up' ? 4.2 : 5.8;
        g.laneLen += sp * dt;
        // end of the lane: the piste ends ahead (or the lane gets very long)
        if (!onP(g.x + hx * 8, g.z + hz * 8) || g.laneLen > 600) { g.next = g.mode === 'up' ? 'down' : 'up'; g.mode = 'shift'; g.shiftLeft = laneW; g.laneLen = 0; }
      } else {
        // shift sideways (perpendicular to the fall line) by one blade width
        hx = -downZ * g.side; hz = downX * g.side; sp = 2.2;
        g.shiftLeft -= sp * dt;
        if (g.shiftLeft <= 0) {
          if (onP(g.x, g.z) || onP(g.x + hx * 3, g.z + hz * 3)) { g.mode = g.next; g.fails = 0; }
          else if (g.fails < 1) { g.side *= -1; g.fails++; g.shiftLeft = laneW * 2; }
          else { g.placed = false; g.mode = null; continue; } // piste finished
        }
      }
      const want = Math.atan2(-hz, hx);
      let dy = want - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.yaw += Math.max(-1, Math.min(1, dy)) * dt * 1.4;
      if (Math.abs(dy) > 1.2) sp *= 0.35;
      g.x += Math.cos(g.yaw) * sp * dt; g.z -= Math.sin(g.yaw) * sp * dt;
      const n = normalAt(this.world, g.x, g.z);
      const qn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z));
      g.mesh.quaternion.copy(qn.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw)));
      g.mesh.position.set(g.x, heightAt(this.world, g.x, g.z), g.z);
      const gw = g.mesh.userData.groomW || 5.2, go = g.mesh.userData.groomOff || 4.1;
      if (sp > 2) this.tv.groomStroke(g.x - Math.cos(g.yaw) * go, g.z + Math.sin(g.yaw) * go, g.yaw, Math.max(gw, 4.8), sp * dt + 3.2, false);
      if (g.mesh.userData.beacon) g.mesh.userData.beacon.material.emissive.setHex(Math.sin(time * 8 + g.x) > 0 ? 0xff9900 : 0x000000);
      this.cannons.flattenNear(g.x, g.z, 6);
    }
  }

  dispose() { for (const g of this.list) this.scene.remove(g.mesh); this.list = []; }
}
