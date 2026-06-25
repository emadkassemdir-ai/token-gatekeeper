/**
 * GameMenu
 * --------
 * The front-end flow before the world loads:
 *   1. Username entry (validated).
 *   2. World browser — play or delete existing worlds, or open "Create World"
 *      (name, optional seed, survival/creative, difficulty, cheats).
 *   3. Avatar customization button (handed off to the host).
 *
 * `show()` resolves with the chosen/created world record.
 */

import { PlayerProfile } from '../state/PlayerProfile.js';
import { WorldStore, DIFFICULTIES } from '../state/WorldStore.js';
import { GoogleAuth } from '../state/GoogleAuth.js';

export class GameMenu {
  /**
   * @param {HTMLElement} mountPoint
   * @param {Object} [options]
   * @param {() => (void|Promise<void>)} [options.onEditAvatar]
   */
  constructor(mountPoint, options = {}) {
    this.mount = mountPoint;
    this.options = options;
    this.username = '';
    this._resolve = null;
  }

  /** @returns {Promise<Object>} the selected/created world record. */
  show() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._injectStyles();
      this._renderUsername();
    });
  }

  _clear() {
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
  }

  /* ----------------------------- username -------------------------------- */

  _renderUsername() {
    this._clear();
    const root = document.createElement('div');
    root.id = 'splash';
    root.innerHTML = `
      <div class="splash-card">
        <h1 class="splash-title">VOXEL<span>CRAFT</span></h1>
        <p class="splash-tag">An infinite block sandbox engine</p>
        <label class="field-label" for="username-input">Enter your username</label>
        <input id="username-input" type="text" autocomplete="off" spellcheck="false"
               maxlength="24" placeholder="e.g. Steve" />
        <div id="username-error" class="field-error"></div>
        <button id="next-button" disabled>CONTINUE</button>
        <div id="google-row" class="google-row"></div>
        <button id="avatar-button" class="secondary-button">CUSTOMIZE AVATAR</button>
        <div class="controls-hint">
          <strong>Controls</strong>
          WASD move · Mouse look · Space jump · F fly · 1-9 hotbar ·
          Left-click mine/attack · Right-click place/eat/equip · E craft ·
          G furnace · I inventory · T chat<br>
          Touch: joystick + drag-look · hold to mine · tap to place
        </div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;

    const input = root.querySelector('#username-input');
    const button = root.querySelector('#next-button');
    const error = root.querySelector('#username-error');
    root.querySelector('#avatar-button').addEventListener('click', () => this.options.onEditAvatar?.());

    const validate = () => {
      const res = PlayerProfile.validateUsername(input.value);
      button.disabled = !res.valid;
      error.textContent = res.valid || !input.value.length ? '' : res.reason;
    };
    const submit = () => {
      const res = PlayerProfile.validateUsername(input.value);
      if (!res.valid) { error.textContent = res.reason; return; }
      this.username = res.value;
      this._renderWorlds();
    };
    input.addEventListener('input', validate);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    button.addEventListener('click', submit);
    validate();
    setTimeout(() => input.focus(), 50);

    // Optional "Sign in with Google": uses the Google name as the multiplayer
    // identity. Only shown when a Client ID is configured (graceful fallback).
    const gRow = root.querySelector('#google-row');
    if (GoogleAuth.isConfigured()) {
      const label = document.createElement('div');
      label.className = 'google-label';
      label.textContent = 'or';
      gRow.appendChild(label);
      const btnHost = document.createElement('div');
      gRow.appendChild(btnHost);
      GoogleAuth.renderButton(btnHost, (user) => {
        this.username = PlayerProfile.sanitizeUsername(user.name || 'Player');
        this.googleUser = user;
        this._renderWorlds();
      }).catch((err) => { label.textContent = err.message; });
    }
  }

  /* ------------------------------ worlds --------------------------------- */

  _renderWorlds() {
    this._clear();
    const root = document.createElement('div');
    root.id = 'splash';
    root.innerHTML = `
      <div class="worlds-card">
        <div class="worlds-head">
          <h2>Worlds</h2>
          <span class="worlds-user">${this._escape(this.username)}</span>
        </div>
        <div id="worlds-list" class="worlds-list"></div>
        <button id="create-button" class="primary-wide">+ CREATE NEW WORLD</button>
        <div class="worlds-foot">
          <button id="avatar-button2" class="secondary-button">CUSTOMIZE AVATAR</button>
          <button id="back-button" class="secondary-button">← BACK</button>
        </div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;

    root.querySelector('#avatar-button2').addEventListener('click', () => this.options.onEditAvatar?.());
    root.querySelector('#back-button').addEventListener('click', () => this._renderUsername());
    root.querySelector('#create-button').addEventListener('click', () => this._renderCreate());

    this._refreshWorldsList();
  }

  _refreshWorldsList() {
    const list = this.root.querySelector('#worlds-list');
    const worlds = WorldStore.list();
    if (!worlds.length) {
      list.innerHTML = '<div class="worlds-empty">No worlds yet. Create one to start!</div>';
      return;
    }
    list.innerHTML = '';
    for (const w of worlds) {
      const row = document.createElement('div');
      row.className = 'world-row';
      const date = new Date(w.lastPlayed || w.createdAt).toLocaleDateString();
      row.innerHTML = `
        <div class="world-info">
          <div class="world-name">${this._escape(w.name)}</div>
          <div class="world-meta">${w.gameMode} · ${w.difficulty}${w.cheats ? ' · cheats' : ''} · seed ${w.seed} · ${date}</div>
        </div>
        <div class="world-actions">
          <button class="world-play">Play</button>
          <button class="world-del" title="Delete">🗑</button>
        </div>`;
      row.querySelector('.world-play').addEventListener('click', () => this._play(w));
      row.querySelector('.world-del').addEventListener('click', () => {
        if (confirm(`Delete world "${w.name}"? This cannot be undone.`)) {
          WorldStore.delete(w.id);
          this._refreshWorldsList();
        }
      });
      list.appendChild(row);
    }
  }

  _play(record) {
    record.username = this.username;
    WorldStore.save(record);
    this._clear();
    this._resolve?.(record);
  }

  /* ------------------------------ create --------------------------------- */

  _renderCreate() {
    this._clear();
    const root = document.createElement('div');
    root.id = 'splash';
    const diffOptions = DIFFICULTIES
      .map((d) => `<option value="${d}"${d === 'normal' ? ' selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`)
      .join('');
    root.innerHTML = `
      <div class="worlds-card">
        <div class="worlds-head"><h2>Create World</h2></div>
        <label class="field-label">World name</label>
        <input id="cw-name" type="text" maxlength="32" placeholder="My World" value="My World" />
        <label class="field-label">Seed (blank = random)</label>
        <input id="cw-seed" type="text" maxlength="24" placeholder="random" />
        <label class="field-label">Game mode</label>
        <div class="cw-toggle" id="cw-mode">
          <button data-v="survival" class="active">Survival</button>
          <button data-v="creative">Creative</button>
        </div>
        <label class="field-label">Difficulty</label>
        <select id="cw-diff" class="cw-select">${diffOptions}</select>
        <label class="cw-check"><input type="checkbox" id="cw-cheats" /> Enable cheats (25 OP commands)</label>
        <button id="cw-create" class="primary-wide">CREATE & PLAY</button>
        <button id="cw-cancel" class="secondary-button">← BACK</button>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;

    let mode = 'survival';
    const modeWrap = root.querySelector('#cw-mode');
    modeWrap.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        mode = b.dataset.v;
        modeWrap.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    root.querySelector('#cw-cancel').addEventListener('click', () => this._renderWorlds());
    root.querySelector('#cw-create').addEventListener('click', () => {
      const record = WorldStore.create({
        name: root.querySelector('#cw-name').value.trim() || 'My World',
        username: this.username,
        seed: root.querySelector('#cw-seed').value,
        gameMode: mode,
        difficulty: root.querySelector('#cw-diff').value,
        cheats: root.querySelector('#cw-cheats').checked
      });
      this._clear();
      this._resolve?.(record);
    });
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _injectStyles() {
    if (document.getElementById('splash-styles')) return;
    const style = document.createElement('style');
    style.id = 'splash-styles';
    style.textContent = `
      #splash { position: absolute; inset: 0; z-index: 100; display: flex;
        align-items: center; justify-content: center;
        background: radial-gradient(1200px 600px at 50% -10%, #2b6cb0 0%, transparent 60%),
          linear-gradient(160deg, #0b1220 0%, #131a26 60%, #0a0c10 100%); }
      #splash { animation: splashFade 0.35s ease; }
      @keyframes splashFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes cardIn { from { opacity: 0; transform: translateY(14px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); } }
      .splash-card, .worlds-card {
        width: min(460px, 92vw); max-height: 92vh; overflow-y: auto;
        padding: 32px 30px 26px; background: var(--panel, rgba(18,20,24,0.92));
        border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
        box-shadow: 0 24px 70px rgba(0,0,0,0.55); text-align: center;
        animation: cardIn 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
      .splash-title { font-size: 40px; letter-spacing: 4px; font-weight: 800; color: #fff; margin-bottom: 4px; }
      .splash-title span { color: var(--accent, #6cc24a); }
      .splash-tag { color: #9fb0c3; font-size: 13px; margin-bottom: 26px; }
      .field-label { display: block; text-align: left; font-size: 12px; text-transform: uppercase;
        letter-spacing: 1px; color: #8aa0b6; margin: 14px 0 6px; }
      #username-input, #cw-name, #cw-seed, .cw-select {
        width: 100%; padding: 12px 14px; font-size: 15px; color: #fff; background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 9px; outline: none; }
      #username-input:focus, #cw-name:focus, #cw-seed:focus { border-color: var(--accent, #6cc24a); }
      .field-error { color: #ff7a7a; font-size: 12px; min-height: 16px; text-align: left; margin: 6px 2px 0; }
      #next-button, .primary-wide {
        width: 100%; margin-top: 16px; padding: 13px; font-size: 15px; font-weight: 700; letter-spacing: 2px;
        color: #08240a; background: var(--accent, #6cc24a); border: none; border-radius: 9px; cursor: pointer;
        transition: filter 0.15s ease, transform 0.06s ease, background 0.15s ease; }
      #next-button:hover:not(:disabled), .primary-wide:hover { filter: brightness(1.08); }
      #next-button:active:not(:disabled), .primary-wide:active { transform: translateY(1px); }
      #next-button:disabled { background: #3a4452; color: #788596; cursor: not-allowed; }
      .google-row { margin-top: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .google-label { font-size: 11px; color: #8aa0b6; text-transform: uppercase; letter-spacing: 1px; }
      .secondary-button { width: 100%; margin-top: 10px; padding: 11px; font-size: 13px; font-weight: 700;
        letter-spacing: 1px; color: #d6e2ef; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.14); border-radius: 9px; cursor: pointer; }
      .secondary-button:hover { background: rgba(108,194,74,0.16); border-color: var(--accent, #6cc24a); }
      .controls-hint { margin-top: 22px; padding-top: 16px; font-size: 11px; line-height: 1.7; color: #7e90a4;
        border-top: 1px solid rgba(255,255,255,0.07); }
      .controls-hint strong { display: block; color: #aebccd; margin-bottom: 4px; letter-spacing: 1px;
        text-transform: uppercase; font-size: 10px; }
      .worlds-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
      .worlds-head h2 { color: #fff; letter-spacing: 1px; }
      .worlds-user { color: var(--accent, #6cc24a); font-size: 13px; font-weight: 700; }
      .worlds-list { display: flex; flex-direction: column; gap: 8px; max-height: 46vh; overflow-y: auto; margin-bottom: 14px; }
      .worlds-empty { color: #8aa0b6; font-size: 13px; padding: 20px; }
      .world-row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 10px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px; text-align: left;
        transition: background 0.15s ease, border-color 0.15s ease, transform 0.08s ease; }
      .world-row:hover { background: rgba(255,255,255,0.09); border-color: rgba(108,194,74,0.4); }
      .world-play, .world-del { transition: filter 0.15s ease, transform 0.06s ease; }
      .world-play:hover { filter: brightness(1.1); }
      .cw-toggle button { transition: background 0.15s ease, color 0.15s ease; }
      .world-name { color: #f1f5fa; font-weight: 700; font-size: 14px; }
      .world-meta { color: #8aa0b6; font-size: 11px; margin-top: 2px; }
      .world-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .world-play { padding: 8px 14px; border-radius: 8px; border: none; background: var(--accent, #6cc24a);
        color: #08240a; font-weight: 700; cursor: pointer; }
      .world-del { padding: 8px 10px; border-radius: 8px; border: none; background: rgba(217,74,74,0.2);
        color: #ff9a9a; cursor: pointer; }
      .worlds-foot { display: flex; gap: 8px; }
      .worlds-foot .secondary-button { margin-top: 0; }
      .cw-toggle { display: flex; gap: 8px; }
      .cw-toggle button { flex: 1; padding: 11px; border-radius: 9px; cursor: pointer; font-weight: 700;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: #cdd9e6; }
      .cw-toggle button.active { background: var(--accent, #6cc24a); color: #08240a; border-color: transparent; }
      .cw-select { cursor: pointer; }
      .cw-check { display: flex; align-items: center; gap: 8px; margin-top: 14px; color: #cdd9e6; font-size: 13px; text-align: left; }
    `;
    document.head.appendChild(style);
  }
}

export default GameMenu;
