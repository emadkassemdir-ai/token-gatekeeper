/**
 * TradeMenu
 * ---------
 * Villager trading. Right-click a Villager to open it. Trades exchange Emeralds
 * for goods (and goods for Emeralds), giving Emeralds — and the villager — a
 * real purpose. A button is enabled only when you can afford the trade.
 */

import { ITEMS } from '../world/ItemTypes.js';
import { itemIconHTML } from '../world/ItemTextures.js';

/** give[] -> get. The unemployed villager's generic trades. */
export const TRADES = [
  { give: [{ type: 'emerald', count: 1 }], get: { type: 'oak_planks', count: 16 } },
  { give: [{ type: 'emerald', count: 1 }], get: { type: 'bread', count: 6 } },
  { give: [{ type: 'emerald', count: 3 }], get: { type: 'ender_pearl', count: 1 } },
  { give: [{ type: 'emerald', count: 6 }], get: { type: 'golden_carrot', count: 4 } },
  { give: [{ type: 'wheat', count: 20 }], get: { type: 'emerald', count: 1 } },
  { give: [{ type: 'coal', count: 16 }], get: { type: 'emerald', count: 1 } },
  { give: [{ type: 'diamond', count: 1 }], get: { type: 'emerald', count: 1 } }
];

/**
 * Per-profession trade tables. A villager claims a nearby job-site block and
 * offers that profession's deals (wiki-flavoured), falling back to TRADES when
 * it has no job site (an "unemployed" villager).
 */
export const PROFESSIONS = {
  none: { label: 'VILLAGER', trades: TRADES },
  farmer: { label: 'FARMER', trades: [
    { give: [{ type: 'wheat', count: 20 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'carrot', count: 22 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'potato', count: 22 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'bread', count: 6 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'apple', count: 4 } },
    { give: [{ type: 'emerald', count: 3 }], get: { type: 'golden_carrot', count: 3 } }
  ] },
  librarian: { label: 'LIBRARIAN', trades: [
    { give: [{ type: 'paper', count: 24 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'book', count: 4 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 9 }], get: { type: 'book', count: 1 } },
    { give: [{ type: 'emerald', count: 5 }], get: { type: 'bookshelf', count: 2 } },
    { give: [{ type: 'emerald', count: 3 }], get: { type: 'glass', count: 4 } }
  ] },
  cartographer: { label: 'CARTOGRAPHER', trades: [
    { give: [{ type: 'paper', count: 24 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 2 }], get: { type: 'paper', count: 8 } },
    { give: [{ type: 'emerald', count: 4 }], get: { type: 'glass', count: 4 } }
  ] },
  fletcher: { label: 'FLETCHER', trades: [
    { give: [{ type: 'stick', count: 32 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'flint', count: 26 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'arrow', count: 16 } },
    { give: [{ type: 'emerald', count: 3 }], get: { type: 'bow', count: 1 } }
  ] },
  shepherd: { label: 'SHEPHERD', trades: [
    { give: [{ type: 'white_wool', count: 18 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'white_wool', count: 4 } },
    { give: [{ type: 'emerald', count: 3 }], get: { type: 'bed', count: 1 } }
  ] },
  mason: { label: 'MASON', trades: [
    { give: [{ type: 'stone', count: 20 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'stone_bricks', count: 4 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'bricks', count: 4 } }
  ] },
  toolsmith: { label: 'TOOLSMITH', trades: [
    { give: [{ type: 'coal', count: 15 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 4 }], get: { type: 'iron_pickaxe', count: 1 } },
    { give: [{ type: 'emerald', count: 4 }], get: { type: 'iron_axe', count: 1 } },
    { give: [{ type: 'emerald', count: 12 }], get: { type: 'diamond_pickaxe', count: 1 } }
  ] },
  weaponsmith: { label: 'WEAPONSMITH', trades: [
    { give: [{ type: 'coal', count: 15 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 4 }], get: { type: 'iron_sword', count: 1 } },
    { give: [{ type: 'emerald', count: 12 }], get: { type: 'diamond_sword', count: 1 } }
  ] },
  armorer: { label: 'ARMORER', trades: [
    { give: [{ type: 'coal', count: 15 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 5 }], get: { type: 'iron_chestplate', count: 1 } },
    { give: [{ type: 'emerald', count: 3 }], get: { type: 'iron_helmet', count: 1 } },
    { give: [{ type: 'emerald', count: 4 }], get: { type: 'iron_leggings', count: 1 } }
  ] },
  butcher: { label: 'BUTCHER', trades: [
    { give: [{ type: 'raw_beef', count: 10 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'raw_porkchop', count: 10 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'steak', count: 4 } }
  ] },
  cleric: { label: 'CLERIC', trades: [
    { give: [{ type: 'rotten_flesh', count: 32 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 3 }], get: { type: 'redstone', count: 4 } },
    { give: [{ type: 'emerald', count: 4 }], get: { type: 'glowstone', count: 2 } },
    { give: [{ type: 'emerald', count: 3 }], get: { type: 'ender_pearl', count: 1 } }
  ] },
  fisherman: { label: 'FISHERMAN', trades: [
    { give: [{ type: 'raw_salmon', count: 13 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'coal', count: 10 }], get: { type: 'emerald', count: 1 } },
    { give: [{ type: 'emerald', count: 1 }], get: { type: 'cooked_salmon', count: 4 } }
  ] }
};

export class TradeMenu {
  constructor(mount, inventory, hooks = {}) {
    this.mount = mount;
    this.inventory = inventory;
    this.hooks = hooks;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'trade';
    root.innerHTML = `
      <div class="trade-panel">
        <div class="trade-head"><span id="trade-title">💚 VILLAGER TRADES</span><button class="trade-close" id="trade-close">✕</button></div>
        <div class="trade-list" id="trade-list"></div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;
    this.listEl = root.querySelector('#trade-list');
    this.headEl = root.querySelector('#trade-title');
    root.querySelector('#trade-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => { if (e.code === 'Escape' && this.open) this.close(); };
    document.addEventListener('keydown', this._onKey);
  }

  openMenu(profession = 'none') {
    this.profession = PROFESSIONS[profession] ? profession : 'none';
    this.open = true; this.root.classList.add('open'); this.hooks.onOpen?.();
    const prof = PROFESSIONS[this.profession];
    this.headEl.textContent = '💚 ' + prof.label + ' TRADES';
    this.render();
  }
  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  _afford(trade) {
    if (this.inventory.isCreative) return true;
    return trade.give.every((g) => this.inventory.count(g.type) >= g.count);
  }

  render() {
    this.listEl.innerHTML = '';
    const trades = PROFESSIONS[this.profession || 'none'].trades;
    for (const trade of trades) {
      const ok = this._afford(trade);
      const row = document.createElement('div');
      row.className = 'trade-row' + (ok ? '' : ' disabled');
      const give = trade.give.map((g) => `${itemIconHTML(g.type, 18)}<span class="trade-x">×${g.count}</span>`).join('');
      row.innerHTML = `
        <div class="trade-flow">${give}<span class="trade-arrow">→</span>${itemIconHTML(trade.get.type, 20)}<span class="trade-x">×${trade.get.count}</span></div>
        <div class="trade-name">${ITEMS[trade.get.type]?.name ?? trade.get.type}</div>`;
      const btn = document.createElement('button');
      btn.className = 'trade-btn';
      btn.textContent = ok ? 'Trade' : 'Need items';
      btn.disabled = !ok;
      btn.addEventListener('click', () => {
        if (!this._afford(trade)) return;
        if (!this.inventory.isCreative) for (const g of trade.give) this.inventory.remove(g.type, g.count);
        this.inventory.add(trade.get.type, trade.get.count);
        this.hooks.log?.('Traded for ' + (ITEMS[trade.get.type]?.name ?? trade.get.type));
        this.render();
      });
      row.appendChild(btn);
      this.listEl.appendChild(row);
    }
  }

  dispose() { document.removeEventListener('keydown', this._onKey); this.root.remove(); }

  _injectStyles() {
    if (document.getElementById('trade-styles')) return;
    const style = document.createElement('style');
    style.id = 'trade-styles';
    style.textContent = `
      #trade { position: absolute; inset: 0; z-index: 92; display: none; align-items: center;
        justify-content: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(2px);
        font-family: 'Segoe UI', system-ui, sans-serif; }
      #trade.open { display: flex; }
      .trade-panel { width: min(480px, 92vw); max-height: 82vh; overflow: hidden;
        background: rgba(24,28,22,0.97); border: 1px solid rgba(120,200,120,0.25);
        border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); display: flex; flex-direction: column; }
      .trade-head { display: flex; justify-content: space-between; align-items: center;
        padding: 16px 18px; font-weight: 800; letter-spacing: 1px; color: #b8e8b8;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .trade-close { background: none; border: none; color: #a0b0a0; font-size: 18px; cursor: pointer; }
      .trade-list { overflow-y: auto; padding: 8px 12px 14px; }
      .trade-row { display: grid; grid-template-columns: 1fr auto;
        grid-template-areas: 'flow btn' 'name btn'; gap: 2px 12px; align-items: center;
        padding: 10px 12px; border-radius: 9px; margin-bottom: 6px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
      .trade-row.disabled { opacity: 0.5; }
      .trade-flow { grid-area: flow; display: flex; align-items: center; gap: 5px; }
      .trade-x { font-size: 11px; color: #cfe0cf; }
      .trade-arrow { color: #7ac87a; }
      .trade-name { grid-area: name; font-size: 12px; color: #cfe0cf; }
      .trade-btn { grid-area: btn; padding: 9px 14px; border-radius: 8px; border: none;
        background: #4caf50; color: #08210a; font-weight: 700; cursor: pointer; font-size: 12px; min-width: 84px; }
      .trade-btn:disabled { background: #38463a; color: #8aa08a; cursor: not-allowed; font-size: 10px; }
    `;
    document.head.appendChild(style);
  }
}

export default TradeMenu;
