// Real terrain: 20 built-in ski areas (height grids shipped as files next to the page) and
// "Echter Ort": any coordinates, from elevation tiles the player saves and loads into the game.
// Grid: GN x GN samples over SPAN m, row 0 = north, column 0 = west, values in metres above sea level.

export const GN = 451, SPAN = 9000;

// t = tree line, s = glacier / summer-snow line (m above sea level)
export const REAL_RESORTS = [
  { id: 'zermatt', name: 'Zermatt – Matterhorn', flag: '🇨🇭', lat: 45.992, lon: 7.705, t: 2300, s: 3100, vs: 'gross', rail: true },
  { id: 'verbier', name: 'Verbier', flag: '🇨🇭', lat: 46.095, lon: 7.27, t: 2150, s: 3050, vs: 'mittel', rail: false },
  { id: 'stmoritz', name: 'St. Moritz', flag: '🇨🇭', lat: 46.505, lon: 9.82, t: 2250, s: 3050, vs: 'gross', rail: true },
  { id: 'davos', name: 'Davos Klosters', flag: '🇨🇭', lat: 46.805, lon: 9.825, t: 2100, s: 3000, vs: 'gross', rail: true },
  { id: 'laax', name: 'Laax Flims', flag: '🇨🇭', lat: 46.845, lon: 9.23, t: 2000, s: 2950, vs: 'mittel', rail: false },
  { id: 'hasliberg', name: 'Meiringen-Hasliberg', flag: '🇨🇭', lat: 46.755, lon: 8.22, t: 1950, s: 3000, vs: 'mittel', rail: true },
  { id: 'jungfrau', name: 'Jungfrau Region (Grindelwald–Wengen)', flag: '🇨🇭', lat: 46.605, lon: 7.98, t: 1950, s: 2900, vs: 'gross', rail: true },
  { id: 'engelberg', name: 'Engelberg-Titlis', flag: '🇨🇭', lat: 46.79, lon: 8.42, t: 1900, s: 2900, vs: 'mittel', rail: true },
  { id: 'saasfee', name: 'Saas-Fee', flag: '🇨🇭', lat: 46.09, lon: 7.92, t: 2250, s: 3100, vs: 'mittel', rail: false },
  { id: 'andermatt', name: 'Andermatt-Sedrun', flag: '🇨🇭', lat: 46.63, lon: 8.62, t: 1950, s: 2950, vs: 'mittel', rail: true },
  { id: 'adelboden', name: 'Adelboden-Lenk', flag: '🇨🇭', lat: 46.48, lon: 7.53, t: 1950, s: 3000, vs: 'mittel', rail: false },
  { id: 'stanton', name: 'St. Anton am Arlberg', flag: '🇦🇹', lat: 47.14, lon: 10.245, t: 1950, s: 2950, vs: 'mittel', rail: true },
  { id: 'ischgl', name: 'Ischgl', flag: '🇦🇹', lat: 46.99, lon: 10.305, t: 2050, s: 3000, vs: 'mittel', rail: false },
  { id: 'kitzbuehel', name: 'Kitzbühel', flag: '🇦🇹', lat: 47.425, lon: 12.37, t: 1800, s: 3000, vs: 'gross', rail: true },
  { id: 'saalbach', name: 'Saalbach Hinterglemm', flag: '🇦🇹', lat: 47.38, lon: 12.62, t: 1800, s: 3000, vs: 'gross', rail: false },
  { id: 'soelden', name: 'Sölden', flag: '🇦🇹', lat: 46.95, lon: 10.98, t: 2100, s: 3000, vs: 'mittel', rail: false },
  { id: 'garmisch', name: 'Garmisch-Partenkirchen', flag: '🇩🇪', lat: 47.465, lon: 11.085, t: 1750, s: 2800, vs: 'gross', rail: true },
  { id: 'oberstdorf', name: 'Oberstdorf', flag: '🇩🇪', lat: 47.41, lon: 10.31, t: 1700, s: 2900, vs: 'mittel', rail: true },
  { id: 'chamonix', name: 'Chamonix – Mont Blanc', flag: '🇫🇷', lat: 45.915, lon: 6.875, t: 2050, s: 2900, vs: 'gross', rail: true },
  { id: 'valdisere', name: "Val d'Isère", flag: '🇫🇷', lat: 45.445, lon: 6.965, t: 2200, s: 3000, vs: 'mittel', rail: false },
  { id: 'troisvallees', name: 'Les 3 Vallées (Méribel)', flag: '🇫🇷', lat: 45.38, lon: 6.59, t: 2100, s: 3000, vs: 'mittel', rail: false },
  { id: 'alpedhuez', name: "Alpe d'Huez", flag: '🇫🇷', lat: 45.10, lon: 6.08, t: 2000, s: 3000, vs: 'mittel', rail: false },
  { id: 'cortina', name: "Cortina d'Ampezzo", flag: '🇮🇹', lat: 46.535, lon: 12.12, t: 2100, s: 3000, vs: 'gross', rail: false },
  { id: 'groeden', name: 'Gröden (Val Gardena)', flag: '🇮🇹', lat: 46.565, lon: 11.735, t: 2150, s: 3050, vs: 'mittel', rail: false },
  { id: 'livigno', name: 'Livigno', flag: '🇮🇹', lat: 46.54, lon: 10.13, t: 2250, s: 3050, vs: 'mittel', rail: false },
  { id: 'whistler', name: 'Whistler Blackcomb', flag: '🇨🇦', lat: 50.09, lon: -122.925, t: 1800, s: 2250, vs: 'mittel', rail: false },
  { id: 'vail', name: 'Vail', flag: '🇺🇸', lat: 39.615, lon: -106.36, t: 3500, s: 4200, vs: 'mittel', rail: false },
  { id: 'aspen', name: 'Aspen Snowmass', flag: '🇺🇸', lat: 39.19, lon: -106.86, t: 3500, s: 4200, vs: 'mittel', rail: false },
  { id: 'lakelouise', name: 'Lake Louise', flag: '🇨🇦', lat: 51.44, lon: -116.17, t: 2250, s: 2950, vs: 'klein', rail: true },
  { id: 'jackson', name: 'Jackson Hole', flag: '🇺🇸', lat: 43.59, lon: -110.85, t: 3100, s: 3900, vs: 'klein', rail: false },
  { id: 'portillo', name: 'Portillo', flag: '🇨🇱', lat: -32.84, lon: -70.12, t: 1200, s: 4200, vs: 'klein', rail: false, forest: 0 },
  { id: 'catedral', name: 'Cerro Catedral', flag: '🇦🇷', lat: -41.17, lon: -71.46, t: 1650, s: 2900, vs: 'klein', rail: false },
  { id: 'hakuba', name: 'Hakuba', flag: '🇯🇵', lat: 36.70, lon: 137.82, t: 2300, s: 2900, vs: 'mittel', rail: false },
  { id: 'are', name: 'Åre', flag: '🇸🇪', lat: 63.41, lon: 13.08, t: 850, s: 2400, vs: 'mittel', rail: true },
  { id: 'niseko', name: 'Niseko', flag: '🇯🇵', lat: 42.865, lon: 140.68, t: 1000, s: 2400, vs: 'mittel', rail: false },
];
export const resortById = (id) => REAL_RESORTS.find((r) => r.id === id);

const CACHE = new Map();
export const realSource = (key) => CACHE.get(key) || null;
export const putCustom = (key, grid) => CACHE.set('custom:' + key, grid);

async function gunzip(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann die Höhendaten nicht entpacken (bitte Browser aktualisieren).');
  const ab = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return ab;
}

// built-in area: real/<id>.json = { gz: base64(gzip(int16 LE, row-delta coded, unit 0.5 m)) }
export async function loadPreset(id) {
  if (CACHE.has(id)) return CACHE.get(id);
  const r = await fetch('real/' + id + '.json');
  if (!r.ok) throw new Error('Höhendaten nicht gefunden (' + r.status + ')');
  const b64 = (await r.json()).gz, bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const ab = await gunzip(u8);
  const d = new Int16Array(ab), out = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) { let v = 0; for (let i = 0; i < GN; i++) { v += d[j * GN + i]; out[j * GN + i] = v / 2; } }
  CACHE.set(id, out);
  return out;
}

// --- custom places: elevation tiles (Terrarium PNG, zoom 12) the player saves from the links
export const TILE_Z = 12;
const TS = 256;
const mercX = (lon, n) => (lon + 180) / 360 * n;
const mercY = (lat, n) => { const f = lat * Math.PI / 180; return (1 - Math.log(Math.tan(f) + 1 / Math.cos(f)) / Math.PI) / 2 * n; };
export const tileUrl = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TILE_Z}/${x}/${y}.png`;

export function parseCoords(s) {
  let t = String(s || '').trim();
  if (!t.includes('.')) t = t.replace(/(\d),(\d)/g, '$1.$2');
  const nums = t.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let lat = parseFloat(nums[0]), lon = parseFloat(nums[1]);
  if (/\d[^\d]*S\b/i.test(t.split(/[,;]/)[0] || '')) lat = -Math.abs(lat);
  if (/W\b/i.test(t)) lon = -Math.abs(lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 84 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// sample positions (Mercator pixel coords at TILE_Z) and the tiles needed
function samplePlan(lat0, lon0) {
  const n = 2 ** TILE_Z * TS;
  const mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180), h = (GN - 1) / 2, st = SPAN / (GN - 1);
  const P = new Float64Array(GN * GN * 2);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const lat = lat0 + (h - j) * st / mLat, lon = lon0 + (i - h) * st / mLon;
    const X = mercX(lon, n) - 0.5, Y = mercY(lat, n) - 0.5, q = (j * GN + i) * 2;
    P[q] = X; P[q + 1] = Y;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  const tiles = [];
  for (let ty = Math.floor(y0 / TS); ty <= Math.floor((y1 + 1) / TS); ty++) for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x1 + 1) / TS); tx++) tiles.push({ x: tx, y: ty });
  return { P, tiles };
}
export function tilesFor(lat, lon) { return samplePlan(lat, lon).tiles; }

// decode one saved tile image (File/Blob) -> Float32Array(256*256) metres
export async function decodeTile(file) {
  const bm = await createImageBitmap(file);
  if (bm.width !== TS || bm.height !== TS) throw new Error('Das Bild hat nicht die richtige Grösse (' + bm.width + '×' + bm.height + ' statt 256×256).');
  const c = document.createElement('canvas'); c.width = TS; c.height = TS;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bm, 0, 0);
  const d = cx.getImageData(0, 0, TS, TS).data, e = new Float32Array(TS * TS);
  for (let i = 0; i < TS * TS; i++) e[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
  // lossy copies (JPEG) produce wild jumps -> 3x3 median-ish clean-up of outliers
  let bad = 0;
  for (let y = 1; y < TS - 1; y++) for (let x = 1; x < TS - 1; x++) {
    const k = y * TS + x, a = (e[k - 1] + e[k + 1] + e[k - TS] + e[k + TS]) / 4;
    if (Math.abs(e[k] - a) > 120) { e[k] = a; bad++; }
  }
  if (bad > TS * TS * 0.05) throw new Error('Das Bild ist beschädigt oder umgewandelt (bitte als PNG „In Dateien sichern“).');
  return e;
}

// build the grid from decoded tiles: tiles = Map("x/y" -> Float32Array)
export function buildCustom(lat, lon, tiles) {
  const { P } = samplePlan(lat, lon);
  const at = (X, Y) => { const tx = Math.floor(X / TS), ty = Math.floor(Y / TS); const t = tiles.get(tx + '/' + ty); return t ? t[(Y - ty * TS) * TS + (X - tx * TS)] : NaN; };
  const out = new Float32Array(GN * GN);
  for (let k = 0; k < GN * GN; k++) {
    const X = P[k * 2], Y = P[k * 2 + 1], ix = Math.floor(X), iy = Math.floor(Y), fx = X - ix, fy = Y - iy;
    const v = at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
    out[k] = Math.round(v * 2) / 2;
  }
  for (let k = 0; k < out.length; k++) if (!isFinite(out[k])) throw new Error('Es fehlt noch ein Kartenstück.');
  return out;
}

// custom grids travel inside the save game: int16 (0.5 m) row-delta, base64
export function encodeGrid(a) {
  const d = new Int16Array(a.length);
  for (let j = 0; j < GN; j++) { let prev = 0; for (let i = 0; i < GN; i++) { const v = Math.round(a[j * GN + i] * 2); d[j * GN + i] = v - prev; prev = v; } }
  const u8 = new Uint8Array(d.buffer); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function decodeGrid(b64) {
  const s = atob(b64), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  const d = new Int16Array(u8.buffer), out = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) { let v = 0; for (let i = 0; i < GN; i++) { v += d[j * GN + i]; out[j * GN + i] = v / 2; } }
  return out;
}

// make sure the grid for these settings is in the cache (async: fetch / decode)
export async function ensureSource(p) {
  if (!p.real) return null;
  if (p.real === 'custom') {
    const key = 'custom:' + (p.srcKey || '');
    if (!CACHE.has(key)) CACHE.set(key, decodeGrid(p.src));
    return CACHE.get(key);
  }
  return loadPreset(p.real);
}
export function sourceFor(p) {
  if (!p.real) return null;
  return CACHE.get(p.real === 'custom' ? 'custom:' + (p.srcKey || '') : p.real) || null;
}
