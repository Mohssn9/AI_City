import { BUILDINGS, TREES, WORLD, isRoad, insideBuilding } from './city.js';

const CELL = 1.5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAngle = (a, b, t) => {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
};

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    let i = this.k.length;
    this.k.push(key);
    this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.k[i] = key;
    this.v[i] = val;
  }
  pop() {
    const top = this.v[0];
    const lk = this.k.pop();
    const lv = this.v.pop();
    const n = this.k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && this.k[c + 1] < this.k[c]) c++;
        if (this.k[c] >= lk) break;
        this.k[i] = this.k[c];
        this.v[i] = this.v[c];
        i = c;
      }
      this.k[i] = lk;
      this.v[i] = lv;
    }
    return top;
  }
}

/* ======================================================================
   Navigation grid + A* pathfinding (roads preferred over grass)
   ====================================================================== */
export class NavGrid {
  constructor() {
    this.half = WORLD.half - 2;
    this.n = Math.floor((this.half * 2) / CELL);
    const n = this.n;
    this.blocked = new Uint8Array(n * n);
    this.cost = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = this.cx(i), z = this.cx(j);
        let b = insideBuilding(x, z, 1.2);
        if (!b) {
          for (const t of TREES) {
            if (Math.hypot(x - t.x, z - t.z) < 1.1) { b = true; break; }
          }
        }
        this.blocked[j * n + i] = b ? 1 : 0;
        this.cost[j * n + i] = isRoad(x, z, 1.5) ? 1 : 2.4;
      }
    }
  }

  cx(i) { return -this.half + (i + 0.5) * CELL; }
  ci(x) { return clamp(Math.floor((x + this.half) / CELL), 0, this.n - 1); }

  isBlockedAt(x, z) {
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return true;
    return this.blocked[this.ci(z) * this.n + this.ci(x)] === 1;
  }

  nearestFree(i, j) {
    const n = this.n;
    if (!this.blocked[j * n + i]) return j * n + i;
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 10 && best < 0; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= n || b >= n || this.blocked[b * n + a]) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = b * n + a; }
        }
      }
    }
    return best >= 0 ? best : j * n + i;
  }

  segment(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (CELL * 0.5)));
    let c = 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const idx = this.ci(az + (bz - az) * t) * this.n + this.ci(ax + (bx - ax) * t);
      if (this.blocked[idx]) return -1;
      if (s > 0) c += (this.cost[idx] * len) / steps;
    }
    return c;
  }

  smooth(pts) {
    const cum = [0];
    for (let k = 1; k < pts.length; k++) {
      const d = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      cum[k] = cum[k - 1] + d * this.cost[this.ci(pts[k].z) * this.n + this.ci(pts[k].x)];
    }
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        const sc = this.segment(pts[i].x, pts[i].z, pts[j].x, pts[j].z);
        if (sc >= 0 && sc <= (cum[j] - cum[i]) * 1.03) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /** Returns [{x,z}, ...] starting at the start point and ending at the goal. */
  findPath(sx, sz, ex, ez) {
    const n = this.n;
    const s = this.nearestFree(this.ci(sx), this.ci(sz));
    const eOrig = this.ci(ez) * n + this.ci(ex);
    const e = this.nearestFree(this.ci(ex), this.ci(ez));
    const start = { x: sx, z: sz };
    const goal = this.blocked[eOrig] ? { x: this.cx(e % n), z: this.cx((e / n) | 0) } : { x: ex, z: ez };
    if (s === e) return [start, goal];

    const ei = e % n, ej = (e / n) | 0;
    const h = (idx) => {
      const dx = Math.abs((idx % n) - ei), dy = Math.abs(((idx / n) | 0) - ej);
      return dx + dy - 0.5858 * Math.min(dx, dy);
    };
    const g = new Float32Array(n * n).fill(Infinity);
    const par = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const open = new Heap();
    g[s] = 0;
    open.push(h(s), s);
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

    while (open.size) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === e) break;
      const ci = cur % n, cj = (cur / n) | 0;
      for (const [dx, dy] of DIRS) {
        const ni = ci + dx, nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nidx = nj * n + ni;
        if (this.blocked[nidx] || closed[nidx]) continue;
        if (dx && dy && (this.blocked[cj * n + ni] || this.blocked[nj * n + ci])) continue;
        const ng = g[cur] + (dx && dy ? 1.4142 : 1) * this.cost[nidx];
        if (ng < g[nidx]) {
          g[nidx] = ng;
          par[nidx] = cur;
          open.push(ng + h(nidx), nidx);
        }
      }
    }

    if (par[e] < 0) return [start, goal];
    const cells = [];
    for (let c = e; c !== -1; c = par[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: this.cx(c % n), z: this.cx((c / n) | 0) }));
    pts[0] = start;
    pts[pts.length - 1] = goal;
    return this.smooth(pts);
  }
}

/* ======================================================================
   Walking animation (smooth human walk)
   ====================================================================== */
export function poseAndroid(rig, phase, amt, time, dt, working) {
  const k = 1 - Math.exp(-dt * 10);
  const { L1, L2, foot } = rig.dims;
  let maxExt = 0;

  for (let i = 0; i < 2; i++) {
    const ph = phase + i * Math.PI;
    const s = Math.sin(ph), c = Math.cos(ph);
    const hip = -s * 0.52 * amt;
    const knee = (Math.max(0, c) * 0.95 + 0.04) * amt;
    rig.legs[i].hip.rotation.x = hip;
    rig.legs[i].knee.rotation.x = knee;
    const ext = L1 * Math.cos(hip) + L2 * Math.cos(hip + knee);
    if (ext > maxExt) maxExt = ext;
  }
  rig.pelvis.position.y = foot + maxExt; // lowest foot always touches the ground

  const s0 = Math.sin(phase);
  rig.pelvis.rotation.y = -s0 * 0.04 * amt;
  rig.torso.rotation.y = s0 * 0.09 * amt;
  rig.torso.rotation.x = 0.05 * amt;
  rig.torso.scale.y = 1 + 0.01 * Math.sin(time * 1.8 + rig.seed) * (1 - amt);

  for (let i = 0; i < 2; i++) {
    const s = Math.sin(phase + i * Math.PI);
    const arm = rig.arms[i];
    let sh = s * 0.45 * amt;
    let el = -(0.2 + 0.35 * Math.max(0, -s)) * amt - 0.06;
    if (working) {
      if (i === 0) { sh = -0.75 + Math.sin(time * 5) * 0.04; el = -1.2 + Math.sin(time * 7) * 0.08; }
      else { sh = -0.5; el = -1.1 + Math.sin(time * 5 + 1) * 0.07; }
    }
    arm.shoulder.rotation.x += (sh - arm.shoulder.rotation.x) * k;
    arm.elbow.rotation.x += (el - arm.elbow.rotation.x) * k;
    arm.shoulder.rotation.z = (i === 0 ? 1 : -1) * 0.07;
  }

  rig.head.rotation.y = Math.sin(time * 0.5 + rig.seed) * 0.3 * (1 - amt);
  rig.head.rotation.x = 0.02 + Math.sin(phase * 2) * 0.01 * amt;
  rig.badgeMat.emissiveIntensity = 1.3 + (working ? 1.0 * (0.5 + 0.5 * Math.sin(time * 5)) : 0);
}

/* ======================================================================
   Walker: follows A* paths with smooth acceleration and turning
   ====================================================================== */
export class Walker {
  constructor(rig, nav, x, z) {
    this.rig = rig;
    this.nav = nav;
    this.pos = { x, z };
    this.yaw = Math.PI;
    this.speed = 0;
    this.maxSpeed = 2.1 + Math.random() * 0.4;
    this.phase = Math.random() * Math.PI * 2;
    this.path = [];
    this.onArrive = null;
    this.working = false;
    this.faceYaw = null;
    rig.group.position.set(x, 0, z);
  }

  goTo(x, z, onArrive) {
    const p = this.nav.findPath(this.pos.x, this.pos.z, x, z);
    p.shift();
    this.path = p;
    this.onArrive = onArrive || null;
    this.faceYaw = null;
  }

  lookAt(x, z) {
    this.faceYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  update(dt, time) {
    const target = this.path[0];
    if (target) {
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      let want = this.maxSpeed;
      if (last) want = Math.min(want, 0.4 + dist * 1.5);
      this.speed += (want - this.speed) * Math.min(1, dt * 4);
      if (dist > 0.01) this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 7));
      const step = Math.min(dist, this.speed * dt);
      if (dist > 0.0001) {
        this.pos.x += (dx / dist) * step;
        this.pos.z += (dz / dist) * step;
      }
      if (dist < (last ? 0.08 : 0.35)) {
        this.path.shift();
        if (!this.path.length) {
          const cb = this.onArrive;
          this.onArrive = null;
          if (cb) cb();
        }
      }
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 6);
      if (this.speed < 0.02) this.speed = 0;
      if (this.faceYaw !== null) this.yaw = lerpAngle(this.yaw, this.faceYaw, 1 - Math.exp(-dt * 5));
    }

    this.phase += dt * this.speed * 3.3;
    const amt = clamp(this.speed / this.maxSpeed, 0, 1);
    this.rig.group.position.set(this.pos.x, 0, this.pos.z);
    this.rig.group.rotation.y = this.yaw;
    poseAndroid(this.rig, this.phase, amt, time, dt, this.working && !this.path.length);
  }
}

/** Gentle push so androids do not overlap. */
export function applySeparation(list, nav, dt) {
  const R = 0.8;
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const A = list[a].pos, B = list[b].pos;
      const dx = B.x - A.x, dz = B.z - A.z;
      const d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-4) continue;
      const push = ((R - d) * 0.5 * Math.min(1, dt * 8)) / d;
      const ax = A.x - dx * push, az = A.z - dz * push;
      const bx = B.x + dx * push, bz = B.z + dz * push;
      if (!nav.isBlockedAt(ax, az)) { A.x = ax; A.z = az; }
      if (!nav.isBlockedAt(bx, bz)) { B.x = bx; B.z = bz; }
    }
  }
}

/** A standing point just outside a building's entrance. */
export function workSpot(b) {
  const tx = -b.dir.z, tz = b.dir.x;
  const t = (Math.random() * 2 - 1) * 2.2;
  const f = Math.random() * 1.2;
  return { x: b.door.x + tx * t + b.dir.x * f, z: b.door.z + tz * t + b.dir.z * f };
}

/** A waiting spot on the HQ plaza. */
export function hqSpot() {
  return { x: (Math.random() * 2 - 1) * 6, z: 10.5 + Math.random() * 2 };
}
