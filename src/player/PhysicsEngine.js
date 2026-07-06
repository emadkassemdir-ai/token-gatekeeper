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
const SPRINT_MULT = 1.35;  // sprint speed factor (canon ~1.3)
const CROUCH_MULT = 0.35;  // sneak speed factor
const FLY_SPEED = 10.0;
const SWIM_SPEED = 3.6;
const WATER_GRAVITY = 4.0; // gentle sink — water is water, not ground
const WATER_DRAG = 6.0;    // velocity damping per second while submerged
const BUOYANCY = 9.0;
const LADDER_ID = 107;
const CLIMB_SPEED = 3.2; // m/s up a ladder

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
    this.sprinting = false;    // Ctrl (or double-tap W) while moving forward
    this.crouching = false;    // Shift on the ground: slow, low, edge-safe
    this._lastWTap = 0;        // double-tap-W sprint timing

    this.keys = Object.create(null);
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this.mouseSensitivity = 0.0022;
    this.touchSensitivity = 0.004;

    // Analog locomotion input (e.g. from an on-screen joystick), range [-1, 1].
    // x = strafe (right positive), z = forward (positive).
    this.moveInput = { x: 0, z: 0 };
    // Vertical intent for fly mode driven by touch buttons.
    this._flyUp = false;
    this._flyDown = false;
    // When true, skip PointerLock (touch devices have no mouse to capture).
    this.touch = false;
    // Cheat hooks.
    this.speedMultiplier = 1;
    // Status-effect multipliers (Speed/Slowness, Jump Boost) set by the engine.
    this.statusSpeed = 1;
    this.statusJump = 1;
    this.noclip = false;
    // Fly is only allowed in creative (cheats can still force it).
    this.allowFly = true;

    this._bindEvents();
    this._syncCamera();
  }

  /* ----------------------- public input API (touch) ---------------------- */

  /** Set analog movement from a joystick. @param {number} x @param {number} z */
  setMoveInput(x, z) {
    this.moveInput.x = Math.max(-1, Math.min(1, x));
    this.moveInput.z = Math.max(-1, Math.min(1, z));
  }

  /** Apply a look delta (drag-to-look), bypassing the PointerLock gate. */
  rotate(dx, dy) {
    this.yaw -= dx * this.touchSensitivity;
    this.pitch -= dy * this.touchSensitivity;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  /** Hold/release jump (walk) or ascend (fly/swim). @param {boolean} down */
  setJump(down) {
    this._jumpHeld = down;
    this._flyUp = down;
  }

  /** Hold/release descend (fly mode). @param {boolean} down */
  setDescend(down) {
    this._flyDown = down;
  }

  /** Toggle creative fly mode (mirrors the desktop 'F' key). No-op if disallowed. */
  toggleFly() {
    if (!this.allowFly) { this.flyMode = false; return false; }
    this.flyMode = !this.flyMode;
    this.profile.flyMode = this.flyMode;
    this.velocity.y = 0;
    return this.flyMode;
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
      if (this.touch) return; // no PointerLock on touch devices
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
    // Ignore movement keys while typing in a text field (chat/crafting search).
    const a = document.activeElement;
    if (down && a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    const code = e.code;
    this.keys[code] = down;

    if (code === 'Space') {
      this._jumpHeld = down;
      if (down) e.preventDefault();
    }

    // Sprint: hold Ctrl, or double-tap W within 300ms (canon).
    if ((code === 'ControlLeft' || code === 'ControlRight')) this.sprinting = down;
    if (code === 'KeyW' && down) {
      const now = performance.now();
      if (now - this._lastWTap < 300) this.sprinting = true;
      this._lastWTap = now;
    }
    if (code === 'KeyW' && !down && !this.keys['ControlLeft'] && !this.keys['ControlRight']) {
      this.sprinting = false; // sprint ends when you stop running
    }

    // Toggle fly mode on a fresh 'F' press (debounced so holding won't flap).
    if (code === 'KeyF') {
      if (down && this._flyToggleArmed) {
        this.toggleFly();
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
   * Gather world-space solid AABBs overlapping the player AABB at `pos`. Honours
   * partial-height blocks (slabs) via World.collisionBoxes.
   * @returns {number[][]} list of [x0,y0,z0,x1,y1,z1]
   */
  _overlapBoxes(pos) {
    const out = [];
    if (this.noclip) return out;
    const minX = Math.floor(pos.x - HALF_WIDTH);
    const maxX = Math.floor(pos.x + HALF_WIDTH);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + HEIGHT);
    const minZ = Math.floor(pos.z - HALF_WIDTH);
    const maxZ = Math.floor(pos.z + HALF_WIDTH);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const boxes = this.world.collisionBoxes(x, y, z);
          if (!boxes) continue;
          for (const b of boxes) {
            const x0 = x + b[0], y0 = y + b[1], z0 = z + b[2];
            const x1 = x + b[3], y1 = y + b[4], z1 = z + b[5];
            if (pos.x + HALF_WIDTH > x0 && pos.x - HALF_WIDTH < x1 &&
                pos.y + HEIGHT > y0 && pos.y < y1 &&
                pos.z + HALF_WIDTH > z0 && pos.z - HALF_WIDTH < z1) {
              out.push([x0, y0, z0, x1, y1, z1]);
            }
          }
        }
      }
    }
    return out;
  }

  /** @returns {boolean} true if the player AABB at `pos` overlaps a solid box. */
  _collides(pos) {
    return this._overlapBoxes(pos).length > 0;
  }

  /** @returns {boolean} whether the player's body overlaps a ladder voxel. */
  _onLadder() {
    const p = this.position;
    const minX = Math.floor(p.x - HALF_WIDTH);
    const maxX = Math.floor(p.x + HALF_WIDTH);
    const minY = Math.floor(p.y);
    const maxY = Math.floor(p.y + HEIGHT);
    const minZ = Math.floor(p.z - HALF_WIDTH);
    const maxZ = Math.floor(p.z + HALF_WIDTH);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.getBlock(x, y, z) === LADDER_ID) return true;
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
    const boxes = this._overlapBoxes(p);
    if (!boxes.length) return;

    // Penetrated — snap flush against the nearest box boundary on this axis.
    if (axis === 'y') {
      if (amount > 0) {
        let lim = Infinity;
        for (const b of boxes) lim = Math.min(lim, b[1]); // box bottoms
        p.y = lim - HEIGHT - EPSILON;
      } else {
        let lim = -Infinity;
        for (const b of boxes) lim = Math.max(lim, b[4]); // box tops
        p.y = lim + EPSILON;
        this.onGround = true;
      }
      this.velocity.y = 0;
    } else {
      const half = HALF_WIDTH;
      const lo = axis === 'x' ? 0 : 2;  // index of min corner on this axis
      const hi = lo + 3;                // index of max corner on this axis
      if (amount > 0) {
        let lim = Infinity;
        for (const b of boxes) lim = Math.min(lim, b[lo]);
        p[axis] = lim - half - EPSILON;
      } else {
        let lim = -Infinity;
        for (const b of boxes) lim = Math.max(lim, b[hi]);
        p[axis] = lim + half + EPSILON;
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

    // Fold in analog joystick input (touch).
    ix += this.moveInput.x;
    iz += this.moveInput.z;

    // Clamp magnitude to 1 so diagonals/analog never exceed full speed, while
    // preserving partial speed for a half-pushed joystick.
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }

    const fly = this.flyMode || this.noclip;
    // Crouch: Shift while grounded (walking only). Sprint needs forward motion.
    this.crouching = !fly && !this.inWater && this.onGround &&
      !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const sprint = this.sprinting && iz > 0.1 && !this.crouching;
    const baseSpeed = fly ? FLY_SPEED : this.inWater ? SWIM_SPEED : WALK_SPEED;
    const moveMult = this.crouching ? CROUCH_MULT : sprint ? SPRINT_MULT : 1;
    const speed = baseSpeed * moveMult * this.speedMultiplier * this.statusSpeed;
    const wishX = (forward.x * iz + right.x * ix) * speed;
    const wishZ = (forward.z * iz + right.z * ix) * speed;

    // Horizontal velocity is set directly for crisp, responsive control.
    this.velocity.x = wishX;
    this.velocity.z = wishZ;

    if (fly) {
      // Creative vertical thrust; no gravity.
      let vy = 0;
      if (this._jumpHeld || this._flyUp) vy += FLY_SPEED;
      if (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this._flyDown) vy -= FLY_SPEED;
      this.velocity.y = vy;
      return;
    }

    if (this.inWater) {
      // Real swimming: gentle sink, buoyant float, jump to rise, shift to dive.
      this.velocity.y -= WATER_GRAVITY * dt;
      this.velocity.y += BUOYANCY * dt * 0.6;
      if (this._jumpHeld || this._flyUp) this.velocity.y += SWIM_SPEED * dt * 7;
      if (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this._flyDown) this.velocity.y -= SWIM_SPEED * dt * 6;
      // Exponential drag deceleration.
      this.velocity.y -= this.velocity.y * Math.min(1, WATER_DRAG * dt);
      return;
    }

    // Ladder climbing: vertical motion is driven by intent, gravity suspended.
    if (this._onLadder()) {
      if (this._jumpHeld || this._flyUp) this.velocity.y = CLIMB_SPEED;          // climb up
      else if (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this._flyDown) this.velocity.y = -CLIMB_SPEED; // descend
      else if (iz > 0.1) this.velocity.y = CLIMB_SPEED * 0.55;                    // hold forward to climb
      else this.velocity.y = -1.4;                                               // gentle slide down
      return;
    }

    // Grounded jump with a short variable-height sustain window.
    if (this.onGround && this._jumpHeld) {
      this.velocity.y = JUMP_VELOCITY * this.statusJump;
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
    const wasGrounded = this.onGround;
    this.onGround = false;
    // Resolve Y first so ground state is known, then horizontal sliding.
    this._moveAxis('y', this.velocity.y * dt);
    // Sneaking on the ground never walks off an edge (canon sneak guard).
    if (this.crouching && (wasGrounded || this.onGround)) {
      this._moveAxisGuarded('x', this.velocity.x * dt);
      this._moveAxisGuarded('z', this.velocity.z * dt);
    } else {
      this._moveAxis('x', this.velocity.x * dt);
      this._moveAxis('z', this.velocity.z * dt);
    }
  }

  /** Horizontal move that reverts if it would leave the player with no floor. */
  _moveAxisGuarded(axis, amount) {
    if (amount === 0) return;
    const before = this.position[axis];
    this._moveAxis(axis, amount);
    const p = this.position;
    // Probe straight down: is there still ground within half a block?
    const probe = { x: p.x, y: p.y - 0.5, z: p.z };
    if (!this._overlapBoxes(probe).length) {
      this.position[axis] = before; // would step off the edge — stay put
      this.velocity[axis] = 0;
    }
  }

  /** Push the simulated state onto the Three.js camera. */
  _syncCamera() {
    const eye = this.crouching ? EYE_HEIGHT - 0.3 : EYE_HEIGHT; // sneak dips the view
    this.camera.position.set(
      this.position.x,
      this.position.y + eye,
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
