/**
 * BlockTypes
 * ----------
 * Authoritative registry of every voxel the engine understands. Each block
 * declares its rendering colour (per-face tinting), physical behaviour, and
 * gameplay metadata (break time, transparency, whether it can be broken).
 *
 * Ids are stable integers — id 0 is reserved for AIR and must stay 0 because
 * the chunk voxel store uses a zero-filled typed array as "empty".
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
    color: [0.36, 0.62, 0.26],
    faceColors: {
      top: [0.36, 0.68, 0.28],
      bottom: [0.45, 0.32, 0.2],
      side: [0.4, 0.5, 0.25]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 0.6,
    liquid: false
  },
  2: {
    id: 2,
    name: 'Dirt',
    color: [0.45, 0.32, 0.2],
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 0.5,
    liquid: false
  },
  3: {
    id: 3,
    name: 'Stone',
    color: [0.5, 0.5, 0.52],
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.5,
    liquid: false
  },
  4: {
    id: 4,
    name: 'Bedrock',
    color: [0.18, 0.18, 0.2],
    solid: true,
    transparent: false,
    breakable: false, // Unbreakable — break attempts always return false.
    hardness: Infinity,
    liquid: false
  },
  5: {
    id: 5,
    name: 'Oak Wood',
    color: [0.42, 0.3, 0.16],
    faceColors: {
      top: [0.55, 0.42, 0.24],
      bottom: [0.55, 0.42, 0.24],
      side: [0.4, 0.28, 0.15]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.0,
    liquid: false
  },
  6: {
    id: 6,
    name: 'Oak Leaves',
    color: [0.22, 0.45, 0.18],
    solid: true,
    transparent: true, // Cutout foliage — neighbours stay visible.
    breakable: true,
    hardness: 0.2,
    liquid: false,
    opacity: 0.9
  },
  7: {
    id: 7,
    name: 'Sand',
    color: [0.83, 0.77, 0.55],
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 0.5,
    liquid: false
  },
  8: {
    id: 8,
    name: 'Water',
    color: [0.2, 0.4, 0.85],
    solid: false, // Non-solid — player swims through it.
    transparent: true,
    breakable: false,
    hardness: Infinity,
    liquid: true,
    animated: true,
    opacity: 0.62
  },
  9: {
    id: 9,
    name: 'Glass',
    color: [0.7, 0.85, 0.92],
    solid: true,
    transparent: true,
    breakable: true,
    hardness: 0.3,
    liquid: false,
    opacity: 0.4
  },
  10: {
    id: 10,
    name: 'Iron Ore',
    color: [0.55, 0.5, 0.46],
    faceColors: {
      top: [0.6, 0.52, 0.45],
      bottom: [0.6, 0.52, 0.45],
      side: [0.58, 0.5, 0.44]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 2.5,
    liquid: false
  },
  11: {
    id: 11,
    name: 'Oak Planks',
    color: [0.62, 0.46, 0.27],
    faceColors: {
      top: [0.66, 0.5, 0.3],
      bottom: [0.66, 0.5, 0.3],
      side: [0.6, 0.44, 0.26]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.0,
    liquid: false
  },
  12: {
    id: 12,
    name: 'Crafting Table',
    color: [0.5, 0.36, 0.2],
    faceColors: {
      top: [0.45, 0.32, 0.18],
      bottom: [0.55, 0.42, 0.25],
      side: [0.5, 0.36, 0.2]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.2,
    liquid: false
  },
  13: {
    id: 13,
    name: 'Snow',
    color: [0.92, 0.95, 0.98],
    faceColors: { top: [0.96, 0.98, 1.0], bottom: [0.8, 0.85, 0.9], side: [0.9, 0.93, 0.97] },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 0.5,
    liquid: false
  },
  14: {
    id: 14,
    name: 'Jungle Leaves',
    color: [0.13, 0.42, 0.1],
    solid: true,
    transparent: true,
    breakable: true,
    hardness: 0.2,
    liquid: false,
    opacity: 0.92
  },
  15: {
    id: 15,
    name: 'Coal Ore',
    color: [0.32, 0.32, 0.34],
    faceColors: { top: [0.3, 0.3, 0.32], bottom: [0.3, 0.3, 0.32], side: [0.33, 0.33, 0.35] },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.8,
    liquid: false
  },
  16: {
    id: 16,
    name: 'Gold Ore',
    color: [0.62, 0.55, 0.3],
    faceColors: { top: [0.66, 0.58, 0.32], bottom: [0.6, 0.53, 0.29], side: [0.62, 0.55, 0.3] },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 2.5,
    liquid: false
  },
  17: {
    id: 17,
    name: 'Diamond Ore',
    color: [0.45, 0.72, 0.76],
    faceColors: { top: [0.5, 0.78, 0.82], bottom: [0.42, 0.68, 0.72], side: [0.45, 0.72, 0.76] },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 3.0,
    liquid: false
  }
};

/** Ordered list of placeable block ids (everything except AIR & non-placeable). */
export const PLACEABLE_BLOCKS = [1, 2, 3, 5, 11, 12, 6, 7, 9, 10, 13, 15, 16, 17, 4];

/** Crafting Table block id (referenced by the crafting proximity check). */
export const CRAFTING_TABLE_ID = 12;

/**
 * @param {number} id
 * @returns {BlockDefinition | null}
 */
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
