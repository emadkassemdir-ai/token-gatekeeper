/**
 * Potions
 * -------
 * Brewing + status-effect potions, modeled on the Minecraft wiki's brewing tree:
 * Nether Wart turns a Water Bottle into an Awkward Potion, then an effect
 * ingredient turns that into a real potion. A Fermented Spider Eye corrupts a
 * potion into its negative counterpart. Brewing needs Blaze Powder as fuel and a
 * placed Brewing Stand nearby. Drinking a potion grants its timed effect.
 */

/** Potion type -> the status effect it grants (instant or timed in seconds). */
export const POTION_FX = {
  potion_healing:         { instant: 'instant_health' },
  potion_harming:         { instant: 'instant_damage' },
  potion_regeneration:    { effect: 'regeneration', secs: 45 },
  potion_strength:        { effect: 'strength', secs: 180 },
  potion_swiftness:       { effect: 'speed', secs: 180 },
  potion_leaping:         { effect: 'jump_boost', secs: 180 },
  potion_fire_resistance: { effect: 'fire_resistance', secs: 180 },
  potion_water_breathing: { effect: 'water_breathing', secs: 180 },
  potion_night_vision:    { effect: 'night_vision', secs: 180 },
  potion_poison:          { effect: 'poison', secs: 45 },
  potion_weakness:        { effect: 'weakness', secs: 90 },
  potion_slowness:        { effect: 'slowness', secs: 90 }
};

/** Brewing recipes (inputs -> output), each needing Blaze Powder fuel + a stand. */
export const BREW_RECIPES = [
  { id: 'awkward', output: 'awkward_potion', inputs: [{ type: 'water_bottle', count: 1 }, { type: 'nether_wart', count: 1 }] },
  { id: 'healing', output: 'potion_healing', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'melon_slice', count: 1 }] },
  { id: 'regen', output: 'potion_regeneration', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'ghast_tear', count: 1 }] },
  { id: 'strength', output: 'potion_strength', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'blaze_powder', count: 1 }] },
  { id: 'swiftness', output: 'potion_swiftness', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'sugar', count: 1 }] },
  { id: 'leaping', output: 'potion_leaping', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'rabbit_foot', count: 1 }] },
  { id: 'fireres', output: 'potion_fire_resistance', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'magma_cream', count: 1 }] },
  { id: 'breathing', output: 'potion_water_breathing', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'pufferfish', count: 1 }] },
  { id: 'nightvis', output: 'potion_night_vision', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'golden_carrot', count: 1 }] },
  { id: 'poison', output: 'potion_poison', inputs: [{ type: 'awkward_potion', count: 1 }, { type: 'spider_eye', count: 1 }] },
  { id: 'weakness', output: 'potion_weakness', inputs: [{ type: 'water_bottle', count: 1 }, { type: 'fermented_spider_eye', count: 1 }] },
  { id: 'harming', output: 'potion_harming', inputs: [{ type: 'potion_healing', count: 1 }, { type: 'fermented_spider_eye', count: 1 }] },
  { id: 'slowness', output: 'potion_slowness', inputs: [{ type: 'potion_swiftness', count: 1 }, { type: 'fermented_spider_eye', count: 1 }] }
];

export const BREW_FUEL = 'blaze_powder';

/** @param {string|null} type */
export function isPotion(type) {
  return type === 'water_bottle' || type === 'awkward_potion' || !!POTION_FX[type];
}

/** Drink a potion: apply its effect. @returns {boolean} consumed */
export function drinkPotion(stats, type) {
  const fx = POTION_FX[type];
  if (!fx) return type === 'water_bottle'; // water bottle just empties
  if (fx.instant) stats.applyEffect(fx.instant, 0);
  else stats.applyEffect(fx.effect, fx.secs);
  return true;
}

export function canBrew(recipe, inventory, nearStand) {
  if (!nearStand) return { ok: false, reason: 'Needs a brewing stand' };
  if (inventory.isCreative) return { ok: true };
  for (const i of recipe.inputs) if (inventory.count(i.type) < i.count) return { ok: false, reason: 'Missing ingredient' };
  if (inventory.count(BREW_FUEL) < 1) return { ok: false, reason: 'Needs blaze powder' };
  return { ok: true };
}

export function brew(recipe, inventory, nearStand) {
  const check = canBrew(recipe, inventory, nearStand);
  if (!check.ok) return check;
  if (!inventory.isCreative) {
    for (const i of recipe.inputs) inventory.remove(i.type, i.count);
    inventory.remove(BREW_FUEL, 1);
  }
  inventory.add(recipe.output, 1);
  return { ok: true };
}
