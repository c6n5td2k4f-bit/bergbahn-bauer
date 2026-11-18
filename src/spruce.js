// Detailed spruce (PC "Ultra", used for the trees near the camera): trunk, dark inner crown and
// whorls of drooping, ridged branch fans with snow lying on their upper side in winter.
// Same size and origin as the simple tree (base at y=0, ~15 m tall). Attributes: color (winter), color2 (summer).
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './noise.js';

export function spruceGeometry(seed = 7) {
  const rnd = mulberry32(seed);
  const pos = [], cw = [], cs = [], nrm = [];
  const C = (h) => new THREE.Color(h);
  const tri = (a, b, c, colW, colS) => {
    pos.push(...a, ...b, ...c);
    for (const p of [a, b, c]) { const l = Math.hypot(p[0], p[2]) || 1; nrm.push(p[0] / l * 0.9, 0.3, p[2] / l * 0.9); cw.push(colW.r, colW.g, colW.b); cs.push(colS.r, colS.g, colS.b); }
  };
  // trunk (8 sides) and dark inner crown
  const ring = (r0, r1, y0, y1, n, colW, colS) => {
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const p = (r, y, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
      tri(p(r0, y0, a0), p(r1, y1, a0), p(r0, y0, a1), colW, colS);
      tri(p(r0, y0, a1), p(r1, y1, a0), p(r1, y1, a1), colW, colS);
    }
  };
  const bark = C(0x4a3426), barkD = C(0x3a281c);
  ring(0.46, 0.3, 0, 4, 8, bark, bark);
  ring(0.3, 0.06, 4, 15.2, 8, barkD, barkD);
  const coreW = C(0x0f2418), coreS = C(0x12301d);
  ring(1.6, 0.15, 2.0, 14.8, 9, coreW, coreS);
  // whorls of branches: feathery fans (main fan + side twigs) with fake "volume" normals
  const H0 = 2.0, H1 = 15.0, nW = 15;
  const snowA = C(0xf2f6fb), snowB = C(0xdde7f1), needle = [C(0x132d1f), C(0x183826), C(0x10281b), C(0x1d402b)], needleS = [C(0x1c4a29), C(0x245633), C(0x183f24), C(0x2b6139)];
  const under = C(0x0b1c12), underS = C(0x10281a);
  for (let w = 0; w < nW; w++) {
    const t = w / (nW - 1), y0 = lerp(H0, H1, t) + (rnd() - 0.5) * 0.35;
    const R = 3.7 * Math.pow(1 - t, 0.9) + 0.3;
    const nb = t > 0.85 ? 5 : t > 0.55 ? 7 : 9;
    for (let b = 0; b < nb; b++) {
      const a = (b + rnd() * 0.6) / nb * Math.PI * 2 + w * 1.3;
      const len = R * lerp(0.8, 1.15, rnd()), hw = len * lerp(0.15, 0.21, rnd());
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
      const droop = 0.3 + len * 0.26, rise = 0.06 + len * 0.05;
      const P = (d, side, dy) => [ca * d + px * side, y0 + dy, sa * d + pz * side];
      const B = P(0.15, 0, 0), ML = P(len * 0.5, -hw, rise - 0.14), MR = P(len * 0.5, hw, rise - 0.14), MT = P(len * 0.5, 0, rise + 0.14), T = P(len, 0, -droop);
      const OL = P(len * 0.8, -hw * 0.6, -droop * 0.6), OR = P(len * 0.8, hw * 0.6, -droop * 0.6);
      const k = (rnd() * needle.length) | 0;
      const sAmt = rnd() < 0.78 ? lerp(0.35, 0.85, rnd()) * (0.75 + 0.25 * t) : 0.05;
      const ridge = needle[k].clone().lerp(rnd() < 0.5 ? snowA : snowB, sAmt), side = needle[k].clone().lerp(snowB, sAmt * 0.22), tip = needle[k].clone().lerp(snowA, sAmt * 0.08), nS = needleS[k];
      const nUp = [ca * 0.55, 0.83, sa * 0.55], nSide = [ca * 0.8, 0.45, sa * 0.8], nDown = [ca * 0.6, -0.4, sa * 0.6];
      const T3 = (p1, p2, p3, c1, c2, c3, n1, n2, n3, s1 = nS) => { pos.push(...p1, ...p2, ...p3); for (const c of [c1, c2, c3]) { cw.push(c.r, c.g, c.b); cs.push(s1.r, s1.g, s1.b); } nrm.push(...n1, ...n2, ...n3); };
      // upper surface: snow on the ridge, green at the edges
      T3(B, MT, ML, ridge, ridge, side, nUp, nUp, nSide); T3(B, MR, MT, ridge, side, ridge, nUp, nSide, nUp);
      T3(ML, MT, OL, side, ridge, tip, nSide, nUp, nSide); T3(MT, MR, OR, ridge, side, tip, nUp, nSide, nSide);
      T3(OL, MT, T, tip, ridge, tip, nSide, nUp, nSide); T3(MT, OR, T, ridge, tip, tip, nUp, nSide, nSide);
      // side twigs make the outline feathery
      for (const sd of [-1, 1]) for (const f of [0.28, 0.5, 0.72]) {
        const base = P(len * f, sd * hw * 0.7, rise * 0.5 - 0.1 - f * droop * 0.4), out = P(len * (f + 0.18), sd * hw * 1.6, -0.25 - f * droop * 0.7), back = P(len * (f - 0.08), sd * hw * 0.95, -0.12 - f * droop * 0.4);
        T3(base, out, back, side, tip, side, nSide, nSide, nSide);
      }
      // dark underside, slightly lower
      const lo = (p) => [p[0], p[1] - 0.08, p[2]];
      T3(lo(B), lo(ML), lo(MR), under, under, under, nDown, nDown, nDown, underS);
      T3(lo(ML), lo(OL), lo(MR), under, under, under, nDown, nDown, nDown, underS); T3(lo(MR), lo(OL), lo(OR), under, under, under, nDown, nDown, nDown, underS);
      T3(lo(OL), lo(T), lo(OR), under, under, under, nDown, nDown, nDown, underS);
    }
  }
  // snow cap on the leader
  tri([0, 15.6, 0], [0.18, 15.0, 0], [-0.09, 15.0, 0.16], snowA, needleS[1]);
  tri([0, 15.6, 0], [-0.09, 15.0, 0.16], [-0.09, 15.0, -0.16], snowA, needleS[1]);
  tri([0, 15.6, 0], [-0.09, 15.0, -0.16], [0.18, 15.0, 0], snowA, needleS[1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cw, 3));
  g.setAttribute('color2', new THREE.Float32BufferAttribute(cs, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.normalizeNormals();
  return g;
}
export const SPRUCE_TRIS = (s) => s.attributes.position.count / 3;
void clamp;
