/**
 * Avatar
 * ------
 * The player's customizable character appearance. Stored globally (not per
 * world) in LocalStorage so the same look follows the player across every
 * world they create. Rendered as a simple blocky character in the avatar
 * editor and the inventory screen.
 */

const STORAGE_KEY = 'voxelcraft.avatar';

/** Darken a #rrggbb colour for shading/shadows. */
function mixDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '#000000'));
  if (!m) return '#000';
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) * 0.6, g = ((n >> 8) & 255) * 0.6, b = (n & 255) * 0.6;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Named colour presets offered as quick-pick swatches. */
export const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
export const HAIR_COLORS = ['#2b1b0e', '#5a3a1a', '#a8741a', '#d9c89a', '#9b9b9b', '#1a1a1a'];
export const SHIRT_COLORS = ['#4a90d9', '#6cc24a', '#d94a4a', '#d9c24a', '#9b4ad9', '#222831'];
export const PANTS_COLORS = ['#3b5b8c', '#5a4632', '#333a45', '#2b2b2b', '#6b6b6b'];

/** A few one-click full presets. */
export const PRESETS = [
  { name: 'Steve', skin: '#e0ac69', hair: '#2b1b0e', shirt: '#3aa0a0', pants: '#3b5b8c' },
  { name: 'Alex', skin: '#f1c27d', hair: '#a8741a', shirt: '#6cc24a', pants: '#5a4632' },
  { name: 'Ninja', skin: '#c68642', hair: '#1a1a1a', shirt: '#222831', pants: '#2b2b2b' },
  { name: 'Berry', skin: '#8d5524', hair: '#5a3a1a', shirt: '#9b4ad9', pants: '#3b5b8c' }
];

export class Avatar {
  constructor() {
    this.skin = '#e0ac69';
    this.hair = '#2b1b0e';
    this.shirt = '#4a90d9';
    this.pants = '#3b5b8c';
  }

  /** @param {{skin?:string,hair?:string,shirt?:string,pants?:string}} parts */
  set(parts) {
    if (parts.skin) this.skin = parts.skin;
    if (parts.hair) this.hair = parts.hair;
    if (parts.shirt) this.shirt = parts.shirt;
    if (parts.pants) this.pants = parts.pants;
  }

  applyPreset(preset) {
    this.set(preset);
  }

  toJSON() {
    return { skin: this.skin, hair: this.hair, shirt: this.shirt, pants: this.pants };
  }

  /** Persist globally. @returns {boolean} */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toJSON()));
      return true;
    } catch (err) {
      console.warn('[Avatar] save failed:', err);
      return false;
    }
  }

  /** Load the global avatar (creates defaults if none). @returns {Avatar} */
  static load() {
    const a = new Avatar();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) a.set(JSON.parse(raw));
    } catch (err) {
      console.warn('[Avatar] load failed:', err);
    }
    return a;
  }

  /**
   * Build a blocky DOM preview of the avatar (head, hair, body, arms, legs).
   * @param {Avatar} avatar
   * @param {number} [scale=1]
   * @returns {HTMLElement}
   */
  static buildPreview(avatar, scale = 1) {
    const wrap = document.createElement('div');
    wrap.className = 'avatar-preview';
    wrap.style.cssText = `position:relative;width:${72 * scale}px;height:${132 * scale}px;image-rendering:pixelated;`;

    const px = (n) => `${n * scale}px`;
    const part = (x, y, w, h, color, extra = '') => {
      const d = document.createElement('div');
      d.style.cssText =
        `position:absolute;left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};` +
        `background:${color};box-shadow:inset -2px -2px 0 rgba(0,0,0,0.22), inset 2px 2px 0 rgba(255,255,255,0.12);` +
        `border-radius:0;${extra}`;
      wrap.appendChild(d);
      return d;
    };
    const flat = (x, y, w, h, color) => {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};background:${color};`;
      wrap.appendChild(d);
      return d;
    };

    // Head, hair cap + fringe (no ears).
    part(22, 6, 28, 26, avatar.skin);            // head
    part(20, 1, 32, 9, avatar.hair);             // hair top (overhangs)
    flat(22, 10, 28, 4, avatar.hair);            // hair fringe
    flat(22, 6, 4, 24, avatar.hair);             // hair side L
    flat(46, 6, 4, 24, avatar.hair);             // hair side R

    // Face: eyes (white + pupil) and a mouth.
    flat(28, 17, 7, 5, '#f7f7f7'); flat(31, 18, 4, 4, '#3a5fa0'); // left eye + iris
    flat(40, 17, 7, 5, '#f7f7f7'); flat(40, 18, 4, 4, '#3a5fa0'); // right eye + iris
    flat(31, 26, 12, 2, 'rgba(90,50,40,0.6)');   // mouth

    // Body, arms (+ skin hands), legs.
    part(18, 32, 36, 42, avatar.shirt);
    part(6, 34, 12, 36, avatar.shirt);
    part(54, 34, 12, 36, avatar.shirt);
    part(6, 64, 12, 8, avatar.skin);
    part(54, 64, 12, 8, avatar.skin);
    part(22, 74, 14, 48, avatar.pants);
    part(36, 74, 14, 48, avatar.pants);
    flat(20, 122, 16, 4, mixDark(avatar.pants)); // shoe shadow
    flat(36, 122, 16, 4, mixDark(avatar.pants));

    return wrap;
  }
}

export default Avatar;
