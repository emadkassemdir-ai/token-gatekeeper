/**
 * PhysicsEngine
 * -------------
 * First-person controller built on the PointerLock API. Owns the player's
 * velocity integration and resolves movement against the voxel world with
 * axis-separated AABB collision (which yields free wall-sliding).
 *
 * Mechanics:
 *   - continuous gravity + variable-height jump (hold to rise higher)
 *   - toggleable creative Fly Mode (vertical thrust, no gravity)
 *   - buoyancy + swim deceleration whenever the body intersects Water
 *   - submersion tracking that the HUD turns into an oxygen meter
 */

import * as THREE from 'three';

const HALF_WIDTH = 0.3; // player is 0.6 wide on X/Z
const HEIGHT = 1.8; // standing height
const EYE_HEIGHT = 1.62; // camera offset from the feet
const EPSILON = 1e-3;

const GRAVITY = 28.0; // m/s^2 downward
const JUMP_VELOCITY = 9.0; // initial jump impulse
const JUMP_SUSTAIN = 26.0; // extra upward accel while jump held (variable jump)
const MAX_JUMP_HOLD = 0.18; // seconds the sustain applies

const WALK_SPEED = 4.6;
const FLY_SPEED = 10.0;
const SWIM_SPEED = 3.0;
const WATER_GRAVITY = 7.0;
const WATER_DRAG = 6.0; // velocity damping per second while submerged
const BUOYANCY = 9.0;

export class PhysicsEngine {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../world/World.js').World} world
   * @param {HTMLElement} domElement - element to bind PointerLock to
   * @param {import('../state/PlayerProfile.js').PlayerProfile} profile
   */
  constructor(camera, world, domElement, profile) {
    this.camera = camera;
    this.world = world;
    this.dom = domElement;
    this.profile = profile;

    // Feet position (X/Z centred). Camera sits EYE_HEIGHT above this.
    this.position = new THREE.Vector3(
      profile.position.x,
      profile.position.y,
      profile.position.z
    );
    this.velocity = new THREE.Vector3(0, 0, 0);

    this.yaw = profile.rotation.yaw || 0;
    this.pitch = profile.rotation.pitch || 0;

    this.flyMode = !!profile.flyMode;
    this.onGround = false;
    this.inWater = false;
    this.submerged = false;
    this.locked = false;

    this._jumpHeld = false;
    this._jumpTimer = 0;
    this._flyToggleArmed = true;

    this.keys = Object.create(null);
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this.mouseSensitivity = 0.0022;

    this._bindEvents();
    this._syncCamera();
  }

  /* ------------------------------- input --------------------------------- */

  _bindEvents() {
    this._onKeyDown = (e) => this._handleKey(e, true);
    this._onKeyUp = (e) => this._handleKey(e, false);
    this._onMouseMove = (e) => this._handleMouse(e);
    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
    };
    this._onClickToLock = () => {
      if (!this.locked) this.dom.requestPointerLock?.();
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.dom.addEventListener('click', this._onClickToLock);
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.dom.removeEventListener('click', this._onClickToLock);
  }

  _handleKey(e, down) {
    const code = e.code;
    this.keys[code] = down;

    if (code === 'Space') {
      this._jumpHeld = down;
      if (down) e.preventDefault();
    }

    // Toggle fly mode on a fresh 'F' press (debounced so holding won't flap).
    if (code === 'KeyF') {
      if (down && this._flyToggleArmed) {
        this.flyMode = !this.flyMode;
        this.profile.flyMode = this.flyMode;
        this.velocity.y = 0;
        this._flyToggleArmed = false;
      } else if (!down) {
        this._flyToggleArmed = true;
      }
    }
  }

  _handleMouse(e) {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.mouseSensitivity;
    this.pitch -= e.movementY * this.mouseSensitivity;
    // Clamp pitch to just shy of straight up/down.
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  /* ------------------------------ collision ------------------------------ */

  /**
   * @returns {boolean} true if the player AABB at `pos` overlaps a solid voxel.
   */
  _collides(pos) {
    const minX = Math.floor(pos.x - HALF_WIDTH);
    const maxX = Math.floor(pos.x + HALF_WIDTH);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + HEIGHT);
    const minZ = Math.floor(pos.z - HALF_WIDTH);
    const maxZ = Math.floor(pos.z + HALF_WIDTH);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /** Sample whether any part of the body / the eye is inside Water. */
  _updateFluidState() {
    const p = this.position;
    this.inWater =
      this.world.isLiquidAt(p.x, p.y + 0.1, p.z) ||
      this.world.isLiquidAt(p.x, p.y + HEIGHT * 0.5, p.z);
    this.submerged = this.world.isLiquidAt(p.x, p.y + EYE_HEIGHT, p.z);
  }

  /**
   * Move along a single axis by `amount` and snap out of any solid it enters.
   * @param {'x'|'y'|'z'} axis
   * @param {number} amount
   */
  _moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.position;
    p[axis] += amount;
    if (!this._collides(p)) return;

    // Penetrated — snap flush against the offending voxel boundary.
    if (axis === 'y') {
      if (amount > 0) {
        p.y = Math.floor(p.y + HEIGHT) - HEIGHT - EPSILON;
      } else {
        p.y = Math.floor(p.y) + 1 + EPSILON;
        this.onGround = true;
      }
      this.velocity.y = 0;
    } else {
      const half = HALF_WIDTH;
      if (amount > 0) {
        p[axis] = Math.floor(p[axis] + half) - half - EPSILON;
      } else {
        p[axis] = Math.floor(p[axis] - half) + 1 + half + EPSILON;
      }
      this.velocity[axis] = 0;
    }
  }

  /* ------------------------------- update -------------------------------- */

  /**
   * Advance the simulation by `dt` seconds.
   * @param {number} dt
   */
  update(dt) {
    // Clamp dt so a stalled tab can't fling the player through the world.
    dt = Math.min(dt, 0.05);

    this._updateFluidState();
    this._applyInput(dt);
    this._integrate(dt);
    this._syncCamera();
  }

  /**
   * Translate key state into desired velocity, accounting for the active
   * locomotion mode (walk / fly / swim).
   * @param {number} dt
   */
  _applyInput(dt) {
    // Forward/right vectors on the horizontal plane from yaw.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forward = { x: -sin, z: -cos };
    const right = { x: cos, z: -sin };

    let ix = 0;
    let iz = 0;
    if (this.keys['KeyW']) iz += 1;
    if (this.keys['KeyS']) iz -= 1;
    if (this.keys['KeyD']) ix += 1;
    if (this.keys['KeyA']) ix -= 1;

    // Normalise diagonal movement.
    const len = Math.hypot(ix, iz);
    if (len > 0) {
      ix /= len;
      iz /= len;
    }

    const speed = this.flyMode ? FLY_SPEED : this.inWater ? SWIM_SPEED : WALK_SPEED;
    const wishX = (forward.x * iz + right.x * ix) * speed;
    const wishZ = (forward.z * iz + right.z * ix) * speed;

    // Horizontal velocity is set directly for crisp, responsive control.
    this.velocity.x = wishX;
    this.velocity.z = wishZ;

    if (this.flyMode) {
      // Creative vertical thrust; no gravity.
      let vy = 0;
      if (this._jumpHeld) vy += FLY_SPEED;
      if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) vy -= FLY_SPEED;
      this.velocity.y = vy;
      return;
    }

    if (this.inWater) {
      // Buoyancy + drag; swimming up by holding jump.
      this.velocity.y -= WATER_GRAVITY * dt;
      this.velocity.y += BUOYANCY * dt * 0.5;
      if (this._jumpHeld) this.velocity.y += SWIM_SPEED * dt * 6;
      // Exponential drag deceleration.
      this.velocity.y -= this.velocity.y * Math.min(1, WATER_DRAG * dt);
      return;
    }

    // Grounded jump with a short variable-height sustain window.
    if (this.onGround && this._jumpHeld) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
      this._jumpTimer = 0;
    } else if (!this.onGround && this._jumpHeld && this._jumpTimer < MAX_JUMP_HOLD) {
      this.velocity.y += JUMP_SUSTAIN * dt;
      this._jumpTimer += dt;
    }

    // Gravity.
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -55) this.velocity.y = -55; // terminal velocity
  }

  /**
   * Integrate velocity into position with per-axis collision resolution.
   * @param {number} dt
   */
  _integrate(dt) {
    this.onGround = false;
    // Resolve Y first so ground state is known, then horizontal sliding.
    this._moveAxis('y', this.velocity.y * dt);
    this._moveAxis('x', this.velocity.x * dt);
    this._moveAxis('z', this.velocity.z * dt);
  }

  /** Push the simulated state onto the Three.js camera. */
  _syncCamera() {
    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_HEIGHT,
      this.position.z
    );
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
  }

  /** @returns {{yaw:number, pitch:number}} for persistence. */
  getRotation() {
    return { yaw: this.yaw, pitch: this.pitch };
  }
}

export default PhysicsEngine;
