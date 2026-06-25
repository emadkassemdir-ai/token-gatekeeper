/**
 * AudioManager
 * ------------
 * All sound is synthesised at runtime with the Web Audio API — no audio files,
 * nothing copyrighted. Provides short SFX (UI click, mine, place, hit, hurt,
 * craft, pickup, step) and a gentle procedurally-generated background music
 * loop.
 *
 * The AudioContext can only start after a user gesture, so call resume() from a
 * click/tap (the menu does this). Everything no-ops safely until then.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicOn = true;
    this._musicTimer = null;
    this._step = 0;
  }

  /** Lazily create / resume the audio context (call from a user gesture). */
  resume() {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  /* ------------------------------- SFX ----------------------------------- */

  /** Core tone helper: an oscillator with an attack/decay envelope. */
  _tone(freq, dur, type = 'square', vol = 0.4, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  /** Short filtered-noise burst (digs, hits). */
  _noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }

  click()  { this._tone(660, 0.05, 'square', 0.18); }
  mine()   { this._noise(0.09, 0.25, 900); }
  place()  { this._tone(300, 0.08, 'square', 0.25, 120); this._noise(0.05, 0.12, 700); }
  hit()    { this._noise(0.08, 0.35, 2000); this._tone(180, 0.06, 'sawtooth', 0.2); }
  hurt()   { this._tone(200, 0.18, 'sawtooth', 0.35, -120); }
  craft()  { this._tone(523, 0.08, 'square', 0.2); setTimeout(() => this._tone(784, 0.1, 'square', 0.2), 70); }
  pickup() { this._tone(880, 0.06, 'sine', 0.2, 220); }
  step()   { this._noise(0.04, 0.08, 400); }

  /* ------------------------------ music ---------------------------------- */

  startMusic() {
    if (!this.ctx || this._musicTimer || !this.musicOn) return;
    // Gentle, slow pentatonic pad loop.
    const scale = [220, 261.63, 293.66, 329.63, 392, 440];
    const beat = 2.2; // seconds
    const tick = () => {
      if (!this.musicOn || this.muted) return;
      const root = scale[Math.floor(Math.random() * scale.length)];
      this._pad(root, beat * 1.8);
      if (Math.random() < 0.6) this._pad(root * 1.5, beat * 1.8, 0.5);
    };
    tick();
    this._musicTimer = setInterval(tick, beat * 1000);
  }

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this.startMusic(); else this.stopMusic();
    return this.musicOn;
  }

  _pad(freq, dur, volScale = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18 * volScale, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
}

/** Shared singleton. */
export const Audio = new AudioManager();
export default Audio;
