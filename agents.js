/* Local JSON-based agent engine: defines agents, generates tasks, dispatches and tracks them.
   Also handles tasks assigned by the user (custom tasks). */

export const CONFIG = JSON.parse(`{
  "departments": {
    "it":        { "label": "IT",           "color": "#3b82f6", "bots": 2 },
    "social":    { "label": "Social Media", "color": "#ec4899", "bots": 2 },
    "content":   { "label": "Content",      "color": "#22c55e", "bots": 2 },
    "research":  { "label": "Research",     "color": "#a855f7", "bots": 2 },
    "ecommerce": { "label": "Ecommerce",    "color": "#f97316", "bots": 2 },
    "assistant": { "label": "Assistant",    "color": "#facc15", "bots": 2 }
  },
  "defaultBuilding": { "it": "it", "social": "social", "content": "content", "research": "research", "ecommerce": "ecommerce", "assistant": "hq" },
  "securityWords": ["security", "threat", "vulnerab", "malware", "phishing", "firewall", "breach", "audit", "password"],
  "routing": {
    "it": ["code", "bug", "server", "network", "software", "install", "database", "script", "website", "deploy", "wifi", "laptop", "api"],
    "social": ["post", "tweet", "instagram", "tiktok", "linkedin", "facebook", "social", "caption", "hashtag", "campaign", "followers"],
    "content": ["write", "article", "blog", "copy", "email", "newsletter", "headline", "script", "story", "edit", "proofread", "description"],
    "research": ["research", "analyze", "analyse", "compare", "market", "summarize", "summarise", "study", "competitor", "trend", "report", "find out"],
    "ecommerce": ["product", "order", "shop", "store", "inventory", "price", "pricing", "listing", "shipping", "customer", "checkout", "sku"]
  },
  "taskTemplates": [
    { "dept": "it", "building": "it",    "title": "Resolve support ticket",     "duration": [9, 14] },
    { "dept": "it", "building": "it",    "title": "Patch workstation fleet",    "duration": [10, 16] },
    { "dept": "it", "building": "cyber", "title": "Run threat scan",            "duration": [10, 16] },
    { "dept": "it", "building": "cyber", "title": "Review access logs",         "duration": [9, 14] },
    { "dept": "social", "building": "social", "title": "Schedule campaign posts",    "duration": [9, 14] },
    { "dept": "social", "building": "social", "title": "Moderate comments",          "duration": [8, 13] },
    { "dept": "social", "building": "social", "title": "Produce short-form video",   "duration": [11, 16] },
    { "dept": "content", "building": "content", "title": "Draft blog article",       "duration": [10, 16] },
    { "dept": "content", "building": "content", "title": "Edit product copy",        "duration": [8, 13] },
    { "dept": "content", "building": "content", "title": "Publish newsletter",       "duration": [9, 14] },
    { "dept": "research", "building": "research", "title": "Analyze market data",    "duration": [11, 16] },
    { "dept": "research", "building": "research", "title": "Run model experiment",   "duration": [12, 16] },
    { "dept": "research", "building": "research", "title": "Summarize papers",       "duration": [9, 14] },
    { "dept": "ecommerce", "building": "ecommerce", "title": "Process order batch",  "duration": [9, 14] },
    { "dept": "ecommerce", "building": "ecommerce", "title": "Update inventory",     "duration": [8, 13] },
    { "dept": "ecommerce", "building": "ecommerce", "title": "Dispatch shipments",   "duration": [10, 15] },
    { "dept": "assistant", "building": "any", "title": "Coordinate team schedule",   "duration": [8, 12] },
    { "dept": "assistant", "building": "any", "title": "Deliver executive briefing", "duration": [8, 13] },
    { "dept": "assistant", "building": "any", "title": "Compile daily report",       "duration": [8, 12] }
  ],
  "generator": { "intervalSeconds": [2.5, 5.5], "maxQueue": 6 },
  "maxBots": 24
}`);

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const stamp = () => new Date().toLocaleTimeString([], { hour12: false });

export class AgentEngine {
  constructor(buildings) {
    this.buildings = buildings;
    this.agents = [];
    this.queue = [];
    this.active = [];
    this.logs = [];
    this.results = [];
    this.stats = { created: 0, completed: 0 };
    this.listeners = {};
    this.counter = 0;
    this.timer = 0.3;
    this.autoGenerate = true;
    this.aiAvailable = false;

    const maxBots = Math.max(...Object.values(CONFIG.departments).map((d) => d.bots));
    for (let i = 0; i < maxBots; i++) {
      for (const [dept, def] of Object.entries(CONFIG.departments)) {
        if (i < def.bots) this.makeAgent(dept, i + 1);
      }
    }
    this.log('AI City OS online. Agent engine started.');
  }

  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }
  agent(id) { return this.agents.find((a) => a.id === id); }
  buildingName(id) { const b = this.buildings.find((x) => x.id === id); return b ? b.name : id; }
  color(dept) { return CONFIG.departments[dept].color; }

  makeAgent(dept, n) {
    const def = CONFIG.departments[dept];
    const agent = { id: dept + '-' + n, name: def.label + ' Bot ' + n, dept, state: 'idle', task: null, spawned: false };
    this.agents.push(agent);
    return agent;
  }

  log(text, color = '#8e8e93') {
    const entry = { time: stamp(), text, color };
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs.shift();
    this.emit('log', entry);
  }

  /* ---------- Control: bots, AI, auto tasks ---------- */
  addAgent(dept) {
    if (!CONFIG.departments[dept] || this.agents.length >= CONFIG.maxBots) return null;
    const n = this.agents.filter((a) => a.dept === dept).length + 1;
    const agent = this.makeAgent(dept, n);
    this.log('New ' + CONFIG.departments[dept].label + ' bot added: ' + agent.name, this.color(dept));
    this.emit('agentAdded', { agent });
    return agent;
  }

  async checkAI() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.aiAvailable = !!data.ai;
    } catch (e) {
      this.aiAvailable = false;
    }
    this.emit('aiStatus', { ai: this.aiAvailable });
  }

  /* ---------- Generated tasks ---------- */
  generate() {
    const dept = pick(Object.keys(CONFIG.departments));
    const tpl = pick(CONFIG.taskTemplates.filter((t) => t.dept === dept));
    const building = tpl.building === 'any' ? pick(this.buildings).id : tpl.building;
    const task = {
      id: 'T-' + String(++this.counter).padStart(3, '0'),
      title: tpl.title,
      dept,
      building,
      duration: rand(tpl.duration[0], tpl.duration[1]),
      progress: 0,
      status: 'queued',
      agentId: null,
      assignTo: null,
      custom: false,
      createdAt: Date.now()
    };
    this.queue.push(task);
    this.stats.created++;
    this.log(task.id + ' created: ' + task.title + ' (' + CONFIG.departments[dept].label + ')', this.color(dept));
    this.emit('taskCreated', { task });
  }

  /* ---------- Tasks assigned by the user ---------- */
  classify(text) {
    const t = text.toLowerCase();
    if (CONFIG.securityWords.some((w) => t.includes(w))) return 'it';
    let best = 'assistant', score = 0;
    for (const [dept, words] of Object.entries(CONFIG.routing)) {
      const s = words.filter((w) => t.includes(w)).length;
      if (s > score) { score = s; best = dept; }
    }
    return best;
  }

  createCustomTask({ text, dept = 'auto', assignTo = null }) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const agent = assignTo ? this.agent(assignTo) : null;
    if (agent) dept = agent.dept;
    else if (dept === 'auto' || !CONFIG.departments[dept]) dept = this.classify(text);
    let building = CONFIG.defaultBuilding[dept];
    if (dept === 'it' && CONFIG.securityWords.some((w) => text.toLowerCase().includes(w))) building = 'cyber';
    const ai = this.aiAvailable;
    const task = {
      id: 'T-' + String(++this.counter).padStart(3, '0'),
      title: text.length > 46 ? text.slice(0, 44).trim() + '\u2026' : text,
      details: text,
      dept,
      building,
      duration: null,
      progress: 0,
      status: 'queued',
      agentId: null,
      assignTo: agent ? agent.id : null,
      custom: true,
      mode: ai ? 'ai' : 'manual',
      elapsed: 0,
      estimate: ai ? 30 : 90,
      result: null,
      error: null,
      createdAt: Date.now()
    };
    this.queue.unshift(task);
    this.stats.created++;
    this.log('Your task ' + task.id + ' queued for ' + CONFIG.departments[dept].label + ': ' + task.title, this.color(dept));
    this.emit('taskCreated', { task });
    return task;
  }

  async runAI(task, agent) {
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.details, dept: CONFIG.departments[task.dept].label, agent: agent.name })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Request failed');
      this.finishCustom(task.id, data.text, null);
    } catch (e) {
      this.finishCustom(task.id, '', e.message || String(e));
    }
  }

  finishCustom(id, text, error) {
    const task = this.active.find((t) => t.id === id);
    if (!task || task.status !== 'working') return;
    task.result = text;
    task.error = error;
    this.complete(task);
  }

  markDone(id) {
    const task = this.active.find((t) => t.id === id);
    if (task && task.custom && task.mode === 'manual') this.finishCustom(id, 'Marked done by you.', null);
  }

  cancel(id) {
    let task = this.queue.find((t) => t.id === id);
    if (task) {
      this.queue.splice(this.queue.indexOf(task), 1);
      task.status = 'cancelled';
      this.log(task.id + ' cancelled: ' + task.title);
      this.emit('taskCancelled', { task, agent: null });
      return;
    }
    task = this.active.find((t) => t.id === id);
    if (!task) return;
    this.active.splice(this.active.indexOf(task), 1);
    task.status = 'cancelled';
    const agent = this.agent(task.agentId);
    if (agent) { agent.task = null; agent.state = 'idle'; }
    this.log(task.id + ' cancelled: ' + task.title);
    this.emit('taskCancelled', { task, agent });
  }

  /* ---------- Lifecycle ---------- */
  dispatch() {
    for (const task of [...this.queue]) {
      let agent = null;
      if (task.assignTo) {
        const a = this.agent(task.assignTo);
        if (a && a.spawned && !a.task) agent = a;
      } else {
        agent = this.agents.find((a) => a.spawned && !a.task && a.dept === task.dept) || null;
      }
      if (!agent) continue;
      this.queue.splice(this.queue.indexOf(task), 1);
      task.status = 'assigned';
      task.agentId = agent.id;
      agent.task = task;
      agent.state = 'walking';
      this.active.push(task);
      this.log(agent.name + ' heading to ' + this.buildingName(task.building) + ' for ' + task.id, this.color(agent.dept));
      this.emit('taskAssigned', { agent, task });
    }
  }

  startWork(agentId) {
    const agent = this.agent(agentId);
    if (!agent || !agent.task) return;
    agent.state = 'working';
    agent.task.status = 'working';
    this.log(agent.name + ' started ' + agent.task.title, this.color(agent.dept));
    this.emit('taskStarted', { agent, task: agent.task });
    if (agent.task.custom && agent.task.mode === 'ai') this.runAI(agent.task, agent);
  }

  complete(task) {
    const agent = this.agent(task.agentId);
    task.status = 'done';
    task.progress = 1;
    this.active.splice(this.active.indexOf(task), 1);
    this.stats.completed++;
    if (!agent) return;
    agent.task = null;
    agent.state = 'idle';
    if (task.error) {
      this.log(agent.name + ' could not finish ' + task.id + ': ' + task.error, '#ff453a');
    } else {
      this.log(agent.name + ' completed ' + task.id + ': ' + task.title, this.color(agent.dept));
    }
    if (task.custom) {
      const entry = {
        id: task.id, title: task.title, details: task.details, agent: agent.name, dept: task.dept,
        mode: task.mode, status: task.error ? 'failed' : 'done',
        text: task.error ? task.error : task.result, time: stamp()
      };
      this.results.unshift(entry);
      if (this.results.length > 30) this.results.pop();
      this.emit('resultAdded', { entry });
    }
    this.emit('taskCompleted', { agent, task });
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.autoGenerate && this.queue.length < CONFIG.generator.maxQueue) this.generate();
      const [a, b] = CONFIG.generator.intervalSeconds;
      this.timer = rand(a, b);
    }
    this.dispatch();
    for (const task of [...this.active]) {
      if (task.status !== 'working') continue;
      if (task.custom) {
        task.elapsed += dt;
        task.progress = Math.min(0.95, task.elapsed / task.estimate);
      } else {
        task.progress = Math.min(1, task.progress + dt / task.duration);
        if (task.progress >= 1) this.complete(task);
      }
    }
  }
}
