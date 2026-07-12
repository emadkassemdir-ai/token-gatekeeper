/**
 * World
 * -----
 * Owns voxel storage, procedural terrain/biome generation, tree spawning and
 * all rendering. Rendering is optimised two ways:
 *
 *   1. Greedy *exposed-block* culling — a voxel only becomes a render instance
 *      when at least one neighbour is see-through, so the solid interior of the
 *      terrain costs nothing.
 *   2. Per-chunk `InstancedMesh` batches — one draw call per (chunk, block
 *      type). Because each chunk is its own bounded mesh, Three.js performs
 *      frustum culling per chunk for free; off-screen chunks are skipped.
 */

import * as THREE from 'three';
import {
  AIR,
  BLOCKS,
  getFaceColor,
  isAir,
  isSolid,
  isTransparent,
  isLiquid
} from './BlockTypes.js';
import { NoiseGenerator } from './NoiseGenerator.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 256; // deep world: ~190 blocks of cave/ore rock below the surface
export const SEA_LEVEL = 190;
export const NETHER_ROOF = 96;   // the Nether stays a compact cavern band at the bottom

export const BIOME = Object.freeze({
  PLAINS: 'plains',
  DESERT: 'desert',
  MOUNTAIN: 'mountain',
  SNOWY: 'snowy',
  JUNGLE: 'jungle',
  OCEAN: 'ocean',
  FOREST: 'forest',
  TAIGA: 'taiga',
  SAVANNA: 'savanna',
  BEACH: 'beach'
});

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/* -------------------------------------------------------------------------- */
/*  Shared geometry + material registry                                        */
/* -------------------------------------------------------------------------- */

// Ambient-occlusion-ish per-face brightness: top brightest, sides mid, bottom
// darkest. Gives blocks depth even before textures.
const AO = { top: 1.0, side: 0.82, bottom: 0.6 };

/** Stable per-pixel value noise in [0,1). */
function pnoise(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Per-block texture recipe: which pixel-art "kind" to paint on each face. */
const STONE_BASE = [0.52, 0.52, 0.55];
const TEX = {
  1: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
  2: { all: 'dirt' },
  3: { all: 'stone' },
  4: { all: 'bedrock' },
  5: { top: 'log_top', side: 'log_side', bottom: 'log_top' },
  6: { all: 'leaves' },
  7: { all: 'sand' },
  8: { all: 'water' },
  9: { all: 'glass' },
  10: { all: 'ore', base: STONE_BASE, accent: [0.85, 0.68, 0.56] }, // iron (tan-pink, canon)
  11: { all: 'planks' },
  12: { top: 'craft_top', side: 'craft_side', bottom: 'planks' },
  13: { all: 'snow' },
  14: { all: 'leaves' },
  15: { all: 'ore', base: STONE_BASE, accent: [0.18, 0.18, 0.2] },  // coal
  16: { all: 'ore', base: STONE_BASE, accent: [0.98, 0.9, 0.28] },  // gold
  17: { all: 'ore', base: STONE_BASE, accent: [0.36, 0.93, 0.87] }, // diamond (cyan, canon)
  18: { top: 'stone', side: 'furnace', bottom: 'stone' },

  // ---- Expansion textures ----
  19: { all: 'cobble' },
  20: { all: 'gravel' },
  21: { top: 'sandstone_top', side: 'sandstone', bottom: 'sandstone_top' },
  22: { all: 'bricks' },
  23: { all: 'mossy' },
  24: { all: 'stonebricks' },
  25: { all: 'stone' },   // andesite (block colour applied)
  26: { all: 'stone' },   // diorite
  27: { all: 'stone' },   // granite
  28: { top: 'birch_top', side: 'birch_side', bottom: 'birch_top' },
  29: { all: 'leaves' },
  30: { top: 'spruce_top', side: 'spruce_side', bottom: 'spruce_top' },
  31: { all: 'leaves' },
  32: { top: 'cactus_top', side: 'cactus', bottom: 'cactus_top' },
  33: { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top' },
  34: { top: 'melon_top', side: 'melon_side', bottom: 'melon_top' },
  35: { all: 'obsidian' },
  36: { all: 'glowstone' },
  37: { top: 'planks', side: 'bookshelf', bottom: 'planks' },
  38: { all: 'ice' },
  39: { all: 'clay' },
  40: { all: 'ore', base: STONE_BASE, accent: [0.12, 0.32, 0.78] }, // lapis
  41: { all: 'ore', base: STONE_BASE, accent: [1.0, 0.1, 0.1] },   // redstone (glowing red)
  42: { all: 'ore', base: STONE_BASE, accent: [0.1, 0.85, 0.37] }, // emerald
  43: { all: 'wool' },
  44: { all: 'wool' },
  45: { all: 'wool' },
  46: { all: 'wool' },
  47: { all: 'metal' },
  48: { all: 'metal' },
  49: { all: 'gem' },
  50: { all: 'metal' },
  51: { all: 'gem' },
  52: { all: 'metal' },
  // Nether:
  53: { all: 'netherrack' },
  54: { all: 'lava' },
  55: { all: 'soulsand' },
  56: { all: 'ore', base: [0.5, 0.28, 0.27], accent: [0.95, 0.95, 0.92] }, // quartz ore
  57: { all: 'netherbricks' },
  58: { all: 'portal' },
  59: { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_top' },
  60: { all: 'endstone' },
  61: { all: 'endportal' },
  62: { all: 'dragonegg' },
  63: { top: 'enchtop', side: 'obsidian', bottom: 'obsidian' },
  64: { top: 'bedtop', side: 'bedside', bottom: 'planks' },
  65: { top: 'chesttop', side: 'chestside', bottom: 'planks' },
  66: { all: 'netherwart' },
  67: { top: 'brewtop', side: 'brewside', bottom: 'stone' },
  68: { all: 'ore', base: STONE_BASE, accent: [0.9, 0.5, 0.33] }, // copper (orange, canon)
  69: { all: 'metal' },
  70: { all: 'stone' },   // deepslate (dark colour applied)
  71: { all: 'smoothstone' },
  72: { all: 'sealantern' },
  73: { all: 'ore', base: [0.32, 0.22, 0.18], accent: [0.55, 0.42, 0.3] }, // ancient debris
  74: { all: 'metal' },
  75: { top: 'smithtop', side: 'chestside', bottom: 'planks' },
  76: { top: 'barreltop', side: 'chestside', bottom: 'planks' },
  77: { top: 'chesttop', side: 'chestside', bottom: 'obsidian' },
  78: { all: 'redstone_dust' },
  79: { all: 'redstone_block' },
  80: { all: 'lamp_off' },
  81: { all: 'lamp_on' },
  82: { all: 'lever_off' },
  83: { all: 'lever_on' },
  84: { all: 'redstone_torch' },
  85: { all: 'spawner' },
  86: { top: 'stone', side: 'furnace', bottom: 'stone' },   // blast furnace
  87: { top: 'planks', side: 'furnace', bottom: 'stone' },  // smoker
  88: { all: 'stone' },                                     // grindstone
  89: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, // acacia
  90: { all: 'leaves' },
  91: { all: 'planks' },
  92: { top: 'log_top', side: 'birch_side', bottom: 'log_top' }, // cherry
  93: { all: 'leaves' },
  94: { all: 'planks' },
  95: { all: 'skull' },
  96: { all: 'beacon' },
  97: { top: 'farmland', side: 'dirt', bottom: 'dirt' },
  98: { all: 'crop' }, 99: { all: 'crop' },
  100: { all: 'crop' }, 101: { all: 'crop' },
  102: { all: 'crop' }, 103: { all: 'crop' },
  // Pistons / doors / ladders
  104: { top: 'piston_face', side: 'piston_side', bottom: 'piston_back' },
  105: { all: 'piston_head' },
  106: { top: 'piston_sticky', side: 'piston_side', bottom: 'piston_back' },
  107: { all: 'ladder' },
  108: { all: 'door' }, 109: { all: 'door' },
  // Redstone logic
  110: { top: 'repeater', side: 'stone', bottom: 'stone' },
  111: { top: 'repeater_on', side: 'stone', bottom: 'stone' },
  112: { top: 'observer', side: 'observer', bottom: 'observer_face' },
  // Item transport
  113: { top: 'hopper_top', side: 'hopper', bottom: 'metal' },
  114: { top: 'dispenser', side: 'dispenser_front', bottom: 'cobble' },
  115: { top: 'dispenser', side: 'dropper_front', bottom: 'cobble' },
  // Slabs reuse the parent block's texture
  116: { all: 'planks' }, 117: { all: 'stone' }, 118: { all: 'cobble' },
  119: { all: 'planks' }, 120: { all: 'stone' }, 121: { all: 'cobble' },
  // Villager job-site blocks
  122: { top: 'composter_top', side: 'composter', bottom: 'planks' },
  123: { top: 'lectern_top', side: 'planks', bottom: 'planks' },
  124: { top: 'map_top', side: 'planks', bottom: 'planks' },
  125: { top: 'fletch_top', side: 'planks', bottom: 'planks' },
  126: { top: 'loom_top', side: 'planks', bottom: 'planks' },
  127: { top: 'stonecut_top', side: 'stone', bottom: 'stone' },
  // Extra wood types
  128: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, // dark oak
  129: { all: 'planks' },
  130: { all: 'leaves' },
  131: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, // mangrove
  132: { all: 'planks' },
  133: { all: 'leaves' },
  134: { all: 'bamboo' },
  135: { all: 'command' }
};

const TILE = 16; // texels per tile

/** Paint one 16×16 tile at column `ox` of the atlas canvas. */
function paintTile(ctx, ox, kind, base, accent) {
  const put = (px, py, c) => {
    ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, c[0] * 255)) | 0},${Math.max(0, Math.min(255, c[1] * 255)) | 0},${Math.max(0, Math.min(255, c[2] * 255)) | 0})`;
    ctx.fillRect(ox + px, py, 1, 1);
  };
  const mul = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
  const dirt = [0.5, 0.34, 0.2];

  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const n = pnoise(ox + px, py);
      let c;
      switch (kind) {
        case 'grass_top':
          // Vibrant two-tone turf with scattered bright blades.
          c = mul(base, 0.82 + n * 0.3);
          if (n > 0.78) c = mul(base, 1.22);
          if (pnoise(px * 3 + 9, py * 3 + 4) > 0.9) c = mul(base, 1.35); // blade highlights
          break;
        case 'grass_side': {
          // Dirt face with a grass band whose bottom edge dips unevenly (canon).
          const fringe = 3 + (pnoise(ox + px, 99) > 0.55 ? 1 : 0);
          if (py < fringe) { c = mul(base, 0.85 + n * 0.3); if (py === fringe - 1) c = mul(base, 0.72); }
          else { c = mul(dirt, 0.8 + pnoise(px, py + 7) * 0.35); if (pnoise(px * 2, py * 2 + 3) > 0.86) c = mul(dirt, 0.6); }
          break;
        }
        case 'dirt':
          c = mul(base, 0.8 + n * 0.35);
          if (n < 0.12) c = mul(base, 0.62);
          if (pnoise(px * 2 + 5, py * 2 + 1) > 0.88) c = mul(base, 1.2); // pebbly flecks
          break;
        case 'stone':
          // Canon stone: light gray with soft 2-3px blotches, not just speckle.
          c = mul(base, 0.92 + n * 0.14);
          if (pnoise((px >> 1) * 2.3, (py >> 1) * 2.3) > 0.72) c = mul(base, 0.8);
          if (pnoise(px * 1.3 + 8, py * 1.3 + 2) > 0.9) c = mul(base, 1.1);
          break;
        case 'bedrock': {
          // High-contrast slabs of near-black and mid gray (canon chaos).
          const q = pnoise((px >> 1) * 3.1, (py >> 1) * 3.1);
          c = q > 0.6 ? mul(base, 1.4) : q > 0.3 ? mul(base, 0.9) : mul(base, 0.4);
          break;
        }
        case 'sand':
          c = mul(base, 0.94 + n * 0.12);
          if (pnoise(px * 2.7, py * 2.7) > 0.85) c = mul(base, 0.84); // grain shadows
          if (pnoise(px * 2.7 + 4, py * 2.7 + 9) > 0.92) c = mul(base, 1.1);
          break;
        case 'snow':
          c = mul(base, 0.95 + n * 0.07);
          if (n > 0.9) c = [0.85, 0.9, 0.97];
          break;
        case 'log_top': {
          const dx = px - 7.5, dy = py - 7.5;
          const r = Math.sqrt(dx * dx + dy * dy);
          c = mul(base, (Math.sin(r * 2.2) > 0.4 ? 0.78 : 0.98) + n * 0.08);
          break;
        }
        case 'log_side':
          c = mul(base, (px % 4 === 0 ? 0.72 : 0.92) + n * 0.14);
          break;
        case 'planks': {
          const row = py % 4;
          c = mul(base, (row === 0 ? 0.7 : 0.92) + n * 0.12);
          if ((py < 8 ? px === 7 : px === 3) && row !== 0) c = mul(base, 0.72);
          break;
        }
        case 'craft_top':
          c = mul(base, 0.9 + n * 0.1);
          if (px === 0 || py === 0 || px === 15 || py === 15 || px === 7 || px === 8 || py === 7 || py === 8) c = mul(base, 0.62);
          break;
        case 'craft_side':
          c = mul(base, (py % 4 === 0 ? 0.72 : 0.9) + n * 0.1);
          if (py < 6 && (px === 4 || px === 11)) c = mul(base, 0.6);
          break;
        case 'leaves':
          // Canon fancy leaves: deep green mass with dark "hole" pixels and
          // bright young-leaf highlights.
          c = mul(base, 0.7 + n * 0.4);
          if (pnoise(px * 2.2 + 1, py * 2.2 + 6) > 0.82) c = mul(base, 0.32); // holes
          if (pnoise(px * 1.8 + 7, py * 1.8 + 3) > 0.9) c = mul(base, 1.35);  // highlights
          break;
        case 'water': {
          const wave = Math.sin((py + px * 0.5) * 0.8) * 0.06;
          c = mul(base, 0.92 + wave + n * 0.06);
          break;
        }
        case 'glass':
          if (px === 0 || py === 0 || px === 15 || py === 15) c = mul(base, 0.7);
          else c = mul(base, 0.98 + n * 0.04);
          break;
        case 'furnace':
          c = mul(base, 0.9 + n * 0.2);
          if (px >= 4 && px <= 11 && py >= 7 && py <= 13) c = [0.12, 0.1, 0.1]; // opening
          if (py === 7 && px >= 4 && px <= 11) c = [0.5, 0.35, 0.2];
          break;
        case 'ore': {
          // Wiki-canon ore: four BIG unmistakable clusters on plain stone.
          // Each cluster is a fat diamond ~4px across: bright core, solid
          // accent body, dark outline — instantly readable at a distance.
          c = mul(base, 0.92 + n * 0.12);
          for (const [ax, ay] of [[3, 3], [11, 4], [4, 11], [12, 12]]) {
            const d = Math.abs(px - ax) + Math.abs(py - ay);
            if (d === 0) c = mul(accent, 1.45);                    // gleaming core
            else if (d === 1) c = mul(accent, 1.0);                // body
            else if (d === 2) c = mul(accent, 0.62);               // shaded rim
            else if (d === 3) { if (((px + py) & 1) === 0) c = mul(base, 0.7); } // outline hint
          }
          break;
        }
        case 'cobble': {
          // Rounded cobbles separated by dark mortar.
          const cellX = (px + 1) % 8 < 4 ? 0 : 1;
          const cellY = py % 8 < 4 ? 0 : 1;
          const edge = (px % 4 === 0) || (py % 4 === 0);
          c = edge ? mul(base, 0.5) : mul(base, (cellX ^ cellY ? 0.78 : 1.0) + n * 0.18);
          break;
        }
        case 'gravel':
          c = mul(base, 0.7 + n * 0.5);
          if (pnoise(px * 2.1, py * 2.1) > 0.8) c = mul(base, 0.55);
          break;
        case 'sandstone':
          // Horizontal sedimentary bands.
          c = mul(base, (py % 5 === 0 ? 0.78 : 0.95) + n * 0.08);
          break;
        case 'sandstone_top':
          c = mul(base, 0.92 + n * 0.12);
          break;
        case 'bricks': {
          const row = Math.floor(py / 4);
          const off = row % 2 ? 4 : 0;        // running bond
          const mortar = (py % 4 === 0) || ((px + off) % 8 === 0);
          c = mortar ? [0.78, 0.74, 0.7] : mul(base, 0.82 + n * 0.25);
          break;
        }
        case 'stonebricks': {
          const mortar = (py % 8 === 0) || (px % 8 === 0) ||
            (py % 8 >= 4 ? px % 8 === 4 : false);
          c = mortar ? mul(base, 0.55) : mul(base, 0.92 + n * 0.16);
          break;
        }
        case 'mossy': {
          const edge = (px % 4 === 0) || (py % 4 === 0);
          c = edge ? mul([0.32, 0.4, 0.3], 0.7) : mul([0.5, 0.5, 0.52], 0.85 + n * 0.18);
          if (pnoise(px * 1.3 + 9, py * 1.3) > 0.7) c = mul([0.3, 0.5, 0.28], 0.8 + n * 0.4); // moss
          break;
        }
        case 'birch_top':
        case 'spruce_top': {
          const dx = px - 7.5, dy = py - 7.5;
          const r = Math.sqrt(dx * dx + dy * dy);
          c = mul(base, (Math.sin(r * 2.2) > 0.4 ? 0.8 : 0.98) + n * 0.08);
          break;
        }
        case 'birch_side':
          c = mul(base, 0.95 + n * 0.08);
          if (pnoise(px * 3 + 2, py * 0.7) > 0.88) c = [0.2, 0.2, 0.18]; // dark knots
          break;
        case 'spruce_side':
          c = mul(base, (px % 4 === 0 ? 0.7 : 0.9) + n * 0.16);
          break;
        case 'cactus':
          c = mul(base, 0.82 + n * 0.2);
          if (px === 0 || px === 15) c = mul(base, 0.6);
          if (px % 5 === 2 && pnoise(px, py * 2) > 0.7) c = mul(base, 1.15); // spine dots
          break;
        case 'cactus_top':
          c = mul(base, 0.85 + n * 0.18);
          if (px > 2 && px < 13 && py > 2 && py < 13) c = mul(base, 1.05 + n * 0.1);
          break;
        case 'pumpkin_side':
          c = mul(base, (px % 3 === 0 ? 0.78 : 0.96) + n * 0.1); // vertical ribs
          break;
        case 'pumpkin_top':
          c = mul(base, 0.9 + n * 0.1);
          if (px >= 6 && px <= 9 && py >= 6 && py <= 9) c = [0.4, 0.32, 0.16]; // stem
          break;
        case 'melon_side':
          c = (px % 4 < 2) ? mul([0.25, 0.45, 0.16], 0.9 + n * 0.1) : mul(base, 0.9 + n * 0.15); // stripes
          break;
        case 'melon_top':
          c = mul(base, 0.85 + n * 0.2);
          break;
        case 'obsidian': {
          // Canon obsidian: near-black with violet swirls and rare blue glints.
          const swirl = pnoise((px >> 1) * 2.1, (py >> 1) * 2.1);
          c = swirl > 0.66 ? [0.24, 0.14, 0.36] : mul(base, 0.7 + n * 0.4);
          if (pnoise(px * 2.3 + 6, py * 2.3 + 1) > 0.93) c = [0.45, 0.35, 0.7]; // glint
          break;
        }
        case 'glowstone': {
          // Canon glowstone: a mosaic of bright yellow crystal clumps in a
          // brown-orange grout.
          const cell = pnoise((px >> 2) * 4.7, (py >> 2) * 4.7);
          c = cell > 0.45 ? [1.0, 0.9, 0.45] : [0.62, 0.42, 0.2];
          if (cell > 0.8) c = [1.0, 1.0, 0.75]; // hottest cores
          c = mul(c, 0.9 + n * 0.15);
          break;
        }
        case 'bookshelf': {
          if (py < 2 || py > 13) { c = mul([0.6, 0.45, 0.28], 0.8 + n * 0.1); break; } // plank frame
          const spine = [[0.7, 0.2, 0.2], [0.2, 0.4, 0.7], [0.2, 0.6, 0.3], [0.7, 0.6, 0.2], [0.5, 0.3, 0.6]][px % 5];
          c = (px % 5 === 4) ? [0.35, 0.25, 0.15] : mul(spine, 0.8 + n * 0.3); // books + gaps
          break;
        }
        case 'ice':
          c = mul(base, 0.92 + n * 0.12);
          if (pnoise(px * 1.2 + 5, py * 1.2) > 0.86) c = [0.85, 0.92, 1.0]; // glint/cracks
          break;
        case 'clay':
          c = mul(base, 0.92 + n * 0.1);
          break;
        case 'wool':
          c = mul(base, 0.85 + n * 0.28);
          if (n < 0.12) c = mul(base, 0.72);
          break;
        case 'metal':
          c = mul(base, 0.86 + n * 0.16);
          if (px === py || px === 15 - py) c = mul(base, 1.12); // subtle sheen
          break;
        case 'gem': {
          const dx = px - 7.5, dy = py - 7.5;
          c = (Math.abs(dx) + Math.abs(dy) < 8) ? mul(base, 0.85 + ((px + py) % 2) * 0.3) : mul(base, 0.7);
          break;
        }
        case 'netherrack': {
          // Canon netherrack: marbled dark crimson with lighter fungal veins.
          const vein = pnoise((px >> 1) * 1.9 + 3, (py >> 1) * 1.9);
          c = vein > 0.68 ? [0.62, 0.22, 0.22] : vein < 0.2 ? mul(base, 0.55) : mul(base, 0.8 + n * 0.3);
          break;
        }
        case 'lava': {
          const wave = Math.sin((py + px * 0.5) * 0.7) * 0.12;
          c = mul(base, 0.9 + wave + n * 0.1);
          if (pnoise(px * 1.4 + 3, py * 1.4) > 0.8) c = [1.0, 0.85, 0.3]; // bright blobs
          break;
        }
        case 'soulsand':
          // Canon soul sand: brown murk with sunken screaming faces.
          c = mul(base, 0.85 + n * 0.22);
          // Two face motifs per tile: hollow eyes + a wailing mouth.
          for (const [fx, fy] of [[4, 4], [11, 10]]) {
            if ((px === fx - 1 || px === fx + 1) && py === fy) c = mul(base, 0.35);      // eyes
            if (px >= fx - 1 && px <= fx + 1 && py === fy + 2) c = mul(base, 0.3);       // mouth
          }
          if (pnoise(px * 1.5 + 1, py * 1.5) > 0.82) c = mul(base, 0.62); // pitted grain
          break;
        case 'netherbricks': {
          const row = Math.floor(py / 4);
          const off = row % 2 ? 4 : 0;
          const mortar = (py % 4 === 0) || ((px + off) % 8 === 0);
          c = mortar ? mul(base, 0.5) : mul(base, 0.9 + n * 0.2);
          break;
        }
        case 'portal': {
          const sw = Math.sin((px + py) * 0.9 + n * 3) * 0.2;
          c = mul(base, 0.8 + sw + n * 0.2);
          break;
        }
        case 'tnt_side':
          if (py >= 6 && py <= 9) { c = [0.95, 0.95, 0.95]; if ((px + py) % 2 === 0) c = [0.1, 0.1, 0.1]; } // "TNT" label band
          else c = mul([0.78, 0.2, 0.16], 0.85 + n * 0.2);
          break;
        case 'tnt_top':
          c = mul([0.8, 0.74, 0.3], 0.85 + n * 0.2);
          if (px % 4 === 0 || py % 4 === 0) c = mul([0.6, 0.5, 0.2], 0.9);
          break;
        case 'endstone':
          c = mul(base, 0.88 + n * 0.18);
          if (pnoise(px * 1.5 + 4, py * 1.5) > 0.82) c = mul([0.7, 0.68, 0.45], 0.95); // dark flecks
          break;
        case 'endportal': {
          // Starfield on near-black.
          c = mul(base, 0.6 + n * 0.5);
          if (pnoise(px * 2.3 + 7, py * 2.3) > 0.9) c = [0.7, 0.85, 0.8]; // stars
          if (pnoise(px * 1.1, py * 1.1 + 3) > 0.93) c = [0.5, 0.4, 0.8];
          break;
        }
        case 'dragonegg':
          c = mul(base, 0.6 + n * 0.6);
          if (pnoise(px * 1.7, py * 1.7 + 2) > 0.8) c = [0.3, 0.1, 0.4]; // purple sheen
          break;
        case 'enchtop':
          c = mul([0.16, 0.13, 0.2], 0.9 + n * 0.2);
          if (px >= 4 && px <= 11 && py >= 4 && py <= 11) c = mul([0.7, 0.12, 0.16], 0.85 + n * 0.3); // red book
          if (px >= 7 && px <= 8 && py >= 4 && py <= 11) c = [0.9, 0.85, 0.7]; // pages
          break;
        case 'bedtop':
          c = mul(base, 0.9 + n * 0.12);
          if (py < 4) c = [0.92, 0.9, 0.86]; // pillow
          break;
        case 'bedside':
          c = py > 9 ? mul([0.5, 0.36, 0.2], 0.9) : mul(base, 0.9 + n * 0.1); // wood frame below, cloth above
          break;
        case 'chesttop':
          c = mul(base, 0.9 + n * 0.1);
          if (px === 0 || py === 0 || px === 15 || py === 15) c = mul(base, 0.6); // border
          break;
        case 'chestside':
          c = mul(base, 0.88 + n * 0.12);
          if (px === 0 || py === 0 || px === 15 || py === 15) c = mul(base, 0.6);
          if (py >= 6 && py <= 8 && px >= 6 && px <= 9) c = [0.25, 0.2, 0.1]; // latch
          break;
        case 'netherwart':
          c = [0.18, 0.05, 0.06]; // dark backing
          if (pnoise(px * 1.3, py * 1.3) > 0.55) c = mul([0.6, 0.12, 0.14], 0.8 + n * 0.5); // clumps
          break;
        case 'brewtop':
          c = mul([0.4, 0.38, 0.36], 0.9 + n * 0.15);
          if (px >= 6 && px <= 9 && py >= 2 && py <= 13) c = [0.75, 0.45, 0.2]; // blaze rod spine
          break;
        case 'brewside':
          c = mul(base, 0.85 + n * 0.15);
          if (py > 10) c = mul([0.55, 0.52, 0.5], 0.9); // stone base
          break;
        case 'smoothstone':
          c = mul(base, 0.94 + n * 0.06);
          break;
        case 'sealantern':
          c = mul(base, 0.92 + n * 0.1);
          if ((px % 4 < 2) === (py % 4 < 2)) c = [0.95, 1.0, 0.98]; // bright tiles
          break;
        case 'smithtop':
          c = mul([0.3, 0.28, 0.3], 0.9 + n * 0.12);
          if (py >= 3 && py <= 12 && px >= 3 && px <= 12) c = mul([0.5, 0.5, 0.55], 0.9); // iron top
          if (px === 4 || px === 11) c = [0.2, 0.2, 0.22];
          break;
        case 'barreltop':
          c = mul([0.34, 0.26, 0.16], 0.9 + n * 0.1);
          if (px >= 5 && px <= 10 && py >= 5 && py <= 10) c = [0.2, 0.15, 0.1]; // lid hole
          break;
        case 'redstone_dust':
          c = mul([0.25, 0.06, 0.06], 0.9 + n * 0.2);
          if (px === 7 || px === 8 || py === 7 || py === 8) c = [0.7, 0.1, 0.1]; // cross wire
          break;
        case 'redstone_block':
          c = mul(base, 0.85 + n * 0.25);
          if (n > 0.8) c = [0.95, 0.2, 0.2];
          break;
        case 'lamp_off':
          c = mul([0.4, 0.32, 0.2], 0.9 + n * 0.1);
          if ((px % 4 < 2) === (py % 4 < 2)) c = mul([0.5, 0.4, 0.25], 0.9);
          break;
        case 'lamp_on':
          c = mul([1.0, 0.85, 0.45], 0.92 + n * 0.1);
          if ((px % 4 < 2) === (py % 4 < 2)) c = [1.0, 0.95, 0.7];
          break;
        case 'lever_off':
        case 'lever_on': {
          c = mul([0.5, 0.5, 0.52], 0.9 + n * 0.12); // cobble base
          const onTop = kind === 'lever_on';
          if (px >= 6 && px <= 9) { // the handle
            c = (py < 8) === onTop ? mul([0.55, 0.4, 0.24], 1.0) : mul([0.4, 0.3, 0.18], 0.8);
          }
          break;
        }
        case 'redstone_torch':
          c = mul([0.4, 0.28, 0.16], 0.9 + n * 0.1); // stick
          if (px >= 6 && px <= 9 && py <= 6) c = [0.95, 0.2, 0.15]; // glowing tip
          break;
        case 'spawner':
          c = (px % 2 === 0 && py % 2 === 0) ? [0.1, 0.12, 0.14] : mul(base, 0.8 + n * 0.2); // cage bars
          break;
        case 'skull':
          c = mul([0.16, 0.16, 0.18], 0.85 + n * 0.25);
          if ((px >= 4 && px <= 6 || px >= 9 && px <= 11) && py >= 5 && py <= 8) c = [0.02, 0.02, 0.03]; // eye sockets
          if (px >= 5 && px <= 10 && py >= 10 && py <= 13) c = [0.05, 0.05, 0.06]; // jaw
          break;
        case 'beacon':
          c = mul([0.1, 0.4, 0.45], 0.8 + n * 0.3);
          if (px >= 4 && px <= 11 && py >= 4 && py <= 11) c = [0.5, 0.95, 0.95]; // bright core
          if (px >= 6 && px <= 9 && py >= 6 && py <= 9) c = [0.85, 1.0, 1.0];
          break;
        case 'farmland':
          c = mul(base, 0.9 + n * 0.12);
          if (px === 4 || px === 11) c = mul(base, 0.7); // tilled furrows
          break;
        case 'crop':
          c = [0.34, 0.22, 0.12]; // soil backing
          if (px % 4 === 1 || px % 4 === 2) c = mul(base, 0.8 + n * 0.4); // vertical stalks in base colour
          break;
        case 'piston_side':
          c = mul([0.62, 0.52, 0.34], 0.85 + n * 0.2); // oak plank body
          if (py === 4 || py === 11) c = [0.3, 0.24, 0.14]; // plank grooves
          if (px === 0 || px === 15 || py === 0 || py === 15) c = mul(c, 0.7); // frame edge
          break;
        case 'piston_back':
          c = mul([0.5, 0.5, 0.52], 0.85 + n * 0.2); // cobble back
          if ((px + py) % 5 === 0) c = mul(c, 0.7);
          break;
        case 'piston_face':
          c = mul([0.5, 0.5, 0.52], 0.85 + n * 0.2); // retracted face = smooth stone
          if (px >= 2 && px <= 13 && py >= 2 && py <= 13) c = mul([0.7, 0.62, 0.42], 0.9 + n * 0.2); // wood pad
          if (px >= 5 && px <= 10 && py >= 5 && py <= 10) c = [0.3, 0.24, 0.14];
          break;
        case 'piston_sticky':
          c = mul([0.5, 0.5, 0.52], 0.85 + n * 0.2);
          if (px >= 2 && px <= 13 && py >= 2 && py <= 13) c = mul([0.55, 0.7, 0.4], 0.9 + n * 0.25); // green slime pad
          if (px >= 5 && px <= 10 && py >= 5 && py <= 10) c = [0.4, 0.55, 0.3];
          break;
        case 'piston_head':
          c = mul([0.7, 0.62, 0.42], 0.9 + n * 0.2); // protruding wood head
          if (py >= 6 && py <= 9) c = mul([0.5, 0.5, 0.52], 0.9); // stone collar
          break;
        case 'ladder':
          c = [0.0, 0.0, 0.0]; // transparent gaps render as backing
          if (px === 3 || px === 12) c = mul([0.55, 0.4, 0.24], 0.85 + n * 0.3); // two rails
          if ((py === 3 || py === 8 || py === 13) && px >= 3 && px <= 12) c = mul([0.6, 0.44, 0.26], 0.85 + n * 0.3); // rungs
          break;
        case 'door':
          // Canon oak door: framed panels with two glass windows up top and a
          // brass handle — unmistakably a door, not a plank block.
          c = mul([0.55, 0.4, 0.23], 0.9 + n * 0.12);                    // oak body
          if (px === 0 || px === 15 || py === 0 || py === 15) c = mul([0.36, 0.26, 0.15], 0.95); // frame
          if (py === 7 || py === 8 || px === 7 || px === 8) c = mul([0.42, 0.3, 0.17], 0.95);    // cross rails
          if (px >= 2 && px <= 6 && py >= 2 && py <= 6) c = [0.62, 0.78, 0.85];                  // window L
          if (px >= 9 && px <= 13 && py >= 2 && py <= 6) c = [0.62, 0.78, 0.85];                 // window R
          if ((px === 4 || px === 11) && py >= 2 && py <= 6) c = [0.45, 0.6, 0.68];              // pane bars
          if (px >= 2 && px <= 6 && py >= 10 && py <= 13) c = mul([0.66, 0.48, 0.28], 1.0);      // lower panels
          if (px >= 9 && px <= 13 && py >= 10 && py <= 13) c = mul([0.66, 0.48, 0.28], 1.0);
          if (px === 13 && py === 8) c = [0.85, 0.78, 0.3];                                       // handle
          break;
        case 'repeater':
        case 'repeater_on': {
          c = mul([0.62, 0.62, 0.64], 0.9 + n * 0.15); // smooth stone base
          const lit = kind === 'repeater_on';
          // two redstone torches running down the centre
          if (px >= 7 && px <= 8 && (py === 4 || py === 11)) c = lit ? [1.0, 0.2, 0.15] : [0.4, 0.08, 0.06];
          if (px >= 6 && px <= 9 && py >= 6 && py <= 9) c = lit ? [0.85, 0.15, 0.1] : [0.35, 0.07, 0.05]; // line
          break;
        }
        case 'observer':
          c = mul([0.33, 0.33, 0.35], 0.85 + n * 0.2); // dark stone body
          if (py === 0 || py === 15 || px === 0 || px === 15) c = mul(c, 0.7);
          if ((px + py) % 6 === 0) c = mul(c, 1.15); // speckle
          break;
        case 'observer_face':
          c = mul([0.3, 0.3, 0.32], 0.85 + n * 0.2);
          if (px >= 3 && px <= 12 && py >= 3 && py <= 12) c = [0.7, 0.15, 0.12]; // red sensor face
          if (px >= 6 && px <= 9 && py >= 6 && py <= 9) c = [1.0, 0.25, 0.2];
          break;
        case 'hopper':
          c = mul([0.34, 0.35, 0.38], 0.85 + n * 0.2); // dark metal
          if (py >= 10 && (px <= 4 || px >= 11)) c = mul(c, 0.7); // tapering funnel sides
          break;
        case 'hopper_top':
          c = mul([0.3, 0.31, 0.34], 0.85 + n * 0.2);
          if (px >= 2 && px <= 13 && py >= 2 && py <= 13) c = [0.12, 0.12, 0.14]; // open trough
          break;
        case 'dispenser':
          c = mul([0.42, 0.42, 0.44], 0.85 + n * 0.2); // cobble-like
          if (pnoise(px * 1.6 + 2, py * 1.6 + 4) > 0.8) c = mul(c, 0.7);
          break;
        case 'dispenser_front':
          c = mul([0.42, 0.42, 0.44], 0.85 + n * 0.2);
          if (px >= 5 && px <= 10 && py >= 4 && py <= 11) c = [0.1, 0.1, 0.11]; // firing nozzle
          break;
        case 'dropper_front':
          c = mul([0.42, 0.42, 0.44], 0.85 + n * 0.2);
          if (px >= 5 && px <= 10 && py >= 5 && py <= 10) c = [0.12, 0.12, 0.13]; // square port
          break;
        case 'composter':
          c = mul([0.55, 0.42, 0.24], 0.85 + n * 0.2); // wood slats
          if (px === 0 || px === 7 || px === 8 || px === 15) c = mul(c, 0.7); // vertical staves
          break;
        case 'composter_top':
          c = mul([0.5, 0.38, 0.22], 0.85 + n * 0.2); // rim
          if (px >= 2 && px <= 13 && py >= 2 && py <= 13) c = mul([0.34, 0.5, 0.18], 0.8 + n * 0.4); // green compost
          break;
        case 'lectern_top':
          c = mul([0.58, 0.45, 0.26], 0.85 + n * 0.2); // slanted stand
          if (px >= 3 && px <= 12 && py >= 3 && py <= 12) c = mul([0.85, 0.78, 0.55], 0.9); // open book pages
          if (px === 8) c = mul([0.5, 0.4, 0.26], 0.9); // spine
          break;
        case 'map_top':
          c = mul([0.86, 0.84, 0.76], 0.9 + n * 0.1); // parchment
          if ((px + py) % 7 === 0) c = [0.6, 0.45, 0.3]; // map lines
          if (px >= 6 && px <= 9 && py >= 6 && py <= 9) c = [0.7, 0.2, 0.2]; // red marker
          break;
        case 'fletch_top':
          c = mul([0.8, 0.74, 0.56], 0.9 + n * 0.12); // sanded top
          if (px === 4 || px === 11) c = [0.3, 0.22, 0.14]; // fletching saw marks (diagonal-ish)
          if (py === 4 || py === 11) c = mul(c, 0.85);
          break;
        case 'loom_top':
          c = mul([0.85, 0.8, 0.62], 0.9 + n * 0.12); // weave surface
          if (px % 3 === 0) c = mul([0.6, 0.5, 0.32], 0.9); // warp threads
          break;
        case 'stonecut_top':
          c = mul([0.6, 0.6, 0.62], 0.85 + n * 0.2); // stone bed
          if (px >= 7 && px <= 8 && py >= 1 && py <= 14) c = [0.85, 0.85, 0.88]; // saw blade
          break;
        case 'command':
          // Canon command block: tan body with a dotted "circuit" border and a
          // central glyph panel.
          c = mul([0.76, 0.6, 0.44], 0.9 + n * 0.14);
          if ((px + py) % 2 === 0 && (px < 2 || px > 13 || py < 2 || py > 13)) c = [0.45, 0.32, 0.22]; // dotted rim
          if (px >= 4 && px <= 11 && py >= 4 && py <= 11) c = mul([0.55, 0.42, 0.3], 0.95); // panel
          if (px >= 6 && px <= 9 && py >= 6 && py <= 9) c = [0.85, 0.72, 0.5]; // glyph core
          break;
        case 'bamboo':
          c = [0.05, 0.08, 0.04]; // dark backing (mostly transparent gaps)
          if (px >= 6 && px <= 9) c = mul([0.46, 0.62, 0.24], 0.85 + n * 0.3); // central stalk
          if (px >= 6 && px <= 9 && (py === 2 || py === 7 || py === 12)) c = mul([0.34, 0.48, 0.18], 0.9); // node rings
          break;
        default:
          c = mul(base, 0.9 + n * 0.2);
      }
      put(px, py, c);
    }
  }
}

/**
 * Build a 3-tile (top|side|bottom) pixel-art atlas texture for a block, or null
 * if no canvas is available (headless) so the engine falls back to flat colours.
 * @param {number} blockId
 * @returns {THREE.CanvasTexture|null}
 */
function buildBlockTexture(blockId) {
  if (typeof document === 'undefined') return null;
  let canvas, ctx;
  try {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext && canvas.getContext('2d');
  } catch { return null; }
  if (!ctx) return null;

  canvas.width = TILE * 3;
  canvas.height = TILE;
  const cfg = TEX[blockId] || { all: 'plain' };
  const faces = ['top', 'side', 'bottom'];
  for (let t = 0; t < 3; t++) {
    const kind = cfg.all || cfg[faces[t]] || 'plain';
    const base = cfg.base || getFaceColor(blockId, faces[t]);
    paintTile(ctx, t * TILE, kind, base, cfg.accent || base);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter; // no mipmaps => no atlas-tile bleeding
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a unit cube with UVs remapped to the 3-tile atlas and per-vertex AO
 * shading. When `textured` is false, the face colour is baked into the vertex
 * colour (× AO) so the block is still tinted without a texture.
 * @param {number} blockId @param {boolean} textured
 */
/** Concatenate several indexed BoxGeometries into one (position/normal/uv). */
function mergeBoxes(geos) {
  const posArr = [], normArr = [], uvArr = [], idxArr = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array;
    const idx = g.index.array;
    for (let i = 0; i < p.length; i++) posArr.push(p[i]);
    for (let i = 0; i < n.length; i++) normArr.push(n[i]);
    for (let i = 0; i < u.length; i++) uvArr.push(u[i]);
    for (let i = 0; i < idx.length; i++) idxArr.push(idx[i] + offset);
    offset += p.length / 3;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  m.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
  m.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  m.setIndex(idxArr);
  return m;
}

function buildBlockGeometry(blockId, textured) {
  const shape = BLOCKS[blockId]?.shape;
  let geo;
  if (shape === 'slab') {
    geo = new THREE.BoxGeometry(1, 0.5, 1);   // bottom half of the cell
    geo.translate(0, -0.25, 0);
  } else if (shape === 'stairs') {
    const base = new THREE.BoxGeometry(1, 0.5, 1); base.translate(0, -0.25, 0);     // bottom slab
    const step = new THREE.BoxGeometry(1, 0.5, 0.5); step.translate(0, 0.25, -0.25); // back top step
    geo = mergeBoxes([base, step]);
  } else {
    geo = new THREE.BoxGeometry(1, 1, 1);
  }
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);

  // Box face order: +X, -X, +Y(top), -Y(bottom), +Z, -Z (4 verts each). For
  // merged multi-box shapes the role repeats every 6 faces (24 verts).
  for (let i = 0; i < pos.count; i++) {
    const faceIndex = Math.floor(i / 4) % 6;
    const face = faceIndex === 2 ? 'top' : faceIndex === 3 ? 'bottom' : 'side';
    const ao = AO[face];

    // Remap U into this face's atlas tile (top=0, side=1, bottom=2).
    const tile = face === 'top' ? 0 : face === 'bottom' ? 2 : 1;
    const u = uv.getX(i);
    uv.setX(i, (tile + u) / 3);

    if (textured) {
      colors[i * 3] = ao; colors[i * 3 + 1] = ao; colors[i * 3 + 2] = ao;
    } else {
      const [r, g, b] = getFaceColor(blockId, face);
      colors[i * 3] = r * ao; colors[i * 3 + 1] = g * ao; colors[i * 3 + 2] = b * ao;
    }
  }
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * A lazily-populated registry of geometries, textures and materials keyed by
 * block id. Shared across every chunk so we never duplicate GPU resources.
 */
class BlockAssetRegistry {
  constructor() {
    this.geometries = new Map();
    this.materials = new Map();
    this.textures = new Map();
    /** @type {THREE.Material[]} water materials, animated each frame. */
    this.waterMaterials = [];
    this.useTextures = this._canvasSupported();
  }

  _canvasSupported() {
    try {
      if (typeof document === 'undefined') return false;
      const c = document.createElement('canvas');
      return !!(c.getContext && c.getContext('2d'));
    } catch { return false; }
  }

  getTexture(blockId) {
    if (!this.textures.has(blockId)) this.textures.set(blockId, buildBlockTexture(blockId));
    return this.textures.get(blockId);
  }

  getGeometry(blockId) {
    let geo = this.geometries.get(blockId);
    if (!geo) {
      geo = buildBlockGeometry(blockId, this.useTextures);
      this.geometries.set(blockId, geo);
    }
    return geo;
  }

  getMaterial(blockId) {
    let mat = this.materials.get(blockId);
    if (!mat) {
      const def = BLOCKS[blockId];
      const opts = {
        vertexColors: true,
        transparent: !!def.transparent,
        opacity: def.opacity ?? 1.0
      };
      if (this.useTextures) opts.map = this.getTexture(blockId);
      mat = new THREE.MeshLambertMaterial(opts);
      if (def.transparent) {
        mat.depthWrite = !def.liquid; // liquids should not block depth.
        mat.side = THREE.DoubleSide;
      }
      if (def.liquid) this.waterMaterials.push(mat);
      this.materials.set(blockId, mat);
    }
    return mat;
  }
}

/* -------------------------------------------------------------------------- */
/*  Chunk                                                                       */
/* -------------------------------------------------------------------------- */

class Chunk {
  /**
   * @param {number} cx @param {number} cz
   */
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.group = new THREE.Group();
    this.group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    /** @type {Map<number, THREE.InstancedMesh>} */
    this.meshes = new Map();
    this.dirty = true;
    this.decorated = false; // trees/village/edits applied yet?
  }

  static index(lx, ly, lz) {
    return ly * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
  }

  getLocal(lx, ly, lz) {
    if (ly < 0 || ly >= WORLD_HEIGHT) return AIR;
    return this.voxels[Chunk.index(lx, ly, lz)];
  }

  setLocal(lx, ly, lz, id) {
    if (ly < 0 || ly >= WORLD_HEIGHT) return;
    this.voxels[Chunk.index(lx, ly, lz)] = id;
    this.dirty = true;
  }

  /** Remove this chunk's instanced meshes from its group (shared GPU
   * geometry/materials are NOT disposed — they're reused by other chunks). */
  teardown() {
    for (const mesh of this.meshes.values()) this.group.remove(mesh);
    this.meshes.clear();
  }
}

/* -------------------------------------------------------------------------- */
/*  World                                                                       */
/* -------------------------------------------------------------------------- */

export class World {
  /**
   * @param {THREE.Scene} scene
   * @param {number} seed
   */
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.noise = new NoiseGenerator(this.seed);
    this.assets = new BlockAssetRegistry();

    /** @type {Map<string, Chunk>} */
    this.chunks = new Map();
    this._waterTime = 0;
    /** Reused matrix to avoid per-instance allocation. */
    this._tmpMatrix = new THREE.Matrix4();

    /** Active dimension: 'overworld' | 'nether'. */
    this.dimension = 'overworld';

    /** Pending loot for generated chests: "x,y,z" -> [{type,count}]. */
    this.loot = {};

    /** Centres of generated villages: [{x,z}] (used to populate residents). */
    this.villages = [];
  }

  /**
   * Switch dimension: unload every chunk (so the next streamAround regenerates
   * the new dimension's terrain) and re-seed the noise per-dimension.
   * @param {'overworld'|'nether'} dimension
   */
  setDimension(dimension) {
    this.dimension = dimension;
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.group);
      chunk.teardown();
    }
    this.chunks.clear();
    // Distinct noise per dimension so each looks nothing like the surface.
    const off = dimension === 'nether' ? 0x9e3779b9 : dimension === 'end' ? 0x517cc1b7 : 0;
    this.noise = new NoiseGenerator((this.seed ^ off) >>> 0);
  }

  /* ----------------------------- voxel access ---------------------------- */

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) ?? null;
  }

  /**
   * @param {number} wx @param {number} wy @param {number} wz
   * @returns {number} block id (AIR when out of bounds / ungenerated)
   */
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return AIR;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.getLocal(lx, wy, lz);
  }

  /**
   * Write a block and mark the affected chunk(s) dirty so their meshes rebuild.
   * @param {number} wx @param {number} wy @param {number} wz @param {number} id
   * @returns {boolean} whether the write landed in a loaded chunk
   */
  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    chunk.setLocal(lx, wy, lz, id);

    // Edits on a chunk border also dirty the neighbour so its faces re-cull.
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._markDirty(cx, cz + 1);
    return true;
  }

  _markDirty(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (c) c.dirty = true;
  }

  /* --------------------------- generation -------------------------------- */

  /**
   * Generate / stream the square region of chunks around a centre (infinite
   * world). New chunks get terrain + caves + ores, then trees, villages and any
   * persisted player edits; chunks that fall outside the keep-radius are
   * unloaded. Called on spawn and whenever the player crosses a chunk border.
   *
   * @param {number} centerCx @param {number} centerCz
   * @param {number} radius keep-radius in chunks
   * @param {Record<string, number>} [edits] persisted "x,y,z" -> id overrides
   * @returns {number} how many new chunks were generated this call
   */
  streamAround(centerCx, centerCz, radius, edits = {}) {
    // Phase 1 — terrain for every missing chunk in range (so neighbours exist
    // before we decorate).
    const fresh = [];
    for (let cz = centerCz - radius; cz <= centerCz + radius; cz++) {
      for (let cx = centerCx - radius; cx <= centerCx + radius; cx++) {
        if (this.chunks.has(chunkKey(cx, cz))) continue;
        const chunk = new Chunk(cx, cz);
        this.chunks.set(chunkKey(cx, cz), chunk);
        this.scene.add(chunk.group);
        this._fillChunkTerrain(chunk);
        fresh.push(chunk);
      }
    }

    // Phase 2 — decorate the new chunks (trees + villages) now neighbours exist.
    for (const chunk of fresh) {
      this._plantTrees(chunk);
      this._generateVillage(chunk);
      this._generateStructures(chunk);
      chunk.decorated = true;
    }

    // Phase 3 — replay persisted edits that land in the new chunks.
    if (fresh.length) {
      const freshKeys = new Set(fresh.map((c) => chunkKey(c.cx, c.cz)));
      for (const key in edits) {
        const [x, y, z] = key.split(',').map(Number);
        const ck = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
        if (freshKeys.has(ck)) this.setBlock(x, y, z, edits[key]);
      }
      // Re-cull neighbours of new chunks at their shared borders.
      for (const c of fresh) {
        this._markDirty(c.cx + 1, c.cz); this._markDirty(c.cx - 1, c.cz);
        this._markDirty(c.cx, c.cz + 1); this._markDirty(c.cx, c.cz - 1);
      }
    }

    // Phase 4 — unload chunks beyond the keep-radius (+1 buffer).
    this._unloadOutside(centerCx, centerCz, radius + 1);

    // Phase 5 — (re)build any dirty meshes.
    this.rebuildDirtyChunks();
    return fresh.length;
  }

  /** Backwards-compatible alias used for the initial spawn load. */
  generate(centerCx, centerCz, radius, edits = {}) {
    return this.streamAround(centerCx, centerCz, radius, edits);
  }

  /** Unload chunks whose Chebyshev distance from the centre exceeds `keep`. */
  _unloadOutside(centerCx, centerCz, keep) {
    for (const [key, chunk] of this.chunks) {
      if (Math.max(Math.abs(chunk.cx - centerCx), Math.abs(chunk.cz - centerCz)) > keep) {
        chunk.teardown();
        this.scene.remove(chunk.group);
        this.chunks.delete(key);
        // Neighbours that remain should re-cull toward the now-empty space.
        this._markDirty(chunk.cx + 1, chunk.cz); this._markDirty(chunk.cx - 1, chunk.cz);
        this._markDirty(chunk.cx, chunk.cz + 1); this._markDirty(chunk.cx, chunk.cz - 1);
      }
    }
  }

  /**
   * Classify a column's biome from temperature/moisture/elevation noise and
   * compute its surface height.
   * @param {number} wx @param {number} wz
   * @returns {{ biome: string, height: number }}
   */
  sampleColumn(wx, wz) {
    const elevation = this.noise.fbm2(wx * 0.010, wz * 0.010, {
      octaves: 5, persistence: 0.5, lacunarity: 2.0
    });
    const temperature = this.noise.fbm2((wx - 4000) * 0.005, (wz + 4000) * 0.005, { octaves: 3 });
    const moisture = this.noise.fbm2((wx + 8000) * 0.006, (wz - 8000) * 0.006, { octaves: 3 });

    // Base rolling height with an amplified mountain mask, and deep ocean
    // basins where the continent noise dips low.
    let height = SEA_LEVEL + elevation * 11;
    if (elevation > 0.35) height += (elevation - 0.35) * 75; // crags
    if (elevation < -0.2) height = SEA_LEVEL - 8 + (elevation + 0.2) * 55; // deep ocean basins
    height = Math.round(height);
    // No knee-deep water: every submerged column is at least 4 deep, and real
    // oceans plunge (depth amplified toward the basin centres).
    if (height < SEA_LEVEL) {
      const depth = SEA_LEVEL - height;
      height = SEA_LEVEL - Math.max(4, Math.round(depth * 2.2));
    }
    height = Math.max(2, Math.min(WORLD_HEIGHT - 6, height));

    let biome;
    if (height < SEA_LEVEL - 1) {
      biome = BIOME.OCEAN;
    } else if (height <= SEA_LEVEL + 1) {
      biome = BIOME.BEACH;            // sandy shoreline just above the water
    } else if (height > SEA_LEVEL + 16) {
      biome = BIOME.MOUNTAIN;
    } else if (temperature < -0.25) {
      biome = BIOME.SNOWY;
    } else if (temperature < -0.05) {
      biome = BIOME.TAIGA;            // cold conifer forest (spruce)
    } else if (temperature > 0.28 && moisture > 0.1) {
      biome = BIOME.JUNGLE;
    } else if (temperature > 0.25 && moisture < -0.05) {
      biome = BIOME.DESERT;
    } else if (temperature > 0.12 && moisture < 0.0) {
      biome = BIOME.SAVANNA;          // warm, dry grassland
    } else if (moisture > 0.12) {
      biome = BIOME.FOREST;           // wet temperate woodland (oak + birch)
    } else {
      biome = BIOME.PLAINS;
    }
    return { biome, height };
  }

  /**
   * Fill a single chunk's voxel grid: terrain layers, ores, caves and water.
   * @param {Chunk} chunk
   */
  _fillChunkTerrain(chunk) {
    if (this.dimension === 'nether') { this._fillNetherTerrain(chunk); return; }
    if (this.dimension === 'end') { this._fillEndTerrain(chunk); return; }
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const { biome, height } = this.sampleColumn(wx, wz);
        const underwater = height < SEA_LEVEL;

        for (let y = 0; y <= height; y++) {
          let id;
          if (y === 0) {
            id = 4; // Bedrock floor.
          } else if (y === height) {
            id = this._surfaceBlock(biome, height, underwater);
          } else if (y > height - 4) {
            // Sub-surface.
            if (biome === BIOME.DESERT) {
              id = y >= height - 2 ? 7 : 21;          // sand over sandstone
            } else if (biome === BIOME.OCEAN || biome === BIOME.BEACH || underwater) {
              // Sandy bed with the odd clay deposit near the surface.
              id = (y >= height - 2 && this.noise.hash3(wx, y, wz) < 0.07) ? 39 : 7;
            } else if (biome === BIOME.MOUNTAIN) {
              id = 3;
            } else {
              id = 2; // dirt
            }
          } else {
            id = this._stoneOrOre(wx, y, wz); // deep: stone with ore pockets
          }

          // Carve caves out of solid sub-surface rock (but never bedrock).
          if (y > 1 && y < height - 1 && this._isCave(wx, y, wz)) {
            id = AIR;
          }
          if (id !== AIR) chunk.setLocal(lx, y, lz, id);
        }

        // Flood water up to sea level over submerged columns. In cold biomes
        // the very top freezes into a sheet of ice.
        if (underwater) {
          for (let y = height + 1; y <= SEA_LEVEL; y++) {
            const freeze = (biome === BIOME.SNOWY || biome === BIOME.TAIGA) && y === SEA_LEVEL;
            chunk.setLocal(lx, y, lz, freeze ? 38 : 8);
          }
        }
      }
    }
  }

  /**
   * Fill a chunk with Nether terrain: a netherrack floor + ceiling enclosing an
   * open cavern, a bedrock cap top and bottom, a lava sea in the depths, soul
   * sand, quartz ore and glowstone clusters.
   * @param {Chunk} chunk
   */
  _fillNetherTerrain(chunk) {
    const roof = NETHER_ROOF; // the Nether is a compact cavern band; above is void
    const LAVA = 8;
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const floorH = 14 + Math.floor(this.noise.fbm2(wx * 0.04, wz * 0.04, { octaves: 3 }) * 8);
        const ceilH = roof - 5 - Math.floor(this.noise.fbm2((wx + 500) * 0.04, (wz - 500) * 0.04, { octaves: 3 }) * 8);
        // Biome mask: large soul sand valleys sweep across the floor.
        const soulValley = this.noise.fbm2((wx - 900) * 0.02, (wz + 900) * 0.02, { octaves: 2 }) > 0.25;

        for (let y = 0; y <= roof; y++) {
          let id = AIR;
          if (y === 0 || y === roof) id = 4;          // bedrock cap
          else if (y <= floorH || y >= ceilH) id = 53; // netherrack masses

          // Carve blobby caverns through the netherrack.
          if (id === 53 && y > 1 && y < roof) {
            if (Math.abs(this.noise.perlin3(wx * 0.07, y * 0.10, wz * 0.07)) > 0.62) id = AIR;
          }
          // Ore / soul sand inside the ground mass.
          if (id === 53) {
            const v = this.noise.hash3(wx, y, wz);
            if (y <= floorH && soulValley && y >= floorH - 3) id = 55; // valley floor is soul sand
            else if (y <= floorH && v < 0.03) id = 55;   // scattered soul sand pockets
            else if (v >= 0.03 && v < 0.055) id = 56;    // nether quartz ore (a touch richer)
            else if (y < 22 && v >= 0.055 && v < 0.059) id = 73; // ancient debris (rare, deep)
          }
          if (id !== AIR) chunk.setLocal(lx, y, lz, id);
        }

        // Lava sea in the depths.
        for (let y = 1; y <= LAVA; y++) if (chunk.getLocal(lx, y, lz) === AIR) chunk.setLocal(lx, y, lz, 54);

        // Glowstone clusters hanging under the ceiling (small chandeliers).
        if (this.noise.hash2(wx * 1.3 + 7, wz * 1.3) < 0.02) {
          for (let y = ceilH; y > LAVA; y--) {
            if (chunk.getLocal(lx, y, lz) === AIR) {
              chunk.setLocal(lx, y, lz, 36);
              if (this.noise.hash2(wx, y) < 0.5 && y - 1 > LAVA) chunk.setLocal(lx, y - 1, lz, 36);
              break;
            }
          }
        }
        // Nether wart sprouting on exposed soul sand.
        if (this.noise.hash2(wx * 1.7 + 3, wz * 1.7 + 9) < 0.05) {
          for (let y = floorH; y > LAVA; y--) {
            if (chunk.getLocal(lx, y, lz) === 55 && chunk.getLocal(lx, y + 1, lz) === AIR) {
              chunk.setLocal(lx, y + 1, lz, 66); break;
            }
          }
        }
      }
    }

    // Nether fortress: rare crossing-bridge complex with a central keep.
    if (this.noise.hash2(chunk.cx * 419 + 3, chunk.cz * 419 + 31) < 0.02) {
      this._buildNetherFortress(baseX + 8, baseZ + 8);
    }
    // Bastion remnant: rarer still, and never in a fortress chunk.
    else if (this.noise.hash2(chunk.cx * 787 + 5, chunk.cz * 787 + 19) < 0.015) {
      this._buildBastion(baseX + 8, baseZ + 8);
    }
  }

  /**
   * Wiki-style Nether Fortress: two long crossing bridges of nether brick on
   * arched support pillars over the lava, meeting at a central enclosed keep
   * with a blaze-spawner platform, window slits and twin loot chests.
   */
  _buildNetherFortress(cx, cz) {
    const Y = 34;      // bridge deck height above the lava sea
    const L = 20;      // bridge half-length
    const NB = 57;     // nether bricks

    // --- Two crossing bridges (3 wide, guard rails, support pillars). ---
    const deck = (dx, dz) => {
      const x = cx + dx, z = cz + dz;
      this.setBlock(x, Y, z, NB);
    };
    for (let d = -L; d <= L; d++) {
      for (let w = -1; w <= 1; w++) { deck(d, w); deck(w, d); }
      // Guard rails along both edges every other block.
      if ((d & 1) === 0) {
        this.setBlock(cx + d, Y + 1, cz - 2, NB); this.setBlock(cx + d, Y + 1, cz + 2, NB);
        this.setBlock(cx - 2, Y + 1, cz + d, NB); this.setBlock(cx + 2, Y + 1, cz + d, NB);
      }
      // Support pillars down to the netherrack/lava every 6 blocks.
      if (d % 6 === 0) {
        for (const [px, pz] of [[cx + d, cz], [cx, cz + d]]) {
          for (let y = Y - 1; y > 4; y--) {
            if (this.getBlock(px, y, pz) !== AIR && this.getBlock(px, y, pz) !== 54) break;
            this.setBlock(px, y, pz, NB);
          }
        }
      }
    }

    // --- Central keep: 9×9, two floors, windowed walls. ---
    const R = 4, H = 8;
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dy = 0; dy <= H; dy++) {
          const x = cx + dx, y = Y + dy, z = cz + dz;
          const shell = Math.abs(dx) === R || Math.abs(dz) === R || dy === 0 || dy === H;
          if (!shell) { this.setBlock(x, y, z, AIR); continue; }
          // Window slits on the upper floor.
          if ((Math.abs(dx) === R || Math.abs(dz) === R) && dy === 5 && ((dx + dz) & 1)) continue;
          this.setBlock(x, y, z, NB);
        }
      }
    }
    // Doorways where the bridges enter the keep (both axes, ground floor).
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      for (const s of [-1, 1]) {
        for (let dy = 1; dy <= 2; dy++) {
          this.setBlock(cx + ax * R * s, Y + dy, cz + az * R * s, AIR);
          this.setBlock(cx + ax * (R * s - s), Y + dy, cz + az * (R * s - s), AIR);
        }
      }
    }
    // Blaze spawner on a raised interior platform + stairs of nether brick.
    this.setBlock(cx, Y + 1, cz, NB);
    this.setBlock(cx, Y + 2, cz, 85);
    // Nether wart bed in one corner (soul sand + wart, the fortress classic).
    for (const dz of [-2, -1]) {
      this.setBlock(cx - 2, Y + 1, cz + dz, 55);
      this.setBlock(cx - 2, Y + 2, cz + dz, 66);
    }
    // Twin loot chests.
    for (const [lx, lz, key] of [[2, 2, 'a'], [-2, 2, 'b']]) {
      this.setBlock(cx + lx, Y + 1, cz + lz, 65);
      this.loot[`${cx + lx},${Y + 1},${cz + lz}`] = key === 'a'
        ? [{ type: 'blaze_rod', count: 2 }, { type: 'nether_wart', count: 4 },
           { type: 'gold_ingot', count: 5 }, { type: 'saddle', count: 1 }]
        : [{ type: 'obsidian', count: 3 }, { type: 'iron_ingot', count: 4 },
           { type: 'flint_and_steel', count: 1 }, { type: 'diamond', count: 1 }];
    }
  }

  /**
   * Bastion Remnant: a hulking deepslate-and-gold ruin rising from the
   * netherrack — thick ramparts, an open central courtyard with a bridge,
   * gold-block accents and a treasure room stacked with netherite loot.
   */
  _buildBastion(cx, cz) {
    const Y = 24, R = 9, H = 16, DS = 70, GOLD = 48;
    // Outer ramparts: a hollow square keep with crumbled top edges.
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const wall = Math.abs(dx) >= R - 1 || Math.abs(dz) >= R - 1;
        for (let dy = 0; dy <= H; dy++) {
          const x = cx + dx, y = Y + dy, z = cz + dz;
          if (dy === 0) { this.setBlock(x, y, z, DS); continue; }        // floor
          if (wall) {
            // Ruined silhouette: the top few blocks crumble away irregularly.
            const crumble = dy > H - 4 && this.noise.hash3(x, y, z) < 0.45;
            if (!crumble) this.setBlock(x, y, z, this.noise.hash3(x, y, z) < 0.06 ? GOLD : DS);
          } else if (dy <= H) {
            this.setBlock(x, y, z, AIR);                                  // courtyard air
          }
        }
      }
    }
    // Courtyard bridge across the middle at mid-height.
    for (let dx = -R + 2; dx <= R - 2; dx++) this.setBlock(cx + dx, Y + 6, cz, DS);
    // Gate: a tall opening in the south rampart.
    for (let dy = 1; dy <= 4; dy++) for (let dx = -1; dx <= 1; dx++) {
      this.setBlock(cx + dx, Y + dy, cz - R, AIR); this.setBlock(cx + dx, Y + dy, cz - R + 1, AIR);
    }
    // Treasure room: gold-block pile + the netherite chest.
    for (const [gx, gz] of [[2, 2], [3, 2], [2, 3]]) this.setBlock(cx + gx, Y + 1, cz + gz, GOLD);
    this.setBlock(cx - 2, Y + 1, cz + 2, 65);
    this.loot[`${cx - 2},${Y + 1},${cz + 2}`] = [
      { type: 'netherite_scrap', count: 2 }, { type: 'ancient_debris', count: 1 },
      { type: 'gold_ingot', count: 8 }, { type: 'gold_block', count: 1 },
      { type: 'obsidian', count: 4 }, { type: 'golden_apple', count: 1 }
    ];
  }

  /**
   * Fill a chunk with End terrain: a floating end-stone island around the world
   * origin, surrounded by void, ringed by 10 obsidian pillars near the centre.
   * @param {Chunk} chunk
   */
  _fillEndTerrain(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const CY = 32;        // island surface level
    const R = 46;         // base island radius

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx, wz = baseZ + lz;
        const dist = Math.hypot(wx, wz);
        const edge = R + this.noise.fbm2(wx * 0.05, wz * 0.05, { octaves: 3 }) * 12;
        if (dist < edge) {
          const thick = 3 + Math.floor((1 - dist / edge) * 7); // domed underside
          for (let y = CY - thick; y <= CY; y++) chunk.setLocal(lx, y, lz, 60);
          continue;
        }
        // Outer islands: small floating end-stone discs far from the centre.
        if (dist > 90) {
          const o = this.noise.fbm2((wx + 3000) * 0.03, (wz - 3000) * 0.03, { octaves: 2 });
          if (o > 0.42) {
            const t = 2 + Math.floor((o - 0.42) * 12);
            for (let y = CY - t; y <= CY - 1; y++) chunk.setLocal(lx, y, lz, 60);
          }
        }
      }
    }

    // Ten HUGE obsidian pillars (3×3, up to 38 tall) ringing the island, each
    // crowned with an End Crystal — a bedrock base with a glowing core.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const px = Math.round(Math.cos(a) * 24);
      const pz = Math.round(Math.sin(a) * 24);
      const h = 22 + (i % 5) * 4; // 22..38 tall, staggered like the wiki ring
      for (let ox2 = -1; ox2 <= 1; ox2++) {
        for (let oz2 = -1; oz2 <= 1; oz2++) {
          const X = px + ox2, Z = pz + oz2;
          if (X < baseX || X >= baseX + CHUNK_SIZE || Z < baseZ || Z >= baseZ + CHUNK_SIZE) continue;
          for (let y = CY + 1; y <= CY + h; y++) this.setBlock(X, y, Z, 35); // obsidian shaft
          // Crystal pedestal: bedrock slab across the top…
          this.setBlock(X, CY + h + 1, Z, 4);
        }
      }
      // …with the glowing crystal itself in the centre (2 blocks of light).
      if (px >= baseX && px < baseX + CHUNK_SIZE && pz >= baseZ && pz < baseZ + CHUNK_SIZE) {
        this.setBlock(px, CY + h + 2, pz, 36);
        this.setBlock(px, CY + h + 3, pz, 36);
      }
    }
  }

  /** Find a safe standing Y in the Nether (solid floor with 2 air above). */
  getNetherSpawnY(wx, wz) {
    for (let y = NETHER_ROOF - 4; y > 10; y--) {
      if (isSolid(this.getBlock(wx, y, wz)) && isAir(this.getBlock(wx, y + 1, wz)) && isAir(this.getBlock(wx, y + 2, wz))) {
        return y + 1;
      }
    }
    return 16;
  }

  /** Surface block for a biome column. */
  _surfaceBlock(biome, height, underwater) {
    if (underwater) return 7;              // sandy bed
    switch (biome) {
      case BIOME.OCEAN: return 7;          // sand
      case BIOME.BEACH: return 7;          // sand
      case BIOME.DESERT: return 7;         // sand
      case BIOME.SNOWY: return 13;         // snow
      case BIOME.TAIGA: return 1;          // grass (snow dusting via trees)
      case BIOME.MOUNTAIN: return height > SEA_LEVEL + 26 ? 13 : 3; // snowy peaks
      case BIOME.JUNGLE:
      case BIOME.FOREST:
      case BIOME.SAVANNA:
      case BIOME.PLAINS:
      default: return 1;                   // grass
    }
  }

  /**
   * Stone, or an ore selected by a depth-gated deterministic roll. Lower
   * blocks have a chance of rarer ores (diamond near bedrock).
   * @param {number} wx @param {number} y @param {number} wz
   * @returns {number} block id
   */
  _stoneOrOre(wx, y, wz) {
    const v = this.noise.hash3(wx, y, wz);
    // Wiki-style depth bands, rescaled for the 256-deep world (surface ~190).
    if (y < 60 && v < 0.010) return 17;                 // diamond (deepest)
    if (y < 85 && v >= 0.010 && v < 0.022) return 16;   // gold
    if (y < 170 && v >= 0.022 && v < 0.045) return 10;  // iron
    if (v >= 0.045 && v < 0.080) return 15;             // coal (any depth)
    if (y < 70 && v >= 0.080 && v < 0.095) return 41;   // redstone (deep)
    if (y < 120 && v >= 0.095 && v < 0.106) return 40;  // lapis
    if (y < 80 && v >= 0.106 && v < 0.109) return 42;   // emerald (rare)
    // Stone variant pockets (cosmetic geology).
    if (v >= 0.110 && v < 0.140) return 20;             // gravel
    if (v >= 0.140 && v < 0.180) return 27;             // granite
    if (v >= 0.180 && v < 0.220) return 26;             // diorite
    if (y < 150 && v >= 0.260 && v < 0.300) return 68;  // copper ore
    if (v >= 0.220 && v < 0.260) return 25;             // andesite
    return y < 100 ? 70 : 3;                            // deepslate layer, else stone
  }

  /**
   * Whether the voxel at (wx,wy,wz) should be carved into a cave. Blobby
   * caverns from low-frequency 3D noise, biased to stay underground.
   */
  _isCave(wx, wy, wz) {
    if (wy >= SEA_LEVEL + 2) return false; // keep surfaces mostly intact
    const n = this.noise.perlin3(wx * 0.06, wy * 0.10, wz * 0.06);
    // Slightly roomier caverns near diamond level, without exploding the
    // exposed-face count across 190 blocks of rock.
    const threshold = wy < 80 ? 0.53 : 0.56;
    return Math.abs(n) > threshold;
  }

  /**
   * Plant trees per biome: oaks in plains/snowy, dense tall jungle trees in
   * jungle. Placement is keyed on world coords so it's stable across reloads.
   * @param {Chunk} chunk
   */
  _plantTrees(chunk) {
    if (this.dimension !== 'overworld') return; // no trees in other dimensions
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const { biome, height } = this.sampleColumn(wx, wz);
        if (height < SEA_LEVEL) continue;

        const surface = chunk.getLocal(lx, height, lz);
        const onGrass = surface === 1;
        const onSnow = surface === 13;
        const onSand = surface === 7;

        // Desert: occasional 1–3 tall cactus columns.
        if (biome === BIOME.DESERT && onSand) {
          const r = this.noise.hash2(wx * 1.7 + 5, wz * 1.7 + 3);
          if (r < 0.014 && this.noise.hash2(wx + 1, wz) > 0.05 && this.noise.hash2(wx, wz + 1) > 0.05) {
            const tall = 1 + (Math.floor(r * 9000) % 3);
            for (let i = 0; i < tall; i++) this.setBlock(wx, height + 1 + i, wz, 32);
          }
          continue;
        }
        // Plains/savanna: rare pumpkins on the grass.
        if ((biome === BIOME.PLAINS || biome === BIOME.SAVANNA) && onGrass) {
          if (this.noise.hash2(wx * 2.3 + 11, wz * 2.3 + 7) < 0.004) {
            this.setBlock(wx, height + 1, wz, 33);
            continue;
          }
        }
        // Jungle: scattered bamboo stalks rising from the floor.
        if (biome === BIOME.JUNGLE && onGrass &&
            this.noise.hash2(wx * 2.1 + 5, wz * 2.1 + 9) < 0.03) {
          const bh = 2 + (Math.floor(this.noise.hash2(wx, wz) * 100) % 3);
          for (let i = 1; i <= bh; i++) this.setBlock(wx, height + i, wz, 134);
          continue;
        }

        if (!onGrass && !onSnow) continue;

        let density = 0, type = 'oak';
        // Groves: one tree species per ~24-block cell, so forests read as
        // distinct biomes (oak wood, birch grove, dark forest, cherry grove)
        // rather than a random species salad.
        const grove = this.noise.hash2(Math.floor(wx / 24) * 53 + 7, Math.floor(wz / 24) * 53 + 3);
        switch (biome) {
          case BIOME.JUNGLE:  density = 0.10; type = grove < 0.25 ? 'mangrove' : 'jungle'; break;
          case BIOME.FOREST:  density = 0.12; type = grove < 0.18 ? 'cherry' : grove < 0.40 ? 'dark_oak' : grove < 0.68 ? 'birch' : 'oak'; break;
          case BIOME.TAIGA:   density = 0.10; type = 'spruce'; break;
          case BIOME.PLAINS:  density = 0.035; type = 'oak'; break; // plains = oak country
          case BIOME.SAVANNA: density = 0.025; type = 'acacia'; break;
          case BIOME.SNOWY:   density = 0.03; type = 'spruce'; break;
          default: density = 0;
        }
        if (density === 0) continue;

        const roll = this.noise.hash2(wx, wz);
        if (roll > density) continue;
        // Spacing: don't place if a stronger neighbour roll wins.
        if (this.noise.hash2(wx + 1, wz) < density) continue;
        if (this.noise.hash2(wx, wz + 1) < density) continue;

        this._spawnTree(wx, height + 1, wz, roll, type);
      }
    }
  }

  /**
   * Build a tree. Jungle trees are taller with darker (jungle) leaves.
   * @param {number} wx @param {number} baseY @param {number} wz
   * @param {number} roll @param {string} biome
   */
  _spawnTree(wx, baseY, wz, roll, type = 'oak') {
    const conf = {
      oak:    { log: 5, leaf: 6, min: 4, span: 3 },
      birch:  { log: 28, leaf: 29, min: 5, span: 3 },
      spruce: { log: 30, leaf: 31, min: 6, span: 3, conifer: true },
      jungle: { log: 5, leaf: 14, min: 7, span: 4 },
      acacia: { log: 89, leaf: 90, min: 5, span: 3 },
      cherry: { log: 92, leaf: 93, min: 5, span: 3 },
      dark_oak: { log: 128, leaf: 130, min: 6, span: 3 },
      mangrove: { log: 131, leaf: 133, min: 6, span: 3 }
    }[type] || { log: 5, leaf: 6, min: 4, span: 3 };

    const trunkHeight = conf.min + (Math.floor(roll * 90) % conf.span);
    const topY = baseY + trunkHeight;

    if (conf.conifer) {
      // Layered conical canopy for spruce.
      let r = 2;
      for (let y = topY; y >= topY - 4; y--) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > r) continue;
            if (dx === 0 && dz === 0 && y < topY) continue;
            if (isAir(this.getBlock(wx + dx, y, wz + dz))) this.setBlock(wx + dx, y, wz + dz, conf.leaf);
          }
        }
        r = r === 2 ? 1 : 2; // alternate radius => tiered look
      }
      this.setBlock(wx, topY + 1, wz, conf.leaf); // pointed tip
    } else {
      for (let dy = -2; dy <= 1; dy++) {
        const y = topY + dy;
        const radius = dy >= 1 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            if (dx === 0 && dz === 0 && dy < 1) continue;
            if (isAir(this.getBlock(wx + dx, y, wz + dz))) {
              this.setBlock(wx + dx, y, wz + dz, conf.leaf);
            }
          }
        }
      }
    }
    for (let i = 0; i < trunkHeight; i++) this.setBlock(wx, baseY + i, wz, conf.log);
  }

  /* ----------------------------- villages -------------------------------- */

  /**
   * Rarely build a small village (a cluster of plank houses) on flat plains.
   * Keyed on chunk coordinates so a given chunk always decides the same way.
   * @param {Chunk} chunk
   */
  /**
   * Rarely place a generated structure (underground dungeon, desert pyramid),
   * each with a loot chest. Keyed on chunk coords so it's stable.
   * @param {Chunk} chunk
   */
  _generateStructures(chunk) {
    if (this.dimension !== 'overworld') return;
    const cx = chunk.cx, cz = chunk.cz;

    // Underground dungeon: mossy room with a spawner + loot chest, at any depth.
    if (this.noise.hash2(cx * 313 + 5, cz * 313 + 11) < 0.05) {
      const wx = cx * CHUNK_SIZE + 4 + Math.floor(this.noise.hash2(cx, cz) * 6);
      const wz = cz * CHUNK_SIZE + 4 + Math.floor(this.noise.hash2(cz, cx) * 6);
      const y = 20 + Math.floor(this.noise.hash2(cx + 1, cz + 1) * 150);
      this._buildDungeon(wx, y, wz);
    }

    // Desert pyramid with a buried treasure chest.
    const ccx = cx * CHUNK_SIZE + 8, ccz = cz * CHUNK_SIZE + 8;
    if (this.sampleColumn(ccx, ccz).biome === BIOME.DESERT &&
        this.noise.hash2(cx * 557 + 3, cz * 557 + 7) < 0.06) {
      this._buildPyramid(ccx, ccz);
    }

    // Pillager outpost: a tall watchtower on plains/savanna with a loot chest.
    const b = this.sampleColumn(ccx, ccz).biome;
    if ((b === BIOME.PLAINS || b === BIOME.SAVANNA) &&
        this.noise.hash2(cx * 733 + 9, cz * 733 + 1) < 0.04) {
      this._buildOutpost(ccx, ccz);
    }

    // Stronghold: exactly one per 32x32-chunk region (~512 blocks apart), buried
    // deep in the rock (y ≈ 30-60, the modern-wiki "-40" band for this world).
    {
      const rx = Math.floor(cx / 32), rz = Math.floor(cz / 32);
      const pickX = Math.floor(this.noise.hash2(rx * 71 + 11, rz * 71 + 5) * 32);
      const pickZ = Math.floor(this.noise.hash2(rx * 73 + 3, rz * 73 + 17) * 32);
      if (cx === rx * 32 + pickX && cz === rz * 32 + pickZ) {
        const y = 30 + Math.floor(this.noise.hash2(cx + 2, cz + 2) * 30);
        this._buildStronghold(ccx, y, ccz);
      }
    }

    // Jungle temple: a mossy cobblestone ziggurat hiding treasure.
    if (b === BIOME.JUNGLE && this.noise.hash2(cx * 617 + 13, cz * 617 + 5) < 0.05) {
      this._buildJungleTemple(ccx, ccz);
    }

    // Ocean monument: a prismarine hall rising from a deep seabed.
    if (this.noise.hash2(cx * 887 + 19, cz * 887 + 29) < 0.03) {
      this._buildOceanMonument(ccx, ccz);
    }

    // Ruined portal: a broken obsidian frame amid netherrack rubble.
    if ((b === BIOME.PLAINS || b === BIOME.SAVANNA || b === BIOME.DESERT || b === BIOME.FOREST) &&
        this.noise.hash2(cx * 431 + 2, cz * 431 + 8) < 0.025) {
      this._buildRuinedPortal(ccx, ccz);
    }
  }

  /**
   * The GRAND stronghold (~3000 placed blocks): a five-room cobblestone +
   * mossy-cobblestone complex joined by corridors — main hall, two-storey
   * library, storage vault, monster cell, and the End Portal room, where an
   * obsidian dais awaits an Eye of Ender (use one on the dais to open the
   * 3×3 portal, exactly like the in-game mechanic).
   */
  _buildStronghold(cx, y, cz) {
    // Walls are cobble/mossy-cobble mix with occasional stone bricks.
    const wallBlock = (x, Y, z) => {
      const v = this.noise.hash3(x, Y, z);
      return v < 0.35 ? 23 : v < 0.85 ? 19 : 24; // mossy / cobble / stone bricks
    };
    const room = (ox, oz, rx, rz, H) => {
      for (let dx = -rx; dx <= rx; dx++) {
        for (let dz = -rz; dz <= rz; dz++) {
          for (let dy = 0; dy <= H; dy++) {
            const x = cx + ox + dx, Y = y + dy, z = cz + oz + dz;
            const shell = dx === -rx || dx === rx || dz === -rz || dz === rz || dy === 0 || dy === H;
            this.setBlock(x, Y, z, shell ? wallBlock(x, Y, z) : AIR);
          }
        }
      }
    };
    // A 3-wide floored+roofed corridor along one axis between two rooms.
    const corridor = (x0, z0, x1, z1) => {
      const sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
      let x = x0, z = z0;
      while (x !== x1 || z !== z1) {
        for (let w = -1; w <= 1; w++) {
          const wx2 = cx + x + (sz ? w : 0), wz2 = cz + z + (sx ? w : 0);
          this.setBlock(wx2, y, wz2, wallBlock(wx2, y, wz2));           // floor
          this.setBlock(wx2, y + 4, wz2, wallBlock(wx2, y + 4, wz2));   // ceiling
          for (let dy = 1; dy <= 3; dy++) this.setBlock(wx2, y + dy, wz2, AIR);
        }
        // Side walls.
        for (const w of [-2, 2]) {
          const wx2 = cx + x + (sz ? w : 0), wz2 = cz + z + (sx ? w : 0);
          for (let dy = 1; dy <= 3; dy++) this.setBlock(wx2, y + dy, wz2, wallBlock(wx2, y + dy, wz2));
        }
        x += sx; z += sz;
      }
    };

    /* ---- Rooms ---- */
    room(0, 0, 6, 6, 7);       // main hall (13×13)
    room(19, 0, 6, 5, 7);      // grand library (13×11)
    room(-17, 0, 4, 4, 5);     // storage vault (9×9)
    room(0, -16, 4, 4, 5);     // monster cell (9×9)
    room(0, 20, 6, 6, 8);      // END PORTAL ROOM (13×13)

    /* ---- Corridors (carved after rooms so doorways open up) ---- */
    corridor(6, 0, 13, 0);     // hall -> library
    corridor(-6, 0, -13, 0);   // hall -> storage
    corridor(0, -6, 0, -12);   // hall -> cell
    corridor(0, 6, 0, 14);     // hall -> portal room
    // Open the doorways through the room walls themselves.
    for (let dy = 1; dy <= 3; dy++) {
      for (const [ox, oz] of [[6, 0], [13, 0], [-6, 0], [-13, 0], [0, -6], [0, -12], [0, 6], [0, 14]]) {
        this.setBlock(cx + ox, y + dy, cz + oz, AIR);
      }
    }

    /* ---- Main hall: pillars + loot ---- */
    for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      for (let dy = 1; dy <= 6; dy++) this.setBlock(cx + px, y + dy, cz + pz, 24); // stone-brick pillars
    }
    this.setBlock(cx + 3, y + 1, cz + 3, 65);
    this.loot[`${cx + 3},${y + 1},${cz + 3}`] = [
      { type: 'eye_of_ender', count: 2 }, { type: 'ender_pearl', count: 2 },
      { type: 'book', count: 3 }, { type: 'iron_ingot', count: 5 },
      { type: 'gold_ingot', count: 3 }, { type: 'diamond', count: 1 }
    ];

    /* ---- Library: double-decker bookshelf walls + a reading table ---- */
    for (const dz of [-4, 4]) {
      for (let dx = -5; dx <= 5; dx++) {
        for (const dy of [1, 2, 4, 5]) this.setBlock(cx + 19 + dx, y + dy, cz + dz, 37); // shelves
        this.setBlock(cx + 19 + dx, y + 3, cz + dz, 11); // plank walkway ledge between decks
      }
    }
    this.setBlock(cx + 19, y + 1, cz, 123);  // lectern centrepiece
    this.setBlock(cx + 21, y + 1, cz, 65);   // library chest
    this.loot[`${cx + 21},${y + 1},${cz}`] = [
      { type: 'book', count: 5 }, { type: 'paper', count: 6 }, { type: 'emerald', count: 2 }
    ];

    /* ---- Storage vault: chests + barrels ---- */
    this.setBlock(cx - 17, y + 1, cz - 2, 65);
    this.loot[`${cx - 17},${y + 1},${cz - 2}`] = [
      { type: 'iron_ingot', count: 6 }, { type: 'bread', count: 4 },
      { type: 'redstone', count: 8 }, { type: 'lapis', count: 5 }
    ];
    this.setBlock(cx - 17, y + 1, cz + 2, 76); // barrel
    this.setBlock(cx - 15, y + 1, cz, 76);

    /* ---- Monster cell: spawner behind a glass viewing wall ---- */
    this.setBlock(cx, y + 1, cz - 16, 85);
    for (let dx = -2; dx <= 2; dx++) this.setBlock(cx + dx, y + 1, cz - 13, 9); // glass wall

    /* ---- END PORTAL ROOM: lava moat, silverfish spawner, obsidian dais ---- */
    const pz0 = cz + 20;
    // Lava moat strip across the entrance third of the room.
    for (let dx = -5; dx <= 5; dx++) this.setBlock(cx + dx, y + 1, pz0 - 4, 54);
    // Walkway over the moat.
    this.setBlock(cx, y + 1, pz0 - 4, 24);
    // Silverfish-style spawner guarding the dais.
    this.setBlock(cx - 3, y + 1, pz0 - 1, 85);
    // Raised stone-brick dais with steps…
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) this.setBlock(cx + dx, y + 1, pz0 + dz, 24);
    this.setBlock(cx, y + 1, pz0 - 3, 120); // stone stairs up
    // …topped with the 3×3 obsidian portal frame: aim an Eye of Ender at its
    // centre to open the End portal right here.
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.setBlock(cx + dx, y + 2, pz0 + dz, 35);
    // End-stone corner markers hint at what this dais is for.
    for (const [ex, ez] of [[-2, -2], [2, -2], [-2, 2], [2, 2]])
      this.setBlock(cx + ex, y + 2, pz0 + ez, 60);
  }

  /** Mossy stepped ziggurat in the jungle with a buried treasure chest. */
  _buildJungleTemple(cx, cz) {
    const base = this.getTerrainHeight(cx, cz) - 1;
    if (base < SEA_LEVEL) return;
    this.clearAbove(cx, cz, 4, 4, base + 1, 8);
    for (let layer = 0; layer < 4; layer++) {
      const r = 4 - layer;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const edge = Math.abs(dx) === r || Math.abs(dz) === r;
          // Hollow upper layers (edge ring only) for a temple look; solid base.
          if (layer === 0 || edge) this.setBlock(cx + dx, base + layer, cz + dz, 23); // mossy cobble
        }
    }
    this.setBlock(cx, base - 1, cz, 65); // hidden treasure below
    this.loot[`${cx},${base - 1},${cz}`] = [
      { type: 'emerald', count: 4 }, { type: 'diamond', count: 2 },
      { type: 'gold_ingot', count: 4 }, { type: 'bamboo', count: 6 }, { type: 'bone', count: 3 }
    ];
  }

  /** Prismarine hall on a deep seabed, lit by sea lanterns, holding gold. */
  _buildOceanMonument(cx, cz) {
    const seabed = this.getTerrainHeight(cx, cz);
    if (seabed >= SEA_LEVEL - 3) return; // only in genuinely deep water
    const H = Math.min(SEA_LEVEL - seabed, 8), R = 3;
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dy = 0; dy <= H; dy++) {
          const x = cx + dx, Y = seabed + dy, z = cz + dz;
          const shell = dx === -R || dx === R || dz === -R || dz === R || dy === 0 || dy === H;
          if (!shell) { this.setBlock(x, Y, z, AIR); continue; }
          const corner = Math.abs(dx) === R && Math.abs(dz) === R;
          this.setBlock(x, Y, z, corner ? 72 : 71); // sea-lantern corners, smooth-stone walls
        }
      }
    }
    const chx = cx, chz = cz;
    this.setBlock(chx, seabed + 1, chz, 65);
    this.loot[`${chx},${seabed + 1},${chz}`] = [
      { type: 'gold_block', count: 1 }, { type: 'sea_lantern', count: 4 },
      { type: 'diamond', count: 1 }, { type: 'emerald', count: 2 }
    ];
  }

  /** A half-collapsed obsidian portal frame on a rubble of netherrack. */
  _buildRuinedPortal(cx, cz) {
    const base = this.getTerrainHeight(cx, cz);
    if (base < SEA_LEVEL) return;
    this.clearAbove(cx + 1, cz, 4, 3, base, 8);
    // Frame: 4 wide × 5 tall outline, ~30% of blocks missing (ruined).
    for (let dx = 0; dx <= 3; dx++) {
      for (let dy = 0; dy <= 4; dy++) {
        const edge = dx === 0 || dx === 3 || dy === 0 || dy === 4;
        if (!edge) continue;
        if (this.noise.hash3(cx + dx, base + dy, cz) < 0.3) continue; // crumbled gap
        this.setBlock(cx + dx, base + dy, cz, 35); // obsidian
      }
    }
    // Netherrack rubble scattered at the foot.
    for (let dx = -2; dx <= 4; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (this.noise.hash3(cx + dx, base, cz + dz) < 0.4) this.setBlock(cx + dx, base - 1, cz + dz, 53);
    this.setBlock(cx + 1, base, cz + 2, 65); // loot chest beside it
    this.loot[`${cx + 1},${base},${cz + 2}`] = [
      { type: 'gold_ingot', count: 4 }, { type: 'obsidian', count: 3 },
      { type: 'flint_and_steel', count: 1 }, { type: 'iron_ingot', count: 2 }
    ];
  }

  _buildOutpost(cx, cz) {
    const base = this.getTerrainHeight(cx, cz);
    if (base < SEA_LEVEL) return;
    this.clearAbove(cx, cz, 3, 3, base, 14);
    const H = 11;
    for (let dy = 0; dy < H; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          const id = (dy === 0) ? 19 : (edge ? (dy % 3 === 0 ? 19 : 91) : 0); // cobble corners, acacia walls
          if (id) this.setBlock(cx + dx, base + dy, cz + dz, id);
        }
      }
    }
    // Open-air platform on top with a loot chest.
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) this.setBlock(cx + dx, base + H, cz + dz, 91);
    this.setBlock(cx, base + H + 1, cz, 65);
    this.loot[`${cx},${base + H + 1},${cz}`] = [
      { type: 'crossbow', count: 1 }, { type: 'arrow', count: 12 },
      { type: 'emerald', count: 2 }, { type: 'iron_ingot', count: 3 }
    ];
  }

  _buildDungeon(cx, y, cz) {
    const R = 3;
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dy = 0; dy <= 4; dy++) {
          const x = cx + dx, Y = y + dy, z = cz + dz;
          const wall = dx === -R || dx === R || dz === -R || dz === R || dy === 0 || dy === 4;
          this.setBlock(x, Y, z, wall ? (this.noise.hash3(x, Y, z) < 0.4 ? 23 : 19) : AIR);
        }
      }
    }
    this.setBlock(cx, y + 1, cz, 85); // monster spawner in the centre
    const chx = cx + R - 1, chz = cz + R - 1;
    this.setBlock(chx, y + 1, chz, 65); // loot chest
    this.loot[`${chx},${y + 1},${chz}`] = [
      { type: 'iron_ingot', count: 4 }, { type: 'gold_ingot', count: 2 },
      { type: 'bread', count: 3 }, { type: 'redstone', count: 6 }, { type: 'emerald', count: 1 },
      { type: 'carrot', count: 3 }, { type: 'potato', count: 3 }
    ];
  }

  _buildPyramid(cx, cz) {
    const base = this.getTerrainHeight(cx, cz) - 1;
    this.clearAbove(cx, cz, 5, 5, base + 1, 8);
    for (let layer = 0; layer < 6; layer++) {
      const r = 5 - layer;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) this.setBlock(cx + dx, base + layer, cz + dz, 21); // sandstone
      }
    }
    this.setBlock(cx, base - 1, cz, 65); // buried treasure chest
    this.loot[`${cx},${base - 1},${cz}`] = [
      { type: 'diamond', count: 2 }, { type: 'gold_ingot', count: 5 },
      { type: 'emerald', count: 3 }, { type: 'tnt', count: 2 }
    ];
  }

  _generateVillage(chunk) {
    if (this.dimension !== 'overworld') return; // no villages in other dimensions
    if (this.noise.hash2(chunk.cx * 911 + 7, chunk.cz * 911 + 13) > 0.05) return;
    // Bigger villages need breathing room — never two centres within 96 blocks.
    const cxw0 = chunk.cx * CHUNK_SIZE + 8, czw0 = chunk.cz * CHUNK_SIZE + 8;
    if (this.villages.some((v) => Math.hypot(v.x - cxw0, v.z - czw0) < 96)) return;

    const cxw = chunk.cx * CHUNK_SIZE + 8;
    const czw = chunk.cz * CHUNK_SIZE + 8;
    // The WHOLE footprint must sit in a village-friendly biome — no spilling
    // half a village into a desert, jungle or ocean.
    const okBiome = (b) => b === BIOME.PLAINS || b === BIOME.SNOWY;
    for (const [ox, oz] of [[0, 0], [-20, -20], [20, -20], [-20, 20], [20, 20]]) {
      if (!okBiome(this.sampleColumn(cxw + ox, czw + oz).biome)) return;
    }

    // A proper village: up to 7 houses spread ~40 blocks around a centre well.
    const offsets = [
      [0, 7], [11, 2], [-11, 6], [5, -11], [-8, -10],
      [16, 10], [-17, 1], [2, 16], [16, -7], [-6, 15]
    ];
    let built = 0;
    for (let i = 0; i < offsets.length; i++) {
      const r = this.noise.hash2(chunk.cx * 31 + i, chunk.cz * 31 - i);
      if (r > 0.85) continue; // almost every plot attempts a house
      const hx = cxw + offsets[i][0];
      const hz = czw + offsets[i][1];
      if (this._buildHouse(hx, hz)) built++;
      if (built >= 7) break;
    }
    if (built > 0) {
      // Centre well + blacksmith + two farms complete the village.
      this._buildWell(cxw, czw);
      this._buildBlacksmith(cxw + 9, czw - 15);
      this._buildFarm(cxw - 15, czw - 4);
      this._buildFarm(cxw + 7, czw + 12);
      // Remember the centre so the EntityManager can populate this village.
      if (!this.villages.some((v) => v.x === cxw && v.z === czw)) {
        this.villages.push({ x: cxw, z: czw });
      }
    }
  }

  /** The classic village well: a cobblestone ring around water, post-roofed. */
  _buildWell(cx, cz) {
    const ground = this.getTerrainHeight(cx, cz) - 1;
    if (ground < SEA_LEVEL) return false;
    this.clearAbove(cx, cz, 2, 2, ground + 1, 6);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const rim = Math.abs(dx) === 1 || Math.abs(dz) === 1;
        this.setBlock(cx + dx, ground, cz + dz, rim ? 19 : 8);      // rim / water
        this.setBlock(cx + dx, ground - 1, cz + dz, rim ? 19 : 8);  // deeper water
        this.setBlock(cx + dx, ground + 4, cz + dz, 118);           // cobble slab roof
      }
    }
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let dy = 1; dy <= 3; dy++) this.setBlock(cx + px, ground + dy, cz + pz, 19); // posts
    }
    return true;
  }

  /**
   * Wiki-style wheat farm: a log frame around two farmland strips flanking a
   * central water channel, planted with wheat at mixed growth stages.
   */
  _buildFarm(cx, cz) {
    const ground = this.getTerrainHeight(cx, cz) - 1;
    if (ground < SEA_LEVEL) return false;
    this.clearAbove(cx, cz, 4, 3, ground + 1, 6);
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 2;
        // Terraform the plot flat: dirt shoulder below, clear headroom above.
        this.setBlock(cx + dx, ground - 1, cz + dz, 2);
        for (let dy = 1; dy <= 3; dy++) this.setBlock(cx + dx, ground + dy, cz + dz, AIR);
        if (edge) { this.setBlock(cx + dx, ground, cz + dz, 5); continue; } // log frame
        if (dz === 0) { this.setBlock(cx + dx, ground, cz + dz, 8); continue; } // water channel
        this.setBlock(cx + dx, ground, cz + dz, 97); // farmland
        // Wheat at mixed stages (young 98 / ripe 99).
        const ripe = this.noise.hash2(cx + dx, cz + dz) < 0.5;
        this.setBlock(cx + dx, ground + 1, cz + dz, ripe ? 99 : 98);
      }
    }
    return true;
  }

  /**
   * Village blacksmith: cobblestone forge with twin furnaces, a work porch and
   * the classic loot chest — iron, apples, bread, obsidian, and (sometimes)
   * diamonds.
   */
  _buildBlacksmith(cx, cz) {
    const ground = this.getTerrainHeight(cx, cz) - 1;
    if (ground < SEA_LEVEL) return false;
    this.clearAbove(cx, cz, 4, 3, ground + 1, 7);
    const floorY = ground + 1;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.setBlock(cx + dx, ground, cz + dz, 19); // cobblestone floor
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 2;
        for (let dy = 0; dy < 3; dy++) {
          const open = dx >= 1 && dz === -2;         // open forge front
          if (edge && !open) {
            const corner = Math.abs(dx) === 3 && Math.abs(dz) === 2;
            this.setBlock(cx + dx, floorY + dy, cz + dz, corner ? 5 : (dy === 1 && dx === -3 ? 9 : 19));
          } else {
            this.setBlock(cx + dx, floorY + dy, cz + dz, AIR);
          }
        }
        this.setBlock(cx + dx, floorY + 3, cz + dz, 117); // stone slab roof
      }
    }
    // Doorway + door on the south wall.
    this.setBlock(cx - 1, floorY, cz + 2, 108);
    this.setBlock(cx - 1, floorY + 1, cz + 2, AIR);
    // Twin furnaces + crafting table inside.
    this.setBlock(cx + 2, floorY, cz + 1, 18);
    this.setBlock(cx + 1, floorY, cz + 1, 18);
    this.setBlock(cx - 2, floorY, cz - 1, 12);
    // The classic blacksmith chest (diamonds are a lucky roll per-village).
    this.setBlock(cx, floorY, cz - 1, 65);
    const lucky = this.noise.hash2(cx * 13 + 1, cz * 13 + 7);
    const loot = [
      { type: 'iron_ingot', count: 3 + Math.floor(lucky * 3) },
      { type: 'apple', count: 2 + Math.floor(lucky * 3) },
      { type: 'bread', count: 2 },
      { type: 'obsidian', count: 1 }
    ];
    if (lucky < 0.3) loot.push({ type: 'diamond', count: lucky < 0.08 ? 2 : 1 }); // small chance
    this.loot[`${cx},${floorY},${cz - 1}`] = loot;
    return true;
  }

  /**
   * Build one 5×5 plank house with walls, a glass window, a doorway, a roof
   * and a crafting table inside — provided the ground is flat enough.
   * @param {number} cx @param {number} cz centre of the house footprint
   * @returns {boolean} whether a house was placed
   */
  _buildHouse(cx, cz) {
    const ground = this.getTerrainHeight(cx, cz) - 1;
    // Reject steep/under-water ground.
    if (ground < SEA_LEVEL) return false;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const g = this.getTerrainHeight(cx + dx, cz + dz) - 1;
        if (Math.abs(g - ground) > 2) return false;
      }
    }
    this.clearAbove(cx, cz, 3, 3, ground + 1, 7); // fell any tree in the way

    const wallH = 3;
    const floorY = ground + 1;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        // Floor.
        this.setBlock(cx + dx, ground, cz + dz, 11); // plank floor
        if (edge) {
          for (let y = 0; y < wallH; y++) {
            let block = 11; // planks
            const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
            if (corner) block = 5; // wood corner posts
            else if (y === 1 && (dx === 0 || dz === 0)) block = 9; // glass window
            this.setBlock(cx + dx, floorY + y, cz + dz, block);
          }
        }
        // Roof.
        this.setBlock(cx + dx, floorY + wallH, cz + dz, 11);
      }
    }
    // Doorway on the +x wall, fitted with a real oak door (right-click to open).
    this.setBlock(cx + 2, floorY, cz, 108);
    this.setBlock(cx + 2, floorY + 1, cz, AIR);
    // A crafting table inside.
    this.setBlock(cx - 1, floorY, cz - 1, 12);
    return true;
  }

  /* ----------------------------- rendering ------------------------------- */

  /**
   * Whether `neighborId` fully hides the shared face of a `selfId` voxel.
   * Same transparent blocks (water/water) hide their shared interior face.
   */
  _occludes(neighborId, selfId) {
    if (isAir(neighborId)) return false;
    if (neighborId === selfId) return true;
    return !isTransparent(neighborId);
  }

  /** A voxel is rendered if any of its six neighbours fails to occlude it. */
  _isExposed(wx, wy, wz, selfId) {
    return (
      !this._occludes(this.getBlock(wx + 1, wy, wz), selfId) ||
      !this._occludes(this.getBlock(wx - 1, wy, wz), selfId) ||
      !this._occludes(this.getBlock(wx, wy + 1, wz), selfId) ||
      !this._occludes(this.getBlock(wx, wy - 1, wz), selfId) ||
      !this._occludes(this.getBlock(wx, wy, wz + 1), selfId) ||
      !this._occludes(this.getBlock(wx, wy, wz - 1), selfId)
    );
  }

  /** Rebuild meshes for every chunk flagged dirty. */
  /**
   * Rebuild dirty chunk meshes with a per-frame time budget so a big backlog
   * (fresh world / dimension switch) streams in over a few frames instead of
   * freezing the first one. Collision reads voxels directly, so physics is
   * correct even for chunks whose mesh hasn't landed yet.
   */
  rebuildDirtyChunks(budgetMs = 24) {
    const started = performance.now();
    for (const chunk of this.chunks.values()) {
      if (!chunk.dirty) continue;
      this._buildChunkMesh(chunk);
      if (performance.now() - started > budgetMs) break; // resume next frame
    }
  }

  /**
   * (Re)build the InstancedMesh batch set for one chunk.
   * @param {Chunk} chunk
   */
  _buildChunkMesh(chunk) {
    // Tear down previous meshes (geometry/material are shared, not disposed).
    for (const mesh of chunk.meshes.values()) {
      chunk.group.remove(mesh);
    }
    chunk.meshes.clear();

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    // Pass 1 — collect exposed instance positions per block type.
    // Hot path for the 256-deep world: neighbour reads go through the chunk's
    // typed array directly (with the 4 adjacent chunks cached for the borders)
    // instead of the string-keyed world.getBlock lookup.
    const nxm = this.getChunk(chunk.cx - 1, chunk.cz);
    const nxp = this.getChunk(chunk.cx + 1, chunk.cz);
    const nzm = this.getChunk(chunk.cx, chunk.cz - 1);
    const nzp = this.getChunk(chunk.cx, chunk.cz + 1);
    const at = (lx, y, lz) => {
      if (y < 0 || y >= WORLD_HEIGHT) return AIR;
      if (lx < 0) return nxm ? nxm.getLocal(lx + CHUNK_SIZE, y, lz) : AIR;
      if (lx >= CHUNK_SIZE) return nxp ? nxp.getLocal(lx - CHUNK_SIZE, y, lz) : AIR;
      if (lz < 0) return nzm ? nzm.getLocal(lx, y, lz + CHUNK_SIZE) : AIR;
      if (lz >= CHUNK_SIZE) return nzp ? nzp.getLocal(lx, y, lz - CHUNK_SIZE) : AIR;
      return chunk.getLocal(lx, y, lz);
    };

    /** @type {Map<number, Array<[number,number,number]>>} */
    const buckets = new Map();
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = chunk.getLocal(lx, y, lz);
          if (isAir(id)) continue;
          const exposed =
            !this._occludes(at(lx, y + 1, lz), id) ||
            !this._occludes(at(lx, y - 1, lz), id) ||
            !this._occludes(at(lx + 1, y, lz), id) ||
            !this._occludes(at(lx - 1, y, lz), id) ||
            !this._occludes(at(lx, y, lz + 1), id) ||
            !this._occludes(at(lx, y, lz - 1), id);
          if (!exposed) continue;
          let bucket = buckets.get(id);
          if (!bucket) {
            bucket = [];
            buckets.set(id, bucket);
          }
          bucket.push([lx, y, lz]);
        }
      }
    }

    // Pass 2 — one InstancedMesh per block type present in this chunk.
    for (const [id, positions] of buckets) {
      const geometry = this.assets.getGeometry(id);
      const material = this.assets.getMaterial(id);
      const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      for (let i = 0; i < positions.length; i++) {
        const [lx, y, lz] = positions[i];
        // +0.5 centres the unit cube on the integer voxel coordinate.
        this._tmpMatrix.makeTranslation(lx + 0.5, y + 0.5, lz + 0.5);
        mesh.setMatrixAt(i, this._tmpMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = true; // per-chunk frustum culling.

      chunk.group.add(mesh);
      chunk.meshes.set(id, mesh);
    }

    chunk.dirty = false;
  }

  /* ------------------------------- update -------------------------------- */

  /**
   * Per-frame world update: rebuild any dirty chunks and animate water.
   * @param {number} dt seconds since last frame
   */
  update(dt) {
    this.rebuildDirtyChunks();

    // Gentle animated shimmer for water materials.
    this._waterTime += dt;
    const wobble = 0.55 + Math.sin(this._waterTime * 1.6) * 0.08;
    for (const mat of this.assets.waterMaterials) {
      mat.opacity = wobble;
      const t = (Math.sin(this._waterTime * 0.9) + 1) * 0.5;
      mat.color.setRGB(0.15 + t * 0.1, 0.38 + t * 0.08, 0.85);
    }
  }

  /* ------------------------------ helpers -------------------------------- */

  /**
   * Find the first solid surface Y at a world column, scanning down from the
   * sky. Used to seat the player on spawn.
   * @param {number} wx @param {number} wz
   * @returns {number} Y of the air block directly above the surface
   */
  getSpawnHeight(wx, wz) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(this.getBlock(Math.floor(wx), y, Math.floor(wz)))) {
        return y + 1;
      }
    }
    return SEA_LEVEL + 1;
  }

  /**
   * Deterministic TERRAIN surface (first air Y above the ground column), from
   * the generator — ignores trees, leaves and other decoration entirely.
   * Structures must use this so they never end up perched on a tree canopy.
   */
  getTerrainHeight(wx, wz) {
    return this.sampleColumn(Math.floor(wx), Math.floor(wz)).height + 1;
  }

  /** Clear decoration (trees etc.) in a box so a structure has open ground. */
  clearAbove(cx, cz, rx, rz, baseY, height = 8) {
    for (let dx = -rx; dx <= rx; dx++)
      for (let dz = -rz; dz <= rz; dz++)
        for (let dy = 0; dy < height; dy++)
          this.setBlock(cx + dx, baseY + dy, cz + dz, AIR);
  }

  /** @param {number} wx @param {number} wy @param {number} wz */
  isSolidAt(wx, wy, wz) {
    return isSolid(this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)));
  }

  /**
   * Local solid sub-boxes for the block at this cell, each as
   * [x0,y0,z0,x1,y1,z1] in 0..1 cell-local coordinates, or null if non-solid.
   * Full blocks fill the cell; slabs occupy the bottom half; stairs collide as
   * a full cube (a pragmatic simplification of the stepped shape).
   * @param {number} wx @param {number} wy @param {number} wz
   */
  collisionBoxes(wx, wy, wz) {
    const id = this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz));
    if (!isSolid(id)) return null;
    const shape = BLOCKS[id]?.shape;
    if (shape === 'slab') return [[0, 0, 0, 1, 0.5, 1]];
    return [[0, 0, 0, 1, 1, 1]];
  }

  /** @param {number} wx @param {number} wy @param {number} wz */
  isLiquidAt(wx, wy, wz) {
    return isLiquid(this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)));
  }
}

export default World;
