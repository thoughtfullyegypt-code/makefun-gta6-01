// Synthesised sound: every effect is built from oscillators and filtered
// noise in WebAudio. No audio files. The context starts on the first user
// gesture (a click or key press) and every resume is guarded.

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.muted = false;
  }

  // Create (or resume) the context. Safe to call often; does nothing if the
  // browser blocks audio.
  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // Audio stays suspended; the game continues silently.
      }
    }
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _burst({ duration = 0.15, freq = 800, type = 'lowpass', gain = 0.5 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration);
  }

  _tone({ freq = 440, end = null, duration = 0.2, type = 'sine', gain = 0.3, when = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(end, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  gunshot() {
    this._burst({ duration: 0.12, freq: 1800, gain: 0.5 });
    this._tone({ freq: 160, end: 60, duration: 0.1, type: 'square', gain: 0.2 });
  }
  crash(strength = 1) {
    this._burst({ duration: 0.3, freq: 300, gain: 0.4 * strength });
  }
  horn() {
    this._tone({ freq: 392, duration: 0.35, type: 'square', gain: 0.15 });
    this._tone({ freq: 330, duration: 0.35, type: 'square', gain: 0.15 });
  }
  pickup() {
    this._tone({ freq: 660, duration: 0.12, gain: 0.25 });
    this._tone({ freq: 990, duration: 0.2, gain: 0.25, when: 0.1 });
  }
  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone({ freq: f, duration: 0.22, gain: 0.25, when: i * 0.13 }),
    );
  }
  missionFailed() {
    [392, 330, 262].forEach((f, i) =>
      this._tone({ freq: f, duration: 0.25, type: 'triangle', gain: 0.25, when: i * 0.16 }),
    );
  }
  busted() {
    this._tone({ freq: 220, end: 110, duration: 0.7, type: 'sawtooth', gain: 0.2 });
  }
  click() {
    this._tone({ freq: 880, duration: 0.06, gain: 0.15 });
  }

  // Continuous engine hum; call every frame with speed 0..1 (or null to stop).
  setEngine(speed01) {
    if (!this.ctx) return;
    if (speed01 === null) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    this.engineOsc.frequency.value = 55 + speed01 * 130;
    this.engineGain.gain.value = this.muted ? 0 : 0.05 + speed01 * 0.08;
  }

  // Two-tone police siren; call every frame with whether any cop is near.
  setSiren(on, dt) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenGain) this.sirenGain.gain.value = 0;
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    }
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.45) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 920 : 700;
    }
    this.sirenGain.gain.value = this.muted ? 0 : 0.045;
  }
}
