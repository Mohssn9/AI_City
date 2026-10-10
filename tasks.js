import * as THREE from 'three';
import { CONFIG } from './agents.js';

const W = 512, H = 160;

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Task bubble with a progress ring, floating above an android. */
class Bubble {
  constructor(rig, color) {
    this.rig = rig;
    this.color = color;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.sprite.renderOrder = 20;
    rig.group.add(this.sprite);
    this.key = '';
    this.done = false;
    this.life = 0;
  }

  draw(title, sub, progress, done, failed = false) {
    const key = title + '|' + sub + '|' + Math.round(progress * 100) + '|' + done + '|' + failed;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(g, 8, 8, W - 16, H - 36, 28);
    g.fill();
    g.strokeStyle = this.color + '66';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.beginPath();
    g.moveTo(W / 2 - 14, H - 29);
    g.lineTo(W / 2, H - 6);
    g.lineTo(W / 2 + 14, H - 29);
    g.fill();

    // progress ring
    const cx = 74, cy = 70, r = 34;
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    if (progress > 0.005) {
      g.strokeStyle = failed ? '#ff453a' : done ? '#30d158' : this.color;
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
      g.stroke();
    }
    g.fillStyle = '#1d1d1f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 22px -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
    g.fillText(failed ? '!' : done ? '\u2713' : Math.round(progress * 100) + '%', cx, cy + 1);

    // text
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = '600 30px -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
    let t = title;
    while (g.measureText(t).width > 340 && t.length > 4) t = t.slice(0, -2);
    if (t !== title) t += '\u2026';
    g.fillText(t, 132, 66);
    g.fillStyle = '#6e6e73';
    g.font = '400 22px -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
    g.fillText(sub, 132, 98);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.rig.group.remove(this.sprite);
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}

/** Task bubbles, progress rings and building glow. */
export class TaskVisuals {
  constructor(engine, city, camera, bots) {
    this.engine = engine;
    this.city = city;
    this.camera = camera;
    this.bots = bots;
    this.bubbles = new Map();

    engine.on('taskAssigned', ({ agent, task }) => {
      const bot = this.bots.get(agent.id);
      if (!bot) return;
      const old = this.bubbles.get(agent.id);
      if (old) old.dispose();
      const bubble = new Bubble(bot.rig, CONFIG.departments[agent.dept].color);
      bubble.task = task;
      this.bubbles.set(agent.id, bubble);
    });
    engine.on('taskCancelled', ({ agent }) => {
      if (!agent) return;
      const b = this.bubbles.get(agent.id);
      if (b) { b.dispose(); this.bubbles.delete(agent.id); }
    });
    engine.on('taskCompleted', ({ agent }) => {
      const b = this.bubbles.get(agent.id);
      if (b) { b.done = true; b.life = 0; }
    });
  }

  update(dt) {
    const eng = this.engine;
    for (const [id, b] of [...this.bubbles]) {
      const task = b.task;
      if (b.done) {
        b.life += dt;
        if (b.life > 1.6) { b.dispose(); this.bubbles.delete(id); continue; }
      }
      const bn = eng.buildingName(task.building);
      if (b.done) b.draw(task.title, task.error ? 'Could not finish' : 'Completed', 1, true, !!task.error);
      else if (task.status === 'working') b.draw(task.title, 'Working \u00b7 ' + bn, task.progress, false);
      else b.draw(task.title, 'Heading to ' + bn, 0, false);

      const dist = this.camera.position.distanceTo(b.rig.group.position);
      const w = Math.max(3.6, Math.min(8.5, dist * 0.075));
      b.sprite.scale.set(w, (w * H) / W, 1);
      b.sprite.position.y = 2.0 + b.sprite.scale.y / 2;
    }

    const counts = {};
    for (const t of eng.active) if (t.status === 'working') counts[t.building] = (counts[t.building] || 0) + 1;
    for (const b of eng.buildings) {
      const n = counts[b.id] || 0;
      this.city.setGlow(b.id, n > 0 ? Math.min(1, 0.6 + 0.2 * n) : 0);
    }
  }
}
