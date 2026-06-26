/**
 * SmithingMenu
 * ------------
 * Smithing Table UI. Upgrades a Diamond tool/weapon/armor piece into its
 * Netherite version using one Netherite Ingot (no XP cost, per the wiki).
 * Requires standing near a placed Smithing Table.
 */

import { ITEMS } from '../world/ItemTypes.js';
import { itemIconHTML } from '../world/ItemTextures.js';

/** Diamond -> Netherite upgrade pairs. */
export const SMITH_UPGRADES = [
  ['diamond_pickaxe', 'netherite_pickaxe'], ['diamond_axe', 'netherite_axe'], ['diamond_sword', 'netherite_sword'],
  ['diamond_helmet', 'netherite_helmet'], ['diamond_chestplate', 'netherite_chestplate'],
  ['diamond_leggings', 'netherite_leggings'], ['diamond_boots', 'netherite_boots']
];

export class SmithingMenu {
  constructor(mount, inventory, nearTableFn, hooks = {}) {
    this.mount = mount;
    this.inventory = inventory;
    this.nearTable = nearTableFn;
    this.hooks = hooks;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'smith';
    root.innerHTML = `
      <div class="smith-panel">
        <div class="smith-head"><span>🔨 SMITHING</span><button class="smith-close" id="smith-close">✕</button></div>
        <div class="smith-hint" id="smith-hint"></div>
        <div class="smith-list" id="smith-list"></div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;
    this.listEl = root.querySelector('#smith-list');
    this.hintEl = root.querySelector('#smith-hint');
    root.querySelector('#smith-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => { if (e.code === 'Escape' && this.open) this.close(); };
    document.addEventListener('keydown', this._onKey);
  }

  openMenu() { this.open = true; this.root.classList.add('open'); this.hooks.onOpen?.(); this.render(); }
  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  render() {
    const near = this.nearTable();
    this.hintEl.textContent = near
      ? 'Upgrade Diamond gear to Netherite with 1 Netherite Ingot.'
      : 'Place & stand near a Smithing Table.';
    this.listEl.innerHTML = '';
    for (const [from, to] of SMITH_UPGRADES) {
      const has = this.inventory.isCreative || (this.inventory.count(from) >= 1 && this.inventory.count('netherite_ingot') >= 1);
      const ok = near && has;
      const row = document.createElement('div');
      row.className = 'smith-row' + (ok ? '' : ' disabled');
      row.innerHTML = `
        <div class="smith-flow">${itemIconHTML(from, 20)}<span class="smith-plus">+</span>${itemIconHTML('netherite_ingot', 18)}<span class="smith-arrow">→</span>${itemIconHTML(to, 20)}</div>
        <div class="smith-name">${ITEMS[to]?.name ?? to}</div>`;
      const btn = document.createElement('button');
      btn.className = 'smith-btn';
      btn.textContent = ok ? 'Upgrade' : (!near ? 'No table' : 'Need items');
      btn.disabled = !ok;
      btn.addEventListener('click', () => {
        if (!this.inventory.isCreative) {
          if (this.inventory.count(from) < 1 || this.inventory.count('netherite_ingot') < 1) return;
          this.inventory.remove(from, 1);
          this.inventory.remove('netherite_ingot', 1);
        }
        this.inventory.add(to, 1);
        this.hooks.log?.('Upgraded to ' + (ITEMS[to]?.name ?? to));
        this.render();
      });
      row.appendChild(btn);
      this.listEl.appendChild(row);
    }
  }

  dispose() { document.removeEventListener('keydown', this._onKey); this.root.remove(); }

  _injectStyles() {
    if (document.getElementById('smith-styles')) return;
    const style = document.createElement('style');
    style.id = 'smith-styles';
    style.textContent = `
      #smith { position: absolute; inset: 0; z-index: 92; display: none; align-items: center;
        justify-content: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(2px);
        font-family: 'Segoe UI', system-ui, sans-serif; }
      #smith.open { display: flex; }
      .smith-panel { width: min(480px, 92vw); max-height: 82vh; overflow: hidden;
        background: rgba(22,20,22,0.97); border: 1px solid rgba(120,120,130,0.25);
        border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); display: flex; flex-direction: column; }
      .smith-head { display: flex; justify-content: space-between; align-items: center;
        padding: 16px 18px; font-weight: 800; letter-spacing: 2px; color: #d8d8e0;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .smith-close { background: none; border: none; color: #a0a0a8; font-size: 18px; cursor: pointer; }
      .smith-hint { padding: 10px 18px; font-size: 12px; color: #b0b0b8; }
      .smith-list { overflow-y: auto; padding: 6px 12px 14px; }
      .smith-row { display: grid; grid-template-columns: 1fr auto;
        grid-template-areas: 'flow btn' 'name btn'; gap: 2px 12px; align-items: center;
        padding: 10px 12px; border-radius: 9px; margin-bottom: 6px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
      .smith-row.disabled { opacity: 0.5; }
      .smith-flow { grid-area: flow; display: flex; align-items: center; gap: 6px; }
      .smith-plus, .smith-arrow { color: #9aa; font-size: 12px; }
      .smith-name { grid-area: name; font-size: 12px; color: #d0d0d8; }
      .smith-btn { grid-area: btn; padding: 9px 14px; border-radius: 8px; border: none;
        background: #6a6a78; color: #fff; font-weight: 700; cursor: pointer; font-size: 12px; min-width: 84px; }
      .smith-btn:disabled { background: #3a3a44; color: #88889a; cursor: not-allowed; font-size: 10px; }
    `;
    document.head.appendChild(style);
  }
}

export default SmithingMenu;
