/**
 * UITextures
 * ----------
 * Gives the whole interface a Minecraft-style look without any copyrighted
 * assets: procedurally generated tileable dirt / stone / plank textures (as
 * data URLs) plus a global theme stylesheet (pixel font, blocky beveled
 * buttons, textured panels, pixelated rendering).
 *
 * Call injectTheme() once at startup. No-ops safely when there's no canvas.
 */

const TILE = 16;

function pnoise(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function genTile(kind) {
  if (typeof document === 'undefined') return null;
  let c, ctx;
  try { c = document.createElement('canvas'); ctx = c.getContext && c.getContext('2d'); } catch { return null; }
  if (!ctx) return null;
  c.width = TILE; c.height = TILE;

  const bases = {
    dirt: [0.42, 0.30, 0.18],
    stone: [0.50, 0.50, 0.53],
    plank: [0.62, 0.46, 0.27]
  };
  const base = bases[kind] || [0.5, 0.5, 0.5];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = pnoise(x, y);
      let m = 0.85 + n * 0.3;
      if (kind === 'stone' && n < 0.1) m = 0.7;
      if (kind === 'dirt' && n < 0.14) m = 0.65;
      if (kind === 'plank') m = (y % 5 === 0 ? 0.72 : 0.9) + n * 0.12;
      const r = Math.max(0, Math.min(255, base[0] * m * 255)) | 0;
      const g = Math.max(0, Math.min(255, base[1] * m * 255)) | 0;
      const b = Math.max(0, Math.min(255, base[2] * m * 255)) | 0;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c.toDataURL('image/png');
}

/** Inject the global Minecraft-style theme (idempotent). */
export function injectTheme() {
  if (typeof document === 'undefined' || document.getElementById('mc-theme')) return;

  const dirt = genTile('dirt');
  const stone = genTile('stone');
  const plank = genTile('plank');
  const root = document.documentElement;
  if (dirt) root.style.setProperty('--mc-dirt', `url(${dirt})`);
  if (stone) root.style.setProperty('--mc-stone', `url(${stone})`);
  if (plank) root.style.setProperty('--mc-plank', `url(${plank})`);

  const style = document.createElement('style');
  style.id = 'mc-theme';
  style.textContent = `
    :root {
      --pixel-font: 'VT323', 'Courier New', monospace;
      --title-font: 'Press Start 2P', 'VT323', monospace;
    }
    /* Pixel font + crisp pixels across the whole UI. */
    #app, #app * { font-family: var(--pixel-font); }
    .item-icon, .slot-swatch, .inv-icon { image-rendering: pixelated; image-rendering: crisp-edges; }

    /* Blocky Minecraft-style button. */
    .mc-btn {
      font-family: var(--pixel-font); font-size: 20px; letter-spacing: 1px;
      color: #ffffff; text-shadow: 2px 2px 0 #2a2a2a;
      background-color: #9a9a9a; background-image: var(--mc-stone);
      background-size: 32px; image-rendering: pixelated;
      border-style: solid; border-width: 3px;
      border-color: #d4d4d4 #565656 #565656 #d4d4d4; /* top-left light, bottom-right dark */
      border-radius: 0; padding: 10px 14px; cursor: pointer;
    }
    .mc-btn:hover:not(:disabled) { filter: brightness(1.12); border-color: #ffffe0 #6a6a4a #6a6a4a #ffffe0; }
    .mc-btn:active:not(:disabled) { border-color: #565656 #d4d4d4 #d4d4d4 #565656; filter: brightness(0.95); }
    .mc-btn:disabled { filter: grayscale(0.5) brightness(0.7); cursor: not-allowed; }

    /* Stone/dirt textured panel with a hard pixel border. */
    .mc-panel {
      background-color: #3a3a3a; background-image: var(--mc-stone);
      background-size: 48px; image-rendering: pixelated;
      border: 4px solid #161616; box-shadow: 0 0 0 4px #5a5a5a, 0 12px 40px rgba(0,0,0,0.6);
      border-radius: 0;
    }
  `;
  document.head.appendChild(style);
}

export default { injectTheme };
