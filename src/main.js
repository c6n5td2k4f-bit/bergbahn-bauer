import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { DEFAULTS, newSeed, randomSettings, generateWorld, heightAt, normalAt, drawPreview, nearestOnLine, distToLine } from './terrain.js';
import { Sound } from './audio.js';
import { Rocks, rockGeometry } from './rocks.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TerrainView, PISTE_COLORS, TRAIL_TYPES } from './terrainMesh.js';
import { Trees, Village, Traffic, Pedestrians, SnowCannons, CANNON_TYPES, LocalPlough } from './props.js';
import { Objects, OBJ_CATS, OBJ_TYPES, PAD_TYPES, LIGHT_COLORS, AD_TYPES, BUILDING_TYPES } from './objects.js';
import { BRANDS as AD_BRANDS, AD_SLOTS, adEntry, adsState, loadAds, addAdFiles, removeAdImage, setAdMode, adImages, MAX_AD_IMGS, onAdsChange } from './ads.js';
import { BusLines } from './buslines.js';
import { RoadRoutes } from './roads.js';
import { Lift, LIFT_TYPES, LIFT_GROUPS, BRANDS, kinkMax, kinkMaxBig, MID_ANGLE_MAX, bendAngle, STATION_STYLES, TOWER_STYLES, TRAM_TOWER_STYLES, TRAM_STATION_STYLES } from './lifts.js';
import { PisteMarkers, Guests } from './guests.js';
import { Water } from './water.js';
import { Ponds } from './ponds.js';
import { Sky } from './sky.js';
import { Player, PLAY_MODES, BULLY_MODELS, BULLY_COLORS } from './player.js';
import { Groomers } from './groomers.js';
import { Railway } from './rail.js';
import { Rescue } from './rescue.js';
import { Tracks } from './tracks.js';
import { Marks, MARK_COLORS } from './marks.js';
import { FixedBridges } from './bridges.js';
import { GFX } from './gfx.js';
import { newSlotId, putSlot, putMeta, listSlots, getSlot, deleteSlot } from './slots.js';
import { REAL_RESORTS, resortById, loadPreset, ensureSource, parseCoords, tilesFor, tileUrl, decodeTile, buildCustom, encodeGrid, putCustom, GN as RGN, SPAN as RSPAN } from './real.js';
import { clamp, lerp } from './noise.js';
import { placeTZ, liveHour, weatherUrl, parseWeather, wxIndex, wxToGame, WX_TEXT } from './livewx.js';

const $ = (id) => document.getElementById(id);
const fmtMoney = (v) => v === Infinity ? '∞' : (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2).replace('.', ',') + ' Mio.' : Math.round(v).toLocaleString('de-CH')) + ' CHF';
const fmtM = (v) => Math.round(v).toLocaleString('de-CH') + ' m';
const SAVE_KEY = 'bergbahn-bauer-save-v2';
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });

// ---------------- renderer / scene ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let quality = 'auto', autoLevel = 'mid';
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const q = quality === 'auto' ? autoLevel : quality;
  renderer.setPixelRatio(GFX.potato ? Math.min(dpr, 0.7) : GFX.hyper && q !== 'low' ? Math.min(dpr, q === 'mid' ? 1.25 : 1.5) : q === 'low' ? Math.min(dpr, 1) : q === 'mid' ? Math.min(dpr, 1.5) : Math.min(dpr, 2.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
applyQuality();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1.5, 60000);
const sky = new Sky(scene);
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = 1.48;
controls.minDistance = 8;
controls.zoomSpeed = 1.2;
controls.screenSpacePanning = false;

// ---------------- game state ----------------
const G = {
  world: null, lifts: [], preview: null, mode: 'sandbox', money: Infinity, tool: 'view',
  liftType: 'sessel4h', brand: 'dreifachmayr', liftA: null,
  selected: null, selTower: -1, selObj: null, pending: null,
  pisteMode: 'auto', pisteSize: 25, pisteSmooth: (() => { try { return localStorage.getItem('bb-psmooth') === '1'; } catch (e) { return false; } })(), trailMode: 3, trailSize: 4, treeMode: 'add', treeSize: 30, natMode: 'trees', terraMode: 'raise', terraSize: 120, terraStr: 50,
  buildCat: 'schnee', buildType: 'propeller', buildYaw: 0, buildRemove: false, lineStart: null,
  playMode: 'ski', playing: false,
  season: 0, seasonMode: 'manual', seasonLen: 30, seasonElapsed: 0,
  time: 10, timeAuto: true, dayMin: 14, weather: 'sonne', weatherAuto: true,
  guestTarget: 150, ticket: 72, staff: 2, day: 1, report: null, guestSum: 0, guestN: 0,
  nightOn: false, settings: null,
};
// sound: starts with the first tap / click (browsers only allow audio after a user gesture)
G.sound = new Sound();
const sndRight = new THREE.Vector3();
let sndLast = performance.now();
const sndDt = () => { const n = performance.now(), d = (n - sndLast) / 1000; sndLast = n; return d; };
const unlockSound = () => G.sound.unlock();
document.addEventListener('pointerdown', unlockSound, true);
document.addEventListener('keydown', unlockSound, true);
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && b.closest('#start, .modal, #toolpanel, #sidepanel, #toolbar, #hud, #camBtns')) G.sound.click(); }, true);
let settings = { ...DEFAULTS, seed: newSeed() };
let startMode = 'sandbox', startSeason = 0;

// ---------------- start screen ----------------
function segInit(id, onChange) {
  const el = $(id);
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    onChange(b.dataset.v);
  }));
}
function segSet(id, v) { $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === String(v))); }

segInit('modeSeg', (v) => { startMode = v; });
segInit('seasonSeg', (v) => { startSeason = +v; });
segInit('formSeg', (v) => { settings.form = v; refreshPreview(); });
segInit('sizeSeg', (v) => { settings.size = +v; refreshPreview(); });
segInit('vilSeg', (v) => { settings.villages = +v; refreshPreview(); });
segInit('vsizeSeg', (v) => { settings.villageSize = v; refreshPreview(); });
segInit('riverSeg', (v) => { settings.river = v === '1'; refreshPreview(); });
segInit('lakeSeg', (v) => { settings.lake = v === '1'; });
segInit('railSeg', (v) => { settings.rail = v === '1'; refreshPreview(); });

const sliders = {
  height: { f: (v) => v, t: (v) => v + ' m · Gipfel ≈ ' + (+v + (settings.alt == null ? 1000 : settings.alt)) + ' m' }, alt: { f: (v) => v, t: (v) => v + ' m ü. M.' }, steep: { f: (v) => v / 100, t: (v) => v + ' %' }, variety: { f: (v) => v / 100, t: (v) => v + ' %' },
  peaks: { f: (v) => +v, t: (v) => v }, valley: { f: (v) => v / 100, t: (v) => v + ' %' }, forest: { f: (v) => v / 100, t: (v) => v + ' %' },
};
function syncSliders() {
  for (const k in sliders) { const s = $('s_' + k); s.value = k === 'height' || k === 'peaks' || k === 'alt' ? (settings[k] == null ? 1000 : settings[k]) : Math.round(settings[k] * 100); $('v_' + k).textContent = sliders[k].t(s.value); }
  $('seed').value = settings.seed;
  segSet('sizeSeg', settings.size); segSet('vilSeg', settings.villages); segSet('vsizeSeg', settings.villageSize); segSet('riverSeg', settings.river ? 1 : 0); segSet('lakeSeg', settings.lake ? 1 : 0); segSet('railSeg', settings.rail === false ? 0 : 1); segSet('formSeg', settings.form || 'zufall');
}
for (const k in sliders) $('s_' + k).addEventListener('input', (e) => { settings[k] = sliders[k].f(+e.target.value); $('v_' + k).textContent = sliders[k].t(e.target.value); if (k === 'alt') $('v_height').textContent = sliders.height.t(settings.height); refreshPreview(); });
$('seed').addEventListener('change', (e) => { settings.seed = Math.abs(parseInt(e.target.value) || 1); refreshPreview(); });
$('dice').addEventListener('click', () => { settings.seed = newSeed(); $('seed').value = settings.seed; refreshPreview(); });
let prevTimer = 0;
function refreshPreview() { clearTimeout(prevTimer); prevTimer = setTimeout(() => drawPreview($('preview'), settings), 40); }
$('btnCustom').addEventListener('click', () => { settings.seed = newSeed(); $('startChoice').classList.add('hidden'); $('custom').classList.remove('hidden'); syncSliders(); refreshPreview(); });
$('btnBack').addEventListener('click', () => { $('custom').classList.add('hidden'); $('startChoice').classList.remove('hidden'); });
$('btnRandom').addEventListener('click', () => startGame(randomSettings(newSeed())));
$('btnGo').addEventListener('click', () => startGame({ ...settings }));
$('btnContinue').addEventListener('click', () => { const s = readSave(); if (s) startGame(s.settings, s); });
// ---------------- my maps (save slots) ----------------
const slotLabel = (p) => (p.real ? (p.name || 'Echter Ort') : 'Berg ' + p.seed);
const fmtDate = (t) => { try { return new Date(t).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const escH = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function refreshSlotsInfo() { try { const l = await listSlots(); $('slotsInfo').textContent = l.length ? `${l.length} gespeicherte Karte${l.length > 1 ? 'n' : ''}` : 'Noch keine gespeicherten Karten'; } catch (e) { $('slotsInfo').textContent = 'In diesem Browser nicht verfügbar'; } }
let slotDel = null;
async function renderSlots() {
  let list = [];
  try { list = await listSlots(); } catch (e) { $('slotList').innerHTML = '<div class="small">Speichern von mehreren Karten geht in diesem Browser leider nicht.</div>'; return; }
  if (!list.length) { $('slotList').innerHTML = '<div class="small">Noch keine Karten. Starte einen Berg, er wird automatisch hier gespeichert.</div>'; return; }
  $('slotList').innerHTML = list.map((m) => `<div class="slot"><div class="si"><div class="sn">${escH(m.name)}</div><div class="sd">${escH(m.info || '')} · ${fmtDate(m.date)}</div></div>
    <button class="go" data-load="${m.id}">▶</button><button data-ren="${m.id}">✏️</button><button class="${slotDel === m.id ? 'warn' : ''}" data-del="${m.id}">${slotDel === m.id ? 'Sicher?' : '🗑️'}</button></div>
    <div class="row seedrow hidden" id="ren_${m.id}"><input class="txt" maxlength="40" value="${escH(m.name)}"><button data-rok="${m.id}">✓</button></div>`).join('');
  const L = $('slotList');
  L.querySelectorAll('[data-load]').forEach((b) => b.onclick = async () => { const s = await getSlot(b.dataset.load).catch(() => null); if (!s) { toast('Karte konnte nicht geladen werden'); return; } s.slotId = b.dataset.load; startGame(s.settings, s); });
  L.querySelectorAll('[data-ren]').forEach((b) => b.onclick = () => $('ren_' + b.dataset.ren).classList.toggle('hidden'));
  L.querySelectorAll('[data-rok]').forEach((b) => b.onclick = async () => { const m = list.find((q) => q.id === b.dataset.rok), v = b.previousElementSibling.value.trim(); if (m && v) { m.name = v; await putMeta(m).catch(() => {}); } renderSlots(); });
  L.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { const id = b.dataset.del; if (slotDel !== id) { slotDel = id; renderSlots(); return; } slotDel = null; await deleteSlot(id).catch(() => {}); if (G.slotId === id) G.slotId = null; renderSlots(); refreshSlotsInfo(); });
}
$('btnSlots').addEventListener('click', () => { $('startChoice').classList.add('hidden'); $('slotsPanel').classList.remove('hidden'); slotDel = null; renderSlots(); });
$('slotsBack').addEventListener('click', () => { $('slotsPanel').classList.add('hidden'); $('startChoice').classList.remove('hidden'); refreshSlotsInfo(); });
refreshSlotsInfo();
function showContinue() {
  const s = readSave();
  $('btnContinue').classList.toggle('hidden', !s);
  if (s) $('continueInfo').textContent = `${s.settings.real ? '🌍 ' + (s.settings.name || 'Echter Ort') : 'Seed ' + s.settings.seed} · ${s.lifts.length} Lifte · Tag ${s.day || 1} · ${s.mode === 'normal' ? 'Normal' : 'Sandbox'}`;
}
showContinue();

// ---------------- real ski areas ----------------
const REAL_GROUPS = [['🇨🇭 Schweiz', ['🇨🇭']], ['🇦🇹 Österreich', ['🇦🇹']], ['🇩🇪 Deutschland', ['🇩🇪']], ['🇫🇷 Frankreich', ['🇫🇷']], ['🇮🇹 Italien', ['🇮🇹']], ['🌎 Nordamerika', ['🇨🇦', '🇺🇸']], ['🌎 Südamerika', ['🇨🇱', '🇦🇷']], ['🌏 Asien', ['🇯🇵']], ['🇸🇪 Skandinavien', ['🇸🇪']]];
let realSettings = null, realPick = null;
function renderRealList() {
  $('realList').innerHTML = REAL_GROUPS.map(([g, flags]) => `<div class="rgrp">${g}</div><div class="rbtns">${REAL_RESORTS.filter((r) => flags.includes(r.flag)).map((r) => `<button data-rid="${r.id}" class="${realPick === r.id ? 'on' : ''}">${r.flag} ${r.name}</button>`).join('')}</div>`).join('');
  $('realList').querySelectorAll('[data-rid]').forEach((b) => b.onclick = () => pickReal(b.dataset.rid));
}
function drawRealPreview(src) {
  const c = $('realPrev'), W = c.width, ctx = c.getContext('2d'), img = ctx.createImageData(W, W);
  let mn = Infinity, mx = -Infinity; for (const v of src) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const at = (x, y) => src[Math.min(RGN - 1, Math.round(y * (RGN - 1) / (W - 1))) * RGN + Math.min(RGN - 1, Math.round(x * (RGN - 1) / (W - 1)))];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const h = at(x, y), dx = at(Math.min(W - 1, x + 1), y) - at(Math.max(0, x - 1), y), dy = at(x, Math.min(W - 1, y + 1)) - at(x, Math.max(0, y - 1));
    const sh = clamp(0.62 + (-dx + dy) * 0.006, 0.15, 1.15), t = (h - mn) / Math.max(1, mx - mn);
    const snow = h > 2300 ? 1 : h > 1900 ? (h - 1900) / 400 : 0;
    const base = [lerp(70, 150, t), lerp(110, 140, t), lerp(70, 120, t)];
    const k = (y * W + x) * 4;
    for (let q = 0; q < 3; q++) img.data[k + q] = clamp(lerp(base[q], 245, snow) * sh, 0, 255);
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { mn, mx };
}
function showRealSel(src, info) {
  const r = drawRealPreview(src);
  $('realInfo').textContent = `${info} · Tal ${Math.round(r.mn)} m, Gipfel ${Math.round(r.mx)} m ü. M. · 9 × 9 km · Norden oben`;
  segSet('rVilSeg', realSettings.villages); segSet('rVsizeSeg', realSettings.villageSize); segSet('rRailSeg', realSettings.rail ? 1 : 0);
  $('rForest').value = Math.round(realSettings.forest * 100); $('rForestV').textContent = $('rForest').value + ' %';
  $('realSel').classList.remove('hidden');
  setTimeout(() => $('realSel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
async function pickReal(id) {
  const R = resortById(id); realPick = id; renderRealList();
  $('realSel').classList.add('hidden');
  try {
    toast('Lade ' + R.name + ' …', 1500);
    const src = await loadPreset(id);
    realSettings = { ...DEFAULTS, gen: 4, seed: newSeed(), size: RSPAN, real: id, name: R.name, villages: 1, villageSize: R.vs, rail: R.rail, river: true, lake: false, forest: R.forest ?? 0.6 };
    showRealSel(src, R.flag + ' ' + R.name);
  } catch (e) { toast('Fehler: ' + e.message, 5000); }
}
let rcTiles = null;
$('rcGo').onclick = () => {
  const c = parseCoords($('rcCoords').value);
  if (!c) { toast('Koordinaten nicht erkannt, z. B. 45.9763, 7.6586'); return; }
  const tiles = tilesFor(c.lat, c.lon);
  rcTiles = { ...c, tiles, data: new Map() };
  realPick = null; renderRealList(); $('realSel').classList.add('hidden');
  $('rcTiles').innerHTML = `<div class="small">Für diesen Ort braucht es <b>${tiles.length} Kartenstücke</b>. Bei jedem: 1) „Öffnen“ und das bunte Bild speichern (PC: Rechtsklick → „Bild speichern unter“, iPhone: lange drücken → „In Dateien sichern“), 2) „Laden“ und das gespeicherte Bild wählen.</div>` +
    tiles.map((t, i) => `<div class="tilerow"><span style="min-width:62px">Stück ${i + 1}</span><a href="${tileUrl(t.x, t.y)}" target="_blank" rel="noopener">🔗 Öffnen</a><label>📂 Laden<input type="file" accept="image/png,image/*" data-ti="${i}" style="display:none"></label><span class="ok" id="tok${i}"></span></div>`).join('');
  $('rcTiles').querySelectorAll('input[type=file]').forEach((inp) => inp.onchange = async () => {
    const i = +inp.dataset.ti, f = inp.files && inp.files[0]; if (!f) return;
    const t = rcTiles.tiles[i];
    try { rcTiles.data.set(t.x + '/' + t.y, await decodeTile(f)); $('tok' + i).textContent = '✓'; } catch (e) { $('tok' + i).textContent = '✗'; toast(e.message, 5000); return; }
    if (rcTiles.data.size === rcTiles.tiles.length) {
      try {
        const grid = buildCustom(rcTiles.lat, rcTiles.lon, rcTiles.data);
        const key = String(newSeed());
        putCustom(key, grid);
        const name = 'Eigener Ort ' + rcTiles.lat.toFixed(3) + ', ' + rcTiles.lon.toFixed(3);
        realSettings = { ...DEFAULTS, gen: 4, seed: newSeed(), size: RSPAN, real: 'custom', srcKey: key, src: encodeGrid(grid), name, villages: 1, villageSize: 'mittel', rail: true, river: true, lake: false, forest: 0.6, lat: rcTiles.lat, lon: rcTiles.lon };
        showRealSel(grid, '📍 ' + name);
      } catch (e) { toast(e.message, 5000); }
    }
  });
};
segInit('rVilSeg', (v) => { if (realSettings) realSettings.villages = +v; });
segInit('rVsizeSeg', (v) => { if (realSettings) realSettings.villageSize = v; });
segInit('rRailSeg', (v) => { if (realSettings) realSettings.rail = v === '1'; });
$('rForest').addEventListener('input', (e) => { if (realSettings) realSettings.forest = e.target.value / 100; $('rForestV').textContent = e.target.value + ' %'; });
$('btnReal').addEventListener('click', () => { $('startChoice').classList.add('hidden'); $('realPanel').classList.remove('hidden'); renderRealList(); });
$('realBack').addEventListener('click', () => { $('realPanel').classList.add('hidden'); $('startChoice').classList.remove('hidden'); });
$('realGo').addEventListener('click', () => { if (realSettings) startGame({ ...realSettings, seed: newSeed() }); });
// ---------------- world setup ----------------
function disposeWorld() {
  for (const l of G.lifts) l.dispose();
  if (G.preview) G.preview.dispose();
  if (G.player) G.player.stop();
  G.lifts = []; G.preview = null; G.selected = null; G.selObj = null;
  for (const k of ['tv', 'water', 'trees', 'village', 'traffic', 'peds', 'cannons', 'objects', 'markers', 'guests', 'groomers', 'rail', 'tracks', 'rescue', 'lplough', 'marks', 'bridges', 'rocks', 'buslines', 'roadroutes']) if (G[k]) { G[k].dispose(); G[k] = null; }
  for (const p of pins) scene.remove(p);
  pins.length = 0;
}

async function startGame(p, save = null) {
  G.settings = p;
  // every map is its own save slot; a loaded save keeps its slot
  G.slotId = (save && save.slotId) || newSlotId();
  G.slotName = (save && save.slotName) || slotLabel(p);
  $('loading').classList.remove('hidden');
  $('loadingText').textContent = save ? 'Spielstand wird geladen …' : 'Berg wird erzeugt …';
  if (p.real) {
    try { $('loadingText').textContent = 'Echte Höhendaten werden geladen …'; await ensureSource(p); $('loadingText').textContent = save ? 'Spielstand wird geladen …' : (p.name || 'Gelände') + ' wird gebaut …'; } catch (err) { console.error(err); $('loadingText').textContent = 'Fehler: ' + err.message; return; }
  }
  setTimeout(() => {
    try { buildWorld(p, save); } catch (err) { console.error(err); $('loadingText').textContent = 'Fehler beim Erzeugen: ' + err.message; return; }
    $('loading').classList.add('hidden');
    if (!save) setTimeout(() => saveGame(), 1500);
  }, 60);
}

function gfxLevel() { try { const v = localStorage.getItem('bb-gfx'); if (v === 'ultra' || v === 'normal' || v === 'potato' || v === 'hyper' || v === 'hyperlite') return v; } catch (e) { /* ignore */ } return G.device === 'desk' ? 'ultra' : 'normal'; }
function buildWorld(p, save) {
  disposeWorld();
  { const lv = gfxLevel(); G.gfxBuilt = lv; GFX.lite = lv === 'hyperlite'; GFX.hyper = lv === 'hyper' || GFX.lite; GFX.ultra = lv === 'ultra' || GFX.hyper; GFX.potato = lv === 'potato'; }
  setupComposer();
  applyQuality(); camera.far = GFX.potato ? 16000 : 60000; camera.updateProjectionMatrix();
  if (GFX.potato) { setShadows(false); segSet('shadowSeg', 0); }
  { const sz = GFX.ultra ? 4096 : 2048, ext = GFX.ultra ? 380 : 280, sh = sky.sun.shadow; if (sh.mapSize.x !== sz) { sh.mapSize.set(sz, sz); if (sh.map) { sh.map.dispose(); sh.map = null; } } const c = sh.camera; c.left = c.bottom = -ext; c.right = c.top = ext; c.updateProjectionMatrix(); sh.normalBias = GFX.ultra ? 0.6 : 0; }
  segSet('gfxSeg', gfxLevel());
  const world = generateWorld(p);
  G.world = world;
  PX_AREA = world.S * world.S / (2048 * 2048); SURF_PX_AREA = world.S * world.S / (1024 * 1024);
  G.tv = new TerrainView(world, scene, renderer);
  G.water = new Water(world, scene);
  G.ponds = new Ponds(world, scene);
  G.trees = new Trees(world, scene, G.tv);
  G.rocks = new Rocks(world, scene, G.tv, G.trees);
  G.village = new Village(world, scene);
  G.traffic = new Traffic(world, scene);
  G.peds = new Pedestrians(world, scene);
  G.cannons = new SnowCannons(world, scene);
  G.objects = new Objects(world, scene, G.cannons, G.trees);
  onAdsChange(() => { if (G.objects) for (const o of G.objects.list) if (o.type === 'werbebogen') G.objects.setAd(o, o.ad !== undefined ? o.ad : o.id % AD_SLOTS); });
  loadAds(save && save.ads);
  G.markers = new PisteMarkers(world, scene, G.tv);
  G.guests = new Guests(world, scene, G.tv);
  G.groomers = new Groomers(world, scene, G.tv, G.cannons);
  G.groomers.colorMode = (save && save.bullyColor) || G.bullyColor || 'rot';
  Lift.pisteAt = (x, z) => G.tv.pisteAt(x, z); Objects.pisteAt = Lift.pisteAt;
  G.rail = new Railway(world, scene);
  G.tracks = new Tracks(scene);
  G.marks = new Marks(world, scene);
  G.roadroutes = new RoadRoutes(world, scene);
  G.buslines = new BusLines(world, scene, G.roadroutes);
  G.bridges = new FixedBridges(world, scene);
  G.rescue = new Rescue(world, scene);
  G.lplough = new LocalPlough(world, scene, G.tv);
  G.player = new Player({
    world, scene, tv: G.tv, trees: G.trees, rocks: G.rocks, objects: G.objects, cannons: G.cannons, getLifts: () => G.lifts, season: () => G.season, tracks: G.tracks, bullyModel: () => G.bullyModel || 400, bullySpeeds: () => bullySpeeds(), bullyColor: () => (BULLY_COLORS[G.playBullyColor] || BULLY_COLORS.blau).hex,
    roadSnow: (x, z) => G.traffic.snowAt(x, z),
    cover: () => ({ nat: G.tv.uniforms.uCover.value, piste: G.tv.uniforms.uPisteCover.value, temp: mountainTemp(), fresh: G.tv.uniforms.uFresh.value, road: G.traffic.avgSnow() }),
  });
  // buildings the lift ropes must clear (village houses, church, barns)
  {
    const cells = new Map(), C = 40;
    const addOb = (x, z, r, top, ref) => { for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) { const k = i * 100000 + j; if (!cells.has(k)) cells.set(k, []); cells.get(k).push({ x, z, r, top, ref }); } };
    for (const v of world.villages) {
      for (const h of v.houses) addOb(h.x, h.z, Math.max(h.w, h.d) / 2 + 1.5, heightAt(world, h.x, h.z) + (h.hotel ? h.floors : h.floors + 1) * 2.9 + 5, h);
      if (v.church) addOb(v.church.x, v.church.z, 14, heightAt(world, v.church.x, v.church.z) + 38);
    }
    for (const b of world.barns) addOb(b.x, b.z, 6, heightAt(world, b.x, b.z) + 7, b);
    world.obstacleAt = (x, z, r) => {
      let top = -Infinity;
      const lst = cells.get(Math.floor(x / C) * 100000 + Math.floor(z / C));
      if (lst) for (const o of lst) if (!(o.ref && o.ref.removed) && (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2 && o.top > top) top = o.top;
      return top;
    };
  }
  G.villageBeds = world.villages.reduce((s, v) => s + v.houses.reduce((a, h) => a + (h.removed ? 0 : h.hotel ? 60 : 6), 0), 0);
  G.tv.uniforms.uGroom.value = 1;
  if (save) {
    Object.assign(G, { mode: save.mode, money: save.mode === 'sandbox' ? Infinity : save.money, season: save.season, seasonMode: save.seasonMode, seasonLen: save.seasonLen, seasonElapsed: save.seasonElapsed || 0, time: save.time, timeAuto: save.timeAuto, dayMin: save.dayMin || 14, weather: save.weather, weatherAuto: save.weatherAuto, guestTarget: save.guestTarget, ticket: save.ticket || 72, staff: save.staff ?? 2, day: save.day || 1, nightSki: !!save.nightSki, nightSkiMode: save.nightSkiMode || (save.nightSki ? 'on' : 'auto'), timeLive: !!save.timeLive, weatherLive: !!save.weatherLive, liveWx: save.liveWx || null });
    G.tv.uniforms.uNewSnow.value = save.newSnow || 0;
    Object.assign(G, { snowNat: save.snowNat ?? 60, snowMade: save.snowMade ?? 20, snowMode: save.snowMode || 'auto', groomFrom: save.groomFrom || 16.75, sat: save.sat ?? 70, rep: save.rep ?? 0.7, reviews: save.reviews || [] });
    G.traffic.ploughCount = save.ploughs ?? 1; G.traffic.ploughAuto = save.ploughAuto !== false;
    G.towerPads = save.towerPads !== false; Lift.padsOn = Objects.padsOn = G.towerPads;
    G.bullyColor = save.bullyColor || 'rot'; G.playBullyColor = save.playBullyColor || 'blau';
    try { if (save.heights) { G.tv.loadHeights(save.heights); G.guests.refreshHeights(); } } catch (e) { console.warn(e); }
    try { if (save.piste) G.tv.loadLayer('piste', save.piste); if (save.trail) G.tv.loadLayer('trail', save.trail); } catch (e) { console.warn(e); }
    try { if (save.trees) G.trees.load(save.trees); } catch (e) { console.warn(e); }
    try { if (save.surf) G.tv.loadSurf(save.surf); G.tv.addRoadSnow(save.roadCnt || 0); } catch (e) { console.warn(e); }
    for (const d of save.lifts || []) {
      try { if (!LIFT_TYPES[d.t]) continue; G.lifts.push(new Lift(world, scene, d.t, BRANDS[d.b] ? d.b : 'dreifachmayr', d.A, d.B, { id: d.id, towers: d.auto ? null : d.towers, autoTowers: d.auto, running: d.run, speedF: d.sp, densF: d.de, color: d.c, name: d.n, lean: d.lean, queue: d.q, trackPts: d.tp, mid: d.mid, nightLift: d.nl, op: d.op || 'all', pts: d.pts, twDef: d.td, stStyle: d.st, twStyleAll: d.ts, garStyle: d.gs || 'daneben', cable: !!d.cab })); } catch (e) { console.warn(e); }
    }
    try { G.objects.load(save.objects); } catch (e) { console.warn(e); }
    try { G.ponds.load(save.ponds); } catch (e) { console.warn(e); }
    try { if (save.marks) G.marks.load(save.marks); } catch (e) { console.warn(e); }
    try { if (save.roads) G.roadroutes.load(save.roads); } catch (e) { console.warn(e); }
    try { if (save.bus) G.buslines.load(save.bus); } catch (e) { console.warn(e); }
    try { if (save.rocks) G.rocks.load(save.rocks); } catch (e) { console.warn(e); }
    try { G.rocks.cull(); for (const l of G.lifts) { const w3 = l.type.gauge / 2 + 7; G.rocks.removeWhere((t) => l.distToLine(t.x, t.z) < w3 + t.s); } } catch (e) { console.warn(e); }
    try { if (save.vRemoved) { G.village.loadRemoved(save.vRemoved); G.villageBeds = world.villages.reduce((s2, v) => s2 + v.houses.reduce((a, h) => a + (h.removed ? 0 : h.hotel ? 60 : 6), 0), 0); } } catch (e) { console.warn(e); }
  } else {
    G.mode = startMode; G.money = startMode === 'sandbox' ? Infinity : 25000000; G.season = startSeason;
    G.time = 9.5; G.day = 1; G.seasonElapsed = 0; G.weather = 'sonne'; G.report = null; G.timeLive = false; G.weatherLive = false; G.liveWx = null;
    Object.assign(G, { snowNat: 60, snowMade: 20, snowMode: 'auto', groomFrom: 16.75, sat: 70, rep: 0.7, reviews: [], staff: startMode === 'sandbox' ? 3 : 2 });
    G.towerPads = true; Lift.padsOn = Objects.padsOn = true;
  }
  controls.maxDistance = world.S * 1.3;
  if (save && save.cam) {
    controls.target.set(save.cam.t[0], save.cam.t[1], save.cam.t[2]);
    camera.position.set(save.cam.p[0], save.cam.p[1], save.cam.p[2]);
  } else if (world.real && world.villages.length) {
    const v0 = world.villages[0], ty = heightAt(world, v0.x, v0.z);
    controls.target.set(v0.x, ty, v0.z - 300);
    camera.position.set(v0.x + 500, ty + 1100, v0.z + 1700);
  } else {
    const tz = world.S * 0.05;
    controls.target.set(0, heightAt(world, 0, tz), tz);
    camera.position.set(world.S * 0.04, controls.target.y + world.S * 0.17, Math.min(tz + world.S * 0.6, world.S * 0.49));
  }
  controls.update();
  applySeason(G.season, true);
  for (const l of G.lifts) if (!l.seasonOk) l.parkAll();
  G.nightOn = null;
  ['start'].forEach((id) => $(id).classList.add('hidden'));
  ['hud', 'hint', 'toolbar', 'camBtns'].forEach((id) => $(id).classList.remove('hidden'));
  updateLegend();
  setTool('view');
  updateHUD();
  scheduleNetwork(true);
  buildMinimapBase();
  G.firstFrame = true;
  planInjury(); G.injury = null;
  if (G.device === 'desk' && !G.shadowUser && !GFX.potato) { setShadows(true); segSet('shadowSeg', 1); }
  fpsWatch.reset();
  if (!save) placeVillageGarage();
  if (!save) toast('Tipp: Wähle unten „Lifte“, um deinen ersten Lift zu bauen. ⛷️', 4500);
  else toast('Spielstand geladen ✅');
}

// ---------------- seasons, time, weather ----------------
function applySeason(s, initial = false) {
  G.season = s;
  G.tv.setSeason(s); G.trees.setSeason(s); if (G.rocks) G.rocks.setSeason(s); G.village.setSeason(s); G.water.setSeason(s); G.ponds.setSeason(s); G.objects.setSeason(s);
  G.cannons.setActive(s === 0); G.traffic.setSeason(s); G.peds.setSeason(s); G.markers.setSeason(s); G.guests.setSeason(s);
  G.rail.setSeason(s); Lift.winter = s === 0; for (const l of G.lifts) if (l.snowGroup) l.snowGroup.visible = s === 0;
  G.tracks.clear();
  if (G.marks) G.marks.setVisible(s === 0);
  if (G.bridges) G.bridges.setSeason(s);
  if (s === 0) G.tv.clearAllSurfSnow();
  if (s === 0 && !initial) { G.snowNat = Math.max(G.snowNat || 0, 45); G.snowMade = Math.max(G.snowMade || 0, 10); }
  $('pisteLbl').textContent = s === 0 ? 'Pisten' : 'Wege';
  if (G.player && G.player.active && PLAY_MODES[G.player.mode].season !== undefined && PLAY_MODES[G.player.mode].season !== s) { exitPlay(); toast('Jahreszeit gewechselt: Spielmodus beendet'); }
  if (!initial) { scheduleNetwork(true); buildMinimapBase(); renderToolPanel(); toast(s === 0 ? '❄️ Es ist Winter!' : '☀️ Es ist Sommer!'); }
  if (G.tool === 'piste') G.tv.setOverlay(s === 0 ? 1 : 2);
  updateHUD();
}

function rollWeather() {
  const r = Math.random();
  if (G.season === 0) G.weather = r < 0.5 ? 'sonne' : r < 0.72 ? 'wolken' : r < 0.92 ? 'schnee' : 'starkschnee';
  else G.weather = r < 0.6 ? 'sonne' : r < 0.88 ? 'wolken' : 'regen';
}
// temperature at an absolute altitude (m ü. M.), ~0.6 °C per 100 m, daily curve, weather
function snowRate() { return G.season !== 0 ? 0 : G.weather === 'starkschnee' ? 2.5 : G.weather === 'schnee' ? 1 : 0; }
function tempAt(absAlt) {
  if (G.weatherLive && G.liveWx && G.liveWx.elev != null) { const n = liveNow(); if (n) return n.temp - (absAlt - G.liveWx.elev) * 0.0065; }
  const t = G.time, dayCurve = Math.sin((t - 9) / 24 * Math.PI * 2);
  const base = (G.season === 0 ? 2 : 24) - absAlt * 0.006 + (G.tempShift || 0);
  const w = G.weather === 'sonne' ? 2 : G.weather === 'wolken' ? 0 : -2;
  return base + dayCurve * 5 + w;
}
function temperature() { return Math.round(tempAt(G.world ? controls.target.y + (G.world.altOff || 0) : 1000)); }
function mountainTemp() { return G.world ? tempAt(G.world.alt + 450) : -3; }

// ---------------- snow & guest model (snow depth, snowmaking, quality, satisfaction, reviews) ----------------
const REVIEW_TEXT = {
  coverBad: ['Steine auf der Piste – viel zu wenig Schnee! ⛰️', 'Überall braune Flecken, so macht Skifahren keinen Spass.', 'Meine Ski sind jetzt kaputt, so wenig Schnee 😤'],
  groomBad: ['Pisten waren eisig und total abgefahren.', 'Wird hier überhaupt präpariert? Nur Buckel!', 'Am Morgen schon voller Löcher, schlechte Präparierung.'],
  slush: ['Sulzschnee am Nachmittag, wie Fahren im Brei.', 'Viel zu warm, der Schnee war pappig.'],
  snowGood: ['Traumhaft präpariert, perfekter Cord am Morgen! 😍', 'Super Schnee, top Pisten! ❄️', 'Beste Schneequalität seit Jahren!'],
  powder: ['Frischer Pulverschnee, einfach genial! 🤩'],
  queueBad: ['Ewig anstehen am Lift …', '30 Minuten Wartezeit, nein danke.', 'Zu wenig Lifte für so viele Leute.'],
  queueGood: ['Nie anstehen müssen, top Lifte! 🚡'],
  crowdBad: ['Viel zu voll auf den Pisten.', 'Wie auf der Autobahn, so viele Leute.'],
  crowdGood: ['Schön leere Pisten.'],
  priceBad: ['Viel zu teuer für so wenig Angebot 💸', 'Der Skipass ist echt zu teuer.'],
  priceGood: ['Faire Preise! 👍'],
  accessBad: ['Strasse nicht geräumt – Stau bei der Anreise! 🚗❄️', 'Wir sind fast nicht hingekommen, so viel Schnee auf der Strasse.'],
  trainGood: ['Mit dem Zug anreisen war super bequem 🚆'],
  varietyBad: ['Zu wenig Abwechslung, immer die gleiche Piste.'],
  varietyGood: ['Viele verschiedene Pisten, für jeden was dabei.'],
  weatherBad: ['Schlechtes Wetter, aber was soll man machen.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
let opsT = 0, reviewT = 0, groomAvgCache = 1;
function snowModel(dt) {
  if (!G.world) return;
  const hours = dt * 24 / (dayMinNow() * 60);
  const U = G.tv.uniforms;
  const tM = mountainTemp();
  const winter = G.season === 0;
  if (winter) {
    // natural snow: falls when it snows, melts when warm
    if (snowRate()) { G.snowNat += hours * (tM < 1 ? 3 * snowRate() : 0); if (tM < 1) G.tv.addRoadSnow(dt * 0.4 * snowRate()); }
    if (G.weather === 'regen' || tM > 0) G.snowNat -= hours * Math.max(0, tM) * 0.9 + (G.weather === 'regen' ? hours * 2 : 0);
    if (tM > 0) G.snowMade -= hours * tM * 0.45;
    // snowmaking: needs cold; 'auto' runs at night / outside ski hours when it is cold enough
    const nc = G.cannons.list.length;
    const cold = tM <= -2;
    const skiing = skiFactor(G.time) > 0.3;
    const want = G.snowMode === 'on' || (G.snowMode === 'auto' && cold && (!skiing || G.snowMade < 25) && G.snowMade < 110);
    const run = nc > 0 && want && tM < 0.5;
    G.cannons.on = run;
    if (run) {
      const ha = Math.max(1, limits().pisteHa);
      const eff = clamp((-tM - 0.5) / 6, 0, 1.4);
      G.snowMade += hours * nc * eff * 6 / ha;
      G.snowCostAcc = (G.snowCostAcc || 0) + hours * nc * 22;
    }
    G.snowNat = clamp(G.snowNat, 0, 250); G.snowMade = clamp(G.snowMade, 0, 150);
  } else { G.cannons.on = false; }
  // shader: natural cover and piste cover
  if (G.mode === 'sandbox') G.snowNat = Math.max(G.snowNat, 35);
  U.uCover.value = winter ? clamp(G.snowNat / 70, 0, 1) : 1;
  U.uPisteCover.value = winter ? clamp((G.snowNat * 0.75 + G.snowMade) / 40, G.mode === 'sandbox' ? 0.85 : 0, 1) : 1;
  // quality & satisfaction (every ~2 s)
  opsT += dt;
  if (opsT < 2) return;
  opsT = 0;
  if (winter) groomAvgCache = G.tv.groomAvg();
  const q = snowQuality();
  G.snowQ = q.total;
  const f = satFactors(q);
  G.satF = f;
  const target = f.total * 100;
  if (G.guests.count > 0 && skiFactorNow() > 0.2) G.sat = lerp(G.sat ?? 70, target, 0.04);
  // reviews from real conditions (normal mode)
  reviewT += 2;
  if (G.mode === 'normal' && G.guests.count > 5 && skiFactorNow() > 0.3 && reviewT > Math.max(20, dayMinNow() * 60 / 12)) { reviewT = 0; addReview(q, f); }
}
// share of the piste area lit by floodlights / lanterns (sampled, cached)
let litCache = { t: -99, v: 0 };
function litShare() {
  if (elapsed - litCache.t < 3) return litCache.v;
  litCache.t = elapsed;
  const lights = G.objects.list.filter((o) => o.type === 'flutlicht' || o.type === 'laterne').map((o) => [o.x, o.z, o.type === 'flutlicht' ? 48 : 13]);
  const tv = G.tv, T = tv.T;
  let n = 0, lit = 0;
  for (let py = 3; py < T; py += 12) for (let px = 3; px < T; px += 12) {
    if (!tv.piste[py * T + px]) continue;
    n++;
    if (!lights.length) continue;
    const [x, z] = tv.toWorld(px, py);
    for (const [lx, lz, r] of lights) if ((lx - x) ** 2 + (lz - z) ** 2 < r * r) { lit++; break; }
  }
  litCache.v = n ? lit / n : 0;
  return litCache.v;
}
// is this lift used for night skiing? auto = its line is mostly lit by floodlights / lanterns
function liftNight(l) {
  if (l.nightLift === 'on') return true;
  if (l.nightLift === 'off') return false;
  const lights = G.objects.list.filter((o) => o.type === 'flutlicht' || o.type === 'laterne');
  if (!lights.length) return false;
  let lit = 0; const n = 10;
  for (let i = 0; i <= n; i++) { const p = l.pointAt(l.L * i / n); if (lights.some((o) => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < (o.type === 'flutlicht' ? 70 : 20) ** 2)) lit++; }
  return lit / (n + 1) >= 0.4;
}
// opening hours of every lift (day 8:30–16:15, summer until 17:30, night skiing 21–23 on night lifts)
let schedT = 0;
function updateLiftSchedule(dt) {
  schedT += dt; if (schedT < 0.5) return; schedT = 0;
  const t = G.time, night = G.season === 0 && nightSkiOn() && t >= 21 && t < 23;
  const day = G.season === 0 ? t >= SKI_FROM && t < SKI_TO : t >= 8.5 && t < 17.5;
  for (const l of G.lifts) l.setOpen(l.seasonOk && (day || (night && liftNight(l))));
}
function nightSkiOn() {
  const m = G.nightSkiMode || (G.nightSki ? 'on' : 'auto');
  if (m === 'on') return true;
  if (m === 'off') return false;
  return G.season === 0 && litShare() >= 0.7;
}
function nightSkiHTML(id) {
  const m = G.nightSkiMode || (G.nightSki ? 'on' : 'auto');
  const ls = Math.round(litShare() * 100);
  return `<label class="lbl">🌙 Nachtskifahren 21–23 Uhr · ${nightSkiOn() ? '<b style="color:#7fd3ff">an</b>' : 'aus'}</label>
    <div class="seg" id="${id}" style="margin:0"><button data-v="auto" class="${m === 'auto' ? 'on' : ''}">Automatisch</button><button data-v="on" class="${m === 'on' ? 'on' : ''}">Immer an</button><button data-v="off" class="${m === 'off' ? 'on' : ''}">Aus</button></div>
    <div class="small">Beleuchtet: <b>${ls} %</b> der Pisten. „Automatisch“ schaltet Nachtskifahren ein, wenn mindestens 70 % der Pisten von Flutlicht-Masten oder Laternen beleuchtet sind (Bauen → Licht).</div>`;
}
// service buildings (normal mode needs them; sandbox works without)
function services() {
  const sb = G.mode === 'sandbox';
  const o = G.objects;
  return { garages: o.count('garage'), werkhof: o.count('werkhof'), rega: o.count('rega'), sanitaet: o.count('sanitaet'),
    groomCap: sb ? 99 : 3 * o.count('garage'), ploughCap: sb ? 3 : 2 * o.count('werkhof'), localPlough: sb || o.count('werkhof') > 0 };
}
function regaPad() {
  const o = G.objects.list.find((q) => q.type === 'rega'); if (!o) return null;
  const x = o.x + 12 * Math.cos(o.yaw), z = o.z - 12 * Math.sin(o.yaw);
  return { x, z, y: heightAt(G.world, x, z) + 0.45, yaw: o.yaw };
}
// injuries: rare (at most one per day), rescued by helicopter, piste rescue or (badly) nobody
let injPin = null;
function planInjury() { G.injuryAt = Math.random() < (G.mode === 'normal' ? 0.6 : 0.3) ? 9.8 + Math.random() * 6 : -1; }
function updateInjuries(dt) {
  if (G.season !== 0 || G.injuryAt == null || G.injuryAt < 0 || G.rescue.busy) return;
  if (G.time < G.injuryAt || G.time > G.injuryAt + 1.5) return;
  const g = G.guests.injureRandom();
  G.injuryAt = -1;
  if (!g) return;
  const sv = services();
  let mode = 'none', from = null;
  const pad = regaPad();
  if (pad) { mode = 'heli'; from = pad; }
  else if (sv.sanitaet) { const h = G.objects.list.find((q) => q.type === 'sanitaet'); mode = 'sled'; from = { x: h.x + 4, z: h.z }; }
  else if (G.mode === 'sandbox') { mode = 'heli'; const y = heightAt(G.world, g.x, g.z) + 160; from = { x: g.x - 1800, z: g.z, y }; }
  G.rescue.start(g, mode, from);
  G.injury = { g, mode, t0: elapsed };
  injPin = pin(g, 0xff2200);
  toast(mode === 'heli' ? '🚁 Ein Skifahrer hat sich verletzt! Die Luftrettung fliegt los.' : mode === 'sled' ? '🚑 Ein Skifahrer hat sich verletzt! Die Pistenrettung ist unterwegs.' : '🚑 Ein Skifahrer hat sich verletzt – aber du hast keine Rettung! Baue eine Heli-Basis oder Pistenrettung (Bauen → Dienste).', 5000);
}
function rescueEvent(ev) {
  const I = G.injury; if (!I) return;
  if (ev === 'picked') {
    G.guests.rescued(I.g);
    if (injPin) { scene.remove(injPin); const i = pins.indexOf(injPin); if (i >= 0) pins.splice(i, 1); injPin = null; }
    if (G.mode === 'normal') {
      const txt = I.mode === 'heli' ? 'Super schnelle Rettung mit dem Helikopter, danke! 🚁' : I.mode === 'sled' ? 'Die Pistenrettung war schnell da. 👍' : 'Mein Freund hat sich verletzt und es kam ewig keine Hilfe! 😡';
      const stars = I.mode === 'none' ? 1 : I.mode === 'heli' ? 5 : 4;
      G.reviews = G.reviews || []; G.reviews.push({ stars, txt, day: G.day, t: G.time }); if (G.reviews.length > 12) G.reviews.shift();
      if (I.mode === 'none') G.sat = Math.max(0, (G.sat ?? 70) - 8);
      toast(`💬 ${'⭐'.repeat(stars)} „${txt}“`, 4000);
    }
  }
  if (ev === 'done' || (ev === 'picked' && I.mode === 'none')) G.injury = null;
}
function skiFactorNow() { return G.season === 0 ? skiFactor(G.time) : (G.time >= 8 && G.time < 20 ? 1 : 0); }
function snowQuality() {
  if (G.season !== 0) return { cover: 1, groom: 1, temp: 1, total: 1 };
  const cover = G.tv.uniforms.uPisteCover.value;
  const groom = groomAvgCache;
  const tM = mountainTemp();
  const temp = tM > 4 ? 0.7 : tM > 1.5 ? 0.85 : 1;
  const fresh = G.tv.uniforms.uFresh.value;
  return { cover, groom, temp, fresh, total: clamp(Math.pow(cover, 0.7) * (0.35 + 0.65 * groom) * temp + fresh * 0.08, 0, 1) };
}
function satFactors(q) {
  const L = limits();
  const cap = Math.max(1, G.lifts.filter((l) => l.running && l.seasonOk).reduce((s, l) => s + l.capacity, 0));
  const g = G.guests.count;
  const queue = clamp(1.3 - (g * 4) / cap, 0, 1);
  const crowd = clamp(1.35 - g / Math.max(1, (G.season === 0 ? L.pisteHa : L.area / 60) * 25), 0, 1);
  const offer = 40 + G.lifts.length * 9 + (G.season === 0 ? L.pisteHa : L.area / 60) * 1.2 + cap / 400;
  const price = clamp(1.6 - G.ticket / Math.min(150, offer), 0, 1);
  const roadSnow = G.traffic.avgSnow();
  const access = G.season === 0 ? clamp(1 - Math.max(0, roadSnow - 0.15) * 1.6, 0, 1) : 1;
  const area = G.season === 0 ? G.tv.countArea('piste') : G.tv.countArea('trail');
  const kinds = area.slice(1).filter((a) => a > 2000).length;
  const variety = clamp(0.3 + kinds * 0.17 + Math.min(G.lifts.length, 6) * 0.06, 0, 1);
  const weather = G.weather === 'sonne' ? 1 : G.weather === 'wolken' ? 0.85 : 0.7;
  const snow = q.total;
  const total = clamp(snow * 0.34 + queue * 0.18 + crowd * 0.1 + price * 0.14 + access * 0.1 + variety * 0.09 + weather * 0.05, 0, 1);
  return { snow, queue, crowd, price, access, variety, weather, total };
}
function addReview(q, f) {
  const opts = [];
  const neg = (k, w, txt) => { if (f[k] < 0.55) opts.push({ w: (0.6 - f[k]) * w, txt, bad: true }); };
  const pos = (k, w, txt) => { if (f[k] > 0.82) opts.push({ w: (f[k] - 0.8) * w, txt, bad: false }); };
  if (G.season === 0) {
    if (q.cover < 0.5) opts.push({ w: (0.55 - q.cover) * 4, txt: pick(REVIEW_TEXT.coverBad), bad: true });
    if (q.groom < 0.45) opts.push({ w: (0.5 - q.groom) * 3, txt: pick(REVIEW_TEXT.groomBad), bad: true });
    if (q.temp < 0.9) opts.push({ w: 0.4, txt: pick(REVIEW_TEXT.slush), bad: true });
    if (q.total > 0.8) opts.push({ w: (q.total - 0.75) * 4, txt: pick(q.fresh > 0.6 ? REVIEW_TEXT.powder : REVIEW_TEXT.snowGood), bad: false });
    neg('access', 3, pick(REVIEW_TEXT.accessBad));
  }
  neg('queue', 3, pick(REVIEW_TEXT.queueBad)); pos('queue', 1.5, pick(REVIEW_TEXT.queueGood));
  neg('crowd', 2, pick(REVIEW_TEXT.crowdBad)); pos('crowd', 1, pick(REVIEW_TEXT.crowdGood));
  neg('price', 2.5, pick(REVIEW_TEXT.priceBad)); pos('price', 1, pick(REVIEW_TEXT.priceGood));
  neg('variety', 1.5, pick(REVIEW_TEXT.varietyBad)); pos('variety', 1, pick(REVIEW_TEXT.varietyGood));
  if (f.weather < 0.8) opts.push({ w: 0.15, txt: pick(REVIEW_TEXT.weatherBad), bad: true });
  if (G.rail && G.rail.ok) opts.push({ w: 0.12, txt: pick(REVIEW_TEXT.trainGood), bad: false });
  if (!opts.length) return;
  let r = Math.random() * opts.reduce((a, o) => a + o.w, 0), o = opts[0];
  for (const x of opts) { r -= x.w; if (r <= 0) { o = x; break; } }
  const stars = clamp(Math.round(1 + f.total * 4 + (Math.random() - 0.5) * 1.2 + (o.bad ? -0.6 : 0.6)), 1, 5);
  G.reviews = G.reviews || [];
  G.reviews.push({ stars, txt: o.txt, day: G.day, t: G.time });
  if (G.reviews.length > 12) G.reviews.shift();
  toast(`💬 ${'⭐'.repeat(stars)} „${o.txt}“`, 3800);
}

function newDay() {
  G.day++;
  planInjury();
  if (G.weatherAuto) rollWeather();
  if (G.mode === 'normal') {
    const avg = G.guestN ? G.guestSum / G.guestN : 0;
    const visitors = Math.round(avg * 3);
    const ticket = G.season === 0 ? G.ticket : Math.round(G.ticket * 0.45);
    const revenue = visitors * ticket;
    const liftCost = G.lifts.reduce((s, l) => s + (l.running ? l.dailyCost * (l.seasonOk ? 1 : 0.15) : 0), 0);
    const staffCost = G.staff * 420 + G.traffic.ploughCount * 300 + G.buslines.lines.reduce((a, l) => a + l.nBus * 250, 0);
    const snowCost = Math.round(G.snowCostAcc || 0); G.snowCostAcc = 0;
    const serviceCost = G.objects.dailyCost();
    const cost = liftCost + staffCost + snowCost + serviceCost;
    G.money += revenue - cost;
    G.rep = lerp(G.rep ?? 0.7, (G.sat ?? 70) / 100, 0.35);
    G.report = { day: G.day - 1, visitors, revenue, cost, liftCost, staffCost, snowCost, serviceCost, sat: Math.round(G.sat ?? 70) };
    toast(`📊 Tag ${G.day - 1}: ${visitors} Gäste · +${fmtMoney(revenue)} · −${fmtMoney(cost)}`, 4500);
    updateHUD();
  }
  G.guestSum = 0; G.guestN = 0;
}

// evening grooming is finished at 21:00: the rest of the pistes get prepared too
function nightlyGrooming() {
  if (G.season !== 0) return;
  const area = G.tv.countArea('piste');
  const ha = (area[1] + area[2] + area[3] + area[5] + area[6]) / 1e4;
  const durF = clamp((GROOM_TO - (G.groomFrom || GROOM_FROM)) / 4.25, 0.3, 1.3);
  const drivers = Math.min(G.staff, services().groomCap);
  const q = drivers <= 0 ? 0 : G.mode === 'sandbox' ? 1 : clamp(drivers * 25 * durF / Math.max(1, ha), 0, 1);
  if (q > 0) { G.tv.groomAll(q); G.tv.uniforms.uNewSnow.value *= 1 - q * 0.9; }
  if (q > 0.3) G.cannons.flattenAll();
}
const GROOM_FROM = 16.75, GROOM_TO = 21, SKI_FROM = 8.5, SKI_TO = 16.25;
function skiFactor(t) {
  if (t >= SKI_FROM && t < SKI_TO) return t < SKI_FROM + 0.5 ? (t - SKI_FROM) / 0.5 : 1;
  if (t >= SKI_TO && t < GROOM_FROM) return 1 - (t - SKI_TO) / (GROOM_FROM - SKI_TO);
  if (nightSkiOn() && t >= 21 && t < 23) return 0.45;
  return 0;
}
let wearAcc = 0;
// ---- live time & real weather ----
function dayMinNow() { return G.timeLive ? 1440 : G.dayMin; }
// where is this map? real areas know their place; "Echter Ort" has coordinates; random maps use your own clock
function livePlace() {
  const p = G.settings || {};
  const wx = G.liveWx;
  if (p.real && p.real !== 'custom') { const R = resortById(p.real); if (R) return { name: R.name, lat: R.lat, lon: R.lon, tz: (wx && wx.tz) || placeTZ(R), utcOff: wx ? wx.utcOff : null }; }
  if (p.real === 'custom' && p.lat != null) return { name: p.name || 'Echter Ort', lat: p.lat, lon: p.lon, tz: wx && wx.tz, utcOff: wx ? wx.utcOff : null };
  return null;
}
let wxT = 99, wxStaleWarned = false;
function liveWeatherTick(dt) {
  wxT += dt;
  if (!G.weatherLive || wxT < 3) return;
  wxT = 0;
  const wx = G.liveWx;
  const i = wxIndex(wx, new Date(), G.timeLive ? null : G.time);
  if (i < 0) { if (!wxStaleWarned) { wxStaleWarned = true; toast('🌍 Die Wetterdaten sind abgelaufen – hol sie unter Zeit & Wetter neu', 4000); tryFetchWeather(true); } return; }
  wxStaleWarned = false;
  const w = wxToGame(wx, i, G.season === 0);
  if (w !== G.weather) { G.weather = w; updateHUD(); }
}
function liveNow() { const wx = G.liveWx; if (!wx) return null; const i = wxIndex(wx, new Date(), G.timeLive ? null : G.time); return i < 0 ? null : { i, temp: wx.temp[i], code: wx.code[i] }; }
let fetchingWx = false;
async function tryFetchWeather(silent = false) {
  const pl = livePlace(); if (!pl || fetchingWx) return false;
  fetchingWx = true;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(weatherUrl(pl.lat, pl.lon), { signal: ctl.signal }); clearTimeout(to);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    setLiveWx(parseWeather(await r.text()));
    if (!silent) toast('🌍 Echtes Wetter geladen');
    return true;
  } catch (e) { return false; } finally { fetchingWx = false; }
}
function setLiveWx(wx) { G.liveWx = wx; G.weatherLive = true; G.weatherAuto = false; wxT = 99; wxStaleWarned = false; liveWeatherTick(0); saveSoon(); }

function updateTime(dt) {
  const prev = G.time;
  if (G.timeLive) { G.time = liveHour(livePlace()); if (G.time < prev - 12) newDay(); }
  else if (G.timeAuto) G.time += dt * 24 / (G.dayMin * 60);
  if (G.time >= 24) { G.time -= 24; newDay(); }
  liveWeatherTick(dt);
  if (prev < GROOM_TO && G.time >= GROOM_TO) nightlyGrooming();
  if (G.seasonMode === 'auto') {
    G.seasonElapsed += dt;
    if (G.seasonElapsed > G.seasonLen * 60) { G.seasonElapsed = 0; applySeason(1 - G.season); }
  }
  snowModel(dt);
  const U = G.tv.uniforms;
  U.uGroom.value = 1;
  const snowing = snowRate() > 0;
  if (snowing) U.uFresh.value = Math.min(1, U.uFresh.value + dt * 0.02 * snowRate()); else U.uFresh.value = Math.max(0, U.uFresh.value - dt * 0.0015);
  // new snow settles on the pistes (covers the corduroy) until the groomers work it in; skiers track it out a bit
  if (snowing && mountainTemp() < 1.5) {
    U.uNewSnow.value = Math.min(1, U.uNewSnow.value + dt * snowRate() / 260);
    G.newSnowFadeT = (G.newSnowFadeT || 0) + dt;
    if (G.newSnowFadeT > 3) { G.tv.fadeGroomSnow(G.newSnowFadeT * snowRate() / 200); G.newSnowFadeT = 0; }
  }
  else if (G.season === 0) U.uNewSnow.value = Math.max(0, U.uNewSnow.value - dt * skiFactor(G.time) * 0.0012);
  G.trackFadeT = (G.trackFadeT || 0) + dt;
  if (G.trackFadeT > 1) { G.tracks.fade(snowing ? 0.03 : 0.002); G.trackFadeT = 0; }
  // skiers (and snowfall) wear down the corduroy during the day
  if (G.season === 0 && (G.timeAuto || G.timeLive)) {
    const area = limits().pisteHa || 1;
    const busy = clamp(G.guests.count / Math.max(20, area * 4), 0.15, 1.6);
    const perSec = 0.7 * 3 / (dayMinNow() * 60);
    wearAcc += dt * perSec * (skiFactor(G.time) * busy + (snowing ? 0.6 : 0));
    if (wearAcc > 0.02) { G.tv.wearGroom(wearAcc); wearAcc = 0; }
  }
}

// ---------------- HUD ----------------
let toastTimer = 0;
function toast(msg, ms = 2400) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, ms); }
function hint(t) { $('hint').textContent = t || ''; }
function canPay(c) { return G.money === Infinity || G.money >= c; }
function pay(c) { if (G.money !== Infinity) { G.money -= c; updateHUD(); } }
function updateHUD() {
  if (!G.world) return;
  $('money').textContent = G.mode === 'sandbox' ? '♾️ Sandbox' : '💰 ' + fmtMoney(G.money).replace(' CHF', '');
  const hh = Math.floor(G.time), mm = Math.floor((G.time - hh) * 60);
  const wIcon = { sonne: G.nightOn ? '🌙' : '☀️', wolken: '☁️', schnee: '🌨️', starkschnee: '❄️', regen: '🌧️' }[G.weather];
  $('clock').textContent = `${G.weatherLive || G.timeLive ? '🔴 ' : ''}${wIcon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${temperature()}°`;
  const face = G.mode === 'normal' ? ' ' + ((G.sat ?? 70) >= 75 ? '😀' : (G.sat ?? 70) >= 55 ? '🙂' : (G.sat ?? 70) >= 40 ? '😐' : '☹️') : '';
  $('guestChip').textContent = (G.season === 0 ? '⛷️ ' : '🚵 ') + G.guests.count + face;
}

document.querySelectorAll('#toolbar button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

function setPending(p, text) { G.pending = p; $('pending').classList.remove('hidden'); $('pendingText').textContent = text; if (!(G.liftCompact && (p.kind === 'addTower' || p.kind === 'moveTower'))) $('sidepanel').classList.add('collapsed'); $('toolpanel').classList.add('collapsed'); }
function clearPending() { $('pendingCancel').textContent = 'Abbrechen'; const had = !!G.pending; G.pending = null; $('pending').classList.add('hidden'); if (had) { $('sidepanel').classList.toggle('collapsed', !!G.collapse.side); $('toolpanel').classList.toggle('collapsed', !!G.collapse['tool:' + G.tool]); } }
$('pendingCancel').onclick = () => { clearPending(); if (G.selected) renderLiftPanel(); else if (G.selObj) renderObjPanel(); };

const pins = [];
function pin(p, color = 0xffd400) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 30, 8).translate(0, 15, 0), new THREE.MeshBasicMaterial({ color })));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(8, 1, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color })));
  g.position.set(p.x, heightAt(G.world, p.x, p.z), p.z);
  scene.add(g); pins.push(g);
  return g;
}
function clearPins() { for (const p of pins) scene.remove(p); pins.length = 0; }

function setTool(t) {
  if (G.preview && t !== 'lift') cancelPreview();
  clearPending();
  G.tool = t;
  G.liftA = null; G.liftK = []; G.kinkNext = false; G.lineStart = null; clearPins(); clearLiftPath();
  if ((G.busDraft || []).length) { G.busDraft = []; drawBusDraft(); }
  if (G.buslines) G.buslines.setShowRoutes(t === 'build' && G.buildCat === 'bus');
  if ((G.roadDraft || []).length) { G.roadDraft = []; drawRoadDraft(); }
  if (G.roadroutes) G.roadroutes.setShow(t === 'build' && (G.buildCat === 'strasse' || G.buildCat === 'bus'));
  G.activeObj = null; if (G.objMarker) G.objMarker.visible = false;
  document.querySelectorAll('#toolbar button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  const brush = t === 'piste' || t === 'trees';
  controls.mouseButtons = { LEFT: brush ? null : THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: brush ? null : THREE.TOUCH.PAN, TWO: -1 };
  G.tv.setOverlay(t === 'piste' ? (G.season === 0 ? 1 : 2) : 0);
  if (t !== 'view') closeSide();
  renderToolPanel();
}

function renderToolPanel() {
  const tp = $('toolpanel');
  const t = G.tool;
  let h = '';
  if (t === 'view' || !G.world) { tp.classList.add('hidden'); hint('Lift oder Objekt antippen zum Bearbeiten'); return; }
  tp.classList.remove('hidden');
  if (t === 'lift') {
    h += `<div class="tp-title">Liftart</div><select class="sel" id="ltSel">${LIFT_GROUPS.map((g) => `<optgroup label="${g.name}">${g.types.map((k) => `<option value="${k}" ${k === G.liftType ? 'selected' : ''}>${LIFT_TYPES[k].name}</option>`).join('')}</optgroup>`).join('')}</select>`;
    h += `<div class="opts" style="margin-top:6px">`;
    for (const [k, b] of Object.entries(BRANDS)) h += `<button class="opt ${G.brand === k ? 'on' : ''}" data-br="${k}">${b.name}</button>`;
    h += `</div>`;
    const lt = LIFT_TYPES[G.liftType];
    const cap = lt.kind === 'tram' || lt.kind === 'funicular' ? '' : ` · ca. ${Math.round(lt.seats * 3600 * lt.speed / lt.spacing).toLocaleString('de-CH')} P/h`;
    h += `<div class="small">${lt.detach ? 'Kuppelbar' : 'Fix geklemmt'} · ${lt.speed} m/s${cap} · max. ${(lt.maxLen / 1000).toFixed(lt.maxLen < 1000 ? 2 : 1)} km${G.mode === 'normal' ? ' · ab ' + fmtMoney(lt.base) : ''}</div>`;
    // station design and towers are chosen right here, before placing the lift
    if (hasStyles(lt)) {
      h += `<label class="lbl">Station</label><div class="seg" id="ltSt" style="margin:0 0 4px"><button data-v="auto" class="${(G.stStyle || 'auto') === 'auto' ? 'on' : ''}">Automatisch</button><button data-v="pick" class="${(G.stStyle || 'auto') !== 'auto' ? 'on' : ''}">Auswählen</button></div>`;
      if ((G.stStyle || 'auto') !== 'auto' || G.stPick) {
        const SS = stylesFor(lt);
        h += `<div class="stgrid">${Object.entries(SS).map(([k, st]) => `<button class="stb ${G.stStyle === k ? 'on' : ''}" data-st="${k}" title="${st.hint}"><img src="${stationThumb(k)}" alt=""><span>${st.name}</span></button>`).join('')}</div>`;
        if (SS[G.stStyle]) h += `<div class="small">${SS[G.stStyle].name}: ${SS[G.stStyle].hint}</div>`;
      }
    }
    if (!['carpet', 'funicular'].includes(lt.kind)) h += `<label class="lbl">Masten</label><div class="seg" id="ltTw" style="margin:0 0 4px"><button data-v="auto" class="${G.towerMode !== 'manual' ? 'on' : ''}">Automatisch</button><button data-v="manual" class="${G.towerMode === 'manual' ? 'on' : ''}">Selbst setzen</button></div>${G.towerMode === 'manual' ? '<div class="small">Nach dem Bauen kommst du direkt ins Masten-Menü.</div>' : ''}`;
    if (!['carpet', 'funicular'].includes(lt.kind)) h += `<label class="lbl">Stützen-Art</label>` + towerPickerHtml('ltTws', G.liftType, G.brand, buildTowerStyle(lt), lt.towerStyle === 'tram' ? 'Auto' : 'Auto (hoch = Gitter)');
    const km = kinkMax(lt), needM = lt.midSt && !(G.liftK || []).some((q) => q.k === 'm');
    if (G.liftA && km > 0) h += `<div class="btnrow" style="margin-top:6px"><button class="btn ${G.kinkNext ? 'on' : ''}" id="ltKink">↪️ ${G.kinkNext ? 'Nächster Tipp = Knick' : 'Knick setzen'}</button>${(G.liftK || []).length ? '<button class="btn" id="ltUndo">↩️ Letzten Punkt weg</button>' : ''}</div>`;
    if (km > 0) h += `<div class="small">${G.device === 'desk' ? 'Taste <b>K</b> = Knick dort, wo die Maus ist. ' : ''}Knick auf einer Umlenkstütze: höchstens ${km}°${kinkMaxBig(lt) > km ? ', mit grossem Umlenkrad bis ' + kinkMaxBig(lt) + '°' : ''}${lt.midSt ? ' · in der Mittelstation bis ' + MID_ANGLE_MAX + '°' : ''}.</div>`;
    hint(!G.liftA ? 'Tippe auf den Ort der Talstation' : G.kinkNext ? 'Tippe, wo der Knick hin soll' : needM ? 'Jetzt die Mittelstation antippen' : 'Jetzt die Bergstation antippen');
  } else if (t === 'piste') {
    if (G.season === 0) {
      h += `<div class="tp-title">Pisten malen</div><div class="opts">`;
      for (const [v, n] of [['auto', '🎨 Auto'], [1, 'Blau'], [2, 'Rot'], [3, 'Schwarz'], [4, 'Freeride'], [5, '🛷 Schlittelweg'], [6, '⛷️ Langlauf'], [0, '🧽 Radieren']]) {
        const dot = PISTE_COLORS[v] ? `<span class="dot" style="background:rgb(${PISTE_COLORS[v].join(',')})"></span>` : '';
        h += `<button class="opt ${String(G.pisteMode) === String(v) ? 'on' : ''}" data-pm="${v}">${dot}${n}</button>`;
      }
      h += `</div><div class="row"><span class="small" style="margin:0">Breite</span><input type="range" id="pSize" min="6" max="90" value="${G.pisteSize}"><span class="val" id="pSizeV">${G.pisteSize} m</span></div>`;
      h += `<label class="lbl">▬ Piste beim Malen ebnen</label><div class="seg" id="pSmooth" style="margin:0"><button data-v="1" class="${G.pisteSmooth ? 'on' : ''}">Ja</button><button data-v="0" class="${!G.pisteSmooth ? 'on' : ''}">Nein</button></div>
        <div class="small">Bei „Ja“ wird die Piste quer zum Hang gerade: keine Schräge mehr zur Seite, links und rechts gleich hoch. Das Gefälle nach unten bleibt, egal in welche Richtung du malst. Am Rand geht es weich ins Gelände über. Mehrmals drübermalen = gerader. Nicht bei Freeride und Radieren.</div>`;
      const a = G.tv.countArea('piste');
      h += `<div class="small">🔵 ${(a[1] / 1e4).toFixed(1)} ha · 🔴 ${(a[2] / 1e4).toFixed(1)} ha · ⚫ ${(a[3] / 1e4).toFixed(1)} ha · „Auto“: blau bis 25 %, rot bis 40 %, schwarz steiler. 🟡 Freeride: ${(a[4] / 1e4).toFixed(1)} ha · wird nicht präpariert, gelb-schwarze Stangen in der Mitte.<br>🟣 Schlittelweg: ${(a[5] / 1e4).toFixed(1)} ha · nur für Schlittler, schmal (6–10 m) von oben nach unten malen. 🟢 Langlauf: ${(a[6] / 1e4).toFixed(1)} ha · Loipe mit Spuren, am besten flach und als Runde.</div>
        ${nightSkiHTML('pNight')}
        <label class="lbl">🟥 Polster an Stützen, Flutlicht-Masten, Laternen &amp; Kanonen in der Piste</label>
        <div class="seg" id="padSeg" style="margin:0"><button data-v="1" class="${G.towerPads !== false ? 'on' : ''}">An</button><button data-v="0" class="${G.towerPads === false ? 'on' : ''}">Aus</button></div>
        <div class="small">Alles, was in einer Piste steht (Liftstützen, Flutlicht, Laternen, Fahnen, Schneilanzen, Kanonen-Türme), bekommt automatisch rote Prallschutz-Matten. Die Pistenstangen nicht. Bei jedem Objekt und jeder Stütze kannst du es auch selbst wählen.</div>`;
    } else {
      h += `<div class="tp-title">Wege malen (Sommer)</div><div class="opts">`;
      for (const [v, tt] of Object.entries(TRAIL_TYPES)) h += `<button class="opt ${String(G.trailMode) === v ? 'on' : ''}" data-tr="${v}"><span class="dot" style="background:rgb(${tt.color.join(',')})"></span>${tt.name}</button>`;
      h += `<button class="opt ${G.trailMode === 0 ? 'on' : ''}" data-tr="0">🧽 Radieren</button></div>`;
      h += `<div class="row"><span class="small" style="margin:0">Breite</span><input type="range" id="tSizeP" min="2" max="12" step="0.5" value="${G.trailSize}"><span class="val" id="tSizePV">${G.trailSize} m</span></div>`;
      const a = G.tv.countArea('trail');
      h += `<div class="small">Wanderwege ${((a[1] + a[2]) / Math.max(1, G.trailSize) / 1000).toFixed(1)} km · Bike-Trails ${((a[3] + a[4]) / Math.max(1, G.trailSize) / 1000).toFixed(1)} km. Biker fahren auf Bike-Trails zu den Talstationen, Wanderer laufen auf Wanderwegen.</div>`;
    }
    hint('Mit einem Finger malen · zwei Finger bewegen');
  } else if (t === 'trees') {
    h += `<div class="seg" style="margin:0 0 6px"><button id="natT" class="${G.natMode === 'trees' ? 'on' : ''}">🌲 Bäume</button><button id="natR" class="${G.natMode === 'rocks' ? 'on' : ''}">🪨 Felsen</button><button id="natH" class="${G.natMode === 'houses' ? 'on' : ''}">🏘️ Häuser</button><button id="natP" class="${G.natMode === 'paint' ? 'on' : ''}">🎨 Malen</button><button id="natG" class="${G.natMode === 'terrain' ? 'on' : ''}">⛰️ Gelände</button><button id="natW" class="${G.natMode === 'water' ? 'on' : ''}">💧 Wasser</button></div>`;
    if (G.natMode === 'water') {
      const ap = G.activePond && G.ponds.list.includes(G.activePond) ? G.activePond : null, b = ap ? G.ponds.body(ap) : null;
      h += `<div class="opts"><button class="opt ${G.waterMode !== 'remove' ? 'on' : ''}" data-wm="fill">💧 Loch füllen</button><button class="opt ${G.waterMode === 'remove' ? 'on' : ''}" data-wm="remove">🧽 Wasser weg</button></div>`;
      if (b) h += `<label class="lbl">Ausgewählter Teich</label><div class="small" style="margin:0 0 4px">Wasserspiegel ${Math.round(b.level)} m ü. M. · ${b.depth.toFixed(1)} m tief · ${Math.round(b.area).toLocaleString('de-CH')} m²<br>Überläuft ab ${Math.round(b.brim * 10) / 10} m ü. M.${ap.drop > 0 ? ` (jetzt ${ap.drop.toFixed(1)} m darunter)` : ' (randvoll)'}</div>
        <div class="row"><button class="btn" id="pondDown">⬇️ Pegel −0.5 m</button><button class="btn" id="pondUp">⬆️ Pegel +0.5 m</button></div>`;
      h += `<div class="small">Tippe in ein Loch: Das Wasser steigt bis zur tiefsten Stelle am Rand, wo es überlaufen würde, und bleibt nur im Loch. ${G.ponds.list.length} Teich${G.ponds.list.length === 1 ? '' : 'e'}. Im Winter sind sie zugefroren.</div>`;
    } else

    if (G.natMode === 'paint') {
      h += `<div class="opts">${SURF_TYPES.map(([k, n]) => `<button class="opt ${(G.surfType ?? 2) === k ? 'on' : ''}" data-sf="${k}">${n}</button>`).join('')}<button class="opt ${G.surfType === 'mark' ? 'on' : ''}" data-sfm="1">🖌️ Markierfarbe</button></div>`;
      if (G.surfType === 'mark') {
        const mw = G.markW || 0.3;
        h += `<div class="opts" style="margin-top:6px">${[['free', '✍️ Freihand'], ['line', '📏 Strich'], ['dash', '┅ Gestrichelt'], ['erase', '🧽 Wegmachen']].map(([k, n]) => `<button class="opt ${(G.markMode || 'line') === k ? 'on' : ''}" data-mm="${k}">${n}</button>`).join('')}</div>
        <div class="opts" style="margin-top:6px">${Object.entries(MARK_COLORS).map(([k, v]) => `<button class="opt ${(G.markCol || 'blau') === k ? 'on' : ''}" data-mc="${k}">${v[1]}</button>`).join('')}</div>
        <div class="row"><span class="small" style="margin:0">Breite</span><input type="range" id="mkW" min="0.05" max="3" step="0.05" value="${mw}"><span class="val" id="mkWV">${mw < 1 ? Math.round(mw * 100) + ' cm' : mw.toFixed(2) + ' m'}</span></div>
        <div class="row" style="gap:6px"><button class="btn" id="mkUndo">↶ Letzter Strich</button><button class="btn" id="mkClear">Alle löschen</button></div>
        <div class="small">Saubere Farblinien im Schnee, z. B. Renn-Linie, Startbereich, Ziellinie, Torstand. „Strich“: drücken, ziehen, loslassen = gerade Linie. Ganz nah ranzoomen für feine Linien. ${Math.round(G.marks.length())} m gemalt${G.mode === 'normal' ? ' · 1 CHF pro m' : ''}.</div>`;
      } else h += `
        <div class="row"><span class="small" style="margin:0">Pinsel</span><input type="range" id="sfSize" min="4" max="80" value="${G.surfSize || 12}"><span class="val" id="sfSizeV">${G.surfSize || 12} m</span></div>
        <div class="small">Strassen und Kieswege sind am Anfang frei. Wenn es schneit, werden sie zugeschneit, dann räumt das kleine Räumfahrzeug vom Werkhof sie wieder (Betriebszentrale → Schnee).${G.mode === 'normal' ? ' Kosten pro m²: Strasse ' + SURF_COST[2] + ' CHF, Kies ' + SURF_COST[3] + ' CHF.' : ''}</div>`;
    } else if (G.natMode === 'houses') {
      const nh = G.objects.list.filter((o) => HOUSE_TYPES.includes(o.type)).length;
      h += `<div class="opts"><button class="opt ${G.houseMode !== 'remove' ? 'on' : ''}" data-hm="add">🏠 Häuser malen</button><button class="opt ${G.houseMode === 'remove' ? 'on' : ''}" data-hm="remove">🧹 Abreissen</button></div>
        <div class="opts" style="margin-top:6px">${[['chalet', 'Chalets'], ['mix', 'Gemischt'], ['dorf', 'Dorf (alle Arten)'], ['hotel', 'Hotels']].map(([k, n]) => `<button class="opt ${(G.houseMix || 'mix') === k ? 'on' : ''}" data-hx="${k}">${n}</button>`).join('')}</div>
        <div class="row"><span class="small" style="margin:0">Pinsel</span><input type="range" id="hSize" min="20" max="160" value="${G.houseSize || 60}"><span class="val" id="hSizeV">${G.houseSize || 60} m</span></div>
        <div class="small">Male über eine Fläche: Es entstehen Häuser mit Abstand zueinander, nicht auf Pisten, Strassen, Wasser oder Liften. „Abreissen“ entfernt auch die Häuser und Ställe, die schon auf der Karte standen. ${nh} gebaute Häuser · ${G.objects.beds()} Betten${G.mode === 'normal' ? ' · Chalet ' + fmtMoney(OBJ_TYPES.chalet.cost) : ''}</div>`;
    } else if (G.natMode === 'rocks') {
      h += `<div class="opts"><button class="opt ${G.rockMode !== 'remove' ? 'on' : ''}" data-rm="add">🪨 Platzieren</button><button class="opt ${G.rockMode === 'remove' ? 'on' : ''}" data-rm="remove">🧽 Radieren</button></div>
        <div class="opts" style="margin-top:6px">${[['small', 'Kleine Steine'], ['mix', 'Gemischt'], ['big', 'Grosse Brocken']].map(([k, n]) => `<button class="opt ${(G.rockKind || 'mix') === k ? 'on' : ''}" data-rk="${k}">${n}</button>`).join('')}</div>
        <div class="row"><span class="small" style="margin:0">Pinsel</span><input type="range" id="rSize" min="4" max="120" value="${G.rockSize || 24}"><span class="val" id="rSizeV">${G.rockSize || 24} m</span></div>
        <div class="small">Felsen malen oder wegradieren, überall ausser auf Pisten, Wegen, Strassen und im Dorf. ${G.rocks.list.length.toLocaleString('de-CH')} Felsen${G.mode === 'normal' ? ' · 150 CHF pro Stein' : ''}</div>`;
    } else if (G.natMode === 'trees') {
      h += `<div class="opts"><button class="opt ${G.treeMode === 'add' ? 'on' : ''}" data-tm="add">🌲 Pflanzen</button><button class="opt ${G.treeMode === 'remove' ? 'on' : ''}" data-tm="remove">🪓 Fällen</button></div>
        <div class="row"><span class="small" style="margin:0">Pinsel</span><input type="range" id="tSize" min="8" max="140" value="${G.treeSize}"><span class="val" id="tSizeV">${G.treeSize} m</span></div>
        <div class="small">${G.trees.list.length.toLocaleString('de-CH')} Bäume</div>`;
    } else {
      h += `<div class="opts">${[['raise', '⬆️ Heben'], ['lower', '⬇️ Senken'], ['smooth', '〰️ Glätten'], ['flat', '▬ Ebnen']].map(([k, n]) => `<button class="opt ${G.terraMode === k ? 'on' : ''}" data-tf="${k}">${n}</button>`).join('')}</div>
        <div class="row"><span class="small" style="margin:0">Grösse</span><input type="range" id="tfSize" min="10" max="800" step="10" value="${G.terraSize}"><span class="val" id="tfSizeV">${G.terraSize} m</span></div>
        <div class="row"><span class="small" style="margin:0">Stärke</span><input type="range" id="tfStr" min="5" max="200" step="5" value="${G.terraStr}"><span class="val" id="tfStrV">${G.terraStr} %</span></div>
        <div class="small">„Ebnen“ macht alles so hoch wie die Stelle, wo du anfängst. Dorf, Strasse, Fluss und See bleiben geschützt.</div>`;
    }
    hint('Mit einem Finger malen · zwei Finger bewegen');
  } else if (t === 'build' && G.buildCat === 'strasse') {
    h += `<div class="opts">`;
    for (const c of OBJ_CATS) h += `<button class="opt ${G.buildCat === c.key ? 'on' : ''}" data-cat="${c.key}">${c.name}</button>`;
    h += `</div>`;
    const d = G.roadDraft || [];
    h += `<div class="tp-title" style="margin-top:8px">🛣️ Strasse mit Wegpunkten</div>
      <div class="small">Setze der Strasse entlang immer wieder einen Wegpunkt (in Kurven öfter). Autos fahren dann von Wegpunkt zu Wegpunkt hin und her – letzter Punkt = erster → Rundkurs. Busse benutzen deine Strassen auch.</div>
      <div class="seg" id="rdPaint" style="margin:6px 0"><button data-v="1" class="${G.roadPaint !== false ? 'on' : ''}">Asphalt automatisch malen</button><button data-v="0" class="${G.roadPaint === false ? 'on' : ''}">Nur Wegpunkte</button></div>
      <div class="twr"><button class="btn" id="rdN-">−</button><div class="mid">${G.roadCars ?? 3} Autos</div><button class="btn" id="rdN+">＋</button></div>
      <div class="btnrow"><button class="btn ok" id="rdDone" ${d.length < 2 ? 'disabled' : ''}>✓ Strasse fertig (${d.length} Wegpunkte)</button>${d.length ? '<button class="btn" id="rdUndo">↩️</button><button class="btn bad" id="rdCancel">✕</button>' : ''}</div>`;
    if (G.roadroutes.roads.length) {
      h += `<div class="tp-title" style="margin-top:8px">Deine Strassen</div>`;
      G.roadroutes.roads.forEach((r, i) => { h += `<div class="twr"><div class="mid">Strasse ${i + 1}: ${(r.len / 1000).toFixed(2)} km${r.loop ? ' (Rundkurs)' : ''}</div><button class="btn" data-rdm="${i}">−</button><b>${r.nCars}🚗</b><button class="btn" data-rdp="${i}">＋</button><button class="btn bad" data-rddel="${i}">🗑️</button></div>`; });
    }
    hint('Wegpunkte entlang der Strasse antippen');
  } else if (t === 'build' && G.buildCat === 'bus') {
    h += `<div class="opts">`;
    for (const c of OBJ_CATS) h += `<button class="opt ${G.buildCat === c.key ? 'on' : ''}" data-cat="${c.key}">${c.name}</button>`;
    h += `</div>`;
    const d = G.busDraft || [];
    h += `<div class="tp-title" style="margin-top:8px">🚌 Neue Buslinie</div>
      <div class="small">Tippe die Haltestellen der Reihe nach an. Nahe der Hauptstrasse fährt der Bus der Strasse entlang, sonst gerade (z.B. auf deinen gemalten Strassen). Letzte Haltestelle = erste → Rundkurs.${G.mode === 'normal' ? ' Kosten: ' + fmtMoney(120000) + ' + ' + fmtMoney(60000) + ' pro Bus, Betrieb 250 CHF pro Bus und Tag.' : ''}</div>
      <div class="seg" id="busPt" style="margin:6px 0"><button data-v="stop" class="${G.busPt !== 'way' ? 'on' : ''}">🚏 Haltestelle</button><button data-v="way" class="${G.busPt === 'way' ? 'on' : ''}">📍 Wegpunkt (nur Bus)</button></div>
      <div class="twr"><button class="btn" id="busN-">−</button><div class="mid">${G.busN || 1} Bus${(G.busN || 1) > 1 ? 'se' : ''}</div><button class="btn" id="busN+">＋</button></div>
      <div class="btnrow"><button class="btn ok" id="busDone" ${d.length < 2 ? 'disabled' : ''}>✓ Linie fertig (${d.filter((q) => q.stop !== false).length} Haltestellen${d.some((q) => q.stop === false) ? ', ' + d.filter((q) => q.stop === false).length + ' Wegpunkte' : ''})</button>${d.length ? '<button class="btn" id="busUndo">↩️</button><button class="btn bad" id="busCancel">✕</button>' : ''}</div>`;
    if (G.buslines.lines.length) {
      h += `<div class="tp-title" style="margin-top:8px">Bestehende Linien</div>`;
      G.buslines.lines.forEach((l, i) => { h += `<div class="twr"><span class="dot" style="background:#${l.color.toString(16).padStart(6, '0')}"></span><div class="mid">Linie ${i + 1}: ${l.stops.length} Haltestellen · ${(l.len / 1000).toFixed(1)} km</div><button class="btn" data-busm="${i}">−</button><b>${l.nBus}</b><button class="btn" data-busp="${i}">＋</button><button class="btn bad" data-busdel="${i}">🗑️</button></div>`; });
    }
    hint('Haltestellen antippen');
  } else if (t === 'build') {
    h += `<div class="opts">`;
    for (const c of OBJ_CATS) h += `<button class="opt ${G.buildCat === c.key ? 'on' : ''}" data-cat="${c.key}">${c.name}</button>`;
    h += `</div><div class="opts" style="margin-top:6px">`;
    const cat = OBJ_CATS.find((c) => c.key === G.buildCat);
    for (const k of cat.types) {
      const o = OBJ_TYPES[k];
      const off = o.season === 'winter' && G.season === 1 || o.season === 'summer' && G.season === 0;
      h += `<button class="opt ${!G.buildRemove && G.buildType === k ? 'on' : ''} ${off ? 'dim' : ''}" data-ot="${k}">${o.name}</button>`;
    }
    h += `<button class="opt ${G.buildRemove ? 'on' : ''}" data-ot="__remove">🗑️ Abreissen</button></div>`;
    const ot = OBJ_TYPES[G.buildType];
    const ao = G.activeObj && G.objects.list.includes(G.activeObj) ? G.activeObj : null;
    if (!ao) G.activeObj = null;
    if (ao) {
      const deg = Math.round(((ao.yaw * 180 / Math.PI) % 360 + 540) % 360 - 180);
      h += `<div class="warn" style="background:rgba(58,142,230,0.18);border-color:rgba(58,142,230,0.6);color:#cfe6ff">✏️ <b>${OBJ_TYPES[ao.type].name}</b> ist gebaut. Du kannst es jetzt drehen, oder auf die Karte tippen, um es zu verschieben.</div>
        <div class="row" style="margin-top:6px"><button class="btn" style="flex:0 0 44px;min-width:44px" id="aoL">↺</button><input type="range" id="aoYaw" min="-180" max="180" step="5" value="${deg}"><button class="btn" style="flex:0 0 44px;min-width:44px" id="aoR">↻</button><span class="val" id="aoYawV">${deg}°</span></div>
        ${Objects.sizable(ao) ? `<div class="row" style="margin-top:6px"><span class="small" style="margin:0;min-width:44px">Grösse</span><input type="range" id="aoSize" min="30" max="300" step="5" value="${Math.round((ao.size || 1) * 100)}"><span class="val" id="aoSizeV">${Math.round((ao.size || 1) * 100)} %</span></div>` : ''}
        ${ao.type === 'flutlicht' || ao.type === 'laterne' ? `<label class="lbl">Lichtfarbe: <b>${LIGHT_COLORS[ao.lc || 0][0]}</b></label><div class="row" style="flex-wrap:wrap;gap:6px">${LIGHT_COLORS.map(([n, c], i) => `<button class="btn" data-lc="${i}" title="${n}" style="flex:0 0 34px;min-width:34px;height:34px;padding:0;border-radius:50%;background:#${c.toString(16).padStart(6, '0')};${(ao.lc || 0) === i ? 'outline:3px solid #fff;' : ''}"></button>`).join('')}</div>` : ''}
        ${AD_TYPES.includes(ao.type) ? `<label class="lbl">Werbung: <b>${adLabel(ao.ad !== undefined ? ao.ad : ao.id % AD_SLOTS)}</b></label><div class="row"><button class="btn" id="adPrev" style="flex:0 0 54px;min-width:54px">◀</button><button class="btn" id="adNext" style="flex:0 0 54px;min-width:54px">▶</button></div>` : ''}
        <div class="btnrow"><button class="btn ok" id="aoNew">＋ Neues bauen</button><button class="btn" id="aoCopy">⧉ Kopieren (Tab)</button><button class="btn bad" id="aoDel">🗑️ Weg damit</button></div>
        <div class="small">Tipp: <b>Tab</b> drücken = dieses Objekt fertig bauen und eine Kopie davon nehmen. Dann tippen, wo die Kopie hin soll, und wieder Tab.</div>`;
    }
    if (G.buildCat === 'werbung') {
      const st = adsState(), imgs = adImages();
      h += `<label class="lbl">Was soll auf der Werbung sein?</label><div class="seg" id="adMode" style="margin:0"><button data-v="brands" class="${st.mode === 'brands' ? 'on' : ''}">Erfundene Marken</button><button data-v="imgs" class="${st.mode === 'imgs' ? 'on' : ''}">Meine Bilder</button><button data-v="mix" class="${st.mode === 'mix' ? 'on' : ''}">Gemischt</button></div>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">${imgs.map((m, k) => `<div style="position:relative;width:64px;height:40px;border-radius:6px;overflow:hidden;background:#333"><canvas data-adth="${k}" width="64" height="40" style="width:100%;height:100%"></canvas><button class="btn bad" data-adrm="${k}" style="position:absolute;top:0;right:0;min-width:20px;width:20px;height:20px;padding:0;font-size:12px;line-height:20px">×</button></div>`).join('')}
        ${imgs.length < MAX_AD_IMGS ? `<label class="btn" style="flex:0 0 auto;cursor:pointer">＋ Bild hochladen<input type="file" id="adFile" accept="image/*" multiple style="display:none"></label>` : ''}</div>
        <div class="small">Lade eigene Bilder hoch (Logo, Foto, Plakat), bis zu ${MAX_AD_IMGS} Stück. Sie erscheinen auf Plakaten, Flaggen, Banden und Netzen. Bei einem gebauten Objekt wählst du mit ◀ ▶, welche Werbung drauf ist.</div>`;
    }
    if (G.buildCat === 'schnee') h += `<div class="opts" style="margin-top:4px"><button class="opt ${G.snowMode !== 'off' ? 'on' : ''}" id="snowToggle">Beschneiung: ${{ off: '⏸ Aus', auto: '🤖 Automatisch', on: '❄️ Immer an' }[G.snowMode || 'auto']}</button><button class="opt" id="snowCenter">🏢 Betriebszentrale</button></div>`;
    let info = '';
    if (G.buildRemove) info = 'Tippe auf ein Objekt, um es abzureissen.';
    else if (ot.line) info = G.lineStart ? 'Tippe den nächsten Punkt. „Fertig“ beendet die Reihe.' : 'Tippe den Startpunkt der Reihe.';
    else if (ot.season === 'winter' && G.season === 1) info = 'Das ist ein Winter-Objekt. Es ist erst im Winter sichtbar.';
    else if (ot.season === 'summer' && G.season === 0) info = 'Das ist ein Sommer-Objekt. Es ist erst im Sommer sichtbar.';
    else if (G.activeObj) info = 'Erst „＋ Neues bauen“ drücken, dann baust du ein weiteres.';
    else info = 'Tippe auf die Karte, um es zu bauen. Danach kannst du es drehen und verschieben.';
    h += `<div class="small">${ot.desc && !G.buildRemove ? '<b>' + ot.desc + '</b> ' : ''}${info}${G.mode === 'normal' && !G.buildRemove ? ' · ' + fmtMoney(ot.cost) + (ot.line ? ' pro m' : '') + (ot.daily ? ' + ' + fmtMoney(ot.daily) + '/Tag' : '') : ''}</div>`;
    if (ot.line && G.lineStart) h += `<div class="btnrow"><button class="btn ok" id="lineDone">✓ Fertig (Leertaste)</button></div>`;
    hint(G.buildRemove ? 'Objekt antippen zum Abreissen' : ot.line ? 'Punkt für Punkt antippen' : 'Tippe auf die Karte zum Bauen');
  } else if (t === 'play') {
    h += `<div class="tp-title">Selbst spielen</div><div class="opts wrap">`;
    for (const [k, m] of Object.entries(PLAY_MODES)) {
      const off = m.season !== undefined && m.season !== G.season;
      h += `<button class="opt ${G.playMode === k ? 'on' : ''} ${off ? 'dim' : ''}" data-pl="${k}">${m.icon} ${m.name}</button>`;
    }
    h += `</div>`;
    if (G.playMode === 'bully') h += `<label class="lbl">Farbe</label><div class="opts">${Object.entries(BULLY_COLORS).map(([k, c]) => `<button class="sw ${(G.playBullyColor || 'blau') === k ? 'on' : ''}" data-bc="${k}" title="${c.name}" style="background:#${c.hex.toString(16).padStart(6, '0')}"></button>`).join('')}</div>`;
    if (G.playMode === 'bully') { const bs = bullySpeeds(); h += `<label class="lbl">Höchsttempo mit Fräse oben</label><div class="row"><input type="range" id="pbFree" min="15" max="60" step="1" value="${bs.free}"><span class="val" id="pbFreeV">${bs.free} km/h</span></div><label class="lbl">Höchsttempo mit Fräse unten</label><div class="row"><input type="range" id="pbTill" min="10" max="45" step="1" value="${bs.tiller}"><span class="val" id="pbTillV">${bs.tiller} km/h</span></div>`; }
    if (G.playMode === 'bully') h += `<label class="lbl">Modell</label><div class="seg" id="bullySeg" style="margin:0">${Object.entries(BULLY_MODELS).map(([k, m]) => `<button data-v="${k}" class="${String(G.bullyModel || 400) === k ? 'on' : ''}">${k}</button>`).join('')}</div><div class="small">${BULLY_MODELS[G.bullyModel || 400].name}: ${BULLY_MODELS[G.bullyModel || 400].desc}</div>`;
    h += `<div class="small">Du startest in der Bildmitte. ${G.season === 0 ? 'Skifahren geht im Winter, Mountainbike im Sommer.' : 'Mountainbike geht im Sommer, Skifahren im Winter.'} Bei Talstationen kannst du Lift fahren.</div>
      <div class="btnrow"><button class="btn ok" id="playGo">▶ Los geht's</button></div>`;
    hint('Wähle, was du machen willst');
  }
  const titles = { lift: '🚡 Lift bauen', piste: G.season === 0 ? '⛷️ Pisten malen' : '🥾 Wege malen', trees: '🌲 Natur', build: '🏗️ Bauen', play: '🎮 Spielen' };
  tp.innerHTML = h;
  decorate(tp, 'tool:' + t, titles[t] || '');
  tp.querySelectorAll('[data-lt]').forEach((b) => b.onclick = () => { G.liftType = b.dataset.lt; const def = LIFT_TYPES[G.liftType].brand; if (def) G.brand = def; renderToolPanel(); });
  tp.querySelectorAll('[data-br]').forEach((b) => b.onclick = () => { G.brand = b.dataset.br; renderToolPanel(); });
  if ($('bullySeg')) segInit('bullySeg', (v) => { G.bullyModel = +v; renderToolPanel(); });
  { const f = $('pbFree'), t2 = $('pbTill'); if (f && t2) { const sv = () => { setBullySpeeds({ free: +f.value, tiller: +t2.value }); $('pbFreeV').textContent = f.value + ' km/h'; $('pbTillV').textContent = t2.value + ' km/h'; setupMoreSettings(); }; f.oninput = sv; t2.oninput = sv; } }
  tp.querySelectorAll('[data-bc]').forEach((b) => b.onclick = () => { G.playBullyColor = b.dataset.bc; renderToolPanel(); saveSoon(); });
  tp.querySelectorAll('[data-pm]').forEach((b) => b.onclick = () => { const v = b.dataset.pm; G.pisteMode = v === 'auto' ? 'auto' : +v; renderToolPanel(); });
  tp.querySelectorAll('[data-tr]').forEach((b) => b.onclick = () => { G.trailMode = +b.dataset.tr; renderToolPanel(); });
  tp.querySelectorAll('[data-tm]').forEach((b) => b.onclick = () => { G.treeMode = b.dataset.tm; renderToolPanel(); });
  tp.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { G.activeObj = null; if (G.objMarker) G.objMarker.visible = false; G.buildCat = b.dataset.cat; G.buildRemove = false; G.lineStart = null; clearPins(); G.buildType = OBJ_CATS.find((c) => c.key === G.buildCat).types[0] || G.buildType; if (G.buildCat !== 'bus' && (G.busDraft || []).length) { G.busDraft = []; drawBusDraft(); } if (G.buildCat !== 'strasse' && (G.roadDraft || []).length) { G.roadDraft = []; drawRoadDraft(); } renderToolPanel(); });
  tp.querySelectorAll('[data-ot]').forEach((b) => b.onclick = () => { G.activeObj = null; if (G.objMarker) G.objMarker.visible = false; if (b.dataset.ot === '__remove') G.buildRemove = true; else { G.buildRemove = false; G.buildType = b.dataset.ot; } G.lineStart = null; clearPins(); renderToolPanel(); });
  tp.querySelectorAll('[data-pl]').forEach((b) => b.onclick = () => { G.playMode = b.dataset.pl; renderToolPanel(); });
  const bind = (id, fn) => { const e = $(id); if (e) fn(e); };
  bind('pSize', (e) => e.oninput = () => { G.pisteSize = +e.value; $('pSizeV').textContent = G.pisteSize + ' m'; });
  if ($('pSmooth')) segInit('pSmooth', (v) => { G.pisteSmooth = v === '1'; try { localStorage.setItem('bb-psmooth', G.pisteSmooth ? '1' : '0'); } catch (e) { /* ignore */ } });
  bind('tSizeP', (e) => e.oninput = () => { G.trailSize = +e.value; $('tSizePV').textContent = G.trailSize + ' m'; });
  bind('tSize', (e) => e.oninput = () => { G.treeSize = +e.value; $('tSizeV').textContent = G.treeSize + ' m'; });
  bind('tfSize', (e) => e.oninput = () => { G.terraSize = +e.value; $('tfSizeV').textContent = G.terraSize + ' m'; });
  bind('tfStr', (e) => e.oninput = () => { G.terraStr = +e.value; $('tfStrV').textContent = G.terraStr + ' %'; });
  bind('natT', (e) => e.onclick = () => { G.natMode = 'trees'; renderToolPanel(); });
  bind('natW', (e) => e.onclick = () => { G.natMode = 'water'; renderToolPanel(); });
  tp.querySelectorAll('[data-wm]').forEach((b) => b.onclick = () => { G.waterMode = b.dataset.wm; renderToolPanel(); });
  bind('pondDown', (e) => e.onclick = () => { const p = G.activePond; if (!p) return; G.ponds.setDrop(p, (p.drop || 0) + 0.5); renderToolPanel(); saveSoon(); });
  bind('pondUp', (e) => e.onclick = () => { const p = G.activePond; if (!p) return; G.ponds.setDrop(p, (p.drop || 0) - 0.5); renderToolPanel(); saveSoon(); });
  bind('natG', (e) => e.onclick = () => { G.natMode = 'terrain'; renderToolPanel(); });
  if ($('pNight')) segInit('pNight', (v) => { G.nightSkiMode = v; saveSoon(); renderToolPanel(); });
  if ($('padSeg')) segInit('padSeg', (v) => { G.towerPads = v === '1'; Lift.padsOn = Objects.padsOn = G.towerPads; refreshPads(); saveSoon(); });
  bind('natH', (e) => e.onclick = () => { G.natMode = 'houses'; renderToolPanel(); });
  if ($('ltSt')) segInit('ltSt', (v) => { if (v === 'auto') { G.stStyle = 'auto'; G.stPick = false; } else { G.stPick = true; const SS = stylesFor(LIFT_TYPES[G.liftType]); if (!SS[G.stStyle]) G.stStyle = Object.keys(SS)[0]; } renderToolPanel(); });
  tp.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { G.stStyle = b.dataset.st; renderToolPanel(); });
  if ($('ltTw')) segInit('ltTw', (v) => { G.towerMode = v; renderToolPanel(); });
  bindTowerPicker(tp, 'ltTws', (v) => { const lt2 = LIFT_TYPES[G.liftType]; const d = { ...(G.liftDef.tws || {}) }; d[lt2.towerStyle === 'tram' ? 'tram' : 'norm'] = v; rememberLift('tws', d); renderToolPanel(); }, renderToolPanel);
  if ($('rdPaint')) segInit('rdPaint', (v) => { G.roadPaint = v === '1'; renderToolPanel(); });
  bind('rdN-', (e) => e.onclick = () => { G.roadCars = Math.max(0, (G.roadCars ?? 3) - 1); renderToolPanel(); });
  bind('rdN+', (e) => e.onclick = () => { G.roadCars = Math.min(12, (G.roadCars ?? 3) + 1); renderToolPanel(); });
  bind('rdUndo', (e) => e.onclick = () => { G.roadDraft.pop(); drawRoadDraft(); renderToolPanel(); });
  bind('rdCancel', (e) => e.onclick = () => { G.roadDraft = []; drawRoadDraft(); renderToolPanel(); });
  bind('rdDone', (e) => e.onclick = () => {
    const d = G.roadDraft || []; if (d.length < 2) return;
    if (G.roadPaint !== false) {
      let n = 0;
      for (let i = 0; i < d.length - 1; i++) { const a = d[i], b = d[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); for (let u = 0; u <= L; u += 2.5) { const x = a.x + (b.x - a.x) * u / L, z = a.z + (b.z - a.z) * u / L; n += G.tv.paintSurf(x, z, 4.2, 2); G.trees.removeCircle(x, z, 6); if (G.rocks) G.rocks.removeCircle(x, z, 5); } }
      if (G.mode === 'normal') pay(n * SURF_PX_AREA * SURF_COST[2]);
    }
    G.roadroutes.add(d, G.roadCars ?? 3); G.buslines.rebuildAll();
    G.roadDraft = []; drawRoadDraft(); toast('🛣️ Strasse fertig – die Autos fahren los'); renderToolPanel(); saveSoon();
  });
  tp.querySelectorAll('[data-rdm]').forEach((b) => b.onclick = () => { const r = G.roadroutes.roads[+b.dataset.rdm]; G.roadroutes.setCars(r, r.nCars - 1); renderToolPanel(); saveSoon(); });
  tp.querySelectorAll('[data-rdp]').forEach((b) => b.onclick = () => { const r = G.roadroutes.roads[+b.dataset.rdp]; G.roadroutes.setCars(r, r.nCars + 1); renderToolPanel(); saveSoon(); });
  tp.querySelectorAll('[data-rddel]').forEach((b) => b.onclick = () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sicher?'; return; } G.roadroutes.remove(G.roadroutes.roads[+b.dataset.rddel]); G.buslines.rebuildAll(); renderToolPanel(); saveSoon(); });
  G.roadroutes.setShow(G.tool === 'build' && (G.buildCat === 'strasse' || G.buildCat === 'bus'));
  if ($('busPt')) segInit('busPt', (v) => { G.busPt = v; renderToolPanel(); });
  bind('busN-', (e) => e.onclick = () => { G.busN = Math.max(1, (G.busN || 1) - 1); renderToolPanel(); });
  bind('busN+', (e) => e.onclick = () => { G.busN = Math.min(6, (G.busN || 1) + 1); renderToolPanel(); });
  bind('busUndo', (e) => e.onclick = () => { G.busDraft.pop(); drawBusDraft(); renderToolPanel(); });
  bind('busCancel', (e) => e.onclick = () => { G.busDraft = []; drawBusDraft(); renderToolPanel(); });
  bind('busDone', (e) => e.onclick = () => {
    const d = G.busDraft || []; if (d.length < 2) return;
    const cost = 120000 + 60000 * (G.busN || 1);
    if (!canPay(cost)) { toast('Zu wenig Geld für die Buslinie'); return; }
    pay(cost); G.buslines.add(d, G.busN || 1); G.busDraft = []; drawBusDraft(); toast('🚌 Buslinie eröffnet!'); renderToolPanel(); saveSoon();
  });
  tp.querySelectorAll('[data-busm]').forEach((b) => b.onclick = () => { const l = G.buslines.lines[+b.dataset.busm]; G.buslines.setBuses(l, l.nBus - 1); renderToolPanel(); saveSoon(); });
  tp.querySelectorAll('[data-busp]').forEach((b) => b.onclick = () => { const l = G.buslines.lines[+b.dataset.busp]; if (!canPay(60000)) { toast('Zu wenig Geld'); return; } pay(60000); G.buslines.setBuses(l, l.nBus + 1); renderToolPanel(); saveSoon(); });
  tp.querySelectorAll('[data-busdel]').forEach((b) => b.onclick = () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sicher?'; return; } G.buslines.remove(G.buslines.lines[+b.dataset.busdel]); renderToolPanel(); saveSoon(); });
  G.buslines.setShowRoutes(G.tool === 'build' && G.buildCat === 'bus');
  bind('ltKink', (e) => e.onclick = () => { G.kinkNext = !G.kinkNext; renderToolPanel(); });
  bind('ltUndo', (e) => e.onclick = () => undoLiftVertex());
  bind('natR', (e) => e.onclick = () => { G.natMode = 'rocks'; renderToolPanel(); });
  bind('rSize', (e) => e.oninput = () => { G.rockSize = +e.value; $('rSizeV').textContent = G.rockSize + ' m'; });
  tp.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { G.rockMode = b.dataset.rm; renderToolPanel(); });
  tp.querySelectorAll('[data-rk]').forEach((b) => b.onclick = () => { G.rockKind = b.dataset.rk; renderToolPanel(); });
  bind('natP', (e) => e.onclick = () => { G.natMode = 'paint'; renderToolPanel(); });
  bind('sfSize', (e) => e.oninput = () => { G.surfSize = +e.value; $('sfSizeV').textContent = G.surfSize + ' m'; });
  tp.querySelectorAll('[data-sf]').forEach((b) => b.onclick = () => { G.surfType = +b.dataset.sf; controls.minDistance = 8; renderToolPanel(); });
  tp.querySelectorAll('[data-sfm]').forEach((b) => b.onclick = () => { G.surfType = 'mark'; controls.minDistance = 2.5; renderToolPanel(); });
  tp.querySelectorAll('[data-mm]').forEach((b) => b.onclick = () => { G.markMode = b.dataset.mm; renderToolPanel(); });
  tp.querySelectorAll('[data-mc]').forEach((b) => b.onclick = () => { G.markCol = b.dataset.mc; renderToolPanel(); });
  bind('mkW', (e) => e.oninput = () => { G.markW = +e.value; $('mkWV').textContent = G.markW < 1 ? Math.round(G.markW * 100) + ' cm' : G.markW.toFixed(2) + ' m'; });
  bind('mkUndo', (e) => e.onclick = () => { if (G.marks.undo()) { saveSoon(); renderToolPanel(); } });
  bind('mkClear', (e) => e.onclick = () => { if (!G.marks.strokes.length) return; if (e.dataset.sure !== '1') { e.dataset.sure = '1'; e.textContent = 'Wirklich alle löschen?'; return; } G.marks.clear(); saveSoon(); renderToolPanel(); });
  bind('hSize', (e) => e.oninput = () => { G.houseSize = +e.value; $('hSizeV').textContent = G.houseSize + ' m'; });
  tp.querySelectorAll('[data-hm]').forEach((b) => b.onclick = () => { G.houseMode = b.dataset.hm; renderToolPanel(); });
  tp.querySelectorAll('[data-hx]').forEach((b) => b.onclick = () => { G.houseMix = b.dataset.hx; renderToolPanel(); });
  tp.querySelectorAll('[data-tf]').forEach((b) => b.onclick = () => { G.terraMode = b.dataset.tf; renderToolPanel(); });
  const ao = G.activeObj;
  if (ao) {
    const setYaw = (d) => { G.objects.rotate(ao, d * Math.PI / 180); placeObjMarker(ao); if (!['bruecke', 'steinbruecke', 'steg'].includes(ao.type)) G.lastYaw = ao.yaw; };
    bind('aoYaw', (e) => { e.oninput = () => { $('aoYawV').textContent = e.value + '°'; setYaw(+e.value); }; e.onchange = () => saveSoon(); });
    bind('aoL', (e) => e.onclick = () => { setYaw(+$('aoYaw').value - 15); renderToolPanel(); saveSoon(); });
    bind('aoSize', (e) => { e.oninput = () => { $('aoSizeV').textContent = e.value + ' %'; }; e.onchange = () => { G.objects.resize(ao, e.value / 100); G.lastSize = ao.size; placeObjMarker(ao); renderToolPanel(); saveSoon(); }; });
    bind('aoR', (e) => e.onclick = () => { setYaw(+$('aoYaw').value + 15); renderToolPanel(); saveSoon(); });
    bind('aoNew', (e) => e.onclick = () => { G.activeObj = null; if (G.objMarker) G.objMarker.visible = false; renderToolPanel(); });
    bind('aoCopy', (e) => e.onclick = () => copyActiveObj());
    tp.querySelectorAll('[data-lc]').forEach((b) => b.onclick = () => { G.objects.setLightColor(ao, +b.dataset.lc); G.lastLc = ao.lc; placeObjMarker(ao); renderToolPanel(); saveSoon(); });
    bind('aoDel', (e) => e.onclick = () => { if (G.mode === 'normal') { G.money += OBJ_TYPES[ao.type].cost; updateHUD(); } G.objects.remove(ao); G.activeObj = null; if (G.objMarker) G.objMarker.visible = false; renderToolPanel(); saveSoon(); });
  }
  tp.querySelectorAll('[data-adth]').forEach((c) => { const m = adImages()[+c.dataset.adth]; const x = c.getContext('2d'); x.fillStyle = '#444'; x.fillRect(0, 0, 64, 40); if (m && m.src) { const r = Math.max(64 / m.src.width, 40 / m.src.height); x.drawImage(m.src, (64 - m.src.width * r) / 2, (40 - m.src.height * r) / 2, m.src.width * r, m.src.height * r); } });
  if ($('adMode')) segInit('adMode', (v) => { setAdMode(v); renderToolPanel(); saveSoon(); });
  bind('adFile', (e) => e.onchange = async () => { const n = await addAdFiles([...e.files]); toast(n ? `${n} Bild${n > 1 ? 'er' : ''} hinzugefügt 🖼️` : 'Das Bild konnte nicht gelesen werden'); renderToolPanel(); saveSoon(); });
  tp.querySelectorAll('[data-adrm]').forEach((b) => b.onclick = () => { removeAdImage(+b.dataset.adrm); renderToolPanel(); saveSoon(); });
  { const ao2 = G.activeObj; if (ao2 && AD_TYPES.includes(ao2.type)) { const cur = ao2.ad !== undefined ? ao2.ad : ao2.id % AD_SLOTS; bind('adPrev', (e) => e.onclick = () => { G.objects.setAd(ao2, cur - 1); placeObjMarker(ao2); renderToolPanel(); saveSoon(); }); bind('adNext', (e) => e.onclick = () => { G.objects.setAd(ao2, cur + 1); placeObjMarker(ao2); renderToolPanel(); saveSoon(); }); } }
  bind('snowToggle', (e) => e.onclick = () => { G.snowMode = { off: 'auto', auto: 'on', on: 'off' }[G.snowMode || 'auto']; renderToolPanel(); saveSoon(); });
  bind('snowCenter', (e) => e.onclick = () => { G.mgTab = 'snow'; openMgmt(); });
  bind('lineDone', (e) => e.onclick = () => { G.lineStart = null; clearPins(); renderToolPanel(); });
  bind('playGo', (e) => e.onclick = () => startPlay());
  bind('ltSel', (e) => e.onchange = () => { G.liftType = e.value; if (G.liftK && G.liftK.length) { G.liftK = []; G.kinkNext = false; clearLiftPath(); clearPins(); if (G.liftA) pin(G.liftA); } const def = LIFT_TYPES[G.liftType].brand; if (def) G.brand = def; renderToolPanel(); });
}

// ---------------- collapsible panels ----------------
G.collapse = {};
function decorate(panel, key, title, closeFn) {
  const col = !!G.collapse[key];
  const head = document.createElement('div');
  head.className = 'phead';
  head.innerHTML = `<b>${title}</b><span><button class="cbtn">${col ? '▴ Aufklappen' : '▾ Einklappen'}</button>${closeFn ? '<button class="cbtn">✕</button>' : ''}</span>`;
  panel.prepend(head);
  panel.classList.toggle('collapsed', col);
  const [bt, bx] = head.querySelectorAll('button');
  bt.onclick = () => {
    G.collapse[key] = !G.collapse[key];
    panel.classList.toggle('collapsed', G.collapse[key]);
    bt.textContent = G.collapse[key] ? '▴ Aufklappen' : '▾ Einklappen';
  };
  if (bx) bx.onclick = closeFn;
}

// ---------------- side panel (lift / object) ----------------
function closeSide() {
  $('sidepanel').classList.add('hidden'); $('sidepanel').classList.remove('compact'); G.liftCompact = false;
  if (G.selected) G.selected.highlightTower(-1);
  G.selected = null; G.selTower = -1; G.selObj = null;
  if (G.objMarker) G.objMarker.visible = false;
  if (G.tool === 'view' || G.tool === 'build') renderToolPanel();
}

function liftStatsHTML(l) {
  const cc = l.checkClearance();
  const t = l.type;
  const unit = t.kind === 'gondola' ? 'Gondeln' : t.kind === 'tram' || t.kind === 'funicular' ? 'Kabinen' : t.kind === 'tbar' ? 'Bügel' : t.kind === 'platter' ? 'Teller' : t.kind === 'carpet' ? 'Plätze' : 'Sessel';
  let h = `<div class="stats">
    <div><span>Länge</span><b>${fmtM(l.slopeLength)}</b></div>
    <div><span>Höhenunterschied</span><b>${fmtM(l.gB - l.gA)}</b></div>
    <div><span>Stützen</span><b>${l.towers.length}</b></div>
    <div><span>Fahrzeit</span><b>${Math.floor(l.rideTime / 60)}:${String(Math.round(l.rideTime % 60)).padStart(2, '0')} min</b></div>
    <div><span>Förderleistung</span><b>${l.capacity.toLocaleString('de-CH')} P/h</b></div>
    <div><span>${unit}</span><b>${l.nCarriers || 2}</b></div>
  </div>`;
  if (l.towerModes && l.towerModes.length) {
    const c = { support: 0, comp: 0, both: 0 }; l.towerModes.forEach((m) => { c[m]++; });
    h += `<div class="small" style="margin-top:0">Rollen: ${c.support} × Seil oben drüber · ${c.comp} × Seil unten durch · ${c.both} × Seil dazwischen</div>`;
  }
  if (cc.station) h += `<div class="warn">⚠️ Eine Station steht in einem Haus. Verschieb die Station ein Stück.</div>`;
  else if (!cc.ok) h += `<div class="warn">⚠️ ${cc.tooSteep ? `Zu steil für einen Zauberteppich (${Math.round(cc.grade * 100)} %, max. ${Math.round(t.maxGrade * 100)} %).` : cc.tooHigh ? 'Das Seil hängt zu hoch über dem Boden (die Bügel erreichen den Boden nicht).' : 'Das Seil ist an einer Stelle zu nah am Boden (' + cc.worst.toFixed(1) + ' m). Mach eine Stütze höher oder füge eine hinzu.'}</div>`;
  return h;
}

function showPreviewPanel() {
  const l = G.preview;
  const p = $('sidepanel');
  p.classList.remove('hidden');
  $('toolpanel').classList.add('hidden');
  const afford = canPay(l.cost);
  p.innerHTML = `<button class="close" id="lpX">✕</button>
    <h2>${l.type.name}</h2><div class="brand">${l.brand.name} · Vorschau</div>
    ${liftStatsHTML(l)}
    ${G.mode === 'normal' ? `<div class="small">Kosten: <b style="color:${afford ? '#7ee2a8' : '#ff8a80'}">${fmtMoney(l.cost)}</b> · Betrieb ${fmtMoney(l.dailyCost)}/Tag</div>` : ''}
    <div class="btnrow"><button class="btn bad" id="lpCancel">✕ Abbrechen</button><button class="btn ok" id="lpBuild">✓ Bauen</button></div>`;
  $('lpX').onclick = cancelPreview; $('lpCancel').onclick = cancelPreview;
  decorate(p, 'side', '🚡 Vorschau: ' + l.type.name, cancelPreview);
  $('lpBuild').onclick = () => {
    if (!canPay(l.cost)) { toast('Zu wenig Geld für diesen Lift 💸'); return; }
    pay(l.cost);
    G.lifts.push(l); G.preview = null; G.sound.place();
    clearCorridor(l);
    $('sidepanel').classList.add('hidden');
    toast(`${l.type.name} gebaut! 🎉 Tippe ihn in der Ansicht an, um ihn zu bearbeiten.`, 3500);
    scheduleNetwork();
    renderToolPanel();
    saveSoon();
    // towers "Selbst setzen": straight into the tower menu (the automatic towers are the starting point)
    if (G.towerMode === 'manual' && !['carpet', 'funicular'].includes(l.type.kind)) {
      l.autoTowers = false; setTool('view'); selectLift(l, l.towers.length ? 0 : -1); G.liftCompact = true;
      setPending({ kind: 'addTower', lift: l, repeat: true }, 'Tippe auf die Liftlinie: jede Berührung setzt eine Stütze. „Fertig“ wenn alle stehen.');
      $('pendingCancel').textContent = 'Fertig';
      toast('Jetzt die Masten setzen 🏗️', 3000);
    }
  };
}
function cancelPreview() { if (G.preview) { G.preview.dispose(); G.preview = null; } $('sidepanel').classList.add('hidden'); if (G.tool === 'lift') renderToolPanel(); }
// groomer top speeds (km/h) from the settings menu ("Weiteres")
function bullySpeeds() { try { const v = JSON.parse(localStorage.getItem('bb-bullyspeed') || 'null'); if (v && v.free && v.tiller) return v; } catch (e) { /* ignore */ } return { free: 40, tiller: 30 }; }
function setBullySpeeds(v) { try { localStorage.setItem('bb-bullyspeed', JSON.stringify(v)); } catch (e) { /* ignore */ } }
function setupMoreSettings() {
  const sp = bullySpeeds(), f = $('bsFree'), t = $('bsTill');
  if (!f || !t) return;
  f.value = sp.free; t.value = sp.tiller; $('bsFreeV').textContent = sp.free + ' km/h'; $('bsTillV').textContent = sp.tiller + ' km/h';
  const save = () => { try { localStorage.setItem('bb-bullyspeed', JSON.stringify({ free: +f.value, tiller: +t.value })); } catch (e) { /* ignore */ } };
  f.oninput = () => { $('bsFreeV').textContent = f.value + ' km/h'; save(); };
  t.oninput = () => { $('bsTillV').textContent = t.value + ' km/h'; save(); };
}
setTimeout(setupMoreSettings, 0);

// road being drawn: orange waypoints and a line
let roadDraftObjs = [];
function drawRoadDraft() {
  for (const o of roadDraftObjs) { scene.remove(o); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); }
  roadDraftObjs = [];
  const d = G.roadDraft || [];
  for (const q of d) { const g = pin(q, 0xff8c1a); g.scale.setScalar(0.5); pins.splice(pins.indexOf(g), 1); roadDraftObjs.push(g); }
  if (d.length > 1) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(d.map((q) => new THREE.Vector3(q.x, heightAt(G.world, q.x, q.z) + 1.2, q.z))), new THREE.LineBasicMaterial({ color: 0xff8c1a })); scene.add(l); roadDraftObjs.push(l); }
}

// bus line being drawn: pins + a line between the stops
let busDraftObjs = [];
function drawBusDraft() {
  for (const o of busDraftObjs) { scene.remove(o); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); }
  busDraftObjs = [];
  const d = G.busDraft || [];
  for (const q of d) { const g = pin(q, q.stop === false ? 0xff8c1a : 0x1d6fd6); if (q.stop === false) g.scale.setScalar(0.5); pins.splice(pins.indexOf(g), 1); busDraftObjs.push(g); }
  if (d.length > 1) {
    const pts = []; for (let i = 0; i < d.length - 1; i++) { const seg = G.buslines.pathBetween(G.buslines.snap(d[i].x, d[i].z), G.buslines.snap(d[i + 1].x, d[i + 1].z)); for (const p of seg) pts.push(new THREE.Vector3(p.x, heightAt(G.world, p.x, p.z) + 1.5, p.z)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1d6fd6 })); scene.add(l); busDraftObjs.push(l);
  }
}

// every new map gets a groomer garage at the edge of the main village (flat, free spot near the road)
function placeVillageGarage() {
  const w = G.world, v = w.villages[0]; if (!v) return;
  let best = null;
  for (let k = 0; k < 200; k++) {
    const a = (k * 2.39996) % (Math.PI * 2), d = v.r + 18 + (k % 7) * 10;
    const x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
    if (Math.abs(x) > w.S / 2 - 40 || Math.abs(z) > w.S / 2 - 40) continue;
    if (G.trees.blockedAt(x, z, 14) || G.tv.pisteAt(x, z)) continue;
    let lo = Infinity, hi = -Infinity;
    for (const [ox, oz] of [[-11, -9], [11, -9], [11, 9], [-11, 9], [0, 0]]) { const h = heightAt(w, x + ox, z + oz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const score = hi - lo + d * 0.01;
    if (hi - lo < 3 && (!best || score < best.score)) best = { x, z, score, a };
  }
  if (!best) return;
  G.trees.removeWhere((t) => Math.hypot(t.x - best.x, t.z - best.z) < 22);
  if (G.rocks) G.rocks.removeWhere((t) => Math.hypot(t.x - best.x, t.z - best.z) < 22);
  G.objects.add('garage', best.x, best.z, -best.a + Math.PI / 2);
}

// ---- station designs: which lifts have them, thumbnails rendered once with the main renderer ----
function hasStyles(lt) { return lt && ((lt.detach && ['chair', 'gondola', 'kombi'].includes(lt.kind) && !lt.funitel) || lt.kind === 'tram' || lt.threeS); }
function stylesFor(lt) { return lt && (lt.kind === 'tram' || lt.threeS) ? TRAM_STATION_STYLES : STATION_STYLES; }
const thumbCache = {};
function renderThumb(key, grp, w = 150, h = 96, opts = {}) {
  if (thumbCache[key] != null) return thumbCache[key];
  try {
    const scn = new THREE.Scene(); scn.background = new THREE.Color(0xb9d3ea);
    scn.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-20, 40, 30); scn.add(sun);
    scn.add(grp);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf3f6fa })); ground.position.y = -0.02; scn.add(ground);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 900);
    const bb = new THREE.Box3().setFromObject(grp), ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    const dist = Math.max(sz.x * (opts.fx || 1), sz.z * (opts.fz || 1.4), sz.y * (opts.fy || 1.6)) * 0.5 / Math.tan(15 * Math.PI / 180) * (opts.k || 0.86);
    const dir = (opts.dir || new THREE.Vector3(0.55, 0.5, 0.85)).clone().normalize();
    cam.position.copy(ctr).addScaledVector(dir, dist); cam.lookAt(ctr);
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    const old = renderer.getRenderTarget(), sh = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(rt); renderer.render(scn, cam);
    const buf = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(old); renderer.shadowMap.enabled = sh;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const si = ((h - 1 - y) * w + x) * 4, di = (y * w + x) * 4; for (let k = 0; k < 3; k++) img.data[di + k] = Math.round(255 * Math.pow(buf[si + k] / 255, 1 / 2.2)); img.data[di + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    thumbCache[key] = cv.toDataURL('image/jpeg', 0.85);
    rt.dispose(); grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); ground.geometry.dispose(); ground.material.dispose();
  } catch (e) { console.warn(e); thumbCache[key] = ''; }
  return thumbCache[key];
}
function stationThumb(style) {
  const lt = LIFT_TYPES[G.liftType], key = lt.kind + lt.gauge + '-' + G.brand + '-' + style;
  if (thumbCache[key] != null) return thumbCache[key];
  return renderThumb(key, Lift.stationPreview(G.liftType, G.brand, style));
}
// tower designs: thumbnails of one tower of this lift type
function buildTowerStyle(lt) { const v = (G.liftDef.tws || {})[lt.towerStyle === 'tram' ? 'tram' : 'norm'] || 'auto'; return v === 'auto' || towerStyleList(lt)[v] ? v : 'auto'; }
function towerStyleList(lt) { return lt.towerStyle === 'tram' ? TRAM_TOWER_STYLES : TOWER_STYLES; }
function towerThumb(typeKey, brandKey, style) {
  const lt = LIFT_TYPES[typeKey], tram = lt.towerStyle === 'tram';
  const key = 'tw-' + (tram ? 'tram' + lt.gauge : lt.kind + lt.gauge) + '-' + brandKey + '-' + style;
  if (thumbCache[key] != null) return thumbCache[key];
  return renderThumb(key, Lift.towerPreview(typeKey, brandKey, style, tram ? 34 : 13), 120, 120, { dir: new THREE.Vector3(0.5, 0.18, 1), fx: 1, fz: 1, fy: 1.05, k: 1.18 });
}
// the picker: a short row (Auto + the two classic kinds) and a fold-out grid with pictures of all kinds
function towerPickerHtml(id, typeKey, brandKey, cur, autoLabel) {
  const lt = LIFT_TYPES[typeKey];
  const list = towerStyleList(lt), tram = lt.towerStyle === 'tram';
  const quick = tram ? [['auto', autoLabel], ['turm', 'Gitterturm'], ['agitter', 'A-Gitter']] : [['auto', autoLabel], ['rohr', 'Rohrmast'], ['gitter', 'Gittermast']];
  const c = cur || 'auto', open = G.twMoreOpen && G.twMoreOpen[id];
  let h = `<div class="seg" id="${id}" style="margin:0">${quick.map(([k, n]) => `<button data-v="${k}" class="${c === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  h += `<details class="twmore" data-tm="${id}" ${open ? 'open' : ''}><summary>🖼️ Alle ${Object.keys(list).length} Stützen-Arten${list[c] && !quick.some((q) => q[0] === c) ? ' · gewählt: <b>' + list[c].name + '</b>' : ''}</summary>`;
  if (open) h += `<div class="stgrid tw">${Object.entries(list).map(([k, st]) => `<button class="stb ${c === k ? 'on' : ''}" data-tws="${id}:${k}" title="${st.hint}"><img src="${towerThumb(typeKey, brandKey, k)}" alt=""><span>${st.name}</span></button>`).join('')}</div>${list[c] ? `<div class="small">${list[c].name}: ${list[c].hint}</div>` : ''}`;
  return h + '</details>';
}
function bindTowerPicker(root, id, onPick, rerender) {
  if ($(id)) segInit(id, onPick);
  root.querySelectorAll(`[data-tws^="${id}:"]`).forEach((b) => b.onclick = () => onPick(b.dataset.tws.split(':')[1]));
  const d = root.querySelector(`details[data-tm="${id}"]`);
  if (d) d.addEventListener('toggle', () => { const was = !!(G.twMoreOpen && G.twMoreOpen[id]); G.twMoreOpen = { ...(G.twMoreOpen || {}), [id]: d.open }; if (d.open && !was) rerender(); });
}

// ---- remembered settings: the last value you set is used again for the next tower / new lift ----
G.liftDef = (() => { try { return JSON.parse(localStorage.getItem('bb-liftdef') || '{}') || {}; } catch (e) { return {}; } })();
function rememberLift(k, v) { G.liftDef[k] = v; try { localStorage.setItem('bb-liftdef', JSON.stringify(G.liftDef)); } catch (e) { /* ignore */ } }
function rememberTower(l, k, v) { l.twDef = l.twDef || {}; l.twDef[k] = v; G.liftDef.tw = G.liftDef.tw || {}; G.liftDef.tw[l.type.towerStyle === 'tram' ? 'tram' : l.type.kind] = { ...l.twDef }; rememberLift('tw', G.liftDef.tw); }
function liftDefOpts(typeKey) {
  const d = G.liftDef || {}, o = {}, t = LIFT_TYPES[typeKey];
  for (const k of ['speedF', 'densF', 'color', 'cover', 'nightLift', 'queue', 'lean']) if (d[k] !== undefined) o[k] = d[k];
  if (d.op && !(['tbar', 'platter', 'carpet'].includes(t.kind) && d.op === 'summer')) o.op = d.op;
  const tw = d.tw && d.tw[t.towerStyle === 'tram' ? 'tram' : t.kind]; if (tw) o.twDef = { ...tw };
  return o;
}

// ---- building a lift with bends: valley station -> bend points / mid-station -> top station ----
let liftPathLine = null;
function clearLiftPath() { if (liftPathLine) { scene.remove(liftPathLine); liftPathLine.geometry.dispose(); liftPathLine = null; } }
function drawLiftPath() {
  clearLiftPath();
  const pts = [G.liftA, ...(G.liftK || [])].filter(Boolean);
  if (pts.length < 2) return;
  const v = [];
  for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 20; k++) { const u = k / 20, x = lerp(pts[i - 1].x, pts[i].x, u), z = lerp(pts[i - 1].z, pts[i].z, u); v.push(new THREE.Vector3(x, heightAt(G.world, x, z) + 2, z)); }
  liftPathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), new THREE.LineBasicMaterial({ color: 0xffd400 }));
  scene.add(liftPathLine);
}
// is the bend at the last placed point OK when the line continues to p?
function checkLiftVertex(p) {
  const lt = LIFT_TYPES[G.liftType], K = G.liftK;
  const prev = K.length ? K[K.length - 1] : G.liftA, before = K.length > 1 ? K[K.length - 2] : G.liftA;
  const seg = Math.hypot(p.x - prev.x, p.z - prev.z);
  if (seg < (K.length ? 40 : lt.Ls + 30)) { toast('Zu nah am letzten Punkt'); return false; }
  if (K.length) {
    const ang = bendAngle(before, prev, p), q = K[K.length - 1];
    const mx = q.k === 'm' ? MID_ANGLE_MAX : kinkMaxBig(lt);
    if (ang > mx) { toast(`Der Knick wäre ${Math.round(ang)}° – ${q.k === 'm' ? 'in der Mittelstation' : 'auf einer Umlenkstütze'} gehen höchstens ${mx}°`); return false; }
  }
  return true;
}
function addLiftVertex(p, k) {
  const lt = LIFT_TYPES[G.liftType];
  if (k === 't' && kinkMax(lt) <= 0) { toast('Bei dieser Bahn geht kein Knick'); G.kinkNext = false; renderToolPanel(); return; }
  if (k === 'm' && G.liftK.some((q) => q.k === 'm')) k = 't';
  if (G.liftK.length >= 6) { toast('Höchstens 6 Knicke'); return; }
  if (!checkLiftVertex(p)) return;
  G.liftK.push({ x: p.x, z: p.z, k });
  pin(p, k === 'm' ? 0x3a8ee6 : 0xff7a00);
  G.kinkNext = false;
  drawLiftPath();
  toast(k === 'm' ? 'Mittelstation gesetzt. Jetzt die Bergstation antippen (oder weitere Knicke).' : `Knick gesetzt (bis ${kinkMax(lt)}° auf einer Umlenkstütze${kinkMaxBig(lt) > kinkMax(lt) ? ', bis ' + kinkMaxBig(lt) + '° mit Umlenkrad' : ''}).`);
  renderToolPanel();
}
function undoLiftVertex() {
  if (!G.liftK || !G.liftK.length) return;
  G.liftK.pop();
  clearPins(); pin(G.liftA); for (const q of G.liftK) pin(q, q.k === 'm' ? 0x3a8ee6 : 0xff7a00);
  drawLiftPath(); renderToolPanel();
}
let lastMoveEv = null;

// surface lifts: a groomed track under the uphill rope (where skiers are towed)
function groomLiftTrack(l) {
  const t = l.type; if (t.kind !== 'tbar' && t.kind !== 'platter') return;
  for (let d = 0; d <= l.L; d += 3) {
    const p = l.offsetAt(d, t.gauge / 2), u = l.dirAt(d);
    G.tv.groomStroke(p.x, p.z, Math.atan2(-u.z, u.x), 3.4, 4, true);
  }
  G.bermDirty = true;
}
function clearCorridor(l) {
  groomLiftTrack(l);
  const w = l.type.gauge / 2 + (l.type.kind === 'carpet' ? 3 : 7);
  const big = l.type.kind === 'tram' || l.type.threeS || l.type.kind === 'funicular';
  const r = l.type.Ls + (big ? 30 : 18);
  G.trees.removeWhere((t) => l.distToLine(t.x, t.z) < w || Math.hypot(t.x - l.A.x, t.z - l.A.z) < r || Math.hypot(t.x - l.B.x, t.z - l.B.z) < r);
  G.rocks.removeWhere((t) => l.distToLine(t.x, t.z) < w + t.s || Math.hypot(t.x - l.A.x, t.z - l.A.z) < r || Math.hypot(t.x - l.B.x, t.z - l.B.z) < r);
  for (const ga of l.garArea || []) { G.trees.removeWhere((t) => Math.hypot(t.x - ga.x, t.z - ga.z) < ga.r); G.rocks.removeWhere((t) => Math.hypot(t.x - ga.x, t.z - ga.z) < ga.r); }
}

function selectLift(l, tower = -1) {
  if (G.selected && G.selected !== l) { G.selected.highlightTower(-1); G.liftCompact = false; }
  G.selObj = null; if (G.objMarker) G.objMarker.visible = false;
  G.selected = l;
  G.selTower = tower >= 0 ? tower : (l.towers.length ? clamp(G.selTower, 0, l.towers.length - 1) : -1);
  renderLiftPanel();
}

const SWATCHES = [null, 0xd62020, 0x1f6fd1, 0x2fb46a, 0xffcc00, 0xff7a00, 0x8a2be2, 0x222222, 0xeeeeee];
function renderLiftPanel() {
  const l = G.selected; if (!l) return;
  const t = l.type;
  const p = $('sidepanel');
  p.classList.remove('hidden');
  $('toolpanel').classList.add('hidden');
  if (l.autoTowers) l.highlightTower(-1); else l.highlightTower(G.selTower);
  const i = G.selTower;
  const noTowers = t.kind === 'carpet' || t.kind === 'funicular';
  let h = `<button class="close" id="lpX">✕</button>
    <h2>${l.displayName}</h2><div class="brand">${l.brand.name} · ${t.name}</div>
    ${G.liftCompact ? '<div class="btnrow" style="margin:4px 0 6px"><button class="btn" id="lpFull">▴ Ganzes Menü zeigen</button></div>' : ''}
    <div class="lp-full">
    ${liftStatsHTML(l)}
    <label class="lbl">Name</label><input class="txt" id="lpName" type="text" maxlength="28" placeholder="${t.name}" value="${(l.name || '').replace(/"/g, '&quot;')}">
    <label class="lbl">Liftart</label><select class="sel" id="lpType">${LIFT_GROUPS.map((g) => `<optgroup label="${g.name}">${g.types.map((k) => `<option value="${k}" ${k === l.typeKey ? 'selected' : ''}>${LIFT_TYPES[k].name}</option>`).join('')}</optgroup>`).join('')}</select>
    <label class="lbl">Hersteller</label><div class="opts">${Object.entries(BRANDS).map(([k, b]) => `<button class="opt ${l.brandKey === k ? 'on' : ''}" data-lb="${k}">${b.name}</button>`).join('')}</div>
    <label class="lbl">Farbe der ${t.kind === 'chair' || t.kind === 'kombi' ? 'Sessel' : 'Kabinen'}</label><div class="opts">${SWATCHES.map((c) => `<button class="sw ${l.color === c ? 'on' : ''}" data-sw="${c === null ? 'x' : c}" style="background:${c === null ? 'linear-gradient(135deg,#888 50%,#ddd 50%)' : hex(c)}"></button>`).join('')}</div>
    <label class="lbl">Tempo</label><div class="row"><input type="range" id="lpSpeed" min="30" max="100" step="5" value="${Math.round(l.speedF * 100)}"><span class="val" id="lpSpeedV">${l.speed.toFixed(1)} m/s</span></div>
    ${t.kind === 'tram' || t.kind === 'funicular' ? '' : `<label class="lbl">Abstand ${t.kind === 'carpet' ? 'der Fahrgäste' : 'der ' + (t.kind === 'gondola' ? 'Gondeln' : 'Sessel')}</label><div class="row"><input type="range" id="lpDens" min="50" max="250" step="10" value="${Math.round(l.densF * 100)}"><span class="val" id="lpDensV">${Math.round(l.spacing)} m</span></div>`}
    ${t.kind === 'carpet' ? `<div class="btnrow"><button class="btn ${l.cover ? 'on' : ''}" id="lpCover">🛖 Überdachung ${l.cover ? 'an' : 'aus'}</button></div>` : ''}
    <div class="tp-title" style="margin-top:10px">Betrieb</div>
    <div class="seg" style="margin:0 0 8px"><button id="runOn" class="${l.running ? 'on' : ''}">▶ In Betrieb</button><button id="runOff" class="${!l.running ? 'on' : ''}">⏸ Ausser Betrieb</button></div>
    <label class="lbl">Saison</label>
    <div class="seg" id="lpOp" style="margin:0 0 8px"><button data-v="winter" class="${l.op === 'winter' ? 'on' : ''}">❄️ Winter</button><button data-v="summer" class="${l.op === 'summer' ? 'on' : ''}">☀️ Sommer</button><button data-v="all" class="${l.op === 'all' ? 'on' : ''}">🔁 Ganzjährig</button></div>
    <div class="small">${!l.running ? 'Ausser Betrieb.' : !l.seasonOk ? (l.garaging ? '🅿️ Saisonende – wird garagiert …' : '😴 Saisonpause – fährt nur im ' + (l.op === 'winter' ? 'Winter' : 'Sommer') + (l.hasGarage ? '. Die ' + (t.kind === 'gondola' ? 'Gondeln' : 'Sessel') + ' bleiben in der Garage.' : ['tbar', 'platter'].includes(t.kind) ? '. Die Bügel sind abgehängt.' : t.kind === 'chair' ? '. Die Sessel sind abgehängt.' : '.')) : l.garaging ? '🅿️ Wird garagiert (Feierabend) …' : l.open === false ? '🌙 Geschlossen – öffnet um 8:30' + (liftNight(l) && nightSkiOn() ? ' und für Nachtskifahren um 21:00' : '') : '✅ Offen'} · Betriebszeit 8:30–${G.season === 0 ? '16:15' : '17:30'}. Danach fahren die Gäste noch ins Tal ab${l.type.detach ? ', und die Sessel/Kabinen fahren in die Garage' : ''}.</div>
    <label class="lbl">🌙 Für Nachtskifahren (21–23 Uhr)</label>
    <div class="seg" id="lpNight" style="margin:0 0 6px"><button data-v="auto" class="${(l.nightLift || 'auto') === 'auto' ? 'on' : ''}">Auto (beleuchtet)</button><button data-v="on" class="${l.nightLift === 'on' ? 'on' : ''}">Ja</button><button data-v="off" class="${l.nightLift === 'off' ? 'on' : ''}">Nein</button></div>
    <div class="tp-title">Stationen</div>
    <div class="btnrow"><button class="btn" id="mvA">📍 Talstation verschieben</button><button class="btn" id="mvB">📍 Bergstation verschieben</button></div>
    ${l.hasGarage ? `<label class="lbl">Garage für die ${t.kind === 'gondola' ? 'Gondeln' : 'Sessel'}</label><div class="seg" id="lpGar" style="margin:0"><button data-v="unter" class="${l.garStyle === 'unter' ? 'on' : ''}">Unter der Station (Rampe)</button><button data-v="daneben" class="${l.garStyle !== 'unter' ? 'on' : ''}">Halle daneben</button></div>` : ''}
    ${t.kind !== 'tram' && t.kind !== 'funicular' && t.kind !== 'carpet' && t.kind !== 'tbar' && t.kind !== 'platter' && !t.threeS ? `<label class="lbl">Stromkabel über den Stützen</label><div class="seg" id="lpCable" style="margin:0 0 4px"><button data-v="0" class="${l.cable ? '' : 'on'}">Nein</button><button data-v="1" class="${l.cable ? 'on' : ''}">Ja</button></div>` : ''}
    ${hasStyles(t) ? `<label class="lbl">Stations-Design</label><select class="sel" id="lpSt"><option value="auto" ${(l.stStyle || 'auto') === 'auto' ? 'selected' : ''}>Automatisch (${t.kind === 'tram' || t.threeS ? 'Glas unten, Fels oben' : l.brand.name})</option>${Object.entries(stylesFor(t)).map(([k, st]) => `<option value="${k}" ${l.stStyle === k ? 'selected' : ''}>${st.name}</option>`).join('')}</select>` : ''}
    ${l.mid && l.mid.v != null ? `<div class="small">🚉 Mittelstation nach ${fmtM(l.mid.d)}${Math.abs(l.kinks[l.mid.v].ang) > 0.03 ? ' · Winkelstation mit ' + Math.round(Math.abs(l.kinks[l.mid.v].ang) * 180 / Math.PI) + '° Knick' : ''}</div>` : l.mid ? `<label class="lbl">Mittelstation</label><div class="row"><input type="range" id="lpMidD" min="0" max="100" value="${Math.round(l.mid.d / l.L * 100)}"><span class="val" id="lpMidDV">${Math.round(l.mid.d)} m</span></div>` : ''}
    ${l.kinks && l.kinks.some((k) => k.k === 't') ? `<div class="small">↪️ ${l.kinks.filter((k) => k.k === 't').map((k) => Math.round(Math.abs(k.ang) * 1800 / Math.PI) / 10 + '°').join(', ')} Knick auf Umlenkstütze${l.kinks.filter((k) => k.k === 't').length > 1 ? 'n' : ''}</div>` : ''}
    ${['chair', 'gondola', 'kombi'].includes(t.kind) ? `<label class="lbl">Anstehbereich bei der Talstation</label><div class="seg" id="lpQueue" style="margin:0">${[['back', 'Hinten'], ['left', 'Links'], ['right', 'Rechts'], ['front', 'Vorne']].map(([k, n]) => `<button data-v="${k}" class="${(l.queue || 'back') === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}`;
  h += `</div>`;
  if (!noTowers) {
    h += `<div class="lp-full"><div class="tp-title" style="margin-top:10px">Stützen</div>
      <div class="seg" style="margin:0"><button id="twAuto" class="${l.autoTowers ? 'on' : ''}">Automatisch</button><button id="twMan" class="${!l.autoTowers ? 'on' : ''}">Selbst setzen</button></div>
      <label class="lbl">Neigung der Stützen</label>
      <div class="seg" id="twLean" style="margin:0"><button data-v="1" class="${l.lean ? 'on' : ''}">Automatisch geneigt</button><button data-v="0" class="${!l.lean ? 'on' : ''}">Alle gerade</button></div>
      <label class="lbl">Stützen-Art für alle Stützen</label>${towerPickerHtml('twAll', l.typeKey, l.brandKey, l.twStyleAll, t.towerStyle === 'tram' ? 'Auto' : 'Auto (hoch = Gitter)')}</div>`;
    if (!l.autoTowers) {
      if (l.towers.length && i >= 0) {
        const tw = l.towers[i];
        h += `<div class="twr"><button class="btn" id="twPrev">◀</button><div class="mid">Stütze ${i + 1} / ${l.towers.length}</div><button class="btn" id="twNext">▶</button></div>
          <label class="lbl">Position auf der Linie</label>
          <div class="row"><input type="range" id="twPos" min="0" max="${Math.floor(l.L)}" step="1" value="${Math.round(tw.d)}"><span class="val" id="twPosV">${Math.round(tw.d)} m</span></div>
          <label class="lbl">Höhe</label>
          <div class="row"><button class="btn" style="flex:0 0 40px;min-width:40px" id="twHm">−</button><input type="range" id="twH" min="3" max="${t.towerStyle === 'tram' ? 100 : 60}" step="0.5" value="${tw.h}"><button class="btn" style="flex:0 0 40px;min-width:40px" id="twHp">＋</button><span class="val" id="twHV">${tw.h.toFixed(1)} m</span></div>
          <label class="lbl">Neigung dieser Stütze: <b id="twTiltV">${tw.tilt == null ? 'Auto (' + Math.round((l.towerTilts[i] || 0) * 180 / Math.PI) + '°)' : tw.tilt + '°'}</b></label>
          <div class="row"><input type="range" id="twTilt" min="-25" max="25" step="1" value="${tw.tilt == null ? Math.round((l.towerTilts[i] || 0) * 180 / Math.PI) : tw.tilt}"><button class="btn" style="flex:0 0 64px;min-width:64px" id="twTiltAuto">Auto</button></div>
          ${t.towerStyle === 'tram' ? '' : `<label class="lbl">Rollen · ${({ support: 'Seil läuft über den Rollen (Tragstütze)', comp: 'Seil läuft unter den Rollen (Niederhaltestütze)', both: 'Seil läuft zwischen zwei Rollen (Wechselstütze)' })[l.towerModes[i]] || ''}</label>
          <div class="seg" id="twRoll" style="margin:0">${[['auto', 'Auto'], ['support', 'Über'], ['comp', 'Unter'], ['both', 'Zwischen']].map(([k, n]) => `<button data-v="${k}" class="${(tw.roll || 'auto') === k ? 'on' : ''}">${n}</button>`).join('')}</div>`}
          <label class="lbl">Mast-Art dieser Stütze: <b>${(towerStyleList(t)[l.towerStyles[i]] || {}).name || ''}</b></label>
          ${towerPickerHtml('twStyle', l.typeKey, l.brandKey, tw.style, 'Wie alle')}
          <label class="lbl">🟥 Mastpolster · ${l.padOn(i, (l.towerPositions[i] || {}).x || 0, (l.towerPositions[i] || {}).z || 0) ? 'dran' : 'keins'}</label>
          <div class="seg" id="twPad" style="margin:0">${[['auto', 'Auto (in Piste)'], ['on', 'Ja'], ['off', 'Nein']].map(([k, n]) => `<button data-v="${k}" class="${(tw.pad || 'auto') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          <div class="btnrow"><button class="btn" id="twMove">📍 Hierhin tippen</button><button class="btn" id="twDel">－ Löschen</button></div>`;
      } else h += `<div class="small">Keine Stützen. Füge eine hinzu.</div>`;
      h += `<div class="btnrow"><button class="btn blue" id="twAdd">＋ Stütze: auf Linie tippen</button></div><div class="small">Tipp: Du kannst auch direkt auf eine Stütze tippen, um sie auszuwählen.</div>`;
    }
  }
  if (t.kind === 'funicular') {
    const tp = l.trackPts || [];
    const ti = clamp(G.selTP ?? 0, 0, Math.max(0, tp.length - 1));
    h += `<div class="tp-title" style="margin-top:10px">Strecke & Tunnel</div>
      <canvas id="tpCanvas" width="640" height="260" style="width:100%;height:auto;border-radius:10px;background:#0e1620;touch-action:none"></canvas>
      <div class="small">Querschnitt der Strecke: braun = Berg, gelb = Gleis, Punkte = deine Streckenpunkte (ziehen zum Verschieben). Liegt das Gleis unter dem Berg, wird ein Tunnel mit Portalen gebaut.</div>`;
    if (tp.length) {
      const p0 = tp[ti];
      h += `<div class="twr"><button class="btn" id="tpPrev">◀</button><div class="mid">Punkt ${ti + 1} / ${tp.length}</div><button class="btn" id="tpNext">▶</button></div>
        <label class="lbl">Position auf der Strecke</label><div class="row"><input type="range" id="tpD" min="12" max="${Math.floor(l.L - 12)}" step="1" value="${Math.round(p0.d)}"><span class="val" id="tpDV">${Math.round(p0.d)} m</span></div>
        <label class="lbl">Höhe über dem Boden (minus = Tunnel-Tiefe)</label><div class="row"><input type="range" id="tpH" min="-80" max="30" step="0.5" value="${p0.h}"><span class="val" id="tpHV">${p0.h} m</span></div>
        <div class="btnrow"><button class="btn" id="tpDel">－ Punkt löschen</button><button class="btn" id="tpAuto">↺ Automatisch</button></div>`;
    } else h += `<div class="small">Noch keine Streckenpunkte: Das Gleis folgt dem Gelände.</div>`;
    h += `<div class="btnrow"><button class="btn blue" id="tpAdd">＋ Streckenpunkt: auf Linie tippen</button></div>`;
  }
  h += `<div class="btnrow lp-full" style="margin-top:12px"><button class="btn bad" id="lpDel">🗑️ Abreissen</button></div>`;
  p.innerHTML = h;
  // compact mode while setting towers: only the tower controls stay visible
  p.classList.toggle('compact', !!G.liftCompact && !l.autoTowers);
  if (G.liftCompact && !l.autoTowers) p.classList.remove('collapsed');
  { const e = $('lpFull'); if (e) e.onclick = () => { G.liftCompact = false; renderLiftPanel(); }; }
  $('lpX').onclick = closeSide;
  decorate(p, 'side', '🚡 ' + l.displayName, closeSide);
  $('lpName').onchange = (e) => { l.name = e.target.value.trim(); l.rebuild(); renderLiftPanel(); saveSoon(); };
  $('lpType').onchange = (e) => {
    const old = l.typeKey;
    if (!l.setType(e.target.value)) { toast('Dafür ist der Lift zu kurz oder zu lang'); e.target.value = old; return; }
    const def = LIFT_TYPES[l.typeKey].brand; if (def && l.type.kind === 'tram') l.brandKey = def;
    clearCorridor(l); G.selTower = -1; scheduleNetwork(); renderLiftPanel(); saveSoon();
  };
  p.querySelectorAll('[data-lb]').forEach((b) => b.onclick = () => { l.brandKey = b.dataset.lb; l.rebuild(); renderLiftPanel(); saveSoon(); });
  p.querySelectorAll('[data-sw]').forEach((b) => b.onclick = () => { l.color = b.dataset.sw === 'x' ? null : +b.dataset.sw; rememberLift('color', l.color); l.rebuild(); renderLiftPanel(); saveSoon(); });
  const sp = $('lpSpeed'); sp.oninput = () => { $('lpSpeedV').textContent = (t.speed * sp.value / 100).toFixed(1) + ' m/s'; }; sp.onchange = () => { l.speedF = sp.value / 100; rememberLift('speedF', l.speedF); l.rebuild(); renderLiftPanel(); scheduleNetwork(); saveSoon(); };
  const de = $('lpDens'); if (de) { de.oninput = () => { $('lpDensV').textContent = Math.round(t.spacing * de.value / 100) + ' m'; }; de.onchange = () => { l.densF = de.value / 100; rememberLift('densF', l.densF); l.rebuild(); renderLiftPanel(); saveSoon(); }; }
  const cv = $('lpCover'); if (cv) cv.onclick = () => { l.cover = !l.cover; rememberLift('cover', l.cover); l.rebuild(); renderLiftPanel(); };
  if ($('lpNight')) segInit('lpNight', (v) => { l.nightLift = v; rememberLift('nightLift', v); renderLiftPanel(); saveSoon(); });
  if ($('lpGar')) segInit('lpGar', (v) => { l.garStyle = v; l.rebuild(); renderLiftPanel(); saveSoon(); });
  { const ss = $('lpSt'); if (ss) ss.onchange = () => { l.stStyle = ss.value; l.rebuild(); saveSoon(); }; }
  if ($('lpCable')) segInit('lpCable', (v) => { l.cable = v === '1'; l.rebuild(); saveSoon(); renderLiftPanel(l); });
  if ($('lpOp')) segInit('lpOp', (v) => { l.op = v; rememberLift('op', v); if (!l.seasonOk && !l.hasGarage) l.setOpen(false); renderLiftPanel(); scheduleNetwork(true); saveSoon(); });
  $('runOn').onclick = () => { l.running = true; renderLiftPanel(); scheduleNetwork(); };
  $('runOff').onclick = () => { l.running = false; renderLiftPanel(); scheduleNetwork(); };
  if ($('lpMid')) segInit('lpMid', (v) => { l.setMid(v === '1'); if (v === '1' && !l.midRange()) { toast('Für eine Mittelstation ist der Lift zu kurz'); l.setMid(false); } clearCorridor(l); renderLiftPanel(); scheduleNetwork(); saveSoon(); });
  { const md = $('lpMidD'); if (md) { md.oninput = () => { $('lpMidDV').textContent = Math.round(md.value / 100 * l.L) + ' m'; }; md.onchange = () => { l.setMid(true, md.value / 100 * l.L); renderLiftPanel(); scheduleNetwork(); saveSoon(); }; } }
  if ($('lpQueue')) segInit('lpQueue', (v) => { l.queue = v; rememberLift('queue', v); l.rebuild(); saveSoon(); });
  $('mvA').onclick = () => setPending({ kind: 'moveStation', lift: l, which: 'A' }, 'Tippe den neuen Ort der Talstation');
  $('mvB').onclick = () => setPending({ kind: 'moveStation', lift: l, which: 'B' }, 'Tippe den neuen Ort der Bergstation');
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  on('twAuto', () => { l.setAuto(true); G.selTower = -1; renderLiftPanel(); saveSoon(); });
  on('twMan', () => { l.autoTowers = false; G.selTower = l.towers.length ? 0 : -1; renderLiftPanel(); });
  on('twPrev', () => { G.selTower = (i - 1 + l.towers.length) % l.towers.length; renderLiftPanel(); });
  on('twNext', () => { G.selTower = (i + 1) % l.towers.length; renderLiftPanel(); });
  on('twHm', () => { l.setTowerHeight(i, l.towers[i].h - 1); rememberTower(l, 'h', l.towers[i].h); renderLiftPanel(); });
  on('twHp', () => { l.setTowerHeight(i, l.towers[i].h + 1); rememberTower(l, 'h', l.towers[i].h); renderLiftPanel(); });
  on('twMove', () => { G.liftCompact = true; setPending({ kind: 'moveTower', lift: l, i }, 'Tippe auf die Liftlinie, wo die Stütze hin soll'); renderLiftPanel(); });
  on('twDel', () => { if (i >= 0 && l.towers[i] && l.towers[i].kink) { toast('Das ist die Umlenkstütze beim Knick – die bleibt stehen'); return; } if (i >= 0) { l.removeTower(i); G.selTower = Math.min(i, l.towers.length - 1); renderLiftPanel(); saveSoon(); } });
  if ($('twLean')) segInit('twLean', (v) => { l.lean = v === '1'; rememberLift('lean', l.lean); l.rebuild(); renderLiftPanel(); saveSoon(); });
  const tl = $('twTilt');
  if (tl) { tl.oninput = () => { l.towers[i].tilt = +tl.value; $('twTiltV').textContent = tl.value + '°'; l.rebuild(); l.highlightTower(i); }; tl.onchange = () => { rememberTower(l, 'tilt', l.towers[i].tilt); renderLiftPanel(); saveSoon(); }; }
  on('twTiltAuto', () => { l.towers[i].tilt = null; rememberTower(l, 'tilt', null); l.rebuild(); renderLiftPanel(); saveSoon(); });
  if ($('twPad')) segInit('twPad', (v) => { l.towers[i].pad = v === 'auto' ? undefined : v; rememberTower(l, 'pad', l.towers[i].pad); l.rebuild(); l.padSig = l.padSignature(); renderLiftPanel(); saveSoon(); });
  bindTowerPicker(p, 'twStyle', (v) => { l.towers[i].style = v === 'auto' ? undefined : v; rememberTower(l, 'style', v); l.rebuild(); renderLiftPanel(); saveSoon(); }, renderLiftPanel);
  bindTowerPicker(p, 'twAll', (v) => { l.twStyleAll = v; const d = { ...(G.liftDef.tws || {}) }; d[t.towerStyle === 'tram' ? 'tram' : 'norm'] = v; rememberLift('tws', d); l.rebuild(); renderLiftPanel(); saveSoon(); }, renderLiftPanel);
  if ($('twRoll')) segInit('twRoll', (v) => { l.towers[i].roll = v; rememberTower(l, 'roll', v); l.rebuild(); renderLiftPanel(); saveSoon(); });
  on('twAdd', () => { G.liftCompact = true; setPending({ kind: 'addTower', lift: l }, 'Tippe auf die Liftlinie, wo die neue Stütze hin soll'); renderLiftPanel(); });
  const pos = $('twPos');
  if (pos) { pos.oninput = () => { l.moveTower(i, +pos.value); $('twPosV').textContent = Math.round(l.towers[i].d) + ' m'; l.highlightTower(i); }; pos.onchange = () => { renderLiftPanel(); saveSoon(); }; }
  const th = $('twH');
  if (th) { th.oninput = () => { l.setTowerHeight(i, +th.value); $('twHV').textContent = l.towers[i].h.toFixed(1) + ' m'; l.highlightTower(i); }; th.onchange = () => { rememberTower(l, 'h', l.towers[i].h); renderLiftPanel(); saveSoon(); }; }
  if (t.kind === 'funicular') bindTrackEditor(l);
  $('lpDel').onclick = () => {
    if (!$('lpDel').dataset.sure) { $('lpDel').dataset.sure = 1; $('lpDel').textContent = 'Wirklich abreissen?'; return; }
    l.dispose(); G.lifts.splice(G.lifts.indexOf(l), 1);
    if (G.mode === 'normal') { G.money += Math.round(l.cost * 0.3); updateHUD(); }
    G.selected = null; closeSide(); toast('Lift abgerissen'); scheduleNetwork(); saveSoon();
  };
}

// funicular track editor: profile canvas (cross-section) with draggable track points
function bindTrackEditor(l) {
  const cv = $('tpCanvas'); if (!cv) return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const N = 120;
  const gr = []; for (let i = 0; i <= N; i++) gr.push(l.ground(l.L * i / N));
  let lo = Math.min(...gr) - 20, hi = Math.max(...gr) + 20;
  for (const p of l.trackPts) { lo = Math.min(lo, l.ground(p.d) + p.h - 10); hi = Math.max(hi, l.ground(p.d) + p.h + 10); }
  const X = (d) => 10 + (d / l.L) * (W - 20), Y = (y) => H - 10 - (y - lo) / (hi - lo) * (H - 20);
  const D = (px) => clamp((px - 10) / (W - 20) * l.L, 12, l.L - 12), Yv = (py) => lo + (H - 10 - py) / (H - 20) * (hi - lo);
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(X(0), H);
    for (let i = 0; i <= N; i++) ctx.lineTo(X(l.L * i / N), Y(gr[i]));
    ctx.lineTo(X(l.L), H); ctx.closePath(); ctx.fillStyle = '#6b5440'; ctx.fill();
    ctx.strokeStyle = '#e8eef5'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i <= N; i++) { const x = X(l.L * i / N), y = Y(gr[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    const prof = l.trackProfile();
    ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 4; ctx.setLineDash([]);
    ctx.beginPath(); for (let i = 0; i <= N; i++) { const d = l.L * i / N, y = prof ? prof(d) : l.trackYAt(d); i ? ctx.lineTo(X(d), Y(y)) : ctx.moveTo(X(d), Y(y)); } ctx.stroke();
    l.trackPts.forEach((p, i) => { ctx.fillStyle = i === (G.selTP ?? 0) ? '#ff7a00' : '#ffffff'; ctx.beginPath(); ctx.arc(X(p.d), Y(l.ground(p.d) + p.h), 9, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#9fb4c8'; ctx.font = 'bold 20px system-ui'; ctx.fillText('Tal', 14, 26); ctx.fillText('Berg', W - 60, 26);
  };
  draw();
  let drag = -1;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  cv.onpointerdown = (e) => {
    const [px, py] = pos(e);
    let best = -1, bd = 30;
    l.trackPts.forEach((p, i) => { const dd = Math.hypot(X(p.d) - px, Y(l.ground(p.d) + p.h) - py); if (dd < bd) { bd = dd; best = i; } });
    if (best < 0) { const i = l.addTrackPt(D(px)); if (i >= 0) { l.trackPts[i].h = Math.round((Yv(py) - l.ground(l.trackPts[i].d)) * 2) / 2; best = i; } }
    drag = best; G.selTP = best; cv.setPointerCapture(e.pointerId); draw();
  };
  cv.onpointermove = (e) => { if (drag < 0) return; const [px, py] = pos(e); const p = l.trackPts[drag]; p.d = D(px); p.h = clamp(Math.round((Yv(py) - l.ground(p.d)) * 2) / 2, -80, 30); draw(); };
  cv.onpointerup = () => { if (drag < 0) return; drag = -1; l.trackPts.sort((a, b) => a.d - b.d); l.rebuild(); renderLiftPanel(); saveSoon(); };
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  const ti = clamp(G.selTP ?? 0, 0, Math.max(0, l.trackPts.length - 1));
  on('tpPrev', () => { G.selTP = (ti - 1 + l.trackPts.length) % l.trackPts.length; renderLiftPanel(); });
  on('tpNext', () => { G.selTP = (ti + 1) % l.trackPts.length; renderLiftPanel(); });
  on('tpDel', () => { l.trackPts.splice(ti, 1); G.selTP = Math.max(0, ti - 1); l.rebuild(); renderLiftPanel(); saveSoon(); });
  on('tpAuto', () => { l.trackPts = []; l.rebuild(); renderLiftPanel(); saveSoon(); });
  on('tpAdd', () => { G.liftCompact = false; setPending({ kind: 'addTrackPt', lift: l }, 'Tippe auf die Strecke, wo ein Streckenpunkt hin soll'); });
  const sd = $('tpD'); if (sd) { sd.oninput = () => { l.trackPts[ti].d = +sd.value; $('tpDV').textContent = sd.value + ' m'; draw(); }; sd.onchange = () => { l.trackPts.sort((a, b) => a.d - b.d); l.rebuild(); renderLiftPanel(); saveSoon(); }; }
  const sh = $('tpH'); if (sh) { sh.oninput = () => { l.trackPts[ti].h = +sh.value; $('tpHV').textContent = sh.value + ' m'; draw(); }; sh.onchange = () => { l.rebuild(); renderLiftPanel(); saveSoon(); }; }
}

function placeObjMarker(o) {
  if (!G.objMarker) { G.objMarker = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd400 })); scene.add(G.objMarker); }
  const r = o.line ? Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) / 2 + 2 : ({ halfpipe: 30, kicker_l: 20, hotel: 18, northshore: 15, pumptrack: 16, bruecke: 20, restaurant: 15 }[o.type] || 7);
  G.objMarker.scale.setScalar(r); G.objMarker.position.set(o.x, heightAt(G.world, o.x, o.z) + 0.5, o.z); G.objMarker.visible = true;
}
function selectObj(o) {
  if (G.selected) G.selected.highlightTower(-1);
  G.selected = null; G.selObj = o;
  if (!G.objMarker) { G.objMarker = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd400 })); scene.add(G.objMarker); }
  renderObjPanel();
}
function renderObjPanel() {
  $('sidepanel').classList.remove('compact'); G.liftCompact = false;
  const o = G.selObj; if (!o) return;
  const t = OBJ_TYPES[o.type];
  const p = $('sidepanel');
  p.classList.remove('hidden');
  $('toolpanel').classList.add('hidden');
  const r = o.line ? Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) / 2 + 2 : 6;
  G.objMarker.scale.setScalar(r); G.objMarker.position.set(o.x, heightAt(G.world, o.x, o.z) + 0.5, o.z); G.objMarker.visible = true;
  const deg = Math.round(((o.yaw * 180 / Math.PI) % 360 + 540) % 360 - 180);
  p.innerHTML = `<button class="close" id="opX">✕</button><h2>${t.name}</h2><div class="brand">${t.season === 'winter' ? 'Winter-Objekt' : t.season === 'summer' ? 'Sommer-Objekt' : 'Ganzjährig'}${t.beds ? ' · ' + t.beds + ' Betten' : ''}</div>
    ${o.line ? `<div class="small">Länge ${fmtM(Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z))}</div>` : `
    <label class="lbl">Drehung</label><div class="row"><button class="btn" style="flex:0 0 44px;min-width:44px" id="opL">↺</button><input type="range" id="opYaw" min="-180" max="180" step="5" value="${deg}"><button class="btn" style="flex:0 0 44px;min-width:44px" id="opR">↻</button><span class="val" id="opYawV">${deg}°</span></div>
    ${Objects.sizable(o) ? `<label class="lbl">Grösse</label><div class="row"><input type="range" id="opSize" min="30" max="300" step="5" value="${Math.round((o.size || 1) * 100)}"><span class="val" id="opSizeV">${Math.round((o.size || 1) * 100)} %</span></div>` : ''}
    <div class="btnrow"><button class="btn" id="opMove">📍 Verschieben</button></div>`}
    ${PAD_TYPES[o.type] ? `<label class="lbl">🟥 Polster am Mast · ${o.padMesh ? 'dran' : 'keins'}</label><div class="seg" id="opPad" style="margin:0">${[['auto', 'Auto (in Piste)'], ['on', 'Ja'], ['off', 'Nein']].map(([k, n]) => `<button data-v="${k}" class="${(o.pad || 'auto') === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}
    <div class="btnrow"><button class="btn bad" id="opDel">🗑️ Entfernen</button></div>`;
  $('opX').onclick = closeSide;
  decorate(p, 'side', '🏗️ ' + t.name, closeSide);
  const rot = (d) => { G.objects.rotate(o, d * Math.PI / 180); G.lastYaw = o.yaw; renderObjPanel(); saveSoon(); };
  const y = $('opYaw');
  if (y) { y.oninput = () => { $('opYawV').textContent = y.value + '°'; if (o.cannon) G.objects.rotate(o, y.value * Math.PI / 180); }; y.onchange = () => rot(+y.value); $('opL').onclick = () => rot(deg - 15); $('opR').onclick = () => rot(deg + 15); $('opMove').onclick = () => setPending({ kind: 'moveObj', obj: o }, 'Tippe auf den neuen Ort'); }
  if ($('opSize')) { const sz = $('opSize'); sz.oninput = () => { $('opSizeV').textContent = sz.value + ' %'; }; sz.onchange = () => { G.objects.resize(o, sz.value / 100); G.lastSize = o.size; renderObjPanel(); saveSoon(); }; }
  if ($('opPad')) segInit('opPad', (v) => { o.pad = v === 'auto' ? undefined : v; G.lastPad = o.pad; G.objects.updatePad(o); renderObjPanel(); saveSoon(); });
  $('opDel').onclick = () => { G.objects.remove(o); G.selObj = null; closeSide(); toast('Entfernt'); saveSoon(); };
}

// ---------------- menu & modals ----------------
const openModal = (id) => $(id).classList.remove('hidden');
const closeModal = (id) => $(id).classList.add('hidden');
$('menuBtn').onclick = () => { $('m_name').value = G.slotName || ''; openModal('menu'); };
$('m_resume').onclick = () => closeModal('menu');
$('m_save').onclick = () => { const v = $('m_name').value.trim(); if (v) G.slotName = v; saveGame(true); };
$('m_copy').onclick = () => { const v = $('m_name').value.trim(); G.slotId = newSlotId(); G.slotName = (v || G.slotName || 'Karte') + ' (Kopie)'; $('m_name').value = G.slotName; saveGame(true); };
$('m_help').onclick = () => { closeModal('menu'); openModal('help'); };
$('m_mgmt').onclick = () => { closeModal('menu'); openMgmt(); };
$('m_time').onclick = () => { closeModal('menu'); openTimeModal(); };
$('h_close').onclick = () => closeModal('help');
$('m_new').onclick = () => {
  saveGame();
  closeModal('menu');
  if (G.playing) exitPlay();
  ['hud', 'hint', 'toolbar', 'toolpanel', 'camBtns', 'minimap', 'sidepanel'].forEach((id) => $(id).classList.add('hidden'));
  clearPending();
  $('start').classList.remove('hidden'); $('custom').classList.add('hidden'); $('realPanel').classList.add('hidden'); $('slotsPanel').classList.add('hidden'); $('startChoice').classList.remove('hidden'); updateLegend();
  showContinue(); setTimeout(refreshSlotsInfo, 400);
};
segInit('qualSeg', (v) => { quality = v; applyQuality(); });

// ---------------- device: touch (phone/tablet) or desktop (mouse & keyboard) ----------------
G.device = (() => { try { const v = localStorage.getItem('bb-device'); if (v === 'touch' || v === 'desk') return v; } catch (e) { /* ignore */ } return window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'touch' : 'desk'; })();
function applyDevice() {
  document.body.classList.toggle('desk', G.device === 'desk');
  document.body.classList.toggle('touch', G.device !== 'desk');
  segSet('devSeg', G.device); segSet('devSeg2', G.device);
  controls.zoomToCursor = G.device === 'desk';
  updateLegend();
}
G.legendMini = window.innerWidth < 700;
function setDevice(v) { G.device = v; try { localStorage.setItem('bb-device', v); } catch (e) { /* ignore */ } applyDevice(); }
segInit('devSeg', setDevice); segInit('devSeg2', setDevice);
function updateLegend() {
  const el = $('keyLegend'); if (!el) return;
  const show = G.device === 'desk' && G.world && $('start').classList.contains('hidden');
  el.classList.toggle('hidden', !show);
  if (!show) return;
  const head = `<div><b>?</b> ${G.legendMini ? 'Tasten anzeigen' : 'Tasten (klicken zum Einklappen)'}</div>`;
  const play = G.playing;
  const rows = play ? [
    ['W A S D', 'fahren / laufen'], ['Maus ziehen', 'umschauen'], ['Rad', 'Kamera näher/weiter'], ['Leertaste', G.playMode === 'bully' ? 'Fräse hoch/runter' : 'springen'],
    ['Shift', 'Turbo'], ['X', 'bremsen'], ['L', 'Lift fahren'], ['C', 'Kamera wechseln'], ['Esc', 'beenden'],
  ] : [
    ['Links ziehen', 'Karte verschieben'], ['Rechts ziehen', 'Kamera drehen'], ['Shift + Links', 'auch drehen'], ['Mausrad', 'zoomen (zur Maus)'],
    ['W A S D', 'Kamera bewegen'], ['Q / E', 'drehen'], ['R / F', 'neigen'], ['+ / −', 'zoomen'], ['T', 'Übersicht von oben'],
    ['1 – 6', 'Werkzeuge'], ['Esc', 'abbrechen'], ['Entf', 'Objekt löschen'],
    ...(G.tool === 'build' ? [['R / F', 'Objekt drehen (beim Platzieren)'], ['Tab', 'Objekt kopieren'], ['Leertaste', 'Linie / Zaun fertig']] : []),
  ];
  el.innerHTML = head + '<div class="kl">' + rows.map(([k, t]) => `<div><b>${k}</b> ${t}</div>`).join('') + '</div>';
  el.classList.toggle('mini', !!G.legendMini);
}
$('keyLegend').addEventListener('click', () => { G.legendMini = !G.legendMini; updateLegend(); });
applyDevice();
segInit('sndSeg', (v) => { G.sound.unlock(); G.sound.setSfx(v === '1'); });
segInit('musSeg', (v) => { G.sound.unlock(); G.sound.setMusic(v === '1'); });
segSet('sndSeg', G.sound.sfxOn ? 1 : 0); segSet('musSeg', G.sound.musicOn ? 1 : 0);
$('volR').value = Math.round(G.sound.vol * 100); $('volV').textContent = $('volR').value + ' %';
$('volR').addEventListener('input', (e) => { G.sound.setVolume(e.target.value / 100); $('volV').textContent = e.target.value + ' %'; });
segInit('gfxSeg', (v) => {
  try { localStorage.setItem('bb-gfx', v); } catch (e) { /* ignore */ }
  if (G.world && v !== G.gfxBuilt) { saveGame(); const s = G.lastSave; if (s) startGame(s.settings, JSON.parse(JSON.stringify(s))); }
});
segInit('shadowSeg', (v) => { G.shadowUser = true; setShadows(v === '1'); });
function setShadows(on) {
  renderer.shadowMap.enabled = on; sky.sun.castShadow = on;
  scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
}
$('clock').onclick = openTimeModal;
$('money').onclick = openMgmt;
$('guestChip').onclick = openMgmt;
for (const id of ['timeModal', 'mgmtModal', 'menu', 'help']) $(id).addEventListener('click', (e) => { if (e.target.id === id) closeModal(id); });

function openTimeModal() {
  const b = $('timeBody');
  const pl = livePlace(), ln = G.weatherLive ? liveNow() : null;
  const hm = (v) => String(Math.floor(v)).padStart(2, '0') + ':' + String(Math.floor((v % 1) * 60)).padStart(2, '0');
  const wxBox = pl ? `<div id="tmWxBox" class="${G.wxBoxOpen || G.weatherLive ? '' : 'hidden'}" style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 10px;margin:6px 0">
      ${G.weatherLive && ln ? `<div class="small" style="margin:0 0 6px">🌍 Echtes Wetter ${pl.name}: <b>${WX_TEXT(ln.code)}, ${Math.round(ln.temp)} °C</b>${G.liveWx.elev != null ? ' (auf ' + Math.round(G.liveWx.elev) + ' m)' : ''} · geholt am ${new Date(G.liveWx.got).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}. ${G.timeLive ? 'Folgt der echten Uhrzeit.' : 'Folgt der Spielzeit (Wetter vom ersten Tag).'}</div>` : G.weatherLive ? `<div class="small" style="margin:0 0 6px">⚠️ Die Wetterdaten sind abgelaufen (sie reichen 3 Tage). Hol sie neu.</div>` : ''}
      <div class="btnrow" style="margin:0"><button class="btn blue" id="tmWxFetch">🔄 Wetter holen</button></div>
      <div class="small" id="tmWxMsg"></div>
      <div id="tmWxPaste" class="${G.wxPaste ? '' : 'hidden'}">
        <div class="small">Das Spiel darf hier nicht selbst ins Internet. So geht es trotzdem:<br>1. <a href="${weatherUrl(pl.lat, pl.lon)}" target="_blank" rel="noopener" style="color:#7cc4ff">Wetter-Seite für ${pl.name} öffnen</a><br>2. Dort alles markieren und kopieren<br>3. Hier einfügen und „Übernehmen“ tippen</div>
        <textarea id="tmWxText" rows="3" style="width:100%;box-sizing:border-box;border-radius:8px;background:#0e1620;color:#dce7f2;border:1px solid #33495e;font-size:12px" placeholder="Hier den Text der Wetter-Seite einfügen"></textarea>
        <div class="btnrow" style="margin:4px 0 0"><button class="btn" id="tmWxUse">✅ Übernehmen</button></div>
      </div></div>` : '';
  const lens = [[10, '10 Min.'], [30, '30 Min.'], [60, '1 Std.'], [1440, '1 Tag'], [10080, '1 Woche']];
  b.innerHTML = `<h2>🌤️ Zeit & Wetter</h2>
    <label class="lbl">Jahreszeit</label>
    <div class="seg" id="tmSeason"><button data-v="0" class="${G.season === 0 ? 'on' : ''}">❄️ Winter</button><button data-v="1" class="${G.season === 1 ? 'on' : ''}">☀️ Sommer</button></div>
    <label class="lbl">Jahreszeiten wechseln</label>
    <div class="seg" id="tmSMode"><button data-v="manual" class="${G.seasonMode === 'manual' ? 'on' : ''}">Von Hand</button><button data-v="auto" class="${G.seasonMode === 'auto' ? 'on' : ''}">Automatisch</button></div>
    <div id="tmLenWrap" class="${G.seasonMode === 'auto' ? '' : 'hidden'}"><label class="lbl">Dauer einer Jahreszeit (echte Zeit)</label>
    <div class="seg" id="tmLen">${lens.map(([v, n]) => `<button data-v="${v}" class="${G.seasonLen === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <label class="lbl">Uhrzeit</label>
    <div class="seg" id="tmLive"><button data-v="0" class="${!G.timeLive ? 'on' : ''}">🎮 Spielzeit</button><button data-v="1" class="${G.timeLive ? 'on' : ''}">🕐 Live${pl ? ' wie jetzt in ' + pl.name.split(/[ –-]/)[0] : ' (deine Uhrzeit)'}</button></div>
    ${G.timeLive ? `<div class="small">Die Zeit läuft wie in echt${pl ? ' in ' + pl.name : ''}: jetzt ${hm(liveHour(pl))} Uhr. Ein Spieltag dauert 24 Stunden.</div>` : ''}
    <label class="lbl">Tageszeit: <b id="tmTimeV">${hm(G.time)}</b></label>
    <div class="row"><input type="range" id="tmTime" min="0" max="23.75" step="0.25" value="${G.time}"></div>
    <div class="seg" id="tmQuick"><button data-v="7">🌅 Morgen</button><button data-v="12">☀️ Mittag</button><button data-v="18.5">🌇 Abend</button><button data-v="22">🌙 Nacht</button></div>
    <div class="${G.timeLive ? 'hidden' : ''}"><label class="lbl">Zeit läuft</label>
    <div class="seg" id="tmAuto"><button data-v="1" class="${G.timeAuto ? 'on' : ''}">▶ Ja</button><button data-v="0" class="${!G.timeAuto ? 'on' : ''}">⏸ Angehalten</button></div>
    <label class="lbl">Länge eines Tages: <b id="tmDayV">${G.dayMin} Min.</b></label>
    <div class="row"><input type="range" id="tmDay" min="4" max="60" step="1" value="${G.dayMin}"></div></div>
    <label class="lbl">Wetter</label>
    <div class="seg" id="tmWeather">${pl ? `<button data-v="live" class="${G.weatherLive ? 'on' : ''}">🌍 Echt</button>` : ''}<button data-v="auto" class="${G.weatherAuto && !G.weatherLive ? 'on' : ''}">🎲 Zufall</button><button data-v="sonne" class="${!G.weatherAuto && !G.weatherLive && G.weather === 'sonne' ? 'on' : ''}">☀️ Sonne</button><button data-v="wolken" class="${!G.weatherAuto && !G.weatherLive && G.weather === 'wolken' ? 'on' : ''}">☁️ Wolken</button><button data-v="${G.season === 0 ? 'schnee' : 'regen'}" class="${!G.weatherAuto && !G.weatherLive && (G.weather === 'schnee' || G.weather === 'regen') ? 'on' : ''}">${G.season === 0 ? '🌨️ Schnee' : '🌧️ Regen'}</button>${G.season === 0 ? `<button data-v="starkschnee" class="${!G.weatherAuto && !G.weatherLive && G.weather === 'starkschnee' ? 'on' : ''}">❄️ Starker Schneefall</button>` : ''}</div>
    ${wxBox}
    <div class="small">Temperatur jetzt: ${temperature()} °C · Tag ${G.day}</div>
    <button class="big b-blue center" id="tmOk">OK</button>`;
  openModal('timeModal');
  segInit('tmSeason', (v) => { applySeason(+v); if ((G.weather === 'schnee' || G.weather === 'starkschnee') && +v === 1) G.weather = 'regen'; if (G.weather === 'regen' && +v === 0) G.weather = 'schnee'; openTimeModal(); });
  segInit('tmSMode', (v) => { G.seasonMode = v; G.seasonElapsed = 0; $('tmLenWrap').classList.toggle('hidden', v !== 'auto'); });
  segInit('tmLen', (v) => { G.seasonLen = +v; G.seasonElapsed = 0; });
  segInit('tmAuto', (v) => { G.timeAuto = v === '1'; });
  segInit('tmQuick', (v) => { G.timeLive = false; G.time = +v; $('tmTime').value = v; $('tmTimeV').textContent = String(Math.floor(v)).padStart(2, '0') + ':' + String(Math.floor((v % 1) * 60)).padStart(2, '0'); });
  segInit('tmWeather', (v) => {
    if (v === 'live') {
      G.wxBoxOpen = true;
      if (G.liveWx && wxIndex(G.liveWx, new Date(), G.timeLive ? null : G.time) >= 0) { G.weatherLive = true; G.weatherAuto = false; wxT = 99; liveWeatherTick(0); openTimeModal(); return; }
      $('tmWxBox').classList.remove('hidden'); $('tmWxFetch').click(); return;
    }
    G.weatherLive = false; G.wxBoxOpen = false; if ($('tmWxBox') && !G.weatherLive) $('tmWxBox').classList.add('hidden');
    if (v === 'auto') { G.weatherAuto = true; rollWeather(); } else { G.weatherAuto = false; G.weather = v; }
  });
  segInit('tmLive', (v) => { G.timeLive = v === '1'; if (G.timeLive) { G.time = liveHour(livePlace()); wxT = 99; } openTimeModal(); });
  if ($('tmWxFetch')) $('tmWxFetch').onclick = async () => {
    $('tmWxMsg').textContent = '⏳ Wetter wird geholt …';
    const ok = await tryFetchWeather(true);
    if (ok) { G.wxPaste = false; openTimeModal(); return; }
    G.wxPaste = true; $('tmWxMsg').textContent = ''; $('tmWxPaste').classList.remove('hidden');
  };
  if ($('tmWxUse')) $('tmWxUse').onclick = () => {
    try { setLiveWx(parseWeather($('tmWxText').value)); G.wxPaste = false; toast('🌍 Echtes Wetter übernommen'); openTimeModal(); } catch (e) { $('tmWxMsg').textContent = '❌ ' + e.message; }
  };
  $('tmTime').oninput = (e) => { if (G.timeLive) { G.timeLive = false; const sl = $('tmLive'); if (sl) sl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === '0')); } G.time = +e.target.value; $('tmTimeV').textContent = String(Math.floor(G.time)).padStart(2, '0') + ':' + String(Math.floor((G.time % 1) * 60)).padStart(2, '0'); };
  $('tmDay').oninput = (e) => { G.dayMin = +e.target.value; $('tmDayV').textContent = G.dayMin + ' Min.'; };
  $('tmOk').onclick = () => { closeModal('timeModal'); saveSoon(); };
}

let limCache = null, limT = -1;
function limits(force = false) {
  if (!force && limCache && elapsed - limT < 2) return limCache;
  limT = elapsed;
  limCache = computeLimits();
  return limCache;
}
function computeLimits() {
  const beds = G.villageBeds + G.objects.beds();
  const cap = G.lifts.filter((l) => l.running && l.seasonOk).reduce((s, l) => s + l.capacity, 0);
  const a = G.season === 0 ? G.tv.countArea('piste') : G.tv.countArea('trail');
  const ha = G.season === 0 ? (a[1] + a[2] + a[3] + (a[5] + a[6]) * 0.6) / 1e4 : (a[1] + a[2] + a[3] + a[4]) / 1e4;
  const area = Math.round(ha * (G.season === 0 ? 12 : 60));
  const liftL = Math.round(cap / 8);
  const priceF = clamp(1.7 - G.ticket / 80, 0.25, 1.3);
  const pa = G.tv.countArea('piste');
  const pisteHa = (pa[1] + pa[2] + pa[3]) / 1e4;
  const repF = G.mode === 'normal' ? (0.35 + 0.8 * (G.rep ?? 0.7)) * (0.5 + 0.5 * (G.sat ?? 70) / 100) : 1;
  // sandbox: no money, but a small resort still only attracts a few guests
  const sandLimit = Math.round(Math.min(liftL, area));
  return { pisteHa, beds, liftL, area, priceF, repF, sandLimit, limit: Math.round(Math.min(beds, liftL, area) * priceF * repF) };
}
function openMgmt() {
  const b = $('mgmtBody');
  const L = limits(true);
  const normal = G.mode === 'normal';
  const winter = G.season === 0;
  const q = snowQuality(); const f = satFactors(q);
  const pct = (v) => Math.round(v * 100) + ' %';
  const bar = (v, good = 0.7, ok = 0.45) => `<div class="qbar"><i style="width:${Math.round(clamp(v, 0, 1) * 100)}%;background:${v >= good ? '#2ecc71' : v >= ok ? '#f1c40f' : '#e74c3c'}"></i></div>`;
  let lim = '';
  if (normal) {
    const m = Math.min(L.beds, L.liftL, L.area);
    const why = m === L.beds ? 'Zu wenig Betten: Baue Hotels und Chalets.' : m === L.liftL ? 'Zu wenig Lift-Kapazität: Baue mehr oder grössere Lifte.' : winter ? 'Zu wenig Pisten: Male mehr Pisten.' : 'Zu wenig Wege: Male Wanderwege und Bike-Trails.';
    lim = `<div class="small">Mögliche Gäste: <b>${L.limit}</b> (Ruf ${pct(G.rep ?? 0.7)}). Begrenzt durch: ${why}</div>`;
  }
  const tab = G.mgTab || 'over';
  const tabs = [['over', '📊 Übersicht'], ['snow', '❄️ Schnee'], ['guests', '😀 Gäste'], ['money', '💰 Preise']];
  let body = '';
  if (tab === 'over') {
    body = `<div class="stats">
      <div><span>Lifte</span><b>${G.lifts.length}</b></div>
      <div><span>Förderleistung</span><b>${G.lifts.reduce((s2, l) => s2 + l.capacity, 0).toLocaleString('de-CH')} P/h</b></div>
      <div><span>Gäste jetzt</span><b>${G.guests.count}</b></div>
      <div><span>Betten</span><b>${L.beds}</b></div>
      <div><span>${winter ? 'Pisten' : 'Wege'}</span><b>${winter ? (G.tv.countArea('piste').slice(1).reduce((a2, x) => a2 + x, 0) / 1e4).toFixed(1) + ' ha' : (G.tv.countArea('trail').slice(1).reduce((a2, x) => a2 + x, 0) / 1e4).toFixed(1) + ' ha'}</b></div>
      <div><span>Temperatur Berg</span><b>${Math.round(mountainTemp())} °C</b></div>
    </div>
    <label class="lbl">Gäste-Zufriedenheit ${normal ? '' : '(nur Info im Sandbox)'}: <b>${Math.round(G.sat ?? 70)} %</b></label>${bar((G.sat ?? 70) / 100)}
    ${winter ? `<label class="lbl">Schneequalität: <b>${pct(q.total)}</b></label>${bar(q.total)}` : ''}
    ${nightSkiHTML('mgNight')}
    <label class="lbl">${normal ? 'Gäste (Wunsch)' : 'Gäste auf der Piste'}: <b id="mgGV">${G.guestTarget}</b></label>
    <div class="row"><input type="range" id="mgG" min="0" max="1200" step="10" value="${G.guestTarget}"></div>
    ${lim}`;
  } else if (tab === 'snow') {
    const roadS = G.traffic.avgSnow();
    const tM = mountainTemp();
    const run = G.cannons.on;
    body = winter ? `
    <div class="stats">
      <div><span>Naturschnee</span><b>${Math.round(G.snowNat)} cm</b></div>
      <div><span>Technischer Schnee</span><b>${Math.round(G.snowMade)} cm</b></div>
      <div><span>Pisten bedeckt</span><b>${pct(q.cover)}</b></div>
      <div><span>Präparierung</span><b>${pct(q.groom)}</b></div>
      <div><span>Temperatur Berg</span><b>${Math.round(tM)} °C</b></div>
      <div><span>Strasse verschneit</span><b>${pct(roadS)}</b></div>
    </div>
    ${(() => { const sv = services(); const nm = G.mode === 'normal'; const row = (ok, txt) => `<div class="small">${ok ? '✅' : '⚠️'} ${txt}</div>`; return `<label class="lbl">🛠️ Dienstgebäude (Bauen → Dienste)</label>` +
      row(!nm || sv.garages > 0, `Pistenbully-Garage: ${sv.garages}${nm ? ' · Platz für ' + sv.groomCap + ' Bullys' + (sv.garages ? '' : ' – ohne Garage wird nicht präpariert!') : ''}`) +
      row(!nm || sv.werkhof > 0, `Werkhof: ${sv.werkhof}${nm ? ' · ' + sv.ploughCap + ' Schneepflüge möglich' + (sv.werkhof ? '' : ' – ohne Werkhof keine Schneeräumung!') : ''}`) +
      row(sv.rega + sv.sanitaet > 0 || !nm, `Rettung: ${sv.rega ? 'Heli-Basis 🚁' : sv.sanitaet ? 'Pistenrettung 🚑' : 'keine'}${nm && !(sv.rega + sv.sanitaet) ? ' – Verletzte warten lange, Gäste sind sauer!' : ''}`); })()}
    <label class="lbl">❄️ Beschneiung (${G.cannons.list.length} Schneekanonen) · ${run ? '<b style="color:#7fd3ff">läuft</b>' : 'steht'}</label>
    <div class="seg" id="mgSnow"><button data-v="off" class="${G.snowMode === 'off' ? 'on' : ''}">Aus</button><button data-v="auto" class="${G.snowMode === 'auto' ? 'on' : ''}">Automatisch</button><button data-v="on" class="${G.snowMode === 'on' ? 'on' : ''}">Immer an</button></div>
    <div class="small">Kanonen brauchen Kälte: ab −2 °C gut, über 0 °C geht nichts. „Automatisch“ beschneit nachts und wenn zu wenig Schnee liegt. ${G.cannons.list.length ? '' : '<b>Baue zuerst Schneekanonen (Bauen → Schnee).</b>'} ${normal ? 'Kosten: ca. ' + fmtMoney(22 * 24) + ' pro Kanone und Tag Betrieb.' : ''}</div>
    <label class="lbl">🚜 Pistenpräparierung: ${pct(q.groom)}</label>${bar(q.groom)}
    <div class="twr"><button class="btn" id="mgS-">−</button><div class="mid">${G.staff} Pistenbully-Fahrer${normal ? ' · ' + fmtMoney(G.staff * 420) + '/Tag' : ''}</div><button class="btn" id="mgS+">＋</button></div>
    <label class="lbl">Farbe der Pistenbullys</label>
    <div class="seg" id="mgBullyCol">${[['blau', '🔵 Blau'], ['rot', '🔴 Rot'], ['mix', '🎨 Gemischt']].map(([k, n]) => `<button data-v="${k}" class="${(G.bullyColor || 'rot') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <label class="lbl">Start der Präparierung</label>
    <div class="seg" id="mgGroom"><button data-v="16.75" class="${(G.groomFrom || 16.75) === 16.75 ? 'on' : ''}">16:45</button><button data-v="18" class="${G.groomFrom === 18 ? 'on' : ''}">18:00</button><button data-v="19.5" class="${G.groomFrom === 19.5 ? 'on' : ''}">19:30</button></div>
    <div class="small">Früh starten = mehr Zeit, die Pisten werden besser. Ohne Fahrer bleiben die Pisten abgefahren. Tagsüber fahren die Gäste den Cord ab.</div>
    <label class="lbl">🚛 Schneeräumung Strasse: ${pct(roadS)} Schnee</label>${bar(1 - roadS, 0.8, 0.55)}
    <div class="seg" id="mgPlough"><button data-v="0" class="${G.traffic.ploughCount === 0 ? 'on' : ''}">Keine</button><button data-v="1" class="${G.traffic.ploughCount === 1 ? 'on' : ''}">1 Pflug</button><button data-v="2" class="${G.traffic.ploughCount === 2 ? 'on' : ''}">2</button><button data-v="3" class="${G.traffic.ploughCount === 3 ? 'on' : ''}">3</button></div>
    <div class="seg" id="mgPloughAuto"><button data-v="1" class="${G.traffic.ploughAuto ? 'on' : ''}">Automatisch räumen</button><button data-v="0" class="${!G.traffic.ploughAuto ? 'on' : ''}">Nur auf Befehl</button></div>
    <button class="big b-dark center" id="mgPloughGo">🚛 Jetzt räumen</button>
    <div class="small">Wenn die Strasse nicht geräumt ist, fahren die Autos langsam und die Gäste ärgern sich über die Anreise.${normal ? ' Pflug: ' + fmtMoney(300) + '/Tag.' : ''}</div>`
      : '<div class="small">Im Sommer gibt es keinen Schnee zu verwalten. ☀️</div>';
  } else if (tab === 'guests') {
    const rows = [['❄️ Schnee & Pisten', f.snow], ['🚡 Wartezeit Lifte', f.queue], ['👥 Platz auf den Pisten', f.crowd], ['💰 Preis', f.price], ['🚗 Anreise', f.access], ['🎯 Abwechslung', f.variety], ['🌤️ Wetter', f.weather]];
    const rv = (G.reviews || []).slice().reverse();
    body = `<label class="lbl">Zufriedenheit: <b>${Math.round(G.sat ?? 70)} %</b> · Ruf: <b>${pct(G.rep ?? 0.7)}</b></label>${bar((G.sat ?? 70) / 100)}
      ${rows.map(([n, v]) => `<div class="frow"><span>${n}</span>${bar(v)}<b>${pct(v)}</b></div>`).join('')}
      <label class="lbl">💬 Was die Gäste sagen</label>
      ${rv.length ? rv.map((r) => `<div class="review"><span>${'⭐'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span> „${r.txt}“ <i>Tag ${r.day}</i></div>`).join('') : `<div class="small">${normal ? 'Noch keine Bewertungen. Die Gäste schreiben während der Skisaison.' : 'Bewertungen gibt es nur im Normal-Modus.'}</div>`}
      <div class="small">Zufriedene Gäste machen einen guten Ruf. Mit gutem Ruf kommen mehr Gäste.</div>`;
  } else {
    const r = G.report;
    body = normal ? `<label class="lbl">Ticketpreis (Winter): <b id="mgTV">${G.ticket} CHF</b></label><div class="row"><input type="range" id="mgT" min="20" max="140" step="1" value="${G.ticket}"></div>
      <div class="small">Teurer = mehr Geld pro Gast, aber weniger Gäste und unzufriedener, wenn das Angebot klein ist. Im Sommer kostet das Ticket weniger als die Hälfte.</div>
      ${r ? `<div class="small">Letzter Tag (${r.day}): ${r.visitors} Gäste · Zufriedenheit ${r.sat ?? '–'} % · Einnahmen ${fmtMoney(r.revenue)} · Kosten ${fmtMoney(r.cost)} (Lifte ${fmtMoney(r.liftCost)}, Personal ${fmtMoney(r.staffCost)}, Beschneiung ${fmtMoney(r.snowCost)}, Dienstgebäude ${fmtMoney(r.serviceCost || 0)})</div>` : '<div class="small">Die erste Tagesabrechnung kommt um Mitternacht.</div>'}`
      : '<div class="small">Sandbox: Unendlich Geld, keine Kosten. Schnee, Präparierung und Schneeräumung kannst du trotzdem im Tab „Schnee“ steuern.</div>';
  }
  b.innerHTML = `<h2>🏢 Betriebszentrale</h2>
    <div class="seg tabs" id="mgTab">${tabs.map(([k, n]) => `<button data-v="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${body}
    <button class="big b-blue center" id="mgOk">OK</button>`;
  openModal('mgmtModal');
  segInit('mgTab', (v) => { G.mgTab = v; openMgmt(); });
  const bind = (id, fn) => { const e = $(id); if (e) fn(e); };
  if ($('mgNight')) segInit('mgNight', (v) => { G.nightSkiMode = v; saveSoon(); setTimeout(openMgmt, 30); });
  if ($('mgSnow')) segInit('mgSnow', (v) => { G.snowMode = v; saveSoon(); setTimeout(openMgmt, 50); });
  if ($('mgGroom')) segInit('mgGroom', (v) => { G.groomFrom = +v; saveSoon(); });
  if ($('mgPlough')) segInit('mgPlough', (v) => { G.traffic.ploughCount = +v; saveSoon(); });
  if ($('mgPloughAuto')) segInit('mgPloughAuto', (v) => { G.traffic.ploughAuto = v === '1'; saveSoon(); });
  bind('mgPloughGo', (e) => e.onclick = () => { if (!G.traffic.ploughCount) { toast('Zuerst mindestens 1 Pflug wählen'); return; } G.traffic.sendPloughs(); toast('🚛 Schneepflug ist unterwegs!'); });
  bind('mgG', (e) => e.oninput = () => { G.guestTarget = +e.value; $('mgGV').textContent = G.guestTarget; });
  bind('mgT', (e) => e.oninput = () => { G.ticket = +e.value; $('mgTV').textContent = G.ticket + ' CHF'; });
  if ($('mgBullyCol')) segInit('mgBullyCol', (v) => { G.bullyColor = v; G.groomers.setColors(v); saveSoon(); });
  bind('mgS-', (e) => e.onclick = () => { G.staff = Math.max(0, G.staff - 1); openMgmt(); });
  bind('mgS+', (e) => e.onclick = () => { G.staff = Math.min(40, G.staff + 1); openMgmt(); });
  $('mgOk').onclick = () => { closeModal('mgmtModal'); saveSoon(); };
}

// ---------------- network rebuild (guests, markers, berms) ----------------
let netTimer = 0, netPiste = false;
function scheduleNetwork(piste = false) {
  netPiste = netPiste || piste;
  clearTimeout(netTimer);
  netTimer = setTimeout(() => {
    if (!G.world) return;
    G.guests.rebuild(G.lifts);
    G.peds.setLifts(G.lifts);
    if (netPiste) { G.markers.update(); G.tv.rebuildBerms(); netPiste = false; buildMinimapPaint(); }
  }, 450);
}

// ---------------- input ----------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function rayFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}
function groundHit(e) { return G.tv ? G.tv.raycast(rayFromEvent(e)) : null; }

const pointers = new Map();
let down = null, painting = false, orbit = null;
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (G.playing) {
    if (pointers.size === 1) orbit = { x: e.clientX, y: e.clientY };
    else { const [a, b] = [...pointers.values()]; orbit = { pinch: Math.hypot(a.x - b.x, a.y - b.y), dist: G.player.camDist }; }
    return;
  }
  if (pointers.size > 1) { painting = false; down = null; if (marking) { marking = null; G.marks.preview(null); } if (pointers.size === 2 && e.pointerType === 'touch') gest = gestState(); return; }
  down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
  if (isMarking() && e.button === 0 && !G.pending) { markStart(e); return; }
  if ((G.tool === 'piste' || G.tool === 'trees') && e.button === 0 && !G.pending) { painting = true; brush(e); }
});
canvas.addEventListener('pointermove', (e) => {
  lastMoveEv = { clientX: e.clientX, clientY: e.clientY };
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (G.playing && orbit) {
    if (pointers.size >= 2 && orbit.pinch) { const [a, b] = [...pointers.values()]; G.player.camDist = clamp(orbit.dist * orbit.pinch / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 3, 60); }
    else if (pointers.size === 1 && !orbit.pinch) { G.player.camYaw -= (e.clientX - orbit.x) * 0.008; G.player.camPitch = clamp(G.player.camPitch + (e.clientY - orbit.y) * 0.005, -0.1, 1.3); orbit.x = e.clientX; orbit.y = e.clientY; }
    return;
  }
  if (gest && pointers.size === 2) {
    const n = gestState();
    if (n.d > 10 && gest.d > 10) zoomCam(clamp(gest.d / n.d, 0.8, 1.25));
    let da = n.ang - gest.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
    rotateCam(da);
    const dy = n.cy - gest.cy;
    if (Math.abs(n.d - gest.d) < Math.abs(dy) * 1.5) tiltCam(-dy * 0.006);
    gest = n;
    return;
  }
  if (marking && pointers.size === 1) { markMove(e); return; }
  if (painting && pointers.size === 1) brush(e);
});
let gest = null;
function gestState() { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) gest = null;
  if (G.playing) { if (!pointers.size) orbit = null; return; }
  if (marking) { markEnd(); down = null; return; }
  if (painting) { painting = false; G.levelPrev = null; G.waterDone = false; if (G.tool === 'piste') { if (terraBox) finishTerraform(); scheduleNetwork(true); saveSoon(); refreshPads(); } if (G.tool === 'trees') { if (G.natMode === 'terrain') finishTerraform(); else { saveSoon(); limits(true); } } renderToolPanel(); }
  if (down && e.type === 'pointerup') {
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved < 10 && performance.now() - down.t < 600 && down.button === 0) tap(e);
  }
  down = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { if (G.playing) { G.player.camDist = clamp(G.player.camDist * (e.deltaY > 0 ? 1.12 : 0.89), 3, 60); e.preventDefault(); } }, { passive: false });

// --- course markings (thin dye lines)
let marking = null;
function isMarking() { return G.tool === 'trees' && G.natMode === 'paint' && G.surfType === 'mark'; }
function markStart(e) {
  const p = groundHit(e); if (!p) return;
  const mode = G.markMode || 'line';
  marking = { mode, pts: [{ x: p.x, z: p.z }] };
  if (mode === 'erase') { if (G.marks.erase(p.x, p.z, Math.max(0.6, (G.markW || 0.3) * 2))) marking.changed = true; }
}
function markMove(e) {
  const m = marking, p = groundHit(e); if (!p) return;
  const w = G.markW || 0.3, c = G.markCol || 'blau';
  if (m.mode === 'erase') { if (G.marks.erase(p.x, p.z, Math.max(0.6, w * 2))) m.changed = true; return; }
  if (m.mode === 'free') {
    const l = m.pts[m.pts.length - 1];
    if (Math.hypot(p.x - l.x, p.z - l.z) < Math.max(0.2, w * 0.8)) return;
    m.pts.push({ x: p.x, z: p.z });
    G.marks.preview(m.pts, w, c, false, true);
  } else {
    m.pts[1] = { x: p.x, z: p.z };
    G.marks.preview(m.pts, w, c, m.mode === 'dash', false);
    const L = Math.hypot(m.pts[1].x - m.pts[0].x, m.pts[1].z - m.pts[0].z);
    hint(L.toFixed(1) + ' m');
  }
}
function markEnd() {
  const m = marking; marking = null;
  G.marks.preview(null);
  if (!m) return;
  if (m.mode === 'erase') { if (m.changed) { saveSoon(); renderToolPanel(); } return; }
  if (m.pts.length < 2) return;
  const w = G.markW || 0.3;
  if (G.mode === 'normal' && !canPay(50)) { toast('Zu wenig Geld'); return; }
  const L = G.marks.add(m.pts, w, G.markCol || 'blau', m.mode === 'dash', m.mode === 'free');
  if (L && G.mode === 'normal') pay(L * Math.max(1, w / 0.5));
  saveSoon(); renderToolPanel();
}
let lastBrush = 0, terraRef = null, terraBox = null, lastBrushE = null;

function finishTerraform() {
  const b = terraBox; terraBox = null; terraRef = null;
  if (!b) return;
  const pad = 30;
  const inBox = (x, z) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
  G.trees.rebuild(); G.rocks.rebuild();
  for (const l of G.lifts) {
    let hit = false;
    for (let d = 0; d <= l.L && !hit; d += 15) { const p = l.pointAt(d); if (inBox(p.x, p.z)) hit = true; }
    if (hit) { l.computeGeometry(); if (l.autoTowers) l.autoPlaceTowers(); l.rebuild(); }
  }
  for (const o of [...G.objects.list]) if (!o.line && inBox(o.x, o.z)) G.objects.rotate(o, o.yaw);
  for (const c of G.cannons.list) if (inBox(c.x, c.z)) { c.g.position.y = heightAt(G.world, c.x, c.z); G.cannons.placePile(c); }
  G.tv.geo.computeBoundingSphere();
  G.guests.refreshHeights();
  if (G.marks.strokes.length) G.marks.refresh();
  if (G.ponds.list.length) { G.ponds.invalidate(); G.ponds.build(); }
  else G.ponds.invalidate();
  scheduleNetwork(true); buildMinimapBase(); saveSoon();
}
let PX_AREA = 4000 * 4000 / (2048 * 2048);
let SURF_PX_AREA = 4000 * 4000 / (1024 * 1024);
const SURF_TYPES = [[2, '🛣️ Strasse'], [3, '🟫 Kiesweg'], [1, '🪨 Fels'], [4, '🧊 Eis (hellblau)'], [5, '🌱 Wiese'], [0, '🧽 Radieren']];
const SURF_COST = { 1: 4, 2: 45, 3: 15, 4: 3, 5: 2 };
function brush(e) {
  const now = performance.now();
  if (now - lastBrush < 28) return;
  lastBrush = now;
  lastBrushE = { clientX: e.clientX, clientY: e.clientY };
  const p = groundHit(e); if (!p) return;
  if (G.tool === 'piste') {
    if (G.season === 0) {
      if (G.pisteMode !== 0 && !canPay(500)) { toast('Zu wenig Geld für neue Pisten'); return; }
      const changed = G.tv.paint(p.x, p.z, G.pisteSize / 2, G.pisteMode, 'piste');
      if (changed && G.pisteMode !== 0) pay(changed * PX_AREA * 6);
      if (G.pisteMode !== 0 && changed) { G.trees.removeCircle(p.x, p.z, G.pisteSize / 2 + 3); G.rocks.removeCircle(p.x, p.z, G.pisteSize / 2 + 2); }
      // smooth the ground under the brush while painting (not freeride / eraser, not at lift stations)
      if (G.pisteSmooth && G.pisteMode !== 0 && G.pisteMode !== 4 && !G.lifts.some((l) => Math.hypot(p.x - l.A.x, p.z - l.A.z) < 28 || Math.hypot(p.x - l.B.x, p.z - l.B.z) < 28)) {
        // the stroke direction: from the last brush point
        const lp = G.levelPrev;
        if (lp && Math.hypot(p.x - lp.x, p.z - lp.z) > 1.5) {
          const box = G.tv.levelAcross(p.x, p.z, p.x - lp.x, p.z - lp.z, G.pisteSize / 2, 0.3);
          if (box) terraBox = terraBox ? { x0: Math.min(terraBox.x0, box.x0), x1: Math.max(terraBox.x1, box.x1), z0: Math.min(terraBox.z0, box.z0), z1: Math.max(terraBox.z1, box.z1) } : box;
          if (G.mode === 'normal') pay(Math.PI * (G.pisteSize / 2) ** 2 * 0.02);
        }
        if (!lp || Math.hypot(p.x - lp.x, p.z - lp.z) > 1.5) G.levelPrev = { x: p.x, z: p.z };
      }
    } else {
      if (G.trailMode !== 0 && !canPay(200)) { toast('Zu wenig Geld'); return; }
      const changed = G.tv.paint(p.x, p.z, G.trailSize / 2, G.trailMode, 'trail');
      if (changed && G.trailMode !== 0) pay(changed * PX_AREA * 3);
      if (G.trailMode !== 0 && changed) { G.trees.removeCircle(p.x, p.z, G.trailSize / 2 + 1.5); G.rocks.removeCircle(p.x, p.z, G.trailSize / 2 + 1); }
    }
  } else if (G.tool === 'trees' && G.natMode === 'water') {
    if (G.waterDone) return;
    G.waterDone = true;
    if (G.waterMode === 'remove') { const pd = G.ponds.pondAt(p.x, p.z); if (pd) { G.ponds.remove(pd); G.activePond = null; toast('Wasser abgelassen'); saveSoon(); } else toast('Hier ist kein Teich'); renderToolPanel(); return; }
    const pd = G.ponds.pondAt(p.x, p.z);
    if (pd && G.ponds.body(pd) && G.ponds.body(pd).mask[G.ponds.vertexAt(p.x, p.z)]) { G.activePond = pd; renderToolPanel(); return; }
    if (!canPay(20000)) { toast('Zu wenig Geld'); return; }
    const r = G.ponds.add(p.x, p.z);
    if (!r) { toast('Hier ist kein Loch, das Wasser würde einfach abfliessen'); return; }
    G.activePond = r.pond; if (!r.again) pay(20000 + r.body.area * 3);
    toast(`💧 Wasser bis ${Math.round(r.body.level)} m ü. M., ${r.body.depth.toFixed(1)} m tief`);
    renderToolPanel(); saveSoon();
  } else if (G.tool === 'trees' && G.natMode === 'terrain') {
    if (terraRef === null) terraRef = p.y;
    const tcost = Math.PI * (G.terraSize / 2) ** 2 * (G.terraStr / 100) * 0.04;
    if (!canPay(tcost)) { toast('Zu wenig Geld für Erdarbeiten'); return; }
    const box = G.tv.terraform(p.x, p.z, G.terraSize / 2, G.terraMode, G.terraStr / 100, 0.06, terraRef);
    if (box) pay(tcost);
    if (box) terraBox = terraBox ? { x0: Math.min(terraBox.x0, box.x0), x1: Math.max(terraBox.x1, box.x1), z0: Math.min(terraBox.z0, box.z0), z1: Math.max(terraBox.z1, box.z1) } : box;
  } else if (G.tool === 'trees' && G.natMode === 'paint') {
    const t = G.surfType ?? 2, cost = SURF_COST[t] || 0;
    if (cost && !canPay(300)) { toast('Zu wenig Geld'); return; }
    const n = G.tv.paintSurf(p.x, p.z, (G.surfSize || 12) / 2, t);
    if (n && cost) pay(n * SURF_PX_AREA * cost);
    if (n && t >= 1 && t <= 3) G.trees.removeCircle(p.x, p.z, (G.surfSize || 12) / 2 + 1);
  } else if (G.tool === 'trees' && G.natMode === 'houses') {
    houseBrush(p);
  } else if (G.tool === 'trees' && G.natMode === 'rocks') {
    rockBrush(p);
  } else if (G.tool === 'trees') {
    if (G.treeMode === 'add') { if (!canPay(400)) { toast('Zu wenig Geld'); return; } const n0 = G.trees.list.length; G.trees.addCircle(p.x, p.z, G.treeSize / 2); pay(Math.max(0, G.trees.list.length - n0) * 40); } else G.trees.removeCircle(p.x, p.z, G.treeSize / 2);
  }
}

// rock brush: paint or erase boulders (throttled, like the house brush)
let rockT = 0;
function rockBrush(p) {
  const now = performance.now(), R = (G.rockSize || 24) / 2;
  if (G.rockMode === 'remove') { G.rocks.userRemove(p.x, p.z, R); return; }
  if (now - rockT < 90) return;
  rockT = now;
  if (G.mode === 'normal' && !canPay(150)) { toast('Zu wenig Geld'); return; }
  const n = G.rocks.addCircle(p.x, p.z, R, G.rockKind || 'mix');
  if (n && G.mode === 'normal') pay(n * 150);
}

// house brush: scatter chalets / hotels inside the brush, keeping distance to everything
const HOUSE_TYPES = BUILDING_TYPES;
const HOUSE_R = { chalet: 8, chalet_gross: 9.5, hotel: 15, restaurant: 12, steinhaus: 7.5, engadiner: 9, modernhaus: 8, apartment: 13, sportshop: 9.5, kirche: 15, stall: 6.5 };
let houseT = 0;
function houseBrush(p) {
  const now = performance.now();
  if (now - houseT < 110) return;
  houseT = now;
  const R = (G.houseSize || 60) / 2, w = G.world;
  if (G.houseMode === 'remove') {
    for (const o of [...G.objects.list]) if (HOUSE_TYPES.includes(o.type) && Math.hypot(o.x - p.x, o.z - p.z) < R) { G.objects.remove(o); if (G.mode === 'normal') G.money += OBJ_TYPES[o.type].cost * 0.5; }
    // also the houses and barns that came with the map
    if (G.village.removeHousesIn(p.x, p.z, R)) { G.villageBeds = w.villages.reduce((s, v) => s + v.houses.reduce((a, h) => a + (h.removed ? 0 : h.hotel ? 60 : 6), 0), 0); saveSoon(); }
    return;
  }
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    const mix = G.houseMix || 'mix', r0 = Math.random();
    const type = mix === 'hotel' ? (r0 < 0.6 ? 'hotel' : r0 < 0.85 ? 'apartment' : 'chalet_gross') : mix === 'chalet' ? (r0 < 0.75 ? 'chalet' : 'chalet_gross') : mix === 'dorf' ? (r0 < 0.3 ? 'chalet' : r0 < 0.45 ? 'steinhaus' : r0 < 0.6 ? 'engadiner' : r0 < 0.7 ? 'modernhaus' : r0 < 0.8 ? 'chalet_gross' : r0 < 0.87 ? 'sportshop' : r0 < 0.95 ? 'stall' : 'apartment') : (r0 < 0.55 ? 'chalet' : r0 < 0.85 ? 'chalet_gross' : 'hotel');
    const rr = HOUSE_R[type];
    if (!canPay(OBJ_TYPES[type].cost)) { toast('Zu wenig Geld'); return; }
    if (G.trees.blockedAt(x, z, rr * 0.5)) continue;
    const n = normalAt(w, x, z); if (n.y < 0.9) continue;
    let bad = false;
    for (let k = 0; k < 8 && !bad; k++) { const q = k / 8 * Math.PI * 2; if (G.tv.pisteAt(x + Math.cos(q) * rr, z + Math.sin(q) * rr) || G.tv.trailAt(x + Math.cos(q) * rr, z + Math.sin(q) * rr)) bad = true; }
    if (bad || G.tv.pisteAt(x, z)) continue;
    if (G.objects.list.some((o) => Math.hypot(o.x - x, o.z - z) < rr + (HOUSE_R[o.type] || 5) + 2)) continue;
    if (G.lifts.some((l) => l.distToLine(x, z) < rr + 8)) continue;
    if (w.obstacleAt && w.obstacleAt(x, z, rr) > -Infinity) continue;
    // face downhill (the view), snapped a little
    const yaw = Math.atan2(-n.z, n.x) + (Math.random() - 0.5) * 0.3;
    const o = G.objects.add(type, x, z, yaw);
    if (o) { pay(OBJ_TYPES[type].cost); break; }
  }
}

// rebuild lifts whose mast pads changed (pistes painted / switch toggled)
function refreshPads() { G.objects.refreshPads(); for (const l of G.lifts) { if (!l.towerPositions) continue; const sig = l.padSignature(); if (sig !== l.padSig) { l.padSig = sig; l.rebuild(); } } }

function pickAny(e) {
  const ray = rayFromEvent(e);
  raycaster.params.Line.threshold = 2;
  const gh = G.tv.raycast(ray);
  const gd = gh ? ray.origin.distanceTo(new THREE.Vector3(gh.x, gh.y, gh.z)) + 4 : Infinity;
  const hits = raycaster.intersectObjects(G.lifts.map((l) => l.group), true).filter((h) => h.object.visible);
  const ob = G.objects.pick(raycaster);
  let best = null;
  if (hits.length && hits[0].distance <= gd) { const l = G.lifts.find((x) => x.id === hits[0].object.userData.liftId); if (l) best = { lift: l, point: hits[0].point, dist: hits[0].distance }; }
  if (ob && ob.dist <= gd && (!best || ob.dist < best.dist)) best = { obj: ob.obj, dist: ob.dist };
  if (best) return best;
  if (gh) {
    const o = G.objects.nearest(gh.x, gh.z, 5); if (o) return { obj: o };
    let bl = null, bd = 18;
    for (const l of G.lifts) { const d = l.distToLine(gh.x, gh.z); if (d < bd) { bd = d; bl = l; } }
    if (bl) return { lift: bl, point: new THREE.Vector3(gh.x, gh.y, gh.z) };
  }
  return null;
}

function yawFor(type, p) {
  const n = normalAt(G.world, p.x, p.z);
  const dx = camera.position.x - p.x, dz = camera.position.z - p.z;
  const flat = Math.hypot(n.x, n.z) < 0.04;
  if (CANNON_TYPES[type]) return (flat ? Math.atan2(-dx, -dz) : Math.atan2(n.x, n.z)) + G.buildYaw;
  if (OBJ_TYPES[type].tilt) return (flat ? Math.atan2(dz, -dx) : Math.atan2(-n.z, n.x)) + G.buildYaw;
  if (BUILDING_TYPES.includes(type)) return Math.atan2(dx, dz) + G.buildYaw;
  if (['bruecke', 'steinbruecke', 'steg'].includes(type)) {
    let best = null;
    for (const line of [G.world.river, G.world.rail || [], G.world.road]) { if (line.length < 2) continue; const r = nearestOnLine(line, p.x, p.z); if (r.d < 60 && (!best || r.d < best.r.d)) best = { r, line }; }
    if (best) { const a = best.line[best.r.k], b = best.line[best.r.k + 1] || a; const tx = b.x - a.x, tz = b.z - a.z; return Math.atan2(-tx, -tz) + G.buildYaw; }
  }
  return Math.atan2(-dz, dx) + G.buildYaw;
}

function tap(e) {
  if (!G.world) return;
  const t = G.tool;
  const P = G.pending;
  if (P) {
    const p = groundHit(e); if (!p) return;
    if (P.kind === 'addTower' || P.kind === 'moveTower') {
      const l = P.lift;
      if (l.distToLine(p.x, p.z) > 40) { toast('Bitte näher an der Liftlinie tippen'); return; }
      const d = l.projectD(p.x, p.z);
      if (P.kind === 'addTower') { const n = l.addTowerAt(d); if (n < 0) { toast('Hier geht keine Stütze (zu nah an Station oder Stütze)'); return; } G.selTower = n; l.highlightTower(n); }
      else if (l.moveTower(P.i, d) === false) toast('Die Umlenkstütze beim Knick kann nicht verschoben werden');
      if (!P.repeat) clearPending(); else { toast(`Stütze ${l.towers.length} gesetzt`, 1200); scheduleNetwork(); }
      renderLiftPanel(); saveSoon();
    } else if (P.kind === 'addTrackPt') {
      const l = P.lift;
      if (l.distToLine(p.x, p.z) > 40) { toast('Bitte näher an der Strecke tippen'); return; }
      const i = l.addTrackPt(l.projectD(p.x, p.z));
      if (i < 0) { toast('Zu nah an einem anderen Punkt'); return; }
      G.selTP = i; clearPending(); renderLiftPanel(); saveSoon();
    } else if (P.kind === 'moveStation') {
      const l = P.lift;
      if (!l.moveStation(P.which, p.x, p.z)) { toast('So wird der Lift zu kurz oder zu lang'); return; }
      clearCorridor(l); clearPending(); G.selTower = -1; renderLiftPanel(); scheduleNetwork(); saveSoon();
    } else if (P.kind === 'moveObj') {
      G.objects.move(P.obj, p.x, p.z); clearPending(); renderObjPanel(); saveSoon();
    }
    return;
  }
  if (t === 'view') {
    const r = pickAny(e);
    if (r && r.lift) { const tw = r.lift.nearestTower(r.point.x, r.point.z); selectLift(r.lift, !r.lift.autoTowers ? tw : -1); }
    else if (r && r.obj) selectObj(r.obj);
    else closeSide();
    return;
  }
  const p = groundHit(e);
  if (!p) return;
  if (t === 'lift') {
    if (G.preview) return;
    if (!G.liftA) {
      G.liftA = { x: p.x, z: p.z }; G.liftK = []; G.kinkNext = false;
      clearPins(); pin(p);
      renderToolPanel();
      const lt0 = LIFT_TYPES[G.liftType];
      toast(lt0.midSt ? 'Talstation gesetzt. Jetzt die Mittelstation antippen.' : 'Talstation gesetzt. Jetzt die Bergstation antippen.');
    } else {
      const lt = LIFT_TYPES[G.liftType];
      const needM = lt.midSt && !G.liftK.some((q) => q.k === 'm');
      if (G.kinkNext || needM) { addLiftVertex(p, G.kinkNext ? 't' : 'm'); return; }
      const pts = [G.liftA, ...G.liftK, p];
      let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      const minL = lt.Ls * 2 + 30;
      if (L < minL) { toast(`Zu kurz! Mindestens ${minL} m.`); return; }
      if (L > lt.maxLen) { toast(`Zu lang! Höchstens ${(lt.maxLen / 1000).toFixed(lt.maxLen < 1000 ? 2 : 1)} km.`); return; }
      if (!checkLiftVertex(p)) return;
      const l = new Lift(G.world, scene, G.liftType, G.brand, G.liftA, { x: p.x, z: p.z }, { pts: G.liftK, ...liftDefOpts(G.liftType), stStyle: hasStyles(lt) ? G.stStyle || 'auto' : 'auto', twStyleAll: buildTowerStyle(lt) });
      if (!l.shapeOk(lt)) { l.dispose(); toast('So geht das nicht: Abschnitte zu kurz oder die Mittelstation liegt zu nah an einer Endstation'); return; }
      // towers "Selbst setzen": start without any towers (except the fixed ones on bends)
      if (G.towerMode === 'manual' && !['carpet', 'funicular'].includes(lt.kind)) { l.autoTowers = false; l.towers = l.towers.filter((tw) => tw.kink); l.rebuild(); }
      clearPins(); clearLiftPath();
      G.preview = l;
      G.liftA = null; G.liftK = []; G.kinkNext = false;
      showPreviewPanel();
      hint('Vorschau: Bauen oder abbrechen');
    }
  } else if (t === 'build' && G.buildCat === 'strasse') {
    G.roadDraft = G.roadDraft || [];
    const last = G.roadDraft[G.roadDraft.length - 1];
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < 8) { toast('Zu nah am letzten Wegpunkt'); return; }
    G.roadDraft.push({ x: p.x, z: p.z }); drawRoadDraft(); renderToolPanel();
  } else if (t === 'build' && G.buildCat === 'bus') {
    const q = G.buslines.snap(p.x, p.z);
    G.busDraft = G.busDraft || [];
    const last = G.busDraft[G.busDraft.length - 1];
    const way = G.busPt === 'way';
    if (last && Math.hypot(last.x - q.x, last.z - q.z) < (way ? 8 : 40)) { toast('Zu nah am letzten Punkt'); return; }
    G.busDraft.push({ x: q.x, z: q.z, stop: !way });
    drawBusDraft(); renderToolPanel();
    toast(way ? '📍 Wegpunkt für den Bus' : q.road ? '🚏 Haltestelle an der Hauptstrasse' : q.ri != null ? '🚏 Haltestelle an deiner Strasse' : '🚏 Haltestelle gesetzt');
  } else if (t === 'build') {
    if (G.buildRemove) {
      const r = pickAny(e);
      if (r && r.obj) { G.objects.remove(r.obj); toast('Abgerissen'); saveSoon(); } else toast('Hier ist kein Objekt');
      renderToolPanel(); return;
    }
    const ot = OBJ_TYPES[G.buildType];
    if (ot.line) {
      if (!G.lineStart) { G.lineStart = { x: p.x, z: p.z }; pin(p, 0xff7a00); renderToolPanel(); return; }
      const cost = G.objects.lineCost(G.buildType, G.lineStart, p);
      if (!canPay(cost)) { toast('Zu wenig Geld'); return; }
      if (Math.hypot(p.x - G.lineStart.x, p.z - G.lineStart.z) < 2) return;
      pay(cost);
      G.objects.addLine(G.buildType, G.lineStart, p);
      G.lineStart = { x: p.x, z: p.z }; clearPins(); pin(p, 0xff7a00);
      renderToolPanel(); saveSoon();
      return;
    }
    if (!canPay(ot.cost)) { toast('Zu wenig Geld 💸'); return; }
    if (G.activeObj && G.objects.list.includes(G.activeObj)) {
      // move the object that was just built
      G.objects.move(G.activeObj, p.x, p.z);
      placeObjMarker(G.activeObj); renderToolPanel(); saveSoon();
      return;
    }
    // new objects keep the angle of the last placed / turned object (bridges still align to river, rail or road)
    const isBridge = ['bruecke', 'steinbruecke', 'steg'].includes(G.buildType);
    const yaw0 = G.lastYaw != null && !isBridge ? G.lastYaw : yawFor(G.buildType, p);
    const o = G.objects.add(G.buildType, p.x, p.z, yaw0, undefined, G.lastSize || 1);
    if (!o) { toast('Hier geht das nicht'); return; }
    pay(ot.cost); G.sound.place();
    if (!isBridge) G.lastYaw = o.yaw;
    if (G.lastPad && o.pad === undefined && G.objects.updatePad) { o.pad = G.lastPad; G.objects.updatePad(o); }
    if (G.lastLc && (o.type === 'flutlicht' || o.type === 'laterne')) G.objects.setLightColor(o, G.lastLc);
    G.activeObj = o; placeObjMarker(o);
    if (G.collapse['tool:build']) toast('Gebaut! Klapp das Menü auf, um es zu drehen ↻');
    if (ot.season === 'winter' && G.season === 1) toast('Gebaut. Sichtbar im Winter ❄️');
    else if (ot.season === 'summer' && G.season === 0) toast('Gebaut. Sichtbar im Sommer ☀️');
    renderToolPanel(); saveSoon();
  }
}

// Tab while building: keep the object you just placed and take a copy of it (same kind, angle, size,
// pad) that you then put down with the next tap - and Tab again for the next one
function adLabel(i) { const e = adEntry(i); return e.brand !== undefined ? AD_BRANDS[e.brand][0] : 'Eigenes Bild ' + (adImages().indexOf(e.img) + 1); }
function copyActiveObj(ev) {
  const ao = G.activeObj;
  if (!ao || !G.objects.list.includes(ao)) return false;
  const ot = OBJ_TYPES[ao.type];
  if (!ot || ot.line) return false;
  if (!canPay(ot.cost)) { toast('Zu wenig Geld 💸'); return true; }
  let p = ev ? groundHit(ev) : null;
  if (!p || Math.hypot(p.x - ao.x, p.z - ao.z) < 1.5) { const st = 3 + 4 * (ao.size || 1); p = { x: ao.x + Math.cos(ao.yaw || 0) * st, z: ao.z - Math.sin(ao.yaw || 0) * st }; }
  const o = G.objects.add(ao.type, p.x, p.z, ao.yaw, undefined, ao.size || 1);
  if (!o) { toast('Hier geht das nicht'); return true; }
  pay(ot.cost); G.sound.place();
  if (ao.pad !== undefined && G.objects.updatePad) { o.pad = ao.pad; G.objects.updatePad(o); }
  if (ao.lc) G.objects.setLightColor(o, ao.lc);
  if (ao.ad !== undefined) G.objects.setAd(o, ao.ad);
  G.activeObj = o; placeObjMarker(o);
  toast('⧉ Kopiert – tippe, wo die Kopie hin soll, oder drück wieder Tab', 1800);
  renderToolPanel(); saveSoon();
  return true;
}

// ---------------- camera buttons & keys ----------------
function rotateCam(a) { const off = camera.position.clone().sub(controls.target); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a); camera.position.copy(controls.target).add(off); }
function tiltCam(d) {
  const off = camera.position.clone().sub(controls.target);
  const r = off.length(); let phi = Math.acos(clamp(off.y / r, -1, 1)); const th = Math.atan2(off.x, off.z);
  phi = clamp(phi + d, 0.12, controls.maxPolarAngle);
  camera.position.set(controls.target.x + r * Math.sin(phi) * Math.sin(th), controls.target.y + r * Math.cos(phi), controls.target.z + r * Math.sin(phi) * Math.cos(th));
}
function zoomCam(f) { const off = camera.position.clone().sub(controls.target); const l = clamp(off.length() * f, controls.minDistance, controls.maxDistance); off.setLength(l); camera.position.copy(controls.target).add(off); }
$('rotL').onclick = () => rotateCam(0.35); $('rotR').onclick = () => rotateCam(-0.35);
$('tiltU').onclick = () => tiltCam(0.15); $('tiltD').onclick = () => tiltCam(-0.15);
$('zoomIn').onclick = () => zoomCam(0.75); $('zoomOut').onclick = () => zoomCam(1.33);
function topView() {
  if (G.topSaved) { camera.position.copy(G.topSaved.p); controls.target.copy(G.topSaved.t); G.topSaved = null; $('camTop').classList.remove('on'); return; }
  G.topSaved = { p: camera.position.clone(), t: controls.target.clone() };
  const off = camera.position.clone().sub(controls.target);
  const yaw = Math.atan2(off.x, off.z), h = clamp(off.length() * 2.2, 700, 2600);
  camera.position.set(controls.target.x + Math.sin(yaw) * h * 0.12, controls.target.y + h, controls.target.z + Math.cos(yaw) * h * 0.12);
  $('camTop').classList.add('on');
}
$('camTop').onclick = topView;

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (G.playing) {
    if (k === ' ' || k === 'g') { G.player.input.jump = true; e.preventDefault(); }
    if (k === 'h' && G.playMode === 'bully') G.player.toggleWinch();
    if (k === 'l' || k === 'enter') tryRide();
    if (k === 'escape') exitPlay();
    if (k === 'c') cycleCam();
    return;
  }
  if (k === 'tab' && G.tool === 'build' && G.activeObj) { e.preventDefault(); copyActiveObj(lastMoveEv); return; }
  // R / F turn the object you are placing (15° per press, hold to keep turning)
  if ((k === 'r' || k === 'f') && G.tool === 'build' && G.activeObj && G.objects.list.includes(G.activeObj) && !G.activeObj.line) {
    e.preventDefault();
    const ao = G.activeObj;
    G.objects.rotate(ao, ao.yaw + (k === 'r' ? -1 : 1) * 15 * Math.PI / 180);
    placeObjMarker(ao);
    if (!['bruecke', 'steinbruecke', 'steg'].includes(ao.type)) G.lastYaw = ao.yaw;
    const dg = Math.round(((ao.yaw * 180 / Math.PI) % 360 + 540) % 360 - 180);
    if ($('aoYaw')) { $('aoYaw').value = dg; $('aoYawV').textContent = dg + '°'; }
    saveSoon(); return;
  }
  // Space finishes a fence / net / line (same as the "Fertig" button)
  if (k === ' ' && G.tool === 'build' && G.lineStart) { e.preventDefault(); G.lineStart = null; clearPins(); renderToolPanel(); toast('✓ Linie fertig'); return; }
  if (k === 'escape') { if (G.pending) clearPending(); else if (G.preview) cancelPreview(); else if (G.tool === 'lift' && G.liftA) { G.liftA = null; G.liftK = []; G.kinkNext = false; clearPins(); clearLiftPath(); renderToolPanel(); } else closeSide(); }
  if (k === 'k' && G.tool === 'lift' && G.liftA && !G.preview && lastMoveEv) { const p = groundHit(lastMoveEv); if (p) addLiftVertex(p, 't'); }
  if (k === '+' || k === '=') zoomCam(0.8);
  if (k === '-' || k === '_') zoomCam(1.25);
  if (k === 't') topView();
  if (/^[1-6]$/.test(k)) { const b = document.querySelectorAll('#toolbar button')[+k - 1]; if (b) b.click(); }
  if ((k === 'delete' || k === 'backspace') && G.selObj) { G.objects.remove(G.selObj); closeSide(); }
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); if (e.key === 'Shift') keys.delete('shift'); const c = (e.code || '').replace('Key', '').toLowerCase(); if (c.length === 1) keys.delete(c); if (e.code && e.code.startsWith('Arrow')) keys.delete(e.code.toLowerCase()); });
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); applyQuality(); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(window.innerWidth, window.innerHeight); } });

// ---------------- HYPER: post-processing (ambient occlusion, bloom, colour grading, vignette) ----------------
let composer = null, hyperPasses = null;
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.1 }, uVig: { value: 0.32 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uVig, uNight; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      // split toning like a camera: cool shadows, warm highlights
      c.rgb *= mix(vec3(0.95, 0.99, 1.06), vec3(1.03, 1.0, 0.96), smoothstep(0.05, 0.9, l));
      // gentle S-curve on the (linear, pre tone-mapping) light
      c.rgb = c.rgb * (1.0 + 0.12 * smoothstep(0.2, 1.2, l)) * (1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.25, l)));
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = c;
    }`,
};
function setupComposer() {
  if (composer && (!GFX.hyper || composer.lite !== !!GFX.lite)) { composer.dispose(); composer = null; hyperPasses = null; }
  if (!GFX.hyper || composer) return;
  const w = window.innerWidth, h = window.innerHeight;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  composer.lite = !!GFX.lite;
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (!GFX.lite) {
  ao = new GTAOPass(scene, camera, w, h);
  ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ radius: 3, distanceExponent: 1.5, thickness: 4, scale: 1.2, samples: 12 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  // the AO depth/normal pass must not see the sky, clouds, sprites or see-through things
  const ov = ao.overrideVisibility.bind(ao);
  ao.overrideVisibility = function () { ov(); scene.traverse((o) => { if (o.isSprite || (o.material && !Array.isArray(o.material) && o.material.transparent)) o.visible = false; }); sky.dome.visible = false; sky.clouds.visible = false; };
  composer.addPass(ao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.5, 0.86);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE); composer.addPass(grade);
  composer.addPass(new OutputPass());
  hyperPasses = { ao, bloom, grade };
}
function renderFrame() { if (composer) composer.render(); else renderer.render(scene, camera); }
window.__renderFrame = renderFrame;

// ---------------- play mode ----------------
function startPlay() {
  const m = PLAY_MODES[G.playMode];
  if (m.season !== undefined && m.season !== G.season) { toast(m.season === 0 ? 'Skifahren geht nur im Winter ❄️' : 'Mountainbike geht nur im Sommer ☀️'); return; }
  let x = controls.target.x, z = controls.target.z;
  if ((G.playMode === 'car' || G.playMode === 'bus') && G.world.road.length) { const r = nearestOnLine(G.world.road, x, z); if (r.d < 400) { x = r.px; z = r.pz; } }
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const yaw = Math.atan2(-dir.z, dir.x);
  G.savedCam = { t: controls.target.clone(), p: camera.position.clone() };
  G.player.start(G.playMode, x, z, yaw);
  G.playing = true; setTimeout(updateLegend, 0);
  controls.enabled = false;
  closeSide(); clearPending();
  ['toolbar', 'toolpanel', 'camBtns', 'hint', 'minimap', 'sidepanel'].forEach((id) => $(id).classList.add('hidden'));
  $('hud').classList.add('hidden');
  $('playUI').classList.remove('hidden');
  const veh = ['bully', 'skidoo', 'car', 'bus'].includes(G.playMode);
  const jb = document.querySelector('[data-k="jump"]');
  jb.classList.toggle('hidden', veh && G.playMode !== 'bully');
  jb.innerHTML = G.playMode === 'bully' ? '<b>⬍</b>Fräse' : '<b>⤒</b>Sprung';
  document.querySelector('[data-k="winch"]').classList.toggle('hidden', !(G.playMode === 'bully' && G.player.mesh && G.player.mesh.userData.winch));
  toast(`${m.icon} ${m.name}: Joystick oder WASD steuern${veh ? '' : ', Leertaste springt'}`, 3000);
}
function exitPlay() {
  if (!G.playing) return;
  const p = G.player.pos.clone();
  G.player.stop();
  G.playing = false; setTimeout(updateLegend, 0);
  controls.enabled = true;
  controls.target.set(p.x, p.y, p.z);
  const off = new THREE.Vector3(60, 70, 90);
  camera.position.copy(p).add(off);
  $('playUI').classList.add('hidden');
  ['toolbar', 'camBtns', 'hint', 'hud'].forEach((id) => $(id).classList.remove('hidden'));
  if (mapOn) $('minimap').classList.remove('hidden');
  setTool('view');
}
$('playExit').onclick = exitPlay;
function tryRide() { const l = G.player.nearLift(); if (l && !G.player.ride) G.player.rideLift(l); }
$('rideBtn').onclick = tryRide;
function cycleCam() { const ds = [5, 9, 16, 28]; const i = ds.findIndex((d) => d >= G.player.camDist - 0.5); G.player.camDist = ds[(i + 1) % ds.length]; }

// joystick
const joy = $('joy'), knob = $('joyKnob');
let joyId = null;
const joyMove = (e) => {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const l = Math.hypot(dx, dy), R = r.width / 2 - 10;
  if (l > R) { dx *= R / l; dy *= R / l; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  G.player.input.x = dx / R; G.player.input.y = -dy / R;
  joyTouch = true;
};
let joyTouch = false;
joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; knob.style.transform = ''; G.player.input.x = 0; G.player.input.y = 0; joyTouch = false; };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
document.querySelectorAll('.pbtns button').forEach((b) => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); b.classList.add('on');
    if (k === 'jump') G.player.input.jump = true;
    else if (k === 'cam') cycleCam();
    else if (k === 'winch') G.player.toggleWinch();
    else G.player.input[k] = true;
  });
  const up = () => { b.classList.remove('on'); if (k === 'boost' || k === 'brake') G.player.input[k] = false; };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
});

// ---------------- minimap ----------------
let mapOn = false, mapBase = null, mapPaint = null;
$('mapBtn').onclick = () => { mapOn = !mapOn; $('minimap').classList.toggle('hidden', !mapOn); if (mapOn) drawMinimap(); };
function buildMinimapBase() {
  if (!G.world) return;
  const R = 160, w = G.world, S = w.S;
  const c = document.createElement('canvas'); c.width = c.height = R;
  const x = c.getContext('2d'); const img = x.createImageData(R, R);
  let mn = Infinity, mx = -Infinity;
  const hs = new Float32Array(R * R);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) { const h = heightAt(w, -S / 2 + (i + 0.5) / R * S, -S / 2 + (j + 0.5) / R * S); hs[j * R + i] = h; mn = Math.min(mn, h); mx = Math.max(mx, h); }
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const h = hs[j * R + i], l = hs[j * R + Math.max(0, i - 1)], u = hs[Math.max(0, j - 1) * R + i];
    const sh = clamp(0.85 + ((h - l) + (h - u)) / (S / R) * 0.45, 0.4, 1.3);
    const t = (h - mn) / (mx - mn + 1);
    let r, g, b;
    if (G.season === 0) { r = g = b = 235; if (t > 0.55) { r = 215; g = 215; b = 220; } }
    else { if (t < 0.45) { r = 90; g = 135; b = 70; } else if (t < 0.7) { r = 140; g = 140; b = 110; } else { r = 225; g = 228; b = 232; } }
    const o = (j * R + i) * 4; img.data[o] = clamp(r * sh, 0, 255); img.data[o + 1] = clamp(g * sh, 0, 255); img.data[o + 2] = clamp(b * sh, 0, 255); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const P = (q) => [(q.x + S / 2) / S * R, (q.z + S / 2) / S * R];
  x.lineCap = 'round';
  const line = (pts, wdt, col) => { if (pts.length < 2) return; x.strokeStyle = col; x.lineWidth = wdt; x.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke(); };
  line(w.river, 2.2, '#3f8fc0'); line(w.road, 1.6, '#555');
  if (w.lake) { const [a, b] = P(w.lake); x.fillStyle = '#3f8fc0'; x.beginPath(); x.ellipse(a, b, w.lake.a / S * R, w.lake.b / S * R, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#c0703a'; for (const v of w.villages) for (const h of v.houses) { const [a, b] = P(h); x.fillRect(a - 0.8, b - 0.8, 1.6, 1.6); }
  mapBase = c;
  buildMinimapPaint();
}
function buildMinimapPaint() {
  if (!G.world) return;
  const R = 160, T = G.tv.T, f = T / R;
  const c = document.createElement('canvas'); c.width = c.height = R; const x = c.getContext('2d'); const img = x.createImageData(R, R);
  const cols = G.season === 0 ? { 1: [40, 100, 230], 2: [230, 40, 40], 3: [20, 20, 20], 4: [240, 200, 20], 5: [150, 60, 205], 6: [30, 165, 95] } : { 1: [240, 200, 40], 2: [230, 60, 60], 3: [40, 140, 230], 4: [30, 30, 30] };
  const arr = G.season === 0 ? G.tv.piste : G.tv.trail;
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const v = arr[Math.floor((j + 0.5) * f) * T + Math.floor((i + 0.5) * f)];
    if (!v) continue;
    const o = (j * R + i) * 4, cc = cols[v]; img.data[o] = cc[0]; img.data[o + 1] = cc[1]; img.data[o + 2] = cc[2]; img.data[o + 3] = 200;
  }
  x.putImageData(img, 0, 0);
  mapPaint = c;
}
function drawMinimap() {
  if (!mapOn || !mapBase || !G.world) return;
  const cv = $('minimap'), x = cv.getContext('2d'), W = cv.width, S = G.world.S;
  x.imageSmoothingEnabled = true;
  x.drawImage(mapBase, 0, 0, W, W);
  if (mapPaint) x.drawImage(mapPaint, 0, 0, W, W);
  const P = (q) => [(q.x + S / 2) / S * W, (q.z + S / 2) / S * W];
  x.strokeStyle = '#111'; x.lineWidth = 2.5;
  for (const l of G.lifts) { const pts = l.P || [l.A, l.B]; x.beginPath(); pts.forEach((q, i) => { const [a, b] = P(q); if (i) x.lineTo(a, b); else x.moveTo(a, b); }); x.stroke(); const [a, b] = P(l.A); x.fillStyle = '#ffd400'; x.fillRect(a - 3, b - 3, 6, 6); }
  const tg = G.playing ? G.player.pos : controls.target;
  const [cx, cy] = P(tg);
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const a = Math.atan2(dir.z, dir.x);
  x.fillStyle = '#ff3b30'; x.beginPath(); x.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); x.lineTo(cx + Math.cos(a + 2.5) * 7, cy + Math.sin(a + 2.5) * 7); x.lineTo(cx + Math.cos(a - 2.5) * 7, cy + Math.sin(a - 2.5) * 7); x.closePath(); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
}
$('minimap').addEventListener('pointerdown', (e) => {
  if (!G.world || G.playing) return;
  const r = e.target.getBoundingClientRect(), S = G.world.S;
  const wx = ((e.clientX - r.left) / r.width - 0.5) * S, wz = ((e.clientY - r.top) / r.height - 0.5) * S;
  const off = camera.position.clone().sub(controls.target);
  controls.target.set(wx, heightAt(G.world, wx, wz), wz);
  camera.position.copy(controls.target).add(off);
});

// ---------------- save / load ----------------
function readSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
let saveWarned = false;
function saveGame(manual = false) {
  if (!G.world) return false;
  try {
    if (!G.slotId) G.slotId = newSlotId();
    const data = {
      v: 2, slotId: G.slotId, slotName: G.slotName || slotLabel(G.settings), settings: G.settings, mode: G.mode, money: G.money === Infinity ? 0 : G.money, season: G.season, seasonMode: G.seasonMode, seasonLen: G.seasonLen, seasonElapsed: G.seasonElapsed,
      time: G.time, timeAuto: G.timeAuto, timeLive: !!G.timeLive, weatherLive: !!G.weatherLive, liveWx: G.liveWx || null, dayMin: G.dayMin, weather: G.weather, weatherAuto: G.weatherAuto, guestTarget: G.guestTarget, ticket: G.ticket, staff: G.staff, day: G.day, nightSki: G.nightSki, nightSkiMode: G.nightSkiMode,
      snowNat: G.snowNat, snowMade: G.snowMade, newSnow: G.tv.uniforms.uNewSnow.value, snowMode: G.snowMode, groomFrom: G.groomFrom, sat: G.sat, rep: G.rep, reviews: (G.reviews || []).slice(-8), ploughs: G.traffic.ploughCount, ploughAuto: G.traffic.ploughAuto, towerPads: G.towerPads !== false, bullyColor: G.bullyColor || 'rot', playBullyColor: G.playBullyColor || 'blau',
      lifts: G.lifts.map((l) => l.serialize()), objects: G.objects.serialize(), ads: adsState(), ponds: G.ponds.serialize(), heights: G.tv.serializeHeights(), piste: G.tv.serializeLayer('piste'), trail: G.tv.serializeLayer('trail'), trees: G.trees.serialize(), rocks: G.rocks.serialize(), surf: G.tv.serializeSurf(), marks: G.marks.serialize(), bus: G.buslines.serialize(), roads: G.roadroutes.serialize(), vRemoved: G.village.removedList(), roadCnt: G.tv.roadCnt,
      cam: { t: controls.target.toArray(), p: camera.position.toArray() },
    };
    const json = JSON.stringify(data);
    let ok = false;
    try { localStorage.setItem(SAVE_KEY, json); ok = true; } catch (e) { /* too big for localStorage: the slot below still has it */ }
    G.lastSave = data;
    const meta = { id: G.slotId, name: data.slotName, date: Date.now(), info: `${G.lifts.length} Lifte · Tag ${G.day || 1} · ${G.mode === 'normal' ? 'Normal' : 'Sandbox'}` };
    putSlot(meta, json).then(() => { if (manual) toast('Gespeichert 💾 „' + meta.name + '“'); }).catch(() => { if (manual) toast(ok ? 'Gespeichert 💾' : 'Speichern ist in diesem Browser leider nicht möglich'); });
    return true;
  } catch (e) {
    if (manual || !saveWarned) toast('Speichern ist in diesem Browser leider nicht möglich');
    saveWarned = true;
    return false;
  }
}
let saveTimer = 0;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveGame(), 2500); }
setInterval(() => { if (G.world && !document.hidden) saveGame(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

// ---------------- adaptive quality ----------------
const fpsWatch = {
  t: 0, n: 0, checks: 0,
  reset() { this.t = 0; this.n = 0; this.checks = 0; },
  tick(dt) {
    if (quality !== 'auto') return;
    this.t += dt; this.n++;
    if (this.t < 4) return;
    const fps = this.n / this.t; this.t = 0; this.n = 0; this.checks++;
    if (fps < 26 && renderer.shadowMap.enabled && !G.shadowUser) { setShadows(false); segSet('shadowSeg', 0); return; }
    if (fps < 28 && autoLevel !== 'low') { autoLevel = autoLevel === 'high' ? 'mid' : 'low'; applyQuality(); }
    else if (fps > 57 && autoLevel === 'mid' && this.checks < 4 && (window.devicePixelRatio || 1) > 1.5) { autoLevel = 'high'; applyQuality(); }
  },
};

// ---------------- loop ----------------
const clock = new THREE.Clock();
let elapsed = 0, hudT = 0, mapT = 0, playT = 0, rescueHomeT = 0, bermT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  if (G.world) {
    const w = G.world;
    fpsWatch.tick(dt);
    updateTime(dt);
    if (G.playing) {
      const inp = G.player.input;
      if (!joyTouch) {
        const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        const ky = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
        // keyboard: move only while a key is held; stop as soon as all keys are released
        if (keys.size) { inp.x = kx; inp.y = ky; G.kbDrive = true; }
        else if (G.kbDrive) { inp.x = 0; inp.y = 0; inp.boost = false; inp.brake = false; G.kbDrive = false; }
        if (keys.has('shift')) inp.boost = true; else if (keys.size) inp.boost = false;
        if (keys.has('x') || keys.has('b')) inp.brake = true; else if (keys.size) inp.brake = false;
      }
      G.player.update(dt, camera, elapsed);
      const near = !G.player.ride && !G.player.vehicle && G.player.nearLift();
      // only touch the DOM when something changed (repainting UI over the 3D view every frame is expensive)
      const setT = (id, t) => { const e = $(id); if (e._t !== t) { e._t = t; e.textContent = t; } };
      const hid = !near; if ($('rideBtn')._h !== hid) { $('rideBtn')._h = hid; $('rideBtn').classList.toggle('hidden', hid); }
      if (near) setT('rideBtn', '🚡 ' + near.displayName + ' fahren');
      const m = PLAY_MODES[G.player.mode];
      playT += dt;
      if (playT > 0.25) { playT = 0; setT('playInfo', G.player.ride ? `🚡 ${G.player.ride.lift.displayName}` : `${m.icon} ${G.player.speedKmh} km/h${G.player.mode === 'bully' ? (G.player.tiller ? ' · Fräse ⬇️' : ' · Fräse ⬆️') : ''}${G.player.score ? ' · ⭐ ' + G.player.score : ''}`); }
      setT('playMsg', G.player.msgT > 0 ? G.player.msg : '');
    } else {
      if (keys.size) {
        const dist = camera.position.distanceTo(controls.target);
        const sp = dist * 0.9 * dt;
        const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
        const r = new THREE.Vector3(-f.z, 0, f.x);
        const mv = new THREE.Vector3();
        if (keys.has('w') || keys.has('arrowup')) mv.add(f);
        if (keys.has('s') || keys.has('arrowdown')) mv.sub(f);
        if (keys.has('d') || keys.has('arrowright')) mv.add(r);
        if (keys.has('a') || keys.has('arrowleft')) mv.sub(r);
        mv.multiplyScalar(sp); controls.target.add(mv); camera.position.add(mv);
        if (keys.has('q')) rotateCam(dt * 1.2);
        if (keys.has('e')) rotateCam(-dt * 1.2);
        const turningObj = G.tool === 'build' && G.activeObj;
        if (keys.has('r') && !turningObj) tiltCam(dt * 0.8);
        if (keys.has('f') && !turningObj) tiltCam(-dt * 0.8);
      }
      controls.update();
      const tg = controls.target, lim = w.S / 2;
      const cx = clamp(tg.x, -lim, lim) - tg.x, cz = clamp(tg.z, -lim, lim) - tg.z;
      if (cx || cz) { tg.x += cx; tg.z += cz; camera.position.x += cx; camera.position.z += cz; }
      if (!G.freeCam) { const dy = (heightAt(w, tg.x, tg.z) - tg.y) * 0.2; tg.y += dy; camera.position.y += dy; }
      const minY = heightAt(w, camera.position.x, camera.position.z) + 3;
      if (camera.position.y < minY) camera.position.y = minY;
    }
    const target = G.playing ? G.player.pos : controls.target;
    const st = sky.update(G.time, G.weather, target, camera, w.S, dt);
    const nightOn = st.night > 0.5;
    if (nightOn !== G.nightOn) {
      G.nightOn = nightOn;
      G.objects.setNight(nightOn); G.village.setNight(st.night); G.traffic.setNight(nightOn);
    }
    const timeF = G.season === 0 ? skiFactor(G.time) : (G.time >= 8 && G.time < 20 ? 1 : G.time >= 7 && G.time < 21 ? 0.4 : 0);
    const wF = G.weather === 'starkschnee' ? 0.35 : G.weather === 'schnee' || G.weather === 'regen' ? 0.55 : 1;
    let target2 = G.guestTarget;
    target2 = Math.min(G.guestTarget, G.mode === 'normal' ? limits().limit : limits().sandLimit);
    G.guests.target = Math.min(target2, 1400);
    G.guests.factor = timeF * wF;
    G.guestSum += G.guests.count; G.guestN++;
    if (painting && G.tool === 'trees' && G.natMode === 'terrain' && lastBrushE) brush(lastBrushE);
    G.water.update(dt);
    updateLiftSchedule(dt);
    for (const l of G.lifts) l.update(dt);
    if (G.preview) G.preview.update(dt);
    G.traffic.update(dt, { snowing: snowRate(), temp: mountainTemp() - 2, cam: camera.position });
    G.buslines.update(dt, G.nightOn);
    G.roadroutes.update(dt, G.nightOn);
    G.rail.update(dt);
    { const sd = sky.sun.position.clone().sub(sky.sun.target.position).normalize(); G.tv.uniforms.uSunDir.value.copy(sd); }
    if (GFX.hyper && G.tv.updateSun(G.tv.uniforms.uSunDir.value)) G.trees.applySun(G.tv);
    if (GFX.hyper) { G.tv.uniforms.uTime.value = elapsed; G.tv.uniforms.uClouds.value = G.weather === 'wolken' ? 0.9 : G.weather === 'sonne' ? 0.3 : 0; }
    G.peds.update(dt, elapsed, camera.position);
    G.cannons.update(dt);
    G.guests.update(dt);
    if (G.village.updateParking) G.village.updateParking(dt, Math.round(G.guests.count / 5));
    const groomTime = G.season === 0 && G.time >= (G.groomFrom || GROOM_FROM) && G.time < GROOM_TO;
    G.tv.flushGroom();
    const SV = services();
    G.groomers.update(dt, groomTime, Math.min(G.staff, 8, SV.groomCap), elapsed);
    G.traffic.ploughCap = SV.ploughCap;
    G.lplough.update(dt, G.season === 0 && SV.localPlough && G.traffic.ploughAuto, (() => { const w2 = G.objects.list.find((q) => q.type === 'werkhof'); return w2 ? { x: w2.x, z: w2.z } : null; })());
    updateInjuries(dt);
    { const ev = G.rescue.update(dt, elapsed); if (ev) rescueEvent(ev); }
    rescueHomeT += dt; if (rescueHomeT > 2) { rescueHomeT = 0; G.rescue.setHome(regaPad()); }
    if (G.playing && G.player.mode === 'bully' && G.player.tiller && Math.abs(G.player.v || 0) > 0.5 && G.season === 0) G.bermDirty = true;
    bermT += dt;
    if (bermT > 4) { bermT = 0; const sc = clamp((G.snowNat || 60) / 60, 0.5, 1.8); if (G.bermDirty || Math.abs(sc - (G.tv.bermScale ?? 1)) > 0.15) { G.tv.bermScale = sc; G.bermDirty = false; if (G.season === 0) G.tv.rebuildBerms(); } }
    hudT += dt; if (hudT > 0.5) { hudT = 0; updateHUD(); }
    mapT += dt; if (mapT > 0.25) { mapT = 0; drawMinimap(); }
  }
  if (G.trees && G.trees.near) G.trees.updateLOD(camera.position);
  if (G.world && G.sound.ready) {
    const w2 = G.world, cp = camera.position;
    sndRight.setFromMatrixColumn(camera.matrixWorld, 0);
    G.sound.update({ dt: Math.min(0.1, sndDt()), cam: cp, right: sndRight, ground: heightAt(w2, cp.x, cp.z), valley: w2.hf.base(clamp(cp.x, -w2.S / 2, w2.S / 2)), snowing: G.weather === 'schnee' || G.weather === 'starkschnee', heavy: G.weather === 'starkschnee', summer: G.season === 1, night: !!G.nightOn,
      villages: w2.villages, lifts: G.lifts, cannons: G.cannons, groomers: G.groomers.list, train: G.rail && G.rail.ok ? G.rail : null, player: G.playing ? G.player : null, roadDist: w2.road.length ? distToLine(w2.road, cp.x, cp.z) : 9999 });
  }
  if (hyperPasses) { const nt = G.nightOn ? 1 : 0; hyperPasses.bloom.strength = nt ? 0.65 : 0.16; hyperPasses.bloom.threshold = nt ? 0.45 : 0.95; if (hyperPasses.ao) hyperPasses.ao.enabled = !G.playing || G.device === 'desk'; }
  renderFrame();
  if (G.firstFrame && G.tv) { G.tv.markUploaded(); G.firstFrame = false; }
}
frame();

window.__G = G; window.__renderer = renderer; window.__scene = scene; window.__camera = camera; window.__controls = controls;
window.__dbg = { renderToolPanel, brush, groundHit, finishTerraform, openTimeModal, livePlace, updateInjuries, rescueEvent, services, litShare, Lift, scene, clearCorridor, selectLift, selectObj, setTool, heightAt, renderLiftPanel, startGame, applySeason, startPlay, exitPlay, saveGame, readSave, scheduleNetwork };
