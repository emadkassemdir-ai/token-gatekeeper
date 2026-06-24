/**
 * HUD
 * ---
 * The in-world heads-up display. Renders:
 *   - the active username + game mode
 *   - live X/Y/Z coordinate telemetry + flight/swim status
 *   - survival health (hearts) and hunger (food) bars
 *   - a 9-slot item hotbar (block swatch or tool glyph) with live stack counts
 *   - an oxygen meter that only appears while the player is submerged
 *
 * The DOM is built once; per-frame updates only mutate text/classes/inline
 * styles to keep the HUD off the hot path. The hotbar is rebuilt only when the
 * game mode changes (creative palette vs survival stacks).
 */

import { BLOCKS } from '../world/BlockTypes.js';
import { ITEMS, placeBlockId } from '../world/ItemTypes.js';
import { MAX_HEALTH, MAX_HUNGER } from '../state/PlayerStats.js';

function rgbCss(triplet) {
  const [r, g, b] = triplet;
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export class HUD {
  /**
   * @param {HTMLElement} mountPoint
   * @param {import('../state/PlayerProfile.js').PlayerProfile} profile
   * @param {import('../state/Inventory.js').Inventory} inventory
   * @param {import('../state/PlayerStats.js').PlayerStats} stats
   */
  constructor(mountPoint, profile, inventory, stats) {
    this.mount = mountPoint;
    this.profile = profile;
    this.inventory = inventory;
    this.stats = stats;
    this._oxygen = 1;
    this._builtMode = null;
    this._build();
  }

  _build() {
    this._injectStyles();

    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-user">
          <span class="hud-dot"></span>
          <span id="hud-username"></span>
          <span id="hud-gm" class="hud-gm"></span>
        </div>
        <div class="hud-telemetry">
          <span class="hud-coord">X <b id="hud-x">0</b></span>
          <span class="hud-coord">Y <b id="hud-y">0</b></span>
          <span class="hud-coord">Z <b id="hud-z">0</b></span>
          <span id="hud-mode" class="hud-mode"></span>
        </div>
      </div>

      <div id="hud-oxygen" class="hud-oxygen">
        <div class="oxygen-label">OXYGEN</div>
        <div class="oxygen-track"><div id="oxygen-fill" class="oxygen-fill"></div></div>
      </div>

      <div id="hud-vitals" class="hud-vitals">
        <div id="hud-health" class="hud-bar"></div>
        <div id="hud-hunger" class="hud-bar"></div>
      </div>

      <div id="hud-hotbar" class="hud-hotbar"></div>
    `;
    this.mount.appendChild(root);
    this.root = root;

    this.el = {
      username: root.querySelector('#hud-username'),
      gm: root.querySelector('#hud-gm'),
      x: root.querySelector('#hud-x'),
      y: root.querySelector('#hud-y'),
      z: root.querySelector('#hud-z'),
      mode: root.querySelector('#hud-mode'),
      oxygen: root.querySelector('#hud-oxygen'),
      oxygenFill: root.querySelector('#oxygen-fill'),
      vitals: root.querySelector('#hud-vitals'),
      health: root.querySelector('#hud-health'),
      hunger: root.querySelector('#hud-hunger'),
      hotbar: root.querySelector('#hud-hotbar')
    };

    this.el.username.textContent = this.profile.username;
    this._buildIcons();
    this._buildHotbar();
  }

  /** Pre-create heart/food icon elements once. */
  _buildIcons() {
    this._hearts = [];
    this._foods = [];
    for (let i = 0; i < MAX_HEALTH; i++) {
      const h = document.createElement('span');
      h.className = 'icon heart';
      h.textContent = '♥';
      this.el.health.appendChild(h);
      this._hearts.push(h);
    }
    for (let i = 0; i < MAX_HUNGER; i++) {
      const f = document.createElement('span');
      f.className = 'icon food';
      f.textContent = '🍗';
      this.el.hunger.appendChild(f);
      this._foods.push(f);
    }
  }

  _buildHotbar() {
    const hotbar = this.el.hotbar;
    hotbar.innerHTML = '';
    this._slotEls = [];
    this._builtMode = this.inventory.mode;

    const view = this.inventory.getHotbarView();
    view.forEach((entry, i) => {
      const slot = document.createElement('div');
      slot.className = 'hud-slot';

      const swatch = document.createElement('div');
      swatch.className = 'slot-swatch';

      const label = document.createElement('div');
      label.className = 'slot-name';

      const count = document.createElement('div');
      count.className = 'slot-count';

      const key = document.createElement('div');
      key.className = 'slot-key';
      key.textContent = String(i + 1);

      slot.appendChild(key);
      slot.appendChild(swatch);
      slot.appendChild(label);
      slot.appendChild(count);

      const select = (e) => { e.preventDefault(); this.inventory.selectSlot(i); };
      slot.addEventListener('click', select);
      slot.addEventListener('touchstart', select, { passive: false });

      hotbar.appendChild(slot);
      this._slotEls.push({ slot, swatch, label, count });
    });
    this._refreshHotbarContents();
  }

  /** Update each slot's swatch/label/count from the inventory view. */
  _refreshHotbarContents() {
    const view = this.inventory.getHotbarView();
    for (let i = 0; i < this._slotEls.length; i++) {
      const { swatch, label, count } = this._slotEls[i];
      const entry = view[i];
      const def = entry.type ? ITEMS[entry.type] : null;

      if (!def) {
        swatch.style.background = 'transparent';
        swatch.textContent = '';
        label.textContent = '';
        count.textContent = '';
        continue;
      }

      const blockId = placeBlockId(entry.type);
      if (blockId && BLOCKS[blockId]) {
        const b = BLOCKS[blockId];
        swatch.style.background = rgbCss(b.faceColors?.top ?? b.color);
        swatch.style.opacity = b.transparent ? '0.7' : '1';
        swatch.textContent = '';
      } else {
        // Non-block item (tool / material): show its glyph.
        swatch.style.background = 'rgba(255,255,255,0.08)';
        swatch.style.opacity = '1';
        swatch.textContent = def.glyph ?? '▣';
      }
      label.textContent = def.name;
      count.textContent = entry.infinite ? '∞' : entry.count > 1 ? String(entry.count) : '';
    }
  }

  /**
   * Per-frame refresh.
   * @param {Object} state
   * @param {{x:number,y:number,z:number}} state.position
   * @param {boolean} state.flyMode @param {boolean} state.inWater
   * @param {boolean} state.submerged @param {string} state.gameMode
   * @param {number} dt
   */
  update(state, dt) {
    const p = state.position;
    this.el.x.textContent = p.x.toFixed(1);
    this.el.y.textContent = p.y.toFixed(1);
    this.el.z.textContent = p.z.toFixed(1);

    this.el.gm.textContent = state.gameMode === 'creative' ? 'CREATIVE' : 'SURVIVAL';

    let mode = '';
    if (state.flyMode) mode = 'FLY';
    else if (state.inWater) mode = 'SWIM';
    this.el.mode.textContent = mode;
    this.el.mode.style.display = mode ? 'inline-block' : 'none';

    // Rebuild the hotbar if the mode flipped (palette vs stacks differ).
    if (this.inventory.mode !== this._builtMode) this._buildHotbar();
    this._refreshHotbarContents();

    // Selection highlight.
    for (let i = 0; i < this._slotEls.length; i++) {
      this._slotEls[i].slot.classList.toggle('selected', i === this.inventory.selected);
    }

    // Vitals only in survival.
    const survival = state.gameMode === 'survival';
    this.el.vitals.style.display = survival ? 'flex' : 'none';
    if (survival) this._updateVitals();

    this._updateOxygen(state, dt);
  }

  _updateVitals() {
    const hp = this.stats.health;
    for (let i = 0; i < this._hearts.length; i++) {
      const filled = hp >= i + 1;
      const half = !filled && hp > i;
      this._hearts[i].className = 'icon heart' + (filled ? ' full' : half ? ' half' : ' empty');
    }
    const food = this.stats.hunger;
    for (let i = 0; i < this._foods.length; i++) {
      const filled = food >= i + 1;
      const half = !filled && food > i;
      this._foods[i].className = 'icon food' + (filled ? ' full' : half ? ' half' : ' empty');
    }
  }

  _updateOxygen(state, dt) {
    if (state.submerged) {
      this._oxygen = Math.max(0, this._oxygen - dt / 12);
      this.el.oxygen.classList.add('visible');
    } else {
      this._oxygen = Math.min(1, this._oxygen + dt / 3);
      if (this._oxygen >= 1) this.el.oxygen.classList.remove('visible');
    }
    const pct = Math.round(this._oxygen * 100);
    this.el.oxygenFill.style.width = pct + '%';
    this.el.oxygenFill.style.background =
      this._oxygen < 0.25 ? '#ff5a5a' : this._oxygen < 0.5 ? '#ffb454' : '#54b8ff';
  }

  getOxygen() {
    return this._oxygen;
  }

  _injectStyles() {
    if (document.getElementById('hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'hud-styles';
    style.textContent = `
      #hud {
        position: absolute; inset: 0; z-index: 40;
        pointer-events: none; font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .hud-top {
        position: absolute; top: 14px; left: 16px; right: 16px;
        display: flex; justify-content: space-between; align-items: flex-start;
      }
      .hud-user {
        display: flex; align-items: center; gap: 8px;
        background: rgba(10,12,16,0.55); padding: 8px 14px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        font-weight: 700; color: #eaf2fb; font-size: 14px;
      }
      .hud-dot { width: 9px; height: 9px; border-radius: 50%;
        background: var(--accent, #6cc24a); box-shadow: 0 0 8px var(--accent, #6cc24a); }
      .hud-gm { font-size: 10px; letter-spacing: 1px; color: #9fb0c3;
        padding: 2px 6px; border: 1px solid rgba(255,255,255,0.15); border-radius: 5px; }
      .hud-telemetry {
        display: flex; gap: 8px; align-items: center;
        background: rgba(10,12,16,0.55); padding: 8px 12px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        font-variant-numeric: tabular-nums; font-size: 13px; color: #b9c8d8;
      }
      .hud-coord b { color: #fff; margin-left: 2px; }
      .hud-mode {
        margin-left: 4px; padding: 2px 8px; border-radius: 6px;
        background: var(--accent, #6cc24a); color: #08240a;
        font-size: 11px; font-weight: 800; letter-spacing: 1px;
      }
      .hud-oxygen {
        position: absolute; bottom: calc(166px + var(--safe-bottom, 0px));
        left: 50%; transform: translateX(-50%);
        width: 240px; text-align: center; opacity: 0; transition: opacity 0.25s ease;
      }
      .hud-oxygen.visible { opacity: 1; }
      .oxygen-label { font-size: 10px; letter-spacing: 2px; color: #bfe0ff;
        margin-bottom: 5px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
      .oxygen-track { height: 12px; border-radius: 6px; overflow: hidden;
        background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.18); }
      .oxygen-fill { height: 100%; width: 100%; background: #54b8ff;
        transition: width 0.12s linear, background 0.2s linear; }

      .hud-vitals {
        position: absolute; bottom: calc(104px + var(--safe-bottom, 0px));
        left: 50%; transform: translateX(-50%);
        display: flex; flex-direction: column; gap: 3px; align-items: center;
        text-shadow: 0 1px 2px rgba(0,0,0,0.9);
      }
      .hud-bar { display: flex; gap: 2px; }
      .hud-bar .icon { font-size: 16px; line-height: 1; }
      .icon.heart.full { color: #ff4d4d; }
      .icon.heart.half { color: #ff4d4d; opacity: 0.55; }
      .icon.heart.empty { color: #3a2326; }
      .icon.food.full { filter: none; }
      .icon.food.half { opacity: 0.5; }
      .icon.food.empty { filter: grayscale(1) brightness(0.4); opacity: 0.5; }

      .hud-hotbar {
        position: absolute; bottom: calc(28px + var(--safe-bottom, 0px));
        left: 50%; transform: translateX(-50%);
        display: flex; gap: 6px; padding: 7px;
        background: rgba(10,12,16,0.5); border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        pointer-events: auto;
      }
      .hud-slot {
        position: relative; width: 56px; height: 56px; border-radius: 9px;
        background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.10);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        transition: border-color 0.1s, transform 0.1s; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .hud-slot.selected {
        border-color: #fff; transform: translateY(-6px);
        box-shadow: 0 6px 16px rgba(0,0,0,0.5);
      }
      .slot-swatch {
        width: 26px; height: 26px; border-radius: 5px;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
        display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      .slot-name { font-size: 8.5px; color: #cdd9e6; margin-top: 4px;
        max-width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .slot-key { position: absolute; top: 3px; left: 5px; font-size: 9px; color: #9fb0c3; font-weight: 700; }
      .slot-count { position: absolute; bottom: 2px; right: 5px; font-size: 11px;
        font-weight: 800; color: #fff; text-shadow: 0 1px 2px #000; }
    `;
    document.head.appendChild(style);
  }
}

export default HUD;
