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

import { Inventory } from './state/Inventory.js';
import { PlayerStats } from './state/PlayerStats.js';
import { Avatar } from './state/Avatar.js';
import { WorldStore } from './state/WorldStore.js';
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
import { NetworkManager } from './net/NetworkManager.js';
import { RemotePlayers } from './net/RemotePlayers.js';
import { packState } from './net/Protocol.js';
import { MultiplayerMenu } from './ui/MultiplayerMenu.js';

const RENDER_RADIUS = 4; // chunks each direction from spawn (9x9 region)
const AUTOSAVE_INTERVAL = 15; // seconds
const TABLE_REACH = 4; // blocks to a crafting table for tool recipes

class Game {
  /**
   * @param {Object} record world record from WorldStore
   * @param {Avatar} avatar
   */
  constructor(record, avatar) {
    this.record = record;
    this.avatar = avatar || Avatar.load();
    this.app = document.getElementById('app');
    this.crosshair = document.getElementById('crosshair');

    this._clock = new THREE.Clock();
    this._autosaveTimer = 0;
    this._running = false;
    this._spawn = { x: record.spawn?.x ?? 8, z: record.spawn?.z ?? 8 };
    this._dir = new THREE.Vector3();

    // Day/night: t in [0,1). 0=dawn, 0.25=noon, 0.5=dusk, 0.75=midnight.
    this._time = record.time ?? 0.2;
    this._dayLength = 480; // seconds for a full day/night cycle (8 min)

    this._initRenderer();
    this._initScene();
    this._initWorld();
    this._initState();
    this._initPlayer();
    this._initEntities();
    this._initNet();
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
    this.world = new World(this.scene, this.record.seed);
    const spawnCx = Math.floor((this.record.spawn?.x ?? 8) / CHUNK_SIZE);
    const spawnCz = Math.floor((this.record.spawn?.z ?? 8) / CHUNK_SIZE);
    this.world.generate(spawnCx, spawnCz, RENDER_RADIUS, this.record.editedBlocks || {});
  }

  _initState() {
    const mode = this.record.gameMode || 'survival';
    this.inventory = new Inventory(mode);
    this.inventory.load(this.record.inventoryData);
    this.stats = new PlayerStats(mode);
    this.stats.load(this.record.statsData);
    this.stats.onDeath = () => this._handleDeath();
  }

  _recordEdit(x, y, z, id) {
    if (!this.record.editedBlocks) this.record.editedBlocks = {};
    this.record.editedBlocks[`${x},${y},${z}`] = id;
  }

  _initPlayer() {
    // New world (never played) -> seat the player on the surface at spawn.
    const isNew = !this.record.position || this.record.position.y <= 0;
    if (isNew) {
      const sx = this._spawn.x, sz = this._spawn.z;
      this.record.position = { x: sx + 0.5, y: this.world.getSpawnHeight(sx, sz) + 0.1, z: sz + 0.5 };
      this.record.rotation = this.record.rotation || { yaw: 0, pitch: 0 };
    }

    this.physics = new PhysicsEngine(this.camera, this.world, this.renderer.domElement, this.record);
    // Fly is creative-only (cheats can still force it).
    this.physics.allowFly = this.record.gameMode === 'creative';
    if (!this.physics.allowFly) this.physics.flyMode = false;

    this.interaction = new InteractionEngine(
      this.camera, this.world, this.scene, this.physics, this.record, this.inventory
    );
    this.interaction.onEdit = (x, y, z, id) => {
      this._recordEdit(x, y, z, id);
      this.net?.sendEdit({ x, y, z, id }); // share local edits with peers
    };
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
    this.interaction.onEquip = (type) => {
      const res = this.stats.equip(type);
      if (!res.equipped) return false;
      if (res.replaced) this.inventory.add(res.replaced, 1);
      this.chat?.system('Equipped ' + type.replace(/_/g, ' '));
      return true;
    };
  }

  _initEntities() {
    this.entities = new EntityManager(this.scene, this.world, this.stats);
    this.entities.setDifficulty(this.record.difficulty || 'normal');
    this.entities.setEnabled(this.inventory.mode === 'survival');
    this.entities.onDrop = (type, count) => {
      this.inventory.add(type, count);
      this.chat?.system(`Picked up ${count} × ${type.replace(/_/g, ' ')}`);
    };
    this.entities.onEdit = (x, y, z, id) => {
      this._recordEdit(x, y, z, id);
      this.net?.sendEdit({ x, y, z, id });
    };
    this.entities.onExplosion = () => this.chat?.error('💥 A creeper exploded!');
  }

  _initNet() {
    this.net = new NetworkManager();
    this.net.setIdentity(this.record.username, this.avatar.toJSON());
    this.remotePlayers = new RemotePlayers(this.scene);
    this._netTimer = 0;

    this.net.onPeerJoin = (id, info) => {
      this.remotePlayers.add(id, info.avatar, info.name);
      this.chat?.system(`${info.name} joined the world`);
    };
    this.net.onPeerLeave = (id) => this.remotePlayers.remove(id);
    this.net.onState = (id, s) => this.remotePlayers.setTarget(id, s);
    this.net.onEdit = (e) => {
      // Apply a remote edit locally (do NOT rebroadcast — the host relay fans out).
      this.world.setBlock(e.x, e.y, e.z, e.id);
      this._recordEdit(e.x, e.y, e.z, e.id);
    };
    this.net.onChat = (id, name, text) => this.chat?.info(`${name}: ${text}`);
  }

  /** @returns {boolean} whether it is currently night. */
  _isNight() {
    return this._time >= 0.5;
  }

  _initUI() {
    this.hud = new HUD(this.app, this.record, this.inventory, this.stats);
    this.crosshair.classList.add('visible');

    // Crafting menu (E). Needs a crafting-table proximity test.
    this.crafting = new CraftingMenu(this.app, this.inventory, () => this._nearCraftingTable(), {
      onOpen: () => this._releasePointer(),
      log: (msg) => this.chat?.system(msg)
    });

    // Chat (T) + commands (25 cheat commands gated by the world's cheats flag).
    this.chat = new Chat(this.app, this._buildCheatApi());

    // Inventory screen (I) with avatar display.
    this.inventoryScreen = new InventoryScreen(this.app, this.inventory, this.avatar, this.stats, {
      onOpen: () => this._releasePointer()
    });

    // Furnace / smelting menu (G).
    this.smelting = new SmeltingMenu(this.app, this.inventory, () => this._nearFurnace(), {
      onOpen: () => this._releasePointer(),
      log: (msg) => this.chat?.system(msg)
    });

    // Multiplayer menu (M).
    this.mpMenu = new MultiplayerMenu(this.app, this.net, { onOpen: () => this._releasePointer() });

    if (TouchControls.isTouchDevice()) {
      this.touchControls = new TouchControls(this.app, this.physics, this.interaction, {
        openCraft: () => this.crafting.openMenu(),
        openChat: () => this.chat.openChat(),
        openInventory: () => this.inventoryScreen.openScreen(),
        openSmelt: () => this.smelting.openMenu(),
        openMultiplayer: () => this.mpMenu.openMenu()
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
    if (mode === 'survival') this.entities.setDifficulty(this.record.difficulty || 'normal');
    // Fly is creative-only.
    this.physics.allowFly = mode === 'creative';
    if (!this.physics.allowFly) this.physics.flyMode = false;
    this.record.gameMode = mode;
    return true;
  }

  /** @param {string} difficulty */
  _setDifficulty(difficulty) {
    if (!['peaceful', 'easy', 'normal', 'hard', 'hardcore'].includes(difficulty)) return false;
    this.record.difficulty = difficulty;
    this.entities.setDifficulty(difficulty);
    return true;
  }

  /**
   * Build the command API consumed by Chat. Cheat commands are gated on the
   * world's cheats flag.
   * @returns {Object}
   */
  _buildCheatApi() {
    return {
      cheats: !!this.record.cheats,
      onOpen: () => this._releasePointer(),
      // Always available.
      seed: () => this.record.seed,
      // Cheat actions.
      setGameMode: (m) => this._setGameMode(m),
      setDifficulty: (d) => this._setDifficulty(d),
      give: (type, n) => this.inventory.add(type, n) > 0 || this.inventory.isCreative,
      giveKit: () => {
        ['diamond_pickaxe', 'diamond_axe', 'diamond_sword', 'diamond_helmet',
         'diamond_chestplate', 'diamond_leggings', 'diamond_boots'].forEach((t) => this.inventory.add(t, 1));
        ['diamond', 'iron_ingot', 'gold_ingot', 'coal', 'oak_planks'].forEach((t) => this.inventory.add(t, 64));
      },
      clearInv: () => this.inventory.clear(),
      tp: (x, y, z) => this.physics.position.set(x, y, z),
      getPos: () => ({ x: this.physics.position.x, y: this.physics.position.y, z: this.physics.position.z }),
      home: () => {
        const y = this.world.getSpawnHeight(this._spawn.x, this._spawn.z) + 0.1;
        this.physics.position.set(this._spawn.x + 0.5, y, this._spawn.z + 0.5);
      },
      setSpawn: () => {
        this._spawn = { x: Math.floor(this.physics.position.x), z: Math.floor(this.physics.position.z) };
        this.record.spawn = this._spawn;
      },
      heal: () => { this.stats.health = 10; },
      setHealth: (n) => { this.stats.health = Math.max(0, Math.min(10, n)); },
      feed: () => { this.stats.hunger = 10; },
      hurt: (n) => { this.stats._damageCooldown = 0; this.stats.god = false; this.stats.damage(n); },
      kill: () => this._handleDeath(),
      toggleGod: () => { this.stats.god = !this.stats.god; return this.stats.god; },
      toggleFly: () => { this.physics.flyMode = !this.physics.flyMode; this.physics.velocity.y = 0; return this.physics.flyMode; },
      setSpeed: (n) => { this.physics.speedMultiplier = Math.max(0.1, Math.min(20, n)); },
      toggleNoclip: () => { this.physics.noclip = !this.physics.noclip; return this.physics.noclip; },
      setReach: (n) => { this.interaction.reach = Math.max(1, Math.min(64, n)); },
      setTime: (t) => { this._time = ((t % 1) + 1) % 1; },
      spawnMob: (kind, n) => {
        let ok = 0;
        for (let i = 0; i < n; i++) {
          const p = this.physics.position;
          const pos = new THREE.Vector3(p.x + (Math.random() * 4 - 2), p.y, p.z + (Math.random() * 4 - 2));
          if (this.entities.spawnKind(kind, pos)) ok++;
        }
        return ok;
      },
      killAll: () => { const n = this.entities.count; this.entities.clear(); return n; },
      smite: () => this.entities.smiteNearest(this.physics.position),
      // Relay plain chat lines to connected peers.
      sendChat: (text) => this.net?.sendChat(text)
    };
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

    // Hardcore: permadeath — delete the world and return to the menu.
    if (this.record.difficulty === 'hardcore') {
      this.chat?.error('☠ HARDCORE: you died. This world is gone.');
      WorldStore.delete(this.record.id);
      this._running = false;
      setTimeout(() => window.location.reload(), 2500);
      return;
    }

    this.chat?.error('You died! Respawning…');
    const y = this.world.getSpawnHeight(this._spawn.x, this._spawn.z) + 0.1;
    this.physics.position.set(this._spawn.x + 0.5, y, this._spawn.z + 0.5);
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

    // Multiplayer: interpolate remote players and broadcast our state at ~10 Hz.
    this.remotePlayers.update(dt);
    if (this.net.connected) {
      this._netTimer += dt;
      if (this._netTimer >= 0.1) {
        this._netTimer = 0;
        const p = this.physics.position;
        const r = this.physics.getRotation();
        this.net.sendState(packState({ x: p.x, y: p.y, z: p.z, yaw: r.yaw, pitch: r.pitch }));
      }
    }

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

  /** Persist the world record (player state + edits + time) to WorldStore. */
  save() {
    if (!this._running && this.record.difficulty === 'hardcore') return; // world deleted
    const p = this.physics.position;
    const r = this.physics.getRotation();
    this.record.position = { x: p.x, y: p.y, z: p.z };
    this.record.rotation = { yaw: r.yaw, pitch: r.pitch };
    this.record.inventoryData = this.inventory.toJSON();
    this.record.statsData = this.stats.toJSON();
    this.record.gameMode = this.inventory.mode;
    this.record.time = this._time;
    WorldStore.save(this.record);
  }
}

/* --------------------------------- boot ---------------------------------- */

async function boot() {
  const app = document.getElementById('app');
  const avatar = Avatar.load();

  const menu = new GameMenu(app, {
    onEditAvatar: () => new AvatarEditor(app, avatar).open()
  });
  const record = await menu.show(); // username -> world select/create

  const game = new Game(record, avatar);
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
