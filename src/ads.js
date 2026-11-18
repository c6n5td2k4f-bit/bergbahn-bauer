// Werbung: erfundene Marken mit gezeichneten Logos + eigene Bilder des Spielers.
import * as THREE from 'three';

// [Name, Hintergrund, Schrift, Akzent, Logo, Slogan, Layout]
export const BRANDS = [
  ['GLETSCHERQUELL', '#0a5fb4', '#ffffff', '#8fd3ff', 'drop', 'Wasser vom Gletscher', 0],
  ['BLITZ ENERGY', '#111318', '#ffd200', '#ff3b30', 'bolt', 'Volle Ladung für den Hang', 1],
  ['ALPENMILCH', '#ffffff', '#1d4fb8', '#3aa0ff', 'mountain', 'Frisch von der Alp', 0],
  ['GIPFELBANK', '#c8102e', '#ffffff', '#ffd6d6', 'star', 'Ihre Bank im Tal', 2],
  ['SKIWACHS PRO', '#ffd200', '#111111', '#e2001a', 'skis', 'Schneller auf jeder Piste', 1],
  ['FROSTWEAR', '#14213d', '#ffffff', '#5ec8ff', 'flake', 'Warm bei minus 30 Grad', 0],
  ['SONNENHANG', '#ff8a00', '#ffffff', '#ffe066', 'sun', 'Sonnencreme LSF 50', 2],
  ['KAFFEE BERGLER', '#4a2a17', '#f6e3c5', '#d08a3c', 'cup', 'Der Espresso für die Gondel', 0],
  ['ARVENHOLZ', '#1f5a32', '#ffffff', '#9bd17a', 'pine', 'Möbel aus dem Bergwald', 1],
  ['GONDOLIA REISEN', '#00a3e0', '#ffffff', '#ffffff', 'gondola', 'Ferien über den Wolken', 2],
  ['KLARSICHT', '#e2001a', '#ffffff', '#ffd200', 'goggle', 'Skibrillen mit Durchblick', 0],
  ['FONDUE & CO', '#ffd200', '#7a1d00', '#c0392b', 'cheese', 'Käse aus dem Dorf', 1],
  ['BERGFUNK 99.3', '#ffffff', '#e2001a', '#111111', 'wave', 'Radio für die Berge', 2],
  ['POLARIS UHREN', '#0d0d0d', '#d9b86c', '#ffffff', 'clock', 'Präzision seit 1921', 0],
];
export const AD_SLOTS = BRANDS.length;

// Spieler-Einstellungen: mode 'brands' | 'imgs' | 'mix'
const AD = { mode: 'brands', imgs: [] }; // imgs: [{ url, src: canvas|null }]
let onChange = null;
export function onAdsChange(f) { onChange = f; }
export function adsState() { return { mode: AD.mode, imgs: AD.imgs.map((m) => m.url) }; }
export function adImages() { return AD.imgs; }

function pool() {
  const imgs = AD.imgs.filter((m) => m.src);
  const brands = BRANDS.map((b, i) => ({ brand: i }));
  if (AD.mode === 'imgs' && imgs.length) return imgs.map((m) => ({ img: m }));
  if (AD.mode === 'mix' && imgs.length) {
    const out = [];
    for (let i = 0; i < Math.max(brands.length, imgs.length * 2); i++) out.push(i % 2 && imgs.length ? { img: imgs[(i >> 1) % imgs.length] } : brands[(i >> 1) % brands.length]);
    return out;
  }
  return brands;
}
export function adEntry(i) { const p = pool(); return p[((i % p.length) + p.length) % p.length]; }
export function adBrandColor(i) { const e = adEntry(i); return e.brand !== undefined ? BRANDS[e.brand][1] : '#ffffff'; }

// ---------- Logos ----------
function poly(x, pts) { x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); }
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
export function drawLogo(x, kind, cx, cy, s, fg, ac) {
  x.save(); x.translate(cx, cy); x.fillStyle = fg; x.strokeStyle = fg; x.lineCap = 'round'; x.lineJoin = 'round';
  const h = s / 2;
  switch (kind) {
    case 'mountain':
      poly(x, [[-h, h * 0.7], [-h * 0.25, -h * 0.75], [h * 0.15, -h * 0.05], [h * 0.4, -h * 0.4], [h, h * 0.7]]);
      x.fillStyle = ac; poly(x, [[-h * 0.25, -h * 0.75], [-h * 0.47, -h * 0.32], [-h * 0.3, -h * 0.4], [-h * 0.18, -h * 0.28], [-h * 0.04, -h * 0.42]]);
      break;
    case 'flake':
      x.lineWidth = s * 0.09;
      for (let k = 0; k < 6; k++) { x.save(); x.rotate(k * Math.PI / 3); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -h); x.moveTo(0, -h * 0.55); x.lineTo(-h * 0.25, -h * 0.8); x.moveTo(0, -h * 0.55); x.lineTo(h * 0.25, -h * 0.8); x.stroke(); x.restore(); }
      break;
    case 'sun':
      x.beginPath(); x.arc(0, 0, h * 0.5, 0, Math.PI * 2); x.fill();
      x.lineWidth = s * 0.08; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; x.beginPath(); x.moveTo(Math.cos(a) * h * 0.66, Math.sin(a) * h * 0.66); x.lineTo(Math.cos(a) * h * 0.95, Math.sin(a) * h * 0.95); x.stroke(); }
      break;
    case 'bolt':
      poly(x, [[h * 0.2, -h], [-h * 0.55, h * 0.12], [-h * 0.05, h * 0.12], [-h * 0.25, h], [h * 0.55, -h * 0.15], [h * 0.05, -h * 0.15]]);
      break;
    case 'cup':
      rr(x, -h * 0.6, -h * 0.15, h * 1.0, h * 0.85, h * 0.2); x.fill();
      x.lineWidth = s * 0.07; x.beginPath(); x.arc(h * 0.45, h * 0.25, h * 0.22, -Math.PI / 2, Math.PI / 2); x.stroke();
      x.strokeStyle = ac; x.lineWidth = s * 0.05;
      for (const dx of [-0.3, 0, 0.3]) { x.beginPath(); x.moveTo((dx - 0.1) * h, -h * 0.3); x.bezierCurveTo((dx + 0.1) * h, -h * 0.5, (dx - 0.15) * h, -h * 0.65, (dx + 0.05) * h, -h * 0.9); x.stroke(); }
      break;
    case 'drop':
      x.beginPath(); x.moveTo(0, -h); x.bezierCurveTo(h * 0.2, -h * 0.5, h * 0.7, -h * 0.05, h * 0.7, h * 0.3); x.arc(0, h * 0.3, h * 0.7, 0, Math.PI); x.bezierCurveTo(-h * 0.7, -h * 0.05, -h * 0.2, -h * 0.5, 0, -h); x.fill();
      x.fillStyle = ac; x.beginPath(); x.ellipse(-h * 0.28, h * 0.25, h * 0.12, h * 0.25, 0.3, 0, Math.PI * 2); x.fill();
      break;
    case 'pine':
      for (const [y, w] of [[-h, 0.45], [-h * 0.45, 0.7], [h * 0.1, 0.95]]) poly(x, [[0, y], [-h * w, y + h * 0.75], [h * w, y + h * 0.75]]);
      x.fillRect(-h * 0.12, h * 0.8, h * 0.24, h * 0.25);
      break;
    case 'gondola':
      x.lineWidth = s * 0.05; x.beginPath(); x.moveTo(-h, -h * 0.75); x.lineTo(h, -h * 0.45); x.stroke();
      x.lineWidth = s * 0.06; x.beginPath(); x.moveTo(0, -h * 0.6); x.lineTo(0, -h * 0.2); x.stroke();
      rr(x, -h * 0.55, -h * 0.25, h * 1.1, h * 1.1, h * 0.25); x.fill();
      x.fillStyle = ac; rr(x, -h * 0.4, -h * 0.1, h * 0.8, h * 0.42, h * 0.1); x.fill();
      break;
    case 'goggle':
      x.lineWidth = s * 0.08; x.beginPath(); x.moveTo(-h, 0); x.lineTo(h, 0); x.stroke();
      rr(x, -h * 0.8, -h * 0.4, h * 1.6, h * 0.8, h * 0.38); x.fill();
      x.fillStyle = ac; rr(x, -h * 0.68, -h * 0.28, h * 1.36, h * 0.56, h * 0.28); x.fill();
      x.fillStyle = fg; poly(x, [[-h * 0.1, h * 0.3], [0, h * 0.12], [h * 0.1, h * 0.3]]);
      break;
    case 'star': {
      const p = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? h * 0.42 : h; p.push([Math.cos(a) * r, Math.sin(a) * r]); } poly(x, p);
      break;
    }
    case 'cheese':
      poly(x, [[-h, h * 0.6], [-h, -h * 0.05], [h, -h * 0.6], [h, h * 0.6]]);
      x.fillStyle = ac; for (const [a, b, r] of [[-0.5, 0.25, 0.14], [0.2, 0.1, 0.2], [0.6, 0.35, 0.1], [0.45, -0.25, 0.09]]) { x.beginPath(); x.arc(a * h, b * h, r * h, 0, Math.PI * 2); x.fill(); }
      break;
    case 'skis':
      x.lineWidth = s * 0.12;
      for (const sg of [-1, 1]) { x.save(); x.rotate(sg * 0.5); x.beginPath(); x.moveTo(0, h * 0.95); x.lineTo(0, -h * 0.75); x.quadraticCurveTo(0, -h, sg * h * 0.15, -h); x.stroke(); x.restore(); }
      break;
    case 'wave':
      x.beginPath(); x.arc(0, h * 0.3, h * 0.15, 0, Math.PI * 2); x.fill(); x.lineWidth = s * 0.08;
      for (const r of [0.4, 0.68, 0.96]) { x.beginPath(); x.arc(0, h * 0.3, r * h, -Math.PI * 0.8, -Math.PI * 0.2); x.stroke(); }
      break;
    case 'clock':
      x.lineWidth = s * 0.07; x.beginPath(); x.arc(0, 0, h * 0.85, 0, Math.PI * 2); x.stroke();
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; x.beginPath(); x.moveTo(Math.cos(a) * h * 0.62, Math.sin(a) * h * 0.62); x.lineTo(Math.cos(a) * h * 0.72, Math.sin(a) * h * 0.72); x.stroke(); }
      x.lineWidth = s * 0.06; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -h * 0.5); x.moveTo(0, 0); x.lineTo(h * 0.35, h * 0.12); x.stroke();
      break;
  }
  x.restore();
}

function fitFont(x, txt, maxW, size, weight = '900') {
  let s = size; x.font = `${weight} ${s}px Arial, Helvetica, sans-serif`;
  while (s > 10 && x.measureText(txt).width > maxW) { s -= 2; x.font = `${weight} ${s}px Arial, Helvetica, sans-serif`; }
  return s;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function coverImg(x, src, W, H) {
  const r = Math.max(W / src.width, H / src.height), w = src.width * r, h = src.height * r;
  x.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

// ---------- Werbeflächen zeichnen ----------
const DRAW = {
  // Bandenwerbung / Netzbanner, quer
  banner(x, W, H, e) {
    if (e.img) { coverImg(x, e.img.src, W, H); return; }
    const [txt, bg, fg, ac, logo, , lay] = BRANDS[e.brand];
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    if (lay === 1) {
      x.fillStyle = fg; x.fillRect(0, 0, H * 1.15, H); drawLogo(x, logo, H * 0.58, H / 2, H * 0.7, bg, ac);
      x.fillStyle = fg; fitFont(x, txt, W - H * 1.4, H * 0.56); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, (W + H * 1.15) / 2, H * 0.54);
    } else if (lay === 2) {
      x.fillStyle = ac; x.fillRect(0, H * 0.82, W, H * 0.18);
      x.fillStyle = fg; fitFont(x, txt, W - H * 1.3, H * 0.52); x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(txt, H * 0.2, H * 0.44);
      drawLogo(x, logo, W - H * 0.55, H * 0.42, H * 0.62, fg, ac);
    } else {
      drawLogo(x, logo, H * 0.6, H / 2, H * 0.72, fg, ac);
      x.fillStyle = fg; fitFont(x, txt, W - H * 1.4, H * 0.56); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, (W + H * 1.1) / 2, H * 0.54);
    }
  },
  // Plakatwand 2:1
  poster(x, W, H, e) {
    if (e.img) { coverImg(x, e.img.src, W, H); return; }
    const [txt, bg, fg, ac, logo, slogan, lay] = BRANDS[e.brand];
    const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, shade(bg, 0.12)); gr.addColorStop(1, shade(bg, -0.28)); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // Bergkulisse
    x.globalAlpha = 0.18; x.fillStyle = fg;
    poly(x, [[0, H], [0, H * 0.72], [W * 0.12, H * 0.6], [W * 0.22, H * 0.68], [W * 0.38, H * 0.42], [W * 0.5, H * 0.58], [W * 0.62, H * 0.5], [W * 0.8, H * 0.66], [W, H * 0.55], [W, H]]);
    x.globalAlpha = 0.1; x.beginPath(); x.arc(W * 0.78, H * 0.42, H * 0.46, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
    const right = lay !== 2;
    const lx = right ? W * 0.76 : W * 0.24, tx = right ? W * 0.05 : W * 0.47;
    drawLogo(x, logo, lx, H * 0.45, H * 0.62, fg, ac);
    x.fillStyle = fg; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    const words = txt.split(' '), two = words.length > 1 && txt.length > 10;
    if (two) { const s = fitFont(x, words[0], W * 0.48, H * 0.2); x.fillText(words[0], tx, H * 0.36); fitFont(x, words.slice(1).join(' '), W * 0.48, s); x.fillText(words.slice(1).join(' '), tx, H * 0.36 + s * 1.02); }
    else fitFont(x, txt, W * 0.48, H * 0.22), x.fillText(txt, tx, H * 0.45);
    x.fillStyle = ac; x.fillRect(tx, H * 0.66, W * 0.1, H * 0.025);
    x.fillStyle = fg; fitFont(x, slogan, W * 0.46, H * 0.085, '700'); x.fillText(slogan, tx, H * 0.8);
  },
  // Beachflag / Turm, hochkant 1:4
  flag(x, W, H, e) {
    if (e.img) { coverImg(x, e.img.src, W, H); return; }
    const [txt, bg, fg, ac, logo] = BRANDS[e.brand];
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = ac; x.fillRect(W * 0.82, 0, W * 0.18, H);
    drawLogo(x, logo, W * 0.42, W * 0.6, W * 0.62, fg, ac);
    x.save(); x.translate(W * 0.42, H * 0.6); x.rotate(-Math.PI / 2); x.fillStyle = fg; fitFont(x, txt, H * 0.72, W * 0.5); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 0, 0); x.restore();
  },
  // Aufsteller, hochkant 2:3
  portrait(x, W, H, e) {
    if (e.img) { coverImg(x, e.img.src, W, H); return; }
    const [txt, bg, fg, ac, logo, slogan] = BRANDS[e.brand];
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, shade(bg, 0.1)); gr.addColorStop(1, shade(bg, -0.25)); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    drawLogo(x, logo, W / 2, H * 0.32, W * 0.58, fg, ac);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; fitFont(x, txt, W * 0.9, W * 0.17); x.fillText(txt, W / 2, H * 0.66);
    x.fillStyle = ac; x.fillRect(W * 0.38, H * 0.74, W * 0.24, H * 0.012);
    x.fillStyle = fg; fitFont(x, slogan, W * 0.86, W * 0.075, '700'); x.fillText(slogan, W / 2, H * 0.82);
  },
};
const SIZES = { banner: [512, 112], poster: [768, 384], flag: [160, 640], portrait: [256, 384] };

const mats = new Map(); // key -> { kind, i, canvas, tex, mat }
let night = false;
function redraw(rec) {
  const [W, H] = SIZES[rec.kind], x = rec.canvas.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.globalAlpha = 1;
  DRAW[rec.kind](x, W, H, adEntry(rec.i));
  rec.tex.needsUpdate = true;
}
export function adMat(kind, i) {
  i = ((i % AD_SLOTS) + AD_SLOTS) % AD_SLOTS;
  const key = kind + ':' + i;
  let rec = mats.get(key);
  if (rec) return rec.mat;
  const [W, H] = SIZES[kind], canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const lit = kind === 'poster' || kind === 'portrait';
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: kind === 'banner' || kind === 'flag' ? THREE.DoubleSide : THREE.FrontSide, ...(lit ? { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: night ? 0.55 : 0 } : {}) });
  rec = { kind, i, canvas, tex, mat, lit };
  mats.set(key, rec); redraw(rec);
  return mat;
}
export function setAdNight(on) { night = on; for (const r of mats.values()) if (r.lit) r.mat.emissiveIntensity = on ? 0.55 : 0; }
function refreshAll() { for (const r of mats.values()) redraw(r); if (onChange) onChange(); }

// ---------- eigene Bilder ----------
const MAX_IMGS = 12;
function toCanvas(bmp) {
  const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(bmp.width * k)); c.height = Math.max(8, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
function dataUrlToBlob(url) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(url); if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: m[1] || 'image/jpeg' });
}
export async function addAdFiles(files) {
  let n = 0;
  for (const f of files) {
    if (AD.imgs.length >= MAX_IMGS) break;
    try {
      const bmp = await createImageBitmap(f);
      const c = toCanvas(bmp);
      const png = /png|gif|webp/.test(f.type) && c.width * c.height < 200000;
      AD.imgs.push({ url: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.84), src: c }); n++;
    } catch (e) { console.warn('Bild', e); }
  }
  if (n && AD.mode === 'brands') AD.mode = 'mix';
  refreshAll();
  return n;
}
export function removeAdImage(k) { AD.imgs.splice(k, 1); refreshAll(); }
export function setAdMode(m) { AD.mode = m; refreshAll(); }
export function loadAds(s) {
  AD.mode = (s && s.mode) || 'brands';
  AD.imgs = ((s && s.imgs) || []).slice(0, MAX_IMGS).map((url) => ({ url, src: null }));
  refreshAll();
  for (const m of AD.imgs) {
    const b = dataUrlToBlob(m.url); if (!b) continue;
    createImageBitmap(b).then((bmp) => { m.src = toCanvas(bmp); refreshAll(); }).catch((e) => console.warn('Bild', e));
  }
}
export const MAX_AD_IMGS = MAX_IMGS;
