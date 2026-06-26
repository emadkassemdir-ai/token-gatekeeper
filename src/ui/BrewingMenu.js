/**
 * BrewingMenu
 * -----------
 * Brewing Stand UI. Lists every brewing recipe; a button is enabled only when
 * you have the ingredients + Blaze Powder fuel and stand near a Brewing Stand.
 * Mirrors the Smelting/Crafting menu pattern.
 */

import { BREW_RECIPES, canBrew, brew } from '../state/Potions.js';
import { ITEMS } from '../world/ItemTypes.js';
import { itemIconHTML } from '../world/ItemTextures.js';

export class BrewingMenu {
  constructor(mount, inventory, nearStandFn, hooks = {}) {
    this.mount = mount;
    this.inventory = inventory;
    this.nearStand = nearStandFn;
    this.hooks = hooks;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'brew';
    root.innerHTML = `
      <div class="brew-panel">
        <div class="brew-head"><span>⚗ BREWING</span><button class="brew-close" id="brew-close">✕</button></div>
        <div class="brew-hint" id="brew-hint"></div>
        <div class="brew-list" id="brew-list"></div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;
    this.listEl = root.querySelector('#brew-list');
    this.hintEl = root.querySelector('#brew-hint');
    root.querySelector('#brew-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => { if (e.code === 'Escape' && this.open) this.close(); };
    document.addEventListener('keydown', this._onKey);
  }

  openMenu() { this.open = true; this.root.classList.add('open'); this.hooks.onOpen?.(); this.render(); }
  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  render() {
    const near = this.nearStand();
    this.hintEl.textContent = near
      ? 'Brewing uses Blaze Powder as fuel. Drink potions to gain their effect.'
      : 'Place & stand near a Brewing Stand.';
    this.listEl.innerHTML = '';
    for (const recipe of BREW_RECIPES) {
      const check = canBrew(recipe, this.inventory, near);
      const out = ITEMS[recipe.output];
      const row = document.createElement('div');
      row.className = 'brew-row' + (check.ok ? '' : ' disabled');
      const ing = recipe.inputs.map((i) => `${itemIconHTML(i.type, 18)}`).join('<span class="brew-plus">+</span>');
      row.innerHTML = `
        <div class="brew-flow">${ing}<span class="brew-arrow">→</span>${itemIconHTML(recipe.output, 20)}</div>
        <div class="brew-name">${out?.name ?? recipe.output}</div>`;
      const btn = document.createElement('button');
      btn.className = 'brew-btn';
      btn.textContent = check.ok ? 'Brew' : (check.reason || 'Locked');
      btn.disabled = !check.ok;
      btn.addEventListener('click', () => {
        const res = brew(recipe, this.inventory, this.nearStand());
        if (res.ok) this.hooks.log?.('Brewed ' + (out?.name ?? recipe.output));
        else if (res.reason) this.hooks.log?.(res.reason);
        this.render();
      });
      row.appendChild(btn);
      this.listEl.appendChild(row);
    }
  }

  dispose() { document.removeEventListener('keydown', this._onKey); this.root.remove(); }

  _injectStyles() {
    if (document.getElementById('brew-styles')) return;
    const style = document.createElement('style');
    style.id = 'brew-styles';
    style.textContent = `
      #brew { position: absolute; inset: 0; z-index: 92; display: none; align-items: center;
        justify-content: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(2px);
        font-family: 'Segoe UI', system-ui, sans-serif; }
      #brew.open { display: flex; }
      .brew-panel { width: min(480px, 92vw); max-height: 82vh; overflow: hidden;
        background: rgba(20,16,26,0.97); border: 1px solid rgba(150,110,200,0.22);
        border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); display: flex; flex-direction: column; }
      .brew-head { display: flex; justify-content: space-between; align-items: center;
        padding: 16px 18px; font-weight: 800; letter-spacing: 2px; color: #d9b8ff;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .brew-close { background: none; border: none; color: #a89cc0; font-size: 18px; cursor: pointer; }
      .brew-hint { padding: 10px 18px; font-size: 12px; color: #b8a8d0; }
      .brew-list { overflow-y: auto; padding: 6px 12px 14px; }
      .brew-row { display: grid; grid-template-columns: 1fr auto;
        grid-template-areas: 'flow btn' 'name btn'; gap: 2px 12px; align-items: center;
        padding: 10px 12px; border-radius: 9px; margin-bottom: 6px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
      .brew-row.disabled { opacity: 0.5; }
      .brew-flow { grid-area: flow; display: flex; align-items: center; gap: 6px; }
      .brew-plus, .brew-arrow { color: #b08aff; font-size: 12px; }
      .brew-name { grid-area: name; font-size: 12px; color: #d8c4e8; }
      .brew-btn { grid-area: btn; padding: 9px 14px; border-radius: 8px; border: none;
        background: #9b6cff; color: #fff; font-weight: 700; cursor: pointer; font-size: 12px; min-width: 84px; }
      .brew-btn:disabled { background: #3a3450; color: #978aa8; cursor: not-allowed; font-size: 10px; }
    `;
    document.head.appendChild(style);
  }
}

export default BrewingMenu;
