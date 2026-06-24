/**
 * NoiseGenerator
 * --------------
 * A self-contained, seedable gradient-noise implementation (classic Perlin in
 * 2D and 3D) plus fractal Brownian motion helpers. No external dependencies —
 * the permutation table is built deterministically from a 32-bit seed so the
 * same seed always reproduces the same terrain.
 */

/** Smootherstep easing (Ken Perlin's improved fade curve). */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

/** 2D gradient dot product. */
function grad2(hash, x, y) {
  switch (hash & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

/** 3D gradient dot product (12 edge vectors of a cube). */
function grad3(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * Mulberry32 — a compact, fast, well-distributed 32-bit PRNG. Used to shuffle
 * the permutation table from the world seed.
 * @param {number} seed
 * @returns {() => number} generator returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NoiseGenerator {
  /**
   * @param {number} seed - 32-bit integer seed.
   */
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.perm = new Uint8Array(512);
    this.#buildPermutation(this.seed);
  }

  /**
   * Build and duplicate the 256-entry permutation table using a seeded shuffle.
   * @param {number} seed
   */
  #buildPermutation(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    const rand = mulberry32(seed);
    // Fisher–Yates shuffle driven by the seeded PRNG.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /**
   * 2D Perlin noise.
   * @param {number} x @param {number} y
   * @returns {number} value in roughly [-1, 1]
   */
  perlin2(x, y) {
    const perm = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];

    const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
    const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  /**
   * 3D Perlin noise.
   * @param {number} x @param {number} y @param {number} z
   * @returns {number} value in roughly [-1, 1]
   */
  perlin3(x, y, z) {
    const perm = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const a = perm[X] + Y;
    const aa = perm[a] + Z;
    const ab = perm[a + 1] + Z;
    const b = perm[X + 1] + Y;
    const ba = perm[b] + Z;
    const bb = perm[b + 1] + Z;

    const x1 = lerp(grad3(perm[aa], xf, yf, zf), grad3(perm[ba], xf - 1, yf, zf), u);
    const x2 = lerp(grad3(perm[ab], xf, yf - 1, zf), grad3(perm[bb], xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);

    const x3 = lerp(grad3(perm[aa + 1], xf, yf, zf - 1), grad3(perm[ba + 1], xf - 1, yf, zf - 1), u);
    const x4 = lerp(grad3(perm[ab + 1], xf, yf - 1, zf - 1), grad3(perm[bb + 1], xf - 1, yf - 1, zf - 1), u);
    const y2 = lerp(x3, x4, v);

    return lerp(y1, y2, w);
  }

  /**
   * Fractal Brownian motion in 2D — layered octaves of Perlin noise.
   * @param {number} x @param {number} y
   * @param {Object} [opts]
   * @param {number} [opts.octaves=4]
   * @param {number} [opts.persistence=0.5] amplitude falloff per octave
   * @param {number} [opts.lacunarity=2.0]  frequency growth per octave
   * @param {number} [opts.frequency=1.0]   base frequency
   * @returns {number} normalised value in [-1, 1]
   */
  fbm2(x, y, opts = {}) {
    const {
      octaves = 4,
      persistence = 0.5,
      lacunarity = 2.0,
      frequency = 1.0
    } = opts;

    let amplitude = 1;
    let freq = frequency;
    let sum = 0;
    let max = 0;

    for (let i = 0; i < octaves; i++) {
      sum += this.perlin2(x * freq, y * freq) * amplitude;
      max += amplitude;
      amplitude *= persistence;
      freq *= lacunarity;
    }
    return sum / max;
  }

  /**
   * Fractal Brownian motion in 3D (used for caves / ore pockets).
   * @param {number} x @param {number} y @param {number} z
   * @param {Object} [opts]
   * @returns {number} normalised value in [-1, 1]
   */
  fbm3(x, y, z, opts = {}) {
    const {
      octaves = 3,
      persistence = 0.5,
      lacunarity = 2.0,
      frequency = 1.0
    } = opts;

    let amplitude = 1;
    let freq = frequency;
    let sum = 0;
    let max = 0;

    for (let i = 0; i < octaves; i++) {
      sum += this.perlin3(x * freq, y * freq, z * freq) * amplitude;
      max += amplitude;
      amplitude *= persistence;
      freq *= lacunarity;
    }
    return sum / max;
  }

  /**
   * Deterministic pseudo-random value in [0,1) keyed on integer coordinates.
   * Useful for "should a tree spawn at this column?" decisions that must be
   * stable across chunk reloads.
   * @param {number} x @param {number} z
   * @returns {number}
   */
  hash2(x, z) {
    let h = this.seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
}

export default NoiseGenerator;
