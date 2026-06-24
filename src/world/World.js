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
export const WORLD_HEIGHT = 48;
export const SEA_LEVEL = 22;

export const BIOME = Object.freeze({
  PLAINS: 'plains',
  DESERT: 'desert',
  MOUNTAIN: 'mountain'
});

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/* -------------------------------------------------------------------------- */
/*  Shared geometry + material registry                                        */
/* -------------------------------------------------------------------------- */

/**
 * Build a unit BoxGeometry with per-face vertex colours baked in (so grass can
 * be green on top and brown on the sides within a single InstancedMesh).
 * @param {number} blockId
 * @returns {THREE.BoxGeometry}
 */
function buildBlockGeometry(blockId) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 vertices each).
  for (let i = 0; i < pos.count; i++) {
    const faceIndex = Math.floor(i / 4);
    let face = 'side';
    if (faceIndex === 2) face = 'top';
    else if (faceIndex === 3) face = 'bottom';
    const [r, g, b] = getFaceColor(blockId, face);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * A lazily-populated registry of geometries and materials keyed by block id.
 * Shared across every chunk so we never duplicate GPU resources.
 */
class BlockAssetRegistry {
  constructor() {
    /** @type {Map<number, THREE.BoxGeometry>} */
    this.geometries = new Map();
    /** @type {Map<number, THREE.Material>} */
    this.materials = new Map();
    /** @type {THREE.Material[]} water materials, animated each frame. */
    this.waterMaterials = [];
  }

  getGeometry(blockId) {
    let geo = this.geometries.get(blockId);
    if (!geo) {
      geo = buildBlockGeometry(blockId);
      this.geometries.set(blockId, geo);
    }
    return geo;
  }

  getMaterial(blockId) {
    let mat = this.materials.get(blockId);
    if (!mat) {
      const def = BLOCKS[blockId];
      mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        transparent: !!def.transparent,
        opacity: def.opacity ?? 1.0
      });
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
    // Phase 1 — terrain columns.
    for (let cz = centerCz - radius; cz <= centerCz + radius; cz++) {
      for (let cx = centerCx - radius; cx <= centerCx + radius; cx++) {
        const chunk = new Chunk(cx, cz);
        this.chunks.set(chunkKey(cx, cz), chunk);
        this.scene.add(chunk.group);
        this._fillChunkTerrain(chunk);
      }
    }

    // Phase 2 — trees (needs neighbouring chunks to exist for canopy overhang).
    for (const chunk of this.chunks.values()) {
      this._plantTrees(chunk);
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
   * Classify a column's biome from temperature/moisture/elevation noise.
   * @param {number} wx @param {number} wz
   * @returns {{ biome: string, height: number }}
   */
  sampleColumn(wx, wz) {
    const elevation = this.noise.fbm2(wx * 0.011, wz * 0.011, {
      octaves: 5,
      persistence: 0.5,
      lacunarity: 2.0
    });
    const temperature = this.noise.fbm2((wx - 4000) * 0.006, (wz + 4000) * 0.006, {
      octaves: 3
    });
    const moisture = this.noise.fbm2((wx + 8000) * 0.008, (wz - 8000) * 0.008, {
      octaves: 3
    });

    // Base rolling height, with a sharply amplified mountain mask up top.
    let height = SEA_LEVEL + elevation * 10;
    if (elevation > 0.35) {
      height += (elevation - 0.35) * 70; // mountainous crags
    }
    height = Math.max(2, Math.min(WORLD_HEIGHT - 6, Math.round(height)));

    let biome = BIOME.PLAINS;
    if (height > SEA_LEVEL + 14) {
      biome = BIOME.MOUNTAIN;
    } else if (temperature > 0.25 && moisture < -0.05 && height <= SEA_LEVEL + 6) {
      biome = BIOME.DESERT;
    }
    return { biome, height };
  }

  /**
   * Fill a single chunk's voxel grid from procedural terrain.
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
            // Surface block depends on biome / water.
            if (underwater) id = 7; // sandy lake bed
            else if (biome === BIOME.DESERT) id = 7; // sand
            else if (biome === BIOME.MOUNTAIN) id = 3; // exposed stone crag
            else id = 1; // grass
          } else if (y > height - 4) {
            // Sub-surface layer.
            if (biome === BIOME.DESERT || underwater) id = 7; // sand
            else if (biome === BIOME.MOUNTAIN) id = 3; // stone
            else id = 2; // dirt
          } else {
            id = 3; // stone deep down
            // Iron ore pockets carved out of stone via 3D noise.
            const ore = this.noise.fbm3(wx * 0.18, y * 0.18, wz * 0.18, { octaves: 2 });
            if (ore > 0.62 && y < height - 5) id = 10;
          }
          chunk.setLocal(lx, y, lz, id);
        }

        // Flood water up to sea level over any submerged columns.
        if (underwater) {
          for (let y = height + 1; y <= SEA_LEVEL; y++) {
            chunk.setLocal(lx, y, lz, 8);
          }
        }
      }
    }
  }

  /**
   * Deterministically plant oak trees in plains columns. Tree placement is
   * keyed on world coordinates via the noise hash so it is stable across
   * reloads and independent of generation order.
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
        if (biome !== BIOME.PLAINS || height < SEA_LEVEL) continue;
        if (chunk.getLocal(lx, height, lz) !== 1) continue; // must be grass

        // ~4% of eligible columns, with a simple spacing rule to avoid clumps.
        const roll = this.noise.hash2(wx, wz);
        if (roll > 0.04) continue;
        if (this.noise.hash2(wx + 1, wz) < 0.04) continue;
        if (this.noise.hash2(wx, wz + 1) < 0.04) continue;

        this._spawnTree(wx, height + 1, wz, roll);
      }
    }
  }

  /**
   * Build an oak: a trunk topped by a layered leaf canopy. Writes directly via
   * setBlock so canopy that overhangs into neighbouring chunks is placed there.
   * @param {number} wx @param {number} baseY @param {number} wz @param {number} roll
   */
  _spawnTree(wx, baseY, wz, roll) {
    const trunkHeight = 4 + Math.floor(roll * 75) % 3; // 4..6
    const topY = baseY + trunkHeight;

    // Canopy: two wide layers, then a narrow cap.
    for (let dy = -2; dy <= 1; dy++) {
      const y = topY + dy;
      const radius = dy >= 1 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Trim the corners of the widest layers for a rounded look.
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue; // leave room for trunk top
          if (isAir(this.getBlock(wx + dx, y, wz + dz))) {
            this.setBlock(wx + dx, y, wz + dz, 6); // leaves
          }
        }
      }
    }

    // Trunk last so it overwrites any leaf placed in its column.
    for (let i = 0; i < trunkHeight; i++) {
      this.setBlock(wx, baseY + i, wz, 5); // oak wood
    }
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
