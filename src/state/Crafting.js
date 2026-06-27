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
  { id: 'acacia_planks', output: 'acacia_planks', outputCount: 4, inputs: [{ type: 'acacia_log', count: 1 }], requiresTable: false },
  { id: 'cherry_planks', output: 'cherry_planks', outputCount: 4, inputs: [{ type: 'cherry_log', count: 1 }], requiresTable: false },
  { id: 'blast_furnace', output: 'blast_furnace', outputCount: 1, inputs: [{ type: 'furnace', count: 1 }, { type: 'iron_ingot', count: 5 }, { type: 'smooth_stone', count: 3 }], requiresTable: true },
  { id: 'smoker', output: 'smoker', outputCount: 1, inputs: [{ type: 'furnace', count: 1 }, { type: 'oak_log', count: 4 }], requiresTable: true },
  { id: 'grindstone', output: 'grindstone', outputCount: 1, inputs: [{ type: 'stick', count: 2 }, { type: 'smooth_stone', count: 1 }, { type: 'oak_planks', count: 2 }], requiresTable: true },
  { id: 'beacon', output: 'beacon', outputCount: 1, inputs: [{ type: 'nether_star', count: 1 }, { type: 'glass', count: 5 }, { type: 'obsidian', count: 3 }], requiresTable: true },
  { id: 'paper', output: 'paper', outputCount: 1, inputs: [{ type: 'wheat', count: 3 }], requiresTable: true },
  { id: 'book', output: 'book', outputCount: 1, inputs: [{ type: 'paper', count: 3 }, { type: 'leather', count: 1 }], requiresTable: true },
  { id: 'bookshelf', output: 'bookshelf', outputCount: 1, inputs: [{ type: 'oak_planks', count: 6 }, { type: 'book', count: 3 }], requiresTable: true },
  { id: 'bread', output: 'bread', outputCount: 1, inputs: [{ type: 'wheat', count: 3 }], requiresTable: true },

  // ---- Farming + buckets ----
  { id: 'bucket', output: 'bucket', outputCount: 1, inputs: [{ type: 'iron_ingot', count: 3 }], requiresTable: true },
  { id: 'wooden_hoe', output: 'wooden_hoe', outputCount: 1, inputs: [{ type: 'oak_planks', count: 2 }, { type: 'stick', count: 2 }], requiresTable: true },
  { id: 'stone_hoe', output: 'stone_hoe', outputCount: 1, inputs: [{ type: 'stone', count: 2 }, { type: 'stick', count: 2 }], requiresTable: true },
  { id: 'iron_hoe', output: 'iron_hoe', outputCount: 1, inputs: [{ type: 'iron_ingot', count: 2 }, { type: 'stick', count: 2 }], requiresTable: true },
  { id: 'diamond_hoe', output: 'diamond_hoe', outputCount: 1, inputs: [{ type: 'diamond', count: 2 }, { type: 'stick', count: 2 }], requiresTable: true },

  // ---- Uses for new items + Nether ----
  { id: 'flint_and_steel', output: 'flint_and_steel', outputCount: 1, inputs: [{ type: 'flint', count: 1 }, { type: 'iron_ingot', count: 1 }], requiresTable: true },
  { id: 'bow', output: 'bow', outputCount: 1, inputs: [{ type: 'stick', count: 3 }, { type: 'string', count: 3 }], requiresTable: true },
  { id: 'arrow', output: 'arrow', outputCount: 4, inputs: [{ type: 'flint', count: 1 }, { type: 'stick', count: 1 }, { type: 'feather', count: 1 }], requiresTable: true },
  { id: 'crossbow', output: 'crossbow', outputCount: 1, inputs: [{ type: 'stick', count: 3 }, { type: 'string', count: 2 }, { type: 'iron_ingot', count: 1 }], requiresTable: true },
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

  // ---- Utility blocks ----
  { id: 'chest', output: 'chest', outputCount: 1, inputs: [{ type: 'oak_planks', count: 8 }], requiresTable: true },
  { id: 'bed', output: 'bed', outputCount: 1, inputs: [{ type: 'white_wool', count: 3 }, { type: 'oak_planks', count: 3 }], requiresTable: true },
  { id: 'enchanting_table', output: 'enchanting_table', outputCount: 1, inputs: [{ type: 'obsidian', count: 4 }, { type: 'diamond', count: 2 }, { type: 'book', count: 1 }], requiresTable: true },

  // ---- Brewing + potions support ----
  { id: 'glass_bottle', output: 'glass_bottle', outputCount: 3, inputs: [{ type: 'glass', count: 3 }], requiresTable: true },
  { id: 'water_bottle', output: 'water_bottle', outputCount: 1, inputs: [{ type: 'glass_bottle', count: 1 }], requiresTable: false },
  { id: 'sugar', output: 'sugar', outputCount: 1, inputs: [{ type: 'wheat', count: 1 }], requiresTable: false },
  { id: 'fermented_spider_eye', output: 'fermented_spider_eye', outputCount: 1, inputs: [{ type: 'spider_eye', count: 1 }, { type: 'sugar', count: 1 }], requiresTable: true },
  { id: 'magma_cream', output: 'magma_cream', outputCount: 1, inputs: [{ type: 'blaze_powder', count: 1 }, { type: 'slimeball', count: 1 }], requiresTable: true },
  { id: 'brewing_stand', output: 'brewing_stand', outputCount: 1, inputs: [{ type: 'blaze_rod', count: 1 }, { type: 'cobblestone', count: 3 }], requiresTable: true },
  { id: 'golden_apple', output: 'golden_apple', outputCount: 1, inputs: [{ type: 'apple', count: 1 }, { type: 'gold_ingot', count: 8 }], requiresTable: true },
  { id: 'enchanted_golden_apple', output: 'enchanted_golden_apple', outputCount: 1, inputs: [{ type: 'apple', count: 1 }, { type: 'gold_block', count: 8 }], requiresTable: true },
  { id: 'golden_carrot', output: 'golden_carrot', outputCount: 1, inputs: [{ type: 'wheat', count: 1 }, { type: 'gold_ingot', count: 2 }], requiresTable: true },
  { id: 'copper_block', output: 'copper_block', outputCount: 1, inputs: [{ type: 'copper_ingot', count: 9 }], requiresTable: true },

  // ---- Netherite + functional blocks ----
  { id: 'netherite_ingot', output: 'netherite_ingot', outputCount: 1, inputs: [{ type: 'netherite_scrap', count: 4 }, { type: 'gold_ingot', count: 4 }], requiresTable: true },
  { id: 'netherite_block', output: 'netherite_block', outputCount: 1, inputs: [{ type: 'netherite_ingot', count: 9 }], requiresTable: true },
  { id: 'smithing_table', output: 'smithing_table', outputCount: 1, inputs: [{ type: 'oak_planks', count: 4 }, { type: 'iron_ingot', count: 2 }], requiresTable: true },
  { id: 'barrel', output: 'barrel', outputCount: 1, inputs: [{ type: 'oak_planks', count: 6 }, { type: 'oak_log', count: 2 }], requiresTable: true },
  { id: 'ender_chest', output: 'ender_chest', outputCount: 1, inputs: [{ type: 'obsidian', count: 8 }, { type: 'eye_of_ender', count: 1 }], requiresTable: true },

  // ---- The End ----
  { id: 'blaze_powder', output: 'blaze_powder', outputCount: 2, inputs: [{ type: 'blaze_rod', count: 1 }], requiresTable: false },
  { id: 'eye_of_ender', output: 'eye_of_ender', outputCount: 1, inputs: [{ type: 'ender_pearl', count: 1 }, { type: 'blaze_powder', count: 1 }], requiresTable: false },

  // ---- Pistons / doors / ladders (redstone mechanisms) ----
  { id: 'piston', output: 'piston', outputCount: 1, inputs: [{ type: 'oak_planks', count: 3 }, { type: 'cobblestone', count: 4 }, { type: 'iron_ingot', count: 1 }, { type: 'redstone', count: 1 }], requiresTable: true },
  { id: 'sticky_piston', output: 'sticky_piston', outputCount: 1, inputs: [{ type: 'piston', count: 1 }, { type: 'slimeball', count: 1 }], requiresTable: true },
  { id: 'ladder', output: 'ladder', outputCount: 3, inputs: [{ type: 'stick', count: 7 }], requiresTable: true },
  { id: 'door', output: 'door', outputCount: 3, inputs: [{ type: 'oak_planks', count: 6 }], requiresTable: true },

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
