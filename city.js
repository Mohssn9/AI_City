import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ======================================================================
   Layout (shared with movement.js)
   ====================================================================== */
export const WORLD = { half: 62 };
export const PLAZA = { x: 0, z: 0, r: 12.5 };

export const BUILDINGS = [
  { id: 'hq', name: 'HQ', x: 0, z: 0, w: 16, d: 16, accent: 0xfacc15, dir: { x: 0, z: 1 }, door: { x: 0, z: 10 } },
  { id: 'it', name: 'IT Support', x: -36, z: -26, w: 14, d: 14, accent: 0x3b82f6, dir: { x: 1, z: 0 }, door: { x: -27, z: -26 } },
  { id: 'research', name: 'Research Lab', x: 36, z: -26, w: 14, d: 14, accent: 0xa855f7, dir: { x: -1, z: 0 }, door: { x: 27, z: -26 } },
  { id: 'social', name: 'Social Media Studio', x: -36, z: 26, w: 14, d: 14, accent: 0xec4899, dir: { x: 1, z: 0 }, door: { x: -27, z: 26 } },
  { id: 'content', name: 'Content Hub', x: 36, z: 26, w: 14, d: 14, accent: 0x22c55e, dir: { x: -1, z: 0 }, door: { x: 27, z: 26 } },
  { id: 'ecommerce', name: 'Ecommerce Warehouse', x: 0, z: -40, w: 20, d: 12, accent: 0xf97316, dir: { x: 0, z: 1 }, door: { x: 0, z: -32 } },
  { id: 'cyber', name: 'Cybersecurity Center', x: 0, z: 40, w: 14, d: 14, accent: 0x14b8a6, dir: { x: 0, z: -1 }, door: { x: 0, z: 31 } }
];

const L = WORLD.half;
export const ROADS = [
  { x: -20, z: 0, w: 6, d: 2 * L, main: true },
  { x: 20, z: 0, w: 6, d: 2 * L, main: true },
  { x: 0, z: -14, w: 2 * L, d: 6, main: true },
  { x: 0, z: 14, w: 2 * L, d: 6, main: true },
  { x: -26, z: -26, w: 6, d: 4 },
  { x: 26, z: -26, w: 6, d: 4 },
  { x: -26, z: 26, w: 6, d: 4 },
  { x: 26, z: 26, w: 6, d: 4 },
  { x: 0, z: -25.5, w: 4, d: 17 },
  { x: 0, z: 25, w: 4, d: 16 }
];

export function isRoad(x, z, pad = 0) {
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + pad) return true;
  for (const r of ROADS) {
    if (Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad) return true;
  }
  return false;
}

export function insideBuilding(x, z, margin = 0) {
  for (const b of BUILDINGS) {
    if (Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin) return true;
  }
  return false;
}

const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const TREES = (() => {
  const r = rng(7);
  const list = [];
  for (let n = 0; n < 900 && list.length < 120; n++) {
    const x = (r() * 2 - 1) * 58;
    const z = (r() * 2 - 1) * 58;
    const s = 0.8 + r() * 0.8;
    const hue = r();
    if (isRoad(x, z, 3.5) || insideBuilding(x, z, 5)) continue;
    if (BUILDINGS.some((b) => Math.hypot(x - b.door.x, z - b.door.z) < 7)) continue;
    if (list.some((t) => Math.hypot(x - t.x, z - t.z) < 4)) continue;
    list.push({ x, z, s, hue });
  }
  return list;
})();

/* ======================================================================
   Helpers
   ====================================================================== */
let ANISO = 4;
let M = null; // shared materials, created in createCity

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const std = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function tex(canvas, rx, ry) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

function windowCanvases(accent, seed) {
  const r = rng(seed);
  const S = 256, cols = 4, rows = 4, cw = S / cols, ch = S / rows;
  const a = document.createElement('canvas');
  const b = document.createElement('canvas');
  a.width = a.height = b.width = b.height = S;
  const A = a.getContext('2d');
  const B = b.getContext('2d');
  A.fillStyle = '#1b2735';
  A.fillRect(0, 0, S, S);
  B.fillStyle = '#000';
  B.fillRect(0, 0, S, S);
  const lit = new THREE.Color(0xffe8bd).lerp(new THREE.Color(accent), 0.3).getStyle();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw, y = j * ch;
      const v = 70 + Math.floor(r() * 30);
      A.fillStyle = 'rgb(' + (v - 10) + ',' + (v + 20) + ',' + (v + 55) + ')';
      A.fillRect(x + 5, y + 6, cw - 10, ch - 12);
      A.fillStyle = 'rgba(255,255,255,0.12)';
      A.fillRect(x + 5, y + 6, cw - 10, 5);
      if (r() < 0.5) {
        B.fillStyle = lit;
        B.fillRect(x + 7, y + 8, cw - 14, ch - 16);
      }
    }
  }
  return { map: a, em: b };
}

const addGlow = (rec, mat, base, peak) => {
  mat.emissiveIntensity = base;
  rec.glow.push({ mat, base, peak });
  return mat;
};

const accentMat = (rec, color, base = 0.8, peak = 3.2) =>
  addGlow(rec, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.4 }), base, peak);

function facadeMat(rec, len, h, accent, seed, tint = 0xffffff) {
  const cv = windowCanvases(accent, seed);
  const rx = Math.max(1, Math.round(len / 12));
  const ry = Math.max(1, Math.round(h / 14));
  const m = new THREE.MeshStandardMaterial({
    color: tint,
    map: tex(cv.map, rx, ry),
    emissive: 0xffffff,
    emissiveMap: tex(cv.em, rx, ry),
    roughness: 0.25,
    metalness: 0.55
  });
  return addGlow(rec, m, 0.22, 1.5);
}

function facade(rec, w, h, d, accent, seed, tint) {
  const mx = facadeMat(rec, d, h, accent, seed, tint);
  const mz = facadeMat(rec, w, h, accent, seed + 1, tint);
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mx, mx, M.roof, M.roof, mz, mz]);
}

function makeLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 42px -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
  g.textBaseline = 'middle';
  const w = g.measureText(text).width + 110;
  const x0 = (640 - w) / 2;
  g.fillStyle = 'rgba(255,255,255,0.93)';
  roundRect(g, x0, 22, w, 84, 42);
  g.fill();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.beginPath();
  g.arc(x0 + 44, 64, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d1d1f';
  g.fillText(text, x0 + 72, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(16, 3.2, 1);
  return s;
}

/* ======================================================================
   Buildings
   ====================================================================== */
function newRec(b) {
  const group = new THREE.Group();
  group.position.set(b.x, 0, b.z);
  group.userData.buildingId = b.id;
  return { b, group, glow: [], light: null, level: 0, target: 0, top: 20, phase: Math.random() * 6 };
}

function addEntrance(rec) {
  const { b } = rec;
  const ext = (b.dir.x !== 0 ? b.w : b.d) / 2;
  const g = new THREE.Group();
  g.position.set(b.dir.x * ext, 0, b.dir.z * ext);
  g.rotation.y = Math.atan2(b.dir.x, b.dir.z);
  const door = box(3.4, 3.2, 0.25, M.glass);
  door.position.set(0, 1.6, 0.05);
  const canopy = box(5.5, 0.28, 2.4, M.white);
  canopy.position.set(0, 3.6, 1.1);
  const strip = box(5.5, 0.12, 0.12, accentMat(rec, b.accent, 0.9, 3.5));
  strip.position.set(0, 3.42, 2.3);
  g.add(door, canopy, strip);
  rec.group.add(g);
  rec.entrance = g;
  rec.ext = ext;
}

function buildHQ(rec) {
  const { b, group } = rec;
  const pod = facade(rec, 16, 6, 16, b.accent, 11);
  pod.position.y = 3;
  const tw = facade(rec, 11, 36, 11, b.accent, 13);
  tw.position.y = 24;
  group.add(pod, tw);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = box(0.7, 36, 0.7, M.white);
      p.position.set(sx * 5.5, 24, sz * 5.5);
      group.add(p);
    }
  }
  const podStrip = box(16.2, 0.3, 16.2, accentMat(rec, b.accent));
  podStrip.position.y = 6;
  const cap = box(11.6, 0.6, 11.6, M.white);
  cap.position.y = 42.3;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(6, 0.2, 12, 64), accentMat(rec, 0xfff1b8, 1, 4));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 45;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 8, 8), M.metal);
  mast.position.y = 46.6;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), accentMat(rec, b.accent, 1.2, 4));
  tip.position.y = 50.7;
  group.add(podStrip, cap, halo, mast, tip);
  rec.top = 51;
}

function buildIT(rec) {
  const { b, group } = rec;
  const main = facade(rec, 14, 16, 14, b.accent, 21);
  main.position.y = 8;
  const strip = box(14.2, 0.4, 14.2, accentMat(rec, b.accent));
  strip.position.y = 16;
  const mid = box(14.15, 0.25, 14.15, accentMat(rec, b.accent, 0.5, 2.2));
  mid.position.y = 8;
  group.add(main, strip, mid);
  for (let i = 0; i < 3; i++) {
    const u = box(2.4, 1.4, 2.4, M.metal);
    u.position.set(-4 + i * 4, 16.9, -3);
    group.add(u);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.2, 8), M.metal);
  mast.position.set(3.5, 17.4, 3);
  const pivot = new THREE.Group();
  pivot.position.set(3.5, 18.6, 3);
  pivot.rotation.z = 0.5;
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.white);
  dish.material = M.whiteDouble;
  dish.rotation.x = Math.PI;
  pivot.add(dish);
  group.add(mast, pivot);
  rec.top = 21;
}

function buildResearch(rec) {
  const { b, group } = rec;
  const main = facade(rec, 14, 10, 14, b.accent, 31);
  main.position.y = 5;
  const strip = box(14.2, 0.4, 14.2, accentMat(rec, b.accent));
  strip.position.y = 10;
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: b.accent, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.45,
    emissive: b.accent, emissiveIntensity: 0.3, side: THREE.DoubleSide
  });
  addGlow(rec, domeMat, 0.3, 1.8);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.y = 10;
  dome.userData.noShadow = true;
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), accentMat(rec, b.accent, 0.8, 4));
  core.position.y = 11.6;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.05, 0.18, 10, 48), accentMat(rec, b.accent));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 10.1;
  group.add(main, strip, dome, core, ring);
  for (const sx of [-1, 1]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 6, 20), M.white);
    tube.position.set(sx * 5, 13, -5);
    group.add(tube);
  }
  rec.top = 16;
}

function buildSocial(rec) {
  const { b, group } = rec;
  const r = 7, h = 22;
  const mat = facadeMat(rec, 2 * Math.PI * r, h, b.accent, 41);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, false), [mat, M.roof, M.roof]);
  body.position.y = h / 2;
  group.add(body);
  for (const y of [6, 12, 18, 22]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r + 0.12, 0.2, 10, 64), accentMat(rec, b.accent));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    group.add(band);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8, 8), M.metal);
  mast.position.y = 26;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), accentMat(rec, b.accent, 1, 4));
  orb.position.y = 30.3;
  group.add(mast, orb);
  for (const rr of [1.8, 3]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.1, 8, 32), accentMat(rec, b.accent, 0.8, 3));
    arc.rotation.x = Math.PI / 2;
    arc.position.y = 30.3;
    group.add(arc);
  }
  rec.top = 31;
}

function buildContent(rec) {
  const { b, group } = rec;
  const levels = [[14, 8, 14, 0, 0], [12, 6, 12, -0.6, 0.4], [9, 4, 9, 0.8, -0.5]];
  let y = 0;
  levels.forEach(([w, h, d, ox, oz], i) => {
    const m = facade(rec, w, h, d, b.accent, 50 + i * 3);
    m.position.set(ox, y + h / 2, oz);
    const s = box(w + 0.3, 0.35, d + 0.3, accentMat(rec, b.accent));
    s.position.set(ox, y + h, oz);
    group.add(m, s);
    y += h;
  });
  const garden = box(8.4, 0.25, 8.4, std(0x4f9a52, 0.9));
  garden.position.set(0.8, y + 0.45, -0.5);
  group.add(garden);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), std(0x2f7d3a, 0.85));
    t.position.set(0.8 - 3 + (i % 3) * 3, y + 1.2, -0.5 - 2.5 + Math.floor(i / 3) * 4);
    group.add(t);
  }
  rec.top = 20;
}

function buildEcommerce(rec) {
  const { b, group } = rec;
  const walls = box(20, 10, 12, std(0xdcdfe3, 0.5, 0.45));
  walls.position.y = 5;
  const roof = box(20.6, 0.5, 12.6, std(0x9aa0a8, 0.7, 0.3));
  roof.position.y = 10.25;
  const band = box(20.08, 1.0, 12.08, accentMat(rec, b.accent, 0.35, 2.4));
  band.position.y = 8;
  group.add(walls, roof, band);
  const doorMat = std(b.accent, 0.6, 0.3);
  for (const x of [-8.2, -4.6, 4.6, 8.2]) {
    const d = box(3, 4.2, 0.2, doorMat);
    d.position.set(x, 2.1, 6.05);
    const lamp = box(1.4, 0.18, 0.18, accentMat(rec, 0xffd9a8, 0.6, 3));
    lamp.position.set(x, 4.5, 6.1);
    group.add(d, lamp);
  }
  const cols = [0xf97316, 0x3b82f6, 0x14b8a6, 0xe5e7eb];
  [[-5, 1.3, -9.5], [2, 1.3, -9.5], [-2, 3.9, -9.5], [8, 1.3, -9.5]].forEach((p, i) => {
    const c = box(6, 2.6, 2.4, std(cols[i], 0.6, 0.3));
    c.position.set(p[0], p[1], p[2]);
    group.add(c);
  });
  rec.top = 11;
}

function buildCyber(rec) {
  const { b, group } = rec;
  const main = facade(rec, 14, 16, 14, b.accent, 61, 0x8794a3);
  main.position.y = 8;
  const upper = facade(rec, 9, 6, 9, b.accent, 63, 0x8794a3);
  upper.position.y = 19;
  upper.rotation.y = Math.PI / 4;
  const strip = box(14.2, 0.35, 14.2, accentMat(rec, b.accent));
  strip.position.y = 16;
  group.add(main, upper, strip);
  const sh = new THREE.Shape();
  sh.moveTo(0, 2.4);
  sh.lineTo(1.8, 1.8);
  sh.lineTo(1.8, 0.2);
  sh.quadraticCurveTo(1.8, -1.4, 0, -2.4);
  sh.quadraticCurveTo(-1.8, -1.4, -1.8, 0.2);
  sh.lineTo(-1.8, 1.8);
  sh.lineTo(0, 2.4);
  const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }), accentMat(rec, b.accent, 1, 4));
  shield.scale.setScalar(1.3);
  shield.position.set(0, 11, 0.15);
  rec.entrance.add(shield);
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5 + i, 6), M.metal);
    a.position.set(-1.5 + i * 1.5, 24.5 + i * 0.5, 0);
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), accentMat(rec, b.accent, 1, 4));
    t.position.set(-1.5 + i * 1.5, 27.2 + i, 0);
    group.add(a, t);
  }
  rec.top = 29;
}

const BUILD = {
  hq: buildHQ, it: buildIT, research: buildResearch, social: buildSocial,
  content: buildContent, ecommerce: buildEcommerce, cyber: buildCyber
};

function makeSky(sunDir) {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  return sky;
}

/* ======================================================================
   City
   ====================================================================== */
export function createCity(scene, renderer) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  M = {
    white: std(0xf2f4f7, 0.45),
    whiteDouble: new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.4, side: THREE.DoubleSide }),
    roof: std(0xcfd6dd, 0.8),
    metal: std(0x8d949c, 0.35, 0.8),
    glass: std(0x10151c, 0.1, 0.8)
  };

  scene.fog = new THREE.Fog(0xc6d9ea, 170, 560);

  // Sky, sun, environment reflections
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(135));
  scene.add(makeSky(sunDir));
  const envScene = new THREE.Scene();
  envScene.add(makeSky(sunDir));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  const sun = new THREE.DirectionalLight(0xfff1de, 2.4);
  sun.position.copy(sunDir).multiplyScalar(140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -100; sc.right = 100; sc.top = 100; sc.bottom = -100; sc.near = 10; sc.far = 400;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6b7a5a, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));

  // Ground
  const gc = document.createElement('canvas');
  gc.width = gc.height = 256;
  const gg = gc.getContext('2d');
  gg.fillStyle = '#5f8f4e';
  gg.fillRect(0, 0, 256, 256);
  const gr = rng(99);
  for (let i = 0; i < 3500; i++) {
    gg.fillStyle = 'hsl(' + (88 + gr() * 30) + ',' + (30 + gr() * 20) + '%,' + (32 + gr() * 16) + '%)';
    gg.fillRect(gr() * 256, gr() * 256, 2, 2);
  }
  const gt = new THREE.CanvasTexture(gc);
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  gt.repeat.set(60, 60);
  gt.colorSpace = THREE.SRGBColorSpace;
  gt.anisotropy = ANISO;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads, sidewalks, plaza
  const asphalt = std(0x2b2e33, 0.85);
  const walk = std(0x9a9ea5, 0.9);
  const flat = (geo, mat, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    return m;
  };
  for (const r of ROADS) {
    const sw = flat(new THREE.PlaneGeometry(r.w + 3, r.d + 3), walk, 0.02);
    sw.position.x = r.x; sw.position.z = r.z;
    const rd = flat(new THREE.PlaneGeometry(r.w, r.d), asphalt, 0.05);
    rd.position.x = r.x; rd.position.z = r.z;
    scene.add(sw, rd);
  }
  scene.add(flat(new THREE.CircleGeometry(PLAZA.r, 64), std(0xcfd3d8, 0.8), 0.04));
  scene.add(flat(new THREE.RingGeometry(PLAZA.r - 1.2, PLAZA.r, 64), std(0x9ea3aa, 0.8), 0.045));

  // Lane dashes
  const dashes = [];
  for (const r of ROADS.filter((q) => q.main)) {
    const vertical = r.d > r.w;
    const len = vertical ? r.d : r.w;
    for (let p = -len / 2 + 3; p < len / 2 - 2; p += 5) {
      const x = vertical ? r.x : r.x + p;
      const z = vertical ? r.z + p : r.z;
      if (ROADS.some((o) => o.main && o !== r && Math.abs(x - o.x) <= o.w / 2 + 1.5 && Math.abs(z - o.z) <= o.d / 2 + 1.5)) continue;
      dashes.push({ x, z, vertical });
    }
  }
  const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), std(0xf4f4f0, 0.7), dashes.length);
  const mtx = new THREE.Matrix4();
  const qid = new THREE.Quaternion();
  dashes.forEach((d, i) => {
    mtx.compose(new THREE.Vector3(d.x, 0.065, d.z), qid, new THREE.Vector3(d.vertical ? 0.22 : 2.2, 1, d.vertical ? 2.2 : 0.22));
    dm.setMatrixAt(i, mtx);
  });
  scene.add(dm);

  // Trees
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 7).translate(0, 0.5, 0), std(0x6b4f3a, 0.9), TREES.length);
  const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), std(0xffffff, 0.85), TREES.length);
  const col = new THREE.Color();
  TREES.forEach((t, i) => {
    const h = 2.2 * t.s + 0.8;
    mtx.compose(new THREE.Vector3(t.x, 0, t.z), qid, new THREE.Vector3(1, h, 1));
    trunk.setMatrixAt(i, mtx);
    mtx.compose(new THREE.Vector3(t.x, h + t.s, t.z), qid, new THREE.Vector3(1.5 * t.s, 1.7 * t.s, 1.5 * t.s));
    leaf.setMatrixAt(i, mtx);
    col.setHSL(0.27 + t.hue * 0.06, 0.45, 0.28 + t.hue * 0.1);
    leaf.setColorAt(i, col);
  });
  leaf.instanceColor.needsUpdate = true;
  trunk.castShadow = leaf.castShadow = true;
  trunk.receiveShadow = leaf.receiveShadow = true;
  scene.add(trunk, leaf);

  // Buildings
  const recs = new Map();
  for (const b of BUILDINGS) {
    const rec = newRec(b);
    addEntrance(rec);
    BUILD[b.id](rec);
    rec.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !o.userData.noShadow;
        o.receiveShadow = true;
      }
    });
    const pad = flat(new THREE.PlaneGeometry(b.w + 5, b.d + 5), std(0xb9bdc3, 0.9), 0.03);
    rec.group.add(pad);
    const label = makeLabel(b.name, b.accent);
    label.position.y = rec.top + 4;
    rec.group.add(label);
    rec.light = new THREE.PointLight(b.accent, 0, 45, 2);
    rec.light.position.set(b.dir.x * (rec.ext + 3), 6, b.dir.z * (rec.ext + 3));
    rec.group.add(rec.light);
    scene.add(rec.group);
    recs.set(b.id, rec);
  }

  return {
    buildings: recs,
    setGlow(id, level) {
      const r = recs.get(id);
      if (r) r.target = Math.max(0, Math.min(1, level));
    },
    update(dt, t) {
      for (const r of recs.values()) {
        r.level += (r.target - r.level) * Math.min(1, dt * 2.5);
        const pulse = r.level > 0.01 ? 1 + 0.12 * Math.sin(t * 3 + r.phase) : 1;
        for (const g of r.glow) g.mat.emissiveIntensity = g.base + (g.peak - g.base) * r.level * pulse;
        r.light.intensity = 500 * r.level * pulse;
      }
    }
  };
}

/* ======================================================================
   Camera: cinematic orbit by default, free orbit controls on user input
   ====================================================================== */
export function createCameraRig(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 190;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.screenSpacePanning = false;
  controls.target.set(0, 8, 0);
  camera.position.set(Math.cos(0.6) * 88, 30, Math.sin(0.6) * 88);

  let mode = 'cinematic';
  let followObj = null;
  let followKeep = true;
  let zoomGoal = null;
  let t = 0;
  const listeners = [];
  const home = new THREE.Vector3(0, 8, 0);
  const off = new THREE.Vector3();

  const setMode = (m) => {
    if (m === mode) return;
    mode = m;
    if (m === 'cinematic') { followObj = null; zoomGoal = null; }
    listeners.forEach((fn) => fn(m));
  };
  controls.addEventListener('start', () => { if (mode === 'cinematic') setMode('free'); });

  return {
    controls,
    getMode: () => mode,
    setMode,
    onModeChange: (fn) => listeners.push(fn),
    follow(obj, zoom = 30) { setMode('free'); followObj = obj; followKeep = true; zoomGoal = zoom; },
    focus(x, z, zoom = 60) { setMode('free'); followObj = { position: new THREE.Vector3(x, 6, z) }; followKeep = false; zoomGoal = zoom; },
    stopFollow() { followObj = null; },
    isFollowing: (obj) => followObj === obj && followKeep,
    update(dt) {
      t += dt;
      if (mode === 'cinematic') {
        const k = Math.min(1, dt * 0.8);
        off.copy(camera.position).sub(controls.target);
        const ang = dt * 0.05, c = Math.cos(ang), s = Math.sin(ang);
        const x = off.x * c - off.z * s, z = off.x * s + off.z * c;
        off.x = x; off.z = z;
        const r = Math.hypot(off.x, off.z) || 1;
        const nr = r + (88 + Math.sin(t * 0.11) * 12 - r) * k;
        off.x *= nr / r; off.z *= nr / r;
        off.y += (30 + Math.sin(t * 0.07 + 1) * 10 - off.y) * k;
        controls.target.lerp(home, k);
        camera.position.copy(controls.target).add(off);
      } else if (followObj) {
        const p = followObj.position;
        const k = Math.min(1, dt * 5);
        const dx = (p.x - controls.target.x) * k;
        const dy = ((followKeep ? 1.2 : p.y) - controls.target.y) * k;
        const dz = (p.z - controls.target.z) * k;
        controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
        camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
        if (!followKeep && Math.hypot(p.x - controls.target.x, p.z - controls.target.z) < 0.3) followObj = null;
      }
      if (zoomGoal !== null) {
        off.copy(camera.position).sub(controls.target);
        const d = off.length();
        const nd = d + (zoomGoal - d) * Math.min(1, dt * 3);
        off.setLength(nd);
        camera.position.copy(controls.target).add(off);
        if (Math.abs(nd - zoomGoal) < 0.5) zoomGoal = null;
      }
      controls.update();
    }
  };
}
