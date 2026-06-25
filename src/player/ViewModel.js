/**
 * ViewModel
 * ---------
 * The first-person "right hand" held-item viewmodel rendered as an overlay on
 * top of the world. Shows the currently held item (a textured cube for blocks,
 * a flat icon quad for tools/items, or a bare fist when empty) bottom-right, and
 * plays a swing animation on mine / attack / place.
 *
 * Rendered in its own scene+camera so it always draws over the world.
 */

import * as THREE from 'three';
import { placeBlockId } from '../world/ItemTypes.js';
import { getItemIcon } from '../world/ItemTextures.js';
import { BLOCKS, getFaceColor } from '../world/BlockTypes.js';

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(-1, 2, 2);
    this.scene.add(dir);

    // Pivot the held group swings around.
    this.pivot = new THREE.Group();
    this.pivot.position.set(0.55, -0.55, -1.0);
    this.scene.add(this.pivot);
    this.held = null;
    this._heldType = undefined;

    this._swing = 0;      // 0..1 animation progress (0 = idle)
    this._swingDur = 0.28;
    this._t = 0;          // idle bob clock
    this._loader = new THREE.TextureLoader();

    this.setHeld(null);
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Swap the held model to match the selected item type. */
  setHeld(type) {
    if (type === this._heldType) return;
    this._heldType = type;
    if (this.held) { this.pivot.remove(this.held); this._dispose(this.held); }
    this.held = type ? this._buildItem(type) : this._buildFist();
    this.pivot.add(this.held);
  }

  _buildFist() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.7), mat);
    arm.position.set(0, 0, 0.2);
    g.add(arm);
    return g;
  }

  _buildItem(type) {
    const g = new THREE.Group();
    // The holding arm.
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xe0ac69 })
    );
    arm.position.set(-0.05, -0.18, 0.18);
    g.add(arm);

    const blockId = placeBlockId(type);
    if (blockId && BLOCKS[blockId]) {
      // Held block: a small textured cube.
      const c = getFaceColor(blockId, 'side');
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.42),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(c[0], c[1], c[2]) })
      );
      const icon = getItemIcon(type);
      if (icon) {
        const tex = this._loader.load(icon);
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        cube.material.map = tex; cube.material.needsUpdate = true;
      }
      cube.rotation.set(0.3, -0.5, 0);
      g.add(cube);
    } else {
      // Held tool/item: a flat icon quad angled like a hand-held tool.
      const icon = getItemIcon(type);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide });
      if (icon) {
        const tex = this._loader.load(icon);
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        mat.map = tex;
      } else {
        mat.color = new THREE.Color(0.8, 0.8, 0.85);
      }
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
      quad.rotation.set(0, 0, -0.7);
      quad.position.set(0.05, 0.05, 0);
      g.add(quad);
    }
    return g;
  }

  /** Trigger a swing (called on mine/attack/place). */
  swing() {
    this._swing = 0.0001; // start
  }

  /** @param {number} dt advance idle bob + swing animation. */
  update(dt) {
    this._t += dt;
    // Idle bob.
    const bobY = Math.sin(this._t * 2.2) * 0.012;
    const bobX = Math.cos(this._t * 1.6) * 0.008;

    let sx = 0, sy = 0, rot = 0;
    if (this._swing > 0) {
      this._swing += dt / this._swingDur;
      if (this._swing >= 1) { this._swing = 0; }
      else {
        const p = Math.sin(this._swing * Math.PI); // 0->1->0
        rot = -p * 1.2;       // rotate down/forward
        sy = -p * 0.18;
        sx = -p * 0.08;
      }
    }
    this.pivot.position.set(0.55 + bobX + sx, -0.55 + bobY + sy, -1.0);
    this.pivot.rotation.set(rot, 0, 0);
  }

  _dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); }
    });
  }
}

export default ViewModel;
