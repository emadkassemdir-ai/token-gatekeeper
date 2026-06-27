/**
 * BlockTypes
 * ----------
 * Authoritative registry of every voxel the engine understands. Each block
 * declares its rendering colour (per-face tinting), physical behaviour, and
 * gameplay metadata (break time, transparency, whether it can be broken).
 *
 * Ids are stable integers — id 0 is reserved for AIR and must stay 0 because
 * the chunk voxel store uses a zero-filled typed array as "empty".
 *
 * Colours for blocks 1-11 use the brighter "improved" palette; the helper
 * exports below (isAir/isSolid/.../PLACEABLE_BLOCKS/CRAFTING_TABLE_ID/
 * FURNACE_ID) are required across World, ItemTypes and main.
 */

export const AIR = 0;

/**
 * @typedef {Object} BlockDefinition
 * @property {number} id            Stable integer id stored in the voxel array.
 * @property {string} name          Human readable name (shown in the HUD).
 * @property {number[]} color       Base RGB triplet 0..1 used for the material.
 * @property {Object} [faceColors]  Optional per-face tint overrides.
 * @property {boolean} solid        Whether AABB collision treats it as solid.
 * @property {boolean} transparent  Whether neighbours' faces stay visible.
 * @property {boolean} breakable    Whether the player may break it.
 * @property {number} hardness      Relative time (seconds) to break.
 * @property {boolean} liquid       Whether it behaves like water (swim/oxygen).
 * @property {boolean} [animated]   Whether the material animates (water).
 * @property {number} [opacity]     Render opacity for transparent blocks.
 */

/** @type {Record<number, BlockDefinition>} */
export const BLOCKS = {
  1: {
    id: 1,
    name: 'Grass',
    color: [0.4, 0.65, 0.3],
    faceColors: { top: [0.35, 0.72, 0.25], bottom: [0.55, 0.38, 0.22], side: [0.48, 0.58, 0.32] },
    solid: true, transparent: false, breakable: true, hardness: 0.6, liquid: false
  },
  2: {
    id: 2, name: 'Dirt', color: [0.55, 0.38, 0.22],
    solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false
  },
  3: {
    id: 3, name: 'Stone', color: [0.55, 0.55, 0.58],
    faceColors: { top: [0.6, 0.6, 0.63], bottom: [0.48, 0.48, 0.5], side: [0.52, 0.52, 0.55] },
    solid: true, transparent: false, breakable: true, hardness: 1.5, liquid: false
  },
  4: {
    id: 4, name: 'Bedrock', color: [0.25, 0.25, 0.28],
    solid: true, transparent: false, breakable: false, hardness: Infinity, liquid: false
  },
  5: {
    id: 5, name: 'Oak Wood', color: [0.55, 0.42, 0.22],
    faceColors: { top: [0.65, 0.52, 0.3], bottom: [0.65, 0.52, 0.3], side: [0.48, 0.35, 0.18] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false
  },
  6: {
    id: 6, name: 'Oak Leaves', color: [0.25, 0.55, 0.2],
    solid: true, transparent: true, breakable: true, hardness: 0.2, liquid: false, opacity: 0.85
  },
  7: {
    id: 7, name: 'Sand', color: [0.9, 0.85, 0.6],
    solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false
  },
  8: {
    id: 8, name: 'Water', color: [0.15, 0.45, 0.85],
    solid: false, transparent: true, breakable: false, hardness: Infinity,
    liquid: true, animated: true, opacity: 0.65
  },
  9: {
    id: 9, name: 'Glass', color: [0.75, 0.88, 0.95],
    solid: true, transparent: true, breakable: true, hardness: 0.3, liquid: false, opacity: 0.35
  },
  10: {
    id: 10, name: 'Iron Ore', color: [0.6, 0.55, 0.5],
    faceColors: { top: [0.65, 0.6, 0.55], bottom: [0.55, 0.5, 0.45], side: [0.58, 0.52, 0.48] },
    solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false
  },
  11: {
    id: 11, name: 'Oak Planks', color: [0.68, 0.52, 0.3],
    faceColors: { top: [0.72, 0.55, 0.32], bottom: [0.62, 0.48, 0.28], side: [0.65, 0.5, 0.28] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false
  },
  12: {
    id: 12, name: 'Crafting Table', color: [0.5, 0.36, 0.2],
    faceColors: { top: [0.45, 0.32, 0.18], bottom: [0.55, 0.42, 0.25], side: [0.5, 0.36, 0.2] },
    solid: true, transparent: false, breakable: true, hardness: 1.2, liquid: false
  },
  13: {
    id: 13, name: 'Snow', color: [0.92, 0.95, 0.98],
    faceColors: { top: [0.96, 0.98, 1.0], bottom: [0.8, 0.85, 0.9], side: [0.9, 0.93, 0.97] },
    solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false
  },
  14: {
    id: 14, name: 'Jungle Leaves', color: [0.13, 0.42, 0.1],
    solid: true, transparent: true, breakable: true, hardness: 0.2, liquid: false, opacity: 0.9
  },
  15: {
    id: 15, name: 'Coal Ore', color: [0.32, 0.32, 0.34],
    faceColors: { top: [0.3, 0.3, 0.32], bottom: [0.3, 0.3, 0.32], side: [0.33, 0.33, 0.35] },
    solid: true, transparent: false, breakable: true, hardness: 1.8, liquid: false
  },
  16: {
    id: 16, name: 'Gold Ore', color: [0.62, 0.55, 0.3],
    faceColors: { top: [0.66, 0.58, 0.32], bottom: [0.6, 0.53, 0.29], side: [0.62, 0.55, 0.3] },
    solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false
  },
  17: {
    id: 17, name: 'Diamond Ore', color: [0.45, 0.72, 0.76],
    faceColors: { top: [0.5, 0.78, 0.82], bottom: [0.42, 0.68, 0.72], side: [0.45, 0.72, 0.76] },
    solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false
  },
  18: {
    id: 18, name: 'Furnace', color: [0.34, 0.34, 0.36],
    faceColors: { top: [0.3, 0.3, 0.32], bottom: [0.3, 0.3, 0.32], side: [0.36, 0.36, 0.38] },
    solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false
  },

  // ---- Expansion: stone family ----
  19: { id: 19, name: 'Cobblestone', color: [0.5, 0.5, 0.52], solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false },
  20: { id: 20, name: 'Gravel', color: [0.5, 0.47, 0.45], solid: true, transparent: false, breakable: true, hardness: 0.6, liquid: false },
  21: { id: 21, name: 'Sandstone', color: [0.86, 0.8, 0.58],
    faceColors: { top: [0.9, 0.84, 0.62], bottom: [0.8, 0.74, 0.54], side: [0.86, 0.8, 0.58] },
    solid: true, transparent: false, breakable: true, hardness: 1.6, liquid: false },
  22: { id: 22, name: 'Bricks', color: [0.6, 0.28, 0.22], solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false },
  23: { id: 23, name: 'Mossy Cobblestone', color: [0.42, 0.48, 0.4], solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false },
  24: { id: 24, name: 'Stone Bricks', color: [0.5, 0.5, 0.52], solid: true, transparent: false, breakable: true, hardness: 1.8, liquid: false },
  25: { id: 25, name: 'Andesite', color: [0.55, 0.55, 0.56], solid: true, transparent: false, breakable: true, hardness: 1.6, liquid: false },
  26: { id: 26, name: 'Diorite', color: [0.84, 0.84, 0.85], solid: true, transparent: false, breakable: true, hardness: 1.6, liquid: false },
  27: { id: 27, name: 'Granite', color: [0.68, 0.46, 0.39], solid: true, transparent: false, breakable: true, hardness: 1.6, liquid: false },

  // ---- Expansion: trees ----
  28: { id: 28, name: 'Birch Log', color: [0.82, 0.8, 0.72],
    faceColors: { top: [0.8, 0.72, 0.55], bottom: [0.8, 0.72, 0.55], side: [0.86, 0.85, 0.8] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  29: { id: 29, name: 'Birch Leaves', color: [0.5, 0.62, 0.34], solid: true, transparent: true, breakable: true, hardness: 0.2, liquid: false, opacity: 0.86 },
  30: { id: 30, name: 'Spruce Log', color: [0.32, 0.23, 0.14],
    faceColors: { top: [0.45, 0.34, 0.2], bottom: [0.45, 0.34, 0.2], side: [0.3, 0.22, 0.13] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  31: { id: 31, name: 'Spruce Leaves', color: [0.2, 0.34, 0.22], solid: true, transparent: true, breakable: true, hardness: 0.2, liquid: false, opacity: 0.9 },

  // ---- Expansion: plants & misc ----
  32: { id: 32, name: 'Cactus', color: [0.3, 0.55, 0.25],
    faceColors: { top: [0.34, 0.6, 0.28], bottom: [0.26, 0.46, 0.2], side: [0.3, 0.55, 0.25] },
    solid: true, transparent: true, breakable: true, hardness: 0.5, liquid: false },
  33: { id: 33, name: 'Pumpkin', color: [0.85, 0.5, 0.12],
    faceColors: { top: [0.7, 0.5, 0.2], bottom: [0.7, 0.5, 0.2], side: [0.85, 0.5, 0.12] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  34: { id: 34, name: 'Melon', color: [0.4, 0.62, 0.2],
    faceColors: { top: [0.38, 0.56, 0.22], bottom: [0.38, 0.56, 0.22], side: [0.4, 0.62, 0.2] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  35: { id: 35, name: 'Obsidian', color: [0.13, 0.1, 0.18], solid: true, transparent: false, breakable: true, hardness: 5.0, liquid: false },
  36: { id: 36, name: 'Glowstone', color: [0.9, 0.78, 0.4], solid: true, transparent: false, breakable: true, hardness: 0.4, liquid: false },
  37: { id: 37, name: 'Bookshelf', color: [0.6, 0.45, 0.28],
    faceColors: { top: [0.65, 0.5, 0.28], bottom: [0.65, 0.5, 0.28], side: [0.6, 0.45, 0.28] },
    solid: true, transparent: false, breakable: true, hardness: 1.2, liquid: false },
  38: { id: 38, name: 'Ice', color: [0.62, 0.78, 0.95], solid: true, transparent: true, breakable: true, hardness: 0.5, liquid: false, opacity: 0.7 },
  39: { id: 39, name: 'Clay', color: [0.66, 0.68, 0.72], solid: true, transparent: false, breakable: true, hardness: 0.6, liquid: false },

  // ---- Expansion: ores ----
  40: { id: 40, name: 'Lapis Ore', color: [0.5, 0.52, 0.56], solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false },
  41: { id: 41, name: 'Redstone Ore', color: [0.52, 0.5, 0.5], solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false },
  42: { id: 42, name: 'Emerald Ore', color: [0.52, 0.56, 0.52], solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false },

  // ---- Expansion: wool ----
  43: { id: 43, name: 'White Wool', color: [0.93, 0.93, 0.93], solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false },
  44: { id: 44, name: 'Red Wool', color: [0.72, 0.2, 0.2], solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false },
  45: { id: 45, name: 'Blue Wool', color: [0.2, 0.3, 0.72], solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false },
  46: { id: 46, name: 'Green Wool', color: [0.3, 0.55, 0.25], solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false },

  // ---- Expansion: storage / mineral blocks ----
  47: { id: 47, name: 'Block of Iron', color: [0.85, 0.85, 0.87], solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false },
  48: { id: 48, name: 'Block of Gold', color: [0.95, 0.8, 0.2], solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false },
  49: { id: 49, name: 'Block of Diamond', color: [0.4, 0.85, 0.9], solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false },
  50: { id: 50, name: 'Lapis Block', color: [0.15, 0.3, 0.7], solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false },
  51: { id: 51, name: 'Emerald Block', color: [0.15, 0.8, 0.4], solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false },
  52: { id: 52, name: 'Block of Coal', color: [0.12, 0.12, 0.14], solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false },

  // ---- Nether ----
  53: { id: 53, name: 'Netherrack', color: [0.45, 0.16, 0.16], solid: true, transparent: false, breakable: true, hardness: 0.4, liquid: false },
  54: { id: 54, name: 'Lava', color: [0.95, 0.45, 0.12],
    faceColors: { top: [1.0, 0.55, 0.15], bottom: [0.7, 0.3, 0.08], side: [0.9, 0.4, 0.1] },
    solid: false, transparent: true, breakable: false, hardness: Infinity, liquid: true, animated: true, opacity: 0.95 },
  55: { id: 55, name: 'Soul Sand', color: [0.36, 0.27, 0.21], solid: true, transparent: false, breakable: true, hardness: 0.6, liquid: false },
  56: { id: 56, name: 'Nether Quartz Ore', color: [0.5, 0.28, 0.27], solid: true, transparent: false, breakable: true, hardness: 1.5, liquid: false },
  57: { id: 57, name: 'Nether Bricks', color: [0.28, 0.14, 0.16], solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false },
  58: { id: 58, name: 'Nether Portal', color: [0.6, 0.25, 0.85],
    solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false, animated: true, opacity: 0.7 },
  59: { id: 59, name: 'TNT', color: [0.78, 0.2, 0.16],
    faceColors: { top: [0.85, 0.78, 0.3], bottom: [0.5, 0.35, 0.2], side: [0.78, 0.2, 0.16] },
    solid: true, transparent: false, breakable: true, hardness: 0.4, liquid: false },

  // ---- The End ----
  60: { id: 60, name: 'End Stone', color: [0.87, 0.86, 0.62], solid: true, transparent: false, breakable: true, hardness: 1.5, liquid: false },
  61: { id: 61, name: 'End Portal', color: [0.04, 0.05, 0.12],
    solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false, animated: true, opacity: 0.85 },
  62: { id: 62, name: 'Dragon Egg', color: [0.08, 0.05, 0.12], solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false },

  // ---- Utility blocks ----
  63: { id: 63, name: 'Enchanting Table', color: [0.16, 0.13, 0.2],
    faceColors: { top: [0.6, 0.12, 0.16], bottom: [0.14, 0.11, 0.18], side: [0.16, 0.13, 0.2] },
    solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false },
  64: { id: 64, name: 'Bed', color: [0.82, 0.2, 0.2],
    faceColors: { top: [0.85, 0.22, 0.22], bottom: [0.45, 0.32, 0.2], side: [0.7, 0.2, 0.2] },
    solid: true, transparent: false, breakable: true, hardness: 0.4, liquid: false },
  65: { id: 65, name: 'Chest', color: [0.6, 0.45, 0.24],
    faceColors: { top: [0.66, 0.5, 0.28], bottom: [0.5, 0.38, 0.2], side: [0.6, 0.45, 0.24] },
    solid: true, transparent: false, breakable: true, hardness: 1.5, liquid: false },

  // ---- More blocks ----
  66: { id: 66, name: 'Nether Wart', color: [0.5, 0.1, 0.12], solid: false, transparent: true, breakable: true, hardness: 0.2, liquid: false },
  67: { id: 67, name: 'Brewing Stand', color: [0.45, 0.42, 0.4],
    faceColors: { top: [0.7, 0.4, 0.2], bottom: [0.4, 0.38, 0.36], side: [0.45, 0.42, 0.4] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  68: { id: 68, name: 'Copper Ore', color: [0.55, 0.45, 0.4], solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false },
  69: { id: 69, name: 'Block of Copper', color: [0.78, 0.45, 0.3], solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false },
  70: { id: 70, name: 'Deepslate', color: [0.28, 0.28, 0.32], solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false },
  71: { id: 71, name: 'Smooth Stone', color: [0.62, 0.62, 0.64], solid: true, transparent: false, breakable: true, hardness: 1.5, liquid: false },
  72: { id: 72, name: 'Sea Lantern', color: [0.82, 0.92, 0.9], solid: true, transparent: false, breakable: true, hardness: 0.4, liquid: false },

  // ---- Netherite + more functional blocks ----
  73: { id: 73, name: 'Ancient Debris', color: [0.4, 0.28, 0.22], solid: true, transparent: false, breakable: true, hardness: 5.0, liquid: false },
  74: { id: 74, name: 'Block of Netherite', color: [0.2, 0.18, 0.2], solid: true, transparent: false, breakable: true, hardness: 5.0, liquid: false },
  75: { id: 75, name: 'Smithing Table', color: [0.24, 0.22, 0.22],
    faceColors: { top: [0.32, 0.3, 0.32], bottom: [0.2, 0.18, 0.18], side: [0.24, 0.22, 0.22] },
    solid: true, transparent: false, breakable: true, hardness: 1.2, liquid: false },
  76: { id: 76, name: 'Barrel', color: [0.52, 0.4, 0.24],
    faceColors: { top: [0.3, 0.24, 0.16], bottom: [0.3, 0.24, 0.16], side: [0.52, 0.4, 0.24] },
    solid: true, transparent: false, breakable: true, hardness: 1.2, liquid: false },
  77: { id: 77, name: 'Ender Chest', color: [0.1, 0.18, 0.18],
    faceColors: { top: [0.12, 0.22, 0.22], bottom: [0.08, 0.14, 0.14], side: [0.1, 0.18, 0.18] },
    solid: true, transparent: false, breakable: true, hardness: 3.0, liquid: false },

  // ---- Redstone ----
  78: { id: 78, name: 'Redstone Dust', color: [0.5, 0.1, 0.1], solid: true, transparent: false, breakable: true, hardness: 0.2, liquid: false },
  79: { id: 79, name: 'Block of Redstone', color: [0.78, 0.06, 0.06], solid: true, transparent: false, breakable: true, hardness: 1.5, liquid: false },
  80: { id: 80, name: 'Redstone Lamp', color: [0.42, 0.32, 0.2], solid: true, transparent: false, breakable: true, hardness: 0.4, liquid: false },
  81: { id: 81, name: 'Redstone Lamp (lit)', color: [1.0, 0.86, 0.5], solid: true, transparent: false, breakable: true, hardness: 0.4, liquid: false },
  82: { id: 82, name: 'Lever', color: [0.5, 0.45, 0.42], solid: true, transparent: false, breakable: true, hardness: 0.3, liquid: false },
  83: { id: 83, name: 'Lever (on)', color: [0.6, 0.52, 0.46], solid: true, transparent: false, breakable: true, hardness: 0.3, liquid: false },
  84: { id: 84, name: 'Redstone Torch', color: [0.55, 0.12, 0.12], solid: true, transparent: false, breakable: true, hardness: 0.2, liquid: false },

  // ---- Structures ----
  85: { id: 85, name: 'Spawner', color: [0.18, 0.2, 0.24], solid: true, transparent: true, breakable: true, hardness: 3.0, liquid: false, opacity: 0.7 },

  // ---- Functional smelting/utility ----
  86: { id: 86, name: 'Blast Furnace', color: [0.3, 0.3, 0.34],
    faceColors: { top: [0.26, 0.26, 0.3], bottom: [0.26, 0.26, 0.3], side: [0.32, 0.32, 0.36] },
    solid: true, transparent: false, breakable: true, hardness: 2.5, liquid: false },
  87: { id: 87, name: 'Smoker', color: [0.3, 0.25, 0.2],
    faceColors: { top: [0.26, 0.22, 0.18], bottom: [0.26, 0.22, 0.18], side: [0.34, 0.28, 0.22] },
    solid: true, transparent: false, breakable: true, hardness: 2.0, liquid: false },
  88: { id: 88, name: 'Grindstone', color: [0.5, 0.5, 0.52], solid: true, transparent: false, breakable: true, hardness: 1.5, liquid: false },

  // ---- More wood ----
  89: { id: 89, name: 'Acacia Log', color: [0.5, 0.34, 0.2],
    faceColors: { top: [0.62, 0.42, 0.26], bottom: [0.62, 0.42, 0.26], side: [0.46, 0.3, 0.18] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  90: { id: 90, name: 'Acacia Leaves', color: [0.45, 0.55, 0.24], solid: true, transparent: true, breakable: true, hardness: 0.2, liquid: false, opacity: 0.86 },
  91: { id: 91, name: 'Acacia Planks', color: [0.74, 0.42, 0.26], solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  92: { id: 92, name: 'Cherry Log', color: [0.42, 0.36, 0.38],
    faceColors: { top: [0.86, 0.62, 0.66], bottom: [0.86, 0.62, 0.66], side: [0.4, 0.34, 0.36] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  93: { id: 93, name: 'Cherry Leaves', color: [0.93, 0.72, 0.82], solid: true, transparent: true, breakable: true, hardness: 0.2, liquid: false, opacity: 0.88 },
  94: { id: 94, name: 'Cherry Planks', color: [0.86, 0.58, 0.6], solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },

  // ---- The Wither + Beacon ----
  95: { id: 95, name: 'Wither Skeleton Skull', color: [0.16, 0.16, 0.18], solid: true, transparent: true, breakable: true, hardness: 1.0, liquid: false, opacity: 0.9 },
  96: { id: 96, name: 'Beacon', color: [0.3, 0.85, 0.85], solid: true, transparent: true, breakable: true, hardness: 1.0, liquid: false, opacity: 0.6 },

  // ---- Farming ----
  97: { id: 97, name: 'Farmland', color: [0.4, 0.28, 0.16],
    faceColors: { top: [0.34, 0.22, 0.12], bottom: [0.45, 0.32, 0.2], side: [0.45, 0.32, 0.2] },
    solid: true, transparent: false, breakable: true, hardness: 0.5, liquid: false },
  98: { id: 98, name: 'Wheat Crop', color: [0.42, 0.55, 0.26], solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false },
  99: { id: 99, name: 'Wheat Crop (ripe)', color: [0.82, 0.72, 0.32], solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false },
  100: { id: 100, name: 'Carrot Crop', color: [0.3, 0.5, 0.2], solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false },
  101: { id: 101, name: 'Carrot Crop (ripe)', color: [0.55, 0.6, 0.25], solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false },
  102: { id: 102, name: 'Potato Crop', color: [0.3, 0.5, 0.25], solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false },
  103: { id: 103, name: 'Potato Crop (ripe)', color: [0.45, 0.55, 0.28], solid: false, transparent: true, breakable: true, hardness: 0.1, liquid: false },

  // ---- Pistons / doors / ladders ----
  104: { id: 104, name: 'Piston', color: [0.58, 0.5, 0.36],
    faceColors: { top: [0.62, 0.52, 0.34], bottom: [0.5, 0.5, 0.52], side: [0.5, 0.5, 0.52] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  105: { id: 105, name: 'Piston Head', color: [0.6, 0.5, 0.32], solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  106: { id: 106, name: 'Sticky Piston', color: [0.5, 0.62, 0.4],
    faceColors: { top: [0.5, 0.66, 0.42], bottom: [0.5, 0.5, 0.52], side: [0.5, 0.5, 0.52] },
    solid: true, transparent: false, breakable: true, hardness: 1.0, liquid: false },
  107: { id: 107, name: 'Ladder', color: [0.5, 0.36, 0.2], solid: false, transparent: true, breakable: true, hardness: 0.4, liquid: false },
  108: { id: 108, name: 'Door', color: [0.55, 0.4, 0.24], solid: true, transparent: true, breakable: true, hardness: 1.0, liquid: false, opacity: 0.98 },
  109: { id: 109, name: 'Door (open)', color: [0.55, 0.4, 0.24], solid: false, transparent: true, breakable: true, hardness: 1.0, liquid: false }
};

/** Ordered list of placeable block ids (everything except AIR & non-placeable). */
export const PLACEABLE_BLOCKS = [
  1, 2, 3, 5, 11, 12, 18, 6, 7, 9, 10, 13, 15, 16, 17, 4,
  // Expansion blocks:
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
  53, 55, 56, 57, 59, // nether blocks (lava/portal not hand-placeable)
  60, 62,             // end blocks (portal not hand-placeable)
  63, 64, 65,         // utility blocks
  66, 67, 68, 69, 70, 71, 72, // brewing/copper/stone/light
  73, 74, 75, 76, 77,         // netherite + functional
  78, 79, 80, 82, 84,         // redstone (lamp-lit/lever-on/spawner are state-only)
  86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, // functional/wood/wither
  97,                                         // farmland (crops are placed via planting)
  104, 106, 107, 108                          // piston, sticky piston, ladder, door (head/open are state-only)
];

/** Crafting Table block id (referenced by the crafting proximity check). */
export const CRAFTING_TABLE_ID = 12;

/** Furnace block id (referenced by the smelting proximity check). */
export const FURNACE_ID = 18;

/** @param {number} id @returns {BlockDefinition | null} */
export function getBlock(id) {
  return BLOCKS[id] ?? null;
}

/** @param {number} id @returns {boolean} */
export function isAir(id) {
  return !id || id === AIR;
}

/** @param {number} id @returns {boolean} Whether the block stops the player. */
export function isSolid(id) {
  const b = BLOCKS[id];
  return !!b && b.solid;
}

/** @param {number} id @returns {boolean} */
export function isTransparent(id) {
  if (isAir(id)) return true;
  const b = BLOCKS[id];
  return !!b && b.transparent;
}

/** @param {number} id @returns {boolean} */
export function isLiquid(id) {
  const b = BLOCKS[id];
  return !!b && b.liquid;
}

/** @param {number} id @returns {boolean} */
export function isBreakable(id) {
  const b = BLOCKS[id];
  return !!b && b.breakable;
}

/**
 * Resolve the effective tint for a given face of a block.
 * @param {number} id
 * @param {'top'|'bottom'|'side'} face
 * @returns {number[]} RGB triplet 0..1
 */
export function getFaceColor(id, face) {
  const b = BLOCKS[id];
  if (!b) return [1, 0, 1];
  if (b.faceColors && b.faceColors[face]) return b.faceColors[face];
  return b.color;
}

export default BLOCKS;
