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
export const WORLD_HEIGHT = 64; // taller world leaves room for caves below
export const SEA_LEVEL = 30;

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
  10: { all: 'ore', base: STONE_BASE, accent: [0.82, 0.7, 0.55] }, // iron
  11: { all: 'planks' },
  12: { top: 'craft_top', side: 'craft_side', bottom: 'planks' },
  13: { all: 'snow' },
  14: { all: 'leaves' },
  15: { all: 'ore', base: STONE_BASE, accent: [0.12, 0.12, 0.13] }, // coal
  16: { all: 'ore', base: STONE_BASE, accent: [0.95, 0.8, 0.2] },   // gold
  17: { all: 'ore', base: STONE_BASE, accent: [0.5, 0.9, 0.95] },   // diamond
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
  40: { all: 'ore', base: STONE_BASE, accent: [0.16, 0.3, 0.85] }, // lapis
  41: { all: 'ore', base: STONE_BASE, accent: [0.85, 0.12, 0.12] }, // redstone
  42: { all: 'ore', base: STONE_BASE, accent: [0.15, 0.85, 0.45] }, // emerald
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
  68: { all: 'ore', base: STONE_BASE, accent: [0.85, 0.5, 0.3] }, // copper ore
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
  96: { all: 'beacon' }
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
          c = mul(base, 0.85 + n * 0.3);
          if (n > 0.82) c = mul(base, 1.18);
          break;
        case 'grass_side':
          if (py < 4) { c = mul(base, 0.85 + n * 0.3); if (py === 3 && n > 0.6) c = mul(base, 0.7); }
          else { c = mul(dirt, 0.8 + pnoise(px, py + 7) * 0.35); }
          break;
        case 'dirt':
          c = mul(base, 0.8 + n * 0.35);
          if (n < 0.12) c = mul(base, 0.62);
          break;
        case 'stone':
          c = mul(base, 0.9 + n * 0.2);
          if (n < 0.08) c = mul(base, 0.72);
          break;
        case 'bedrock':
          c = mul(base, 0.6 + n * 0.7);
          break;
        case 'sand':
          c = mul(base, 0.92 + n * 0.16);
          if (n < 0.1) c = mul(base, 0.82);
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
          c = mul(base, 0.72 + n * 0.45);
          if (n < 0.15) c = mul(base, 0.55);
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
        case 'ore':
          c = mul(base, 0.9 + n * 0.2);
          if (n < 0.08) c = mul(base, 0.72);
          // Accent blobs clustered at a few spots.
          if (pnoise(px * 1.7 + 3, py * 1.7 + 5) > 0.86) c = mul(accent, 0.85 + n * 0.4);
          break;
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
        case 'obsidian':
          c = mul(base, 0.7 + n * 0.6);
          if (pnoise(px * 1.5, py * 1.5 + 4) > 0.85) c = [0.32, 0.2, 0.42]; // purple sheen
          break;
        case 'glowstone':
          c = mul(base, 0.7 + n * 0.6);
          if (pnoise(px * 1.6 + 2, py * 1.6) > 0.7) c = [1.0, 0.95, 0.6]; // bright specks
          break;
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
        case 'netherrack':
          c = mul(base, 0.7 + n * 0.5);
          if (pnoise(px * 1.6, py * 1.6 + 2) > 0.78) c = mul([0.6, 0.18, 0.18], 0.9); // veins
          break;
        case 'lava': {
          const wave = Math.sin((py + px * 0.5) * 0.7) * 0.12;
          c = mul(base, 0.9 + wave + n * 0.1);
          if (pnoise(px * 1.4 + 3, py * 1.4) > 0.8) c = [1.0, 0.85, 0.3]; // bright blobs
          break;
        }
        case 'soulsand':
          c = mul(base, 0.85 + n * 0.25);
          if (pnoise(px * 1.5 + 1, py * 1.5) > 0.7) c = mul(base, 0.6); // sunken faces
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
function buildBlockGeometry(blockId, textured) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);

  // BoxGeometry face order: +X, -X, +Y(top), -Y(bottom), +Z, -Z (4 verts each).
  for (let i = 0; i < pos.count; i++) {
    const faceIndex = Math.floor(i / 4);
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
    if (elevation < -0.2) height = SEA_LEVEL - 6 + (elevation + 0.2) * 30; // basins
    height = Math.max(2, Math.min(WORLD_HEIGHT - 6, Math.round(height)));

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
    const roof = WORLD_HEIGHT - 2; // bedrock ceiling
    const LAVA = 8;
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const floorH = 14 + Math.floor(this.noise.fbm2(wx * 0.04, wz * 0.04, { octaves: 3 }) * 8);
        const ceilH = roof - 5 - Math.floor(this.noise.fbm2((wx + 500) * 0.04, (wz - 500) * 0.04, { octaves: 3 }) * 8);

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
            if (y <= floorH && v < 0.03) id = 55;        // soul sand near the floor
            else if (v >= 0.03 && v < 0.05) id = 56;     // nether quartz ore
            else if (y < 22 && v >= 0.05 && v < 0.054) id = 73; // ancient debris (rare, deep)
          }
          if (id !== AIR) chunk.setLocal(lx, y, lz, id);
        }

        // Lava sea in the depths.
        for (let y = 1; y <= LAVA; y++) if (chunk.getLocal(lx, y, lz) === AIR) chunk.setLocal(lx, y, lz, 54);

        // Occasional glowstone cluster hanging under the ceiling.
        if (this.noise.hash2(wx * 1.3 + 7, wz * 1.3) < 0.012) {
          for (let y = ceilH; y > LAVA; y--) {
            if (chunk.getLocal(lx, y, lz) === AIR) { chunk.setLocal(lx, y, lz, 36); break; }
          }
        }
        // Nether wart sprouting on exposed soul sand.
        if (this.noise.hash2(wx * 1.7 + 3, wz * 1.7 + 9) < 0.04) {
          for (let y = floorH; y > LAVA; y--) {
            if (chunk.getLocal(lx, y, lz) === 55 && chunk.getLocal(lx, y + 1, lz) === AIR) {
              chunk.setLocal(lx, y + 1, lz, 66); break;
            }
          }
        }
      }
    }
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
        if (dist >= edge) continue; // the void
        const thick = 3 + Math.floor((1 - dist / edge) * 7); // domed underside
        for (let y = CY - thick; y <= CY; y++) chunk.setLocal(lx, y, lz, 60);
      }
    }

    // Ten obsidian pillars in a ring around the centre.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const px = Math.round(Math.cos(a) * 20);
      const pz = Math.round(Math.sin(a) * 20);
      if (px < baseX || px >= baseX + CHUNK_SIZE || pz < baseZ || pz >= baseZ + CHUNK_SIZE) continue;
      const h = 9 + (i % 4) * 3;
      for (let y = CY + 1; y <= CY + h; y++) this.setBlock(px, y, pz, 35); // obsidian
    }
  }

  /** Find a safe standing Y in the Nether (solid floor with 2 air above). */
  getNetherSpawnY(wx, wz) {
    for (let y = WORLD_HEIGHT - 6; y > 10; y--) {
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
    if (y < 14 && v < 0.010) return 17;                 // diamond (deep)
    if (y < 22 && v >= 0.010 && v < 0.022) return 16;   // gold
    if (y < 44 && v >= 0.022 && v < 0.045) return 10;   // iron
    if (v >= 0.045 && v < 0.080) return 15;             // coal (any depth)
    if (y < 16 && v >= 0.080 && v < 0.095) return 41;   // redstone (deep)
    if (y < 30 && v >= 0.095 && v < 0.106) return 40;   // lapis
    if (y < 24 && v >= 0.106 && v < 0.109) return 42;   // emerald (rare)
    // Stone variant pockets (cosmetic geology).
    if (v >= 0.110 && v < 0.140) return 20;             // gravel
    if (v >= 0.140 && v < 0.180) return 27;             // granite
    if (v >= 0.180 && v < 0.220) return 26;             // diorite
    if (y < 40 && v >= 0.260 && v < 0.300) return 68;   // copper ore
    if (v >= 0.220 && v < 0.260) return 25;             // andesite
    return y < 8 ? 70 : 3;                              // deepslate deep down, else stone
  }

  /**
   * Whether the voxel at (wx,wy,wz) should be carved into a cave. Blobby
   * caverns from low-frequency 3D noise, biased to stay underground.
   */
  _isCave(wx, wy, wz) {
    if (wy >= SEA_LEVEL + 2) return false; // keep surfaces mostly intact
    const n = this.noise.perlin3(wx * 0.06, wy * 0.10, wz * 0.06);
    return Math.abs(n) > 0.55;
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

        if (!onGrass && !onSnow) continue;

        let density = 0, type = 'oak';
        switch (biome) {
          case BIOME.JUNGLE:  density = 0.10; type = 'jungle'; break;
          case BIOME.FOREST:  density = 0.12; type = this.noise.hash2(wx * 3, wz * 3) < 0.2 ? 'cherry' : (this.noise.hash2(wx * 3, wz * 3) < 0.5 ? 'birch' : 'oak'); break;
          case BIOME.TAIGA:   density = 0.10; type = 'spruce'; break;
          case BIOME.PLAINS:  density = 0.035; type = this.noise.hash2(wx * 3, wz * 3) < 0.25 ? 'birch' : 'oak'; break;
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
      cherry: { log: 92, leaf: 93, min: 5, span: 3 }
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

    // Underground dungeon: mossy room with a spawner + loot chest.
    if (this.noise.hash2(cx * 313 + 5, cz * 313 + 11) < 0.04) {
      const wx = cx * CHUNK_SIZE + 4 + Math.floor(this.noise.hash2(cx, cz) * 6);
      const wz = cz * CHUNK_SIZE + 4 + Math.floor(this.noise.hash2(cz, cx) * 6);
      const y = 10 + Math.floor(this.noise.hash2(cx + 1, cz + 1) * 10);
      this._buildDungeon(wx, y, wz);
    }

    // Desert pyramid with a buried treasure chest.
    const ccx = cx * CHUNK_SIZE + 8, ccz = cz * CHUNK_SIZE + 8;
    if (this.sampleColumn(ccx, ccz).biome === BIOME.DESERT &&
        this.noise.hash2(cx * 557 + 3, cz * 557 + 7) < 0.06) {
      this._buildPyramid(ccx, ccz);
    }
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
      { type: 'bread', count: 3 }, { type: 'redstone', count: 6 }, { type: 'emerald', count: 1 }
    ];
  }

  _buildPyramid(cx, cz) {
    const base = this.getSpawnHeight(cx, cz) - 1;
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
    if (this.noise.hash2(chunk.cx * 911 + 7, chunk.cz * 911 + 13) > 0.07) return;

    const cxw = chunk.cx * CHUNK_SIZE + 8;
    const czw = chunk.cz * CHUNK_SIZE + 8;
    const { biome } = this.sampleColumn(cxw, czw);
    if (biome !== BIOME.PLAINS && biome !== BIOME.SNOWY) return;

    // Place a few houses at deterministic offsets around the chunk centre.
    const offsets = [[0, 0], [7, 2], [-6, 5], [3, -7]];
    let built = 0;
    for (let i = 0; i < offsets.length; i++) {
      const r = this.noise.hash2(chunk.cx * 31 + i, chunk.cz * 31 - i);
      if (r > 0.7) continue;
      const hx = cxw + offsets[i][0];
      const hz = czw + offsets[i][1];
      if (this._buildHouse(hx, hz)) built++;
      if (built >= 3) break;
    }
  }

  /**
   * Build one 5×5 plank house with walls, a glass window, a doorway, a roof
   * and a crafting table inside — provided the ground is flat enough.
   * @param {number} cx @param {number} cz centre of the house footprint
   * @returns {boolean} whether a house was placed
   */
  _buildHouse(cx, cz) {
    const ground = this.getSpawnHeight(cx, cz) - 1;
    // Reject steep/under-water ground.
    if (ground < SEA_LEVEL) return false;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const g = this.getSpawnHeight(cx + dx, cz + dz) - 1;
        if (Math.abs(g - ground) > 2) return false;
      }
    }

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
    // Doorway on the +x wall (clear two blocks).
    this.setBlock(cx + 2, floorY, cz, AIR);
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
  rebuildDirtyChunks() {
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) this._buildChunkMesh(chunk);
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
    /** @type {Map<number, Array<[number,number,number]>>} */
    const buckets = new Map();
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = chunk.getLocal(lx, y, lz);
          if (isAir(id)) continue;
          const wx = baseX + lx;
          const wz = baseZ + lz;
          if (!this._isExposed(wx, y, wz, id)) continue;
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

  /** @param {number} wx @param {number} wy @param {number} wz */
  isSolidAt(wx, wy, wz) {
    return isSolid(this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)));
  }

  /** @param {number} wx @param {number} wy @param {number} wz */
  isLiquidAt(wx, wy, wz) {
    return isLiquid(this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)));
  }
}

export default World;
