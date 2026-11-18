// Play yourself: ski, mountain bike, walk, drive groomer / snowmobile / car / bus. Ride lifts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rbox } from './shapes.js';
import { heightAt, normalAt, inWater, distToLine } from './terrain.js';
import { skierGeometry, hikerGeometry, riderGeometry, makeSkierRig, makeBikeRig } from './figures.js';
import { GFX } from './gfx.js';
import { clamp, lerp } from './noise.js';

export const PLAY_MODES = {
  ski: { name: 'Skifahren', icon: '⛷️', season: 0 },
  bike: { name: 'Mountainbike', icon: '🚵', season: 1 },
  walk: { name: 'Zu Fuss', icon: '🚶' },
  bully: { name: 'Strassenbully', icon: '🚜' },
  skidoo: { name: 'Schneetöff', icon: '🛷', season: 0 },
  car: { name: 'Auto', icon: '🚗' },
  bus: { name: 'Postauto', icon: '🚌' },
};

const VEH = {
  bully: { vmax: 7.5, vback: 4, acc: 4.5, turn: 1.15, camBack: 17, camUp: 8, mu: 0.02 },
  skidoo: { vmax: 24, vback: 4, acc: 7, turn: 1.6, camBack: 9, camUp: 4, mu: 0.02 },
  car: { vmax: 32, vback: 6, acc: 7, turn: 0.9, camBack: 12, camUp: 5, mu: 0.02 },
  bus: { vmax: 22, vback: 4, acc: 3.5, turn: 0.55, camBack: 22, camUp: 8, mu: 0.02 },
};

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
function figureMesh(fn, jacket) {
  const g = fn();
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g.jacket, lam(jacket)), new THREE.Mesh(g.rest, lam(0xffffff, { vertexColors: true })));
  grp.traverse((o) => { o.castShadow = true; });
  return grp;
}
function boxes(list) {
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, c, rz = 0, rx = 0] of list) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); }
  return g;
}
function wheel(r, w, x, y, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12).rotateX(Math.PI / 2), lam(0x111111)); m.position.set(x, y, z); return m; }

// detailed snow groomer ("Strassenbully"): local +x forward, tiller on a pivot (userData.tiller)
function sideText(label = 'STRASSENBULLY', bg = '#d42a1e') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 512, 64);
  x.fillStyle = '#fff'; x.font = 'bold italic 44px system-ui, sans-serif'; x.textBaseline = 'middle'; x.fillText(label, 16, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const _sideTex = {};
export const BULLY_MODELS = {
  100: { name: 'Strassenbully 100', scale: 0.74, vmax: 8.5, climb: 0.85, maxDeg: 22, desc: 'Klein und wendig, für schmale Pisten und den Snowpark. Schafft bis 22° Steigung.' },
  400: { name: 'Strassenbully 400', scale: 1, vmax: 7.5, climb: 1, maxDeg: 25, desc: 'Der Allrounder. Schafft bis 25° Steigung.' },
  600: { name: 'Strassenbully 600', scale: 1.16, vmax: 7, climb: 1.25, maxDeg: 27, desc: 'Gross und stark, mit Seilwinde: bis 27° allein, mit eingehängter Winde (H) bis 70°.' },
};
// body colours to choose from (player) and for hired drivers (blue / red / mixed)
export const BULLY_COLORS = { blau: { name: 'Blau', hex: 0x2f6fe0 }, rot: { name: 'Rot', hex: 0xd42a1e }, gelb: { name: 'Gelb', hex: 0xf2b400 }, gruen: { name: 'Grün', hex: 0x2e9a4a }, orange: { name: 'Orange', hex: 0xff7a1a }, weiss: { name: 'Weiss', hex: 0xeef0f2 } };
export function buildBully(model = 400, color = 0x2f6fe0) {
  // low-poly groomer like the reference pictures: long tracks with six big road wheels, dark deck,
  // boxy cab in the body colour, black front blade with a grid on top, rear tiller with finisher,
  // optional winch (600) with a boom over the cab. Local +x = forward.
  const M0 = BULLY_MODELS[model] || BULLY_MODELS[400];
  const outer = new THREE.Group();
  const g = new THREE.Group(); g.scale.setScalar(M0.scale); outer.add(g);
  const F = { flatShading: true };
  const body = lam(color, F), deck = lam(0x2c2e33, F), black = lam(0x141517, F), rubber = lam(0x1d1e21, F), grey = lam(0x8d9298, F), lgrey = lam(0xb8bdc2, F), glass = lam(0x1f2a33, F), rail = lam(0xa9aeb3, F);
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; parent.add(me); return me; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (r, h, n = 14) => new THREE.CylinderGeometry(r, r, h, n);
  const U = GFX.ultra, winch = +model === 600;
  const railLine = (x0, z0, x1, z1, y0, h = 0.75, step = 0.32, parent = g) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ang = -Math.atan2(z1 - z0, x1 - x0), n = Math.max(1, Math.round(L / step));
    add(B(L, 0.05, 0.05), rail, (x0 + x1) / 2, y0 + h, (z0 + z1) / 2, 0, ang, 0, parent);
    add(B(L, 0.04, 0.04), rail, (x0 + x1) / 2, y0 + h * 0.5, (z0 + z1) / 2, 0, ang, 0, parent);
    for (let i = 0; i <= n; i++) { const u = i / n; add(B(0.04, h, 0.04), rail, x0 + (x1 - x0) * u, y0 + h / 2, z0 + (z1 - z0) * u, 0, 0, 0, parent); }
  };
  // ---- tracks: belt, cleats all around, six big road wheels, drive sprocket and idler
  const x0 = -2.75, x1 = 2.75, R = 0.47, yc = 0.5;
  for (const sd of [-1, 1]) {
    const tz = sd * 1.55, tw = 1.25;
    add(B(x1 - x0, 0.12, tw), rubber, 0, yc + R - 0.03, tz);
    add(B(x1 - x0, 0.12, tw), rubber, 0, yc - R + 0.06, tz);
    for (const x of [x0, x1]) add(C(R, tw, 20).rotateX(Math.PI / 2), rubber, x, yc, tz);
    const nG = U ? 44 : 24, per = 2 * (x1 - x0) + 2 * Math.PI * R;
    for (let k = 0; k < nG; k++) {
      let u = k / nG * per, x, y, rot = 0;
      if (u < x1 - x0) { x = x0 + u; y = yc + R + 0.05; }
      else if ((u -= x1 - x0) < Math.PI * R) { const a = u / R; x = x1 + Math.sin(a) * (R + 0.05); y = yc + Math.cos(a) * (R + 0.05); rot = -a; }
      else if ((u -= Math.PI * R) < x1 - x0) { x = x1 - u; y = yc - R - 0.02; rot = Math.PI; }
      else { u -= x1 - x0; const a = u / R; x = x0 - Math.sin(a) * (R + 0.05); y = yc - Math.cos(a) * (R + 0.05); rot = Math.PI - a; }
      add(B(0.1, 0.08, tw + 0.06), grey, x, y, tz, 0, 0, rot);
    }
    for (let k = 0; k < 6; k++) {
      const wx = -2.2 + k * 0.88, wz = sd * (1.55 + tw / 2 + 0.02);
      add(C(0.4, 0.16, 16).rotateX(Math.PI / 2), grey, wx, yc - 0.02, wz);
      add(C(0.17, 0.2, 10).rotateX(Math.PI / 2), black, wx, yc - 0.02, wz);
      if (U) for (let q = 0; q < 5; q++) { const a = q / 5 * Math.PI * 2; add(C(0.035, 0.2, 6).rotateX(Math.PI / 2), black, wx + Math.cos(a) * 0.27, yc - 0.02 + Math.sin(a) * 0.27, wz); }
    }
    for (const ex of [x0, x1]) { add(C(0.32, 0.2, 12).rotateX(Math.PI / 2), black, ex, yc, sd * (1.55 + tw / 2 + 0.02)); }
  }
  // ---- deck plate over the tracks
  add(B(5.9, 0.22, 4.4), deck, 0, 1.12, 0);
  add(B(5.95, 0.08, 4.45), black, 0, 1.0, 0);
  // ---- cab (front) and engine hood (middle)
  const cab0 = 0.45, cab1 = 2.35, cw = 1.05, cy0 = 1.23, cy1 = 3.3;
  add(B(cab1 - cab0, cy1 - cy0, cw * 2), body, (cab0 + cab1) / 2, (cy0 + cy1) / 2, 0);
  add(B(cab1 - cab0 + 0.12, 0.14, cw * 2 + 0.12), body, (cab0 + cab1) / 2, cy1 + 0.04, 0); // roof edge
  add(B(0.06, 1.05, cw * 2 - 0.25), glass, cab1 + 0.02, 2.6, 0); // windscreen
  for (const sd of [-1, 1]) {
    add(B(1.05, 0.95, 0.06), glass, cab0 + 0.95, 2.62, sd * (cw + 0.02)); // door window
    add(B(0.45, 0.95, 0.06), glass, cab0 + 0.3, 2.62, sd * (cw + 0.02));
    add(B(0.04, 1.85, 0.07), black, cab0 + 0.58, 2.2, sd * (cw + 0.03)); // door gap
    add(B(0.25, 0.04, 0.07), black, cab0 + 1.25, 1.95, sd * (cw + 0.03)); // handle
    add(B(0.35, 0.06, 0.25), black, cab0 + 0.9, 1.35, sd * (cw + 0.2)); // step
    add(B(0.05, 0.45, 0.05), black, cab1 + 0.05, 3.0, sd * (cw + 0.15)); add(B(0.06, 0.32, 0.2), black, cab1 + 0.08, 2.72, sd * (cw + 0.28)); // mirror
  }
  const h0 = -0.95, h1 = cab0;
  add(B(h1 - h0, 1.3, 1.9), body, (h0 + h1) / 2, 1.88, 0);
  add(B(h1 - h0 + 0.05, 0.12, 1.95), body, (h0 + h1) / 2, 2.56, 0);
  for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) add(B(0.07, 0.5, 0.05), black, -0.1 + k * 0.17, 1.95, sd * 0.97); // vents
  add(C(0.08, 1.2, 8), black, -0.65, 3.05, 0.7); add(C(0.11, 0.12, 8), black, -0.65, 3.65, 0.7);
  // roof: light bar and two orange beacons
  const lightMat = lam(0xffffff, { emissive: 0x000000 }), headMat = lam(0xffffff, { emissive: 0x000000 });
  add(B(0.2, 0.12, 1.7), black, cab1 - 0.15, cy1 + 0.17, 0);
  for (let k = 0; k < 5; k++) add(B(0.05, 0.08, 0.24), lightMat, cab1 - 0.04, cy1 + 0.17, -0.66 + k * 0.33);
  const beaconMat = lam(0xff8a00, { emissive: 0x000000 });
  const beacon = add(C(0.12, 0.22, 10), beaconMat, cab0 + 0.35, cy1 + 0.22, 0.75);
  const beacon2 = add(C(0.12, 0.22, 10), beaconMat, cab0 + 0.35, cy1 + 0.22, -0.75);
  add(C(0.012, 0.9, 4), black, cab0 + 0.15, cy1 + 0.55, -0.9); // antenna
  for (const sd of [-1, 1]) add(B(0.06, 0.16, 0.3), headMat, cab1 + 0.05, 1.55, sd * 0.75);
  for (const sd of [-1, 1]) add(B(0.06, 0.18, 0.22), lam(0xd01010, { emissive: 0x400000 }), -2.96, 1.4, sd * 1.6); // rear lights
  // ---- rear deck: winch (600) or a tool box, with railings
  if (winch) {
    add(B(1.7, 0.7, 1.7), black, -1.85, 1.58, 0);
    add(B(1.5, 0.95, 1.5), body, -1.85, 2.38, 0);
    add(C(0.62, 1.3, 18).rotateX(Math.PI / 2), body, -1.85, 2.95, 0);
    for (const sd of [-1, 1]) add(C(0.68, 0.08, 18).rotateX(Math.PI / 2), black, -1.85, 2.95, sd * 0.68);
    add(C(0.25, 1.35, 10).rotateX(Math.PI / 2), black, -1.85, 2.95, 0);
    // boom: rises behind the cab, runs over the roof and ends in front of the cab with a rope pulley
    const seg = (ax, ay, bx, by, z) => { const L = Math.hypot(bx - ax, by - ay); add(B(L, 0.24, 0.24), body, (ax + bx) / 2, (ay + by) / 2, z, 0, 0, Math.atan2(by - ay, bx - ax)); };
    for (const z of [-0.42, 0.42]) { seg(-1.85, 3.45, -0.9, 4.15, z); seg(-0.9, 4.15, 1.9, 4.2, z); seg(1.9, 4.2, 2.75, 3.75, z); }
    add(B(0.24, 0.24, 1.08), body, -0.9, 4.15, 0); add(B(0.24, 0.24, 1.08), body, 1.9, 4.2, 0);
    add(C(0.2, 0.18, 12).rotateX(Math.PI / 2), black, 2.85, 3.68, 0);
    railLine(-2.85, -1.25, -0.95, -1.25, 1.23); railLine(-2.85, 1.25, -0.95, 1.25, 1.23); railLine(-2.85, -1.25, -2.85, 1.25, 1.23);
  } else {
    add(B(1.2, 0.55, 1.8), black, -1.9, 1.5, 0);
    railLine(-2.85, -1.6, -1.0, -1.6, 1.23); railLine(-2.85, 1.6, -1.0, 1.6, 1.23); railLine(-2.85, -1.6, -2.85, 1.6, 1.23);
    if (+model === 100) add(B(0.6, 0.4, 1.4), grey, -1.3, 1.45, 0);
  }
  const tip = new THREE.Object3D(); tip.position.set(2.85, 3.5, 0); g.add(tip);
  // ---- front blade: one smooth, slightly concave black shield with a grey cutting edge and angled
  // side wings (like the reference picture); the railing stands on the front deck behind it
  const blade = new THREE.Group(); blade.position.set(3.35, 0.95, 0); g.add(blade);
  const nS = U ? 10 : 6;
  for (let k = 0; k < nS; k++) { const a = (k / (nS - 1) - 0.5) * 0.9; add(B(0.16, 1.7 / nS + 0.06, 4.7), black, -Math.cos(a) * 0.32 + 0.32, Math.sin(a) * 0.85 + 0.12, 0, 0, 0, a + 0.1, blade); }
  for (const sd of [-1, 1]) {
    const wing = new THREE.Shape(); wing.moveTo(0, -0.72); wing.lineTo(0.5, -0.72); wing.lineTo(0.38, 0.75); wing.lineTo(0, 0.85); wing.lineTo(0, -0.72);
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.12, bevelEnabled: false }); wg.translate(0, 0, -0.06);
    add(wg, black, 0.0, 0.1, sd * 2.36, 0, -sd * 0.42, 0, blade);
  }
  add(B(0.3, 0.1, 4.8), lgrey, 0.24, -0.73, 0, 0, 0, 0, blade); // cutting edge
  for (const sd of [-1, 1]) add(B(0.3, 0.1, 0.9), lgrey, 0.45, -0.73, sd * 2.75, 0, sd * 0.5, 0, blade);
  add(B(0.14, 0.3, 4.4), deck, -0.42, -0.2, 0, 0, 0, 0, blade); // back frame
  for (const sd of [-1, 1]) add(B(0.14, 0.3, 0.3), deck, -0.42, 0.55, sd * 1.4, 0, 0, 0, blade);
  // arms and hydraulic cylinders from the blade to the chassis
  for (const sd of [-0.75, 0.75]) { add(B(1.05, 0.2, 0.2), grey, 2.9, 1.18, sd, 0, 0, 0.32); add(B(0.95, 0.12, 0.12), lgrey, 2.75, 1.58, sd * 0.45, 0, 0, -0.4); }
  // railing across the front deck, in front of the cab
  railLine(2.55, -1.95, 2.55, 1.95, 1.23, 0.8, 0.36); railLine(2.55, -1.95, 1.0, -1.95, 1.23, 0.8, 0.4); railLine(2.55, 1.95, 1.0, 1.95, 1.23, 0.8, 0.4);
  // ---- rear tiller on a pivot (raise / lower)
  const tiller = new THREE.Group(); tiller.position.set(-2.95, 1.15, 0); g.add(tiller);
  for (const sd of [-0.8, 0.8]) add(B(1.1, 0.18, 0.2), grey, -0.45, -0.12, sd, 0, 0, 0.3, tiller);
  add(B(0.95, 0.7, 4.6), black, -1.25, -0.55, 0, 0, 0, 0, tiller);
  add(B(0.97, 0.1, 4.62), deck, -1.25, -0.17, 0, 0, 0, 0, tiller);
  for (const sd of [-1, 1]) add(B(1.0, 0.75, 0.08), grey, -1.25, -0.55, sd * 2.33, 0, 0, 0, tiller);
  add(C(0.3, 4.4, 12).rotateX(Math.PI / 2), deck, -1.2, -0.82, 0, 0, 0, 0, tiller);
  add(B(0.05, 0.6, 4.6), grey, -1.95, -0.95, 0, 0, 0, 0.55, tiller); // finisher mat
  if (U) for (let k = 0; k < 34; k++) add(B(0.03, 0.08, 0.04), black, -2.15, -1.18, -2.2 + k * 0.133, 0, 0, 0, tiller);
  // ---- fewer draw calls: merge static parts per material
  const keep = new Set([beacon, beacon2]);
  for (const grp of [g, blade, tiller]) {
    const by = new Map();
    for (const ch of [...grp.children]) {
      if (!ch.isMesh || keep.has(ch) || ch.material === lightMat || ch.material === headMat) continue;
      ch.updateMatrix();
      const geo = (ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone());
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      geo.applyMatrix4(ch.matrix);
      if (!by.has(ch.material)) by.set(ch.material, []);
      by.get(ch.material).push(geo); grp.remove(ch);
    }
    for (const [m, list] of by) { const me = new THREE.Mesh(mergeGeometries(list), m); me.castShadow = true; me.receiveShadow = true; grp.add(me); }
  }
  outer.userData.tiller = tiller;
  outer.userData.beacon = beacon;
  outer.userData.lights = [lightMat, headMat];
  outer.userData.model = +model;
  outer.userData.winch = winch;
  outer.userData.ropeTip = tip;
  outer.userData.groomW = 5.2 * M0.scale;
  outer.userData.groomOff = 4.1 * M0.scale;
  return outer;
}

export function vehicleMesh(type, opts = {}) {
  if (type === 'bully') return buildBully(opts.bullyModel || 400, opts.bullyColor ?? 0x2f6fe0);
  if (type === 'skidoo') {
    const g = boxes([[2.4, 0.5, 1.0, 0, 0.55, 0, 0xffcc00], [1.0, 0.6, 0.9, 0.7, 0.95, 0, 0x111111], [1.2, 0.25, 0.7, -0.4, 0.95, 0, 0x222222], [0.1, 0.5, 0.9, 1.3, 1.2, 0, 0x88aacc, 0.4], [2.6, 0.3, 0.6, -0.2, 0.18, 0, 0x222222]]);
    for (const sd of [-1, 1]) g.add(boxes([[1.4, 0.06, 0.15, 1.4, 0.05, sd * 0.5, 0x222222]]));
    const rider = figureMesh(riderGeometry, 0xe63946); rider.position.set(-0.4, 1.05, 0); g.add(rider);
    return g;
  }
  if (type === 'bus') {
    const g = boxes([[12, 2.6, 2.5, 0, 1.75, 0, 0xffcc00], [11.6, 1.0, 2.52, 0, 2.2, 0, 0x2b3a48], [12.02, 0.25, 2.52, 0, 1.0, 0, 0xd62020], [12, 0.15, 2.4, 0, 3.1, 0, 0xffffff]]);
    for (const x of [-3.8, 3.8]) for (const z of [-1.1, 1.1]) g.add(wheel(0.5, 0.35, x, 0.5, z));
    return g;
  }
  const g = boxes([[4.4, 0.9, 1.9, 0, 0.75, 0, 0x1f6fd1], [2.4, 0.75, 1.7, -0.25, 1.55, 0, 0x223344]]);
  for (const [x, z] of [[1.45, 0.9], [-1.45, 0.9], [1.45, -0.9], [-1.45, -0.9]]) g.add(wheel(0.4, 0.3, x, 0.4, z));
  return g;
}

export class Player {
  constructor(ctx) {
    Object.assign(this, ctx); // world, scene, tv, trees, objects, cannons, getLifts, season()
    this.active = false;
    this.input = { x: 0, y: 0, jump: false, brake: false, boost: false };
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.camYaw = 0; this.camPitch = 0.32; this.camDist = 9;
    this.camPos = new THREE.Vector3();
    this.msg = ''; this.msgT = 0;
    this.score = 0;
  }

  start(mode, x, z, yaw = 0) {
    this.stop();
    this.mode = mode;
    this.mesh = this.makeMesh(mode);
    this.scene.add(this.mesh);
    this.pos.set(x, this.groundAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.onGround = true; this.air = 0; this.spin = 0; this.crash = 0; this.ride = null; this.lean = 0; this.v = 0;
    this.vehicle = VEH[mode] || null;
    this.camDist = this.vehicle ? this.vehicle.camBack : 8;
    this.camPitch = this.vehicle ? 0.35 : 0.3;
    this.camYaw = 0;
    this.camPos.set(x - Math.cos(yaw) * this.camDist, this.pos.y + 6, z + Math.sin(yaw) * this.camDist);
    this.active = true;
    this.treeT = 0;
    this.msg = ''; this.msgT = 0; this.snapCam = true;
    this.tiller = true;
    if (mode === 'bully' && this.mesh.userData.lights) for (const m of this.mesh.userData.lights) m.emissive.setHex(0xfff2cc);
  }

  makeMesh(mode) {
    if (VEH[mode]) return vehicleMesh(mode, { bullyModel: this.bullyModel ? this.bullyModel() : 400, bullyColor: this.bullyColor ? this.bullyColor() : 0x2f6fe0 });
    if (mode === 'ski') return makeSkierRig(0xff3b30, 0x22313f, 0);
    if (mode === 'bike') return makeBikeRig(0x1d7fd6, 0x22313f, 2);
    return figureMesh(hikerGeometry, 0xff9f1c);
  }

  stop() {
    this.unhookWinch();
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.mesh = null; }
    if (this.seatMesh) { this.scene.remove(this.seatMesh); this.seatMesh = null; }
    if (this.ride && this.ride.lift) this.ride.lift.playerSeat = null;
    this.active = false; this.ride = null;
  }

  say(m, t = 1.6) { this.msg = m; this.msgT = t; }

  groundAt(x, z) {
    const g = heightAt(this.world, x, z);
    const o = this.objects ? this.objects.surfaceAt(x, z, g) : -Infinity;
    return Math.max(g, o);
  }
  normalAt(x, z) {
    const e = 0.6;
    const hx = this.groundAt(x + e, z) - this.groundAt(x - e, z), hz = this.groundAt(x, z + e) - this.groundAt(x, z - e);
    const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize();
    if (n.y < 0.2) { const t = normalAt(this.world, x, z); n.set(t.x, t.y, t.z); }
    return n;
  }

  onBridge(x, z) { const g = heightAt(this.world, x, z); return this.objects && this.objects.surfaceAt(x, z, g) > g + 0.4; }

  surface() {
    const { x, z } = this.pos;
    const w = this.world;
    if (this.onBridge(x, z)) return 'road';
    if (inWater(w, x, z, -2)) return 'water';
    const [px, py] = this.tv.toPx(x, z);
    const b = this.tv.blocked[Math.floor(py) * this.tv.T + Math.floor(px)];
    if (b === 1) return 'road';
    if (this.tv.pisteAt(x, z)) return 'piste';
    if (this.tv.trailAt(x, z)) return 'trail';
    return 'off';
  }

  nearLift() {
    let best = null, bd = 30;
    for (const l of this.getLifts()) {
      if (!l.running || l.open === false || l.garaging) continue;
      const t = l.type;
      const bx = l.A.x + l.dir.x * t.Ls * 0.6, bz = l.A.z + l.dir.z * t.Ls * 0.6;
      const d = Math.hypot(this.pos.x - bx, this.pos.z - bz);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  rideLift(l) {
    if (this.vehicle) return false;
    this.ride = { lift: l, r: l.startRide(), e: 0 };
    this.vel.set(0, 0, 0);
    if (!this.seatMesh) { this.seatMesh = figureMesh(riderGeometry, this.mode === 'bike' ? 0x1d7fd6 : 0xff3b30); this.scene.add(this.seatMesh); }
    this.say('🚡 ' + l.displayName, 2);
    this.snapCam = true;
    return true;
  }

  update(dt, camera, time) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    if (this.msgT > 0) this.msgT -= dt;
    if (this.ride) this.updateRide(dt);
    else if (this.vehicle) this.updateVehicle(dt, time);
    else if (this.mode === 'walk') this.updateWalk(dt, camera);
    else this.updateSlide(dt);
    this.updateCamera(dt, camera);
  }

  updateRide(dt) {
    const R = this.ride;
    R.e += dt;
    const o = R.r.sample(R.e, {});
    this.pos.set(o.x, o.y, o.z);
    this.yaw = o.yaw;
    const seated = o.pose === 'seat';
    this.mesh.visible = o.pose === 'stand';
    this.seatMesh.visible = seated;
    if (seated) {
      if (o.matrix) { this.seatMesh.matrixAutoUpdate = false; this.seatMesh.matrix.copy(o.matrix); this.seatMesh.matrixWorldNeedsUpdate = true; }
      else { this.seatMesh.matrixAutoUpdate = true; this.seatMesh.position.set(o.x, o.y, o.z); this.seatMesh.rotation.set(0, o.yaw, 0); }
    }
    if (o.pose === 'stand') { this.mesh.position.set(o.x, o.y, o.z); this.mesh.rotation.set(0, o.yaw, 0); }
    if (o.done || R.e >= R.r.duration) {
      const ep = R.lift.exitPoint;
      this.pos.set(ep.x, this.groundAt(ep.x, ep.z), ep.z);
      const n = normalAt(this.world, ep.x, ep.z);
      this.yaw = Math.atan2(-n.z, n.x);
      if (R.lift) R.lift.playerSeat = null;
      this.ride = null; this.mesh.visible = true; this.seatMesh.visible = false;
      this.vel.set(0, 0, 0); this.onGround = true;
      this.say('Oben angekommen! ⛰️', 2);
      this.snapCam = true;
    }
  }

  crashNow(why) {
    this.crash = 2.2; this.vel.set(0, 0, 0); this.say(why || 'Sturz! 💥', 2.2);
  }

  // obstacle check around (x,z) at height y: returns { nx, nz, kind } (push-out normal) or null
  obstacle(x, z, y, r) {
    const t = this.trees.nearestTree(x, z, r + 0.6);
    if (t && t.d < r + 0.45) { const d = t.d || 0.01; return { nx: (x - t.x) / d, nz: (z - t.z) / d, kind: 'tree' }; }
    if (this.rocks) { const k = this.rocks.nearest(x, z, r + 0.4); if (k && k.d < r && y < this.groundAt(k.x, k.z) + k.s * 0.6) { const d = Math.hypot(x - k.x, z - k.z) || 0.01; return { nx: (x - k.x) / d, nz: (z - k.z) / d, kind: 'rock' }; } }
    for (const l of this.getLifts()) for (const tp of l.towerPositions || []) {
      const d = Math.hypot(x - tp.x, z - tp.z);
      if (d < r + 0.9 && y < tp.top) return { nx: (x - tp.x) / (d || 0.01), nz: (z - tp.z) / (d || 0.01), kind: 'tower' };
    }
    if (this.world.obstacleAt) { const top = this.world.obstacleAt(x, z, r); if (top > y + 1.2) return { nx: 0, nz: 0, kind: 'house' }; }
    if (this.objects) {
      const o = this.objects.nearest(x, z, 14);
      const RR = { chalet: 6.5, chalet_gross: 7.5, hotel: 11, restaurant: 9, kasse: 2.5, steinhaus: 6, engadiner: 7.5, modernhaus: 6.5, apartment: 11, sportshop: 7.5, kirche: 10, stall: 5 };
      if (o && !o.line && RR[o.type]) {
        const rr = RR[o.type];
        const d = Math.hypot(x - o.x, z - o.z);
        if (d < rr + r) return { nx: (x - o.x) / (d || 0.01), nz: (z - o.z) / (d || 0.01), kind: 'house' };
      }
    }
    return null;
  }

  // bounce off an obstacle; returns true if it was a crash
  hit(ob, speed, crashAt, msg) {
    if (ob.nx === 0 && ob.nz === 0) { ob.nx = -this.vel.x; ob.nz = -this.vel.z; const l = Math.hypot(ob.nx, ob.nz) || 1; ob.nx /= l; ob.nz /= l; }
    const vn = this.vel.x * ob.nx + this.vel.z * ob.nz;
    if (vn < 0) { this.vel.x -= 1.5 * vn * ob.nx; this.vel.z -= 1.5 * vn * ob.nz; }
    this.pos.x += ob.nx * 0.25; this.pos.z += ob.nz * 0.25;
    if (speed > crashAt) { this.crashNow(msg); return true; }
    if (speed > 2.5) this.say(ob.kind === 'rock' ? 'Aua, ein Felsen! 🪨' : ob.kind === 'tree' ? 'Uff, Baum! 🌲' : ob.kind === 'tower' ? 'Autsch, Stütze! 🗼' : 'Bumm! 🏠', 1.2);
    return false;
  }

  // skiing and biking: carving skis / bike with grip, skidding, powder, drag, air, landings
  updateSlide(dt) {
    const ski = this.mode === 'ski';
    const inp = this.input;
    const G = 9.81;
    if (this.crash > 0) {
      this.crash -= dt;
      this.mesh.rotation.set(0, this.yaw, 1.4);
      this.mesh.position.copy(this.pos);
      if (this.crash <= 0) { this.pos.y = this.groundAt(this.pos.x, this.pos.z); this.edge = 0; }
      return;
    }
    const surf = this.surface();
    if (surf === 'water') { this.crashNow('Platsch! Ins Wasser gefallen 💦'); const n = normalAt(this.world, this.pos.x, this.pos.z); this.pos.x -= n.x * 25; this.pos.z -= n.z * 25; return; }
    const winter = this.season() === 0;
    const cover = this.cover ? this.cover() : { nat: 1, piste: 1, temp: -5, fresh: 0.5 };
    this.edge = this.edge || 0;
    const f = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let yawRate = 0;
    if (this.onGround) {
      const n = this.normalAt(this.pos.x, this.pos.z);
      f.addScaledVector(n, -f.dot(n)).normalize();
      const l = new THREE.Vector3().crossVectors(n, f).normalize();
      const gt = new THREE.Vector3(0, -G, 0); gt.addScaledVector(n, G * n.y);
      let vf = this.vel.dot(f), vl = this.vel.dot(l);
      const sp = Math.hypot(vf, vl);
      const braking = inp.brake || inp.y < -0.3;
      // --- surface properties: rolling/sliding friction, grip, powder sink
      let mu, grip, sink = 0;
      if (ski) {
        if (surf === 'piste') { const fresh = this.tv.groomAt ? this.tv.groomAt(this.pos.x, this.pos.z) : 0.6; mu = 0.032 + (1 - fresh) * 0.02; grip = 9 + fresh * 3; if (cover.piste < 0.35) { mu += 0.25 * (0.35 - cover.piste) / 0.35; } }
        else if (surf === 'road') { mu = cover.road > 0.3 ? 0.08 : 0.55; grip = 5; }
        else if (!winter || cover.nat < 0.15) { mu = 0.7; grip = 4; }
        else { mu = 0.05; grip = 6; sink = 0.006 + cover.fresh * 0.01; } // powder: floats, but slows
        if (cover.temp > 3) mu += 0.025; // slush in the afternoon
      } else {
        mu = surf === 'trail' ? 0.014 : surf === 'road' ? 0.009 : surf === 'piste' ? 0.03 : winter ? 0.12 : 0.045;
        grip = surf === 'trail' ? 11 : surf === 'road' ? 13 : winter ? 3.5 : 7.5;
      }
      // --- edge angle follows the steering input (carving) or both skis across (braking)
      this.edge += (clamp(inp.x, -1, 1) - this.edge) * Math.min(1, dt * (ski ? 5 : 7));
      if (ski) {
        // turn radius of a carving ski: tighter with more edge, long arcs at high speed
        const R = lerp(9, 24, clamp(sp / 24, 0, 1)) / Math.max(0.15, Math.abs(this.edge));
        yawRate = sp > 2.5 ? -Math.sign(this.edge) * sp / R : -this.edge * 1.6;
        if (braking) yawRate *= 1.4;
      } else {
        yawRate = -this.edge * lerp(2.3, 0.85, clamp(sp / 13, 0, 1));
      }
      this.yaw += yawRate * dt;
      // the ground can only hold a limited sideways force: beyond that the skis/tyres skid
      const need = Math.abs(yawRate * sp);
      const maxA = (ski ? (surf === 'piste' ? 10 : 6) : grip * 0.9) * (braking && ski ? 1.3 : 1);
      let skid = need > maxA ? clamp((need - maxA) / maxA, 0, 1) : 0;
      if (braking && ski) skid = Math.max(skid, 0.75);
      // gravity, pedalling
      let push = 0;
      if (!ski && inp.y > 0.15) push = Math.min(3.4, 280 / 90 / Math.max(1, sp)) * inp.y * (inp.boost ? 1.3 : 1);
      if (ski && inp.y > 0.2 && sp < 3.5) push = 1.6; // skating
      vf += (gt.dot(f) + push) * dt;
      vl += gt.dot(l) * dt * (1 - 0.6 * (1 - skid)); // carving edge resists sliding down sideways
      // lateral velocity bleeds into the direction of the skis (grip); less when skidding
      const g2 = grip * (ski ? 0.6 + 0.5 * Math.abs(this.edge) : 1) * (1 - 0.75 * skid);
      vl *= Math.exp(-dt * g2);
      // friction, skid friction, air drag, powder drag
      const tuck = ski && inp.y > 0.3;
      const drag = (tuck ? 0.0016 : ski ? 0.0032 : 0.0036) * sp * sp + sink * sp * sp;
      let dec = mu * G * n.y + drag + skid * (ski ? 4.5 : 3) + (braking ? (ski ? 2.5 : 5.5) : 0);
      const spd2 = Math.hypot(vf, vl);
      if (spd2 > 0) { const red = Math.min(spd2, dec * dt); vf -= vf / spd2 * red; vl -= vl / spd2 * red; }
      this.vel.copy(f).multiplyScalar(vf).addScaledVector(l, vl);
      // body leans into the turn (centripetal), skidding turns the hips
      const leanT = Math.atan(clamp(yawRate * sp / G, -1.2, 1.2)) * 0.85;
      this.lean = lerp(this.lean, -leanT, Math.min(1, dt * 7));
      this.skid = skid;
      if (inp.jump) { this.vel.addScaledVector(n, ski ? 4.2 : 3.8); this.onGround = false; this.air = 0; this.spin = 0; inp.jump = false; }
      // obstacles
      const ob = this.obstacle(this.pos.x, this.pos.z, this.pos.y, 0.5);
      if (ob && this.hit(ob, sp, ob.kind === 'tree' ? 7 : 9, ob.kind === 'tree' ? 'Baum! 🌲💥' : 'Zusammenstoss! 💥')) return;
      // tracks in the snow / dirt
      if (this.tracks && sp > 0.8) {
        if (ski && winter) this.tracks.add('p', this.pos.x, this.pos.y, this.pos.z, this.yaw, [-0.13, 0.13], skid > 0.3 ? 0.6 : 0.1, 0x8fa4bd, surf === 'piste' ? 0.22 : 0.5);
        else if (!ski && (winter || surf === 'off')) this.tracks.add('p', this.pos.x, this.pos.y, this.pos.z, this.yaw, [0], 0.09, winter ? 0x8fa4bd : 0x5a4632, winter ? 0.5 : 0.3);
      }
    } else {
      this.vel.y -= G * dt;
      this.vel.multiplyScalar(1 - 0.0011 * this.vel.length() * dt);
      this.air += dt;
      const s = -inp.x * 5 * dt;
      this.yaw += s; this.spin += s;
      if (this.tracks) this.tracks.break('p');
    }
    this.pos.addScaledVector(this.vel, dt);
    const lim = this.world.S / 2 - 3;
    this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    const gy = this.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      const n = this.normalAt(this.pos.x, this.pos.z);
      if (!this.onGround && this.land(gy, n)) return;
      this.pos.y = gy;
      const vn = this.vel.dot(n); if (vn < 0) this.vel.addScaledVector(n, -vn);
      this.onGround = true;
    } else if (this.onGround && this.pos.y - gy < 0.4 && this.vel.y < 3) {
      this.pos.y = gy;
    } else this.onGround = false;
    // pose: lean into the turn, crouch when tucking, hips turn when skidding
    this.mesh.position.copy(this.pos);
    const skidYaw = ski && this.onGround ? (this.skid || 0) * 0.5 * Math.sign(this.edge || 1) : 0;
    this.mesh.rotation.set(this.onGround ? this.lean : 0, this.yaw - skidYaw, 0, 'YXZ');
    if (this.mesh.setPose) {
      // skis on the snow, knees bend with the lean, tuck when pushing forward, upper body against the turn
      const nG = this.onGround ? normalAt(this.world, this.pos.x, this.pos.z) : new THREE.Vector3(0, 1, 0);
      const ai = Math.abs(this.lean), tuck = this.input.y > 0.3 ? 1 : 0;
      this.tuckS = (this.tuckS || 0) + (tuck - (this.tuckS || 0)) * Math.min(1, dt * 6);
      const flexT = !this.onGround ? 0.5 : 0.12 + ai * 0.4 + (this.landT > 0 ? 0.5 : 0);
      this.flexS = (this.flexS || 0.2) + (flexT - (this.flexS || 0.2)) * Math.min(1, dt * 8);
      if (Math.sign(this.edge || 0) !== (this.turnSign || 0) && Math.abs(this.edge || 0) > 0.3) { this.turnSign = Math.sign(this.edge); this.plant = 0.45; }
      this.plant = Math.max(0, (this.plant || 0) - dt);
      const pp = this.plant > 0 ? Math.sin((1 - this.plant / 0.45) * Math.PI) : 0;
      const side = -(this.turnSign || 0); // inside pole
      const pBase = -0.75 - this.tuckS * 0.75;
      this.mesh.setPose(nG, this.flexS, skidYaw * 0.8 + (this.skid || 0) * 0.2 * Math.sign(this.edge || 0), this.lean * 0.4, pBase + (side < 0 ? pp * 0.95 : 0), pBase + (side > 0 ? pp * 0.95 : 0), (this.skid || 0) > 0.3 ? -Math.sign(this.edge || 0) * 0.35 * this.skid : 0, this.tuckS);
    } else if (this.mesh.setBike) {
      // bike: wheels roll with the speed, pedalling when not coasting fast downhill
      const nG = this.onGround ? normalAt(this.world, this.pos.x, this.pos.z) : new THREE.Vector3(0, 1, 0);
      const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw), sp = this.vel.x * fx + this.vel.z * fz;
      const coast = sp > 9 && this.input.y <= 0.3 || !this.onGround;
      this.mesh.setBike(nG, sp, dt, !coast);
    } else {
      const crouch = ski && this.input.y > 0.3 ? 0.84 : !this.onGround ? 0.9 : 1;
      this.mesh.scale.y += (crouch - this.mesh.scale.y) * Math.min(1, dt * 8);
    }
  }

  land(gy, n) {
    const sp = Math.abs(this.spin) * 180 / Math.PI;
    const air = this.air;
    this.spin = 0; this.air = 0;
    // impact speed into the slope (landing on a steep landing hill is soft, flat landing is hard)
    const vIn = -(this.vel.x * n.x + this.vel.y * n.y + this.vel.z * n.z);
    // align heading with travel direction (switch landings allowed)
    const h = Math.atan2(-this.vel.z, this.vel.x);
    let d = h - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    if (Math.abs(d) > Math.PI * 0.5) { d = Math.atan2(Math.sin(d + Math.PI), Math.cos(d + Math.PI)); this.yaw += Math.PI; }
    if (vIn > 12) { this.crashNow('Harte Landung! 💥'); return true; }
    if (Math.abs(d) > 0.9 && hsp > 6) { this.crashNow('Verkantet bei der Landung! 💥'); return true; }
    this.yaw += d * 0.6;
    if (vIn > 7) this.say('Puh, harte Landung 😬', 1);
    if (sp >= 160) { const r = Math.round(sp / 180) * 180; this.score += r; this.say(`${r}° Spin! 🔥`); }
    else if (air > 0.8) { this.score += Math.round(air * 50); this.say(`Air ${air.toFixed(1)} s ✈️`); }
    void gy;
    return false;
  }

  updateWalk(dt, camera) {
    const inp = this.input;
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const want = new THREE.Vector3().addScaledVector(fwd, inp.y).addScaledVector(right, inp.x);
    const mag = Math.min(1, want.length());
    // deep snow off the pistes makes walking slow, roads and paths are fast
    const surf = this.surface(), winter = this.season() === 0;
    const sf = surf === 'road' || surf === 'trail' ? 1 : winter ? (surf === 'piste' ? 0.85 : 0.55) : 0.9;
    let speed = (inp.boost ? 5 : 1.6) * mag * sf;
    if (mag > 0.05) { want.normalize(); let d = Math.atan2(-want.z, want.x) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 10); }
    const n = normalAt(this.world, this.pos.x, this.pos.z);
    const up = -(want.x * n.x + want.z * n.z); // >0 = uphill
    speed *= clamp(1 - up * 1.6, 0.25, 1.25);
    // smooth acceleration
    this.wv = this.wv || new THREE.Vector3();
    this.wv.x += (want.x * speed - this.wv.x) * Math.min(1, dt * 8);
    this.wv.z += (want.z * speed - this.wv.z) * Math.min(1, dt * 8);
    const nx = this.pos.x + this.wv.x * dt, nz = this.pos.z + this.wv.z * dt;
    const ob = this.obstacle(nx, nz, this.pos.y, 0.35);
    if (ob) { this.wv.multiplyScalar(0); }
    else if (!inWater(this.world, nx, nz, -3) || this.onBridge(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    const gy = this.groundAt(this.pos.x, this.pos.z);
    if (inp.jump && this.onGround) { this.vel.y = 4.5; this.onGround = false; inp.jump = false; }
    this.vel.y -= 9.81 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; this.onGround = true; }
    else if (this.onGround && this.pos.y - gy < 0.5) this.pos.y = gy;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
    const v = Math.hypot(this.wv.x, this.wv.z);
    this.walkPh = (this.walkPh || 0) + v * dt * 4;
    this.mesh.position.y += Math.abs(Math.sin(this.walkPh)) * 0.06 * clamp(v, 0, 1);
    if (this.tracks && winter && surf !== 'road' && v > 0.3) this.tracks.add('p', this.pos.x, this.pos.y, this.pos.z, this.yaw, [-0.14, 0.14], 0.22, 0x8fa4bd, surf === 'piste' ? 0.15 : 0.45);
  }

  // vehicles: velocity with lateral slip (drifting on snow), slope, grip by surface, body roll/pitch
  updateVehicle(dt, time) {
    const c = this.vehicle, inp = this.input;
    const winter = this.season() === 0;
    const n = normalAt(this.world, this.pos.x, this.pos.z);
    const f = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const l = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let vf = this.vel.x * f.x + this.vel.z * f.z, vl = this.vel.x * l.x + this.vel.z * l.z;
    const surf = this.surface();
    const roadSnow = this.roadSnow ? (this.roadSnow(this.pos.x, this.pos.z) || 0) : 0;
    // grip and top speed by surface
    let grip, vmax = c.vmax, rr = 0.25;
    const tracked = this.mode === 'bully';
    if (tracked) { grip = 1.1; rr = 1.5; }
    else if (this.mode === 'skidoo') { grip = winter && surf !== 'road' ? 0.55 : 0.35; if (!winter) vmax *= 0.2; }
    else if (surf === 'road') { grip = winter ? lerp(0.95, 0.3, roadSnow) : 1; if (winter) vmax *= 1 - roadSnow * 0.45; }
    else { grip = winter ? 0.28 : 0.55; vmax *= winter ? 0.35 : 0.5; rr = 1.2; }
    const steep = 1 - n.y;
    const BM = tracked ? (BULLY_MODELS[this.mesh.userData.model] || BULLY_MODELS[400]) : null;
    // top speed of the groomer (settings: tiller up / down, km/h), a bit less on steep ground
    const bs = this.bullySpeeds ? this.bullySpeeds() : { free: 40, tiller: 30 };
    if (this.mode === 'bully' && inp.jump) { inp.jump = false; this.tiller = !this.tiller; this.say(this.tiller ? '⬇️ Fräse unten: präparieren' : '⬆️ Fräse oben', 1.4); }
    else if (this.mode !== 'bully') inp.jump = false;
    if (tracked) { vmax = (this.tiller ? bs.tiller : bs.free) / 3.6 * BM.vmax / 7.5; vmax *= clamp(1.25 - steep * 2.2 / BM.climb * (this.winch ? 0.35 : 1), 0.45, 1); }
    if (inp.boost) vmax *= 1.3;
    // engine (less force near top speed), brakes, rolling resistance, gravity along the slope
    const acc0 = vf;
    if (inp.y > 0.1) vf += c.acc * inp.y * clamp(1 - vf / vmax, 0, 1) * Math.min(1, grip * 1.4) * dt;
    else if (inp.y < -0.1) { if (vf > 0.5) vf -= c.acc * 2 * -inp.y * Math.min(1, grip * 1.3) * dt; else vf = Math.max(-c.vback, vf + c.acc * inp.y * dt); }
    if (inp.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * Math.min(1, grip * 1.3) * dt);
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), rr * dt);
    const slope = n.x * f.x + n.z * f.z; // >0: downhill ahead
    vf += slope * 9.81 * (tracked ? 0.25 : 0.9) * dt;
    if (tracked) {
      // climbing limit: too steep uphill -> the tracks spin and the groomer slides back, unless the
      // winch rope is hooked in (pulls towards the anchor, up to 70 degrees)
      const upDeg = Math.atan(Math.max(0, -slope) / Math.max(0.2, n.y)) * 180 / Math.PI;
      const lim = this.winch ? 70 : BM.maxDeg;
      if (upDeg > lim && vf > -0.5) {
        vf -= ((upDeg - lim) * 0.35 + 1.2) * dt;
        if (inp.y > 0.1) { this.slipT = (this.slipT || 0) - dt; if (this.slipT <= 0) { this.slipT = 2.5; this.say(this.mesh.userData.winch ? '⛔ Zu steil! Winde einhängen (H) 🪝' : '⛔ Zu steil für diesen Bully – der 600er hat eine Seilwinde', 2.2); } }
      }
      if (this.winch) {
        const dx = this.winch.x - this.pos.x, dz = this.winch.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
        const toward = (dx * f.x + dz * f.z) / dl;
        if (inp.y > 0.1 && toward > 0.2) vf += 1.2 * toward * dt; // the winch helps pulling uphill
        if (vf < 0 && toward > 0.3 && inp.y >= 0) vf *= Math.exp(-dt * 6); // and holds the machine
        if (dl > 1000) { this.unhookWinch(); this.say('Seil zu lang – Winde ausgehängt', 2); }
      }
    }
    vl += (n.x * l.x + n.z * l.z) * 9.81 * (tracked ? 0.1 : 0.6) * dt;
    if (vf > vmax * 1.15) vf -= (vf - vmax) * Math.min(1, dt * 2);
    // steering: needs speed (except tracked), weaker with little grip (understeer)
    const steer = -inp.x;
    const turnF = tracked ? 1 : clamp(Math.abs(vf) / 5, 0, 1) * (0.45 + 0.55 * Math.min(1, grip));
    const yr = steer * c.turn * turnF * (vf < -0.1 ? -1 : 1);
    this.yaw += yr * dt;
    // lateral slip decays with grip -> on snow the car drifts
    vl *= Math.exp(-dt * 9 * grip * grip);
    const nf = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), nl = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // part of the old forward speed carries over into the new heading according to grip
    const keep = Math.min(1, grip * 1.2);
    const vx = (nf.x * vf + nl.x * vl) * keep + (f.x * vf + l.x * vl) * (1 - keep);
    const vz = (nf.z * vf + nl.z * vl) * keep + (f.z * vf + l.z * vl) * (1 - keep);
    this.vel.set(vx, 0, vz);
    this.v = vx * nf.x + vz * nf.z;
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    const speed = Math.hypot(vx, vz);
    if (inWater(this.world, nx, nz, -4) && !this.onBridge(nx, nz)) { this.vel.set(0, 0, 0); this.v = 0; this.say('Da ist Wasser! 🌊'); }
    else {
      const ob = tracked ? null : this.obstacle(nx + nf.x * 1.8, nz + nf.z * 1.8, this.pos.y, this.mode === 'bus' ? 1.4 : 1.0);
      if (ob) { this.hit(ob, 0, 99, ''); this.vel.multiplyScalar(0.3); if (speed > 3) this.say(ob.kind === 'tree' ? 'Bumm! 🌲' : 'Bumm! 💥', 1.2); }
      else { this.pos.x = nx; this.pos.z = nz; }
    }
    const lim = this.world.S / 2 - 5;
    this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    this.pos.y = this.groundAt(this.pos.x, this.pos.z);
    // body: follow the ground, roll in turns, pitch when accelerating/braking (suspension)
    const aLong = (this.v - acc0) / Math.max(dt, 1e-3), aLat = yr * this.v;
    this.pitchB = lerp(this.pitchB || 0, clamp(aLong * 0.008, -0.07, 0.07), Math.min(1, dt * 6));
    this.rollB = lerp(this.rollB || 0, clamp(aLat * (tracked ? 0.004 : 0.012), -0.09, 0.09), Math.min(1, dt * 6));
    const qn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z));
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rollB, 0, this.pitchB));
    this.mesh.quaternion.slerp(qn.multiply(qy).multiply(qb), Math.min(1, dt * 8));
    this.mesh.position.copy(this.pos);
    // tracks
    if (this.tracks && speed > 0.6) {
      if (tracked && winter) {
        // with the tiller down the groomed corduroy covers the track marks
        if (!this.tiller) { const sc = (BULLY_MODELS[this.mesh.userData.model] || BULLY_MODELS[400]).scale; this.tracks.add('v', this.pos.x, this.pos.y, this.pos.z, this.yaw, [-1.78 * sc, 1.78 * sc], 1.4 * sc, 0x9fb1c6, 0.35); }
        else this.tracks.break('v');
      }
      else if (this.mode === 'skidoo' && winter) this.tracks.add('v', this.pos.x, this.pos.y, this.pos.z, this.yaw, [0], 0.5, 0x8fa4bd, 0.45);
      else if (winter && (surf !== 'road' || roadSnow > 0.15)) this.tracks.add('v', this.pos.x, this.pos.y, this.pos.z, this.yaw, [-0.8, 0.8], 0.3, surf === 'road' ? 0x55606b : 0x8fa4bd, 0.45);
    }
    if (this.mode === 'bully') {
      const fx = nf.x, fz = nf.z;
      const tl = this.mesh.userData.tiller;
      if (tl) tl.rotation.z += ((this.tiller ? 0 : -0.55) - tl.rotation.z) * Math.min(1, dt * 3);
      if (this.tiller && Math.abs(this.v) > 0.3 && winter) {
        const gw = this.mesh.userData.groomW || 5.2, go = this.mesh.userData.groomOff || 4.1;
        this.tv.groomStroke(this.pos.x - fx * go, this.pos.z - fz * go, this.yaw, Math.max(gw, 4.8), Math.abs(this.v) * dt + 3.2, true);
        this.eraseT = (this.eraseT || 0) - dt;
        if (this.eraseT <= 0 && this.tracks) { this.eraseT = 0.12; this.tracks.erase(this.pos.x - fx * go, this.pos.z - fz * go, Math.max(gw, 4.8) / 2 + 0.6); }
      }
      if (this.mesh.userData.beacon) this.mesh.userData.beacon.material.emissive.setHex(Math.sin(time * 8) > 0 ? 0xff9900 : 0x000000);
      this.updateWinchRope();
      this.treeT += dt;
      if (this.treeT > 0.25 && Math.abs(this.v) > 0.5) {
        this.treeT = 0;
        this.trees.removeCircle(this.pos.x + fx * 3, this.pos.z + fz * 3, 3.5);
        this.cannons.flattenNear(this.pos.x, this.pos.z, 5);
      }
    }
  }

  // ---- winch (Strassenbully 600): hook the rope to an anchor at the top of the slope above
  toggleWinch() {
    if (this.mode !== 'bully' || !this.mesh) return;
    if (this.winch) { this.unhookWinch(); this.say('🪝 Winde ausgehängt', 1.6); return; }
    if (!this.mesh.userData.winch) { this.say('Nur der Strassenbully 600 hat eine Seilwinde', 2); return; }
    // walk up the fall line until it stops rising: there the anchor is set
    let x = this.pos.x, z = this.pos.z, h = heightAt(this.world, x, z), best = null;
    for (let k = 0; k < 90; k++) {
      const n = normalAt(this.world, x, z), l = Math.hypot(n.x, n.z);
      if (l < 0.03) break;
      const nx = x - n.x / l * 10, nz = z - n.z / l * 10, nh = heightAt(this.world, nx, nz);
      if (nh < h + 0.6) break;
      x = nx; z = nz; h = nh; best = { x, z };
    }
    if (!best || Math.hypot(best.x - this.pos.x, best.z - this.pos.z) < 40) { this.say('Hier gibt es oben keinen Ankerpunkt', 2); return; }
    this.winch = { x: best.x, z: best.z, y: h };
    const post = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 8), lam(0x3a3f46)); m1.position.y = 1.1; post.add(m1);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), lam(0xd42a1e)); m2.position.y = 0.25; post.add(m2);
    post.position.set(best.x, h, best.z); this.scene.add(post);
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3()));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x111111 })); line.frustumCulled = false; this.scene.add(line);
    this.winchObj = { post, line };
    this.say(`🪝 Winde eingehängt (${Math.round(Math.hypot(best.x - this.pos.x, best.z - this.pos.z))} m Seil) – jetzt geht es auch steil hoch`, 2.5);
  }
  unhookWinch() {
    this.winch = null;
    if (this.winchObj) { this.scene.remove(this.winchObj.post, this.winchObj.line); this.winchObj.line.geometry.dispose(); this.winchObj = null; }
  }
  updateWinchRope() {
    if (!this.winchObj || !this.mesh) return;
    const tip = new THREE.Vector3(); this.mesh.userData.ropeTip.getWorldPosition(tip);
    const a = this.winch, pos = this.winchObj.line.geometry.attributes.position, n = pos.count;
    const L = Math.hypot(a.x - tip.x, a.z - tip.z);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), x = tip.x + (a.x - tip.x) * u, z = tip.z + (a.z - tip.z) * u;
      let y = tip.y + (a.y + 1.9 - tip.y) * u - Math.sin(u * Math.PI) * Math.min(6, L * 0.01);
      y = Math.max(y, heightAt(this.world, x, z) + 0.15);
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  get speedKmh() { return Math.round((this.vehicle ? Math.abs(this.v || 0) : Math.hypot(this.vel.x, this.vel.z)) * 3.6); }

  updateCamera(dt, camera) {
    const p = this.pos;
    const yaw = this.yaw + Math.PI + this.camYaw;
    const dist = this.camDist, pitch = this.camPitch;
    const want = new THREE.Vector3(p.x + Math.cos(yaw) * Math.cos(pitch) * dist, p.y + 1.6 + Math.sin(pitch) * dist, p.z - Math.sin(yaw) * Math.cos(pitch) * dist);
    const gy = heightAt(this.world, want.x, want.z) + 1.2;
    if (want.y < gy) want.y = gy;
    if (this.snapCam) { this.camPos.copy(want); this.snapCam = false; } else this.camPos.lerp(want, Math.min(1, dt * (this.ride ? 4 : 5)));
    camera.position.copy(this.camPos);
    camera.lookAt(p.x, p.y + (this.vehicle ? 2 : 1.3), p.z);
  }
}
