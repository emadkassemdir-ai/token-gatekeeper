/**
 * EasterEgg
 * ---------
 * A hidden surprise: name your character "yassin" and the entire game — the
 * UI panels, the menus, and the sky itself — becomes The Photo. Purely
 * cosmetic and easily ignored if you never type the magic name.
 */

import * as THREE from 'three';
import yassinUrl from '../assets/yassin.jpg';

/** @param {string} name @returns {boolean} */
export function isYassin(name) {
  return String(name || '').trim().toLowerCase() === 'yassin';
}

/** The stronger form: name yourself 'yassinsigma' and EVERYTHING is The Photo. */
export function isYassinSigma(name) {
  return String(name || '').trim().toLowerCase() === 'yassinsigma';
}

let _uiApplied = false;

/** Skin the whole DOM interface with the photo (idempotent). */
export function applyYassinUI() {
  if (_uiApplied || typeof document === 'undefined') return;
  _uiApplied = true;
  document.documentElement.classList.add('yassin-mode');
  const style = document.createElement('style');
  style.id = 'yassin-style';
  style.textContent = `
    .yassin-mode body, .yassin-mode #app {
      background: #000 url(${yassinUrl}) center/cover fixed no-repeat !important;
    }
    /* Every panel/menu gets the face behind a slight scrim so text stays legible. */
    .yassin-mode .mc-panel, .yassin-mode .inv-panel, .yassin-mode .craft-panel,
    .yassin-mode .smelt-panel, .yassin-mode .mp-panel, .yassin-mode .menu-panel,
    .yassin-mode .ae-panel, .yassin-mode #splash, .yassin-mode .game-menu {
      background-image: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${yassinUrl}) !important;
      background-size: cover !important;
      background-position: center !important;
    }
    .yassin-mode .hud-slot, .yassin-mode .inv-cell, .yassin-mode .inv-slot,
    .yassin-mode .tc-btn {
      background-image: url(${yassinUrl}) !important;
      background-size: cover !important; background-position: center !important;
    }
  `;
  document.head.appendChild(style);
}

let _sigmaApplied = false;

/**
 * SIGMA mode (username 'yassinsigma'): everything yassin-mode does, PLUS the
 * game is renamed YassinCraft, every single button becomes The Photo, and a
 * swarm of floating yassins decorates the edges of every menu. Idempotent.
 */
export function applyYassinSigmaUI() {
  if (typeof document === 'undefined') return;
  applyYassinUI(); // panels, slots, background
  if (_sigmaApplied) { retitleYassin(); return; }
  _sigmaApplied = true;
  document.documentElement.classList.add('yassin-sigma');

  const style = document.createElement('style');
  style.id = 'yassin-sigma-style';
  style.textContent = `
    /* EVERY button in the game becomes The Photo (text outlined for legibility). */
    .yassin-sigma button, .yassin-sigma .tc-btn, .yassin-sigma .trade-btn,
    .yassin-sigma .world-play, .yassin-sigma .world-del {
      background: url(${yassinUrl}) center/cover no-repeat !important;
      color: #fff !important;
      text-shadow: 0 0 3px #000, 0 0 6px #000, 1px 1px 0 #000 !important;
      border: 2px solid rgba(255,255,255,0.7) !important;
    }
    .yassin-sigma select, .yassin-sigma input[type="checkbox"] {
      accent-color: #c8a888;
    }
    /* Floating yassins all around the menu edges (above the splash overlay,
       pointer-events off so they never block a click). */
    #yassin-swarm { position: fixed; inset: 0; pointer-events: none; z-index: 120; }
    #yassin-swarm img {
      position: absolute; width: 72px; height: 72px; object-fit: cover;
      border-radius: 10px; border: 2px solid rgba(255,255,255,0.6);
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      animation: yassin-bob 3.2s ease-in-out infinite;
    }
    @keyframes yassin-bob {
      0%, 100% { transform: translateY(0) rotate(var(--yr, 0deg)); }
      50% { transform: translateY(-12px) rotate(var(--yr, 0deg)); }
    }
  `;
  document.head.appendChild(style);

  // The swarm: yassins pinned around the viewport edges (never centre-bottom,
  // where the hotbar lives). Each gets its own tilt and bob phase.
  const swarm = document.createElement('div');
  swarm.id = 'yassin-swarm';
  const spots = [
    ['4%', '3%'], ['4%', '26%'], ['4%', '52%'], ['4%', '78%'],
    ['88%', '3%'], ['88%', '26%'], ['88%', '52%'], ['88%', '78%'],
    ['2%', '40%', true], ['2%', '58%', true],
    ['20%', '2%', true], ['70%', '2%', true]
  ];
  for (let i = 0; i < spots.length; i++) {
    const img = document.createElement('img');
    img.src = yassinUrl;
    img.alt = '';
    const [a, b, sideTop] = spots[i];
    if (sideTop) { img.style.top = a; img.style.left = b; }
    else { img.style.left = a; img.style.top = b; }
    img.style.setProperty('--yr', `${(i % 2 ? 1 : -1) * (6 + (i * 3) % 14)}deg`);
    img.style.animationDelay = `${(i * 0.4) % 3.2}s`;
    swarm.appendChild(img);
  }
  document.body.appendChild(swarm);
  retitleYassin();
}

/** Rename the game to YassinCraft (tab title + any splash title on screen). */
export function retitleYassin() {
  if (typeof document === 'undefined') return;
  document.title = 'YassinCraft';
  for (const el of document.querySelectorAll('.splash-title')) {
    el.innerHTML = 'YASSIN<span>CRAFT</span>';
  }
}

/**
 * Replace the 3D sky with the photo so it surrounds the player in-world.
 * @param {THREE.Scene} scene
 * @param {() => void} [onReady] called once the texture has loaded
 */
export function applyYassinScene(scene, onReady) {
  const tex = new THREE.TextureLoader().load(yassinUrl, () => onReady && onReady());
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
  if (scene.fog) scene.fog = null; // let the face show, unfogged
  scene.userData.yassin = true;
}

export const YASSIN_IMAGE = yassinUrl;
