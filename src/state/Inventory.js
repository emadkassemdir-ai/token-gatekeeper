/**
 * Inventory
 * ---------
 * A 27-slot inventory: 9 hotbar slots (indices 0-8) plus 18 storage slots
 * (indices 9-26) shown in the full inventory screen. The hotbar is the first
 * row and the only part the HUD shows; the storage rows hold overflow.
 *
 * Behaviour depends on the game mode:
 *   - survival: real stacks (max 64). Mining adds drops, placing/crafting
 *     consumes. You start empty.
 *   - creative: an infinite supply. The hotbar is a freely editable palette
 *     (pull items from the catalog); placing never consumes and mining never
 *     adds.
 *
 * @see ItemTypes for item definitions and the creative palette/catalog.
 */

import { ITEMS, getItem } from '../world/ItemTypes.js';

export const HOTBAR_SIZE = 9;
export const STORAGE_SIZE = 18;
export const TOTAL_SLOTS = HOTBAR_SIZE + STORAGE_SIZE;

export class Inventory {
  /** @param {'survival'|'creative'} mode */
  constructor(mode = 'survival') {
    /** @type {Array<{type:string,count:number}|null>} */
    this.slots = new Array(TOTAL_SLOTS).fill(null);
    this.selected = 0;
    this.mode = mode;
    // Editable creative hotbar palette (types). Starts EMPTY — you pick items
    // from the creative item catalog ("collect item" bar) in the inventory.
    this.creativeHotbar = new Array(HOTBAR_SIZE).fill(null);
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
    this.selected = ((i % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  cycleSlot(delta) {
    this.selectSlot(this.selected + Math.sign(delta));
  }

  /**
   * The item type in the active hotbar slot.
   * @returns {string|null}
   */
  getSelectedType() {
    if (this.isCreative) return this.creativeHotbar[this.selected] ?? null;
    return this.slots[this.selected]?.type ?? null;
  }

  /** @returns {string|null} tool class of the held item, or null. */
  getSelectedTool() {
    const t = this.getSelectedType();
    return t ? getItem(t)?.tool ?? null : null;
  }

  /**
   * View model for the HUD hotbar: 9 entries of { type, count, infinite }.
   * @returns {Array<{type:string|null,count:number,infinite:boolean}>}
   */
  getHotbarView() {
    const out = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.isCreative) {
        const type = this.creativeHotbar[i] ?? null;
        out.push({ type, count: type ? Infinity : 0, infinite: true });
      } else {
        const s = this.slots[i];
        out.push({ type: s?.type ?? null, count: s?.count ?? 0, infinite: false });
      }
    }
    return out;
  }

  /**
   * Full slot view (hotbar + storage) for the inventory screen.
   * @returns {Array<{type:string|null,count:number,infinite:boolean}>}
   */
  getAllSlotsView() {
    const out = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (this.isCreative && i < HOTBAR_SIZE) {
        const type = this.creativeHotbar[i] ?? null;
        out.push({ type, count: type ? Infinity : 0, infinite: true });
      } else {
        const s = this.slots[i];
        out.push({ type: s?.type ?? null, count: s?.count ?? 0, infinite: this.isCreative });
      }
    }
    return out;
  }

  /* ------------------------------ mutation ------------------------------- */

  /**
   * Add items (survival only). Tops up matching stacks, then fills empties
   * across the whole inventory (hotbar first).
   * @param {string} type @param {number} [n=1]
   * @returns {number} how many were stored
   */
  add(type, n = 1) {
    if (this.isCreative) return n;
    const def = getItem(type);
    if (!def) return 0;
    const max = def.maxStack;
    let remaining = n;

    for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === type && s.count < max) {
        const take = Math.min(max - s.count, remaining);
        s.count += take;
        remaining -= take;
      }
    }
    for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, remaining);
        this.slots[i] = { type, count: take };
        remaining -= take;
      }
    }
    return n - remaining;
  }

  /**
   * Remove `n` of a type from anywhere (survival only).
   * @param {string} type @param {number} [n=1]
   * @returns {boolean} true if the full amount was removed
   */
  remove(type, n = 1) {
    if (this.isCreative) return true;
    if (this.count(type) < n) return false;
    let remaining = n;
    for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
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
   * Consume one of the selected hotbar item (placing a block).
   * @returns {boolean}
   */
  consumeSelected() {
    if (this.isCreative) return true;
    const s = this.slots[this.selected];
    if (!s) return false;
    s.count -= 1;
    if (s.count <= 0) this.slots[this.selected] = null;
    return true;
  }

  /** @param {string} type @returns {number} total across all slots. */
  count(type) {
    if (this.isCreative) return Infinity;
    let total = 0;
    for (const s of this.slots) if (s && s.type === type) total += s.count;
    return total;
  }

  /**
   * Move/merge/swap a stack between two slots (inventory-screen drag). In
   * creative, dropping onto a hotbar slot sets that palette entry.
   * @param {number} from @param {number} to
   */
  moveSlot(from, to) {
    if (from === to) return;
    if (this.isCreative) {
      // Creative: only the hotbar palette is editable; copy the source type in.
      if (to < HOTBAR_SIZE) {
        const srcType = from < HOTBAR_SIZE ? this.creativeHotbar[from] : this.slots[from]?.type;
        if (srcType) this.creativeHotbar[to] = srcType;
      }
      return;
    }
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (b && b.type === a.type) {
      // Merge.
      const max = getItem(a.type)?.maxStack ?? 64;
      const room = max - b.count;
      const take = Math.min(room, a.count);
      b.count += take;
      a.count -= take;
      if (a.count <= 0) this.slots[from] = null;
    } else {
      // Swap.
      this.slots[from] = b;
      this.slots[to] = a;
    }
  }

  /**
   * Creative helper: drop a catalog item into the currently selected hotbar
   * slot (infinite supply).
   * @param {string} type
   */
  setCreativeSelected(type) {
    if (this.isCreative) this.creativeHotbar[this.selected] = type;
  }

  /** Empty all storage + hotbar (survival). */
  clear() {
    this.slots = new Array(TOTAL_SLOTS).fill(null);
  }

  /* ---------------------------- serialization ---------------------------- */

  toJSON() {
    return { slots: this.slots, selected: this.selected, creativeHotbar: this.creativeHotbar };
  }

  /** @param {{slots?:Array, selected?:number, creativeHotbar?:Array}} data */
  load(data) {
    if (!data) return;
    if (Array.isArray(data.slots)) {
      this.slots = new Array(TOTAL_SLOTS).fill(null);
      for (let i = 0; i < TOTAL_SLOTS; i++) {
        const s = data.slots[i];
        if (s && ITEMS[s.type] && s.count > 0) {
          this.slots[i] = { type: s.type, count: s.count };
        }
      }
    }
    if (Array.isArray(data.creativeHotbar) && data.creativeHotbar.length) {
      this.creativeHotbar = data.creativeHotbar.slice(0, HOTBAR_SIZE);
      while (this.creativeHotbar.length < HOTBAR_SIZE) this.creativeHotbar.push(null);
    }
    if (Number.isInteger(data.selected)) this.selectSlot(data.selected);
  }
}

export default Inventory;
