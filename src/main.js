/**
 * main.js — VoxelCraft bootstrap
 * ------------------------------
 * Orchestrates the whole engine lifecycle:
 *   1. Show the splash menu and validate a username.
 *   2. Build the player profile (loading any saved data).
 *   3. Spin up Three.js (renderer, scene, lights, fog) and the world.
 *   4. Wire physics + interaction + HUD and run the fixed-step game loop.
 *   5. Autosave periodically and on tab close.
 */

import * as THREE from 'three';

import { PlayerProfile } from './state/PlayerProfile.js';
import { World, CHUNK_SIZE } from './world/World.js';
import { PhysicsEngine } from './player/PhysicsEngine.js';
import { InteractionEngine } from './player/InteractionEngine.js';
import { GameMenu } from './ui/GameMenu.js';
import { HUD } from './ui/HUD.js';

const RENDER_RADIUS = 4; // chunks each direction from spawn (9x9 region)
const AUTOSAVE_INTERVAL = 15; // seconds

class Game {
  constructor(profile) {
    this.profile = profile;
    this.app = document.getElementById('app');
    this.crosshair = document.getElementById('crosshair');

    this._clock = new THREE.Clock();
    this._autosaveTimer = 0;
    this._running = false;

    this._initRenderer();
    this._initScene();
    this._initWorld();
    this._initPlayer();
    this._initUI();
    this._bindLifecycle();
  }

  /* ------------------------------- setup --------------------------------- */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87b9e6);
    this.app.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b9e6);
    // Distance fog hides the render-distance boundary and saves overdraw.
    const fogStart = (RENDER_RADIUS - 1) * CHUNK_SIZE;
    const fogEnd = (RENDER_RADIUS + 1.5) * CHUNK_SIZE;
    this.scene.fog = new THREE.Fog(0x87b9e6, fogStart, fogEnd);

    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Sky + sun lighting.
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x55703a, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.9);
    sun.position.set(0.5, 1, 0.35).multiplyScalar(100);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  }

  _initWorld() {
    this.world = new World(this.scene, this.profile.worldSeed);

    // Generate the spawn region around the saved/spawn position.
    const spawnCx = Math.floor(this.profile.position.x / CHUNK_SIZE);
    const spawnCz = Math.floor(this.profile.position.z / CHUNK_SIZE);
    this.world.generate(spawnCx, spawnCz, RENDER_RADIUS, this.profile.editedBlocks);
  }

  _initPlayer() {
    // If this is a brand-new profile (no saved Y movement yet), seat the player
    // on the generated surface so they don't spawn buried or in the air.
    if (!this.profile.lastSaved) {
      const sx = this.profile.position.x;
      const sz = this.profile.position.z;
      this.profile.position.y = this.world.getSpawnHeight(sx, sz) + 0.1;
    }

    this.physics = new PhysicsEngine(
      this.camera,
      this.world,
      this.renderer.domElement,
      this.profile
    );

    this.interaction = new InteractionEngine(
      this.camera,
      this.world,
      this.scene,
      this.physics,
      this.profile
    );
    // Persist every player edit into the profile's sparse edit map.
    this.interaction.onEdit = (x, y, z, id) => this.profile.recordEdit(x, y, z, id);
  }

  _initUI() {
    this.hud = new HUD(this.app, this.profile);
    this.crosshair.classList.add('visible');
  }

  _bindLifecycle() {
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);

    // Persist on tab close / navigation.
    this._onUnload = () => this.save();
    window.addEventListener('beforeunload', this._onUnload);
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

    this.physics.update(dt);
    this.interaction.update(dt);
    this.world.update(dt);

    this.hud.update(
      {
        position: this.physics.position,
        flyMode: this.physics.flyMode,
        inWater: this.physics.inWater,
        submerged: this.physics.submerged
      },
      dt
    );

    // Periodic autosave.
    this._autosaveTimer += dt;
    if (this._autosaveTimer >= AUTOSAVE_INTERVAL) {
      this._autosaveTimer = 0;
      this.save();
    }

    this.renderer.render(this.scene, this.camera);
  };

  /** Persist position, rotation and edits to LocalStorage. */
  save() {
    this.profile.save(this.physics.position, this.physics.getRotation());
  }
}

/* --------------------------------- boot ---------------------------------- */

async function boot() {
  const app = document.getElementById('app');
  const menu = new GameMenu(app);

  const username = await menu.show();

  const profile = new PlayerProfile(username);
  profile.load(); // hydrate from a prior session if one exists

  const game = new Game(profile);
  game.start();

  // Expose for debugging in the console.
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
