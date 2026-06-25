/**
 * SmeltingMenu
 * ------------
 * Furnace UI (toggle with 'G' or the touch Smelt button). Lists every smelt
 * recipe with a button enabled only when you have the input + Coal fuel and are
 * standing near a placed furnace. Re-renders after each smelt.
 */

import { SMELT_RECIPES, canSmelt, smelt } from '../state/Smelting.js';
import { ITEMS } from '../world/ItemTypes.js';

export class SmeltingMenu {
  /**
   * @param {HTMLElement} mount
   * @param {import('../state/Inventory.js').Inventory} inventory
   * @param {() => boolean} nearFurnaceFn
   * @param {Object} [hooks]
   */
  constructor(mount, inventory, nearFurnaceFn, hooks = {}) {
    this.mount = mount;
    this.inventory = inventory;
    this.nearFurnace = nearFurnaceFn;
    this.hooks = hooks;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'smelt';
    root.innerHTML = `
      <div class="smelt-panel">
        <div class="smelt-head"><span>🔥 FURNACE</span><button class="smelt-close" id="smelt-close">✕</button></div>
        <div class="smelt-hint" id="smelt-hint"></div>
        <div class="smelt-list" id="smelt-list"></div>
      </div>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.listEl = root.querySelector('#smelt-list');
    this.hintEl = root.querySelector('#smelt-hint');
    root.querySelector('#smelt-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.code === 'KeyG' && !this._isTyping()) { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.open) this.close();
    };
    document.addEventListener('keydown', this._onKey);
  }

  _isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  toggle() { this.open ? this.close() : this.openMenu(); }

  openMenu() {
    this.open = true;
    this.root.classList.add('open');
    this.hooks.onOpen?.();
    this.render();
  }

  close() {
    this.open = false;
    this.root.classList.remove('open');
    this.hooks.onClose?.();
  }

  render() {
    const near = this.nearFurnace();
    this.hintEl.textContent = near
      ? 'Furnace in range. Smelting uses 1 Coal as fuel per item.'
      : 'Place & stand near a Furnace to smelt.';

    this.listEl.innerHTML = '';
    for (const recipe of SMELT_RECIPES) {
      const check = canSmelt(recipe, this.inventory, near);
      const out = ITEMS[recipe.output];
      const inp = ITEMS[recipe.input];

      const row = document.createElement('div');
      row.className = 'smelt-row' + (check.ok ? '' : ' disabled');
      row.innerHTML = `
        <div class="smelt-flow">
          <span class="smelt-icon">${inp?.glyph ?? '▣'}</span>
          <span class="smelt-arrow">→</span>
          <span class="smelt-icon">${out?.glyph ?? '▣'}</span>
        </div>
        <div class="smelt-name">${inp?.name ?? recipe.input} → ${out?.name ?? recipe.output}</div>
      `;
      const btn = document.createElement('button');
      btn.className = 'smelt-btn';
      btn.textContent = check.ok ? 'Smelt' : (check.reason || 'Locked');
      btn.disabled = !check.ok;
      btn.addEventListener('click', () => {
        const res = smelt(recipe, this.inventory, this.nearFurnace());
        if (res.ok) this.hooks.log?.('Smelted ' + (out?.name ?? recipe.output));
        else if (res.reason) this.hooks.log?.(res.reason);
        this.render();
      });
      row.appendChild(btn);
      this.listEl.appendChild(row);
    }
  }

  dispose() {
    document.removeEventListener('keydown', this._onKey);
    this.root.remove();
  }

  _injectStyles() {
    if (document.getElementById('smelt-styles')) return;
    const style = document.createElement('style');
    style.id = 'smelt-styles';
    style.textContent = `
      #smelt { position: absolute; inset: 0; z-index: 90; display: none;
        align-items: center; justify-content: center; background: rgba(0,0,0,0.45);
        backdrop-filter: blur(2px); font-family: 'Segoe UI', system-ui, sans-serif; }
      #smelt.open { display: flex; }
      .smelt-panel { width: min(460px, 92vw); max-height: 80vh; overflow: hidden;
        background: rgba(24,20,18,0.97); border: 1px solid rgba(255,180,120,0.18);
        border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); display: flex; flex-direction: column; }
      .smelt-head { display: flex; justify-content: space-between; align-items: center;
        padding: 16px 18px; font-weight: 800; letter-spacing: 2px; color: #ffd9b0;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .smelt-close { background: none; border: none; color: #b0a097; font-size: 18px; cursor: pointer; }
      .smelt-hint { padding: 10px 18px; font-size: 12px; color: #c8a890; }
      .smelt-list { overflow-y: auto; padding: 6px 12px 14px; }
      .smelt-row { display: grid; grid-template-columns: 1fr auto;
        grid-template-areas: 'flow btn' 'name btn'; gap: 2px 12px; align-items: center;
        padding: 11px 12px; border-radius: 9px; margin-bottom: 7px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
      .smelt-row.disabled { opacity: 0.5; }
      .smelt-flow { grid-area: flow; display: flex; align-items: center; gap: 8px; font-size: 18px; }
      .smelt-arrow { color: #ff9a52; }
      .smelt-name { grid-area: name; font-size: 12px; color: #d8c4b4; }
      .smelt-btn { grid-area: btn; padding: 9px 14px; border-radius: 8px; border: none;
        background: #e08a3c; color: #2a1505; font-weight: 700; cursor: pointer; font-size: 12px; min-width: 84px; }
      .smelt-btn:disabled { background: #4a4038; color: #978a80; cursor: not-allowed; font-size: 10px; }
    `;
    document.head.appendChild(style);
  }
}

export default SmeltingMenu;
