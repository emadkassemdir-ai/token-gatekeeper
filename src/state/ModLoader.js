/**
 * ModLoader
 * ---------
 * Paste-a-mod support: players write (or paste) a few lines of JavaScript, and
 * the loader runs them against a friendly `api` object wired into the live
 * game. Mods are stored in localStorage, can be toggled on/off, and reload
 * with the Apply button — no rebuild, no files.
 *
 * A mod is just a function body that receives `api`. Example — tacos raining
 * from the sky:
 *
 *   api.every(0.5, () => {
 *     const p = api.player();
 *     api.dropItem('taco', 1, { x: p.x + api.random(-8, 8), y: p.y + 14, z: p.z + api.random(-8, 8) });
 *   });
 *
 * Mod code runs with the same trust as the player's own browser console —
 * it's their machine and their save. Errors are caught per-mod and reported
 * in chat so a broken mod can't take the game down.
 */

const STORE_KEY = 'vc-mods';

/** Ready-to-load example mods shown in the Mods menu. */
export const EXAMPLE_MODS = [
  {
    name: 'Taco Rain',
    code: `// 🌮 Tacos fall from the sky around you. Eat up!
api.chat('🌮 Taco rain has begun!');
api.every(0.5, () => {
  const p = api.player();
  api.dropItem('taco', 1, {
    x: p.x + api.random(-9, 9),
    y: p.y + 14,
    z: p.z + api.random(-9, 9)
  });
});`
  },
  {
    name: 'Super Jump',
    code: `// 🐇 Jump twice as high, forever.
api.jumpBoost(2.0);
api.chat('🐇 Super jump enabled!');`
  },
  {
    name: 'Midas Touch',
    code: `// ✨ Every block you break also pays out a gold ingot.
api.onBreak(() => api.give('gold_ingot', 1));
api.chat('✨ Midas touch: breaking blocks drops gold!');`
  },
  {
    name: 'Zombie Party',
    code: `// 🧟 A zombie spawns near you every 10 seconds. Good luck.
api.every(10, () => {
  const p = api.player();
  api.spawnMob('zombie', p.x + api.random(-6, 6), p.z + api.random(-6, 6));
  api.chat('🧟 They keep coming...');
});`
  }
];

export class ModLoader {
  /** @param {import('../main.js').Game} game */
  constructor(game) {
    this.game = game;
    this._tickHandlers = [];   // [{mod, fn}]
    this._breakHandlers = [];
    this._placeHandlers = [];
    this._timers = [];         // [{mod, interval, t, fn}]
    this.running = [];         // names of successfully started mods
  }

  /* ------------------------------ storage -------------------------------- */

  static load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
  }

  static save(mods) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(mods)); } catch { /* full */ }
  }

  /* ------------------------------- the API ------------------------------- */

  /** The surface a mod programs against. One instance per mod (for blame). */
  _buildApi(modName) {
    const g = this.game;
    const blame = (err) => g.chat?.error(`[mod:${modName}] ${err.message || err}`);
    const safe = (fn) => (...args) => { try { return fn(...args); } catch (e) { blame(e); } };
    return {
      // --- world & player ---
      player: () => ({ x: g.physics.position.x, y: g.physics.position.y, z: g.physics.position.z }),
      tp: safe((x, y, z) => { g.physics.position.set(x, y, z); g.physics.velocity.set(0, 0, 0); }),
      getBlock: (x, y, z) => g.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)),
      setBlock: safe((x, y, z, id) => {
        g.world.setBlock(Math.floor(x), Math.floor(y), Math.floor(z), id);
        g._recordEdit(Math.floor(x), Math.floor(y), Math.floor(z), id);
      }),
      groundAt: (x, z) => g.world.getSpawnHeight(Math.floor(x), Math.floor(z)),

      // --- items & stats ---
      give: safe((type, n = 1) => g.inventory.add(type, n)),
      dropItem: safe((type, count, pos) => g._spawnPickup(type, count || 1, pos)),
      heal: safe((n = 20) => { g.stats.health = Math.min(g.stats.maxHealth ?? 10, g.stats.health + n); }),
      hurt: safe((n = 1) => g.stats.damage(n)),
      feed: safe(() => { g.stats.hunger = g.stats.maxHunger ?? 10; }),
      effect: safe((name, seconds = 30) => g.stats.applyEffect(name, seconds)),
      jumpBoost: safe((mult) => { g.physics.statusJump = mult; }),
      speed: safe((mult) => { g.physics.speedMultiplier = mult; }),

      // --- mobs ---
      spawnMob: safe((kind, x, z) => {
        const px = x ?? g.physics.position.x + 4, pz = z ?? g.physics.position.z + 4;
        const y = g.world.getSpawnHeight(Math.floor(px), Math.floor(pz));
        return g.entities.spawnKind(kind, new (g.physics.position.constructor)(px, y, pz));
      }),
      killAllMobs: safe(() => { const n = g.entities.count; g.entities.clear(); return n; }),

      // --- game state ---
      chat: (text) => g.chat?.system(String(text)),
      time: safe((t) => { g._time = Math.max(0, Math.min(0.999, t)); }),
      command: safe((text) => g.chat?.execute(String(text))),

      // --- scheduling & events ---
      onTick: (fn) => this._tickHandlers.push({ modName, fn }),
      every: (seconds, fn) => this._timers.push({ modName, interval: Math.max(0.1, seconds), t: 0, fn }),
      onBreak: (fn) => this._breakHandlers.push({ modName, fn }),
      onPlace: (fn) => this._placeHandlers.push({ modName, fn }),

      // --- helpers ---
      random: (min, max) => min + Math.random() * (max - min)
    };
  }

  /* ------------------------------ lifecycle ------------------------------ */

  /** Stop everything and start every enabled mod fresh. */
  restart() {
    this._tickHandlers = [];
    this._breakHandlers = [];
    this._placeHandlers = [];
    this._timers = [];
    this.running = [];
    // Reset the knobs mods commonly turn, so disabling a mod undoes it.
    this.game.physics.statusJump = 1;
    this.game.physics.speedMultiplier = 1;

    for (const mod of ModLoader.load()) {
      if (!mod.enabled) continue;
      try {
        const fn = new Function('api', mod.code);
        fn(this._buildApi(mod.name));
        this.running.push(mod.name);
      } catch (err) {
        this.game.chat?.error(`[mod:${mod.name}] failed to load: ${err.message}`);
      }
    }
    if (this.running.length) {
      this.game.chat?.system(`🧩 Mods active: ${this.running.join(', ')}`);
    }
  }

  /** Called every frame from the game loop. */
  tick(dt) {
    for (const h of this._tickHandlers) {
      try { h.fn(dt); } catch (e) { this._disableNoisy(h, e); }
    }
    for (const tm of this._timers) {
      tm.t += dt;
      if (tm.t >= tm.interval) {
        tm.t = 0;
        try { tm.fn(); } catch (e) { this._disableNoisy(tm, e); }
      }
    }
  }

  onBlockBreak(x, y, z, id) {
    for (const h of this._breakHandlers) { try { h.fn(x, y, z, id); } catch (e) { this._disableNoisy(h, e); } }
  }

  onBlockPlace(x, y, z, id) {
    for (const h of this._placeHandlers) { try { h.fn(x, y, z, id); } catch (e) { this._disableNoisy(h, e); } }
  }

  /** A throwing handler gets one error message, then is muted (not respawned). */
  _disableNoisy(handler, err) {
    if (handler._muted) return;
    handler._muted = true;
    handler.fn = () => {};
    this.game.chat?.error(`[mod:${handler.modName}] ${err.message || err} (handler disabled)`);
  }
}

export default ModLoader;
