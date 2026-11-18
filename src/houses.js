// Swiss-chalet style buildings built from boxes with vertex colours.
// addHouseParts pushes geometries into out.solid / out.glass; caller merges them.
import * as THREE from 'three';
import { rbox } from './shapes.js';
import { GFX } from './gfx.js';

// window glass: the red channel tells the night shader how bright the room behind is (lit / dark)
const GLASS_LIT = [0x4a3a28, 0x463826, 0x4f3d2a], GLASS_DARK = 0x1a222c;
let _gs = 1;
const glassCol = () => { _gs = (_gs * 16807) % 2147483647; const r = _gs / 2147483647; return r < 0.68 ? GLASS_LIT[_gs % 3] : GLASS_DARK; };

const BOXG = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
BOXG.deleteAttribute('uv');

// gable prism, ridge along x: width (x) 1, depth (z) 1, height 1
const PRISM = (() => {
  const v = [
    -0.5, 0, 0.5, -0.5, 1, 0, -0.5, 0, -0.5,
    0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, 0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, -0.5,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function put(list, base, color, x, y, z, sx, sy, sz, frame, rx = 0, ry = 0, summer = color) {
  const g = base.clone();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  g.applyMatrix4(frame);
  const c = new THREE.Color(color);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  const c2 = new THREE.Color(summer);
  const a2 = new Float32Array(a.length);
  for (let i = 0; i < a2.length; i += 3) { a2[i] = c2.r; a2[i + 1] = c2.g; a2[i + 2] = c2.b; }
  g.setAttribute('color2', new THREE.BufferAttribute(a2, 3));
  list.push(g);
}

// switch merged house geometry between winter (color) and summer (color2) colours
export function applySeasonColors(geo, season) {
  if (!geo || !geo.attributes.color2) return;
  if (!geo.userData.cw) geo.userData.cw = geo.attributes.color.array.slice();
  geo.attributes.color.array.set(season === 1 ? geo.attributes.color2.array : geo.userData.cw);
  geo.attributes.color.needsUpdate = true;
}

const ROOFS = [0x5b5e63, 0x6e5644, 0x7d4a3a, 0x4f5358];

const PLASTER = [0xf2ece0, 0xebe2d0, 0xf6f2ea, 0xe8d8bf, 0xefe6dc];
const WOOD = [0x7a4f2c, 0x6b4426, 0x86593a, 0x5e3b22];
const SHUTTER = [0x2f6b3a, 0x9c2a2a, 0x5a3a22, 0x2c4f7c];

// spec: { w, d, floors, kind: 'chalet'|'hotel'|'restaurant', seed }
// x, z: centre; rot: yaw; gLow/gTop: lowest/highest ground under the house
export function addHouseParts(out, spec, x, z, rot, gLow, gTop) {
  let { w, d } = spec;
  if (d > w) { [w, d] = [d, w]; rot += Math.PI / 2; }
  const seed = spec.seed || 0;
  const kind = spec.kind || 'chalet';
  const floors = spec.floors || 2;
  let plaster = PLASTER[seed % PLASTER.length], wood = WOOD[(seed >> 2) % WOOD.length], shutter = SHUTTER[(seed >> 3) % SHUTTER.length];
  // house kinds: chalet (stone/plaster base, wood above), hotel, restaurant, stein (stone house),
  // engadin (thick white walls, small windows, sgraffito), apart (apartment block), modern (flat roof)
  if (kind === 'stein') { plaster = [0x9b958b, 0x8e8a83, 0xa59f94][seed % 3]; shutter = 0x3b3f44; }
  if (kind === 'engadin') { plaster = [0xf3ede0, 0xe9dcc2, 0xf1e3cf][seed % 3]; shutter = [0x2f6b3a, 0x7a2a22][seed % 2]; }
  if (kind === 'apart') { plaster = [0xe8e1d4, 0xd8d2c8, 0xefe9de][seed % 3]; }
  if (kind === 'modern') { addModernParts(spec, x, z, rot, gLow, gTop, out, w, d, seed); return; }
  if (kind === 'kirche') { addChurchParts(out, x, z, rot, gLow, gTop, w, d, seed); return; }
  if (kind === 'stall') { addBarnParts(out, x, z, rot, gLow, gTop, seed); return; }
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
  const S = out.solid, G = out.glass;
  const fh = 2.9;
  const y0 = gTop + 0.5;
  // stone plinth
  put(S, BOXG, 0x8a857d, 0, (gLow - 1.5 + y0) / 2, 0, w + 0.3, y0 - gLow + 1.5, d + 0.3, frame);
  const nPlaster = kind === 'restaurant' ? 0 : kind === 'shop' ? 1 : kind === 'hotel' ? floors - 1 : kind === 'stein' || kind === 'engadin' || kind === 'apart' ? floors : 1;
  const eaveY = y0 + floors * fh;
  if (nPlaster > 0) put(S, BOXG, plaster, 0, y0 + nPlaster * fh / 2, 0, w, nPlaster * fh, d, frame);
  if (floors > nPlaster) put(S, BOXG, wood, 0, y0 + nPlaster * fh + (floors - nPlaster) * fh / 2, 0, w + 0.06, (floors - nPlaster) * fh, d + 0.06, frame);
  // roof
  const a = kind === 'hotel' || kind === 'apart' ? 0.36 : kind === 'engadin' ? 0.3 : kind === 'stein' ? 0.5 : 0.42;
  const rh = (d / 2) * Math.tan(a);
  const ridgeY = eaveY + rh;
  put(S, PRISM, wood, 0, eaveY, 0, w + 0.06, rh, d + 0.06, frame);
  const ov = 1.0, hd = d / 2 + ov, slope = hd / Math.cos(a);
  for (const sd of [-1, 1]) {
    const cz = sd * hd / 2, cy = ridgeY - (hd / 2) * Math.tan(a);
    const nx = Math.sin(a) * sd, ny = Math.cos(a);
    put(S, BOXG, 0x3b2616, 0, cy + ny * 0.05, cz + nx * 0.05, w + 2.4, 0.22, slope + 0.1, frame, sd * a);
    // thick, soft snow cushion in winter (roof tiles in summer)
    put(S, rbox(w + 2.2, 0.5, slope - 0.05, 0.22, 2), 0xf7f9fb, 0, cy + ny * 0.36, cz + nx * 0.36, 1, 1, 1, frame, sd * a, 0, ROOFS[(seed >> 1) % ROOFS.length]);
  }
  // chimney
  put(S, BOXG, 0x9a948c, w * 0.22, ridgeY - 0.2, -d * 0.16, 0.65, 2.0, 0.65, frame);
  put(S, BOXG, 0xf7f9fb, w * 0.22, ridgeY + 0.85, -d * 0.16, 0.8, 0.15, 0.8, frame, 0, 0, 0x6d6862);
  // windows on the long sides
  const nWin = Math.max(2, Math.floor(w / 3.1));
  for (let f = 0; f < floors; f++) {
    const wy = y0 + f * fh + 1.45;
    for (let k = 0; k < nWin; k++) {
      const wx = -w / 2 + (k + 0.5) * (w / nWin);
      for (const sd of [-1, 1]) {
        const zf = sd * (d / 2 + 0.05);
        put(S, BOXG, 0xf4f4f0, wx, wy, zf, 1.2, 1.45, 0.06, frame);
        put(G, BOXG, glassCol(), wx, wy, zf + sd * 0.03, 0.95, 1.2, 0.06, frame);
        if (GFX.ultra) {
          // window cross, sill, flower box (snow in winter, red geraniums in summer)
          put(S, BOXG, 0xf4f4f0, wx, wy, zf + sd * 0.07, 0.05, 1.2, 0.03, frame);
          put(S, BOXG, 0xf4f4f0, wx, wy + 0.15, zf + sd * 0.07, 0.95, 0.05, 0.03, frame);
          put(S, BOXG, 0xe8e4dc, wx, wy - 0.7, zf + sd * 0.12, 1.3, 0.07, 0.22, frame);
          if (f > 0 || kind !== 'hotel') { put(S, BOXG, 0x6b4426, wx, wy - 0.86, zf + sd * 0.22, 1.1, 0.24, 0.24, frame); put(S, BOXG, 0xf5f8fb, wx, wy - 0.7, zf + sd * 0.22, 1.08, 0.1, 0.22, frame, 0, 0, 0xc0392b); }
        }
        put(S, BOXG, shutter, wx - 0.85, wy, zf + sd * 0.02, 0.42, 1.3, 0.06, frame);
        put(S, BOXG, shutter, wx + 0.85, wy, zf + sd * 0.02, 0.42, 1.3, 0.06, frame);
      }
    }
    // gable-side windows
    for (const sx of [-1, 1]) for (const off of [-d * 0.22, d * 0.22]) {
      if (f === 0 && sx === -1 && off < 0) continue; // door here
      put(S, BOXG, 0xf4f4f0, sx * (w / 2 + 0.05), wy, off, 0.06, 1.45, 1.2, frame);
      put(G, BOXG, glassCol(), sx * (w / 2 + 0.08), wy, off, 0.06, 1.2, 0.95, frame);
    }
  }
  // gable windows
  for (const sx of [-1, 1]) put(G, BOXG, glassCol(), sx * (w / 2 + 0.08), eaveY + rh * 0.35, 0, 0.06, Math.min(1.2, rh * 0.5), 1.0, frame);
  // PC: wooden facade made of horizontal boards, corner posts
  if (GFX.ultra && floors > nPlaster) {
    const yb = y0 + nPlaster * fh, hb = (floors - nPlaster) * fh;
    for (let yy = yb + 0.3; yy < yb + hb - 0.05; yy += 0.32) { for (const sd of [-1, 1]) put(S, BOXG, 0x3b2616, 0, yy, sd * (d / 2 + 0.035), w + 0.07, 0.035, 0.02, frame); for (const sx of [-1, 1]) put(S, BOXG, 0x3b2616, sx * (w / 2 + 0.035), yy, 0, 0.02, 0.035, d + 0.07, frame); }
    for (const sx of [-1, 1]) for (const sd of [-1, 1]) put(S, BOXG, 0x4a2f1b, sx * (w / 2 + 0.02), yb + hb / 2, sd * (d / 2 + 0.02), 0.22, hb, 0.22, frame);
  }
  // door
  put(S, BOXG, 0x4a2f1b, -w / 2 - 0.05, y0 + 1.1, -d * 0.22, 0.1, 2.2, 1.2, frame);
  put(S, BOXG, 0x3b2616, -w / 2 - 0.6, y0 + 2.4, -d * 0.22, 1.2, 0.15, 1.8, frame);
  // balconies on the wooden floors (front side)
  const balFloors = kind === 'hotel' || kind === 'apart' ? Array.from({ length: floors - 1 }, (_, i) => i + 1) : kind === 'engadin' || kind === 'stein' ? [] : floors > 1 ? [floors - 1] : [];
  if (kind === 'engadin') {
    // sgraffito: grey decorative frieze under the eaves and corner bands
    put(S, BOXG, 0x8f9499, 0, eaveY - 0.35, 0, w + 0.08, 0.35, d + 0.08, frame);
    for (const sx of [-1, 1]) for (const sd of [-1, 1]) put(S, BOXG, 0x8f9499, sx * (w / 2 + 0.03), y0 + floors * fh / 2, sd * (d / 2 + 0.03), 0.5, floors * fh, 0.5, frame);
    put(S, BOXG, 0x6b4426, -w / 2 - 0.07, y0 + 1.25, d * 0.15, 0.1, 2.5, 1.9, frame); // big arched barn door
  }
  for (const f of balFloors) {
    const by = y0 + f * fh;
    put(S, BOXG, 0x5a3a22, 0, by, d / 2 + 0.75, w * 0.86, 0.16, 1.5, frame);
    put(S, BOXG, wood, 0, by + 0.55, d / 2 + 1.45, w * 0.86, 0.95, 0.08, frame);
    put(S, BOXG, 0x3b2616, 0, by + 1.05, d / 2 + 1.45, w * 0.87, 0.08, 0.12, frame);
    for (const sx of [-1, 1]) put(S, BOXG, wood, sx * w * 0.43, by + 0.55, d / 2 + 0.75, 0.08, 0.95, 1.5, frame);
  }
  if (kind === 'shop') {
    // ground floor shop (ski rental / sports shop): big shop windows, a coloured sign and an awning
    for (const k of [-1, 0, 1]) { put(S, BOXG, 0x2b2e33, k * w * 0.3, y0 + 1.35, d / 2 + 0.07, w * 0.27, 2.3, 0.08, frame); put(G, BOXG, 0x8fb2c8, k * w * 0.3, y0 + 1.35, d / 2 + 0.11, w * 0.25, 2.1, 0.06, frame); }
    const sc = [0xd7261e, 0x1f6fd1, 0x1d8a4b][seed % 3];
    put(S, BOXG, sc, 0, y0 + 2.75, d / 2 + 0.12, w * 0.9, 0.55, 0.12, frame);
    put(S, BOXG, 0xffffff, 0, y0 + 2.75, d / 2 + 0.19, w * 0.5, 0.22, 0.04, frame);
    put(S, BOXG, sc, 0, y0 + 2.45, d / 2 + 0.7, w * 0.88, 0.08, 1.2, frame, -0.25);
    // ski rack in front
    put(S, BOXG, 0x8a8f94, w * 0.3, y0 + 0.6, d / 2 + 1.9, 2.4, 0.08, 0.08, frame);
    for (let k = 0; k < 6; k++) put(S, BOXG, [0xd7261e, 0x2b2e33, 0xf2c200, 0x1f6fd1][k % 4], w * 0.3 - 1.0 + k * 0.4, y0 + 0.95, d / 2 + 1.95, 0.08, 1.7, 0.03, frame, 0.15);
  }
  if (kind === 'restaurant') {
    // sun terrace with parasols
    put(S, BOXG, 0x6b4426, 0, y0 - 0.25, d / 2 + 4, w + 4, 0.3, 7, frame);
    for (let k = -1; k <= 1; k++) {
      put(S, BOXG, 0xdddddd, k * w * 0.3, y0 + 1.2, d / 2 + 4.5, 0.08, 2.4, 0.08, frame);
      put(S, BOXG, k === 0 ? 0xc0392b : 0xe8e2d0, k * w * 0.3, y0 + 2.45, d / 2 + 4.5, 2.6, 0.15, 2.6, frame);
      put(S, BOXG, 0x8a5e3b, k * w * 0.3, y0 + 0.4, d / 2 + 4.5, 1.6, 0.08, 0.9, frame);
    }
  }
}

// modern house: white plaster and larch wood, big windows, flat roof with a thick snow cushion
function addModernParts(spec, x, z, rot, gLow, gTop, out, w, d, seed) {
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
  const S = out.solid, G = out.glass, fh = 3.0, floors = spec.floors || 2, y0 = gTop + 0.4;
  const larch = [0x9a6b3f, 0x7e5a3a, 0xa57a4d][seed % 3];
  put(S, BOXG, 0x6f6b66, 0, (gLow - 1.5 + y0) / 2, 0, w + 0.2, y0 - gLow + 1.5, d + 0.2, frame);
  put(S, BOXG, 0xf2f1ee, 0, y0 + fh / 2, 0, w, fh, d, frame);
  if (floors > 1) put(S, BOXG, larch, 0.6, y0 + fh + (floors - 1) * fh / 2, 0, w + 1.2, (floors - 1) * fh, d, frame);
  const top = y0 + floors * fh;
  put(S, BOXG, 0x3a3d42, 0.3, top + 0.2, 0, w + 2.2, 0.4, d + 1.2, frame);
  put(S, rbox(w + 1.9, 0.45, d + 0.9, 0.2, 2), 0xf7f9fb, 0.3, top + 0.55, 0, 1, 1, 1, frame, 0, 0, 0x55595e);
  for (let f = 0; f < floors; f++) {
    const wy = y0 + f * fh + 1.5, n = Math.max(1, Math.floor(w / 4));
    for (let k = 0; k < n; k++) {
      const wx = -w / 2 + (k + 0.5) * (w / n);
      for (const sd of [-1, 1]) { put(S, BOXG, 0x2b2e33, wx, wy, sd * (d / 2 + 0.04), 2.6, 2.1, 0.06, frame); put(G, BOXG, glassCol(), wx, wy, sd * (d / 2 + 0.07), 2.4, 1.9, 0.06, frame); }
    }
  }
  put(S, BOXG, 0x2b2e33, -w / 2 - 0.05, y0 + 1.1, 0, 0.1, 2.2, 1.3, frame);
  put(S, BOXG, 0x5d636a, 0, y0 + fh, d / 2 + 0.8, w * 0.7, 0.15, 1.6, frame); // balcony slab
  put(G, BOXG, 0x9fb7c8, 0, y0 + fh + 0.55, d / 2 + 1.55, w * 0.7, 0.95, 0.04, frame); // glass railing
}

// village church: white nave with a steep roof, choir, bell tower with clock faces and a pointed spire
function addChurchParts(out, x, z, rot, gLow, gTop, w, d, seed) {
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
  const S = out.solid, G = out.glass, y0 = gTop + 0.4, wallH = 8.5;
  const white = 0xf3efe6, roofC = [0x5b5e63, 0x7d4a3a][seed % 2];
  put(S, BOXG, 0x8a857d, 0, (gLow - 1.5 + y0) / 2, 0, w + 0.4, y0 - gLow + 1.5, d + 0.4, frame);
  put(S, BOXG, white, 0, y0 + wallH / 2, 0, w, wallH, d, frame);
  const a = 0.75, rh = (d / 2) * Math.tan(a), eave = y0 + wallH;
  put(S, PRISM, white, 0, eave, 0, w, rh, d, frame);
  const hd = d / 2 + 0.6, slope = hd / Math.cos(a);
  for (const sd of [-1, 1]) { const cz = sd * hd / 2, cy = eave + rh - (hd / 2) * Math.tan(a); put(S, BOXG, 0xf7f9fb, 0, cy + 0.15, cz + Math.sin(a) * sd * 0.15, w + 1.0, 0.25, slope, frame, sd * a, 0, roofC); }
  // choir (apse) at the east end
  put(S, BOXG, white, w / 2 + 2, y0 + wallH * 0.4, 0, 4, wallH * 0.8, d * 0.7, frame);
  put(S, PRISM, 0xf7f9fb, w / 2 + 2, y0 + wallH * 0.8, 0, 4.2, d * 0.35 * Math.tan(a), d * 0.74, frame, 0, 0, roofC);
  // tall arched windows
  for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) { const wx = -w / 2 + (k + 0.75) * (w / 4.4); put(G, BOXG, 0x3a3428, wx, y0 + 4.6, sd * (d / 2 + 0.05), 1.0, 3.6, 0.06, frame); put(S, BOXG, 0xd8d2c4, wx, y0 + 6.5, sd * (d / 2 + 0.06), 1.2, 0.3, 0.05, frame); }
  // bell tower at the west end
  const tw = 4.2, tH = 21, tx = -w / 2 - tw / 2 + 0.6;
  put(S, BOXG, white, tx, y0 + tH / 2, 0, tw, tH, tw, frame);
  for (const [ax, az, ry] of [[1, 0, Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, 0], [0, -1, 0]]) {
    put(S, BOXG, 0x2b2e33, tx + ax * (tw / 2 + 0.03), y0 + tH - 2.2, az * (tw / 2 + 0.03), 1.0, 1.9, 0.06, frame, 0, ry); // sound openings
    put(S, BOXG, 0xf2f0ea, tx + ax * (tw / 2 + 0.05), y0 + tH - 5, az * (tw / 2 + 0.05), 1.7, 1.7, 0.06, frame, 0, ry); // clock face
    put(S, BOXG, 0xc9a43a, tx + ax * (tw / 2 + 0.08), y0 + tH - 5, az * (tw / 2 + 0.08), 0.12, 0.7, 0.04, frame, 0, ry);
  }
  // spire: four-sided, slim
  const sp = new THREE.ConeGeometry(tw * 0.74, 9, 4, 1).toNonIndexed(); sp.deleteAttribute('uv'); sp.rotateY(Math.PI / 4); sp.translate(0, 4.5, 0);
  put(S, sp, 0x4f5358, tx, y0 + tH, 0, 1, 1, 1, frame);
  put(S, BOXG, 0xc9a43a, tx, y0 + tH + 9.6, 0, 0.08, 1.4, 0.08, frame);
  put(S, BOXG, 0xc9a43a, tx, y0 + tH + 9.9, 0, 0.6, 0.08, 0.08, frame);
  // portal
  put(S, BOXG, 0x5e3b22, tx - tw / 2 - 0.05, y0 + 1.5, 0, 0.1, 3.0, 1.8, frame);
}

// small alpine barn (Stall / Maiensäss)
export function addBarnParts(out, x, z, rot, gLow, gTop, seed = 0) {
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
  const S = out.solid;
  const w = 9, d = 7, y0 = gTop + 0.3;
  put(S, BOXG, 0x8a857d, 0, (gLow - 1 + y0 + 1.2) / 2, 0, w + 0.2, y0 + 1.2 - gLow + 1, d + 0.2, frame);
  put(S, BOXG, 0x5e3b22, 0, y0 + 1.2 + 1.6, 0, w, 3.2, d, frame);
  const a = 0.5, rh = (d / 2) * Math.tan(a), eave = y0 + 4.4;
  put(S, PRISM, 0x5e3b22, 0, eave, 0, w, rh, d, frame);
  const hd = d / 2 + 0.6, slope = hd / Math.cos(a);
  for (const sd of [-1, 1]) {
    const cz = sd * hd / 2, cy = eave + rh - (hd / 2) * Math.tan(a);
    put(S, BOXG, 0xf7f9fb, 0, cy + 0.2, cz + Math.sin(a) * sd * 0.2, w + 1.2, 0.3, slope, frame, sd * a, 0, 0x6b6f74);
  }
  put(S, BOXG, 0x3b2616, w / 2 + 0.05, y0 + 2.2, 0, 0.1, 2.2, 2.4, frame);
  void seed;
}

export function buildingSpec(kind, seed = 1) {
  if (kind === 'steinhaus') return { kind: 'stein', w: 10, d: 9, floors: 2, seed };
  if (kind === 'engadiner') return { kind: 'engadin', w: 13, d: 11, floors: 2, seed };
  if (kind === 'modernhaus') return { kind: 'modern', w: 12, d: 9, floors: 2, seed };
  if (kind === 'apartment') return { kind: 'apart', w: 22, d: 13, floors: 4, seed };
  if (kind === 'sportshop') return { kind: 'shop', w: 14, d: 10, floors: 2, seed };
  if (kind === 'stall') return { kind: 'stall', w: 9, d: 7, floors: 1, seed };
  if (kind === 'kirche') return { kind: 'kirche', w: 18, d: 10, floors: 1, seed };
  if (kind === 'hotel') return { kind, w: 26, d: 14, floors: 5, seed };
  if (kind === 'restaurant') return { kind, w: 18, d: 12, floors: 2, seed };
  if (kind === 'chalet_gross') return { kind: 'chalet', w: 15, d: 11, floors: 3, seed };
  return { kind: 'chalet', w: 11, d: 9, floors: 2, seed };
}
