// River and lake water surfaces (flowing in summer, partly frozen in winter)
import * as THREE from 'three';

function waterNormalTexture() {
  const R = 128, c = document.createElement('canvas'); c.width = c.height = R;
  const x = c.getContext('2d');
  const img = x.createImageData(R, R);
  const hgt = new Float32Array(R * R);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    let v = 0;
    for (let k = 1; k <= 4; k++) v += Math.sin((i * k * 2 + j * (5 - k)) * Math.PI * 2 / R + k * 1.7) / k + Math.cos((j * k * 3 - i * k) * Math.PI * 2 / R + k) / (k * 1.5);
    hgt[j * R + i] = v;
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const hx = hgt[j * R + (i + 1) % R] - hgt[j * R + (i - 1 + R) % R];
    const hy = hgt[((j + 1) % R) * R + i] - hgt[((j - 1 + R) % R) * R + i];
    const nx = -hx * 0.35, ny = -hy * 0.35, nz = 1, l = Math.hypot(nx, ny, nz);
    const o = (j * R + i) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Water {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.nmap = waterNormalTexture();
    this.nmap2 = this.nmap.clone(); this.nmap2.needsUpdate = true;
    this.riverMat = new THREE.MeshPhongMaterial({ color: 0x2f6f7a, specular: 0x99bbcc, shininess: 80, normalMap: this.nmap, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    this.lakeMat = new THREE.MeshPhongMaterial({ color: 0x2a6f80, specular: 0xaaccdd, shininess: 90, normalMap: this.nmap2, normalScale: new THREE.Vector2(0.4, 0.4), transparent: true, opacity: 0.94 });
    this.buildRiver();
    this.buildLake();
  }

  buildRiver() {
    const w = this.world, R = w.river, L = w.lake;
    if (R.length < 3) return;
    const half = 15;
    const strips = [];
    let cur = [];
    for (let i = 0; i < R.length; i++) {
      const p = R[i];
      const inLake = L && Math.hypot((p.x - L.x) / (L.a * 0.92), (p.z - L.z) / (L.b * 0.92)) < 1;
      if (inLake) { if (cur.length > 1) strips.push(cur); cur = []; continue; }
      cur.push(i);
    }
    if (cur.length > 1) strips.push(cur);
    const pos = [], uv = [], idx = [];
    let vlen = 0;
    for (const s of strips) {
      const base = pos.length / 3;
      for (let n = 0; n < s.length; n++) {
        const i = s[n];
        const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)], p = R[i];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const rx = -dz, rz = dx;
        if (n > 0) { const q = R[s[n - 1]]; vlen += Math.hypot(p.x - q.x, p.z - q.z); }
        pos.push(p.x - rx * half, p.wl, p.z - rz * half, p.x + rx * half, p.wl, p.z + rz * half);
        uv.push(0, vlen / 30, 1, vlen / 30);
        if (n > 0) { const k = base + (n - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // make sure normals point up
    const nr = geo.attributes.normal.array; for (let k = 1; k < nr.length; k += 3) if (nr[k] < 0) { nr[k - 1] *= -1; nr[k] *= -1; nr[k + 1] *= -1; }
    this.river = new THREE.Mesh(geo, this.riverMat);
    this.river.renderOrder = 1;
    this.group.add(this.river);
  }

  buildLake() {
    const L = this.world.lake;
    if (!L) return;
    const geo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
    geo.scale(L.a * 1.12, 1, L.b * 1.12);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L.a / 25, uv.getY(i) * L.b / 25);
    this.lake = new THREE.Mesh(geo, this.riverMat);
    this.lake.position.set(L.x, L.level + 0.05, L.z);
    this.lake.renderOrder = 1;
    this.group.add(this.lake);
    // ice sheet for winter
    this.ice = new THREE.Mesh(geo.clone(), new THREE.MeshLambertMaterial({ color: 0xdfe9f0 }));
    this.ice.position.set(L.x, L.level + 0.08, L.z);
    this.ice.visible = false;
    this.group.add(this.ice);
  }

  setSeason(s) {
    const winter = s === 0;
    this.riverMat.color.setHex(winter ? 0x5d8a99 : 0x2f7480);
    if (this.ice) this.ice.visible = winter;
    if (this.lake) this.lake.visible = !winter;
  }

  update(dt) {
    this.nmap.offset.y -= dt * 0.12;
    this.nmap2.offset.x += dt * 0.01; this.nmap2.offset.y += dt * 0.006;
  }

  dispose() { this.scene.remove(this.group); }
}
