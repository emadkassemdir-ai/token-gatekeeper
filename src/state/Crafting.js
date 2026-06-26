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
  },
  {
    id: 'furnace',
    output: 'furnace', outputCount: 1,
    inputs: [{ type: 'stone', count: 8 }],
    requiresTable: true
  },
  {
    id: 'shield',
    output: 'shield', outputCount: 1,
    inputs: [{ type: 'oak_planks', count: 6 }, { type: 'iron_ingot', count: 1 }],
    requiresTable: true
  },
  {
    id: 'totem',
    output: 'totem', outputCount: 1,
    inputs: [{ type: 'gold_ingot', count: 8 }, { type: 'diamond', count: 1 }],
    requiresTable: true
  },
  // ---- Expansion recipes ----
  { id: 'stone_bricks', output: 'stone_bricks', outputCount: 4, inputs: [{ type: 'stone', count: 4 }], requiresTable: true },
  { id: 'sandstone', output: 'sandstone', outputCount: 1, inputs: [{ type: 'sand', count: 4 }], requiresTable: true },
  { id: 'bricks', output: 'bricks', outputCount: 1, inputs: [{ type: 'brick', count: 4 }], requiresTable: true },
  { id: 'iron_block', output: 'iron_block', outputCount: 1, inputs: [{ type: 'iron_ingot', count: 9 }], requiresTable: true },
  { id: 'gold_block', output: 'gold_block', outputCount: 1, inputs: [{ type: 'gold_ingot', count: 9 }], requiresTable: true },
  { id: 'diamond_block', output: 'diamond_block', outputCount: 1, inputs: [{ type: 'diamond', count: 9 }], requiresTable: true },
  { id: 'lapis_block', output: 'lapis_block', outputCount: 1, inputs: [{ type: 'lapis', count: 9 }], requiresTable: true },
  { id: 'emerald_block', output: 'emerald_block', outputCount: 1, inputs: [{ type: 'emerald', count: 9 }], requiresTable: true },
  { id: 'coal_block', output: 'coal_block', outputCount: 1, inputs: [{ type: 'coal', count: 9 }], requiresTable: true },
  { id: 'white_wool', output: 'white_wool', outputCount: 1, inputs: [{ type: 'string', count: 4 }], requiresTable: true },
  { id: 'birch_planks', output: 'oak_planks', outputCount: 4, inputs: [{ type: 'birch_log', count: 1 }], requiresTable: false },
  { id: 'spruce_planks', output: 'oak_planks', outputCount: 4, inputs: [{ type: 'spruce_log', count: 1 }], requiresTable: false },
  { id: 'paper', output: 'paper', outputCount: 1, inputs: [{ type: 'wheat', count: 3 }], requiresTable: true },
  { id: 'book', output: 'book', outputCount: 1, inputs: [{ type: 'paper', count: 3 }, { type: 'leather', count: 1 }], requiresTable: true },
  { id: 'bookshelf', output: 'bookshelf', outputCount: 1, inputs: [{ type: 'oak_planks', count: 6 }, { type: 'book', count: 3 }], requiresTable: true },
  { id: 'bread', output: 'bread', outputCount: 1, inputs: [{ type: 'wheat', count: 3 }], requiresTable: true },

  // ---- Uses for new items + Nether ----
  { id: 'flint_and_steel', output: 'flint_and_steel', outputCount: 1, inputs: [{ type: 'flint', count: 1 }, { type: 'iron_ingot', count: 1 }], requiresTable: true },
  { id: 'bow', output: 'bow', outputCount: 1, inputs: [{ type: 'stick', count: 3 }, { type: 'string', count: 3 }], requiresTable: true },
  { id: 'arrow', output: 'arrow', outputCount: 4, inputs: [{ type: 'flint', count: 1 }, { type: 'stick', count: 1 }, { type: 'feather', count: 1 }], requiresTable: true },
  { id: 'tnt', output: 'tnt', outputCount: 1, inputs: [{ type: 'gunpowder', count: 5 }, { type: 'sand', count: 4 }], requiresTable: true },
  { id: 'bonemeal', output: 'bonemeal', outputCount: 3, inputs: [{ type: 'bone', count: 1 }], requiresTable: false },
  { id: 'blue_wool', output: 'blue_wool', outputCount: 1, inputs: [{ type: 'white_wool', count: 1 }, { type: 'lapis', count: 1 }], requiresTable: true },
  { id: 'green_wool', output: 'green_wool', outputCount: 1, inputs: [{ type: 'white_wool', count: 1 }, { type: 'green_dye', count: 1 }], requiresTable: true },
  { id: 'red_wool', output: 'red_wool', outputCount: 1, inputs: [{ type: 'white_wool', count: 1 }, { type: 'redstone', count: 1 }], requiresTable: true },
  { id: 'nether_bricks', output: 'nether_bricks', outputCount: 1, inputs: [{ type: 'nether_brick', count: 4 }], requiresTable: true },
  { id: 'leather_helmet', output: 'leather_helmet', outputCount: 1, inputs: [{ type: 'leather', count: 5 }], requiresTable: true },
  { id: 'leather_chestplate', output: 'leather_chestplate', outputCount: 1, inputs: [{ type: 'leather', count: 8 }], requiresTable: true },
  { id: 'leather_leggings', output: 'leather_leggings', outputCount: 1, inputs: [{ type: 'leather', count: 7 }], requiresTable: true },
  { id: 'leather_boots', output: 'leather_boots', outputCount: 1, inputs: [{ type: 'leather', count: 4 }], requiresTable: true },

  // Tiered tools (stone/iron/gold/diamond) generated below.
  ...buildTierTools(),
  // Armor (iron/gold/diamond) generated below.
  ...buildArmor()
];

/**
 * Build helmet/chestplate/leggings/boots recipes for each armor material.
 * @returns {Recipe[]}
 */
function buildArmor() {
  const mats = [
    { tier: 'iron', mat: 'iron_ingot' },
    { tier: 'gold', mat: 'gold_ingot' },
    { tier: 'diamond', mat: 'diamond' }
  ];
  const pieces = [
    { slot: 'helmet', count: 5 },
    { slot: 'chestplate', count: 8 },
    { slot: 'leggings', count: 7 },
    { slot: 'boots', count: 4 }
  ];
  const out = [];
  for (const { tier, mat } of mats) {
    for (const { slot, count } of pieces) {
      out.push({
        id: `${tier}_${slot}`, output: `${tier}_${slot}`, outputCount: 1,
        inputs: [{ type: mat, count }], requiresTable: true
      });
    }
  }
  return out;
}

/**
 * Build pickaxe/axe/sword recipes for every non-wood tier. Same shapes as the
 * wooden tools (3 material + 2 sticks for pick/axe, 1 + 2 for sword), just a
 * different material per tier — exactly as specified.
 * @returns {Recipe[]}
 */
function buildTierTools() {
  const tiers = [
    { tier: 'stone', mat: 'stone' },
    { tier: 'iron', mat: 'iron_ingot' },
    { tier: 'gold', mat: 'gold_ingot' },
    { tier: 'diamond', mat: 'diamond' }
  ];
  const out = [];
  for (const { tier, mat } of tiers) {
    out.push({
      id: `${tier}_pickaxe`, output: `${tier}_pickaxe`, outputCount: 1,
      inputs: [{ type: mat, count: 3 }, { type: 'stick', count: 2 }], requiresTable: true
    });
    out.push({
      id: `${tier}_axe`, output: `${tier}_axe`, outputCount: 1,
      inputs: [{ type: mat, count: 3 }, { type: 'stick', count: 2 }], requiresTable: true
    });
    out.push({
      id: `${tier}_sword`, output: `${tier}_sword`, outputCount: 1,
      inputs: [{ type: mat, count: 1 }, { type: 'stick', count: 2 }], requiresTable: true
    });
  }
  return out;
}

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
