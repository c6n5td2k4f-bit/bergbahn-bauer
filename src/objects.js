// Placeable objects: snow cannons (delegated), ski & bike funpark, lights, buildings, decoration,
// lines (nets, fences, walls). Provides ride-able surface heights for the player.
import * as THREE from 'three';
import { rbox } from './shapes.js';
import { adMat, AD_SLOTS, setAdNight, adBrandColor } from './ads.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, normalAt, nearestOnLine } from './terrain.js';
import { addHouseParts, buildingSpec, applySeasonColors } from './houses.js';
import { CANNON_TYPES } from './props.js';
import { clamp } from './noise.js';
import { rockGeometry } from './rocks.js';

// placeable rocks share a few geometries (season colours switched in setSeason)
const ROCK_GEOS = [];
const rockGeo = (k) => (ROCK_GEOS[k] ||= rockGeometry(11 + k, k === 3 ? 'slab' : 'boulder'));
const ROCK_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export const OBJ_CATS = [
  { key: 'schnee', name: '❄️ Schnee', types: ['lanze', 'lanze_kurz', 'lanze_hoch', 'lanze_rot', 'mini', 'kompakt', 'propeller', 'propeller_blau', 'propeller_rot', 'propeller_gruen', 'schlitten', 'turm_kurz', 'turm', 'turm_blau', 'turm_hoch', 'schwenkarm', 'raupe'] },
  { key: 'fun', name: '🏂 Snowpark', types: ['kicker_s', 'kicker_l', 'big_air', 'stepup', 'rail', 'kinkrail', 'rainbow', 'tube', 'box', 'quarterpipe', 'halfpipe'] },
  { key: 'bike', name: '🚵 Bikepark', types: ['holzkicker', 'drop', 'northshore', 'pumptrack', 'anlieger', 'wallride'] },
  { key: 'licht', name: '💡 Licht', types: ['flutlicht', 'laterne'] },
  { key: 'haus', name: '🏠 Gebäude', types: ['chalet', 'chalet_gross', 'steinhaus', 'engadiner', 'modernhaus', 'apartment', 'hotel', 'restaurant', 'sportshop', 'kirche', 'stall', 'kasse', 'iglu'] },
  { key: 'dienst', name: '🛠️ Dienste', types: ['garage', 'werkhof', 'rega', 'sanitaet'] },
  { key: 'rennen', name: '🏁 Skirennen', types: ['slalom_rot', 'slalom_blau', 'rs_rot', 'rs_blau', 'abfahrt_tor', 'starthaus', 'ziel'] },
  { key: 'bruecken', name: '🌉 Brücken', types: ['bruecke', 'steinbruecke', 'steg'] },
  { key: 'deko', name: '🪑 Deko', types: [ 'bank', 'picknick', 'wegweiser', 'skistaender', 'fahne', 'fels_klein', 'fels_gross', 'fels_gruppe', 'fels_platte'] },
  { key: 'werbung', name: '📣 Werbung', types: ['werbetafel', 'werbetafel_gross', 'beachflag', 'aufsteller', 'werbeturm', 'werbebogen', 'werbenetz', 'werbebande'] },
  { key: 'linie', name: '🚧 Linien', types: ['netz', 'anetz', 'anetz_blau', 'bnetz', 'werbenetz', 'polsternetz', 'werbebande', 'netz_blau', 'netz_gruen', 'netz_gelb', 'netz_schwarz', 'windnetz', 'holznetz', 'schneezaun', 'mobilzaun', 'zaun', 'mauer', 'seil', 'pfeilnetz', 'fahnenseil'] },
  { key: 'strasse', name: '🛣️ Strassen', types: [] },
  { key: 'bus', name: '🚌 Buslinien', types: [] },
];

export const OBJ_TYPES = {
  lanze: { name: 'Lanze', cost: 18000 }, propeller: { name: 'Propeller', cost: 45000 }, turm: { name: 'Propeller auf Turm', cost: 65000 }, kompakt: { name: 'Kompakt-Kanone', cost: 28000 }, propeller_blau: { name: 'Propeller blau-weiss', cost: 47000 }, schlitten: { name: 'Propeller auf Schlitten', cost: 42000 }, turm_hoch: { name: 'Propeller auf hohem Turm', cost: 85000 }, schwenkarm: { name: 'Propeller auf Schwenkarm', cost: 75000 }, raupe: { name: 'Grosse Kanone auf Raupen', cost: 110000 }, lanze_kurz: { name: 'Kurze Lanze (5 m)', cost: 12000 }, lanze_hoch: { name: 'Hohe Lanze (13 m)', cost: 24000 }, lanze_rot: { name: 'Lanze mit rotem Kopf', cost: 18000 }, mini: { name: 'Mini-Kanone (Kinderland)', cost: 16000 }, propeller_rot: { name: 'Propeller rot-weiss', cost: 46000 }, propeller_gruen: { name: 'Propeller grün', cost: 46000 }, turm_kurz: { name: 'Propeller auf kurzem Turm', cost: 55000 }, turm_blau: { name: 'Propeller blau-weiss auf Turm', cost: 66000 },
  kicker_s: { name: 'Kicker klein', cost: 8000, tilt: true, season: 'winter' },
  kicker_l: { name: 'Kicker gross + Landung', cost: 30000, tilt: true, season: 'winter' },
  big_air: { name: 'Big-Air-Kicker (riesig)', cost: 160000, tilt: true, season: 'winter' },
  stepup: { name: 'Step-up', cost: 25000, tilt: true, season: 'winter' },
  rainbow: { name: 'Rainbow-Rail', cost: 9000, tilt: true, season: 'winter' },
  tube: { name: 'Tube (Rohr)', cost: 6000, tilt: true, season: 'winter' },
  quarterpipe: { name: 'Quarterpipe', cost: 45000, tilt: true, season: 'winter' },
  rail: { name: 'Rail gerade', cost: 6000, tilt: true, season: 'winter' },
  kinkrail: { name: 'Rail mit Knick', cost: 9000, tilt: true, season: 'winter' },
  box: { name: 'Box', cost: 7000, tilt: true, season: 'winter' },
  halfpipe: { name: 'Halfpipe', cost: 120000, tilt: true, season: 'winter' },
  holzkicker: { name: 'Holz-Kicker', cost: 9000, tilt: true, season: 'summer' },
  drop: { name: 'Holz-Drop', cost: 12000, tilt: true, season: 'summer' },
  northshore: { name: 'Northshore (Holzsteg)', cost: 20000, tilt: true, season: 'summer' },
  pumptrack: { name: 'Pumptrack-Wellen', cost: 15000, tilt: true, season: 'summer' },
  anlieger: { name: 'Anlieger-Kurve', cost: 10000, tilt: true, season: 'summer' },
  wallride: { name: 'Wallride', cost: 14000, tilt: true, season: 'summer' },
  flutlicht: { name: 'Flutlicht-Mast', cost: 25000 }, laterne: { name: 'Strassenlaterne', cost: 3000 },
  chalet: { name: 'Chalet', cost: 600000, beds: 8 }, chalet_gross: { name: 'Grosses Chalet', cost: 1100000, beds: 14 },
  hotel: { name: 'Hotel', cost: 6000000, beds: 120 }, steinhaus: { name: 'Steinhaus', cost: 700000, beds: 7 }, engadiner: { name: 'Engadinerhaus', cost: 1200000, beds: 12 }, modernhaus: { name: 'Modernes Haus', cost: 900000, beds: 8 }, apartment: { name: 'Apartmenthaus', cost: 3500000, beds: 60 }, sportshop: { name: 'Sportgeschäft mit Skiverleih', cost: 1500000 }, kirche: { name: 'Dorfkirche', cost: 2500000 }, stall: { name: 'Stall', cost: 150000 }, restaurant: { name: 'Bergrestaurant', cost: 2500000 },
  kasse: { name: 'Ticket-Kasse', cost: 120000 },
  garage: { name: 'Pistenbully-Garage', cost: 1800000, daily: 350, desc: 'Platz für 3 Pistenbullys. Ohne Garage wird im Normal-Modus nicht präpariert.' },
  werkhof: { name: 'Werkhof (Schneeräumung)', cost: 1200000, daily: 250, desc: 'Für 2 Schneepflüge. Ohne Werkhof wird die Strasse nicht geräumt.' },
  rega: { name: 'Heli-Basis Luftrettung', cost: 3500000, daily: 900, desc: 'Rettungshelikopter für verletzte Gäste: schnellste Hilfe.' },
  sanitaet: { name: 'Pistenrettung', cost: 350000, daily: 150, desc: 'Pistenretter mit Schneetöff und Rettungsschlitten.' }, iglu: { name: 'Iglu-Bar', cost: 40000, season: 'winter' },
  bruecke: { name: 'Holzbrücke (37 m)', cost: 80000 }, steinbruecke: { name: 'Steinbrücke für Autos (46 m)', cost: 900000 }, steg: { name: 'Fussgänger-Passerelle über Gleis/Strasse (40 m)', cost: 350000 },
  slalom_rot: { name: 'Slalomstange rot', cost: 60, season: 'winter' }, slalom_blau: { name: 'Slalomstange blau', cost: 60, season: 'winter' },
  rs_rot: { name: 'Riesenslalom-Tor rot', cost: 250, season: 'winter' }, rs_blau: { name: 'Riesenslalom-Tor blau', cost: 250, season: 'winter' },
  abfahrt_tor: { name: 'Abfahrts-Tor', cost: 600, season: 'winter' }, starthaus: { name: 'Starthaus', cost: 45000, season: 'winter' }, ziel: { name: 'Zielbereich mit Zielbogen', cost: 90000, season: 'winter' }, bank: { name: 'Sitzbank', cost: 800 }, fels_klein: { name: 'Felsbrocken klein', cost: 300 }, fels_gross: { name: 'Felsblock gross', cost: 2500 }, fels_gruppe: { name: 'Felsgruppe', cost: 4000 }, fels_platte: { name: 'Felsplatte', cost: 1500 }, picknick: { name: 'Picknick-Tisch', cost: 1500, season: 'summer' },
  wegweiser: { name: 'Wegweiser', cost: 600 }, skistaender: { name: 'Skiständer', cost: 900, season: 'winter' }, fahne: { name: 'Fahnenmast', cost: 2000 },
  netz: { name: 'Fangnetz orange', cost: 40, line: true },
  anetz: { name: 'A-Netz rot (Rennstrecke, 4 m hoch)', cost: 120, line: true, season: 'winter' }, bnetz: { name: 'B-Netz rot (Rennstrecke)', cost: 60, line: true, season: 'winter' },
  werbetafel: { name: 'Plakatwand', cost: 3500, desc: 'Plakat 6 × 3 m, beidseitig, nachts beleuchtet.' }, werbetafel_gross: { name: 'Grosse Werbetafel', cost: 12000, desc: 'Riesentafel 12 × 6 m auf einem Mast.' }, beachflag: { name: 'Beachflag', cost: 400 }, aufsteller: { name: 'Kundenstopper', cost: 250 }, werbeturm: { name: 'Werbe-Säule', cost: 2500 }, werbebogen: { name: 'Aufblasbarer Werbebogen', cost: 3000, desc: 'Sponsorenbogen über der Piste oder dem Ziel.' },
  werbenetz: { name: 'Netz mit Werbebannern', cost: 90, line: true, season: 'winter' }, netz_blau: { name: 'Fangnetz blau', cost: 40, line: true }, netz_gruen: { name: 'Schutznetz grün', cost: 40, line: true },
  schneezaun: { name: 'Schneezaun (Latten)', cost: 25, line: true },
  anetz_blau: { name: 'A-Netz blau (Rennstrecke)', cost: 120, line: true, season: 'winter' }, polsternetz: { name: 'Sturznetz mit Polstern', cost: 90, line: true, season: 'winter' },
  pfeilnetz: { name: 'Pfeilnetz (Richtung)', cost: 35, line: true, season: 'winter', desc: 'Niedriges Netz, die Pfeile zeigen in die Richtung, in die du es ziehst.' }, fahnenseil: { name: 'Absperrseil mit Fähnchen', cost: 15, line: true },
  werbebande: { name: 'Werbebande (niedrig)', cost: 50, line: true, season: 'winter' }, netz_gelb: { name: 'Fangnetz gelb', cost: 40, line: true },
  netz_schwarz: { name: 'Schutznetz schwarz', cost: 40, line: true }, windnetz: { name: 'Windschutznetz (5 m, grün)', cost: 80, line: true },
  holznetz: { name: 'Fangnetz an Holzpfosten', cost: 35, line: true }, mobilzaun: { name: 'Bauzaun / Mobilzaun', cost: 35, line: true }, zaun: { name: 'Holzzaun', cost: 30, line: true },
  mauer: { name: 'Steinmauer', cost: 120, line: true }, seil: { name: 'Pistenabsperrung', cost: 15, line: true },
};

const matCache = {};
const mat = (hex, o = {}) => { const k = hex + JSON.stringify(o); return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial({ color: hex, ...o })); };
const UP = new THREE.Vector3(0, 1, 0);
// net mesh texture: thin cords on transparent background, tinted by the material colour
let meshTex = null;
function netTex() {
  if (meshTex) return meshTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.stroke();
  x.lineWidth = 2; x.strokeRect(0, 0, 64, 64);
  meshTex = new THREE.CanvasTexture(c); meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping; meshTex.colorSpace = THREE.SRGBColorSpace;
  return meshTex;
}
let arrowTex = null;
function arrowMat() {
  if (arrowTex) return arrowTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#ffffff';
  x.beginPath(); x.moveTo(30, 16); x.lineTo(80, 64); x.lineTo(30, 112); x.lineTo(54, 112); x.lineTo(104, 64); x.lineTo(54, 16); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  arrowTex = new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  return arrowTex;
}
const flagMats = {};
const flagMat = (hex) => flagMats[hex] || (flagMats[hex] = new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide }));
const netMats = {};
const netMat = (hex) => netMats[hex] || (netMats[hex] = new THREE.MeshLambertMaterial({ color: hex, map: netTex(), transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide }));
// invented sponsors for the advertising banners
const bannerMat = (i) => adMat('banner', i);
export const BUILDING_TYPES = ['chalet', 'chalet_gross', 'hotel', 'restaurant', 'steinhaus', 'engadiner', 'modernhaus', 'apartment', 'sportshop', 'kirche', 'stall'];
export const AD_TYPES = ['werbetafel', 'werbetafel_gross', 'beachflag', 'aufsteller', 'werbeturm', 'werbebogen'];
const BRIDGE = { bruecke: [18.5, 1.6], steinbruecke: [23, 3.5], steg: [20, 1.5] };
const WOOD = 0x9a6b3c, WOOD_D = 0x6b4426, DIRT = 0x7a5a3a;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.35, 'rgba(255,220,160,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ride-able height profile in local coordinates (x forward, z sideways). Returns height or -1
function profile(type, x, z) {
  const az = Math.abs(z);
  switch (type) {
    case 'kicker_s': case 'holzkicker': {
      const L = type === 'kicker_s' ? 4.5 : 4, H = type === 'kicker_s' ? 1.3 : 1.6, W = type === 'kicker_s' ? 2 : 1.25;
      if (az > W) return -1;
      if (x >= -L && x <= 0) return H * Math.pow((x + L) / L, 2.1);
      if (x > 0 && x <= 0.8) return H;
      if (x > 0.8 && x <= 2.5) return H * (1 - (x - 0.8) / 1.7);
      return -1;
    }
    case 'kicker_l': {
      const L = 9, H = 3;
      if (az <= 3.5 && x >= -L && x <= 0) return H * Math.pow((x + L) / L, 2.1);
      if (az > 4.5) return -1;
      if (x > 0 && x <= 2.5) return H * 0.75;
      if (x > 2.5 && x <= 12.5) return H * 0.75 + (x - 2.5) / 10 * 0.4;
      if (x > 12.5 && x <= 16.5) { const t = (x - 12.5) / 4; return H * 0.75 + 0.4 - t * t * (H * 0.2 + 0.4); }
      if (x > 16.5 && x <= 34.5) return H * 0.55 * (1 - (x - 16.5) / 18);
      return -1;
    }
    case 'big_air': {
      // real big air: steep kicker, gap behind it, landing hill built up to almost lip height,
      // short deck, round knuckle and a long steep landing
      const H = 7.5, L = 20, T = 6.4;
      if (az <= 6 && x >= -L && x <= 0) return H * Math.pow((x + L) / L, 2.1);
      if (az <= 6 && x > 0 && x <= 0.6) return H;
      if (az <= 6 && x > 0.6 && x <= 4) return H - (x - 0.6) / 3.4 * (H - 0.8);
      if (az > 9) return -1;
      if (x > 4 && x <= 12) return 0.8;
      if (x > 12 && x <= 24) { const u = (x - 12) / 12; return 0.8 + (T - 0.8) * (u * u * (3 - 2 * u)); }
      if (x > 24 && x <= 27) return T;
      if (x > 27 && x <= 31) { const t = (x - 27) / 4; return T - t * t * 0.9; }
      if (x > 31 && x <= 54) { const t = (x - 31) / 23; return (T - 0.9) * (1 - t) * (1 - 0.25 * t * (1 - t)); }
      return -1;
    }
    case 'stepup': if (az > 3) return -1; if (x >= -6 && x <= 0) return 1.8 * Math.pow((x + 6) / 6, 2.1); if (x > 0 && x <= 8) return 1.8; if (x > 8 && x <= 10) return 1.8 - (x - 8) * 0.2; if (x > 10 && x <= 18) return 1.4 * (1 - (x - 10) / 8); return -1;
    case 'rainbow': if (az <= 0.16 && Math.abs(x) <= 4) return 0.66 + Math.sin(Math.PI * (x + 4) / 8); if (x >= -5.8 && x < -4.2 && az <= 0.7) return 0.55 * (x + 5.8) / 1.6; return -1;
    case 'tube': if (Math.abs(x) <= 3 && az <= 0.35) return 1.23; if (x >= -4.6 && x < -3.1 && az <= 0.8) return 0.55 * (x + 4.6) / 1.5; return -1;
    case 'quarterpipe': { if (az > 6) return -1; if (x >= -4.5 && x <= 0) { const u = (x + 4.5) / 4.5; return 4.5 - Math.sqrt(Math.max(0, 1 - u * u)) * 4.5; } if (x > 0 && x <= 2) return 4.5; return -1; }
    case 'box': if (Math.abs(x) <= 3.5 && az <= 0.36) return 0.95; if (x >= -5 && x < -3.4 && az <= 0.8) return 0.6 * (x + 5) / 1.6; return -1;
    case 'rail': if (Math.abs(x) <= 4.5 && az <= 0.16) return 1.0; if (x >= -6 && x < -4.4 && az <= 0.7) return 0.5 * (x + 6) / 1.6; return -1;
    case 'kinkrail': {
      if (az > 0.16) { if (x >= -7.8 && x < -6.2 && az <= 0.7) return 0.5 * (x + 7.8) / 1.6; return -1; }
      if (x >= -6 && x < -2.5) return 0.5 + (x + 6) / 3.5 * 0.7; if (x >= -2.5 && x <= 2.5) return 1.2; if (x > 2.5 && x <= 6) return 1.2 - (x - 2.5) / 3.5 * 0.7; return -1;
    }
    case 'halfpipe': {
      if (Math.abs(x) > 27.5 || az > 11) return -1;
      if (az <= 4) return 1; if (az <= 8.5) return 5.5 - Math.sqrt(Math.max(0, 4.5 * 4.5 - (az - 4) ** 2)); return 5.5;
    }
    case 'drop': if (az > 1.1) return -1; if (x >= -9 && x < -4) return 2.2 * (x + 9) / 5; if (x >= -4 && x <= 0) return 2.2; return -1;
    case 'northshore': if (az > 0.65 || Math.abs(x) > 14) return -1; if (Math.abs(x) > 12) return 1.5 * (14 - Math.abs(x)) / 2; return 1.5 + 0.7 * Math.sin(x / 2.2);
    case 'pumptrack': if (az > 2 || Math.abs(x) > 15) return -1; return 0.35 * (1 - Math.cos(2 * Math.PI * (x + 15) / 6));
    case 'anlieger': { const r = Math.hypot(x, z), a = Math.atan2(z, x); if (a < 0 || a > Math.PI || r < 4 || r > 9) return -1; return (r - 4) / 5 * 2.2; }
    case 'wallride': if (Math.abs(x) > 5 || z < -0.2 || z > 2.6) return -1; return clamp(z * 1.3, 0, 3.2);
    default: return -1;
  }
}

let nextId = 1;

// colours for floodlights and lanterns
export const LIGHT_COLORS = [['Warmweiss', 0xfff2cc], ['Kaltweiss', 0xe6f1ff], ['Gelb', 0xffd23f], ['Orange', 0xff8a1f], ['Rot', 0xff3434], ['Pink', 0xff5fc8], ['Lila', 0xa55bff], ['Blau', 0x3d7dff], ['Türkis', 0x2fe0d0], ['Grün', 0x46e05a]];
export const PAD_TYPES = { flutlicht: { r: 0.62, h: 2.8 }, laterne: { r: 0.36, h: 2.2 }, fahne: { r: 0.32, h: 2.0 }, lanze: { r: 0.34, h: 2.2 }, lanze_kurz: { r: 0.34, h: 2.2 }, lanze_hoch: { r: 0.34, h: 2.2 }, lanze_rot: { r: 0.34, h: 2.2 }, turm: { r: 0.55, h: 2.8 }, turm_kurz: { r: 0.55, h: 2.8 }, turm_blau: { r: 0.55, h: 2.8 }, turm_hoch: { r: 0.62, h: 2.8 } };
const PAD_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const PAD_RED = new THREE.MeshLambertMaterial({ color: 0xd8262c });
const PAD_WHITE = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });

export class Objects {
  static padsOn = true;
  static pisteAt = null;
  constructor(world, scene, cannons, trees) {
    this.world = world; this.scene = scene; this.cannons = cannons; this.trees = trees;
    this.group = new THREE.Group(); scene.add(this.group);
    this.list = [];
    this.night = false;
    this.season = 0;
    this.glow = glowTexture();
    this.poolMat = new THREE.MeshBasicMaterial({ map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
    this.lampMat = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x000000 });
    this.spriteMat = new THREE.SpriteMaterial({ map: this.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.lightMatsCache = [];
  }

  // per light colour: lamp glass, light pool on the ground, glow sprite (index 0 = the old warm white)
  lightMats(ci) {
    ci = ci | 0;
    if (!ci) return { lamp: this.lampMat, pool: this.poolMat, sprite: this.spriteMat };
    if (this.lightMatsCache[ci]) return this.lightMatsCache[ci];
    const col = LIGHT_COLORS[ci] ? LIGHT_COLORS[ci][1] : 0xffffff;
    const lamp = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: this.night ? col : 0x000000 });
    const pool = this.poolMat.clone(); pool.color.setHex(col);
    const sprite = this.spriteMat.clone(); sprite.color.setHex(col);
    return (this.lightMatsCache[ci] = { lamp, pool, sprite, col });
  }
  setLightColor(o, ci) { o.lc = ci; this.rotate(o, o.yaw); }

  // red safety pads around masts that stand in a piste (auto) or set per object (on/off)
  padOn(o) {
    if (!PAD_TYPES[o.type]) return false;
    if (o.pad === 'on') return true;
    if (o.pad === 'off') return false;
    if (!Objects.padsOn || !Objects.pisteAt) return false;
    for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) if (Objects.pisteAt(o.x + ox, o.z + oz)) return true;
    return false;
  }
  updatePad(o) {
    if (o.padMesh) { this.group.remove(o.padMesh); o.padMesh = null; }
    if (o.line || !this.padOn(o)) return;
    const P = PAD_TYPES[o.type];
    const g = new THREE.Group();
    const body = new THREE.Mesh(PAD_CYL, PAD_RED); body.scale.set(P.r * 2, P.h, P.r * 2); body.position.y = P.h / 2 + 0.05; g.add(body);
    for (const fy of [0.45, P.h - 0.45]) { const ring = new THREE.Mesh(PAD_CYL, PAD_WHITE); ring.scale.set(P.r * 2 + 0.04, 0.2, P.r * 2 + 0.04); ring.position.y = fy; g.add(ring); }
    g.position.set(o.x, heightAt(this.world, o.x, o.z), o.z);
    if ((o.size || 1) !== 1) g.scale.setScalar(o.size);
    g.traverse((c) => { c.userData.objId = o.id; c.castShadow = true; });
    g.visible = this.season === 0 && (!o.group || o.group.visible);
    this.group.add(g);
    o.padMesh = g;
  }
  count(type) { return this.list.filter((o) => o.type === type).length; }
  dailyCost() { return this.list.reduce((a, o) => a + (OBJ_TYPES[o.type].daily || 0), 0); }
  refreshPads() { for (const o of this.list) { const want = this.padOn(o); if (want !== !!o.padMesh) this.updatePad(o); } }

  // objects that can be scaled with the size slider (not bridges / lines)
  static sizable(o) { return !o.line && !BRIDGE[o.type]; }
  add(type, x, z, yaw, id, size = 1) {
    const o = { id: id || nextId++, type, x, z, yaw, size: BRIDGE[type] ? 1 : size || 1 };
    if (id) nextId = Math.max(nextId, id + 1);
    this.build(o);
    if (!o.group) return null;
    this.list.push(o);
    this.applySeason(o);
    return o;
  }

  addLine(type, a, b, id) {
    const o = { id: id || nextId++, type, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, yaw: 0, line: true };
    if (id) nextId = Math.max(nextId, id + 1);
    this.build(o);
    this.list.push(o);
    return o;
  }

  lineCost(type, a, b) { return Math.round(OBJ_TYPES[type].cost * Math.hypot(b.x - a.x, b.z - a.z)); }

  build(o) {
    const w = this.world;
    if (CANNON_TYPES[o.type]) {
      o.cannon = this.cannons.add(o.type, o.x, o.z, o.yaw, o.size || 1);
      if (!o.cannon) return;
      o.group = o.cannon.g;
    } else if (o.line) {
      o.group = this.buildLine(o);
      this.group.add(o.group);
    } else {
      const g = new THREE.Group();
      const t = OBJ_TYPES[o.type];
      if (BUILDING_TYPES.includes(o.type)) this.buildHouse(g, o);
      else {
        const info = this.buildModel(g, o.type, o);
        const y = heightAt(w, o.x, o.z);
        g.position.set(o.x, y, o.z);
        const qy = new THREE.Quaternion().setFromAxisAngle(UP, o.yaw);
        if (t.tilt) {
          const n = normalAt(w, o.x, o.z);
          const qn = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(n.x, n.y, n.z));
          g.quaternion.copy(qn).multiply(qy);
          g.position.y -= 0.12;
        } else g.quaternion.copy(qy);
        if (info && info.absY !== undefined) { g.position.y = info.absY; o.deckY = info.absY; }
      }
      if ((o.size || 1) !== 1) g.scale.setScalar(o.size);
      if (o.type === 'flutlicht' || o.type === 'laterne') this.addLightPool(o);
      this.group.add(g);
      o.group = g;
      o.invQ = g.quaternion.clone().invert();
      const r = { steinbruecke: 0, steg: 0, slalom_rot: 0, slalom_blau: 0, rs_rot: 0, rs_blau: 0, abfahrt_tor: 0, starthaus: 3, ziel: 8, garage: 16, werkhof: 14, rega: 22, sanitaet: 6, halfpipe: 30, hotel: 18, chalet: 12, chalet_gross: 13, restaurant: 15, steinhaus: 11, engadiner: 13, modernhaus: 12, apartment: 17, sportshop: 13, kirche: 20, stall: 9, kicker_l: 22, big_air: 40, stepup: 12, quarterpipe: 12, rainbow: 6, tube: 5, northshore: 15, pumptrack: 16, bruecke: 0, iglu: 6, kasse: 5 }[o.type] ?? 5;
      if (r) this.trees.removeCircle(o.x, o.z, r * Math.max(1, o.size || 1));
    }
    o.group.traverse((c) => { c.userData.objId = o.id; });
    this.updatePad(o);
  }

  buildHouse(g, o) {
    const w = this.world;
    const spec = buildingSpec(o.type, o.id * 7 + 3);
    const out = { solid: [], glass: [] };
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw), hw = spec.w / 2 + (o.type === 'restaurant' ? 2 : o.type === 'kirche' ? 5 : 0), hd = spec.d / 2 + (o.type === 'restaurant' ? 7 : o.type === 'sportshop' ? 2 : 0);
    const hs = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]].map(([lx, lz]) => heightAt(w, o.x + lx * c + lz * s, o.z - lx * s + lz * c));
    addHouseParts(out, spec, 0, 0, o.yaw, Math.min(...hs), Math.max(...hs) - 0.5);
    const solid = new THREE.Mesh(mergeGeometries(out.solid), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const glass = out.glass.length ? new THREE.Mesh(mergeGeometries(out.glass), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: this.night ? 0xffb347 : 0x000000, emissiveIntensity: 0.9 })) : new THREE.Group();
    o.glassMat = glass.material || new THREE.MeshLambertMaterial();
    o.seasonGeo = solid.geometry;
    applySeasonColors(o.seasonGeo, this.season);
    solid.castShadow = glass.castShadow = true;
    g.add(solid, glass);
    g.position.set(o.x, 0, o.z);
  }

  // models in local space: +x = forward/jump direction, y up
  buildModel(g, type, o) {
    const snow = mat(0xf6f8fb), metal = mat(0x9aa3ab), dark = mat(0x2b2e33), orange = mat(0xff7a00), blue = mat(0x1f6fd1), yellow = mat(0xf2c200), wood = mat(WOOD), woodD = mat(WOOD_D), dirt = mat(DIRT);
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
    const ext = (pts, depth, m) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); return add(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -depth / 2), m, 0, 0, 0); };
    const curve = (L, H, n = 12) => { const p = [[-L, 0]]; for (let i = 1; i <= n; i++) { const x = -L + L * i / n; p.push([x, H * Math.pow((x + L) / L, 2.1)]); } return p; };
    switch (type) {
      case 'kicker_s': case 'kicker_l': {
        const big = type === 'kicker_l';
        const L = big ? 9 : 4.5, H = big ? 3 : 1.3, W = big ? 7 : 4;
        ext([...curve(L, H), [0.8, H], [2.5, 0]], W, snow);
        add(new THREE.BoxGeometry(0.25, 0.08, W + 0.05), blue, 0.4, H + 0.02, 0);
        if (big) {
          const T = 10;
          ext([[2.5, 0], [2.5, H * 0.75], [12.5, H * 0.75 + 0.4], [14.5, H * 0.75 + 0.3], [16.5, H * 0.55], [34.5, 0]], W + 2, snow);
          for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), k % 2 ? blue : orange, 3 + k * 7, (k < 2 ? H * 0.75 + 0.5 : H * 0.55 * (1 - (3 + k * 7 - 16.5) / 18)) + 0.5, sd * (W / 2 + 1.2));
          void T;
        }
        break;
      }
      case 'rail':
        add(new THREE.CylinderGeometry(0.06, 0.06, 9, 8), yellow, 0, 0.95, 0, 0, 0, Math.PI / 2);
        for (const x of [-3.5, 3.5]) add(new THREE.BoxGeometry(0.12, 0.95, 0.5), dark, x, 0.47, 0);
        ext([[-6, 0], [-4.4, 0.5], [-4.4, 0]], 1.4, snow);
        break;
      case 'kinkrail': {
        const segs = [[-6, 0.5, -2.5, 1.2], [-2.5, 1.2, 2.5, 1.2], [2.5, 1.2, 6, 0.5]];
        for (const [x1, y1, x2, y2] of segs) { const len = Math.hypot(x2 - x1, y2 - y1); add(new THREE.CylinderGeometry(0.06, 0.06, len, 8), orange, (x1 + x2) / 2, (y1 + y2) / 2, 0, 0, 0, Math.PI / 2 + Math.atan2(y2 - y1, x2 - x1)); }
        for (const x of [-5, -2.5, 2.5, 5]) { const h = Math.abs(x) > 3 ? 0.6 : 1.2; add(new THREE.BoxGeometry(0.12, h, 0.4), dark, x, h / 2, 0); }
        ext([[-7.8, 0], [-6.2, 0.5], [-6.2, 0]], 1.4, snow);
        break;
      }
      case 'big_air': {
        // big air: steep kicker, gap, landing hill (up to almost lip height), deck, knuckle, long landing
        const H = 7.5, L = 20, W = 12, T = 6.4;
        ext([...curve(L, H, 22), [0.6, H], [4, 0.8], [4, 0]], W, snow);
        add(new THREE.BoxGeometry(0.3, 0.1, W + 0.05), blue, 0.3, H + 0.04, 0);
        ext([[4, 0], [4, 0.8], [12, 0.8], [12, 0]], W + 6, snow);
        const land = [[12, 0]];
        for (let k = 0; k <= 12; k++) { const u = k / 12; land.push([12 + u * 12, 0.8 + (T - 0.8) * (u * u * (3 - 2 * u))]); }
        land.push([27, T]);
        for (let k = 1; k <= 4; k++) { const t = k / 4; land.push([27 + t * 4, T - t * t * 0.9]); }
        for (let k = 1; k <= 8; k++) { const t = k / 8; land.push([31 + t * 23, (T - 0.9) * (1 - t) * (1 - 0.25 * t * (1 - t))]); }
        ext(land, W + 6, snow);
        // marker poles along the landing, blue line on the knuckle
        add(new THREE.BoxGeometry(0.3, 0.08, W + 6.05), blue, 27.2, T + 0.03, 0);
        for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) { const x2 = 25 + k * 4.5, h2 = profile('big_air', x2, 0); add(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), k % 2 ? blue : orange, x2, h2 + 0.7, sd * (W / 2 + 3.6)); }
        // banners at the take-off
        for (const sd of [-1, 1]) { add(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), dark, -1, H + 2, sd * (W / 2 + 0.6)); add(new THREE.BoxGeometry(0.05, 1.2, 3.2), orange, -1, H + 3.3, sd * (W / 2 + 0.6 - sd * 1.6)); }
        break;
      }
      case 'stepup':
        ext([...curve(6, 1.8, 10), [0, 1.8], [8, 1.8], [10, 1.4], [18, 0]], 6, snow);
        add(new THREE.BoxGeometry(0.2, 0.06, 6.05), blue, 0, 1.83, 0);
        break;
      case 'rainbow': {
        const n2 = 10;
        for (let k = 0; k < n2; k++) { const x1 = -4 + 8 * k / n2, x2 = -4 + 8 * (k + 1) / n2, y1 = 0.6 + Math.sin(Math.PI * k / n2), y2 = 0.6 + Math.sin(Math.PI * (k + 1) / n2); add(new THREE.CylinderGeometry(0.06, 0.06, Math.hypot(x2 - x1, y2 - y1), 8), mat(0xe8306a), (x1 + x2) / 2, (y1 + y2) / 2, 0, 0, 0, Math.PI / 2 + Math.atan2(y2 - y1, x2 - x1)); }
        for (const x of [-3.2, 0, 3.2]) { const h2 = 0.6 + Math.sin(Math.PI * (x + 4) / 8); add(new THREE.BoxGeometry(0.12, h2, 0.4), dark, x, h2 / 2, 0); }
        ext([[-5.8, 0], [-4.2, 0.55], [-4.2, 0]], 1.4, snow);
        break;
      }
      case 'tube':
        add(new THREE.CylinderGeometry(0.38, 0.38, 6, 16).rotateZ(Math.PI / 2), mat(0x2b8a3e), 0, 0.85, 0);
        for (const x of [-2.4, 2.4]) add(new THREE.BoxGeometry(0.15, 0.5, 0.5), dark, x, 0.25, 0);
        ext([[-4.6, 0], [-3.1, 0.55], [-3.1, 0]], 1.6, snow);
        break;
      case 'quarterpipe': {
        const sh = [[-6, 0]]; for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI / 2; sh.push([-4.5 + Math.sin(a) * 4.5, 4.5 - Math.cos(a) * 4.5]); }
        sh.push([2, 4.5], [2, 0]);
        ext(sh, 12, snow);
        add(new THREE.BoxGeometry(0.15, 0.08, 12.05), blue, 0, 4.52, 0);
        break;
      }
      case 'box':
        add(new THREE.BoxGeometry(7, 0.35, 0.7), orange, 0, 0.75, 0);
        add(new THREE.BoxGeometry(7.02, 0.06, 0.72), dark, 0, 0.94, 0);
        for (const x of [-2.8, 0, 2.8]) add(new THREE.BoxGeometry(0.15, 0.6, 0.5), dark, x, 0.3, 0);
        ext([[-5, 0], [-3.4, 0.6], [-3.4, 0]], 1.6, snow);
        break;
      case 'halfpipe': {
        const sh = new THREE.Shape();
        sh.moveTo(-11, -1); sh.lineTo(11, -1); sh.lineTo(11, 5.5); sh.lineTo(8.5, 5.5);
        sh.absarc(4, 5.5, 4.5, 0, -Math.PI / 2, true); sh.lineTo(-4, 1);
        sh.absarc(-4, 5.5, 4.5, -Math.PI / 2, -Math.PI, true); sh.lineTo(-11, 5.5); sh.lineTo(-11, -1);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 55, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, -27.5);
        add(geo, snow, 0, 0, 0, 0, Math.PI / 2, 0);
        for (const sd of [-1, 1]) add(new THREE.BoxGeometry(55, 0.15, 0.2), blue, 0, 5.55, sd * 8.6);
        break;
      }
      case 'holzkicker': {
        ext([...curve(4, 1.6), [0.6, 1.6], [0.6, 0]], 2.5, wood);
        for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(0.06, 0.02, 2.55), woodD, -3.6 + k * 0.5, 1.6 * Math.pow((-3.6 + k * 0.5 + 4) / 4, 2.1) + 0.03, 0);
        for (const sd of [-1, 1]) for (const x of [-2, -0.8, 0.4]) add(new THREE.BoxGeometry(0.12, 1.6, 0.12), woodD, x, 0.8, sd * 1.15);
        break;
      }
      case 'drop':
        ext([[-9, 0], [-4, 2.2], [0, 2.2], [0, 0]], 2.2, wood);
        for (const x of [-3.5, -1.5, -0.2]) for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.15, 2.2, 0.15), woodD, x, 1.1, sd * 1.05);
        add(new THREE.BoxGeometry(0.1, 0.1, 2.3), mat(0xff3300), -0.05, 2.25, 0);
        break;
      case 'northshore': {
        for (let i = 0; i < 28; i++) {
          const x = -14 + i + 0.5, h = profile('northshore', x, 0);
          const dh = profile('northshore', x + 0.5, 0) - profile('northshore', x - 0.5, 0);
          add(new THREE.BoxGeometry(1.02, 0.08, 1.3), wood, x, h - 0.04, 0, 0, 0, Math.atan2(dh, 1));
          if (i % 3 === 1) for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.12, h, 0.12), woodD, x, h / 2, sd * 0.6);
        }
        break;
      }
      case 'pumptrack': {
        const pts = [[-15, 0]];
        for (let i = 0; i <= 60; i++) { const x = -15 + i * 0.5; pts.push([x, profile('pumptrack', x, 0) + 0.02]); }
        pts.push([15, 0]);
        ext(pts, 4, dirt);
        break;
      }
      case 'anlieger': {
        const geo = new THREE.BufferGeometry(); const pos = [];
        const seg = 16;
        for (let i = 0; i < seg; i++) {
          const a0 = i / seg * Math.PI, a1 = (i + 1) / seg * Math.PI;
          const P = (r, a) => [Math.cos(a) * r, (r - 4) / 5 * 2.2 + 0.02, Math.sin(a) * r];
          const q = [P(4, a0), P(9, a0), P(9, a1), P(4, a1)];
          pos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
          const b0 = [Math.cos(a0) * 9, 0, Math.sin(a0) * 9], b1 = [Math.cos(a1) * 9, 0, Math.sin(a1) * 9];
          pos.push(...q[1], ...q[2], ...b1, ...q[1], ...b1, ...b0);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
        add(geo, new THREE.MeshLambertMaterial({ color: DIRT, side: THREE.DoubleSide }), 0, 0, 0);
        break;
      }
      case 'wallride':
        add(new THREE.BoxGeometry(10, 0.1, 4.06), wood, 0, 1.6, 1.25, -0.907);
        for (const x of [-4.5, 0, 4.5]) add(new THREE.BoxGeometry(0.15, 3.2, 0.15), woodD, x, 1.6, 2.5);
        break;
      case 'flutlicht':
        add(new THREE.CylinderGeometry(0.22, 0.35, 16, 8), metal, 0, 8, 0);
        add(new THREE.BoxGeometry(0.3, 0.3, 3.4), metal, 0.2, 15.6, 0);
        for (const z of [-1.2, 0, 1.2]) { add(new THREE.BoxGeometry(0.5, 0.8, 0.9), dark, 0.55, 15.3, z, 0, 0, -0.6); add(new THREE.BoxGeometry(0.05, 0.65, 0.75), this.lightMats(o && o.lc).lamp, 0.82, 15.15, z, 0, 0, -0.6); }
        add(new THREE.BoxGeometry(1.2, 0.4, 1.2), mat(0x9b9b96), 0, 0.1, 0);
        break;
      case 'laterne':
        add(new THREE.CylinderGeometry(0.08, 0.12, 4.5, 8), dark, 0, 2.25, 0);
        add(new THREE.BoxGeometry(0.5, 0.6, 0.5), dark, 0, 4.7, 0);
        add(new THREE.BoxGeometry(0.4, 0.45, 0.4), this.lightMats(o && o.lc).lamp, 0, 4.65, 0);
        break;
      case 'kasse':
        add(new THREE.BoxGeometry(4, 3, 3), mat(0x8a5e3b), 0, 1.5, 0);
        add(new THREE.BoxGeometry(2.4, 1.0, 0.1), mat(0x7fa6bf), 0, 1.7, 1.52);
        add(new THREE.BoxGeometry(4.6, 0.3, 3.6), mat(0xf4f7fa), 0, 3.15, 0);
        add(new THREE.BoxGeometry(3, 0.6, 0.1), mat(0xd62020), 0, 2.6, 1.53);
        break;
      case 'garage': {
        // long hall with three big doors facing +x
        const wall = mat(0xd9d4c8), roofM = mat(0x5b6168), door = mat(0x3c4a5a);
        add(rbox(10, 6.5, 24, 0.3), wall, 0, 3.25, 0);
        add(rbox(11.2, 0.5, 25.2, 0.2), roofM, 0, 6.7, 0);
        for (const z2 of [-7.5, 0, 7.5]) { add(rbox(0.2, 4.8, 6.2, 0.06, 1), door, 5.05, 2.45, z2); for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.06, 0.06, 6.0), mat(0x2a3440), 5.17, 0.6 + k * 0.75, z2); }
        add(rbox(0.15, 0.9, 8, 0.05, 1), mat(0xd42a1e), 5.1, 5.6, 0);
        add(rbox(10.4, 0.9, 0.2, 0.05, 1), mat(0xffffff), 0, 5.6, 12.05);
        add(rbox(14, 0.12, 26, 0.06, 1), mat(0x8c8a86), 8, 0.06, 0);
        break;
      }
      case 'werkhof': {
        const wall = mat(0xc9c2b4), roofM = mat(0x7a3b2a);
        add(rbox(9, 5.2, 16, 0.3), wall, 0, 2.6, 0);
        add(rbox(10, 0.45, 17, 0.2), roofM, 0, 5.4, 0);
        for (const z2 of [-4, 4]) add(rbox(0.2, 4.0, 5.5, 0.06, 1), mat(0xff8a00), 4.55, 2.0, z2);
        // salt silo
        add(new THREE.CylinderGeometry(2.1, 2.1, 6, 16), mat(0xe9eaec), -1, 5.5, 10.5);
        add(new THREE.ConeGeometry(2.2, 1.6, 16), mat(0x9aa3ab), -1, 9.3, 10.5);
        for (const [lx, lz] of [[-2.4, 9], [0.4, 9], [-2.4, 12], [0.4, 12]]) add(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), metal, lx, 1.3, lz);
        add(new THREE.ConeGeometry(1.4, 2.4, 6, 1, true), mat(0x9aa3ab), -1, 1.8, 10.5, Math.PI);
        break;
      }
      case 'rega': {
        // hangar with a round roof + helipad (H) in front (+x)
        const wall = mat(0xe8e6e1);
        add(rbox(14, 5, 12, 0.3), wall, -4, 2.5, 0);
        const arch = new THREE.CylinderGeometry(6.2, 6.2, 14, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
        add(arch, mat(0xc9ced3, { side: THREE.DoubleSide }), -4, 5, 0, 0, 0, 0).scale.set(1, 0.45, 1);
        add(rbox(0.2, 4.2, 9, 0.06, 1), mat(0x3c4a5a), 3.05, 2.1, 0);
        add(rbox(0.2, 0.8, 7, 0.05, 1), mat(0xd42a1e), 3.1, 4.6, 0);
        add(new THREE.CylinderGeometry(7.5, 7.8, 0.4, 32), mat(0x6f7378), 12, 0.2, 0);
        add(new THREE.TorusGeometry(6.6, 0.18, 4, 40).rotateX(Math.PI / 2), mat(0xffffff), 12, 0.42, 0);
        for (const zz of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.6, 0.05, 4.2), mat(0xffffff), 12, 0.43, zz).rotation.y = Math.PI / 2;
        add(new THREE.BoxGeometry(2.6, 0.05, 0.6), mat(0xffffff), 12, 0.43, 0).rotation.y = Math.PI / 2;
        add(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), metal, 4, 2.5, 7);
        add(new THREE.ConeGeometry(0.45, 2.2, 10, 1, true).rotateZ(-Math.PI / 2), mat(0xff6a00, { side: THREE.DoubleSide }), 5.1, 4.7, 7);
        break;
      }
      case 'sanitaet': {
        add(rbox(5, 3, 4, 0.2), mat(0xf2f2f2), 0, 1.5, 0);
        add(rbox(5.6, 0.3, 4.6, 0.12), mat(0xd42a1e), 0, 3.15, 0);
        add(rbox(0.1, 1.1, 1.1, 0.04, 1), mat(0x1f9d55), 2.55, 2.0, 0);
        add(new THREE.BoxGeometry(0.12, 0.7, 0.22), mat(0xffffff), 2.62, 2.0, 0);
        add(new THREE.BoxGeometry(0.12, 0.22, 0.7), mat(0xffffff), 2.62, 2.0, 0);
        add(rbox(1.8, 1.5, 0.08, 0.04, 1), mat(0x7fa6bf), 0, 1.7, 2.02);
        // rescue sled (akja) next to the hut
        add(rbox(2.4, 0.35, 0.8, 0.15), mat(0xff6a00), 3.8, 0.2, -1);
        break;
      }
      case 'iglu': {
        add(new THREE.SphereGeometry(3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), snow, 0, 0, 0);
        add(new THREE.CylinderGeometry(1.1, 1.1, 2, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), snow, 2.6, 0, 0);
        add(new THREE.BoxGeometry(0.1, 1.4, 1.3), mat(0x111111), 3.62, 0.7, 0);
        add(new THREE.BoxGeometry(1.4, 1.0, 0.6), mat(0xdde8f0), 4.6, 0.5, 2);
        break;
      }
      case 'bruecke': case 'steinbruecke': case 'steg': {
        const w = this.world, c = Math.cos(o.yaw), s2 = Math.sin(o.yaw);
        const half = BRIDGE[type][0];
        // deck above the ground at both ends, above water, and high enough over the railway / road
        let deck = Math.max(heightAt(w, o.x - half * c, o.z + half * s2), heightAt(w, o.x + half * c, o.z - half * s2)) + 0.6;
        for (let k = -half; k <= half; k += 3) {
          const px = o.x + k * c, pz = o.z - k * s2;
          deck = Math.max(deck, heightAt(w, px, pz) + 0.8);
          const L = w.lake;
          if (L && Math.hypot((px - L.x) / (L.a * 1.15), (pz - L.z) / (L.b * 1.15)) < 1) deck = Math.max(deck, L.level + 1.6);
          if (w.river.length) { const r = nearestOnLine(w.river, px, pz); if (r.d < 20) deck = Math.max(deck, r.h + 3.2 + 1.6); }
          if (type !== 'bruecke' && w.rail && w.rail.length) { const r = nearestOnLine(w.rail, px, pz); if (r.d < 6) deck = Math.max(deck, r.h + 7.4); }
          if (type !== 'bruecke' && w.road.length) { const r = nearestOnLine(w.road, px, pz); if (r.d < 7) deck = Math.max(deck, r.h + 5.4); }
        }
        const gy = deck, Lb = half * 2, Wb = BRIDGE[type][1] * 2;
        const pillar = (x, m, r2) => { const ly = heightAt(w, o.x + x * c, o.z - x * s2); const hgt = Math.max(0.5, gy - ly + 2); return add(r2 ? rbox(r2, hgt, Wb * 0.8, 0.3) : new THREE.BoxGeometry(0.45, hgt, 0.45), m, x, -hgt / 2, 0); };
        if (type === 'bruecke') {
          add(new THREE.BoxGeometry(Lb, 0.35, Wb), wood, 0, 0, 0);
          for (const sd of [-1, 1]) { add(new THREE.BoxGeometry(Lb, 0.12, 0.12), woodD, 0, 1.0, sd * 1.55); for (let k = -8; k <= 8; k++) add(new THREE.BoxGeometry(0.1, 1.0, 0.1), woodD, k * 2.2, 0.5, sd * 1.55); }
          for (const x of [-15, -7.5, 0, 7.5, 15]) for (const sd of [-1, 1]) { const ly = heightAt(w, o.x + x * c, o.z - x * s2); const hgt = Math.max(0.5, gy - ly + 2); add(new THREE.BoxGeometry(0.45, hgt, 0.45), woodD, x, -hgt / 2, sd * 1.3); }
        } else if (type === 'steinbruecke') {
          const stone = mat(0x9b958c), asph = mat(0x45484c);
          add(rbox(Lb, 1.0, Wb, 0.25), stone, 0, -0.4, 0);
          add(rbox(Lb - 0.2, 0.12, Wb - 1.4, 0.04, 1), asph, 0, 0.12, 0);
          for (const sd of [-1, 1]) { add(rbox(Lb, 0.9, 0.5, 0.18), stone, 0, 0.5, sd * (Wb / 2 - 0.25)); add(new THREE.BoxGeometry(Lb, 0.08, 0.06), mat(0xdedede), 0, 0.16, sd * (Wb / 2 - 1.0)); }
          for (const x of [-half / 2, half / 2]) pillar(x, stone, 2.4);
          for (const x of [-half, half]) pillar(x, stone, 3.2);
        } else {
          // steel footbridge with truss sides and stairs down at both ends
          const steel = mat(0x5d7a8c), glassM = mat(0x9fc7e0, { transparent: true, opacity: 0.45 });
          add(rbox(Lb, 0.35, Wb, 0.1), steel, 0, 0, 0);
          for (const sd of [-1, 1]) {
            add(new THREE.BoxGeometry(Lb, 0.14, 0.14), steel, 0, 1.6, sd * (Wb / 2));
            add(new THREE.BoxGeometry(Lb, 1.2, 0.04), glassM, 0, 0.9, sd * (Wb / 2));
            for (let k = -Math.floor(half / 2.5); k <= Math.floor(half / 2.5); k++) add(new THREE.BoxGeometry(0.1, 1.6, 0.1), steel, k * 2.5, 0.8, sd * (Wb / 2));
          }
          for (const x of [-half + 2, -half / 3, half / 3, half - 2]) for (const sd of [-1, 1]) { const ly = heightAt(w, o.x + x * c, o.z - x * s2); const hgt = Math.max(0.5, gy - ly); add(new THREE.CylinderGeometry(0.2, 0.2, hgt, 8), steel, x, -hgt / 2, sd * (Wb / 2 - 0.3)); }
          // stairs at both ends
          for (const sd of [-1, 1]) {
            const ex = sd * half, ly = heightAt(w, o.x + ex * c, o.z - ex * s2), drop = gy - ly;
            if (drop > 1) { const run = drop * 1.6; const st = add(rbox(Math.hypot(run, drop), 0.3, Wb - 0.4, 0.1), steel, ex + sd * run / 2, -drop / 2, 0); st.rotation.z = -sd * Math.atan2(drop, run); }
          }
        }
        return { absY: gy };
      }
      case 'slalom_rot': case 'slalom_blau': {
        const col = type === 'slalom_rot' ? 0xd62020 : 0x1f5fd1;
        add(new THREE.CylinderGeometry(0.03, 0.03, 1.85, 8), mat(col), 0, 0.95, 0, 0, 0, 0.06);
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), dark, 0, 0.06, 0);
        for (const y of [0.6, 1.3]) add(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 8), mat(0xffffff), 0.02, y, 0, 0, 0, 0.06);
        break;
      }
      case 'rs_rot': case 'rs_blau': {
        const col = type === 'rs_rot' ? 0xd62020 : 0x1f5fd1;
        for (const z2 of [-0.4, 0.4]) add(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), mat(col), 0, 0.95, z2);
        add(new THREE.BoxGeometry(0.02, 0.5, 0.75), mat(col), 0, 1.45, 0);
        add(new THREE.BoxGeometry(0.025, 0.12, 0.75), mat(0xffffff), 0, 1.45, 0);
        break;
      }
      case 'abfahrt_tor': {
        for (const z2 of [-4, 4]) {
          for (const dz of [-0.5, 0.5]) add(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), mat(0xd62020), 0, 1.0, z2 + dz);
          add(new THREE.BoxGeometry(0.02, 0.75, 1.0), mat(0xd62020), 0, 1.55, z2);
          add(new THREE.BoxGeometry(0.025, 0.15, 1.0), mat(0xffffff), 0, 1.55, z2);
        }
        break;
      }
      case 'starthaus': {
        add(rbox(3.2, 2.8, 3.2, 0.15), wood, 0, 1.4, 0);
        add(rbox(3.8, 0.3, 3.8, 0.12), mat(0xd62020), 0, 2.95, 0);
        add(rbox(0.08, 1.0, 2.4, 0.04, 1), mat(0x2b3644), 1.62, 1.6, 0);
        add(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).rotateX(Math.PI / 2), mat(0xf2c200), 1.8, 0.55, 0);
        add(rbox(3.6, 0.6, 0.08, 0.04, 1), mat(0x1f5fd1), 0, 2.4, 1.65);
        break;
      }
      case 'ziel': {
        const red = mat(0xd62020);
        for (const z2 of [-6, 6]) add(rbox(1.3, 5.2, 1.3, 0.6, 3), red, 0, 2.6, z2);
        add(rbox(1.3, 1.4, 13.3, 0.6, 3), red, 0, 5.6, 0);
        if (!this.zielTex) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const x2 = cv.getContext('2d'); x2.fillStyle = '#d62020'; x2.fillRect(0, 0, 512, 96); x2.fillStyle = '#fff'; x2.font = 'bold 70px system-ui, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('ZIEL', 256, 52); this.zielTex = new THREE.CanvasTexture(cv); this.zielTex.colorSpace = THREE.SRGBColorSpace; }
        for (const sd of [-1, 1]) { const pl = add(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshLambertMaterial({ map: this.zielTex }), sd * 0.67, 5.6, 0); pl.rotation.y = sd * Math.PI / 2; }
        // timing board and fences
        add(rbox(0.3, 2.2, 3.4, 0.1), dark, -6, 3.0, 9);
        add(new THREE.BoxGeometry(0.32, 0.8, 3.0), mat(0xf2c200, { emissive: 0x332200 }), -6, 3.4, 9);
        for (const z2 of [-6.5, 6.5]) for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(2.2, 1.0, 0.06), mat(k % 2 ? 0x1f5fd1 : 0xffffff), -3 - k * 2.3, 0.5, z2);
        break;
      }
      case 'fels_klein': case 'fels_gross': case 'fels_gruppe': case 'fels_platte': {
        const seed = (o && o.id) || 1;
        const put = (k, s, x, z, ry) => { const m = new THREE.Mesh(rockGeo(k), ROCK_MAT); m.scale.setScalar(s); m.position.set(x, -0.25 * s, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); };
        if (type === 'fels_klein') put(seed % 3, 0.9, 0, 0, seed);
        else if (type === 'fels_gross') put(seed % 3, 3.2, 0, 0, seed);
        else if (type === 'fels_platte') put(3, 2.4, 0, 0, seed);
        else { put(seed % 3, 2.6, 0, 0, seed); put((seed + 1) % 3, 1.5, 3.2, 1.5, seed * 2); put((seed + 2) % 4, 1.1, -2.6, 2.2, seed * 3); put(seed % 3, 0.6, 1.5, -3, seed); put((seed + 1) % 3, 0.45, -1.2, -2.6, seed * 5); }
        break;
      }
      case 'bank':
        add(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood, 0, 0.48, 0); add(new THREE.BoxGeometry(1.8, 0.4, 0.06), wood, 0, 0.8, -0.24);
        for (const x of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.08, 0.48, 0.45), dark, x, 0.24, 0);
        break;
      case 'picknick':
        add(new THREE.BoxGeometry(2, 0.08, 0.9), wood, 0, 0.75, 0);
        for (const sd of [-1, 1]) add(new THREE.BoxGeometry(2, 0.06, 0.3), wood, 0, 0.45, sd * 0.75);
        for (const x of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.08, 0.75, 1.8), woodD, x, 0.37, 0);
        break;
      case 'wegweiser':
        add(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), mat(0x888888), 0, 1.2, 0);
        for (const [y, r] of [[2.2, 0.3], [1.9, -0.6], [1.6, 1.4]]) add(new THREE.BoxGeometry(0.9, 0.22, 0.04), mat(0xf4c400), 0.45 * Math.cos(r), y, -0.45 * Math.sin(r), 0, r, 0);
        break;
      case 'skistaender':
        add(new THREE.BoxGeometry(3, 0.1, 0.1), metal, 0, 0.9, 0);
        for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.1, 1.7, 0.08), mat([0xe74c3c, 0x3498db, 0x111111, 0xf1c40f][k % 4]), -1.25 + k * 0.5, 0.85, 0.1, 0.15);
        for (const x of [-1.4, 1.4]) add(new THREE.BoxGeometry(0.1, 0.9, 0.5), metal, x, 0.45, 0);
        break;
      case 'werbetafel': case 'werbetafel_gross': {
        const big = type === 'werbetafel_gross', ai = o && o.ad !== undefined ? o.ad : ((o && o.id) || 0);
        const W = big ? 12 : 6, H = big ? 6 : 3, y0 = big ? 7 : 1.9, steel = mat(0x5d6368), frame = mat(0x2b2e33);
        if (big) {
          add(new THREE.CylinderGeometry(0.42, 0.55, y0 + 0.4, 14), steel, 0, (y0 + 0.4) / 2, 0);
          add(new THREE.BoxGeometry(1.6, 0.3, 1.6), mat(0x8a8f94), 0, 0.15, 0);
          add(new THREE.BoxGeometry(0.5, 0.5, W * 0.8), steel, 0, y0 + 0.1, 0);
          add(new THREE.BoxGeometry(1.1, 0.06, W), mat(0x6f767c), 0, y0 - 0.1, 0); // Laufsteg
          for (const z2 of [-W / 2, W / 2]) add(new THREE.BoxGeometry(0.04, 0.8, 0.04), steel, 0.5, y0 + 0.3, z2);
          for (let k = 0; k <= 6; k++) add(new THREE.BoxGeometry(0.04, 0.8, 0.04), steel, 0.52, y0 + 0.3, -W / 2 + k * W / 6);
          add(new THREE.BoxGeometry(0.04, 0.04, W), steel, 0.52, y0 + 0.7, 0);
        } else {
          for (const z2 of [-W * 0.34, W * 0.34]) { add(new THREE.BoxGeometry(0.16, y0 + 0.3, 0.16), steel, 0, (y0 + 0.3) / 2, z2); add(new THREE.BoxGeometry(0.5, 0.12, 0.5), mat(0x8a8f94), 0, 0.06, z2); }
          add(new THREE.BoxGeometry(0.08, 0.08, W * 0.7), steel, 0, y0 * 0.5, 0);
        }
        add(new THREE.BoxGeometry(0.22, H + 0.24, W + 0.24), frame, 0, y0 + H / 2, 0);
        for (const sd of [1, -1]) {
          const pl = add(new THREE.PlaneGeometry(W, H), adMat('poster', ai), sd * 0.115, y0 + H / 2, 0, 0, sd * Math.PI / 2);
          pl.castShadow = false;
          // Strahler oben
          for (const z2 of big ? [-W * 0.35, 0, W * 0.35] : [-W * 0.28, W * 0.28]) {
            add(new THREE.BoxGeometry(big ? 1.4 : 0.8, 0.05, 0.05), steel, sd * (big ? 0.7 : 0.4), y0 + H + 0.12, z2);
            add(new THREE.BoxGeometry(0.22, 0.12, 0.34), mat(0x1d1f22), sd * (big ? 1.35 : 0.78), y0 + H + 0.1, z2, 0, 0, sd * 0.5);
            const lens = add(new THREE.BoxGeometry(0.02, 0.09, 0.28), this.lampMat, sd * (big ? 1.3 : 0.73), y0 + H + 0.02, z2, 0, 0, sd * 0.5); lens.castShadow = false;
          }
        }
        break;
      }
      case 'beachflag': {
        const ai = o && o.ad !== undefined ? o.ad : ((o && o.id) || 0);
        const Hf = 3.1, Wf = 0.85, y0 = 0.45;
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(Wf * 0.82, 0); sh.bezierCurveTo(Wf * 1.0, Hf * 0.45, Wf * 1.05, Hf * 0.8, Wf * 0.55, Hf * 0.98); sh.quadraticCurveTo(Wf * 0.2, Hf * 1.03, 0, Hf); sh.lineTo(0, 0);
        const fg = new THREE.ShapeGeometry(sh, 16); const uv = fg.attributes.uv, pp = fg.attributes.position;
        for (let k = 0; k < pp.count; k++) uv.setXY(k, pp.getX(k) / Wf, pp.getY(k) / Hf);
        fg.translate(0.03, y0, 0).rotateY(Math.PI / 2);
        const fl = add(fg, adMat('flag', ai), 0, 0, 0); fl.castShadow = true;
        add(new THREE.CylinderGeometry(0.018, 0.022, Hf + y0 + 0.05, 6), mat(0x9aa0a6), 0, (Hf + y0) / 2, 0);
        add(new THREE.CylinderGeometry(0.01, 0.01, Wf * 0.6, 4), mat(0x9aa0a6), 0, y0 + Hf * 0.98, -Wf * 0.3, Math.PI / 2, 0, 0);
        for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.9, 0.04, 0.06), dark, 0, 0.03, 0, 0, k * Math.PI / 4, 0);
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), dark, 0, 0.1, 0);
        break;
      }
      case 'aufsteller': {
        const ai = o && o.ad !== undefined ? o.ad : ((o && o.id) || 0);
        const Wa = 0.68, Ha = 1.05, ang = 0.2;
        for (const sd of [1, -1]) {
          const pv = new THREE.Group(); pv.position.set(0, Ha + 0.05, 0); pv.rotation.z = sd * ang; g.add(pv);
          const fr = new THREE.Mesh(new THREE.BoxGeometry(0.03, Ha + 0.06, Wa + 0.06), mat(0x2b2e33)); fr.position.set(sd * 0.02, -Ha / 2, 0); fr.castShadow = true; pv.add(fr);
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(Wa, Ha), adMat('portrait', ai)); pl.rotation.y = sd * Math.PI / 2; pl.position.set(sd * 0.04, -Ha / 2, 0); pv.add(pl);
        }
        break;
      }
      case 'werbeturm': {
        const ai = o && o.ad !== undefined ? o.ad : ((o && o.id) || 0);
        const Wt = 1.2, Ht = 3.6;
        add(new THREE.BoxGeometry(Wt + 0.1, 0.25, Wt + 0.1), mat(0x3a3d40), 0, 0.12, 0);
        add(new THREE.BoxGeometry(Wt, Ht, Wt), mat(0x2b2e33), 0, 0.25 + Ht / 2, 0);
        add(new THREE.BoxGeometry(Wt + 0.12, 0.18, Wt + 0.12), mat(0x3a3d40), 0, 0.25 + Ht + 0.09, 0);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2, pl = add(new THREE.PlaneGeometry(Wt - 0.1, Ht - 0.2), adMat('flag', ai + k), Math.cos(a) * (Wt / 2 + 0.005), 0.25 + Ht / 2, -Math.sin(a) * (Wt / 2 + 0.005), 0, a + Math.PI / 2, 0);
          pl.castShadow = false;
        }
        break;
      }
      case 'werbebogen': {
        const ai = o && o.ad !== undefined ? o.ad : ((o && o.id) || 0);
        const R = 5.2, col = new THREE.Color(adBrandColor(ai)).getHex();
        const arch = add(new THREE.TorusGeometry(R, 0.62, 12, 32, Math.PI), mat(col), 0, 0.2, 0, 0, Math.PI / 2, 0);
        arch.receiveShadow = true;
        for (const z2 of [-R, R]) add(new THREE.CylinderGeometry(0.8, 0.85, 0.5, 14), mat(col), 0, 0.25, z2);
        for (const sd of [1, -1]) { const pl = add(new THREE.PlaneGeometry(5, 1.2), bannerMat(ai), sd * 0.065, R - 1.5, 0, 0, sd * Math.PI / 2); pl.castShadow = false; }
        add(new THREE.BoxGeometry(0.12, 1.3, 5.1), dark, 0, R - 1.5, 0);
        for (const z2 of [-2.2, 2.2]) add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4), dark, 0, R - 0.45, z2);
        break;
      }
      case 'fahne':
        add(new THREE.CylinderGeometry(0.06, 0.08, 8, 8), mat(0xdddddd), 0, 4, 0);
        add(new THREE.BoxGeometry(1.6, 1.6, 0.04), mat(0xd52b1e), 0.85, 7.1, 0);
        add(new THREE.BoxGeometry(1.0, 0.3, 0.05), mat(0xffffff), 0.85, 7.1, 0);
        add(new THREE.BoxGeometry(0.3, 1.0, 0.05), mat(0xffffff), 0.85, 7.1, 0);
        break;
    }
    return null;
  }

  addLightPool(o) {
    const w = this.world;
    const big = o.type === 'flutlicht';
    const R = big ? 42 : 12, n = big ? 14 : 6, fwd = big ? 22 : 0;
    const cx = o.x + Math.cos(o.yaw) * fwd, cz = o.z - Math.sin(o.yaw) * fwd;
    const geo = new THREE.PlaneGeometry(R * 2, R * 2, n, n).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = cx + p.getX(i), z = cz + p.getZ(i); p.setY(i, heightAt(w, x, z) + 0.5); p.setX(i, x); p.setZ(i, z); }
    geo.computeBoundingSphere();
    const LM = this.lightMats(o.lc);
    const pool = new THREE.Mesh(geo, LM.pool);
    pool.visible = this.night;
    pool.renderOrder = 2;
    const sp = new THREE.Sprite(LM.sprite); sp.scale.set(big ? 9 : 3, big ? 9 : 3, 1); sp.visible = this.night;
    sp.position.set(o.x + Math.cos(o.yaw) * (big ? 0.9 : 0), heightAt(w, o.x, o.z) + (big ? 15.2 : 4.65), o.z - Math.sin(o.yaw) * (big ? 0.9 : 0));
    o.pool = pool; o.sprite = sp;
    this.group.add(pool, sp);
  }

  buildLine(o) {
    const w = this.world, g = new THREE.Group();
    const { a, b } = o;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const NETS = { netz: [0xff6a00, 2.4, 0x777777], anetz: [0xd8161b, 4.0, 0xc4141a], anetz_blau: [0x1f55d8, 4.0, 0x1a49b8], bnetz: [0xe0262b, 2.2, 0xc4141a], werbenetz: [0xe0262b, 2.2, 0xc4141a], polsternetz: [0xe0262b, 2.4, 0xc4141a], netz_blau: [0x1f5fd1, 2.4, 0x777777], netz_gruen: [0x2f8a3c, 2.4, 0x5a5f55], netz_gelb: [0xf2c200, 2.4, 0x777777], netz_schwarz: [0x202326, 2.6, 0x3a3d40], windnetz: [0x2c5a35, 5.0, 0x6b7075], holznetz: [0xff6a00, 2.0, 0x7a5232], pfeilnetz: [0xf26a1b, 0.9, 0x8a8f94] };
    const net = NETS[o.type];
    const step = o.type === 'mauer' ? 1.5 : o.type === 'anetz' || o.type === 'anetz_blau' ? 6 : o.type === 'windnetz' ? 5 : o.type === 'werbebande' ? 2.5 : o.type === 'pfeilnetz' ? 2.5 : o.type === 'fahnenseil' ? 3.5 : net ? 4 : o.type === 'mobilzaun' ? 3.5 : o.type === 'schneezaun' ? 2.5 : 3;
    const n = Math.max(1, Math.ceil(L / step));
    const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; pts.push({ x, z, y: heightAt(w, x, z) }); }
    const parts = new Map();
    const push = (m, geo, mtx, uvS = null) => { const gg = geo.index ? geo.toNonIndexed() : geo.clone(); if (gg.attributes.uv && !uvS) gg.deleteAttribute('uv'); else if (uvS) { const uv = gg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uvS[0] < 0 ? 1 - uv.getX(k) : uv.getX(k) * uvS[0], uv.getY(k) * uvS[1]); } gg.applyMatrix4(mtx); if (!parts.has(m)) parts.set(m, []); parts.get(m).push(gg); };
    const plane = new THREE.PlaneGeometry(1, 1);
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    const M = (x, y, z, sx, sy, sz, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    const cfg = net ? { post: net[1] + 0.4, postM: mat(net[2]), postW: o.type === 'anetz' || o.type === 'anetz_blau' ? 0.09 : o.type === 'pfeilnetz' ? 0.035 : o.type === 'holznetz' ? 0.08 : o.type === 'windnetz' ? 0.1 : 0.06 } : { schneezaun: { post: 1.4, postM: mat(0x6e4b2c), postW: 0.07 }, mobilzaun: { post: 0, postM: null, postW: 0 }, werbebande: { post: 1.1, postM: mat(0x9aa0a6), postW: 0.04 } }[o.type] || { netz: { post: 2.8, postM: mat(0x777777), postW: 0.1 }, zaun: { post: 1.25, postM: mat(WOOD_D), postW: 0.14 }, seil: { post: 1.2, postM: mat(0xff7a00), postW: 0.06 }, fahnenseil: { post: 1.15, postM: null, postW: 0.05 }, mauer: null }[o.type];
    for (let i = 0; i <= n; i++) {
      const p = pts[i];
      if (o.type === 'fahnenseil') { for (let k = 0; k < 5; k++) push(mat(k % 2 ? 0x1a1a1a : 0xf5c400), cyl, M(p.x, p.y - 0.3 + k * 0.29 + 0.145, p.z, 0.1, 0.29, 0.1)); push(mat(0x1a1a1a), new THREE.ConeGeometry(0.05, 0.08, 6), M(p.x, p.y + 1.19, p.z, 1, 1, 1)); }
      if (o.type === 'mobilzaun') { push(mat(0x3a3d40), box, M(p.x, p.y + 0.08, p.z, 0.7, 0.16, 0.25)); if (i === n) break; }
      else if ((o.type === 'anetz' || o.type === 'anetz_blau') && cfg) { push(cfg.postM, cyl, M(p.x, p.y + cfg.post / 2 - 0.3, p.z, 0.2, cfg.post + 0.3, 0.2)); push(mat(0x222222), box, M(p.x, p.y + cfg.post - 0.15, p.z, 0.08, 0.3, 0.5)); }
      else if (cfg && cfg.postM) push(cfg.postM, cyl, M(p.x, p.y + cfg.post / 2 - 0.3, p.z, cfg.postW * 2, cfg.post + 0.3, cfg.postW * 2));
      if (i === n) break;
      const q = pts[i + 1];
      const seg = Math.hypot(q.x - p.x, q.z - p.z), dy = q.y - p.y;
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, my = (p.y + q.y) / 2;
      const tilt = Math.atan2(dy, seg), len = Math.hypot(seg, dy);
      if (net) {
        const nh = net[1], y0 = 0.15;
        push(netMat(net[0]), plane, M(mx, my + y0 + nh / 2, mz, len, nh, 1, tilt), [len / 0.22, nh / 0.22]);
        for (const yy of [y0 + nh, y0 + 0.02]) push(mat(0x202020), box, M(mx, my + yy, mz, len, 0.03, 0.03, tilt));
        if (o.type === 'anetz' || o.type === 'anetz_blau') push(netMat(net[0]), plane, M(mx, my + y0 + nh * 0.45, mz, len, nh * 0.9, 1, tilt), [len / 0.5, nh / 0.5]); // second layer, like real A-nets
        // padded crash net: red-white foam pads along the bottom
        if (o.type === 'polsternetz') for (let k = 0; k < Math.max(1, Math.round(len / 1.2)); k++) { const f = (k + 0.5) / Math.max(1, Math.round(len / 1.2)) - 0.5; push(mat(k % 2 ? 0xffffff : 0xd8161b), box, M(mx + Math.cos(yaw) * f * seg, my + f * dy + 0.55, mz - Math.sin(yaw) * f * seg, len / Math.max(1, Math.round(len / 1.2)) - 0.04, 0.9, 0.3, tilt)); }
        if (o.type === 'pfeilnetz') push(netMat(net[0]), plane, M(mx, my + y0 + nh / 2, mz, len, nh, 1, tilt), [len / 0.1, nh / 0.1]); // dense mesh, reads almost solid orange
        if (o.type === 'pfeilnetz') for (const sd of [-1, 1]) push(arrowMat(), plane, M(mx + Math.sin(yaw) * 0.02 * sd, my + y0 + nh / 2, mz + Math.cos(yaw) * 0.02 * sd, len, nh * 0.9, 1, tilt), [Math.max(1, Math.round(len / 0.85)), 1]);
        if (o.type === 'werbenetz' && len > 1.5) {
          const bi = Math.abs(Math.round(mx * 7 + mz * 13)) % AD_SLOTS;
          push(bannerMat(bi), plane, M(mx - Math.sin(yaw) * 0.03, my + y0 + 0.75, mz - Math.cos(yaw) * 0.03, len * 0.94, 0.85, 1, tilt), [-1, 1]);
          push(bannerMat(bi), plane, M(mx + Math.sin(yaw) * 0.03, my + y0 + 0.75, mz + Math.cos(yaw) * 0.03, len * 0.94, 0.85, 1, tilt), [1, 1]);
        }
      } else if (o.type === 'schneezaun') {
        for (let k = 0; k < Math.floor(len / 0.18); k++) { const f = (k + 0.5) / Math.floor(len / 0.18) - 0.5; push(mat(0x8a6238), box, M(mx + Math.cos(yaw) * f * seg, my + f * dy + 0.65, mz - Math.sin(yaw) * f * seg, 0.08, 1.25, 0.025)); }
        for (const yy of [0.3, 1.05]) push(mat(0x5a5a5a), box, M(mx, my + yy, mz, len, 0.02, 0.04, tilt));
      } else if (o.type === 'mobilzaun') {
        push(netMat(0xb8bcc0), plane, M(mx, my + 1.1, mz, len - 0.1, 1.8, 1, tilt), [len / 0.25, 1.8 / 0.25]);
        for (const e of [-0.5, 0.5]) push(mat(0xa9adb2), box, M(mx + Math.cos(yaw) * e * (seg - 0.1), my + 1.1 + e * dy, mz - Math.sin(yaw) * e * (seg - 0.1), 0.05, 1.95, 0.05));
        for (const yy of [0.2, 2.0]) push(mat(0xa9adb2), box, M(mx, my + yy, mz, len - 0.1, 0.05, 0.05, tilt));
      }
      else if (o.type === 'werbebande') {
        // low advertising boards on posts, like along a race finish
        const bi = Math.abs(Math.round(mx * 7 + mz * 13)) % AD_SLOTS;
        push(bannerMat(bi), plane, M(mx - Math.sin(yaw) * 0.04, my + 0.6, mz - Math.cos(yaw) * 0.04, len - 0.1, 0.8, 1, tilt), [-1, 1]);
        push(bannerMat(bi + 5), plane, M(mx + Math.sin(yaw) * 0.04, my + 0.6, mz + Math.cos(yaw) * 0.04, len - 0.1, 0.8, 1, tilt), [1, 1]);
        push(mat(0xd9dcdf), box, M(mx, my + 0.6, mz, len - 0.1, 0.84, 0.03, tilt));
      }
      else if (o.type === 'zaun') { push(mat(0x7a5233), box, M(mx, my + 0.55, mz, len, 0.12, 0.06, tilt)); push(mat(0x7a5233), box, M(mx, my + 1.05, mz, len, 0.12, 0.06, tilt)); }
      else if (o.type === 'seil') { push(mat(0xffd000), box, M(mx, my + 0.95, mz, len, 0.04, 0.04, tilt)); push(mat(0xffd000), box, M(mx, my + 0.6, mz, len, 0.04, 0.04, tilt)); }
      else if (o.type === 'fahnenseil') {
        // one yellow rope sagging between the posts, small pennants hanging from it
        const yT = 1.05, sag = Math.min(0.18, len * 0.03), N = 6, cx = Math.cos(yaw), cz = -Math.sin(yaw);
        const at = (f) => ({ x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, y: p.y + dy * f + yT - sag * 4 * f * (1 - f) });
        for (let k = 0; k < N; k++) { const A = at(k / N), B = at((k + 1) / N), sl = Math.hypot(B.x - A.x, B.z - A.z); push(mat(0xf5c400), box, M((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, Math.hypot(sl, B.y - A.y) + 0.01, 0.022, 0.022, Math.atan2(B.y - A.y, sl))); }
        const nf = Math.max(1, Math.floor(len / 0.4));
        for (let k = 0; k < nf; k++) {
          const f = (k + 0.5) / nf, P = at(f), wv = 0.17, hv = 0.22;
          const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-wv / 2, 0, 0, wv / 2, 0, 0, 0, -hv, 0], 3)); tri.computeVertexNormals();
          push(flagMat(k % 2 ? 0xff7a00 : 0xf5c400), tri, M(P.x, P.y, P.z, 1, 1, 1));
        }
      }
      else if (o.type === 'mauer') { push(mat(0x8f8a82), box, M(mx, my + 0.45, mz, len + 0.1, 1.9, 0.7, tilt)); o.capMat = mat(0xf2f5f8); push(o.capMat, box, M(mx, my + 1.45, mz, len + 0.1, 0.12, 0.75, tilt)); }
    }
    for (const [m, list] of parts) { const me = new THREE.Mesh(mergeGeometries(list), m); me.castShadow = true; g.add(me); }
    return g;
  }

  remove(o) {
    if (o.padMesh) { this.group.remove(o.padMesh); o.padMesh = null; }
    if (o.cannon) this.cannons.removeCannon(o.cannon);
    else {
      this.group.remove(o.group);
      o.group.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      if (o.pool) { this.group.remove(o.pool, o.sprite); o.pool.geometry.dispose(); }
    }
    this.list = this.list.filter((x) => x !== o);
  }

  resize(o, size) {
    if (!Objects.sizable(o)) return;
    o.size = size;
    if (o.cannon) { this.cannons.removeCannon(o.cannon); o.cannon = null; this.build(o); this.applySeason(o); return; }
    this.rotate(o, o.yaw);
  }

  setAd(o, i) { o.ad = ((i % AD_SLOTS) + AD_SLOTS) % AD_SLOTS; this.rotate(o, o.yaw); }

  rotate(o, yaw) {
    if (o.line) return;
    o.yaw = yaw;
    if (o.cannon) { this.cannons.setYaw(o.cannon, yaw); return; }
    this.group.remove(o.group);
    o.group.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
    if (o.pool) { this.group.remove(o.pool, o.sprite); o.pool.geometry.dispose(); o.pool = o.sprite = null; }
    this.build(o);
    this.applySeason(o);
  }

  move(o, x, z) {
    if (o.line) return;
    o.x = x; o.z = z;
    if (o.cannon) { this.cannons.removeCannon(o.cannon); o.cannon = null; this.build(o); return; }
    this.rotate(o, o.yaw);
  }

  byId(id) { return this.list.find((o) => o.id === id); }

  pick(raycaster) {
    const groups = this.list.map((o) => o.group).filter((g) => g && g.visible);
    const hits = raycaster.intersectObjects(groups, true);
    for (const h of hits) { let ob = h.object; while (ob && ob.userData.objId == null) ob = ob.parent; if (ob) return { obj: this.byId(ob.userData.objId), dist: h.distance }; }
    return null;
  }

  nearest(x, z, maxD = 6) {
    let best = null, bd = maxD;
    for (const o of this.list) {
      if (o.group && !o.group.visible) continue;
      let d;
      if (o.line) {
        const dx = o.b.x - o.a.x, dz = o.b.z - o.a.z, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - o.a.x) * dx + (z - o.a.z) * dz) / L2));
        d = Math.hypot(x - (o.a.x + dx * t), z - (o.a.z + dz * t));
      } else d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // highest ride-able surface of objects at x,z (world), or -Infinity
  surfaceAt(x, z, ground) {
    let best = this.world.fixedSurface ? this.world.fixedSurface(x, z) : -Infinity;
    const v = new THREE.Vector3();
    for (const o of this.list) {
      if (o.line || o.cannon || !o.group || !o.group.visible) continue;
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz > 2500) continue;
      if (BRIDGE[o.type]) {
        const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const [hl, hw] = BRIDGE[o.type];
        if (Math.abs(lx) <= hl && Math.abs(lz) <= hw) best = Math.max(best, o.deckY + (o.type === 'steinbruecke' ? 0.2 : 0.18));
        continue;
      }
      if (!OBJ_TYPES[o.type].tilt) continue;
      v.set(dx, ground - o.group.position.y, dz).applyQuaternion(o.invQ);
      const sc = o.size || 1; if (sc !== 1) { v.x /= sc; v.z /= sc; }
      const h = profile(o.type, v.x, v.z) * (o.size || 1);
      if (h >= 0) best = Math.max(best, ground + h - 0.05);
    }
    return best;
  }

  applySeason(o) {
    const t = OBJ_TYPES[o.type];
    if (!o.group) return;
    const vis = !t.season || (t.season === 'winter') === (this.season === 0);
    o.group.visible = vis;
    if (o.pool) { o.pool.visible = vis && this.night; o.sprite.visible = vis && this.night; }
    if (o.padMesh) o.padMesh.visible = vis && this.season === 0;
    if (o.seasonGeo) applySeasonColors(o.seasonGeo, this.season);
    if (o.capMat) o.capMat.color.setHex(this.season === 0 ? 0xf2f5f8 : 0x8f8a82);
  }

  setSeason(s) { this.season = s; for (const g of ROCK_GEOS) if (g) applySeasonColors(g, s); for (const o of this.list) this.applySeason(o); }

  setNight(on) {
    this.night = on;
    setAdNight(on);
    this.lampMat.emissive.setHex(on ? 0xfff2cc : 0x000000);
    this.lightMatsCache.forEach((m) => { if (m) m.lamp.emissive.setHex(on ? m.col : 0x000000); });
    for (const o of this.list) {
      if (o.pool) { const vis = o.group.visible && on; o.pool.visible = vis; o.sprite.visible = vis; }
      if (o.glassMat) o.glassMat.emissive.setHex(on ? 0xffb347 : 0x000000);
    }
  }

  beds() { return this.list.reduce((s, o) => s + (OBJ_TYPES[o.type].beds || 0), 0); }

  serialize() { return this.list.map((o) => o.line ? { t: o.type, a: o.a, b: o.b, id: o.id } : { t: o.type, x: +o.x.toFixed(2), z: +o.z.toFixed(2), y: +o.yaw.toFixed(3), id: o.id, ...(o.pad ? { p: o.pad } : {}), ...(o.lc ? { c: o.lc } : {}), ...(o.ad !== undefined ? { w: o.ad } : {}), ...((o.size || 1) !== 1 ? { s: +o.size.toFixed(2) } : {}) }); }
  load(arr) {
    for (const d of arr || []) {
      if (!OBJ_TYPES[d.t]) continue;
      if (d.a) this.addLine(d.t, d.a, d.b, d.id); else { const o = this.add(d.t, d.x, d.z, d.y, d.id, d.s || 1); if (o && d.p) { o.pad = d.p; this.updatePad(o); } if (o && d.c) this.setLightColor(o, d.c); if (o && d.w !== undefined) this.setAd(o, d.w); }
    }
  }

  dispose() { this.scene.remove(this.group); }
}
