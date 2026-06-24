/**
 * EntityManager
 * -------------
 * Spawns, updates and despawns hostile mobs (zombies) and arbitrates combat in
 * both directions: zombies dealing contact damage to the player, and the
 * player swinging the held weapon at the nearest zombie in view.
 *
 * Mobs only exist in survival mode; switching to creative clears them.
 */

import * as THREE from 'three';
import { Zombie } from './Zombie.js';
import { getAttackDamage } from '../world/ItemTypes.js';

const MAX_ZOMBIES = 6;
const SPAWN_INTERVAL = 6; // seconds between spawn attempts
const SPAWN_MIN = 10;
const SPAWN_MAX = 18;
const PLAYER_REACH = 3.6;

export class EntityManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../world/World.js').World} world
   * @param {import('../state/PlayerStats.js').PlayerStats} stats
   */
  constructor(scene, world, stats) {
    this.scene = scene;
    this.world = world;
    this.stats = stats;
    /** @type {Zombie[]} */
    this.zombies = [];
    this._spawnTimer = SPAWN_INTERVAL;
    this.enabled = !stats.isCreative;

    /** Optional callbacks for the chat/HUD log. */
    this.onPlayerHit = null; // (damage)
    this.onZombieKilled = null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  clear() {
    for (const z of this.zombies) {
      this.scene.remove(z.mesh);
      z.dispose();
    }
    this.zombies = [];
  }

  get count() {
    return this.zombies.length;
  }

  /**
   * Spawn one zombie at a random surface point a comfortable distance from the
   * player.
   * @param {THREE.Vector3} playerPos
   */
  spawnNear(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const x = Math.floor(playerPos.x + Math.cos(angle) * dist) + 0.5;
    const z = Math.floor(playerPos.z + Math.sin(angle) * dist) + 0.5;
    const y = this.world.getSpawnHeight(x, z);
    const zombie = new Zombie(new THREE.Vector3(x, y, z));
    this.zombies.push(zombie);
    this.scene.add(zombie.mesh);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos feet position
   */
  update(dt, playerPos) {
    if (!this.enabled || this.stats.dead) return;

    // Periodic spawning up to the cap.
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = SPAWN_INTERVAL;
      if (this.zombies.length < MAX_ZOMBIES) this.spawnNear(playerPos);
    }

    for (const z of this.zombies) {
      z.update(dt, this.world, playerPos);
      // Contact damage.
      if (z.canAttack(playerPos)) {
        z.resetAttackCooldown();
        if (this.stats.damage(1)) this.onPlayerHit?.(1);
      }
    }

    // Reap the dead.
    const survivors = [];
    for (const z of this.zombies) {
      if (z.alive) {
        survivors.push(z);
      } else {
        this.scene.remove(z.mesh);
        z.dispose();
        this.onZombieKilled?.();
      }
    }
    this.zombies = survivors;
  }

  /**
   * Player swings the held item. Hits the nearest zombie within reach and
   * roughly in front of the camera.
   * @param {THREE.Vector3} origin camera/eye position
   * @param {THREE.Vector3} dir normalized look direction
   * @param {string|null} heldType item type in hand (for damage)
   * @returns {boolean} whether a zombie was hit
   */
  playerAttack(origin, dir, heldType) {
    if (!this.enabled) return false;
    let best = null;
    let bestDist = PLAYER_REACH;

    for (const z of this.zombies) {
      // Aim at the zombie's torso.
      const cx = z.position.x - origin.x;
      const cy = z.position.y + 1.0 - origin.y;
      const cz = z.position.z - origin.z;
      const dist = Math.hypot(cx, cy, cz);
      if (dist > bestDist) continue;
      // In front of the camera?
      const dot = (cx * dir.x + cy * dir.y + cz * dir.z) / (dist || 1);
      if (dot < 0.55) continue;
      best = z;
      bestDist = dist;
    }

    if (!best) return false;
    const knock = new THREE.Vector3(dir.x, 0, dir.z);
    if (knock.lengthSq() > 0) knock.normalize();
    best.takeDamage(getAttackDamage(heldType), knock);
    return true;
  }
}

export default EntityManager;
