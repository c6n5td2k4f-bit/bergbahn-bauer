// Shared rounded geometry helpers (less "block" look): rounded boxes, extruded plans with soft edges.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const cache = new Map();

// rounded box of the given size (centred). Geometry is cached and shared: never modify it in place.
export function rbox(w, h, d, r = 0.2, seg = 2) {
  r = Math.max(0.004, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}|${seg}`;
  let g = cache.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, seg, r);
    if (g.attributes.uv) g.deleteAttribute('uv');
    cache.set(k, g);
  }
  return g;
}

// extrude a plan shape (x = along, y = across) upwards; bevel rounds the top/bottom edges
export function planExtrude(shape, depth, bevel = 0, bevelSeg = 3) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: 14 });
  g.rotateX(-Math.PI / 2);
  if (bevel) g.translate(0, bevel, 0);
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// rounded rectangle shape centred at (cx, cy)
export function roundRectShape(cx, cy, w, h, r) {
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  const s = new THREE.Shape();
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

export const SPHERE = new THREE.SphereGeometry(0.5, 14, 10);
export const DOME = new THREE.SphereGeometry(1, 24, 7, 0, Math.PI * 2, 0, Math.PI / 2);
export const CYLR = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
