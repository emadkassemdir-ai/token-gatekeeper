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
import { getFood, isShield, getAttackDamage, isIgnite, isBow } from './world/ItemTypes.js';
import { PhysicsEngine } from './player/PhysicsEngine.js';
import { InteractionEngine } from './player/InteractionEngine.js';
import { ViewModel } from './player/ViewModel.js';
import { Audio } from './audio/AudioManager.js';
import { EntityManager } from './entities/EntityManager.js';
import { DroppedItems, dropId } from './entities/DroppedItems.js';
import { GameMenu } from './ui/GameMenu.js';
import { HUD } from './ui/HUD.js';
import { TouchControls } from './ui/TouchControls.js';
import { Chat } from './ui/Chat.js';
import { CraftingMenu } from './ui/CraftingMenu.js';
import { AvatarEditor } from './ui/AvatarEditor.js';
import { InventoryScreen } from './ui/InventoryScreen.js';
import { SmeltingMenu } from './ui/SmeltingMenu.js';
import { injectTheme } from './world/UITextures.js';
import { isYassin, applyYassinUI, applyYassinScene } from './world/EasterEgg.js';
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

    // Easter egg: naming yourself "yassin" turns the whole game into The Photo.
    this._yassin = isYassin(record.username);
    if (this._yassin) applyYassinUI();

    // Dimension state ('overworld' | 'nether'); per-dimension edits are kept in
    // record.dimData so builds persist, but a fresh load always starts topside.
    this.dim = 'overworld';
    this._nether = false;
    this._portalTimer = 0;
    this._lavaTimer = 0;

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

    // Easter egg: surround the player with The Photo instead of a sky.
    if (this._yassin) applyYassinScene(this.scene);
  }

  _initWorld() {
    this.world = new World(this.scene, this.record.seed);
    this._loadRadius = RENDER_RADIUS;
    const spawnCx = Math.floor((this.record.spawn?.x ?? 8) / CHUNK_SIZE);
    const spawnCz = Math.floor((this.record.spawn?.z ?? 8) / CHUNK_SIZE);
    // Stream the spawn region; chunks then load/unload as the player moves.
    this.world.streamAround(spawnCx, spawnCz, this._loadRadius, this.record.editedBlocks || {});
    this._lastChunk = { cx: spawnCx, cz: spawnCz };
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
      this.viewModel?.swing();
      if (id === 0) Audio.mine(); else Audio.place();
    };
    this.interaction.onMine = (dropType) => this.inventory.add(dropType, 1);
    this.interaction.onExhaust = (amount) => this.stats.addExhaustion(amount);
    this.interaction.onAttack = () => {
      this.camera.getWorldDirection(this._dir);
      const held = this.inventory.getSelectedType();
      this.viewModel?.swing();

      // Bow: ranged shot. Consumes an arrow (free in creative); long reach.
      if (isBow(held)) {
        if (!this.inventory.isCreative && this.inventory.count('arrow') < 1) {
          this.chat?.system('Out of arrows!');
          return false;
        }
        if (!this.inventory.isCreative) this.inventory.remove('arrow', 1);
        Audio.hit();
        const tid = this.net?.connected && !this.stats.isCreative
          ? this.remotePlayers.pickTarget(this.camera.position, this._dir, 40) : null;
        if (tid) { this.net.sendAttack(tid, 4); this.remotePlayers.flashHit(tid); return true; }
        return this.entities.playerAttack(this.camera.position, this._dir, held, 40);
      }
      // PvP: if a remote (survival) player is in our sights, hit them instead.
      // Creative players neither deal nor take combat damage.
      if (this.net?.connected && !this.stats.isCreative) {
        const targetId = this.remotePlayers.pickTarget(this.camera.position, this._dir);
        if (targetId) {
          const dmg = getAttackDamage(held);
          this.net.sendAttack(targetId, dmg);
          this.remotePlayers.flashHit(targetId);
          Audio.hit();
          return true;
        }
      }
      const hit = this.entities.playerAttack(this.camera.position, this._dir, held);
      if (hit) Audio.hit();
      return hit;
    };
    // Audio cue when the player takes damage.
    this.stats.onDamage = () => Audio.hurt();
    // Totem of Undying: consume one to cheat death.
    this.stats.onLethal = () => {
      if (this.inventory.remove('totem', 1)) {
        this.chat?.system('✨ A Totem of Undying saved you!');
        Audio.pickup();
        return true;
      }
      return false;
    };
    // Special right-click item uses (flint & steel, ender pearl, bone meal).
    this.interaction.onUse = (type, target) => this._useItem(type, target);
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
    this.drops = new DroppedItems(this.scene);
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

    // PvP: another player hit us. Only applies in survival (creative is immune).
    this.net.onAttack = (d) => {
      if (d.target !== this.net.selfId) return;
      if (this.stats.isCreative) return;
      this.stats.damage(d.dmg);
    };
    // A dropped item appeared / was collected elsewhere.
    this.net.onDrop = (d) => this.drops.spawn(d.id, d.type, d.count, { x: d.x, y: d.y, z: d.z });
    this.net.onPickup = (d) => this.drops.remove(d.id);
    // Host admin: forced gamemode change / cheat-privilege toggle aimed at us.
    this.net.onMode = (d) => {
      if (d.target !== this.net.selfId) return;
      if (typeof d.cheats === 'boolean') {
        this.record.cheats = d.cheats;
        if (this._cheatApi) this._cheatApi.cheats = d.cheats;
        this.chat?.system(d.cheats ? 'The host granted you cheats.' : 'The host revoked your cheats.');
      }
      if (d.mode && d.mode !== this.inventory.mode) {
        this._setGameMode(d.mode);
        this.chat?.system(`The host set you to ${d.mode} mode.`);
      }
    };
  }

  /** @returns {boolean} whether it is currently night. */
  _isNight() {
    return this._time >= 0.5;
  }

  _initUI() {
    this.hud = new HUD(this.app, this.record, this.inventory, this.stats);
    this.crosshair.classList.add('visible');

    // First-person held-item viewmodel (overlay).
    this.viewModel = new ViewModel();
    this.viewModel.setAspect(window.innerWidth / window.innerHeight);

    // Crafting menu (E). Needs a crafting-table proximity test.
    this.crafting = new CraftingMenu(this.app, this.inventory, () => this._nearCraftingTable(), {
      onOpen: () => this._releasePointer(),
      log: (msg) => { this.chat?.system(msg); Audio.craft(); }
    });

    // Chat (T) + commands (25 cheat commands gated by the world's cheats flag).
    this._cheatApi = this._buildCheatApi();
    this.chat = new Chat(this.app, this._cheatApi);

    // Inventory screen (I) with avatar display.
    this.inventoryScreen = new InventoryScreen(this.app, this.inventory, this.avatar, this.stats, {
      onOpen: () => this._releasePointer(),
      onDropItem: (type, count) => this._dropItem(type, count)
    });

    // Furnace / smelting menu (G).
    this.smelting = new SmeltingMenu(this.app, this.inventory, () => this._nearFurnace(), {
      onOpen: () => this._releasePointer(),
      log: (msg) => { this.chat?.system(msg); Audio.craft(); }
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
      this.viewModel?.setAspect(window.innerWidth / window.innerHeight);
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
      sendChat: (text) => this.net?.sendChat(text),
      // ---- Multiplayer admin (host only) ----
      isHost: () => this.net?.role === 'host',
      players: () => this.net?.roster() ?? [],
      adminSetMode: (name, mode) => {
        const peer = this._findPeer(name);
        if (!peer) return false;
        this.net.sendMode(peer.id, mode);
        return true;
      },
      adminRevoke: (name) => {
        const peer = this._findPeer(name);
        if (!peer) return false;
        this.net.sendMode(peer.id, 'survival', false);
        return true;
      },
      adminGrant: (name) => {
        const peer = this._findPeer(name);
        if (!peer) return false;
        this.net.sendMode(peer.id, null, true);
        return true;
      }
    };
  }

  /** Find a connected peer by (case-insensitive) name. */
  _findPeer(name) {
    const n = String(name || '').toLowerCase();
    return (this.net?.roster() ?? []).find((p) => p.name.toLowerCase() === n) || null;
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

  /* ----------------------- item uses + the Nether ------------------------ */

  /** Dispatch a special right-click item use. @returns {boolean} consumed */
  _useItem(type, target) {
    if (isIgnite(type)) { // flint & steel
      if (target && this.world.getBlock(target.x, target.y, target.z) === 59) {
        this._igniteTnt(target.x, target.y, target.z);
        return true;
      }
      if (this._tryLightPortal(target)) {
        Audio.place();
        this.chat?.system('🔥 The Nether portal flickers to life…');
        return true;
      }
      this.chat?.error('Light the inside of a 4×5 obsidian frame to open a portal.');
      return false;
    }
    if (type === 'bonemeal') return this._useBonemeal(target);
    if (type === 'ender_pearl') return this._throwEnderPearl();
    return false;
  }

  /** Detonate a TNT block. */
  _igniteTnt(x, y, z) {
    this.world.setBlock(x, y, z, 0);
    this._recordEdit(x, y, z, 0);
    this.entities.explode({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, 4, this.physics.position);
    Audio.hurt();
    this.chat?.error('💥 Boom!');
  }

  /** Use bone meal on the targeted grass block to instantly grow a tree. */
  _useBonemeal(target) {
    if (!target) return false;
    if (this.world.getBlock(target.x, target.y, target.z) !== 1) {
      this.chat?.system('Bone meal grows trees on grass.');
      return false;
    }
    if (this.world.getBlock(target.x, target.y + 1, target.z) !== 0) return false;
    this.world._spawnTree(target.x, target.y + 1, target.z, Math.random(), 'oak');
    if (!this.inventory.isCreative) this.inventory.remove('bonemeal', 1);
    Audio.pickup();
    return true;
  }

  /** Throw an ender pearl: teleport to where you're looking (costs ½ heart). */
  _throwEnderPearl() {
    this.camera.getWorldDirection(this._dir);
    const o = this.camera.position;
    let dest = null;
    for (let d = 1; d <= 24; d += 0.5) {
      const x = o.x + this._dir.x * d, y = o.y + this._dir.y * d, z = o.z + this._dir.z * d;
      if (this.world.isSolidAt(Math.floor(x), Math.floor(y), Math.floor(z))) break;
      dest = { x, y, z };
    }
    if (!dest) return false;
    const fy = this.world.getSpawnHeight(Math.floor(dest.x), Math.floor(dest.z));
    this.physics.position.set(dest.x, Math.max(dest.y - 1.5, fy) + 0.1, dest.z);
    this.physics.velocity.set(0, 0, 0);
    if (!this.inventory.isCreative) {
      this.inventory.remove('ender_pearl', 1);
      this.stats._damageCooldown = 0;
      this.stats.damage(0.5);
    }
    Audio.pickup();
    return true;
  }

  /** Try to light a Nether portal from the air cell adjacent to a clicked face. */
  _tryLightPortal(target) {
    if (!target) return false;
    const ix = target.x + target.nx, iy = target.y + target.ny, iz = target.z + target.nz;
    return this._fillPortalIfFramed(ix, iy, iz, 'x') || this._fillPortalIfFramed(ix, iy, iz, 'z');
  }

  /**
   * Validate a 2×3 obsidian frame around an interior cell and fill it with portal
   * blocks. `axis` is the in-plane horizontal direction.
   */
  _fillPortalIfFramed(cx, cy, cz, axis) {
    const ax = axis === 'x' ? 1 : 0, az = axis === 'x' ? 0 : 1;
    const g = (x, y, z) => this.world.getBlock(x, y, z);
    const obs = (x, y, z) => g(x, y, z) === 35;               // obsidian
    const air = (x, y, z) => { const b = g(x, y, z); return b === 0 || b === 58; };
    if (!air(cx, cy, cz)) return false;

    let y = cy;
    while (air(cx, y - 1, cz) && cy - y < 6) y--;             // descend to floor
    if (!obs(cx, y - 1, cz)) return false;

    let lx = cx, lz = cz, steps = 0;
    while (air(lx - ax, y, lz - az) && steps < 6) { lx -= ax; lz -= az; steps++; }
    if (!obs(lx - ax, y, lz - az)) return false;              // left wall

    let w = 0;
    while (air(lx + ax * w, y, lz + az * w) && w < 6) w++;
    if (w !== 2 || !obs(lx + ax * w, y, lz + az * w)) return false; // 2-wide + right wall

    for (let h = 0; h < 3; h++) {
      for (let i = 0; i < w; i++) if (!air(lx + ax * i, y + h, lz + az * i)) return false;
      if (!obs(lx - ax, y + h, lz - az) || !obs(lx + ax * w, y + h, lz + az * w)) return false;
    }
    for (let i = 0; i < w; i++) if (!obs(lx + ax * i, y + 3, lz + az * i)) return false; // top

    for (let h = 0; h < 3; h++) {
      for (let i = 0; i < w; i++) {
        const x = lx + ax * i, Y = y + h, z = lz + az * i;
        this.world.setBlock(x, Y, z, 58);
        this._recordEdit(x, Y, z, 58);
      }
    }
    return true;
  }

  /** Toggle between the Overworld and the Nether. */
  _enterPortal() {
    this._switchDimension(this.dim === 'nether' ? 'overworld' : 'nether');
  }

  /** @param {'overworld'|'nether'} target */
  _switchDimension(target) {
    const p = this.physics.position;
    this.record.dimData = this.record.dimData || {};
    this.record.dimData[this.dim] = {
      edits: this.record.editedBlocks || {},
      pos: { x: p.x, y: p.y, z: p.z }
    };

    this.dim = target;
    this.record.dim = target;
    this.world.setDimension(target);
    this.record.editedBlocks = (this.record.dimData[target] && this.record.dimData[target].edits) || {};

    const saved = this.record.dimData[target] && this.record.dimData[target].pos;
    let pos;
    if (saved) {
      pos = { ...saved };
    } else {
      const scale = target === 'nether' ? 1 / 8 : 8; // classic 8:1 coordinate ratio
      pos = { x: Math.round(p.x * scale) + 0.5, y: 0, z: Math.round(p.z * scale) + 0.5 };
    }

    const ccx = Math.floor(pos.x / CHUNK_SIZE), ccz = Math.floor(pos.z / CHUNK_SIZE);
    this._lastChunk = { cx: ccx, cz: ccz };
    this.world.streamAround(ccx, ccz, this._loadRadius, this.record.editedBlocks);

    if (!saved) {
      pos.y = (target === 'nether'
        ? this.world.getNetherSpawnY(Math.floor(pos.x), Math.floor(pos.z))
        : this.world.getSpawnHeight(Math.floor(pos.x), Math.floor(pos.z))) + 0.2;
      this._buildReturnPortal(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    }

    this.physics.position.set(pos.x, pos.y, pos.z);
    this.physics.velocity.set(0, 0, 0);
    this._portalTimer = -3; // grace so we don't bounce straight back
    this.entities.clear();
    this._applyDimAmbiance(target);
    Audio.craft();
    this.chat?.system(target === 'nether' ? '🔥 You step into the Nether!' : '🌿 Back to the Overworld.');
  }

  /** Build an obsidian frame + lit portal at a destination so the player can return. */
  _buildReturnPortal(x, y, z) {
    const setB = (X, Y, Z, id) => { this.world.setBlock(X, Y, Z, id); this._recordEdit(X, Y, Z, id); };
    for (let dz = -1; dz <= 2; dz++) for (let dy = -1; dy <= 4; dy++) setB(x, y + dy, z + dz, 0);
    for (let dz = -1; dz <= 2; dz++) { setB(x, y - 1, z + dz, 35); setB(x, y + 3, z + dz, 35); }
    for (let dy = 0; dy <= 2; dy++) { setB(x, y + dy, z - 1, 35); setB(x, y + dy, z + 2, 35); }
    for (let dy = 0; dy <= 2; dy++) for (let dz = 0; dz <= 1; dz++) setB(x, y + dy, z + dz, 58);
    // Solid footing so you don't spawn into a void / lava.
    for (let dz = 0; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!this.world.isSolidAt(x + dx, y - 1, z + dz)) setB(x + dx, y - 1, z + dz, 35);
    }
  }

  /** Apply per-dimension sky/fog/lighting. @param {'overworld'|'nether'} target */
  _applyDimAmbiance(target) {
    this._nether = target === 'nether';
    if (this._nether) {
      if (!this._yassin) {
        this.scene.background = new THREE.Color(0x2a0a0a);
        if (this.scene.fog) { this.scene.fog.color.set(0x2a0a0a); this.scene.fog.near = 8; this.scene.fog.far = 64; }
      }
      this.sun.intensity = 0.5; this.hemi.intensity = 0.7; this.ambient.intensity = 0.4;
      this.hemi.color.set(0xff8a66); this.hemi.groundColor.set(0x331111);
    } else {
      if (this.scene.fog) { this.scene.fog.near = (RENDER_RADIUS - 1) * CHUNK_SIZE; this.scene.fog.far = (RENDER_RADIUS + 1.5) * CHUNK_SIZE; }
      this.hemi.color.set(0xcfe6ff); this.hemi.groundColor.set(0x55703a);
    }
  }

  /**
   * Throw an item stack into the world a little in front of the player. Other
   * players can see and collect it (multiplayer-synced by id).
   * @param {string} type @param {number} count
   */
  _dropItem(type, count) {
    if (!type || count <= 0) return;
    this.camera.getWorldDirection(this._dir);
    const p = this.physics.position;
    // Toss it a couple of blocks ahead so it lands clear of the thrower (others
    // can grab it; you step forward to pick it back up).
    const pos = {
      x: p.x + this._dir.x * 1.8,
      y: p.y + 0.2,
      z: p.z + this._dir.z * 1.8
    };
    const id = dropId();
    this.drops.spawn(id, type, count, pos);
    this.net?.sendDrop({ id, type, count, x: pos.x, y: pos.y, z: pos.z });
    this.chat?.system(`Dropped ${count} × ${type.replace(/_/g, ' ')}`);
  }

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
    Audio.resume();
    Audio.startMusic();
    if (this._yassin) this.chat?.system('😃 YASSIN MODE ACTIVATED — behold.');
    this._loop();
  }

  _loop = () => {
    if (!this._running) return;
    requestAnimationFrame(this._loop);

    const dt = Math.min(this._clock.getDelta(), 0.1);

    this._updateDayNight(dt);

    this.physics.update(dt);

    // Infinite world: stream chunks in/out when the player crosses a border.
    const ccx = Math.floor(this.physics.position.x / CHUNK_SIZE);
    const ccz = Math.floor(this.physics.position.z / CHUNK_SIZE);
    if (ccx !== this._lastChunk.cx || ccz !== this._lastChunk.cz) {
      this._lastChunk = { cx: ccx, cz: ccz };
      this.world.streamAround(ccx, ccz, this._loadRadius, this.record.editedBlocks || {});
    }

    this.interaction.update(dt);
    this.world.update(dt);
    this.entities.update(dt, this.physics.position, { isNight: this._isNight() });
    this.stats.update(dt);

    // Nether portal travel + lava hazard.
    const fx = Math.floor(this.physics.position.x);
    const fy = Math.floor(this.physics.position.y + 0.2);
    const fz = Math.floor(this.physics.position.z);
    const inPortal = this.world.getBlock(fx, fy, fz) === 58 || this.world.getBlock(fx, fy + 1, fz) === 58;
    if (inPortal) {
      this._portalTimer += dt;
      const need = this.inventory.isCreative ? 0.25 : 3.0;
      if (this._portalTimer >= need) this._enterPortal();
    } else if (this._portalTimer > 0) {
      this._portalTimer = Math.max(0, this._portalTimer - dt * 2);
    } else if (this._portalTimer < 0) {
      this._portalTimer = Math.min(0, this._portalTimer + dt); // burn off post-travel grace
    }
    const inLava = this.world.getBlock(fx, fy, fz) === 54 || this.world.getBlock(fx, fy + 1, fz) === 54;
    if (inLava) {
      this._lavaTimer += dt;
      if (this._lavaTimer >= 0.5) { this._lavaTimer = 0; this.stats._damageCooldown = 0; this.stats.damage(2); }
    } else {
      this._lavaTimer = 0;
    }

    // Multiplayer: interpolate remote players and broadcast our state at ~10 Hz.
    this.remotePlayers.update(dt);

    // Dropped items: bob/spin and let the local player collect them.
    this.drops.update(dt, this.physics.position, (item) => {
      if (this.inventory.add(item.type, item.count) <= 0 && !this.inventory.isCreative) return false;
      this.net?.sendPickup(item.id);
      Audio.pickup();
      this.chat?.system(`Picked up ${item.count} × ${item.type.replace(/_/g, ' ')}`);
      return true;
    });

    if (this.net.connected) {
      this._netTimer += dt;
      if (this._netTimer >= 0.1) {
        this._netTimer = 0;
        const p = this.physics.position;
        const r = this.physics.getRotation();
        this.net.sendState(packState({
          x: p.x, y: p.y, z: p.z, yaw: r.yaw, pitch: r.pitch,
          hp: this.stats.health, creative: this.inventory.isCreative
        }));
      }
    }

    // Mobile: reveal the SMELT button only when near a placed furnace.
    if (this.touchControls) {
      this._furnaceTimer = (this._furnaceTimer || 0) - dt;
      if (this._furnaceTimer <= 0) {
        this._furnaceTimer = 0.4;
        this.touchControls.setSmeltAvailable(this._nearFurnace());
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

    // Shield: holding a shield reduces damage (more while actively blocking).
    const held = this.inventory.getSelectedType();
    this.stats.damageBlock = isShield(held) ? (this.interaction.placing ? 0.85 : 0.5) : 0;

    // First-person held item: keep in sync, swing while mining, animate.
    this.viewModel.setHeld(held);
    if (this.interaction.breaking && this.viewModel._swing === 0) this.viewModel.swing();
    this.viewModel.update(dt);

    this._autosaveTimer += dt;
    if (this._autosaveTimer >= AUTOSAVE_INTERVAL) {
      this._autosaveTimer = 0;
      this.save();
    }

    this.renderer.render(this.scene, this.camera);
    // Overlay the held-item viewmodel on top of the world.
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.viewModel.scene, this.viewModel.camera);
    this.renderer.autoClear = true;
  };

  /**
   * Advance the day/night cycle and blend sky colour + light intensity.
   * @param {number} dt
   */
  _updateDayNight(dt) {
    this._time = (this._time + dt / this._dayLength) % 1;
    // Smooth 0..1 where ~1 = day (noon), ~0 = night (midnight).
    const d = Math.max(0.05, Math.sin(this._time * Math.PI * 2) * 0.5 + 0.5);

    // The Nether has its own fixed ambiance — no day/night there.
    if (this._nether) return;

    this._skyColor.copy(this._skyNight).lerp(this._skyDay, d);
    // In Yassin mode the background is the photo texture — don't overwrite it.
    if (!this._yassin) {
      this.scene.background.copy(this._skyColor);
      if (this.scene.fog) this.scene.fog.color.copy(this._skyColor);
    }

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

/** Global UI click sound + audio unlock (audio needs a user gesture). */
function wireUiAudio() {
  const sel = 'button, .mc-btn, .chip, .hud-slot, .inv-cell, .inv-slot, .craft-btn, ' +
    '.smelt-btn, .world-play, .world-del, .tc-btn, .ae-swatch, .ae-preset, .cw-toggle button, .mp-tab';
  document.addEventListener('pointerdown', (e) => {
    Audio.resume();
    if (e.target.closest && e.target.closest(sel)) Audio.click();
  }, true);
}

async function boot() {
  const app = document.getElementById('app');
  injectTheme(); // Minecraft-style pixel font + textures for the whole UI
  wireUiAudio();
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
