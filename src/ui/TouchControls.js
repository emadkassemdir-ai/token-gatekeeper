/**
 * TouchControls
 * -------------
 * On-screen controls for touch devices. Provides:
 *
 *   - a left analog joystick -> PhysicsEngine.setMoveInput()
 *   - a full-screen layer behind the HUD that interprets gestures:
 *       * drag            -> look (PhysicsEngine.rotate)
 *       * long-press hold -> mine the targeted block (per-block timing) /
 *                            attack a mob in front
 *       * quick tap       -> place the selected block
 *   - buttons: Jump (hold), Fly (toggle), Down (hold, fly descend),
 *     Craft (open crafting), Chat (open chat)
 *
 * Multi-touch works because a touch keeps targeting its origin element, so the
 * joystick and the look/break gesture run simultaneously.
 */
export class TouchControls {
  /**
   * @param {HTMLElement} mount
   * @param {import('../player/PhysicsEngine.js').PhysicsEngine} physics
   * @param {import('../player/InteractionEngine.js').InteractionEngine} interaction
   * @param {Object} [handlers]
   * @param {() => void} [handlers.openCraft]
   * @param {() => void} [handlers.openChat]
   */
  constructor(mount, physics, interaction, handlers = {}) {
    this.mount = mount;
    this.physics = physics;
    this.interaction = interaction;
    this.handlers = handlers;

    this._lookId = null;
    this._lookX = 0; this._lookY = 0;
    this._startX = 0; this._startY = 0; this._startT = 0;
    this._moved = false;
    this._breaking = false;
    this._lpTimer = null;
    this._lpDelay = 220;   // ms hold before mining starts
    this._moveThresh = 12; // px of travel that turns a hold into a look-drag

    this._joyId = null;
    this._joyR = 46; // smaller travel radius to match the shrunk joystick base

    this.physics.touch = true;
    this._injectStyles();
    this._build();
  }

  static isTouchDevice() {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
  }

  /* -------------------------------- build -------------------------------- */

  _build() {
    const look = document.createElement('div');
    look.className = 'tc-look';
    look.addEventListener('touchstart', (e) => this._onLookStart(e), { passive: false });
    look.addEventListener('touchmove', (e) => this._onLookMove(e), { passive: false });
    look.addEventListener('touchend', (e) => this._onLookEnd(e), { passive: false });
    look.addEventListener('touchcancel', (e) => this._onLookEnd(e), { passive: false });
    this.mount.appendChild(look);
    this.lookEl = look;

    // Joystick.
    const joyBase = document.createElement('div');
    joyBase.className = 'tc-joy-base';
    const joyKnob = document.createElement('div');
    joyKnob.className = 'tc-joy-knob';
    joyBase.appendChild(joyKnob);
    joyBase.addEventListener('touchstart', (e) => this._onJoyStart(e), { passive: false });
    joyBase.addEventListener('touchmove', (e) => this._onJoyMove(e), { passive: false });
    joyBase.addEventListener('touchend', (e) => this._onJoyEnd(e), { passive: false });
    joyBase.addEventListener('touchcancel', (e) => this._onJoyEnd(e), { passive: false });
    this.mount.appendChild(joyBase);
    this.joyBase = joyBase;
    this.joyKnob = joyKnob;

    // Movement buttons (bottom-right).
    const moveBtns = document.createElement('div');
    moveBtns.className = 'tc-move-btns';
    moveBtns.appendChild(this._makeTapButton('tc-fly', '✈', 'FLY', () => this.physics.toggleFly()));
    moveBtns.appendChild(this._makeHoldButton('tc-jump', '⤒', 'JUMP', (d) => this.physics.setJump(d)));
    moveBtns.appendChild(this._makeHoldButton('tc-down', '⤓', 'DOWN', (d) => this.physics.setDescend(d)));
    this.mount.appendChild(moveBtns);

    // Utility buttons (right side, above movement).
    const utilBtns = document.createElement('div');
    utilBtns.className = 'tc-util-btns';
    utilBtns.appendChild(this._makeTapButton('tc-bag', '🎒', 'BAG', () => this.handlers.openInventory?.()));
    utilBtns.appendChild(this._makeTapButton('tc-craft', '🛠', 'CRAFT', () => this.handlers.openCraft?.()));
    utilBtns.appendChild(this._makeTapButton('tc-smelt', '🔥', 'SMELT', () => this.handlers.openSmelt?.()));
    utilBtns.appendChild(this._makeTapButton('tc-chat', '💬', 'CHAT', () => this.handlers.openChat?.()));
    this.mount.appendChild(utilBtns);

    // A hint shown briefly.
    const hint = document.createElement('div');
    hint.className = 'tc-hint';
    hint.textContent = 'Drag to look · Hold to mine · Tap to place';
    this.mount.appendChild(hint);
    setTimeout(() => hint.classList.add('fade'), 4000);

    this._els = [look, joyBase, moveBtns, utilBtns, hint];
  }

  _makeHoldButton(cls, glyph, label, onChange) {
    const btn = this._makeButtonEl(cls, glyph, label);
    const set = (down) => (e) => { e.preventDefault(); btn.classList.toggle('active', down); onChange(down); };
    btn.addEventListener('touchstart', set(true), { passive: false });
    btn.addEventListener('touchend', set(false), { passive: false });
    btn.addEventListener('touchcancel', set(false), { passive: false });
    return btn;
  }

  _makeTapButton(cls, glyph, label, onTap) {
    const btn = this._makeButtonEl(cls, glyph, label);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); btn.classList.add('active'); onTap(); }, { passive: false });
    const clear = (e) => { e.preventDefault(); btn.classList.remove('active'); };
    btn.addEventListener('touchend', clear, { passive: false });
    btn.addEventListener('touchcancel', clear, { passive: false });
    return btn;
  }

  _makeButtonEl(cls, glyph, label) {
    const btn = document.createElement('div');
    btn.className = 'tc-btn ' + cls;
    btn.innerHTML = `<span class="tc-glyph">${glyph}</span><span class="tc-label">${label}</span>`;
    return btn;
  }

  /* ----------------------- look / break / place ------------------------- */

  _onLookStart(e) {
    e.preventDefault();
    if (this._lookId !== null) return;
    const t = e.changedTouches[0];
    this._lookId = t.identifier;
    this._lookX = this._startX = t.clientX;
    this._lookY = this._startY = t.clientY;
    this._startT = performance.now();
    this._moved = false;
    this._breaking = false;
    // Schedule a long-press: if the finger is still down and hasn't wandered,
    // start mining the block under the crosshair.
    this._lpTimer = setTimeout(() => {
      if (this._lookId !== null && !this._moved) {
        this._breaking = true;
        this.interaction.setBreaking(true);
      }
    }, this._lpDelay);
  }

  _onLookMove(e) {
    if (this._lookId === null) return;
    const t = this._findTouch(e.changedTouches, this._lookId);
    if (!t) return;
    e.preventDefault();
    const dx = t.clientX - this._lookX;
    const dy = t.clientY - this._lookY;
    this._lookX = t.clientX;
    this._lookY = t.clientY;
    this.physics.rotate(dx, dy);

    if (!this._moved) {
      const travel = Math.hypot(t.clientX - this._startX, t.clientY - this._startY);
      if (travel > this._moveThresh) {
        this._moved = true;
        // A drag is a look gesture — cancel the pending mine.
        if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
      }
    }
  }

  _onLookEnd(e) {
    if (this._lookId === null) return;
    if (!this._findTouch(e.changedTouches, this._lookId)) return;

    if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }

    if (this._breaking) {
      this.interaction.setBreaking(false);
    } else if (!this._moved && performance.now() - this._startT < this._lpDelay) {
      // Short, stationary tap -> place a block.
      this.interaction.requestPlace();
    }

    this._lookId = null;
    this._breaking = false;
    this._moved = false;
  }

  /* ------------------------------ joystick ------------------------------- */

  _onJoyStart(e) {
    e.preventDefault();
    if (this._joyId !== null) return;
    const t = e.changedTouches[0];
    this._joyId = t.identifier;
    const r = this.joyBase.getBoundingClientRect();
    this._joyCx = r.left + r.width / 2;
    this._joyCy = r.top + r.height / 2;
    this._updateJoy(t.clientX, t.clientY);
  }

  _onJoyMove(e) {
    if (this._joyId === null) return;
    const t = this._findTouch(e.changedTouches, this._joyId);
    if (!t) return;
    e.preventDefault();
    this._updateJoy(t.clientX, t.clientY);
  }

  _onJoyEnd(e) {
    if (this._joyId === null) return;
    if (this._findTouch(e.changedTouches, this._joyId)) {
      this._joyId = null;
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      this.physics.setMoveInput(0, 0);
    }
  }

  _updateJoy(clientX, clientY) {
    let dx = clientX - this._joyCx;
    let dy = clientY - this._joyCy;
    const dist = Math.hypot(dx, dy);
    const max = this._joyR;
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.physics.setMoveInput(dx / max, -dy / max);
  }

  /* ------------------------------- helpers ------------------------------- */

  _findTouch(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  }

  dispose() {
    if (this._lpTimer) clearTimeout(this._lpTimer);
    this.physics.setMoveInput(0, 0);
    this.physics.setJump(false);
    this.physics.setDescend(false);
    this.interaction.setBreaking(false);
    for (const el of this._els) el.remove();
  }

  _injectStyles() {
    if (document.getElementById('tc-styles')) return;
    const style = document.createElement('style');
    style.id = 'tc-styles';
    style.textContent = `
      .tc-look { position: absolute; inset: 0; z-index: 35;
        touch-action: none; -webkit-tap-highlight-color: transparent; }
      .tc-joy-base, .tc-move-btns, .tc-util-btns, .tc-btn {
        touch-action: none; -webkit-tap-highlight-color: transparent; user-select: none; }
      .tc-joy-base {
        /* Shrunk, and nudged up + right so it clears the home indicator. */
        position: absolute; left: calc(44px + var(--safe-left, 0px));
        bottom: calc(48px + var(--safe-bottom, 0px)); z-index: 55;
        width: 108px; height: 108px; border-radius: 50%;
        background: rgba(255,255,255,0.06); border: 2px solid rgba(255,255,255,0.18);
        box-shadow: inset 0 0 24px rgba(0,0,0,0.3); }
      .tc-joy-knob {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: 50px; height: 50px; border-radius: 50%;
        background: rgba(255,255,255,0.22); border: 2px solid rgba(255,255,255,0.4); }
      .tc-move-btns {
        position: absolute; right: calc(24px + var(--safe-right, 0px));
        bottom: calc(44px + var(--safe-bottom, 0px)); z-index: 55;
        display: flex; gap: 12px; align-items: flex-end; }
      .tc-util-btns {
        position: absolute; right: calc(24px + var(--safe-right, 0px));
        bottom: calc(134px + var(--safe-bottom, 0px)); z-index: 55;
        display: flex; gap: 12px; align-items: flex-end; }
      .tc-btn {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        width: 66px; height: 66px; border-radius: 50%;
        background: rgba(10,12,16,0.5); border: 2px solid rgba(255,255,255,0.18); color: #eaf2fb; }
      .tc-btn.active { background: rgba(108,194,74,0.35); border-color: var(--accent, #6cc24a); transform: scale(0.94); }
      .tc-btn.tc-jump { width: 78px; height: 78px; }
      .tc-glyph { font-size: 24px; line-height: 1; }
      .tc-label { font-size: 8.5px; letter-spacing: 1px; margin-top: 3px; opacity: 0.85; }
      .tc-hint {
        position: absolute; top: 64px; left: 50%; transform: translateX(-50%); z-index: 55;
        background: rgba(10,12,16,0.6); color: #cfe0f0; font-size: 12px;
        padding: 6px 12px; border-radius: 8px; transition: opacity 0.6s ease;
        font-family: 'Segoe UI', system-ui, sans-serif; pointer-events: none; }
      .tc-hint.fade { opacity: 0; }

      @media (max-width: 560px) {
        .tc-joy-base { width: 100px; height: 100px;
          left: calc(28px + var(--safe-left, 0px));
          bottom: calc(40px + var(--safe-bottom, 0px)); }
        .tc-move-btns { right: calc(16px + var(--safe-right, 0px));
          bottom: calc(36px + var(--safe-bottom, 0px)); gap: 10px; }
        .tc-util-btns { right: calc(16px + var(--safe-right, 0px));
          bottom: calc(118px + var(--safe-bottom, 0px)); }
        .tc-btn { width: 58px; height: 58px; }
        .tc-btn.tc-jump { width: 68px; height: 68px; }
      }
    `;
    document.head.appendChild(style);
  }
}

export default TouchControls;
