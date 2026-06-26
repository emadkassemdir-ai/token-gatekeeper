/**
 * EnchantingMenu
 * --------------
 * Enchanting Table UI (toggle with 'N' or the touch button). Spend XP levels +
 * Lapis Lazuli to enchant the tool/weapon/armor you're holding, raising its
 * power. Nearby Bookshelves increase the maximum level you can reach — exactly
 * the bookshelf's real purpose. Enchantments boost mining speed (tools),
 * attack damage (swords/bow) and protection (armor).
 */

import { ITEMS, isTool, isBow } from '../world/ItemTypes.js';
import { itemIconHTML } from '../world/ItemTextures.js';

const LAPIS_COST = 3;
const MAX_LEVEL = 5;

/** Whether an item type can be enchanted. */
export function isEnchantable(type) {
  const d = ITEMS[type];
  return !!d && (d.tool || d.slot || d.bow);
}

export class EnchantingMenu {
  /**
   * @param {HTMLElement} mount
   * @param {import('../state/Inventory.js').Inventory} inventory
   * @param {import('../state/PlayerStats.js').PlayerStats} stats
   * @param {() => boolean} nearTableFn
   * @param {() => number} powerFn bookshelf power (0..15)
   * @param {Object} [hooks]
   */
  constructor(mount, inventory, stats, nearTableFn, powerFn, hooks = {}) {
    this.mount = mount;
    this.inventory = inventory;
    this.stats = stats;
    this.nearTable = nearTableFn;
    this.power = powerFn;
    this.hooks = hooks;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'ench';
    root.innerHTML = `
      <div class="ench-panel">
        <div class="ench-head"><span>✨ ENCHANTING</span><button class="ench-close" id="ench-close">✕</button></div>
        <div class="ench-body" id="ench-body"></div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;
    this.bodyEl = root.querySelector('#ench-body');
    root.querySelector('#ench-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.code === 'KeyN' && !this._isTyping()) { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.open) this.close();
    };
    document.addEventListener('keydown', this._onKey);
  }

  _isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  toggle() { this.open ? this.close() : this.openMenu(); }
  openMenu() { this.open = true; this.root.classList.add('open'); this.hooks.onOpen?.(); this.render(); }
  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  /** Max enchant level reachable given nearby bookshelves (1 + power/3, ≤5). */
  maxLevel() { return Math.min(MAX_LEVEL, 1 + Math.floor(this.power() / 3)); }

  render() {
    const near = this.nearTable();
    const held = this.inventory.getSelectedType();
    const power = this.power();
    const maxLv = this.maxLevel();
    this.bodyEl.innerHTML = '';

    if (!near) {
      this.bodyEl.innerHTML = `<div class="ench-hint">Place &amp; stand near an Enchanting Table.</div>`;
      return;
    }
    if (!isEnchantable(held)) {
      this.bodyEl.innerHTML =
        `<div class="ench-hint">Hold a tool, weapon, bow or armor in your hotbar to enchant it.</div>
         <div class="ench-power">📚 Bookshelf power: ${power} &nbsp;·&nbsp; max level ${maxLv}</div>`;
      return;
    }

    const cur = this.stats.getEnchant(held);
    const next = cur + 1;
    const lapis = this.inventory.count('lapis');
    const canRaise = next <= maxLv;
    const affordL = this.stats.isCreative || this.stats.levels >= next;
    const affordLap = this.stats.isCreative || lapis >= LAPIS_COST;
    const kind = isTool(held) ? 'mining speed' : isBow(held) ? 'arrow damage' : ITEMS[held]?.slot ? 'protection' : 'attack damage';

    this.bodyEl.innerHTML = `
      <div class="ench-item">${itemIconHTML(held, 40)}<div>
        <div class="ench-name">${ITEMS[held]?.name ?? held}</div>
        <div class="ench-cur">Current: Lv ${cur} &nbsp;(+${kind})</div></div></div>
      <div class="ench-power">📚 Bookshelf power: ${power} &nbsp;·&nbsp; max level ${maxLv}</div>
      <div class="ench-cost">You: ⭐ ${this.stats.levels} levels &nbsp;·&nbsp; 🔷 ${lapis} lapis</div>`;

    const btn = document.createElement('button');
    btn.className = 'ench-btn';
    if (!canRaise) { btn.textContent = `Maxed for this setup (Lv ${cur})`; btn.disabled = true; }
    else if (!affordL) { btn.textContent = `Need ${next} levels`; btn.disabled = true; }
    else if (!affordLap) { btn.textContent = `Need ${LAPIS_COST} lapis`; btn.disabled = true; }
    else { btn.textContent = `Enchant to Lv ${next}  (−${next} lvl, −${LAPIS_COST} 🔷)`; }
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      if (!this.stats.isCreative) {
        if (!this.stats.spendLevels(next)) return;
        this.inventory.remove('lapis', LAPIS_COST);
      }
      this.stats.enchant(held, next);
      this.hooks.log?.(`Enchanted ${ITEMS[held]?.name ?? held} to Lv ${next}!`);
      this.render();
    });
    this.bodyEl.appendChild(btn);
  }

  dispose() { document.removeEventListener('keydown', this._onKey); this.root.remove(); }

  _injectStyles() {
    if (document.getElementById('ench-styles')) return;
    const style = document.createElement('style');
    style.id = 'ench-styles';
    style.textContent = `
      #ench { position: absolute; inset: 0; z-index: 92; display: none; align-items: center;
        justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
        font-family: 'Segoe UI', system-ui, sans-serif; }
      #ench.open { display: flex; }
      .ench-panel { width: min(440px, 92vw); background: rgba(20,16,28,0.97);
        border: 1px solid rgba(180,140,255,0.22); border-radius: 14px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.6); display: flex; flex-direction: column; }
      .ench-head { display: flex; justify-content: space-between; align-items: center;
        padding: 16px 18px; font-weight: 800; letter-spacing: 2px; color: #d9c2ff;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .ench-close { background: none; border: none; color: #a89cc0; font-size: 18px; cursor: pointer; }
      .ench-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
      .ench-hint { font-size: 13px; color: #b8a8d0; }
      .ench-item { display: flex; align-items: center; gap: 12px; }
      .ench-name { font-size: 14px; color: #fff; font-weight: 700; }
      .ench-cur { font-size: 12px; color: #b8a8d0; }
      .ench-power { font-size: 12px; color: #9d8ec0; }
      .ench-cost { font-size: 12px; color: #c8b8e0; }
      .ench-btn { padding: 11px 14px; border-radius: 9px; border: none; cursor: pointer;
        background: linear-gradient(#9b6cff, #7a4ad9); color: #fff; font-weight: 700; font-size: 13px; }
      .ench-btn:disabled { background: #3a3450; color: #8a80a0; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }
}

export default EnchantingMenu;
