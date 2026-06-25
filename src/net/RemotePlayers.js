/**
 * RemotePlayers
 * -------------
 * Renders other players as blocky 3D avatars built from their avatar colours,
 * and smoothly interpolates them toward the latest networked position so 10 Hz
 * updates still look fluid. Keyed by peer id.
 */

import * as THREE from 'three';

const DEFAULT = { skin: '#e0ac69', hair: '#2b1b0e', shirt: '#4a90d9', pants: '#3b5b8c' };

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

export class RemotePlayers {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, {group:THREE.Group, target:THREE.Vector3, yaw:number}>} */
    this.players = new Map();
  }

  /** @param {string} id @param {Object|null} avatar @param {string} [name] */
  add(id, avatar, name = 'Player') {
    if (this.players.has(id)) { this.players.get(id).group.visible = true; return; }
    const a = { ...DEFAULT, ...(avatar || {}) };
    const group = new THREE.Group();

    const head = box(0.5, 0.5, 0.5, a.skin); head.position.y = 1.55;
    const hair = box(0.54, 0.12, 0.54, a.hair); hair.position.y = 1.84;
    const body = box(0.6, 0.7, 0.32, a.shirt); body.position.y = 1.0;
    const armL = box(0.18, 0.7, 0.22, a.shirt); armL.position.set(-0.39, 1.0, 0);
    const armR = box(0.18, 0.7, 0.22, a.shirt); armR.position.set(0.39, 1.0, 0);
    const legL = box(0.22, 0.7, 0.26, a.pants); legL.position.set(-0.13, 0.35, 0);
    const legR = box(0.22, 0.7, 0.26, a.pants); legR.position.set(0.13, 0.35, 0);
    group.add(head, hair, body, armL, armR, legL, legR);
    group.add(this._nameplate(name));

    this.scene.add(group);
    this.players.set(id, { group, target: new THREE.Vector3(), yaw: 0, hasPos: false });
  }

  _nameplate(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(name).slice(0, 14), 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = 2.2;
    return sprite;
  }

  /** Update the networked target for a player. @param {string} id @param {Object} s */
  setTarget(id, s) {
    const p = this.players.get(id);
    if (!p) return;
    p.target.set(s.x, s.y, s.z);
    p.yaw = s.yaw || 0;
    if (!p.hasPos) { p.group.position.copy(p.target); p.hasPos = true; }
  }

  /** Smoothly advance all remote avatars. @param {number} dt */
  update(dt) {
    const t = Math.min(1, dt * 10);
    for (const p of this.players.values()) {
      p.group.position.lerp(p.target, t);
      p.group.rotation.y = p.yaw;
    }
  }

  /** @param {string} id */
  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.group);
    p.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); }
    });
    this.players.delete(id);
  }

  clear() {
    for (const id of [...this.players.keys()]) this.remove(id);
  }
}

export default RemotePlayers;
