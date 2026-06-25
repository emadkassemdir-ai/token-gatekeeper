/**
 * MultiplayerMenu
 * ---------------
 * Serverless copy-paste signalling UI (toggle with 'M' or the touch button).
 *
 *   Host:  Create Invite -> share the code -> paste the guest's reply -> Connect.
 *   Guest: paste the host's invite -> Generate Reply -> send the reply back.
 *
 * Up to 4 players. The actual transport lives in NetworkManager; this is just
 * the human-friendly handshake.
 */

export class MultiplayerMenu {
  /**
   * @param {HTMLElement} mount
   * @param {import('../net/NetworkManager.js').NetworkManager} net
   * @param {Object} [hooks]
   */
  constructor(mount, net, hooks = {}) {
    this.mount = mount;
    this.net = net;
    this.hooks = hooks;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();

    net.onStatus = (t) => this.setStatus(t);
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'mp';
    root.innerHTML = `
      <div class="mp-panel">
        <div class="mp-head"><span>MULTIPLAYER (up to 4)</span><button id="mp-close" class="mp-close">✕</button></div>
        <div class="mp-tabs">
          <button id="mp-tab-host" class="mp-tab active">Host</button>
          <button id="mp-tab-join" class="mp-tab">Join</button>
        </div>
        <div id="mp-host" class="mp-body">
          <p class="mp-step">1. Create an invite and send the code to a friend.</p>
          <button id="mp-create" class="mp-btn">Create Invite</button>
          <textarea id="mp-offer" class="mp-code" readonly placeholder="invite code appears here…"></textarea>
          <p class="mp-step">2. Paste your friend's reply and connect.</p>
          <textarea id="mp-reply-in" class="mp-code" placeholder="paste reply code…"></textarea>
          <button id="mp-accept" class="mp-btn">Connect Guest</button>
        </div>
        <div id="mp-join" class="mp-body" style="display:none">
          <p class="mp-step">1. Paste the host's invite code.</p>
          <textarea id="mp-invite-in" class="mp-code" placeholder="paste invite code…"></textarea>
          <button id="mp-reply" class="mp-btn">Generate Reply</button>
          <p class="mp-step">2. Send this reply code back to the host.</p>
          <textarea id="mp-reply-out" class="mp-code" readonly placeholder="reply code appears here…"></textarea>
        </div>
        <div id="mp-status" class="mp-status">Not connected.</div>
      </div>`;
    this.mount.appendChild(root);
    this.root = root;

    root.querySelector('#mp-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });

    const hostBody = root.querySelector('#mp-host');
    const joinBody = root.querySelector('#mp-join');
    const tabHost = root.querySelector('#mp-tab-host');
    const tabJoin = root.querySelector('#mp-tab-join');
    tabHost.addEventListener('click', () => {
      tabHost.classList.add('active'); tabJoin.classList.remove('active');
      hostBody.style.display = ''; joinBody.style.display = 'none';
    });
    tabJoin.addEventListener('click', () => {
      tabJoin.classList.add('active'); tabHost.classList.remove('active');
      joinBody.style.display = ''; hostBody.style.display = 'none';
    });

    root.querySelector('#mp-create').addEventListener('click', async () => {
      try {
        this.setStatus('Creating invite…');
        const code = await this.net.createInvite();
        root.querySelector('#mp-offer').value = code;
        root.querySelector('#mp-offer').select();
        this.setStatus('Invite ready — copy it to a friend.');
      } catch (err) { this.setStatus('Error: ' + err.message); }
    });
    root.querySelector('#mp-accept').addEventListener('click', async () => {
      try {
        const code = root.querySelector('#mp-reply-in').value.trim();
        if (!code) return this.setStatus('Paste the reply code first.');
        await this.net.acceptReply(code);
        this.setStatus('Connecting to guest…');
      } catch (err) { this.setStatus('Error: ' + err.message); }
    });
    root.querySelector('#mp-reply').addEventListener('click', async () => {
      try {
        const code = root.querySelector('#mp-invite-in').value.trim();
        if (!code) return this.setStatus('Paste the invite code first.');
        this.setStatus('Generating reply…');
        const reply = await this.net.joinWithInvite(code);
        root.querySelector('#mp-reply-out').value = reply;
        root.querySelector('#mp-reply-out').select();
        this.setStatus('Reply ready — send it to the host.');
      } catch (err) { this.setStatus('Error: ' + err.message); }
    });
  }

  setStatus(text) {
    const el = this.root.querySelector('#mp-status');
    if (el) el.textContent = `${text}  ·  Players: ${this.net.playerCount}/4`;
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.code === 'KeyM' && !this._isTyping()) { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.open) this.close();
    };
    document.addEventListener('keydown', this._onKey);
  }

  _isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  toggle() { this.open ? this.close() : this.openMenu(); }
  openMenu() { this.open = true; this.root.classList.add('open'); this.hooks.onOpen?.(); this.setStatus('Ready.'); }
  close() { this.open = false; this.root.classList.remove('open'); this.hooks.onClose?.(); }

  dispose() { document.removeEventListener('keydown', this._onKey); this.root.remove(); }

  _injectStyles() {
    if (document.getElementById('mp-styles')) return;
    const style = document.createElement('style');
    style.id = 'mp-styles';
    style.textContent = `
      #mp { position: absolute; inset: 0; z-index: 92; display: none; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); font-family: 'Segoe UI', system-ui, sans-serif; }
      #mp.open { display: flex; }
      .mp-panel { width: min(480px, 94vw); max-height: 88vh; overflow-y: auto;
        background: rgba(20,23,28,0.98); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.55); }
      .mp-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px;
        font-weight: 800; letter-spacing: 1px; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .mp-close { background: none; border: none; color: #9fb0c3; font-size: 18px; cursor: pointer; }
      .mp-tabs { display: flex; gap: 8px; padding: 12px 18px 0; }
      .mp-tab { flex: 1; padding: 9px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 700;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #cdd9e6; }
      .mp-tab.active { background: var(--accent, #6cc24a); color: #08240a; border-color: transparent; }
      .mp-body { padding: 14px 18px; }
      .mp-step { font-size: 12px; color: #9fb0c3; margin: 8px 0 6px; }
      .mp-code { width: 100%; height: 70px; resize: vertical; font-size: 10px; font-family: monospace;
        color: #cfe0f0; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px; padding: 8px; word-break: break-all; }
      .mp-btn { margin: 8px 0; padding: 10px 14px; border-radius: 8px; border: none; cursor: pointer;
        background: var(--accent, #6cc24a); color: #08240a; font-weight: 700; }
      .mp-status { padding: 12px 18px; font-size: 12px; color: #8fd0ff; border-top: 1px solid rgba(255,255,255,0.08); }
    `;
    document.head.appendChild(style);
  }
}

export default MultiplayerMenu;
