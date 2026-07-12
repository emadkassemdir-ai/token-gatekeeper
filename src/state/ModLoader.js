/**
 * ModLoader
 * ---------
 * Paste-a-mod support. The house language is JN (.jn — see JNLang.js), a
 * Lua/JS hybrid where variables exist the moment you assign them and every
 * game function is a bare word:
 *
 *   every 0.5 do
 *     drop("taco", 1, player.x + random(-8, 8), player.y + 14, player.z + random(-8, 8))
 *   end
 *
 * Advanced mods can opt into plain JavaScript (lang: 'js') and get the same
 * `api` object directly. Mods live in localStorage, toggle on/off, reload
 * with Apply, and can register images to paste into the world (billboards)
 * or onto the screen (HUD overlays).
 *
 * Mod code runs with the same trust as the player's own browser console —
 * it's their machine and their save. Errors are caught per-mod and reported
 * in chat so a broken mod can't take the game down.
 */

import * as THREE from 'three';
import { runJN } from './JNLang.js';
import { YASSIN_IMAGE } from '../world/EasterEgg.js';

const STORE_KEY = 'vc-mods';

/** Ready-to-load example mods shown in the Mods menu. */
export const EXAMPLE_MODS = [
  {
    name: 'Taco Rain',
    lang: 'jn',
    code: `-- 🌮 Tacos fall from the sky around you. Eat up!
chat("🌮 Taco rain has begun!")
every 0.5 do
  drop("taco", 1, player.x + random(-9, 9), player.y + 14, player.z + random(-9, 9))
end`
  },
  {
    name: 'Super Jump',
    lang: 'jn',
    code: `-- 🐇 Jump twice as high, forever.
jumpboost(2)
chat("🐇 Super jump enabled!")`
  },
  {
    name: 'Midas Touch',
    lang: 'jn',
    code: `-- ✨ Every block you break also pays out gold. Every 10th: a diamond.
broken = 0
on break do
  broken = broken + 1
  give("gold_ingot", 1)
  if broken % 10 == 0 then
    give("diamond", 1)
    chat("✨ " .. broken .. " blocks — bonus diamond!")
  end
end`
  },
  {
    name: 'Yassin Watches',
    lang: 'jn',
    code: `-- 👁 He floats beside you. He is always there.
billboard("yassin", player.x + 3, player.y + 3, player.z + 3, 4)
hud("yassin", 92, 86, 80)
chat("👁 he is watching")`
  },
  {
    name: 'Zombie Party (JS)',
    lang: 'js',
    code: `// 🧟 The same power, in plain JavaScript (pick JS in the language box).
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
    // Image support: named textures, world sprites and HUD overlays.
    this._images = new Map([['yassin', YASSIN_IMAGE]]); // one built-in celebrity
    this._sprites = [];        // THREE.Sprite billboards added by mods
    this._hudEls = [];         // DOM <img> overlays added by mods
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

      // --- images: register once, then paste into the world or the screen ---
      image: safe((name, src) => { this._images.set(name, src); }),
      billboard: safe((name, x, y, z, size = 2) => {
        const src = this._images.get(name) || name; // registered name or direct URL/data URI
        const tex = new THREE.TextureLoader().load(src);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        sp.position.set(x, y, z);
        sp.scale.set(size, size, 1);
        g.scene.add(sp);
        this._sprites.push(sp);
        return sp;
      }),
      hudImage: safe((name, xPct = 50, yPct = 20, widthPx = 96) => {
        const src = this._images.get(name) || name;
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = `position:fixed;left:${xPct}%;top:${yPct}%;` +
          `transform:translate(-50%,-50%);width:${widthPx}px;image-rendering:pixelated;` +
          'z-index:55;pointer-events:none;border-radius:8px;';
        document.body.appendChild(img);
        this._hudEls.push(img);
        return img;
      }),

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
    // Tear down mod visuals (billboards + HUD overlays).
    for (const sp of this._sprites) {
      this.game.scene.remove(sp);
      sp.material?.map?.dispose?.();
      sp.material?.dispose?.();
    }
    this._sprites = [];
    for (const el of this._hudEls) el.remove();
    this._hudEls = [];

    for (const mod of ModLoader.load()) {
      if (!mod.enabled) continue;
      try {
        // JN is the house language; legacy/advanced mods can opt into raw JS.
        if ((mod.lang || 'js') === 'jn') {
          runJN(mod.code, this._buildApi(mod.name));
        } else {
          const fn = new Function('api', mod.code);
          fn(this._buildApi(mod.name));
        }
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
