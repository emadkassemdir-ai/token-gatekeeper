/**
 * main.js — VoxelCraft bootstrap
 * ------------------------------
 * Orchestrates the whole engine lifecycle:
 *   1. Splash menu -> validated username.
 *   2. Player profile (loads saved data: position, inventory, vitals, mode).
 *   3. Three.js (renderer, scene, lights, fog) + world.
 *   4. Survival/creative systems: inventory, stats, crafting, chat, mobs.
 *   5. Wire physics + interaction + HUD + touch controls; run the game loop.
 *   6. Autosave periodically and on tab close.
 */

import * as THREE from 'three';

import { PlayerProfile } from './state/PlayerProfile.js';
import { Inventory } from './state/Inventory.js';
import { PlayerStats } from './state/PlayerStats.js';
import { Avatar } from './state/Avatar.js';
import { World, CHUNK_SIZE } from './world/World.js';
import { CRAFTING_TABLE_ID, FURNACE_ID } from './world/BlockTypes.js';
import { getFood } from './world/ItemTypes.js';
import { PhysicsEngine } from './player/PhysicsEngine.js';
import { InteractionEngine } from './player/InteractionEngine.js';
import { EntityManager } from './entities/EntityManager.js';
import { GameMenu } from './ui/GameMenu.js';
import { HUD } from './ui/HUD.js';
import { TouchControls } from './ui/TouchControls.js';
import { Chat } from './ui/Chat.js';
import { CraftingMenu } from './ui/CraftingMenu.js';
import { AvatarEditor } from './ui/AvatarEditor.js';
import { InventoryScreen } from './ui/InventoryScreen.js';
import { SmeltingMenu } from './ui/SmeltingMenu.js';

const RENDER_RADIUS = 4; // chunks each direction from spawn (9x9 region)
const AUTOSAVE_INTERVAL = 15; // seconds
const TABLE_REACH = 4; // blocks to a crafting table for tool recipes

class Game {
  constructor(profile, avatar) {
    this.profile = profile;
    this.avatar = avatar || Avatar.load();
    this.app = document.getElementById('app');
    this.crosshair = document.getElementById('crosshair');

    this._clock = new THREE.Clock();
    this._autosaveTimer = 0;
    this._running = false;
    this._spawn = { x: profile.position.x, z: profile.position.z };
    this._dir = new THREE.Vector3();

    // Day/night: t in [0,1). 0=dawn, 0.25=noon, 0.5=dusk, 0.75=midnight.
    this._time = profile.timeOfDay ?? 0.2;
    this._dayLength = 600; // seconds for a full cycle

    this._initRenderer();
    this._initScene();
    this._initWorld();
    this._initState();
    this._initPlayer();
    this._initEntities();
    this._initUI();
    this._bindLifecycle();
  }

  /* ------------------------------- setup --------------------------------- */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87b9e6);
    this.app.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b9e6);
    const fogStart = (RENDER_RADIUS - 1) * CHUNK_SIZE;
    const fogEnd = (RENDER_RADIUS + 1.5) * CHUNK_SIZE;
    this.scene.fog = new THREE.Fog(0x87b9e6, fogStart, fogEnd);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x55703a, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0.9);
    this.sun.position.set(0.5, 1, 0.35).multiplyScalar(100);
    this.scene.add(this.sun);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);

    // Day/night sky colours blended each frame.
    this._skyDay = new THREE.Color(0x87b9e6);
    this._skyNight = new THREE.Color(0x0a1020);
    this._skyColor = new THREE.Color();
  }

  _initWorld() {
    this.world = new World(this.scene, this.profile.worldSeed);
    const spawnCx = Math.floor(this.profile.position.x / CHUNK_SIZE);
    const spawnCz = Math.floor(this.profile.position.z / CHUNK_SIZE);
    this.world.generate(spawnCx, spawnCz, RENDER_RADIUS, this.profile.editedBlocks);
  }

  _initState() {
    const mode = this.profile.gameMode || 'survival';
    this.inventory = new Inventory(mode);
    this.inventory.load(this.profile.inventoryData);
    this.stats = new PlayerStats(mode);
    this.stats.load(this.profile.statsData);
    this.stats.onDeath = () => this._handleDeath();
  }

  _initPlayer() {
    if (!this.profile.lastSaved) {
      const sx = this.profile.position.x;
      const sz = this.profile.position.z;
      this.profile.position.y = this.world.getSpawnHeight(sx, sz) + 0.1;
    }

    this.physics = new PhysicsEngine(this.camera, this.world, this.renderer.domElement, this.profile);

    this.interaction = new InteractionEngine(
      this.camera, this.world, this.scene, this.physics, this.profile, this.inventory
    );
    this.interaction.onEdit = (x, y, z, id) => this.profile.recordEdit(x, y, z, id);
    this.interaction.onMine = (dropType) => this.inventory.add(dropType, 1);
    this.interaction.onExhaust = (amount) => this.stats.addExhaustion(amount);
    this.interaction.onAttack = () => {
      this.camera.getWorldDirection(this._dir);
      return this.entities.playerAttack(this.camera.position, this._dir, this.inventory.getSelectedType());
    };
    this.interaction.onEat = (type) => {
      const res = this.stats.eat(getFood(type));
      if (res.eaten && res.poisoned) this.chat?.error('Yuck — that raw food made you sick!');
      else if (res.eaten) this.chat?.system('Tasty!');
      return res.eaten;
    };
  }

  _initEntities() {
    this.entities = new EntityManager(this.scene, this.world, this.stats);
    this.entities.onDrop = (type, count) => {
      this.inventory.add(type, count);
      this.chat?.system(`Picked up ${count} × ${type.replace(/_/g, ' ')}`);
    };
    this.entities.onEdit = (x, y, z, id) => this.profile.recordEdit(x, y, z, id);
    this.entities.onExplosion = () => this.chat?.error('💥 A creeper exploded!');
  }

  /** @returns {boolean} whether it is currently night. */
  _isNight() {
    return this._time >= 0.5;
  }

  _initUI() {
    this.hud = new HUD(this.app, this.profile, this.inventory, this.stats);
    this.crosshair.classList.add('visible');

    // Crafting menu (E). Needs a crafting-table proximity test.
    this.crafting = new CraftingMenu(this.app, this.inventory, () => this._nearCraftingTable(), {
      onOpen: () => this._releasePointer(),
      log: (msg) => this.chat?.system(msg)
    });

    // Chat (T) + commands.
    this.chat = new Chat(this.app, {
      setGameMode: (m) => this._setGameMode(m),
      give: (type, count) => this.inventory.add(type, count) > 0 || this.inventory.isCreative,
      clearInventory: () => this.inventory.clear(),
      kill: () => this._handleDeath(),
      onOpen: () => this._releasePointer()
    });

    // Inventory screen (I) with avatar display.
    this.inventoryScreen = new InventoryScreen(this.app, this.inventory, this.avatar, {
      onOpen: () => this._releasePointer()
    });

    // Furnace / smelting menu (G).
    this.smelting = new SmeltingMenu(this.app, this.inventory, () => this._nearFurnace(), {
      onOpen: () => this._releasePointer(),
      log: (msg) => this.chat?.system(msg)
    });

    if (TouchControls.isTouchDevice()) {
      this.touchControls = new TouchControls(this.app, this.physics, this.interaction, {
        openCraft: () => this.crafting.openMenu(),
        openChat: () => this.chat.openChat(),
        openInventory: () => this.inventoryScreen.openScreen(),
        openSmelt: () => this.smelting.openMenu()
      });
    }
  }

  _bindLifecycle() {
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
    this._onUnload = () => this.save();
    window.addEventListener('beforeunload', this._onUnload);
  }

  /* ----------------------------- gameplay -------------------------------- */

  /** Release PointerLock so menu UI can be clicked (desktop). */
  _releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  /** @param {'survival'|'creative'} mode */
  _setGameMode(mode) {
    this.inventory.setMode(mode);
    this.stats.setMode(mode);
    this.entities.setEnabled(mode === 'survival');
    this.profile.gameMode = mode;
    return true;
  }

  /** Is the player within reach of a given block id? */
  _nearBlock(blockId) {
    const p = this.physics.position;
    const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -TABLE_REACH; dz <= TABLE_REACH; dz++) {
        for (let dx = -TABLE_REACH; dx <= TABLE_REACH; dx++) {
          if (this.world.getBlock(cx + dx, cy + dy, cz + dz) === blockId) return true;
        }
      }
    }
    return false;
  }

  _nearCraftingTable() { return this._nearBlock(CRAFTING_TABLE_ID); }
  _nearFurnace() { return this._nearBlock(FURNACE_ID); }

  _handleDeath() {
    if (this.inventory.isCreative) return;
    this.chat?.error('You died! Respawning…');
    const y = this.world.getSpawnHeight(this._spawn.x, this._spawn.z) + 0.1;
    this.physics.position.set(this._spawn.x, y, this._spawn.z);
    this.physics.velocity.set(0, 0, 0);
    this.entities.clear();
    this.stats.respawn();
  }

  /* -------------------------------- loop --------------------------------- */

  start() {
    this._running = true;
    this._loop();
  }

  _loop = () => {
    if (!this._running) return;
    requestAnimationFrame(this._loop);

    const dt = Math.min(this._clock.getDelta(), 0.1);

    this._updateDayNight(dt);

    this.physics.update(dt);
    this.interaction.update(dt);
    this.world.update(dt);
    this.entities.update(dt, this.physics.position, { isNight: this._isNight() });
    this.stats.update(dt);

    this.hud.update(
      {
        position: this.physics.position,
        flyMode: this.physics.flyMode,
        inWater: this.physics.inWater,
        submerged: this.physics.submerged,
        gameMode: this.inventory.mode
      },
      dt
    );

    this._autosaveTimer += dt;
    if (this._autosaveTimer >= AUTOSAVE_INTERVAL) {
      this._autosaveTimer = 0;
      this.save();
    }

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Advance the day/night cycle and blend sky colour + light intensity.
   * @param {number} dt
   */
  _updateDayNight(dt) {
    this._time = (this._time + dt / this._dayLength) % 1;
    // Smooth 0..1 where ~1 = day (noon), ~0 = night (midnight).
    const d = Math.max(0.05, Math.sin(this._time * Math.PI * 2) * 0.5 + 0.5);

    this._skyColor.copy(this._skyNight).lerp(this._skyDay, d);
    this.scene.background.copy(this._skyColor);
    if (this.scene.fog) this.scene.fog.color.copy(this._skyColor);

    this.sun.intensity = 0.15 + d * 0.85;
    this.hemi.intensity = 0.3 + d * 0.7;
    this.ambient.intensity = 0.08 + d * 0.14;
  }

  /** Persist position, rotation, edits, inventory, vitals and mode. */
  save() {
    this.profile.inventoryData = this.inventory.toJSON();
    this.profile.statsData = this.stats.toJSON();
    this.profile.gameMode = this.inventory.mode;
    this.profile.timeOfDay = this._time;
    this.profile.save(this.physics.position, this.physics.getRotation());
  }
}

/* --------------------------------- boot ---------------------------------- */

async function boot() {
  const app = document.getElementById('app');
  const avatar = Avatar.load();

  const menu = new GameMenu(app, {
    onEditAvatar: () => new AvatarEditor(app, avatar).open()
  });
  const username = await menu.show();

  const profile = new PlayerProfile(username);
  profile.load();

  const game = new Game(profile, avatar);
  game.start();

  window.__voxelcraft = game;
}

boot().catch((err) => {
  console.error('[VoxelCraft] Fatal boot error:', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML =
      '<div style="color:#fff;font-family:sans-serif;padding:40px">' +
      'Failed to start VoxelCraft. See console for details.</div>';
  }
});
