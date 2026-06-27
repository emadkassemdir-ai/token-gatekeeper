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
  zombie: { hostile: true, melee: true, hp: 8, speed: 2.6, aggro: 18, drop: 'rotten_flesh',
    body: 0x3a7d35, head: 0x4a8f44, w: 0.6, h: 1.8 },
  creeper: { hostile: true, hp: 6, speed: 3.0, aggro: 20, drop: 'gunpowder',
    body: 0x4f9d3a, head: 0x4f9d3a, w: 0.6, h: 1.7 },
  skeleton: { hostile: true, ranged: true, hp: 8, speed: 2.4, aggro: 18,
    drops: [['bone', 1], ['arrow', 1]], body: 0xd8d8d2, head: 0xe2e2dc, w: 0.5, h: 1.8 },
  spider: { hostile: true, melee: true, hp: 8, speed: 3.2, aggro: 16,
    drops: [['string', 1], ['spider_eye', 1]], body: 0x2a2420, head: 0x2a2420, w: 1.0, h: 0.7 },
  enderman: { passive: true, hp: 16, speed: 2.4, drop: 'ender_pearl', dropCount: 1,
    body: 0x14141c, head: 0x14141c, w: 0.5, h: 2.6 },
  husk: { hostile: true, melee: true, hp: 8, speed: 2.4, aggro: 18, drop: 'rotten_flesh',
    body: 0xb6a06a, head: 0xc6b07a, w: 0.6, h: 1.8 },
  stray: { hostile: true, ranged: true, hp: 8, speed: 2.4, aggro: 18, drops: [['bone', 1], ['arrow', 1]],
    body: 0xc6d2d6, head: 0xd2dde0, w: 0.5, h: 1.8 },
  drowned: { hostile: true, melee: true, aquatic: true, hp: 8, speed: 1.8, aggro: 16, drop: 'rotten_flesh',
    body: 0x3a6a64, head: 0x4a7a72, w: 0.6, h: 1.8 },
  witch: { hostile: true, ranged: true, hp: 14, speed: 2.2, aggro: 18, drop: 'redstone', dropCount: 2,
    body: 0x4a2a5a, head: 0x6a8a6a, w: 0.6, h: 1.8 },
  slime: { hostile: true, melee: true, hp: 4, speed: 2.0, aggro: 16, drop: 'slimeball', dropCount: 1,
    body: 0x6ec24a, head: 0x6ec24a, w: 0.8, h: 0.8 },
  rabbit: { passive: true, hp: 3, speed: 2.2, drops: [['raw_rabbit', 1], ['rabbit_foot', 1]],
    body: 0xb89878, head: 0xb89878, w: 0.4, h: 0.5 },
  wolf: { passive: true, hp: 8, speed: 2.6, drop: null, body: 0xc8c4bc, head: 0xc8c4bc, w: 0.6, h: 0.85 },
  fox: { passive: true, hp: 5, speed: 2.8, drop: null, body: 0xd07a3a, head: 0xd07a3a, w: 0.5, h: 0.6 },
  goat: { passive: true, hp: 10, speed: 2.2, drop: null, body: 0xd8d2c6, head: 0xe0dccf, w: 0.7, h: 1.2 },
  villager: { passive: true, hp: 10, speed: 1.4, drop: null, body: 0x9a8268, head: 0xc8a888, w: 0.6, h: 1.9 },
  iron_golem: { defender: true, hp: 50, speed: 1.6, attack: 7, drops: [['iron_ingot', 4]],
    body: 0xd8d8d8, head: 0xd0d0c8, w: 1.4, h: 2.7 },
  snow_golem: { defender: true, ranged: true, hp: 4, speed: 1.8, attack: 1, range: 10,
    drops: [['snowball', 4]], body: 0xeef2f5, head: 0xeef2f5, w: 0.7, h: 1.9 },
  bat: { passive: true, flying: true, hp: 2, speed: 2.6, drop: null,
    body: 0x3a2e24, head: 0x3a2e24, w: 0.4, h: 0.4 },
  // ---- Nether mobs ----
  pigman: { hostile: true, melee: true, nether: true, hp: 10, speed: 2.4, aggro: 16,
    drop: 'cooked_porkchop', dropCount: 1, body: 0x9c7a6a, head: 0xd8a0a0, w: 0.6, h: 1.8 },
  blaze: { hostile: true, ranged: true, flying: true, nether: true, hp: 8, speed: 2.2, aggro: 18,
    drop: 'blaze_rod', dropCount: 1, body: 0xf0b000, head: 0xffd33a, w: 0.5, h: 1.6 },
  ghast: { hostile: true, ranged: true, flying: true, nether: true, hp: 6, speed: 1.5, aggro: 30,
    drops: [['gunpowder', 1], ['ghast_tear', 1]], body: 0xeae6e0, head: 0xeae6e0, w: 1.4, h: 1.4 },
  // ---- The End ----
  ender_dragon: { hostile: true, ranged: true, melee: true, flying: true, end: true, boss: true,
    hp: 50, speed: 3.2, aggro: 80, drop: 'dragon_egg', dropCount: 1,
    body: 0x1a1a22, head: 0x1a1a22, w: 3.0, h: 2.0 },
  wither_skeleton: { hostile: true, melee: true, nether: true, hp: 10, speed: 2.4, aggro: 18,
    drops: [['bone', 1], ['coal', 1], ['wither_skeleton_skull', 1]], body: 0x1c1c1c, head: 0x282828, w: 0.5, h: 2.0 },
  magma_cube: { hostile: true, melee: true, nether: true, hp: 6, speed: 2.2, aggro: 16,
    drop: 'magma_cream', dropCount: 1, body: 0xd84a20, head: 0xd84a20, w: 0.9, h: 0.9 },
  phantom: { hostile: true, ranged: true, flying: true, hp: 6, speed: 3.0, aggro: 24,
    drop: 'phantom_membrane', dropCount: 1, body: 0x49586a, head: 0x49586a, w: 1.2, h: 0.5 },
  wither: { hostile: true, ranged: true, flying: true, boss: true, hp: 100, speed: 2.6, aggro: 60,
    drop: 'nether_star', dropCount: 1, body: 0x161616, head: 0x2a2a2a, w: 1.2, h: 3.0 },
  // ---- Illagers (raids) ----
  pillager: { hostile: true, ranged: true, illager: true, hp: 12, speed: 2.2, aggro: 22,
    drops: [['arrow', 2], ['emerald', 1]], body: 0x4a4f4c, head: 0x9aa79a, w: 0.6, h: 1.9 },
  vindicator: { hostile: true, melee: true, illager: true, hp: 12, speed: 2.6, aggro: 20,
    drop: 'emerald', dropCount: 1, body: 0x3f4441, head: 0x9aa79a, w: 0.6, h: 1.9 },
  evoker: { hostile: true, ranged: true, illager: true, hp: 12, speed: 2.0, aggro: 20,
    drops: [['emerald', 1], ['totem', 1]], body: 0x35393a, head: 0x9aa79a, w: 0.6, h: 1.9 },
  ravager: { hostile: true, melee: true, illager: true, hp: 50, speed: 2.4, aggro: 24,
    drop: 'saddle', dropCount: 1, body: 0x4a3a30, head: 0x5a4636, w: 1.5, h: 1.7 },
  vex: { hostile: true, melee: true, flying: true, illager: true, hp: 4, speed: 3.4, aggro: 20,
    drop: null, body: 0x7c9ab2, head: 0x7c9ab2, w: 0.3, h: 0.5 },
  cow: { passive: true, hp: 5, speed: 1.4, drops: [['raw_beef', 1], ['leather', 1]],
    body: 0x4a3526, head: 0xd8d2c8, w: 0.8, h: 1.3 },
  sheep: { passive: true, hp: 5, speed: 1.3, drop: 'raw_mutton', dropCount: 1,
    body: 0xe8e6e0, head: 0xd8c8b8, w: 0.8, h: 1.3 },
  pig: { passive: true, hp: 5, speed: 1.4, drop: 'raw_porkchop', dropCount: 1,
    body: 0xe6a0a0, head: 0xe6a0a0, w: 0.8, h: 1.2 },
  chicken: { passive: true, hp: 4, speed: 1.5, drops: [['raw_chicken', 1], ['feather', 1]],
    body: 0xeeeeee, head: 0xeeeeee, w: 0.45, h: 0.7 },
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
    const group = new THREE.Group();
    const build = {
      cow: buildCow, sheep: buildSheep, zombie: buildZombie,
      creeper: buildCreeper, fish: buildFish, squid: buildSquid,
      pigman: buildPigman, blaze: buildBlaze, ghast: buildGhast,
      pig: buildPig, chicken: buildChicken, skeleton: buildSkeleton,
      spider: buildSpider, enderman: buildEnderman, ender_dragon: buildDragon,
      husk: buildZombie, drowned: buildZombie, stray: buildSkeleton,
      witch: buildWitch, slime: buildSlime, rabbit: buildRabbit, bat: buildBat,
      wolf: buildQuadruped, fox: buildFox, goat: buildGoat, villager: buildVillager,
      iron_golem: buildIronGolem, snow_golem: buildSnowGolem,
      wither_skeleton: buildSkeleton, magma_cube: buildSlime, phantom: buildPhantom,
      wither: buildWither,
      pillager: buildIllager, vindicator: buildIllager, evoker: buildIllager,
      ravager: buildRavager, vex: buildVex
    }[this.kind] || buildGeneric;
    build(group, this.cfg);
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
    } else if (this.cfg.defender && this._defendTarget) {
      // Iron golems march toward the hostile the manager assigned them.
      const tdx = this._defendTarget.x - this.position.x;
      const tdz = this._defendTarget.z - this.position.z;
      const td = Math.hypot(tdx, tdz);
      if (td > 0.001) {
        mx = (tdx / td) * speed * dt;
        mz = (tdz / td) * speed * dt;
        this._heading = Math.atan2(tdx, tdz);
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

    if (this.cfg.flying) {
      this._updateFlying(dt, world, mx, mz, playerPos);
    } else if (this.aquatic) {
      this._updateAquatic(dt, world, mx, mz);
    } else {
      this._updateLand(dt, world, mx, mz);
    }
    this.syncMesh();
  }

  /** Flying mobs (blaze/ghast) hover near the player and bob, ignoring gravity. */
  _updateFlying(dt, world, mx, mz, playerPos) {
    this.position.x += mx;
    this.position.z += mz;
    // Float toward a hover altitude a few blocks above the player.
    const desiredY = playerPos.y + 3;
    const step = Math.sign(desiredY - this.position.y) * Math.min(Math.abs(desiredY - this.position.y), this.cfg.speed * dt);
    this.position.y += step + Math.sin(performance.now() / 500 + this.position.x) * 0.15 * dt;
    // Never sink into solid ground.
    const floor = world.getSpawnHeight(this.position.x, this.position.z);
    if (this.position.y < floor + 1) this.position.y = floor + 1;
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

  /** Melee contact attack check (zombie, pigman). @param {THREE.Vector3} playerPos */
  canAttack(playerPos) {
    if (!this.cfg.melee || this._attackCooldown > 0) return false;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dy = playerPos.y - this.position.y;
    return Math.hypot(dx, dz) < 1.1 && Math.abs(dy) < 2.0;
  }

  /** Ranged attack check (blaze, ghast) — a "fireball" within aggro range. */
  canRanged(playerPos) {
    if (!this.cfg.ranged || this._attackCooldown > 0) return false;
    const d = Math.hypot(playerPos.x - this.position.x, playerPos.y - this.position.y, playerPos.z - this.position.z);
    return d < this.cfg.aggro;
  }

  resetAttackCooldown() { this._attackCooldown = 1.0; }
  resetRanged() { this._attackCooldown = 2.5; }

  dispose() {
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((mm) => mm && mm.dispose && mm.dispose());
      else if (m && m.dispose) m.dispose();
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Mob models (distinct, textured shapes — built once per mob)                 */
/* -------------------------------------------------------------------------- */

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}
function add(group, mesh, x, y, z) { mesh.position.set(x, y, z); group.add(mesh); return mesh; }

/** Draw a 16×16 face on a canvas → texture (null when no canvas / headless). */
function faceTexture(draw) {
  if (typeof document === 'undefined') return null;
  let c, ctx;
  try { c = document.createElement('canvas'); ctx = c.getContext && c.getContext('2d'); } catch { return null; }
  if (!ctx) return null;
  c.width = 16; c.height = 16;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
const rect = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

/** Head box whose front (+Z) face shows `tex`, rest tinted `baseHex`. */
function headWithFace(w, h, d, baseHex, tex) {
  const base = new THREE.MeshLambertMaterial({ color: baseHex });
  const front = tex ? new THREE.MeshLambertMaterial({ map: tex }) : base;
  // BoxGeometry material order: +x,-x,+y,-y,+z,-z  (front = +z = index 4)
  const mats = [base, base, base, base, front, base];
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}

function quadLegs(group, color, x, z, h, top) {
  for (const sx of [-x, x]) for (const sz of [-z, z]) {
    const leg = box(0.18, h, 0.18, color);
    add(group, leg, sx, h / 2, sz + top);
  }
}

function buildCow(group) {
  const brown = 0x4a3526, white = 0xddd8cf, pink = 0xd98a8a;
  add(group, box(0.85, 0.7, 1.4, brown), 0, 0.95, 0);          // body
  add(group, box(0.5, 0.3, 0.2, white), 0.2, 1.05, 0.2);       // white patch
  add(group, box(0.4, 0.25, 0.2, white), -0.25, 0.9, -0.3);
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#c9a07a'); rect(ctx, 3, 5, 3, 3, '#222'); rect(ctx, 10, 5, 3, 3, '#222'); rect(ctx, 5, 11, 6, 3, '#d98a8a'); });
  add(group, headWithFace(0.55, 0.5, 0.45, 0x6b4a32, face), 0, 1.15, 0.85); // head forward (+z)
  add(group, box(0.12, 0.12, 0.12, 0xeee0c0), -0.18, 1.42, 0.85); // horns
  add(group, box(0.12, 0.12, 0.12, 0xeee0c0), 0.18, 1.42, 0.85);
  quadLegs(group, 0x3a281c, 0.3, 0.5, 0.6, 0);
}

function buildSheep(group) {
  const wool = 0xeeeae2, skin = 0xd8c8b8;
  add(group, box(1.0, 0.85, 1.2, wool), 0, 1.0, 0);            // fluffy body
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#d8c8b8'); rect(ctx, 3, 6, 3, 3, '#222'); rect(ctx, 10, 6, 3, 3, '#222'); });
  add(group, headWithFace(0.45, 0.45, 0.4, skin, face), 0, 1.15, 0.7);
  quadLegs(group, 0x4a4038, 0.32, 0.42, 0.55, 0);
}

function buildZombie(group, cfg) {
  const skin = cfg?.head ?? 0x4a8f44, shirt = 0x3a5a8c, pants = 0x2f3a6b;
  add(group, box(0.6, 1.0, 0.35, shirt), 0, 1.0, 0);          // torso
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#3a7d35'); rect(ctx, 3, 5, 3, 3, '#0a1a0a'); rect(ctx, 10, 5, 3, 3, '#0a1a0a'); rect(ctx, 5, 11, 6, 2, '#0a1a0a'); });
  add(group, headWithFace(0.5, 0.5, 0.5, skin, face), 0, 1.75, 0);
  const armL = add(group, box(0.18, 0.9, 0.22, skin), -0.39, 1.05, 0.25); armL.rotation.x = -1.3; // arms out
  const armR = add(group, box(0.18, 0.9, 0.22, skin), 0.39, 1.05, 0.25); armR.rotation.x = -1.3;
  add(group, box(0.22, 0.9, 0.26, pants), -0.13, 0.45, 0);
  add(group, box(0.22, 0.9, 0.26, pants), 0.13, 0.45, 0);
}

function buildCreeper(group) {
  const green = 0x4f9d3a;
  add(group, box(0.55, 1.1, 0.4, green), 0, 1.05, 0);          // tall body
  const face = faceTexture((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#5bb142');
    rect(ctx, 3, 4, 3, 3, '#0c1c0c'); rect(ctx, 10, 4, 3, 3, '#0c1c0c'); // eyes
    rect(ctx, 6, 8, 4, 6, '#0c1c0c'); rect(ctx, 4, 8, 2, 3, '#0c1c0c'); rect(ctx, 10, 8, 2, 3, '#0c1c0c'); // mouth
  });
  add(group, headWithFace(0.52, 0.52, 0.52, green, face), 0, 1.85, 0);
  // 4 stubby legs.
  add(group, box(0.24, 0.4, 0.3, 0x3c7a2c), -0.14, 0.2, 0.18);
  add(group, box(0.24, 0.4, 0.3, 0x3c7a2c), 0.14, 0.2, 0.18);
  add(group, box(0.24, 0.4, 0.3, 0x3c7a2c), -0.14, 0.2, -0.18);
  add(group, box(0.24, 0.4, 0.3, 0x3c7a2c), 0.14, 0.2, -0.18);
}

function buildFish(group) {
  const body = box(0.5, 0.32, 0.22, 0xc8624a);
  add(group, body, 0, 0, 0);
  const tail = box(0.18, 0.3, 0.05, 0xa8462f); add(group, tail, -0.32, 0, 0);
  add(group, box(0.06, 0.06, 0.06, 0x111), 0.18, 0.05, 0.12); // eye
  add(group, box(0.3, 0.1, 0.04, 0xa8462f), 0, 0.2, 0);       // top fin
}

function buildSquid(group) {
  const c = 0x35476b;
  add(group, box(0.5, 0.55, 0.5, c), 0, 0.1, 0);              // mantle
  for (const sx of [-0.15, 0, 0.15]) for (const sz of [-0.15, 0.15]) {
    const t = box(0.08, 0.45, 0.08, 0x2a3a58); add(group, t, sx, -0.3, sz);
  }
  add(group, box(0.08, 0.08, 0.08, 0x111), 0.14, 0.15, 0.26); // eyes
  add(group, box(0.08, 0.08, 0.08, 0x111), -0.14, 0.15, 0.26);
}

function buildPigman(group) {
  const flesh = 0xc78a7a, skin = 0x9c7a6a, pants = 0x3a5a3a;
  add(group, box(0.6, 1.0, 0.35, skin), 0, 1.0, 0);            // torso
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#c78a7a'); rect(ctx, 3, 5, 3, 3, '#3a1010'); rect(ctx, 10, 5, 3, 3, '#3a1010'); rect(ctx, 6, 10, 4, 3, '#e0a0a0'); rect(ctx, 5, 11, 1, 2, '#d8d8d8'); rect(ctx, 10, 11, 1, 2, '#d8d8d8'); });
  add(group, headWithFace(0.5, 0.5, 0.5, flesh, face), 0, 1.75, 0);
  const armL = add(group, box(0.18, 0.9, 0.22, flesh), -0.39, 1.05, 0.2); armL.rotation.x = -1.2;
  const armR = add(group, box(0.18, 0.9, 0.22, flesh), 0.39, 1.05, 0.2); armR.rotation.x = -1.2;
  add(group, box(0.22, 0.9, 0.26, pants), -0.13, 0.45, 0);
  add(group, box(0.22, 0.9, 0.26, pants), 0.13, 0.45, 0);
}

function buildBlaze(group) {
  const core = 0xffd33a, rod = 0xf0b000;
  add(group, box(0.45, 0.5, 0.45, core), 0, 1.0, 0);          // glowing head/core
  add(group, box(0.16, 0.16, 0.16, 0x3a2a00), -0.1, 1.05, 0.24); // eyes
  add(group, box(0.16, 0.16, 0.16, 0x3a2a00), 0.1, 1.05, 0.24);
  // Spinning rods around the body.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    add(group, box(0.1, 0.7, 0.1, rod), Math.cos(a) * 0.3, 0.65, Math.sin(a) * 0.3);
    add(group, box(0.1, 0.7, 0.1, rod), Math.cos(a + 0.5) * 0.3, 1.25, Math.sin(a + 0.5) * 0.3);
  }
}

function buildGhast(group) {
  const body = 0xeae6e0, tent = 0xd8d2c8;
  add(group, box(1.3, 1.3, 1.3, body), 0, 1.3, 0);            // big cube body
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#eae6e0'); rect(ctx, 2, 5, 3, 4, '#3a3a3a'); rect(ctx, 11, 5, 3, 4, '#3a3a3a'); rect(ctx, 5, 11, 6, 3, '#3a3a3a'); });
  // Front face overlay (sad ghast face).
  const f = headWithFace(1.31, 1.31, 1.31, body, face); add(group, f, 0, 1.3, 0);
  // Drooping tentacles underneath.
  for (const sx of [-0.4, 0, 0.4]) for (const sz of [-0.4, 0.4]) {
    add(group, box(0.16, 0.7, 0.16, tent), sx, 0.3, sz);
  }
}

function buildPig(group) {
  const pink = 0xe6a0a0;
  add(group, box(0.8, 0.6, 1.2, pink), 0, 0.75, 0);            // body
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#e6a0a0'); rect(ctx, 3, 5, 3, 3, '#222'); rect(ctx, 10, 5, 3, 3, '#222'); rect(ctx, 5, 10, 6, 4, '#d07a7a'); rect(ctx, 6, 11, 2, 2, '#5a3030'); rect(ctx, 9, 11, 2, 2, '#5a3030'); });
  add(group, headWithFace(0.5, 0.5, 0.45, pink, face), 0, 0.85, 0.8); // snout head
  quadLegs(group, 0xc88080, 0.28, 0.42, 0.42, 0);
}

function buildChicken(group) {
  const white = 0xeeeeee, beak = 0xe0a000;
  add(group, box(0.4, 0.45, 0.5, white), 0, 0.5, 0);          // body
  add(group, box(0.3, 0.3, 0.3, white), 0, 0.78, 0.18);       // head
  add(group, box(0.08, 0.08, 0.14, beak), 0, 0.78, 0.36);     // beak
  add(group, box(0.12, 0.06, 0.12, 0xd03030), 0, 0.95, 0.12); // comb
  add(group, box(0.06, 0.2, 0.06, beak), -0.1, 0.15, 0);      // legs
  add(group, box(0.06, 0.2, 0.06, beak), 0.1, 0.15, 0);
  add(group, box(0.1, 0.3, 0.3, 0xdedede), -0.24, 0.5, 0);    // wings
  add(group, box(0.1, 0.3, 0.3, 0xdedede), 0.24, 0.5, 0);
}

function buildSkeleton(group, cfg) {
  const bone = cfg?.head ?? 0xe2e2dc;
  add(group, box(0.32, 0.9, 0.2, bone), 0, 1.0, 0);           // ribcage
  add(group, box(0.08, 0.9, 0.08, bone), 0, 1.0, 0);          // spine
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#e2e2dc'); rect(ctx, 3, 6, 3, 3, '#111'); rect(ctx, 10, 6, 3, 3, '#111'); rect(ctx, 5, 11, 6, 1, '#555'); });
  add(group, headWithFace(0.45, 0.45, 0.45, bone, face), 0, 1.7, 0);
  const aL = add(group, box(0.1, 0.8, 0.1, bone), -0.28, 1.05, 0.2); aL.rotation.x = -1.2; // aiming arms
  const aR = add(group, box(0.1, 0.8, 0.1, bone), 0.28, 1.05, 0.2); aR.rotation.x = -1.2;
  add(group, box(0.1, 0.85, 0.1, bone), -0.1, 0.42, 0);       // legs
  add(group, box(0.1, 0.85, 0.1, bone), 0.1, 0.42, 0);
}

function buildSpider(group) {
  const dark = 0x2a2420;
  add(group, box(0.7, 0.45, 0.7, dark), 0, 0.4, -0.2);        // abdomen
  add(group, box(0.5, 0.4, 0.5, dark), 0, 0.4, 0.45);         // head/thorax
  add(group, box(0.08, 0.08, 0.08, 0xc02020), 0.12, 0.5, 0.7); // red eyes
  add(group, box(0.08, 0.08, 0.08, 0xc02020), -0.12, 0.5, 0.7);
  for (const sx of [-1, 1]) for (const sz of [-0.3, 0, 0.3]) {
    const leg = box(0.6, 0.08, 0.08, 0x1a1410); add(group, leg, sx * 0.5, 0.4, sz);
    leg.rotation.z = sx * 0.5;
  }
}

function buildEnderman(group) {
  const black = 0x14141c;
  add(group, box(0.4, 1.3, 0.3, black), 0, 1.5, 0);           // tall torso
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#14141c'); rect(ctx, 2, 7, 5, 2, '#c39bf0'); rect(ctx, 9, 7, 5, 2, '#c39bf0'); });
  add(group, headWithFace(0.4, 0.45, 0.4, black, face), 0, 2.4, 0);
  add(group, box(0.1, 1.3, 0.1, black), -0.25, 1.45, 0);      // long arms
  add(group, box(0.1, 1.3, 0.1, black), 0.25, 1.45, 0);
  add(group, box(0.12, 1.4, 0.12, black), -0.12, 0.7, 0);     // long legs
  add(group, box(0.12, 1.4, 0.12, black), 0.12, 0.7, 0);
}

function buildDragon(group) {
  const skin = 0x1a1a22, mem = 0x2a2030;
  add(group, box(1.4, 1.0, 2.6, skin), 0, 1.4, 0);            // body
  add(group, box(0.8, 0.8, 1.0, skin), 0, 1.5, 1.7);          // neck base
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#1a1a22'); rect(ctx, 3, 4, 3, 3, '#b060ff'); rect(ctx, 10, 4, 3, 3, '#b060ff'); rect(ctx, 4, 11, 8, 2, '#3a3030'); });
  add(group, headWithFace(0.9, 0.8, 1.1, skin, face), 0, 1.7, 2.6); // head
  // Wings.
  const wL = add(group, box(2.4, 0.1, 1.4, mem), -1.6, 1.8, -0.2); wL.rotation.z = 0.25;
  const wR = add(group, box(2.4, 0.1, 1.4, mem), 1.6, 1.8, -0.2); wR.rotation.z = -0.25;
  // Tail.
  add(group, box(0.6, 0.6, 1.6, skin), 0, 1.4, -1.8);
  add(group, box(0.35, 0.35, 1.2, skin), 0, 1.4, -3.0);
  // Stubby legs.
  quadLegs(group, skin, 0.5, 0.7, 0.7, 0);
}

function buildWitch(group) {
  const robe = 0x3a2a4a, skin = 0x6a8a6a, hat = 0x222028;
  add(group, box(0.55, 1.0, 0.4, robe), 0, 1.0, 0);          // robe
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#6a8a6a'); rect(ctx, 3, 6, 3, 3, '#111'); rect(ctx, 10, 6, 3, 3, '#111'); rect(ctx, 6, 10, 4, 2, '#3a2a2a'); rect(ctx, 7, 8, 2, 3, '#8a5a4a'); });
  add(group, headWithFace(0.5, 0.5, 0.5, skin, face), 0, 1.7, 0);
  add(group, box(0.55, 0.16, 0.55, hat), 0, 1.98, 0);        // hat brim
  add(group, box(0.28, 0.4, 0.28, hat), 0.05, 2.2, 0);       // hat cone
  add(group, box(0.14, 0.8, 0.16, robe), -0.32, 1.0, 0.05);  // arms
  add(group, box(0.14, 0.8, 0.16, robe), 0.32, 1.0, 0.05);
}

function buildSlime(group, cfg) {
  const g = cfg?.body ?? 0x6ec24a;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshLambertMaterial({ color: g, transparent: true, opacity: 0.8 }));
  add(group, body, 0, 0.4, 0);
  add(group, box(0.5, 0.5, 0.5, 0x4f9d3a), 0, 0.4, 0);       // inner cube
  add(group, box(0.08, 0.08, 0.08, 0x111), 0.14, 0.5, 0.4);  // eyes
  add(group, box(0.08, 0.08, 0.08, 0x111), -0.14, 0.5, 0.4);
}

function buildRabbit(group, cfg) {
  const fur = cfg?.body ?? 0xb89878;
  add(group, box(0.34, 0.3, 0.45, fur), 0, 0.28, 0);          // body
  add(group, box(0.28, 0.28, 0.28, fur), 0, 0.42, 0.28);      // head
  add(group, box(0.06, 0.22, 0.06, fur), -0.06, 0.62, 0.28);  // ears
  add(group, box(0.06, 0.22, 0.06, fur), 0.06, 0.62, 0.28);
  add(group, box(0.05, 0.05, 0.05, 0x553333), 0, 0.42, 0.43); // nose
  add(group, box(0.12, 0.12, 0.12, 0xeeeeee), 0, 0.24, -0.26); // tail
}

function buildBat(group) {
  const dark = 0x3a2e24;
  add(group, box(0.3, 0.35, 0.25, dark), 0, 1.0, 0);          // body
  add(group, box(0.06, 0.12, 0.06, dark), -0.06, 1.22, 0);    // ears
  add(group, box(0.06, 0.12, 0.06, dark), 0.06, 1.22, 0);
  const wL = add(group, box(0.5, 0.3, 0.04, 0x2a2018), -0.38, 1.05, 0); wL.rotation.z = 0.3;
  const wR = add(group, box(0.5, 0.3, 0.04, 0x2a2018), 0.38, 1.05, 0); wR.rotation.z = -0.3;
}

function buildQuadruped(group, cfg) {
  const c = cfg?.body ?? 0xc8c4bc;
  add(group, box(0.45, 0.4, 0.9, c), 0, 0.55, 0);            // body
  add(group, box(0.4, 0.4, 0.4, c), 0, 0.7, 0.55);           // head
  add(group, box(0.1, 0.18, 0.06, c), -0.1, 0.95, 0.6);      // ears
  add(group, box(0.1, 0.18, 0.06, c), 0.1, 0.95, 0.6);
  add(group, box(0.07, 0.07, 0.07, 0x111), 0.1, 0.72, 0.78); // eyes
  add(group, box(0.07, 0.07, 0.07, 0x111), -0.1, 0.72, 0.78);
  add(group, box(0.12, 0.3, 0.12, c), -0.32, 0.45, -0.45);   // tail
  quadLegs(group, mulHex(c, 0.85), 0.16, 0.32, 0.4, 0);
}

function buildFox(group, cfg) {
  buildQuadruped(group, cfg);
  add(group, box(0.16, 0.16, 0.12, 0xf0e6d8), 0, 0.66, 0.76); // white snout
  add(group, box(0.34, 0.16, 0.16, 0xeaeae0), -0.34, 0.42, -0.5); // bushy white tail tip
}

function buildGoat(group, cfg) {
  const c = cfg?.body ?? 0xd8d2c6;
  add(group, box(0.55, 0.6, 1.0, c), 0, 0.8, 0);             // body
  add(group, box(0.4, 0.4, 0.4, c), 0, 1.0, 0.6);            // head
  add(group, box(0.08, 0.22, 0.08, 0x6a5a4a), -0.12, 1.3, 0.55); // horns
  add(group, box(0.08, 0.22, 0.08, 0x6a5a4a), 0.12, 1.3, 0.55);
  add(group, box(0.07, 0.07, 0.07, 0x111), 0.12, 1.02, 0.78);
  add(group, box(0.07, 0.07, 0.07, 0x111), -0.12, 1.02, 0.78);
  quadLegs(group, mulHex(c, 0.85), 0.2, 0.36, 0.55, 0);
}

function buildVillager(group, cfg) {
  const robe = cfg?.body ?? 0x9a8268, skin = cfg?.head ?? 0xc8a888;
  add(group, box(0.55, 1.0, 0.4, robe), 0, 1.0, 0);          // robe
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#c8a888'); rect(ctx, 3, 5, 3, 3, '#3a2a20'); rect(ctx, 10, 5, 3, 3, '#3a2a20'); rect(ctx, 6, 7, 4, 5, '#a07a5a'); rect(ctx, 5, 12, 6, 1, '#5a4030'); });
  add(group, headWithFace(0.5, 0.55, 0.5, skin, face), 0, 1.75, 0);
  add(group, box(0.5, 0.3, 0.42, 0x5a4a38), 0, 1.55, 0);     // crossed-arms band
  add(group, box(0.18, 0.5, 0.2, robe), -0.1, 0.4, 0);       // robe legs
  add(group, box(0.18, 0.5, 0.2, robe), 0.1, 0.4, 0);
}

function buildIronGolem(group, cfg) {
  const iron = cfg?.body ?? 0xd8d8d8, dark = mulHex(iron, 0.8);
  add(group, box(1.1, 1.3, 0.7, iron), 0, 1.6, 0);            // broad torso
  add(group, box(0.9, 0.4, 0.55, dark), 0, 1.0, 0);           // belt/hips
  // Vines across the chest.
  add(group, box(1.12, 0.15, 0.72, 0x4a7a3a), 0, 1.7, 0);
  const face = faceTexture((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#cfcfc8');
    rect(ctx, 3, 5, 3, 4, '#3a3a3a'); rect(ctx, 10, 5, 3, 4, '#3a3a3a'); // eyes
    rect(ctx, 7, 8, 2, 6, '#b04a30');                                    // long nose
  });
  add(group, headWithFace(0.6, 0.7, 0.55, cfg?.head ?? 0xd0d0c8, face), 0, 2.45, 0.05);
  // Heavy arms hanging to the ground.
  add(group, box(0.35, 1.5, 0.4, iron), -0.78, 1.3, 0);
  add(group, box(0.35, 1.5, 0.4, iron), 0.78, 1.3, 0);
  // Stubby legs.
  add(group, box(0.45, 0.7, 0.5, dark), -0.3, 0.35, 0);
  add(group, box(0.45, 0.7, 0.5, dark), 0.3, 0.35, 0);
}

function buildSnowGolem(group, cfg) {
  const snow = cfg?.body ?? 0xeef2f5;
  add(group, box(0.7, 0.7, 0.7, snow), 0, 0.55, 0);          // bottom snowball
  add(group, box(0.6, 0.6, 0.6, snow), 0, 1.15, 0);          // upper snowball
  const face = faceTexture((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#eef2f5');
    rect(ctx, 4, 6, 2, 2, '#2a2a2a'); rect(ctx, 10, 6, 2, 2, '#2a2a2a'); // coal eyes
    rect(ctx, 6, 9, 4, 1, '#2a2a2a'); rect(ctx, 5, 11, 6, 1, '#2a2a2a'); // coal smile
  });
  add(group, headWithFace(0.55, 0.55, 0.55, snow, face), 0, 1.65, 0);
  add(group, box(0.3, 0.12, 0.12, 0x4a3520), 0, 1.95, 0);    // pumpkin-stem nub / brow
  // Stick arms.
  add(group, box(0.5, 0.08, 0.08, 0x6a4a2a), -0.55, 1.15, 0);
  add(group, box(0.5, 0.08, 0.08, 0x6a4a2a), 0.55, 1.15, 0);
}

/** Multiply a packed hex colour by m (for shaded limbs). */
function mulHex(hex, m) {
  const r = ((hex >> 16) & 255) * m, g = ((hex >> 8) & 255) * m, b = (hex & 255) * m;
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

function buildPhantom(group) {
  const c = 0x49586a;
  add(group, box(0.6, 0.3, 0.9, c), 0, 1.4, 0);             // body
  add(group, box(0.35, 0.25, 0.3, c), 0, 1.45, 0.55);       // head
  add(group, box(0.06, 0.06, 0.06, 0x6cf06c), 0.1, 1.5, 0.7); // glowing eyes
  add(group, box(0.06, 0.06, 0.06, 0x6cf06c), -0.1, 1.5, 0.7);
  const wL = add(group, box(1.1, 0.06, 0.6, 0x3a4656), -0.8, 1.45, 0); wL.rotation.z = 0.2;
  const wR = add(group, box(1.1, 0.06, 0.6, 0x3a4656), 0.8, 1.45, 0); wR.rotation.z = -0.2;
  add(group, box(0.18, 0.18, 0.5, c), 0, 1.4, -0.7);        // tail
}

function buildWither(group) {
  const dark = 0x1c1c1c, rib = 0x2a2a2a;
  add(group, box(0.6, 1.2, 0.4, dark), 0, 2.0, 0);          // spine/body
  add(group, box(0.5, 0.3, 0.3, rib), 0, 1.7, 0); add(group, box(0.5, 0.3, 0.3, rib), 0, 1.3, 0); // ribs
  // Three skull heads.
  const skull = (x) => {
    const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#282828'); rect(ctx, 3, 5, 3, 3, '#ff5a30'); rect(ctx, 10, 5, 3, 3, '#ff5a30'); rect(ctx, 5, 11, 6, 2, '#0a0a0a'); });
    add(group, headWithFace(0.55, 0.55, 0.55, rib, face), x, 2.8, 0);
  };
  skull(0); skull(-0.6); skull(0.6);
  // Wispy lower body (tail).
  add(group, box(0.35, 0.7, 0.3, dark), 0, 1.0, 0);
  add(group, box(0.22, 0.5, 0.2, dark), 0, 0.5, 0);
}

function buildIllager(group, cfg) {
  const robe = cfg?.body ?? 0x444946, skin = cfg?.head ?? 0x9aa79a;
  add(group, box(0.55, 1.0, 0.4, robe), 0, 1.0, 0);          // robe
  const face = faceTexture((ctx) => { rect(ctx, 0, 0, 16, 16, '#9aa79a'); rect(ctx, 3, 6, 3, 3, '#2a1a1a'); rect(ctx, 10, 6, 3, 3, '#2a1a1a'); rect(ctx, 6, 8, 4, 6, '#7a8478'); rect(ctx, 6, 13, 4, 1, '#3a2a2a'); }); // long nose, frown
  add(group, headWithFace(0.5, 0.55, 0.5, skin, face), 0, 1.75, 0);
  add(group, box(0.14, 0.8, 0.18, robe), -0.32, 1.0, 0.08); // arms crossed forward
  add(group, box(0.14, 0.8, 0.18, robe), 0.32, 1.0, 0.08);
  add(group, box(0.18, 0.5, 0.2, mulHex(robe, 0.7)), -0.1, 0.4, 0);
  add(group, box(0.18, 0.5, 0.2, mulHex(robe, 0.7)), 0.1, 0.4, 0);
}

function buildRavager(group, cfg) {
  const c = cfg?.body ?? 0x4a3a30;
  add(group, box(1.3, 1.0, 1.9, c), 0, 1.0, 0);             // big body
  add(group, box(0.9, 0.8, 0.8, mulHex(c, 1.1)), 0, 0.9, 1.2); // head
  add(group, box(0.2, 0.2, 0.2, 0x111), 0.25, 1.1, 1.6); add(group, box(0.2, 0.2, 0.2, 0x111), -0.25, 1.1, 1.6); // eyes
  add(group, box(0.3, 0.25, 0.3, 0xbfb6a8), 0, 0.55, 1.6);  // mouth/tusks
  add(group, box(0.25, 0.3, 0.25, 0x6a5236), 0, 1.5, 0.3);  // saddle hump
  quadLegs(group, mulHex(c, 0.8), 0.45, 0.7, 0.5, 0);
}

function buildVex(group) {
  const c = 0x7c9ab2;
  add(group, box(0.28, 0.4, 0.2, c), 0, 1.0, 0);            // body
  add(group, box(0.24, 0.24, 0.22, 0xb8c8d4), 0, 1.28, 0.02); // head
  add(group, box(0.05, 0.05, 0.05, 0xc04040), 0.06, 1.3, 0.13); add(group, box(0.05, 0.05, 0.05, 0xc04040), -0.06, 1.3, 0.13); // red eyes
  const wL = add(group, box(0.4, 0.35, 0.03, 0xdfe8f0), -0.3, 1.1, -0.05); wL.rotation.z = 0.3;
  const wR = add(group, box(0.4, 0.35, 0.03, 0xdfe8f0), 0.3, 1.1, -0.05); wR.rotation.z = -0.3;
}

function buildGeneric(group, cfg) {
  add(group, box(cfg.w, cfg.h * 0.6, cfg.w * 0.6, cfg.body), 0, cfg.h * 0.45, 0);
}

export default Mob;
