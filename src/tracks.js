// Tracks in the snow / dirt left by the player (ski, bike, snowmobile, groomer): a ring buffer of
// thin ribbons lying on the terrain. Fresh snowfall slowly covers them again.
import * as THREE from 'three';

export class Tracks {
  constructor(scene) {
    this.max = 5000;
    this.pos = new Float32Array(this.max * 6 * 3);
    this.col = new Float32Array(this.max * 6 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.n = 0; this.head = 0; this.last = new Map();
    this.fadeT = 0;
  }

  // add a segment for each lane (lateral offsets) from the last point of this source to (x,y,z)
  add(src, x, y, z, yaw, lanes, width, color, alpha) {
    const prev = this.last.get(src);
    this.last.set(src, { x, y, z, yaw });
    if (!prev) return;
    const d = Math.hypot(x - prev.x, z - prev.z);
    if (d < 0.25) { this.last.set(src, prev); return; }
    if (d > 6) return;
    const rx = Math.sin(yaw), rz = Math.cos(yaw), prx = Math.sin(prev.yaw), prz = Math.cos(prev.yaw);
    const c = new THREE.Color(color);
    for (const o of lanes) {
      const i = this.head;
      this.head = (this.head + 1) % this.max; this.n = Math.min(this.max, this.n + 1);
      const hw = width / 2;
      const v = [
        prev.x + prx * (o - hw), prev.y + 0.04, prev.z + prz * (o - hw),
        prev.x + prx * (o + hw), prev.y + 0.04, prev.z + prz * (o + hw),
        x + rx * (o - hw), y + 0.04, z + rz * (o - hw),
        x + rx * (o + hw), y + 0.04, z + rz * (o + hw),
      ];
      const tri = [0, 1, 2, 1, 3, 2];
      for (let k = 0; k < 6; k++) {
        const q = tri[k] * 3, p = (i * 6 + k) * 3, cc = (i * 6 + k) * 4;
        this.pos[p] = v[q]; this.pos[p + 1] = v[q + 1]; this.pos[p + 2] = v[q + 2];
        this.col[cc] = c.r; this.col[cc + 1] = c.g; this.col[cc + 2] = c.b; this.col[cc + 3] = alpha;
      }
    }
    this.geo.setDrawRange(0, this.n * 6);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }

  break(src) { this.last.delete(src); }

  // the groomer's tiller smooths the snow: tracks under it (circle around x,z) disappear
  erase(x, z, r) {
    if (!this.n) return;
    const r2 = r * r; let any = false;
    for (let i = 0; i < this.n; i++) {
      const p = i * 18, c = i * 24;
      if (this.col[c + 3] <= 0) continue;
      const mx = (this.pos[p] + this.pos[p + 6]) / 2, mz = (this.pos[p + 2] + this.pos[p + 8]) / 2;
      if ((mx - x) ** 2 + (mz - z) ** 2 < r2) { for (let k = 0; k < 6; k++) this.col[c + k * 4 + 3] = 0; any = true; }
    }
    if (any) this.geo.attributes.color.needsUpdate = true;
  }

  // snowfall / time fades tracks (amount 0..1 per call)
  fade(amount) {
    if (!this.n) return;
    let any = false;
    for (let i = 3; i < this.col.length; i += 4) if (this.col[i] > 0) { this.col[i] = Math.max(0, this.col[i] - amount); any = true; }
    if (any) this.geo.attributes.color.needsUpdate = true;
  }

  clear() { this.n = 0; this.head = 0; this.last.clear(); this.geo.setDrawRange(0, 0); }
  dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.geo.dispose(); }
}
