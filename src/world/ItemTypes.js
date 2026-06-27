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
  49: 'stone', 50: 'stone', 51: 'stone', 52: 'stone',
  // Nether:
  53: 'soft', 55: 'soft', 56: 'stone', 57: 'stone', 59: 'soft',
  // End:
  60: 'stone', 62: 'stone',
  // Utility:
  63: 'stone', 64: 'soft', 65: 'wood',
  // More blocks:
  66: 'leaves', 67: 'stone', 68: 'stone', 69: 'stone', 70: 'stone', 71: 'stone', 72: 'glass',
  // Netherite + functional:
  73: 'stone', 74: 'stone', 75: 'wood', 76: 'wood', 77: 'stone',
  // Redstone + structures:
  78: 'soft', 79: 'stone', 80: 'soft', 81: 'soft', 82: 'soft', 83: 'soft', 84: 'soft', 85: 'stone',
  // Functional / wood / wither:
  86: 'stone', 87: 'stone', 88: 'stone', 89: 'wood', 90: 'leaves', 91: 'wood',
  92: 'wood', 93: 'leaves', 94: 'wood', 95: 'stone', 96: 'glass',
  // Farming:
  97: 'soft', 98: 'leaves', 99: 'leaves', 100: 'leaves', 101: 'leaves', 102: 'leaves', 103: 'leaves',
  // Pistons / doors / ladders:
  104: 'wood', 105: 'wood', 106: 'wood', 107: 'wood', 108: 'wood', 109: 'wood',
  // Redstone logic + transport:
  110: 'stone', 111: 'stone', 112: 'stone', 113: 'stone', 114: 'stone', 115: 'stone',
  // Slabs + stairs (parent material):
  116: 'wood', 117: 'stone', 118: 'stone', 119: 'wood', 120: 'stone', 121: 'stone',
  // Villager job-site blocks:
  122: 'wood', 123: 'wood', 124: 'wood', 125: 'wood', 126: 'wood', 127: 'stone'
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
  50: 'lapis_block', 51: 'emerald_block', 52: 'coal_block',
  // Nether:
  53: 'netherrack', 54: null, 55: 'soul_sand', 56: 'nether_quartz',
  57: 'nether_bricks', 58: null, 59: 'tnt', 36: 'glowstone',
  // End:
  60: 'end_stone', 61: null, 62: 'dragon_egg',
  // Utility:
  63: 'enchanting_table', 64: 'bed', 65: 'chest',
  // More blocks:
  66: 'nether_wart', 67: 'brewing_stand', 68: 'raw_copper', 69: 'copper_block',
  70: 'deepslate', 71: 'smooth_stone', 72: 'sea_lantern',
  // Netherite + functional:
  73: 'ancient_debris', 74: 'netherite_block', 75: 'smithing_table', 76: 'barrel', 77: 'ender_chest',
  // Redstone:
  78: 'redstone', 79: 'redstone_block', 80: 'redstone_lamp', 81: 'redstone_lamp',
  82: 'lever', 83: 'lever', 84: 'redstone_torch', 85: null,
  // Functional / wood / wither:
  86: 'blast_furnace', 87: 'smoker', 88: 'grindstone', 89: 'acacia_log', 90: null,
  91: 'acacia_planks', 92: 'cherry_log', 93: null, 94: 'cherry_planks',
  95: 'wither_skeleton_skull', 96: 'beacon',
  // Farming (young crops drop their seed/item; ripe drop the harvest):
  97: 'dirt', 98: 'wheat_seeds', 99: 'wheat', 100: 'carrot', 101: 'carrot', 102: 'potato', 103: 'potato',
  // Pistons / doors / ladders (head & open-door drop the base item):
  104: 'piston', 105: 'piston', 106: 'sticky_piston', 107: 'ladder', 108: 'door', 109: 'door',
  // Redstone logic + transport:
  110: 'repeater', 111: 'repeater', 112: 'observer', 113: 'hopper', 114: 'dispenser', 115: 'dropper',
  // Slabs + stairs:
  116: 'oak_slab', 117: 'stone_slab', 118: 'cobblestone_slab',
  119: 'oak_stairs', 120: 'stone_stairs', 121: 'cobblestone_stairs',
  // Villager job-site blocks:
  122: 'composter', 123: 'lectern', 124: 'cartography_table', 125: 'fletching_table', 126: 'loom', 127: 'stonecutter'
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
  snowball:       { type: 'snowball', name: 'Snowball', maxStack: 16, glyph: '❄' },
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

  // Nether blocks.
  netherrack:        { type: 'netherrack', name: 'Netherrack', maxStack: 64, place: 53 },
  soul_sand:         { type: 'soul_sand', name: 'Soul Sand', maxStack: 64, place: 55 },
  nether_quartz_ore: { type: 'nether_quartz_ore', name: 'Nether Quartz Ore', maxStack: 64, place: 56 },
  nether_bricks:     { type: 'nether_bricks', name: 'Nether Bricks', maxStack: 64, place: 57 },
  tnt:               { type: 'tnt', name: 'TNT', maxStack: 64, place: 59 },
  end_stone:         { type: 'end_stone', name: 'End Stone', maxStack: 64, place: 60 },
  dragon_egg:        { type: 'dragon_egg', name: 'Dragon Egg', maxStack: 64, place: 62 },
  enchanting_table:  { type: 'enchanting_table', name: 'Enchanting Table', maxStack: 64, place: 63 },
  bed:               { type: 'bed', name: 'Bed', maxStack: 64, place: 64 },
  chest:             { type: 'chest', name: 'Chest', maxStack: 64, place: 65 },
  nether_wart:       { type: 'nether_wart', name: 'Nether Wart', maxStack: 64, place: 66 },
  brewing_stand:     { type: 'brewing_stand', name: 'Brewing Stand', maxStack: 64, place: 67 },
  copper_ore:        { type: 'copper_ore', name: 'Copper Ore', maxStack: 64, place: 68 },
  copper_block:      { type: 'copper_block', name: 'Block of Copper', maxStack: 64, place: 69 },
  deepslate:         { type: 'deepslate', name: 'Deepslate', maxStack: 64, place: 70 },
  smooth_stone:      { type: 'smooth_stone', name: 'Smooth Stone', maxStack: 64, place: 71 },
  sea_lantern:       { type: 'sea_lantern', name: 'Sea Lantern', maxStack: 64, place: 72 },
  ancient_debris:    { type: 'ancient_debris', name: 'Ancient Debris', maxStack: 64, place: 73 },
  netherite_block:   { type: 'netherite_block', name: 'Block of Netherite', maxStack: 64, place: 74 },
  smithing_table:    { type: 'smithing_table', name: 'Smithing Table', maxStack: 64, place: 75 },
  barrel:            { type: 'barrel', name: 'Barrel', maxStack: 64, place: 76 },
  ender_chest:       { type: 'ender_chest', name: 'Ender Chest', maxStack: 64, place: 77 },
  redstone_block:    { type: 'redstone_block', name: 'Block of Redstone', maxStack: 64, place: 79 },
  redstone_lamp:     { type: 'redstone_lamp', name: 'Redstone Lamp', maxStack: 64, place: 80 },
  lever:             { type: 'lever', name: 'Lever', maxStack: 64, place: 82 },
  redstone_torch:    { type: 'redstone_torch', name: 'Redstone Torch', maxStack: 64, place: 84 },
  spawner:           { type: 'spawner', name: 'Spawner', maxStack: 64, place: 85 },
  blast_furnace:     { type: 'blast_furnace', name: 'Blast Furnace', maxStack: 64, place: 86 },
  smoker:            { type: 'smoker', name: 'Smoker', maxStack: 64, place: 87 },
  grindstone:        { type: 'grindstone', name: 'Grindstone', maxStack: 64, place: 88 },
  acacia_log:        { type: 'acacia_log', name: 'Acacia Log', maxStack: 64, place: 89 },
  acacia_leaves:     { type: 'acacia_leaves', name: 'Acacia Leaves', maxStack: 64, place: 90 },
  acacia_planks:     { type: 'acacia_planks', name: 'Acacia Planks', maxStack: 64, place: 91 },
  cherry_log:        { type: 'cherry_log', name: 'Cherry Log', maxStack: 64, place: 92 },
  cherry_leaves:     { type: 'cherry_leaves', name: 'Cherry Leaves', maxStack: 64, place: 93 },
  cherry_planks:     { type: 'cherry_planks', name: 'Cherry Planks', maxStack: 64, place: 94 },
  wither_skeleton_skull: { type: 'wither_skeleton_skull', name: 'Wither Skeleton Skull', maxStack: 64, place: 95 },
  beacon:            { type: 'beacon', name: 'Beacon', maxStack: 64, place: 96 },
  piston:            { type: 'piston', name: 'Piston', maxStack: 64, place: 104 },
  sticky_piston:     { type: 'sticky_piston', name: 'Sticky Piston', maxStack: 64, place: 106 },
  ladder:            { type: 'ladder', name: 'Ladder', maxStack: 64, place: 107 },
  door:              { type: 'door', name: 'Oak Door', maxStack: 64, place: 108 },
  repeater:          { type: 'repeater', name: 'Redstone Repeater', maxStack: 64, place: 110 },
  observer:          { type: 'observer', name: 'Observer', maxStack: 64, place: 112 },
  hopper:            { type: 'hopper', name: 'Hopper', maxStack: 64, place: 113 },
  dispenser:         { type: 'dispenser', name: 'Dispenser', maxStack: 64, place: 114 },
  dropper:           { type: 'dropper', name: 'Dropper', maxStack: 64, place: 115 },
  oak_slab:          { type: 'oak_slab', name: 'Oak Slab', maxStack: 64, place: 116 },
  stone_slab:        { type: 'stone_slab', name: 'Stone Slab', maxStack: 64, place: 117 },
  cobblestone_slab:  { type: 'cobblestone_slab', name: 'Cobblestone Slab', maxStack: 64, place: 118 },
  oak_stairs:        { type: 'oak_stairs', name: 'Oak Stairs', maxStack: 64, place: 119 },
  stone_stairs:      { type: 'stone_stairs', name: 'Stone Stairs', maxStack: 64, place: 120 },
  cobblestone_stairs:{ type: 'cobblestone_stairs', name: 'Cobblestone Stairs', maxStack: 64, place: 121 },
  composter:         { type: 'composter', name: 'Composter', maxStack: 64, place: 122 },
  lectern:           { type: 'lectern', name: 'Lectern', maxStack: 64, place: 123 },
  cartography_table: { type: 'cartography_table', name: 'Cartography Table', maxStack: 64, place: 124 },
  fletching_table:   { type: 'fletching_table', name: 'Fletching Table', maxStack: 64, place: 125 },
  loom:              { type: 'loom', name: 'Loom', maxStack: 64, place: 126 },
  stonecutter:       { type: 'stonecutter', name: 'Stonecutter', maxStack: 64, place: 127 },

  // Materials.
  stick:          { type: 'stick', name: 'Stick', maxStack: 64, glyph: '/' },
  coal:           { type: 'coal', name: 'Coal', maxStack: 64, glyph: '⬛' },
  diamond:        { type: 'diamond', name: 'Diamond', maxStack: 64, glyph: '💎' },
  iron_ingot:     { type: 'iron_ingot', name: 'Iron Ingot', maxStack: 64, glyph: '▬' },
  gold_ingot:     { type: 'gold_ingot', name: 'Gold Ingot', maxStack: 64, glyph: '▭' },
  // Expansion: materials.
  lapis:          { type: 'lapis', name: 'Lapis Lazuli', maxStack: 64, glyph: '🔷' },
  redstone:       { type: 'redstone', name: 'Redstone Dust', maxStack: 64, place: 78, glyph: '🔴' },
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
  // Nether materials + tools/uses.
  nether_quartz:  { type: 'nether_quartz', name: 'Nether Quartz', maxStack: 64, glyph: '◇' },
  nether_brick:   { type: 'nether_brick', name: 'Nether Brick', maxStack: 64, glyph: '▪' },
  bonemeal:       { type: 'bonemeal', name: 'Bone Meal', maxStack: 64, glyph: '✦' },
  green_dye:      { type: 'green_dye', name: 'Green Dye', maxStack: 64, glyph: '●' },
  flint_and_steel:{ type: 'flint_and_steel', name: 'Flint and Steel', maxStack: 1, ignite: true, glyph: '🔥' },
  bow:            { type: 'bow', name: 'Bow', maxStack: 1, bow: true, damage: 0.5, glyph: '🏹' },
  crossbow:       { type: 'crossbow', name: 'Crossbow', maxStack: 1, bow: true, damage: 1.0, glyph: '🏹' },
  arrow:          { type: 'arrow', name: 'Arrow', maxStack: 64, glyph: '➶' },
  saddle:         { type: 'saddle', name: 'Saddle', maxStack: 1, glyph: '🐾' },
  // Leather armor (early-game protection from cow/zombie leather).
  leather_helmet:     { type: 'leather_helmet', name: 'Leather Cap', maxStack: 1, armor: 1, slot: 'head', glyph: '⛑' },
  leather_chestplate: { type: 'leather_chestplate', name: 'Leather Tunic', maxStack: 1, armor: 3, slot: 'chest', glyph: '🦺' },
  leather_leggings:   { type: 'leather_leggings', name: 'Leather Pants', maxStack: 1, armor: 2, slot: 'legs', glyph: '👖' },
  leather_boots:      { type: 'leather_boots', name: 'Leather Boots', maxStack: 1, armor: 1, slot: 'feet', glyph: '🥾' },

  // ---- Mob-sourced materials + The End ----
  blaze_rod:      { type: 'blaze_rod', name: 'Blaze Rod', maxStack: 64, glyph: '𝍡' },
  blaze_powder:   { type: 'blaze_powder', name: 'Blaze Powder', maxStack: 64, glyph: '✸' },
  eye_of_ender:   { type: 'eye_of_ender', name: 'Eye of Ender', maxStack: 64, endeye: true, glyph: '👁' },
  ghast_tear:     { type: 'ghast_tear', name: 'Ghast Tear', maxStack: 64, glyph: '💧' },
  spider_eye:     { type: 'spider_eye', name: 'Spider Eye', maxStack: 64, glyph: '👁', food: { hunger: 1, raw: true } },
  rotten_flesh:   { type: 'rotten_flesh', name: 'Rotten Flesh', maxStack: 64, glyph: '🍖', food: { hunger: 1, raw: true } },
  raw_chicken:    { type: 'raw_chicken', name: 'Raw Chicken', maxStack: 64, glyph: '🍗', food: { hunger: 1.5, raw: true } },
  cooked_chicken: { type: 'cooked_chicken', name: 'Cooked Chicken', maxStack: 64, glyph: '🍗', food: { hunger: 3 } },

  // ---- Brewing + potions ----
  raw_copper:     { type: 'raw_copper', name: 'Raw Copper', maxStack: 64, glyph: '◆' },
  copper_ingot:   { type: 'copper_ingot', name: 'Copper Ingot', maxStack: 64, glyph: '▬' },
  sugar:          { type: 'sugar', name: 'Sugar', maxStack: 64, glyph: '·' },
  slimeball:      { type: 'slimeball', name: 'Slimeball', maxStack: 64, glyph: '●' },
  magma_cream:    { type: 'magma_cream', name: 'Magma Cream', maxStack: 64, glyph: '●' },
  rabbit_foot:    { type: 'rabbit_foot', name: "Rabbit's Foot", maxStack: 64, glyph: '🐾' },
  fermented_spider_eye: { type: 'fermented_spider_eye', name: 'Fermented Spider Eye', maxStack: 64, glyph: '👁' },
  glass_bottle:   { type: 'glass_bottle', name: 'Glass Bottle', maxStack: 64, glyph: '⚗' },
  water_bottle:   { type: 'water_bottle', name: 'Water Bottle', maxStack: 64, potion: true, glyph: '⚗' },
  awkward_potion: { type: 'awkward_potion', name: 'Awkward Potion', maxStack: 64, potion: true, glyph: '⚗' },
  potion_healing:         { type: 'potion_healing', name: 'Potion of Healing', maxStack: 1, potion: true, glyph: '⚗' },
  potion_harming:         { type: 'potion_harming', name: 'Potion of Harming', maxStack: 1, potion: true, glyph: '⚗' },
  potion_regeneration:    { type: 'potion_regeneration', name: 'Potion of Regeneration', maxStack: 1, potion: true, glyph: '⚗' },
  potion_strength:        { type: 'potion_strength', name: 'Potion of Strength', maxStack: 1, potion: true, glyph: '⚗' },
  potion_swiftness:       { type: 'potion_swiftness', name: 'Potion of Swiftness', maxStack: 1, potion: true, glyph: '⚗' },
  potion_leaping:         { type: 'potion_leaping', name: 'Potion of Leaping', maxStack: 1, potion: true, glyph: '⚗' },
  potion_fire_resistance: { type: 'potion_fire_resistance', name: 'Potion of Fire Resistance', maxStack: 1, potion: true, glyph: '⚗' },
  potion_water_breathing: { type: 'potion_water_breathing', name: 'Potion of Water Breathing', maxStack: 1, potion: true, glyph: '⚗' },
  potion_night_vision:    { type: 'potion_night_vision', name: 'Potion of Night Vision', maxStack: 1, potion: true, glyph: '⚗' },
  potion_poison:          { type: 'potion_poison', name: 'Potion of Poison', maxStack: 1, potion: true, glyph: '⚗' },
  potion_weakness:        { type: 'potion_weakness', name: 'Potion of Weakness', maxStack: 1, potion: true, glyph: '⚗' },
  potion_slowness:        { type: 'potion_slowness', name: 'Potion of Slowness', maxStack: 1, potion: true, glyph: '⚗' },

  // ---- New mob drops + foods ----
  pufferfish:     { type: 'pufferfish', name: 'Pufferfish', maxStack: 64, glyph: '🐡', food: { hunger: 0.5, raw: true } },
  raw_rabbit:     { type: 'raw_rabbit', name: 'Raw Rabbit', maxStack: 64, glyph: '🍖', food: { hunger: 1.5, raw: true } },
  cooked_rabbit:  { type: 'cooked_rabbit', name: 'Cooked Rabbit', maxStack: 64, glyph: '🍖', food: { hunger: 2.5 } },
  golden_apple:   { type: 'golden_apple', name: 'Golden Apple', maxStack: 64, glyph: '🍏', food: { hunger: 2 }, golden: 'apple' },
  enchanted_golden_apple: { type: 'enchanted_golden_apple', name: 'Enchanted Golden Apple', maxStack: 64, glyph: '🍏', food: { hunger: 2 }, golden: 'god' },
  golden_carrot:  { type: 'golden_carrot', name: 'Golden Carrot', maxStack: 64, glyph: '🥕', food: { hunger: 3 } },
  netherite_scrap: { type: 'netherite_scrap', name: 'Netherite Scrap', maxStack: 64, glyph: '◆' },
  netherite_ingot: { type: 'netherite_ingot', name: 'Netherite Ingot', maxStack: 64, glyph: '▬' },
  nether_star:     { type: 'nether_star', name: 'Nether Star', maxStack: 64, glyph: '✦' },
  phantom_membrane: { type: 'phantom_membrane', name: 'Phantom Membrane', maxStack: 64, glyph: '◇' },

  // ---- Farming + buckets ----
  wheat_seeds:    { type: 'wheat_seeds', name: 'Wheat Seeds', maxStack: 64, plant: 98, glyph: '🌱' },
  carrot:         { type: 'carrot', name: 'Carrot', maxStack: 64, plant: 100, food: { hunger: 1.5 }, glyph: '🥕' },
  potato:         { type: 'potato', name: 'Potato', maxStack: 64, plant: 102, food: { hunger: 1 }, glyph: '🥔' },
  baked_potato:   { type: 'baked_potato', name: 'Baked Potato', maxStack: 64, food: { hunger: 2.5 }, glyph: '🥔' },
  poisonous_potato: { type: 'poisonous_potato', name: 'Poisonous Potato', maxStack: 64, food: { hunger: 1, raw: true }, glyph: '🥔' },
  bucket:         { type: 'bucket', name: 'Bucket', maxStack: 16, glyph: '🪣' },
  water_bucket:   { type: 'water_bucket', name: 'Water Bucket', maxStack: 1, glyph: '🪣' },
  lava_bucket:    { type: 'lava_bucket', name: 'Lava Bucket', maxStack: 1, glyph: '🪣' },
  milk_bucket:    { type: 'milk_bucket', name: 'Milk Bucket', maxStack: 1, glyph: '🥛' },
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
  wooden_hoe:      { type: 'wooden_hoe', name: 'Wooden Hoe', maxStack: 1, tool: 'hoe', tier: 'wood', damage: 0.5, glyph: '⌐' },
  stone_hoe:       { type: 'stone_hoe', name: 'Stone Hoe', maxStack: 1, tool: 'hoe', tier: 'stone', damage: 0.5, glyph: '⌐' },
  iron_hoe:        { type: 'iron_hoe', name: 'Iron Hoe', maxStack: 1, tool: 'hoe', tier: 'iron', damage: 0.5, glyph: '⌐' },
  diamond_hoe:     { type: 'diamond_hoe', name: 'Diamond Hoe', maxStack: 1, tool: 'hoe', tier: 'diamond', damage: 0.5, glyph: '⌐' },
  netherite_pickaxe: { type: 'netherite_pickaxe', name: 'Netherite Pickaxe', maxStack: 1, tool: 'pickaxe', tier: 'netherite', damage: 2.5, glyph: '⛏' },
  netherite_axe:     { type: 'netherite_axe', name: 'Netherite Axe', maxStack: 1, tool: 'axe', tier: 'netherite', damage: 3.0, glyph: '🪓' },
  netherite_sword:   { type: 'netherite_sword', name: 'Netherite Sword', maxStack: 1, tool: 'sword', tier: 'netherite', damage: 4.0, glyph: '🗡' },

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
  netherite_helmet:     { type: 'netherite_helmet', name: 'Netherite Helmet', maxStack: 1, armor: 3, slot: 'head', glyph: '⛑' },
  netherite_chestplate: { type: 'netherite_chestplate', name: 'Netherite Chestplate', maxStack: 1, armor: 8, slot: 'chest', glyph: '🦺' },
  netherite_leggings:   { type: 'netherite_leggings', name: 'Netherite Leggings', maxStack: 1, armor: 6, slot: 'legs', glyph: '👖' },
  netherite_boots:      { type: 'netherite_boots', name: 'Netherite Boots', maxStack: 1, armor: 3, slot: 'feet', glyph: '🥾' },

  // Defensive items.
  shield: { type: 'shield', name: 'Shield', maxStack: 1, shield: true, glyph: '🛡' },
  totem:  { type: 'totem', name: 'Totem of Undying', maxStack: 1, totem: true, glyph: '🪙' }
};

/** @param {string|null} type @returns {boolean} */
export function isShield(type) { return !!ITEMS[type]?.shield; }
/** @param {string|null} type @returns {boolean} igniter (flint & steel). */
export function isIgnite(type) { return !!ITEMS[type]?.ignite; }
/** @param {string|null} type @returns {boolean} ranged bow weapon. */
export function isBow(type) { return !!ITEMS[type]?.bow; }
/** @param {string|null} type @returns {boolean} Eye of Ender (opens the End). */
export function isEndEye(type) { return !!ITEMS[type]?.endeye; }
/** @param {string|null} type @returns {boolean} a hoe (tills farmland). */
export function isHoe(type) { return ITEMS[type]?.tool === 'hoe'; }
/** @param {string|null} type @returns {number} crop block id this item plants, or 0. */
export function plantCrop(type) { return ITEMS[type]?.plant ?? 0; }
/** @param {string|null} type @returns {boolean} */
export function isTotem(type) { return !!ITEMS[type]?.totem; }

/** Mining-speed multiplier per tool tier (wood = baseline = the spec'd times). */
export const TIER_SPEED = { wood: 1, stone: 1.6, iron: 2.5, gold: 4, diamond: 3.5, netherite: 4.5 };

/** The creative-mode palette: every placeable block, infinite supply. */
export const CREATIVE_PALETTE = [
  'grass', 'dirt', 'stone', 'cobblestone', 'oak_log', 'oak_planks',
  'crafting_table', 'furnace', 'oak_leaves', 'sand', 'sandstone', 'gravel', 'glass',
  'bricks', 'stone_bricks', 'mossy_cobblestone', 'andesite', 'diorite', 'granite',
  'birch_log', 'birch_leaves', 'spruce_log', 'spruce_leaves',
  'cactus', 'pumpkin', 'melon', 'obsidian', 'glowstone', 'bookshelf', 'ice', 'clay',
  'iron_ore', 'gold_ore', 'lapis_ore', 'redstone_ore', 'emerald_ore',
  'white_wool', 'red_wool', 'blue_wool', 'green_wool',
  'iron_block', 'gold_block', 'diamond_block', 'lapis_block', 'emerald_block', 'coal_block',
  'netherrack', 'soul_sand', 'nether_quartz_ore', 'nether_bricks', 'tnt',
  'end_stone', 'dragon_egg', 'enchanting_table', 'bed', 'chest', 'bookshelf',
  'brewing_stand', 'copper_ore', 'copper_block', 'deepslate', 'smooth_stone', 'sea_lantern', 'nether_wart',
  'ancient_debris', 'netherite_block', 'smithing_table', 'barrel', 'ender_chest',
  'redstone', 'redstone_block', 'redstone_lamp', 'lever', 'redstone_torch',
  'blast_furnace', 'smoker', 'grindstone', 'acacia_log', 'acacia_leaves', 'acacia_planks',
  'cherry_log', 'cherry_leaves', 'cherry_planks', 'wither_skeleton_skull', 'beacon',
  'piston', 'sticky_piston', 'ladder', 'door',
  'repeater', 'observer', 'hopper', 'dispenser', 'dropper',
  'oak_slab', 'stone_slab', 'cobblestone_slab', 'oak_stairs', 'stone_stairs', 'cobblestone_stairs',
  'composter', 'lectern', 'cartography_table', 'fletching_table', 'loom', 'stonecutter'
];

/** Tilling a hoe gives BREAK_TIMES a 'hoe' column; default to the hand speed. */
for (const cat of Object.keys(BREAK_TIMES)) {
  if (BREAK_TIMES[cat].hoe === undefined) BREAK_TIMES[cat].hoe = BREAK_TIMES[cat].hand;
}

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
