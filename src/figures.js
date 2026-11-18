// Simple Roblox-style figures: skiers, lift riders. Each returns { jacket, rest } geometries
// (jacket gets per-instance colour, rest has fixed vertex colours). Facing +x, origin at feet/seat.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GFX } from './gfx.js';

// rounder shapes instead of plain boxes: limbs = cylinders, heads = spheres, torsos = rounded boxes
function baseGeo(w, h, d) {
  const mn = Math.min(w, h, d), mx = Math.max(w, h, d);
  if (mn < 0.09) return new THREE.BoxGeometry(w, h, d);
  const U = GFX.ultra;
  if (h >= 1.8 * Math.max(w, d)) return new THREE.CylinderGeometry(0.5, 0.42, 1, U ? 12 : 7).scale(w, h, d);
  if (mx / mn < 1.9 && mx < 0.36) return new THREE.SphereGeometry(0.5, U ? 16 : 9, U ? 12 : 7).scale(w * 1.08, h * 1.12, d * 1.08);
  return new RoundedBoxGeometry(w, h, d, U ? 2 : 1, mn * 0.4);
}
function part(w, h, d, x, y, z, color, rz = 0, rx = 0) {
  const b0 = baseGeo(w, h, d); const g = b0.index ? b0.toNonIndexed() : b0;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function ring(R, r, x, y, color) {
  const g = new THREE.TorusGeometry(R, r, 6, 18).toNonIndexed();
  g.deleteAttribute('uv'); g.translate(x, y, 0);
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// smooth body shell from a stack of rounded (superellipse) rings: each ring = [y, half depth along
// the facing axis, half width, offset along the facing axis]. face 'x' (skiers) or 'z' (walkers).
export function bodyShell(rings, color, face = 'x', n = null) {
  const N = n || (GFX.ultra ? 20 : 12), pos = [], idx = [];
  const se = (a) => { const c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.pow(Math.abs(c), 0.75), Math.sign(s) * Math.pow(Math.abs(s), 0.75)]; };
  for (const [y, hd, hw, off] of rings) for (let k = 0; k < N; k++) {
    const [c, s] = se(k / N * Math.PI * 2), fwd = c * hd + (off || 0), side = s * hw;
    if (face === 'x') pos.push(fwd, y, side); else pos.push(side, y, fwd);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < N; k++) {
    const a = i * N + k, b = i * N + (k + 1) % N, c = (i + 1) * N + k, d = (i + 1) * N + (k + 1) % N;
    if (face === 'x') idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  // caps
  for (const [ri, up] of [[0, false], [rings.length - 1, true]]) {
    const r = rings[ri], ci = pos.length / 3; if (face === 'x') pos.push(r[3] || 0, r[0], 0); else pos.push(0, r[0], r[3] || 0);
    for (let k = 0; k < N; k++) { const a = ri * N + k, b = ri * N + (k + 1) % N; const fl = face === 'x' ? !up : up; if (fl) idx.push(ci, a, b); else idx.push(ci, b, a); }
  }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g = g.toNonIndexed();
  return paint(g, color);
}

const PANTS = 0x2a2f3a, SKIN = 0xf2c9a0, HELMET = 0x1d1f24, SKI = 0x222222, POLE = 0x9aa0a6, GOGGLE = 0xff9a1f;

export function skierGeometry() {
  const parts = skierPartGeometries(1), pose = new SkierPose();
  pose.compute(new THREE.Vector3(0, 1, 0), 0.25, 0, 0, -0.55, -0.55);
  return mergedPose(pose, parts, { pants: PANTS });
}

// seated on a chair: origin at the seat surface, facing +x (built from the articulated parts)
export function riderGeometry() {
  const parts = skierPartGeometries(2), pose = new SkierPose(), m = pose.m;
  const Q = (rz, rx = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz, 'YXZ'));
  const one = new THREE.Vector3(1, 1, 1);
  const hip = new THREE.Vector3(0.02, 0.1, 0), knee = new THREE.Vector3(0.46, 0.12, 0);
  m.thighs.compose(knee, Q(Math.PI / 2 - 0.05), one); // thigh: from the knee back to the hip
  const shinQ = Q(0.12), ankle = knee.clone().sub(new THREE.Vector3(0, 0.42, 0).applyQuaternion(shinQ));
  m.shins.compose(ankle, shinQ, one);
  const skiQ = Q(0.04), skiPos = ankle.clone().sub(new THREE.Vector3(0, 0.2, 0).applyQuaternion(skiQ));
  m.skis.compose(skiPos, skiQ, one);
  m.torso.compose(hip, Q(0.12), one);
  for (const [k, sd] of [['poleL', -1], ['poleR', 1]]) { const t = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(sd * 0.05, 0, -0.35)); t.setPosition(0.36, 0.2, sd * 0.29); m[k].multiplyMatrices(m.torso, t); }
  void hip;
  return mergedPose(pose, parts, { pants: PANTS });
}


// ---------------------------------------------------------------------------------------------
// Articulated skier: separate parts (skis+boots, shins, thighs, upper body, two poles) so the skis
// lie on the slope and tilt on the edge, knees bend, the upper body faces downhill and poles plant.
// Local frame: +x forward, +y up, +z right. Colour groups: c = per-instance jacket colour,
// p = per-instance pants colour, f = fixed vertex colours.
const BOOT = 0x2b2f36, GLOVE = 0x1b1d22, BUCKLE = 0xb8bec6, SKI_TOP = [0xd62828, 0x1d4ed8, 0x111111, 0xf5f5f5, 0x0f766e];
function tube(r0, r1, len, x, y, z, color, rz = 0, rx = 0) {
  const g0 = new THREE.CylinderGeometry(r1, r0, len, GFX.ultra ? 12 : 7, 1); const g = g0.toNonIndexed(); g.deleteAttribute('uv');
  g.translate(0, len / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
  g.translate(x, y, z);
  return paint(g, color);
}
function sphere(r, x, y, z, color, sx = 1, sy = 1, sz = 1, phiLen = Math.PI * 2, thetaLen = Math.PI) {
  const g0 = new THREE.SphereGeometry(r, GFX.ultra ? 18 : 10, GFX.ultra ? 12 : 7, 0, phiLen, 0, thetaLen); const g = g0.toNonIndexed(); g.deleteAttribute('uv');
  g.scale(sx, sy, sz); g.translate(x, y, z);
  return paint(g, color);
}
function paint(g, color) {
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// one ski with shovel (tip) and tail bent up, as a strip of segments
function skiGeo(z, color, len = 1.66) {
  const U = GFX.ultra, n = U ? 22 : 9, w = 0.085, t = 0.022;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    const xa = -len * 0.46 + a * len, xb = -len * 0.46 + b * len;
    const lift = (u) => { const tip = Math.max(0, (u - 0.86) / 0.14), tail = Math.max(0, (0.06 - u) / 0.06); return tip * tip * 0.075 + tail * tail * 0.025; };
    const wid = (u) => w * (1 - 0.12 * Math.sin(u * Math.PI)) * (u > 0.95 ? 0.85 : 1); // side cut
    const ya = lift(a), yb = lift(b), xm = (xa + xb) / 2, ym = (ya + yb) / 2, L = Math.hypot(xb - xa, yb - ya);
    const g = new THREE.BoxGeometry(L + 0.004, t, wid((a + b) / 2)).toNonIndexed(); g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(yb - ya, xb - xa)));
    g.translate(xm, ym + t / 2, z);
    parts.push(paint(g, color));
  }
  return parts;
}
export function skierPartGeometries(seed = 0) {
  const U = GFX.ultra;
  const skiCol = SKI_TOP[seed % SKI_TOP.length];
  const M = (list) => mergeGeometries(list.filter(Boolean));
  // skis + boots + bindings (frame: ground contact under the boots)
  const skis = M([
    ...skiGeo(-0.11, skiCol), ...skiGeo(0.11, skiCol),
    ...[-0.11, 0.11].flatMap((z) => [
      part(0.36, 0.05, 0.07, 0.0, 0.05, z, 0x3a3f46), // binding plate
      part(0.31, 0.15, 0.12, 0.0, 0.12, z, BOOT), // boot shell
      U ? part(0.06, 0.04, 0.125, 0.12, 0.08, z, BOOT) : null, U ? part(0.06, 0.04, 0.125, -0.13, 0.08, z, 0x50555c) : null, // toe / heel piece
    ]),
  ]);
  // shins (pivot at the ankle): boot cuffs + lower legs
  const shinsF = M([...[-0.11, 0.11].flatMap((z) => [tube(0.075, 0.07, 0.22, 0, -0.02, z, BOOT), U ? tube(0.077, 0.077, 0.02, 0, 0.07, z, BUCKLE) : null, U ? tube(0.077, 0.077, 0.02, 0, 0.14, z, BUCKLE) : null])]);
  const shinsP = M([...[-0.11, 0.11].flatMap((z) => [tube(0.078, 0.085, 0.27, 0, 0.17, z, 0xffffff), sphere(0.085, 0.015, 0.43, z, 0xffffff)])]);
  // thighs (pivot at the knee)
  const thighsP = M([...[-0.11, 0.11].flatMap((z) => [tube(0.085, 0.1, 0.44, 0, 0, z, 0xffffff)]), part(0.22, 0.16, 0.36, 0, 0.44, 0, 0xffffff)]);
  // upper body (pivot at the hips)
  const torsoC = M([
    // jacket: hips, waist, chest, shoulders as one smooth shell; collar on top
    bodyShell([[-0.04, 0.125, 0.175, -0.005], [0.08, 0.135, 0.185, 0], [0.2, 0.125, 0.17, 0.01], [0.36, 0.14, 0.19, 0.02], [0.5, 0.145, 0.215, 0.015], [0.58, 0.13, 0.225, 0.005], [0.64, 0.1, 0.18, 0], [0.67, 0.06, 0.08, 0.01]], 0xffffff, 'x'),
    U ? tube(0.07, 0.062, 0.07, 0.02, 0.62, 0, 0xffffff) : null, // collar
    // arms: upper arm down-forward, forearm forward to the hands
    ...[-1, 1].flatMap((sd) => [sphere(0.075, 0.0, 0.56, sd * 0.24, 0xffffff), tube(0.07, 0.062, 0.3, 0.0, 0.56, sd * 0.25, 0xffffff, -Math.PI + 0.35, sd * -0.15), tube(0.062, 0.055, 0.28, 0.1, 0.29, sd * 0.29, 0xffffff, -1.82, 0)]),
  ]);
  const torsoF = M([
    tube(0.055, 0.055, 0.08, 0.02, 0.62, 0, SKIN), // neck
    sphere(0.105, 0.03, 0.8, 0, SKIN, 1, 1.12, 1),
    sphere(0.128, 0.015, 0.815, 0, HELMET, 1.08, 0.98, 1.0, Math.PI * 2, Math.PI * 0.6), // helmet shell
    ...[-1, 1].map((sd) => sphere(0.045, 0.0, 0.77, sd * 0.115, HELMET, 1.1, 1.15, 0.55)), // ear pads
    part(0.055, 0.07, 0.2, 0.135, 0.8, 0, GOGGLE), // goggle lens
    U ? (() => { const g = new THREE.TorusGeometry(0.128, 0.011, 4, 26).toNonIndexed(); g.deleteAttribute('uv'); g.rotateX(Math.PI / 2); g.scale(1.08, 1, 1.0); g.translate(0.015, 0.8, 0); return paint(g, 0x16181c); })() : null, // goggle band around the helmet
    U ? part(0.025, 0.012, 0.1, 0.12, 0.69, 0, 0x30343a) : null, // chin strap
    ...[-1, 1].map((sd) => sphere(0.055, 0.37, 0.22, sd * 0.29, GLOVE)), // gloves
    U && seed % 3 === 0 ? part(0.12, 0.34, 0.28, -0.2, 0.36, 0, 0x2f3b45) : null, // small backpack
  ]);
  // pole (pivot at the grip, hanging down along -y)
  const pole = M([
    tube(0.017, 0.017, 0.14, 0, -0.07, 0, 0x111111), // grip
    tube(0.009, 0.007, 1.04, 0, -1.12, 0, POLE),
    U ? (() => { const g = new THREE.TorusGeometry(0.045, 0.006, 5, 14).toNonIndexed(); g.deleteAttribute('uv'); g.rotateX(Math.PI / 2); g.translate(0, -1.04, 0); return paint(g, 0x111111); })() : part(0.08, 0.01, 0.08, 0, -1.04, 0, 0x111111),
  ]);
  return { skis: { f: skis }, shins: { f: shinsF, p: shinsP }, thighs: { p: thighsP }, torso: { c: torsoC, f: torsoF }, poleL: { f: pole }, poleR: { f: pole } };
}
export const SKIER_PARTS = ['skis', 'shins', 'thighs', 'torso', 'poleL', 'poleR'];
export const PANTS_COLS = [0x2a2f3a, 0x1b1b1f, 0x3c4a5c, 0x5b3f2a, 0x22313f, 0x7a1f2b, 0x2f4a3a, 0xe9e9ec];

// Computes the part matrices of a skier in its body frame (already yawed and rolled into the turn).
// nl: ground normal in that body frame; flex 0..1 (knee bend); twist (upper body yaw, rad);
// ang (angulation: upper body rolls back, rad); poles: angles (rad, 0 = straight down, negative = tip behind)
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _one = new THREE.Vector3(1, 1, 1), _t = new THREE.Matrix4();
export class SkierPose {
  constructor() { this.m = {}; for (const k of SKIER_PARTS) this.m[k] = new THREE.Matrix4(); this.knee = new THREE.Vector3(); this.hip = new THREE.Vector3(); }
  compute(nl, flex, twist, ang, poleL, poleR, edge = 0, tuck = 0) {
    const m = this.m;
    // skis: follow the slope along the ski (pitch) but stay edged with the legs when leaning into a
    // turn (roll only adapts a little to the ground) - so boots and legs always stay connected
    const gRoll = Math.atan2(nl.z, nl.y);
    const roll = Math.max(-0.2, Math.min(0.2, gRoll)) + edge;
    const ch = Math.sqrt(Math.max(0, 1 - nl.x * nl.x));
    _s.set(nl.x, ch * Math.cos(roll), ch * Math.sin(roll)); // ski normal
    _f.set(1, 0, 0).addScaledVector(_s, -_s.x).normalize();
    _v.crossVectors(_f, _s).normalize();
    m.skis.makeBasis(_f, _s, _v);
    // lift the skis so the lower edge does not sink into the snow when edged against the slope
    const lift = Math.abs(Math.sin(gRoll - roll)) * 0.17;
    m.skis.setPosition(nl.x * lift, nl.y * lift, nl.z * lift);
    // ankle above the boots; legs share the roll of the skis
    _v.set(0, 0.2, 0).applyMatrix4(m.skis);
    const sh = 0.32 + flex * 0.55 + tuck * 0.2; // shin forward angle
    _e.set(roll, 0, -sh); _q.setFromEuler(_e); m.shins.compose(_v, _q, _one);
    this.knee.set(0, 0.42, 0).applyQuaternion(_q).add(_v);
    _e.set(roll, 0, sh * 1.35 + tuck * 0.35); _q.setFromEuler(_e); m.thighs.compose(this.knee, _q, _one);
    this.hip.set(0, 0.44, 0).applyQuaternion(_q).add(this.knee);
    const lean = 0.28 + flex * 0.3 + tuck * 0.55; // upper body forward
    _e.set(-ang, twist, -lean); _q.setFromEuler(_e); m.torso.compose(this.hip, _q, _one);
    // poles: grips in the hands (torso frame)
    for (const [k, sd, a] of [['poleL', -1, poleL], ['poleR', 1, poleR]]) {
      _v.set(0.36, 0.2, sd * 0.29);
      _t.makeRotationFromEuler(_e.set(sd * 0.06, 0, a + lean * 0.9));
      _t.setPosition(_v);
      m[k].multiplyMatrices(m.torso, _t);
    }
    return m;
  }
}

// ---------------------------------------------------------------------------------------------
// Snowboarder: board along the travel direction (local +x), stands sideways with the toe edge on +z,
// knees bent towards the toes, upper body turned towards the travel direction. Same part keys as
// the skier (skis = board, poles empty) so it uses the same instancing.
const BOARD_TOP = [0x111111, 0xff6b00, 0x00a6a6, 0xe63946, 0xf5f5f5, 0x6a4bd8];
export function boarderPartGeometries(seed = 0) {
  const U = GFX.ultra, M = (l) => mergeGeometries(l.filter(Boolean));
  const col = BOARD_TOP[seed % BOARD_TOP.length], n = U ? 20 : 8, len = 1.55, w = 0.27, t = 0.025;
  const board = [];
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, xa = -len / 2 + a * len, xb = -len / 2 + b * len;
    const lift = (u) => { const e = Math.max(0, Math.abs(u - 0.5) - 0.42) / 0.08; return e * e * 0.06; };
    const wid = (u) => w * (1 - 0.1 * Math.sin(u * Math.PI)) * (Math.abs(u - 0.5) > 0.46 ? 0.8 : 1);
    const ya = lift(a), yb = lift(b), L2 = Math.hypot(xb - xa, yb - ya);
    const g = new THREE.BoxGeometry(L2 + 0.004, t, wid((a + b) / 2)).toNonIndexed(); g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(yb - ya, xb - xa) * (a < 0.5 ? 1 : 1)));
    g.translate((xa + xb) / 2, (ya + yb) / 2 + t / 2, 0);
    board.push(paint(g, col));
  }
  const skis = M([...board, ...[-0.26, 0.26].flatMap((x) => [part(0.2, 0.05, 0.26, x, 0.05, 0, 0x2b2f36), part(0.07, 0.16, 0.24, x - 0.1, 0.12, 0, 0x2b2f36), part(0.26, 0.14, 0.13, x, 0.12, 0, 0x30343a)])]);
  // legs: feet 0.52 m apart along the board; pivot of the shins in the middle between the ankles
  const shinsF = M([-0.26, 0.26].map((x) => tube(0.075, 0.07, 0.2, x, -0.02, 0, 0x30343a)));
  const shinsP = M([-0.26, 0.26].flatMap((x) => [tube(0.078, 0.085, 0.26, x * 0.92, 0.17, 0, 0xffffff), sphere(0.085, x * 0.85, 0.43, 0.012, 0xffffff)]));
  const thighsP = M([...[-1, 1].map((sd) => { const a = new THREE.Vector3(sd * 0.22, 0, 0), b = new THREE.Vector3(sd * 0.11, 0.44, 0); const g = new THREE.CylinderGeometry(0.1, 0.085, a.distanceTo(b), U ? 12 : 7).toNonIndexed(); g.deleteAttribute('uv'); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0); return paint(g, 0xffffff); }), part(0.36, 0.16, 0.24, 0, 0.44, 0, 0xffffff)]);
  const sk = skierPartGeometries(seed);
  const empty = new THREE.BufferGeometry(); empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); empty.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3)); empty.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  return { skis: { f: skis }, shins: { f: shinsF, p: shinsP }, thighs: { p: thighsP }, torso: sk.torso, poleL: { f: empty }, poleR: { f: empty.clone() } };
}
export class BoarderPose {
  constructor() { this.m = {}; for (const k of SKIER_PARTS) this.m[k] = new THREE.Matrix4(); this.knee = new THREE.Vector3(); this.hip = new THREE.Vector3(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0); }
  // nl: ground normal in the body frame; flex 0..1; twist: extra upper body turn; ang: lean of the upper body
  compute(nl, flex, twist, ang, edge = 0) {
    const m = this.m;
    const gRoll = Math.atan2(nl.z, nl.y), roll = Math.max(-0.25, Math.min(0.25, gRoll)) + edge;
    const ch = Math.sqrt(Math.max(0, 1 - nl.x * nl.x));
    _s.set(nl.x, ch * Math.cos(roll), ch * Math.sin(roll));
    _f.set(1, 0, 0).addScaledVector(_s, -_s.x).normalize();
    _v.crossVectors(_f, _s).normalize();
    m.skis.makeBasis(_f, _s, _v);
    const lift = Math.abs(Math.sin(gRoll - roll)) * 0.15;
    m.skis.setPosition(nl.x * lift, nl.y * lift, nl.z * lift);
    _v.set(0, 0.2, 0).applyMatrix4(m.skis);
    // knees towards the toe edge (+z), hips back over the heels
    const sh = 0.3 + flex * 0.5;
    _e.set(roll + sh, 0, 0); _q.setFromEuler(_e); m.shins.compose(_v, _q, _one);
    this.knee.set(0, 0.42, 0).applyQuaternion(_q).add(_v);
    _e.set(roll - sh * 0.9, 0, 0); _q.setFromEuler(_e); m.thighs.compose(this.knee, _q, _one);
    this.hip.set(0, 0.44, 0).applyQuaternion(_q).add(this.knee);
    // upper body faces the toe side, turned partly towards the nose of the board
    _e.set(0, -Math.PI / 2 + 0.75 + twist, -(0.25 + flex * 0.3)); _q.setFromEuler(_e);
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ang));
    m.torso.compose(this.hip, _q, _one);
    m.poleL.copy(this.zero); m.poleR.copy(this.zero);
    return m;
  }
}

// sledge (Davoser Schlitten) with a seated rider, facing +x, origin at the ground
export function sledderGeometry() {
  const r = riderGeometry(), rest = [], jacket = [];
  const lift = new THREE.Matrix4().makeTranslation(-0.05, 0.36, 0);
  const rj = r.jacket.clone(); rj.applyMatrix4(lift); jacket.push(rj);
  const rr = r.rest.clone(); rr.applyMatrix4(lift); rest.push(rr);
  const wood = 0xb07a45, iron = 0x30343a;
  for (const z of [-0.2, 0.2]) {
    rest.push(part(1.0, 0.05, 0.04, 0.0, 0.03, z, iron)); // runners
    const tip = new THREE.TorusGeometry(0.12, 0.022, 5, 10, Math.PI).toNonIndexed(); tip.deleteAttribute('uv'); tip.rotateZ(-Math.PI / 2); tip.translate(0.5, 0.15, z); rest.push(paint(tip, wood));
    for (const x of [-0.35, 0.0, 0.32]) rest.push(part(0.05, 0.3, 0.05, x, 0.18, z, wood));
    rest.push(part(1.0, 0.05, 0.06, 0.0, 0.32, z, wood));
  }
  for (let x = -0.4; x <= 0.36; x += 0.12) rest.push(part(0.08, 0.025, 0.46, x, 0.35, 0, 0xc8925a)); // slats
  return { jacket: mergeGeometries(jacket), rest: mergeGeometries(rest) };
}

// the old single-mesh skier (lift riders, previews): the articulated parts merged in a neutral pose
function mergedPose(pose, parts, keyMap) {
  const out = { jacket: [], rest: [] };
  for (const k of SKIER_PARTS) {
    for (const [c, g] of Object.entries(parts[k])) {
      const gg = g.clone(); gg.applyMatrix4(pose.m[k]);
      if (c === 'c') out.jacket.push(gg);
      else { if (c === 'p') { const col = gg.attributes.color.array, pc = new THREE.Color(keyMap.pants); for (let i = 0; i < col.length; i += 3) { col[i] = pc.r; col[i + 1] = pc.g; col[i + 2] = pc.b; } } out.rest.push(gg); }
    }
  }
  return { jacket: mergeGeometries(out.jacket), rest: mergeGeometries(out.rest) };
}

export const JACKETS = [0xe63946, 0x1d7fd6, 0xf4a261, 0x2a9d8f, 0xffd60a, 0x9b5de5, 0xff70a6, 0x06d6a0, 0xffffff, 0x222831, 0xef476f, 0x118ab2];

// ---------------------------------------------------------------------------------------------
// Mountain bike + rider, built like the articulated skier: frame, two wheels (spin), crank (turns),
// rider upper body (fixed on the bike) and legs that follow the pedals (two-bone IK).
// Bike frame: +x forward, +y up, +z right, origin on the ground between the wheels.
const _V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
function segGeo(a, b, r0, r1, color, sz = 1, n) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, n || (GFX.ultra ? 12 : 7), 1).toNonIndexed(); g.deleteAttribute('uv');
  g.translate(0, len / 2, 0); g.scale(1, 1, sz);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_V(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return paint(g, color);
}
function torusGeo(R, r, x, y, z, color, rs = 6, ts = 24) { const g = new THREE.TorusGeometry(R, r, rs, ts).toNonIndexed(); g.deleteAttribute('uv'); g.translate(x, y, z); return paint(g, color); }
const BIKE_COLS = [0x2ecc71, 0xe63946, 0x1d7fd6, 0xffb703, 0x8338ec, 0xf1f1f1];
const BK = { BB: _V(0, 0.33), RA: _V(-0.56, 0.36), FA: _V(0.6, 0.36), HTB: _V(0.47, 0.72), HTT: _V(0.43, 0.85), STT: _V(-0.12, 0.8), SP: _V(-0.17, 0.97), HIP: _V(-0.15, 1.04), BAR: _V(0.49, 0.95) };
export function bikePartGeometries(seed = 0) {
  const U = GFX.ultra, M = (l) => mergeGeometries(l.filter(Boolean));
  const fc = BIKE_COLS[seed % BIKE_COLS.length], blk = 0x1b1c1f, alu = 0xb8bec6, dark = 0x2b2f36;
  // wheel (pivot at the axle): knobby tyre, rim, spokes, hub, brake disc
  const wheel = M([
    torusGeo(0.322, 0.052, 0, 0, 0, 0x1a1a1a, U ? 8 : 5, U ? 36 : 18),
    U ? torusGeo(0.372, 0.012, 0, 0, 0, 0x2a2a2a, 4, 36) : null,
    torusGeo(0.282, 0.016, 0, 0, 0, 0x30343a, 4, U ? 32 : 16),
    ...Array.from({ length: U ? 16 : 6 }, (_, k) => { const a = k / (U ? 16 : 6) * Math.PI * 2, sd = k % 2 ? 1 : -1; return segGeo(_V(0, 0, sd * 0.04), _V(Math.cos(a) * 0.275, Math.sin(a) * 0.275, sd * 0.008), 0.003, 0.003, alu, 1, 3); }),
    segGeo(_V(0, 0, -0.06), _V(0, 0, 0.06), 0.025, 0.025, alu),
    U ? segGeo(_V(0, 0, -0.055), _V(0, 0, -0.05), 0.085, 0.085, 0x9aa0a6, 1, 16) : null,
  ]);
  // frame, fork, cockpit, saddle, drivetrain (fixed)
  const tube = (a, b, r, c = fc) => segGeo(a, b, r, r, c);
  const frame = M([
    tube(BK.BB, BK.HTB, 0.03), tube(_V(-0.1, 0.77), _V(0.44, 0.81), 0.024), tube(BK.BB, BK.STT, 0.025),
    segGeo(BK.STT, BK.SP, 0.015, 0.015, blk),
    ...[-1, 1].flatMap((sd) => [tube(_V(-0.02, 0.33, sd * 0.05), _V(-0.56, 0.36, sd * 0.07), 0.013), tube(_V(-0.1, 0.74, sd * 0.035), _V(-0.56, 0.37, sd * 0.07), 0.012)]),
    tube(BK.HTB, BK.HTT, 0.034),
    // suspension fork: crown, silver stanchions, black lowers
    segGeo(_V(0.47, 0.71, -0.075), _V(0.47, 0.71, 0.075), 0.03, 0.03, blk),
    ...[-1, 1].flatMap((sd) => [segGeo(_V(0.47, 0.71, sd * 0.065), _V(0.53, 0.5, sd * 0.065), 0.017, 0.017, 0xd9dde2), segGeo(_V(0.53, 0.52, sd * 0.065), _V(0.6, 0.36, sd * 0.065), 0.024, 0.021, blk)]),
    segGeo(BK.HTT, _V(0.49, 0.9), 0.017, 0.017, blk), segGeo(_V(0.49, 0.93, -0.38), _V(0.49, 0.93, 0.38), 0.012, 0.012, blk),
    ...[-1, 1].map((sd) => segGeo(_V(0.49, 0.93, sd * 0.29), _V(0.49, 0.93, sd * 0.38), 0.018, 0.018, 0x111111)),
    part(0.27, 0.05, 0.12, -0.19, 0.99, 0, 0x111111),
    U ? segGeo(_V(-0.03, 0.5), _V(0.13, 0.68), 0.028, 0.02, 0xff7b00) : null, // rear shock
    torusGeo(0.095, 0.012, 0, 0.33, 0.07, 0x3a3d40, 4, 20), // chain ring
    segGeo(_V(-0.56, 0.36, 0.05), _V(-0.56, 0.36, 0.08), 0.06, 0.06, 0x8a8f95), // cassette
    U ? segGeo(_V(0, 0.425, 0.07), _V(-0.56, 0.42, 0.07), 0.005, 0.005, 0x444444, 1, 3) : null,
    U ? segGeo(_V(0, 0.235, 0.07), _V(-0.56, 0.3, 0.07), 0.005, 0.005, 0x444444, 1, 3) : null,
  ]);
  // crank (pivot at the bottom bracket, right arm points along -y at angle 0)
  const crank = M([
    segGeo(_V(0, 0, -0.09), _V(0, 0, 0.09), 0.02, 0.02, dark),
    segGeo(_V(0, 0, 0.09), _V(0, -0.17, 0.09), 0.013, 0.011, dark), segGeo(_V(0, 0, -0.09), _V(0, 0.17, -0.09), 0.013, 0.011, dark),
    part(0.1, 0.022, 0.09, 0, -0.17, 0.14, 0x222222), part(0.1, 0.022, 0.09, 0, 0.17, -0.14, 0x222222),
  ]);
  // rider: torso, arms (jacket colour), head with a rounded trail helmet, gloves, shorts (pants colour)
  const sh = _V(0.17, 1.41), hand = (sd) => _V(0.48, 0.95, sd * 0.3), elbow = (sd) => _V(0.3, 1.17, sd * 0.27), shoulder = (sd) => _V(0.16, 1.39, sd * 0.19);
  const upperC = M([
    segGeo(_V(-0.13, 1.02), sh, 0.13, 0.15, 0xffffff, 1.45),
    ...[-1, 1].flatMap((sd) => [sphere(0.07, shoulder(sd).x, shoulder(sd).y, shoulder(sd).z, 0xffffff), segGeo(shoulder(sd), elbow(sd), 0.065, 0.058, 0xffffff), segGeo(elbow(sd), hand(sd), 0.055, 0.048, 0xffffff)]),
  ]);
  const upperF = M([
    segGeo(_V(0.2, 1.45), _V(0.26, 1.53), 0.05, 0.05, SKIN),
    sphere(0.105, 0.3, 1.6, 0, SKIN, 1.05, 1.08, 1),
    sphere(0.128, 0.285, 1.62, 0, 0x30343a, 1.12, 0.92, 1.0, Math.PI * 2, Math.PI * 0.58), // helmet shell
    U ? sphere(0.04, 0.27, 1.73, 0, 0x50565e, 2.6, 0.45, 0.6) : null,
    part(0.03, 0.045, 0.2, 0.395, 1.6, 0, 0x111111), // sunglasses
    ...[-1, 1].map((sd) => sphere(0.05, hand(sd).x, hand(sd).y, hand(sd).z, GLOVE)),
    U && seed % 2 === 0 ? part(0.1, 0.3, 0.26, -0.05, 1.3, 0, 0x2f3b45, -1.0) : null, // hydration pack
  ]);
  const upperP = M([sphere(0.15, -0.13, 1.03, 0, 0xffffff, 1.2, 0.8, 1.35)]);
  // legs: unit length along +y (scaled by the IK), shoes
  const thighP = M([segGeo(_V(0, 0), _V(0, 1), 0.075, 0.062, 0xffffff)]);
  const shinF = M([segGeo(_V(0, 0), _V(0, 1), 0.056, 0.05, 0x2b2f36), U ? segGeo(_V(0, 0.82), _V(0, 1), 0.062, 0.066, 0x111111) : null]);
  const shoeF = M([part(0.24, 0.08, 0.1, 0.03, 0.04, 0, 0x22252a), part(0.25, 0.025, 0.105, 0.03, 0.0, 0, 0x111111)]);
  return { wheel: { f: wheel }, frame: { f: frame }, crank: { f: crank }, upper: { c: upperC, f: upperF, p: upperP }, thigh: { p: thighP }, shin: { f: shinF }, shoe: { f: shoeF } };
}
// pose of all bike parts for a crank angle; returns a list of [partKey, Matrix4]
const _bq = new THREE.Quaternion(), _bv = new THREE.Vector3(), _bs = new THREE.Vector3(), _bz = new THREE.Vector3(0, 0, 1), _by = new THREE.Vector3(0, 1, 0);
function legMats(crankA, sd, out) {
  const ang = crankA + (sd > 0 ? 0 : Math.PI);
  const F = _V(BK.BB.x + Math.sin(ang) * 0.17, BK.BB.y - Math.cos(ang) * 0.17, sd * 0.15);
  const H = _V(BK.HIP.x, BK.HIP.y, sd * 0.1);
  const L1 = 0.46, L2 = 0.46, d = Math.min(L1 + L2 - 0.001, H.distanceTo(F));
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const dir = F.clone().sub(H).normalize(), perp = _V(-dir.y, dir.x, 0); if (perp.x < 0) perp.negate(); // knee bends forward
  const K = H.clone().addScaledVector(dir, a).addScaledVector(perp, h);
  const m = (A, B) => { const len = A.distanceTo(B); _bq.setFromUnitVectors(_by, _bv.copy(B).sub(A).normalize()); return new THREE.Matrix4().compose(A, _bq.clone(), _bs.set(1, len, 1)); };
  out.push(['thigh', m(H, K)], ['shin', m(F, K)]);
  out.push(['shoe', new THREE.Matrix4().makeTranslation(F.x, F.y + 0.01, F.z)]);
}
function bikePose(crankA = 0.6, wheelA = 0) {
  const out = [];
  out.push(['frame', new THREE.Matrix4()], ['upper', new THREE.Matrix4()]);
  for (const ax of [BK.RA, BK.FA]) out.push(['wheel', new THREE.Matrix4().compose(ax, new THREE.Quaternion().setFromAxisAngle(_bz, wheelA + ax.x), new THREE.Vector3(1, 1, 1))]);
  out.push(['crank', new THREE.Matrix4().compose(BK.BB, new THREE.Quaternion().setFromAxisAngle(_bz, crankA), new THREE.Vector3(1, 1, 1))]);
  legMats(crankA, 1, out); legMats(crankA, -1, out);
  return out;
}
// static biker (guests, instanced): { jacket, rest }
export function bikerGeometry() {
  const parts = bikePartGeometries(0), js = [], rs = [], pc = new THREE.Color(PANTS);
  for (const [k, m] of bikePose(0.7, 0)) for (const [c, g] of Object.entries(parts[k])) {
    const gg = g.clone(); gg.applyMatrix4(m);
    if (c === 'c') js.push(gg); else { if (c === 'p') { const a = gg.attributes.color.array; for (let i = 0; i < a.length; i += 3) { a[i] = pc.r; a[i + 1] = pc.g; a[i + 2] = pc.b; } } rs.push(gg); }
  }
  return { jacket: mergeGeometries(js), rest: mergeGeometries(rs) };
}
// player bike: Group with setBike(groundNormalWorld, speed, dt, pedal) - wheels spin, pedals turn,
// legs follow, the bike pitches with the slope (lean into turns comes from the group rotation)
export function makeBikeRig(jacket = 0x1d7fd6, pants = 0x22313f, seed = 2) {
  const geo = bikePartGeometries(seed), grp = new THREE.Group(), tilt = new THREE.Group(); grp.add(tilt);
  const mats = { c: new THREE.MeshLambertMaterial({ color: jacket }), p: new THREE.MeshLambertMaterial({ color: pants }), f: new THREE.MeshLambertMaterial({ vertexColors: true }) };
  const slots = {};
  const mk = (k) => { const arr = []; for (const [c, g] of Object.entries(geo[k])) { const m = new THREE.Mesh(g, mats[c]); m.matrixAutoUpdate = false; m.castShadow = true; tilt.add(m); arr.push(m); } return arr; };
  let wheelA = 0, crankA = 0;
  const qi = new THREE.Quaternion(), nl = new THREE.Vector3();
  const apply = () => {
    const cnt = {};
    for (const [k, m] of bikePose(crankA, wheelA)) {
      const i = cnt[k] = (cnt[k] ?? -1) + 1;
      slots[k] = slots[k] || []; if (!slots[k][i]) slots[k][i] = mk(k);
      for (const mesh of slots[k][i]) mesh.matrix.copy(m);
    }
  };
  grp.userData.bikeRig = true;
  grp.setBike = (nWorld, speed, dt, pedal = true) => {
    qi.copy(grp.quaternion).invert(); nl.copy(nWorld).applyQuaternion(qi);
    const pitch = -Math.atan2(nl.x, nl.y);
    tilt.rotation.z += (pitch - tilt.rotation.z) * Math.min(1, dt * 10);
    wheelA -= speed * dt / 0.37;
    if (pedal) crankA -= speed * dt / 0.37 * 0.42;
    apply();
  };
  apply();
  return grp;
}

// hiker with backpack, facing +x: smooth jacket shell, tapered legs and arms, boots, sun hat
export function hikerGeometry() {
  const U = GFX.ultra;
  const jacket = mergeGeometries([
    bodyShell([[0.9, 0.125, 0.175, 0], [1.02, 0.12, 0.17, 0.005], [1.16, 0.125, 0.18, 0.01], [1.3, 0.135, 0.205, 0.01], [1.41, 0.125, 0.225, 0], [1.48, 0.09, 0.17, -0.01], [1.52, 0.055, 0.07, 0]], 0xffffff, 'x'),
    ...[-1, 1].flatMap((sd) => [sphere(0.07, 0, 1.43, sd * 0.235, 0xffffff), tube(0.062, 0.05, 0.56, 0.0, 1.43, sd * 0.25, 0xffffff, -Math.PI + 0.12, -sd * 0.06)]),
  ]);
  const PNT = 0x5d4e3a, BT = 0x3b2a20;
  const rest = mergeGeometries([
    bodyShell([[0.84, 0.115, 0.165, 0], [0.93, 0.12, 0.175, 0], [0.98, 0.115, 0.17, 0]], PNT, 'x'),
    ...[-1, 1].flatMap((sd) => [
      tube(0.058, 0.08, 0.8, 0.0, 0.1, sd * 0.095, PNT),
      part(0.27, 0.11, 0.12, 0.05, 0.06, sd * 0.095, BT), // boot
      U ? part(0.27, 0.025, 0.125, 0.05, 0.0, sd * 0.095, 0x1a1a1a) : null, // sole
      sphere(0.048, 0.07, 0.86, sd * 0.29, SKIN), // hand
    ].filter(Boolean)),
    tube(0.05, 0.05, 0.08, 0.0, 1.5, 0, SKIN), // neck
    sphere(0.102, 0.01, 1.66, 0, SKIN, 0.95, 1.13, 1),
    ...(U ? [-1, 1].map((sd) => sphere(0.024, 0.0, 1.66, sd * 0.1, SKIN, 0.6, 1, 0.6)) : []), // ears
    U ? sphere(0.017, 0.105, 1.645, 0, SKIN) : null, // nose
    ...(U ? [-1, 1].map((sd) => sphere(0.014, 0.093, 1.69, sd * 0.035, 0x1b1b1b)) : []), // eyes
    tube(0.16, 0.16, 0.015, 0, 1.73, 0, 0xc49a5a), // hat brim
    sphere(0.108, 0.0, 1.73, 0, 0xc49a5a, 1, 0.8, 1, Math.PI * 2, Math.PI * 0.5), // hat crown
    part(0.2, 0.46, 0.32, -0.21, 1.2, 0, 0x2c5f2d), // backpack
    U ? part(0.08, 0.2, 0.26, -0.32, 1.12, 0, 0x234b24) : null, // front pocket
    tube(0.012, 0.012, 1.2, 0.2, 0.0, 0.33, POLE, 0.3),
  ].filter(Boolean));
  return { jacket, rest };
}

// articulated skier as a normal Group (player): call setPose() after positioning / rotating the group
export function makeSkierRig(jacket = 0xff3b30, pants = 0x22313f, seed = 0) {
  const geo = skierPartGeometries(seed), grp = new THREE.Group(), pose = new SkierPose(), meshes = {};
  const mats = { c: new THREE.MeshLambertMaterial({ color: jacket }), p: new THREE.MeshLambertMaterial({ color: pants }), f: new THREE.MeshLambertMaterial({ vertexColors: true }) };
  for (const k of SKIER_PARTS) {
    meshes[k] = [];
    for (const [cg, g] of Object.entries(geo[k])) { const m = new THREE.Mesh(g, mats[cg]); m.matrixAutoUpdate = false; m.castShadow = true; grp.add(m); meshes[k].push(m); }
  }
  const nl = new THREE.Vector3(), qi = new THREE.Quaternion();
  grp.userData.rig = true;
  grp.setPose = (nWorld, flex, twist, ang, pl, pr, edge = 0, tuck = 0) => {
    qi.copy(grp.quaternion).invert();
    nl.copy(nWorld).applyQuaternion(qi);
    const mm = pose.compute(nl, flex, twist, ang, pl, pr, edge, tuck);
    for (const k of SKIER_PARTS) for (const m of meshes[k]) m.matrix.copy(mm[k]);
  };
  grp.setPose(new THREE.Vector3(0, 1, 0), 0.25, 0, 0, -0.6, -0.6);
  return grp;
}
