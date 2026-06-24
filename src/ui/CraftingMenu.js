/**
 * CraftingMenu
 * ------------
 * A list-style crafting panel (toggled with 'E' or a touch button). Each recipe
 * shows its output, ingredients, and a Craft button that is enabled only when
 * the player has the materials and — for tool recipes — is standing near a
 * crafting table. Re-renders after every craft so counts stay live.
 */

import { RECIPES, canCraft, craft } from '../state/Crafting.js';
import { ITEMS } from '../world/ItemTypes.js';

export class CraftingMenu {
  /**
   * @param {HTMLElement} mount
   * @param {import('../state/Inventory.js').Inventory} inventory
   * @param {() => boolean} nearTableFn returns whether a table is in range
   * @param {Object} [hooks]
   * @param {() => void} [hooks.onOpen]
   * @param {() => void} [hooks.onClose]
   * @param {(msg:string) => void} [hooks.log]
   */
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
    root.id = 'craft';
    root.innerHTML = `
      <div class="craft-panel">
        <div class="craft-head">
          <span>CRAFTING</span>
          <button class="craft-close" id="craft-close">✕</button>
        </div>
        <div class="craft-hint" id="craft-hint"></div>
        <div class="craft-list" id="craft-list"></div>
      </div>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.listEl = root.querySelector('#craft-list');
    this.hintEl = root.querySelector('#craft-hint');
    root.querySelector('#craft-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.code === 'KeyE' && !this._isTyping()) {
        e.preventDefault();
        this.toggle();
      } else if (e.code === 'Escape' && this.open) {
        this.close();
      }
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
    const near = this.nearTable();
    this.hintEl.textContent = near
      ? 'Crafting table in range — all recipes available.'
      : 'Tip: place & stand near a Crafting Table to craft tools.';

    this.listEl.innerHTML = '';
    for (const recipe of RECIPES) {
      const check = canCraft(recipe, this.inventory, near);
      const out = ITEMS[recipe.output];

      const row = document.createElement('div');
      row.className = 'craft-row' + (check.ok ? '' : ' disabled');

      const ing = recipe.inputs
        .map((i) => `${i.count}× ${ITEMS[i.type]?.name ?? i.type}`)
        .join(' + ');

      row.innerHTML = `
        <div class="craft-out">
          <span class="craft-icon">${out.glyph ?? '▣'}</span>
          <span class="craft-name">${out.name}${recipe.outputCount > 1 ? ' ×' + recipe.outputCount : ''}</span>
        </div>
        <div class="craft-ing">${ing}</div>
      `;

      const btn = document.createElement('button');
      btn.className = 'craft-btn';
      btn.textContent = check.ok ? 'Craft' : (check.reason || 'Locked');
      btn.disabled = !check.ok;
      btn.addEventListener('click', () => this._craft(recipe));
      row.appendChild(btn);

      this.listEl.appendChild(row);
    }
  }

  _craft(recipe) {
    const res = craft(recipe, this.inventory, this.nearTable());
    if (res.ok) {
      this.hooks.log?.('Crafted ' + (ITEMS[recipe.output]?.name ?? recipe.output));
    } else if (res.reason) {
      this.hooks.log?.(res.reason);
    }
    this.render();
  }

  dispose() {
    document.removeEventListener('keydown', this._onKey);
    this.root.remove();
  }

  _injectStyles() {
    if (document.getElementById('craft-styles')) return;
    const style = document.createElement('style');
    style.id = 'craft-styles';
    style.textContent = `
      #craft {
        position: absolute; inset: 0; z-index: 90; display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(2px);
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      #craft.open { display: flex; }
      .craft-panel {
        width: min(460px, 92vw); max-height: 80vh; overflow: hidden;
        background: rgba(20,23,28,0.97); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.55);
        display: flex; flex-direction: column;
      }
      .craft-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 18px; font-weight: 800; letter-spacing: 2px; color: #fff;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .craft-close {
        background: none; border: none; color: #9fb0c3; font-size: 18px;
        cursor: pointer; padding: 4px 8px;
      }
      .craft-hint { padding: 10px 18px; font-size: 12px; color: #8fb0cc; }
      .craft-list { overflow-y: auto; padding: 6px 12px 14px; }
      .craft-row {
        display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'out btn' 'ing btn';
        gap: 2px 12px; align-items: center;
        padding: 11px 12px; border-radius: 9px; margin-bottom: 7px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
      }
      .craft-row.disabled { opacity: 0.5; }
      .craft-out { grid-area: out; display: flex; align-items: center; gap: 9px; }
      .craft-icon { font-size: 20px; }
      .craft-name { font-weight: 700; color: #f1f5fa; font-size: 14px; }
      .craft-ing { grid-area: ing; font-size: 12px; color: #9fb0c3; }
      .craft-btn {
        grid-area: btn; padding: 9px 14px; border-radius: 8px; border: none;
        background: var(--accent, #6cc24a); color: #08240a; font-weight: 700;
        cursor: pointer; font-size: 12px; min-width: 84px;
      }
      .craft-btn:disabled {
        background: #3a4452; color: #8a97a6; cursor: not-allowed; font-size: 10px;
      }
    `;
    document.head.appendChild(style);
  }
}

export default CraftingMenu;
