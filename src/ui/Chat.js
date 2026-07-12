/**
 * Chat
 * ----
 * Message log + input toggled with 'T' (or a touch button). Lines starting with
 * '/' are commands. Three commands are always available (help, seed, pos); the
 * other 22 are OP "cheat" commands gated behind the world's cheats flag — 25
 * total.
 *
 * The host supplies an `api` of engine hooks plus `api.cheats` (boolean).
 */

import { ITEMS } from '../world/ItemTypes.js';

const MOBS = ['zombie', 'creeper', 'cow', 'sheep', 'fish', 'squid'];

export class Chat {
  /**
   * @param {HTMLElement} mount
   * @param {Object} api engine hooks (see main._buildCheatApi)
   */
  constructor(mount, api) {
    this.mount = mount;
    this.api = api;
    this.open = false;
    this._injectStyles();
    this._build();
    this._bindKeys();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'chat';
    root.innerHTML = `
      <div id="chat-log" class="chat-log"></div>
      <form id="chat-form" class="chat-form">
        <input id="chat-input" type="text" autocomplete="off" spellcheck="false"
               maxlength="120" placeholder="Type a message or /command…" />
      </form>`;
    this.mount.appendChild(root);
    this.root = root;
    this.logEl = root.querySelector('#chat-log');
    this.formEl = root.querySelector('#chat-form');
    this.inputEl = root.querySelector('#chat-input');

    this.formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.inputEl.value.trim();
      this.inputEl.value = '';
      if (text) this._handle(text);
      this.close();
    });

    this.system(this.api.cheats
      ? 'Cheats are ON. Type /help for 25 commands.'
      : 'Press T to chat. /help for commands.');
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.code === 'KeyT' && !this.open && !this._isTyping()) { e.preventDefault(); this.openChat(); }
      else if (e.code === 'Escape' && this.open) this.close();
    };
    document.addEventListener('keydown', this._onKey);
  }

  _isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  openChat() {
    this.open = true;
    this.root.classList.add('open');
    this.api.onOpen?.();
    setTimeout(() => this.inputEl.focus(), 0);
  }

  close() {
    this.open = false;
    this.root.classList.remove('open');
    this.inputEl.blur();
    this.api.onClose?.();
  }

  /* ------------------------------ messages ------------------------------- */

  system(t) { this._push(t, 'sys'); }
  error(t) { this._push(t, 'err'); }
  info(t) { this._push(t, 'info'); }

  _push(text, cls = '') {
    const line = document.createElement('div');
    line.className = 'chat-line ' + cls;
    line.textContent = text;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    while (this.logEl.children.length > 80) this.logEl.removeChild(this.logEl.firstChild);
  }

  /* ------------------------------ commands ------------------------------- */

  /**
   * Run a command programmatically (command blocks, mods). Command blocks are
   * op-level per the wiki, so cheats are forced on for the duration.
   * @param {string} text e.g. "/time night"
   */
  execute(text) {
    const t = String(text || '').trim();
    if (!t) return;
    const prev = this.api.cheats;
    this.api.cheats = true;
    try { this._handle(t.startsWith('/') ? t : '/' + t); }
    finally { this.api.cheats = prev; }
  }

  _handle(text) {
    if (!text.startsWith('/')) {
      this._push('<you> ' + text);
      this.api.sendChat?.(text); // relay to multiplayer peers
      return;
    }
    const parts = text.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const a = this.api;

    // Always-available commands.
    if (cmd === 'help') return this._help();
    if (cmd === 'seed') return this.info('World seed: ' + a.seed());
    if (cmd === 'pos') { const p = a.getPos(); return this.info(`X ${p.x.toFixed(1)} Y ${p.y.toFixed(1)} Z ${p.z.toFixed(1)}`); }

    // Everything below requires cheats.
    if (!a.cheats) return this.error('Cheats are disabled for this world.');

    const num = (i, def) => { const n = parseFloat(parts[i]); return Number.isFinite(n) ? n : def; };

    switch (cmd) {
      case 'gamemode': case 'gm': {
        const m = (parts[1] || '').toLowerCase();
        const mode = /^(c|creative|1)$/.test(m) ? 'creative' : /^(s|survival|0)$/.test(m) ? 'survival' : null;
        if (!mode) return this.error('Usage: /gamemode <survival|creative>');
        a.setGameMode(mode); return this.system('Game mode: ' + mode);
      }
      case 'difficulty': case 'diff': {
        const d = (parts[1] || '').toLowerCase();
        if (!a.setDifficulty(d)) return this.error('Usage: /difficulty <peaceful|easy|normal|hard|hardcore>');
        return this.system('Difficulty: ' + d);
      }
      case 'give': {
        const type = parts[1]; const n = parseInt(parts[2] || '1', 10) || 1;
        if (!type || !ITEMS[type]) return this.error('Unknown item. e.g. /give diamond 64');
        return a.give(type, n) ? this.system(`Gave ${n} × ${ITEMS[type].name}`) : this.error('Inventory full.');
      }
      case 'giveall': case 'kit': a.giveKit(); return this.system('Gave a full diamond kit!');
      case 'clear': a.clearInv(); return this.system('Inventory cleared.');
      case 'tp': {
        if (parts.length < 4) return this.error('Usage: /tp <x> <y> <z>');
        a.tp(num(1, 0), num(2, 64), num(3, 0)); return this.system('Teleported.');
      }
      case 'home': a.home(); return this.system('Teleported home.');
      case 'setspawn': a.setSpawn(); return this.system('Spawn point set here.');
      case 'heal': a.heal(); return this.system('Health restored.');
      case 'sethealth': a.setHealth(num(1, 10)); return this.system('Health set.');
      case 'feed': a.feed(); return this.system('Hunger restored.');
      case 'hurt': a.hurt(num(1, 1)); return this.system('Ouch.');
      case 'kill': a.kill(); return;
      case 'god': return this.system('God mode: ' + (a.toggleGod() ? 'ON' : 'OFF'));
      case 'fly': return this.system('Fly: ' + (a.toggleFly() ? 'ON' : 'OFF'));
      case 'speed': a.setSpeed(num(1, 1)); return this.system('Speed x' + num(1, 1));
      case 'noclip': return this.system('Noclip: ' + (a.toggleNoclip() ? 'ON' : 'OFF'));
      case 'reach': a.setReach(num(1, 6)); return this.system('Reach set to ' + num(1, 6));
      case 'time': {
        const v = (parts[1] || '').toLowerCase();
        const map = { day: 0.2, morning: 0.1, noon: 0.25, dusk: 0.5, night: 0.62, midnight: 0.75 };
        const t = v in map ? map[v] : (Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);
        if (t === null) return this.error('Usage: /time <day|noon|night|midnight|0-1>');
        a.setTime(t); return this.system('Time set to ' + v);
      }
      case 'spawn': {
        const kind = (parts[1] || '').toLowerCase(); const n = parseInt(parts[2] || '1', 10) || 1;
        if (!MOBS.includes(kind)) return this.error('Mobs: ' + MOBS.join(', '));
        const ok = a.spawnMob(kind, n); return this.system(`Spawned ${ok} × ${kind}`);
      }
      case 'killall': return this.system('Removed ' + a.killAll() + ' mobs.');
      case 'smite': return a.smite() ? this.system('Smote the nearest mob.') : this.error('No mob nearby.');

      // ---- Host-only multiplayer admin (cheats must be on) ----
      case 'players': case 'list': {
        const list = a.players?.() || [];
        if (!list.length) return this.info('No other players connected.');
        return this.info('Players: ' + list.map((p) => p.name).join(', '));
      }
      case 'setmode': {
        if (!a.isHost?.()) return this.error('Only the host can change another player’s mode.');
        const name = parts[1];
        const m = (parts[2] || '').toLowerCase();
        const mode = /^(c|creative|1)$/.test(m) ? 'creative' : /^(s|survival|0)$/.test(m) ? 'survival' : null;
        if (!name || !mode) return this.error('Usage: /setmode <player> <survival|creative>');
        return a.adminSetMode?.(name, mode)
          ? this.system(`Set ${name} to ${mode}.`)
          : this.error('No player named ' + name + '.');
      }
      case 'revoke': {
        if (!a.isHost?.()) return this.error('Only the host can revoke privileges.');
        const name = parts[1];
        if (!name) return this.error('Usage: /revoke <player>');
        return a.adminRevoke?.(name)
          ? this.system(`Revoked ${name}’s cheats and set them to survival.`)
          : this.error('No player named ' + name + '.');
      }
      case 'grant': {
        if (!a.isHost?.()) return this.error('Only the host can grant privileges.');
        const name = parts[1];
        if (!name) return this.error('Usage: /grant <player>');
        return a.adminGrant?.(name)
          ? this.system(`Granted ${name} cheats.`)
          : this.error('No player named ' + name + '.');
      }
      default: return this.error('Unknown command: /' + cmd + ' (try /help)');
    }
  }

  _help() {
    this.info('Always: /help /seed /pos');
    if (!this.api.cheats) { this.info('Enable cheats when creating a world for 22 more OP commands.'); return; }
    this.info('/gamemode /difficulty /give /giveall /clear');
    this.info('/tp /home /setspawn /heal /sethealth /feed /hurt /kill');
    this.info('/god /fly /speed /noclip /reach /time /spawn /killall /smite');
    this.info('Multiplayer: /players  (host) /setmode <player> <mode> /grant /revoke');
  }

  dispose() {
    document.removeEventListener('keydown', this._onKey);
    this.root.remove();
  }

  _injectStyles() {
    if (document.getElementById('chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'chat-styles';
    style.textContent = `
      #chat { position: absolute; left: calc(14px + var(--safe-left, 0px));
        bottom: calc(104px + var(--safe-bottom, 0px)); z-index: 70;
        width: min(440px, 70vw); pointer-events: none; font-family: 'Segoe UI', system-ui, sans-serif; }
      .chat-log { max-height: 200px; overflow-y: auto; margin-bottom: 8px;
        display: flex; flex-direction: column; gap: 2px;
        mask-image: linear-gradient(to top, #000 70%, transparent); }
      .chat-line { font-size: 13px; color: #e7eef6; padding: 2px 8px; width: fit-content;
        max-width: 100%; background: rgba(8,10,14,0.5); border-radius: 5px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8); word-break: break-word; }
      .chat-line.sys { color: #ffd87a; }
      .chat-line.err { color: #ff8a8a; }
      .chat-line.info { color: #8fd0ff; }
      .chat-form { display: none; }
      #chat.open { pointer-events: auto; }
      #chat.open .chat-form { display: block; }
      #chat.open .chat-log { pointer-events: auto; }
      #chat-input { width: 100%; padding: 9px 12px; font-size: 14px; color: #fff;
        background: rgba(8,10,14,0.85); border: 1px solid rgba(255,255,255,0.18); border-radius: 7px; outline: none; }
      #chat-input:focus { border-color: var(--accent, #6cc24a); }
    `;
    document.head.appendChild(style);
  }
}

export default Chat;
