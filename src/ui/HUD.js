/**
 * HUD
 * ---
 * The in-world heads-up display. Renders:
 *   - the active username
 *   - live X/Y/Z coordinate telemetry + flight/swim status
 *   - a 9-slot hotbar with the selected slot highlighted
 *   - an oxygen meter that only appears while the player is submerged
 *
 * The DOM is built once; per-frame updates only mutate text/classes/inline
 * styles to keep the HUD off the hot path.
 */

import { BLOCKS } from '../world/BlockTypes.js';

function rgbCss(triplet) {
  const [r, g, b] = triplet;
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export class HUD {
  /**
   * @param {HTMLElement} mountPoint
   * @param {import('../state/PlayerProfile.js').PlayerProfile} profile
   */
  constructor(mountPoint, profile) {
    this.mount = mountPoint;
    this.profile = profile;
    this._lastSlot = -1;
    this._oxygen = 1; // 0..1
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

      <div id="hud-hotbar" class="hud-hotbar"></div>
    `;
    this.mount.appendChild(root);
    this.root = root;

    this.el = {
      username: root.querySelector('#hud-username'),
      x: root.querySelector('#hud-x'),
      y: root.querySelector('#hud-y'),
      z: root.querySelector('#hud-z'),
      mode: root.querySelector('#hud-mode'),
      oxygen: root.querySelector('#hud-oxygen'),
      oxygenFill: root.querySelector('#oxygen-fill'),
      hotbar: root.querySelector('#hud-hotbar')
    };

    this.el.username.textContent = this.profile.username;
    this._buildHotbar();
  }

  _buildHotbar() {
    const hotbar = this.el.hotbar;
    hotbar.innerHTML = '';
    this._slotEls = [];

    this.profile.hotbar.forEach((blockId, i) => {
      const def = BLOCKS[blockId];
      const slot = document.createElement('div');
      slot.className = 'hud-slot';

      const swatch = document.createElement('div');
      swatch.className = 'slot-swatch';
      swatch.style.background = def ? rgbCss(def.faceColors?.top ?? def.color) : '#222';
      if (def?.transparent) swatch.style.opacity = '0.7';

      const label = document.createElement('div');
      label.className = 'slot-name';
      label.textContent = def ? def.name : '—';

      const key = document.createElement('div');
      key.className = 'slot-key';
      key.textContent = String(i + 1);

      slot.appendChild(key);
      slot.appendChild(swatch);
      slot.appendChild(label);
      hotbar.appendChild(slot);
      this._slotEls.push(slot);
    });
  }

  /**
   * Per-frame refresh.
   * @param {Object} state
   * @param {{x:number,y:number,z:number}} state.position
   * @param {boolean} state.flyMode
   * @param {boolean} state.inWater
   * @param {boolean} state.submerged
   * @param {number} dt
   */
  update(state, dt) {
    const p = state.position;
    this.el.x.textContent = p.x.toFixed(1);
    this.el.y.textContent = p.y.toFixed(1);
    this.el.z.textContent = p.z.toFixed(1);

    // Locomotion mode badge.
    let mode = '';
    if (state.flyMode) mode = 'FLY';
    else if (state.inWater) mode = 'SWIM';
    this.el.mode.textContent = mode;
    this.el.mode.style.display = mode ? 'inline-block' : 'none';

    // Hotbar selection highlight (only mutate on change).
    if (this.profile.selectedSlot !== this._lastSlot) {
      this._slotEls.forEach((el, i) =>
        el.classList.toggle('selected', i === this.profile.selectedSlot)
      );
      this._lastSlot = this.profile.selectedSlot;
    }

    this._updateOxygen(state, dt);
  }

  _updateOxygen(state, dt) {
    if (state.submerged) {
      this._oxygen = Math.max(0, this._oxygen - dt / 12); // ~12s of air
      this.el.oxygen.classList.add('visible');
    } else {
      this._oxygen = Math.min(1, this._oxygen + dt / 3); // refill faster
      if (this._oxygen >= 1) this.el.oxygen.classList.remove('visible');
    }
    const pct = Math.round(this._oxygen * 100);
    this.el.oxygenFill.style.width = pct + '%';
    this.el.oxygenFill.style.background =
      this._oxygen < 0.25 ? '#ff5a5a' : this._oxygen < 0.5 ? '#ffb454' : '#54b8ff';
  }

  /** @returns {number} current oxygen 0..1 (so the engine can apply drowning). */
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
        position: absolute; bottom: 120px; left: 50%; transform: translateX(-50%);
        width: 240px; text-align: center; opacity: 0;
        transition: opacity 0.25s ease;
      }
      .hud-oxygen.visible { opacity: 1; }
      .oxygen-label { font-size: 10px; letter-spacing: 2px; color: #bfe0ff;
        margin-bottom: 5px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
      .oxygen-track {
        height: 12px; border-radius: 6px; overflow: hidden;
        background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.18);
      }
      .oxygen-fill { height: 100%; width: 100%; background: #54b8ff;
        transition: width 0.12s linear, background 0.2s linear; }
      .hud-hotbar {
        position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 6px; padding: 7px;
        background: rgba(10,12,16,0.5); border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
      }
      .hud-slot {
        position: relative; width: 56px; height: 56px; border-radius: 9px;
        background: rgba(255,255,255,0.05);
        border: 2px solid rgba(255,255,255,0.10);
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; transition: border-color 0.1s, transform 0.1s;
      }
      .hud-slot.selected {
        border-color: #fff; transform: translateY(-6px);
        box-shadow: 0 6px 16px rgba(0,0,0,0.5);
      }
      .slot-swatch { width: 26px; height: 26px; border-radius: 5px;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25); }
      .slot-name { font-size: 8.5px; color: #cdd9e6; margin-top: 4px;
        max-width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .slot-key { position: absolute; top: 3px; left: 5px; font-size: 9px;
        color: #9fb0c3; font-weight: 700; }
    `;
    document.head.appendChild(style);
  }
}

export default HUD;
