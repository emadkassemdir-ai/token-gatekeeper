/**
 * Mob
 * ---
 * A single generic entity that covers every creature via a `kind` config:
 * hostile mobs (zombie, creeper), passive land animals (cow, sheep) and aquatic
 * animals (fish, squid). Physics are deliberately light — land mobs follow the
 * terrain surface (auto-stepping small rises); aquatic mobs hover in water.
 *
 * Behaviour per kind:
 *   - hostile : pursue the player within aggro range; zombies deal contact
 *     damage, creepers fuse + detonate near the player (handled by EntityManager)
 *   - passive : wander randomly, and flee briefly after being hit
 *   - aquatic : wander horizontally within their spawn depth
 */

import * as THREE from 'three';

/** @typedef {'zombie'|'creeper'|'cow'|'sheep'|'fish'|'squid'} MobKind */

/** Per-kind configuration. */
export const MOB_TYPES = {
  zombie: { hostile: true, hp: 8, speed: 2.6, aggro: 18, drop: null,
    body: 0x3a7d35, head: 0x4a8f44, w: 0.6, h: 1.8 },
  creeper: { hostile: true, hp: 6, speed: 3.0, aggro: 20, drop: null,
    body: 0x4f9d3a, head: 0x4f9d3a, w: 0.6, h: 1.7 },
  cow: { passive: true, hp: 5, speed: 1.4, drop: 'raw_beef', dropCount: 2,
    body: 0x4a3526, head: 0xd8d2c8, w: 0.8, h: 1.3 },
  sheep: { passive: true, hp: 5, speed: 1.3, drop: 'raw_mutton', dropCount: 1,
    body: 0xe8e6e0, head: 0xd8c8b8, w: 0.8, h: 1.3 },
  fish: { passive: true, aquatic: true, hp: 2, speed: 2.0, drop: 'raw_salmon', dropCount: 1,
    body: 0xc8624a, head: 0xc8624a, w: 0.3, h: 0.3 },
  squid: { passive: true, aquatic: true, hp: 3, speed: 1.4, drop: null,
    body: 0x35476b, head: 0x35476b, w: 0.6, h: 0.7 }
};

export class Mob {
  /**
   * @param {MobKind} kind
   * @param {THREE.Vector3} position feet position
   */
  constructor(kind, position) {
    this.kind = kind;
    this.cfg = MOB_TYPES[kind];
    this.position = position.clone();
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.alive = true;
    this.vy = 0;
    this._knock = new THREE.Vector3();
    this._attackCooldown = 0;
    this._wanderDir = Math.random() * Math.PI * 2;
    this._wanderTimer = 0;
    this._fleeTimer = 0;
    this._fuse = 0;
    this.detonate = false; // set true when a creeper should explode now
    this._heading = 0;

    this.mesh = this._buildMesh();
    this.syncMesh();
  }

  get hostile() { return !!this.cfg.hostile; }
  get passive() { return !!this.cfg.passive; }
  get aquatic() { return !!this.cfg.aquatic; }

  _buildMesh() {
    const c = this.cfg;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: c.body });
    const headMat = new THREE.MeshLambertMaterial({ color: c.head });
    const bodyH = c.h * 0.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(c.w, bodyH, c.w * 0.6), bodyMat);
    body.position.y = c.h * 0.45;
    group.add(body);
    if (!c.aquatic) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(c.w * 0.7, c.h * 0.28, c.w * 0.6), headMat);
      head.position.y = c.h * 0.85;
      head.position.z = c.w * 0.25;
      group.add(head);
    }
    // Creepers get a slightly taller, pillar-like body for recognisability.
    if (this.kind === 'creeper') body.scale.y = 1.15;
    return group;
  }

  syncMesh() {
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.mesh.rotation.y = this._heading;
    // Creeper swells while fusing.
    if (this.kind === 'creeper' && this._fuse > 0) {
      const s = 1 + Math.sin(this._fuse * 30) * 0.12 * Math.min(1, this._fuse);
      this.mesh.scale.setScalar(s);
    }
  }

  /**
   * @param {number} amount hearts
   * @param {THREE.Vector3} [knockDir] normalized horizontal direction
   */
  takeDamage(amount, knockDir) {
    this.hp -= amount;
    this._fleeTimer = 3; // passive mobs bolt after being hit
    if (knockDir) {
      this._knock.copy(knockDir).multiplyScalar(4);
      this.vy = 4;
    }
    if (this.hp <= 0) this.alive = false;
  }

  /**
   * @param {number} dt
   * @param {import('../world/World.js').World} world
   * @param {THREE.Vector3} playerPos player feet position
   */
  update(dt, world, playerPos) {
    if (!this.alive) return;
    if (this._attackCooldown > 0) this._attackCooldown -= dt;
    if (this._fleeTimer > 0) this._fleeTimer -= dt;

    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const distH = Math.hypot(dx, dz);

    let mx = 0, mz = 0;
    const speed = this.cfg.speed;

    if (this.hostile && distH < this.cfg.aggro && distH > 0.001) {
      // Pursue the player.
      mx = (dx / distH) * speed * dt;
      mz = (dz / distH) * speed * dt;
      this._heading = Math.atan2(dx, dz);
      if (this.kind === 'creeper' && distH < 2.5) {
        this._fuse += dt;
        if (this._fuse >= 1.4) this.detonate = true;
      } else if (this.kind === 'creeper') {
        this._fuse = Math.max(0, this._fuse - dt * 0.5);
      }
    } else {
      // Wander (passive / out of range). Flee away from the player if recently hit.
      this._wanderTimer -= dt;
      if (this._wanderTimer <= 0) {
        this._wanderTimer = 2 + Math.random() * 3;
        this._wanderDir = this._fleeTimer > 0 && distH > 0.001
          ? Math.atan2(-dx, -dz)
          : Math.random() * Math.PI * 2;
      }
      const wSpeed = (this._fleeTimer > 0 ? speed * 1.8 : speed * 0.5) * dt;
      mx = Math.sin(this._wanderDir) * wSpeed;
      mz = Math.cos(this._wanderDir) * wSpeed;
      this._heading = this._wanderDir;
    }

    // Knockback impulse decay.
    mx += this._knock.x * dt;
    mz += this._knock.z * dt;
    this._knock.multiplyScalar(Math.max(0, 1 - dt * 6));

    if (this.aquatic) {
      this._updateAquatic(dt, world, mx, mz);
    } else {
      this._updateLand(dt, world, mx, mz);
    }
    this.syncMesh();
  }

  _updateLand(dt, world, mx, mz) {
    const nextX = this.position.x + mx;
    const nextZ = this.position.z + mz;
    const here = world.getSpawnHeight(this.position.x, this.position.z);
    const next = world.getSpawnHeight(nextX, nextZ);
    if (next - here <= 1.2) { // step limit — walls block mobs
      this.position.x = nextX;
      this.position.z = nextZ;
    }
    this.vy -= 26 * dt;
    this.position.y += this.vy * dt;
    const ground = world.getSpawnHeight(this.position.x, this.position.z);
    if (this.position.y <= ground) { this.position.y = ground; this.vy = 0; }
  }

  _updateAquatic(dt, world, mx, mz) {
    // Stay submerged: only move into cells that are still water.
    const nextX = this.position.x + mx;
    const nextZ = this.position.z + mz;
    if (world.isLiquidAt(nextX, this.position.y + 0.2, nextZ)) {
      this.position.x = nextX;
      this.position.z = nextZ;
    } else {
      this._wanderTimer = 0; // turn around next tick
    }
    // Gentle vertical bob, staying inside the water column.
    const bob = Math.sin((performance.now() / 1000 + this.position.x) * 1.5) * 0.3 * dt;
    if (world.isLiquidAt(this.position.x, this.position.y + bob + 0.2, this.position.z)) {
      this.position.y += bob;
    }
  }

  /** Zombie contact attack check. @param {THREE.Vector3} playerPos */
  canAttack(playerPos) {
    if (this.kind !== 'zombie' || this._attackCooldown > 0) return false;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dy = playerPos.y - this.position.y;
    return Math.hypot(dx, dz) < 1.1 && Math.abs(dy) < 2.0;
  }

  resetAttackCooldown() { this._attackCooldown = 1.0; }

  dispose() {
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

export default Mob;
