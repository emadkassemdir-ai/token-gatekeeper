/**
 * TradeMenu
 * ---------
 * Villager trading. Right-click a Villager to open it. Trades exchange Emeralds
 * for goods (and goods for Emeralds), giving Emeralds — and the villager — a
 * real purpose. A button is enabled only when you can afford the trade.
 */

import { ITEMS } from '../world/ItemTypes.js';
import { itemIconHTML } from '../world/ItemTextures.js';

/** give[] -> get. */
export const TRADES = [
  { give: [{ type: 'emerald', count: 1 }], get: { type: 'oak_planks', count: 16 } },
  { give: [{ type: 'emerald', count: 1 }], get: { type: 'bread', count: 6 } },
  { give: [{ type: 'emerald', count: 3 }], get: { type: 'ender_pearl', count: 1 } },
  { give: [{ type: 'emerald', count: 5 }], get: { type: 'iron_pickaxe', count: 1 } },
  { give: [{ type: 'emerald', count: 7 }], get: { type: 'iron_chestplate', count: 1 } },
  { give: [{ type: 'emerald', count: 6 }], get: { type: 'golden_carrot', count: 4 } },
  { give: [{ type: 'emerald', count: 1 }], get: { type: 'carrot', count: 8 } },
  { give: [{ type: 'emerald', count: 1 }], get: { type: 'potato', count: 8 } },
  { give: [{ type: 'emerald', count: 1 }], get: { type: 'wheat_seeds', count: 6 } },
  { give: [{ type: 'wheat', count: 20 }], get: { type: 'emerald', count: 1 } },
  { give: [{ type: 'coal', count: 16 }], get: { type: 'emerald', count: 1 } },
  { give: [{ type: 'raw_beef', count: 10 }], get: { type: 'emerald', count: 1 } },
  { give: [{ type: 'diamond', count: 1 }], get: { type: 'emerald', count: 1 } }
];

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
        <div class="trade-head"><span>💚 VILLAGER TRADES</span><button class="trade-close" id="trade-close">✕</button></div>
        <div class="trade-list" id="trade-list"></div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;
    this.listEl = root.querySelector('#trade-list');
    root.querySelector('#trade-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => { if (e.code === 'Escape' && this.open) this.close(); };
    document.addEventListener('keydown', this._onKey);
  }

  openMenu() { this.open = true; this.root.classList.add('open'); this.hooks.onOpen?.(); this.render(); }
  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  _afford(trade) {
    if (this.inventory.isCreative) return true;
    return trade.give.every((g) => this.inventory.count(g.type) >= g.count);
  }

  render() {
    this.listEl.innerHTML = '';
    for (const trade of TRADES) {
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
