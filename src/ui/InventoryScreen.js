/**
 * InventoryScreen
 * ---------------
 * The full inventory UI (toggle with 'I' or the touch Bag button), available in
 * both game modes. Shows:
 *   - the player's avatar display (left panel)
 *   - the hotbar row + storage rows, with click-to-pick-up / click-to-place
 *     moving and merging stacks (survival)
 *   - in creative, an infinite item catalog to drop items into the hotbar
 *
 * @see Inventory for the slot model and moveSlot/setCreativeSelected logic.
 */

import { BLOCKS } from '../world/BlockTypes.js';
import { ITEMS, placeBlockId } from '../world/ItemTypes.js';
import { getItemIcon } from '../world/ItemTextures.js';
import { Avatar } from '../state/Avatar.js';
import { HOTBAR_SIZE, TOTAL_SLOTS } from '../state/Inventory.js';

function rgbCss(t) {
  return `rgb(${Math.round(t[0] * 255)}, ${Math.round(t[1] * 255)}, ${Math.round(t[2] * 255)})`;
}

/** Items shown in the creative catalog (placeables + tools + materials). */
const CATALOG = Object.keys(ITEMS);

export class InventoryScreen {
  /**
   * @param {HTMLElement} mount
   * @param {import('../state/Inventory.js').Inventory} inventory
   * @param {Avatar} avatar
   * @param {Object} [hooks]
   * @param {() => void} [hooks.onOpen]
   * @param {() => void} [hooks.onClose]
   */
  constructor(mount, inventory, avatar, stats, hooks = {}) {
    this.mount = mount;
    this.inventory = inventory;
    this.avatar = avatar;
    this.stats = stats;
    this.hooks = hooks;
    this.open = false;
    this._held = -1; // picked-up slot index (survival), -1 = none
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'inv';
    root.innerHTML = `
      <div class="inv-panel">
        <div class="inv-head">
          <span>INVENTORY</span>
          <button class="inv-close" id="inv-close">✕</button>
        </div>
        <div class="inv-body">
          <div class="inv-left">
            <div class="inv-avatar" id="inv-avatar"></div>
            <div class="inv-avatar-label" id="inv-avatar-label">You</div>
            <div class="inv-armor-label">Armor</div>
            <div class="inv-armor" id="inv-armor"></div>
          </div>
          <div class="inv-right" id="inv-right"></div>
        </div>
      </div>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.rightEl = root.querySelector('#inv-right');
    this.avatarEl = root.querySelector('#inv-avatar');
    this.armorEl = root.querySelector('#inv-armor');
    root.querySelector('#inv-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  _bindKeys() {
    this._onKey = (e) => {
      if ((e.code === 'KeyI') && !this._isTyping()) { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.open) this.close();
    };
    document.addEventListener('keydown', this._onKey);
  }

  _isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  toggle() { this.open ? this.close() : this.openScreen(); }

  openScreen() {
    this.open = true;
    this._held = -1;
    this.root.classList.add('open');
    this.hooks.onOpen?.();
    this.render();
  }

  close() {
    this.open = false;
    this._held = -1;
    this.root.classList.remove('open');
    this.hooks.onClose?.();
  }

  /* ------------------------------- render -------------------------------- */

  render() {
    // Avatar display (with equipped armor shown on the character).
    this.avatarEl.innerHTML = '';
    this.avatarEl.appendChild(Avatar.buildPreview(this.avatar, 1.5, this.stats?.armor));

    this._renderArmor();

    this.rightEl.innerHTML = '';
    const creative = this.inventory.isCreative;

    if (creative) {
      this._renderCreative();
    } else {
      this._renderSurvival();
    }
  }

  /** Render the four armor slots (click an equipped piece to take it off). */
  _renderArmor() {
    if (!this.armorEl) return;
    this.armorEl.innerHTML = '';
    const slots = [['head', '⛑'], ['chest', '🦺'], ['legs', '👖'], ['feet', '🥾']];
    for (const [slot, emptyGlyph] of slots) {
      const type = this.stats?.armor?.[slot] ?? null;
      const cell = this._makeItemCell(type, '');
      cell.classList.add('inv-armor-slot');
      if (!type) {
        cell.querySelector('.inv-icon').classList.add('glyph');
        cell.querySelector('.inv-icon').textContent = emptyGlyph;
        cell.querySelector('.inv-icon').style.opacity = '0.35';
      } else {
        cell.title = (ITEMS[type]?.name ?? type) + ' — click to unequip';
        cell.addEventListener('click', () => {
          const removed = this.stats.unequip(slot);
          if (removed) this.inventory.add(removed, 1);
          this.render();
        });
      }
      this.armorEl.appendChild(cell);
    }
  }

  _renderSurvival() {
    const view = this.inventory.getAllSlotsView();

    // Storage rows (slots 9..TOTAL-1).
    const storage = document.createElement('div');
    storage.className = 'inv-grid';
    for (let i = HOTBAR_SIZE; i < TOTAL_SLOTS; i++) {
      storage.appendChild(this._makeSlot(i, view[i]));
    }
    const storeLabel = document.createElement('div');
    storeLabel.className = 'inv-section-label';
    storeLabel.textContent = 'Storage';
    this.rightEl.appendChild(storeLabel);
    this.rightEl.appendChild(storage);

    // Hotbar row (slots 0..8).
    const hot = document.createElement('div');
    hot.className = 'inv-grid inv-hot';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      hot.appendChild(this._makeSlot(i, view[i]));
    }
    const hotLabel = document.createElement('div');
    hotLabel.className = 'inv-section-label';
    hotLabel.textContent = 'Hotbar';
    this.rightEl.appendChild(hotLabel);
    this.rightEl.appendChild(hot);

    const hint = document.createElement('div');
    hint.className = 'inv-hint';
    hint.textContent = this._held >= 0
      ? 'Click a slot to drop the held stack.'
      : 'Click a stack to pick it up, then click another slot to move it.';
    this.rightEl.appendChild(hint);
  }

  _renderCreative() {
    // Editable hotbar palette.
    const hotLabel = document.createElement('div');
    hotLabel.className = 'inv-section-label';
    hotLabel.textContent = 'Hotbar (click a slot, then pick an item below)';
    this.rightEl.appendChild(hotLabel);

    const view = this.inventory.getAllSlotsView();
    const hot = document.createElement('div');
    hot.className = 'inv-grid inv-hot';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this._makeSlot(i, view[i], true);
      if (i === this.inventory.selected) slot.classList.add('selected');
      hot.appendChild(slot);
    }
    this.rightEl.appendChild(hot);

    // Infinite catalog.
    const catLabel = document.createElement('div');
    catLabel.className = 'inv-section-label';
    catLabel.textContent = 'Creative Items (infinite)';
    this.rightEl.appendChild(catLabel);

    const cat = document.createElement('div');
    cat.className = 'inv-grid inv-catalog';
    for (const type of CATALOG) {
      const cell = this._makeItemCell(type, '∞');
      cell.addEventListener('click', () => {
        this.inventory.setCreativeSelected(type);
        this.render();
      });
      cat.appendChild(cell);
    }
    this.rightEl.appendChild(cat);
  }

  /** A clickable inventory slot bound to slot index `i`. */
  _makeSlot(i, entry, creativeHot = false) {
    const slot = this._makeItemCell(entry.type, entry.infinite ? '∞' : (entry.count > 1 ? String(entry.count) : ''));
    slot.classList.add('inv-slot');
    if (this._held === i) slot.classList.add('held');

    slot.addEventListener('click', () => {
      if (creativeHot) {
        // Selecting which hotbar slot the next catalog pick fills.
        this.inventory.selectSlot(i);
        this.render();
        return;
      }
      // Survival click-to-move.
      if (this._held < 0) {
        if (entry.type) this._held = i;
      } else {
        this.inventory.moveSlot(this._held, i);
        this._held = -1;
      }
      this.render();
    });
    return slot;
  }

  /** A non-interactive item cell (icon + count). */
  _makeItemCell(type, countText) {
    const cell = document.createElement('div');
    cell.className = 'inv-cell';

    const icon = document.createElement('div');
    icon.className = 'inv-icon';
    const def = type ? ITEMS[type] : null;
    if (def) {
      const art = getItemIcon(type);
      if (art) {
        icon.style.backgroundImage = `url(${art})`;
        icon.style.backgroundSize = '100% 100%';
        icon.style.imageRendering = 'pixelated';
      } else {
        const blockId = placeBlockId(type);
        if (blockId && BLOCKS[blockId]) {
          const b = BLOCKS[blockId];
          icon.style.background = rgbCss(b.faceColors?.top ?? b.color);
          if (b.transparent) icon.style.opacity = '0.75';
        } else {
          icon.classList.add('glyph');
          icon.textContent = def.glyph ?? '▣';
        }
      }
      cell.title = def.name;
    }
    cell.appendChild(icon);

    const count = document.createElement('span');
    count.className = 'inv-count';
    count.textContent = countText || '';
    cell.appendChild(count);

    return cell;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKey);
    this.root.remove();
  }

  _injectStyles() {
    if (document.getElementById('inv-styles')) return;
    const style = document.createElement('style');
    style.id = 'inv-styles';
    style.textContent = `
      #inv {
        position: absolute; inset: 0; z-index: 95; display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      #inv.open { display: flex; }
      .inv-panel {
        width: min(620px, 94vw); max-height: 86vh; overflow: hidden;
        background-color: #234a4d; background-image: var(--mc-diamond);
        background-size: 56px; image-rendering: pixelated;
        border: 4px solid #0e2e31; box-shadow: 0 0 0 4px #5fc6cd, 0 18px 50px rgba(0,0,0,0.6);
        border-radius: 0; display: flex; flex-direction: column;
      }
      .inv-head { display: flex; justify-content: space-between; align-items: center;
        padding: 14px 18px; font-weight: 800; letter-spacing: 2px; color: #fff;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .inv-close { background: none; border: none; color: #9fb0c3; font-size: 18px; cursor: pointer; }
      .inv-body { display: flex; gap: 18px; padding: 18px; overflow-y: auto; }
      .inv-left { width: 130px; flex-shrink: 0; display: flex; flex-direction: column;
        align-items: center; gap: 8px; }
      .inv-avatar { background: rgba(0,0,0,0.25); border-radius: 12px; padding: 14px;
        display: flex; align-items: center; justify-content: center; }
      .inv-avatar-label { font-size: 12px; color: #9fb0c3; }
      .inv-armor-label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
        color: #8fa3b8; margin-top: 6px; }
      .inv-armor { display: grid; grid-template-columns: repeat(2, 40px); gap: 6px; }
      .inv-armor-slot { width: 40px; height: 40px; }
      .inv-right { flex: 1; min-width: 0; }
      .inv-section-label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
        color: #8fa3b8; margin: 4px 2px 8px; }
      .inv-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 6px; margin-bottom: 14px; }
      .inv-hot { background: rgba(108,194,74,0.06); padding: 6px; border-radius: 10px;
        border: 1px solid rgba(108,194,74,0.18); }
      .inv-catalog { grid-template-columns: repeat(9, 1fr); max-height: 200px; overflow-y: auto; }
      .inv-cell, .inv-slot {
        position: relative; aspect-ratio: 1; border-radius: 8px;
        background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.10);
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .inv-slot.held { border-color: var(--accent, #6cc24a); box-shadow: 0 0 0 2px rgba(108,194,74,0.4); }
      .inv-slot.selected { border-color: #fff; }
      .inv-icon { width: 62%; height: 62%; border-radius: 5px;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
        display: flex; align-items: center; justify-content: center; }
      .inv-icon.glyph { background: rgba(255,255,255,0.08); font-size: 18px; }
      .inv-count { position: absolute; bottom: 1px; right: 4px; font-size: 11px;
        font-weight: 800; color: #fff; text-shadow: 0 1px 2px #000; }
      .inv-hint { font-size: 12px; color: #8fa3b8; margin-top: 4px; }
    `;
    document.head.appendChild(style);
  }
}

export default InventoryScreen;
