/**
 * Chat
 * ----
 * A message log plus a text input toggled with 'T' (or a touch button). Lines
 * starting with '/' are parsed as commands. Supported commands:
 *
 *   /gamemode <survival|creative|s|c|0|1>   switch game mode
 *   /give <item> [count]                    add items (survival)
 *   /clear                                  empty the inventory
 *   /kill                                   die (then respawn)
 *   /help                                   list commands
 *
 * The host wires behaviour through the `commands` callback object so Chat stays
 * decoupled from the engine.
 */

import { ITEMS } from '../world/ItemTypes.js';

export class Chat {
  /**
   * @param {HTMLElement} mount
   * @param {Object} handlers
   * @param {(mode:string)=>boolean} handlers.setGameMode
   * @param {(type:string,count:number)=>boolean} handlers.give
   * @param {()=>void} handlers.clearInventory
   * @param {()=>void} handlers.kill
   * @param {()=>void} [handlers.onOpen]
   * @param {()=>void} [handlers.onClose]
   */
  constructor(mount, handlers) {
    this.mount = mount;
    this.handlers = handlers;
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
      </form>
    `;
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

    this.system('Welcome! Press T to chat. Try /help.');
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.code === 'KeyT' && !this.open && !this._isTyping()) {
        e.preventDefault();
        this.openChat();
      } else if (e.code === 'Escape' && this.open) {
        this.close();
      }
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
    this.handlers.onOpen?.();
    setTimeout(() => this.inputEl.focus(), 0);
  }

  close() {
    this.open = false;
    this.root.classList.remove('open');
    this.inputEl.blur();
    this.handlers.onClose?.();
  }

  /* ------------------------------ messages ------------------------------- */

  system(text) { this._push(text, 'sys'); }
  error(text) { this._push(text, 'err'); }
  info(text) { this._push(text, 'info'); }

  _push(text, cls = '') {
    const line = document.createElement('div');
    line.className = 'chat-line ' + cls;
    line.textContent = text;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    // Trim old lines.
    while (this.logEl.children.length > 80) {
      this.logEl.removeChild(this.logEl.firstChild);
    }
  }

  /* ------------------------------ commands ------------------------------- */

  _handle(text) {
    if (!text.startsWith('/')) {
      this._push('<you> ' + text);
      return;
    }
    const parts = text.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'gamemode':
      case 'gm': {
        const m = (parts[1] || '').toLowerCase();
        const mode =
          m === 'creative' || m === 'c' || m === '1' ? 'creative' :
          m === 'survival' || m === 's' || m === '0' ? 'survival' : null;
        if (!mode) { this.error('Usage: /gamemode <survival|creative>'); break; }
        if (this.handlers.setGameMode(mode)) this.system('Game mode set to ' + mode);
        break;
      }
      case 'give': {
        const type = parts[1];
        const count = parseInt(parts[2] || '1', 10) || 1;
        if (!type || !ITEMS[type]) {
          this.error('Unknown item. e.g. /give oak_planks 8');
          break;
        }
        if (this.handlers.give(type, count)) {
          this.system(`Gave ${count} × ${ITEMS[type].name}`);
        } else {
          this.error('Could not give item (inventory full?).');
        }
        break;
      }
      case 'clear':
        this.handlers.clearInventory();
        this.system('Inventory cleared.');
        break;
      case 'kill':
        this.handlers.kill();
        this.system('Ouch.');
        break;
      case 'help':
        this.info('/gamemode <s|c> · /give <item> [n] · /clear · /kill · /help');
        this.info('Items: ' + Object.keys(ITEMS).join(', '));
        break;
      default:
        this.error('Unknown command: /' + cmd);
    }
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
      #chat {
        position: absolute; left: calc(14px + var(--safe-left, 0px));
        bottom: calc(104px + var(--safe-bottom, 0px)); z-index: 70;
        width: min(440px, 70vw); pointer-events: none;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .chat-log {
        max-height: 200px; overflow-y: auto; margin-bottom: 8px;
        display: flex; flex-direction: column; gap: 2px;
        mask-image: linear-gradient(to top, #000 70%, transparent);
      }
      .chat-line {
        font-size: 13px; color: #e7eef6; padding: 2px 8px; width: fit-content;
        max-width: 100%; background: rgba(8,10,14,0.5); border-radius: 5px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8); word-break: break-word;
      }
      .chat-line.sys { color: #ffd87a; }
      .chat-line.err { color: #ff8a8a; }
      .chat-line.info { color: #8fd0ff; }
      .chat-form { display: none; }
      #chat.open { pointer-events: auto; }
      #chat.open .chat-form { display: block; }
      #chat.open .chat-log { pointer-events: auto; }
      #chat-input {
        width: 100%; padding: 9px 12px; font-size: 14px; color: #fff;
        background: rgba(8,10,14,0.85); border: 1px solid rgba(255,255,255,0.18);
        border-radius: 7px; outline: none;
      }
      #chat-input:focus { border-color: var(--accent, #6cc24a); }
    `;
    document.head.appendChild(style);
  }
}

export default Chat;
