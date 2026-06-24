/**
 * TouchControls
 * -------------
 * On-screen controls for touch devices (phones / tablets), since the desktop
 * scheme relies on PointerLock + mouse buttons + a physical keyboard that don't
 * exist on a touchscreen. Provides:
 *
 *   - a left analog joystick driving PhysicsEngine.setMoveInput()
 *   - a full-screen drag layer behind the HUD for look (PhysicsEngine.rotate)
 *   - action buttons: Jump (hold), Fly (toggle), Down (hold, fly descend),
 *     Break (hold to mine) and Place (tap)
 *
 * Multi-touch works because a touch keeps targeting the element it began on, so
 * the joystick (left) and look drag (right) can run simultaneously.
 *
 * @see PhysicsEngine#setMoveInput @see PhysicsEngine#rotate
 * @see InteractionEngine#setBreaking @see InteractionEngine#requestPlace
 */
export class TouchControls {
  /**
   * @param {HTMLElement} mount
   * @param {import('../player/PhysicsEngine.js').PhysicsEngine} physics
   * @param {import('../player/InteractionEngine.js').InteractionEngine} interaction
   */
  constructor(mount, physics, interaction) {
    this.mount = mount;
    this.physics = physics;
    this.interaction = interaction;

    this._lookId = null; // active look-drag touch identifier
    this._lookX = 0;
    this._lookY = 0;

    this._joyId = null; // active joystick touch identifier
    this._joyR = 56; // joystick max travel radius (px)

    this.physics.touch = true; // tell physics to skip PointerLock

    this._injectStyles();
    this._build();
  }

  /** @returns {boolean} whether the current device is touch-capable. */
  static isTouchDevice() {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
  }

  /* -------------------------------- build -------------------------------- */

  _build() {
    // Full-screen look layer (sits below the HUD so the hotbar stays tappable).
    const look = document.createElement('div');
    look.className = 'tc-look';
    look.addEventListener('touchstart', (e) => this._onLookStart(e), { passive: false });
    look.addEventListener('touchmove', (e) => this._onLookMove(e), { passive: false });
    look.addEventListener('touchend', (e) => this._onLookEnd(e), { passive: false });
    look.addEventListener('touchcancel', (e) => this._onLookEnd(e), { passive: false });
    this.mount.appendChild(look);
    this.lookEl = look;

    // Joystick (bottom-left).
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

    // Action buttons (bottom-right cluster).
    const actions = document.createElement('div');
    actions.className = 'tc-actions';
    actions.appendChild(this._makeHoldButton('tc-break', '⛏', 'BREAK',
      (d) => this.interaction.setBreaking(d)));
    actions.appendChild(this._makeTapButton('tc-place', '▥', 'PLACE',
      () => this.interaction.requestPlace()));
    this.mount.appendChild(actions);

    // Movement buttons (above the joystick / right of it).
    const moveBtns = document.createElement('div');
    moveBtns.className = 'tc-move-btns';
    moveBtns.appendChild(this._makeTapButton('tc-fly', '✈', 'FLY',
      () => this.physics.toggleFly()));
    moveBtns.appendChild(this._makeHoldButton('tc-jump', '⤒', 'JUMP',
      (d) => this.physics.setJump(d)));
    moveBtns.appendChild(this._makeHoldButton('tc-down', '⤓', 'DOWN',
      (d) => this.physics.setDescend(d)));
    this.mount.appendChild(moveBtns);

    this._els = [look, joyBase, actions, moveBtns];
  }

  /** A button that reports pressed/released (hold semantics). */
  _makeHoldButton(cls, glyph, label, onChange) {
    const btn = this._makeButtonEl(cls, glyph, label);
    const set = (down) => (e) => {
      e.preventDefault();
      btn.classList.toggle('active', down);
      onChange(down);
    };
    btn.addEventListener('touchstart', set(true), { passive: false });
    btn.addEventListener('touchend', set(false), { passive: false });
    btn.addEventListener('touchcancel', set(false), { passive: false });
    return btn;
  }

  /** A button that fires once per tap. */
  _makeTapButton(cls, glyph, label, onTap) {
    const btn = this._makeButtonEl(cls, glyph, label);
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btn.classList.add('active');
      onTap();
    }, { passive: false });
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

  /* ------------------------------ look drag ------------------------------ */

  _onLookStart(e) {
    e.preventDefault();
    if (this._lookId !== null) return;
    const t = e.changedTouches[0];
    this._lookId = t.identifier;
    this._lookX = t.clientX;
    this._lookY = t.clientY;
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
  }

  _onLookEnd(e) {
    if (this._lookId === null) return;
    if (this._findTouch(e.changedTouches, this._lookId)) {
      this._lookId = null;
    }
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
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Up on screen (negative dy) means forward (positive z).
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
      .tc-look {
        position: absolute; inset: 0; z-index: 35;
        touch-action: none; -webkit-tap-highlight-color: transparent;
      }
      .tc-joy-base, .tc-actions, .tc-move-btns, .tc-btn {
        touch-action: none; -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      .tc-joy-base {
        position: absolute; left: 26px; bottom: 26px; z-index: 55;
        width: 132px; height: 132px; border-radius: 50%;
        background: rgba(255,255,255,0.06);
        border: 2px solid rgba(255,255,255,0.18);
        box-shadow: inset 0 0 24px rgba(0,0,0,0.3);
      }
      .tc-joy-knob {
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: 58px; height: 58px; border-radius: 50%;
        background: rgba(255,255,255,0.22);
        border: 2px solid rgba(255,255,255,0.4);
      }
      .tc-actions {
        position: absolute; right: 24px; bottom: 26px; z-index: 55;
        display: flex; gap: 14px; align-items: flex-end;
      }
      .tc-move-btns {
        position: absolute; right: 24px; bottom: 150px; z-index: 55;
        display: flex; gap: 12px; align-items: flex-end;
      }
      .tc-btn {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        width: 74px; height: 74px; border-radius: 50%;
        background: rgba(10,12,16,0.5);
        border: 2px solid rgba(255,255,255,0.18);
        color: #eaf2fb;
      }
      .tc-btn.active {
        background: rgba(108,194,74,0.35);
        border-color: var(--accent, #6cc24a);
        transform: scale(0.94);
      }
      .tc-btn.tc-break, .tc-btn.tc-place { width: 82px; height: 82px; }
      .tc-btn.tc-fly, .tc-btn.tc-down { width: 60px; height: 60px; }
      .tc-glyph { font-size: 26px; line-height: 1; }
      .tc-btn.tc-fly .tc-glyph, .tc-btn.tc-down .tc-glyph { font-size: 20px; }
      .tc-label { font-size: 9px; letter-spacing: 1px; margin-top: 3px; opacity: 0.85; }
      .tc-btn.tc-fly .tc-label, .tc-btn.tc-down .tc-label { display: none; }

      @media (max-width: 560px) {
        .tc-joy-base { width: 112px; height: 112px; left: 18px; bottom: 18px; }
        .tc-actions { right: 16px; bottom: 18px; gap: 10px; }
        .tc-move-btns { right: 16px; bottom: 120px; }
        .tc-btn { width: 64px; height: 64px; }
        .tc-btn.tc-break, .tc-btn.tc-place { width: 70px; height: 70px; }
      }
    `;
    document.head.appendChild(style);
  }
}

export default TouchControls;
