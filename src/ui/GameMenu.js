/**
 * GameMenu
 * --------
 * The introductory splash screen. Collects and validates a username before the
 * WebGL canvas is ever created, then hands the validated value back to the
 * bootstrap via a Promise. Also surfaces previously saved profiles for quick
 * resume.
 */

import { PlayerProfile } from '../state/PlayerProfile.js';

export class GameMenu {
  /** @param {HTMLElement} mountPoint */
  constructor(mountPoint) {
    this.mount = mountPoint;
    this.root = null;
    this._resolve = null;
  }

  /**
   * Render the splash screen and resolve with a sanitised username once the
   * player presses Play with a valid entry.
   * @returns {Promise<string>}
   */
  show() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._render();
    });
  }

  _render() {
    const root = document.createElement('div');
    root.id = 'splash';
    root.innerHTML = this._template();
    this._injectStyles();
    this.mount.appendChild(root);
    this.root = root;

    const input = root.querySelector('#username-input');
    const button = root.querySelector('#play-button');
    const error = root.querySelector('#username-error');
    const saved = root.querySelector('#saved-profiles');

    // Populate quick-resume chips for any existing saves.
    const profiles = PlayerProfile.listSavedProfiles();
    if (profiles.length) {
      saved.innerHTML =
        '<span class="saved-label">Resume:</span> ' +
        profiles
          .map((p) => `<button class="chip" data-name="${this._escape(p)}">${this._escape(p)}</button>`)
          .join('');
      saved.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          input.value = chip.dataset.name;
          this._submit(input, error);
        });
      });
    }

    const validateLive = () => {
      const res = PlayerProfile.validateUsername(input.value);
      if (res.valid) {
        error.textContent = '';
        button.disabled = false;
      } else {
        error.textContent = input.value.length ? res.reason : '';
        button.disabled = true;
      }
    };

    input.addEventListener('input', validateLive);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submit(input, error);
    });
    button.addEventListener('click', () => this._submit(input, error));

    validateLive();
    setTimeout(() => input.focus(), 50);
  }

  _submit(input, error) {
    const res = PlayerProfile.validateUsername(input.value);
    if (!res.valid) {
      error.textContent = res.reason;
      return;
    }
    this._teardown();
    this._resolve?.(res.value);
  }

  _teardown() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
  }

  _template() {
    return `
      <div class="splash-card">
        <h1 class="splash-title">VOXEL<span>CRAFT</span></h1>
        <p class="splash-tag">An infinite block sandbox engine</p>
        <label class="field-label" for="username-input">Enter your username</label>
        <input id="username-input" type="text" autocomplete="off" spellcheck="false"
               maxlength="24" placeholder="e.g. Steve" />
        <div id="username-error" class="field-error"></div>
        <button id="play-button" disabled>PLAY</button>
        <div id="saved-profiles" class="saved-profiles"></div>
        <div class="controls-hint">
          <strong>Controls</strong>
          WASD move · Mouse look · Space jump · F fly · 1-9 hotbar ·
          Left-click break · Right-click place
        </div>
      </div>
    `;
  }

  _injectStyles() {
    if (document.getElementById('splash-styles')) return;
    const style = document.createElement('style');
    style.id = 'splash-styles';
    style.textContent = `
      #splash {
        position: absolute; inset: 0; z-index: 100;
        display: flex; align-items: center; justify-content: center;
        background:
          radial-gradient(1200px 600px at 50% -10%, #2b6cb0 0%, transparent 60%),
          linear-gradient(160deg, #0b1220 0%, #131a26 60%, #0a0c10 100%);
      }
      .splash-card {
        width: min(440px, 90vw);
        padding: 36px 34px 28px;
        background: var(--panel, rgba(18,20,24,0.92));
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        box-shadow: 0 24px 70px rgba(0,0,0,0.55);
        text-align: center;
        backdrop-filter: blur(6px);
      }
      .splash-title {
        font-size: 40px; letter-spacing: 4px; font-weight: 800;
        color: #fff; margin-bottom: 4px;
      }
      .splash-title span { color: var(--accent, #6cc24a); }
      .splash-tag { color: #9fb0c3; font-size: 13px; margin-bottom: 26px; }
      .field-label {
        display: block; text-align: left; font-size: 12px;
        text-transform: uppercase; letter-spacing: 1px;
        color: #8aa0b6; margin-bottom: 8px;
      }
      #username-input {
        width: 100%; padding: 13px 14px; font-size: 16px;
        color: #fff; background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 9px;
        outline: none; transition: border-color 0.15s, box-shadow 0.15s;
      }
      #username-input:focus {
        border-color: var(--accent, #6cc24a);
        box-shadow: 0 0 0 3px rgba(108,194,74,0.18);
      }
      .field-error { color: #ff7a7a; font-size: 12px; min-height: 16px;
        text-align: left; margin: 6px 2px 0; }
      #play-button {
        width: 100%; margin-top: 14px; padding: 13px;
        font-size: 16px; font-weight: 700; letter-spacing: 2px;
        color: #08240a; background: var(--accent, #6cc24a);
        border: none; border-radius: 9px; cursor: pointer;
        transition: filter 0.15s, transform 0.05s;
      }
      #play-button:hover:not(:disabled) { filter: brightness(1.08); }
      #play-button:active:not(:disabled) { transform: translateY(1px); }
      #play-button:disabled { background: #3a4452; color: #788596; cursor: not-allowed; }
      .saved-profiles { margin-top: 16px; font-size: 12px; color: #8aa0b6;
        display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; }
      .saved-label { opacity: 0.7; }
      .chip {
        padding: 5px 11px; border-radius: 20px; cursor: pointer;
        color: #d6e2ef; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12); font-size: 12px;
      }
      .chip:hover { background: rgba(108,194,74,0.18); border-color: var(--accent,#6cc24a); }
      .controls-hint {
        margin-top: 24px; padding-top: 18px; font-size: 11.5px; line-height: 1.7;
        color: #7e90a4; border-top: 1px solid rgba(255,255,255,0.07);
      }
      .controls-hint strong { display: block; color: #aebccd; margin-bottom: 4px;
        letter-spacing: 1px; text-transform: uppercase; font-size: 10px; }
    `;
    document.head.appendChild(style);
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
}

export default GameMenu;
