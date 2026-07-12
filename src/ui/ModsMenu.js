/**
 * ModsMenu
 * --------
 * The player-facing mod manager (toggle with 'J' or the MODS button): paste a
 * few lines of JavaScript, name it, add it — and it runs in the live game.
 * Ships with one-click example mods (Taco Rain!) and an API cheat-sheet.
 * Storage + execution live in state/ModLoader.js.
 */

import { ModLoader, EXAMPLE_MODS } from '../state/ModLoader.js';

export class ModsMenu {
  /**
   * @param {HTMLElement} mount
   * @param {import('../state/ModLoader.js').ModLoader} loader
   * @param {Object} [hooks] onOpen/onClose
   */
  constructor(mount, loader, hooks = {}) {
    this.mount = mount;
    this.loader = loader;
    this.hooks = hooks;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'mods';
    root.innerHTML = `
      <div class="mods-panel">
        <div class="mods-head"><span>🧩 MODS</span><button id="mods-close" class="mods-close">✕</button></div>
        <div class="mods-body">
          <div id="mods-list" class="mods-list"></div>

          <p class="mods-step">Add a mod — paste code, name it, hit ADD:</p>
          <input id="mod-name" class="mods-input" placeholder="Mod name (e.g. Taco Rain)" />
          <textarea id="mod-code" class="mods-code" spellcheck="false"
            placeholder="// JavaScript with the api object, e.g.&#10;api.every(0.5, () => {&#10;  const p = api.player();&#10;  api.dropItem('taco', 1, { x: p.x, y: p.y + 14, z: p.z });&#10;});"></textarea>
          <div class="mods-row">
            <button id="mod-add" class="mods-btn">＋ ADD MOD</button>
            <select id="mod-example" class="mods-select">
              <option value="">Load an example…</option>
              ${EXAMPLE_MODS.map((m, i) => `<option value="${i}">${m.name}</option>`).join('')}
            </select>
          </div>
          <button id="mods-apply" class="mods-btn apply">▶ APPLY &amp; RUN MODS</button>

          <details class="mods-api"><summary>📖 Mod API cheat-sheet</summary>
            <pre>api.player() → {x,y,z}         api.tp(x,y,z)
api.getBlock(x,y,z)            api.setBlock(x,y,z,id)
api.groundAt(x,z)              api.give('diamond', 5)
api.dropItem('taco',1,{x,y,z}) api.spawnMob('zombie', x, z)
api.heal() api.hurt(n) api.feed()
api.effect('speed', 30)        api.jumpBoost(2) api.speed(1.5)
api.chat('hello')              api.command('/time night')
api.time(0.75)                 api.killAllMobs()
api.onTick(fn) api.every(seconds, fn)
api.onBreak((x,y,z,id)=>…)     api.onPlace((x,y,z,id)=>…)
api.random(min, max)</pre>
          </details>
        </div>
        <div id="mods-status" class="mods-status">Mods run on your machine only (and sync nothing).</div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;

    root.querySelector('#mods-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });

    root.querySelector('#mod-example').addEventListener('change', (e) => {
      const ex = EXAMPLE_MODS[parseInt(e.target.value, 10)];
      if (!ex) return;
      root.querySelector('#mod-name').value = ex.name;
      root.querySelector('#mod-code').value = ex.code;
      e.target.value = '';
    });

    root.querySelector('#mod-add').addEventListener('click', () => {
      const name = root.querySelector('#mod-name').value.trim() || 'Unnamed mod';
      const code = root.querySelector('#mod-code').value;
      if (!code.trim()) return this._status('Paste some mod code first.');
      const mods = ModLoader.load();
      mods.push({ id: 'm' + Date.now().toString(36), name, code, enabled: true });
      ModLoader.save(mods);
      root.querySelector('#mod-name').value = '';
      root.querySelector('#mod-code').value = '';
      this._renderList();
      this._status(`Added “${name}” — hit APPLY to run it.`);
    });

    root.querySelector('#mods-apply').addEventListener('click', () => {
      this.loader.restart();
      this._status(this.loader.running.length
        ? `Running: ${this.loader.running.join(', ')}`
        : 'No mods enabled.');
    });

    this._renderList();
  }

  _renderList() {
    const list = this.root.querySelector('#mods-list');
    const mods = ModLoader.load();
    if (!mods.length) {
      list.innerHTML = '<div class="mods-empty">No mods yet — load an example below and hit ADD.</div>';
      return;
    }
    list.innerHTML = '';
    for (const mod of mods) {
      const row = document.createElement('div');
      row.className = 'mods-mod' + (mod.enabled ? '' : ' off');
      row.innerHTML = `<span class="mods-mname">${this._escape(mod.name)}</span>`;
      const toggle = document.createElement('button');
      toggle.className = 'mods-mini';
      toggle.textContent = mod.enabled ? 'ON' : 'OFF';
      toggle.addEventListener('click', () => {
        mod.enabled = !mod.enabled;
        ModLoader.save(mods);
        this._renderList();
        this._status('Hit APPLY to make the change live.');
      });
      const del = document.createElement('button');
      del.className = 'mods-mini del';
      del.textContent = '🗑';
      del.addEventListener('click', () => {
        ModLoader.save(mods.filter((m) => m.id !== mod.id));
        this._renderList();
        this._status('Hit APPLY to make the change live.');
      });
      row.appendChild(toggle);
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  _status(text) {
    const el = this.root.querySelector('#mods-status');
    if (el) el.textContent = text;
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _bindKeys() {
    this._onKey = (e) => {
      const a = document.activeElement;
      const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
      if (e.code === 'KeyJ' && !typing) { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.open) this.close();
    };
    document.addEventListener('keydown', this._onKey);
  }

  toggle() { this.open ? this.close() : this.openMenu(); }
  openMenu() { this.open = true; this.root.classList.add('open'); this.hooks.onOpen?.(); this._renderList(); }
  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  dispose() { document.removeEventListener('keydown', this._onKey); this.root.remove(); }

  _injectStyles() {
    if (document.getElementById('mods-styles')) return;
    const style = document.createElement('style');
    style.id = 'mods-styles';
    style.textContent = `
      #mods { position: absolute; inset: 0; z-index: 93; display: none; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); font-family: 'Segoe UI', system-ui, sans-serif; }
      #mods.open { display: flex; }
      .mods-panel { width: min(560px, 94vw); max-height: 88vh; overflow-y: auto;
        background: rgba(22,20,30,0.98); border: 1px solid rgba(180,140,255,0.25); border-radius: 14px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.55); display: flex; flex-direction: column; }
      .mods-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px;
        font-weight: 800; letter-spacing: 1px; color: #d9c8ff; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .mods-close { background: none; border: none; color: #a89ec3; font-size: 18px; cursor: pointer; }
      .mods-body { padding: 12px 18px; }
      .mods-step { font-size: 12px; color: #a89ec3; margin: 10px 0 6px; }
      .mods-list { display: flex; flex-direction: column; gap: 6px; }
      .mods-empty { font-size: 12px; color: #8a80a5; padding: 10px; text-align: center;
        background: rgba(255,255,255,0.04); border-radius: 8px; }
      .mods-mod { display: flex; align-items: center; gap: 8px; padding: 8px 10px;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; }
      .mods-mod.off { opacity: 0.55; }
      .mods-mname { flex: 1; color: #fff; font-weight: 700; font-size: 13px; }
      .mods-mini { padding: 5px 10px; border-radius: 6px; border: none; cursor: pointer; font-weight: 700;
        background: #7c5cd6; color: #fff; font-size: 11px; }
      .mods-mini.del { background: #5a4470; }
      .mods-input { width: 100%; padding: 9px 10px; border-radius: 8px; font-size: 13px; margin-bottom: 6px;
        background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); color: #fff; }
      .mods-code { width: 100%; height: 120px; resize: vertical; font-size: 12px; font-family: monospace;
        color: #d8f0d0; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px; padding: 8px; }
      .mods-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
      .mods-btn { padding: 10px 14px; border-radius: 8px; border: none; cursor: pointer;
        background: #7c5cd6; color: #fff; font-weight: 700; }
      .mods-btn.apply { width: 100%; background: #4caf50; color: #08210a; }
      .mods-select { flex: 1; padding: 9px; border-radius: 8px; background: rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.15); color: #cfc3ea; font-size: 12px; }
      .mods-api { margin-top: 10px; }
      .mods-api summary { font-size: 12px; color: #a89ec3; cursor: pointer; }
      .mods-api pre { font-size: 11px; color: #bfe8b0; background: rgba(0,0,0,0.4); padding: 10px;
        border-radius: 8px; overflow-x: auto; margin-top: 6px; }
      .mods-status { padding: 12px 18px; font-size: 12px; color: #c8b8f0; border-top: 1px solid rgba(255,255,255,0.08); }
    `;
    document.head.appendChild(style);
  }
}

export default ModsMenu;
