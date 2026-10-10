import * as THREE from 'three';
import { CONFIG } from './agents.js';
import { BUILDINGS } from './city.js';

/** Click to select bots and buildings, double-click the ground to move the selected bot. */
export class SelectionController {
  constructor({ camera, dom, bots, city, onSelect, onMove }) {
    this.camera = camera;
    this.dom = dom;
    this.bots = bots;
    this.city = city;
    this.onSelect = onSelect;
    this.onMove = onMove;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.selected = null;
    this.visual = null;
    this.down = null;
    this.pending = null;

    dom.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    dom.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || e.button !== 0) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5 && performance.now() - d.t < 500) this.click(e);
    });
    dom.addEventListener('dblclick', (e) => {
      clearTimeout(this.pending);
      if (!this.selected || this.selected.type !== 'bot') return;
      this.aim(e);
      const p = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.plane, p)) this.onMove(this.selected.id, p.x, p.z);
    });
  }

  aim(e) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  owner(object, key) {
    let o = object;
    while (o && o.userData[key] === undefined) o = o.parent;
    return o ? o.userData[key] : null;
  }

  click(e) {
    clearTimeout(this.pending);
    this.aim(e);
    const botHits = this.raycaster.intersectObjects([...this.bots.values()].map((b) => b.rig.group), true);
    for (const h of botHits) {
      const id = this.owner(h.object, 'agentId');
      if (id) return this.select({ type: 'bot', id });
    }
    const bHits = this.raycaster.intersectObjects([...this.city.buildings.values()].map((r) => r.group), true);
    for (const h of bHits) {
      const id = this.owner(h.object, 'buildingId');
      if (id) return this.select({ type: 'building', id });
    }
    // Empty ground: deselect after a moment (a double-click moves the selected bot instead).
    this.pending = setTimeout(() => this.select(null), 300);
  }

  clearVisual() {
    if (!this.visual) return;
    this.visual.parent.remove(this.visual.obj);
    this.visual = null;
  }

  select(sel) {
    this.clearVisual();
    this.selected = sel;
    if (sel && sel.type === 'bot') {
      const bot = this.bots.get(sel.id);
      if (bot) {
        const mat = new THREE.MeshBasicMaterial({ color: CONFIG.departments[bot.agent.dept].color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 48), mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.07;
        bot.rig.group.add(ring);
        this.visual = { obj: ring, parent: bot.rig.group, mat };
      }
    } else if (sel && sel.type === 'building') {
      const b = BUILDINGS.find((x) => x.id === sel.id);
      const mat = new THREE.MeshBasicMaterial({ color: b.accent, transparent: true, depthWrite: false });
      const g = new THREE.Group();
      const w = b.w + 3, d = b.d + 3, th = 0.3;
      for (const [sx, sz, bw, bd] of [[0, d / 2, w, th], [0, -d / 2, w, th], [w / 2, 0, th, d], [-w / 2, 0, th, d]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.15, bd), mat);
        m.position.set(sx, 0.12, sz);
        g.add(m);
      }
      g.position.set(b.x, 0, b.z);
      this.city.buildings.get(sel.id).group.parent.add(g);
      this.visual = { obj: g, parent: g.parent, mat };
    }
    if (this.onSelect) this.onSelect(sel);
  }

  update(time) {
    if (this.visual) this.visual.mat.opacity = 0.65 + 0.3 * Math.sin(time * 4);
  }
}
