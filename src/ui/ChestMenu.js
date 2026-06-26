/**
 * ChestMenu
 * ---------
 * Storage UI for a placed Chest. Each chest keeps its own 27 slots (persisted by
 * world position). Click an item in the chest to take it into your inventory, or
 * click one of your items to deposit it — a simple, reliable transfer model.
 */

import { ITEMS } from '../world/ItemTypes.js';
import { getItemIcon } from '../world/ItemTextures.js';
import { HOTBAR_SIZE, TOTAL_SLOTS } from '../state/Inventory.js';

export const CHEST_SLOTS = 27;

/** Add a stack into a chest slot array (merging/​stacking). @returns {number} leftover */
export function chestAdd(slots, type, count) {
  const max = ITEMS[type]?.maxStack ?? 64;
  for (const s of slots) if (s && s.type === type && s.count < max) {
    const take = Math.min(max - s.count, count); s.count += take; count -= take;
    if (count <= 0) return 0;
  }
  for (let i = 0; i < slots.length; i++) if (!slots[i]) {
    const take = Math.min(max, count); slots[i] = { type, count: take }; count -= take;
    if (count <= 0) return 0;
  }
  return count;
}

export class ChestMenu {
  /**
   * @param {HTMLElement} mount
   * @param {import('../state/Inventory.js').Inventory} inventory
   * @param {Object} [hooks]
   */
  constructor(mount, inventory, hooks = {}) {
    this.mount = mount;
    this.inventory = inventory;
    this.hooks = hooks;
    this.open = false;
    this.slots = null; // current chest's slot array
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'chest';
    root.innerHTML = `
      <div class="chest-panel">
        <div class="chest-head"><span>🧰 CHEST</span><button class="chest-close" id="chest-close">✕</button></div>
        <div class="chest-section">Chest</div><div class="chest-grid" id="chest-grid"></div>
        <div class="chest-section">Your items (click to store)</div><div class="chest-grid" id="chest-inv"></div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;
    this.gridEl = root.querySelector('#chest-grid');
    this.invEl = root.querySelector('#chest-inv');
    root.querySelector('#chest-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => { if (e.code === 'Escape' && this.open) this.close(); };
    document.addEventListener('keydown', this._onKey);
  }

  /** @param {Array} slots the chest's slot array (mutated in place) */
  openWith(slots) {
    this.slots = slots;
    this.open = true;
    this.root.classList.add('open');
    this.hooks.onOpen?.();
    this.render();
  }

  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  _cell(entry, onClick) {
    const cell = document.createElement('div');
    cell.className = 'chest-cell';
    if (entry && entry.type) {
      const art = getItemIcon(entry.type);
      const icon = document.createElement('div');
      icon.className = 'chest-icon';
      if (art) { icon.style.backgroundImage = `url(${art})`; icon.style.backgroundSize = '100% 100%'; icon.style.imageRendering = 'pixelated'; }
      cell.appendChild(icon);
      if (entry.count > 1) { const c = document.createElement('span'); c.className = 'chest-count'; c.textContent = entry.count; cell.appendChild(c); }
      cell.title = ITEMS[entry.type]?.name ?? entry.type;
      cell.addEventListener('click', onClick);
    }
    return cell;
  }

  render() {
    if (!this.slots) return;
    // Chest contents -> click to take into inventory.
    this.gridEl.innerHTML = '';
    for (let i = 0; i < this.slots.length; i++) {
      const entry = this.slots[i];
      this.gridEl.appendChild(this._cell(entry, () => {
        if (!entry) return;
        const leftover = this.inventory.add(entry.type, entry.count);
        if (leftover <= 0 || this.inventory.isCreative) this.slots[i] = null;
        else entry.count = leftover;
        this.render();
      }));
    }
    // Your items -> click to deposit into the chest.
    this.invEl.innerHTML = '';
    const view = this.inventory.getAllSlotsView();
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const entry = view[i];
      this.invEl.appendChild(this._cell(entry.type ? entry : null, () => {
        if (!entry.type) return;
        const stack = this.inventory.takeSlot(i);
        if (!stack) return;
        const leftover = chestAdd(this.slots, stack.type, stack.count);
        if (leftover > 0) this.inventory.add(stack.type, leftover); // chest full → give back
        this.render();
      }));
    }
  }

  dispose() { document.removeEventListener('keydown', this._onKey); this.root.remove(); }

  _injectStyles() {
    if (document.getElementById('chest-styles')) return;
    const style = document.createElement('style');
    style.id = 'chest-styles';
    style.textContent = `
      #chest { position: absolute; inset: 0; z-index: 93; display: none; align-items: center;
        justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
        font-family: 'Segoe UI', system-ui, sans-serif; }
      #chest.open { display: flex; }
      .chest-panel { width: min(560px, 94vw); max-height: 86vh; overflow-y: auto;
        background: rgba(30,24,16,0.97); border: 2px solid rgba(180,140,80,0.3);
        border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); padding: 0 0 14px; }
      .chest-head { display: flex; justify-content: space-between; align-items: center;
        padding: 14px 18px; font-weight: 800; letter-spacing: 2px; color: #f0d9a0;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .chest-close { background: none; border: none; color: #c0a880; font-size: 18px; cursor: pointer; }
      .chest-section { font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
        color: #b09870; margin: 12px 16px 6px; }
      .chest-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 5px; padding: 0 16px; }
      .chest-cell { position: relative; aspect-ratio: 1; border-radius: 6px;
        background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.09);
        display: flex; align-items: center; justify-content: center; cursor: pointer; }
      .chest-icon { width: 64%; height: 64%; border-radius: 4px; }
      .chest-count { position: absolute; bottom: 1px; right: 3px; font-size: 11px; font-weight: 800;
        color: #fff; text-shadow: 0 1px 2px #000; }
    `;
    document.head.appendChild(style);
  }
}

export default ChestMenu;
