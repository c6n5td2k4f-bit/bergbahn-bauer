// Sky dome with sun, sunset colours, stars and moon; lights; fog; weather particles; clouds
import * as THREE from 'three';
import { clamp, lerp, smooth } from './noise.js';
import { GFX } from './gfx.js';

const C = (h) => new THREE.Color(h);
const DAY_TOP = C(0x3a7bd0), DAY_HOR = C(0xd2e4f4);
// HYPER: deep alpine blue overhead, clear horizon
const HY_TOP = C(0x1f5fc0), HY_HOR = C(0xbcd6ee);
const SET_TOP = C(0x3d5d96), SET_HOR = C(0xffa45c);
const NIGHT_TOP = C(0x02050d), NIGHT_HOR = C(0x15203a);
const CLOUD_TOP = C(0x8a96a6), CLOUD_HOR = C(0xc4ccd6);

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 0.95, 0.8) }, sunAmt: { value: 1 }, uHy: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt; uniform float uHy; varying vec3 vDir;
        void main(){ float y = max(vDir.y, -0.1); vec3 c = mix(hor, top, pow(clamp(y * 1.6, 0.0, 1.0), 0.6));
          if (vDir.y < 0.0) c = mix(hor, hor * 0.8, clamp(-vDir.y * 4.0, 0.0, 1.0));
          float d = max(dot(normalize(vDir), sunDir), 0.0);
          c += sunCol * (pow(d, 900.0) * 6.0 * (1.0 + uHy * 5.0) + pow(d, 80.0) * 0.5 * uHy + pow(d, 12.0) * (0.35 + 0.15 * uHy)) * sunAmt;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), mat);
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    // stars
    const sp = [];
    for (let i = 0; i < 1500; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, y = Math.abs(u);
      const r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * r * 28000, y * 28000 + 400, Math.sin(a) * r * 28000);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    // moon
    const mc = document.createElement('canvas'); mc.width = mc.height = 64;
    const mx = mc.getContext('2d'); const g = mx.createRadialGradient(32, 32, 10, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.45, 'rgba(240,240,230,1)'); g.addColorStop(0.55, 'rgba(200,210,255,0.25)'); g.addColorStop(1, 'rgba(200,210,255,0)');
    mx.fillStyle = g; mx.fillRect(0, 0, 64, 64);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.set(1800, 1800, 1);
    scene.add(this.moon);
    // lights
    this.hemi = new THREE.HemisphereLight(0xdcebff, 0x7a7468, 1.15);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -280; sc.right = 280; sc.top = 280; sc.bottom = -280; sc.near = 10; sc.far = 4000;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xd7e6f3, 3000, 12000);
    scene.fog = this.fog;
    // clouds
    this.clouds = new THREE.Group();
    const cc = document.createElement('canvas'); cc.width = cc.height = 128;
    const cx = cc.getContext('2d');
    for (let i = 0; i < 9; i++) { const x = 30 + Math.random() * 68, y = 50 + Math.random() * 30, r = 18 + Math.random() * 22; const gg = cx.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(255,255,255,0.9)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gg; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
    this.cloudMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cc), transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      const a = Math.random() * Math.PI * 2, r = 3000 + Math.random() * 9000;
      s.position.set(Math.cos(a) * r, 2400 + Math.random() * 1400, Math.sin(a) * r);
      const sz = 2500 + Math.random() * 3500; s.scale.set(sz, sz * 0.45, 1);
      s.userData.v = 4 + Math.random() * 6;
      this.clouds.add(s);
    }
    scene.add(this.clouds);
    // precipitation: particles live in world space around the area you look at (not glued to the camera)
    const N = 7000;
    const pp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pp[i * 3] = (Math.random() - 0.5) * 200; pp[i * 3 + 1] = Math.random() * 120; pp[i * 3 + 2] = (Math.random() - 0.5) * 200; }
    this.precipN = N; this.precipBox = 200;
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.precip = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    this.precip.frustumCulled = false;
    this.precip.visible = false;
    scene.add(this.precip);
    this.sunDir = new THREE.Vector3();
    this.nightF = 0;
  }

  // hours 0..24, weather 'sonne'|'wolken'|'schnee'|'regen', S = map size
  update(hours, weather, target, camera, S, dt) {
    const t = ((hours % 24) + 24) % 24;
    // sun path: east (+x) at 6h, south (+z) at noon, west at 18h
    const a = (t - 6) / 12 * Math.PI;
    const elev = Math.sin(a) * 0.95;
    const az = a;
    this.sunDir.set(Math.cos(az) * Math.cos(Math.asin(clamp(elev, -1, 1))), elev, Math.sin(az) * Math.cos(Math.asin(clamp(elev, -1, 1)))).normalize();
    if (this.sunDir.z < 0.15) this.sunDir.z = 0.15 + (this.sunDir.z - 0.15) * 0.2;
    this.sunDir.normalize();
    const day = smooth(-0.12, 0.18, elev);
    const sunset = smooth(0.35, 0.05, Math.abs(elev)) * smooth(-0.15, 0.02, elev);
    const night = 1 - day;
    this.nightF = night;
    const cloudy = weather === 'wolken' ? 0.6 : weather === 'schnee' || weather === 'starkschnee' || weather === 'regen' ? 0.95 : 0;
    const top = (GFX.hyper ? HY_TOP : DAY_TOP).clone().lerp(SET_TOP, sunset).lerp(NIGHT_TOP, night);
    const hor = (GFX.hyper ? HY_HOR : DAY_HOR).clone().lerp(SET_HOR, sunset).lerp(NIGHT_HOR, night);
    top.lerp(CLOUD_TOP.clone().multiplyScalar(lerp(1, 0.12, night)), cloudy);
    hor.lerp(CLOUD_HOR.clone().multiplyScalar(lerp(1, 0.15, night)), cloudy);
    this.uniforms.top.value.copy(top); this.uniforms.hor.value.copy(hor);
    this.uniforms.sunDir.value.copy(this.sunDir);
    this.uniforms.sunCol.value.setRGB(1, lerp(0.95, 0.6, sunset), lerp(0.85, 0.35, sunset));
    this.uniforms.sunAmt.value = day * (1 - cloudy);
    this.uniforms.uHy.value = GFX.hyper ? 1 : 0;
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.material.opacity = smooth(0.4, 0.95, night) * (1 - cloudy);
    // moon opposite the sun
    const md = this.sunDir.clone().multiplyScalar(-1); md.y = Math.abs(md.y) * 0.8 + 0.25; md.normalize();
    this.moon.position.copy(camera.position).addScaledVector(md, 25000);
    this.moon.material.opacity = smooth(0.3, 0.8, night) * (1 - cloudy * 0.8);
    // lights
    // PC Ultra: stronger sun against a weaker sky light = more contrast between sunny and shady slopes
    const sunI = (GFX.hyper ? 4.3 : GFX.ultra ? 3.5 : 3.0) * day * (1 - cloudy * 0.65);
    this.sun.intensity = sunI + night * 0.35;
    this.sun.color.setRGB(1, lerp(0.95, 0.72, sunset), lerp(0.86, 0.5, sunset)).lerp(new THREE.Color(0.55, 0.65, 0.95), night);
    const ld = night > 0.5 ? md : this.sunDir;
    this.sun.position.copy(target).addScaledVector(ld, 1500);
    this.sun.target.position.copy(target);
    this.hemi.intensity = lerp((GFX.hyper ? 0.62 : GFX.ultra ? 0.85 : 1.15) + cloudy * 0.7, 0.22, night);
    this.hemi.color.setRGB(lerp(0.86, 0.35, night), lerp(0.92, 0.42, night), lerp(1.0, 0.7, night));
    this.hemi.groundColor.setRGB(lerp(0.48, 0.08, night), lerp(0.46, 0.09, night), lerp(0.41, 0.14, night));
    // fog
    this.fog.color.copy(hor);
    const dens = weather === 'starkschnee' ? 0.2 : weather === 'schnee' ? 0.35 : weather === 'regen' ? 0.45 : weather === 'wolken' ? 0.8 : 1;
    this.fog.near = S * (GFX.hyper ? 0.5 : GFX.ultra ? 0.35 : 0.6) * dens; this.fog.far = S * (GFX.hyper ? 3.2 : GFX.ultra ? 2.2 : 2.8) * dens;
    // clouds
    this.clouds.visible = true;
    this.cloudMat.opacity = lerp(0.55, 0.95, cloudy) * lerp(1, 0.25, night);
    this.cloudMat.color.setRGB(lerp(1, 0.75, cloudy), lerp(1, 0.78, cloudy), lerp(1, 0.82, cloudy)).lerp(new THREE.Color(1, 0.75, 0.6), sunset * 0.6);
    for (const c of this.clouds.children) { c.position.x += c.userData.v * dt; if (c.position.x > 14000) c.position.x = -14000; }
    this.clouds.visible = cloudy > 0 || true;
    this.clouds.children.forEach((c, i) => { c.visible = cloudy > 0.3 || i % 3 === 0; });
    // precipitation
    const pr = weather === 'schnee' || weather === 'starkschnee' || weather === 'regen';
    this.precip.visible = pr;
    if (pr) {
      const rain = weather === 'regen', heavy = weather === 'starkschnee';
      // the snow box follows the viewed area and grows when you zoom out, so flakes are seen over the landscape
      const camD = camera.position.distanceTo(target);
      const B = Math.min(1400, Math.max(140, camD * 1.3));
      const cx = target.x, cz = target.z, cy = target.y;
      const scale = B / 140;
      this.precip.material.size = (rain ? 0.12 : heavy ? 0.42 : 0.32) * Math.sqrt(scale) * (1 + (scale - 1) * 0.35);
      this.precip.material.color.setHex(rain ? 0x9fb4c8 : 0xffffff);
      this.precip.material.opacity = heavy ? 0.95 : 0.85;
      const count = rain ? 5000 : heavy ? this.precipN : Math.round(this.precipN * 0.45);
      this.precip.geometry.setDrawRange(0, count);
      const p = this.precip.geometry.attributes.position.array;
      const fall = (rain ? 16 : heavy ? 3.2 : 2.2) * Math.sqrt(scale);
      const top = B * 0.75, cxp = camera.position.x, cyp = camera.position.y, czp = camera.position.z;
      const near2 = (12 * Math.sqrt(scale)) ** 2;
      for (let i = 0; i < count * 3; i += 3) {
        p[i + 1] -= fall * dt;
        if (!rain) p[i] += Math.sin(i + p[i + 1] * 0.1) * dt * 0.8 * Math.sqrt(scale) + (heavy ? dt * 2.5 : 0);
        // wrap around the viewed area
        if (p[i] - cx > B / 2) p[i] -= B; else if (cx - p[i] > B / 2) p[i] += B;
        if (p[i + 2] - cz > B / 2) p[i + 2] -= B; else if (cz - p[i + 2] > B / 2) p[i + 2] += B;
        if (p[i + 1] < cy - 20) p[i + 1] += top + 20; else if (p[i + 1] > cy + top) p[i + 1] -= top + 20;
        // no big flakes right in front of the lens
        const dx = p[i] - cxp, dy = p[i + 1] - cyp, dz = p[i + 2] - czp;
        if (dx * dx + dy * dy + dz * dz < near2) p[i + 1] -= 30 * Math.sqrt(scale);
      }
      this.precip.geometry.attributes.position.needsUpdate = true;
      this.precip.position.set(0, 0, 0);
    }
    return { night, sunset, day };
  }
}
