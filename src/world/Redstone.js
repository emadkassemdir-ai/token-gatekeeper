/**
 * Redstone
 * --------
 * A small but real redstone power simulation. Power sources (Block of Redstone,
 * Redstone Torch, a Lever in the "on" state) emit signal strength 15. Redstone
 * Dust carries that signal to adjacent dust, losing 1 strength per block (0–15,
 * per the wiki). A Redstone Lamp lights up (swaps to its lit block) when it
 * touches a power source or powered dust, and goes dark otherwise.
 *
 * Recomputed in a local box whenever a redstone-related block changes, so it
 * stays cheap.
 */

// Block ids (kept in sync with BlockTypes).
export const RS = {
  DUST: 78, BLOCK: 79, LAMP: 80, LAMP_LIT: 81, LEVER: 82, LEVER_ON: 83, TORCH: 84,
  REPEATER: 110, REPEATER_ON: 111, OBSERVER: 112
};

/** Is this block id part of a redstone circuit (worth recomputing for)? */
export function isRedstone(id) {
  return id === RS.DUST || id === RS.BLOCK || id === RS.LAMP || id === RS.LAMP_LIT ||
    id === RS.LEVER || id === RS.LEVER_ON || id === RS.TORCH ||
    id === RS.REPEATER || id === RS.REPEATER_ON || id === RS.OBSERVER;
}

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Constant power emitters (lever-on, redstone block, redstone torch). */
const baseSource = (id) => id === RS.BLOCK || id === RS.TORCH || id === RS.LEVER_ON;

/**
 * Flood power through dust in a box and return a `powered(x,y,z)` predicate that
 * answers whether a given cell carries signal. Shared by the lamp pass, piston
 * actuation and dispensers so every consumer sees the same power field.
 *
 * Repeaters and Observers are "conditional sources": a repeater emits when the
 * cell behind it (its input) is powered, and an observer emits while the block
 * it faces is present (a block detector). These are resolved by iterating the
 * flood until the set of active emitters stabilises, which lets signals chain
 * through repeaters past the 15-block dust limit.
 *
 * @param {import('./World.js').World} world
 * @param {Map<string,number[]>} [dirs] facing per device, key "x,y,z" -> [dx,dy,dz]
 * @returns {(x:number,y:number,z:number)=>boolean}
 */
export function computePowered(world, ox, oy, oz, R = 24, dirs = null) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const extra = new Set();           // conditional-source cells "x,y,z" (monotonic)
  let powered = () => false;

  for (let iter = 0; iter < 8; iter++) {
    const level = new Map();         // "x,y,z" -> power 0..15 (dust only)
    const queue = [];
    const seed = (x, y, z) => {
      // A source at (x,y,z) charges its own dust + adjacent dust to 15.
      if (world.getBlock(x, y, z) === RS.DUST) {
        const k = key(x, y, z);
        if ((level.get(k) || 0) < 15) { level.set(k, 15); queue.push([x, y, z, 15]); }
      }
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (world.getBlock(nx, ny, nz) === RS.DUST) {
          const k = key(nx, ny, nz);
          if ((level.get(k) || 0) < 15) { level.set(k, 15); queue.push([nx, ny, nz, 15]); }
        }
      }
    };

    for (let y = oy - R; y <= oy + R; y++)
      for (let z = oz - R; z <= oz + R; z++)
        for (let x = ox - R; x <= ox + R; x++)
          if (baseSource(world.getBlock(x, y, z))) seed(x, y, z);
    for (const k of extra) { const [x, y, z] = k.split(',').map(Number); seed(x, y, z); }

    while (queue.length) {
      const [x, y, z, l] = queue.shift();
      if (l <= 1) continue;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (world.getBlock(nx, ny, nz) !== RS.DUST) continue;
        const k = key(nx, ny, nz);
        if ((level.get(k) || 0) < l - 1) { level.set(k, l - 1); queue.push([nx, ny, nz, l - 1]); }
      }
    }

    powered = (x, y, z) => {
      const id = world.getBlock(x, y, z);
      if (baseSource(id)) return true;
      if (extra.has(key(x, y, z))) return true;
      return id === RS.DUST && (level.get(key(x, y, z)) || 0) > 0;
    };

    if (!dirs) break;
    // Re-evaluate conditional emitters; stop once nothing new switches on.
    let changed = false;
    for (let y = oy - R; y <= oy + R; y++) {
      for (let z = oz - R; z <= oz + R; z++) {
        for (let x = ox - R; x <= ox + R; x++) {
          const id = world.getBlock(x, y, z);
          const k = key(x, y, z);
          if (extra.has(k)) continue;
          if (id === RS.REPEATER || id === RS.REPEATER_ON) {
            const d = dirs.get(k) || [1, 0, 0];
            if (powered(x - d[0], y - d[1], z - d[2])) { extra.add(k); changed = true; } // input behind
          } else if (id === RS.OBSERVER) {
            const d = dirs.get(k) || [0, -1, 0];
            if (world.getBlock(x + d[0], y + d[1], z + d[2]) !== 0) { extra.add(k); changed = true; } // watched block
          }
        }
      }
    }
    if (!changed) break;
  }
  return powered;
}

/**
 * Recompute lamps + repeater on/off states in a box around (ox,oy,oz).
 * @param {import('./World.js').World} world
 * @param {Map<string,number[]>} [dirs] facing per device
 */
export function recomputeRedstone(world, ox, oy, oz, R = 24, dirs = null) {
  const powered = computePowered(world, ox, oy, oz, R, dirs);
  let changed = 0;

  for (let y = oy - R; y <= oy + R; y++) {
    for (let z = oz - R; z <= oz + R; z++) {
      for (let x = ox - R; x <= ox + R; x++) {
        const id = world.getBlock(x, y, z);
        if (id === RS.LAMP || id === RS.LAMP_LIT) {
          let lit = false;
          for (const [dx, dy, dz] of NEIGHBORS) if (powered(x + dx, y + dy, z + dz)) { lit = true; break; }
          const want = lit ? RS.LAMP_LIT : RS.LAMP;
          if (id !== want) { world.setBlock(x, y, z, want); changed++; }
        } else if (id === RS.REPEATER || id === RS.REPEATER_ON) {
          const d = (dirs && dirs.get(`${x},${y},${z}`)) || [1, 0, 0];
          const on = powered(x - d[0], y - d[1], z - d[2]);
          const want = on ? RS.REPEATER_ON : RS.REPEATER;
          if (id !== want) { world.setBlock(x, y, z, want); changed++; }
        }
      }
    }
  }
  return changed;
}
