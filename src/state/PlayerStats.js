/**
 * PlayerStats
 * -----------
 * Survival vitals: health and hunger (both measured in "hearts"/"food" units
 * for easy half-icon HUD rendering), natural regeneration, starvation, and the
 * survival/creative game mode. In creative the player is invulnerable and stats
 * are frozen full.
 */

export const MAX_HEALTH = 10; // 10 hearts
export const MAX_HUNGER = 10; // 10 food icons

export class PlayerStats {
  /** @param {'survival'|'creative'} mode */
  constructor(mode = 'survival') {
    this.mode = mode;
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.dead = false;

    this._damageCooldown = 0; // i-frames after taking a hit
    this._regenTimer = 0;
    this._starveTimer = 0;
    this._hungerDrain = 0;

    /** Set by the engine; called with no args when the player dies. */
    this.onDeath = null;
    /** Called with (amount) when damage is taken (for HUD flash / knockback). */
    this.onDamage = null;
  }

  get isCreative() {
    return this.mode === 'creative';
  }

  /** @param {'survival'|'creative'} mode */
  setMode(mode) {
    this.mode = mode;
    if (mode === 'creative') {
      this.health = MAX_HEALTH;
      this.hunger = MAX_HUNGER;
      this.dead = false;
    }
  }

  /**
   * Apply damage (hearts). No-op in creative or during i-frames.
   * @param {number} amount
   * @returns {boolean} whether damage was applied
   */
  damage(amount) {
    if (this.isCreative || this.dead || this._damageCooldown > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this._damageCooldown = 0.6;
    this._regenTimer = 0;
    this.onDamage?.(amount);
    if (this.health <= 0) this._die();
    return true;
  }

  /** Heal up to max (hearts). */
  heal(amount) {
    if (this.dead) return;
    this.health = Math.min(MAX_HEALTH, this.health + amount);
  }

  /** Restore hunger (eating). */
  feed(amount) {
    this.hunger = Math.min(MAX_HUNGER, this.hunger + amount);
  }

  /**
   * Eat a food item. Raw food restores less and has a 20% chance to cost a
   * heart. Refused (returns false) when hunger is already full so the item
   * isn't wasted.
   * @param {{hunger:number, raw?:boolean}} food
   * @returns {{ eaten: boolean, poisoned?: boolean }}
   */
  eat(food) {
    if (!food) return { eaten: false };
    if (this.hunger >= MAX_HUNGER) return { eaten: false };
    this.feed(food.hunger);
    let poisoned = false;
    if (food.raw && Math.random() < 0.2) {
      poisoned = true;
      this._damageCooldown = 0; // poison bypasses i-frames
      this.damage(1);
    }
    return { eaten: true, poisoned };
  }

  /** Add hunger exhaustion (movement/jumping/mining cost). */
  addExhaustion(amount) {
    this._hungerDrain += amount;
  }

  _die() {
    this.dead = true;
    this.onDeath?.();
  }

  /** Respawn at full vitals. */
  respawn() {
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.dead = false;
    this._damageCooldown = 0;
  }

  /**
   * Per-frame vitals tick.
   * @param {number} dt seconds
   */
  update(dt) {
    if (this.isCreative || this.dead) return;

    if (this._damageCooldown > 0) this._damageCooldown -= dt;

    // Convert accumulated exhaustion into hunger loss (4 exhaustion = 1 food).
    if (this._hungerDrain >= 4) {
      this.hunger = Math.max(0, this.hunger - 1);
      this._hungerDrain -= 4;
    }
    // Slow passive hunger drain so the bar matters over time.
    this.hunger = Math.max(0, this.hunger - dt * 0.03);

    // Regenerate health when well fed.
    if (this.hunger >= 8 && this.health < MAX_HEALTH) {
      this._regenTimer += dt;
      if (this._regenTimer >= 2) {
        this.heal(1);
        this._regenTimer = 0;
        this.addExhaustion(1);
      }
    } else {
      this._regenTimer = 0;
    }

    // Starvation: at zero hunger, slowly lose health (down to half a heart).
    if (this.hunger <= 0 && this.health > 0.5) {
      this._starveTimer += dt;
      if (this._starveTimer >= 2) {
        this.health = Math.max(0.5, this.health - 0.5);
        this._starveTimer = 0;
      }
    }
  }

  toJSON() {
    return { mode: this.mode, health: this.health, hunger: this.hunger };
  }

  load(data) {
    if (!data) return;
    if (data.mode === 'survival' || data.mode === 'creative') this.mode = data.mode;
    if (typeof data.health === 'number') this.health = data.health;
    if (typeof data.hunger === 'number') this.hunger = data.hunger;
  }
}

export default PlayerStats;
