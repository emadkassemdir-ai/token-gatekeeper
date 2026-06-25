/**
 * InteractionEngine
 * -----------------
 * Voxel raycasting (Amanatides & Woo grid traversal) for block selection, plus
 * the break/place mechanics:
 *
 *   - A wireframe box highlights the currently targeted voxel.
 *   - Left click accumulates break damage; harder blocks (Stone, Iron Ore) take
 *     longer than soft ones (Leaves). Bedrock is unbreakable and returns false.
 *   - Right click places the selected hotbar block against the hit face, using
 *     the traversal's collision normal, with a guard so you can't entomb
 *     yourself inside the player's own bounding box.
 */

import * as THREE from 'three';
import { BLOCKS, AIR, isAir, isBreakable } from '../world/BlockTypes.js';
import { getBreakTime, getDrop, placeBlockId, isFood, isArmor } from '../world/ItemTypes.js';

const REACH = 6; // max voxels the player can interact with

export class InteractionEngine {
  /**
   * @param {THREE.Camera} camera
   * @param {import('../world/World.js').World} world
   * @param {THREE.Scene} scene
   * @param {import('./PhysicsEngine.js').PhysicsEngine} physics
   * @param {import('../state/PlayerProfile.js').PlayerProfile} profile
   */
  constructor(camera, world, scene, physics, profile, inventory) {
    this.camera = camera;
    this.world = world;
    this.scene = scene;
    this.physics = physics;
    this.profile = profile;
    this.inventory = inventory;

    this.target = null; // { x, y, z, nx, ny, nz }
    this.breaking = false;
    this.placing = false;
    this._breakProgress = 0; // seconds spent breaking the current block
    this._breakTarget = null; // "x,y,z" of the block being mined
    this._placeCooldown = 0;

    this.onEdit = null;   // callback(x,y,z,id) for persistence
    this.onMine = null;   // callback(blockId) when a block is removed (drops)
    this.onExhaust = null;// callback(amount) for hunger cost
    this.onAttack = null; // () => boolean : try to hit a mob; true if it hit
    this.onEat = null;    // (foodType) => boolean : eat; true if consumed
    this.onEquip = null;  // (armorType) => boolean : equip; true if equipped
    this._placeRequested = false; // one-shot place (touch tap)
    this._attackCooldown = 0;
    this.reach = REACH; // mutable for the /reach cheat

    this._buildHighlight();
    this._bindEvents();

    // Reusable direction vector to avoid per-frame allocation.
    this._dir = new THREE.Vector3();
  }

  /* ----------------------------- highlight ------------------------------- */

  _buildHighlight() {
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55
    });
    this.highlight = new THREE.LineSegments(edges, mat);
    this.highlight.visible = false;
    this.highlight.renderOrder = 999;
    this.scene.add(this.highlight);

    // A faint break-progress overlay that grows as a block is mined.
    const crackMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      depthTest: false
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), crackMat);
    this.crack.visible = false;
    this.crack.renderOrder = 1000;
    this.scene.add(this.crack);
  }

  _bindEvents() {
    this._onMouseDown = (e) => {
      if (document.pointerLockElement == null) return;
      if (e.button === 0) this.breaking = true;
      else if (e.button === 2) this.placing = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) {
        this.breaking = false;
        this._resetBreak();
      } else if (e.button === 2) {
        this.placing = false;
      }
    };
    this._onContextMenu = (e) => e.preventDefault();
    this._onWheel = (e) => {
      this.inventory.cycleSlot(e.deltaY);
    };
    this._onKeyDown = (e) => {
      if (this._isTyping()) return;
      // Number keys 1-9 select hotbar slots directly.
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this.inventory.selectSlot(n - 1);
      }
    };

    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('keydown', this._onKeyDown);
  }

  dispose() {
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _resetBreak() {
    this._breakProgress = 0;
    this._breakTarget = null;
    if (this.crack) {
      this.crack.visible = false;
      this.crack.material.opacity = 0;
    }
  }

  /* ------------------------------ raycast -------------------------------- */

  /**
   * Cast a ray from the camera through the voxel grid and return the first
   * solid (or liquid surface) voxel hit, plus the face normal that was crossed.
   * @returns {{x:number,y:number,z:number,nx:number,ny:number,nz:number}|null}
   */
  raycastVoxel() {
    const origin = this.camera.position;
    this.camera.getWorldDirection(this._dir);
    const dir = this._dir;

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    // Guard against division by zero on axis-aligned rays.
    const invX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const invY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const invZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    // Distance to the first voxel boundary on each axis.
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * invX : (origin.x - x) * invX;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * invY : (origin.y - y) * invY;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * invZ : (origin.z - z) * invZ;
    if (stepX === 0) tMaxX = Infinity;
    if (stepY === 0) tMaxY = Infinity;
    if (stepZ === 0) tMaxZ = Infinity;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let traveled = 0;

    while (traveled <= this.reach) {
      const id = this.world.getBlock(x, y, z);
      // Target solid blocks; ignore non-solid liquids/air so the ray passes
      // through water until it reaches something tangible.
      if (!isAir(id) && BLOCKS[id]?.solid) {
        return { x, y, z, nx, ny, nz };
      }

      // Advance to the next voxel boundary (smallest tMax).
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        traveled = tMaxX;
        tMaxX += invX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        traveled = tMaxY;
        tMaxY += invY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        traveled = tMaxZ;
        tMaxZ += invZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return null;
  }

  /* ------------------------------- actions ------------------------------- */

  /**
   * Attempt to break the currently targeted block.
   * @param {number} dt
   * @returns {boolean} true once a block is actually removed
   */
  _tryBreak(dt) {
    if (!this.target) {
      this._resetBreak();
      return false;
    }
    const { x, y, z } = this.target;
    const id = this.world.getBlock(x, y, z);
    if (isAir(id)) { this._resetBreak(); return false; }

    // Creative: any solid block breaks instantly in one tap (incl. bedrock).
    if (this.inventory.isCreative) {
      this.world.setBlock(x, y, z, AIR);
      this.onEdit?.(x, y, z, AIR);
      this._resetBreak();
      return true;
    }

    // Survival: bedrock (and any unbreakable block) can never be mined.
    if (!isBreakable(id)) {
      this._resetBreak();
      return false;
    }

    const key = `${x},${y},${z}`;
    if (this._breakTarget !== key) {
      // Switched to a new block — reset the damage counter.
      this._breakTarget = key;
      this._breakProgress = 0;
    }

    this._breakProgress += dt;
    // Break time depends on the block category and the held tool (class + tier).
    const breakTime = getBreakTime(id, this.inventory.getSelectedType());

    // Visualise mining progress on the crack overlay.
    this.crack.visible = true;
    this.crack.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.crack.material.opacity = Math.min(0.5, (this._breakProgress / breakTime) * 0.5);

    if (this._breakProgress >= breakTime) {
      this.world.setBlock(x, y, z, AIR);
      this.onEdit?.(x, y, z, AIR);
      // Drop the block into the inventory (survival) and cost a little hunger.
      const drop = getDrop(id);
      if (drop) this.onMine?.(drop);
      this.onExhaust?.(0.6);
      this._resetBreak();
      return true;
    }
    return false;
  }

  /**
   * Attempt to place the selected hotbar block against the targeted face.
   * @returns {boolean} true if a block was placed
   */
  _tryPlace() {
    // Holding armor? The place action equips it instead of placing.
    const heldType = this.inventory.getSelectedType();
    if (isArmor(heldType)) {
      if (this._placeCooldown > 0) return false;
      if (this.onEquip && this.onEquip(heldType)) {
        this.inventory.consumeSelected();
        this._placeCooldown = 0.3;
        return true;
      }
      return false;
    }

    // Holding food? The place action eats it instead of placing.
    if (isFood(heldType)) {
      if (this._placeCooldown > 0) return false;
      if (this.onEat && this.onEat(heldType)) {
        this.inventory.consumeSelected();
        this._placeCooldown = 0.4;
        return true;
      }
      return false;
    }

    if (!this.target || this._placeCooldown > 0) return false;
    const { x, y, z, nx, ny, nz } = this.target;
    const px = x + nx;
    const py = y + ny;
    const pz = z + nz;

    // Only place into empty space.
    if (!isAir(this.world.getBlock(px, py, pz))) return false;

    // Don't place a block inside the player's own AABB.
    if (this._intersectsPlayer(px, py, pz)) return false;

    // Resolve the held item to a placeable block id.
    const type = this.inventory.getSelectedType();
    const blockId = placeBlockId(type);
    if (!blockId || isAir(blockId)) return false;

    // Survival: must actually have the item; consume one on success.
    if (!this.inventory.consumeSelected()) return false;

    if (this.world.setBlock(px, py, pz, blockId)) {
      this.onEdit?.(px, py, pz, blockId);
      this._placeCooldown = 0.18; // throttle rapid placement
      return true;
    }
    return false;
  }

  /** @returns {boolean} whether voxel (x,y,z) overlaps the player bounding box. */
  _intersectsPlayer(x, y, z) {
    const p = this.physics.position;
    const minX = p.x - 0.3;
    const maxX = p.x + 0.3;
    const minY = p.y;
    const maxY = p.y + 1.8;
    const minZ = p.z - 0.3;
    const maxZ = p.z + 0.3;
    return (
      x + 1 > minX &&
      x < maxX &&
      y + 1 > minY &&
      y < maxY &&
      z + 1 > minZ &&
      z < maxZ
    );
  }

  /* ------------------------------- update -------------------------------- */

  /**
   * Per-frame interaction update: refresh the target, draw the highlight, and
   * service break/place input.
   * @param {number} dt
   */
  update(dt) {
    if (this._placeCooldown > 0) this._placeCooldown -= dt;
    if (this._attackCooldown > 0) this._attackCooldown -= dt;

    this.target = this.raycastVoxel();

    if (this.target) {
      this.highlight.visible = true;
      this.highlight.position.set(
        this.target.x + 0.5,
        this.target.y + 0.5,
        this.target.z + 0.5
      );
    } else {
      this.highlight.visible = false;
      this._resetBreak();
    }

    if (this.breaking) {
      // While "breaking", first try to hit a mob in front; if one is in range
      // we swing the weapon instead of mining. Otherwise, mine the block.
      if (this._attackCooldown <= 0 && this.onAttack && this.onAttack()) {
        this._attackCooldown = 0.5;
        this.onExhaust?.(0.3);
        this._resetBreak();
      } else {
        this._tryBreak(dt);
      }
    }
    if (this.placing || this._placeRequested) {
      this._tryPlace();
      this._placeRequested = false;
    }
  }

  _isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  /* --------------------------- touch input API --------------------------- */

  /** Begin/stop mining (touch long-press hold). @param {boolean} active */
  setBreaking(active) {
    this.breaking = active;
    if (!active) this._resetBreak();
  }

  /** Request a single block placement (touch tap). */
  requestPlace() {
    this._placeRequested = true;
  }
}

export default InteractionEngine;
