/**
 * Zombie
 * ------
 * A simple hostile mob: 8 hearts of health, walks toward the player across the
 * terrain surface, and deals contact damage. Physics are intentionally light —
 * it follows the surface height (auto-stepping small rises) and is held back by
 * walls more than ~1.2 blocks tall, which is enough to make player-built
 * defences meaningful without a full mob physics engine.
 */

import * as THREE from 'three';

export const ZOMBIE_MAX_HP = 8; // 8 hearts
const SPEED = 2.6;
const AGGRO_RANGE = 18;
const STEP_LIMIT = 1.2; // max height it can walk up

export class Zombie {
  /**
   * @param {THREE.Vector3} position feet position
   */
  constructor(position) {
    this.position = position.clone();
    this.hp = ZOMBIE_MAX_HP;
    this.alive = true;
    this.vy = 0;
    this._knock = new THREE.Vector3();
    this._attackCooldown = 0;

    this.mesh = this._buildMesh();
    this.syncMesh();
  }

  _buildMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a7d35 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x4a8f44 });
    const armMat = new THREE.MeshLambertMaterial({ color: 0x2f6b2b });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.35), bodyMat);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat);
    head.position.y = 1.75;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.25), armMat);
    armL.position.set(0.0, 1.0, 0.42); // arms outstretched forward
    armL.rotation.x = Math.PI / 2;

    group.add(body, head, armL);
    return group;
  }

  /** Push the simulated feet position onto the mesh, facing the heading. */
  syncMesh() {
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    if (this._heading !== undefined) this.mesh.rotation.y = this._heading;
  }

  /**
   * @param {number} amount hearts
   * @param {THREE.Vector3} [knockDir] normalized horizontal direction
   */
  takeDamage(amount, knockDir) {
    this.hp -= amount;
    if (knockDir) {
      this._knock.copy(knockDir).multiplyScalar(4);
      this.vy = 4;
    }
    if (this.hp <= 0) this.alive = false;
  }

  /**
   * @param {number} dt
   * @param {import('../world/World.js').World} world
   * @param {THREE.Vector3} playerPos feet position of the player
   */
  update(dt, world, playerPos) {
    if (!this.alive) return;
    if (this._attackCooldown > 0) this._attackCooldown -= dt;

    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const distH = Math.hypot(dx, dz);

    // Horizontal pursuit when within aggro range.
    let mx = 0;
    let mz = 0;
    if (distH < AGGRO_RANGE && distH > 0.001) {
      mx = (dx / distH) * SPEED * dt;
      mz = (dz / distH) * SPEED * dt;
      this._heading = Math.atan2(dx, dz);
    }

    // Apply knockback impulse (decays quickly).
    mx += this._knock.x * dt;
    mz += this._knock.z * dt;
    this._knock.multiplyScalar(Math.max(0, 1 - dt * 6));

    const nextX = this.position.x + mx;
    const nextZ = this.position.z + mz;
    const surfaceHere = world.getSpawnHeight(this.position.x, this.position.z);
    const surfaceNext = world.getSpawnHeight(nextX, nextZ);

    // Only move if the rise isn't a wall taller than the step limit.
    if (surfaceNext - surfaceHere <= STEP_LIMIT) {
      this.position.x = nextX;
      this.position.z = nextZ;
    }

    // Gravity + ground follow.
    this.vy -= 26 * dt;
    this.position.y += this.vy * dt;
    const ground = world.getSpawnHeight(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.vy = 0;
    }

    this.syncMesh();
  }

  /**
   * Whether the zombie is touching the player (for contact damage).
   * @param {THREE.Vector3} playerPos
   * @returns {boolean}
   */
  canAttack(playerPos) {
    if (this._attackCooldown > 0) return false;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dy = playerPos.y - this.position.y;
    return Math.hypot(dx, dz) < 1.1 && Math.abs(dy) < 2.0;
  }

  resetAttackCooldown() {
    this._attackCooldown = 1.0;
  }

  dispose() {
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

export default Zombie;
