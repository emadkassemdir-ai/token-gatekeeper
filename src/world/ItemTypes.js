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
  13: 'soft',  // snow
  3: 'stone',  // stone
  10: 'stone', // iron ore
  15: 'stone', // coal ore
  16: 'stone', // gold ore
  17: 'stone', // diamond ore
  5: 'wood',   // oak wood
  11: 'wood',  // oak planks
  12: 'wood',  // crafting table
  18: 'stone', // furnace
  6: 'leaves', // oak leaves
  14: 'leaves',// jungle leaves
  9: 'glass',  // glass
  // Expansion:
  19: 'stone', 20: 'soft', 21: 'stone', 22: 'stone', 23: 'stone', 24: 'stone',
  25: 'stone', 26: 'stone', 27: 'stone', 28: 'wood', 29: 'leaves', 30: 'wood',
  31: 'leaves', 32: 'soft', 33: 'soft', 34: 'soft', 35: 'stone', 36: 'glass',
  37: 'wood', 38: 'glass', 39: 'soft', 40: 'stone', 41: 'stone', 42: 'stone',
  43: 'soft', 44: 'soft', 45: 'soft', 46: 'soft', 47: 'stone', 48: 'stone',
  49: 'stone', 50: 'stone', 51: 'stone', 52: 'stone'
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
  12: 'crafting_table',
  13: 'snow',
  14: null,        // jungle leaves drop nothing
  15: 'coal',      // coal ore -> coal
  16: 'gold_ore',  // raw gold (smelt later)
  17: 'diamond',   // diamond ore -> diamond gem (usable directly)
  18: 'furnace',
  // Expansion drops:
  19: 'cobblestone', 20: 'gravel', 21: 'sandstone', 22: 'bricks',
  23: 'mossy_cobblestone', 24: 'stone_bricks', 25: 'andesite', 26: 'diorite',
  27: 'granite', 28: 'birch_log', 29: null, 30: 'spruce_log', 31: null,
  32: 'cactus', 33: 'pumpkin', 34: 'melon', 35: 'obsidian', 36: 'glowstone',
  37: 'bookshelf', 38: null, 39: 'clay_ball', 40: 'lapis', 41: 'redstone',
  42: 'emerald', 43: 'white_wool', 44: 'red_wool', 45: 'blue_wool',
  46: 'green_wool', 47: 'iron_block', 48: 'gold_block', 49: 'diamond_block',
  50: 'lapis_block', 51: 'emerald_block', 52: 'coal_block'
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
  snow:           { type: 'snow', name: 'Snow', maxStack: 64, place: 13 },
  jungle_leaves:  { type: 'jungle_leaves', name: 'Jungle Leaves', maxStack: 64, place: 14 },
  gold_ore:       { type: 'gold_ore', name: 'Raw Gold', maxStack: 64, place: 16 },
  furnace:        { type: 'furnace', name: 'Furnace', maxStack: 64, place: 18 },

  // Expansion: placeable blocks.
  cobblestone:       { type: 'cobblestone', name: 'Cobblestone', maxStack: 64, place: 19 },
  gravel:            { type: 'gravel', name: 'Gravel', maxStack: 64, place: 20 },
  sandstone:         { type: 'sandstone', name: 'Sandstone', maxStack: 64, place: 21 },
  bricks:            { type: 'bricks', name: 'Bricks', maxStack: 64, place: 22 },
  mossy_cobblestone: { type: 'mossy_cobblestone', name: 'Mossy Cobblestone', maxStack: 64, place: 23 },
  stone_bricks:      { type: 'stone_bricks', name: 'Stone Bricks', maxStack: 64, place: 24 },
  andesite:          { type: 'andesite', name: 'Andesite', maxStack: 64, place: 25 },
  diorite:           { type: 'diorite', name: 'Diorite', maxStack: 64, place: 26 },
  granite:           { type: 'granite', name: 'Granite', maxStack: 64, place: 27 },
  birch_log:         { type: 'birch_log', name: 'Birch Log', maxStack: 64, place: 28 },
  birch_leaves:      { type: 'birch_leaves', name: 'Birch Leaves', maxStack: 64, place: 29 },
  spruce_log:        { type: 'spruce_log', name: 'Spruce Log', maxStack: 64, place: 30 },
  spruce_leaves:     { type: 'spruce_leaves', name: 'Spruce Leaves', maxStack: 64, place: 31 },
  cactus:            { type: 'cactus', name: 'Cactus', maxStack: 64, place: 32 },
  pumpkin:           { type: 'pumpkin', name: 'Pumpkin', maxStack: 64, place: 33 },
  melon:             { type: 'melon', name: 'Melon', maxStack: 64, place: 34 },
  obsidian:          { type: 'obsidian', name: 'Obsidian', maxStack: 64, place: 35 },
  glowstone:         { type: 'glowstone', name: 'Glowstone', maxStack: 64, place: 36 },
  bookshelf:         { type: 'bookshelf', name: 'Bookshelf', maxStack: 64, place: 37 },
  ice:               { type: 'ice', name: 'Ice', maxStack: 64, place: 38 },
  clay:              { type: 'clay', name: 'Clay', maxStack: 64, place: 39 },
  lapis_ore:         { type: 'lapis_ore', name: 'Lapis Ore', maxStack: 64, place: 40 },
  redstone_ore:      { type: 'redstone_ore', name: 'Redstone Ore', maxStack: 64, place: 41 },
  emerald_ore:       { type: 'emerald_ore', name: 'Emerald Ore', maxStack: 64, place: 42 },
  white_wool:        { type: 'white_wool', name: 'White Wool', maxStack: 64, place: 43 },
  red_wool:          { type: 'red_wool', name: 'Red Wool', maxStack: 64, place: 44 },
  blue_wool:         { type: 'blue_wool', name: 'Blue Wool', maxStack: 64, place: 45 },
  green_wool:        { type: 'green_wool', name: 'Green Wool', maxStack: 64, place: 46 },
  iron_block:        { type: 'iron_block', name: 'Block of Iron', maxStack: 64, place: 47 },
  gold_block:        { type: 'gold_block', name: 'Block of Gold', maxStack: 64, place: 48 },
  diamond_block:     { type: 'diamond_block', name: 'Block of Diamond', maxStack: 64, place: 49 },
  lapis_block:       { type: 'lapis_block', name: 'Lapis Block', maxStack: 64, place: 50 },
  emerald_block:     { type: 'emerald_block', name: 'Emerald Block', maxStack: 64, place: 51 },
  coal_block:        { type: 'coal_block', name: 'Block of Coal', maxStack: 64, place: 52 },

  // Materials.
  stick:          { type: 'stick', name: 'Stick', maxStack: 64, glyph: '/' },
  coal:           { type: 'coal', name: 'Coal', maxStack: 64, glyph: '⬛' },
  diamond:        { type: 'diamond', name: 'Diamond', maxStack: 64, glyph: '💎' },
  iron_ingot:     { type: 'iron_ingot', name: 'Iron Ingot', maxStack: 64, glyph: '▬' },
  gold_ingot:     { type: 'gold_ingot', name: 'Gold Ingot', maxStack: 64, glyph: '▭' },
  // Expansion: materials.
  lapis:          { type: 'lapis', name: 'Lapis Lazuli', maxStack: 64, glyph: '🔷' },
  redstone:       { type: 'redstone', name: 'Redstone Dust', maxStack: 64, glyph: '🔴' },
  emerald:        { type: 'emerald', name: 'Emerald', maxStack: 64, glyph: '💚' },
  flint:          { type: 'flint', name: 'Flint', maxStack: 64, glyph: '🔹' },
  clay_ball:      { type: 'clay_ball', name: 'Clay Ball', maxStack: 64, glyph: '●' },
  brick:          { type: 'brick', name: 'Brick', maxStack: 64, glyph: '▮' },
  charcoal:       { type: 'charcoal', name: 'Charcoal', maxStack: 64, glyph: '⬛' },
  string:         { type: 'string', name: 'String', maxStack: 64, glyph: '〰' },
  bone:           { type: 'bone', name: 'Bone', maxStack: 64, glyph: '🦴' },
  feather:        { type: 'feather', name: 'Feather', maxStack: 64, glyph: '🪶' },
  leather:        { type: 'leather', name: 'Leather', maxStack: 64, glyph: '🟫' },
  gunpowder:      { type: 'gunpowder', name: 'Gunpowder', maxStack: 64, glyph: '⚫' },
  paper:          { type: 'paper', name: 'Paper', maxStack: 64, glyph: '📄' },
  book:           { type: 'book', name: 'Book', maxStack: 64, glyph: '📕' },
  ender_pearl:    { type: 'ender_pearl', name: 'Ender Pearl', maxStack: 16, glyph: '🟢' },
  // Expansion: food.
  apple:          { type: 'apple', name: 'Apple', maxStack: 64, glyph: '🍎', food: { hunger: 2 } },
  bread:          { type: 'bread', name: 'Bread', maxStack: 64, glyph: '🍞', food: { hunger: 2.5 } },
  wheat:          { type: 'wheat', name: 'Wheat', maxStack: 64, glyph: '🌾' },
  raw_porkchop:   { type: 'raw_porkchop', name: 'Raw Porkchop', maxStack: 64, glyph: '🥩', food: { hunger: 1.5, raw: true } },
  cooked_porkchop:{ type: 'cooked_porkchop', name: 'Cooked Porkchop', maxStack: 64, glyph: '🍖', food: { hunger: 4 } },
  melon_slice:    { type: 'melon_slice', name: 'Melon Slice', maxStack: 64, glyph: '🍈', food: { hunger: 1 } },

  // Food (eaten to restore hunger; raw food can poison).
  raw_beef:       { type: 'raw_beef', name: 'Raw Beef', maxStack: 64, glyph: '🥩', food: { hunger: 1.5, raw: true } },
  steak:          { type: 'steak', name: 'Steak', maxStack: 64, glyph: '🍖', food: { hunger: 4 } },
  raw_mutton:     { type: 'raw_mutton', name: 'Raw Sheep Meat', maxStack: 64, glyph: '🥩', food: { hunger: 1.5, raw: true } },
  cooked_mutton:  { type: 'cooked_mutton', name: 'Deluxe Sheep Meat', maxStack: 64, glyph: '🍖', food: { hunger: 4 } },
  raw_salmon:     { type: 'raw_salmon', name: 'Raw Salmon', maxStack: 64, glyph: '🐟', food: { hunger: 1.5, raw: true } },
  cooked_salmon:  { type: 'cooked_salmon', name: 'Cooked Salmon', maxStack: 64, glyph: '🍣', food: { hunger: 3.5 } },

  // Tools / weapons (don't stack). Tier controls mining speed + attack damage.
  wooden_pickaxe:  { type: 'wooden_pickaxe', name: 'Wooden Pickaxe', maxStack: 1, tool: 'pickaxe', tier: 'wood', damage: 0.5, glyph: '⛏' },
  wooden_axe:      { type: 'wooden_axe', name: 'Wooden Axe', maxStack: 1, tool: 'axe', tier: 'wood', damage: 1.0, glyph: '🪓' },
  wooden_sword:    { type: 'wooden_sword', name: 'Wooden Sword', maxStack: 1, tool: 'sword', tier: 'wood', damage: 1.5, glyph: '🗡' },
  stone_pickaxe:   { type: 'stone_pickaxe', name: 'Stone Pickaxe', maxStack: 1, tool: 'pickaxe', tier: 'stone', damage: 1.0, glyph: '⛏' },
  stone_axe:       { type: 'stone_axe', name: 'Stone Axe', maxStack: 1, tool: 'axe', tier: 'stone', damage: 1.5, glyph: '🪓' },
  stone_sword:     { type: 'stone_sword', name: 'Stone Sword', maxStack: 1, tool: 'sword', tier: 'stone', damage: 2.0, glyph: '🗡' },
  iron_pickaxe:    { type: 'iron_pickaxe', name: 'Iron Pickaxe', maxStack: 1, tool: 'pickaxe', tier: 'iron', damage: 1.5, glyph: '⛏' },
  iron_axe:        { type: 'iron_axe', name: 'Iron Axe', maxStack: 1, tool: 'axe', tier: 'iron', damage: 2.0, glyph: '🪓' },
  iron_sword:      { type: 'iron_sword', name: 'Iron Sword', maxStack: 1, tool: 'sword', tier: 'iron', damage: 3.0, glyph: '🗡' },
  gold_pickaxe:    { type: 'gold_pickaxe', name: 'Gold Pickaxe', maxStack: 1, tool: 'pickaxe', tier: 'gold', damage: 1.0, glyph: '⛏' },
  gold_axe:        { type: 'gold_axe', name: 'Gold Axe', maxStack: 1, tool: 'axe', tier: 'gold', damage: 1.5, glyph: '🪓' },
  gold_sword:      { type: 'gold_sword', name: 'Gold Sword', maxStack: 1, tool: 'sword', tier: 'gold', damage: 2.5, glyph: '🗡' },
  diamond_pickaxe: { type: 'diamond_pickaxe', name: 'Diamond Pickaxe', maxStack: 1, tool: 'pickaxe', tier: 'diamond', damage: 2.0, glyph: '⛏' },
  diamond_axe:     { type: 'diamond_axe', name: 'Diamond Axe', maxStack: 1, tool: 'axe', tier: 'diamond', damage: 2.5, glyph: '🪓' },
  diamond_sword:   { type: 'diamond_sword', name: 'Diamond Sword', maxStack: 1, tool: 'sword', tier: 'diamond', damage: 3.5, glyph: '🗡' },

  // Armor (iron/gold/diamond). `armor` = protection points; `slot` = body part.
  iron_helmet:      { type: 'iron_helmet', name: 'Iron Helmet', maxStack: 1, armor: 2, slot: 'head', glyph: '⛑' },
  iron_chestplate:  { type: 'iron_chestplate', name: 'Iron Chestplate', maxStack: 1, armor: 6, slot: 'chest', glyph: '🦺' },
  iron_leggings:    { type: 'iron_leggings', name: 'Iron Leggings', maxStack: 1, armor: 5, slot: 'legs', glyph: '👖' },
  iron_boots:       { type: 'iron_boots', name: 'Iron Boots', maxStack: 1, armor: 2, slot: 'feet', glyph: '🥾' },
  gold_helmet:      { type: 'gold_helmet', name: 'Gold Helmet', maxStack: 1, armor: 2, slot: 'head', glyph: '⛑' },
  gold_chestplate:  { type: 'gold_chestplate', name: 'Gold Chestplate', maxStack: 1, armor: 5, slot: 'chest', glyph: '🦺' },
  gold_leggings:    { type: 'gold_leggings', name: 'Gold Leggings', maxStack: 1, armor: 3, slot: 'legs', glyph: '👖' },
  gold_boots:       { type: 'gold_boots', name: 'Gold Boots', maxStack: 1, armor: 1, slot: 'feet', glyph: '🥾' },
  diamond_helmet:     { type: 'diamond_helmet', name: 'Diamond Helmet', maxStack: 1, armor: 3, slot: 'head', glyph: '⛑' },
  diamond_chestplate: { type: 'diamond_chestplate', name: 'Diamond Chestplate', maxStack: 1, armor: 8, slot: 'chest', glyph: '🦺' },
  diamond_leggings:   { type: 'diamond_leggings', name: 'Diamond Leggings', maxStack: 1, armor: 6, slot: 'legs', glyph: '👖' },
  diamond_boots:      { type: 'diamond_boots', name: 'Diamond Boots', maxStack: 1, armor: 3, slot: 'feet', glyph: '🥾' },

  // Defensive items.
  shield: { type: 'shield', name: 'Shield', maxStack: 1, shield: true, glyph: '🛡' },
  totem:  { type: 'totem', name: 'Totem of Undying', maxStack: 1, totem: true, glyph: '🪙' }
};

/** @param {string|null} type @returns {boolean} */
export function isShield(type) { return !!ITEMS[type]?.shield; }
/** @param {string|null} type @returns {boolean} */
export function isTotem(type) { return !!ITEMS[type]?.totem; }

/** Mining-speed multiplier per tool tier (wood = baseline = the spec'd times). */
export const TIER_SPEED = { wood: 1, stone: 1.6, iron: 2.5, gold: 4, diamond: 3.5 };

/** The creative-mode palette: every placeable block, infinite supply. */
export const CREATIVE_PALETTE = [
  'grass', 'dirt', 'stone', 'cobblestone', 'oak_log', 'oak_planks',
  'crafting_table', 'furnace', 'oak_leaves', 'sand', 'sandstone', 'gravel', 'glass',
  'bricks', 'stone_bricks', 'mossy_cobblestone', 'andesite', 'diorite', 'granite',
  'birch_log', 'birch_leaves', 'spruce_log', 'spruce_leaves',
  'cactus', 'pumpkin', 'melon', 'obsidian', 'glowstone', 'bookshelf', 'ice', 'clay',
  'iron_ore', 'gold_ore', 'lapis_ore', 'redstone_ore', 'emerald_ore',
  'white_wool', 'red_wool', 'blue_wool', 'green_wool',
  'iron_block', 'gold_block', 'diamond_block', 'lapis_block', 'emerald_block', 'coal_block'
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
 * Time (seconds) to break a block with the held item. The base time comes from
 * the block category + the held tool's class (wood-tier values, per the spec);
 * higher tool tiers divide that by their speed multiplier.
 * @param {number} blockId
 * @param {string|null} heldType item type in hand (null = bare hand)
 * @returns {number} seconds (Infinity if the block can't be broken)
 */
export function getBreakTime(blockId, heldType) {
  const def = BLOCKS[blockId];
  if (!def || !def.breakable) return Infinity;
  const cat = CATEGORY[blockId];
  const row = BREAK_TIMES[cat];
  if (!row) return def.hardness ?? 1;

  const item = ITEMS[heldType];
  const cls = item?.tool ?? null;
  const base = row[cls] ?? row.hand;
  if (!cls) return base; // bare hand or non-tool item
  const speed = TIER_SPEED[item.tier] ?? 1;
  return base / speed;
}

/** @param {string|null} type @returns {boolean} whether the item is edible. */
export function isFood(type) {
  return !!ITEMS[type]?.food;
}

/** @param {string|null} type @returns {boolean} whether the item is armor. */
export function isArmor(type) {
  return !!ITEMS[type]?.slot;
}

/** @param {string|null} type @returns {string|null} armor slot ('head'…). */
export function armorSlot(type) {
  return ITEMS[type]?.slot ?? null;
}

/** @param {string|null} type @returns {number} armor protection points. */
export function armorPoints(type) {
  return ITEMS[type]?.armor ?? 0;
}

/** @param {string|null} type @returns {{hunger:number,raw?:boolean}|null} */
export function getFood(type) {
  return ITEMS[type]?.food ?? null;
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
