/**
 * Protocol
 * --------
 * Tiny wire protocol for peer-to-peer multiplayer. Messages are JSON strings
 * sent over WebRTC data channels. Kept as a pure module (no DOM / no RTC) so it
 * can be unit-tested headlessly.
 *
 * Message kinds:
 *   hello  - introduce a player: { name, avatar }
 *   state  - per-tick movement:  { x, y, z, yaw, pitch, hp, cr }
 *   edit   - a block change:      { x, y, z, id }
 *   chat   - a chat line:         { text }
 *   roster - host -> guests list: { players: [{ id, name, avatar }] }
 *   bye    - a player left:       { id }
 *   attack - PvP hit:             { target, dmg }
 *   drop   - item dropped:        { id, type, count, x, y, z }
 *   pickup - item collected:      { id }
 *   mode   - gamemode/admin:      { target, mode, cheats }
 */

export const MSG = Object.freeze({
  HELLO: 'hello',
  STATE: 'state',
  EDIT: 'edit',
  CHAT: 'chat',
  ROSTER: 'roster',
  BYE: 'bye',
  ATTACK: 'attack',
  DROP: 'drop',
  PICKUP: 'pickup',
  MODE: 'mode'
});

/**
 * @param {string} type one of MSG.*
 * @param {Object} [data]
 * @param {string} [from] sender peer id (added by the relay)
 * @returns {string} JSON wire string
 */
export function encode(type, data = {}, from = null) {
  const msg = { t: type, d: data };
  if (from) msg.f = from;
  return JSON.stringify(msg);
}

/**
 * @param {string} str
 * @returns {{ type: string, data: Object, from: string|null }|null}
 */
export function decode(str) {
  try {
    const msg = JSON.parse(str);
    if (!msg || typeof msg.t !== 'string') return null;
    return { type: msg.t, data: msg.d || {}, from: msg.f || null };
  } catch {
    return null;
  }
}

/** Round a player state for compact, jitter-free transmission. */
export function packState(p) {
  const r = (n) => Math.round(n * 100) / 100;
  const s = { x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(p.yaw), pitch: r(p.pitch) };
  if (typeof p.hp === 'number') s.hp = r(p.hp);     // current health (for remote bars)
  if (p.creative) s.cr = 1;                          // creative players can't be hit
  return s;
}

/** Validate an inbound edit so a peer can't inject garbage. */
export function validEdit(d) {
  return d && Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.z) &&
    Number.isInteger(d.id) && d.id >= 0 && d.id <= 255;
}

/** Validate an inbound PvP attack. */
export function validAttack(d) {
  return d && typeof d.target === 'string' && Number.isFinite(d.dmg) && d.dmg > 0 && d.dmg <= 100;
}

/** Validate an inbound dropped-item announcement. */
export function validDrop(d) {
  return d && typeof d.id === 'string' && typeof d.type === 'string' &&
    Number.isFinite(d.count) && d.count > 0 &&
    Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.z);
}
