/**
 * Crafting
 * --------
 * Shapeless recipe list (ingredients -> output) plus the logic to test and
 * perform a craft against an Inventory. A recipe list (rather than a shaped
 * grid) keeps the UI simple and side-steps the fact that, per the design spec,
 * the pickaxe and axe share the same ingredients.
 *
 * Tool recipes require standing near a placed Crafting Table; basic recipes
 * (planks, sticks, the table itself) can be crafted anywhere.
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {string} output         Item type produced.
 * @property {number} outputCount
 * @property {Array<{type:string,count:number}>} inputs
 * @property {boolean} requiresTable
 */

/** @type {Recipe[]} */
export const RECIPES = [
  {
    id: 'planks',
    output: 'oak_planks', outputCount: 4,
    inputs: [{ type: 'oak_log', count: 1 }],
    requiresTable: false
  },
  {
    id: 'sticks',
    output: 'stick', outputCount: 4,
    inputs: [{ type: 'oak_planks', count: 1 }],
    requiresTable: false
  },
  {
    id: 'crafting_table',
    output: 'crafting_table', outputCount: 1,
    inputs: [{ type: 'oak_planks', count: 4 }],
    requiresTable: false
  },
  {
    id: 'wooden_pickaxe',
    output: 'wooden_pickaxe', outputCount: 1,
    inputs: [{ type: 'oak_planks', count: 3 }, { type: 'stick', count: 2 }],
    requiresTable: true
  },
  {
    id: 'wooden_axe',
    output: 'wooden_axe', outputCount: 1,
    inputs: [{ type: 'oak_planks', count: 3 }, { type: 'stick', count: 2 }],
    requiresTable: true
  },
  {
    id: 'wooden_sword',
    output: 'wooden_sword', outputCount: 1,
    inputs: [{ type: 'oak_planks', count: 1 }, { type: 'stick', count: 2 }],
    requiresTable: true
  }
];

/**
 * Does the inventory hold every ingredient for this recipe?
 * @param {Recipe} recipe
 * @param {import('./Inventory.js').Inventory} inventory
 * @returns {boolean}
 */
export function hasIngredients(recipe, inventory) {
  if (inventory.isCreative) return true;
  return recipe.inputs.every((inp) => inventory.count(inp.type) >= inp.count);
}

/**
 * Whether a recipe can currently be crafted (ingredients + table proximity).
 * @param {Recipe} recipe
 * @param {import('./Inventory.js').Inventory} inventory
 * @param {boolean} nearTable
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canCraft(recipe, inventory, nearTable) {
  if (recipe.requiresTable && !nearTable) {
    return { ok: false, reason: 'Needs a crafting table nearby' };
  }
  if (!hasIngredients(recipe, inventory)) {
    return { ok: false, reason: 'Missing materials' };
  }
  return { ok: true };
}

/**
 * Perform the craft: consume inputs, add the output.
 * @param {Recipe} recipe
 * @param {import('./Inventory.js').Inventory} inventory
 * @param {boolean} nearTable
 * @returns {{ ok: boolean, reason?: string }}
 */
export function craft(recipe, inventory, nearTable) {
  const check = canCraft(recipe, inventory, nearTable);
  if (!check.ok) return check;

  if (!inventory.isCreative) {
    for (const inp of recipe.inputs) inventory.remove(inp.type, inp.count);
  }
  inventory.add(recipe.output, recipe.outputCount);
  return { ok: true };
}
