/**
 * Pistons
 * -------
 * Moving-block redstone: a Piston (104) or Sticky Piston (106) extends an arm
 * (Piston Head, 105) into the cell it faces when it receives redstone power,
 * shoving the block in front one space further. On power loss it retracts; a
 * sticky piston also pulls the pushed block back with it.
 *
 * Facing is supplied by the caller via a `dirs` map (key "x,y,z" -> [dx,dy,dz])
 * captured at placement time. Extension state is read straight from the world
 * (a head voxel in front means "extended"), so it survives without extra state.
 *
 * Per the wiki, a handful of blocks are immovable (bedrock, obsidian and other
 * tile-entities). Those simply block the piston instead of being pushed.
 */

import { getBlock } from './BlockTypes.js';

export const PISTON = 104;
export const PISTON_HEAD = 105;
export const STICKY_PISTON = 106;

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Blocks that pistons can never move (tile-entities + indestructible terrain).
const IMMOVABLE = new Set([
  4,   // bedrock
  35,  // obsidian
  63,  // enchanting table
  65,  // chest
  76,  // barrel
  77,  // ender chest
  85,  // spawner
  96,  // beacon
  PISTON, PISTON_HEAD, STICKY_PISTON
]);

/** @returns {boolean} whether a piston can shove this block id. */
export function isPushable(id) {
  if (!id) return false;            // air isn't "pushed", it's filled
  if (IMMOVABLE.has(id)) return false;
  const def = getBlock(id);
  return !!def && def.solid && !def.liquid && def.breakable;
}

/**
 * Drive every piston in a box around (ox,oy,oz): extend the powered ones and
 * retract the unpowered ones. Returns the list of cells whose block changed so
 * the caller can persist them as edits.
 *
 * @param {import('./World.js').World} world
 * @param {(x:number,y:number,z:number)=>boolean} powered  power predicate (from Redstone.computePowered)
 * @param {Map<string,number[]>} dirs  facing per piston, key "x,y,z" -> [dx,dy,dz]
 * @returns {Array<[number,number,number,number]>} changed cells as [x,y,z,id]
 */
export function actuatePistons(world, ox, oy, oz, R, powered, dirs) {
  const changes = [];
  const set = (x, y, z, id) => { world.setBlock(x, y, z, id); changes.push([x, y, z, id]); };
  const key = (x, y, z) => `${x},${y},${z}`;

  for (let y = oy - R; y <= oy + R; y++) {
    for (let z = oz - R; z <= oz + R; z++) {
      for (let x = ox - R; x <= ox + R; x++) {
        const id = world.getBlock(x, y, z);
        if (id !== PISTON && id !== STICKY_PISTON) continue;
        const sticky = id === STICKY_PISTON;
        const dir = dirs.get(key(x, y, z)) || [0, 1, 0];
        const [dx, dy, dz] = dir;

        // Powered if any neighbouring cell carries signal.
        let on = false;
        for (const [nx, ny, nz] of NEIGHBORS) {
          if (powered(x + nx, y + ny, z + nz)) { on = true; break; }
        }

        const fx = x + dx, fy = y + dy, fz = z + dz;          // cell in front
        const bx = x + 2 * dx, by = y + 2 * dy, bz = z + 2 * dz; // one beyond
        const extended = world.getBlock(fx, fy, fz) === PISTON_HEAD;

        if (on && !extended) {
          const frontId = world.getBlock(fx, fy, fz);
          if (frontId === 0) {
            set(fx, fy, fz, PISTON_HEAD);                     // nothing to push
          } else if (isPushable(frontId) && world.getBlock(bx, by, bz) === 0) {
            set(bx, by, bz, frontId);                         // shove block forward
            set(fx, fy, fz, PISTON_HEAD);
          }
          // else: blocked — stay retracted.
        } else if (!on && extended) {
          if (sticky) {
            const pulled = world.getBlock(bx, by, bz);
            if (isPushable(pulled)) {
              set(bx, by, bz, 0);
              set(fx, fy, fz, pulled);                        // drag block back
            } else {
              set(fx, fy, fz, 0);                             // just retract arm
            }
          } else {
            set(fx, fy, fz, 0);                               // retract arm
          }
        }
      }
    }
  }
  return changes;
}

export default actuatePistons;
