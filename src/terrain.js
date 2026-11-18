// World generation: heightfield (several mountain forms), river + lake, road + tunnel,
// villages with plaza, streets, parking, alpine barns
import { mulberry32, makeSimplex, fbm, ridged, clamp, lerp, smooth } from './noise.js';
import { GN as RGN, sourceFor, resortById } from './real.js';

export const FORMS = { zufall: 'Zufall', kamm: 'Bergkamm', kessel: 'Talkessel', gipfel: 'Grosser Gipfel', plateau: 'Hochplateau', zwei: 'Zwei Berge' };

export function newSeed() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 999999) + 1; } catch (e) { return Math.floor(Math.random() * 999999) + 1; }
}

export const DEFAULTS = {
  gen: 4, seed: 1234, size: 4000, height: 1000, steep: 0.35, variety: 0.4, peaks: 3,
  valley: 0.5, alt: 1000, forest: 0.6, villages: 1, rail: true, villageSize: 'mittel', river: true, lake: true, form: 'zufall',
};

export function randomSettings(seed) {
  const r = mulberry32(seed * 3 + 11);
  const forms = ['kamm', 'kessel', 'gipfel', 'plateau', 'zwei'];
  return {
    gen: 4, seed, size: 4000,
    height: Math.round(lerp(700, 1500, r()) / 50) * 50,
    steep: +lerp(0.15, 0.5, r()).toFixed(2),
    variety: +lerp(0.2, 0.6, r()).toFixed(2),
    peaks: 2 + Math.floor(r() * 4),
    valley: +lerp(0.3, 0.75, r()).toFixed(2),
    forest: +lerp(0.4, 0.8, r()).toFixed(2),
    villages: 1 + Math.floor(r() * 2.6),
    villageSize: ['klein', 'mittel', 'gross'][Math.floor(r() * 3)],
    river: true, lake: r() < 0.75,
    form: forms[Math.floor(r() * forms.length)],
    alt: Math.round(lerp(650, 1550, r()) / 50) * 50,
  };
}

// Raw height function (no carving). Works for any x,z (also outside the map).
export function makeHeightFn(p) {
  const rand = mulberry32(p.seed);
  const n1 = makeSimplex(rand), n2 = makeSimplex(rand), n3 = makeSimplex(rand);
  const S = p.size, H = p.height;
  const forms = ['kamm', 'kessel', 'gipfel', 'plateau', 'zwei'];
  const formPick = forms[Math.floor(rand() * forms.length)];
  const form = p.form && p.form !== 'zufall' ? p.form : formPick;
  const v = lerp(0.13, 0.30, p.valley);            // valley share of map depth
  const g3 = p.gen >= 3; // gen 3: broad, even slopes instead of a steep wall (old saves keep their shape)
  const g2 = p.gen === 2 || g3;
  const expo = g3 ? lerp(1.15, 0.8, p.steep) : g2 ? lerp(2.0, 0.85, p.steep) : lerp(1.7, 0.7, p.steep);
  // the valley meanders a little
  const cAmp = S * lerp(0.008, 0.04, rand()), cFreq = lerp(1.2, 3.2, rand()) * Math.PI * 2 / S, cPh = rand() * 6.28;
  const shift = (x) => cAmp * Math.sin(x * cFreq + cPh);
  const peaks = [];
  const bump = (x, z, rx, rz, h) => peaks.push(g3 ? { x, z, rx: rx * 1.7, rz: rz * 1.7, h: h * 0.55 } : { x, z, rx, rz, h });
  const tz = (t) => S / 2 - t * S;
  const np = Math.max(1, p.peaks);
  if (form === 'kamm') {
    for (let i = 0; i < np; i++) { const r = S * lerp(0.10, 0.2, rand()) * lerp(1.15, 0.8, p.steep); bump(lerp(-0.38, 0.38, (i + 0.2 + rand() * 0.6) / np) * S, tz(lerp(0.6, 0.92, rand())), r, r, H * lerp(0.2, 0.42, rand())); }
  } else if (form === 'kessel') {
    for (let i = 0; i < np + 2; i++) {
      const a = lerp(0.12, 0.88, (i + 0.5) / (np + 2)) * Math.PI;
      const r = S * lerp(0.09, 0.15, rand());
      bump(Math.cos(a) * S * 0.36, tz(0.5) - Math.sin(a) * S * 0.36, r, r, H * lerp(0.3, 0.5, rand()));
    }
    for (const sd of [-1, 1]) bump(sd * S * 0.43, tz(0.55), S * 0.09, S * 0.3, H * 0.35);
  } else if (form === 'gipfel') {
    bump(lerp(-0.15, 0.15, rand()) * S, tz(lerp(0.7, 0.8, rand())), S * 0.2, S * 0.2, H * 0.7);
    for (let i = 0; i < np - 1; i++) { const r = S * lerp(0.07, 0.12, rand()); bump(lerp(-0.4, 0.4, rand()) * S, tz(lerp(0.55, 0.9, rand())), r, r, H * lerp(0.12, 0.25, rand())); }
  } else if (form === 'plateau') {
    for (let i = 0; i < np; i++) { const r = S * lerp(0.06, 0.1, rand()); bump(lerp(-0.4, 0.4, rand()) * S, tz(lerp(0.75, 0.95, rand())), r, r, H * lerp(0.08, 0.18, rand())); }
  } else { // zwei
    const gap = lerp(-0.08, 0.08, rand()) * S;
    for (const sd of [-1, 1]) {
      bump(gap + sd * S * 0.26, tz(lerp(0.68, 0.8, rand())), S * 0.16, S * 0.2, H * lerp(0.45, 0.6, rand()));
      for (let i = 0; i < Math.max(1, np - 2); i++) { const r = S * 0.08; bump(gap + sd * S * lerp(0.12, 0.42, rand()), tz(lerp(0.55, 0.9, rand())), r, r, H * 0.2); }
    }
    peaks.trench = gap;
  }
  const base = (x) => 40 + (x / S) * 30;
  const fn = (x, zIn) => {
    const z = zIn - shift(x);
    const t = (S / 2 - z) / S;
    const foot = v + 0.05 * n1(x / S * 2.2, 3.7);
    let u = clamp((t - foot) / (1 - foot), 0, 1.4);
    let ramp;
    if (form === 'plateau') ramp = smooth(0, 0.42, u) * 0.85 + u * 0.15;
    else ramp = g3 ? Math.pow(u * 0.8 + smooth(0, 1.2, u) * 0.2, expo) : g2 ? Math.pow(u * 0.6 + smooth(0, 1.15, u) * 0.4, expo) : Math.pow(u * 0.55 + smooth(0, 1, u) * 0.45, expo);
    const rampScale = (form === 'kessel' ? 0.5 : form === 'gipfel' ? 0.45 : form === 'zwei' ? 0.45 : 0.75) * (g3 ? 1.25 : 1);
    let h = base(x) + H * rampScale * ramp;
    const inMtn = smooth(foot, foot + (g3 ? 0.34 : g2 ? 0.26 : 0.18), t);
    for (const pk of peaks) {
      const dx = (x - pk.x) / pk.rx, dz = (z - pk.z) / pk.rz;
      h += pk.h * Math.exp(-(dx * dx + dz * dz)) * inMtn;
    }
    if (peaks.trench !== undefined) h -= H * 0.25 * Math.exp(-(((x - peaks.trench) / (S * 0.07)) ** 2)) * inMtn * smooth(foot, foot + 0.4, t);
    const varAmp = form === 'plateau' ? 0.6 : 1;
    h += (ridged(n2, x / S * 2.6, z / S * 2.6, 5) - 0.45) * H * (g3 ? lerp(0.02, 0.11, p.variety) : g2 ? lerp(0.03, 0.2, p.variety) : lerp(0.04, 0.26, p.variety)) * inMtn * varAmp;
    h += fbm(n3, x / S * 14, z / S * 14, 4) * lerp(3, 16, p.variety) * (0.25 + inMtn);
    // opposite valley side (south edge) rises a bit
    h += smooth(foot * 0.55, -0.02, t) * H * 0.16 * (0.7 + 0.3 * n1(x / S * 3, 9.1));
    // valley closes at +x with a hill (road goes into a tunnel there)
    h += smooth(S * 0.26, S * 0.46, x) * (1 - inMtn) * 170;
    return h;
  };
  fn.base = base; fn.foot = v; fn.rand = rand; fn.n1 = n1; fn.shift = shift; fn.form = form;
  fn.valleyZ = (x) => S / 2 - v * 0.55 * S + shift(x);
  return fn;
}

// Real terrain from a GN x GN grid (metres a.s.l.). Picks one of 4 rotations so the main valley
// runs along x from the west edge (the game's road / rail / river layout expects that).
export function makeRealHeightFn(p, src) {
  const S = p.size, n = RGN - 1, cs = S / n;
  let mn = Infinity; for (let k = 0; k < src.length; k++) if (src[k] < mn) mn = src[k];
  const off = mn - 40;
  const maps = [(u, v) => [u, v], (u, v) => [v, n - u], (u, v) => [n - u, n - v], (u, v) => [n - v, u]];
  const raw = (r, i, j) => { const [a, b] = maps[r](i, j); return src[b * RGN + a] - off; };
  // per rotation: best monotone (west->east) stretch of low ground, may start/end inside the map
  const M = 22, TAU = 230, LAM = 3;
  let best = null;
  for (let r = 0; r < 4; r++) {
    const A = new Float32Array(RGN * RGN), B = new Float32Array(RGN * RGN);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) A[j * RGN + i] = raw(r, i, j);
    const R = 3;
    for (let j = 0; j <= n; j++) { let acc = 0, c = 0; for (let i = -R; i <= n + R; i++) { if (i + R <= n) { acc += A[j * RGN + i + R]; c++; } if (i - R - 1 >= 0) { acc -= A[j * RGN + i - R - 1]; c--; } if (i >= 0 && i <= n) B[j * RGN + i] = acc / c; } }
    for (let i = 0; i <= n; i++) { let acc = 0, c = 0; for (let j = -R; j <= n + R; j++) { if (j + R <= n) { acc += B[(j + R) * RGN + i]; c++; } if (j - R - 1 >= 0) { acc -= B[(j - R - 1) * RGN + i]; c--; } if (j >= 0 && j <= n) A[j * RGN + i] = acc / c; } }
    let href = Infinity; for (let k = 0; k < A.length; k++) if (A[k] < href) href = A[k];
    const lo = M, hi = n - 8, W = hi - lo + 1;
    let cost = new Float64Array(W), next = new Float64Array(W);
    const from = new Int16Array((n + 1) * W), fresh = new Uint8Array((n + 1) * W);
    let gBest = Infinity, gi = 0, gk = 0;
    for (let i = 0; i <= n; i++) {
      for (let k = 0; k < W; k++) {
        const j = lo + k;
        const c = A[j * RGN + i] - href - TAU + 40 * clamp(0.62 - j / n, 0, 1) + 90 * clamp((j - (n - 50)) / 40, 0, 1) + 120 * clamp((75 - j) / 40, 0, 1);
        let bc = Infinity, bk = k;
        if (i > 0) for (let d = -2; d <= 2; d++) { const q = k + d; if (q < 0 || q >= W) continue; const v = cost[q] + d * d * LAM; if (v < bc) { bc = v; bk = q; } }
        const st = !(bc < 0);
        next[k] = (st ? 0 : bc) + c; from[i * W + k] = bk; fresh[i * W + k] = st ? 1 : 0;
        if (next[k] < gBest) { gBest = next[k]; gi = i; gk = k; }
      }
      [cost, next] = [next, cost];
    }
    if (!best || gBest < best.score) {
      const J = [];
      let i = gi, k = gk;
      while (true) { J.push(lo + k); if (fresh[i * W + k] || i === 0) break; k = from[i * W + k]; i--; }
      J.reverse();
      best = { r, score: gBest, i0: i, J, A };
    }
  }
  const { r, i0, J, A } = best;
  const L = J.length, i1 = i0 + L - 1;
  const Js = new Float32Array(L), Hs = new Float32Array(L);
  for (let q = 0; q < L; q++) { let a = 0, c = 0; for (let d = -10; d <= 10; d++) { a += J[clamp(q + d, 0, L - 1)]; c++; } Js[q] = a / c; }
  for (let q = 0; q < L; q++) Hs[q] = A[Math.round(Js[q]) * RGN + i0 + q];
  const mirror = (u) => { u = Math.abs(u) % (2 * n); return u > n ? 2 * n - u : u; };
  const fn = (x, z) => {
    const u = mirror((x + S / 2) / cs), v = mirror((z + S / 2) / cs);
    const i = Math.min(n - 1, Math.floor(u)), j = Math.min(n - 1, Math.floor(v)), fx = u - i, fz = v - j;
    return raw(r, i, j) * (1 - fx) * (1 - fz) + raw(r, i + 1, j) * fx * (1 - fz) + raw(r, i, j + 1) * (1 - fx) * fz + raw(r, i + 1, j + 1) * fx * fz;
  };
  const lineAt = (arr, x) => { if (L < 2) return arr[0]; const u = clamp((x + S / 2) / cs - i0, 0, L - 1); const i = Math.min(L - 2, Math.floor(u)), t = u - i; return arr[i] * (1 - t) + arr[i + 1] * t; };
  fn.base = (x) => lineAt(Hs, x);
  fn.valleyZ = (x) => -S / 2 + lineAt(Js, x) * cs;
  fn.n1 = () => 0; fn.rand = mulberry32(p.seed); fn.shift = () => 0; fn.form = 'real'; fn.foot = 0.3;
  fn.off = off; fn.rot = r; fn.realStart = -S / 2 + i0 * cs; fn.realEnd = -S / 2 + i1 * cs;
  return fn;
}

export function generateWorld(p) {
  const S = p.size;
  const src = p.real ? sourceFor(p) : null;
  if (p.real && !src) throw new Error('Höhendaten fehlen');
  const N = src ? RGN - 1 : S <= 3000 ? 288 : S <= 4000 ? 384 : 448;
  const cell = S / N;
  const hf = src ? makeRealHeightFn(p, src) : makeHeightFn(p);
  const real = !!src;
  const rand = mulberry32(p.seed * 7 + 3);
  const heights = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) heights[j * (N + 1) + i] = hf(-S / 2 + i * cell, -S / 2 + j * cell);

  const world = { params: p, S, N, cell, heights, hf, form: hf.form, river: [], road: [], tunnel: null, villages: [], lake: null, streets: [], barns: [], parking: null };
  world.valleyZ = hf.valleyZ(0);
  world.valleyZAt = hf.valleyZ;

  // --- road along the valley, into a tunnel at +x
  const road = [];
  const x0 = real ? Math.max(-S / 2, Math.ceil(hf.realStart / 10) * 10) : -S / 2;
  for (let x = x0; x <= S / 2; x += 10) {
    const z = real ? hf.valleyZ(x) - 30 : hf.valleyZ(x) - 40 + hf.n1(x / S * 2.5, 21.3) * S * 0.015;
    const raw = hf(x, z);
    if (real ? x > hf.realEnd : raw - hf.base(x) > 16 && x > 0) break;
    road.push({ x, z, raw });
  }
  for (let k = 0; k < road.length; k++) {
    let s = 0, c = 0;
    for (let m = -6; m <= 6; m++) { const q = road[clamp(k + m, 0, road.length - 1)]; s += q.raw; c++; }
    road[k].h = real ? clamp(s / c, hf.base(road[k].x) + 1.5, hf.base(road[k].x) + 12) : Math.min(s / c, hf.base(road[k].x) + 6);
  }
  if (real) for (let it = 0; it < 3; it++) for (let k = 1; k < road.length - 1; k++) road[k].h = (road[k - 1].h + road[k].h * 2 + road[k + 1].h) / 4;
  world.road = road;
  if (road.length > 2) {
    const a = road[road.length - 2], b = road[road.length - 1];
    world.tunnel = { x: b.x, z: b.z, h: b.h, dir: Math.atan2(b.z - a.z, b.x - a.x) };
    // real valleys can start inside the map: tunnel there as well
    if (real && road[0].x > -S / 2 + 60) { const c = road[0], d = road[1]; world.tunnel0 = { x: c.x, z: c.z, h: c.h, dir: Math.atan2(c.z - d.z, c.x - d.x) }; }
  }

  // --- railway: parallel to the road on the village side, from the map edge into its own tunnel
  world.rail = [];
  // gen 4: rail further from the road so a proper road bridge can cross it (gen <= 3: 26 m, level crossing)
  const railOff = p.gen >= 4 ? 70 : 26;
  world.railOff = railOff;
  world.overpasses = []; world.riverBridges = [];
  if (p.rail !== false && road.length > 30) {
    const rail = road.map((q) => { const z = q.z - railOff; return { x: q.x, z, raw: hf(q.x, z) }; });
    for (let k = 0; k < rail.length; k++) {
      let s2 = 0, c2 = 0;
      for (let m = -10; m <= 10; m++) { const q = rail[clamp(k + m, 0, rail.length - 1)]; s2 += q.raw; c2++; }
      rail[k].h0 = real ? clamp(s2 / c2, hf.base(rail[k].x) + 2, hf.base(rail[k].x) + 16) : Math.min(s2 / c2, hf.base(rail[k].x) + 5);
    }
    for (let k = 0; k < rail.length; k++) {
      let s2 = 0, c2 = 0;
      for (let m = -8; m <= 8; m++) { const q = rail[clamp(k + m, 0, rail.length - 1)]; s2 += q.h0; c2++; }
      rail[k].h = s2 / c2 + 0.4;
    }
    world.rail = rail;
    const a = rail[rail.length - 2], b = rail[rail.length - 1];
    world.railTunnel = { x: b.x, z: b.z, h: b.h, dir: Math.atan2(b.z - a.z, b.x - a.x) };
    if (real && rail[0].x > -S / 2 + 60) { const c = rail[0], d = rail[1]; world.railTunnel0 = { x: c.x, z: c.z, h: c.h, dir: Math.atan2(c.z - d.z, c.x - d.x) }; }
  }

  // --- river (south of road) and lake
  if (p.river) {
    const pts = [];
    for (let x = real ? x0 : -S / 2; x <= S / 2; x += 10) {
      if (real) { if (x > hf.realEnd + 400) break; pts.push({ x, z: Math.min(S / 2 - 12, hf.valleyZ(x) + 30) }); continue; }
      let z = hf.valleyZ(x) + 50 + hf.n1(x / S * 3.1, 77.7) * S * 0.025;
      const rz = roadZAt(world, x);
      if (rz !== null) z = Math.max(z, rz + 60);
      const raw = hf(x, z);
      if (raw - hf.base(x) > 10 && x > 0) break;
      pts.push({ x, z });
    }
    if (p.lake && pts.length > 40) {
      const xl = lerp(-0.42, -0.12, rand()) * S;
      const k = clamp(Math.round((xl + S / 2) / 10), 0, pts.length - 1);
      const zc = pts[k].z;
      const rz = roadZAt(world, xl) ?? zc - 60;
      const b = clamp(lerp(60, 110, rand()), 45, Math.max(45, zc - rz - 20));
      const a = lerp(130, 230, rand());
      world.lake = { x: xl, z: zc + b * 0.15, a, b, level: hf.base(xl) - 1.5 };
    }
    const L = world.lake;
    for (const q of pts) {
      let wl = real ? Math.min(hf.base(q.x), hf(q.x, q.z)) - 1.2 : hf.base(q.x) - 1.5;
      if (L && Math.abs(q.x - L.x) < L.a * 1.05) wl = L.level;
      if (L && q.x > L.x + L.a) wl = Math.max(wl, L.level);
      q.h = wl - 3.2; q.wl = wl;
    }
    world.river = pts;
  }

  carve(world, world.road, 6, 16, 0.2);
  if (world.rail.length) carve(world, world.rail, 4.5, 13, 0);
  carve(world, world.river, 9, 27, 0);
  if (world.lake) carveLake(world);
  if (world.tunnel && (!real || world.tunnel.x < S / 2 - 60)) raiseTunnelHill(world, world.tunnel);
  if (world.tunnel0) raiseTunnelHill(world, world.tunnel0);

  // --- villages along the road
  const sizeInfo = { klein: { n: 16, r: 130, plaza: 14 }, mittel: { n: 40, r: 210, plaza: 20 }, gross: { n: 120, r: 380, plaza: 30 } }[p.villageSize] || { n: 40, r: 210, plaza: 20 };
  const nv = Math.min(p.villages, 3);
  let xmax = world.tunnel ? world.tunnel.x - 350 : S * 0.35, xmin = -S * 0.38;
  if (real && world.road.length) { xmin = world.road[0].x + 300; xmax = Math.min(xmax, world.road.at(-1).x - 300); if (xmax < xmin) xmin = xmax = (world.road[0].x + world.road.at(-1).x) / 2; }
  const lakeDist = (x, z) => { const L = world.lake; if (!L) return 99; return Math.hypot((x - L.x) / L.a, (z - L.z) / L.b); };
  const placedAll = [];
  for (let k = 0; k < nv; k++) {
    let vx = lerp(xmin, xmax, (k + 0.5) / nv) + (rand() - 0.5) * 120;
    // keep villages away from the lake
    for (let tries = 0; tries < 20 && lakeDist(vx, roadZAt(world, vx) ?? 0) < 1.6; tries++) vx += 60;
    const rz = roadZAt(world, vx) ?? world.valleyZ;
    const g4 = p.gen >= 4 && world.rail.length;
    const pz = rz - sizeInfo.plaza - (world.rail.length ? (g4 ? railOff + 28 : 42) : 14);
    // gen 4: road bridge over the railway ~65 m past the end of the 120 m platform
    let ov = null;
    if (g4) ov = planOverpass(world, vx, rz, pz, k === 0);
    const village = { x: vx, z: pz, roadZ: rz, r: sizeInfo.r, plaza: sizeInfo.plaza, houses: [], church: null, size: p.villageSize };
    const placed = [{ x: vx, z: pz, rad: sizeInfo.plaza + 3 }];
    const isFree = (x, z, rad) => {
      if (Math.abs(x) > S / 2 - 30 || Math.abs(z) > S / 2 - 30) return false;
      if (distToLine(world.road, x, z) < rad + 9) return false;
      if (world.rail.length && distToLine(world.rail, x, z) < rad + 10) return false;
      if (world.rail.length && !g4 && Math.abs(x - vx) < 75 && z > roadZAt(world, x) - 60 && z < roadZAt(world, x) - 10) return false; // station area
      if (g4 && Math.abs(x - vx) < 75 && z > roadZAt(world, x) - railOff - 36 && z < roadZAt(world, x) - railOff + 12) return false; // station area
      if (ov && (segDist(ov.n, ov.s, x, z) < rad + 9 || segDist(ov.street.a, ov.street.b, x, z) < rad + 6)) return false;
      if (world.river.length && distToLine(world.river, x, z) < rad + 22) return false;
      if (lakeDist(x, z) < 1.25 + rad / 100) return false;
      for (const q of placed) if (Math.hypot(q.x - x, q.z - z) < rad + q.rad + 4) return false;
      for (const q of placedAll) if (Math.hypot(q.x - x, q.z - z) < rad + q.rad + 4) return false;
      const h1 = heightAt(world, x - rad, z - rad), h2 = heightAt(world, x + rad, z + rad), h3 = heightAt(world, x + rad, z - rad), h4 = heightAt(world, x - rad, z + rad);
      return Math.max(h1, h2, h3, h4) - Math.min(h1, h2, h3, h4) < rad * 0.8;
    };
    if (p.villageSize !== 'klein') {
      for (let tries = 0; tries < 60; tries++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.6, d = sizeInfo.plaza + 16;
        const x = vx + Math.cos(a) * d, z = pz + Math.sin(a) * d;
        if (isFree(x, z, 17)) { village.church = { x, z, rot: Math.atan2(vx - x, pz - z) }; placed.push({ x, z, rad: 17 }); break; }
      }
    }
    let count = 0;
    for (let tries = 0; tries < sizeInfo.n * 40 && count < sizeInfo.n; tries++) {
      const a = rand() * Math.PI * 2, d = sizeInfo.plaza + 12 + Math.sqrt(rand()) * sizeInfo.r;
      const x = vx + Math.cos(a) * d * 1.35, z = pz + Math.sin(a) * d * 0.8;
      const hotel = rand() < (p.villageSize === 'gross' ? 0.16 : 0.07);
      const w = hotel ? lerp(20, 28, rand()) : lerp(10, 14, rand());
      const dd = hotel ? lerp(12, 15, rand()) : lerp(8.5, 11, rand());
      const rad = Math.hypot(w, dd) / 2;
      if (!isFree(x, z, rad)) continue;
      const floors = hotel ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2);
      // face the plaza or the road
      const toPlaza = Math.atan2(vx - x, pz - z);
      const rot = Math.round(toPlaza / (Math.PI / 2)) * (Math.PI / 2) + (rand() - 0.5) * 0.2;
      village.houses.push({ x, z, w, d: dd, floors, rot, hotel, wood: rand() < 0.7 });
      placed.push({ x, z, rad });
      count++;
      // driveway to the road or plaza
      const rd = nearestOnLine(world.road, x, z);
      const toRoad = rd.d, dPl = Math.hypot(x - vx, z - pz) - sizeInfo.plaza;
      if (Math.min(toRoad, dPl) < 140) {
        if ((g4 && z > roadZAt(world, x) - railOff) || (toRoad < dPl && (!world.rail.length || z > roadZAt(world, x)))) { const q = pointOnLine(world.road, x, z); world.streets.push({ a: { x, z }, b: q, w: 4.5 }); }
        else { const l = Math.hypot(vx - x, pz - z); world.streets.push({ a: { x, z }, b: { x: vx + (x - vx) / l * sizeInfo.plaza * 0.8, z: pz + (z - pz) / l * sizeInfo.plaza * 0.8 }, w: 4.5 }); }
      }
    }
    // plaza connects to the road (gen 4: via the bridge over the railway, no level crossing)
    if (ov) { world.overpasses.push(ov); world.streets.push(ov.street, ov.tail); }
    else world.streets.push({ a: { x: vx, z: pz }, b: { x: vx, z: rz }, w: 8 });
    if (p.gen >= 4) { const rb = planRiverBridge(world, village, placed, ov); if (rb) { world.riverBridges.push(rb); world.streets.push(...rb.streets); } }
    placedAll.push(...placed);
    world.villages.push(village);
  }
  // railway station next to the first village
  if (world.rail.length && world.villages.length) {
    const v = world.villages[0];
    const r = nearestOnLine(world.rail, v.x, roadZAt(world, v.x) - railOff);
    world.railStation = { x: r.px, z: r.pz, h: r.h, k: r.k };
  }
  // parking near the first village
  if (world.villages.length) {
    const v = world.villages[0];
    for (let tries = 0; tries < 30; tries++) {
      const x = v.x + (tries % 2 ? 1 : -1) * (v.r * 0.9 + 30 + tries * 8);
      const rz = roadZAt(world, x);
      if (rz === null) continue;
      const z = rz + 30;
      if (world.river.length && distToLine(world.river, x, z) < 45) continue;
      if (lakeDist(x, z) < 1.3) continue;
      if (world.riverBridges.some((b) => Math.abs(b.x - x) < 50)) continue;
      world.parking = { x, z, w: 46, d: 26 };
      world.streets.push({ a: { x, z: z - 10 }, b: { x, z: rz }, w: 7 });
      break;
    }
  }
  // altitude above sea level of the valley floor (m ü. M.) -> tree line ~2000 m, summer snow ~3000 m
  const alt = p.alt == null ? 1000 : p.alt;
  world.alt = alt;
  world.altOff = alt - hf.base(0);
  world.treeline = hf.base(0) + Math.max(35, lerp(1880, 2080, rand()) - alt);
  world.snowline = hf.base(0) + Math.max(160, lerp(2800, 3050, rand()) - alt);
  if (real) {
    const R = resortById(p.real) || {};
    const tAbs = p.treeAbs ?? R.t ?? 2050, sAbs = p.snowAbs ?? R.s ?? 3000;
    world.altOff = hf.off; world.alt = Math.round(hf.base(0) + hf.off);
    world.treeline = Math.max(hf.base(0) + 15, tAbs - hf.off);
    world.snowline = Math.max(hf.base(0) + 160, sAbs - hf.off);
    world.real = { id: p.real, name: p.name || R.name, rot: hf.rot };
  }
  // alpine barns (Maiensäss) on gentle meadows above the valley
  for (let tries = 0; tries < 400 && world.barns.length < 18; tries++) {
    const x = lerp(-0.45, 0.45, rand()) * S;
    const z = hf.valleyZ(x) - lerp(150, S * 0.35, rand());
    if (Math.abs(z) > S / 2 - 40) continue;
    const h = heightAt(world, x, z);
    if (h > world.treeline + 80) continue;
    const n = normalAt(world, x, z);
    if (n.y < 0.9) continue;
    if (placedAll.some((q) => Math.hypot(q.x - x, q.z - z) < 80)) continue;
    if (world.barns.some((q) => Math.hypot(q.x - x, q.z - z) < 90)) continue;
    world.barns.push({ x, z, rot: rand() * Math.PI });
  }
  world.placedAll = placedAll;
  world.heights0 = heights.slice();
  return world;
}

function carveLake(world) {
  const { N, cell, S, heights, lake: L } = world;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
    const e = Math.hypot((x - L.x) / L.a, (z - L.z) / L.b);
    if (e > 1.5) continue;
    const k = j * (N + 1) + i;
    const target = L.level - 1.2 - 6 * Math.max(0, 1 - e * e);
    if (e < 1) heights[k] = Math.min(heights[k], target);
    else {
      const w = 1 - smooth(1, 1.5, e);
      const bank = L.level + 0.6 + (e - 1) * 6;
      heights[k] = lerp(heights[k], Math.min(heights[k], bank), w);
    }
  }
}

// make sure the tunnel portal sits in a hillside
function raiseTunnelHill(world, t) {
  const { N, cell, S, heights } = world;
  const c = Math.cos(t.dir), s = Math.sin(t.dir);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -S / 2 + i * cell - t.x, z = -S / 2 + j * cell - t.z;
    const ahead = x * c + z * s, lat = Math.abs(-x * s + z * c);
    if (ahead < -70 || lat > 140) continue;
    const k = j * (N + 1) + i;
    if (ahead <= 0) {
      const w = smooth(34, 16, lat) * smooth(-70, -40, ahead);
      heights[k] = lerp(heights[k], t.h - 0.2, w);
      continue;
    }
    const target = t.h + 14 + ahead * 0.4 + Math.max(0, lat - 12) * 0.25;
    // real terrain: only a small hill right at the portal, no endless ramp into the landscape
    const w = smooth(0, 16, ahead) * smooth(140, 60, lat) * (world.params.real ? smooth(130, 50, ahead) : 1);
    const v = lerp(heights[k], target, w);
    if (v > heights[k]) heights[k] = v;
  }
}

function segDist(a, b, x, z) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

// road bridge over the railway: deck across the track, ramps down to the main road (south) and
// towards the village (north). Placed 125 m from the village centre (station end + ~65 m).
function planOverpass(world, vx, rz, pz, hasStation) {
  const S = world.S, R = world.rail;
  const tun = world.railTunnel;
  let side = 1;
  let x = vx + 125;
  const rx0 = R[0].x + 80, rx1 = R[R.length - 1].x - 140;
  if ((tun && x > tun.x - 140) || x > S / 2 - 120 || x > rx1) { side = -1; x = vx - 125; }
  if (x < -S / 2 + 120 || x < rx0) return null;
  const r = nearestOnLine(R, x, (roadZAt(world, x) ?? rz) - world.railOff);
  const a = R[r.k], b = R[r.k + 1];
  const vxd = b.x - a.x, vzd = b.z - a.z, vl = Math.hypot(vxd, vzd) || 1;
  const v = { x: vxd / vl, z: vzd / vl };
  let u = { x: -v.z, z: v.x }; // towards the road (+z side)
  if (u.z < 0) u = { x: -u.x, z: -u.z };
  const o = { x: r.px, z: r.pz };
  // distance along u to the road edge
  let aS = 20;
  for (; aS < 140; aS += 1) if (distToLine(world.road, o.x + u.x * aS, o.z + u.z * aS) < 6.5) break;
  const half = 9, aN = half + Math.max(46, aS - half);
  const deckY = r.h + 7.6;
  const n = { x: o.x - u.x * aN, z: o.z - u.z * aN }, s = { x: o.x + u.x * aS, z: o.z + u.z * aS };
  const rd = nearestOnLine(world.road, s.x, s.z);
  return {
    x: o.x, z: o.z, u, v, half, aN, aS, deckY, railH: r.h, roadH: rd.h, side, station: hasStation, n, s,
    street: { a: { x: vx, z: pz }, b: { x: n.x - u.x * 2, z: n.z - u.z * 2 }, w: 8 },
    tail: { a: { x: s.x - u.x * 1, z: s.z - u.z * 1 }, b: { x: rd.px, z: rd.pz }, w: 8 },
  };
}

// road bridge over the river near each village, with a lane on the far bank
function planRiverBridge(world, v, placed, ov) {
  const Rv = world.river, L = world.lake;
  if (!Rv.length || !world.road.length) return null;
  for (const d of [-90, 90, -150, 150, -210, 210, -40, 40, -280, 280]) {
    const x = v.x + d;
    if (Math.abs(x) > world.S / 2 - 120) continue;
    if (ov && Math.abs(x - ov.x) < 60) continue;
    if (L && Math.abs(x - L.x) < L.a * 1.3) continue;
    if (x > Rv[Rv.length - 1].x - 60 || x < Rv[0].x + 60) continue;
    const rzr = roadZAt(world, x); if (rzr === null) continue;
    const r = nearestOnLine(Rv, x, rzr + 80);
    if (!isFinite(r.d)) continue;
    const a = Rv[r.k], b = Rv[r.k + 1];
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const t = { x: (b.x - a.x) / tl, z: (b.z - a.z) / tl };
    let u = { x: -t.z, z: t.x }; if (u.z < 0) u = { x: -u.x, z: -u.z }; // pointing south (away from the road)
    const c = { x: r.px, z: r.pz }, wl = r.h + 3.2;
    const deckY = wl + 3.3;
    // abutments where the bank reaches the deck
    const end = (sg) => { let a2 = 12; for (; a2 < 42; a2 += 1) if (heightAt(world, c.x + u.x * a2 * sg, c.z + u.z * a2 * sg) > deckY - 1.2) break; return a2; };
    const aN = end(-1), aS = end(1);
    const nE = { x: c.x - u.x * aN, z: c.z - u.z * aN }, sE = { x: c.x + u.x * aS, z: c.z + u.z * aS };
    const rd = nearestOnLine(world.road, nE.x, nE.z);
    if (rd.d > 150) continue;
    const far = { x: sE.x + u.x * 45, z: sE.z + u.z * 45 };
    const clear = (p1, p2, m) => placed.every((q) => segDist(p1, p2, q.x, q.z) > q.rad + m) && v.houses.every((h) => segDist(p1, p2, h.x, h.z) > Math.max(h.w, h.d) / 2 + m);
    if (!clear({ x: rd.px, z: rd.pz }, far, 5)) continue;
    if (world.parking && Math.abs(world.parking.x - x) < 50) continue;
    return {
      x: c.x, z: c.z, u, t, aN, aS, deckY, wl,
      streets: [{ a: { x: rd.px, z: rd.pz }, b: { x: nE.x + u.x * 1.5, z: nE.z + u.z * 1.5 }, w: 7 }, { a: { x: sE.x - u.x * 1.5, z: sE.z - u.z * 1.5 }, b: far, w: 6 }],
    };
  }
  return null;
}

export function roadZAt(world, x) {
  const r = world.road;
  if (!r.length) return null;
  if (x <= r[0].x) return r[0].z;
  if (x >= r[r.length - 1].x) return r[r.length - 1].z;
  const k = Math.min(r.length - 2, Math.floor((x - r[0].x) / 10));
  const t = (x - r[k].x) / 10;
  return lerp(r[k].z, r[k + 1].z, t);
}

// flatten terrain along a polyline (points with x,z,h)
function carve(world, line, inner, outer, raise) {
  if (line.length < 2) return;
  const { N, cell, S, heights } = world;
  for (let j = 0; j <= N; j++) {
    const z = -S / 2 + j * cell;
    for (let i = 0; i <= N; i++) {
      const x = -S / 2 + i * cell;
      if (x < line[0].x - outer || x > line[line.length - 1].x + outer) continue;
      const res = nearestOnLine(line, x, z);
      if (res.d > outer) continue;
      const target = res.h + raise;
      const w = 1 - smooth(inner, outer, res.d);
      const idx = j * (N + 1) + i;
      heights[idx] = lerp(heights[idx], target, w);
    }
  }
}

export function nearestOnLine(line, x, z) {
  let best = { d: Infinity, h: 0, t: 0, k: 0, px: 0, pz: 0 };
  if (line.length < 2) return best;
  const k0 = clamp(Math.floor((x - line[0].x) / 10) - 6, 0, line.length - 2);
  const k1 = clamp(k0 + 12, 0, line.length - 2);
  for (let k = k0; k <= k1; k++) {
    const a = line[k], b = line[k + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, h: lerp(a.h, b.h, t), t, k, px, pz };
  }
  return best;
}
function pointOnLine(line, x, z) { const r = nearestOnLine(line, x, z); return { x: r.px, z: r.pz }; }

export function distToLine(line, x, z) {
  if (line.length < 2) return Infinity;
  if (x < line[0].x - 200 || x > line[line.length - 1].x + 200) return Infinity;
  return nearestOnLine(line, x, z).d;
}

export function heightAt(world, x, z) {
  const { N, cell, S, heights } = world;
  const fx = clamp((x + S / 2) / cell, 0, N - 0.0001), fz = clamp((z + S / 2) / cell, 0, N - 0.0001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const r = N + 1;
  const a = heights[j * r + i], b = heights[j * r + i + 1], c = heights[(j + 1) * r + i], d = heights[(j + 1) * r + i + 1];
  // follow the actual triangle split (a,c,b)/(b,c,d) so objects sit exactly on the mesh
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

export function normalAt(world, x, z) {
  const e = world.cell * 0.75;
  const hx = heightAt(world, x + e, z) - heightAt(world, x - e, z);
  const hz = heightAt(world, x, z + e) - heightAt(world, x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return { x: nx / l, y: ny / l, z: nz / l };
}

export function inMap(world, x, z, margin = 0) {
  const h = world.S / 2 - margin;
  return x > -h && x < h && z > -h && z < h;
}

export function inWater(world, x, z, margin = 0) {
  if (world.lake) { const L = world.lake; if (Math.hypot((x - L.x) / (L.a + margin), (z - L.z) / (L.b + margin)) < 1) return true; }
  if (world.river.length && distToLine(world.river, x, z) < 11 + margin) return true;
  return false;
}

// Quick low-res preview (for the start screen)
export function drawPreview(canvas, p) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, Hh = canvas.height;
  const hf = makeHeightFn(p);
  const S = p.size;
  const res = 110;
  const vals = new Float32Array(res * res);
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const v = hf(-S / 2 + (i / (res - 1)) * S, -S / 2 + (j / (res - 1)) * S);
    vals[j * res + i] = v; mn = Math.min(mn, v); mx = Math.max(mx, v);
  }
  const img = ctx.createImageData(res, res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const v = vals[j * res + i];
    const l = vals[j * res + Math.max(0, i - 1)], u = vals[Math.max(0, j - 1) * res + i];
    const shade = clamp(0.8 + ((v - l) + (v - u)) / (S / res) * 0.5, 0.35, 1.3);
    const t = (v - mn) / (mx - mn + 1);
    let r, g, b;
    if (t < 0.1) { r = 120; g = 160; b = 110; } else if (t < 0.42) { r = 60; g = 110; b = 70; } else if (t < 0.66) { r = 150; g = 145; b = 135; } else { r = 245; g = 248; b = 252; }
    const o = (j * res + i) * 4;
    img.data[o] = clamp(r * shade, 0, 255); img.data[o + 1] = clamp(g * shade, 0, 255); img.data[o + 2] = clamp(b * shade, 0, 255); img.data[o + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = res; tmp.height = res;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, W, Hh);
  // river line
  if (p.river) {
    ctx.strokeStyle = 'rgba(70,130,190,0.9)'; ctx.lineWidth = 3; ctx.beginPath();
    for (let x = -S / 2; x <= S / 2; x += 40) { const z = hf.valleyZ(x) + 50; const px = (x + S / 2) / S * W, py = (z + S / 2) / S * Hh; x === -S / 2 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
  }
  ctx.fillStyle = '#ffcc33'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  const nv = Math.min(p.villages, 3);
  for (let k = 0; k < nv; k++) {
    const vx = lerp(-S * 0.38, S * 0.2, (k + 0.5) / nv);
    const px = (vx + S / 2) / S * W, py = (hf.valleyZ(vx) - 70 + S / 2) / S * Hh;
    const r = { klein: 4, mittel: 6, gross: 8 }[p.villageSize] || 6;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, Hh - 24, W, 24);
  ctx.fillStyle = '#fff'; ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('Bergform: ' + (FORMS[hf.form] || hf.form), 8, Hh - 8);
}
