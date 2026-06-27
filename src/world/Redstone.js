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
  DUST: 78, BLOCK: 79, LAMP: 80, LAMP_LIT: 81, LEVER: 82, LEVER_ON: 83, TORCH: 84
};

/** Is this block id part of a redstone circuit (worth recomputing for)? */
export function isRedstone(id) {
  return id === RS.DUST || id === RS.BLOCK || id === RS.LAMP || id === RS.LAMP_LIT ||
    id === RS.LEVER || id === RS.LEVER_ON || id === RS.TORCH;
}

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const isSource = (id) => id === RS.BLOCK || id === RS.TORCH || id === RS.LEVER_ON;

/**
 * Flood power through dust in a box and return a `powered(x,y,z)` predicate that
 * answers whether a given cell carries signal (a source, or lit dust). Shared by
 * the lamp pass and by piston actuation so both see the same power field.
 * @param {import('./World.js').World} world
 * @returns {(x:number,y:number,z:number)=>boolean}
 */
export function computePowered(world, ox, oy, oz, R = 24) {
  const key = (x, y, z) => `${x},${y},${z}`;

  // Flood power through dust from every source in the box.
  const level = new Map();   // "x,y,z" -> power 0..15 (dust only)
  const queue = [];
  for (let y = oy - R; y <= oy + R; y++) {
    for (let z = oz - R; z <= oz + R; z++) {
      for (let x = ox - R; x <= ox + R; x++) {
        if (!isSource(world.getBlock(x, y, z))) continue;
        for (const [dx, dy, dz] of NEIGHBORS) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          if (world.getBlock(nx, ny, nz) === RS.DUST) {
            const k = key(nx, ny, nz);
            if ((level.get(k) || 0) < 15) { level.set(k, 15); queue.push([nx, ny, nz, 15]); }
          }
        }
      }
    }
  }
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

  // A cell is "powered" if it's a source or powered dust.
  return (x, y, z) => {
    const id = world.getBlock(x, y, z);
    if (isSource(id)) return true;
    return id === RS.DUST && (level.get(key(x, y, z)) || 0) > 0;
  };
}

/**
 * Recompute lamps in a box around (ox,oy,oz).
 * @param {import('./World.js').World} world
 */
export function recomputeRedstone(world, ox, oy, oz, R = 24) {
  const powered = computePowered(world, ox, oy, oz, R);

  // Update every lamp in the box.
  let changed = 0;
  for (let y = oy - R; y <= oy + R; y++) {
    for (let z = oz - R; z <= oz + R; z++) {
      for (let x = ox - R; x <= ox + R; x++) {
        const id = world.getBlock(x, y, z);
        if (id !== RS.LAMP && id !== RS.LAMP_LIT) continue;
        let lit = false;
        for (const [dx, dy, dz] of NEIGHBORS) if (powered(x + dx, y + dy, z + dz)) { lit = true; break; }
        const want = lit ? RS.LAMP_LIT : RS.LAMP;
        if (id !== want) { world.setBlock(x, y, z, want); changed++; }
      }
    }
  }
  return changed;
}
