/**
 * ItemTextures
 * ------------
 * Procedurally drawn pixel-art icons for inventory items (blocks, tools, armor,
 * food, materials) — replacing the emoji glyphs. Each icon is rendered once to a
 * 16×16 canvas and cached as a data URL. No external/copyrighted art.
 *
 * Falls back to the item's emoji glyph when no canvas is available (headless).
 */

import { BLOCKS, getFaceColor } from './BlockTypes.js';
import { ITEMS, placeBlockId } from './ItemTypes.js';

const S = 16;
const cache = new Map();

/** Inject shared CSS for .item-icon once. */
function ensureIconStyles() {
  if (typeof document === 'undefined' || document.getElementById('item-icon-styles')) return;
  const style = document.createElement('style');
  style.id = 'item-icon-styles';
  style.textContent = `
    .item-icon { display: inline-block; background-size: 100% 100%; background-repeat: no-repeat;
      image-rendering: pixelated; image-rendering: crisp-edges; vertical-align: middle; }
    .item-icon.glyph { display: inline-flex; align-items: center; justify-content: center; }
  `;
  document.head.appendChild(style);
}

function pnoise(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Tier → metal/material colour for tools & armor. */
function tierColor(tier) {
  return {
    wood: [0.55, 0.42, 0.22], wooden: [0.55, 0.42, 0.22],
    stone: [0.5, 0.5, 0.52], iron: [0.82, 0.82, 0.85],
    gold: [0.95, 0.8, 0.2], diamond: [0.4, 0.85, 0.9],
    leather: [0.62, 0.42, 0.26], netherite: [0.28, 0.24, 0.26]
  }[tier] || [0.7, 0.7, 0.72];
}

function makeCtx() {
  if (typeof document === 'undefined') return null;
  let c, ctx;
  try { c = document.createElement('canvas'); ctx = c.getContext && c.getContext('2d'); } catch { return null; }
  if (!ctx) return null;
  c.width = S; c.height = S;
  return { c, ctx };
}

function px(ctx, x, y, col, a = 1) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const r = Math.max(0, Math.min(255, col[0] * 255)) | 0;
  const g = Math.max(0, Math.min(255, col[1] * 255)) | 0;
  const b = Math.max(0, Math.min(255, col[2] * 255)) | 0;
  ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
  ctx.fillRect(x, y, 1, 1);
}
const mul = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

/* ------------------------------- drawers -------------------------------- */

function drawBlock(ctx, blockId) {
  const def = BLOCKS[blockId];
  const top = getFaceColor(blockId, 'top');
  const isOre = [10, 15, 16, 17, 40, 41, 42, 68, 73].includes(blockId);
  const accent = { 10: [0.82, 0.7, 0.55], 15: [0.12, 0.12, 0.13], 16: [0.95, 0.8, 0.2], 17: [0.5, 0.9, 0.95],
    40: [0.16, 0.3, 0.85], 41: [0.85, 0.12, 0.12], 42: [0.15, 0.85, 0.45], 68: [0.85, 0.5, 0.3], 73: [0.55, 0.42, 0.3] }[blockId];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = pnoise(x, y);
      let c = mul(top, 0.85 + n * 0.3);
      if (isOre) {
        c = mul([0.52, 0.52, 0.55], 0.9 + n * 0.2);
        if (pnoise(x * 1.7 + 3, y * 1.7 + 5) > 0.84) c = mul(accent, 0.9);
      }
      // faux-3D: darken bottom & right edges, lighten top edge.
      if (x === S - 1 || y === S - 1) c = mul(c, 0.7);
      if (y === 0) c = mul(c, 1.12);
      px(ctx, x, y, c);
    }
  }
  if (def && def.transparent) { /* leave as-is; HUD applies opacity */ }
}

function drawHandle(ctx) {
  const brown = [0.5, 0.36, 0.2];
  for (let i = 0; i < 9; i++) { px(ctx, 5 + i - 4 + 4, 14 - i, brown); px(ctx, 6 + i - 4 + 4, 14 - i, mul(brown, 0.8)); }
}

function drawTool(ctx, toolClass, tier) {
  const col = tierColor(tier);
  // Diagonal wooden handle bottom-left -> center.
  const brown = [0.5, 0.36, 0.2];
  for (let i = 0; i < 8; i++) { px(ctx, 5 + i, 13 - i, brown); px(ctx, 6 + i, 13 - i, mul(brown, 0.75)); }
  if (toolClass === 'pickaxe') {
    for (let x = 3; x <= 12; x++) { const y = 4 + Math.abs(x - 7) * 0.5 | 0; px(ctx, x, y, col); px(ctx, x, y + 1, mul(col, 0.8)); }
  } else if (toolClass === 'axe') {
    for (let y = 2; y <= 7; y++) for (let x = 9; x <= 13; x++) if (x - 9 <= 7 - y + 3) px(ctx, x, y, mul(col, y % 2 ? 1 : 0.85));
  } else { // sword
    for (let y = 2; y <= 10; y++) { px(ctx, 9, y, col); px(ctx, 10, y, mul(col, 0.85)); }
    for (let x = 7; x <= 12; x++) px(ctx, x, 11, [0.45, 0.32, 0.2]); // guard
  }
}

function drawArmor(ctx, slot, tier) {
  const col = tierColor(tier);
  const fill = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(ctx, x, y, mul(col, (x + y) % 2 ? 1 : 0.85)); };
  if (slot === 'head') { fill(4, 11, 3, 5); fill(4, 11, 6, 8); for (let x = 6; x <= 9; x++) px(ctx, x, 8, [0.1, 0.1, 0.12]); }
  else if (slot === 'chest') { fill(3, 12, 4, 5); fill(4, 11, 6, 12); }
  else if (slot === 'legs') { fill(4, 11, 3, 6); fill(4, 6, 7, 13); fill(9, 11, 7, 13); }
  else { fill(3, 6, 9, 13); fill(9, 12, 9, 13); }
}

function drawMaterial(ctx, type) {
  if (type === 'stick') {
    const brown = [0.5, 0.36, 0.2];
    for (let i = 0; i < 11; i++) { px(ctx, 5 + i, 13 - i, brown); px(ctx, 6 + i, 13 - i, mul(brown, 0.75)); }
  } else if (type === 'coal') {
    for (let y = 4; y <= 12; y++) for (let x = 3; x <= 12; x++) { const n = pnoise(x, y); px(ctx, x, y, n > 0.7 ? [0.05, 0.05, 0.06] : mul([0.18, 0.18, 0.2], 0.8 + n * 0.4)); }
  } else if (type === 'diamond') {
    const cy = [0.4, 0.85, 0.95];
    for (let y = 2; y <= 13; y++) { const w = 7 - Math.abs(y - 7); for (let x = 8 - w; x <= 7 + w; x++) px(ctx, x, y, mul(cy, 0.8 + ((x + y) % 2) * 0.3)); }
  } else if (type === 'iron_ingot' || type === 'gold_ingot') {
    const col = type === 'gold_ingot' ? [0.95, 0.8, 0.2] : [0.82, 0.82, 0.85];
    for (let y = 6; y <= 11; y++) for (let x = 3 + (y - 6); x <= 13 - (y - 6); x++) px(ctx, x, y, mul(col, y === 6 ? 1.15 : 0.85 + (x % 2) * 0.2));
  } else if (type === 'lapis' || type === 'emerald' || type === 'redstone' || type === 'flint' || type === 'gunpowder') {
    // Small gem/dust pile.
    const col = MAT_COLORS[type];
    for (let y = 4; y <= 13; y++) for (let x = 3; x <= 12; x++) { const dx = x - 7.5, dy = y - 9; if (dx * dx + dy * dy < 24) px(ctx, x, y, mul(col, 0.8 + pnoise(x, y) * 0.4)); }
  } else if (type === 'stick' || type === 'bone' || type === 'feather') {
    // (stick handled above) bone/feather: a thin vertical shape.
    const col = MAT_COLORS[type] || [0.5, 0.36, 0.2];
    for (let y = 2; y <= 13; y++) px(ctx, 7, y, col), px(ctx, 8, y, mul(col, 0.85));
    if (type === 'bone') { for (const yy of [2, 13]) { px(ctx, 6, yy, col); px(ctx, 9, yy, col); } }
  } else if (type === 'flint_and_steel') {
    const steel = [0.78, 0.78, 0.82], flint = [0.25, 0.25, 0.28];
    for (let y = 4; y <= 10; y++) { px(ctx, 4, y, steel); px(ctx, 5, y, mul(steel, 0.8)); }   // steel
    for (let y = 8; y <= 11; y++) px(ctx, y, 11, steel);
    for (let y = 6; y <= 11; y++) for (let x = 9; x <= 13; x++) { const dx = x - 11, dy = y - 9; if (dx * dx + dy * dy < 7) px(ctx, x, y, flint); } // flint
    px(ctx, 10, 5, [1, 0.8, 0.2]); px(ctx, 11, 4, [1, 0.6, 0.1]); // sparks
  } else if (type === 'bow') {
    const wood = [0.5, 0.36, 0.2];
    for (let y = 2; y <= 13; y++) { const x = 11 - Math.round(Math.sin((y - 2) / 11 * Math.PI) * 4); px(ctx, x, y, wood); px(ctx, x - 1, y, mul(wood, 0.8)); }
    for (let y = 2; y <= 13; y++) px(ctx, 11, y, [0.85, 0.85, 0.85]); // string
  } else if (type === 'arrow') {
    for (let i = 0; i < 12; i++) px(ctx, 3 + i, 12 - i, [0.5, 0.36, 0.2]); // shaft
    px(ctx, 13, 1, [0.85, 0.85, 0.88]); px(ctx, 12, 2, [0.85, 0.85, 0.88]); px(ctx, 14, 2, [0.85, 0.85, 0.88]); // head
    px(ctx, 3, 13, [0.95, 0.95, 0.95]); px(ctx, 2, 12, [0.95, 0.95, 0.95]); // fletching
  } else if (MAT_COLORS[type]) {
    // Generic material/ingredient: a rounded nugget in its colour.
    const col = MAT_COLORS[type];
    for (let y = 4; y <= 12; y++) for (let x = 3; x <= 12; x++) { const dx = x - 7.5, dy = y - 8; if (dx * dx + dy * dy < 20) px(ctx, x, y, mul(col, 0.82 + pnoise(x, y) * 0.32)); }
  }
}

/** Fallback colours for procedurally-drawn material/ingredient icons. */
const MAT_COLORS = {
  lapis: [0.16, 0.3, 0.85], redstone: [0.85, 0.12, 0.12], emerald: [0.15, 0.85, 0.45],
  flint: [0.22, 0.22, 0.24], clay_ball: [0.66, 0.68, 0.72], brick: [0.7, 0.32, 0.26],
  charcoal: [0.18, 0.18, 0.2], string: [0.9, 0.9, 0.9], bone: [0.95, 0.95, 0.88],
  feather: [0.95, 0.96, 0.98], leather: [0.6, 0.4, 0.25], gunpowder: [0.3, 0.3, 0.32],
  paper: [0.95, 0.95, 0.9], book: [0.65, 0.25, 0.2], ender_pearl: [0.1, 0.55, 0.5],
  wheat: [0.85, 0.74, 0.32], nether_quartz: [0.92, 0.9, 0.86], nether_brick: [0.35, 0.18, 0.2],
  bonemeal: [0.95, 0.95, 0.88], green_dye: [0.25, 0.6, 0.2],
  blaze_rod: [0.95, 0.7, 0.1], blaze_powder: [0.95, 0.6, 0.05], eye_of_ender: [0.2, 0.7, 0.6],
  ghast_tear: [0.85, 0.95, 0.9], spider_eye: [0.6, 0.1, 0.12],
  raw_copper: [0.78, 0.45, 0.3], copper_ingot: [0.85, 0.52, 0.36], sugar: [0.95, 0.95, 0.98],
  slimeball: [0.5, 0.8, 0.4], magma_cream: [0.85, 0.45, 0.15], rabbit_foot: [0.8, 0.7, 0.55],
  fermented_spider_eye: [0.4, 0.3, 0.5], glass_bottle: [0.7, 0.85, 0.9],
  netherite_scrap: [0.5, 0.38, 0.3], netherite_ingot: [0.3, 0.26, 0.28],
  nether_star: [0.95, 0.98, 0.9], phantom_membrane: [0.55, 0.6, 0.5]
};

/** Potion liquid colours for the bottle icon. */
const POTION_COLORS = {
  water_bottle: [0.3, 0.4, 0.9], awkward_potion: [0.4, 0.2, 0.7],
  potion_healing: [0.95, 0.2, 0.3], potion_harming: [0.3, 0.05, 0.1],
  potion_regeneration: [0.9, 0.3, 0.6], potion_strength: [0.7, 0.2, 0.1],
  potion_swiftness: [0.4, 0.7, 0.9], potion_leaping: [0.3, 0.8, 0.4],
  potion_fire_resistance: [0.9, 0.55, 0.1], potion_water_breathing: [0.2, 0.5, 0.7],
  potion_night_vision: [0.1, 0.1, 0.5], potion_poison: [0.3, 0.6, 0.2],
  potion_weakness: [0.4, 0.5, 0.5], potion_slowness: [0.3, 0.4, 0.6]
};

function drawPotion(ctx, type) {
  const liquid = POTION_COLORS[type] || [0.5, 0.5, 0.8];
  const glass = [0.75, 0.82, 0.85];
  // Round flask body.
  for (let y = 6; y <= 14; y++) for (let x = 4; x <= 11; x++) {
    const dx = x - 7.5, dy = y - 10;
    if (dx * dx + dy * dy < 13) px(ctx, x, y, y <= 8 ? glass : mul(liquid, 0.85 + pnoise(x, y) * 0.3));
  }
  px(ctx, 7, 3, glass); px(ctx, 8, 3, glass);       // neck
  px(ctx, 7, 4, glass); px(ctx, 8, 4, glass);
  px(ctx, 6, 5, glass); px(ctx, 9, 5, glass);
}

function drawShield(ctx) {
  const wood = [0.5, 0.36, 0.2], iron = [0.82, 0.82, 0.85];
  for (let y = 2; y <= 14; y++) {
    const inset = y > 11 ? (y - 11) : 0; // taper to a point at the bottom
    for (let x = 3 + inset; x <= 12 - inset; x++) {
      let c = mul(wood, 0.85 + pnoise(x, y) * 0.25);
      if (x === 3 + inset || x === 12 - inset || y === 2) c = iron; // metal rim
      if (x >= 7 && x <= 8 && y >= 5 && y <= 9) c = iron; // central boss
      px(ctx, x, y, c);
    }
  }
}

function drawTotem(ctx) {
  const gold = [0.95, 0.8, 0.2], dark = [0.6, 0.45, 0.1];
  for (let y = 3; y <= 13; y++) for (let x = 5; x <= 10; x++) px(ctx, x, y, mul(gold, 0.85 + pnoise(x, y) * 0.25));
  // little arms + face
  px(ctx, 3, 7, gold); px(ctx, 4, 7, gold); px(ctx, 11, 7, gold); px(ctx, 12, 7, gold);
  px(ctx, 6, 6, dark); px(ctx, 9, 6, dark); // eyes
  px(ctx, 7, 9, dark); px(ctx, 8, 9, dark); // mouth
}

function drawFood(ctx, type) {
  // Apple / bread / melon: simple distinctive shapes.
  if (type === 'golden_apple' || type === 'enchanted_golden_apple') {
    for (let y = 4; y <= 13; y++) for (let x = 3; x <= 12; x++) { const dx = x - 7.5, dy = y - 9; if (dx * dx + dy * dy < 20) px(ctx, x, y, mul([0.98, 0.82, 0.2], 0.85 + pnoise(x, y) * 0.3)); }
    px(ctx, 8, 3, [0.4, 0.3, 0.1]); px(ctx, 9, 2, [0.4, 0.7, 0.3]);
    return;
  }
  if (type === 'golden_carrot') {
    for (let y = 3; y <= 13; y++) { const w = (13 - y); for (let x = 7 - w / 3; x <= 8 + w / 3; x++) px(ctx, x | 0, y, mul([0.95, 0.78, 0.2], 0.85 + pnoise(x | 0, y) * 0.3)); }
    return;
  }
  if (type === 'apple') {
    for (let y = 4; y <= 13; y++) for (let x = 3; x <= 12; x++) { const dx = x - 7.5, dy = y - 9; if (dx * dx + dy * dy < 20) px(ctx, x, y, mul([0.85, 0.15, 0.15], 0.8 + pnoise(x, y) * 0.35)); }
    px(ctx, 8, 3, [0.4, 0.28, 0.14]); px(ctx, 9, 2, [0.3, 0.6, 0.25]); // stem + leaf
    return;
  }
  if (type === 'bread') {
    for (let y = 6; y <= 11; y++) for (let x = 2; x <= 13; x++) { const dy = y - 8.5; if (Math.abs(dy) <= 2.5) px(ctx, x, y, mul([0.78, 0.56, 0.28], 0.85 + pnoise(x, y) * 0.3)); }
    for (let x = 4; x <= 11; x += 2) px(ctx, x, 7, [0.5, 0.34, 0.16]); // score marks
    return;
  }
  if (type === 'melon_slice') {
    for (let y = 4; y <= 13; y++) { const w = (y - 4); for (let x = 7 - w / 2; x <= 8 + w / 2; x++) px(ctx, x | 0, y, y > 11 ? [0.25, 0.5, 0.2] : mul([0.9, 0.25, 0.3], 0.85 + pnoise(x | 0, y) * 0.3)); }
    return;
  }
  const meat = { raw_beef: [0.85, 0.3, 0.3], raw_mutton: [0.88, 0.4, 0.4], steak: [0.5, 0.3, 0.15], cooked_mutton: [0.55, 0.34, 0.18], raw_porkchop: [0.9, 0.55, 0.55], cooked_porkchop: [0.6, 0.38, 0.2], raw_chicken: [0.92, 0.7, 0.6], cooked_chicken: [0.7, 0.5, 0.3], rotten_flesh: [0.45, 0.32, 0.22], spider_eye: [0.6, 0.1, 0.12], raw_rabbit: [0.88, 0.45, 0.4], cooked_rabbit: [0.6, 0.38, 0.22] }[type];
  const fish = { raw_salmon: [0.92, 0.5, 0.5], cooked_salmon: [0.85, 0.5, 0.25], pufferfish: [0.9, 0.8, 0.3] }[type];
  if (meat) {
    for (let y = 4; y <= 12; y++) for (let x = 3; x <= 12; x++) { const dx = x - 7.5, dy = y - 8; if (dx * dx + dy * dy < 22) px(ctx, x, y, mul(meat, 0.85 + pnoise(x, y) * 0.3)); }
    for (let x = 3; x <= 5; x++) px(ctx, x, 12, [0.95, 0.95, 0.9]); // bone
  } else if (fish) {
    for (let y = 6; y <= 10; y++) for (let x = 3; x <= 11; x++) { const dy = y - 8; if (Math.abs(dy) <= (11 - x) * 0.6 + 1) px(ctx, x, y, mul(fish, 0.85 + pnoise(x, y) * 0.3)); }
    px(ctx, 12, 6, fish); px(ctx, 12, 10, fish); px(ctx, 13, 7, fish); px(ctx, 13, 9, fish); // tail
    px(ctx, 5, 8, [0.1, 0.1, 0.1]); // eye
  }
}

/* ------------------------------- public --------------------------------- */

/**
 * @param {string} type
 * @returns {string|null} a data: URL for the icon, or null if unavailable.
 */
export function getItemIcon(type) {
  if (cache.has(type)) return cache.get(type);
  const made = makeCtx();
  if (!made) { cache.set(type, null); return null; }
  const { c, ctx } = made;
  const def = ITEMS[type];
  if (!def) { cache.set(type, null); return null; }

  const blockId = placeBlockId(type);
  if (blockId) drawBlock(ctx, blockId);
  else if (def.tool) drawTool(ctx, def.tool, def.tier);
  else if (def.slot) drawArmor(ctx, def.slot, type.split('_')[0]);
  else if (def.shield) drawShield(ctx);
  else if (def.totem) drawTotem(ctx);
  else if (def.potion) drawPotion(ctx, type);
  else if (def.food) drawFood(ctx, type);
  else drawMaterial(ctx, type);

  const url = c.toDataURL('image/png');
  cache.set(type, url);
  return url;
}

/**
 * Inline HTML for an item icon: a pixelated image when available, else the
 * emoji glyph.
 * @param {string} type @param {number} [size=22]
 * @returns {string}
 */
export function itemIconHTML(type, size = 22) {
  ensureIconStyles();
  const url = getItemIcon(type);
  if (url) {
    return `<span class="item-icon" style="width:${size}px;height:${size}px;` +
      `background-image:url(${url})"></span>`;
  }
  const glyph = ITEMS[type]?.glyph ?? '▣';
  return `<span class="item-icon glyph" style="width:${size}px;height:${size}px;font-size:${size * 0.8}px">${glyph}</span>`;
}
