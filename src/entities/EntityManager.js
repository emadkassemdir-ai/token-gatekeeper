/**
 * EntityManager
 * -------------
 * Spawns, updates and despawns all mobs, and arbitrates combat. Spawning is
 * context-aware (per the design spec):
 *
 *   - Hostiles (zombie/creeper) spawn on the surface at night, and in caves
 *     during the day at ~2x rate (and ~1.5x less at night underground).
 *   - Passive land animals (cow/sheep) spawn on grassy biomes in daylight.
 *   - Aquatic animals (fish/squid) spawn in nearby water.
 *
 * Creepers detonate near the player for 5 hearts and blow a crater. Killing a
 * passive animal drops its food via the onDrop callback.
 */

import * as THREE from 'three';
import { Mob, MOB_TYPES } from './Mob.js';
import { getAttackDamage } from '../world/ItemTypes.js';
import { BIOME } from '../world/World.js';

const PLAYER_REACH = 4.2;
const HOSTILE_CAP_SURFACE = 6;
const HOSTILE_CAP_CAVE = 12;   // 2x in caves
const PASSIVE_CAP = 8;
const CREEPER_BLAST = 4;       // radius of player damage
const CREEPER_CRATER = 3;      // radius of block destruction

export class EntityManager {
  constructor(scene, world, stats) {
    this.scene = scene;
    this.world = world;
    this.stats = stats;
    /** @type {Mob[]} */
    this.mobs = [];
    this._spawnTimer = 2;
    this.enabled = !stats.isCreative;
    this.peaceful = false;     // no hostile mobs
    this.damageMult = 1;       // difficulty scaling for mob damage

    this.onPlayerHit = null;  // (damage)
    this.onMobKilled = null;  // (kind)
    this.onDrop = null;       // (type, count)
    this.onExplosion = null;  // ()
    this.onEdit = null;       // (x,y,z,id) so block destruction persists
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  /**
   * Apply a difficulty: peaceful disables hostiles; higher difficulty scales
   * mob damage. Hardcore matches hard for damage (permadeath handled by host).
   * @param {string} difficulty
   */
  setDifficulty(difficulty) {
    this.peaceful = difficulty === 'peaceful';
    this.damageMult = { peaceful: 0, easy: 0.5, normal: 1, hard: 1.5, hardcore: 1.5 }[difficulty] ?? 1;
    if (this.peaceful) {
      // Remove any existing hostiles immediately.
      const keep = [];
      for (const m of this.mobs) {
        if (m.hostile) { this.scene.remove(m.mesh); m.dispose(); }
        else keep.push(m);
      }
      this.mobs = keep;
    }
  }

  clear() {
    for (const m of this.mobs) { this.scene.remove(m.mesh); m.dispose(); }
    this.mobs = [];
  }

  get count() { return this.mobs.length; }
  _countWhere(pred) { let n = 0; for (const m of this.mobs) if (pred(m)) n++; return n; }

  _spawn(kind, pos) {
    const mob = new Mob(kind, pos);
    this.mobs.push(mob);
    this.scene.add(mob.mesh);
    return mob;
  }

  /** Cheat: force-spawn a mob near a position. */
  spawnKind(kind, pos) {
    if (!MOB_TYPES[kind]) return false;
    this._spawn(kind, pos.clone());
    return true;
  }

  /** Cheat: kill the nearest mob to a point. @returns {boolean} */
  smiteNearest(pos) {
    let best = null, bd = Infinity;
    for (const m of this.mobs) {
      const d = m.position.distanceToSquared(pos);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return false;
    best.takeDamage(9999);
    return true;
  }

  /* ------------------------------ spawning ------------------------------- */

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos feet position
   * @param {{isNight:boolean}} time
   */
  update(dt, playerPos, time = { isNight: false }) {
    if (!this.enabled || this.stats.dead) return;

    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = 4;
      this._trySpawn(playerPos, time);
    }

    for (const m of this.mobs) {
      if (m.cfg.defender) this._defendVillage(m);
      m.update(dt, this.world, playerPos);
      if (m.cfg.melee && m.canAttack(playerPos)) {
        m.resetAttackCooldown();
        const dmg = (m.kind === 'pigman' ? 1.5 : 0.5) * this.damageMult;
        if (dmg > 0 && this.stats.damage(dmg)) this.onPlayerHit?.(dmg);
      }
      if (m.cfg.ranged && m.canRanged(playerPos)) {
        m.resetRanged();
        const dmg = (m.kind === 'ghast' ? 3 : 2) * this.damageMult;
        this.stats._damageCooldown = 0;
        if (dmg > 0 && this.stats.damage(dmg)) this.onPlayerHit?.(dmg);
      }
      if (m.detonate) this._detonate(m, playerPos);
    }

    // Reap dead mobs and emit drops for ones the player killed.
    const survivors = [];
    for (const m of this.mobs) {
      if (m.alive && !m.detonate) {
        survivors.push(m);
      } else {
        this.scene.remove(m.mesh);
        m.dispose();
        if (!m.detonate) {
          const drops = m.cfg.drops || (m.cfg.drop ? [[m.cfg.drop, m.cfg.dropCount || 1]] : []);
          for (const [type, count] of drops) this.onDrop?.(type, count);
        }
        this.onMobKilled?.(m.kind);
      }
    }
    this.mobs = survivors;
  }

  _trySpawn(playerPos, time) {
    // The End: endermen roam (the dragon is spawned on arrival, not here).
    if (this.world.dimension === 'end') {
      if (this._countWhere((m) => m.kind === 'enderman') < 6) {
        const s = this._findSurfaceSpot(playerPos);
        if (s && this.world.isSolidAt(s.x, s.y - 1, s.z)) this._spawn('enderman', s);
      }
      return;
    }

    // The Nether has its own inhabitants (no day/night, no overworld animals).
    if (this.world.dimension === 'nether') {
      if (this.peaceful) return;
      if (this._countWhere((m) => m.hostile) >= HOSTILE_CAP_CAVE) return;
      const r = Math.random();
      if (r < 0.34) {
        const s = this._findCaveSpot(playerPos);     // pigman walks the netherrack
        if (s) this._spawn('pigman', s);
      } else if (r < 0.5) {
        const s = this._findCaveSpot(playerPos);     // wither skeleton (fortress dweller)
        if (s) this._spawn('wither_skeleton', s);
      } else if (r < 0.66) {
        const s = this._findCaveSpot(playerPos);     // magma cube bounces
        if (s) this._spawn('magma_cube', s);
      } else if (r < 0.85) {
        const s = this._findAirSpot(playerPos);       // blaze hovers
        if (s) this._spawn('blaze', s);
      } else {
        const s = this._findAirSpot(playerPos);       // ghast drifts
        if (s) this._spawn('ghast', s);
      }
      return;
    }

    const surfaceY = this.world.getSpawnHeight(playerPos.x, playerPos.z);
    const inCave = surfaceY - playerPos.y > 4;

    // Villages stay populated with residents + a guardian golem at any hour.
    if (!inCave) this._trySpawnVillage(playerPos);

    if (inCave && !this.peaceful) {
      // Caves: hostiles, 2x cap. Slower spawn at night (1.5x less) than day.
      const cap = HOSTILE_CAP_CAVE;
      if (this._countWhere((m) => m.hostile) < cap) {
        if (time.isNight && Math.random() < 1 / 1.5) return; // ~1.5x less at night
        const spot = this._findCaveSpot(playerPos);
        if (spot) this._spawn(this._pickHostile(), spot);
      }
      return;
    }

    // Surface.
    if (time.isNight && !this.peaceful) {
      if (this._countWhere((m) => m.hostile || m.kind === 'enderman') < HOSTILE_CAP_SURFACE) {
        const spot = this._findSurfaceSpot(playerPos);
        // Endermen wander at night; phantoms swoop from above.
        if (spot) {
          const roll = Math.random();
          if (roll < 0.1) { const a = this._findAirSpot(playerPos); if (a) this._spawn('phantom', a); }
          else if (roll < 0.16) this._spawn('pillager', spot); // patrol (can give Bad Omen)
          else this._spawn(roll < 0.26 ? 'enderman' : this._pickHostile(), spot);
        }
      }
    } else {
      // Daytime passive animals on grassy ground (cow/sheep/pig/chicken).
      if (this._countWhere((m) => m.passive && !m.aquatic) < PASSIVE_CAP) {
        const spot = this._findSurfaceSpot(playerPos);
        if (spot && this._isGrassy(spot)) {
          this._spawn(['cow', 'sheep', 'pig', 'chicken', 'rabbit', 'wolf', 'fox', 'goat', 'villager'][Math.floor(Math.random() * 9)], spot);
        }
      }
    }

    // Aquatic animals whenever water is nearby (drowned lurk at night).
    if (this._countWhere((m) => m.aquatic) < PASSIVE_CAP) {
      const wspot = this._findWaterSpot(playerPos);
      if (wspot) {
        let kind;
        if (time.isNight && !this.peaceful && Math.random() < 0.4) kind = 'drowned';
        else {
          const r = Math.random();
          kind = r < 0.3 ? 'fish' : r < 0.5 ? 'squid' : r < 0.72 ? 'axolotl'
            : r < 0.9 ? 'dolphin' : 'tropical';
          if (kind === 'tropical') kind = 'fish'; // tropical fish reuse the fish model
        }
        this._spawn(kind, wspot);
      }
    }

    // Sea turtles bask on sandy beaches near the water in daylight.
    if (!time.isNight && this._countWhere((m) => m.kind === 'turtle') < 4) {
      const spot = this._findSurfaceSpot(playerPos);
      if (spot && this.world.getBlock(Math.floor(spot.x), Math.floor(spot.y) - 1, Math.floor(spot.z)) === 7
          && Math.random() < 0.5) {
        this._spawn('turtle', spot);
      }
    }
  }

  /**
   * Golems lock onto the nearest hostile. Melee golems (iron) strike in reach;
   * ranged golems (snow) pelt snowballs from a distance.
   */
  _defendVillage(m) {
    let target = null, best = 16; // search radius
    for (const o of this.mobs) {
      if (!o.alive || !o.hostile) continue;
      const d = o.position.distanceTo(m.position);
      if (d < best) { best = d; target = o; }
    }
    m._defendTarget = target ? target.position : null;
    if (!target || m._attackCooldown > 0) return;
    const reach = m.cfg.ranged ? (m.cfg.range || 10) : 2.6;
    if (best < reach) {
      m._attackCooldown = m.cfg.ranged ? 0.8 : 1.0;
      const kx = target.position.x - m.position.x, kz = target.position.z - m.position.z;
      const kl = Math.hypot(kx, kz) || 1;
      target.takeDamage(m.cfg.attack || 7, new THREE.Vector3(kx / kl, 0, kz / kl));
    }
  }

  /** Populate nearby villages with villagers and a guardian iron golem. */
  _trySpawnVillage(playerPos) {
    const villages = this.world.villages;
    if (!villages || !villages.length) return;
    for (const v of villages) {
      if (Math.hypot(v.x - playerPos.x, v.z - playerPos.z) > 48) continue;
      const near = (kind) => this._countWhere(
        (m) => m.kind === kind && Math.hypot(m.position.x - v.x, m.position.z - v.z) < 28);
      if (near('villager') < 4 && Math.random() < 0.5) {
        const s = this._villageSpot(v); if (s) this._spawn('villager', s);
      }
      if (near('iron_golem') < 1) {
        const s = this._villageSpot(v); if (s) this._spawn('iron_golem', s);
      }
    }
  }

  /** A surface spot scattered around a village centre. */
  _villageSpot(v) {
    const x = Math.floor(v.x + (Math.random() * 16 - 8)) + 0.5;
    const z = Math.floor(v.z + (Math.random() * 16 - 8)) + 0.5;
    const y = this.world.getSpawnHeight(x, z);
    return new THREE.Vector3(x, y, z);
  }

  _isGrassy(pos) {
    const b = this.world.sampleColumn(pos.x, pos.z).biome;
    return b === BIOME.PLAINS || b === BIOME.JUNGLE ||
      b === BIOME.FOREST || b === BIOME.SAVANNA || b === BIOME.TAIGA;
  }

  /** Pick an overworld hostile (witch is rarer). */
  _pickHostile() {
    if (Math.random() < 0.08) return 'witch';
    return ['zombie', 'creeper', 'skeleton', 'spider', 'husk', 'stray', 'slime'][Math.floor(Math.random() * 7)];
  }

  _findSurfaceSpot(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 8;
    const x = Math.floor(playerPos.x + Math.cos(angle) * dist) + 0.5;
    const z = Math.floor(playerPos.z + Math.sin(angle) * dist) + 0.5;
    const y = this.world.getSpawnHeight(x, z);
    return new THREE.Vector3(x, y, z);
  }

  _findCaveSpot(playerPos) {
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(playerPos.x + (Math.random() * 16 - 8)) + 0.5;
      const z = Math.floor(playerPos.z + (Math.random() * 16 - 8)) + 0.5;
      const y = Math.floor(playerPos.y + (Math.random() * 6 - 3));
      if (y < 2) continue;
      if (this.world.isSolidAt(x, y - 1, z) &&
          !this.world.isSolidAt(x, y, z) &&
          !this.world.isSolidAt(x, y + 1, z)) {
        return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  /** A pocket of open air a few blocks from the player (for flying mobs). */
  _findAirSpot(playerPos) {
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(playerPos.x + (Math.random() * 18 - 9)) + 0.5;
      const z = Math.floor(playerPos.z + (Math.random() * 18 - 9)) + 0.5;
      const y = Math.floor(playerPos.y + (Math.random() * 6 + 1));
      if (!this.world.isSolidAt(x, y, z) && !this.world.isSolidAt(x, y + 1, z)) {
        return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  _findWaterSpot(playerPos) {
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(playerPos.x + (Math.random() * 20 - 10)) + 0.5;
      const z = Math.floor(playerPos.z + (Math.random() * 20 - 10)) + 0.5;
      for (let y = 28; y <= 31; y++) {
        if (this.world.isLiquidAt(x, y, z)) return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  /* ------------------------------ combat --------------------------------- */

  /**
   * Detonate a creeper: damage the player if in range and blow a crater.
   * @param {Mob} mob @param {THREE.Vector3} playerPos
   */
  _detonate(mob, playerPos) {
    const d = mob.position.distanceTo(playerPos);
    if (d <= CREEPER_BLAST) {
      this.stats._damageCooldown = 0;
      const dmg = 5 * this.damageMult; // creeper: 5 hearts (scaled by difficulty)
      if (dmg > 0 && this.stats.damage(dmg)) this.onPlayerHit?.(dmg);
    }
    // Crater (skip bedrock and don't dig the whole world).
    const cx = Math.floor(mob.position.x);
    const cy = Math.floor(mob.position.y);
    const cz = Math.floor(mob.position.z);
    const r = CREEPER_CRATER;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          const x = cx + dx, y = cy + dy, z = cz + dz;
          const id = this.world.getBlock(x, y, z);
          if (id && id !== 4 && id !== 8) { // not bedrock/water
            this.world.setBlock(x, y, z, 0);
            this.onEdit?.(x, y, z, 0);
          }
        }
      }
    }
    this.onExplosion?.();
  }

  /**
   * Generic explosion (used by TNT): crater blocks and hurt a nearby player.
   * @param {THREE.Vector3|{x,y,z}} center @param {number} radius @param {THREE.Vector3} [playerPos]
   */
  explode(center, radius = 3, playerPos = null) {
    const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
          const x = cx + dx, y = cy + dy, z = cz + dz;
          const id = this.world.getBlock(x, y, z);
          if (id && id !== 4) { // never bedrock
            this.world.setBlock(x, y, z, 0);
            this.onEdit?.(x, y, z, 0);
          }
        }
      }
    }
    if (playerPos) {
      const d = Math.hypot(playerPos.x - center.x, playerPos.y - center.y, playerPos.z - center.z);
      if (d <= radius + 1) {
        this.stats._damageCooldown = 0;
        const dmg = Math.max(1, (radius + 1 - d) * 2);
        if (this.stats.damage(dmg)) this.onPlayerHit?.(dmg);
      }
    }
    // Hurt nearby mobs too.
    for (const m of this.mobs) {
      if (m.position.distanceTo(center) <= radius + 1) m.takeDamage(10);
    }
    this.onExplosion?.();
  }

  /**
   * Player swings the held item at the nearest mob in front.
   * @param {THREE.Vector3} origin eye position
   * @param {THREE.Vector3} dir normalized look direction
   * @param {string|null} heldType
   * @returns {boolean} whether a mob was hit
   */
  /** Find the nearest mob of `kind` the player is looking at (for interaction). */
  pickMob(origin, dir, reach = 4, kind = null) {
    let best = null, bestDist = reach;
    for (const m of this.mobs) {
      if (kind && m.kind !== kind) continue;
      const cx = m.position.x - origin.x, cy = m.position.y + 0.8 - origin.y, cz = m.position.z - origin.z;
      const dist = Math.hypot(cx, cy, cz);
      if (dist > bestDist) continue;
      const dot = (cx * dir.x + cy * dir.y + cz * dir.z) / (dist || 1);
      if (dot < 0.4) continue;
      best = m; bestDist = dist;
    }
    return best;
  }

  playerAttack(origin, dir, heldType, reach = PLAYER_REACH, bonus = 0) {
    if (!this.enabled) return false;
    let best = null, bestDist = reach;
    for (const m of this.mobs) {
      const cx = m.position.x - origin.x;
      const cy = m.position.y + 0.8 - origin.y;
      const cz = m.position.z - origin.z;
      const dist = Math.hypot(cx, cy, cz);
      if (dist > bestDist) continue;
      const dot = (cx * dir.x + cy * dir.y + cz * dir.z) / (dist || 1);
      if (dot < 0.35) continue; // forgiving melee cone (~70°) so touch aiming works
      best = m; bestDist = dist;
    }
    if (!best) return false;
    const knock = new THREE.Vector3(dir.x, 0, dir.z);
    if (knock.lengthSq() > 0) knock.normalize();
    best.takeDamage(getAttackDamage(heldType) + bonus, knock);
    return true;
  }
}

export default EntityManager;
