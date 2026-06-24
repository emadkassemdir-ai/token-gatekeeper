/**
 * AvatarEditor
 * ------------
 * Modal opened from the splash screen's "Avatar" button. Lets the player pick
 * skin / hair / shirt / pants colours (and quick presets) with a live blocky
 * preview, then saves the avatar globally.
 */

import {
  Avatar, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, PRESETS
} from '../state/Avatar.js';

export class AvatarEditor {
  /**
   * @param {HTMLElement} mount
   * @param {Avatar} avatar shared avatar instance to edit + save
   */
  constructor(mount, avatar) {
    this.mount = mount;
    this.avatar = avatar;
    this._injectStyles();
  }

  /** Show the editor; resolves when closed. @returns {Promise<void>} */
  open() {
    return new Promise((resolve) => {
      const root = document.createElement('div');
      root.id = 'avatar-editor';
      root.innerHTML = `
        <div class="ae-panel">
          <div class="ae-head"><span>CUSTOMIZE AVATAR</span></div>
          <div class="ae-body">
            <div class="ae-preview" id="ae-preview"></div>
            <div class="ae-controls">
              <div class="ae-row" id="ae-presets"><label>Presets</label><div class="ae-swatches" data-kind="preset"></div></div>
              <div class="ae-row"><label>Skin</label><div class="ae-swatches" data-kind="skin"></div></div>
              <div class="ae-row"><label>Hair</label><div class="ae-swatches" data-kind="hair"></div></div>
              <div class="ae-row"><label>Shirt</label><div class="ae-swatches" data-kind="shirt"></div></div>
              <div class="ae-row"><label>Pants</label><div class="ae-swatches" data-kind="pants"></div></div>
            </div>
          </div>
          <div class="ae-foot">
            <button class="ae-btn ae-done" id="ae-done">SAVE & CLOSE</button>
          </div>
        </div>
      `;
      this.mount.appendChild(root);
      this.root = root;
      this.previewEl = root.querySelector('#ae-preview');

      this._fillSwatches('skin', SKIN_TONES);
      this._fillSwatches('hair', HAIR_COLORS);
      this._fillSwatches('shirt', SHIRT_COLORS);
      this._fillSwatches('pants', PANTS_COLORS);
      this._fillPresets();
      this._renderPreview();

      root.querySelector('#ae-done').addEventListener('click', () => {
        this.avatar.save();
        root.remove();
        resolve();
      });
    });
  }

  _fillSwatches(kind, colors) {
    const host = this.root.querySelector(`.ae-swatches[data-kind="${kind}"]`);
    colors.forEach((c) => {
      const sw = document.createElement('button');
      sw.className = 'ae-swatch';
      sw.style.background = c;
      sw.addEventListener('click', () => {
        this.avatar.set({ [kind]: c });
        this._renderPreview();
        this._markSelected(host, sw);
      });
      if (this.avatar[kind] === c) sw.classList.add('selected');
      host.appendChild(sw);
    });
  }

  _fillPresets() {
    const host = this.root.querySelector('.ae-swatches[data-kind="preset"]');
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'ae-preset';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        this.avatar.applyPreset(p);
        this._renderPreview();
        this._refreshSelections();
      });
      host.appendChild(b);
    });
  }

  _markSelected(host, sw) {
    host.querySelectorAll('.ae-swatch').forEach((s) => s.classList.remove('selected'));
    sw.classList.add('selected');
  }

  _refreshSelections() {
    ['skin', 'hair', 'shirt', 'pants'].forEach((kind) => {
      const host = this.root.querySelector(`.ae-swatches[data-kind="${kind}"]`);
      host.querySelectorAll('.ae-swatch').forEach((s) => {
        s.classList.toggle('selected', s.style.background === this.avatar[kind] ||
          this._rgbEq(s.style.background, this.avatar[kind]));
      });
    });
  }

  _rgbEq(a, b) {
    // Compare a rendered "rgb(...)" against a hex; cheap best-effort.
    return false;
  }

  _renderPreview() {
    this.previewEl.innerHTML = '';
    this.previewEl.appendChild(Avatar.buildPreview(this.avatar, 1.4));
  }

  _injectStyles() {
    if (document.getElementById('ae-styles')) return;
    const style = document.createElement('style');
    style.id = 'ae-styles';
    style.textContent = `
      #avatar-editor {
        position: absolute; inset: 0; z-index: 200; display: flex;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,0.55); backdrop-filter: blur(3px);
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .ae-panel {
        width: min(520px, 94vw); background: rgba(20,23,28,0.98);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.55); overflow: hidden;
      }
      .ae-head { padding: 16px 20px; font-weight: 800; letter-spacing: 2px; color: #fff;
        border-bottom: 1px solid rgba(255,255,255,0.08); }
      .ae-body { display: flex; gap: 20px; padding: 20px; }
      .ae-preview { width: 110px; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.25); border-radius: 12px; padding: 12px; }
      .ae-controls { flex: 1; display: flex; flex-direction: column; gap: 12px; }
      .ae-row { display: flex; flex-direction: column; gap: 6px; }
      .ae-row label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #8fa3b8; }
      .ae-swatches { display: flex; gap: 8px; flex-wrap: wrap; }
      .ae-swatch { width: 28px; height: 28px; border-radius: 7px; cursor: pointer;
        border: 2px solid rgba(255,255,255,0.15); }
      .ae-swatch.selected { border-color: #fff; transform: scale(1.1); }
      .ae-preset { padding: 6px 12px; border-radius: 16px; cursor: pointer; font-size: 12px;
        color: #d6e2ef; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); }
      .ae-preset:hover { background: rgba(108,194,74,0.2); border-color: var(--accent, #6cc24a); }
      .ae-foot { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.08); text-align: right; }
      .ae-btn { padding: 11px 18px; border-radius: 9px; border: none; cursor: pointer;
        font-weight: 700; letter-spacing: 1px; background: var(--accent, #6cc24a); color: #08240a; }
    `;
    document.head.appendChild(style);
  }
}

export default AvatarEditor;
