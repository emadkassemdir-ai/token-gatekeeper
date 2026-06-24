/**
 * Inventory
 * ---------
 * A 9-slot inventory that doubles as the hotbar. Behaviour depends on the game
 * mode:
 *
 *   - survival: real stacks (max 64). Mining adds drops, placing/crafting
 *     consumes. You start empty.
 *   - creative: the 9 slots mirror a fixed palette of placeable blocks with an
 *     infinite supply — placing never consumes and mining never adds.
 *
 * @see ItemTypes for item definitions and the creative palette.
 */

import { ITEMS, CREATIVE_PALETTE, getItem } from '../world/ItemTypes.js';

const SLOTS = 9;

export class Inventory {
  /** @param {'survival'|'creative'} mode */
  constructor(mode = 'survival') {
    /** @type {Array<{type:string,count:number}|null>} */
    this.slots = new Array(SLOTS).fill(null);
    this.selected = 0;
    this.mode = mode;
  }

  /** @param {'survival'|'creative'} mode */
  setMode(mode) {
    this.mode = mode;
  }

  /** @returns {boolean} */
  get isCreative() {
    return this.mode === 'creative';
  }

  /* ------------------------------ selection ------------------------------ */

  selectSlot(i) {
    this.selected = ((i % SLOTS) + SLOTS) % SLOTS;
  }

  cycleSlot(delta) {
    this.selectSlot(this.selected + Math.sign(delta));
  }

  /**
   * The item type in the active slot. In creative this reads from the palette.
   * @returns {string|null}
   */
  getSelectedType() {
    if (this.isCreative) {
      return CREATIVE_PALETTE[this.selected] ?? null;
    }
    return this.slots[this.selected]?.type ?? null;
  }

  /** @returns {string|null} tool class of the held item, or null. */
  getSelectedTool() {
    const t = this.getSelectedType();
    return t ? getItem(t)?.tool ?? null : null;
  }

  /**
   * View model for the HUD: 9 entries of { type, count, infinite }.
   * @returns {Array<{type:string|null,count:number,infinite:boolean}>}
   */
  getHotbarView() {
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
      if (this.isCreative) {
        const type = CREATIVE_PALETTE[i] ?? null;
        out.push({ type, count: type ? Infinity : 0, infinite: true });
      } else {
        const s = this.slots[i];
        out.push({ type: s?.type ?? null, count: s?.count ?? 0, infinite: false });
      }
    }
    return out;
  }

  /* ------------------------------ mutation ------------------------------- */

  /**
   * Add items to the inventory (survival only). Stacks into existing slots
   * first, then fills empty ones.
   * @param {string} type @param {number} [n=1]
   * @returns {number} how many were actually stored
   */
  add(type, n = 1) {
    if (this.isCreative) return n; // creative: infinite, nothing to store
    const def = getItem(type);
    if (!def) return 0;
    const max = def.maxStack;
    let remaining = n;

    // Top up matching stacks.
    for (let i = 0; i < SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === type && s.count < max) {
        const room = max - s.count;
        const take = Math.min(room, remaining);
        s.count += take;
        remaining -= take;
      }
    }
    // Fill empty slots.
    for (let i = 0; i < SLOTS && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, remaining);
        this.slots[i] = { type, count: take };
        remaining -= take;
      }
    }
    return n - remaining;
  }

  /**
   * Remove `n` of a type from anywhere in the inventory (survival only).
   * @param {string} type @param {number} [n=1]
   * @returns {boolean} true if the full amount was removed
   */
  remove(type, n = 1) {
    if (this.isCreative) return true;
    if (this.count(type) < n) return false;
    let remaining = n;
    for (let i = 0; i < SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === type) {
        const take = Math.min(s.count, remaining);
        s.count -= take;
        remaining -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  /**
   * Consume one of the currently selected item (used when placing a block).
   * @returns {boolean} whether something was consumed (always true in creative)
   */
  consumeSelected() {
    if (this.isCreative) return true;
    const s = this.slots[this.selected];
    if (!s) return false;
    s.count -= 1;
    if (s.count <= 0) this.slots[this.selected] = null;
    return true;
  }

  /** @param {string} type @returns {number} total count across all slots. */
  count(type) {
    if (this.isCreative) return Infinity;
    let total = 0;
    for (const s of this.slots) if (s && s.type === type) total += s.count;
    return total;
  }

  /** Clear all slots (survival). */
  clear() {
    this.slots = new Array(SLOTS).fill(null);
  }

  /* ---------------------------- serialization ---------------------------- */

  toJSON() {
    return { slots: this.slots, selected: this.selected };
  }

  /** @param {{slots?:Array, selected?:number}} data */
  load(data) {
    if (!data) return;
    if (Array.isArray(data.slots)) {
      this.slots = new Array(SLOTS).fill(null);
      for (let i = 0; i < SLOTS; i++) {
        const s = data.slots[i];
        if (s && ITEMS[s.type] && s.count > 0) {
          this.slots[i] = { type: s.type, count: s.count };
        }
      }
    }
    if (Number.isInteger(data.selected)) this.selectSlot(data.selected);
  }
}

export default Inventory;
