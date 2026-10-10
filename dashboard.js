import { CONFIG } from './agents.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, cls, fn) {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), text);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

function segmented(options, value, onChange, cls = '') {
  const wrap = el('div', 'seg ' + cls);
  const btns = {};
  for (const [val, label] of options) {
    const b = el('button', '', label);
    b.type = 'button';
    b.addEventListener('click', () => onChange(val));
    btns[val] = b;
    wrap.append(b);
  }
  const set = (v) => { for (const k in btns) btns[k].classList.toggle('on', k === String(v)); };
  set(value);
  return { el: wrap, set };
}

function select(options) {
  const s = el('select', 'input');
  for (const [v, label] of options) {
    const o = el('option', '', label);
    o.value = v;
    s.append(o);
  }
  return s;
}

/** Control center: controls, task assignment, selection, monitoring, results and log. */
export class Dashboard {
  constructor(root, engine, actions) {
    this.root = root;
    this.engine = engine;
    this.actions = actions;
    this.acc = 1;
    this.sel = null;
    this.sig = '';
    this.rows = new Map();
    this.auto = true;
    root.textContent = '';

    // ----- Header -----
    const header = el('div', 'dash-header');
    const brand = el('div', 'brand');
    this.live = el('span', 'live');
    brand.append(this.live, el('h1', '', 'AI City OS'));
    const right = el('div', 'header-right');
    this.clock = el('div', 'clock', '');
    const collapse = button('Hide', 'ghost', () => {
      const c = root.classList.toggle('collapsed');
      collapse.textContent = c ? 'Show' : 'Hide';
    });
    right.append(this.clock, collapse);
    header.append(brand, right);

    const body = el('div', 'dash-body');

    // ----- Control bar -----
    const controls = el('div', 'controls');
    const row1 = el('div', 'row');
    this.pauseBtn = button('Pause', '', () => this.setPaused(actions.togglePause()));
    this.speedSeg = segmented([[1, '1\u00d7'], [2, '2\u00d7'], [4, '4\u00d7']], 1, (v) => {
      actions.setSpeed(v);
      this.speedSeg.set(v);
    });
    row1.append(this.pauseBtn, this.speedSeg.el);
    const row2 = el('div', 'row');
    this.autoBtn = button('Auto tasks: On', '', () => {
      this.auto = !this.auto;
      actions.setAuto(this.auto);
      this.autoBtn.textContent = 'Auto tasks: ' + (this.auto ? 'On' : 'Off');
    });
    this.camSeg = segmented([['cinematic', 'Cinematic'], ['free', 'Free']], 'cinematic', (v) => actions.setCameraMode(v));
    row2.append(this.autoBtn, this.camSeg.el);
    controls.append(row1, row2);

    // ----- Tabs -----
    this.panes = {};
    this.tabBtns = {};
    const tabs = el('div', 'seg tabs');
    for (const [id, label] of [['monitor', 'Monitor'], ['assign', 'Assign'], ['results', 'Results'], ['log', 'Log']]) {
      const b = el('button', '', label);
      b.type = 'button';
      b.addEventListener('click', () => this.setTab(id));
      this.tabBtns[id] = b;
      tabs.append(b);
      this.panes[id] = el('div', 'pane');
    }

    this.buildMonitor(this.panes.monitor);
    this.buildAssign(this.panes.assign);
    this.buildResults(this.panes.results);
    this.buildLog(this.panes.log);

    body.append(controls, tabs, this.panes.monitor, this.panes.assign, this.panes.results, this.panes.log);
    root.append(header, body);
    this.setTab('monitor');
    this.renderSelection();
    this.updateHint();

    engine.on('aiStatus', () => this.updateHint());
    engine.on('agentAdded', () => this.fillBots());
    engine.on('resultAdded', ({ entry }) => this.addResult(entry));
  }

  /* ---------- Panes ---------- */
  buildMonitor(pane) {
    const stats = el('div', 'stats');
    this.stat = {};
    for (const [key, label] of [['active', 'Active bots'], ['idle', 'Idle bots'], ['queued', 'Tasks queued'], ['done', 'Tasks completed']]) {
      const card = el('div', 'stat');
      const value = el('div', 'value', '0');
      card.append(value, el('div', 'label', label));
      this.stat[key] = value;
      stats.append(card);
    }

    const deptSec = el('section', 'section');
    deptSec.append(el('h2', '', 'Departments'));
    const deptList = el('ul', 'depts');
    this.depts = {};
    for (const [id, def] of Object.entries(CONFIG.departments)) {
      const li = el('li');
      const dot = el('span', 'dot');
      dot.style.background = def.color;
      const count = el('span', 'count', '0 / ' + def.bots);
      li.append(dot, el('span', '', def.label), count);
      this.depts[id] = count;
      deptList.append(li);
    }
    deptSec.append(deptList);

    const taskSec = el('section', 'section');
    taskSec.append(el('h2', '', 'Tasks'));
    this.taskList = el('ul', 'tasks');
    taskSec.append(this.taskList);

    pane.append(stats, deptSec, taskSec);
  }

  buildAssign(pane) {
    this.selBox = el('section', 'section');

    const form = el('section', 'section');
    form.append(el('h2', '', 'Assign a task'));
    this.text = el('textarea', 'input');
    this.text.rows = 3;
    this.text.placeholder = 'Describe a real task, e.g. \u201cWrite a launch email for our new coffee grinder\u201d';
    this.text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.submit(); }
    });
    const pickRow = el('div', 'grid2');
    this.deptSel = select([['auto', 'Department: Auto']].concat(Object.entries(CONFIG.departments).map(([id, d]) => [id, d.label])));
    this.botSel = select([['', 'Bot: Best available']]);
    pickRow.append(this.deptSel, this.botSel);
    this.hint = el('p', 'hint', '');
    this.msg = el('p', 'hint ok', '');
    form.append(this.text, pickRow, button('Assign task', 'primary', () => this.submit()), this.hint, this.msg);

    const add = el('section', 'section');
    add.append(el('h2', '', 'Add a bot'));
    const addRow = el('div', 'row');
    this.addSel = select(Object.entries(CONFIG.departments).map(([id, d]) => [id, d.label]));
    addRow.append(this.addSel, button('Add bot', '', () => {
      const a = this.engine.addAgent(this.addSel.value);
      this.msg.textContent = a ? a.name + ' will spawn at HQ.' : 'Bot limit reached (' + CONFIG.maxBots + ').';
    }));
    add.append(addRow);

    pane.append(this.selBox, form, add);
    this.fillBots();
  }

  buildResults(pane) {
    this.resultsEmpty = el('p', 'hint', 'Finished tasks you assign will appear here.');
    this.resultList = el('div', 'results');
    pane.append(this.resultsEmpty, this.resultList);
  }

  buildLog(pane) {
    this.logList = el('ul', 'log');
    pane.append(this.logList);
    this.engine.logs.forEach((e) => this.addLog(e));
    this.engine.on('log', (e) => this.addLog(e));
  }

  /* ---------- State setters (called from the app) ---------- */
  setTab(name) {
    for (const id in this.panes) {
      this.panes[id].classList.toggle('on', id === name);
      this.tabBtns[id].classList.toggle('on', id === name);
    }
  }

  setPaused(v) {
    this.pauseBtn.textContent = v ? 'Resume' : 'Pause';
    this.live.classList.toggle('paused', v);
  }

  setCameraMode(m) { this.camSeg.set(m); }

  setSelection(sel) {
    this.sel = sel;
    this.renderSelection();
    this.updateSelection();
    if (sel) this.setTab('assign');
  }

  /* ---------- Assign ---------- */
  fillBots() {
    const prev = this.botSel.value;
    this.botSel.textContent = '';
    const opts = [['', 'Bot: Best available']].concat(this.engine.agents.map((a) => [a.id, a.name]));
    for (const [v, label] of opts) {
      const o = el('option', '', label);
      o.value = v;
      this.botSel.append(o);
    }
    if (opts.some((o) => o[0] === prev)) this.botSel.value = prev;
  }

  updateHint() {
    this.hint.textContent = this.engine.aiAvailable
      ? 'AI is connected. The bot walks to the right building, works on the task and returns the finished result in Results.'
      : 'AI is not connected, so the bot walks to the right building and holds your task. Press Mark done in Monitor when you have finished it. To let bots complete tasks themselves, add GEMINI_API_KEY to a .env file and restart.';
  }

  submit() {
    const t = this.engine.createCustomTask({ text: this.text.value, dept: this.deptSel.value, assignTo: this.botSel.value || null });
    if (!t) { this.msg.textContent = 'Enter a task first.'; return; }
    this.text.value = '';
    this.msg.textContent = t.id + ' queued for ' + CONFIG.departments[t.dept].label + '.';
    this.setTab('monitor');
  }

  /* ---------- Selection card ---------- */
  renderSelection() {
    const box = this.selBox;
    const eng = this.engine;
    const actions = this.actions;
    box.textContent = '';
    this.selRefs = null;
    box.append(el('h2', '', 'Selection'));
    const sel = this.sel;
    if (!sel) {
      box.append(el('p', 'hint', 'Click a bot or building in the city to select it. Double-click the ground to send the selected bot there. Left-drag rotates, right-drag pans and scroll zooms.'));
      return;
    }

    const card = el('div', 'card');
    const h = el('h3');
    const dot = el('span', 'dot');
    const state = el('p', 'hint', '');
    const refs = { state };

    if (sel.type === 'bot') {
      const a = eng.agent(sel.id);
      if (!a) return;
      dot.style.background = CONFIG.departments[a.dept].color;
      h.append(dot, el('span', '', a.name));
      refs.follow = button('Follow', '', () => actions.follow(a.id));
      refs.hq = button('Go to HQ', '', () => actions.sendBot(a.id, 'hq'));
      refs.cancel = button('Cancel task', 'danger', () => { if (a.task) eng.cancel(a.task.id); });
      const assign = button('Assign task', 'primary', () => { this.botSel.value = a.id; this.text.focus(); });
      const grid = el('div', 'grid2');
      grid.append(assign, refs.follow, refs.hq, refs.cancel);
      const sendRow = el('div', 'row');
      const dest = select(eng.buildings.filter((b) => b.id !== 'hq').map((b) => [b.id, b.name]));
      refs.go = button('Go', '', () => actions.sendBot(a.id, dest.value));
      refs.dest = dest;
      sendRow.append(el('span', 'hint', 'Send to'), dest, refs.go);
      card.append(h, state, grid, sendRow, button('Deselect', 'ghost', () => actions.clearSelection()));
    } else {
      const b = eng.buildings.find((x) => x.id === sel.id);
      dot.style.background = '#' + b.accent.toString(16).padStart(6, '0');
      h.append(dot, el('span', '', b.name));
      const grid = el('div', 'grid2');
      grid.append(button('Focus camera', '', () => actions.focusBuilding(b.id)), button('Deselect', 'ghost', () => actions.clearSelection()));
      card.append(h, state, grid);
    }
    this.selRefs = refs;
    box.append(card);
  }

  updateSelection() {
    const r = this.selRefs;
    const sel = this.sel;
    if (!r || !sel) return;
    const eng = this.engine;
    if (sel.type === 'bot') {
      const a = eng.agent(sel.id);
      if (!a) return;
      const t = a.task;
      let text = 'Idle';
      if (t && t.status === 'assigned') text = 'Heading to ' + eng.buildingName(t.building) + ' for ' + t.title;
      else if (t && t.status === 'working') text = 'Working: ' + t.title;
      r.state.textContent = text;
      const busy = !!t;
      r.hq.disabled = busy;
      r.go.disabled = busy;
      r.dest.disabled = busy;
      r.cancel.disabled = !busy;
      r.follow.textContent = this.actions.isFollowing(a.id) ? 'Stop following' : 'Follow';
    } else {
      const n = eng.active.filter((t) => t.building === sel.id && t.status === 'working').length;
      r.state.textContent = n ? n + ' bot' + (n > 1 ? 's' : '') + ' working here' : 'No one working here right now';
    }
  }

  /* ---------- Results & log ---------- */
  addResult(entry) {
    this.resultsEmpty.style.display = 'none';
    const d = el('details', 'result');
    const sum = el('summary');
    sum.append(el('span', '', entry.title));
    if (entry.status === 'failed') sum.append(el('span', 'badge bad', 'Failed'));
    d.append(sum, el('div', 'meta', entry.agent + ' \u00b7 ' + entry.time + ' \u00b7 ' + (entry.mode === 'ai' ? 'AI' : 'Manual')));
    const pre = el('pre', '', entry.text || '');
    d.append(pre);
    d.append(button('Copy', 'small', () => { if (navigator.clipboard) navigator.clipboard.writeText(entry.text || ''); }));
    this.resultList.prepend(d);
    if (entry.mode === 'ai' && entry.status === 'done') d.open = true;
  }

  addLog(e) {
    const li = el('li');
    const dot = el('span', 'dot');
    dot.style.background = e.color;
    li.append(el('span', 'time', e.time), dot, el('span', '', e.text));
    this.logList.prepend(li);
    while (this.logList.children.length > 80) this.logList.lastChild.remove();
  }

  /* ---------- Monitor refresh ---------- */
  updateTasks() {
    const eng = this.engine;
    const all = eng.active.concat(eng.queue);
    const sig = all.map((t) => t.id + t.status).join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      this.rows.clear();
      this.taskList.textContent = '';
      if (!all.length) this.taskList.append(el('li', 'empty', 'No tasks right now'));
      for (const t of all.slice(0, 8)) {
        const agent = eng.agent(t.agentId);
        const li = el('li');
        const row = el('div', 'row between');
        const title = el('span', '', t.title);
        if (t.custom) title.append(el('span', 'badge', 'Yours'));
        const pct = el('span', 'pct', '');
        row.append(title, pct);
        const meta = el('div', 'meta', agent ? agent.name + ' \u00b7 ' + eng.buildingName(t.building) : 'Waiting for a ' + CONFIG.departments[t.dept].label + ' bot');
        const bar = el('div', 'bar');
        const fill = document.createElement('i');
        fill.style.background = CONFIG.departments[t.dept].color;
        bar.append(fill);
        li.append(row, meta, bar);
        if (t.custom) {
          const acts = el('div', 'task-actions');
          if (t.mode === 'manual' && t.status === 'working') acts.append(button('Mark done', 'small primary', () => eng.markDone(t.id)));
          acts.append(button('Cancel', 'small danger', () => eng.cancel(t.id)));
          li.append(acts);
        }
        this.taskList.append(li);
        this.rows.set(t.id, { pct, fill, task: t });
      }
      if (all.length > 8) this.taskList.append(el('li', 'empty', '+ ' + (all.length - 8) + ' more'));
    }
    for (const r of this.rows.values()) {
      const t = r.task;
      r.pct.textContent = t.status === 'queued' ? 'Queued' : Math.round(t.progress * 100) + '%';
      r.fill.style.width = Math.round(t.progress * 100) + '%';
    }
  }

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const eng = this.engine;
    this.clock.textContent = new Date().toLocaleTimeString([], { hour12: false });

    const spawned = eng.agents.filter((a) => a.spawned);
    const active = spawned.filter((a) => a.task).length;
    this.stat.active.textContent = active;
    this.stat.idle.textContent = spawned.length - active;
    this.stat.queued.textContent = eng.queue.length;
    this.stat.done.textContent = eng.stats.completed;

    for (const id of Object.keys(CONFIG.departments)) {
      const mine = spawned.filter((a) => a.dept === id);
      this.depts[id].textContent = mine.filter((a) => a.task).length + ' / ' + eng.agents.filter((a) => a.dept === id).length;
    }
    this.updateTasks();
    this.updateSelection();
  }
}
