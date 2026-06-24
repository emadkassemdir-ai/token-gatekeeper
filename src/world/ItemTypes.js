/**
 * ItemTypes
 * ---------
 * Registry of everything that can live in the inventory: placeable blocks (as
 * items), raw materials (sticks), and tools (pickaxe / axe / sword). Also owns
 * the mining model — block categories, per-tool break times, and what a block
 * drops when mined.
 *
 * Items are keyed by stable string types so saves stay readable.
 */

import { BLOCKS } from './BlockTypes.js';

/** Block "material" category, used to look up break times. */
export const CATEGORY = {
  1: 'soft',   // grass
  2: 'soft',   // dirt
  7: 'soft',   // sand
  3: 'stone',  // stone
  10: 'stone', // iron ore
  5: 'wood',   // oak wood
  11: 'wood',  // oak planks
  12: 'wood',  // crafting table
  6: 'leaves', // oak leaves
  9: 'glass'   // glass
};

/**
 * Break time in seconds, indexed [category][tool]. Hand and Pickaxe values come
 * straight from the design spec; Axe specialises in wood, Sword has no mining
 * bonus (but shears leaves fast). Anything missing falls back to the 'hand'
 * column.
 */
export const BREAK_TIMES = {
  soft:   { hand: 2.0, pickaxe: 1.5, axe: 2.0, sword: 2.0 },
  stone:  { hand: 6.0, pickaxe: 2.0, axe: 6.0, sword: 6.0 },
  wood:   { hand: 4.0, pickaxe: 4.0, axe: 1.5, sword: 4.0 },
  leaves: { hand: 0.4, pickaxe: 0.4, axe: 0.4, sword: 0.2 },
  glass:  { hand: 0.4, pickaxe: 0.3, axe: 0.4, sword: 0.4 }
};

/** What each block drops when mined (item type), or null for nothing. */
export const BLOCK_DROPS = {
  1: 'grass',
  2: 'dirt',
  3: 'stone',
  5: 'oak_log',
  6: null,       // leaves drop nothing
  7: 'sand',
  9: null,       // glass shatters
  10: 'iron_ore',
  11: 'oak_planks',
  12: 'crafting_table'
};

/**
 * @typedef {Object} ItemDef
 * @property {string} type
 * @property {string} name
 * @property {number} maxStack
 * @property {number} [place]   Block id placed when this item is used (if any).
 * @property {string} [tool]    Tool class: 'pickaxe' | 'axe' | 'sword'.
 * @property {number} [damage]  Attack damage in hearts (tools/weapons).
 * @property {string} [glyph]   Emoji/text icon for non-block items.
 */

/** @type {Record<string, ItemDef>} */
export const ITEMS = {
  // Placeable blocks (as items).
  grass:          { type: 'grass', name: 'Grass', maxStack: 64, place: 1 },
  dirt:           { type: 'dirt', name: 'Dirt', maxStack: 64, place: 2 },
  stone:          { type: 'stone', name: 'Stone', maxStack: 64, place: 3 },
  oak_log:        { type: 'oak_log', name: 'Oak Log', maxStack: 64, place: 5 },
  oak_leaves:     { type: 'oak_leaves', name: 'Oak Leaves', maxStack: 64, place: 6 },
  sand:           { type: 'sand', name: 'Sand', maxStack: 64, place: 7 },
  glass:          { type: 'glass', name: 'Glass', maxStack: 64, place: 9 },
  iron_ore:       { type: 'iron_ore', name: 'Iron Ore', maxStack: 64, place: 10 },
  oak_planks:     { type: 'oak_planks', name: 'Oak Planks', maxStack: 64, place: 11 },
  crafting_table: { type: 'crafting_table', name: 'Crafting Table', maxStack: 64, place: 12 },
  bedrock:        { type: 'bedrock', name: 'Bedrock', maxStack: 64, place: 4 },

  // Materials.
  stick:          { type: 'stick', name: 'Stick', maxStack: 64, glyph: '/' },

  // Tools / weapons (don't stack).
  wooden_pickaxe: { type: 'wooden_pickaxe', name: 'Wooden Pickaxe', maxStack: 1, tool: 'pickaxe', damage: 0.5, glyph: '⛏' },
  wooden_axe:     { type: 'wooden_axe', name: 'Wooden Axe', maxStack: 1, tool: 'axe', damage: 1.0, glyph: '🪓' },
  wooden_sword:   { type: 'wooden_sword', name: 'Wooden Sword', maxStack: 1, tool: 'sword', damage: 1.5, glyph: '🗡' }
};

/** The creative-mode palette: every placeable block, infinite supply. */
export const CREATIVE_PALETTE = [
  'grass', 'dirt', 'stone', 'oak_log', 'oak_planks',
  'crafting_table', 'oak_leaves', 'sand', 'glass'
];

/** Items a fresh survival player starts with (none — pure survival). */
export const SURVIVAL_START = [];

/** @param {string} type @returns {ItemDef|null} */
export function getItem(type) {
  return type ? ITEMS[type] ?? null : null;
}

/** @param {string} type @returns {boolean} */
export function isTool(type) {
  return !!ITEMS[type]?.tool;
}

/** @param {string} type @returns {boolean} */
export function isPlaceable(type) {
  return !!ITEMS[type]?.place;
}

/** @param {string} type @returns {number} block id, or 0 if not placeable */
export function placeBlockId(type) {
  return ITEMS[type]?.place ?? 0;
}

/**
 * Time (seconds) to break a block with a given tool class.
 * @param {number} blockId
 * @param {string|null} toolClass 'pickaxe' | 'axe' | 'sword' | null (hand)
 * @returns {number} seconds (Infinity if the block can't be broken)
 */
export function getBreakTime(blockId, toolClass) {
  const def = BLOCKS[blockId];
  if (!def || !def.breakable) return Infinity;
  const cat = CATEGORY[blockId];
  const row = BREAK_TIMES[cat];
  if (!row) return def.hardness ?? 1;
  return row[toolClass] ?? row.hand;
}

/**
 * @param {number} blockId
 * @returns {string|null} item type dropped when this block is mined
 */
export function getDrop(blockId) {
  return BLOCK_DROPS[blockId] ?? null;
}

/**
 * Attack damage (hearts) for the held item: a weapon's value, else a bare fist.
 * @param {string|null} type
 * @returns {number}
 */
export function getAttackDamage(type) {
  return ITEMS[type]?.damage ?? 0.5;
}
