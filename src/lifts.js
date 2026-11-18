// Ski lifts: many types, automatic/manual towers (support & compression), cables, stations,
// moving carriers with riders, aerial tramway, funicular, magic carpet. Ride helpers for the player.
import * as THREE from 'three';
import { rbox, planExtrude, DOME, CYLR } from './shapes.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from './terrain.js';
import { clamp, lerp } from './noise.js';
import { riderGeometry, skierGeometry, JACKETS } from './figures.js';
import { GFX } from './gfx.js';

export const BRANDS = {
  dreifachmayr: { name: 'Dreifachmayr', mast: 0xa7adb3, roof: 0xc9ced3, accent: 0x2b2f33, bubble: 0xff8a1e, cushion: 0x2c3e50, cabin: 0xd9dde1, style: 'round' },
  leiter: { name: 'Leiter', mast: 0x5f656b, roof: 0x4a4f55, accent: 0xd2232a, bubble: 0x2f7fd8, cushion: 0x7d1d1d, cabin: 0xc8282e, style: 'square' },
  busserventa: { name: 'Busserventa', mast: 0x8e9499, roof: 0xb9bdc1, accent: 0xe30613, bubble: 0xffcc00, cushion: 0x333333, cabin: 0xe30613, style: 'square' },
};

export const LIFT_GROUPS = [
  { name: 'Schlepplifte', types: ['teppich', 'teller', 'schlepp'] },
  { name: 'Sesselbahnen', types: ['sessel2', 'sessel3', 'sessel4', 'sessel4h', 'sessel6', 'sessel6h', 'sessel8h'] },
  { name: 'Gondeln', types: ['gondel6', 'gondel8', 'gondel10', 'gondel6m', 'gondel8m', 'gondel10m', 'kombi', 'puls', 'funitel', 'zweis', 'dreis'] },
  { name: 'Pendel- & Standseilbahn', types: ['tram', 'tram1', 'twinliner', 'funifor', 'cabrio', 'standseil'] },
];

const T = (o) => o;
export const LIFT_TYPES = {
  teppich:  T({ name: 'Zauberteppich', kind: 'carpet', seats: 1, gauge: 1.2, hs: 0.35, clear: 0, towerH: 0, towerMax: 0, minSpan: 0, maxSpan: 0, speed: 1.0, spacing: 3.5, detach: false, Ls: 3, maxLen: 250, maxGrade: 0.32, base: 120000, perM: 900 }),
  teller:   T({ name: 'Tellerlift', kind: 'platter', seats: 1, gauge: 2.6, hs: 4.2, clear: 3.2, maxClear: 8, towerH: 6, towerMax: 10, minSpan: 25, maxSpan: 80, speed: 2.8, spacing: 12, detach: false, Ls: 5, maxLen: 1200, base: 180000, perM: 380 }),
  schlepp:  T({ name: 'Bügellift', kind: 'tbar', seats: 2, gauge: 3.2, hs: 4.6, clear: 3.4, maxClear: 8.5, towerH: 6.5, towerMax: 11, minSpan: 25, maxSpan: 85, speed: 3.0, spacing: 10, detach: false, Ls: 6, maxLen: 1800, base: 250000, perM: 450 }),
  sessel2:  T({ name: '2er-Sesselbahn', kind: 'chair', seats: 2, gauge: 4.4, hs: 4.4, hanger: 3.8, clear: 7.0, towerH: 9, towerMax: 24, minSpan: 30, maxSpan: 230, speed: 2.3, spacing: 14, detach: false, Ls: 7, maxLen: 2500, base: 900000, perM: 900 }),
  sessel3:  T({ name: '3er-Sesselbahn', kind: 'chair', seats: 3, gauge: 4.8, hs: 4.5, hanger: 3.9, clear: 7.0, towerH: 9, towerMax: 24, minSpan: 30, maxSpan: 230, speed: 2.4, spacing: 15, detach: false, Ls: 7, maxLen: 2500, base: 1100000, perM: 1000 }),
  sessel4:  T({ name: '4er-Sesselbahn', kind: 'chair', seats: 4, gauge: 5.4, hs: 4.8, hanger: 4.2, clear: 7.5, towerH: 10, towerMax: 26, minSpan: 30, maxSpan: 260, speed: 5.0, spacing: 26, detach: true, Ls: 18, maxLen: 3200, base: 2500000, perM: 1500 }),
  sessel4h: T({ name: '4er-Sesselbahn mit Haube', kind: 'chair', seats: 4, bubble: true, gauge: 5.4, hs: 4.8, hanger: 4.2, clear: 7.5, towerH: 10, towerMax: 26, minSpan: 30, maxSpan: 260, speed: 5.0, spacing: 26, detach: true, Ls: 18, maxLen: 3200, base: 2800000, perM: 1600 }),
  sessel6:  T({ name: '6er-Sesselbahn', kind: 'chair', seats: 6, gauge: 6.0, hs: 4.9, hanger: 4.3, clear: 7.6, towerH: 11, towerMax: 28, minSpan: 30, maxSpan: 280, speed: 5.5, spacing: 30, detach: true, Ls: 20, maxLen: 3500, base: 3300000, perM: 1800 }),
  sessel6h: T({ name: '6er-Sesselbahn mit Haube', kind: 'chair', seats: 6, bubble: true, gauge: 6.0, hs: 4.9, hanger: 4.3, clear: 7.6, towerH: 11, towerMax: 28, minSpan: 30, maxSpan: 280, speed: 5.5, spacing: 30, detach: true, Ls: 20, maxLen: 3500, base: 3600000, perM: 1900 }),
  sessel8h: T({ name: '8er-Sesselbahn mit Haube', kind: 'chair', seats: 8, bubble: true, gauge: 6.6, hs: 5.0, hanger: 4.4, clear: 7.8, towerH: 12, towerMax: 30, minSpan: 30, maxSpan: 300, speed: 6.0, spacing: 34, detach: true, Ls: 22, maxLen: 3800, base: 4500000, perM: 2300 }),
  gondel6:  T({ name: '6er-Gondelbahn', kind: 'gondola', seats: 6, gauge: 5.6, hs: 5.0, hanger: 1.5, cab: [1.9, 1.8, 2.0], clear: 7.5, towerH: 13, towerMax: 35, minSpan: 40, maxSpan: 380, speed: 5.0, spacing: 45, detach: true, Ls: 22, maxLen: 5500, base: 5000000, perM: 2600 }),
  gondel10: T({ name: '10er-Gondelbahn', kind: 'gondola', seats: 10, gauge: 6.6, hs: 5.6, hanger: 1.7, cab: [2.6, 2.1, 2.3], clear: 8.5, towerH: 15, towerMax: 40, minSpan: 40, maxSpan: 450, speed: 6.0, spacing: 62, detach: true, Ls: 26, maxLen: 7000, base: 7500000, perM: 3400 }),
  gondel8:  T({ name: '8er-Gondelbahn', kind: 'gondola', seats: 8, gauge: 6.2, hs: 5.3, hanger: 1.6, cab: [2.3, 2.0, 2.15], clear: 8.0, towerH: 14, towerMax: 38, minSpan: 40, maxSpan: 420, speed: 6.0, spacing: 55, detach: true, Ls: 24, maxLen: 6000, base: 6000000, perM: 3000 }),
  kombi:    T({ name: 'Kombibahn (Sessel + Gondeln)', kind: 'kombi', seats: 6, gseats: 8, bubble: true, gauge: 6.4, hs: 5.3, hanger: 4.3, ghanger: 1.6, cab: [2.3, 2.0, 2.15], clear: 8.0, towerH: 12, towerMax: 32, minSpan: 30, maxSpan: 300, speed: 6.0, spacing: 32, detach: true, Ls: 24, maxLen: 3800, base: 5500000, perM: 2600 }),
  funitel:  T({ name: 'Funitel', kind: 'gondola', funitel: true, seats: 24, gauge: 10.5, hs: 5.8, hanger: 1.35, cab: [3.9, 2.9, 2.4], clear: 9, towerH: 16, towerMax: 45, minSpan: 50, maxSpan: 500, speed: 6.0, spacing: 85, detach: true, Ls: 30, maxLen: 4500, base: 9000000, perM: 4000 }),
  dreis:    T({ name: '3S-Bahn (Dreiseil)', kind: 'gondola', threeS: true, seats: 32, gauge: 9, hs: 6.8, hanger: 3.0, cab: [4.2, 2.8, 2.7], clear: 14, towerH: 30, towerMax: 95, minSpan: 120, maxSpan: 1800, speed: 7.5, spacing: 190, detach: true, Ls: 34, maxLen: 7000, base: 20000000, perM: 6000, sag: 0.02, towerStyle: 'tram', brand: 'busserventa' }),
  tram1:    T({ name: 'Luftseilbahn mit 1 Kabine', kind: 'tram', single: true, seats: 80, gauge: 2, hs: 9, clear: 18, towerH: 30, towerMax: 90, minSpan: 150, maxSpan: 2200, speed: 10, spacing: 1, detach: false, Ls: 18, maxLen: 6000, base: 9000000, perM: 3500, sag: 0.035, towerStyle: 'tram', brand: 'busserventa' }),
  tram:     T({ name: 'Luftseilbahn (Pendelbahn)', kind: 'tram', seats: 100, gauge: 11, hs: 9, clear: 18, towerH: 30, towerMax: 90, minSpan: 150, maxSpan: 2200, speed: 10, spacing: 1, detach: false, Ls: 22, maxLen: 7000, base: 14000000, perM: 5000, sag: 0.035, towerStyle: 'tram', brand: 'busserventa' }),
  puls:     T({ name: 'Gruppenumlaufbahn (Pulsbahn)', kind: 'gondola', pulsed: true, group: 5, groups: 4, seats: 6, gauge: 5.4, hs: 5.0, hanger: 1.5, cab: [1.9, 1.8, 2.0], clear: 7.5, towerH: 12, towerMax: 32, minSpan: 40, maxSpan: 350, speed: 6.0, spacing: 45, detach: false, Ls: 20, maxLen: 3500, base: 3500000, perM: 2000 }),
  zweis:    T({ name: '2S-Bahn (Zweiseil-Umlaufbahn)', kind: 'gondola', threeS: true, twoS: true, seats: 16, gauge: 7.6, hs: 6.2, hanger: 2.6, cab: [3.3, 2.4, 2.45], clear: 12, towerH: 24, towerMax: 75, minSpan: 80, maxSpan: 1100, speed: 6.5, spacing: 130, detach: true, Ls: 30, maxLen: 5000, base: 12000000, perM: 4300, sag: 0.022, towerStyle: 'tram', brand: 'busserventa' }),
  funifor:  T({ name: 'Funifor', kind: 'tram', funifor: true, cradle: true, trackOff: 2.4, seats: 100, gauge: 11.5, hs: 6.2, clear: 18, towerH: 30, towerMax: 90, minSpan: 150, maxSpan: 2200, speed: 12, spacing: 1, detach: false, Ls: 24, maxLen: 7000, base: 16000000, perM: 5500, sag: 0.03, towerStyle: 'tram', brand: 'busserventa' }),
  twinliner:T({ name: 'Doppelstock-Pendelbahn (Twinliner)', kind: 'tram', decks: 2, seats: 180, gauge: 12, hs: 13.2, clear: 18, towerH: 32, towerMax: 90, minSpan: 150, maxSpan: 2200, speed: 10, spacing: 1, detach: false, Ls: 26, maxLen: 6000, base: 18000000, perM: 6000, sag: 0.035, towerStyle: 'tram', brand: 'busserventa' }),
  cabrio:   T({ name: 'CabriO-Bahn (offenes Oberdeck)', kind: 'tram', cabrio: true, cradle: true, decks: 2, trackOff: 2.85, seats: 60, gauge: 12.5, hs: 4.7, clear: 16, towerH: 26, towerMax: 70, minSpan: 150, maxSpan: 2200, speed: 8, spacing: 1, detach: false, Ls: 24, maxLen: 5000, base: 15000000, perM: 5500, sag: 0.03, towerStyle: 'tram', brand: 'busserventa' }),
  standseil:T({ name: 'Standseilbahn', kind: 'funicular', seats: 120, gauge: 4.4, hs: 0.5, clear: 0, towerH: 0, towerMax: 0, minSpan: 0, maxSpan: 0, speed: 10, spacing: 1, detach: false, Ls: 20, maxLen: 4000, base: 12000000, perM: 7000, brand: 'busserventa' }),
};

// gondolas with a mid-station: built with three taps (valley, mid, top); the line may bend at the
// mid-station like a real angle station (cabins detach and run on a curved rail, up to 90 degrees)
for (const k of ['gondel6', 'gondel8', 'gondel10']) LIFT_TYPES[k + 'm'] = { ...LIFT_TYPES[k], name: LIFT_TYPES[k].name + ' mit Mittelstation', midSt: true };
// largest bend at a line tower (canted sheaves + deflection rollers); 0 = no bends possible
// mast styles for normal towers (chairs, gondolas, drag lifts) and for aerial tramway / 3S towers
// colours of the station machinery by manufacturer (dark blue + yellow sheaves like in real terminals)
export const MACHINE = {
  dreifachmayr: { mach: 0x2e3a8c, sheave: 0xf2c200, hub: 0x3d5bd9, frame: 0xd4d7da },
  leiter: { mach: 0x7e858c, sheave: 0xd2232a, hub: 0xd2232a, frame: 0x5f656b },
  busserventa: { mach: 0x9a1d22, sheave: 0xf2c200, hub: 0x2b2f33, frame: 0xb9bdc1 },
};
let _guard = null;
function guardMat() {
  if (_guard) return _guard;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(0, 0, 32, 32);
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(30, 8);
  return (_guard = new THREE.MeshLambertMaterial({ color: 0xc9ced3, map: tx, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
}
export const TRAM_STATION_STYLES = {
  glas: { name: 'Glas-Station', hint: 'Moderner Glaskasten mit dunklem Rahmen und flachem Dach' },
  stahl: { name: 'Offene Stahlstation', hint: 'Verzinkter Stahl, grosse Seilbögen, rotes Seilrad oben, Treppen' },
  fels: { name: 'Felsstation', hint: 'In den Fels gebaut, Panoramafenster und Aussichtsterrasse' },
  holz: { name: 'Chalet-Station', hint: 'Steinsockel, Holzwände, steiles Satteldach' },
  beton: { name: 'Betonhalle (klassisch)', hint: 'Die bisherige runde Betonhalle mit Glasband' },
};
export const TOWER_STYLES = {
  rohr: { name: 'Rohrmast', hint: 'Runder Stahlrohrmast – der Klassiker' },
  kasten: { name: 'Kastenmast', hint: 'Eckiger Vierkant-Stahlmast' },
  gitter: { name: 'Gittermast', hint: 'Stahl-Fachwerk für hohe Stützen' },
  portal: { name: 'Portalstütze', hint: 'Zwei Beine – die Piste geht unten durch' },
  ystuetze: { name: 'Y-Stütze', hint: 'Ein Rohr, oben in zwei Arme gegabelt' },
  zwilling: { name: 'Doppelrohr', hint: 'Zwei Rohre nebeneinander' },
  holz: { name: 'Holzmast', hint: 'Alter Holzmast wie bei ganz alten Liften' },
  bock: { name: 'Bockstütze', hint: 'Zwei Rohrbeine in Fahrtrichtung gespreizt (A-Form), sehr standfest am steilen Hang' },
};
export const TRAM_TOWER_STYLES = {
  turm: { name: 'Gitterturm', hint: 'Hoher verzinkter Gitterturm mit breitem Fachwerk-Kopf, Leiter und Zwischenplattform (wie am Titlis)' },
  agitter: { name: 'A-Gitterstütze', hint: 'Klassische Fachwerkstütze in A-Form' },
  rohrfach: { name: 'Rohr-Fachwerk', hint: 'Moderne Stütze aus dicken Stahlrohren' },
  beton: { name: 'Betonstütze', hint: 'Zwei Betonpfeiler mit Querriegel' },
  portalr: { name: 'Rohr-Portal', hint: 'Zwei schräge Rohrbeine, schlank und modern' },
};
// rope layout across one track of an aerial tramway: [lateral offset, height offset, radius]
export function tramRopes(t) {
  const to = t.trackOff || 0.7;
  const r = [[-to, 0.05, 0.045], [to, 0.05, 0.045]];
  if (t.cabrio) r.push([-to, -0.7, 0.03], [to, -0.7, 0.03]); // haul ropes on both sides of the cabin
  else if (t.funifor) r.push([-to + 0.55, -0.45, 0.03], [to - 0.55, -0.45, 0.03]); // two haul ropes inside
  else r.push([0, -1.25, 0.03]);
  if (t.single) r.push([0.35, -2.3, 0.03]);
  return r;
}
// track rope offsets (rope shoes on the towers)
export const trackOffs = (t) => t.twoS ? [0] : t.threeS ? [-0.8, 0.8] : [-(t.trackOff || 0.7), t.trackOff || 0.7];
export function kinkMax(t) { if (!t || t.kind === 'tram' || t.kind === 'funicular' || t.kind === 'carpet' || t.funitel || t.threeS) return 0; return t.kind === 'tbar' || t.kind === 'platter' ? 15 : 8; }
export const MID_ANGLE_MAX = 90;
// drag lifts: bends over kinkMax (up to 90 degrees) run around big horizontal deflection bullwheels
export function kinkMaxBig(t) { return t && (t.kind === 'tbar' || t.kind === 'platter') ? 90 : kinkMax(t); }
const BIG_R = 1.4; // radius of the deflection bullwheels
// bend angle (degrees, unsigned) at p1 of the path p0 -> p1 -> p2
export function bendAngle(p0, p1, p2) {
  const ax = p1.x - p0.x, az = p1.z - p0.z, bx = p2.x - p1.x, bz = p2.z - p1.z;
  return Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)) * 180 / Math.PI;
}

// station designs for detachable lifts (chosen when building; 'auto' = by manufacturer)
export const STATION_STYLES = {
  dline: { name: 'Rund mit Glasband', hint: 'wie Doppelmayr D-Line' },
  symphony: { name: 'Kantig mit Glas', hint: 'wie Leitner Symphony' },
  bogen: { name: 'Bogendach', hint: 'klassisches Tonnendach mit Streifen' },
  box: { name: 'Glaskasten', hint: 'flaches Dach, rundum Glas' },
  porsche: { name: 'Design-Flügel', hint: 'geschwungenes Dach wie Bartholet / Porsche Design' },
  giebel: { name: 'Giebeldach', hint: 'alte Schweizer Station mit Holzdach' },
  keil: { name: 'Keil', hint: 'schräges Pultdach wie Poma Alpha' },
  holz: { name: 'Holzfassade', hint: 'moderne Station mit Holzlamellen' },
  offen: { name: 'Offenes Stahldach', hint: 'nur Dach auf Stahlträgern' },
  beton: { name: '70er-Beton', hint: 'massiver Beton mit Fensterband' },
  welle: { name: 'Wellendach', hint: 'Dach in Wellenform' },
  glas: { name: 'Glaspavillon', hint: 'hoch, rund, ganz aus Glas' },
  geschlossen: { name: 'Geschlossen, Flachdach', hint: 'ganz geschlossene Halle, die Kabinen fahren durch eine Öffnung' },
  bogen_zu: { name: 'Geschlossen, Bogendach', hint: 'geschlossene Halle mit blauem Tonnendach' },
};
// geometry helpers for the station designs (local frame: x along the line, y up, z across)
function archGeo(R, th, len, a0 = 0, a1 = Math.PI) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, R, a0, a1, false); sh.absarc(0, 0, R - th, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 24 });
  g.rotateY(Math.PI / 2); if (g.attributes.uv) g.deleteAttribute('uv');
  return g; // spans x 0..len, arch in the z-y plane (z = -shape x)
}
function profileGeo(pts, width) {
  const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -width / 2); if (g.attributes.uv) g.deleteAttribute('uv');
  return g; // profile in the x-y plane, extruded across z
}
function crossProfileGeo(pts, len) {
  const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  g.rotateY(Math.PI / 2); if (g.attributes.uv) g.deleteAttribute('uv');
  return g; // profile in the z-y plane (z = -shape x), extruded along x 0..len
}

const PORTAL_SHAPE = (() => { const sh = new THREE.Shape(); sh.moveTo(-5, -0.5); sh.lineTo(5, -0.5); sh.lineTo(5, 8.5); sh.lineTo(-5, 8.5); sh.lineTo(-5, -0.5); const h = new THREE.Path(); h.moveTo(-3.6, -0.5); h.lineTo(3.6, -0.5); h.lineTo(3.6, 3.6); h.absarc(0, 3.6, 3.6, 0, Math.PI, false); h.lineTo(-3.6, -0.5); sh.holes.push(h); return sh; })();
const NO_TOWERS = (t) => t.kind === 'carpet' || t.kind === 'funicular';
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _rm = new THREE.Matrix4();
const matCache = {};
const SNOWM = new THREE.MeshLambertMaterial({ color: 0xf4f7fb, side: THREE.DoubleSide });
const PADM = new THREE.MeshLambertMaterial({ color: 0xd8262c });
const PADW = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial({ color: hex, ...opts });
  return matCache[key];
}

// matrix for a unit (radius 0.5, height 1) cylinder from a to b with radius r
const _seg = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q2 = new THREE.Quaternion();
function segM(a, b, r) {
  _seg.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _seg.length() || 0.001;
  _q2.setFromUnitVectors(_up, _seg.clone().divideScalar(L));
  return new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q2, new THREE.Vector3(r * 2, L, r * 2));
}
// rope grip (origin = rope centre): jaws around the rope, body above; detachable grips have rollers + lever
function gripParts(push, detach, scale = 1) {
  const S = (x) => x * scale;
  push(rbox(S(0.46), S(0.16), S(0.17), S(0.06), 1), M(0, 0.0, 0));
  push(rbox(S(detach ? 0.78 : 0.4), S(0.2), S(0.24), S(0.07), 1), M(0, S(0.15), 0));
  for (const x of [-0.13, 0.13]) push(CYL, M(S(x), S(0.02), S(0.11), 0, S(0.07), S(0.05), S(0.07), Math.PI / 2));
  if (detach) {
    // carriage: running wheels on top (they roll on the station rail), friction plates on both sides
    // (the tyre conveyor pushes them), opening lever with its roller at the front
    push(rbox(S(0.95), S(0.12), S(0.26), S(0.04), 1), M(0, S(0.3), 0));
    for (const x of [-0.34, 0.34]) {
      push(rbox(S(0.08), S(0.26), S(0.2), S(0.02), 1), M(S(x), S(0.43), 0));
      push(CYL, M(S(x), S(0.55), 0, 0, S(0.24), S(0.1), S(0.24), Math.PI / 2));
    }
    for (const z of [-0.17, 0.17]) push(rbox(S(0.9), S(0.16), S(0.03), S(0.01), 1), M(0, S(0.24), S(z)));
    push(rbox(S(0.36), S(0.05), S(0.07), S(0.02), 1), M(S(0.44), S(0.12), S(-0.1), 0, 1, 1, 1, 0, 0.5));
    push(CYL, M(S(0.6), S(0.2), S(-0.1), 0, S(0.1), S(0.06), S(0.1), Math.PI / 2));
    for (const x of [-0.28, 0.28]) push(CYL, M(S(x), S(0.1), S(-0.16), 0, S(0.16), S(0.06), S(0.16), Math.PI / 2));
  }
}

// stack of rounded-rectangle rings (y, half length a, half width b, corner radius r) -> smooth shell
function ringStack(rings, m = 4, capBottom = false, capTop = false) {
  const pos = [], idx = [];
  const ring = (q) => {
    const pts = [], r = Math.max(0.01, Math.min(q.r, q.a, q.b));
    const cs = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
    for (const [sx, sz, a0] of cs) for (let k = 0; k <= m; k++) { const an = a0 + k / m * Math.PI / 2; pts.push([sx * (q.a - r) + Math.cos(an) * r, q.y, sz * (q.b - r) + Math.sin(an) * r]); }
    return pts;
  };
  const N = 4 * (m + 1);
  rings.forEach((q) => { for (const p of ring(q)) pos.push(...p); });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < N; k++) {
    const a = i * N + k, b = i * N + (k + 1) % N, c = (i + 1) * N + k, d = (i + 1) * N + (k + 1) % N;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (i, up) => { const q = rings[i], ci = pos.length / 3; pos.push(0, q.y, 0); for (let k = 0; k < N; k++) { const a = i * N + k, b = i * N + (k + 1) % N; if (up) idx.push(ci, b, a); else idx.push(ci, a, b); } };
  if (capBottom) cap(0, false);
  if (capTop) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const _Z = new THREE.Vector3(0, 0, 1), _pq = new THREE.Quaternion(), _mg = new THREE.Matrix4();
class Builder {
  constructor() { this.parts = new Map(); }
  add(material, geo, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.attributes.uv && !material.map) g.deleteAttribute('uv');
    if (matrix) g.applyMatrix4(matrix);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
  }
  build(group) {
    for (const [m, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list), m);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      list.forEach((g) => g.dispose());
    }
  }
}

const M = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

// rope as a thin round mesh (a 1-pixel line looked like a thread). pts: Vector3[], r: radius
const ROPE_MAT = new THREE.MeshLambertMaterial({ color: 0x1e1f21 });
export function ropeMesh(pts, r = 0.035, mat = ROPE_MAT, sides = 6) {
  const n = pts.length; if (n < 2) return new THREE.Group();
  const pos = new Float32Array(n * sides * 3), nor = new Float32Array(n * sides * 3), idx = [];
  const T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    T.subVectors(b, a); if (T.lengthSq() < 1e-9) T.set(1, 0, 0); T.normalize();
    U.crossVectors(T, up); if (U.lengthSq() < 1e-6) U.set(0, 0, 1); U.normalize();
    V.crossVectors(U, T).normalize();
    for (let k = 0; k < sides; k++) {
      const an = k / sides * Math.PI * 2, c = Math.cos(an), sn = Math.sin(an), o = (i * sides + k) * 3;
      const nx = U.x * c + V.x * sn, ny = U.y * c + V.y * sn, nz = U.z * c + V.z * sn;
      pos[o] = pts[i].x + nx * r; pos[o + 1] = pts[i].y + ny * r; pos[o + 2] = pts[i].z + nz * r;
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
    }
    if (i < n - 1) for (let k = 0; k < sides; k++) {
      const a0 = i * sides + k, a1 = i * sides + (k + 1) % sides, b0 = a0 + sides, b1 = a1 + sides;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(n * sides > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  const m = new THREE.Mesh(g, mat); m.castShadow = false; m.frustumCulled = true;
  return m;
}
const FUNI_OFF = 1.65; // funitel: half the distance between the two haul ropes of one line
const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 1, 22); // sheaves: round enough to read as wheels up close
const CYL4 = new THREE.CylinderGeometry(0.5, 0.5, 1, 4).rotateY(Math.PI / 4);

function signTexture(text, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#' + bg.toString(16).padStart(6, '0'); x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#fff'; x.fillRect(8, 8, 496, 4); x.fillRect(8, 116, 496, 4);
  x.font = 'bold 54px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let t = text; while (x.measureText(t).width > 480 && t.length > 3) t = t.slice(0, -2) + '…';
  x.fillText(t, 256, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let nextId = 1;

export class Lift {
  static winter = true;
  static padsOn = true;      // mast pads on towers standing in pistes (global switch)
  static pisteAt = null;     // (x, z) => piste colour or 0, set by the game
  constructor(world, scene, typeKey, brandKey, A, B, opts = {}) {
    this.id = opts.id || nextId++;
    if (opts.id) nextId = Math.max(nextId, opts.id + 1);
    this.world = world; this.scene = scene;
    this.typeKey = typeKey; this.brandKey = brandKey;
    // interior bend points of the line: k = 't' (bend at a tower) or 'm' (angle mid-station)
    let K = Array.isArray(opts.pts) ? opts.pts.map((q) => ({ x: q.x, z: q.z, k: q.k === 'm' ? 'm' : 't' })) : [];
    if (heightAt(world, A.x, A.z) > heightAt(world, B.x, B.z)) { [A, B] = [B, A]; K = K.reverse(); }
    this.A = { x: A.x, z: A.z }; this.B = { x: B.x, z: B.z };
    this.K = K;
    this.autoTowers = opts.autoTowers ?? true;
    this.running = opts.running ?? true;
    this.speedF = opts.speedF ?? 1;
    this.densF = opts.densF ?? 1;
    this.color = opts.color ?? null;
    this.name = opts.name || '';
    this.cover = opts.cover ?? true;
    this.lean = opts.lean ?? true;
    this.nightLift = opts.nightLift || 'auto'; // night skiing: auto (lit) | on | off
    // season of operation: winter | summer | all. Drag lifts and carpets are winter-only by default
    this.op = opts.op || (['tbar', 'platter', 'carpet'].includes(LIFT_TYPES[typeKey]?.kind) ? 'winter' : 'all');
    this.twDef = opts.twDef || null; // settings of the last edited tower: used for new towers
    this.queue = opts.queue || 'back';
    this.stStyle = opts.stStyle || 'auto'; // station design (detachable lifts)
    this.twStyleAll = opts.twStyleAll || 'auto'; // tower style for all towers without their own
    this.cable = !!opts.cable; // power / signal cable carried on top of the towers
    this.garStyle = opts.garStyle || (opts.id ? 'daneben' : 'unter'); // carrier garage: beside the station or a hall under it (ramp) // queue lanes at the valley station: back | front | left | right
    this.mid = opts.mid ? { d: opts.mid } : null; // mid-station (gondolas): cabins slow down and pass through
    { const vi = this.K.findIndex((q) => q.k === 'm'); if (vi >= 0) this.mid = { d: 0, v: vi }; }
    this.trackPts = Array.isArray(opts.trackPts) ? opts.trackPts.map((p) => ({ d: p.d, h: p.h })) : []; // funicular: track points (h = height over ground, negative = tunnel)
    this.time = Math.random() * 100;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.computeGeometry();
    if (opts.towers) this.towers = opts.towers.map((t) => ({ d: t.d, h: t.h, roll: t.roll || 'auto', tilt: t.tilt ?? null, ...(t.style ? { style: t.style } : {}), ...(t.kink ? { kink: true } : {}), ...(t.pad ? { pad: t.pad } : {}) }));
    else this.autoPlaceTowers();
    this.rebuild();
  }

  get type() { return LIFT_TYPES[this.typeKey]; }
  get brand() { return BRANDS[this.brandKey]; }
  get speed() { return this.type.speed * this.speedF; }
  get spacing() { return this.type.spacing * this.densF; }
  get displayName() { return this.name || this.type.name; }

  computeGeometry() {
    // the line is a polyline A -> bend points -> B, measured by the distance d along it
    const P = [this.A, ...(this.K || []), this.B];
    this.P = P; this.D = [0]; this.segDir = [];
    for (let i = 0; i < P.length - 1; i++) {
      const dx = P[i + 1].x - P[i].x, dz = P[i + 1].z - P[i].z, l = Math.hypot(dx, dz) || 1e-6;
      this.segDir.push({ x: dx / l, z: dz / l });
      this.D.push(this.D[i] + l);
    }
    this.L = this.D[this.D.length - 1];
    this.dir = this.segDir[0];
    this.right = { x: -this.dir.z, z: this.dir.x };
    this.dirB = this.segDir[this.segDir.length - 1];
    this.rightB = { x: -this.dirB.z, z: this.dirB.x };
    // bends: distance, signed angle (rad, + = turning towards 'right'), bisector direction
    this.kinks = (this.K || []).map((q, j) => {
      const a = this.segDir[j], b = this.segDir[j + 1];
      const ang = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
      let bx = a.x + b.x, bz = a.z + b.z; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      const big = q.k === 't' && Math.abs(ang) * 180 / Math.PI > kinkMax(this.type) + 0.01;
      const hv = big ? clamp(BIG_R * Math.tan(Math.abs(ang) / 2), 0.4, 4) : 0;
      return { d: this.D[j + 1], ang, k: q.k, i: j + 1, bis: { x: bx, z: bz }, big, hv };
    });
    if (this.mid && this.mid.v != null) { const kk = this.kinks[this.mid.v]; if (kk) this.mid.d = kk.d; else this.mid = null; }
    this.gA = heightAt(this.world, this.A.x, this.A.z);
    this.gB = heightAt(this.world, this.B.x, this.B.z);
  }
  segIndex(d) { const D = this.D; let i = 0; while (i < D.length - 2 && d > D[i + 1]) i++; return i; }
  dirAt(d) { return this.segDir[this.segIndex(d)]; }
  rightAt(d) { const u = this.dirAt(d); return { x: -u.z, z: u.x }; }
  kinkAt(d, tol = 0.05) { for (const k of this.kinks || []) if (Math.abs(k.d - d) < tol) return k; return null; }
  // point beside the line (off > 0: to the right of the travel direction). At a bend the two offset
  // lines meet in a mitre; through an angle station the carriers follow a smooth curved rail.
  offsetAt(d, off) {
    const M2 = this.mid && this.mid.v != null ? this.midRange() : null;
    if (M2 && d > M2[0] && d < M2[1]) {
      const p0 = this.offsetLin(M2[0], off), p2 = this.offsetLin(M2[1], off), p1 = this.offsetLin(this.mid.d, off);
      const u = (d - M2[0]) / (M2[1] - M2[0]), w = 1 - u;
      return { x: w * w * p0.x + 2 * w * u * p1.x + u * u * p2.x, z: w * w * p0.z + 2 * w * u * p1.z + u * u * p2.z };
    }
    for (const k of this.kinks || []) if (k.big && Math.abs(d - k.d) < k.hv) {
      const p0 = this.offsetLin(k.d - k.hv, off), p2 = this.offsetLin(k.d + k.hv, off), p1 = this.offsetLin(k.d, off);
      const u = (d - k.d + k.hv) / (2 * k.hv), w = 1 - u;
      return { x: w * w * p0.x + 2 * w * u * p1.x + u * u * p2.x, z: w * w * p0.z + 2 * w * u * p1.z + u * u * p2.z };
    }
    return this.offsetLin(d, off);
  }
  offsetLin(d, off) {
    const k = this.kinkAt(d);
    if (k) {
      const a = this.segDir[k.i - 1], b = this.segDir[k.i];
      let nx = -a.z - b.z, nz = a.x + b.x; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const sc = off / Math.max(0.3, nx * -a.z + nz * a.x);
      return { x: this.P[k.i].x + nx * sc, z: this.P[k.i].z + nz * sc };
    }
    const p = this.pointAt(d), r = this.rightAt(d);
    return { x: p.x + r.x * off, z: p.z + r.z * off };
  }

  // funicular: track height function from the user's track points (null = automatic)
  trackProfile() {
    const pts = (this.trackPts || []).filter((p) => p.d > 8 && p.d < this.L - 8).sort((a, b) => a.d - b.d);
    if (!pts.length) return null;
    const ctrl = [{ d: 0, y: this.ground(0) + 0.6 }, ...pts.map((p) => ({ d: p.d, y: this.ground(p.d) + p.h })), { d: this.L, y: this.ground(this.L) + 0.6 }];
    return (d) => {
      let k = 0; while (k < ctrl.length - 2 && ctrl[k + 1].d < d) k++;
      const a = ctrl[k], b = ctrl[k + 1], t = clamp((d - a.d) / Math.max(0.01, b.d - a.d), 0, 1);
      return a.y + (b.y - a.y) * t;
    };
  }
  trackYAt(d) { const tr = this.track; if (!tr || !tr.length) return this.ground(d) + 0.6; let k = 0; while (k < tr.length - 2 && tr[k + 1].d < d) k++; const a = tr[k], b = tr[k + 1] || a; const t = clamp((d - a.d) / Math.max(0.01, b.d - a.d), 0, 1); return a.y + (b.y - a.y) * t; }
  addTrackPt(d) {
    d = clamp(d, 12, this.L - 12);
    if (this.trackPts.some((p) => Math.abs(p.d - d) < 10)) return -1;
    const h = this.trackYAt(d) - this.ground(d);
    this.trackPts.push({ d, h: Math.round(h * 2) / 2 });
    this.trackPts.sort((a, b) => a.d - b.d);
    this.rebuild();
    return this.trackPts.findIndex((p) => p.d === d);
  }
  ground(d) { const p = this.pointAt(d); return heightAt(this.world, p.x, p.z); }
  pointAt(d) {
    if (!this.D || this.D.length <= 2) return { x: this.A.x + this.dir.x * d, z: this.A.z + this.dir.z * d };
    const i = this.segIndex(d), u = this.segDir[i], P = this.P[i], e = d - this.D[i];
    return { x: P.x + u.x * e, z: P.z + u.z * e };
  }

  // a tower leaned by hand pivots on its foundation: the foot stays at tw.d, the top (with the
  // sheave trains and the rope) moves along the line
  twTopD(tw) { return tw && tw.tilt != null && tw.tilt !== 0 ? tw.d + Math.tan(clamp(tw.tilt, -30, 30) * Math.PI / 180) * tw.h : tw ? tw.d : 0; }
  supports() {
    const t = this.type;
    const yA = this.gA + t.hs, yB = this.gB + t.hs;
    const s = [{ d: 0, y: yA, st: true }, { d: t.Ls, y: yA, st: true }];
    this.towers.forEach((tw, i) => s.push({ d: this.twTopD(tw), y: this.ground(tw.d) + tw.h, tw: i }));
    const M2 = this.midRange();
    if (M2) { const ym = this.ground(this.mid.d) + t.hs; s.push({ d: M2[0], y: ym, st: true, mid: true }, { d: M2[1], y: ym, st: true, mid: true }); }
    s.push({ d: this.L - t.Ls, y: yB, st: true }, { d: this.L, y: yB, st: true });
    s.sort((a, b) => a.d - b.d);
    return s;
  }

  // mid-station range along the line (null if none / not possible)
  midRange() {
    const t = this.type;
    if (!this.mid || t.kind !== 'gondola' || t.funitel || t.threeS) return null;
    if (this.mid.v != null) {
      const k = this.kinks && this.kinks[this.mid.v]; if (!k) return null;
      const hv = t.Ls / 2 + 2 + Math.abs(k.ang) * 7;
      return [this.mid.d - hv, this.mid.d + hv];
    }
    const half = t.Ls / 2 + 2;
    this.mid.d = clamp(this.mid.d, t.Ls + half + 30, this.L - t.Ls - half - 30);
    if (this.L < 2 * t.Ls + 2 * half + 60) return null;
    return [this.mid.d - half, this.mid.d + half];
  }
  setMid(on, d) {
    this.mid = on ? { d: d ?? (this.mid ? this.mid.d : this.L / 2) } : null;
    if (this.autoTowers) this.autoPlaceTowers();
    else { const M2 = this.midRange(); if (M2) this.towers = this.towers.filter((tw) => tw.d < M2[0] - 10 || tw.d > M2[1] + 10); }
    this.rebuild();
  }

  sagAt(span, u) { return span * (this.type.sag || 0.012) * 4 * u * (1 - u); }

  spanClearance(a, b) {
    const t = this.type;
    let minC = Infinity, maxC = -Infinity;
    const span = b.d - a.d;
    const skipA = a.st ? 14 : 2, skipB = b.st ? 14 : 1;
    for (let d = a.d + skipA; d < b.d - skipB; d += 4) {
      const u = (d - a.d) / span;
      const y = lerp(a.y, b.y, u) - this.sagAt(span, u);
      let gr = this.ground(d);
      if (this.world.obstacleAt) { const q = this.pointAt(d); const ob = this.world.obstacleAt(q.x, q.z, t.gauge / 2 + 2); if (ob > gr) gr = ob; }
      const c = y - gr;
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
    return { minC, maxC, ok: minC >= t.clear && (!t.maxClear || maxC <= t.maxClear) };
  }

  autoPlaceTowers() {
    const t = this.type;
    this.towers = [];
    if (NO_TOWERS(t)) return;
    const towers = [];
    this.towers = towers;
    const M2 = this.midRange();
    const sections = M2 ? [[{ d: t.Ls, y: this.gA + t.hs }, { d: M2[0], y: this.ground(this.mid.d) + t.hs }], [{ d: M2[1], y: this.ground(this.mid.d) + t.hs }, { d: this.L - t.Ls, y: this.gB + t.hs }]] : [[{ d: t.Ls, y: this.gA + t.hs }, { d: this.L - t.Ls, y: this.gB + t.hs }]];
    // a bend on the line always sits on a tower (with deflection rollers): split the sections there
    const bends = (this.kinks || []).filter((k) => k.k === 't');
    const split = [];
    for (const [start, end] of sections) {
      let cur = start;
      for (const k of bends) if (k.d > start.d && k.d < end.d) {
        const h = t.towerH + 2, kt = { d: k.d, y: this.ground(k.d) + h };
        split.push([cur, kt, { d: k.d, h, kink: true }]); cur = kt;
      }
      split.push([cur, end, null]);
    }
    for (const [start, end, fixed] of split) { this.placeSection(start, end, towers); if (fixed) towers.push({ ...fixed, roll: 'auto', tilt: null }); }
    towers.sort((a, b) => a.d - b.d);
    this.optimizeHeights();
  }

  placeSection(start, end, towers) {
    const t = this.type;
    let cur = start, guard = 0;
    while (guard++ < 250) {
      if (end.d - cur.d <= t.maxSpan && this.spanClearance(cur, end).ok) break;
      let best = null;
      const dMax = Math.min(cur.d + t.maxSpan, end.d - 12);
      for (let h = t.towerH; h <= t.towerMax + 14 && !best; h += 1.5) {
        const dMin = cur.d + (h > t.towerMax ? 12 : t.minSpan);
        for (let d = dMax; d >= dMin; d -= 4) {
          if (this.spanClearance(cur, { d, y: this.ground(d) + h }).ok) { best = { d, h }; break; }
        }
      }
      if (!best) {
        const d = Math.min(cur.d + t.minSpan, end.d - 12);
        if (d <= cur.d + 1) break;
        best = { d, h: t.towerMax };
      }
      towers.push(best);
      cur = { d: best.d, y: this.ground(best.d) + best.h };
    }
  }

  optimizeHeights() {
    const t = this.type;
    const minH = t.kind === 'tbar' || t.kind === 'platter' ? 5 : t.towerStyle === 'tram' ? 15 : 7;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < this.towers.length; i++) {
        const tw = this.towers[i];
        while (tw.h - 0.5 >= minH) {
          tw.h -= 0.5;
          const s2 = this.supports();
          const k = s2.findIndex((q) => q.tw === i);
          if (!this.spanClearance(s2[k - 1], s2[k]).ok || !this.spanClearance(s2[k], s2[k + 1]).ok) { tw.h += 0.5; break; }
        }
      }
    }
    for (const tw of this.towers) tw.h = Math.round(tw.h * 2) / 2;
  }

  checkClearance() {
    const t = this.type;
    if (t.kind === 'carpet') {
      let maxG = 0;
      for (let d = 0; d < this.L - 2; d += 2) maxG = Math.max(maxG, Math.abs(this.ground(d + 2) - this.ground(d)) / 2);
      return { worst: 99, ok: maxG <= t.maxGrade, tooSteep: maxG > t.maxGrade, grade: maxG };
    }
    if (t.kind === 'funicular') return { worst: 99, ok: true };
    let station = false;
    if (this.world.obstacleAt) for (const [P, u] of [[this.A, this.dir], [this.B, this.dirB]]) for (let d = -t.Ls; d <= t.Ls; d += 4) {
      const ob = this.world.obstacleAt(P.x + u.x * d, P.z + u.z * d, t.gauge / 2 + 3);
      if (ob > heightAt(this.world, P.x, P.z) + 1) station = true;
    }
    const s = this.supports();
    let worst = Infinity, tooHigh = false;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].st && s[i + 1].st) continue;
      const c = this.spanClearance(s[i], s[i + 1]);
      worst = Math.min(worst, c.minC);
      if (t.maxClear && c.maxC > t.maxClear + 2) tooHigh = true;
    }
    return { worst, ok: worst >= t.clear - 0.5 && !tooHigh && !station, tooHigh, station };
  }

  // ======================================================= build
  rebuild() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material && c.userData.own) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
    }
    const t = this.type;
    const bld = new Builder();
    const yaw = -Math.atan2(this.dir.z, this.dir.x);
    this.towerPositions = [];
    this.towerModes = [];
    this.towerArcs = [];
    this.towerTilts = [];
    this.towerStyles = [];
    this.riderJ = this.riderR = null;
    this.ropeMesh = this.barMesh = null;
    this.snowB = new Builder();
    if (t.kind === 'carpet') this.buildCarpet(bld);
    else if (t.kind === 'funicular') this.buildFunicular(bld);
    else {
      const sup = this.supports();
      this.cablePts = [];
      this.towers.forEach((tw, i) => {
        const dT = this.twTopD(tw), p = this.pointAt(dT), g = this.ground(dT), top = this.ground(tw.d) + tw.h;
        const bi = sup.findIndex((q) => q.tw === i);
        const a = sup[bi - 1], b = sup[bi], c = sup[bi + 1];
        const bend = Math.atan2(c.y - b.y, c.d - b.d) - Math.atan2(b.y - a.y, b.d - a.d);
        this.towerPositions.push({ x: p.x, z: p.z, g, top });
        // a tower on a bend stands on the bisector and carries the ropes at the mitre points
        const kk = this.kinkAt(dT, 0.5), ud = kk ? kk.bis : this.dirAt(dT), ty = -Math.atan2(ud.z, ud.x);
        this._kink = kk; this._ks = kk ? 1 / Math.max(0.3, Math.cos(kk.ang / 2)) : 1;
        if (t.towerStyle === 'tram') this.buildTramTower(bld, p.x, g, p.z, top, ty, i, (b.y - a.y) / (b.d - a.d), (c.y - b.y) / (c.d - b.d));
        else if (kk && kk.big) { this.buildDeflectTower(bld, g, top, kk, i); this.towerModes[i] = 'support'; }
        else this.buildTower(bld, p.x, g, p.z, top, ty, bend, i, (b.y - a.y) / (b.d - a.d), (c.y - b.y) / (c.d - b.d));
        this._kink = null; this._ks = 1;
      });
      if (t.kind === 'tram' || t.threeS) {
        this.buildTramStation(bld, this.A, this.gA, this.dir, true);
        this.buildTramStation(bld, this.B, this.gB, { x: -this.dir.x, z: -this.dir.z }, false);
      } else {
        this.buildStation(bld, this.A, this.gA, this.dir, true);
        this.buildStation(bld, this.B, this.gB, { x: -this.dirB.x, z: -this.dirB.z }, false);
        if (this.midRange()) { if (this.mid.v != null) this.buildAngleStation(bld); else this.buildMidStation(bld); }
      }
      if (this.cable && this.cablePts.some(Boolean)) this.buildCable();
    }
    bld.build(this.group);
    if (this.snowB.parts.size) {
      const sg = new THREE.Group(); this.snowB.build(sg);
      sg.visible = Lift.winter !== false; this.snowGroup = sg; this.group.add(sg);
    } else this.snowGroup = null;
    this.addSigns();

    const lineMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
    if (t.kind === 'tram') {
      this.buildTramSides();
      // per track: two track ropes, the haul rope a bit lower in the middle (single cabin: plus the
      // return strand of the haul rope underneath)
      for (const side of this.sides) for (const [off, dy, rr] of tramRopes(t)) {
        const pts = side.pts.map((p) => new THREE.Vector3(p.x + this.right.x * off, p.y + dy, p.z + this.right.z * off));
        this.group.add(ropeMesh(pts, rr));
      }
      this.buildRopeRiders();
      this.buildTramCabins();
    } else if (t.kind === 'carpet' || t.kind === 'funicular') {
      // built above
    } else {
      this.buildLoop();
      // [lateral offset, height, radius]: 3S two track ropes + haul rope between and below,
      // 2S one track rope with the haul rope underneath
      const offs = t.funitel ? [[-FUNI_OFF, 0, 0.034], [FUNI_OFF, 0, 0.034]] : t.twoS ? [[0, 0, 0.05], [0, -0.45, 0.032]] : t.threeS ? [[-0.8, 0, 0.045], [0, -0.4, 0.034], [0.8, 0, 0.045]] : [[0, 0, t.kind === 'tbar' || t.kind === 'platter' ? 0.022 : 0.034]];
      for (const [off, dy, rr] of offs) {
        const pts = this.loop.map((p, i) => {
          // offsets perpendicular to travel direction
          const q = this.loop[(i + 1) % this.loop.length];
          let tx = q.x - p.x, tz = q.z - p.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
          return new THREE.Vector3(p.x - tz * off, p.y + 0.05 + dy, p.z + tx * off);
        });
        pts.push(pts[0].clone());
        this.group.add(ropeMesh(pts, rr));
      }
      this.buildCarriers();
      if (t.threeS) this.buildRopeRiders();
    }
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.35, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
    this.marker.userData.own = true;
    this.marker.visible = false;
    this.group.add(this.marker);
    this.group.traverse((o) => { o.userData.liftId = this.id; });
  }

  // realistic tubular towers: support (sheaves under the rope) or compression (sheaves above)
  buildTower(bld, x, g, z, top, yaw, bend, idx, s1 = 0, s2 = 0) {
    const t = this.type, br = this.brand;
    const big = t.kind === 'gondola' || t.kind === 'kombi';
    const small = t.kind === 'tbar' || t.kind === 'platter';
    const mMast = mat(br.mast), mDark = mat(0x2b2b2b), mAcc = mat(br.accent), mGrate = mat(0x6b7075), mAlu = mat(0xb9bec3);
    // how the rope runs: 'support' = over the sheaves, 'comp' = under the sheaves (held down),
    // 'both' = between an upper and a lower sheave train
    const tw = this.towers[idx] || {};
    let mode = tw.roll && tw.roll !== 'auto' ? tw.roll : (bend < -0.017 ? 'support' : bend > 0.017 ? 'comp' : 'both');
    this.towerModes[idx] = mode;
    const comp = mode !== 'support';
    const deg = Math.abs(bend) * 180 / Math.PI;
    const nW = small ? clamp(2 + 2 * Math.round(deg / 4), 2, 6) : clamp(4 + 2 * Math.round(deg / 3), 4, 16);
    // battery depth from the rope to the back of the main rocker; the yoke sits just behind it
    const wr = small ? 0.17 : 0.21, pitch = small ? 0.42 : 0.5;
    const extOf = (n) => 2 * wr + (n >= 8 ? 0.3 : 0.12) + 0.2 + 0.1;
    const yH = small ? 0.3 : 0.55;
    // funitel (like Val Thorens): a wide cross arm with a platform high ABOVE the ropes and carriages,
    // the sheave batteries hang from it on short hangers on the outside of each rope
    const FU = !!t.funitel, fuArm = FUNI_OFF + 0.3;
    const armY = FU ? top + extOf(nW) + 1.9 : comp ? top + extOf(nW) + 0.06 + yH / 2 : top - extOf(nW) - 0.06 - yH / 2;
    const mastTop = armY + 0.25;
    // mast: thicker for taller towers and clearly wider at the foot (real masts: ~0.6 m at the top,
    // ~1.3 m at the base); very tall towers become steel lattice towers (style auto / rohr / gitter)
    const tw0 = this.towers[idx] || {}, hgt = top - g;
    const want = tw0.style && tw0.style !== 'auto' ? tw0.style : this.twStyleAll && this.twStyleAll !== 'auto' ? this.twStyleAll : 'auto';
    const style = TOWER_STYLES[want] ? want : hgt > (small ? 15 : big ? 30 : 24) ? 'gitter' : 'rohr';
    this.towerStyles[idx] = style;
    const grow = 1 + clamp((hgt - 8) / 22, 0, 1.5) * 0.45;
    const rb = (big ? 0.8 : small ? 0.34 : 0.6) * grow, rt = (big ? 0.42 : small ? 0.2 : 0.32) * (1 + (grow - 1) * 0.4);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const round = br.style === 'round';
    // tilt (lean) of the mast along the line: the top stays at the rope, the base moves.
    // auto: lean partly towards the rope's resultant force (like real towers on steep slopes)
    const twd = this.towers[idx] || {};
    const autoTilt = this.lean ? clamp(Math.atan((s1 + s2) / 2) * 0.35, -0.3, 0.3) : 0;
    const th = twd.tilt == null ? autoTilt : clamp(twd.tilt, -30, 30) * Math.PI / 180;
    this.towerTilts[idx] = th;
    const sT = Math.sin(th), cT = Math.cos(th);
    let u = (mastTop - g) / cT;
    let gb = g;
    const dTop = this.twTopD(twd);
    for (let it = 0; it < 2; it++) { gb = this.ground(dTop - sT * u); u = (mastTop - gb) / cT; }
    const mastL = u + 1.5 / cT;
    const along = (uu) => [-sT * uu, mastTop - cT * uu]; // lx, y at distance uu below the top
    const [mlx, my] = along(mastL / 2);
    const [mcx, mcz] = L(mlx, 0);
    const ks = this._ks || 1, kink = this._kink;
    const lattice = style === 'gitter' || style === 'portal';
    const tubeLike = style === 'rohr' || style === 'kasten' || style === 'holz' || style === 'ystuetze' || style === 'zwilling';
    const concrete = mat(0x9b9b96);
    // helpers in the tower frame: uu = distance below the mast top along the (tilted) axis, a = along the line, b = across
    const Pt = (uu, a, b) => { const [alx, ay] = along(uu); const [px, pz] = L(alx + cT * a, b); return new THREE.Vector3(px, ay - sT * a, pz); };
    const beamG = (geo, mm, A, B, r) => { const d = B.clone().sub(A), len = d.length(); if (len < 0.01) return; bld.add(mm, geo, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(r, len, r))); };
    const beam = (A, B, r) => beamG(BOX, mMast, A, B, r);
    const tube = (A, B, r, mm = mMast) => beamG(CYL, mm, A, B, r);
    const [bxA, byA] = along(u); void byA;
    const footAt = (q, w) => bld.add(concrete, rbox(w, 1.2, w, w * 0.2), M(q.x, this.ground(dTop + (q.x - x) * c - (q.z - z) * s) - 0.15, q.z, yaw));
    void bxA;
    if (style === 'rohr' || style === 'kasten') {
      const mastGeo = style === 'kasten' ? new THREE.CylinderGeometry(rt * 1.25, rb * 1.3, 1, 4).rotateY(Math.PI / 4) : round ? new THREE.CylinderGeometry(rt, rb, 1, 16) : new THREE.CylinderGeometry(rt * 1.1, rb * 1.15, 1, 8).rotateY(Math.PI / 8);
      bld.add(mMast, mastGeo, M(mcx, my, mcz, yaw, 1, mastL, 1, 0, -th));
    } else if (style === 'holz') {
      // old wooden pole (early T-bars / chairs): brown, slightly thinner, iron bands
      const wood = mat(0x6e4b2c), wr0 = rb * 0.75, wr1 = rt * 0.85;
      bld.add(wood, new THREE.CylinderGeometry(wr1, wr0, 1, 10), M(mcx, my, mcz, yaw, 1, mastL, 1, 0, -th));
      for (let uu = 1.2; uu < u - 1; uu += 3.5) { const r = lerp(wr1, wr0, uu / mastL) + 0.03; const [flx, fy] = along(uu); const [fx, fz] = L(flx, 0); bld.add(mDark, CYL, M(fx, fy, fz, yaw, r * 2, 0.1, r * 2, 0, -th)); }
      // diagonal struts under the cross arm
      for (const sd of [-1, 1]) tube(Pt(1.6, 0, 0), Pt(0.35, 0, sd * Math.min(1.6, t.gauge * 0.32)), 0.12, wood);
    } else if (style === 'bock') {
      // A-frame tower (Bockstuetze): a short standard head shaft, a cast node, then two tube legs splayed
      // up- and downhill along the line, tied by cross struts; stands very firm on steep slopes
      const uN = clamp(u * 0.2, 1.8, 3.6), spr = 0.7 + hgt * 0.14, lr = rb * 0.9;
      bld.add(mMast, round ? new THREE.CylinderGeometry(rt, rt * 1.2, 1, 16) : new THREE.CylinderGeometry(rt * 1.1, rt * 1.3, 1, 8).rotateY(Math.PI / 8), M(...(() => { const q = Pt(uN / 2, 0, 0); return [q.x, q.y, q.z]; })(), yaw, 1, uN + 0.1, 1, 0, -th));
      bld.add(mMast, new THREE.SphereGeometry(rt * 1.45, 14, 10), M(...(() => { const q = Pt(uN, 0, 0); return [q.x, q.y, q.z]; })(), yaw));
      const legs = [-1, 1].map((sd) => [Pt(uN, sd * 0.25, 0), Pt(u + 0.5, sd * spr, 0)]);
      for (const [A, B] of legs) tube(A, B, lr * 2);
      for (const sd of [-1, 1]) footAt(Pt(u, sd * spr, 0), lr * 4.2);
      // cross struts between the legs (horizontal) with diagonals in every bay
      let prev = null;
      for (let uu = uN + 3.2; uu < u - 1.2; uu += 3.8) {
        const w = lerp(0.25, spr, (uu - uN) / (u - uN));
        const a = Pt(uu, -w, 0), b = Pt(uu, w, 0);
        tube(a, b, 0.22);
        if (prev) { tube(prev[0], b, 0.14); tube(prev[1], a, 0.14); }
        prev = [a, b];
      }
      // ladder on the downhill leg
      if (!small) { const [A, B] = legs[0]; const n = Math.floor(A.distanceTo(B) / 0.35); for (let k = 2; k < n - 2; k++) { const q = A.clone().lerp(B, k / n); const [ox2, oz2] = L(0, 0.32); bld.add(mMast, BOX, M(q.x + ox2 - x, q.y, q.z + oz2 - z, yaw, 0.04, 0.04, 0.4)); } }
    } else if (style === 'zwilling') {
      // two-leg tower (Zweibeinstuetze): a standard top shaft, a transition piece below it,
      // then two tube legs spreading across the line down to two foundations
      const uT = clamp(u * 0.28, 2.6, 5.5), spread = Math.min(0.55 + hgt * 0.075, t.gauge * 0.45 + 1.2), lr = rb * 0.95;
      bld.add(mMast, new THREE.CylinderGeometry(rt, rt * 1.25, 1, round ? 16 : 8), M(...(() => { const q = Pt(uT / 2, 0, 0); return [q.x, q.y, q.z]; })(), yaw, 1, uT + 0.1, 1, 0, -th));
      bld.add(mMast, rbox(rt * 3.2, 0.7, rt * 3.2, 0.12), M(...(() => { const q = Pt(uT + 0.25, 0, 0); return [q.x, q.y, q.z]; })(), yaw, 1, 1, 1, 0, -th));
      for (const sd of [-1, 1]) {
        tube(Pt(uT + 0.3, 0, sd * rt * 1.1), Pt(u + 0.5, 0, sd * spread), lr * 2);
        const q = Pt(u, 0, sd * spread); bld.add(concrete, rbox(lr * 4, 1.3, lr * 4, lr * 0.8), M(q.x, this.ground(dTop + (q.x - x) * c - (q.z - z) * s) - 0.2, q.z, yaw));
      }
      for (let uu = uT + 4.5; uu < u - 1.5; uu += 5) { const w2 = lerp(rt * 1.1, spread, (uu - uT) / (u - uT)); tube(Pt(uu, 0, -w2), Pt(uu, 0, w2), 0.22); }
    } else if (style === 'ystuetze') {
      // Y tower (Leitner/Doppelmayr): one round tube from the foundation, a Y piece on the top shaft
      // splits it into two arms; each arm carries its own head right under its rope line
      const uF = clamp(u * 0.32, 2.6, 4.2);
      bld.add(mMast, round ? new THREE.CylinderGeometry(rt * 1.15, rb, 1, 16) : new THREE.CylinderGeometry(rt * 1.2, rb * 1.1, 1, 8).rotateY(Math.PI / 8), M(...(() => { const q = Pt((uF + u + 1.5) / 2, 0, 0); return [q.x, q.y, q.z]; })(), yaw, 1, u + 1.5 - uF, 1, 0, -th));
      bld.add(mMast, new THREE.SphereGeometry(rt * 1.35, 12, 8), M(...(() => { const q = Pt(uF, 0, 0); return [q.x, q.y, q.z]; })(), yaw));
      const aw = t.gauge * ks / 2 - 1.0; // arms end well inside the rope line, clear of the batteries
      for (const sd of [-1, 1]) tube(Pt(0.1, 0, sd * aw), Pt(uF + 0.2, 0, 0), rt * 1.5);
    } else if (style === 'gitter') {
      // lattice tower: four corner legs spreading towards the foot, horizontal frames and X bracing
      // (Leitner: the top component is the standard tube shaft, flanged onto the lattice substructure)
      const uS = clamp(u * 0.22, 2.2, 4.5);
      const wT = big ? 0.75 : small ? 0.4 : 0.6, wB = wT + hgt * (small ? 0.045 : 0.06);
      const P = (uu, a, b) => { const w = lerp(wT, wB, clamp((uu - uS) / (u - uS), 0, 1)); return Pt(Math.max(uu, uS), a * w, b * w); };
      bld.add(mMast, round ? new THREE.CylinderGeometry(rt, rt * 1.2, 1, 16) : new THREE.CylinderGeometry(rt * 1.1, rt * 1.3, 1, 8).rotateY(Math.PI / 8), M(...(() => { const q = Pt(uS / 2, 0, 0); return [q.x, q.y, q.z]; })(), yaw, 1, uS + 0.1, 1, 0, -th));
      bld.add(mMast, rbox(wT * 2.4, 0.35, wT * 2.4, 0.06), M(...(() => { const q = Pt(uS + 0.1, 0, 0); return [q.x, q.y, q.z]; })(), yaw, 1, 1, 1, 0, -th));
      const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
      const uEnd = u + 0.3, lr = big ? 0.2 : small ? 0.1 : 0.16;
      for (const [a, b] of corners) beam(P(uS, a, b), P(uEnd, a, b), lr);
      const nLev = Math.max(2, Math.round((u - uS) / (small ? 2.2 : 3.2)));
      for (let k = 0; k <= nLev; k++) {
        const u0 = uS + (u - uS) * k / nLev, u1 = uS + (u - uS) * (k + 1) / nLev;
        for (let c2 = 0; c2 < 4; c2++) {
          const [a0, b0] = corners[c2], [a1, b1] = corners[(c2 + 1) % 4];
          beam(P(u0, a0, b0), P(u0, a1, b1), lr * 0.55);
          if (k < nLev) { beam(P(u0, a0, b0), P(u1, a1, b1), lr * 0.4); beam(P(u0, a1, b1), P(u1, a0, b0), lr * 0.4); }
        }
      }
      for (const [a, b] of corners) footAt(P(uEnd, a, b), lr * 7);
    } else if (style === 'portal') {
      // portal (gantry) tower like on T-bars / chairlifts over a piste: two legs outside the ropes,
      // one cross beam on top that carries the sheave trains – nothing in between, you ride underneath
      const half = t.gauge * ks / 2 + (small ? 0.9 : 1.3), spread = half + hgt * 0.04;
      const lr = rb * 1.25;
      for (const sd of [-1, 1]) {
        tube(Pt(-0.1, 0, sd * half), Pt(u + 0.4, 0, sd * spread), lr);
        bld.add(concrete, rbox(lr * 2.1, 0.9, lr * 2.1, lr * 0.25), M(...(() => { const q = Pt(u, 0, sd * spread); return [q.x, this.ground(dTop + (q.x - x) * c - (q.z - z) * s) - 0.1, q.z]; })(), yaw));
        // small knee plates only up in the corners
        beam(Pt(0.15, 0, sd * (half - 0.9)), Pt(1.0, 0, sd * (half - 0.05)), lr * 0.35);
      }
      // the cross beam over the full width
      const [hlx, hy] = along(0.05); const [hx, hz] = L(hlx, 0);
      bld.add(mMast, rbox(0.55, 0.6, half * 2 + 0.6, 0.12), M(hx, hy, hz, yaw, 1, 1, 1, 0, -th));
    }
    // flanges every ~6 m
    if (style === 'rohr' || style === 'kasten') for (let uu = u - 12; uu > 1.5; uu -= 12) {
      const r = lerp(rt, rb, uu / mastL) + 0.08;
      const [flx, fy] = along(uu); const [fx, fz] = L(flx, 0);
      bld.add(mMast, style === 'kasten' ? CYL4 : CYL, M(fx, fy, fz, yaw, (r * 2 + 0.02) * (style === 'kasten' ? 1.3 : 1), 0.12, (r * 2 + 0.02) * (style === 'kasten' ? 1.3 : 1), 0, -th));
    }
    const [blx, by] = along(u); const [bx0, bz0] = L(blx, 0);
    if (tubeLike && style !== 'holz' && style !== 'zwilling') bld.add(concrete, rbox(rb * 4.2, 1.4, rb * 4.2, rb * 0.8), M(bx0, gb - 0.2, bz0, yaw));
    if (style === 'holz') bld.add(concrete, rbox(rb * 2.4, 0.6, rb * 2.4, 0.15), M(bx0, gb + 0.05, bz0, yaw));
    // safety pad (mast padding) around the mast foot where it stands in a piste (winter only)
    if (tubeLike && style !== 'zwilling' && this.padOn(idx, bx0, bz0)) {
      const pr = rb + 0.38, ph = 2.8;
      const [plx, ply] = along(u - ph / 2 - 0.05); const [pcx, pcz] = L(plx, 0);
      this.snowB.add(PADM, CYLR, M(pcx, ply, pcz, yaw, pr * 2, ph, pr * 2, 0, -th));
      for (const fy of [0.55, ph - 0.55]) { const [qlx, qly] = along(u - fy); const [qx, qz] = L(qlx, 0); this.snowB.add(PADW, CYLR, M(qx, qly, qz, yaw, pr * 2 + 0.04, 0.22, pr * 2 + 0.04, 0, -th)); }
    }
    if (style === 'rohr' || style === 'kasten' || style === 'ystuetze') bld.add(mMast, style === 'kasten' ? CYL4 : CYL, M(bx0, gb + 0.6, bz0, yaw, rb * 2.9, 0.18, rb * 2.9));
    void by;
    const span = t.funitel ? t.gauge * ks + 2 * (FUNI_OFF + 0.3) + 0.8 : t.gauge * ks + (small ? 0.8 : 1.6) + (kink ? 0.8 : 0);
    const yS = style === 'ystuetze';
    const awY = t.gauge * ks / 2 - 0.3;
    // cross arm (yoke) - the Y tower has one short head per rope line instead
    if (yS) for (const sd of [-1, 1]) { const [hx, hz] = L(0, sd * (awY - 0.05)); bld.add(mMast, rbox(0.5, 0.55, 2.1, 0.18, 2), M(hx, armY, hz, yaw)); const [jx, jz] = L(0, sd * (awY - 0.7)); bld.add(mMast, new THREE.SphereGeometry(0.42, 10, 8), M(jx, armY, jz, yaw)); }
    else if (FU) {
      // funitel: a deep cross arm, head struts down to the mast (inside, clear of the cabins) and a
      // small top beam on V struts like on the real towers
      bld.add(mMast, rbox(1.4, 0.9, span, 0.18, 2), M(x, armY, z, yaw));
      for (const sd of [-1, 1]) { const [sx2, sz2] = L(0, sd * span * 0.2); beamG(BOX, mMast, new THREE.Vector3(x, armY - 2.6, z), new THREE.Vector3(sx2, armY - 0.4, sz2), 0.3); }
      bld.add(mMast, rbox(1.2, 1.4, 1.4, 0.3), M(x, armY - 0.9, z, yaw));
      if (!small) {
        const yTb = armY + 1.7;
        for (const sd of [-1, 1]) { const [vx, vz] = L(0, sd * 1.6); beamG(BOX, mMast, new THREE.Vector3(vx, armY + 0.45, vz), new THREE.Vector3(x, yTb, z), 0.16); }
        bld.add(mMast, rbox(0.3, 0.3, span * 0.55, 0.06, 1), M(x, yTb + 0.1, z, yaw));
      }
    }
    else bld.add(mMast, rbox(small ? 0.3 : 0.5, small ? 0.3 : 0.55, span, small ? 0.1 : 0.18, 2), M(x, armY, z, yaw));
    // lightning rod on the mast head and anchor bolts on the foundation
    if (!small && GFX.ultra) {
      if (yS) for (const sd of [-1, 1]) { const [hx, hz] = L(0, sd * awY); bld.add(mMast, CYL, M(hx, armY + 1.2, hz, yaw, 0.05, 2.2, 0.05)); }
      else bld.add(mMast, CYL, M(x, armY + 1.2, z, yaw, 0.05, 2.2, 0.05));
      if (tubeLike && style !== 'holz' && style !== 'zwilling') for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, rr = rb * 1.25; const [qx, qz] = L(blx + Math.cos(a) * rr, Math.sin(a) * rr); bld.add(mDark, CYL, M(qx, gb + 0.78, qz, yaw, 0.07, 0.18, 0.07)); }
    }
    if (!small) {
      if (!yS) bld.add(mMast, rbox(0.7, 1.0, 1.0, 0.25), M(x, armY + (comp ? 0.4 : -0.55), z, yaw));
      // maintenance catwalk (grating) along the yoke with a handrail (knee + hand rail)
      // the walkway stays between the rope lines (never under or over a battery); on hold-down
      // towers it lies on top of the yoke, on support towers it hangs under it
      const cy = FU ? armY + 0.59 : comp ? armY + yH / 2 + 0.04 : armY - 0.32;
      const inW = FU ? span : t.gauge * ks - 1.3; void fuArm;
      for (const [cz0, cw] of yS ? [[-(awY - 0.65), 0.7], [awY - 0.65, 0.7]] : [[0, Math.min(span * 0.95, inW)]]) {
        if (cw < 0.5) continue;
        const [wx, wz] = L(-0.75, cz0);
        bld.add(mGrate, BOX, M(wx, cy, wz, yaw, 0.9, 0.06, cw));
        const [rx2, rz2] = L(-1.18, cz0);
        bld.add(mMast, BOX, M(rx2, cy + 1.07, rz2, yaw, 0.05, 0.05, cw));
        bld.add(mMast, BOX, M(rx2, cy + 0.54, rz2, yaw, 0.05, 0.05, cw));
        const nP = Math.max(2, Math.round(cw / 1.2));
        for (let k = 0; k <= nP; k++) { const [px, pz] = L(-1.18, cz0 + (k / nP - 0.5) * cw); bld.add(mMast, BOX, M(px, cy + 0.54, pz, yaw, 0.05, 1.1, 0.05)); }
        for (let k = 0; k <= nP; k++) { const [px, pz] = L(-0.75, cz0 + (k / nP - 0.5) * cw); bld.add(mMast, BOX, M(px, cy - 0.01, pz, yaw, 0.9, 0.04, 0.04)); }
        // brackets holding the grating against the yoke
        for (const e of [-0.45, 0.45]) { const [bx3, bz3] = L(-0.48, cz0 + e * cw); bld.add(mMast, BOX, M(bx3, (cy + armY) / 2, bz3, yaw, 0.06, Math.abs(cy - armY) + 0.1, 0.06)); }
      }
      // ladder on the back of the mast, following the tilt
      const off = (rb + rt) / 2 + 0.18;
      const ox = -cT * off, oy = sT * off; // perpendicular to the axis, valley side
      const u0 = style === 'ystuetze' ? clamp(u * 0.32, 2.6, 4.2) + 0.4 : 0.65, u1 = u - 2.5;
      if (tubeLike && style !== 'zwilling' && u1 - u0 > 1) {
        const lm = (u0 + u1) / 2, [lmx, lmy] = along(lm);
        for (const sd of [-0.22, 0.22]) { const [px, pz] = L(lmx + ox, sd); bld.add(mMast, BOX, M(px, lmy + oy, pz, yaw, 0.04, u1 - u0, 0.04, 0, -th)); }
        for (let uu = u0 + 0.2; uu < u1; uu += 0.3) { const [rlx, ry] = along(uu); const [px, pz] = L(rlx + ox, 0); bld.add(mMast, BOX, M(px, ry + oy, pz, yaw, 0.03, 0.03, 0.44, 0, -th)); }
        // fall-arrest rail (Steigschutzschiene) in the middle of the ladder
        { const [px, pz] = L(lmx + ox - cT * 0.03, 0); bld.add(mDark, BOX, M(px, lmy + oy + sT * 0.03, pz, yaw, 0.03, u1 - u0, 0.05, 0, -th)); }
        // rest platform half way up on tall towers (Ruhepodest)
        if (u1 - u0 > 16 && style !== 'ystuetze') {
          const um = (u0 + u1) / 2 + 1, [qlx, qy] = along(um), rr0 = lerp(rt, rb, um / mastL);
          const [px, pz] = L(qlx - cT * (rr0 + 0.45), 0);
          bld.add(mGrate, BOX, M(px, qy, pz, yaw, 0.9, 0.06, 1.2));
          for (const sd of [-0.6, 0.6]) { const [qx2, qz2] = L(qlx - cT * (rr0 + 0.45), sd); bld.add(mMast, BOX, M(qx2, qy + 0.55, qz2, yaw, 0.9, 0.05, 0.05)); }
          { const [qx2, qz2] = L(qlx - cT * (rr0 + 0.9), 0); bld.add(mMast, BOX, M(qx2, qy + 0.55, qz2, yaw, 0.05, 0.05, 1.2)); }
        }
      }
      // tower number plate
      const pr2 = lattice ? 0.2 : lerp(rt, rb, (u - 3.2) / mastL) + 0.05;
      const [plx, ply] = along(u - 3.2); const [nx, nz] = L(plx + cT * pr2, 0);
      if (style !== 'portal') bld.add(mat(0xffffff), BOX, M(nx, ply - sT * pr2, nz, yaw, 0.03, 0.45, 0.6, 0, -th));
    }
    // sheave trains
    const trainL = nW * pitch;
    // the rope passes at height 'top'. Near the tower it bends from slope s1 to s2; the sheave
    // trains follow that bend as a rounded arc (wheels below = rope over them, above = rope under them)
    const trains = mode === 'support' ? [-1] : mode === 'comp' ? [1] : [1, -1];
    const nWb = mode === 'both' ? Math.max(2, nW - 2) : nW;
    // exaggerate small bends a little so the arc is visible
    let ds = s2 - s1;
    const tlMain = nW * pitch;
    // a little curvature so the battery reads as rounded, but small enough that the rope stays smooth
    const minBend = 0.12 / tlMain;
    if (mode === 'support' && ds > -minBend) ds = -minBend;
    if (mode === 'comp' && ds < minBend) ds = minBend;
    const sm = (s1 + s2) / 2;
    this.towerArcs[idx] = { d: this.twTopD(this.towers[idx]), tl: tlMain, sm, ds: mode === 'both' ? s2 - s1 : ds, top };
    const ropeY = (lx, tl) => sm * lx + ds / (2 * tl) * lx * lx;
    const ropeS = (lx, tl) => sm + ds / tl * lx;
    // funitel: two ropes on each side -> four sheave batteries per tower
    // 'side' = the side where the carriers pass (rope catcher there, support from the other side):
    // outwards on chairlifts/gondolas, towards the cabin (inwards) on each funitel rope
    const ropeOffs = FU ? [-FUNI_OFF, FUNI_OFF] : [0];
    for (const [side, lz] of [-1, 1].flatMap((sd) => ropeOffs.map((o) => [FU ? -Math.sign(o) : sd, sd * t.gauge / 2 * ks + o]))) {
      if (kink) {
        // bend tower: horizontal deflection rollers on the inside of the curve keep the rope in the
        // canted sheaves; a beam on the yoke carries them
        const inn = kink.ang > 0 ? 1 : -1;
        for (const ex of [-0.75, 0, 0.75]) {
          const [rx, rz] = L(ex, lz + inn * 0.24);
          bld.add(mDark, CYL, M(rx, top + 0.02, rz, yaw, 0.36, 0.14, 0.36));
          bld.add(mAcc, CYL, M(rx, top + 0.16, rz, yaw, 0.12, 0.2, 0.12));
        }
        const [bx, bz] = L(0, lz + inn * 0.24);
        bld.add(mAcc, rbox(1.9, 0.12, 0.22, 0.04, 1), M(bx, top + 0.3, bz, yaw));
        const [hx2, hz2] = L(0, lz + inn * 0.45);
        bld.add(mMast, rbox(0.16, Math.abs(armY - top) + 0.3, 0.16, 0.05, 1), M(hx2, (armY + top) / 2 + 0.15, hz2, yaw));
      }
      // a point in the battery plane: lx along the line, off = distance from the rope (along the
      // rope's normal, + = above), dz = lateral shift from the rope
      const Q = (lx, off, tl, dz = 0) => { const sl = ropeS(lx, tl), ny = 1 / Math.hypot(1, sl), nx = -sl * ny; const [qx, qz] = L(lx + nx * off, lz + dz); return new THREE.Vector3(qx, top + ropeY(lx, tl) + ny * off, qz); };
      let mainOff = 0;
      for (const up of trains) {
        const n = up < 0 && mode === 'both' ? nWb : nW;
        const tl = n * pitch;
        const wx = (k) => -tl / 2 + pitch / 2 + k * pitch;
        // sheaves: rubber liner (black) between two cast aluminium rims (Rollenbord), small hub
        for (let k = 0; k < n; k++) {
          const lx = wx(k), c0 = Q(lx, up * (wr + 0.01), tl);
          bld.add(mDark, WHEEL, M(c0.x, c0.y, c0.z, yaw, wr * 2, 0.08, wr * 2, Math.PI / 2));
          for (const zs of [-0.045, 0.045]) { const [fx, fz] = L(0, zs); bld.add(mAlu, WHEEL, M(c0.x + fx - x, c0.y, c0.z + fz - z, yaw, wr * 2.14, 0.018, wr * 2.14, Math.PI / 2)); }
          bld.add(mAlu, WHEEL, M(c0.x, c0.y, c0.z, yaw, wr * 0.55, 0.16, wr * 0.55, Math.PI / 2));
        }
        // two-sheave rockers (Zweierwippen): a plate on each side of the pair, pivot pin behind
        const pivots = [];
        const offP = up * (wr * 2 + 0.12);
        for (let k = 0; k + 1 < n; k += 2) {
          const lm = (wx(k) + wx(k + 1)) / 2, sl = ropeS(lm, tl);
          for (const zs of [-0.085, 0.085]) { const c0 = Q(lm, up * (wr + 0.01), tl, zs); bld.add(mMast, rbox(pitch + wr * 1.1, wr * 0.75, 0.025, 0.06, 1), M(c0.x, c0.y, c0.z, yaw, 1, 1, 1, 0, Math.atan(sl))); }
          const pv = Q(lm, offP, tl); pivots.push(lm);
          for (const zs of [-0.085, 0.085]) { const q = Q(lm, up * (wr * 1.15 + 0.1), tl, zs); bld.add(mMast, rbox(0.26, wr * 1.2 + 0.08, 0.025, 0.06, 1), M(q.x, q.y, q.z, yaw, 1, 1, 1, 0, Math.atan(sl))); }
          bld.add(mDark, CYL, M(pv.x, pv.y, pv.z, yaw, 0.1, 0.24, 0.1, Math.PI / 2));
        }
        // four-sheave rockers on long trains, then the main rocker (Hauptwippe) over all of them
        let lvl = pivots, off2 = offP;
        if (n >= 8) {
          const next = [], o4 = up * (wr * 2 + 0.3);
          for (let k = 0; k + 1 < lvl.length; k += 2) {
            const A = Q(lvl[k], off2, tl), B = Q(lvl[k + 1], off2, tl);
            beamG(BOX, mMast, A, B, 0.13);
            const lm = (lvl[k] + lvl[k + 1]) / 2; next.push(lm);
            const pv = Q(lm, o4, tl); beamG(BOX, mMast, Q(lm, off2, tl), pv, 0.12);
            bld.add(mDark, CYL, M(pv.x, pv.y, pv.z, yaw, 0.12, 0.3, 0.12, Math.PI / 2));
          }
          if (lvl.length % 2) next.push(lvl[lvl.length - 1]);
          lvl = next; off2 = o4;
        }
        const oM = up * (Math.abs(off2) + 0.2);
        if (lvl.length > 1) {
          for (let k = 0; k + 1 < lvl.length; k++) beamG(BOX, mMast, Q(lvl[k], oM, tl), Q(lvl[k + 1], oM, tl), 0.2);
          for (const lm of lvl) beamG(BOX, mMast, Q(lm, off2, tl), Q(lm, oM, tl), 0.1);
        } else beamG(BOX, mMast, Q(lvl[0], off2, tl), Q(lvl[0], oM, tl), 0.16);
        mainOff = Math.max(mainOff, Math.abs(oM));
        // main pivot in the middle: the bracket from the yoke holds the battery here
        const pc = Q(0, oM, tl, -side * 0.18);
        bld.add(mAcc, rbox(0.5, 0.36, 0.3, 0.08, 1), M(pc.x, pc.y, pc.z, yaw, 1, 1, 1, 0, Math.atan(ropeS(0, tl))));
        // short rope guides (Seileinweiser) at both ends on the support side
        for (const ex of [-1, 1]) {
          const g0 = Q(ex * (tl / 2 - 0.05), up * 0.04, tl, -side * 0.1), g1 = Q(ex * (tl / 2 + 0.14), up * 0.12, tl, -side * 0.14);
          beamG(BOX, mDark, g0, g1, 0.04);
        }
      }
      // hanger from the yoke to the main pivot (beside the rope on the tower side)
      const lowY = top + (trains.includes(-1) ? -(mainOff + 0.05) : mainOff + 0.05);
      const hiY = armY;
      const [hx, hz] = L(0, lz - side * 0.3);
      if (FU) {
        // short hanger from the cross arm down to the battery (outside the rope), with a diagonal stay
        const yBot = trains.includes(-1) ? lowY - 0.05 : top + mainOff + 0.05;
        const [ax2, az2] = L(0, lz - side * 0.36);
        bld.add(mMast, rbox(0.4, armY - 0.45 - yBot, 0.32, 0.08, 1), M(ax2, (armY - 0.45 + yBot) / 2, az2, yaw));
        bld.add(mAcc, rbox(0.5, 0.26, 0.42, 0.06, 1), M(ax2, yBot + 0.1, az2, yaw));
        { const [kx, kz] = L(0, lz - side * 1.2); beamG(BOX, mMast, new THREE.Vector3(kx, armY - 0.4, kz), new THREE.Vector3(ax2, (armY + yBot) / 2, az2), 0.12); }
      } else bld.add(mAcc, rbox(0.3, Math.abs(hiY - lowY) + 0.2, 0.12, 0.05, 1), M(hx, (lowY + hiY) / 2, hz, yaw));
    }
    // optional power / signal cable: a short post in the middle of the yoke carries it over the tower
    if (this.cable && !small && idx >= 0) {
      const cy = Math.max(top + 1.4, armY + yH / 2 + 1.1), y0p = armY + yH / 2;
      bld.add(mMast, CYL, M(x, (y0p + cy) / 2, z, yaw, 0.16, cy - y0p, 0.16));
      bld.add(mMast, rbox(0.9, 0.1, 0.12, 0.03, 1), M(x, cy - 0.05, z, yaw));
      for (const ex of [-0.35, 0.35]) { const [ix, iz] = L(ex, 0); bld.add(mat(0x9a7b4f), CYL, M(ix, cy + 0.1, iz, yaw, 0.1, 0.2, 0.1)); }
      this.cablePts[idx] = { x, y: cy + 0.22, z };
    }
    void idx;
  }

  // aerial tramway / 3S tower: several styles, can lean along the line (pivot = rope saddle on top)
  buildTramTower(bld0, x, g, z, top, yaw, idx = -1, s1 = 0, s2 = 0) {
    const t = this.type, br = this.brand;
    // aerial tramway towers are hot-dip galvanised: light, slightly bluish grey
    const steel = mat(0xc3c8cc), dark = mat(0x2b2b2b), acc = mat(br.accent), concrete = mat(0x9b9b96), beton = mat(0xb8b4aa);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const twd = this.towers[idx] || {};
    const want = twd.style && twd.style !== 'auto' ? twd.style : this.twStyleAll && this.twStyleAll !== 'auto' ? this.twStyleAll : 'turm';
    const style = TRAM_TOWER_STYLES[want] ? want : 'turm';
    if (idx >= 0) this.towerStyles[idx] = style;
    const autoTilt = this.lean ? clamp(Math.atan((s1 + s2) / 2) * 0.3, -0.25, 0.25) : 0;
    const th = twd.tilt == null ? autoTilt : clamp(twd.tilt, -30, 30) * Math.PI / 180;
    if (idx >= 0) this.towerTilts[idx] = th;
    // rotate everything about the axis across the line through the top; the base moves along the line
    const cT = Math.cos(th), sT = Math.sin(th);
    const H0 = top - g;
    const gF = twd.d != null ? this.ground(this.twTopD(twd) - sT * H0) : g;
    g = top - (top - gF) / Math.max(0.6, cT);
    const piv = new THREE.Matrix4().makeTranslation(x, top, z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationZ(-th))
      .multiply(new THREE.Matrix4().makeRotationY(-yaw)).multiply(new THREE.Matrix4().makeTranslation(-x, -top, -z));
    const bld = th ? { add: (m, geo, mx) => bld0.add(m, geo, piv.clone().multiply(mx)) } : bld0;
    const Wl = (lz, lx = 0) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const V = (lx, y, lz) => { const [px, pz] = Wl(lz, lx); return new THREE.Vector3(px, y, pz); };
    const beamG = (geo, mm, A, B, r) => { const d = B.clone().sub(A), len = d.length(); if (len < 0.01) return; bld.add(mm, geo, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(r, len, r))); };
    const bm = (A, B, r, mm = steel) => beamG(BOX, mm, A, B, r);
    const tb = (A, B, r, mm = steel) => beamG(CYL, mm, A, B, r);
    // cradle towers (Funifor, CabriO): the cabin passes between the rope pair, so the cross beam sits
    // UNDER the cabins and arms rise on the outside of the ropes to the rope shoes
    const cDrop = t.funifor ? 7.0 : t.cabrio ? 5.6 : 0;
    const beamY = t.cradle ? top - cDrop : top - 1.6;
    const height = beamY - g + 2;
    const gw = t.gauge / 2;
    if (style === 'agitter') {
      for (const side of [-1, 1]) {
        const zb = side * (gw + 2 + height * 0.06), zt = side * (gw - 0.5);
        const len = Math.hypot(height, zb - zt);
        const ang = Math.atan2(zt - zb, height);
        for (const lx of [-1.2, 1.2]) {
          const [cx, cz] = Wl((zb + zt) / 2, lx);
          bld.add(steel, BOX, M(cx, g - 2 + height / 2, cz, yaw, 0.8, len, 0.8, ang));
        }
        const nb = Math.floor(height / 6);
        for (let k = 1; k <= nb; k++) {
          const yy = g - 2 + k * 6, f = (k * 6) / height, zz = lerp(zb, zt, f);
          const [cx, cz] = Wl(zz, 0);
          bld.add(steel, BOX, M(cx, yy, cz, yaw, 2.6, 0.25, 0.25));
          bld.add(steel, BOX, M(cx, yy - 3, cz, yaw, 3.4, 0.18, 0.18, 0, k % 2 ? 1.0 : -1.0));
        }
        const [fx, fz] = Wl(zb);
        bld.add(concrete, BOX, M(fx, g - 0.5, fz, yaw, 4.2, 2, 4.2));
      }
      for (let k = 1; k < 5; k++) {
        const yy = g + (beamY - g) * k / 5, f = k / 5;
        const w = lerp(t.gauge + 4 + height * 0.12, t.gauge, f);
        const [mx, mz] = Wl(0);
        bld.add(steel, BOX, M(mx, yy, mz, yaw, 0.5, 0.5, w));
      }
    } else if (style === 'rohrfach') {
      // two big tubes per side (front and back) forming an A, tied with tubular diagonals
      const lxB = 2.2 + height * 0.05, lxT = 1.3;
      for (const side of [-1, 1]) {
        const zb = side * (gw + 1.5 + height * 0.07), zt = side * (gw - 0.4);
        for (const sx of [-1, 1]) tb(V(sx * lxB, g - 1.5, zb), V(sx * lxT, beamY, zt), 1.15);
        const nb = Math.max(2, Math.floor(height / 7));
        for (let k = 0; k < nb; k++) {
          const f0 = k / nb, f1 = (k + 1) / nb;
          const y0 = lerp(g - 1.5, beamY, f0), y1 = lerp(g - 1.5, beamY, f1);
          const P0 = (sx, f) => V(sx * lerp(lxB, lxT, f), lerp(g - 1.5, beamY, f), lerp(zb, zt, f));
          tb(P0(-1, f0), P0(1, f1), 0.42); void y0; void y1;
          if (k > 0) tb(P0(-1, f0), P0(1, f0), 0.5);
        }
        const [fx, fz] = Wl(zb);
        bld.add(concrete, rbox(lxB * 2 + 3, 2, 3.6, 0.4), M(fx, g - 0.6, fz, yaw));
      }
      for (const f of [0.35, 0.68]) {
        const yy = lerp(g - 1.5, beamY, f), w = lerp(gw + 1.5 + height * 0.07, gw - 0.4, f);
        for (const sx of [-1, 1]) tb(V(sx * lerp(2.2 + height * 0.05, 1.3, f), yy, -w), V(sx * lerp(2.2 + height * 0.05, 1.3, f), yy, w), 0.55);
      }
    } else if (style === 'turm') {
      // like the new towers on the Titlis: one tall square lattice column, tapering upwards, with
      // X bracing on all faces, a ladder inside, a caged platform half way up and a wide box-truss
      // head on top that carries both track rope saddles
      const U = GFX.ultra;
      const neckY = beamY - 3.4, wT = 1.25 + Math.min(0.6, height * 0.006), wB = wT + height * 0.055;
      const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
      const P = (f, a, b) => { const w = lerp(wB, wT, f); return V(a * w, lerp(g - 1.2, neckY, f), b * w); };
      for (const [a, b] of corners) bm(P(0, a, b), P(1.02, a, b), 0.38);
      const nL = Math.max(3, Math.round(height / 5));
      for (let k = 0; k <= nL; k++) {
        const f0 = k / nL, f1 = (k + 1) / nL;
        for (let q = 0; q < 4; q++) {
          const [a0, b0] = corners[q], [a1, b1] = corners[(q + 1) % 4];
          bm(P(f0, a0, b0), P(f0, a1, b1), 0.18);
          if (k < nL) { bm(P(f0, a0, b0), P(f1, a1, b1), 0.12); bm(P(f0, a1, b1), P(f1, a0, b0), 0.12); }
        }
      }
      for (const [a, b] of corners) { const q = P(0, a, b); bld.add(concrete, BOX, M(q.x, g - 0.5, q.z, yaw, 2.0, 1.6, 2.0)); }
      // ladder up the middle
      for (const sd of [-0.22, 0.22]) bm(V(0, g, sd), V(0, neckY, sd), 0.05);
      if (U) for (let y = g + 0.4; y < neckY; y += 0.42) bm(V(0, y, -0.22), V(0, y, 0.22), 0.03);
      // caged rest platform about half way up
      const fP = 0.55, yP = lerp(g - 1.2, neckY, fP), wP = lerp(wB, wT, fP) + 0.6;
      { const [px, pz] = Wl(0); bld.add(mat(0x9aa1a7), BOX, M(px, yP, pz, yaw, wP * 2, 0.08, wP * 2)); }
      for (const [a, b] of corners) bm(V(a * wP, yP, b * wP), V(a * wP, yP + 1.1, b * wP), 0.06);
      for (let q = 0; q < 4; q++) { const [a0, b0] = corners[q], [a1, b1] = corners[(q + 1) % 4]; for (const hh of [0.55, 1.1]) bm(V(a0 * wP, yP + hh, b0 * wP), V(a1 * wP, yP + hh, b1 * wP), 0.05); }
      // box-truss head: 4 chords across the line, verticals and X diagonals on the front and back
      const hw2 = gw + 0.45, hx = 1.5, hb = beamY - 2.6, ht = beamY + 0.4;
      for (const ax of [-hx, hx]) for (const yy of [hb, ht]) bm(V(ax, yy, -hw2), V(ax, yy, hw2), 0.3);
      const nH = Math.max(4, Math.round(hw2 * 2 / 2.2));
      for (let k = 0; k <= nH; k++) {
        const z0 = -hw2 + hw2 * 2 * k / nH, z1 = -hw2 + hw2 * 2 * (k + 1) / nH;
        for (const ax of [-hx, hx]) { bm(V(ax, hb, z0), V(ax, ht, z0), 0.16); if (k < nH) bm(V(ax, hb, z0), V(ax, ht, z1), 0.1); }
        bm(V(-hx, ht, z0), V(hx, ht, z0), 0.1); bm(V(-hx, hb, z0), V(hx, hb, z0), 0.1);
      }
      // knee struts from the head ends down to the neck of the tower
      for (const sd of [-1, 1]) for (const ax of [-1, 1]) bm(V(ax * wT, neckY, sd * wT), V(ax * hx, hb, sd * Math.max(wT + 0.3, gw - 2.4)), 0.22);
      // walkway with railing on top of the head
      { const [px, pz] = Wl(0); bld.add(mat(0x9aa1a7), BOX, M(px, ht + 0.2, pz, yaw, hx * 2 + 0.4, 0.06, hw2 * 2)); }
      for (const ax of [-1, 1]) bm(V(ax * (hx + 0.2), ht + 1.25, -hw2), V(ax * (hx + 0.2), ht + 1.25, hw2), 0.05);
      // lightning rod
      bm(V(0, ht, 0), V(0, ht + 4, 0), 0.06);
    } else if (style === 'beton') {
      // two tapered concrete piers joined by a heavy crossbeam (and one lower tie)
      for (const side of [-1, 1]) {
        const zb = side * (gw + 1.2 + height * 0.05), zt = side * (gw - 0.2);
        const A = V(0, g - 2, zb), B = V(0, beamY, zt), d = B.clone().sub(A), len = d.length();
        const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 4).rotateY(Math.PI / 4);
        const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const f = pos.getY(i) + 0.5, k = lerp(1, 0.62, f); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); } geo.computeVertexNormals();
        bld.add(beton, geo, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)), new THREE.Vector3(3.4 + height * 0.03, len, 2.4 + height * 0.025)));
        const [fx, fz] = Wl(zb);
        bld.add(concrete, BOX, M(fx, g - 0.4, fz, yaw, 6, 1.4, 5));
      }
      const yy = g + (beamY - g) * 0.45, w = gw + 1.2 + height * 0.05 * 0.55;
      const [mx, mz] = Wl(0);
      bld.add(beton, BOX, M(mx, yy, mz, yaw, 1.8, 1.6, w * 2));
      bld.add(beton, BOX, M(mx, beamY - 0.6, mz, yaw, 2.6, 2.2, t.gauge + 2.5));
    } else if (style === 'portalr') {
      // slim modern portal: one big round leg per side, leaning outwards, two tubular ties
      for (const side of [-1, 1]) {
        const zb = side * (gw + 2.5 + height * 0.09), zt = side * (gw - 0.3);
        tb(V(0, g - 1.5, zb), V(0, beamY, zt), 2.0);
        for (const sx of [-1, 1]) tb(V(sx * (1.8 + height * 0.035), g - 1.5, zb), V(0, g + height * 0.45, lerp(zb, zt, 0.45)), 0.7);
        const [fx, fz] = Wl(zb);
        bld.add(concrete, rbox(4.8 + height * 0.07, 1.8, 3.4, 0.4), M(fx, g - 0.6, fz, yaw));
      }
      for (const f of [0.45, 0.8]) { const yy = lerp(g - 1.5, beamY, f), w = lerp(gw + 2.5 + height * 0.09, gw - 0.3, f); tb(V(0, yy, -w), V(0, yy, w), 0.8); }
    }
    // rope bend over this tower: the saddles are curved along it (and the ropes follow the same arc)
    const sm = (s1 + s2) / 2, ds = Math.min(-0.002, s2 - s1), tlS = (style === 'turm' ? 6 : 8) / Math.hypot(1, (s1 + s2) / 2); // ~6-8 m along the rope
    const arcY = (lx) => sm * lx + ds / (2 * tlS) * lx * lx, arcS = (lx) => sm + ds / tlS * lx;
    if (idx >= 0 && this.towerArcs && !th) this.towerArcs[idx] = { d: this.twTopD(this.towers[idx]), tl: tlS, sm, ds, top };
    const [hx0, hz0] = Wl(0);
    if (t.cradle) {
      const to = t.trackOff, armOut = to + 0.55, yTop = top - 0.75;
      bld.add(steel, BOX, M(hx0, beamY, hz0, yaw, 2.4, 1.5, t.gauge + 2 * armOut + 1.4));
      for (const side of t.single ? [0] : [-1, 1]) {
        const zc = side * gw;
        for (const sg of [-1, 1]) {
          const za = zc + sg * armOut;
          bm(V(0, beamY + 0.6, za), V(0, yTop, za), 0.75); // arm
          bm(V(0, beamY + 0.5, za + sg * 1.8), V(0, beamY + 3.4, za + sg * 0.2), 0.4); // knee brace (outside)
          for (const lx of [-1.0, 1.0]) bm(V(lx * 0.2, beamY + 0.7, za), V(lx * 1.2, yTop - 0.4, za), 0.22); // fork to the shoe ends
          // curved rope shoe under the track rope, carried by a cantilever from the arm head
          const shoe = mat(0x8d949a); let prev = null;
          for (let k = 0; k <= 12; k++) {
            const lx = -tlS / 2 + tlS * k / 12, cur = V(lx, top - 0.14 + arcY(lx), zc + sg * to);
            if (prev) { const dv = cur.clone().sub(prev), len = dv.length(); bld.add(shoe, BOX, new THREE.Matrix4().compose(prev.clone().add(cur).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dv.normalize()), new THREE.Vector3(len + 0.02, 0.2, 0.22))); }
            prev = cur;
          }
          bld.add(steel, rbox(Math.max(2.4, tlS * 0.6), 0.5, armOut - to + 0.5, 0.1, 1), M(...(() => { const q = V(0, yTop, zc + sg * (to + armOut) / 2); return [q.x, q.y, q.z]; })(), yaw));
          for (const lx of [-tlS * 0.3, 0, tlS * 0.3]) bm(V(lx, yTop + 0.2, zc + sg * to), V(lx, top - 0.26 + arcY(lx), zc + sg * to), 0.16);
          // haul rope rollers under the shoe (CabriO: beside the cabin, Funifor: just inside the track rope)
          const hz = t.cabrio ? zc + sg * to : zc + sg * (to - 0.55), hy = t.cabrio ? -0.7 : -0.45;
          for (const lx of [-tlS * 0.2, tlS * 0.2]) { const q = V(lx, top + hy + arcY(lx) - 0.18, hz); bld.add(dark, CYL, M(q.x, q.y, q.z, yaw, 0.32, 0.12, 0.32, Math.PI / 2)); }
          if (!t.cabrio) bm(V(0, yTop - 0.2, za), V(0, top + hy - 0.4, hz), 0.14);
          // ladder up the outside of the arm and a lamp on top
          for (const e of [-0.22, 0.22]) bm(V(-0.5, beamY + 0.8, za + sg * 0.42 + e * 0), V(-0.5, yTop, za + sg * 0.42), 0.04);
          for (let yy = beamY + 1.1; yy < yTop - 0.2; yy += 0.35) bld.add(steel, BOX, M(...(() => { const q = V(-0.5, yy, za + sg * 0.42); return [q.x, q.y, q.z]; })(), yaw, 0.04, 0.04, 0.42));
          bld.add(acc, BOX, M(...(() => { const q = V(0, yTop + 0.35, za); return [q.x, q.y, q.z]; })(), yaw, 0.9, 0.2, 0.9));
        }
      }
      // catwalk on the cross beam between the lines
      const [px, pz] = Wl(0, -1.6);
      bld.add(mat(0x6b7075), BOX, M(px, beamY + 0.78, pz, yaw, 1.1, 0.08, t.gauge + 2 * armOut));
      const [nx2, nz2] = Wl(0, 1.22);
      bld.add(mat(0xffffff), BOX, M(nx2, beamY, nz2, yaw, 0.04, 0.8, 1.4));
      return;
    }
    // head beam with the track-rope saddles and the haul-rope sheaves (common to all styles)
    if (style !== 'turm') bld.add(steel, BOX, M(hx0, beamY, hz0, yaw, 3.2, 1.6, t.gauge + 1.0));
    for (const side of [-1, 1]) {
      const [sx, sz] = Wl(t.single ? 0 : side * gw);
      if (!t.single || side > 0) {
        // curved rope shoe (saddle) following the bend of the track ropes, rollers for the haul rope below
        // one slim curved rope shoe under each track rope (grey steel, the rope lies in its groove),
        // standing on short posts on the head; small haul-rope rollers in between
        const nS = 12, zc = t.single ? 0 : side * gw, offs = trackOffs(t);
        const shoe = mat(0x8d949a), yH = style === 'turm' ? beamY + 0.4 : beamY + 0.8;
        for (const off of offs) {
          let prev = null;
          for (let k = 0; k <= nS; k++) {
            const lx = -tlS / 2 + tlS * k / nS, [qx, qz] = Wl(zc + off, lx), cur = new THREE.Vector3(qx, top - 0.14 + arcY(lx), qz);
            if (prev) { const dv = cur.clone().sub(prev), len = dv.length(); bld.add(shoe, BOX, new THREE.Matrix4().compose(prev.clone().add(cur).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dv.normalize()), new THREE.Vector3(len + 0.02, 0.2, 0.2))); }
            prev = cur;
          }
          for (const lx of [-tlS * 0.36, 0, tlS * 0.36]) { const [qx, qz] = Wl(zc + off, lx), y0 = top - 0.24 + arcY(lx); if (y0 > yH && (lx === 0 || y0 - yH < 1.6)) bld.add(shoe, BOX, M(qx, (y0 + yH) / 2, qz, yaw, 0.14, y0 - yH, 0.14)); }
        }
        for (let k = 0; k < 3; k++) { const lm = -tlS * 0.3 + tlS * 0.3 * k; const [qx, qz] = Wl(zc, lm); bld.add(mat(0x3a3d40), CYL, M(qx, top + (t.twoS ? -0.45 : t.threeS ? -0.4 : -1.25) + arcY(lm) - 0.17, qz, yaw, 0.32, 0.12, 0.32, Math.PI / 2)); }
      }
      // maintenance platform with railing (on the inner side: the hangers pass outside)
      const [px, pz] = Wl(side * Math.max(0.9, gw - 1.6));
      bld.add(mat(0x6b7075), BOX, M(px, beamY - 0.7, pz, yaw, 3.8, 0.08, 1.6));
      const [rx, rz] = Wl(side * Math.max(0.2, gw - 2.35));
      bld.add(steel, BOX, M(rx, beamY + 0.2, rz, yaw, 3.8, 0.06, 0.06));
    }
    // tower number on the head beam
    const [nx, nz] = Wl(0, 1.62);
    bld.add(mat(0xffffff), BOX, M(nx, beamY, nz, yaw, 0.04, 0.8, 1.4));
  }

  // guide bows at the station entrance (curved tubes that catch a swinging cabin), like in real stations
  buildCabinGuides(bld, W, yaw, g, L) {
    const t = this.type, galv = mat(0xb9bec3);
    if (t.threeS || t.cradle) return;
    const yG = g + t.hs - 6.9, mouth = L - 10, sides = t.single ? [0] : [1, -1];
    for (const sg of sides) for (const sd of [-1, 1]) {
      const z0 = sg * t.gauge / 2 + sd * 2.15;
      let prev = null;
      for (let k = 0; k <= 8; k++) {
        const lx = mouth - 9 + k * 1.4, flare = Math.max(0, lx - (mouth - 2)) ** 2 * 0.12;
        const [px, pz] = W(lx, z0 + sd * flare), cur = new THREE.Vector3(px, yG, pz);
        if (prev) { const d = cur.clone().sub(prev), len = d.length(); bld.add(galv, CYL, new THREE.Matrix4().compose(prev.clone().add(cur).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(0.22, len + 0.05, 0.22))); }
        prev = cur;
      }
    }
  }

  // aerial tramway / 3S stations in several designs
  buildTramStationStyled(bld, st, o) {
    const t = this.type, br = this.brand, { W, yaw, g, L, Wd, H, cx, valley } = o;
    const concrete = mat(0xc4c0b8), dark = mat(0x1c1f22), galv = mat(0xc3c8cc), glass = mat(0x5f87a3), acc = mat(br.accent);
    const at = (geo, mm, lx, y, lz, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { const [x, z] = W(lx, lz); bld.add(mm, geo, M(x, y, z, yaw, sx, sy, sz, rx, rz)); };
    const beam = (mm, a, b, r) => { const [ax, az] = W(a[0], a[2]), [bx, bz] = W(b[0], b[2]); const A = new THREE.Vector3(ax, a[1], az), B = new THREE.Vector3(bx, b[1], bz), d = B.clone().sub(A), len = d.length(); if (len < 0.01) return; bld.add(mm, BOX, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(r, len, r))); };
    const gw = t.single ? 0 : t.gauge / 2, sides = t.single ? [0] : [1, -1], yR = g + t.hs, mouth = L - 10, back = -10;
    const railing = (x0, x1, lz, y) => { for (let lx = x0; lx <= x1 + 0.01; lx += 1.6) at(BOX, galv, lx, y + 0.55, lz, 0.06, 1.1, 0.06); for (const hh of [0.55, 1.1]) at(BOX, galv, (x0 + x1) / 2, y + hh, lz, x1 - x0, 0.05, 0.05); };
    if (st === 'stahl') {
      // open galvanised steel station: platform, portal at the mouth, big curved saddle trusses
      // that lift the track ropes up to their anchors, red haul-rope wheel on top, stairs
      at(rbox(L + 2, 1.2, Wd, 0.3), concrete, cx, g - 0.5, 0);
      for (const sd of [-1, 1]) railing(back + 1, mouth - 1, sd * (Wd / 2 - 0.3), g + 0.1);
      const hA = 11;
      const curve = (f) => [lerp(mouth, 1.5, f), yR + hA * f * f];
      for (const sg of sides) {
        const z0 = sg * gw;
        for (const zz of [z0 - 0.6, z0 + 0.6]) {
          for (let k = 0; k < 10; k++) {
            const [x0, y0] = curve(k / 10), [x1, y1] = curve((k + 1) / 10);
            beam(galv, [x0, y0, zz], [x1, y1, zz], 0.45); beam(galv, [x0, y0 - 1.8, zz], [x1, y1 - 1.8, zz], 0.36);
            beam(galv, [x0, y0, zz], [x0, y0 - 1.8, zz], 0.2); beam(galv, [x0, y0 - 1.8, zz], [x1, y1, zz], 0.16);
          }
        }
        for (let k = 0; k <= 10; k += 2) { const [x0, y0] = curve(k / 10); beam(galv, [x0, y0 - 0.75, z0 - 0.6], [x0, y0 - 0.75, z0 + 0.6], 0.12); }
        // the ropes running up over the bow
        for (const zz of [z0 - 0.6, z0 + 0.6]) for (let k = 0; k < 10; k++) { const [x0, y0] = curve(k / 10), [x1, y1] = curve((k + 1) / 10); beam(dark, [x0, y0 + 0.2, zz], [x1, y1 + 0.2, zz], 0.07); }
        // legs under the bow
        for (const f of [0.45, 0.85]) { const [lx, y] = curve(f); for (const zz of [z0 - 0.9, z0 + 0.9]) beam(galv, [lx, g + 0.1, zz], [lx, y - 1.5, zz], 0.38); }
      }
      // red haul-rope wheel up at the end of the bows
      const [wx] = curve(1), wy = yR + hA + 0.6;
      at(new THREE.TorusGeometry(2.1, 0.16, 8, 32), mat(0xc8202a), wx - 0.6, wy, 0);
      for (let k = 0; k < 6; k++) at(BOX, mat(0xc8202a), wx - 0.6, wy, 0, 0.12, 4.0, 0.12, 0, k * Math.PI / 6);
      at(CYL, dark, wx - 0.6, wy, 0, 0.6, 0.8, 0.6, Math.PI / 2);
      // portal at the mouth with an aviation marker ball on top
      for (const sd of [-1, 1]) for (const lx of [mouth - 3, mouth]) beam(galv, [lx, g + 0.1, sd * (gw + 2.6)], [lx, yR + 2, sd * (gw + 2.6)], 0.4);
      for (const lx of [mouth - 3, mouth]) beam(galv, [lx, yR + 2, -(gw + 2.8)], [lx, yR + 2, gw + 2.8], 0.45);
      at(new THREE.SphereGeometry(0.55, 12, 8), mat(0xff6a00), mouth - 1.5, yR + 3.2, 0);
      // stairs up to a service landing
      const zS = Wd / 2 - 1.5;
      for (let k = 0; k < 18; k++) at(BOX, galv, mouth - 5 - k * 0.3, g + 0.1 + k * 0.22, zS, 0.3, 0.05, 1.1);
      for (const sd of [-0.55, 0.55]) beam(galv, [mouth - 5, g + 0.1, zS + sd], [mouth - 10.4, g + 4.1, zS + sd], 0.08);
      at(BOX, galv, mouth - 12, g + 4.1, zS, 3.2, 0.08, 1.3);
      // machine house at the back
      at(rbox(6, 3.4, Wd * 0.5, 0.15), mat(0xd9dcdf), back + 3, g + 1.8, 0);
      at(BOX, mat(0x8a9097), back + 3, g + 3.6, 0, 6.4, 0.15, Wd * 0.5 + 0.4);
    } else if (st === 'glas') {
      // modern glass box: concrete plinth, all-glass walls in a dark frame grid, thin flat roof
      at(rbox(L + 4, 2.2, Wd + 4, 0.4), concrete, cx, g - 1, 0);
      at(rbox(L, H - 1.5, Wd, 0.3), glass, cx, g + (H - 1.5) / 2, 0);
      for (let y = g + 3.3; y < g + H - 1.6; y += 3.4) at(BOX, dark, cx, y, 0, L + 0.08, 0.16, Wd + 0.08);
      for (let lx = back + 2.6; lx < mouth - 1; lx += 2.6) for (const sd of [-1, 1]) at(BOX, dark, lx, g + (H - 1.5) / 2, sd * (Wd / 2 + 0.03), 0.12, H - 1.5, 0.06);
      for (let lz = -Wd / 2 + 2.5; lz < Wd / 2 - 1; lz += 2.5) at(BOX, dark, back - 0.03, g + (H - 1.5) / 2, lz, 0.06, H - 1.5, 0.12);
      at(rbox(L + 4.5, 0.6, Wd + 4.5, 0.2), mat(0xe9ebed), cx + 1, g + H - 1.2, 0);
      this.snowB.add(SNOWM, rbox(L + 4, 0.3, Wd + 4, 0.15), M(...(() => { const [x, z] = W(cx + 1, 0); return [x, g + H - 0.75, z]; })(), yaw));
      at(rbox(1, H - 4.5, (t.single ? 4 : t.gauge) + 6, 0.2), dark, mouth + 0.2, g + 2 + (H - 4.5) / 2, 0);
      at(BOX, acc, mouth + 0.4, g + H - 2.2, 0, 0.3, 0.5, Wd * 0.7);
      if (valley) { at(rbox(5, 0.3, 9, 0.1), mat(0xe9ebed), back - 2.5, g + 3.5, 0); for (const sd of [-4, 4]) at(CYL, dark, back - 4.6, g + 1.75, sd, 0.2, 3.5, 0.2); }
    } else if (st === 'fels') {
      // mountain station built into the rock: rock mass behind, concrete hall in front with a
      // panorama window band, cantilevered viewing deck with railing
      const rock = mat(0x84817c), rock2 = mat(0x6e6b67);
      // a craggy rock outcrop of several broken blocks (behind and around the back of the hall)
      const rocks = [[back - 2, 0, 18, 0.2, 1.6], [back - 8, 8, 13, 0.7, 1.3], [back - 7, -9, 14, -0.5, 1.4], [back + 4, 11, 10, 0.4, 1.1], [back + 3, -12, 11, -0.3, 1.2], [back - 12, 0, 12, 1.1, 1.0], [back + 8, 14, 7, 0.9, 0.8], [back + 7, -15, 8, -0.8, 0.9]];
      rocks.forEach(([lx, lz, sz, rr, sy], i) => at(new THREE.DodecahedronGeometry(sz / 2, 0), i % 2 ? rock2 : rock, lx, g + sz * sy * 0.32, lz, 1.15, sy, 1, rr, rr * 0.6));
      at(rbox(L * 0.75, H, Wd, 0.6), concrete, mouth - L * 0.375, g + H / 2 - 0.5, 0);
      at(rbox(L * 0.75 + 0.1, 2.6, Wd + 0.1, 0.6), glass, mouth - L * 0.375, g + H - 3.2, 0);
      at(rbox(1, H - 5, (t.single ? 4 : t.gauge) + 6, 0.2), dark, mouth + 0.1, g + 1.5 + (H - 5) / 2, 0);
      // viewing deck on the valley side
      const zD = Wd / 2 + 3;
      at(rbox(L * 0.5, 0.5, 6, 0.1), concrete, mouth - L * 0.3, g + H - 5.5, zD);
      railing(mouth - L * 0.55, mouth - L * 0.05, zD + 2.9, g + H - 5.25);
      for (const lx of [mouth - L * 0.5, mouth - L * 0.1]) beam(concrete, [lx, g - 0.5, Wd / 2], [lx, g + H - 5.8, zD + 1.5], 0.5);
      at(rbox(L * 0.8, 0.5, Wd + 1.5, 0.2), mat(0x8a8f95), mouth - L * 0.375, g + H + 0.25, 0);
      this.snowB.add(SNOWM, rbox(L * 0.8, 0.35, Wd + 1.4, 0.15), M(...(() => { const [x, z] = W(mouth - L * 0.375, 0); return [x, g + H + 0.6, z]; })(), yaw));
    } else if (st === 'holz') {
      // chalet station: stone base, larch wood walls, steep gable roof along the line
      const wood = mat(0x7a5232), stone = mat(0x8c867c), roofM = mat(0x4a4d52);
      at(rbox(L, 3, Wd, 0.3), stone, cx, g + 1.2, 0);
      at(rbox(L - 0.2, H - 5, Wd - 0.2, 0.2), wood, cx, g + 2.7 + (H - 5) / 2, 0);
      for (let y = g + 4; y < g + H - 3; y += 1.2) at(BOX, mat(0x6a4629), cx, y, 0, L, 0.06, Wd + 0.02);
      for (let lx = back + 3; lx < mouth - 2; lx += 3.5) for (const sd of [-1, 1]) at(BOX, dark, lx, g + 4.8, sd * (Wd / 2 + 0.02), 1.6, 1.4, 0.06);
      const ra = 0.6, rw = Wd / 2 / Math.cos(ra) + 1;
      for (const sd of [-1, 1]) at(BOX, roofM, cx, g + H - 2.3 + Math.tan(ra) * Wd / 4, sd * Wd / 4, L + 2, 0.35, rw, sd * ra);
      this.snowB.add(SNOWM, BOX, M(...(() => { const [x, z] = W(cx, 0); return [x, g + H - 2.1 + Math.tan(ra) * Wd / 2, z]; })(), yaw, L + 1.6, 0.3, 1.2));
      at(rbox(1, H - 6, (t.single ? 4 : t.gauge) + 6, 0.2), dark, mouth + 0.15, g + 1.5 + (H - 6) / 2, 0);
    }
  }

  buildTramStation(bld, P, g, u, valley) {
    const t = this.type, br = this.brand;
    const yaw = -Math.atan2(u.z, u.x);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => [P.x + lx * c + lz * s, P.z - lx * s + lz * c];
    const concrete = mat(0xc4c0b8), roof = mat(br.roof), acc = mat(br.accent), dark = mat(0x1c1f22), glass = mat(0x6d93ad), steel = mat(br.mast);
    const L = t.Ls + 12, Wd = t.gauge + 12, H = t.hs + 10;
    const cx = L / 2 - 10;
    let [x, z] = W(cx, 0);
    const st = this.stStyle && TRAM_STATION_STYLES[this.stStyle] ? this.stStyle : valley ? 'glas' : 'fels';
    this.buildCabinGuides(bld, W, yaw, g, L);
    if (st !== 'beton') { this.buildTramStationStyled(bld, st, { W, yaw, g, L, Wd, H, cx, valley, P }); return; }
    // plinth and rounded concrete hall
    bld.add(concrete, rbox(L + 8, 3.2, Wd + 8, 0.8), M(x, g - 1.5, z, yaw));
    bld.add(concrete, rbox(L, H + 3, Wd, 1.6, 3), M(x, g - 3 + (H + 3) / 2, z, yaw));
    // glazed bands wrapping around the rounded corners
    bld.add(glass, rbox(L + 0.14, 2.8, Wd + 0.14, 1.65, 3), M(x, g + 3.6, z, yaw));
    bld.add(glass, rbox(L * 0.66, 2.4, Wd + 0.16, 0.6), M(x - L * 0.12 * 0, g + H - 3.6, z, yaw));
    bld.add(acc, rbox(L + 0.2, 0.8, Wd + 0.2, 1.65, 3), M(x, g + H - 1.2, z, yaw));
    // soft cantilevered roof
    bld.add(roof, rbox(L + 2.2, 0.9, Wd + 2.2, 0.45), M(x, g + H + 0.45, z, yaw));
    this.snowB.add(SNOWM, rbox(L + 1.6, 0.5, Wd + 1.6, 0.25), M(x, g + H + 1.05, z, yaw));
    // vertical mullions on the long sides
    for (let lx = -L / 2 + 3; lx < L / 2 - 2; lx += 2.6) for (const sd of [-1, 1]) {
      [x, z] = W(cx + lx, sd * (Wd / 2 + 0.09));
      bld.add(steel, rbox(0.14, 2.8, 0.1, 0.04, 1), M(x, g + 3.6, z, yaw));
    }
    // track mouth where the ropes leave the hall
    [x, z] = W(L - 10 + 0.35, 0);
    bld.add(dark, rbox(0.8, 9.5, t.gauge + 6, 0.35), M(x, g + t.hs - 4.5, z, yaw));
    bld.add(acc, rbox(1.2, 0.6, t.gauge + 7, 0.2), M(x, g + t.hs + 0.5, z, yaw));
    // glass front at the back
    [x, z] = W(cx - L / 2 - 0.05, 0);
    bld.add(glass, rbox(0.3, H - 8, Wd - 8, 0.12), M(x, g + (H - 8) / 2 + 2.5, z, yaw));
    if (valley) {
      [x, z] = W(-12, Wd / 2 - 3);
      bld.add(glass, rbox(0.25, 2.6, 3, 0.1), M(x, g + 1.4, z, yaw));
      // entrance canopy
      [x, z] = W(cx - L / 2 - 2.2, 0);
      bld.add(roof, rbox(4.4, 0.35, 8, 0.15), M(x, g + 3.4, z, yaw));
      for (const sd of [-3.6, 3.6]) { [x, z] = W(cx - L / 2 - 3.9, sd); bld.add(steel, CYL, M(x, g + 1.7, z, yaw, 0.22, 3.4, 0.22)); }
    }
  }

  // inside a detachable station, modelled after real terminals: a box girder over the carrier path
  // carries the running rail; beside it a long row of rubber tyres (the tyre conveyor) slows the
  // carriers down and speeds them up; lower down, the haul rope runs over a row of sheaves behind
  // mesh guards; strip lights under the roof. Colours by manufacturer.
  buildStationMachinery(bld, o) {
    const t = this.type, U = GFX.ultra, { W, yaw, yc, r } = o;
    const MC = MACHINE[this.brandKey] || MACHINE.dreifachmayr;
    const mach = mat(MC.mach), rail = mat(0xb5bac0), tyre = mat(0x16181a), hub = mat(MC.hub), sheave = mat(MC.sheave), frameM = mat(MC.frame), lamp = mat(0xffffff, { emissive: 0xfff6e0, emissiveIntensity: 0.9 });
    const L1 = t.Ls - 0.6;
    // U path at radius rr: straight (+side) from the entry to the wheel, half circle, straight (-side)
    const U_ = (rr, step) => {
      const pts = [];
      for (let lx = L1; lx > 0; lx -= step) pts.push([lx, rr, -1, 0]);
      const nA = Math.max(6, Math.round(Math.PI * rr / step));
      for (let k = 0; k <= nA; k++) { const a = Math.PI / 2 + k / nA * Math.PI; pts.push([Math.cos(a) * rr, Math.sin(a) * rr, -Math.sin(a), Math.cos(a)]); }
      for (let lx = step; lx <= L1; lx += step) pts.push([lx, -rr, 1, 0]);
      return pts;
    };
    // run a box along a U path (segments between consecutive points)
    const runBox = (mm, rr, y, w, h, step = 1.2) => {
      const P = U_(rr, step);
      for (let i = 0; i < P.length - 1; i++) {
        const [ax, az] = P[i], [bx, bz] = P[i + 1], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const [x, z] = W((ax + bx) / 2, (az + bz) / 2);
        const yy = yaw - Math.atan2(bz - az, bx - ax);
        bld.add(mm, BOX, M(x, y, z, yy, len + 0.02, h, w));
      }
    };
    // 1. station girder + running rail over the carrier path
    runBox(mach, r, yc + 0.62, 0.7, 0.42);
    runBox(rail, r, yc + 0.36, 0.16, 0.12, 0.8);
    // 2. tyre conveyor: tyres on vertical axles beside the path, every 0.75 m (not on the wheel)
    const tyres = U_(r + 0.42, 0.75);
    tyres.forEach(([lx, lz], i) => {
      if (lx < 0.4 && Math.abs(lz) < r + 0.1) return;
      const [x, z] = W(lx, lz);
      bld.add(tyre, CYL, M(x, yc + 0.2, z, yaw, 0.62, 0.17, 0.62));
      if (U || i % 2 === 0) bld.add(hub, CYL, M(x, yc + 0.2, z, yaw, 0.32, 0.19, 0.32));
      if (U && i % 4 === 0) { const [bx, bz] = W(lx, lz + Math.sign(lz) * 0.22); bld.add(mach, BOX, M(bx, yc + 0.42, bz, yaw, 0.3, 0.3, 0.3)); }
    });
    // 3. haul rope deflection sheaves in a row behind mesh guards (yellow wheels with holes)
    const zi = r - 1.2, ls0 = Math.max(2.5, t.Ls * 0.18), ls1 = t.Ls * 0.86;
    if (ls1 - ls0 > 3) for (const sd of [-1, 1]) {
      // lower box beam (the blue trough with holes on top)
      let [x, z] = W((ls0 + ls1) / 2, sd * zi);
      bld.add(mach, rbox(ls1 - ls0 + 0.8, 0.5, 0.75, 0.05, 1), M(x, yc - 0.95, z, yaw));
      for (let lx = ls0 + 0.6; lx < ls1; lx += 1.55) {
        [x, z] = W(lx, sd * zi);
        bld.add(sheave, CYL, M(x, yc - 0.3, z, yaw, 0.9, 0.12, 0.9, Math.PI / 2));
        bld.add(mat(0x2b2f33), CYL, M(x, yc - 0.3, z, yaw, 0.22, 0.16, 0.22, Math.PI / 2));
        if (U) for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const [hx, hz] = W(lx + Math.cos(a) * 0.24, sd * zi); bld.add(mat(0x2b2f33), CYL, M(hx, yc - 0.3 + Math.sin(a) * 0.24, hz, yaw, 0.12, 0.13, 0.12, Math.PI / 2)); }
      }
      // the haul rope passing under the sheaves
      [x, z] = W((ls0 + ls1) / 2, sd * zi);
      bld.add(mat(0x2a2a2a), BOX, M(x, yc - 0.72, z, yaw, ls1 - ls0 + 0.8, 0.055, 0.055));
      // mesh guard on the inner side + galvanised frame
      [x, z] = W((ls0 + ls1) / 2, sd * (zi - 0.5));
      bld.add(guardMat(), BOX, M(x, yc - 0.35, z, yaw, ls1 - ls0, 1.1, 0.02));
      for (const yy of [yc + 0.22, yc - 0.9]) bld.add(rail, BOX, M(x, yy, z, yaw, ls1 - ls0, 0.06, 0.06));
      for (let lx = ls0; lx <= ls1 + 0.01; lx += (ls1 - ls0) / Math.max(1, Math.round((ls1 - ls0) / 2.2))) { const [px, pz] = W(lx, sd * (zi - 0.5)); bld.add(rail, BOX, M(px, yc - 0.35, pz, yaw, 0.06, 1.18, 0.06)); }
      // hangers from the roof frame down to the lower beam
      for (let lx = ls0 + 0.4; lx < ls1; lx += 3.1) { const [px, pz] = W(lx, sd * (zi + 0.3)); bld.add(frameM, BOX, M(px, yc - 0.2, pz, yaw, 0.14, 1.5, 0.14)); }
    }
    // 4. strip lights under the roof
    for (const sd of [-1, 1]) for (let lx = 2; lx < t.Ls - 1; lx += 3.2) { const [x, z] = W(lx, sd * (r - 0.4)); bld.add(lamp, BOX, M(x, yc + 0.43, z, yaw, 1.3, 0.04, 0.1)); }
  }

  buildBoardingDeck(bld, o) {
    const t = this.type, { W, yaw, g, yc, r, hw, valley, concrete, dark, steel } = o;
    const [, cw, ch] = t.cab;
    const cabBot = yc - t.hanger - 0.22 - ch;
    const yD = cabBot + 0.18, hD = yD - g + 0.6, yMid = yD - hD / 2;
    if (yD - g < 0.4) return;
    const gap = cw / 2 + 0.28;
    const ri = r - gap, ro = r + gap;
    const lx0 = valley && this.garStyle === 'unter' ? 3 : 1, lx1 = t.Ls - 1.6;
    const len = lx1 - lx0, cxD = (lx0 + lx1) / 2;
    const deck = mat(0xc9c6bf), yellow = mat(0xf2c200), rubber = mat(0x1a1c1f);
    let x, z;
    // inner island (inside the U), round at the bull-wheel end
    if (ri > 0.4) {
      [x, z] = W((-ri * 0.2 + lx1) / 2, 0);
      bld.add(deck, rbox(lx1 + ri * 0.2, hD, ri * 2, 0.12, 1), M(x, yMid, z, yaw));
      [x, z] = W(0, 0); bld.add(deck, CYL, M(x, yMid, z, yaw, ri * 2, hD, ri * 2));
      for (const sd of [-1, 1]) { [x, z] = W(lx1 / 2, sd * (ri - 0.08)); bld.add(yellow, BOX, M(x, yD + 0.005, z, yaw, lx1, 0.02, 0.12)); }
    }
    // outer platforms along both straights (where people get in and out)
    const wO = Math.max(1.2, hw + 0.3 - ro);
    for (const sd of [-1, 1]) {
      [x, z] = W(cxD, sd * (ro + wO / 2));
      bld.add(deck, rbox(len, hD, wO, 0.12, 1), M(x, yMid, z, yaw));
      [x, z] = W(cxD, sd * (ro + 0.08)); bld.add(yellow, BOX, M(x, yD + 0.005, z, yaw, len, 0.02, 0.12));
      // stairs down at the back end
      const nS = Math.max(2, Math.round((yD - g) / 0.18));
      for (let k = 0; k < nS; k++) {
        const hh = (yD - g) * (nS - k) / nS;
        [x, z] = W(lx0 - 0.15 - k * 0.3, sd * (ro + wO / 2));
        bld.add(deck, BOX, M(x, g + hh / 2 - 0.3, z, yaw, 0.3, hh + 0.6, Math.min(wO, 1.6)));
      }
      // guide rails on both sides of the channel at the height of the cabin skirt
      for (const e of [ro - 0.06, ri + 0.06]) {
        if (e < 0.3) continue;
        [x, z] = W((lx0 + lx1) / 2 + 0.6, sd * e);
        bld.add(rubber, rbox(len + 1.2, 0.18, 0.12, 0.05, 1), M(x, cabBot + 0.45, z, yaw));
        for (let lx = lx0; lx <= lx1 + 0.01; lx += 2.5) { [x, z] = W(lx, sd * e); bld.add(steel, BOX, M(x, (yD + cabBot + 0.45) / 2, z, yaw, 0.08, Math.max(0.05, cabBot + 0.45 - yD) + 0.1, 0.08)); }
      }
      // channel floor (dark) between the decks
      [x, z] = W(cxD, sd * r);
      bld.add(dark, BOX, M(x, g + 0.02, z, yaw, len, 0.06, ro - ri));
    }
  }

  buildStation(bld, P, g, u, valley) {
    const t = this.type, br = this.brand;
    const yaw = -Math.atan2(u.z, u.x);
    const r = t.gauge / 2;
    const yc = g + t.hs;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => [P.x + lx * c + lz * s, P.z - lx * s + lz * c];
    const concrete = mat(0xadaba5), steel = mat(br.mast), roof = mat(br.roof), acc = mat(br.accent), dark = mat(0x26292c), glass = mat(0x6d93ad), rubber = mat(0x1a1c1f);
    const round0 = br.style === 'round';
    const Lst = t.Ls + r + 3;
    const cx = Lst / 2 - r - 3;
    let [x, z] = W(cx, 0);
    // concrete platform with soft edges
    const carW0 = t.kind === 'gondola' ? (t.funitel ? 2 * FUNI_OFF + 1.0 : t.cab[1]) : (t.seats || 4) * 0.58 + 0.25;
    const WdSt = t.detach ? t.gauge + carW0 + (t.kind === 'gondola' ? 5.6 : 4.4) : t.gauge + 7;
    bld.add(concrete, rbox(Lst + 4, 1.6, WdSt + 1.2, 0.4), M(x, g - 0.65, z, yaw));
    // chairlifts: people walk in and board on snow, so the station floor is snowed over in winter
    if (t.kind === 'chair' || t.kind === 'kombi') this.snowB.add(SNOWM, rbox(Lst + 3.7, 0.14, WdSt + 0.9, 0.06), M(x, g + 0.2, z, yaw));
    // bull wheel: rim with rubber liner, six box spokes, big hub on the drive shaft
    const wheel = new THREE.TorusGeometry(r, 0.17, 8, 36).rotateX(Math.PI / 2);
    [x, z] = W(0, 0);
    const MC = MACHINE[this.brandKey] || MACHINE.dreifachmayr;
    bld.add(dark, wheel, M(x, yc, z, yaw));
    bld.add(rubber, new THREE.TorusGeometry(r - 0.02, 0.09, 6, 36).rotateX(Math.PI / 2), M(x, yc + 0.02, z, yaw));
    if (t.detach) bld.add(mat(MC.mach), new THREE.CylinderGeometry(r - 0.12, r - 0.12, 0.2, 36, 1, true), M(x, yc - 0.02, z, yaw));
    for (let k = 0; k < 6; k++) bld.add(t.detach ? mat(MC.mach) : dark, BOX, M(x, yc - 0.05, z, yaw + k * Math.PI / 6, 0.22, 0.3, t.gauge - 0.4));
    bld.add(steel, CYL, M(x, yc + 0.05, z, yaw, 1.2, 0.6, 1.2));
    bld.add(dark, CYL, M(x, yc + 0.5, z, yaw, 0.5, 0.5, 0.5));
    if (t.detach) {
      // real proportions: cabin / chair path on both sides of the bull wheel plus a boarding platform
      // (about 2.5-3 m) outside of it, so a 10-seat gondola station is about 15 m wide
      const Wd = WdSt, hw = Wd / 2;
      const x0 = -r - 2.6, x1 = t.Ls + 0.4;
      // portal frames on round columns
      for (const lx of [-r * 0.3, (t.Ls - r) * 0.5, t.Ls - 1.4]) {
        for (const sd of [-1, 1]) { [x, z] = W(lx, sd * (hw - 0.55)); bld.add(steel, CYL, M(x, (g + yc + 0.7) / 2, z, yaw, 0.62, yc + 0.7 - g, 0.62)); bld.add(concrete, CYL, M(x, g + 0.25, z, yaw, 1.1, 0.5, 1.1)); }
        [x, z] = W(lx, 0); bld.add(steel, rbox(0.6, 0.7, Wd - 0.6, 0.18), M(x, yc + 0.75, z, yaw));
      }
      // station machinery (rail, tyre conveyors, rope sheaves, guards, lights) in the maker's colours
      this.buildStationMachinery(bld, { W, yaw, g, yc, r, hw });
      // station design: auto (by manufacturer) or one of the styles chosen when building
      const stStyle = this.stStyle && this.stStyle !== 'auto' && STATION_STYLES[this.stStyle] ? this.stStyle : (round0 ? 'dline' : 'symphony');
      if (stStyle === 'dline' || stStyle === 'symphony') {
      const round = stStyle === 'dline';
      // housing: plan outline (rounded "D-line" or chamfered "Symphony"-like), extruded in layers
        const plan = (inset) => {
          const sh = new THREE.Shape();
          const a0 = x0 + inset, a1 = x1 - inset, h = hw - inset;
          if (round) {
            const rc = Math.min(2.2, h * 0.6);
            sh.moveTo(a1 - rc, -h); sh.quadraticCurveTo(a1, -h, a1, -h + rc); sh.lineTo(a1, h - rc); sh.quadraticCurveTo(a1, h, a1 - rc, h);
            sh.lineTo(a0 + h, h); sh.absarc(a0 + h, 0, h, Math.PI / 2, Math.PI * 1.5, false); sh.lineTo(a1 - rc, -h);
          } else {
            const ch = 1.3;
            sh.moveTo(a0 + ch, -h); sh.lineTo(a1 - ch * 0.5, -h); sh.lineTo(a1, -h + ch * 0.5); sh.lineTo(a1, h - ch * 0.5); sh.lineTo(a1 - ch * 0.5, h);
            sh.lineTo(a0 + ch, h); sh.lineTo(a0, h - ch); sh.lineTo(a0, -h + ch); sh.lineTo(a0 + ch, -h);
          }
          return sh;
        };
        const band = round ? 0.9 : 1.35;
        const at = (geo, m, y) => bld.add(m, geo, M(P.x, y, P.z, yaw));
        at(planExtrude(plan(0), 1.0), roof, yc + 0.45);
        at(planExtrude(plan(-0.06), 0.2), round ? dark : acc, yc + 1.42);
        at(planExtrude(plan(0.1), band), glass, yc + 1.62);
        const bev = round ? 0.75 : 0.4;
        at(planExtrude(plan(bev), round ? 0.12 : 0.15, bev, round ? 5 : 1), roof, yc + 1.62 + band);
        const roofH = round ? 0.12 + 2 * bev : 0.15 + 2 * bev;
        this.snowB.add(SNOWM, planExtrude(plan(bev + 0.2), 0.12, 0.32, 3), M(P.x, yc + 1.62 + band + roofH - 0.3, P.z, yaw));
        if (!round) {
          // glass mullions and a red sweep along the roof edge
          for (let lx = x0 + 1.6; lx < x1 - 0.6; lx += 1.8) for (const sd of [-1, 1]) { [x, z] = W(lx, sd * (hw - 0.07)); bld.add(steel, rbox(0.12, band, 0.12, 0.04, 1), M(x, yc + 1.62 + band / 2, z, yaw)); }
        } else {
          [x, z] = W((x0 + x1) / 2 + 0.6, 0);
          bld.add(acc, rbox(x1 - x0 - 3, 0.1, 0.9, 0.05, 1), M(x, yc + 1.62 + band + 0.9, z, yaw));
        }
        // dark rope portal at the line end
        [x, z] = W(x1 + 0.02, 0);
        bld.add(dark, rbox(0.25, 1.0, t.gauge + 0.8, 0.12), M(x, yc + 0.95, z, yaw));
      } else this.buildHousing(bld, stStyle, { P, yaw, W, x0, x1, hw, yc, g, Wd, steel, roof, acc, dark, glass, concrete });
      // glazed side walls along the boarding platforms (open at the back where people come in and at
      // the line end); the closed halls already have walls
      if (stStyle !== 'offen' && stStyle !== 'geschlossen' && stStyle !== 'bogen_zu') {
        // full-height glass only where nobody has to get through: on gondolas when the queue comes from
        // the back/front (people walk along the platforms). On chairlifts people walk in on the snow from
        // the sides, so there the glass is only a high wind screen and you pass underneath it
        const fullGlass = t.kind === 'gondola' && (!valley || this.queue === 'back' || this.queue === 'front');
        const yF = fullGlass ? Math.max(g + 0.3, yc - t.hanger - 0.22 - t.cab[2] + 0.18) : g + 2.9;
        const yT = yc + 0.42, wx0 = 3.2, wx1 = x1 - 1.2, gl = mat(0x9fc0d4, { transparent: true, opacity: 0.32, depthWrite: false });
        if (yT - yF > 0.8 && wx1 - wx0 > 4) for (const sd of [-1, 1]) {
          [x, z] = W((wx0 + wx1) / 2, sd * (hw - 0.12));
          bld.add(gl, BOX, M(x, (yF + yT) / 2, z, yaw, wx1 - wx0, yT - yF, 0.04));
          if (fullGlass) bld.add(steel, BOX, M(x, yF + 1.05, z, yaw, wx1 - wx0, 0.06, 0.08)); // hand rail height transom
          else bld.add(steel, BOX, M(x, yF + 0.04, z, yaw, wx1 - wx0, 0.1, 0.12)); // lower frame of the wind screen
          bld.add(steel, BOX, M(x, yT - 0.03, z, yaw, wx1 - wx0, 0.1, 0.12));
          for (let lx = wx0; lx <= wx1 + 0.01; lx += (wx1 - wx0) / Math.max(1, Math.round((wx1 - wx0) / 2.2))) { [x, z] = W(lx, sd * (hw - 0.12)); bld.add(steel, BOX, M(x, (yF + yT) / 2, z, yaw, 0.09, yT - yF, 0.12)); }
        }
      }
      // name board over the line-end opening
      if (this.name || t.name) {
        const txt = (this.name || t.name).slice(0, 32), cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
        const cx2 = cv.getContext('2d'); cx2.fillStyle = '#' + new THREE.Color(br.accent).getHexString(); cx2.fillRect(0, 0, 512, 96);
        cx2.fillStyle = '#ffffff'; let fs = 56; cx2.font = `700 ${fs}px Arial, sans-serif`; while (fs > 18 && cx2.measureText(txt).width > 480) { fs -= 2; cx2.font = `700 ${fs}px Arial, sans-serif`; }
        cx2.textAlign = 'center'; cx2.textBaseline = 'middle'; cx2.fillText(txt, 256, 50);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const bw = Math.min(Wd - 2, 9);
        [x, z] = W(x1 + 0.2, 0);
        bld.add(new THREE.MeshLambertMaterial({ map: tex }), new THREE.PlaneGeometry(bw, bw * 96 / 512), M(x, yc + 1.25, z, yaw + Math.PI / 2));
      }
      // gondolas: raised boarding floor at cabin-floor height; the cabins run in a channel between
      // the inner island and the outer platforms, kept straight by guide rails
      if (t.kind === 'gondola') this.buildBoardingDeck(bld, { W, yaw, g, yc, r, hw, valley, concrete, dark, steel });
      // loading conveyor / unloading ramp
      [x, z] = W(t.Ls * 0.55, 0);
      if (valley && t.kind === 'chair') bld.add(rubber, rbox(5, 0.14, t.gauge + 1.2, 0.06, 1), M(x, g + 0.2, z, yaw));
      // carrier garage under the station: at closing time the carriers roll down a ramp into a hall
      if (valley) { this.garPath = null; this.garArea = null; this.garSlots = null; }
      if (valley && this.garStyle === 'unter') this.buildRampGarage(bld, { W, yaw, g, yc, hw, r, steel, concrete, dark });
      // carrier garage next to the valley station (detachable lifts park their chairs / cabins here)
      else if (valley) {
        const sideG = this.queue === 'right' ? -1 : 1;
        const gz = sideG > 0 ? hw + 6.5 : -(hw + 13);
        const gx0 = x0 - 1, gx1 = t.Ls * 0.65, gl = gx1 - gx0, gcx = (gx0 + gx1) / 2;
        const gH = Math.max(4.6, t.hs + 1.2);
        [x, z] = W(gcx, gz);
        bld.add(mat(0xd9d6cf), rbox(gl, gH, 10, 0.4), M(x, g + gH / 2, z, yaw));
        bld.add(glass, rbox(gl + 0.06, 1.3, 10.06, 0.42), M(x, g + gH - 1.4, z, yaw));
        bld.add(roof, rbox(gl + 1.2, 0.5, 11.2, 0.22), M(x, g + gH + 0.25, z, yaw));
        bld.add(acc, rbox(gl + 0.1, 0.25, 10.1, 0.1, 1), M(x, g + gH - 0.55, z, yaw));
        this.snowB.add(SNOWM, rbox(gl + 0.8, 0.35, 10.8, 0.17), M(x, g + gH + 0.6, z, yaw));
        // big door towards the station side and the transfer rail into the garage
        [x, z] = W(gcx, gz - sideG * 5.02);
        bld.add(dark, rbox(gl * 0.55, gH - 1.0, 0.1, 0.05, 1), M(x, g + (gH - 1.0) / 2, z, yaw));
        const rz0 = sideG * t.gauge / 2, rz1 = gz - sideG * 5;
        [x, z] = W(gcx, (rz0 + rz1) / 2);
        bld.add(steel, rbox(1.2, 0.25, Math.abs(rz1 - rz0), 0.08, 1), M(x, yc - 0.15, z, yaw));
        // parked carriers visible through the windows
        const cabCol = mat(this.color ?? (t.kind === 'gondola' ? br.cabin : br.cushion));
        const nPark = Math.max(2, Math.floor((gl - 2) / 2.6));
        for (let row = -1; row <= 1; row += 2) for (let k = 0; k < nPark; k++) {
          [x, z] = W(gx0 + 1.6 + k * 2.6, gz + row * 2.2);
          if (t.kind === 'gondola') bld.add(cabCol, rbox(Math.min(2.2, t.cab[0]), Math.min(2.0, t.cab[2]), Math.min(1.8, t.cab[1]), 0.35), M(x, g + gH - 3.1, z, yaw));
          else bld.add(cabCol, rbox(0.6, 0.5, Math.min(3.4, t.seats * 0.5), 0.12), M(x, g + gH - 3.0, z, yaw));
        }
      }
      // operator cabin with wraparound glass
      [x, z] = W(t.Ls - 3, -(t.gauge / 2 + 4.6));
      bld.add(mat(0xe8e4dc), rbox(3.8, 2.9, 3.2, 0.4), M(x, g + 1.6, z, yaw));
      bld.add(glass, rbox(3.88, 1.15, 3.28, 0.42), M(x, g + 2.15, z, yaw));
      bld.add(acc, rbox(4.5, 0.32, 3.9, 0.15), M(x, g + 3.2, z, yaw));
      this.snowB.add(SNOWM, rbox(4.3, 0.3, 3.7, 0.14), M(x, g + 3.45, z, yaw));
      [x, z] = W(t.Ls - 3, -(t.gauge / 2 + 4.6) - 1.62);
      bld.add(dark, rbox(0.95, 2.0, 0.08, 0.04, 1), M(x, g + 1.15, z, yaw));
    } else {
      // fixed grip: bull wheel on a round mast under a mushroom hood
      [x, z] = W(-0.2, 0);
      bld.add(steel, CYL, M(x, (g + yc) / 2, z, yaw, 0.95, yc - g, 0.95));
      bld.add(concrete, CYL, M(x, g + 0.3, z, yaw, 1.8, 0.6, 1.8));
      bld.add(steel, rbox(1.5, 0.9, 1.2, 0.22), M(x, yc + 0.6, z, yaw));
      bld.add(acc, CYLR, M(x, yc + 1.05, z, yaw, 2 * r + 1.1, 0.28, 2 * r + 1.1));
      bld.add(roof, DOME, M(x, yc + 1.18, z, yaw, r + 0.55, 0.75, r + 0.55));
      this.snowB.add(SNOWM, DOME, M(x, yc + 1.22, z, yaw, r + 0.5, 0.88, r + 0.5));
      if (t.kind === 'tbar' || t.kind === 'platter') { [x, z] = W(1.8, 0); bld.add(steel, rbox(3.6, 0.3, 0.3, 0.1, 1), M(x, yc, z, yaw)); }
      // small wooden lift hut with a gable roof
      [x, z] = W(3, -(t.gauge / 2 + 3));
      bld.add(mat(0x7a5536), rbox(2.8, 2.5, 2.6, 0.14), M(x, g + 1.25, z, yaw));
      bld.add(glass, rbox(2.86, 0.9, 2.66, 0.15), M(x, g + 1.6, z, yaw));
      const sh = new THREE.Shape(); sh.moveTo(-1.85, 0); sh.lineTo(1.85, 0); sh.lineTo(0, 1.15); sh.lineTo(-1.85, 0);
      const gable = new THREE.ExtrudeGeometry(sh, { depth: 2.9, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 }).translate(0, 0, -1.45);
      bld.add(mat(0x4b3a2e), gable, M(x, g + 2.5, z, yaw));
      this.snowB.add(SNOWM, gable, M(x, g + 2.68, z, yaw, 0.97, 0.92, 0.98));
    }
    // valley station: turnstiles and queue lanes (behind the station by default, or in front / left / right)
    if (valley && t.kind !== 'tbar' && t.kind !== 'platter') {
      const lanes = Math.max(2, Math.min(6, Math.round(t.seats / 2) + 1));
      const span = t.gauge + 2, lw = span / lanes;
      const side = t.gauge / 2 + (t.detach ? 6.5 : 5);
      const q = this.queue || 'back';
      // (a = distance from the turnstiles along the queue, b = across the lanes) -> station-local (lx, lz)
      const back0 = t.detach ? r + 4.2 : r + 2.2;
      const mid = t.Ls * 0.4;
      const Q = (a, b) => q === 'front' ? [t.Ls + 3 + a, b] : q === 'back' ? [-back0 - a, b] : q === 'right' ? [mid + b, side + a] : [mid + b, -side - a];
      const qy = q === 'front' || q === 'back' ? yaw : yaw + Math.PI / 2;
      for (let k = 0; k <= lanes; k++) {
        const b = -span / 2 + k * lw;
        [x, z] = W(...Q(0, b));
        bld.add(steel, rbox(0.45, 1.1, 0.28, 0.1), M(x, g + 0.55, z, qy));
        if (k < lanes) { [x, z] = W(...Q(0, b + lw / 2)); bld.add(acc, CYL, M(x, g + 0.9, z, qy, 0.06, lw * 0.7, 0.06, Math.PI / 2)); }
        for (let qq = 1; qq <= 4; qq++) { [x, z] = W(...Q(qq * 3, b)); bld.add(mat(0x333333), CYL, M(x, g + 0.5, z, qy, 0.09, 1.0, 0.09)); }
        [x, z] = W(...Q(7.5, b)); bld.add(mat(0x1f5fbf), rbox(9, 0.06, 0.03, 0.01, 1), M(x, g + 0.88, z, qy));
      }
    }
  }

  // housing of a detachable station in one of the STATION_STYLES (above the rope level, open below)
  buildHousing(bld, style, c) {
    const { P, yaw, W, x0, x1, hw, yc, g, steel, roof, acc, dark, glass, concrete } = c;
    const L = x1 - x0, cx = (x0 + x1) / 2, Wd = hw * 2;
    const white = mat(0xf2f2f0), wood = mat(0x8a5a33), woodD = mat(0x5a3b28), plaster = mat(0xe6e0d4), grey = mat(0x4a4f56);
    const at = (geo, m, lx, y, lz = 0, sx = 1, sy = 1, sz = 1) => { const [x, z] = W(lx, lz); bld.add(m, geo, M(x, y, z, yaw, sx, sy, sz)); };
    const atL = (geo, m, y) => bld.add(m, geo, M(P.x, y, P.z, yaw)); // geometry already in local coordinates
    const snow = (geo, y) => this.snowB.add(SNOWM, geo, M(P.x, y, P.z, yaw));
    const glassSides = (y0, h, step = 1.8) => {
      for (const sd of [-1, 1]) { at(BOX, glass, cx, y0 + h / 2, sd * (hw - 0.05), L - 0.4, h, 0.08); for (let lx = x0 + 0.6; lx < x1 - 0.3; lx += step) at(BOX, steel, lx, y0 + h / 2, sd * (hw - 0.02), 0.1, h, 0.12); }
    };
    const portal = (y0, h) => at(rbox(0.25, h, Wd * 0.62, 0.1), dark, x1 + 0.02, y0 + h / 2, 0);
    if (style === 'geschlossen' || style === 'bogen_zu') {
      // closed hall standing on the ground: walls all round, an opening at the line end for the
      // rope and the carriers, a door and windows for the passengers
      const wallM = mat(0xdfe3e6), frameM = mat(0x5d636a), H = (style === 'bogen_zu' ? yc + 1.1 : yc + 2.8) - g;
      const t = this.type, opW = t.gauge + (t.kind === 'gondola' ? 3.4 : 2.2), opB = Math.max(g + 0.3, yc - (t.kind === 'gondola' ? (t.cab ? t.cab[2] + (t.hanger || 1.5) + 0.6 : 4) : (t.hanger || 3.8) + 1.0)), opT = yc + 0.9;
      // side walls with real openings: entrance on one side, exit on the other (people walk through)
      const doorW = 3.2, doorH = 2.8;
      const wallRun = (sd, holes) => {
        let cur = x0;
        for (const hc of holes) {
          const a0 = hc - doorW / 2, a1 = hc + doorW / 2;
          if (a0 > cur + 0.05) at(BOX, wallM, (cur + a0) / 2, g + H / 2, sd * (hw - 0.1), a0 - cur, H, 0.25);
          at(BOX, wallM, hc, g + doorH + (H - doorH) / 2, sd * (hw - 0.1), doorW, H - doorH, 0.25); // lintel
          for (const e of [a0, a1]) at(BOX, frameM, e, g + doorH / 2, sd * (hw - 0.05), 0.16, doorH, 0.34);
          at(BOX, frameM, hc, g + doorH + 0.08, sd * (hw - 0.05), doorW + 0.3, 0.16, 0.34);
          at(BOX, mat(0x30343a), hc, g + 0.03, sd * (hw - 0.1), doorW, 0.06, 1.2); // threshold
          cur = a1;
        }
        if (x1 > cur + 0.05) at(BOX, wallM, (cur + x1) / 2, g + H / 2, sd * (hw - 0.1), x1 - cur, H, 0.25);
      };
      wallRun(-1, [x0 + L * 0.32]); wallRun(1, [x0 + L * 0.62]);
      for (const sd of [-1, 1]) {
        if (g + H > yc + 0.9) { at(BOX, glass, cx, yc + 0.2, sd * (hw + 0.04), L - 1.2, 1.2, 0.06); for (let lx = x0 + 0.6; lx < x1 - 0.3; lx += 2.4) at(BOX, frameM, lx, yc + 0.2, sd * (hw + 0.06), 0.12, 1.25, 0.05); }
        at(BOX, frameM, cx, g + H - 0.3, sd * (hw + 0.02), L + 0.1, 0.25, 0.12); // top band
        // signs above the openings
        const sx = sd < 0 ? x0 + L * 0.32 : x0 + L * 0.62;
        at(BOX, sd < 0 ? mat(0x1f8a4c) : mat(0x2b2f36), sx, g + doorH + 0.55, sd * (hw + 0.08), 1.8, 0.5, 0.06);
      }
      // back wall with a wide opening for the queue
      const bw = Math.min(Wd - 2, 4.5);
      for (const sd of [-1, 1]) at(BOX, wallM, x0 + 0.1, g + H / 2, sd * (bw / 2 + (Wd - bw) / 4), 0.25, H, (Wd - bw) / 2);
      at(BOX, wallM, x0 + 0.1, g + doorH + (H - doorH) / 2, 0, 0.25, H - doorH, bw);
      for (const sd of [-1, 1]) at(BOX, frameM, x0 + 0.05, g + doorH / 2, sd * bw / 2, 0.34, doorH, 0.16);
      at(BOX, frameM, x0 + 0.05, g + doorH + 0.08, 0, 0.34, 0.16, bw + 0.3);
      // front wall with the opening
      const side = (Wd - opW) / 2;
      for (const sd of [-1, 1]) at(BOX, wallM, x1 - 0.1, g + H / 2, sd * (opW / 2 + side / 2), 0.25, H, side);
      if (g + H > opT) at(BOX, wallM, x1 - 0.1, (opT + g + H) / 2, 0, 0.25, g + H - opT, opW);
      if (opB > g + 0.2) at(BOX, wallM, x1 - 0.1, (g + opB) / 2, 0, 0.25, opB - g, opW);
      at(BOX, frameM, x1 + 0.05, opT, 0, 0.12, 0.25, opW + 0.25);
      at(BOX, frameM, x1 + 0.05, opB, 0, 0.12, 0.2, opW + 0.25);
      for (const sd of [-1, 1]) at(BOX, frameM, x1 + 0.05, (opB + opT) / 2, sd * (opW / 2 + 0.06), 0.12, opT - opB, 0.12);
      if (style === 'geschlossen') {
        at(rbox(L + 1.0, 0.6, Wd + 1.0, 0.1), frameM, cx, g + H + 0.3, 0);
        at(rbox(L + 0.9, 0.14, Wd + 0.9, 0.05), white, cx, g + H + 0.65, 0);
        at(rbox(L + 0.6, 0.25, Wd + 0.6, 0.1), SNOWM, cx, g + H + 0.8, 0);
      } else {
        const R = hw + 0.3, ys = g + H;
        atL(archGeo(R, 0.3, L + 0.8).translate(x0 - 0.4, ys, 0), mat(0x2e6cd1), 0);
        atL(archGeo(R + 0.02, 0.32, L + 0.84, Math.PI * 0.42, Math.PI * 0.58).translate(x0 - 0.42, ys, 0), white, 0);
        snow(archGeo(R + 0.08, 0.12, L + 0.7, Math.PI * 0.25, Math.PI * 0.75).translate(x0 - 0.35, ys, 0), 0);
        for (const lx of [x0 + 0.05, x1 - 0.05]) { const sh = new THREE.Shape(); sh.absarc(0, 0, R - 0.1, 0, Math.PI, false); const eg = new THREE.ShapeGeometry(sh, 16); eg.rotateY(Math.PI / 2); if (eg.attributes.uv) eg.deleteAttribute('uv'); at(eg, lx < cx ? mat(0xdfe3e6, { side: THREE.DoubleSide }) : mat(0x6d93ad, { side: THREE.DoubleSide }), lx, ys, 0); }
      }
    } else if (style === 'bogen') {
      const R = hw + 0.35, ys = yc + 1.1;
      for (let lx = x0 + 0.5; lx <= x1 - 0.3; lx += 3) for (const sd of [-1, 1]) at(CYL, steel, lx, (g + ys) / 2, sd * (R - 0.15), 0.4, ys - g, 0.4);
      for (const sd of [-1, 1]) at(BOX, steel, cx, ys + 0.1, sd * (R - 0.15), L + 0.6, 0.35, 0.35);
      atL(archGeo(R, 0.3, L + 1.2).translate(x0 - 0.6, ys, 0), mat(0x2e6cd1), 0);
      atL(archGeo(R + 0.02, 0.32, L + 1.24, Math.PI * 0.42, Math.PI * 0.58).translate(x0 - 0.62, ys, 0), white, 0);
      snow(archGeo(R + 0.08, 0.12, L + 1.1, Math.PI * 0.25, Math.PI * 0.75).translate(x0 - 0.55, ys, 0), 0);
      at(BOX, glass, x0 - 0.5, ys + R * 0.45, 0, 0.08, R * 0.9, Wd * 0.8);
    } else if (style === 'box') {
      glassSides(yc + 0.45, 2.3);
      at(BOX, glass, x0 + 0.05, yc + 1.6, 0, 0.08, 2.3, Wd - 0.2);
      at(rbox(L + 1.4, 0.75, Wd + 1.4, 0.12), grey, cx + 0.3, yc + 3.1, 0);
      at(rbox(L + 1.3, 0.12, Wd + 1.3, 0.05), white, cx + 0.3, yc + 3.52, 0);
      this.snowB.add(SNOWM, rbox(L + 1.1, 0.25, Wd + 1.1, 0.1), M(...(() => { const [x, z] = W(cx + 0.3, 0); return [x, yc + 3.65, z]; })(), yaw));
      portal(yc + 0.5, 1.2);
    } else if (style === 'porsche') {
      // sweeping wing roof: low at the back, rising and overhanging towards the line
      const pts = [], n = 14, th = 0.35;
      for (let i = 0; i <= n; i++) { const u = i / n, lx = x0 - 1 + u * (L + 3.5); pts.push([lx, yc + 1.7 + Math.sin(u * Math.PI * 0.85) * 1.3 + u * 0.6]); }
      for (let i = n; i >= 0; i--) { const [lx, y] = pts[i]; pts.push([lx, y - th]); }
      atL(profileGeo(pts, Wd + 1.2), white, 0);
      atL(profileGeo(pts.slice(0, n + 1).map(([lx, y]) => [lx, y + 0.02]).concat(pts.slice(0, n + 1).reverse().map(([lx, y]) => [lx, y - 0.1])), Wd + 1.25).translate(0, -th + 0.04, 0), acc, 0);
      snow(profileGeo(pts.slice(0, n + 1).map(([lx, y]) => [lx, y + 0.12]).concat(pts.slice(0, n + 1).reverse()), Wd + 0.9), 0);
      glassSides(yc + 0.45, 1.6, 2.4);
      portal(yc + 0.5, 1.1);
    } else if (style === 'giebel') {
      for (const sd of [-1, 1]) {
        at(BOX, plaster, cx, yc + 1.5, sd * (hw - 0.15), L, 2.2, 0.3);
        for (let lx = x0 + 1.2; lx < x1 - 0.8; lx += 2.2) { at(BOX, glass, lx, yc + 1.8, sd * (hw - 0.0), 1.1, 0.9, 0.1); at(BOX, woodD, lx, yc + 1.3, sd * hw, 1.25, 0.08, 0.14); }
      }
      at(BOX, plaster, x0 + 0.15, yc + 1.5, 0, 0.3, 2.2, Wd);
      const rh = hw * 0.75;
      atL(crossProfileGeo([[-hw - 0.9, 0], [0, rh], [hw + 0.9, 0], [hw + 0.9, -0.25], [0, rh - 0.3], [-hw - 0.9, -0.25]], L + 1.6).translate(x0 - 0.8, yc + 2.6, 0), woodD, 0);
      snow(crossProfileGeo([[-hw - 0.85, 0.05], [0, rh + 0.1], [hw + 0.85, 0.05], [hw + 0.85, -0.05], [0, rh - 0.02], [-hw - 0.85, -0.05]], L + 1.4).translate(x0 - 0.7, yc + 2.62, 0), 0);
      atL(crossProfileGeo([[-hw, 0], [0, rh - 0.3], [hw, 0]], 0.2).translate(x0, yc + 2.6, 0), wood, 0);
      portal(yc + 0.5, 1.6);
    } else if (style === 'keil') {
      const th = 0.45, pts = [[x0 - 0.6, yc + 1.4], [x1 + 2.2, yc + 3.9], [x1 + 2.2, yc + 3.9 - th], [x0 - 0.6, yc + 1.4 - th]];
      atL(profileGeo(pts, Wd + 1.0), grey, 0);
      atL(profileGeo([[x0 - 0.6, yc + 1.42], [x1 + 2.2, yc + 3.92], [x1 + 2.2, yc + 3.8], [x0 - 0.6, yc + 1.3]], Wd + 1.05), acc, 0);
      snow(profileGeo([[x0 - 0.5, yc + 1.5], [x1 + 2.1, yc + 4.0], [x1 + 2.1, yc + 3.9], [x0 - 0.5, yc + 1.4]], Wd + 0.8), 0);
      for (const sd of [-1, 1]) atL(profileGeo([[x0, yc + 0.45], [x1, yc + 0.45], [x1, yc + 3.4], [x0, yc + 1.1]], 0.08).translate(0, 0, sd * (hw - 0.05)), glass, 0);
      portal(yc + 0.5, 1.2);
    } else if (style === 'holz') {
      for (const sd of [-1, 1]) {
        at(BOX, dark, cx, yc + 1.75, sd * (hw - 0.2), L, 2.6, 0.2);
        for (let lx = x0 + 0.15; lx < x1; lx += 0.32) at(BOX, wood, lx, yc + 1.75, sd * (hw - 0.05), 0.12, 2.6, 0.12);
      }
      at(BOX, glass, x1 - 0.1, yc + 2.4, 0, 0.1, 1.3, Wd - 1.2);
      at(rbox(L + 1.0, 0.45, Wd + 1.0, 0.1), mat(0x2b2b2b), cx, yc + 3.25, 0);
      at(rbox(L + 0.8, 0.25, Wd + 0.8, 0.1), SNOWM, cx, yc + 3.55, 0);
      portal(yc + 0.5, 1.4);
    } else if (style === 'offen') {
      for (let lx = x0 + 0.2; lx <= x1; lx += L / 3) for (const sd of [-1, 1]) at(CYL, steel, lx, (g + yc + 2.3) / 2, sd * (hw + 0.2), 0.35, yc + 2.3 - g, 0.35);
      for (const sd of [-1, 1]) {
        at(BOX, steel, cx, yc + 2.25, sd * (hw + 0.2), L + 0.6, 0.4, 0.25);
        for (let k = 0; k < 6; k++) { const lx = x0 + (k + 0.5) * L / 6; at(BOX, steel, lx, yc + 1.75, sd * (hw + 0.2), 0.08, 1.2, 0.08); }
      }
      for (let lx = x0; lx <= x1 + 0.1; lx += L / 5) at(BOX, steel, lx, yc + 2.5, 0, 0.18, 0.3, Wd + 0.6);
      at(rbox(L + 2, 0.18, Wd + 1.6, 0.06), mat(0xc8ccd0), cx, yc + 2.75, 0);
      at(rbox(L + 1.8, 0.18, Wd + 1.4, 0.06), SNOWM, cx, yc + 2.9, 0);
    } else if (style === 'beton') {
      for (const sd of [-1, 1]) { at(BOX, concrete, cx, yc + 1.0, sd * (hw - 0.2), L, 1.2, 0.4); at(BOX, glass, cx, yc + 2.0, sd * (hw - 0.15), L - 0.4, 0.8, 0.3); at(BOX, concrete, cx, yc + 2.75, sd * (hw - 0.2), L, 0.7, 0.4); }
      at(BOX, concrete, x0 + 0.2, yc + 1.9, 0, 0.4, 2.9, Wd);
      at(rbox(L + 1.6, 0.6, Wd + 1.6, 0.05), concrete, cx, yc + 3.4, 0);
      at(rbox(L + 1.4, 0.25, Wd + 1.4, 0.1), SNOWM, cx, yc + 3.75, 0);
      portal(yc + 0.5, 1.3);
    } else if (style === 'welle') {
      const n = 24, th = 0.3, pts = [];
      for (let i = 0; i <= n; i++) { const u = i / n, lx = x0 - 0.8 + u * (L + 1.8); pts.push([lx, yc + 2.7 + Math.sin(u * Math.PI * 3) * 0.45]); }
      const prof = pts.concat(pts.slice().reverse().map(([lx, y]) => [lx, y - th]));
      atL(profileGeo(prof, Wd + 1.0), white, 0);
      atL(profileGeo(pts.map(([lx, y]) => [lx, y - th]).concat(pts.slice().reverse().map(([lx, y]) => [lx, y - th - 0.12])), Wd + 1.04), acc, 0);
      snow(profileGeo(pts.map(([lx, y]) => [lx, y + 0.12]).concat(pts.slice().reverse()), Wd + 0.7), 0);
      glassSides(yc + 0.45, 1.8);
      portal(yc + 0.5, 1.2);
    } else { // glas: tall rounded glass pavilion
      const sh = new THREE.Shape(), a0 = x0 - 0.4, a1 = x1 + 0.4, h = hw + 0.3, rc = Math.min(2.5, h * 0.8);
      sh.moveTo(a0 + rc, -h); sh.lineTo(a1 - rc, -h); sh.quadraticCurveTo(a1, -h, a1, -h + rc); sh.lineTo(a1, h - rc); sh.quadraticCurveTo(a1, h, a1 - rc, h);
      sh.lineTo(a0 + rc, h); sh.quadraticCurveTo(a0, h, a0, h - rc); sh.lineTo(a0, -h + rc); sh.quadraticCurveTo(a0, -h, a0 + rc, -h);
      atL(planExtrude(sh, 3.2), glass, yc + 0.45);
      for (let lx = a0 + 1.5; lx < a1 - 1; lx += 2) for (const sd of [-1, 1]) at(BOX, steel, lx, yc + 2.05, sd * h, 0.1, 3.2, 0.12);
      atL(planExtrude(sh, 0.3, 0.25, 3), white, yc + 3.65);
      snow(planExtrude(sh, 0.12, 0.2, 2), yc + 4.1);
      portal(yc + 0.5, 1.2);
    }
  }

  // ramp + underground hall beside the valley station (like a real "Garage unter der Station")
  buildRampGarage(bld, c) {
    const { W, yaw, g, yc, hw, r, steel, concrete, dark } = c, t = this.type;
    const rs = this.queue === 'left' ? 1 : -1; // on the side where the carriers come back down
    // parking layout: several storage rails side by side under the ceiling, carriers in rows on them
    const Wd = (t.seats || 4) * 0.58 + 0.25;
    let along = 1.6, across = Wd + 0.5, depth = (t.hanger || 4) + 0.6;
    if (t.kind === 'gondola') { along = t.cab[0] + 0.5; across = t.cab[1] + 0.8; depth = t.hanger + 0.22 + t.cab[2]; }
    if (t.kind === 'kombi') { along = Math.max(along, t.cab[0] + 0.5); across = Math.max(across, t.cab[1] + 0.8); depth = Math.max(depth, t.ghanger + 0.22 + t.cab[2]); }
    const W2 = 15, nRails = Math.max(1, Math.floor((W2 - 1.2) / across));
    const need = Math.ceil((2 * (this.L || 600) + 4 * t.Ls) / t.spacing * 1.4) + 4;
    const hallL = clamp(Math.ceil(need / nRails) * along + 5, 24, 70);
    const z0 = hw + 2.5, rampL = 6, lx = 0.5;
    // the hall floor must stay under the hanging carriers: the ramp only drops as far as there is room
    const gInside = (() => { let m = -Infinity; for (const dz of [0.3, 0.6, 0.95]) for (const dx of [-W2 / 2 + 1, 0, W2 / 2 - 1]) { const [wx, wz] = W(lx + dx, rs * (z0 + rampL + hallL * dz)); m = Math.max(m, heightAt(this.world, wx, wz)); } return m; })();
    const drop = clamp(yc - depth - gInside - 0.35, 0, 3.2);
    const P = (x, lz, y) => { const [wx, wz] = W(x, lz); return { x: wx, y, z: wz }; };
    const railAt = (d) => { const u = Math.min(1, Math.max(0, d / (rampL + 1))); return yc - drop * (u * u * (3 - 2 * u)); };
    // carrier path: out of the station sideways, down the ramp and into the hall under the deck
    const path = [P(lx, rs * r, yc), P(lx, rs * z0, yc)];
    for (let i = 1; i <= 10; i++) { const d = i / 10 * (rampL + 1); path.push(P(lx, rs * (z0 + d), railAt(d))); }
    const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z));
    this.garPath = { pts: path, cum, len: cum[cum.length - 1] };
    const ground = (x, lz) => { const [wx, wz] = W(x, lz); return heightAt(this.world, wx, wz); };
    const at = (geo, m, x, y, lz, sx, sy, sz) => { const [wx, wz] = W(x, lz); bld.add(m, geo, M(wx, y, wz, yaw, sx, sy, sz)); };
    // rail
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.15, (a.z + b.z) / 2);
      const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      bld.add(steel, BOX, new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir), new THREE.Vector3(d + 0.05, 0.22, 0.22)));
    }
    // ramp: rail carried by a steel frame, low concrete side walls
    for (let d = 0; d <= rampL; d += 3) { const lz = rs * (z0 + d), ry = railAt(d), gy = ground(lx, lz); at(CYL, steel, lx, (gy + ry) / 2 + 0.3, lz, 0.3, ry - gy + 0.6, 0.3); at(BOX, steel, lx, ry + 0.5, lz, 3.4, 0.25, 0.25); }
    // the hall: concrete walls, a big opening towards the station, a walkable deck on top
    const zA = z0 + rampL, zB = zA + hallL, deckY = yc + 1.3;
    // storage rails and their parking slots (filled in the order the carriers arrive)
    const railY = yc - drop;
    this.garSlots = [];
    const slotZ0 = zA + 1.5 + along / 2, nPer = Math.max(1, Math.floor((hallL - 3) / along));
    const railXs = [...Array(nRails)].map((_, ri) => lx + (ri - (nRails - 1) / 2) * across);
    for (let k = 0; k < nPer; k++) for (const rx of railXs) { const p = P(rx, rs * (zB - 1 - along / 2 - k * along), railY); p.entry = P(rx, rs * (zA + 1), railY); this.garSlots.push(p); }
    for (const rx of railXs) at(BOX, steel, rx, railY + 0.42, rs * (zA + 0.5 + (hallL - 1) / 2), 0.16, 0.16, hallL - 1);
    // transfer rail across the hall entrance
    at(BOX, steel, lx, railY + 0.42, rs * (zA + 1), Math.max(1, (nRails - 1) * across + 0.6), 0.16, 0.16);
    void slotZ0;
    this.garSlotDir = (() => { const [ax, az] = W(lx, 0), [bx, bz] = W(lx, rs); return { tx: bx - ax, tz: bz - az }; })();
    // concrete floor inside, lights under the ceiling
    at(BOX, concrete, lx, gInside + 0.05, rs * (zA + hallL / 2), W2 - 0.5, 0.3, hallL - 0.5);
    const lampM = mat(0xffffff, { emissive: 0xfff6e0, emissiveIntensity: 0.9 });
    for (let zz = zA + 3; zz < zB - 1; zz += 5) for (const dx of [-W2 / 4, W2 / 4]) at(BOX, lampM, lx + dx, deckY - 0.5, rs * zz, 0.15, 0.05, 1.6);
    let gLow = Infinity; for (const dz of [zA, (zA + zB) / 2, zB]) for (const dx of [-W2 / 2, 0, W2 / 2]) gLow = Math.min(gLow, ground(lx + dx, rs * dz));
    const wallH = deckY - (gLow - 1.5), wy = (deckY + gLow - 1.5) / 2;
    for (const sd of [-1, 1]) at(BOX, concrete, lx + sd * W2 / 2, wy, rs * (zA + hallL / 2), 0.5, wallH, hallL);
    at(BOX, concrete, lx, wy, rs * zB, W2, wallH, 0.5);
    const opW = 6.5, side = (W2 - opW) / 2;
    for (const sd of [-1, 1]) at(BOX, concrete, lx + sd * (opW / 2 + side / 2), wy, rs * zA, side, wallH, 0.5);
    at(BOX, concrete, lx, deckY - 0.5, rs * zA, opW, 1.0, 0.5); // lintel over the opening
    at(BOX, mat(0x3a3e44), lx, (deckY - 0.3 + gLow) / 2, rs * (zA + hallL / 2), W2 - 0.6, 0.02, 0.02); // (inside is open now)
    at(BOX, mat(0x4a4f56), lx, deckY - 1.0, rs * zA - rs * 0.27, opW + 0.4, 0.15, 0.06);
    // deck: slab, snow, railing all round, stairs down
    at(rbox(W2 + 0.6, 0.45, hallL + 0.6, 0.12), concrete, lx, deckY, rs * (zA + hallL / 2), 1, 1, 1);
    this.snowB.add(SNOWM, rbox(W2, 0.18, hallL, 0.08), M(...(() => { const [wx, wz] = W(lx, rs * (zA + hallL / 2)); return [wx, deckY + 0.3, wz]; })(), yaw));
    const railM = mat(0x2b3a8a);
    for (const sd of [-1, 1]) { at(BOX, railM, lx + sd * (W2 / 2 + 0.1), deckY + 1.1, rs * (zA + hallL / 2), 0.06, 0.06, hallL); for (let k = 0; k <= 8; k++) at(BOX, railM, lx + sd * (W2 / 2 + 0.1), deckY + 0.65, rs * (zA + k * hallL / 8), 0.06, 0.9, 0.06); }
    at(BOX, railM, lx, deckY + 1.1, rs * zB, W2, 0.06, 0.06);
    at(BOX, railM, lx, deckY + 1.1, rs * zA, W2, 0.06, 0.06);
    this.garArea = [{ ...P(lx, rs * (zA + hallL / 2), 0), r: 20 }];
  }
  takeSlot(k) {
    if (!this.garSlots) return;
    this.garSlotOf = this.garSlotOf || new Map();
    if (this.garSlotOf.has(k)) return;
    const used = new Set(this.garSlotOf.values());
    for (let i = 0; i < this.garSlots.length; i++) if (!used.has(i)) { this.garSlotOf.set(k, i); return; }
    this.garSlotOf.set(k, -1);
  }
  // after the ramp: across the transfer rail to the storage rail, then along it to the slot
  slotLeg(s, slot) {
    const G = this.garPath, A = G.pts[G.pts.length - 1], B = slot.entry, C = slot;
    const l1 = Math.hypot(B.x - A.x, B.z - A.z), l2 = Math.hypot(C.x - B.x, C.z - B.z);
    if (s >= l1 + l2) return null;
    const out = {};
    const [P0, P1, u] = s < l1 ? [A, B, s / Math.max(0.01, l1)] : [B, C, (s - l1) / Math.max(0.01, l2)];
    out.x = lerp(P0.x, P1.x, u); out.y = lerp(P0.y, P1.y, u); out.z = lerp(P0.z, P1.z, u);
    // carriers keep facing along the storage rails
    out.tx = this.garSlotDir.tx; out.tz = this.garSlotDir.tz;
    return out;
  }
  // carriers rolling down into the garage: position along the ramp path (s from 0)
  garPos(s, out) {
    const G = this.garPath, pts = G.pts, cum = G.cum;
    let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const a = pts[i], b = pts[i + 1], u = Math.min(1, Math.max(0, (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1)));
    out.x = a.x + (b.x - a.x) * u; out.y = a.y + (b.y - a.y) * u; out.z = a.z + (b.z - a.z) * u; out.tx = b.x - a.x; out.tz = b.z - a.z;
    return out;
  }

  // stand-alone station model for the building menu preview (no world needed)
  // a single tower for the picker thumbnails
  static towerPreview(typeKey, brandKey, style, h) {
    const o = Object.create(Lift.prototype);
    o.typeKey = typeKey; o.brandKey = brandKey; o.color = null; o.snowB = new Builder(); o.lean = false; o.twStyleAll = 'auto';
    o.towers = [{ d: 0, h, style, pad: 'off', tilt: 0 }];
    o.towerModes = []; o.towerArcs = []; o.towerTilts = []; o.towerStyles = []; o._ks = 1; o._kink = null;
    o.ground = () => 0;
    const grp = new THREE.Group(), bld = new Builder();
    if (o.type.towerStyle === 'tram') o.buildTramTower(bld, 0, 0, 0, h, 0, 0, 0, 0);
    else o.buildTower(bld, 0, 0, 0, h, 0, 0, 0, 0.02, -0.02);
    bld.build(grp);
    return grp;
  }

  static stationPreview(typeKey, brandKey, style) {
    const o = Object.create(Lift.prototype);
    o.typeKey = typeKey; o.brandKey = brandKey; o.stStyle = style; o.queue = 'back'; o.color = null; o.snowB = new Builder();
    const grp = new THREE.Group(), bld = new Builder();
    if (o.type.kind === 'tram' || o.type.threeS) { o.towers = []; o.buildTramStation(bld, { x: 0, z: 0 }, 0, { x: 1, z: 0 }, true); }
    else o.buildStation(bld, { x: 0, z: 0 }, 0, { x: 1, z: 0 }, false);
    bld.build(grp);
    return grp;
  }

  // mid-station: the cabins slow down and pass straight through a long hall
  buildMidStation(bld) {
    const t = this.type, br = this.brand;
    const d0 = this.mid.d, P = this.pointAt(d0), g = this.ground(d0), yc = g + t.hs;
    const ud = this.dirAt(d0), yaw = -Math.atan2(ud.z, ud.x);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => [P.x + lx * c + lz * s, P.z - lx * s + lz * c];
    const concrete = mat(0xadaba5), steel = mat(br.mast), roof = mat(br.roof), acc = mat(br.accent), glass = mat(0x6d93ad);
    const L = t.Ls + 4, Wd = t.gauge + 4;
    let [x, z] = W(0, 0);
    bld.add(concrete, rbox(L + 6, 1.6, Wd + 10, 0.4), M(x, g - 0.65, z, yaw));
    for (const lx of [-L / 2 + 2, 0, L / 2 - 2]) for (const sd of [-1, 1]) { [x, z] = W(lx, sd * (Wd / 2 - 0.4)); bld.add(steel, CYL, M(x, (g + yc + 0.8) / 2, z, yaw, 0.62, yc + 0.8 - g, 0.62)); }
    for (const side of [-1, 1]) { [x, z] = W(0, side * t.gauge / 2); bld.add(steel, rbox(L - 2, 0.22, 0.22, 0.08, 1), M(x, yc - 0.15, z, yaw)); }
    [x, z] = W(0, 0);
    bld.add(roof, rbox(L, 1.0, Wd, 0.3), M(x, yc + 0.95, z, yaw));
    bld.add(glass, rbox(L - 0.4, 1.1, Wd + 0.06, 0.35), M(x, yc + 2.0, z, yaw));
    bld.add(acc, rbox(L + 0.1, 0.22, Wd + 0.1, 0.1, 1), M(x, yc + 1.5, z, yaw));
    bld.add(roof, rbox(L + 1.6, 0.6, Wd + 1.6, 0.3), M(x, yc + 2.85, z, yaw));
    this.snowB.add(SNOWM, rbox(L + 1.2, 0.4, Wd + 1.2, 0.2), M(x, yc + 3.3, z, yaw));
    // waiting hall on the side with stairs
    [x, z] = W(0, -(Wd / 2 + 4));
    bld.add(mat(0xe8e4dc), rbox(10, 3.2, 5, 0.4), M(x, g + 1.6, z, yaw));
    bld.add(glass, rbox(10.06, 1.2, 5.06, 0.42), M(x, g + 2.1, z, yaw));
    bld.add(acc, rbox(10.8, 0.3, 5.8, 0.14), M(x, g + 3.35, z, yaw));
    const tex = signTexture('Mittelstation', br.accent);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.userData.own = true;
    [x, z] = W(0, -(Wd / 2 + 6.6)); sign.position.set(x, g + 4.2, z); sign.rotation.y = yaw; this.group.add(sign);
  }

  // drag-lift bend over 15 degrees: each rope side runs around a big horizontal bullwheel on the inside
  // of the curve (the hangers pass round the outside of the wheel, like at the end stations)
  buildDeflectTower(bld, g, top, k, idx) {
    const t = this.type, br = this.brand, r = t.gauge / 2;
    const mMast = mat(br.mast), mDark = mat(0x2b2b2b), mAcc = mat(br.accent), concrete = mat(0x9b9b96);
    const inn = k.ang > 0 ? 1 : -1, nIn = { x: -k.bis.z * inn, z: k.bis.x * inn };
    const centers = [];
    for (const sd of [-1, 1]) {
      const m = this.offsetAt(k.d, r * sd);
      const C = { x: m.x + nIn.x * BIG_R, z: m.z + nIn.z * BIG_R };
      centers.push(C);
      const gc = heightAt(this.world, C.x, C.z), wy = top;
      // bullwheel with spokes, hub and a drive-like housing on top
      bld.add(mDark, new THREE.TorusGeometry(BIG_R, 0.13, 8, 40).rotateX(Math.PI / 2), M(C.x, wy, C.z));
      for (let q = 0; q < 4; q++) bld.add(mDark, CYL, M(C.x, wy - 0.05, C.z, q * Math.PI / 4, 0.12, 0.12, BIG_R * 2, Math.PI / 2));
      bld.add(mMast, CYL, M(C.x, wy + 0.1, C.z, 0, 0.8, 0.45, 0.8));
      bld.add(mAcc, CYLR, M(C.x, wy + 0.55, C.z, 0, BIG_R * 2 + 0.6, 0.22, BIG_R * 2 + 0.6));
      bld.add(this.type.kind === 'platter' ? mMast : mat(br.roof), DOME, M(C.x, wy + 0.66, C.z, 0, BIG_R + 0.35, 0.55, BIG_R + 0.35));
      this.snowB.add(SNOWM, DOME, M(C.x, wy + 0.7, C.z, 0, BIG_R + 0.3, 0.62, BIG_R + 0.3));
      // tapered mast under the wheel
      const hM = wy - gc;
      bld.add(mMast, new THREE.CylinderGeometry(0.32, 0.55, 1, 14), M(C.x, gc + hM / 2 - 0.2, C.z, 0, 1, hM + 0.4, 1));
      bld.add(concrete, rbox(2.2, 1.2, 2.2, 0.4), M(C.x, gc - 0.15, C.z));
      if (this.padOn(idx, C.x, C.z)) this.snowB.add(PADM, CYLR, M(C.x, gc + 1.5, C.z, 0, 1.6, 2.8, 1.6));
    }
    // brace between the two wheel masts
    const [A, B] = centers, dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz);
    if (l > 0.5) bld.add(mMast, rbox(l, 0.35, 0.35, 0.1, 1), M((A.x + B.x) / 2, top + 0.95, (A.z + B.z) / 2, -Math.atan2(dz, dx)));
    void g;
  }

  // angle mid-station: two station halls (one per section) joined by a round hall at the bend. The
  // cabins detach, run slowly on a curved rail around the bend and re-attach to the rope; the haul
  // rope is led around big horizontal deflection bullwheels under the rails.
  buildAngleStation(bld) {
    const t = this.type, br = this.brand, k = this.kinks[this.mid.v], V = this.P[k.i];
    const M2 = this.midRange(), g = this.ground(this.mid.d), yc = g + t.hs;
    const concrete = mat(0xadaba5), steel = mat(br.mast), roof = mat(br.roof), acc = mat(br.accent), glass = mat(0x6d93ad), dark = mat(0x26292c);
    const Wd = t.gauge + 5, r = t.gauge / 2;
    const a = this.segDir[k.i - 1], b = this.segDir[k.i];
    const halls = [[a, -(this.mid.d - M2[0]) - 2], [b, M2[1] - this.mid.d + 2]];
    for (const [u, len] of halls) {
      const yaw = -Math.atan2(u.z, u.x), c = Math.cos(yaw), s2 = Math.sin(yaw);
      const W = (lx, lz) => [V.x + lx * c + lz * s2, V.z - lx * s2 + lz * c];
      const L = Math.abs(len), cx = len / 2;
      let [x, z] = W(cx, 0);
      bld.add(concrete, rbox(L, 1.6, Wd + 8, 0.4), M(x, g - 0.65, z, yaw));
      bld.add(roof, rbox(L, 1.0, Wd, 0.3), M(x, yc + 0.95, z, yaw));
      bld.add(acc, rbox(L + 0.1, 0.22, Wd + 0.1, 0.1, 1), M(x, yc + 1.5, z, yaw));
      bld.add(glass, rbox(L - 0.3, 1.1, Wd + 0.06, 0.35), M(x, yc + 2.0, z, yaw));
      bld.add(roof, rbox(L + 1.2, 0.6, Wd + 1.6, 0.3), M(x, yc + 2.85, z, yaw));
      this.snowB.add(SNOWM, rbox(L + 0.8, 0.4, Wd + 1.2, 0.2), M(x, yc + 3.3, z, yaw));
      for (let lx = Math.sign(len) * 3; Math.abs(lx) < L - 1; lx += Math.sign(len) * 6) for (const sd of [-1, 1]) { [x, z] = W(lx, sd * (Wd / 2 - 0.4)); bld.add(steel, CYL, M(x, (g + yc + 0.8) / 2, z, yaw, 0.62, yc + 0.8 - g, 0.62)); }
      // dark rope portal at the hall end
      [x, z] = W(len, 0); bld.add(dark, rbox(0.25, 1.0, t.gauge + 0.8, 0.12), M(x, yc + 0.95, z, yaw));
    }
    // round hall over the bend (covers the wedge between the two halls)
    const R = Wd / 2 * 1.05;
    bld.add(concrete, CYLR, M(V.x, g - 0.65, V.z, 0, (Wd + 8) * 1.05, 1.6, (Wd + 8) * 1.05));
    bld.add(roof, CYLR, M(V.x, yc + 0.95, V.z, 0, R * 2, 1.0, R * 2));
    bld.add(acc, CYLR, M(V.x, yc + 1.5, V.z, 0, R * 2 + 0.1, 0.22, R * 2 + 0.1));
    bld.add(glass, CYLR, M(V.x, yc + 2.0, V.z, 0, R * 2 - 0.1, 1.1, R * 2 - 0.1));
    bld.add(roof, CYLR, M(V.x, yc + 2.85, V.z, 0, R * 2 + 1.4, 0.6, R * 2 + 1.4));
    this.snowB.add(SNOWM, DOME, M(V.x, yc + 3.1, V.z, 0, R + 0.5, 0.6, R + 0.5));
    // curved transfer rails (both sides) following the carriers' path
    for (const sd of [-1, 1]) {
      let prev = null;
      for (let d = M2[0] + 0.5; d <= M2[1] - 0.5; d += 1.5) {
        const q = this.offsetAt(d, r * sd);
        if (prev) { const dx = q.x - prev.x, dz = q.z - prev.z, l = Math.hypot(dx, dz); bld.add(steel, rbox(l + 0.15, 0.22, 0.22, 0.06, 1), M((q.x + prev.x) / 2, yc - 0.15, (q.z + prev.z) / 2, -Math.atan2(dz, dx))); }
        prev = q;
      }
    }
    // deflection bullwheels: the rope of each side is led around a big horizontal wheel at the bend
    const inn = k.ang > 0 ? 1 : -1;
    let nx = -a.z - b.z, nz = a.x + b.x; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const wr = Math.max(1.6, r * 0.75);
    for (const [sd, wy] of [[inn, yc - 1.1], [-inn, yc - 1.5]]) {
      const cxw = V.x + nx * r * sd * 0.55, czw = V.z + nz * r * sd * 0.55;
      bld.add(dark, new THREE.TorusGeometry(wr, 0.16, 8, 36).rotateX(Math.PI / 2), M(cxw, wy, czw, 0));
      for (let q = 0; q < 3; q++) bld.add(dark, CYL, M(cxw, wy, czw, q * Math.PI / 3, 0.14, 0.14, wr * 2, Math.PI / 2));
      bld.add(steel, CYL, M(cxw, (g + wy) / 2, czw, 0, 0.7, wy - g, 0.7));
    }
    // waiting hall with sign on the outside of the bend
    const ox = -nx * inn, oz = -nz * inn, hy = -Math.atan2(oz, ox) + Math.PI / 2;
    const hx = V.x + ox * (Wd / 2 + 7), hz = V.z + oz * (Wd / 2 + 7);
    bld.add(mat(0xe8e4dc), rbox(10, 3.2, 5, 0.4), M(hx, g + 1.6, hz, hy));
    bld.add(glass, rbox(10.06, 1.2, 5.06, 0.42), M(hx, g + 2.1, hz, hy));
    bld.add(acc, rbox(10.8, 0.3, 5.8, 0.14), M(hx, g + 3.35, hz, hy));
    this.snowB.add(SNOWM, rbox(10.6, 0.3, 5.6, 0.14), M(hx, g + 3.6, hz, hy));
    const tex = signTexture('Mittelstation', br.accent);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.userData.own = true;
    sign.position.set(V.x + ox * (Wd / 2 + 9.8), g + 4.2, V.z + oz * (Wd / 2 + 9.8)); sign.rotation.y = hy; this.group.add(sign);
  }

  addSigns() {
    const t = this.type, br = this.brand;
    const text = this.displayName;
    if (t.kind === 'carpet') return;
    const tex = signTexture(text, br.accent);
    const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    for (const [P, g, u] of [[this.A, this.gA, this.dir], [this.B, this.gB, { x: -this.dirB.x, z: -this.dirB.z }]]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.1), m);
      sign.userData.own = true;
      const lx = (t.kind === 'tram' || t.threeS ? t.Ls + 3 : t.Ls + 1.5), lz = -(t.gauge / 2 + (t.kind === 'tram' || t.threeS ? 7 : 2.5));
      const x = P.x + u.x * lx + (-u.z) * lz * -1, z = P.z + u.z * lx + u.x * lz * -1;
      const sx = P.x + u.x * lx - (-u.z) * lz, sz = P.z + u.z * lx - u.x * lz;
      void x; void z;
      sign.position.set(sx, g + (t.kind === 'tram' || t.threeS ? t.hs + 4 : 3.2), sz);
      sign.rotation.y = -Math.atan2(u.z, u.x) + Math.PI / 2;
      this.group.add(sign);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, sign.position.y - g, 0.15), mat(0x666666));
      post.position.set(sx, (sign.position.y + g) / 2 - 0.4, sz);
      this.group.add(post);
    }
    m.userData = {}; // material disposed via sign meshes
    this.signMat = m;
  }

  // ---------- magic carpet ----------
  buildCarpet(bld) {
    const t = this.type, w = this.world;
    const n = Math.max(2, Math.ceil(this.L / 2));
    this.profile = [];
    for (let i = 0; i <= n; i++) { const d = this.L * i / n; const p = this.pointAt(d); this.profile.push({ d, x: p.x, z: p.z, y: this.ground(d) + 0.35 }); }
    const pos = [], uv = [], idx = [];
    let acc = 0;
    this.profile.forEach((p, i) => {
      if (i) acc += Math.hypot(p.d - this.profile[i - 1].d, p.y - this.profile[i - 1].y);
      for (const sd of [-1, 1]) { pos.push(p.x + this.right.x * 0.55 * sd, p.y + 0.02, p.z + this.right.z * 0.55 * sd); uv.push(sd < 0 ? 0 : 1, acc / 2); }
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    });
    this.carpetLen = acc;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = 64; const cx = cvs.getContext('2d');
    cx.fillStyle = '#1e2226'; cx.fillRect(0, 0, 16, 64); cx.fillStyle = '#3b4148'; for (let k = 0; k < 4; k++) cx.fillRect(0, k * 16, 16, 5);
    this.beltTex = new THREE.CanvasTexture(cvs); this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
    const belt = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.beltTex, side: THREE.DoubleSide }));
    belt.userData.own = true;
    this.group.add(belt);
    const yaw = -Math.atan2(this.dir.z, this.dir.x);
    for (let i = 0; i < this.profile.length - 1; i++) {
      const a = this.profile[i], b = this.profile[i + 1];
      const len = Math.hypot(b.d - a.d, b.y - a.y), pitch = Math.atan2(b.y - a.y, b.d - a.d);
      for (const sd of [-1, 1]) {
        const ox = this.right.x * 0.75 * sd, oz = this.right.z * 0.75 * sd;
        bld.add(mat(0x9aa3ab), BOX, M((a.x + b.x) / 2 + ox, (a.y + b.y) / 2 + 0.05, (a.z + b.z) / 2 + oz, yaw, len, 0.3, 0.15, 0, pitch));
      }
    }
    if (this.cover) {
      const segs = [];
      for (let i = 0; i < this.profile.length - 1; i++) {
        const a = this.profile[i], b = this.profile[i + 1];
        const len = Math.hypot(b.d - a.d, b.y - a.y), pitch = Math.atan2(b.y - a.y, b.d - a.d);
        const g = new THREE.CylinderGeometry(2.15, 2.15, len, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).toNonIndexed();
        g.deleteAttribute('uv');
        g.applyMatrix4(M((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.3, (a.z + b.z) / 2, yaw, 1, 1.12, 1, 0, pitch));
        segs.push(g);
      }
      const gal = new THREE.Mesh(mergeGeometries(segs), new THREE.MeshLambertMaterial({ color: 0xbfe0f5, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
      gal.userData.own = true;
      this.group.add(gal);
    }
    for (const P of [this.profile[0], this.profile[this.profile.length - 1]]) bld.add(mat(0x777777), BOX, M(P.x, P.y - 0.2, P.z, yaw, 3, 0.4, 2.2));
    // riders
    const fig = skierGeometry();
    const n2 = Math.max(1, Math.floor(this.carpetLen / this.spacing));
    this.nCarriers = n2;
    this.riderJ = new THREE.InstancedMesh(fig.jacket, mat(0xffffff), n2);
    this.riderR = new THREE.InstancedMesh(fig.rest, new THREE.MeshLambertMaterial({ vertexColors: true }), n2);
    this.riderR.userData.own = true;
    const col = new THREE.Color();
    for (let i = 0; i < n2; i++) this.riderJ.setColorAt(i, col.setHex(JACKETS[(i * 7 + this.id) % JACKETS.length]));
    for (const m of [this.riderJ, this.riderR]) { m.frustumCulled = false; this.group.add(m); }
  }

  carpetPos(dist, out) {
    const pr = this.profile;
    const d = clamp(dist / Math.max(1, this.carpetLen) * this.L, 0, this.L);
    const i = Math.min(pr.length - 2, Math.floor(d / this.L * (pr.length - 1)));
    const a = pr[i], b = pr[i + 1], u = clamp((d - a.d) / (b.d - a.d || 1), 0, 1);
    out.x = lerp(a.x, b.x, u); out.y = lerp(a.y, b.y, u); out.z = lerp(a.z, b.z, u);
    return out;
  }

  // ---------- funicular ----------
  buildFunicular(bld) {
    const t = this.type, br = this.brand;
    const n = Math.max(4, Math.ceil(this.L / 4));
    const raw = [];
    for (let i = 0; i <= n; i++) { const d = this.L * i / n; raw.push({ d, g: this.ground(d) }); }
    let y;
    const prof = this.trackProfile();
    if (prof) {
      // user track points: straight sections between them (tunnels where the track is below the ground)
      y = raw.map((p) => prof(p.d));
      for (let pass = 0; pass < 3; pass++) { const ny = y.slice(); for (let i = 2; i < y.length - 2; i++) ny[i] = (y[i - 2] + y[i - 1] + y[i] + y[i + 1] + y[i + 2]) / 5; y = ny; }
    } else {
      y = raw.map((p) => p.g + 0.6);
      for (let pass = 0; pass < 6; pass++) {
        const ny = y.slice();
        for (let i = 1; i < y.length - 1; i++) { let s = 0, c = 0; for (let k = -5; k <= 5; k++) { const j = clamp(i + k, 0, y.length - 1); s += y[j]; c++; } ny[i] = Math.max(s / c, raw[i].g + 0.4); }
        y = ny;
      }
    }
    this.track = raw.map((p, i) => { const q = this.pointAt(p.d); return { d: p.d, x: q.x, z: q.z, y: y[i], g: p.g }; });
    const cum = [0];
    for (let i = 1; i < this.track.length; i++) cum.push(cum[i - 1] + Math.hypot(this.track[i].d - this.track[i - 1].d, this.track[i].y - this.track[i - 1].y));
    this.trackCum = cum; this.trackLen = cum[cum.length - 1];
    const yaw = -Math.atan2(this.dir.z, this.dir.x);
    const steel = mat(0x55595e), concrete = mat(0xa8a8a2), wood = mat(0x5a4a3a);
    for (let i = 0; i < this.track.length - 1; i++) {
      const a = this.track[i], b = this.track[i + 1];
      const len = Math.hypot(b.d - a.d, b.y - a.y), pitch = Math.atan2(b.y - a.y, b.d - a.d);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
      for (const tr of [-1, 1]) {
        const ox = this.right.x * tr * t.gauge / 2, oz = this.right.z * tr * t.gauge / 2;
        for (const rl of [-0.6, 0.6]) bld.add(steel, BOX, M(mx + ox + this.right.x * rl, my + 0.1, mz + oz + this.right.z * rl, yaw, len + 0.02, 0.12, 0.08, 0, pitch));
        bld.add(wood, BOX, M(mx + ox, my - 0.02, mz + oz, yaw, 0.25, 0.12, 1.7, 0, pitch));
      }
      const under = my < a.g - 3;
      if (!under) bld.add(concrete, BOX, M(mx, my - 0.35, mz, yaw, len + 0.05, 0.5, t.gauge + 2.4, 0, pitch));
      // tunnel portal where the track goes into / comes out of the mountain
      const da = a.y - a.g, db = b.y - b.g;
      if ((da > -1.2) !== (db > -1.2)) {
        const pg = new THREE.ExtrudeGeometry(PORTAL_SHAPE, { depth: 3, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2 }).translate(0, 0, -1.5).rotateY(Math.PI / 2);
        bld.add(concrete, pg, M(mx, my - 0.6, mz, yaw, 1, 1, (t.gauge + 6) / 10, 0, 0));
        bld.add(mat(0x080808, { side: THREE.DoubleSide }), new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2), M(mx + this.dir.x * (db < da ? 1.5 : -1.5), my + 2.4, mz + this.dir.z * (db < da ? 1.5 : -1.5), yaw, 1, 5.8, t.gauge + 4));
      }
      if (i % 4 === 0 && my - a.g > 1.6) {
        const h = my - 0.6 - a.g + 1;
        bld.add(concrete, BOX, M(mx, a.g - 1 + h / 2, mz, yaw, 1.2, h, t.gauge + 1.5));
      }
    }
    // stations
    for (const [P, g, u, i] of [[this.A, this.gA, this.dir, 0], [this.B, this.gB, { x: -this.dir.x, z: -this.dir.z }, this.track.length - 1]]) {
      const yw = -Math.atan2(u.z, u.x), c = Math.cos(yw), s = Math.sin(yw);
      const W = (lx, lz) => [P.x + lx * c + lz * s, P.z - lx * s + lz * c];
      const ty = this.track[i].y;
      let [x, z] = W(t.Ls / 2 - 4, 0);
      const HL = t.Ls + 10, HW = t.gauge + 10;
      bld.add(concrete, rbox(HL, 5, HW, 0.7), M(x, ty - 2.5, z, yw));
      // arched hall roof on round columns, glass side walls
      const arch = new THREE.CylinderGeometry(HW / 2 + 0.6, HW / 2 + 0.6, 1, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
      bld.add(mat(br.roof, { side: THREE.DoubleSide }), arch, M(x, ty + 5.6, z, yw + Math.PI / 2, 1, 0.42, HL + 1));
      this.snowB.add(SNOWM, arch, M(x, ty + 5.85, z, yw + Math.PI / 2, 0.92, 0.42, HL));
      for (const sd of [-1, 1]) {
        for (let lx = -8; lx <= t.Ls - 2 + 0.01; lx += (t.Ls + 6) / 4) { [x, z] = W(lx, sd * (HW / 2 - 0.4)); bld.add(mat(br.mast), CYL, M(x, ty + 2.8, z, yw, 0.5, 5.6, 0.5)); }
        [x, z] = W(t.Ls / 2 - 4, sd * (HW / 2 - 0.35)); bld.add(mat(0x6d93ad), rbox(HL - 2, 3.2, 0.12, 0.05, 1), M(x, ty + 2.2, z, yw));
      }
      [x, z] = W(-8.5, 0); bld.add(mat(br.accent), rbox(0.6, 5.6, HW - 0.6, 0.25), M(x, ty + 2.8, z, yw));
      [x, z] = W(-8.9, 0); bld.add(mat(0x6d93ad), rbox(0.2, 3.4, HW - 4, 0.08), M(x, ty + 2.2, z, yw));
      void g;
    }
    // haul rope
    const pts = this.track.map((p) => new THREE.Vector3(p.x, p.y + 0.15, p.z));
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x222222 })));
    // cars
    const carL = 14;
    const cabin = [], glass = [], under = [];
    const add = (arr, geo, m) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (g.attributes.uv) g.deleteAttribute('uv'); g.applyMatrix4(m); arr.push(g); };
    for (let k = 0; k < 4; k++) {
      const x0 = -carL / 2 + carL / 8 + k * carL / 4, step = (k - 1.5) * 0.9;
      add(cabin, rbox(carL / 4 - 0.05, 2.6, 2.8, 0.35), M(x0, 1.6 - step, 0, 0));
      add(glass, rbox(carL / 4 - 0.4, 1.0, 2.86, 0.3), M(x0, 2.1 - step, 0, 0));
    }
    add(under, rbox(carL, 0.6, 2.4, 0.2), M(0, 0.3, 0, 0));
    const color = this.color ?? br.cabin;
    this.carParts = [
      new THREE.InstancedMesh(mergeGeometries(cabin), mat(color), 2),
      new THREE.InstancedMesh(mergeGeometries(glass), mat(0x2c3e4f), 2),
      new THREE.InstancedMesh(mergeGeometries(under), mat(0x333333), 2),
    ];
    for (const m of this.carParts) { m.frustumCulled = false; m.castShadow = true; this.group.add(m); }
    this.carL = carL;
    this.nCarriers = 2;
    this.travel = this.trackLen - 2 * (t.Ls * 0.5);
    this.Tt = this.travel / this.speed + 10;
    this.dwell = 30;
  }

  trackPos(dist, side, out) {
    const tr = this.track, cum = this.trackCum, t = this.type;
    dist = clamp(dist, 0, this.trackLen - 0.01);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= dist) lo = m; else hi = m; }
    const a = tr[lo], b = tr[lo + 1], u = (dist - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    out.x = lerp(a.x, b.x, u) + this.right.x * side * t.gauge / 2; out.y = lerp(a.y, b.y, u); out.z = lerp(a.z, b.z, u) + this.right.z * side * t.gauge / 2;
    out.pitch = Math.atan2(b.y - a.y, b.d - a.d);
    return out;
  }

  // ---------- aerial tramway ----------
  buildTramSides() {
    const t = this.type;
    const sup = this.supports();
    const r = t.gauge / 2;
    this.sides = (t.single ? [0] : [1, -1]).map((sign) => {
      const pts = [];
      for (let i = 0; i < sup.length - 1; i++) {
        const a = sup[i], b = sup[i + 1];
        const span = b.d - a.d;
        const n = Math.max(1, Math.ceil(span / 10));
        for (let k = 0; k < n; k++) {
          const uu = k / n, d = a.d + span * uu, p = this.pointAt(d);
          const st = a.st && b.st;
          pts.push({ x: p.x + this.right.x * r * sign, y: lerp(a.y, b.y, uu) - (st ? 0 : this.sagAt(span, uu)), z: p.z + this.right.z * r * sign, d });
        }
      }
      const last = sup[sup.length - 1], p = this.pointAt(last.d);
      pts.push({ x: p.x + this.right.x * r * sign, y: last.y, z: p.z + this.right.z * r * sign, d: last.d });
      // over the towers the ropes lie in the curved saddles, then ease back into the free span
      const arcs = (this.towerArcs || []).filter(Boolean);
      if (arcs.length) {
        const spanY = (d) => { for (let i = 0; i < sup.length - 1; i++) { const a = sup[i], b = sup[i + 1]; if (d >= a.d && d <= b.d) { const sp = b.d - a.d, u = (d - a.d) / Math.max(0.01, sp); return lerp(a.y, b.y, u) - (a.st && b.st ? 0 : this.sagAt(sp, u)); } } return last.y; };
        const at = (d, y) => { const q = this.pointAt(d); return { x: q.x + this.right.x * r * sign, y, z: q.z + this.right.z * r * sign, d }; };
        const blendL = (a) => Math.max(10, a.tl * 2);
        const out = pts.filter((q) => !arcs.some((a) => Math.abs(q.d - a.d) < a.tl / 2 + blendL(a)));
        for (const a of arcs) {
          const arcY = (lx) => a.top + a.sm * lx + a.ds / (2 * a.tl) * lx * lx, arcS = (lx) => a.sm + a.ds / a.tl * lx;
          for (let k = 0; k <= 8; k++) { const lx = -a.tl / 2 + a.tl * k / 8; out.push(at(a.d + lx, arcY(lx))); }
          for (const sd of [-1, 1]) {
            const e = sd * a.tl / 2, ye = arcY(e), se = arcS(e), B = blendL(a);
            const off0 = ye - spanY(a.d + e); void se;
            for (let k = 1; k <= 8; k++) { const f = k / 8, lx = e + sd * B * f, d = a.d + lx; if (d <= 0.5 || d >= this.L - 0.5) continue; const w = f * f * (3 - 2 * f); out.push(at(d, spanY(d) + off0 * (1 - w))); }
          }
        }
        out.sort((u, v) => u.d - v.d);
        pts.length = 0; pts.push(...out);
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
      return { pts, cum, len: cum[cum.length - 1] };
    });
    this.stop = t.Ls * 0.45;
    this.travel = this.sides[0].len - 2 * this.stop;
    this.Tt = this.travel / this.speed + 8;
    this.dwell = 25;
  }

  // power / signal cable from the valley station over the tower tops to the mountain station, sagging
  // a little in each span, in the middle between the two rope lines
  buildCable() {
    const t = this.type, pts = this.cablePts.filter(Boolean);
    const anchor = (P, g) => ({ x: P.x, y: g + t.hs + 3.6, z: P.z });
    const chain = [anchor(this.A, this.gA), ...pts, anchor(this.B, this.gB)];
    const line = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1], sp = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(4, Math.ceil(sp / 8)), sag = sp * 0.018;
      for (let k = i ? 1 : 0; k <= n; k++) { const u = k / n; line.push(new THREE.Vector3(lerp(a.x, b.x, u), lerp(a.y, b.y, u) - 4 * sag * u * (1 - u), lerp(a.z, b.z, u))); }
    }
    this.group.add(ropeMesh(line, 0.032));
  }

  // orange rope riders (Seilreiter) on long spans of aerial tramways / 3S: small brackets that keep
  // the track ropes and the haul rope together. Kept small so they don't stand out.
  buildRopeRiders() {
    const t = this.type, sup = this.supports();
    if (t.twoS || t.funifor || t.cabrio) return;
    const tram = t.kind === 'tram';
    const spanY = (d) => { for (let i = 0; i < sup.length - 1; i++) { const a = sup[i], b = sup[i + 1]; if (d >= a.d && d <= b.d) { const sp = b.d - a.d, u = (d - a.d) / Math.max(0.01, sp); return lerp(a.y, b.y, u) - (a.st && b.st ? 0 : this.sagAt(sp, u)); } } return sup[sup.length - 1].y; };
    const bld = new Builder(), orange = mat(0xf26a1b), dark = mat(0x2b2b2b);
    const signs = tram ? (t.single ? [0] : [1, -1]) : [1, -1];
    const tw = tram ? 0.7 : 0.8, hy = tram ? -1.25 : -0.4;
    const step = tram ? 170 : 240;
    for (let i = 0; i < sup.length - 1; i++) {
      const a = sup[i], b = sup[i + 1], sp = b.d - a.d;
      if (sp < step * 1.2) continue;
      const n = Math.floor(sp / step);
      for (let k = 1; k <= n; k++) {
        const d = a.d + sp * k / (n + 1);
        const ud = this.dirAt(d), yaw = -Math.atan2(ud.z, ud.x);
        const slope = (spanY(d + 2) - spanY(d - 2)) / 4;
        for (const sg of signs) {
          const o = this.offsetAt(d, sg * t.gauge / 2), y = spanY(d);
          // triangle: top bar between the two track ropes, two arms down to the haul rope at the tip
          const P3 = (lz, dy) => { const q = this.offsetAt(d, sg * t.gauge / 2 + lz); return new THREE.Vector3(q.x, y + dy, q.z); };
          const bar = (A, B, r) => { const dv = B.clone().sub(A), len = dv.length(); bld.add(orange, BOX, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.normalize()), new THREE.Vector3(r, len, r * 0.6))); };
          const L1 = P3(-tw - 0.12, 0.1), R1 = P3(tw + 0.12, 0.1), T1 = P3(0, hy - 0.05);
          bar(L1, R1, 0.12); bar(L1, T1, 0.1); bar(R1, T1, 0.1);
          bld.add(dark, CYL, M(o.x, y + hy, o.z, yaw, 0.2, 0.18, 0.2, Math.PI / 2));
        }
      }
    }
    bld.build(this.group);
  }

  sidePos(side, dist, out) {
    const { pts, cum } = side;
    dist = clamp(dist, 0, side.len - 0.001);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= dist) lo = m; else hi = m; }
    const a = pts[lo], b = pts[lo + 1], u = (dist - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    out.x = lerp(a.x, b.x, u); out.y = lerp(a.y, b.y, u); out.z = lerp(a.z, b.z, u);
    return out;
  }

  buildTramCabins() {
    if (this.type.funifor || this.type.cabrio || this.type.decks) return this.buildTramCabins2();
    const br = this.brand, U = GFX.ultra;
    const metal = [], body = [], glassA = [], dark = [], pax = [], white = [];
    const add = (arr, geo, m) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (g.attributes.uv) g.deleteAttribute('uv'); g.applyMatrix4(m); arr.push(g); };
    const bar = (arr, A, B, r) => { const d = B.clone().sub(A), len = d.length(); const g = BOX.clone(); g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(r, len, r))); const g2 = g.index ? g.toNonIndexed() : g; if (g2.attributes.uv) g2.deleteAttribute('uv'); arr.push(g2); };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // carriage: a long frame on each track rope with 8 wheels in balancer pairs, cross beams,
    // the haul rope fixed at both ends (lower), hanger pivot in the middle
    // the carriage is its own mesh: it rides on the track ropes and takes their slope, the hanger hangs plumb
    const cm = [], cd = [];
    for (const sd of [-0.7, 0.7]) {
      add(cm, rbox(6.2, 0.32, 0.26, 0.08, 1), M(0, 0.42, sd, 0));
      for (let k = 0; k < 4; k++) { const bx = -2.25 + k * 1.5; add(cm, rbox(1.1, 0.24, 0.3, 0.06, 1), M(bx, 0.3, sd, 0)); for (const wx of [-0.3, 0.3]) add(cd, CYL, M(bx + wx, 0.13, sd, 0, 0.34, 0.09, 0.34, Math.PI / 2)); }
      for (const ex of [-2.9, 2.9]) bar(cm, V(ex, 0.3, sd), V(ex, -1.25, 0), 0.12); // haul rope anchors
    }
    for (const ex of [-2.4, 0, 2.4]) add(cm, rbox(0.35, 0.28, 1.6, 0.06, 1), M(ex, 0.35, 0, 0));
    add(cm, rbox(0.9, 0.4, 0.5, 0.1, 1), M(0, 0.05, 0, 0)); // hanger pivot
    // hanger: fixed at the OUTER side of the carriage (beside the wheels), then a big C bow out and
    // down to the middle of the roof - so it passes outside the rope shoes and the tower head
    const yRoof = -5.35;
    for (const ex of [-1.6, 1.6]) bar(cm, V(ex, 0.15, 0.55), V(ex * 0.15, 0.0, 1.75), 0.22); // arms out of the carriage, meeting at the pin
    add(cm, rbox(0.7, 0.36, 0.36, 0.1, 1), M(0, 0.0, 1.75, 0)); // knuckle around the pivot pin (on the pitch axis)
    add(cd, CYL, M(0, 0, 1.75, 0, 0.12, 0.62, 0.12, Math.PI / 2)); // pivot pin
    // hanger head: hangs plumb from the pin, carries the two bows
    add(metal, rbox(0.34, 0.6, 0.3, 0.08, 1), M(0, -0.3, 1.78, 0));
    add(metal, rbox(2.9, 0.3, 0.32, 0.08, 1), M(0, -0.58, 1.9, 0));
    const cPts = [V(0, -0.58, 1.9), V(0, -1.1, 2.3), V(0, -2.4, 2.45), V(0, -3.9, 2.05), V(0, -4.75, 1.1), V(0, yRoof + 0.22, 0.0)];
    for (const ex of [-0.75, 0.75]) {
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cPts.map((p) => p.clone().setX(ex))), 28, 0.15, 8, false);
      tube.applyMatrix4(new THREE.Matrix4().makeScale(1.7, 1, 1).premultiply(new THREE.Matrix4().makeTranslation(ex - ex * 1.7, 0, 0)));
      add(metal, tube, M(0, 0, 0, 0));
    }
    for (const p of [cPts[1], cPts[2], cPts[3]]) add(metal, rbox(1.75, 0.18, 0.18, 0.05, 1), M(0, p.y, p.z, 0)); // ties between the two bows
    add(metal, rbox(5.4, 0.32, 1.2, 0.1, 1), M(0, yRoof + 0.2, 0, 0));
    // cabin: rounded body, tall panoramic glass all round, slim posts, roof with railing
    const Lc = 7.4, Wc = 3.9, yB = -8.85;
    const R = (y, sx, sz, rr = 1) => ({ y, a: Lc / 2 * sx, b: Wc / 2 * sz, r: 1.0 * rr * Math.min(sx, sz) });
    add(body, ringStack([R(yB, 0.9, 0.86, 0.8), R(yB + 0.18, 0.98, 0.97), R(yB + 0.55, 1, 1), R(yB + 0.95, 1, 1)], U ? 5 : 3, true, false), M(0, 0, 0, 0));
    add(dark, ringStack([R(yB + 0.95, 1.004, 1.004), R(yB + 1.05, 1.004, 1.004)], U ? 5 : 3), M(0, 0, 0, 0));
    add(glassA, ringStack([R(yB + 1.05, 1, 1), R(yB + 2.4, 0.985, 0.98), R(yB + 2.95, 0.97, 0.96)], U ? 5 : 3), M(0, 0, 0, 0));
    add(body, ringStack([R(yB + 2.95, 0.975, 0.965), R(yB + 3.3, 0.96, 0.95), R(yB + 3.5, 0.9, 0.86, 0.9)], U ? 5 : 3, false, true), M(0, 0, 0, 0));
    add(white, ringStack([R(yB + 0.75, 1.006, 1.006), R(yB + 0.82, 1.006, 1.006)], U ? 5 : 3), M(0, 0, 0, 0));
    for (let k = 0; k <= 5; k++) for (const sd of [-1, 1]) { const x = -Lc / 2 + 0.9 + k * (Lc - 1.8) / 5; add(dark, BOX, M(x, yB + 2.0, sd * (Wc / 2 + 0.01), 0, 0.09, 1.9, 0.04)); }
    for (const sx of [-1, 1]) for (const z of [-0.8, 0.8]) add(dark, BOX, M(sx * (Lc / 2 + 0.005), yB + 2.0, z, 0, 0.04, 1.9, 0.08));
    // door seams on one side
    for (const x of [-0.75, 0.75]) add(dark, BOX, M(x, yB + 1.5, Wc / 2 + 0.02, 0, 0.05, 2.8, 0.03));
    // roof railing around the maintenance deck
    if (U) {
      for (const [x, z] of [[-2.8, -1.45], [2.8, -1.45], [2.8, 1.45], [-2.8, 1.45], [0, -1.45], [0, 1.45]]) add(metal, BOX, M(x, yB + 3.95, z, 0, 0.05, 0.9, 0.05));
      for (const z of [-1.45, 1.45]) add(metal, BOX, M(0, yB + 4.4, z, 0, 5.6, 0.05, 0.05));
      for (const x of [-2.8, 2.8]) add(metal, BOX, M(x, yB + 4.4, 0, 0, 0.05, 0.05, 2.9));
      // passengers standing inside
      for (let k = 0; k < 14; k++) { const x = -2.9 + (k % 7) * 0.95 + (k > 6 ? 0.4 : 0), z = k > 6 ? 0.8 : -0.7; add(pax, rbox(0.42, 1.0, 0.32, 0.12, 1), M(x, yB + 0.95, z, 0)); add(dark, new THREE.SphereGeometry(0.13, 8, 6), M(x, yB + 1.6, z, 0)); }
    }
    add(dark, rbox(Lc * 0.92, 0.06, Wc * 0.9, 0.03, 1), M(0, yB + 0.25, 0, 0));
    const parts = [
      { geo: mergeGeometries(metal), mat: mat(0x5c6268) },
      { geo: mergeGeometries(body), mat: mat(this.color ?? br.cabin) },
      { geo: mergeGeometries(glassA), mat: U ? mat(0x3d5b73, { transparent: true, opacity: 0.45, depthWrite: false }) : mat(0x2c3e4f) },
      { geo: mergeGeometries(dark), mat: mat(0x1c1f22) },
      { geo: mergeGeometries(white), mat: mat(0xf2f4f6) },
    ];
    if (pax.length) parts.push({ geo: mergeGeometries(pax), mat: mat(0x2f5f9e) });
    parts.push({ geo: mergeGeometries(cm), mat: mat(0x5c6268), grip: true }, { geo: mergeGeometries(cd), mat: mat(0x1c1f22), grip: true });
    this.nCarriers = this.type.single ? 1 : 2;
    this.carrierMeshes = parts.map((p) => { const im = new THREE.InstancedMesh(p.geo, p.mat, this.nCarriers); im.frustumCulled = false; im.castShadow = true; im.userData.grip = !!p.grip; this.group.add(im); return im; });
  }

  // Twinliner (double deck), Funifor (wide track, short hanger) and CabriO (double deck, open top,
  // ropes beside the cabin)
  buildTramCabins2() {
    const t = this.type, br = this.brand, U = GFX.ultra;
    const metal = [], body = [], glassA = [], dark = [], pax = [], white = [], cm = [], cd = [];
    const add = (arr, geo, m) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (g.attributes.uv) g.deleteAttribute('uv'); g.applyMatrix4(m); arr.push(g); };
    const bar = (arr, A, B, r) => { const d = B.clone().sub(A), len = d.length(); if (len < 0.01) return; const g = BOX.clone(); g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(r, len, r))); const g2 = g.index ? g.toNonIndexed() : g; if (g2.attributes.uv) g2.deleteAttribute('uv'); arr.push(g2); };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // a rope carriage (bogie row) running on one track rope at lateral z
    const bogie = (z, len) => {
      add(cm, rbox(len, 0.3, 0.26, 0.08, 1), M(0, 0.42, z, 0));
      const n = Math.max(2, Math.round(len / 1.5));
      for (let k = 0; k < n; k++) { const bx = -len / 2 + 0.75 + k * (len - 1.5) / Math.max(1, n - 1); add(cm, rbox(1.0, 0.24, 0.3, 0.06, 1), M(bx, 0.3, z, 0)); for (const wx of [-0.28, 0.28]) add(cd, CYL, M(bx + wx, 0.13, z, 0, 0.32, 0.09, 0.32, Math.PI / 2)); }
    };
    let Lc, Wc, yB, decks = t.decks || 1, openTop = !!t.cabrio;
    if (t.funifor) {
      // Funifor: wide track (stable in wind), carriage across both track ropes, short hanger
      const to = t.trackOff;
      for (const sd of [-to, to]) bogie(sd, 5.4);
      for (const ex of [-2.2, 0, 2.2]) add(cm, rbox(0.34, 0.3, 2 * to + 0.3, 0.06, 1), M(ex, 0.38, 0, 0));
      for (const sd of [-1, 1]) for (const ex of [-2.4, 2.4]) bar(cm, V(ex, 0.3, sd * to), V(ex, -0.45, sd * (to - 0.55)), 0.12); // haul rope clamps
      add(cm, rbox(1.0, 0.36, 1.0, 0.1, 1), M(0, 0.12, 0, 0)); // hanger pivot
      Lc = 7.0; Wc = 3.4; yB = -6.0;
      const yR = yB + 0.95 + 3.15 + 0.45;
      // short hanger: a frame from the pivot down to the roof girder
      for (const ex of [-1, 1]) for (const ez of [-1, 1]) bar(metal, V(ex * 0.35, -0.05, ez * 0.35), V(ex * 2.2, yR + 0.3, ez * 1.1), 0.2);
      add(metal, rbox(5.2, 0.3, 2.6, 0.08, 1), M(0, yR + 0.2, 0, 0));
    } else if (t.cabrio) {
      // CabriO: the track ropes run beside the cabin; on each side a carriage with a cantilever down to
      // the frame around the cabin, which turns about an axis a little above the floor of the top deck
      const to = t.trackOff;
      Lc = 6.4; Wc = 4.2; yB = -4.4;
      for (const sd of [-1, 1]) {
        bogie(sd * to, 4.8);
        for (const ex of [-1.9, 1.9]) bar(cm, V(ex, 0.3, sd * to), V(ex, -0.7, sd * to), 0.12); // haul rope clamps below
        for (const ex of [-1.2, 1.2]) bar(cm, V(ex, 0.3, sd * to), V(ex * 0.3, -0.25, sd * (Wc / 2 + 0.25)), 0.22); // cantilever
        add(cd, CYL, M(0, -0.25, sd * (Wc / 2 + 0.25), 0, 0.3, 0.3, 0.3, Math.PI / 2)); // bearing
      }
      // frame ring around the cabin at the top deck floor
      const Rr = (y, k) => ({ y, a: Lc / 2 * k, b: Wc / 2 * k, r: 1.6 * k });
      add(metal, ringStack([Rr(-0.55, 1.07), Rr(-0.3, 1.07)], U ? 6 : 4), M(0, 0, 0, 0));
      for (const sd of [-1, 1]) add(metal, rbox(0.4, 0.5, 0.25, 0.06, 1), M(0, -0.35, sd * (Wc / 2 + 0.12), 0));
    } else {
      // Twinliner: carriage like the big trams, C bows down to a tall double-deck cabin
      for (const sd of [-0.7, 0.7]) bogie(sd, 6.4);
      for (const ex of [-2.9, 2.9]) bar(cm, V(ex, 0.3, 0), V(ex, -1.25, 0), 0.12);
      for (const ex of [-2.4, 0, 2.4]) add(cm, rbox(0.35, 0.28, 1.6, 0.06, 1), M(ex, 0.35, 0, 0));
      for (const ex of [-1.6, 1.6]) bar(cm, V(ex, 0.15, 0.55), V(ex * 0.15, 0.0, 1.75), 0.22);
      add(cm, rbox(0.7, 0.36, 0.36, 0.1, 1), M(0, 0.0, 1.75, 0));
      add(metal, rbox(0.34, 0.6, 0.3, 0.08, 1), M(0, -0.3, 1.78, 0));
      add(metal, rbox(2.9, 0.3, 0.32, 0.08, 1), M(0, -0.58, 1.9, 0));
      const yRoof = -5.35;
      const cPts = [V(0, -0.58, 1.9), V(0, -1.1, 2.3), V(0, -2.4, 2.55), V(0, -3.9, 2.25), V(0, -4.75, 1.2), V(0, yRoof + 0.22, 0.0)];
      for (const ex of [-0.85, 0.85]) {
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cPts.map((p) => p.clone().setX(ex))), 28, 0.16, 8, false);
        tube.applyMatrix4(new THREE.Matrix4().makeScale(1.7, 1, 1).premultiply(new THREE.Matrix4().makeTranslation(ex - ex * 1.7, 0, 0)));
        add(metal, tube, M(0, 0, 0, 0));
      }
      for (const q of [cPts[1], cPts[2], cPts[3]]) add(metal, rbox(1.95, 0.18, 0.18, 0.05, 1), M(0, q.y, q.z, 0));
      add(metal, rbox(6.2, 0.34, 1.3, 0.1, 1), M(0, yRoof + 0.2, 0, 0));
      Lc = 9.4; Wc = 4.4; yB = yRoof - 7.7;
    }
    // cabin body: one or two decks, rounded, with tall glass bands
    const R = (y, sx, sz, rr = 1) => ({ y, a: Lc / 2 * sx, b: Wc / 2 * sz, r: 1.1 * rr * Math.min(sx, sz) });
    const seg = U ? 5 : 3;
    add(body, ringStack([R(yB, 0.9, 0.86, 0.8), R(yB + 0.18, 0.98, 0.97), R(yB + 0.55, 1, 1), R(yB + 0.95, 1, 1)], seg, true, false), M(0, 0, 0, 0));
    const deckH = 3.15;
    for (let dk = 0; dk < decks; dk++) {
      const y0 = yB + 0.95 + dk * deckH;
      const top = dk === decks - 1;
      if (top && openTop) {
        // open top deck: a glass parapet at hip height and the floor
        add(glassA, ringStack([R(y0, 1, 1), R(y0 + 1.15, 1, 1)], seg), M(0, 0, 0, 0));
        add(metal, ringStack([R(y0 + 1.15, 1.01, 1.01), R(y0 + 1.22, 1.01, 1.01)], seg), M(0, 0, 0, 0));
        add(dark, rbox(Lc * 0.9, 0.08, Wc * 0.88, 0.04, 1), M(0, y0 + 0.02, 0, 0));
        if (U) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, x = Math.cos(a) * Lc * 0.32, z = Math.sin(a) * Wc * 0.3; add(pax, rbox(0.42, 1.0, 0.32, 0.12, 1), M(x, y0 + 0.55, z, 0)); add(dark, new THREE.SphereGeometry(0.13, 8, 6), M(x, y0 + 1.2, z, 0)); }
        add(metal, CYL, M(Lc * 0.3, y0 - 1.4, 0, 0, 0.9, 2.9, 0.9)); // spiral stair core up from the lower deck
        continue;
      }
      add(dark, ringStack([R(y0, 1.004, 1.004), R(y0 + 0.1, 1.004, 1.004)], seg), M(0, 0, 0, 0));
      add(glassA, ringStack([R(y0 + 0.1, 1, 1), R(y0 + 2.3, 0.99, 0.985)], seg), M(0, 0, 0, 0));
      if (!top || decks === 1 || !openTop) add(body, ringStack([R(y0 + 2.3, 0.99, 0.985), R(y0 + deckH - 0.05, 1, 1)], seg), M(0, 0, 0, 0));
      for (let k = 0; k <= 6; k++) for (const sd of [-1, 1]) { const x = -Lc / 2 + 0.8 + k * (Lc - 1.6) / 6; add(dark, BOX, M(x, y0 + 1.2, sd * (Wc / 2 + 0.01), 0, 0.09, 2.2, 0.04)); }
      add(dark, rbox(Lc * 0.92, 0.06, Wc * 0.9, 0.03, 1), M(0, y0 - 0.65, 0, 0));
      if (U) for (let k = 0; k < 12; k++) { const x = -Lc * 0.38 + (k % 6) * Lc * 0.15, z = k > 5 ? 0.85 : -0.8; add(pax, rbox(0.42, 1.0, 0.32, 0.12, 1), M(x, y0 + 0.5, z, 0)); add(dark, new THREE.SphereGeometry(0.13, 8, 6), M(x, y0 + 1.15, z, 0)); }
    }
    if (!openTop) {
      const yT = yB + 0.95 + decks * deckH;
      add(body, ringStack([R(yT - 0.05, 1, 1), R(yT + 0.25, 0.96, 0.95), R(yT + 0.45, 0.88, 0.85, 0.9)], seg, false, true), M(0, 0, 0, 0));
    }
    add(white, ringStack([R(yB + 0.75, 1.006, 1.006), R(yB + 0.82, 1.006, 1.006)], seg), M(0, 0, 0, 0));
    for (const x of [-0.75, 0.75]) add(dark, BOX, M(x, yB + 1.6, Wc / 2 + 0.02, 0, 0.05, 2.6, 0.03));
    const parts = [
      { geo: mergeGeometries(metal), mat: mat(0x5c6268) },
      { geo: mergeGeometries(body), mat: mat(this.color ?? br.cabin) },
      { geo: mergeGeometries(glassA), mat: U ? mat(0x3d5b73, { transparent: true, opacity: 0.45, depthWrite: false }) : mat(0x2c3e4f) },
      { geo: mergeGeometries(dark), mat: mat(0x1c1f22) },
      { geo: mergeGeometries(white), mat: mat(0xf2f4f6) },
    ];
    if (pax.length) parts.push({ geo: mergeGeometries(pax), mat: mat(0x2f5f9e) });
    parts.push({ geo: mergeGeometries(cm), mat: mat(0x5c6268), grip: true }, { geo: mergeGeometries(cd), mat: mat(0x1c1f22), grip: true });
    this.nCarriers = t.single ? 1 : 2;
    this.carrierMeshes = parts.map((p) => { const im = new THREE.InstancedMesh(p.geo, p.mat, this.nCarriers); im.frustumCulled = false; im.castShadow = true; im.userData.grip = !!p.grip; this.group.add(im); return im; });
  }

  shuttleU() {
    const cyc = 2 * (this.Tt + this.dwell);
    const ph = ((this.time % cyc) + cyc) % cyc;
    const D = this.dwell, Tt = this.Tt;
    const ease = (x) => x * x * (3 - 2 * x);
    if (ph < D) return 0; if (ph < D + Tt) return ease((ph - D) / Tt); if (ph < 2 * D + Tt) return 1; return 1 - ease((ph - 2 * D - Tt) / Tt);
  }

  // ---------- loop lifts ----------
  buildLoop() {
    const t = this.type;
    const sup = this.supports();
    const r = t.gauge / 2;
    const side = (sign) => {
      const pts = [];
      for (let i = 0; i < sup.length - 1; i++) {
        const a = sup[i], b = sup[i + 1];
        const span = b.d - a.d;
        const curved = a.st && b.st && this.mid && this.mid.v != null && a.d < this.mid.d && b.d > this.mid.d;
        const n = Math.max(1, Math.ceil(span / (curved ? 1.2 : 8)));
        for (let k = 0; k < n; k++) {
          const u = k / n, d = a.d + span * u, p = this.offsetAt(d, r * sign);
          const st = a.st && b.st;
          pts.push({ x: p.x, y: lerp(a.y, b.y, u) - (st ? 0 : this.sagAt(span, u)), z: p.z, st, d });
        }
      }
      const last = sup[sup.length - 1], p = this.offsetAt(last.d, r * sign);
      pts.push({ x: p.x, y: last.y, z: p.z, st: true, d: last.d });
      // drag-lift bends: sample the curve around the bullwheels densely
      for (const k of (this.kinks || []).filter((q) => q.big)) {
        const keep = pts.filter((q) => Math.abs(q.d - k.d) >= k.hv);
        const yAt = (d) => { let a = pts[0], b = pts[pts.length - 1]; for (let i = 0; i < pts.length - 1; i++) if (pts[i].d <= d && pts[i + 1].d >= d) { a = pts[i]; b = pts[i + 1]; break; } return lerp(a.y, b.y, clamp((d - a.d) / Math.max(0.01, b.d - a.d), 0, 1)); };
        for (let q = 0; q <= 12; q++) { const d = k.d - k.hv + 2 * k.hv * q / 12, o = this.offsetAt(d, r * sign); keep.push({ x: o.x, y: yAt(d), z: o.z, st: false, d }); }
        keep.sort((u2, v2) => u2.d - v2.d); pts.length = 0; pts.push(...keep);
      }
      // rope follows the rounded sheave batteries at the towers
      const arcs = (this.towerArcs || []).filter(Boolean);
      if (!arcs.length) return pts;
      // exact rope height of the free spans (straight line minus sag)
      const spanY = (d) => { for (let i = 0; i < sup.length - 1; i++) { const a = sup[i], b = sup[i + 1]; if (d >= a.d && d <= b.d) { const sp = b.d - a.d, u = (d - a.d) / Math.max(0.01, sp); return lerp(a.y, b.y, u) - (a.st && b.st ? 0 : this.sagAt(sp, u)); } } return pts[pts.length - 1].y; };
      // on the battery the rope lies on the arc; after it, it eases smoothly back into the free span
      // (no kink right behind the tower)
      const blendL = (a) => Math.max(6, a.tl * 1.5);
      let out = pts.filter((q) => !arcs.some((a) => Math.abs(q.d - a.d) < a.tl / 2 + blendL(a)));
      for (const a of arcs) {
        const arcY = (lx) => a.top + a.sm * lx + a.ds / (2 * a.tl) * lx * lx;
        const arcS = (lx) => a.sm + a.ds / a.tl * lx;
        const n = 10;
        for (let k = 0; k <= n; k++) { const lx = -a.tl / 2 + a.tl * k / n, d = a.d + lx, q = this.offsetAt(d, r * sign); out.push({ x: q.x, y: arcY(lx), z: q.z, st: false, d }); }
        for (const sd of [-1, 1]) {
          const e = sd * a.tl / 2, ye = arcY(e), se = arcS(e), B = blendL(a);
          for (let k = 1; k <= 8; k++) {
            const f = k / 8, lx = e + sd * B * f, d = a.d + lx;
            if (d <= 0.5 || d >= this.L - 0.5) continue;
            const w = f * f * (3 - 2 * f); // 0 at the battery end -> 1 in the free span
            const yTan = ye + se * (lx - e);
            const q = this.offsetAt(d, r * sign);
            out.push({ x: q.x, y: lerp(yTan, spanY(d), w), z: q.z, st: false, d });
          }
        }
      }
      out.sort((u, v) => u.d - v.d);
      return out;
    };
    const up = side(1);
    const down = side(-1).reverse();
    const semi = (C, y, fwd, rg, from) => {
      const pts = [];
      for (let k = 1; k < 12; k++) {
        const a = (k / 12) * Math.PI, cr = Math.cos(a) * from, sf = Math.sin(a);
        pts.push({ x: C.x + rg.x * r * cr + fwd.x * r * sf, y, z: C.z + rg.z * r * cr + fwd.z * r * sf, st: true });
      }
      return pts;
    };
    const yA = this.gA + t.hs, yB = this.gB + t.hs;
    const loop = [...up, ...semi(this.B, yB, this.dirB, this.rightB, 1), ...down, ...semi(this.A, yA, { x: -this.dir.x, z: -this.dir.z }, this.right, -1)];
    const cumT = [0];
    const vMax = this.speed, vSt = t.detach ? Math.min(0.9, vMax) : vMax;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      cumT.push(cumT[i] + len / (a.st && b.st ? vSt : vMax));
    }
    this.loop = loop; this.upCount = up.length; this.cumT = cumT; this.T = cumT[cumT.length - 1];
    // boarding / alighting points on the up side
    this.iBoard = up.findIndex((p) => p.d >= t.Ls * 0.55);
    this.iAlight = up.findIndex((p) => p.d >= this.L - t.Ls * 0.55);
    if (this.iAlight < 0) this.iAlight = up.length - 1;
  }

  // loop time of carrier k (pulsed lifts: the rope moves in steps and the cabins sit in groups)
  carrierTau(k, time = this.time) {
    const t = this.type;
    if (!t.pulsed || !this.grpT) return time + k * this.dtau;
    const cyc = this.grpT + this.pulseD, n = Math.floor(time / cyc), r = time - n * cyc;
    const f = Math.min(1, r / this.grpT), e = f * f * (3 - 2 * f);
    const tau = n * this.grpT + e * this.grpT;
    const g = Math.floor(k / t.group), j = k % t.group;
    return tau + this.tauA0 + g * this.grpT + (j - (t.group - 1) / 2) * this.gapT;
  }

  posAtTime(tau, out) {
    const cum = this.cumT, loop = this.loop;
    tau = ((tau % this.T) + this.T) % this.T;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= tau) lo = m; else hi = m; }
    const a = loop[lo], b = loop[(lo + 1) % loop.length];
    const u = (tau - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    out.x = lerp(a.x, b.x, u); out.y = lerp(a.y, b.y, u); out.z = lerp(a.z, b.z, u);
    out.tx = b.x - a.x; out.tz = b.z - a.z; out.ty = b.y - a.y;
    out.uphill = lo < this.upCount;
    return out;
  }

  chairParts(seats, Lh, bubble, cushionColor, bubbleColor) {
    const Wd = seats * 0.58 + 0.25;
    const metal = [], cush = [], bub = [], grip = [];
    const add = (arr, geo, m) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv'); g.applyMatrix4(m); arr.push(g); };
    gripParts((g, m) => add(grip, g, m), this.type.detach);
    // hanger: from the grip a short arm out, a smooth bend down and back under the rope, then
    // straight down to the chair (sampled from a curve so it reads as one bent tube)
    const hc = new THREE.CatmullRomCurve3([[0, 0.2, 0.05], [0, 0.16, 0.42], [0, -0.25, 0.62], [0, -0.85, 0.5], [0, -1.4, 0.08], [0, -1.9, 0], [0, -Lh + 1.6, 0]].map((q) => new THREE.Vector3(...q)), false, 'catmullrom', 0.3);
    const hp = hc.getPoints(14);
    for (let i = 0; i < hp.length - 1; i++) add(metal, CYL, segM(hp[i].toArray(), hp[i + 1].toArray(), 0.065));
    const T = (a, b, r = 0.035) => add(metal, CYL, segM(a, b, r));
    const y0 = -Lh, hw = Wd / 2;
    // the hanger ends in a clamp block on a wide bow: a cross bar over the backrest with rounded
    // corners running down into the two side frames
    add(metal, rbox(0.2, 0.26, 0.24, 0.05, 1), M(-0.05, y0 + 1.5, 0, 0));
    T([0, y0 + 1.6, 0], [-0.32, y0 + 1.36, 0], 0.07);
    const rc = 0.32, yb = y0 + 1.36;
    T([-0.32, yb, -(hw - rc)], [-0.32, yb, hw - rc], 0.05);
    for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) {
      const a0 = k / 5 * Math.PI / 2, a1 = (k + 1) / 5 * Math.PI / 2;
      T([-0.32, yb - rc + Math.cos(a0) * rc, sd * (hw - rc + Math.sin(a0) * rc)], [-0.32, yb - rc + Math.cos(a1) * rc, sd * (hw - rc + Math.sin(a1) * rc)], 0.05);
    }
    for (const sd of [-1, 1]) {
      const z = sd * hw;
      // side frame: down behind the backrest, forward under the seat, armrest on top
      T([-0.32, yb - rc, z], [-0.3, y0 + 0.05, z], 0.045);
      T([-0.3, y0 + 0.05, z], [0.33, y0 - 0.02, z], 0.035);
      T([-0.28, y0 + 0.36, z], [0.25, y0 + 0.36, z], 0.03);
      T([0.25, y0 + 0.36, z], [0.3, y0 - 0.02, z], 0.03);
      add(cush, rbox(0.42, 0.05, 0.09, 0.02, 1), M(-0.02, y0 + 0.4, z, 0));
      // safety bar arms: from the pivot above the backrest forward and down to the front bar
      T([-0.3, y0 + 1.22, z * 1.02], [0.18, y0 + 0.95, z * 1.02], 0.03);
      T([0.18, y0 + 0.95, z * 1.02], [0.6, y0 + 0.46, z * 0.98], 0.03);
      add(metal, CYL, M(-0.3, y0 + 1.22, z * 1.04, 0, 0.12, 0.08, 0.12, Math.PI / 2)); // pivot
    }
    // front bar across the laps, with a soft cover
    T([0.6, y0 + 0.46, -hw * 0.98], [0.6, y0 + 0.46, hw * 0.98], 0.032);
    add(cush, rbox(0.09, 0.09, Wd * 0.9, 0.04, 1), M(0.6, y0 + 0.47, 0, 0));
    // footrests: struts from the bar down to a foot bar under the skis, one pair of pads per seat
    const nStr = Math.max(1, Math.round(seats / 2));
    for (let k = 0; k < nStr; k++) { const z = nStr === 1 ? 0 : -hw * 0.7 + k * (hw * 1.4 / (nStr - 1)); T([0.6, y0 + 0.44, z], [0.56, y0 - 0.48, z], 0.03); }
    T([0.56, y0 - 0.48, -hw * 0.92], [0.56, y0 - 0.48, hw * 0.92], 0.03);
    for (let k = 0; k < seats; k++) { const z = -hw + (k + 0.5) * (Wd / seats); add(metal, rbox(0.34, 0.04, 0.26, 0.015, 1), M(0.56, y0 - 0.47, z, 0)); for (const dz of [-0.08, 0.08]) add(metal, BOX, M(0.56, y0 - 0.44, z + dz, 0, 0.34, 0.025, 0.02)); }
    // seat with a separate cushion per seat, backrest
    add(metal, BOX, M(0.02, y0 - 0.04, 0, 0, 0.62, 0.05, Wd));
    for (let k = 0; k < seats; k++) { const z = -hw + (k + 0.5) * (Wd / seats); add(cush, rbox(0.54, 0.12, Wd / seats - 0.04, 0.05, 2), M(0.04, y0 + 0.04, z, 0)); add(cush, rbox(0.1, 0.62, Wd / seats - 0.04, 0.04, 2), M(-0.26, y0 + 0.44, z, 0, 1, 1, 1, 0, 0.12)); }
    add(metal, BOX, M(-0.31, y0 + 0.44, 0, 0, 0.04, 0.66, Wd, 0, 0.12));
    const parts = [{ geo: mergeGeometries(metal), mat: mat(0x3a3d40) }, { geo: mergeGeometries(cush), mat: mat(cushionColor) }];
    if (bubble) {
      const bg = new THREE.CylinderGeometry(1.05, 1.05, Wd + 0.15, 18, 1, false, Math.PI * 0.32, Math.PI * 0.8).rotateX(Math.PI / 2);
      bg.translate(0.08, -Lh + 0.5, 0);
      add(bub, bg, new THREE.Matrix4());
      // the hood hangs on two side arms from the hanger yoke and turns about a hub on each side;
      // a dark rim frames both edges and a handle runs along the lower edge
      const zE = (Wd + 0.15) / 2;
      for (const sd of [-1, 1]) {
        const rim = new THREE.TorusGeometry(1.05, 0.035, 5, 20, Math.PI * 0.8).rotateZ(-Math.PI * 0.18);
        add(metal, rim, M(0.08, -Lh + 0.5, sd * zE, 0));
        T([-0.32, y0 + 1.2, sd * hw], [0.08, y0 + 0.5, sd * (zE + 0.04)], 0.04);
        add(metal, CYL, M(0.08, y0 + 0.5, sd * (zE + 0.04), 0, 0.16, 0.08, 0.16, Math.PI / 2));
      }
      { const a = Math.PI * 1.12 - Math.PI / 2; T([0.08 + Math.cos(a) * 1.07, y0 + 0.5 + Math.sin(a) * 1.07, -zE], [0.08 + Math.cos(a) * 1.07, y0 + 0.5 + Math.sin(a) * 1.07, zE], 0.03); }
      parts.push({ geo: mergeGeometries(bub), mat: mat(bubbleColor, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }) });
    }
    parts.push({ geo: mergeGeometries(grip), mat: mat(0x3a3d40), grip: true });
    return { parts, Wd };
  }

  gondolaParts(cab, hanger, color, opts = {}) {
    const [cl, cw, ch] = cab;
    const top = -hanger;
    const metal = [], body = [], glassA = [], grip = [];
    const add = (arr, geo, m) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv'); g.applyMatrix4(m); arr.push(g); };
    if (opts.funitel) {
      // funitel carrier (like the real cabins): on each haul rope a short carriage with two grips and
      // running wheels; from each carriage a strong arm comes down and inwards to a mount on the roof.
      // The two arms sit on the roof next to each other, under a cover.
      const xg = cl * 0.26;
      for (const sd of [-1, 1]) {
        const zr = sd * FUNI_OFF;
        add(grip, rbox(cl * 0.62, 0.18, 0.22, 0.06, 1), M(0, 0.3, zr, 0)); // carriage beam over the rope
        for (const ex of [-xg, xg]) {
          add(grip, rbox(0.5, 0.36, 0.3, 0.08, 1), M(ex, 0.06, zr, 0)); // grip
          for (const wx of [-0.16, 0.16]) add(grip, new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12).rotateX(Math.PI / 2), M(ex + wx, 0.45, zr + sd * 0.12, 0));
        }
        add(grip, rbox(0.5, 0.42, 0.34, 0.08, 1), M(0, 0.1, zr - sd * 0.2, 0)); // arm head on the carriage
        // the arm: out of the carriage down and in to the roof mount (two flat bars side by side)
        for (const ex of [-0.16, 0.16]) {
          const pts2 = [[ex, 0.0, zr - sd * 0.25], [ex, -0.12, zr - sd * 0.5], [ex, -0.45, sd * 0.68], [ex, top + 0.25, sd * 0.58]];
          for (let i = 0; i < pts2.length - 1; i++) add(metal, rbox(0.12, 1, 0.18, 0.03, 1), segM(pts2[i], pts2[i + 1], 0.5));
        }
        add(metal, rbox(0.55, 0.32, 0.36, 0.08, 1), M(0, top + 0.2, sd * 0.55, 0)); // roof mount
      }
      add(metal, rbox(cl * 0.5, 0.18, 1.6, 0.08, 2), M(0, top + 0.07, 0, 0)); // roof cover
    }
    else if (opts.threeS) {
      // 3S carriage (like the real ones): on each track rope a bogie with 4 wheels in two pairs under a
      // covered frame, a strong cross frame between the bogies, the grip housing hanging under the
      // middle on the haul rope, and the hanger joint underneath
      const cg = rbox(1.15, 0.32, 0.26, 0.08, 1);
      for (const sd of opts.twoS ? [0] : [-0.8, 0.8]) {
        for (const bx of [-0.62, 0.62]) {
          add(grip, cg, M(bx, 0.36, sd, 0)); // bogie cover
          for (const wx of [-0.3, 0.3]) { add(grip, CYL, M(bx + wx, 0.17, sd, 0, 0.3, 0.07, 0.3, Math.PI / 2)); }
        }
        add(grip, rbox(1.9, 0.14, 0.16, 0.04, 1), M(0, 0.2, sd, 0)); // bogie beam
      }
      add(grip, rbox(0.55, 0.26, opts.twoS ? 0.45 : 1.85, 0.08, 1), M(0, 0.12, opts.twoS ? 0.2 : 0, 0)); // cross frame
      add(grip, rbox(0.9, 0.42, 0.42, 0.1, 1), M(0, -0.28, 0, 0)); // grip housing on the haul rope
      add(grip, rbox(0.12, 0.3, 0.46, 0.03, 1), M(0.5, -0.24, 0, 0)); // opening lever
      add(grip, CYL, M(0.62, -0.1, 0.15, 0, 0.16, 0.08, 0.16, Math.PI / 2));
      const sw = cw * 0.5 + 0.2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.45, 0), new THREE.Vector3(0, -0.62, sw * 0.45), new THREE.Vector3(0, top * 0.3, sw),
        new THREE.Vector3(0, top * 0.62, sw * 0.95), new THREE.Vector3(0, top * 0.88, sw * 0.45), new THREE.Vector3(0, top - 0.05, 0),
      ]);
      const tube = new THREE.TubeGeometry(curve, 28, 0.11, 8, false);
      tube.applyMatrix4(new THREE.Matrix4().makeScale(2.0, 1, 1)); // flat profile like the real hanger
      add(metal, tube, M(0, 0, 0, 0));
      add(metal, rbox(0.45, 0.18, 0.35, 0.06, 1), M(0, top + 0.02, 0, 0)); // hanger head on the roof
    }
    else {
      gripParts((g, m) => add(grip, g, m), true);
      const hb = [[0, 0.22, 0.1], [0, 0.12, 0.6], [0, -0.8, 0.6], [0, Math.max(top + 0.3, -1.5), 0], [0, top, 0]];
      for (let i = 0; i < hb.length - 1; i++) if (hb[i][1] > hb[i + 1][1] - 0.01 || i < 2) add(metal, CYL, segM(hb[i], hb[i + 1], 0.07));
    }
    // cabin (modelled after modern 8-10 seat cabins): rounded tub, big panoramic glass that leans
    // inwards towards the roof, slim corner posts, sliding door on one side, domed roof with hanger yoke
    const U = GFX.ultra, m = U ? 5 : 3;
    const dark = [], white = [], seats = [], pax = [];
    const yT = top - 0.22, yB = yT - ch, cr = Math.min(cl, cw) * 0.3;
    const prof = (f, sx, sz, rf = 1) => ({ y: yB + f * ch, a: cl / 2 * sx, b: cw / 2 * sz, r: cr * rf * Math.min(sx, sz) });
    const tub = [prof(0, 0.66, 0.58, 0.9), prof(0.035, 0.86, 0.8), prof(0.1, 0.97, 0.95), prof(0.2, 1, 1)];
    const R = (f) => { const k = (f - 0.24) / (0.85 - 0.24); return prof(f, lerp(1, 0.92, k), lerp(1, 0.86, k)); };
    const glassR = [R(0.24), R(0.55), R(0.85)];
    const roofR = [R(0.88), prof(0.93, 0.89, 0.81), prof(0.975, 0.8, 0.7), prof(1, 0.6, 0.48)];
    add(body, ringStack(tub, m, true, false), M(0, 0, 0, 0));
    add(dark, ringStack([prof(0.2, 1.003, 1.003), R(0.24)].map((q, i) => i ? { ...q, a: q.a * 1.003, b: q.b * 1.003 } : q), m, false, false), M(0, 0, 0, 0));
    add(glassA, ringStack(glassR, m, false, false), M(0, 0, 0, 0));
    add(dark, ringStack([glassR[2], R(0.88)].map((q) => ({ ...q, a: q.a * 1.004, b: q.b * 1.004 })), m, false, false), M(0, 0, 0, 0));
    add(body, ringStack(roofR, m, false, true), M(0, 0, 0, 0));
    // posts: four corners + the door frame on the +z side + middle posts on long cabins
    const onRing = (q, ang, out = 0.012) => { const ca = Math.cos(ang), sa = Math.sin(ang); const ax = q.a - q.r, bz = q.b - q.r; return new THREE.Vector3(Math.sign(ca) * ax + ca * (q.r + out), q.y, Math.sign(sa) * bz + sa * (q.r + out)); };
    const onSide = (q, lx, sd, out = 0.012) => new THREE.Vector3(lx * q.a / (cl / 2), q.y, sd * (q.b + out));
    const post = (A, B, r) => { const d = B.clone().sub(A), len = d.length(); const g = BOX.clone(); g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(r, len, r))); add(dark, g, M(0, 0, 0, 0)); };
    const g0 = glassR[0], g2 = glassR[2];
    for (const ang of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) post(onRing(g0, ang), onRing(g2, ang), U ? 0.075 : 0.09);
    const doorX = cl * 0.23;
    for (const lx of [-doorX, doorX]) post(onSide(tub[3], lx, 1), onSide(g2, lx, 1), 0.06);
    if (U) post(onSide(g0, 0, 1, 0.018), onSide(g2, 0, 1, 0.018), 0.025); // door leaves meet in the middle
    if (cl > 1.9) post(onSide(g0, 0, -1), onSide(g2, 0, -1), 0.05);
    // door rails (top and bottom) and handles
    for (const q of [g2, tub[3]]) post(onSide(q, -doorX * 1.25, 1, 0.03), onSide(q, doorX * 1.25, 1, 0.03), 0.04);
    if (U) for (const lx of [-0.05, 0.05]) post(onSide(R(0.42), lx * cl, 1, 0.04), onSide(R(0.58), lx * cl, 1, 0.04), 0.03);
    // bumper ring and skid at the bottom
    add(dark, ringStack([prof(0.11, 0.985, 0.965), prof(0.15, 1.005, 1.005), prof(0.19, 1.0, 1.0)], m, false, false), M(0, 0, 0, 0));
    // roof: hanger yoke (beam along the roof + two feet), hatch, number plate front and back
    add(metal, rbox(cl * 0.62, 0.12, 0.16, 0.04, 1), M(0, yT + 0.12, 0, 0));
    for (const sx of [-1, 1]) add(metal, rbox(0.14, 0.2, 0.3, 0.04, 1), M(sx * cl * 0.28, yT + 0.02, 0, 0));
    add(metal, rbox(0.22, Math.max(0.05, top - yT - 0.1), 0.22, 0.05, 1), M(0, (top + yT + 0.12) / 2, 0, 0));
    add(dark, rbox(cl * 0.28, 0.05, cw * 0.3, 0.03, 1), M(-cl * 0.12, yT + 0.005, 0, 0));
    for (const sx of [-1, 1]) add(white, rbox(0.02, 0.16, 0.34, 0.01, 1), M(sx * (roofR[0].a + 0.012), roofR[0].y - 0.06, 0, 0));
    if (U) {
      // tilt-in vent windows at the top of the end glass, roof air vents, floor, door number
      for (const sx of [-1, 1]) {
        add(dark, BOX, M(sx * (g2.a * 0.995 + 0.012), g2.y - 0.2, 0, 0, 0.012, 0.03, cw * 0.55));
        for (const fz of [-0.275, 0.275]) add(dark, BOX, M(sx * (g2.a * 0.995 + 0.012), g2.y - 0.1, fz * cw, 0, 0.012, 0.22, 0.025));
        add(dark, rbox(0.3, 0.05, 0.22, 0.02, 1), M(sx * cl * 0.25, yT - 0.0, cw * 0.2, 0));
      }
      add(dark, rbox(cl * 0.9, 0.04, cw * 0.85, 0.02, 1), M(0, yB + 0.14, 0, 0));
      add(white, rbox(0.22, 0.16, 0.012, 0.004, 1), M(cl * 0.36, yB + ch * 0.12, cw / 2 + 0.01, 0));
    }
    // brand stripe under the windows
    add(white, ringStack([prof(0.165, 1.006, 1.006), prof(0.185, 1.006, 1.006)], m, false, false), M(0, 0, 0, 0));
    if (U) {
      // benches and seated passengers inside
      for (const sx of [-1, 1]) {
        add(seats, rbox(0.42, 0.1, cw * 0.8, 0.04, 1), M(sx * (cl / 2 - 0.32), yB + 0.5, 0, 0));
        add(seats, rbox(0.1, 0.5, cw * 0.8, 0.04, 1), M(sx * (cl / 2 - 0.14), yB + 0.78, 0, 0));
        const nP = Math.max(1, Math.round(cw / 0.6) - 1);
        for (let k = 0; k < nP; k++) {
          if ((k + (sx > 0 ? 1 : 0)) % 2 && nP > 1) continue; // not every seat taken
          const pz = -cw * 0.32 + k * (cw * 0.64 / Math.max(1, nP - 1));
          const px = sx * (cl / 2 - 0.36);
          add(pax, rbox(0.3, 0.5, 0.36, 0.1, 1), M(px, yB + 0.84, pz, 0));
          add(pax, rbox(0.42, 0.14, 0.3, 0.05, 1), M(px - sx * 0.18, yB + 0.6, pz, 0));
          add(dark, new THREE.SphereGeometry(0.12, 8, 6), M(px, yB + 1.22, pz, 0));
        }
      }
    }
    const out = [{ geo: mergeGeometries(metal), mat: mat(opts.threeS ? 0x6b7278 : 0x3a3d40) }, { geo: mergeGeometries(body), mat: mat(color) }, { geo: mergeGeometries(dark), mat: mat(0x1e2226) }, { geo: mergeGeometries(glassA), mat: opts.dark ? (U ? mat(0x10161d, { transparent: true, opacity: 0.82, depthWrite: false }) : mat(0x12181f)) : U ? mat(0x3d5b73, { transparent: true, opacity: 0.42, depthWrite: false }) : mat(0x2c3e4f) }];
    if (white.length) out.push({ geo: mergeGeometries(white), mat: mat(opts.dark ? 0x2f5bd6 : 0xf2f4f6) });
    if (seats.length) out.push({ geo: mergeGeometries(seats), mat: mat(0x5a6470) });
    if (pax.length) out.push({ geo: mergeGeometries(pax), mat: mat(0x2f5f9e) });
    if (grip.length) out.push({ geo: mergeGeometries(grip), mat: mat(opts.threeS ? 0x7d848a : 0x3a3d40), grip: true });
    return out;
  }

  buildCarriers() {
    const t = this.type, br = this.brand;
    const dtau = this.spacing / this.speed;
    this.nCarriers = Math.max(2, Math.floor(this.T / dtau));
    this.dtau = this.T / this.nCarriers;
    if (t.pulsed) {
      // Gruppenumlaufbahn: groups of cabins fixed on the rope; the rope stops whenever a group is in a
      // station (with an even number of groups one group is in each station at the same time)
      this.nCarriers = t.groups * t.group;
      this.grpT = this.T / t.groups; this.gapT = 9 / this.speed; this.pulseD = 22;
      this.tauA0 = (t.Ls * 0.45) / this.speed;
    }
    const n = this.nCarriers;
    const mk = (parts) => parts.map((p) => { const im = new THREE.InstancedMesh(p.geo, p.mat, n); im.frustumCulled = false; im.castShadow = true; if (p.grip) im.userData.grip = true; this.group.add(im); return im; });
    this.carrierMeshes = []; this.gondolaMeshes = null;
    const color = this.color;
    if (t.kind === 'chair' || t.kind === 'kombi') {
      const cp = this.chairParts(t.seats, t.hanger, t.bubble, color ?? br.cushion, color ?? br.bubble);
      this.carrierMeshes = mk(cp.parts);
      this.Wd = cp.Wd;
      if (t.kind === 'kombi') this.gondolaMeshes = mk(this.gondolaParts(t.cab, t.ghanger, color ?? br.cabin));
    } else if (t.kind === 'gondola') {
      this.carrierMeshes = mk(this.gondolaParts(t.cab, t.hanger, color ?? (t.threeS ? 0x1b1f26 : br.cabin), { funitel: t.funitel, threeS: t.threeS, twoS: t.twoS, dark: t.threeS && color == null }));
    } else {
      const boxG = rbox(0.32, 0.62, 0.3, 0.08).clone().applyMatrix4(M(0, -0.58, 0));
      const clamp = [];
      gripParts((g, m) => { const c = g.index ? g.toNonIndexed() : g.clone(); if (c.attributes.uv) c.deleteAttribute('uv'); c.applyMatrix4(m); clamp.push(c); }, false, 0.8);
      for (const c of [rbox(0.08, 0.26, 0.1, 0.03, 1).clone().applyMatrix4(M(0, -0.15, 0)), new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8).rotateX(Math.PI / 2).applyMatrix4(M(0, -0.27, 0))]) { const c2 = c.index ? c.toNonIndexed() : c; if (c2.attributes.uv) c2.deleteAttribute('uv'); clamp.push(c2); }
      const bg = boxG.index ? boxG.toNonIndexed() : boxG; if (bg.attributes.uv) bg.deleteAttribute('uv');
      this.carrierMeshes = mk([{ geo: bg, mat: mat(t.kind === 'platter' ? 0x2266cc : 0xd9a400) }, { geo: mergeGeometries(clamp), mat: mat(0x3a3d40) }]);
      const rope = new THREE.BoxGeometry(0.04, 1, 0.04).translate(0, -0.5, 0);
      this.ropeMesh = new THREE.InstancedMesh(rope, mat(0x222222), n);
      let bar;
      if (t.kind === 'platter') bar = mergeGeometries([new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6).translate(0, 0.45, 0).toNonIndexed(), new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12).toNonIndexed()]);
      else bar = mergeGeometries([new THREE.BoxGeometry(0.12, 0.5, 0.12).translate(0, 0.25, 0).toNonIndexed(), new THREE.BoxGeometry(0.1, 0.1, 1.1).toNonIndexed()]);
      if (bar.attributes.uv) bar.deleteAttribute('uv');
      this.barMesh = new THREE.InstancedMesh(bar, mat(t.kind === 'platter' ? 0x1d1d1d : 0x9a6d1c), n);
      for (const m of [this.ropeMesh, this.barMesh]) { m.frustumCulled = false; this.group.add(m); }
    }
    if (t.kind === 'chair' || t.kind === 'kombi' || t.kind === 'tbar' || t.kind === 'platter') {
      const chair = t.kind === 'chair' || t.kind === 'kombi';
      const fig = chair ? riderGeometry() : skierGeometry();
      const cnt = chair ? n * t.seats : n * (t.kind === 'tbar' ? 2 : 1);
      this.riderJ = new THREE.InstancedMesh(fig.jacket, mat(0xffffff), cnt);
      this.riderR = new THREE.InstancedMesh(fig.rest, new THREE.MeshLambertMaterial({ vertexColors: true }), cnt);
      this.riderR.userData.own = true;
      const col = new THREE.Color();
      for (let i = 0; i < cnt; i++) this.riderJ.setColorAt(i, col.setHex(JACKETS[(i * 7 + this.id * 3) % JACKETS.length]));
      for (const m of [this.riderJ, this.riderR]) { m.frustumCulled = false; this.group.add(m); }
      if (chair) {
        this.seatMats = [];
        for (let si = 0; si < t.seats; si++) this.seatMats.push(new THREE.Matrix4().makeTranslation(0.0, -t.hanger + 0.07, -this.Wd / 2 + (si + 0.5) * (this.Wd / t.seats)));
      }
    }
    this.update(0);
  }

  occupied(k, si) { return ((k * 7919 + si * 104729 + this.id * 31) % 100) < (this.riderRate ?? 58); }

  // opening hours: closing detachable lifts first pull every carrier into the garage at the valley station
  setOpen(o) {
    if (this.open === undefined) this.open = true;
    if (o === this.open && !(o && this.garaging)) return;
    const t = this.type;
    const garage = t.detach && (t.kind === 'chair' || t.kind === 'gondola' || t.kind === 'kombi');
    if (!o) { if (garage) this.garaging = true; else this.open = false; }
    else { this.open = true; this.garaging = false; }
  }
  get moving() { return this.running && (this.open !== false || this.garaging); }
  // does this lift run in the current season?
  get seasonOk() { return this.op === 'all' || (this.op === 'winter') === (Lift.winter !== false); }
  get hasGarage() { const t = this.type; return !!(t.detach && (t.kind === 'chair' || t.kind === 'gondola' || t.kind === 'kombi')); }
  // off season: detachable carriers stay in the garage, fixed chairs / T-bars are unhooked from the rope
  get unhooked() { return !this.seasonOk && !this.moving; }
  parkAll() { if (!this.parked) this.parked = new Set(); this.open = false; this.garaging = false; if (this.hasGarage) for (let k = 0; k < this.nCarriers; k++) this.parked.add(k); }

  update(dt) {
    if (this.moving) this.time += dt;
    if (!this.parked) this.parked = new Set();
    const t = this.type;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), p = {};
    if (t.kind === 'tram') {
      const u = this.shuttleU();
      const yaw = -Math.atan2(this.dir.z, this.dir.x);
      q.setFromAxisAngle(UP, yaw);
      // local +z of the cabin (where the hanger bow is) must point away from the line centre
      const lzx = -this.dir.z, lzz = this.dir.x, dotR = lzx * this.right.x + lzz * this.right.z;
      (t.single ? [u] : [u, 1 - u]).forEach((uu, k) => {
        const dd = this.stop + uu * this.travel, sd = this.sides[k];
        const pa = this.sidePos(sd, dd - 2, {}), pb = this.sidePos(sd, dd + 2, {});
        this.sidePos(sd, dd, p);
        const sg = t.single ? 1 : k === 0 ? 1 : -1, flip = sg * dotR < 0;
        q.setFromAxisAngle(UP, yaw + (flip ? Math.PI : 0));
        m.compose(v.set(p.x, p.y, p.z), q, s);
        // carriage on the rope: same slope as the track rope (sign follows the cabin's local +x)
        const sl = Math.atan2(pb.y - pa.y, Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1);
        _pq.setFromAxisAngle(_Z, flip ? -sl : sl);
        _mg.compose(v.set(p.x, p.y, p.z), _pq.premultiply(q), s);
        for (const im of this.carrierMeshes) im.setMatrixAt(k, im.userData.grip ? _mg : m);
      });
      for (const im of this.carrierMeshes) im.instanceMatrix.needsUpdate = true;
      return;
    }
    if (t.kind === 'funicular') {
      const u = this.shuttleU();
      const yaw = -Math.atan2(this.dir.z, this.dir.x);
      [u, 1 - u].forEach((uu, k) => {
        this.trackPos(t.Ls * 0.5 + uu * this.travel, k ? -1 : 1, p);
        q.setFromEuler(new THREE.Euler(0, yaw, p.pitch, 'YXZ'));
        m.compose(v.set(p.x, p.y + 0.2, p.z), q, s);
        for (const im of this.carParts) im.setMatrixAt(k, m);
      });
      for (const im of this.carParts) im.instanceMatrix.needsUpdate = true;
      return;
    }
    if (t.kind === 'carpet') {
      if (this.moving) this.beltTex.offset.y -= dt * this.speed / 2;
      const yaw = -Math.atan2(this.dir.z, this.dir.x);
      q.setFromAxisAngle(UP, yaw);
      for (let k = 0; k < this.nCarriers; k++) {
        const dist = ((this.time * this.speed + k * this.spacing) % this.carpetLen);
        this.carpetPos(dist, p);
        if (this.moving && this.occupied(k, 0) && dist > 1.5 && dist < this.carpetLen - 1.5) m.compose(v.set(p.x, p.y + 0.05, p.z), q, s); else m.copy(ZERO);
        this.riderJ.setMatrixAt(k, m); this.riderR.setMatrixAt(k, m);
      }
      this.riderJ.instanceMatrix.needsUpdate = true; this.riderR.instanceMatrix.needsUpdate = true;
      return;
    }
    const atA = (pp) => (pp.x - this.A.x) ** 2 + (pp.z - this.A.z) ** 2 < (t.Ls * 0.7) ** 2;
    for (let k = 0; k < this.nCarriers; k++) {
      this.posAtTime(this.carrierTau(k), p);
      // garage: carriers leave the rope at the valley station when closing, come back out when opening
      if (this.garaging && atA(p) && !this.parked.has(k)) { this.parked.add(k); if (this.garPath) { this.garAnim = this.garAnim || new Map(); this.garAnim.set(k, 0); this.takeSlot(k); } }
      else if (this.open !== false && !this.garaging && this.parked.has(k) && atA(p)) { this.parked.delete(k); if (this.garAnim) this.garAnim.delete(k); if (this.garSlotOf) this.garSlotOf.delete(k); }
      // rolling down the ramp into the hall under the station
      if (this.parked.has(k) && this.garAnim && this.garAnim.has(k) && this.garPath) {
        const sA = this.garAnim.get(k) + dt * 2.6;
        const slot = this.garSlots && this.garSlotOf && this.garSlots[this.garSlotOf.get(k)];
        const gp = sA < this.garPath.len ? this.garPos(sA, {}) : slot ? this.slotLeg(sA - this.garPath.len, slot) : null;
        if (!gp) this.garAnim.delete(k);
        else {
          this.garAnim.set(k, sA);
          q.setFromAxisAngle(UP, -Math.atan2(gp.tz, gp.tx));
          m.compose(v.set(gp.x, gp.y, gp.z), q, s);
          const isG2 = this.gondolaMeshes && k % 3 === 0;
          for (const im of this.carrierMeshes) im.setMatrixAt(k, isG2 ? ZERO : m);
          if (this.gondolaMeshes) for (const im of this.gondolaMeshes) im.setMatrixAt(k, isG2 ? m : ZERO);
          if (this.riderJ && (t.kind === 'chair' || t.kind === 'kombi')) for (let si = 0; si < t.seats; si++) { this.riderJ.setMatrixAt(k * t.seats + si, ZERO); this.riderR.setMatrixAt(k * t.seats + si, ZERO); }
          continue;
        }
      }
      if (this.parked.has(k) || (this.unhooked && !this.hasGarage)) {
        // parked: hanging in its slot in the hall (if there is a hall with storage rails)
        if (this.parked.has(k) && this.garSlots && this.garPath && this.garStyle === 'unter') {
          if (!this.garSlotOf || !this.garSlotOf.has(k)) this.takeSlot(k);
          const sl = this.garSlots[this.garSlotOf.get(k)];
          if (sl) {
            q.setFromAxisAngle(UP, -Math.atan2(this.garSlotDir.tz, this.garSlotDir.tx));
            m.compose(v.set(sl.x, sl.y, sl.z), q, s);
            const isG3 = this.gondolaMeshes && k % 3 === 0;
            for (const im of this.carrierMeshes) im.setMatrixAt(k, isG3 ? ZERO : m);
            if (this.gondolaMeshes) for (const im of this.gondolaMeshes) im.setMatrixAt(k, isG3 ? m : ZERO);
            if (this.riderJ && (t.kind === 'chair' || t.kind === 'kombi')) for (let si = 0; si < t.seats; si++) { this.riderJ.setMatrixAt(k * t.seats + si, ZERO); this.riderR.setMatrixAt(k * t.seats + si, ZERO); }
            continue;
          }
        }
        for (const im of this.carrierMeshes) im.setMatrixAt(k, ZERO);
        if (this.gondolaMeshes) for (const im of this.gondolaMeshes) im.setMatrixAt(k, ZERO);
        if (this.riderJ && (t.kind === 'chair' || t.kind === 'kombi')) for (let si = 0; si < t.seats; si++) { this.riderJ.setMatrixAt(k * t.seats + si, ZERO); this.riderR.setMatrixAt(k * t.seats + si, ZERO); }
        continue;
      }
      q.setFromAxisAngle(UP, -Math.atan2(p.tz, p.tx));
      m.compose(v.set(p.x, p.y, p.z), q, s);
      // grip and carriage wheels sit on the rope: they take the rope's slope, the hanger hangs straight down
      _pq.setFromAxisAngle(_Z, Math.atan2(p.ty || 0, Math.hypot(p.tx, p.tz) || 1));
      _mg.compose(v.set(p.x, p.y, p.z), _pq.premultiply(q), s);
      const isG = this.gondolaMeshes && k % 3 === 0;
      for (const im of this.carrierMeshes) im.setMatrixAt(k, isG ? ZERO : im.userData.grip ? _mg : m);
      if (this.gondolaMeshes) for (const im of this.gondolaMeshes) im.setMatrixAt(k, isG ? (im.userData.grip ? _mg : m) : ZERO);
      if (this.riderJ && (t.kind === 'chair' || t.kind === 'kombi')) {
        for (let si = 0; si < t.seats; si++) {
          const idx = k * t.seats + si;
          const mine = this.playerSeat && this.playerSeat.k === k && this.playerSeat.seat === si;
          if (!isG && p.uphill && !mine && this.occupied(k, si)) _rm.multiplyMatrices(m, this.seatMats[si]); else _rm.copy(ZERO);
          this.riderJ.setMatrixAt(idx, _rm); this.riderR.setMatrixAt(idx, _rm);
        }
      }
      if (t.kind === 'tbar' || t.kind === 'platter') {
        if (this.unhooked) { this.ropeMesh.setMatrixAt(k, ZERO); this.barMesh.setMatrixAt(k, ZERO); for (let si = 0; si < (t.kind === 'tbar' ? 2 : 1); si++) { this.riderJ.setMatrixAt(k * (t.kind === 'tbar' ? 2 : 1) + si, ZERO); this.riderR.setMatrixAt(k * (t.kind === 'tbar' ? 2 : 1) + si, ZERO); } continue; }
        const g = heightAt(this.world, p.x, p.z);
        const nr = t.kind === 'tbar' ? 2 : 1;
        let anyone = false; for (let si = 0; si < nr; si++) if (this.occupied(k, si)) anyone = true;
        const towing = p.uphill && anyone && p.y - g < 9;
        // a bar pulled by a skier is stretched down to the snow; an empty bar is wound up under the box
        const drop = towing ? clamp(p.y - g - 0.9 - (t.kind === 'platter' ? 1.25 : 1.0), 0.4, 7) : 0.25;
        this.ropeMesh.setMatrixAt(k, _rm.compose(v.set(p.x, p.y - 0.9, p.z), q, new THREE.Vector3(1, drop, 1)));
        this.barMesh.setMatrixAt(k, _rm.compose(v.set(p.x, p.y - 0.9 - drop - (towing ? (t.kind === 'platter' ? 0.9 : 0.5) : (t.kind === 'platter' ? 0.9 : 0.5)), p.z), q, s));
        for (let si = 0; si < nr; si++) {
          const ok = p.uphill && this.occupied(k, si) && p.y - g < 9;
          const tl = Math.hypot(p.tx, p.tz) || 1, fx = p.tx / tl, fz = p.tz / tl, so = nr > 1 ? (si ? 0.3 : -0.3) : 0;
          if (ok) _rm.compose(v.set(p.x - fz * so - fx * 0.2, g, p.z + fx * so - fz * 0.2), q, s); else _rm.copy(ZERO);
          this.riderJ.setMatrixAt(k * nr + si, _rm); this.riderR.setMatrixAt(k * nr + si, _rm);
        }
      }
    }
    if (this.garaging && this.parked.size >= this.nCarriers) { this.garaging = false; this.open = false; }
    for (const im of this.carrierMeshes) im.instanceMatrix.needsUpdate = true;
    if (this.gondolaMeshes) for (const im of this.gondolaMeshes) im.instanceMatrix.needsUpdate = true;
    if (this.ropeMesh) { this.ropeMesh.instanceMatrix.needsUpdate = true; this.barMesh.instanceMatrix.needsUpdate = true; }
    if (this.riderJ) { this.riderJ.instanceMatrix.needsUpdate = true; this.riderR.instanceMatrix.needsUpdate = true; }
  }

  // ======================================================= riding (player)
  // returns { duration, sample(elapsed, out) -> {x,y,z,yaw,pose:'seat'|'stand'|'inside'} }
  startRide() {
    const t = this.type;
    const yaw = -Math.atan2(this.dir.z, this.dir.x);
    if (t.kind === 'tram' || t.kind === 'funicular') {
      const travel = this.travel;
      const dur = travel / this.speed + 8;
      return { duration: dur, sample: (e, out) => {
        const u = clamp(e / dur, 0, 1), uu = u * u * (3 - 2 * u);
        if (t.kind === 'tram') { this.sidePos(this.sides[0], this.stop + uu * travel, out); out.y -= 8.6; }
        else { this.trackPos(t.Ls * 0.5 + uu * travel, 1, out); out.y += 1.0; }
        out.yaw = yaw; out.pose = 'inside'; return out;
      } };
    }
    if (t.kind === 'carpet') {
      const dur = this.carpetLen / this.speed;
      return { duration: dur, sample: (e, out) => { this.carpetPos(e * this.speed, out); out.yaw = yaw; out.pose = 'stand'; return out; } };
    }
    if (t.kind === 'tbar' || t.kind === 'platter') {
      const len = this.L - 2 * t.Ls, dur = len / this.speed;
      return { duration: dur, sample: (e, out) => { const d = t.Ls + clamp(e * this.speed, 0, len); const pp = this.offsetAt(d, t.gauge / 2); out.x = pp.x; out.z = pp.z; out.y = heightAt(this.world, out.x, out.z); const ud = this.dirAt(d); out.yaw = -Math.atan2(ud.z, ud.x); out.pose = 'stand'; return out; } };
    }
    const tau0 = this.cumT[this.iBoard], tau1 = this.cumT[this.iAlight];
    // sit on a real carrier: carrier k is at tau = time + k*dtau -> snap to the next one arriving
    const T = this.T, dt0 = this.dtau;
    if (t.pulsed && this.grpT) {
      // the next cabin of a group standing in (or coming into) the station
      let k = 0, bo = 1e9;
      for (let kk = 0; kk < this.nCarriers; kk++) { const o = ((tau0 - this.carrierTau(kk)) % T + T) % T; const o2 = o > T - 3 ? o - T : o; if (o2 > -3 && o2 < bo) { bo = o2; k = kk; } }
      const t0k = this.carrierTau(k), need = ((tau1 - t0k) % T + T) % T, start = this.time;
      this.playerSeat = { k, seat: 0 };
      const dur = need * (1 + this.pulseD / this.grpT) + this.pulseD;
      return { duration: dur, sample: (e, out) => {
        const tk = this.carrierTau(k), p = this.posAtTime(tk, out);
        out.yaw = -Math.atan2(p.tz, p.tx); out.y -= t.hanger + 0.3 + t.cab[2] - 0.05; out.pose = 'inside'; out.matrix = null;
        out.done = ((tk - t0k) % T + T) % T >= need - 0.5 || this.time - start > dur * 1.5;
        return out;
      } };
    }
    let off = ((tau0 - this.time) % T + T) % T;
    let k = Math.ceil(off / dt0 - 0.15) % this.nCarriers;
    if (this.gondolaMeshes && t.kind === 'kombi' && k % 3 === 0) k = (k + 1) % this.nCarriers;
    off = k * dt0;
    const tauStart = this.time + off;
    const dur = Math.max(5, ((tau1 - tauStart) % T + T) % T);
    const start = this.time;
    const gondola = t.kind === 'gondola';
    // a free seat on that chair (middle preferred)
    let seat = Math.floor((t.seats || 1) / 2);
    if (!gondola && this.seatMats) for (let si = 0; si < t.seats; si++) { const s2 = (seat + si) % t.seats; if (!this.occupied(k, s2)) { seat = s2; break; } }
    this.playerSeat = { k, seat };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    return { duration: dur, sample: (e, out) => {
      const p = this.posAtTime(this.time + off, out);
      out.yaw = -Math.atan2(p.tz, p.tx);
      if (gondola) { out.y -= t.hanger + 0.3 + t.cab[2] - 0.05; out.pose = 'inside'; out.matrix = null; }
      else {
        q.setFromAxisAngle(UP, out.yaw);
        m.compose(v.set(p.x, p.y, p.z), q, one);
        if (this.seatMats && this.seatMats[seat]) { out.matrix = new THREE.Matrix4().multiplyMatrices(m, this.seatMats[seat]); const e2 = out.matrix.elements; out.x = e2[12]; out.y = e2[13]; out.z = e2[14]; }
        else { out.y -= t.hanger - 0.07; out.matrix = null; }
        out.pose = 'seat';
      }
      out.done = this.time - start >= dur;
      return out;
    } };
  }
  get exitPoint() { const t = this.type; const d = this.L - t.Ls - 6; return this.offsetAt(Math.max(0, d), t.gauge / 2 + 5); }

  // ======================================================= editing
  setAuto(on) { this.autoTowers = on; if (on) { this.autoPlaceTowers(); this.rebuild(); } }
  moveTower(i, d) {
    const t = this.type;
    if (this.towers[i] && this.towers[i].kink) return false;
    const lo = (i > 0 ? this.towers[i - 1].d : t.Ls) + 8, hi = (i < this.towers.length - 1 ? this.towers[i + 1].d : this.L - t.Ls) - 8;
    this.towers[i].d = clamp(d, lo, hi);
    this.rebuild();
  }
  setTowerHeight(i, h) { this.towers[i].h = clamp(h, 3, 100); this.rebuild(); }
  addTowerAt(d) {
    const t = this.type;
    if (NO_TOWERS(t)) return -1;
    if (d < t.Ls + 8 || d > this.L - t.Ls - 8) return -1;
    if (this.towers.some((tw) => Math.abs(tw.d - d) < 8)) return -1;
    const M2 = this.midRange(); if (M2 && d > M2[0] - 10 && d < M2[1] + 10) return -1;
    const df = this.twDef || {};
    const tw = { d, h: df.h ?? t.towerH, roll: df.roll || 'auto', tilt: df.tilt ?? null, ...(df.pad ? { pad: df.pad } : {}), ...(df.style && df.style !== 'auto' ? { style: df.style } : {}) };
    this.towers.push(tw);
    this.towers.sort((a, b) => a.d - b.d);
    this.rebuild();
    return this.towers.indexOf(tw);
  }
  removeTower(i) { if (this.towers[i] && this.towers[i].kink) return false; this.towers.splice(i, 1); this.rebuild(); return true; }
  // nearest point on the polyline: distance along the line and distance to it
  nearestOnLine(x, z) {
    let best = { d: 0, dist: Infinity };
    for (let i = 0; i < this.P.length - 1; i++) {
      const P = this.P[i], u = this.segDir[i], len = this.D[i + 1] - this.D[i];
      const e = clamp((x - P.x) * u.x + (z - P.z) * u.z, 0, len);
      const dist = Math.hypot(x - P.x - u.x * e, z - P.z - u.z * e);
      if (dist < best.dist) best = { d: this.D[i] + e, dist };
    }
    return best;
  }
  projectD(x, z) { return this.nearestOnLine(x, z).d; }

  moveStation(which, x, z) {
    const old = { A: { ...this.A }, B: { ...this.B }, K: this.K.slice() };
    this[which] = { x, z };
    if (heightAt(this.world, this.A.x, this.A.z) > heightAt(this.world, this.B.x, this.B.z)) { [this.A, this.B] = [this.B, this.A]; this.K = this.K.slice().reverse(); }
    const t = this.type;
    this.computeGeometry();
    if (this.L < t.Ls * 2 + 40 || this.L > t.maxLen || !this.shapeOk(t)) { this.A = old.A; this.B = old.B; this.K = old.K; this.computeGeometry(); return false; }
    if (this.autoTowers) this.autoPlaceTowers();
    else this.towers = this.towers.filter((tw) => tw.d > t.Ls + 8 && tw.d < this.L - t.Ls - 8);
    this.rebuild();
    return true;
  }

  setType(key) {
    const nt = LIFT_TYPES[key];
    if (!nt) return false;
    if (this.L < nt.Ls * 2 + 40 || this.L > nt.maxLen) return false;
    if (!this.shapeOk(nt)) return false;
    this.typeKey = key;
    this.computeGeometry();
    this.autoTowers = true;
    this.autoPlaceTowers();
    this.rebuild();
    return true;
  }

  highlightTower(i) {
    if (!this.marker) return;
    if (i == null || i < 0 || !this.towerPositions[i]) { this.marker.visible = false; return; }
    const tp = this.towerPositions[i];
    this.marker.position.set(tp.x, tp.g + 0.6, tp.z);
    this.marker.visible = true;
  }

  nearestTower(x, z) {
    let best = -1, bd = Infinity;
    (this.towerPositions || []).forEach((tp, i) => { const d = Math.hypot(tp.x - x, tp.z - z); if (d < bd) { bd = d; best = i; } });
    return bd < 25 ? best : -1;
  }

  get slopeLength() { return Math.hypot(this.L, this.gB - this.gA); }
  get capacity() {
    const t = this.type;
    if (t.kind === 'tram' || t.kind === 'funicular') return Math.round(t.seats * 3600 / ((this.Tt || 100) + (this.dwell || 25)) / (t.single ? 2 : 1));
    if (t.kind === 'kombi') return Math.round(((t.seats * 2 + t.gseats) / 3) * 3600 * this.speed / this.spacing);
    return Math.round(t.seats * 3600 * this.speed / this.spacing);
  }
  get rideTime() { const t = this.type; return t.kind === 'tram' || t.kind === 'funicular' ? (this.Tt || 100) : this.slopeLength / this.speed; }
  get cost() { const t = this.type; return Math.round((t.base + t.perM * this.slopeLength + this.towers.length * (t.towerStyle === 'tram' ? 400000 : 40000) + (this.midRange() ? t.base * 0.45 : 0)) / 1000) * 1000; }
  get dailyCost() { return Math.round(this.cost * 0.0012 / 100) * 100 + 800; }

  distToLine(x, z) { return this.nearestOnLine(x, z).dist; }
  // can this line shape (bends, mid-station) be built with lift type t?
  shapeOk(t) {
    const mx = kinkMax(t), hasM = this.K.some((q) => q.k === 'm');
    if (hasM !== !!t.midSt) return false;
    const segMin = t.Ls + 30;
    for (let i = 0; i < this.P.length - 1; i++) if (this.D[i + 1] - this.D[i] < (i === 0 || i === this.P.length - 2 ? segMin : 40)) return false;
    const mb = kinkMaxBig(t);
    for (const k of this.kinks) { const deg = Math.abs(k.ang) * 180 / Math.PI; if (k.k === 'm' ? deg > MID_ANGLE_MAX : deg > mb + 0.01) return false; }
    if (hasM) { const M2 = this.midRange(); if (!M2 || M2[0] < t.Ls * 1.5 + 30 || M2[1] > this.L - t.Ls * 1.5 - 30) return false; }
    return true;
  }

  // does tower idx get a mast pad? manual setting (on/off) or automatic (in a piste)
  padOn(idx, x, z) {
    const tw = this.towers[idx] || {};
    if (tw.pad === 'on') return true;
    if (tw.pad === 'off') return false;
    if (!Lift.padsOn || !Lift.pisteAt) return false;
    for (const [ox, oz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) if (Lift.pisteAt(x + ox, z + oz)) return true;
    return false;
  }
  padSignature() { return (this.towerPositions || []).map((p, i) => (this.padOn(i, p.x, p.z) ? 1 : 0)).join(''); }

  serialize() {
    return { id: this.id, t: this.typeKey, b: this.brandKey, A: this.A, B: this.B, auto: this.autoTowers, towers: this.towers, run: this.running, sp: this.speedF, de: this.densF, c: this.color, n: this.name, lean: this.lean, q: this.queue, nl: this.nightLift, op: this.op, gs: this.garStyle, ...(this.cable ? { cab: 1 } : {}), ...(this.stStyle && this.stStyle !== 'auto' ? { st: this.stStyle } : {}), ...(this.twStyleAll && this.twStyleAll !== 'auto' ? { ts: this.twStyleAll } : {}), ...(this.twDef ? { td: this.twDef } : {}), ...(this.K.length ? { pts: this.K.map((q) => ({ x: q.x, z: q.z, k: q.k })) } : {}), ...(this.mid && this.mid.v == null ? { mid: Math.round(this.mid.d) } : {}), ...(this.trackPts && this.trackPts.length ? { tp: this.trackPts } : {}) };
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.userData.own) o.material.dispose(); });
    if (this.signMat) { this.signMat.map.dispose(); this.signMat.dispose(); }
    if (this.beltTex) this.beltTex.dispose();
  }
}
