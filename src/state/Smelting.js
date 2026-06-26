/**
 * Smelting
 * --------
 * Furnace recipes: each turns one input item into one output, consuming one
 * Coal as fuel, and requires standing near a placed Furnace. Mirrors the
 * Crafting module's shape so the UI can reuse the same list pattern.
 */

/**
 * @typedef {Object} SmeltRecipe
 * @property {string} id
 * @property {string} input
 * @property {string} output
 */

/** @type {SmeltRecipe[]} */
export const SMELT_RECIPES = [
  { id: 'iron', input: 'iron_ore', output: 'iron_ingot' },
  { id: 'gold', input: 'gold_ore', output: 'gold_ingot' },
  { id: 'glass', input: 'sand', output: 'glass' },
  { id: 'steak', input: 'raw_beef', output: 'steak' },
  { id: 'mutton', input: 'raw_mutton', output: 'cooked_mutton' },
  { id: 'salmon', input: 'raw_salmon', output: 'cooked_salmon' },
  // Expansion smelting:
  { id: 'stone', input: 'cobblestone', output: 'stone' },
  { id: 'brick', input: 'clay_ball', output: 'brick' },
  { id: 'charcoal', input: 'oak_log', output: 'charcoal' },
  { id: 'porkchop', input: 'raw_porkchop', output: 'cooked_porkchop' }
];

export const FUEL = 'coal';

/**
 * Whether a recipe can be smelted right now (input + fuel + near a furnace).
 * @param {SmeltRecipe} recipe
 * @param {import('./Inventory.js').Inventory} inventory
 * @param {boolean} nearFurnace
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canSmelt(recipe, inventory, nearFurnace) {
  if (!nearFurnace) return { ok: false, reason: 'Needs a furnace nearby' };
  if (inventory.isCreative) return { ok: true };
  if (inventory.count(recipe.input) < 1) return { ok: false, reason: 'No input item' };
  if (inventory.count(FUEL) < 1) return { ok: false, reason: 'Needs coal fuel' };
  return { ok: true };
}

/**
 * Smelt one item: consume input + one coal, produce the output.
 * @param {SmeltRecipe} recipe
 * @param {import('./Inventory.js').Inventory} inventory
 * @param {boolean} nearFurnace
 * @returns {{ ok: boolean, reason?: string }}
 */
export function smelt(recipe, inventory, nearFurnace) {
  const check = canSmelt(recipe, inventory, nearFurnace);
  if (!check.ok) return check;
  if (!inventory.isCreative) {
    inventory.remove(recipe.input, 1);
    inventory.remove(FUEL, 1);
  }
  inventory.add(recipe.output, 1);
  return { ok: true };
}
