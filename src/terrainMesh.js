// Terrain mesh with a procedural shader (snow / rock / meadow / corduroy), seasons,
// paint layers for pistes (winter) and trails (summer), 3D snow berms along piste edges.
import * as THREE from 'three';
import { heightAt, normalAt, distToLine, inWater } from './terrain.js';
import { clamp, lerp, smooth, ridged, makeSimplex, mulberry32 } from './noise.js';
import { GFX } from './gfx.js';

export const PISTE_COLORS = { 1: [35, 105, 225], 2: [225, 35, 35], 3: [25, 25, 28], 4: [240, 200, 20], 5: [150, 60, 205], 6: [30, 165, 95] };
// piste values: 1 blue, 2 red, 3 black, 4 freeride, 5 sledge run (Schlittelweg), 6 cross-country trail (Loipe)
export const TRAIL_TYPES = {
  1: { name: 'Wanderweg', color: [240, 200, 40], width: 3 },
  2: { name: 'Bergweg', color: [230, 60, 60], width: 2.5 },
  3: { name: 'Bike-Trail', color: [40, 140, 230], width: 3 },
  4: { name: 'Downhill-Trail', color: [30, 30, 30], width: 3 },
};

function makeNoiseTexture(seed) {
  const R = 256;
  const data = new Uint8Array(R * R * 4);
  const hash = (i, j, o, ch) => {
    let n = (i * 374761393 + j * 668265263 + o * 2246822519 + ch * 3266489917 + seed * 668265261) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  for (let ch = 0; ch < 4; ch++) {
    const base = [4, 8, 16, 32][ch];
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      let v = 0, amp = 1, tot = 0;
      for (let o = 0; o < 4; o++) {
        const c = base << o;
        if (c > R) break;
        const fx = x / R * c, fy = y / R * c;
        const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const h = (i, j) => hash(((i % c) + c) % c, ((j % c) + c) % c, o, ch);
        v += amp * lerp(lerp(h(i0, j0), h(i0 + 1, j0), sx), lerp(h(i0, j0 + 1), h(i0 + 1, j0 + 1), sx), sy);
        tot += amp; amp *= 0.5;
      }
      data[(y * R + x) * 4 + ch] = Math.round(v / tot * 255);
    }
  }
  // stretch contrast per channel
  for (let ch = 0; ch < 4; ch++) {
    let mn = 255, mx = 0;
    for (let k = ch; k < data.length; k += 4) { mn = Math.min(mn, data[k]); mx = Math.max(mx, data[k]); }
    for (let k = ch; k < data.length; k += 4) data[k] = Math.round((data[k] - mn) / Math.max(1, mx - mn) * 255);
  }
  const t = new THREE.DataTexture(data, R, R, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const VERT_HEAD = `
varying vec3 vWPos;
varying vec3 vWNorm;
attribute float ao;
varying float vAO;
#ifdef HYPER
attribute float sunv;
varying float vSunV;
#endif
`;
const FRAG_HEAD = `
varying vec3 vWPos;
varying vec3 vWNorm;
varying float vAO;
#ifdef HYPER
varying float vSunV;
#endif
uniform sampler2D uPaint;
uniform sampler2D uStatic;
uniform sampler2D uNoise;
uniform sampler2D uGroomTex;
uniform float uSize;
uniform float uSeason;
uniform float uOverlay;
uniform float uGroom;
uniform float uSnowline;
uniform float uTreeline;
uniform float uValley;
uniform float uFresh;
uniform float uAltOff;
uniform vec3 uSunDir;
uniform float uCover;
uniform float uPisteCover;
uniform sampler2D uSurfA;
uniform sampler2D uSurfB;
uniform float uRoadCnt;
uniform float uNewSnow;
uniform float uTime;
uniform float uClouds;
vec3 tBumpN(vec3 surf_pos, vec3 surf_norm, float h) {
  vec3 vSigmaX = dFdx(surf_pos); vec3 vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1);
  vec2 dHdxy = vec2(dFdx(h), dFdy(h));
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;
const FRAG_COLOR = `
  vec3 tn = normalize(vWNorm);
  float hyperSpec = 0.0;
  float slope = 1.0 - tn.y;
  vec2 wp = vWPos.xz;
  float hgt = vWPos.y;
  vec2 tuv = (wp + uSize * 0.5) / uSize;
  vec4 P = texture2D(uPaint, tuv);
  vec4 St = texture2D(uStatic, tuv);
  vec4 nA = texture2D(uNoise, wp / 41.0);
  vec4 nB = texture2D(uNoise, wp / 233.0);
  vec4 nC = texture2D(uNoise, wp / 6.7);
  vec4 nD = texture2D(uNoise, wp / 1.9);
  float rockA = smoothstep(0.30, 0.47, slope + (nB.g - 0.5) * 0.14);
  vec3 rock = mix(vec3(0.33, 0.31, 0.29), vec3(0.52, 0.49, 0.45), nA.r) * (0.82 + 0.32 * nC.b);
  float strata = sin(hgt * 0.8 + nA.g * 5.0);
  rock *= 0.92 + 0.08 * strata * clamp(1.0 - fwidth(hgt) * 1.2, 0.0, 1.0);
  #ifdef HYPER
  // cracks, darker gullies and lichen tints in the rock
  rock *= mix(0.55, 1.0, smoothstep(0.03, 0.22, abs(nC.g - 0.5) * 2.0)) * (0.85 + 0.3 * nD.r);
  rock = mix(rock, rock * vec3(1.08, 1.02, 0.86), smoothstep(0.6, 0.8, nA.g) * 0.5);
  #endif
  vec3 col;
  // bump height (metres) for lighting detail; fades with distance to avoid shimmering
  float bumpFade = clamp(1.0 - length(fwidth(wp)) * 0.35, 0.0, 1.0);
  float tBump = (nC.r * 0.35 + nD.g * 0.12 + nA.b * 0.8) * bumpFade;
  if (uSeason < 0.5) {
    // snow depth by altitude above sea level: thin in the valley, deep up high (+ fresh snowfall)
    float absAlt = hgt + uAltOff;
    float depth = clamp(smoothstep(650.0, 2300.0, absAlt + (nB.r - 0.5) * 260.0) * (0.35 + 0.75 * uCover) + uFresh * 0.18 + (uCover - 0.6) * 0.35, 0.0, 1.0);
    float thin = 1.0 - smoothstep(0.0, 0.42, depth);
    vec3 snow = vec3(0.90, 0.925, 0.965) * (0.95 + 0.05 * nB.r) + (nC.g - 0.5) * 0.035;
    snow *= 0.975 + 0.025 * nD.r;
    // fresh snow is a bit brighter, old snow slightly grey; thin valley snow a little dull
    snow = mix(snow * 0.97, snow * 1.02, uFresh);
    snow *= 1.0 - thin * 0.045 * (1.0 - uFresh);
    // wind-blown drifts (sastrugi) on deep snow up high
    vec4 nW = texture2D(uNoise, vec2(dot(wp, vec2(0.8, 0.6)) / 11.0, dot(wp, vec2(-0.6, 0.8)) / 2.4));
    float drift = smoothstep(0.35, 0.9, nW.r) * depth * (1.0 - uFresh * 0.5);
    snow *= 1.0 - drift * 0.025;
    // deep snow buries the rocks: only the steepest cliffs stay dark up high
    float rockD = smoothstep(0.30 + depth * 0.09, 0.47 + depth * 0.12, slope + (nB.g - 0.5) * 0.14);
    float rk = rockD * (0.75 + 0.25 * smoothstep(0.35, 0.6, slope)) * (1.0 - uFresh * 0.4) * (1.08 - depth * 0.2);
    // snow clinging on rock ledges
    rk *= 1.0 - smoothstep(0.55, 0.8, nC.b) * 0.35 * depth;
    col = mix(snow, rock, clamp(rk, 0.0, 1.0));
    // thin snow in the valley: patches of brown meadow / earth melt through
    vec4 nP = texture2D(uNoise, wp / 17.0 + vec2(0.31, 0.71));
    float patchN = nA.g * 0.4 + nP.r * 0.3 + nC.b * 0.2 + nD.r * 0.1;
    float patches = smoothstep(0.66 - thin * 0.2, 0.78 - thin * 0.2, patchN + slope * 0.4) * smoothstep(0.05, 0.4, thin) * (1.0 - uFresh * 0.7);
    vec3 ground = mix(vec3(0.38, 0.33, 0.22), vec3(0.31, 0.33, 0.20), nC.r) * (0.78 + 0.3 * nD.g);
    float rim = patches * (1.0 - patches) * 4.0;
    col = mix(col, ground, patches * (1.0 - St.b) * (1.0 - St.r));
    col *= 1.0 - rim * 0.08;
    tBump = tBump * (0.7 + 0.5 * depth) + (drift * 0.5 + patches * 0.15) * bumpFade;
    // glitter: tiny ice crystals that twinkle when the camera moves
    vec3 vd = normalize(vViewPosition);
    float spk = texture2D(uNoise, wp / 0.53 + vd.xy * 0.7).a * texture2D(uNoise, wp / 0.31 + vd.yx * 0.5 + 0.37).b;
    #ifdef POTATO
    spk = 0.0;
    #endif
    float glit = smoothstep(0.78, 0.84, spk) * clamp(1.0 - length(fwidth(wp)) * 2.5, 0.0, 1.0) * (1.0 - rk) * (1.0 - patches) * (0.5 + 0.5 * uFresh);
    vec4 GR = texture2D(uGroomTex, tuv);
    // freeride pistes (yellow) are not groomed: natural (powder) snow
    float pRatio = P.g / max(P.r, 0.01);
    float isFR = step(0.58, pRatio) * step(pRatio, 0.74) * step(0.03, P.r);
    float isXC = step(0.91, pRatio) * smoothstep(0.35, 0.8, P.r);
    float surf = max(smoothstep(0.0, 0.6, P.r) * (1.0 - isFR), smoothstep(0.1, 0.7, GR.b));
    if (surf > 0.003) {
      float fresh = GR.r * uGroom;          // 1 = freshly groomed, 0 = skied all day
      float wear = 1.0 - fresh;
      vec3 groomed = vec3(0.955, 0.97, 0.995) * (0.985 + 0.015 * nC.r);
      // corduroy runs in the direction the groomer drove (fall line if unknown)
      vec2 fd = tn.xz;
      fd = length(fd) > 0.02 ? normalize(fd) : vec2(0.0, 1.0);
      if (GR.g > 0.006) { float ang = (GR.g * 255.0 - 1.0) / 254.0 * 3.14159265; fd = vec2(cos(ang), sin(ang)); }
      float cc = dot(wp, vec2(-fd.y, fd.x));
      float aa = clamp(1.0 - fwidth(cc) * 2.2, 0.0, 1.0);
      float cord = (0.5 + 0.5 * sin(cc * 6.2832 / 0.6)) * aa * fresh;
      float pass = (0.5 + 0.5 * sin(cc * 6.2832 / 5.2)) * clamp(1.0 - fwidth(cc) * 0.15, 0.0, 1.0) * fresh;
      float vf = fresh * fresh;                // very fresh corduroy stands out, it fades once skied
      groomed *= 1.0 - cord * (0.05 + 0.07 * vf) - pass * 0.035;
      // tiller edge: a small ridge where a fresh pass meets older snow (the strip the bully left)
      float gGrad = length(vec2(dFdx(GR.r), dFdy(GR.r))) / max(length(fwidth(wp)), 0.001);
      groomed *= 1.0 - smoothstep(0.08, 0.3, gGrad) * 0.07 * clamp(1.0 - length(fwidth(wp)) * 0.4, 0.0, 1.0);
      // cross-country trail: two classic track pairs and a smooth skating lane in the middle
      if (isXC > 0.0) {
        float cm = mod(cc, 4.4);
        float trk = (1.0 - smoothstep(0.05, 0.11, abs(cm - 0.55))) + (1.0 - smoothstep(0.05, 0.11, abs(cm - 0.75))) + (1.0 - smoothstep(0.05, 0.11, abs(cm - 3.65))) + (1.0 - smoothstep(0.05, 0.11, abs(cm - 3.85)));
        groomed *= 1.0 - trk * 0.16 * aa * isXC;
        tBump -= trk * 0.05 * isXC;
      }
      // skied snow: scraped, slightly grey-blue tracks along the fall line
      vec2 fl = length(tn.xz) > 0.02 ? normalize(tn.xz) : vec2(0.0, 1.0);
      float along = dot(wp, fl), across = dot(wp, vec2(-fl.y, fl.x));
      float tracks = texture2D(uNoise, vec2(across / 3.0, along / 40.0)).r;
      groomed = mix(groomed, groomed * vec3(0.93, 0.95, 0.99), wear * smoothstep(0.45, 0.8, tracks) * 0.9);
      // fresh snow lying on the piste hides the corduroy and the skier tracks
      // GR.a = groomed after the last snowfall (the bully worked the new snow in here)
      float ns = uNewSnow * (0.85 + 0.15 * nB.g) * (1.0 - GR.a);
      groomed = mix(groomed, vec3(0.965, 0.975, 1.0) * (0.975 + 0.025 * nD.r), ns * 0.95);
      float bare = smoothstep(0.62, 0.7, patchN + (1.0 - uPisteCover) * 0.55 - 0.3) * (1.0 - uPisteCover) * (1.0 - ns);
      groomed = mix(groomed, ground * 0.95, bare);
      col = mix(col, groomed, surf);
      glit *= 1.0 - surf * (0.4 + 0.5 * wear);
      tBump = mix(tBump, mix((cord * 0.035 + pass * 0.02 + nA.b * 0.25 + wear * (nC.g * 0.18 + tracks * 0.08)), nC.r * 0.22 + nD.g * 0.1 + nA.b * 0.3, ns) * bumpFade, surf);
    }
    // snow in shade turns bluish (sky light), sunny snow slightly warm
    float ndl = clamp(dot(tn, normalize(uSunDir)), 0.0, 1.0);
    float snowAmt = (1.0 - clamp(rk, 0.0, 1.0)) * (1.0 - patches);
    #ifdef HYPER
    // sun glint on the snow surface (view dependent), sparkles a bit with the micro noise
    { vec3 Vv = normalize(cameraPosition - vWPos), Ls = normalize(uSunDir), Hh = normalize(Vv + Ls);
      hyperSpec = (pow(max(dot(tn, Hh), 0.0), 48.0) * 0.28 + pow(max(dot(tn, Hh), 0.0), 6.0) * 0.04) * snowAmt * step(0.0, Ls.y) * (0.75 + 0.5 * nD.g); }
    #endif
    col *= mix(vec3(1.0), mix(vec3(0.84, 0.91, 1.07), vec3(1.02, 1.01, 0.98), smoothstep(0.05, 0.55, ndl)), snowAmt);
    col += glit * 0.32 * (1.0 - St.r) * (1.0 - St.g);
    float roadM = smoothstep(0.7, 0.9, St.r), bedM = smoothstep(0.25, 0.5, St.r) * (1.0 - roadM);
    col = mix(col, vec3(0.30, 0.31, 0.33) * (0.88 + 0.24 * nC.r), roadM);
    col = mix(col, mix(vec3(0.42, 0.39, 0.36), vec3(0.85, 0.87, 0.9), 0.35) * (0.8 + 0.4 * nD.r), bedM);
    tBump *= 1.0 - St.r * 0.9;
    col = mix(col, vec3(0.80, 0.82, 0.86) * (0.94 + 0.12 * nC.g), St.b * 0.75);
    col = mix(col, vec3(0.60, 0.66, 0.72), St.g * 0.8);
  } else {
    float alt = clamp((hgt - uValley) / max(1.0, uTreeline - uValley), 0.0, 2.5);
    vec3 lush = vec3(0.24, 0.40, 0.14), alpine = vec3(0.40, 0.49, 0.22), dry = vec3(0.50, 0.49, 0.33), scree = vec3(0.54, 0.52, 0.49);
    vec3 g = mix(lush, alpine, smoothstep(0.15, 1.0, alt + (nB.r - 0.5) * 0.3));
    g = mix(g, dry, smoothstep(1.0, 1.5, alt + (nB.g - 0.5) * 0.4));
    g *= 0.82 + 0.34 * nA.r;
    g += (nC.g - 0.5) * 0.05;
    float fl = step(0.86, nD.b) * smoothstep(1.3, 0.2, alt) * step(0.5, nA.b);
    g = mix(g, mix(vec3(0.95, 0.85, 0.3), vec3(0.9, 0.9, 0.95), step(0.93, nD.b)), fl * 0.55);
    col = mix(g, scree, smoothstep(1.35, 1.85, alt + (nA.g - 0.5) * 0.5));
    col = mix(col, rock, rockA);
    tBump = (nC.g * 0.25 + nD.r * 0.12 + rockA * nA.r * 1.2) * bumpFade;
    float sn = smoothstep(uSnowline, uSnowline + 70.0, hgt + (nB.b - 0.5) * 160.0) * (1.0 - rockA * 0.6) * smoothstep(0.5, 0.2, slope);
    col = mix(col, vec3(0.92, 0.94, 0.97), sn);
    // summer: ski pistes are mown meadows
    col = mix(col, col * vec3(1.06, 1.08, 1.0), smoothstep(0.0, 0.6, P.r) * 0.6);
    // trails (premultiplied type in alpha)
    float tr = smoothstep(0.05, 0.6, P.b);
    float ttype = P.a / max(P.b, 0.01);
    vec3 path = ttype > 0.55 ? vec3(0.40, 0.30, 0.20) : vec3(0.64, 0.58, 0.46);
    path *= 0.85 + 0.3 * nC.r;
    col = mix(col, path, tr);
    float roadS = smoothstep(0.7, 0.9, St.r), bedS = smoothstep(0.25, 0.5, St.r) * (1.0 - roadS);
    col = mix(col, vec3(0.36, 0.36, 0.38) * (0.9 + 0.2 * nC.r), roadS);
    col = mix(col, vec3(0.45, 0.41, 0.36) * (0.8 + 0.4 * nD.r), bedS);
    col = mix(col, vec3(0.56, 0.54, 0.51) * (0.9 + 0.2 * nD.g), St.b * 0.9);
    col = mix(col, vec3(0.42, 0.40, 0.33), St.g * 0.9);
  }
  // painted surfaces: rock, asphalt (gets snowed in until cleared), gravel, ice (light blue), meadow
  {
    vec4 SA = texture2D(uSurfA, tuv), SB = texture2D(uSurfB, tuv);
    float anyS = SA.r + SA.g + SA.b + SA.a + SB.g;
    if (anyS > 0.004) {
      float win = uSeason < 0.5 ? 1.0 : 0.0;
      float rsnow = win * clamp((uRoadCnt - SB.r * 255.0) / 40.0, 0.0, 1.0);
      vec3 snowC = vec3(0.93, 0.95, 0.98) * (0.96 + 0.04 * nD.r);
      vec3 asphalt = vec3(0.30, 0.31, 0.33) * (0.88 + 0.24 * nC.r);
      vec3 gravel = vec3(0.52, 0.48, 0.42) * (0.75 + 0.5 * nD.g);
      col = mix(col, mix(asphalt, snowC, rsnow * (0.75 + 0.25 * nC.g)), SA.g);
      col = mix(col, mix(gravel, snowC, rsnow), SA.b);
      col = mix(col, rock * (1.0 - 0.1 * win) + win * vec3(0.06) * nC.b, SA.r);
      col = mix(col, vec3(0.70, 0.85, 0.97) * (0.94 + 0.12 * nC.g), SA.a);
      col = mix(col, mix(vec3(0.27, 0.45, 0.16) * (0.85 + 0.3 * nA.r), snowC, win), SB.g);
      tBump = tBump * (1.0 - 0.9 * (SA.g + SA.a)) + SA.r * nA.r * 0.9 * bumpFade;
    }
  }
  if (uOverlay > 0.5 && uOverlay < 1.5) {
    float pc = P.r;
    if (pc > 0.02) {
      float diff = P.g / max(pc, 0.01);
      vec3 pcol = diff < 0.25 ? vec3(0.14, 0.41, 0.88) : diff < 0.41 ? vec3(0.88, 0.14, 0.14) : diff < 0.58 ? vec3(0.08, 0.08, 0.1) : diff < 0.74 ? vec3(0.95, 0.78, 0.08) : diff < 0.9 ? vec3(0.6, 0.24, 0.82) : vec3(0.12, 0.66, 0.38);
      float edge = 1.0 - smoothstep(0.5, 0.9, pc);
      col = mix(col, pcol, clamp(0.6 * smoothstep(0.1, 0.5, pc) + edge * 0.8 * step(0.1, pc), 0.0, 0.95));
    }
  } else if (uOverlay > 1.5) {
    float tc = P.b;
    if (tc > 0.02) {
      float t = P.a / max(tc, 0.01);
      vec3 tcol = t < 0.3 ? vec3(0.95, 0.78, 0.1) : t < 0.55 ? vec3(0.9, 0.2, 0.2) : t < 0.8 ? vec3(0.15, 0.55, 0.9) : vec3(0.1, 0.1, 0.1);
      col = mix(col, tcol, clamp(smoothstep(0.1, 0.5, tc) * 0.75, 0.0, 0.85));
    }
  }
  // ambient occlusion from the surrounding terrain (valleys, gullies, foot of cliffs)
  #ifdef ULTRA
  col *= mix(0.5, 1.0, vAO);
  // PC: snow is not pure white, so the sun / shade relief of the slopes stays visible after tone mapping
  if (uSeason < 0.5) col *= 0.74;
  #else
  col *= mix(0.72, 1.0, vAO);
  #endif
  diffuseColor.rgb = col;
`;

export class TerrainView {
  constructor(world, scene, renderer) {
    this.world = world;
    this.scene = scene;
    this.renderer = renderer;
    this.T = 2048;
    this.piste = new Uint8Array(this.T * this.T);
    this.trail = new Uint8Array(this.T * this.T);
    this.paintData = new Uint8Array(this.T * this.T * 4);
    this.paintTex = new THREE.DataTexture(this.paintData, this.T, this.T, THREE.RGBAFormat);
    this.paintTex.magFilter = THREE.LinearFilter; this.paintTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.paintTex.generateMipmaps = true; this.paintTex.needsUpdate = true;
    this.paintTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.overlay = 0;
    this.season = 0;
    this.buildStatic();
    // grooming map (1024): R = freshness, G = direction code (0 = fall line), B = groomed off-piste area
    // 2048 (≈2 m per pixel): fine enough that one bully pass is a clean, continuous strip.
    // No mipmaps: partial uploads (copyTextureToTexture) only update level 0, stale mips made the strip flicker in and out.
    this.GT = 2048;
    this.groomData = new Uint8Array(this.GT * this.GT * 4);
    this.groomTex = new THREE.DataTexture(this.groomData, this.GT, this.GT, THREE.RGBAFormat);
    this.groomTex.magFilter = THREE.LinearFilter; this.groomTex.minFilter = THREE.LinearFilter; this.groomTex.generateMipmaps = false;
    this.groomTex.needsUpdate = true;
    this.noise = makeNoiseTexture(world.params.seed + 5);
    this.uniforms = {
      uPaint: { value: this.paintTex }, uStatic: { value: this.staticTex }, uNoise: { value: this.noise },
      uSize: { value: world.S }, uGroomTex: { value: null }, uSeason: { value: 0 }, uOverlay: { value: 0 }, uGroom: { value: 1 },
      uSnowline: { value: world.snowline }, uTreeline: { value: world.treeline }, uValley: { value: world.hf.base(0) }, uFresh: { value: 0.5 }, uAltOff: { value: world.altOff || 0 }, uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3) }, uCover: { value: 0.8 }, uPisteCover: { value: 1 },
    };
    this.uniforms.uGroomTex.value = this.groomTex;
    // painted surfaces (1024): tex A = rock, asphalt, gravel, ice coverage; tex B: R = snow counter when last cleared, G = meadow
    this.ST = 1024;
    this.surf = new Uint8Array(this.ST * this.ST);
    this.surfA = new Uint8Array(this.ST * this.ST * 4); this.surfB = new Uint8Array(this.ST * this.ST * 4);
    const mkT = (d) => { const t = new THREE.DataTexture(d, this.ST, this.ST, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
    this.surfTexA = mkT(this.surfA); this.surfTexB = mkT(this.surfB);
    this.roadCnt = 0;
    Object.assign(this.uniforms, { uSurfA: { value: this.surfTexA }, uSurfB: { value: this.surfTexB }, uRoadCnt: { value: 0 }, uNewSnow: { value: 0 }, uTime: { value: 0 }, uClouds: { value: 0.35 } });
    this.buildMesh();
    this.buildSkirt();
    this.bermMat = new THREE.MeshLambertMaterial({ color: 0xf2f5fa });
    this.berms = null;
  }

  toPx(x, z) { const { S } = this.world; return [(x + S / 2) / S * this.T, (z + S / 2) / S * this.T]; }
  toWorld(px, py) { const { S } = this.world; return [-S / 2 + (px + 0.5) / this.T * S, -S / 2 + (py + 0.5) / this.T * S]; }

  // roads, water, village ground
  buildStatic() {
    const R = 2048, w = this.world, S = w.S, m = R / S;
    const c = document.createElement('canvas'); c.width = c.height = R;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, R, R);
    const P = (x, z) => [(x + S / 2) * m, (z + S / 2) * m];
    const stroke = (line, width, color) => {
      if (line.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * m); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); line.forEach((p, i) => { const [px, py] = P(p.x, p.z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    };
    ctx.globalCompositeOperation = 'lighter';
    // river bed / banks (G)
    stroke(w.river, 36, 'rgb(0,255,0)');
    if (w.lake) { const L = w.lake; ctx.fillStyle = 'rgb(0,255,0)'; ctx.beginPath(); const [cx, cy] = P(L.x, L.z); ctx.ellipse(cx, cy, (L.a + 14) * m, (L.b + 14) * m, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    // village plazas, streets, parking (B)
    const blue = (fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
    blue(() => {
      ctx.fillStyle = 'rgb(0,0,255)';
      for (const v of w.villages) { const [cx, cy] = P(v.x, v.z); ctx.beginPath(); ctx.arc(cx, cy, v.plaza * m, 0, Math.PI * 2); ctx.fill(); }
      if (w.parking) { const q = w.parking; const [cx, cy] = P(q.x, q.z); ctx.fillRect(cx - q.w / 2 * m, cy - q.d / 2 * m, q.w * m, q.d * m); }
      ctx.strokeStyle = 'rgb(0,0,255)'; ctx.lineCap = 'round';
      for (const s of w.streets) { ctx.lineWidth = s.w * m; ctx.beginPath(); const [ax, ay] = P(s.a.x, s.a.z), [bx, by] = P(s.b.x, s.b.z); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
    });
    // road (R)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; stroke(w.road, 8.5, 'rgb(255,0,0)'); ctx.restore();
    if (w.rail && w.rail.length) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; stroke(w.rail, 6, 'rgb(140,0,0)'); ctx.restore(); }
    const img = ctx.getImageData(0, 0, R, R).data;
    const data = new Uint8Array(img.length);
    this.blocked = new Uint8Array(this.T * this.T);
    for (let k = 0; k < R * R; k++) {
      data[k * 4] = img[k * 4]; data[k * 4 + 1] = img[k * 4 + 1]; data[k * 4 + 2] = img[k * 4 + 2]; data[k * 4 + 3] = 255;
      if (img[k * 4] > 120) this.blocked[k] = 1; // road
      if (img[k * 4 + 1] > 200) this.blocked[k] = 2; // water
    }
    this.staticTex = new THREE.DataTexture(data, R, R, THREE.RGBAFormat);
    this.staticTex.magFilter = THREE.LinearFilter; this.staticTex.minFilter = THREE.LinearMipmapLinearFilter; this.staticTex.generateMipmaps = true;
    this.staticTex.needsUpdate = true;
    this.staticTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
  }

  buildMesh() {
    const { world } = this;
    const { N, cell, S, heights } = world;
    const r = N + 1;
    const pos = new Float32Array(r * r * 3);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * r + i;
      pos[k * 3] = -S / 2 + i * cell; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = -S / 2 + j * cell;
    }
    const idx = new Uint32Array(N * N * 6);
    let o = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * r + i, b = a + 1, c = a + r, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b;
      idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(r * r * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = geo;
    this.updateNormals(0, 0, N, N);
    geo.computeBoundingSphere();
    this.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const U = this.uniforms;
    if (GFX.ultra) this.material.defines = { ULTRA: 1 };
    if (GFX.potato) this.material.defines = { POTATO: 1 };
    if (GFX.hyper) this.material.defines = { ULTRA: 1, HYPER: 1 };
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNorm = normalize(mat3(modelMatrix) * objectNormal);
        vAO = ao;
        #ifdef HYPER
        vSunV = sunv;
        #endif`);
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', FRAG_COLOR)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n#ifdef HYPER\n  { float cl = texture2D(uNoise, (vWPos.xz + vec2(uTime * 9.0, uTime * 4.0)) / 2600.0).r * 0.65 + texture2D(uNoise, (vWPos.xz + vec2(uTime * 9.0, uTime * 4.0)) / 900.0).g * 0.35;\n    float cloudSh = 1.0 - smoothstep(0.62 - uClouds * 0.3, 0.72 - uClouds * 0.3, cl) * 0.6 * step(0.01, uClouds);\n    reflectedLight.directDiffuse *= vSunV * cloudSh; totalEmissiveRadiance -= vec3(1.0, 0.97, 0.92) * hyperSpec * vSunV * (1.0 - cloudSh); }\n#endif')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef HYPER\n  totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * hyperSpec * vSunV;\n#endif')
        .replace('#include <normal_fragment_maps>', GFX.potato ? '#include <normal_fragment_maps>' : '#include <normal_fragment_maps>\n  normal = tBumpN(-vViewPosition, normal, tBump);');
    };
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  // recompute normals (and positions) for a grid range after height changes
  updateNormals(i0, j0, i1, j1) {
    const { N, cell, heights } = this.world;
    const r = N + 1;
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    for (let j = Math.max(0, j0); j <= Math.min(N, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N, i1); i++) {
      const k = j * r + i;
      pos[k * 3 + 1] = heights[k];
      const hl = heights[j * r + Math.max(0, i - 1)], hr = heights[j * r + Math.min(N, i + 1)];
      const hu = heights[Math.max(0, j - 1) * r + i], hd = heights[Math.min(N, j + 1) * r + i];
      const nx = hl - hr, ny = 2 * cell, nz = hu - hd;
      const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.updateAO(i0 - 18, j0 - 18, i1 + 18, j1 + 18);
  }

  // HYPER: which vertices the sun (or moon) light reaches, i.e. mountains cast shadows over the valley.
  // Marches from each vertex towards the light over the height field; spread over several frames.
  updateSun(dir, force = false) {
    if (!GFX.hyper) return false;
    const { N, cell, heights } = this.world, r = N + 1;
    let a = this.geo.attributes.sunv;
    if (!a) { a = new THREE.BufferAttribute(new Float32Array(r * r).fill(1), 1); this.geo.setAttribute('sunv', a); }
    if (!this.sunJob) {
      const last = this.sunDone;
      if (!force && last && Math.abs(last.x - dir.x) + Math.abs(last.y - dir.y) + Math.abs(last.z - dir.z) < 0.004) return false;
      this.sunJob = { d: dir.clone(), row: 0, buf: new Float32Array(r * r) };
    }
    const J = this.sunJob, d = J.d, hz = Math.hypot(d.x, d.z);
    const t0 = performance.now();
    if (d.y <= 0.0 || hz < 1e-4) { J.buf.fill(d.y <= 0 ? 0.25 : 1); J.row = r; }
    const sx = d.x / hz, sz = d.z / hz, tanE = d.y / hz, maxT = 7000 / cell;
    while (J.row < r && (force || performance.now() - t0 < 3.5)) {
      const j = J.row++;
      for (let i = 0; i < r; i++) {
        const h0 = heights[j * r + i] + 1.5;
        let ex = -1, t = 1.2;
        while (t < maxT) {
          const fi = i + sx * t, fj = j + sz * t;
          if (fi < 0 || fj < 0 || fi > N || fj > N) break;
          const e = (heights[Math.round(fj) * r + Math.round(fi)] - h0) / (t * cell) - tanE;
          if (e > ex) { ex = e; if (ex > 0.03) break; }
          t += t < 12 ? 0.8 : t * 0.055;
        }
        J.buf[j * r + i] = 1 - smooth(-0.012, 0.025, ex);
      }
    }
    if (J.row >= r) {
      a.array.set(J.buf); a.needsUpdate = true;
      this.sunDone = J.d; this.sunJob = null;
      return true;
    }
    return false;
  }
  sunVisAt(x, z) {
    const a = this.geo.attributes.sunv; if (!a) return 1;
    const { N, cell, S } = this.world, i = Math.round((x + S / 2) / cell), j = Math.round((z + S / 2) / cell);
    if (i < 0 || j < 0 || i > N || j > N) return 1;
    return a.array[j * (N + 1) + i];
  }

  // sky visibility: how much the surrounding terrain rises above each vertex (horizon angles)
  updateAO(i0, j0, i1, j1) {
    const { N, cell, heights } = this.world, r = N + 1;
    let a = this.geo.attributes.ao;
    if (!a) { a = new THREE.BufferAttribute(new Float32Array(r * r).fill(1), 1); this.geo.setAttribute('ao', a); }
    const ao = a.array, D = [[1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707], [0, -1], [0.707, -0.707]], R = [1, 2, 4, 7, 12, 18];
    for (let j = Math.max(0, j0); j <= Math.min(N, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N, i1); i++) {
      const h0 = heights[j * r + i];
      let occ = 0;
      for (const [dx, dz] of D) {
        let best = 0;
        for (const s of R) {
          const ii = Math.round(i + dx * s), jj = Math.round(j + dz * s);
          if (ii < 0 || jj < 0 || ii > N || jj > N) break;
          const t = (heights[jj * r + ii] - h0) / (s * cell);
          if (t > best) best = t;
        }
        occ += best / Math.sqrt(1 + best * best); // sin of the horizon angle
      }
      ao[j * r + i] = clamp(1 - occ / 8 * 1.25, 0, 1);
    }
    a.needsUpdate = true;
  }

  buildSkirt() {
    const { world } = this;
    const S = world.S, hf = world.hf;
    const size = S * 3, n = GFX.hyper ? 320 : 192;
    const rn = makeSimplex(mulberry32(world.params.seed + 91)); // ridged detail for the distant mountains (HYPER)
    const step = size / n;
    const r = n + 1;
    const pos = new Float32Array(r * r * 3);
    // the scenery around the map is only for the look: close to the map it stays around the average
    // height of the ski area (at most a little above), further out it rises again to big mountains
    const H = world.heights;
    let avg = 0, mx = -Infinity; for (let k = 0; k < H.length; k++) { avg += H[k]; if (H[k] > mx) mx = H[k]; }
    avg /= H.length;
    const bigRise = Math.max(500, (mx - avg) * 0.9 + 300);
    const ridge = (x, z) => {
      const a = Math.sin(x * 0.00071 + 1.3) * Math.cos(z * 0.00063 - 0.4), b = Math.sin((x + z) * 0.00131 + 2.1), c = Math.sin(x * 0.0029 - z * 0.0023);
      return clamp(0.55 + 0.3 * a + 0.2 * b + 0.08 * c, 0.15, 1.1);
    };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = j * r + i;
      const x = -size / 2 + i * step, z = -size / 2 + j * step;
      const inside = Math.abs(x) < S / 2 - 1 && Math.abs(z) < S / 2 - 1;
      const onEdge = !inside && Math.abs(x) <= S / 2 + 1 && Math.abs(z) <= S / 2 + 1;
      let h;
      if (inside) h = heightAt(world, x, z) - 400;
      else if (onEdge) h = heightAt(world, x, z) - 0.5;
      else {
        const d = Math.max(Math.abs(x), Math.abs(z)) - S / 2; // distance outside the map
        let hr = hf(x, z);
        if (hr > avg) hr = avg + Math.min(140, (hr - avg) * 0.15); // never much above the average
        let rise = smooth(1500, 6500, d) * bigRise * ridge(x, z);
        if (GFX.hyper) { const rg = ridged(rn, x / 5200, z / 5200, 5); rise *= 0.45 + 1.1 * rg; hr += (ridged(rn, x / 1400 + 7, z / 1400, 4) - 0.4) * 90 * smooth(300, 2500, d); }
        const target = hr + rise;
        // blend from the map edge (which may cut through a mountain) into the low ring
        const ex = clamp(x, -S / 2, S / 2), ez = clamp(z, -S / 2, S / 2);
        const edgeH = heightAt(world, ex, ez);
        h = lerp(edgeH - 0.5, target, smooth(0, 1300, d));
      }
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * r + i, b = a + 1, c = a + r, d = c + 1; idx.push(a, c, b, b, c, d); }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(r * r * 3), 3));
    this.skirt = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.skirt);
    this.colorSkirt();
  }

  colorSkirt() {
    const geo = this.skirt.geometry;
    const nrm = geo.attributes.normal.array, pos = geo.attributes.position.array, col = geo.attributes.color.array;
    const summer = this.season === 1;
    for (let k = 0; k < col.length / 3; k++) {
      const ny = nrm[k * 3 + 1], h = pos[k * 3 + 1];
      const rock = smooth(0.82, 0.62, ny);
      let r, g, b;
      if (!summer) { r = lerp(0.9, 0.42, rock); g = lerp(0.93, 0.4, rock); b = lerp(0.97, 0.38, rock); }
      else {
        const alt = clamp((h - this.world.hf.base(0)) / (this.world.treeline - this.world.hf.base(0)), 0, 2);
        const sn = h > this.world.snowline ? 1 : 0;
        r = lerp(lerp(0.24, 0.45, alt / 2), 0.45, rock); g = lerp(lerp(0.4, 0.47, alt / 2), 0.43, rock); b = lerp(lerp(0.15, 0.3, alt / 2), 0.4, rock);
        if (sn && rock < 0.5) { r = 0.9; g = 0.92; b = 0.95; }
      }
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
    }
    geo.attributes.color.needsUpdate = true;
  }

  setSeason(s) {
    this.season = s;
    this.uniforms.uSeason.value = s;
    this.colorSkirt();
    if (this.berms) this.berms.visible = s === 0;
  }
  setOverlay(mode) { this.overlay = mode; this.uniforms.uOverlay.value = mode; }

  // ---- painting. layer 'piste' (mode 1/2/3/'auto'/0) or 'trail' (1..4 / 0)
  paint(x, z, radius, mode, layer = 'piste') {
    const { T } = this;
    const [cx, cy] = this.toPx(x, z);
    const rp = radius / this.world.S * T;
    const x0 = Math.max(0, Math.floor(cx - rp)), x1 = Math.min(T - 1, Math.ceil(cx + rp));
    const y0 = Math.max(0, Math.floor(cy - rp)), y1 = Math.min(T - 1, Math.ceil(cy + rp));
    const arr = layer === 'piste' ? this.piste : this.trail;
    let changed = 0;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      if ((px - cx) ** 2 + (py - cy) ** 2 > rp * rp) continue;
      const k = py * T + px;
      let v = mode;
      if (mode === 'auto') {
        const [wx, wz] = this.toWorld(px, py);
        const n = normalAt(this.world, wx, wz);
        const g = Math.sqrt(Math.max(0, 1 - n.y * n.y)) / n.y;
        v = g < 0.25 ? 1 : g < 0.4 ? 2 : 3;
      }
      if (v && this.blocked[k]) continue;
      if (arr[k] !== v) {
        arr[k] = v; changed++;
        if (layer === 'piste' && v) {
          const go = this.groomPx(px, py);
          if (this.groomData[go] < 255) {
            this.groomData[go] = 255; this.groomData[go + 3] = 255;
            const f = this.T / this.GT, gx = Math.floor(px / f), gy = Math.floor(py / f), R = this.groomRect;
            this.groomRect = R ? [Math.min(R[0], gx), Math.min(R[1], gy), Math.max(R[2], gx), Math.max(R[3], gy)] : [gx, gy, gx, gy];
          }
        }
      }
    }
    if (changed) this.refresh(x0, y0, x1, y1);
    return changed;
  }

  refresh(x0, y0, x1, y1) {
    const { T, piste, trail, paintData } = this;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(T - 1, x1); y1 = Math.min(T - 1, y1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const sub = new Uint8Array(w * h * 4);
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const k = py * T + px, o = k * 4;
      const p = piste[k], t = trail[k];
      paintData[o] = p ? 255 : 0;
      paintData[o + 1] = p ? p * 42 : 0;
      paintData[o + 2] = t ? 255 : 0;
      paintData[o + 3] = t ? t * 63 + 3 : 0;
      const so = ((py - y0) * w + (px - x0)) * 4;
      sub[so] = paintData[o]; sub[so + 1] = paintData[o + 1]; sub[so + 2] = paintData[o + 2]; sub[so + 3] = paintData[o + 3];
    }
    if (this.uploaded) {
      const st = new THREE.DataTexture(sub, w, h, THREE.RGBAFormat);
      this.renderer.copyTextureToTexture(new THREE.Vector2(x0, y0), st, this.paintTex);
      st.dispose();
    } else this.paintTex.needsUpdate = true;
  }

  // ---- painted surfaces (rock / road / gravel / ice / meadow)
  surfPx(x, z) { const S = this.world.S; return [(x + S / 2) / S * this.ST, (z + S / 2) / S * this.ST]; }
  paintSurf(x, z, radius, type) {
    const ST = this.ST, [cx, cy] = this.surfPx(x, z), rp = radius / this.world.S * ST;
    const x0 = Math.max(0, Math.floor(cx - rp)), x1 = Math.min(ST - 1, Math.ceil(cx + rp)), y0 = Math.max(0, Math.floor(cy - rp)), y1 = Math.min(ST - 1, Math.ceil(cy + rp));
    let changed = 0;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      if ((px - cx) ** 2 + (py - cy) ** 2 > rp * rp) continue;
      const k = py * ST + px;
      if (this.surf[k] === type) continue;
      this.surf[k] = type; changed++;
      const o = k * 4;
      this.surfA[o] = type === 1 ? 255 : 0; this.surfA[o + 1] = type === 2 ? 255 : 0; this.surfA[o + 2] = type === 3 ? 255 : 0; this.surfA[o + 3] = type === 4 ? 255 : 0;
      this.surfB[o] = Math.round(this.roadCnt); this.surfB[o + 1] = type === 5 ? 255 : 0;
    }
    if (changed) { this.uploadSurf(x0, y0, x1, y1, true); this.roadPixels = null; }
    return changed;
  }
  // snow plough on painted roads: mark pixels as cleared now
  clearSurfSnow(x, z, radius) {
    const ST = this.ST, [cx, cy] = this.surfPx(x, z), rp = radius / this.world.S * ST;
    const x0 = Math.max(0, Math.floor(cx - rp)), x1 = Math.min(ST - 1, Math.ceil(cx + rp)), y0 = Math.max(0, Math.floor(cy - rp)), y1 = Math.min(ST - 1, Math.ceil(cy + rp));
    const c = Math.round(this.roadCnt);
    let n = 0;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const k = py * ST + px;
      if ((this.surf[k] === 2 || this.surf[k] === 3) && this.surfB[k * 4] < c) { this.surfB[k * 4] = c; n++; }
    }
    if (n) this.uploadSurf(x0, y0, x1, y1, false);
    return n;
  }
  surfSnowAtPx(k) { return clamp((this.roadCnt - this.surfB[k * 4]) / 40, 0, 1); }
  surfSnowAt(k) { return this.surfSnowAtPx(k); }
  // list of painted road/gravel pixels (for the plough)
  getRoadPixels() {
    if (!this.roadPixels) { this.roadPixels = []; for (let k = 0; k < this.surf.length; k++) if (this.surf[k] === 2 || this.surf[k] === 3) this.roadPixels.push(k); }
    return this.roadPixels;
  }
  surfToWorld(k) { const ST = this.ST, S = this.world.S; return [-S / 2 + ((k % ST) + 0.5) / ST * S, -S / 2 + (Math.floor(k / ST) + 0.5) / ST * S]; }
  clearAllSurfSnow() { const c = Math.round(this.roadCnt); for (let k = 0; k < this.surf.length; k++) this.surfB[k * 4] = c; this.surfTexB.needsUpdate = true; }
  // snow keeps falling on painted roads: counter goes up while it snows
  addRoadSnow(amount) {
    this.roadCnt += amount;
    if (this.roadCnt > 220) {
      this.roadCnt -= 150;
      for (let k = 0; k < this.surf.length; k++) this.surfB[k * 4] = Math.max(0, this.surfB[k * 4] - 150);
      this.uploadSurf(0, 0, this.ST - 1, this.ST - 1, false);
    }
    this.uniforms.uRoadCnt.value = this.roadCnt;
  }
  uploadSurf(x0, y0, x1, y1, both) {
    const ST = this.ST;
    const full = !this.uploaded || (x1 - x0 + 1) * (y1 - y0 + 1) > ST * ST / 4;
    for (const [data, tex, use] of [[this.surfA, this.surfTexA, both], [this.surfB, this.surfTexB, true]]) {
      if (!use) continue;
      if (full) { tex.needsUpdate = true; continue; }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, sub = new Uint8Array(w * h * 4);
      for (let py = y0; py <= y1; py++) sub.set(data.subarray((py * ST + x0) * 4, (py * ST + x1 + 1) * 4), (py - y0) * w * 4);
      const st = new THREE.DataTexture(sub, w, h, THREE.RGBAFormat);
      this.renderer.copyTextureToTexture(new THREE.Vector2(x0, y0), st, tex);
      st.dispose();
    }
  }
  serializeSurf() {
    const arr = this.surf, out = [];
    let v = arr[0], n = 0;
    for (let k = 0; k < arr.length; k++) { if (arr[k] === v && n < 65535) n++; else { out.push(v, n); v = arr[k]; n = 1; } }
    out.push(v, n);
    return out.length > 2 || v ? out.join(',') : '';
  }
  loadSurf(str) {
    if (!str) return;
    const parts = str.split(',').map(Number);
    let k = 0;
    for (let i = 0; i + 1 < parts.length; i += 2) { const t = parts[i]; for (let q = k; q < Math.min(this.surf.length, k + parts[i + 1]); q++) { this.surf[q] = t; const o = q * 4; this.surfA[o] = t === 1 ? 255 : 0; this.surfA[o + 1] = t === 2 ? 255 : 0; this.surfA[o + 2] = t === 3 ? 255 : 0; this.surfA[o + 3] = t === 4 ? 255 : 0; this.surfB[o + 1] = t === 5 ? 255 : 0; } k += parts[i + 1]; }
    this.surfTexA.needsUpdate = true; this.surfTexB.needsUpdate = true; this.roadPixels = null;
  }

  // ---- grooming
  // groom a rectangle behind a groomer: centre x,z, heading yaw (x forward = cos, z = -sin), width, length
  groomStroke(x, z, yaw, width, length, offPiste = true) {
    const GT = this.GT, S = this.world.S, d = this.groomData;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const ang = ((Math.atan2(fz, fx) % Math.PI) + Math.PI) % Math.PI;
    const code = 1 + Math.round(ang / Math.PI * 254);
    const pxm = S / GT; width += pxm * 0.9; length += pxm * 0.5; // full strip, no gaps between pixels
    const r = Math.hypot(width, length) / 2 + 2;
    const cx = (x + S / 2) / S * GT, cz = (z + S / 2) / S * GT, rp = r / S * GT;
    const x0 = Math.max(0, Math.floor(cx - rp)), x1 = Math.min(GT - 1, Math.ceil(cx + rp));
    const y0 = Math.max(0, Math.floor(cz - rp)), y1 = Math.min(GT - 1, Math.ceil(cz + rp));
    let n = 0;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const wx = -S / 2 + (px + 0.5) / GT * S - x, wz = -S / 2 + (py + 0.5) / GT * S - z;
      const along = wx * fx + wz * fz, across = -wx * fz + wz * fx;
      if (Math.abs(along) > length / 2 || Math.abs(across) > width / 2) continue;
      const o = (py * GT + px) * 4;
      d[o] = 255; d[o + 1] = code;
      if (offPiste) d[o + 2] = 255;
      d[o + 3] = 255; n++;
    }
    if (n) {
      const R = this.groomRect;
      this.groomRect = R ? [Math.min(R[0], x0), Math.min(R[1], y0), Math.max(R[2], x1), Math.max(R[3], y1)] : [x0, y0, x1, y1];
    }
    return n;
  }
  // a piste pixel of the paint layer maps to this groom pixel
  groomPx(px, py) { const f = this.T / this.GT; return (Math.floor(py / f) * this.GT + Math.floor(px / f)) * 4; }
  // wear down all groomed snow (skiers, snowfall)
  wearGroom(amount) {
    const d = this.groomData, a = Math.round(amount * 255);
    if (a <= 0) return;
    for (let i = 0; i < d.length; i += 4) if (d[i]) d[i] = d[i] > a ? d[i] - a : 0;
    this.groomDirty = true;
  }
  // average corduroy freshness (0..1) over all piste pixels (sampled)
  groomAvg() {
    const d = this.groomData, GT = this.GT, f = this.T / GT;
    let sum = 0, n = 0;
    for (let y = 1; y < GT; y += 3) for (let x = 1; x < GT; x += 3) {
      const pv = this.piste[(y * f) * this.T + x * f];
      if (!pv || pv === 4) continue;
      sum += d[(y * GT + x) * 4]; n++;
    }
    return n ? sum / n / 255 : 1;
  }
  // groom all pistes (and groomed areas) to at least quality q (keeps directions)
  groomAll(q = 1) {
    const d = this.groomData, v = Math.round(q * 255);
    for (let i = 0; i < d.length; i += 4) { if (d[i] < v) d[i] = v; if (q > 0.5) d[i + 3] = 255; }
    this.groomDirty = true;
  }
  // new snow falls on everything: the "groomed after snowfall" mark fades
  fadeGroomSnow(amount) {
    const d = this.groomData, a = Math.max(1, Math.round(amount * 255));
    for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = d[i] > a ? d[i] - a : 0;
    this.groomDirty = true;
  }
  flushGroom() {
    if (this.groomDirty || !this.uploaded) {
      if (this.groomDirty) { this.groomTex.needsUpdate = true; this.groomDirty = false; this.groomRect = null; }
      return;
    }
    const R = this.groomRect;
    if (!R) return;
    this.groomRect = null;
    const w = R[2] - R[0] + 1, h = R[3] - R[1] + 1, GT = this.GT;
    const sub = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) sub.set(this.groomData.subarray(((R[1] + y) * GT + R[0]) * 4, ((R[1] + y) * GT + R[0] + w) * 4), y * w * 4);
    const st = new THREE.DataTexture(sub, w, h, THREE.RGBAFormat);
    this.renderer.copyTextureToTexture(new THREE.Vector2(R[0], R[1]), st, this.groomTex);
    st.dispose();
  }

  // call once after the first render so partial uploads work
  markUploaded() { this.uploaded = true; }

  groomAt(x, z) {
    const { S } = this.world, GT = this.GT;
    const i = Math.floor((x + S / 2) / S * GT), j = Math.floor((z + S / 2) / S * GT);
    if (i < 0 || j < 0 || i >= GT || j >= GT) return 0;
    return this.groomData[(j * GT + i) * 4] / 255;
  }
  pisteAt(x, z) {
    const [px, py] = this.toPx(x, z);
    const i = Math.floor(px), j = Math.floor(py);
    if (i < 0 || j < 0 || i >= this.T || j >= this.T) return 0;
    return this.piste[j * this.T + i];
  }
  trailAt(x, z) {
    const [px, py] = this.toPx(x, z);
    const i = Math.floor(px), j = Math.floor(py);
    if (i < 0 || j < 0 || i >= this.T || j >= this.T) return 0;
    return this.trail[j * this.T + i];
  }

  countArea(layer = 'piste') {
    const arr = layer === 'piste' ? this.piste : this.trail;
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < arr.length; k++) c[arr[k]]++;
    const a = (this.world.S / this.T) ** 2;
    return c.map((v) => v * a);
  }

  // positions for marker poles along borders of a layer
  computeMarkers(layer = 'piste', spacing = 34) {
    const { T } = this;
    const arr = layer === 'piste' ? this.piste : this.trail;
    const cellM = this.world.S / T;
    const hash = new Map();
    const out = [];
    const step = 3;
    for (let py = step; py < T - step; py += step) for (let px = step; px < T - step; px += step) {
      const k = py * T + px, p = arr[k];
      if (!p || (layer === 'piste' && p === 4)) continue;
      const e = step;
      const l = arr[k - e], r = arr[k + e], u = arr[k - e * T], d = arr[k + e * T];
      if (l && r && u && d) continue;
      // outward direction (towards the off-piste side), from the empty pixels around
      let ox = 0, oz = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!arr[(py + dy) * T + px + dx]) { ox += dx; oz += dy; }
      const ln = Math.hypot(ox, oz); if (ln < 0.5) continue;
      ox /= ln; oz /= ln;
      // walk outwards to the real edge, then step back a little: poles stand just inside the border
      let ex = px + 0.5, ey = py + 0.5;
      for (let q = 0; q < 16; q++) { const nx2 = ex + ox * 0.5, ny2 = ey + oz * 0.5; const kk = Math.floor(ny2) * T + Math.floor(nx2); if (kk < 0 || kk >= arr.length || !arr[kk]) break; ex = nx2; ey = ny2; }
      const inset = 0.7 / cellM;
      const [mx, mz] = this.toWorld(ex - ox * inset - 0.5, ey - oz * inset - 0.5);
      const gx = Math.floor(mx / spacing), gz = Math.floor(mz / spacing);
      let close = false;
      for (let a = -1; a <= 1 && !close; a++) for (let b = -1; b <= 1 && !close; b++) {
        const lst = hash.get((gx + a) * 100000 + (gz + b));
        if (lst) for (const q of lst) if ((q.x - mx) ** 2 + (q.z - mz) ** 2 < spacing * spacing) { close = true; break; }
      }
      if (close) continue;
      const mk = { x: mx, z: mz, p };
      out.push(mk);
      const kk = gx * 100000 + gz;
      if (!hash.has(kk)) hash.set(kk, []);
      hash.get(kk).push(mk);
      if (out.length > 8000) return out;
    }
    // freeride: yellow-black poles down the middle of the run
    if (layer === 'piste') {
      const cellP = Math.max(8, Math.round(36 / cellM));
      for (let gy = 0; gy < T; gy += cellP) for (let gx = 0; gx < T; gx += cellP) {
        let sx = 0, sy = 0, n = 0;
        for (let y = gy; y < Math.min(T, gy + cellP); y += 2) for (let x = gx; x < Math.min(T, gx + cellP); x += 2) if (arr[y * T + x] === 4) { sx += x; sy += y; n++; }
        if (n < 6) continue;
        const cx = Math.round(sx / n), cy = Math.round(sy / n);
        if (arr[cy * T + cx] !== 4) continue;
        const [mx, mz] = this.toWorld(cx, cy);
        out.push({ x: mx, z: mz, p: 4 });
        if (out.length > 8000) return out;
      }
    }
    return out;
  }

  // 3D snow berms (raised untouched snow) along piste borders, via marching squares on a 1024 grid
  rebuildBerms() {
    if (this.berms) { this.scene.remove(this.berms); this.berms.geometry.dispose(); this.berms = null; }
    const T2 = 1024, f = this.T / T2, w = this.world, S = w.S, cs = S / T2;
    const occ = (i, j) => {
      if (i < 0 || j < 0 || i >= T2 || j >= T2) return 0;
      const a = (j * f) * this.T + i * f;
      const P2 = this.piste, gp = (v) => v && v !== 4;
      if (gp(P2[a]) || gp(P2[a + 1]) || gp(P2[a + this.T]) || gp(P2[a + this.T + 1])) return 1;
      // areas a groomer prepared off the pistes (and lift tracks) also sit lower than the deep snow around
      return this.groomData[(j * this.GT + i) * 4 + 2] > 128 ? 1 : 0;
    };
    const pos = [], nor = [];
    const sc = this.bermScale ?? 1;
    const W = 2.6 * Math.sqrt(sc), Hb = 0.55 * sc;
    const addSeg = (x1, z1, x2, z2, ox, oz) => {
      // (ox,oz) points away from the piste
      const L = Math.hypot(x2 - x1, z2 - z1); if (L < 0.01) return;
      const segs = Math.max(1, Math.round(L / 2));
      for (let s = 0; s < segs; s++) {
        const ta = s / segs, tb = (s + 1) / segs;
        const ax = lerp(x1, x2, ta), az = lerp(z1, z2, ta), bx = lerp(x1, x2, tb), bz = lerp(z1, z2, tb);
        const dep = clamp((heightAt(w, ax, az) + (w.altOff || 0) - 650) / 1650, 0, 1);
        const Wd = W * (0.75 + 0.6 * dep), Hd = Hb * (0.45 + 1.3 * dep);
        const pts = [[0, 0], [Wd * 0.45, Hd], [Wd, 0.05]];
        const ring = (x, z) => pts.map(([o, hgt]) => { const px = x + ox * o, pz = z + oz * o; return [px, heightAt(w, px, pz) + hgt + 0.05, pz]; });
        const A = ring(ax, az), B = ring(bx, bz);
        for (let q = 0; q < 2; q++) {
          const a0 = A[q], a1 = A[q + 1], b0 = B[q], b1 = B[q + 1];
          const tri = (p1, p2, p3) => {
            const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2], vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; [p2, p3] = [p3, p2]; }
            const l = Math.hypot(nx, ny, nz) || 1;
            for (const p of [p1, p2, p3]) { pos.push(p[0], p[1], p[2]); nor.push(nx / l, ny / l, nz / l); }
          };
          tri(a0, b0, a1); tri(a1, b0, b1);
        }
      }
    };
    for (let j = 0; j < T2 - 1; j++) for (let i = 0; i < T2 - 1; i++) {
      const a = occ(i, j), b = occ(i + 1, j), c = occ(i + 1, j + 1), d = occ(i, j + 1);
      const sum = a + b + c + d;
      if (sum === 0 || sum === 4) continue;
      // simple: for each occupied/unoccupied edge pair, put a segment at the cell edge midpoint line
      const x0 = -S / 2 + (i + 0.5) * cs, z0 = -S / 2 + (j + 0.5) * cs;
      const mid = (p, q, px, pz, qx, qz) => [(px + qx) / 2, (pz + qz) / 2];
      const pts = [];
      const corners = [[a, x0, z0], [b, x0 + cs, z0], [c, x0 + cs, z0 + cs], [d, x0, z0 + cs]];
      for (let e = 0; e < 4; e++) {
        const p = corners[e], q = corners[(e + 1) % 4];
        if (p[0] !== q[0]) pts.push(mid(p[0], q[0], p[1], p[2], q[1], q[2]));
      }
      if (pts.length < 2) continue;
      // direction away from piste: from centroid of occupied corners to the unoccupied
      let ox = 0, oz = 0;
      for (const [v, x, z] of corners) { const s = v ? -1 : 1; ox += s * (x - x0 - cs / 2); oz += s * (z - z0 - cs / 2); }
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      addSeg(pts[0][0], pts[0][1], pts[1][0], pts[1][1], ox, oz);
      if (pts.length === 4) addSeg(pts[2][0], pts[2][1], pts[3][0], pts[3][1], ox, oz);
      if (pos.length > 3e6) break;
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    this.berms = new THREE.Mesh(geo, this.bermMat);
    this.berms.receiveShadow = true;
    this.berms.visible = this.season === 0;
    this.scene.add(this.berms);
  }

  // ---- terraforming
  buildProtect() {
    const w = this.world, { N, cell, S } = w;
    const r = N + 1;
    const prot = new Uint8Array(r * r);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
      let p = 0;
      if (Math.abs(z - w.valleyZAt(x)) < 260) {
        if (w.road.length && distToLine(w.road, x, z) < 16) p = 1;
        else if (inWater(w, x, z, 14)) p = 1;
        else if (w.tunnel && Math.hypot(x - w.tunnel.x, z - w.tunnel.z) < 50) p = 1;
        else if (w.parking && Math.abs(x - w.parking.x) < w.parking.w / 2 + 8 && Math.abs(z - w.parking.z) < w.parking.d / 2 + 8) p = 1;
        else for (const v of w.villages) {
          if (Math.hypot(x - v.x, z - v.z) < v.plaza + 10) { p = 1; break; }
          if (v.church && Math.hypot(x - v.church.x, z - v.church.z) < 26) { p = 1; break; }
          for (const h of v.houses) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.w, h.d) * 0.7 + 8) { p = 1; break; }
          if (p) break;
        }
      }
      if (!p) for (const b of w.barns) if (Math.hypot(x - b.x, z - b.z) < 14) { p = 1; break; }
      prot[j * r + i] = p;
    }
    this.protect = prot;
  }

  // smooth the ground under all pistes (not freeride): bumps and dips go away, the slope stays.
  // passes = strength (1..8); edges blend softly into the terrain around; skip(x, z) protects places
  smoothPistes(passes, skip) {
    if (!this.protect) this.buildProtect();
    const w = this.world, { N, cell, S, heights } = w, r = N + 1, T = this.T;
    const raw = new Float32Array(r * r);
    for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
      const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
      let n = 0, hit = 0;
      for (const dz of [-0.35, 0, 0.35]) for (const dx of [-0.35, 0, 0.35]) {
        const [px, py] = this.toPx(x + dx * cell, z + dz * cell);
        const v = this.piste[Math.min(T - 1, Math.max(0, Math.round(py))) * T + Math.min(T - 1, Math.max(0, Math.round(px)))];
        n++; if (v && v !== 4) hit++;
      }
      raw[j * r + i] = hit / n;
    }
    // soft edge: blur the mask once
    const mask = new Float32Array(r * r);
    for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
      const k = j * r + i;
      mask[k] = Math.max(raw[k], (raw[k - 1] + raw[k + 1] + raw[k - r] + raw[k + r]) / 4 * 0.6);
      if (this.protect[k] || (skip && skip(-S / 2 + i * cell, -S / 2 + j * cell))) mask[k] = 0;
    }
    let changed = 0;
    for (let p = 0; p < passes; p++) {
      const src = heights.slice();
      for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
        const k = j * r + i, m = mask[k];
        if (m <= 0.01) continue;
        const avg = (src[k - 1] + src[k + 1] + src[k - r] + src[k + r]) * 0.15 + (src[k - r - 1] + src[k - r + 1] + src[k + r - 1] + src[k + r + 1]) * 0.1;
        const dh = (avg - src[k]) * 0.75 * m;
        heights[k] = src[k] + dh;
        if (p === 0 && Math.abs(dh) > 0.05) changed++;
      }
    }
    this.updateNormals(0, 0, N, N);
    this.geo.computeBoundingSphere();
    return changed * cell * cell;
  }

  // level the ground across a piste stroke: every point gets the height of the stroke's centre line
  // next to it, so the piste has no side slope; the slope along the stroke (downhill) stays.
  // (dx, dz) = stroke direction. Returns the changed grid box or null.
  levelAcross(x, z, dx, dz, radius, strength) {
    // "across" means across the FALL LINE of the slope here (not across the stroke): the piste
    // loses its side tilt but keeps its downhill slope, whichever way you paint. Outside the piste the
    // change fades out over ~2.5 terrain cells, so there are no walls or steps at the edge.
    if (!this.protect) this.buildProtect();
    const w = this.world, { N, cell, S, heights } = w, r = N + 1;
    const R2 = radius + cell * 2.5;
    const i0 = Math.max(1, Math.floor((x - R2 + S / 2) / cell)), i1 = Math.min(N - 1, Math.ceil((x + R2 + S / 2) / cell));
    const j0 = Math.max(1, Math.floor((z - R2 + S / 2) / cell)), j1 = Math.min(N - 1, Math.ceil((z + R2 + S / 2) / cell));
    if (i0 > i1 || j0 > j1) return null;
    const src = heights.slice();
    const Hs = (px, pz) => {
      const fx = clamp((px + S / 2) / cell, 0, N - 0.0001), fz = clamp((pz + S / 2) / cell, 0, N - 0.0001);
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      return (src[j * r + i] * (1 - tx) + src[j * r + i + 1] * tx) * (1 - tz) + (src[(j + 1) * r + i] * (1 - tx) + src[(j + 1) * r + i + 1] * tx) * tz;
    };
    // fall line from the slope over a wider area
    const e = Math.max(25, radius * 1.5);
    let gx = (Hs(x + e, z) - Hs(x - e, z)) / (2 * e), gz = (Hs(x, z + e) - Hs(x, z - e)) / (2 * e);
    let gl = Math.hypot(gx, gz), ux, uz;
    if (gl > 0.03) { ux = -gx / gl; uz = -gz / gl; } else { const l = Math.hypot(dx, dz); if (l < 1e-6) return null; ux = dx / l; uz = dz / l; }
    let changed = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * r + i;
      if (this.protect[k]) continue;
      const px = -S / 2 + i * cell, pz = -S / 2 + j * cell;
      const d = Math.hypot(px - x, pz - z);
      if (d > R2) continue;
      const along = (px - x) * ux + (pz - z) * uz;
      const target = Hs(x + ux * along, z + uz * along);
      let f = 1;
      if (d > radius) { const u = (d - radius) / (R2 - radius); f = 1 - u * u * (3 - 2 * u); }
      heights[k] += (target - src[k]) * strength * f;
      changed = true;
    }
    if (!changed) return null;
    this.updateNormals(i0 - 1, j0 - 1, i1 + 1, j1 + 1);
    return { i0, j0, i1, j1, x0: -S / 2 + i0 * cell, x1: -S / 2 + i1 * cell, z0: -S / 2 + j0 * cell, z1: -S / 2 + j1 * cell };
  }

  // mode: 'raise' | 'lower' | 'smooth' | 'flat'; returns affected grid box or null
  terraform(x, z, radius, mode, strength, dt, refH) {
    if (!this.protect) this.buildProtect();
    const w = this.world, { N, cell, S, heights } = w;
    const r = N + 1;
    const i0 = Math.max(1, Math.floor((x - radius + S / 2) / cell)), i1 = Math.min(N - 1, Math.ceil((x + radius + S / 2) / cell));
    const j0 = Math.max(1, Math.floor((z - radius + S / 2) / cell)), j1 = Math.min(N - 1, Math.ceil((z + radius + S / 2) / cell));
    if (i0 > i1 || j0 > j1) return null;
    const src = mode === 'smooth' ? heights.slice() : heights;
    let changed = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * r + i;
      if (this.protect[k]) continue;
      const px = -S / 2 + i * cell, pz = -S / 2 + j * cell;
      const d = Math.hypot(px - x, pz - z);
      if (d > radius) continue;
      const f = Math.pow(1 - d / radius, 1.5) * (0.5 + 0.5 * Math.cos(Math.PI * d / radius));
      const amt = strength * dt * f;
      if (mode === 'raise') heights[k] += amt * 45;
      else if (mode === 'lower') heights[k] -= amt * 45;
      else if (mode === 'flat') heights[k] += (refH - heights[k]) * Math.min(1, amt * 5);
      else {
        const avg = (src[k - 1] + src[k + 1] + src[k - r] + src[k + r] + src[k - r - 1] + src[k - r + 1] + src[k + r - 1] + src[k + r + 1]) / 8;
        heights[k] += (avg - src[k]) * Math.min(1, amt * 6);
      }
      changed = true;
    }
    if (!changed) return null;
    this.updateNormals(i0 - 1, j0 - 1, i1 + 1, j1 + 1);
    return { i0, j0, i1, j1, x0: -S / 2 + i0 * cell, x1: -S / 2 + i1 * cell, z0: -S / 2 + j0 * cell, z1: -S / 2 + j1 * cell };
  }

  serializeHeights() {
    const h = this.world.heights, h0 = this.world.heights0;
    const out = [];
    for (let k = 0; k < h.length; k++) { const d = Math.round((h[k] - h0[k]) * 10); if (d) out.push(k, d); }
    return out.length ? out.join(',') : '';
  }
  loadHeights(str) {
    if (!str) return;
    const a = str.split(',').map(Number), h = this.world.heights, h0 = this.world.heights0;
    for (let i = 0; i + 1 < a.length; i += 2) if (a[i] < h.length) h[a[i]] = h0[a[i]] + a[i + 1] / 10;
    this.updateNormals(0, 0, this.world.N, this.world.N);
    this.geo.computeBoundingSphere();
  }

  // ---- save / load (run-length encoded)
  serializeLayer(layer) {
    const arr = layer === 'piste' ? this.piste : this.trail;
    const out = [];
    let v = arr[0], n = 0;
    for (let k = 0; k < arr.length; k++) { if (arr[k] === v && n < 65535) n++; else { out.push(v, n); v = arr[k]; n = 1; } }
    out.push(v, n);
    return out.join(',');
  }
  loadLayer(layer, str) {
    const arr = layer === 'piste' ? this.piste : this.trail;
    const parts = str.split(',').map(Number);
    let k = 0;
    for (let i = 0; i < parts.length; i += 2) { arr.fill(parts[i], k, Math.min(arr.length, k + parts[i + 1])); k += parts[i + 1]; }
    if (layer === 'piste') { const st = Math.max(1, this.T / this.GT); for (let py = 0; py < this.T; py += st) for (let px = 0; px < this.T; px += st) if (arr[py * this.T + px]) this.groomData[this.groomPx(px, py)] = 255; this.groomDirty = true; }
    this.refresh(0, 0, this.T - 1, this.T - 1);
  }

  // ray vs heightfield; returns {x,y,z} or null
  raycast(ray) {
    const o = ray.origin, d = ray.direction;
    const w = this.world;
    let t = 0, prevT = 0;
    const maxT = w.S * 4;
    let above = o.y - heightAt(w, o.x, o.z);
    if (above < -2) return null;
    while (t < maxT) {
      prevT = t;
      const step = Math.max(1.5, Math.min(60, above * 0.5));
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if ((Math.abs(x) > w.S / 2 + 50 || Math.abs(z) > w.S / 2 + 50) && d.y > 0) return null;
      above = y - heightAt(w, x, z);
      if (above < 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 22; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m - heightAt(w, o.x + d.x * m, o.z + d.z * m) < 0) b = m; else a = m;
        }
        const x2 = o.x + d.x * b, z2 = o.z + d.z * b;
        if (Math.abs(x2) > w.S / 2 || Math.abs(z2) > w.S / 2) return null;
        return { x: x2, y: o.y + d.y * b, z: z2 };
      }
    }
    return null;
  }

  dispose() {
    this.scene.remove(this.mesh); this.scene.remove(this.skirt);
    if (this.berms) { this.scene.remove(this.berms); this.berms.geometry.dispose(); }
    this.mesh.geometry.dispose(); this.material.dispose(); this.paintTex.dispose(); this.staticTex.dispose(); this.groomTex.dispose(); this.noise.dispose();
    this.skirt.geometry.dispose(); this.skirt.material.dispose();
  }
}
