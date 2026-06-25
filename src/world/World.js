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
  OCEAN: 'ocean'
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
  18: { top: 'stone', side: 'furnace', bottom: 'stone' }
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

  dispose() {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose?.(); // geometry is shared; guarded below.
    }
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
   * Generate a square region of chunks around a centre, plant trees, apply any
   * persisted player edits, then build all meshes.
   * @param {number} centerCx @param {number} centerCz @param {number} radius
   * @param {Record<string, number>} [edits] persisted "x,y,z" -> id overrides
   */
  generate(centerCx, centerCz, radius, edits = {}) {
    // Phase 1 — terrain columns (with integrated caves + ore distribution).
    for (let cz = centerCz - radius; cz <= centerCz + radius; cz++) {
      for (let cx = centerCx - radius; cx <= centerCx + radius; cx++) {
        const chunk = new Chunk(cx, cz);
        this.chunks.set(chunkKey(cx, cz), chunk);
        this.scene.add(chunk.group);
        this._fillChunkTerrain(chunk);
      }
    }

    // Phase 2 — trees + villages (need neighbouring chunks to exist so
    // structures can overhang chunk borders).
    for (const chunk of this.chunks.values()) {
      this._plantTrees(chunk);
    }
    for (const chunk of this.chunks.values()) {
      this._generateVillage(chunk);
    }

    // Phase 3 — replay persisted player edits so they win over generation.
    for (const key in edits) {
      const [x, y, z] = key.split(',').map(Number);
      this.setBlock(x, y, z, edits[key]);
    }

    // Phase 4 — build all meshes.
    this.rebuildDirtyChunks();
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
    } else if (height > SEA_LEVEL + 16) {
      biome = BIOME.MOUNTAIN;
    } else if (temperature < -0.25) {
      biome = BIOME.SNOWY;
    } else if (temperature > 0.28 && moisture > 0.1) {
      biome = BIOME.JUNGLE;
    } else if (temperature > 0.25 && moisture < -0.05) {
      biome = BIOME.DESERT;
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
            if (biome === BIOME.DESERT || biome === BIOME.OCEAN || underwater) id = 7;
            else if (biome === BIOME.MOUNTAIN) id = 3;
            else id = 2; // dirt
          } else {
            id = this._stoneOrOre(wx, y, wz); // deep: stone with ore pockets
          }

          // Carve caves out of solid sub-surface rock (but never bedrock).
          if (y > 1 && y < height - 1 && this._isCave(wx, y, wz)) {
            id = AIR;
          }
          if (id !== AIR) chunk.setLocal(lx, y, lz, id);
        }

        // Flood water up to sea level over submerged columns.
        if (underwater) {
          for (let y = height + 1; y <= SEA_LEVEL; y++) chunk.setLocal(lx, y, lz, 8);
        }
      }
    }
  }

  /** Surface block for a biome column. */
  _surfaceBlock(biome, height, underwater) {
    if (underwater) return 7;              // sandy bed
    switch (biome) {
      case BIOME.OCEAN: return 7;          // sand
      case BIOME.DESERT: return 7;         // sand
      case BIOME.SNOWY: return 13;         // snow
      case BIOME.MOUNTAIN: return height > SEA_LEVEL + 26 ? 13 : 3; // snowy peaks
      case BIOME.JUNGLE:
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
    return 3;                                           // stone
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
        let density = 0;
        if (biome === BIOME.JUNGLE && onGrass) density = 0.10;
        else if (biome === BIOME.PLAINS && onGrass) density = 0.04;
        else if (biome === BIOME.SNOWY && onSnow) density = 0.03;
        if (density === 0) continue;

        const roll = this.noise.hash2(wx, wz);
        if (roll > density) continue;
        // Spacing: don't place if a stronger neighbour roll wins.
        if (this.noise.hash2(wx + 1, wz) < density) continue;
        if (this.noise.hash2(wx, wz + 1) < density) continue;

        this._spawnTree(wx, height + 1, wz, roll, biome);
      }
    }
  }

  /**
   * Build a tree. Jungle trees are taller with darker (jungle) leaves.
   * @param {number} wx @param {number} baseY @param {number} wz
   * @param {number} roll @param {string} biome
   */
  _spawnTree(wx, baseY, wz, roll, biome) {
    const jungle = biome === BIOME.JUNGLE;
    const leaf = jungle ? 14 : 6;
    const trunkHeight = jungle ? 7 + (Math.floor(roll * 90) % 4) : 4 + (Math.floor(roll * 75) % 3);
    const topY = baseY + trunkHeight;

    for (let dy = -2; dy <= 1; dy++) {
      const y = topY + dy;
      const radius = dy >= 1 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (isAir(this.getBlock(wx + dx, y, wz + dz))) {
            this.setBlock(wx + dx, y, wz + dz, leaf);
          }
        }
      }
    }
    for (let i = 0; i < trunkHeight; i++) this.setBlock(wx, baseY + i, wz, 5);
  }

  /* ----------------------------- villages -------------------------------- */

  /**
   * Rarely build a small village (a cluster of plank houses) on flat plains.
   * Keyed on chunk coordinates so a given chunk always decides the same way.
   * @param {Chunk} chunk
   */
  _generateVillage(chunk) {
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
