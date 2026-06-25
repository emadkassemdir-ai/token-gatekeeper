/**
 * WorldStore
 * ----------
 * Persistent registry of saved worlds (LocalStorage). Each world is fully
 * self-contained: its seed, game mode, difficulty, cheats flag, and the
 * player's data (position, inventory, vitals, edits, time-of-day). Replaces the
 * old single per-username save so a player can keep many worlds.
 *
 * Everything lives under one key as { [id]: record } for simplicity.
 */

const STORAGE_KEY = 'voxelcraft.worlds';

export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard', 'hardcore'];

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('[WorldStore] read failed:', err);
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch (err) {
    console.error('[WorldStore] write failed:', err);
    return false;
  }
}

export class WorldStore {
  /** @returns {number} a fresh 31-bit world seed. */
  static randomSeed() {
    return Math.floor(Math.random() * 2147483647);
  }

  /**
   * Parse a user-entered seed: numeric strings used directly, otherwise hashed
   * from the text (so "hello" is a stable seed). Empty -> random.
   * @param {string} raw
   * @returns {number}
   */
  static parseSeed(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return WorldStore.randomSeed();
    if (/^-?\d+$/.test(s)) return Math.abs(parseInt(s, 10)) % 2147483647;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 2147483647;
  }

  /** @returns {Array<Object>} world records sorted by last played (newest first). */
  static list() {
    const map = readAll();
    return Object.values(map).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  }

  /**
   * Create and persist a new world.
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} [opts.username]
   * @param {string|number} [opts.seed] raw seed text or number (blank = random)
   * @param {'survival'|'creative'} [opts.gameMode]
   * @param {string} [opts.difficulty]
   * @param {boolean} [opts.cheats]
   * @returns {Object} the new world record
   */
  static create(opts) {
    const map = readAll();
    const id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const seed = typeof opts.seed === 'number' ? opts.seed : WorldStore.parseSeed(opts.seed);
    const difficulty = DIFFICULTIES.includes(opts.difficulty) ? opts.difficulty : 'normal';
    const record = {
      id,
      name: (opts.name || 'New World').slice(0, 32),
      username: opts.username || 'Player',
      seed,
      gameMode: opts.gameMode === 'creative' ? 'creative' : 'survival',
      difficulty,
      cheats: !!opts.cheats,
      // Player/world state (filled in as the world is played).
      time: 0.2,
      position: { x: 8, y: 0, z: 8 },
      rotation: { yaw: 0, pitch: 0 },
      spawn: { x: 8, z: 8 },
      editedBlocks: {},
      inventoryData: null,
      statsData: null,
      createdAt: Date.now(),
      lastPlayed: Date.now()
    };
    map[id] = record;
    writeAll(map);
    return record;
  }

  /** @param {string} id @returns {Object|null} */
  static get(id) {
    return readAll()[id] ?? null;
  }

  /**
   * Persist a world record (updates lastPlayed).
   * @param {Object} record
   * @returns {boolean}
   */
  static save(record) {
    if (!record || !record.id) return false;
    const map = readAll();
    record.lastPlayed = Date.now();
    map[record.id] = record;
    return writeAll(map);
  }

  /** @param {string} id */
  static delete(id) {
    const map = readAll();
    delete map[id];
    writeAll(map);
  }
}

export default WorldStore;
