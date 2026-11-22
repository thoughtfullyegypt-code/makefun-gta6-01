// audio.js: all sound is synthesised with WebAudio — engine hum, police siren,
// gunshots, pickups and jingles. No audio files, no network. The context starts on the
// first user gesture (browsers forbid sound before one).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (ctx) {
      // resume() returns a promise; it rejects when the browser still forbids
      // sound (no gesture yet). A denied resume must never surface as an
      // uncaught error — the game just stays silent until the next gesture.
      if (ctx.state === 'suspended') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }

  /** A short burst of filtered noise (gunshots, crashes, skids). */
  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  /** A short tone with a pitch glide (blips, jingles). */
  function tone(freq, endFreq, duration, gainValue, type = 'sine', when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainValue, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    click() {
      tone(700, 500, 0.07, 0.15, 'triangle');
    },
    gunshot() {
      noiseBurst(0.16, 1200, 0.5);
      tone(160, 40, 0.12, 0.3, 'square');
    },
    crash(strength) {
      noiseBurst(0.25, 500, Math.min(0.6, 0.15 + strength * 0.03));
    },
    pickup() {
      tone(880, 880, 0.1, 0.2, 'sine');
      tone(1318, 1318, 0.16, 0.2, 'sine', 0.09);
    },
    missionComplete() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 0.22, 'triangle', i * 0.13));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => tone(f, f, 0.25, 0.2, 'sawtooth', i * 0.16));
    },
    busted() {
      [700, 700, 700].forEach((f, i) => tone(f, 500, 0.18, 0.25, 'square', i * 0.22));
    },
    horn() {
      tone(370, 370, 0.3, 0.25, 'sawtooth');
      tone(466, 466, 0.3, 0.2, 'sawtooth');
    },
    /** Continuous engine hum: call every frame with speed 0..1, false when on foot. */
    engine(speedNorm, on) {
      if (!ctx) return;
      if (!on) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 700;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      const target = 55 + speedNorm * 140;
      engineOsc.frequency.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.05, ctx.currentTime, 0.1);
    },
    /** Police siren: call every frame with true while any cop is near. */
    siren(on, dt) {
      if (!ctx) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt;
      if (sirenTimer > 0.45) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setValueAtTime(sirenHigh ? 920 : 700, ctx.currentTime);
      }
      sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
    },
  };
}
