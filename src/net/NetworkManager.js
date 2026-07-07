/**
 * NetworkManager
 * --------------
 * Peer-to-peer multiplayer over WebRTC data channels (no game server). Uses a
 * star topology: guests each connect to the host, and the host relays every
 * message to the other guests, so all four players share state.
 *
 * Signalling is manual / serverless ("copy-paste"): the host generates an
 * invite code (an SDP offer, base64-encoded with ICE candidates baked in); a
 * guest pastes it and returns a reply code (the SDP answer); the host pastes the
 * reply to complete the link. This keeps the whole game hostable on static
 * pages with no backend.
 *
 * Live connectivity depends on the browser + NAT (a STUN server is used for
 * candidate gathering); the message layer here is what the engine talks to.
 */

import Peer from 'peerjs';
import { MSG, encode, decode, validEdit, validAttack, validDrop } from './Protocol.js';

const MAX_PLAYERS = 4; // host + 3 guests
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * PeerJS broker options. Defaults to the free public PeerJS cloud; a page can
 * self-host a broker and point at it via `window.VC_PEER_OPTS = {host, port,
 * path, secure}` (also how the test-suite runs a local broker).
 */
function peerOpts() {
  return (typeof window !== 'undefined' && window.VC_PEER_OPTS) || {};
}

/** World name -> a stable PeerJS id ("yassins world" -> "vcw-yassins-world"). */
export function serverSlug(name) {
  return 'vcw-' + String(name || 'world').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// Debug/diagnostics hook (used by the automated tests to probe the transport).
if (typeof window !== 'undefined') window.__VC_Peer = Peer;

/**
 * ServerDirectory: the "server list". Live servers announce themselves over a
 * BroadcastChannel and a localStorage heartbeat (so every tab on the device
 * sees them instantly); names you've joined before are remembered so friends'
 * servers reappear as one-click entries.
 */
export const ServerDirectory = {
  _bc: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vc-servers') : null,

  announce(name, host) {
    const entry = { name, host, t: Date.now() };
    try {
      const all = JSON.parse(localStorage.getItem('vc-live-servers') || '{}');
      all[serverSlug(name)] = entry;
      localStorage.setItem('vc-live-servers', JSON.stringify(all));
    } catch { /* storage full/blocked */ }
    this._bc?.postMessage(entry);
  },

  unannounce(name) {
    try {
      const all = JSON.parse(localStorage.getItem('vc-live-servers') || '{}');
      delete all[serverSlug(name)];
      localStorage.setItem('vc-live-servers', JSON.stringify(all));
    } catch { /* ignore */ }
  },

  /** Live entries (heartbeat < 12s old) + remembered names, deduped. */
  list() {
    const out = [];
    const seen = new Set();
    try {
      const all = JSON.parse(localStorage.getItem('vc-live-servers') || '{}');
      for (const k of Object.keys(all)) {
        if (Date.now() - all[k].t < 12000) { out.push({ ...all[k], live: true }); seen.add(k); }
      }
    } catch { /* ignore */ }
    try {
      for (const name of JSON.parse(localStorage.getItem('vc-server-history') || '[]')) {
        if (!seen.has(serverSlug(name))) out.push({ name, host: '', live: false });
      }
    } catch { /* ignore */ }
    return out;
  },

  remember(name) {
    try {
      const hist = JSON.parse(localStorage.getItem('vc-server-history') || '[]')
        .filter((n) => serverSlug(n) !== serverSlug(name));
      hist.unshift(name);
      localStorage.setItem('vc-server-history', JSON.stringify(hist.slice(0, 8)));
    } catch { /* ignore */ }
  }
};

/** Wait until ICE candidate gathering finishes (or a short timeout). */
function waitForIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, 3000); // fall back so we never hang the UI
  });
}

const b64 = {
  enc: (obj) => btoa(JSON.stringify(obj)),
  dec: (str) => JSON.parse(atob(str.trim()))
};

let _idCounter = 0;
function uid() {
  return 'p' + Date.now().toString(36) + (_idCounter++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

export class NetworkManager {
  constructor() {
    this.role = null;        // 'host' | 'guest' | null
    this.selfId = uid();
    this.name = 'Player';
    this.avatar = null;

    /** @type {Map<string, {pc:RTCPeerConnection, ch:RTCDataChannel, id:string|null, name:string, avatar:Object|null}>} */
    this.peers = new Map();  // keyed by a local link id
    this._pendingHostPc = null;

    // Event hooks (set by the host engine).
    this.onPeerJoin = null;  // (id, {name, avatar})
    this.onPeerLeave = null; // (id)
    this.onState = null;     // (id, state)
    this.onEdit = null;      // (edit)
    this.onChat = null;      // (id, name, text)
    this.onStatus = null;    // (text)
    this.onAttack = null;    // ({ target, dmg }, fromId)
    this.onDrop = null;      // ({ id, type, count, x, y, z })
    this.onPickup = null;    // ({ id })
    this.onMode = null;      // ({ target, mode, cheats }, fromId)
    this.onWorld = null;     // (worldPayload) guest: adopt the host's world

    // Server-browser mode (PeerJS auto-signalling).
    this.serverName = null;      // set while hosting a named server
    this.worldProvider = null;   // host: () => { seed, edits, mode, time, spawn }
    this._peerjs = null;
    this._heartbeat = null;
  }

  get connected() { return this.peers.size > 0; }
  get playerCount() { return this.peers.size + 1; }

  setIdentity(name, avatar) {
    this.name = name || 'Player';
    this.avatar = avatar || null;
  }

  /* ------------------------------ host side ------------------------------ */

  /**
   * Begin hosting and create an invite code for one guest.
   * @returns {Promise<string>} invite code to share
   */
  async createInvite() {
    if (this.playerCount >= MAX_PLAYERS) throw new Error('World is full (4 players).');
    this.role = 'host';
    const linkId = uid();
    const pc = new RTCPeerConnection({ iceServers: STUN });
    const ch = pc.createDataChannel('game', { ordered: true });
    const peer = { pc, ch, id: null, name: 'Guest', avatar: null };
    this._wireChannel(linkId, peer);
    this._pendingHostPc = { linkId, pc };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    this.peers.set(linkId, peer);
    return b64.enc(pc.localDescription);
  }

  /**
   * Complete a guest connection with their reply code.
   * @param {string} replyCode
   */
  async acceptReply(replyCode) {
    if (!this._pendingHostPc) throw new Error('Create an invite first.');
    const { pc } = this._pendingHostPc;
    await pc.setRemoteDescription(b64.dec(replyCode));
    this._pendingHostPc = null;
  }

  /* ------------------------------ guest side ----------------------------- */

  /**
   * Join a host using their invite code; returns a reply code to send back.
   * @param {string} inviteCode
   * @returns {Promise<string>} reply code for the host
   */
  async joinWithInvite(inviteCode) {
    this.role = 'guest';
    const linkId = uid();
    const pc = new RTCPeerConnection({ iceServers: STUN });
    const peer = { pc, ch: null, id: null, name: 'Host', avatar: null };

    pc.addEventListener('datachannel', (e) => {
      peer.ch = e.channel;
      this._wireChannel(linkId, peer);
    });

    await pc.setRemoteDescription(b64.dec(inviteCode));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    this.peers.set(linkId, peer);
    return b64.enc(pc.localDescription);
  }

  /* --------------------- server browser (auto signalling) ----------------- */

  /**
   * Host: put this world online as a named server. Uses the free public PeerJS
   * broker for signalling, so friends can join by name with one click — no
   * copy-paste codes. (Yes, the "server cost" line in the menu is a joke.)
   * @param {string} worldName
   */
  hostServer(worldName) {
    return new Promise((resolve, reject) => {
      const id = serverSlug(worldName);
      this.role = 'host';
      this.serverName = worldName;
      const peer = new Peer(id, peerOpts());
      this._peerjs = peer;
      const timer = setTimeout(() => reject(new Error('Signalling service unreachable — check your connection.')), 10000);
      const fail = (err) => {
        clearTimeout(timer);
        if (String(err?.type) === 'unavailable-id') {
          reject(new Error('A server with this world name is already online.'));
        } else reject(new Error('Could not reach the signalling service: ' + (err?.type || err)));
      };
      peer.on('error', fail);
      peer.on('open', () => {
        clearTimeout(timer);
        peer.off('error', fail);
        peer.on('error', (err) => this.onStatus?.('Network: ' + (err?.type || err)));
        peer.on('connection', (conn) => {
          if (this.playerCount >= MAX_PLAYERS) { try { conn.close(); } catch {} return; }
          this._wirePeerConn(uid(), conn, 'Guest');
        });
        // Heartbeat into the local server list while online.
        ServerDirectory.announce(worldName, this.name);
        this._heartbeat = setInterval(() => ServerDirectory.announce(worldName, this.name), 5000);
        this.onStatus?.(`Server online: “${worldName}”`);
        resolve(id);
      });
    });
  }

  /**
   * Guest: join a named server from the browser list (or typed by name).
   * Resolves once the data channel to the host is open.
   * @param {string} worldName
   */
  joinServer(worldName) {
    return new Promise((resolve, reject) => {
      this.role = 'guest';
      const peer = new Peer(peerOpts()); // broker-assigned id for the guest
      this._peerjs = peer;
      const timeout = setTimeout(() => reject(new Error('Server not responding — is it online?')), 25000);
      peer.on('error', (err) => {
        if (String(err?.type) === 'peer-unavailable') {
          clearTimeout(timeout);
          reject(new Error(`No server called “${worldName}” is online right now.`));
        }
      });
      peer.on('open', () => {
        const conn = peer.connect(serverSlug(worldName), { reliable: true });
        const linkPeer = this._wirePeerConn(uid(), conn, 'Host');
        conn.on('open', () => {
          clearTimeout(timeout);
          ServerDirectory.remember(worldName);
          resolve(linkPeer);
        });
      });
    });
  }

  /** Adapt a PeerJS DataConnection to the same peer record the engine uses. */
  _wirePeerConn(linkId, conn, label) {
    const peer = {
      pc: conn.peerConnection || null,
      ch: { get readyState() { return conn.open ? 'open' : 'connecting'; }, send: (s) => conn.send(s) },
      id: null, name: label, avatar: null
    };
    this.peers.set(linkId, peer);
    conn.on('open', () => {
      this._sendTo(peer, MSG.HELLO, { id: this.selfId, name: this.name, avatar: this.avatar });
      this.onStatus?.(`Connected (${this.playerCount}/${MAX_PLAYERS})`);
    });
    conn.on('data', (data) => {
      const raw = typeof data === 'string' ? data
        : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : String(data);
      this._onMessage(linkId, peer, raw);
    });
    conn.on('close', () => this._dropPeer(linkId, peer));
    conn.on('error', () => this._dropPeer(linkId, peer));
    return peer;
  }

  /* ------------------------------ channels ------------------------------- */

  _wireChannel(linkId, peer) {
    const ch = peer.ch;
    ch.addEventListener('open', () => {
      // Introduce ourselves on connect.
      this._sendTo(peer, MSG.HELLO, { id: this.selfId, name: this.name, avatar: this.avatar });
      this.onStatus?.(`Connected (${this.playerCount}/${MAX_PLAYERS})`);
    });
    ch.addEventListener('message', (e) => this._onMessage(linkId, peer, e.data));
    ch.addEventListener('close', () => this._dropPeer(linkId, peer));
    peer.pc.addEventListener('connectionstatechange', () => {
      const s = peer.pc.connectionState;
      if (s === 'failed' || s === 'disconnected' || s === 'closed') this._dropPeer(linkId, peer);
    });
  }

  _dropPeer(linkId, peer) {
    if (!this.peers.has(linkId)) return;
    this.peers.delete(linkId);
    if (peer.id) {
      this.onPeerLeave?.(peer.id);
      // Host: tell remaining guests this player left.
      if (this.role === 'host') this._relay(MSG.BYE, { id: peer.id }, peer.id);
    }
    this.onStatus?.(`A player left (${this.playerCount}/${MAX_PLAYERS})`);
  }

  _onMessage(linkId, peer, raw) {
    const msg = decode(raw);
    if (!msg) return;
    const from = msg.from || peer.id; // host stamps 'from'; direct HELLO has none

    switch (msg.type) {
      case MSG.HELLO: {
        peer.id = msg.data.id;
        peer.name = msg.data.name || 'Player';
        peer.avatar = msg.data.avatar || null;
        this.onPeerJoin?.(peer.id, { name: peer.name, avatar: peer.avatar });
        if (this.role === 'host') {
          // Tell the newcomer about everyone already here, and everyone about them.
          this._introduceExisting(peer);
          this._relay(MSG.HELLO, msg.data, peer.id, peer);
          // Hand the newcomer OUR world (seed + edits) so they join this world.
          if (this.worldProvider) this._sendTo(peer, MSG.WORLD, this.worldProvider());
        }
        break;
      }
      case MSG.WORLD:
        if (this.role === 'guest') this.onWorld?.(msg.data);
        break;
      case MSG.STATE:
        if (from && from !== this.selfId) this.onState?.(from, msg.data);
        if (this.role === 'host') this._relay(MSG.STATE, msg.data, peer.id, peer);
        break;
      case MSG.EDIT:
        if (validEdit(msg.data)) this.onEdit?.(msg.data);
        if (this.role === 'host') this._relay(MSG.EDIT, msg.data, peer.id, peer);
        break;
      case MSG.CHAT:
        if (from && from !== this.selfId) this.onChat?.(from, peer.name, msg.data.text);
        if (this.role === 'host') this._relay(MSG.CHAT, msg.data, peer.id, peer);
        break;
      case MSG.BYE:
        this.onPeerLeave?.(msg.data.id);
        break;
      case MSG.ATTACK:
        if (validAttack(msg.data)) this.onAttack?.(msg.data, from);
        if (this.role === 'host') this._relay(MSG.ATTACK, msg.data, peer.id, peer);
        break;
      case MSG.DROP:
        if (validDrop(msg.data)) this.onDrop?.(msg.data);
        if (this.role === 'host') this._relay(MSG.DROP, msg.data, peer.id, peer);
        break;
      case MSG.PICKUP:
        if (msg.data && typeof msg.data.id === 'string') this.onPickup?.(msg.data);
        if (this.role === 'host') this._relay(MSG.PICKUP, msg.data, peer.id, peer);
        break;
      case MSG.MODE:
        if (msg.data && typeof msg.data.target === 'string') this.onMode?.(msg.data, from);
        if (this.role === 'host') this._relay(MSG.MODE, msg.data, peer.id, peer);
        break;
    }
  }

  /** Host: send the new peer a HELLO for every other already-known player. */
  _introduceExisting(newPeer) {
    for (const other of this.peers.values()) {
      if (other === newPeer || !other.id) continue;
      this._sendTo(newPeer, MSG.HELLO, { id: other.id, name: other.name, avatar: other.avatar });
    }
  }

  /* ------------------------------ sending -------------------------------- */

  _sendTo(peer, type, data, from = null) {
    if (peer.ch && peer.ch.readyState === 'open') {
      try { peer.ch.send(encode(type, data, from)); } catch { /* ignore */ }
    }
  }

  /** Broadcast a message from this local player to all peers. */
  broadcast(type, data) {
    for (const peer of this.peers.values()) this._sendTo(peer, type, data, this.selfId);
  }

  /** Host relay: forward a guest's message to all peers except the origin. */
  _relay(type, data, fromId, exceptPeer = null) {
    if (this.role !== 'host') return;
    for (const peer of this.peers.values()) {
      if (peer === exceptPeer) continue;
      this._sendTo(peer, type, data, fromId);
    }
  }

  /* ----------------------------- convenience ----------------------------- */

  sendState(state) { this.broadcast(MSG.STATE, state); }
  sendEdit(edit) { this.broadcast(MSG.EDIT, edit); }
  sendChat(text) { this.broadcast(MSG.CHAT, { text }); }
  sendAttack(target, dmg) { this.broadcast(MSG.ATTACK, { target, dmg }); }
  sendDrop(drop) { this.broadcast(MSG.DROP, drop); }
  sendPickup(id) { this.broadcast(MSG.PICKUP, { id }); }
  /** Host: force/announce a player's gamemode and/or cheat privileges. */
  sendMode(target, mode, cheats) {
    const d = { target };
    if (mode) d.mode = mode;
    if (typeof cheats === 'boolean') d.cheats = cheats;
    this.broadcast(MSG.MODE, d);
  }

  /** @returns {Array<{id:string,name:string}>} connected remote players. */
  roster() {
    const out = [];
    for (const peer of this.peers.values()) if (peer.id) out.push({ id: peer.id, name: peer.name });
    return out;
  }

  disconnect() {
    for (const peer of this.peers.values()) {
      try { peer.ch?.close?.(); } catch {}
      try { peer.pc?.close(); } catch {}
    }
    this.peers.clear();
    this.role = null;
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
    if (this.serverName) { ServerDirectory.unannounce(this.serverName); this.serverName = null; }
    if (this._peerjs) { try { this._peerjs.destroy(); } catch {} this._peerjs = null; }
  }
}

export default NetworkManager;
