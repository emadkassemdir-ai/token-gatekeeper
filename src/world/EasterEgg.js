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
