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
    gold: [0.95, 0.8, 0.2], diamond: [0.4, 0.85, 0.9]
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
  const isOre = [10, 15, 16, 17].includes(blockId);
  const accent = { 10: [0.82, 0.7, 0.55], 15: [0.12, 0.12, 0.13], 16: [0.95, 0.8, 0.2], 17: [0.5, 0.9, 0.95] }[blockId];
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
  }
}

function drawFood(ctx, type) {
  const meat = { raw_beef: [0.85, 0.3, 0.3], raw_mutton: [0.88, 0.4, 0.4], steak: [0.5, 0.3, 0.15], cooked_mutton: [0.55, 0.34, 0.18] }[type];
  const fish = { raw_salmon: [0.92, 0.5, 0.5], cooked_salmon: [0.85, 0.5, 0.25] }[type];
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
