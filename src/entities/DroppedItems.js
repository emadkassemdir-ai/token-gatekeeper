/**
 * DroppedItems
 * ------------
 * Floating item entities that exist in the world after a player drags an item
 * out of their inventory (or a future block/mob drop). Each entity bobs and
 * spins, and is collected when any player walks within pickup range. In
 * multiplayer every client renders the same drops (kept in sync by id) so other
 * players can see and collect what you throw down.
 *
 * Rendering: a small cube tinted from the item's colour, plus — when a canvas
 * is available — a billboard sprite showing the real pixel icon. Headless
 * (tests) the sprite is skipped gracefully.
 */

import * as THREE from 'three';
import { ITEMS, placeBlockId } from '../world/ItemTypes.js';
import { BLOCKS } from '../world/BlockTypes.js';
import { getItemIcon } from '../world/ItemTextures.js';

const PICKUP_RANGE = 1.5;   // how close a player must be to collect
const PICKUP_DELAY = 0.6;   // seconds before anyone can collect (avoids instant re-grab)

let _seq = 0;
/** Generate a world-unique id for a dropped stack. */
export function dropId() {
  return 'd' + Date.now().toString(36) + (_seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

function itemColor(type) {
  const blockId = placeBlockId(type);
  if (blockId && BLOCKS[blockId]) {
    const c = BLOCKS[blockId].faceColors?.top ?? BLOCKS[blockId].color;
    if (Array.isArray(c)) return new THREE.Color(c[0], c[1], c[2]);
  }
  return new THREE.Color(0xcfcfcf);
}

export class DroppedItems {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, Object>} */
    this.items = new Map();
  }

  /**
   * Create a dropped item entity.
   * @param {string} id unique id (shared across clients)
   * @param {string} type item type
   * @param {number} count stack size
   * @param {{x:number,y:number,z:number}} pos
   */
  spawn(id, type, count, pos) {
    if (this.items.has(id) || !ITEMS[type]) return;
    const group = new THREE.Group();
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshLambertMaterial({ color: itemColor(type) })
    );
    group.add(cube);

    // Optional pixel-icon billboard on top of the cube.
    const sprite = this._iconSprite(type);
    if (sprite) group.add(sprite);

    group.position.set(pos.x, pos.y + 0.3, pos.z);
    this.scene.add(group);
    this.items.set(id, { id, type, count, group, age: 0, phase: Math.random() * Math.PI * 2 });
  }

  _iconSprite(type) {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
    try {
      const url = getItemIcon(type);
      if (!url) return null;
      const tex = new THREE.TextureLoader().load(url);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(0.45, 0.45, 1);
      sprite.position.y = 0.05;
      return sprite;
    } catch { return null; }
  }

  /**
   * Advance bobbing/spin and test the local player for pickups.
   * @param {number} dt
   * @param {THREE.Vector3} playerPos local player feet position
   * @param {(item:{id:string,type:string,count:number}) => boolean} onCollect
   *        return true if the item was taken (added to inventory)
   */
  update(dt, playerPos, onCollect, world = null) {
    const t = performance.now() / 1000;
    for (const item of [...this.items.values()]) {
      item.age += dt;
      item.group.rotation.y += dt * 1.6;

      // Gravity: items fall until they rest on a solid block (lets mods rain
      // things from the sky, and makes ordinary drops settle on the ground).
      if (world) {
        const p = item.group.position;
        item.vy = (item.vy ?? 0) - 16 * dt;
        if (item.vy < -30) item.vy = -30;
        const ny = p.y + item.vy * dt;
        if (world.isSolidAt(p.x, ny - 0.18, p.z)) {
          item.vy = 0;
          p.y = Math.floor(ny - 0.18) + 1 + 0.32; // rest on the block top
        } else if (ny > 0) {
          p.y = ny;
        } else { this.remove(item.id); continue; } // fell out of the world
      }
      item.group.position.y += Math.sin(t * 2 + item.phase) * 0.12 * dt;

      if (item.age < PICKUP_DELAY || !playerPos) continue;
      const dx = playerPos.x - item.group.position.x;
      const dy = playerPos.y + 0.9 - item.group.position.y;
      const dz = playerPos.z - item.group.position.z;
      if (Math.hypot(dx, dy, dz) <= PICKUP_RANGE) {
        if (onCollect(item)) this.remove(item.id);
      }
    }
  }

  /** @param {string} id */
  remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    this.scene.remove(item.group);
    item.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); }
    });
    this.items.delete(id);
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }
}

export default DroppedItems;
