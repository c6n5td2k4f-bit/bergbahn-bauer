// All sound is synthesised with the Web Audio API (no sound files): wind, village murmur, church bells,
// birds, lift motors and the clack of carriers passing the station, snow cannons, groomer diesels,
// the train, skiing (carving / wind rush), UI clicks and a calm generative background music.
// Sounds near the camera get louder and are panned left / right.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Sound {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.sfxOn = true; this.musicOn = true; this.vol = 0.8;
    try {
      const s = JSON.parse(localStorage.getItem('bb-sound') || '{}');
      if (s.sfx === false) this.sfxOn = false;
      if (s.music === false) this.musicOn = false;
      if (typeof s.vol === 'number') this.vol = s.vol;
    } catch (e) { /* ignore */ }
    this.clackT = 0; this.birdT = 3; this.bellT = 40; this.lastCarve = 0;
  }

  save() { try { localStorage.setItem('bb-sound', JSON.stringify({ sfx: this.sfxOn, music: this.musicOn, vol: this.vol })); } catch (e) { /* ignore */ } }

  // must be called from a user gesture (click / tap)
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
      this.out = comp;
      this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(comp);
      this.music = ctx.createGain(); this.music.gain.value = this.musicOn ? 0.55 : 0; this.music.connect(comp);
      // shared noise buffers
      this.white = this.noiseBuf('white'); this.pink = this.noiseBuf('pink'); this.brown = this.noiseBuf('brown');
      // small reverb for music and bells
      this.verb = ctx.createConvolver(); this.verb.buffer = this.irBuf(2.6); const vg = ctx.createGain(); vg.gain.value = 0.35; this.verb.connect(vg); vg.connect(comp);
      this.buildLoops();
      this.ready = true;
      this.startMusic();
    } catch (e) { this.ctx = null; }
  }

  setSfx(on) { this.sfxOn = on; this.save(); if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1); }
  setMusic(on) { this.musicOn = on; this.save(); if (this.music) this.music.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3); }
  setVolume(v) { this.vol = v; this.save(); if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  noiseBuf(kind) {
    const ctx = this.ctx, n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  irBuf(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }

  // a looping source -> filter -> gain -> panner -> sfx bus
  loop(buf, type, freq, q = 0.7) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(f); f.connect(g);
    if (p) { g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
    src.start(ctx.currentTime + Math.random() * 0.5);
    return { src, f, g, p };
  }
  engine(baseHz) {
    // diesel: two detuned saws + noise, through a lowpass, with a slow "chug" tremolo
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 2;
    const trem = ctx.createGain(); trem.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(trem.gain); lfo.start();
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = baseHz;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = baseHz * 1.503;
    const ng = ctx.createGain(); ng.gain.value = 0.25; const ns = ctx.createBufferSource(); ns.buffer = this.brown; ns.loop = true; ns.connect(ng);
    o1.connect(lp); o2.connect(lp); ng.connect(lp); lp.connect(trem); trem.connect(out);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { out.connect(p); p.connect(this.sfx); } else out.connect(this.sfx);
    o1.start(); o2.start(); ns.start();
    return { g: out, p, o1, o2, lfo, lp };
  }

  buildLoops() {
    this.wind = this.loop(this.pink, 'bandpass', 500, 0.6);
    this.wind2 = this.loop(this.white, 'highpass', 3000, 0.5);
    this.crowd = this.loop(this.pink, 'bandpass', 700, 1.2);
    this.liftHum = this.loop(this.brown, 'lowpass', 160, 3);
    this.cannon = this.loop(this.white, 'bandpass', 1500, 0.8);
    this.cannonLow = this.loop(this.pink, 'lowpass', 300, 1);
    this.carve = this.loop(this.white, 'bandpass', 1800, 1.4);
    this.rush = this.loop(this.pink, 'highpass', 900, 0.5);
    this.rail = this.loop(this.brown, 'lowpass', 220, 1);
    this.road = this.loop(this.pink, 'lowpass', 600, 0.7);
    this.groomer = this.engine(42);
    this.myEngine = this.engine(48);
    // the crowd murmur wobbles
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = this.ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(this.crowd.f.frequency); lfo.start();
  }

  // ---- one-shot sounds ----
  env(node, t, a, peak, d) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  click() {
    if (!this.ready || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    o.connect(g); g.connect(this.sfx); this.env(g, t, 0.003, 0.12, 0.06); o.start(t); o.stop(t + 0.1);
  }
  place() {
    if (!this.ready || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    o.connect(g); g.connect(this.sfx); this.env(g, t, 0.005, 0.45, 0.22); o.start(t); o.stop(t + 0.3);
    const n = ctx.createBufferSource(); n.buffer = this.pink; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const ng = ctx.createGain();
    n.connect(f); f.connect(ng); ng.connect(this.sfx); this.env(ng, t, 0.003, 0.25, 0.15); n.start(t, Math.random()); n.stop(t + 0.25);
  }
  coin() {
    if (!this.ready || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, dt] of [[1318, 0], [1976, 0.07]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; const lp = ctx.createBiquadFilter(); lp.frequency.value = 3000; o.connect(lp); lp.connect(g); g.connect(this.sfx); this.env(g, t + dt, 0.004, 0.06, 0.2); o.start(t + dt); o.stop(t + dt + 0.3); }
  }
  clack(vol, pan = 0) {
    // carrier rolling over the station sheaves / tower rollers
    if (vol < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const n = ctx.createBufferSource(); n.buffer = this.white; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200 + k * 500; f.Q.value = 6;
      const g = ctx.createGain(); n.connect(f); f.connect(g);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) { p.pan.value = pan; g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
      const tt = t + k * 0.075; this.env(g, tt, 0.002, vol * 0.5, 0.05); n.start(tt, Math.random() * 2); n.stop(tt + 0.1);
    }
  }
  bell(vol) {
    // church bell: inharmonic partials with long decay
    const ctx = this.ctx, t = ctx.currentTime, base = 196;
    for (const [r, a, d] of [[0.5, 0.5, 6], [1, 1, 4], [1.19, 0.6, 3], [1.5, 0.45, 3], [2, 0.35, 2.5], [2.74, 0.2, 1.6]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = base * r; o.connect(g); g.connect(this.sfx); g.connect(this.verb);
      this.env(g, t, 0.01, vol * a * 0.18, d); o.start(t); o.stop(t + d + 0.2);
    }
  }
  bird(vol) {
    const ctx = this.ctx, t0 = ctx.currentTime, f0 = 2400 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.09 + Math.random() * 0.06), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.2), t); o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.4), t + 0.06);
      o.connect(g); g.connect(this.sfx); this.env(g, t, 0.005, vol * 0.08, 0.07); o.start(t); o.stop(t + 0.12);
    }
  }
  horn(vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const f of [370, 466]) { const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.frequency.value = 1400; o.connect(lp); lp.connect(g); g.connect(this.sfx); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.12, t + 0.05); g.gain.setValueAtTime(vol * 0.12, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); o.start(t); o.stop(t + 1.2); }
  }
  thump(vol) {
    if (!this.ready || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime, n = ctx.createBufferSource(); n.buffer = this.brown; const g = ctx.createGain(); n.connect(g); g.connect(this.sfx); this.env(g, t, 0.004, clamp(vol, 0.05, 1) * 0.9, 0.25); n.start(t, Math.random()); n.stop(t + 0.35);
  }

  // ---- generative background music: soft pads, a bass and a pentatonic bell melody ----
  startMusic() {
    const ctx = this.ctx;
    this.mNext = ctx.currentTime + 0.5; this.mStep = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(this.music); lp.connect(this.verb);
    this.mBus = lp;
    this.mTimer = setInterval(() => this.schedule(), 120);
  }
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, beat = 60 / 76;
    // I – V – vi – IV in C, sometimes ii
    const prog = [[48, 52, 55, 60], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57], [48, 52, 55, 60], [43, 50, 55, 59], [50, 53, 57, 62], [41, 48, 53, 57]];
    const penta = [72, 74, 76, 79, 81, 84, 86];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.mNext < ctx.currentTime + 0.6) {
      const t = this.mNext, step = this.mStep, bar = Math.floor(step / 8) % prog.length, ch = prog[bar];
      if (step % 8 === 0 && this.musicOn) {
        // pad chord over the whole bar
        for (const m of ch.slice(1)) for (const det of [-6, 6]) {
          const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1100, t + beat * 4); f.frequency.linearRampToValueAtTime(500, t + beat * 8);
          o.connect(f); f.connect(g); g.connect(this.mBus);
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + beat * 2); g.gain.setValueAtTime(0.018, t + beat * 6.5); g.gain.linearRampToValueAtTime(0.0001, t + beat * 8.2);
          o.start(t); o.stop(t + beat * 8.4);
        }
        // bass
        const b = ctx.createOscillator(), bg = ctx.createGain(); b.type = 'triangle'; b.frequency.value = hz(ch[0] - 12); b.connect(bg); bg.connect(this.mBus);
        bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.09, t + 0.05); bg.gain.exponentialRampToValueAtTime(0.0001, t + beat * 7.5); b.start(t); b.stop(t + beat * 8);
      }
      // bell melody: notes on some half beats
      if (this.musicOn && Math.random() < (step % 2 === 0 ? 0.42 : 0.15)) {
        const m = penta[Math.floor(Math.random() * penta.length)] - (Math.random() < 0.3 ? 12 : 0);
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o2.type = 'sine'; o.frequency.value = hz(m); o2.frequency.value = hz(m) * 2.01;
        const g2 = ctx.createGain(); g2.gain.value = 0.3; o2.connect(g2); g2.connect(g); o.connect(g); g.connect(this.mBus);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.start(t); o2.start(t); o.stop(t + 2); o2.stop(t + 2);
      }
      this.mNext += beat / 2; this.mStep++;
    }
  }

  // ---- per frame: positional ambience ----
  // s = { dt, cam, right, ground, valley, snowing, heavy, summer, night, villages, lifts, cannons, groomers, train, player, roadDist }
  update(s) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime, T = 0.15;
    const set = (ch, v, pan) => { ch.g.gain.setTargetAtTime(clamp(v, 0, 1.2), now, T); if (ch.p && pan !== undefined) ch.p.pan.setTargetAtTime(clamp(pan, -0.9, 0.9), now, T); };
    const cam = s.cam, rx = s.right.x, rz = s.right.z;
    const near = (x, z, R) => { const dx = x - cam.x, dz = z - cam.z, dy = (s.ground ?? 0) - cam.y, d = Math.hypot(dx, dz, dy * 0.6); const l = Math.hypot(dx, dz) || 1; return { v: Math.pow(clamp(1 - d / R, 0, 1), 2), pan: (dx * rx + dz * rz) / l * Math.min(1, d / 15) }; };
    // wind: stronger high up, in snow storms and when the camera is far away
    const alt = clamp((cam.y - s.valley) / 900, 0, 1);
    const windV = 0.05 + alt * 0.12 + (s.snowing ? 0.08 : 0) + (s.heavy ? 0.15 : 0);
    set(this.wind, windV * (0.8 + 0.2 * Math.sin(now * 0.3)));
    this.wind.f.frequency.setTargetAtTime(380 + 250 * Math.sin(now * 0.17) + alt * 200, now, 0.5);
    set(this.wind2, windV * 0.25);
    // village
    let vv = 0, vp = 0;
    for (const v of s.villages) { const n = near(v.x, v.z, v.r + 260); if (n.v > vv) { vv = n.v; vp = n.pan; } }
    set(this.crowd, vv * 0.22 * (s.night ? 0.4 : 1), vp);
    set(this.road, clamp(1 - s.roadDist / 220, 0, 1) ** 2 * 0.12);
    this.bellT -= s.dt;
    if (this.bellT <= 0) { this.bellT = 45 + Math.random() * 60; if (vv > 0.05) { const n = 2 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) setTimeout(() => this.ready && this.bell(vv), k * 1600); } }
    // birds in summer during the day
    this.birdT -= s.dt;
    if (this.birdT <= 0) { this.birdT = 1.5 + Math.random() * 5; if (s.summer && !s.night) this.bird(0.4 + vv); }
    // lifts: motor hum at the stations, clack of carriers passing the bullwheel
    let lv = 0, lp = 0, rate = 0;
    for (const l of s.lifts) {
      if (!l.moving) continue;
      for (const P of [l.A, l.B]) { const n = near(P.x, P.z, 220); if (n.v > lv) { lv = n.v; lp = n.pan; rate = clamp((l.speed || 4) / Math.max(4, l.spacing || 20), 0.05, 1.2); } }
    }
    set(this.liftHum, lv * 0.35, lp);
    this.clackT -= s.dt * rate;
    if (this.clackT <= 0) { this.clackT = 1; if (lv > 0.02) this.clack(lv, lp); }
    // snow cannons
    let cv = 0, cp = 0;
    if (s.cannons.on && s.cannons.active) for (const c of s.cannons.list) { const n = near(c.x, c.z, c.type === 'lanze' ? 110 : 200); const w = c.type === 'lanze' ? 0.6 : 1; if (n.v * w > cv) { cv = n.v * w; cp = n.pan; } }
    set(this.cannon, cv * 0.25, cp); set(this.cannonLow, cv * 0.35, cp);
    // groomers
    let gv = 0, gp = 0;
    for (const g of s.groomers) { if (!g.mesh.visible) continue; const n = near(g.mesh.position.x, g.mesh.position.z, 260); if (n.v > gv) { gv = n.v; gp = n.pan; } }
    set(this.groomer, gv * 0.3, gp);
    // train
    let tv = 0, tp = 0;
    if (s.train) for (const c of s.train.cars || []) { const n = near(c.position.x, c.position.z, 450); if (n.v > tv) { tv = n.v; tp = n.pan; } }
    set(this.rail, tv * 0.5, tp);
    if (s.train && s.train.state === 'wait' && s.train.stopDone && !this.hornDone) { this.hornDone = true; if (tv > 0.05) this.horn(tv); }
    if (s.train && s.train.state !== 'wait') this.hornDone = false;
    // the player: skis carving, wind rush with speed, own groomer engine
    const P = s.player;
    let carveV = 0, rushV = 0, engV = 0;
    if (P && P.active) {
      const sp = P.vel ? Math.hypot(P.vel.x, P.vel.z) : 0;
      if ((P.mode === 'ski' || P.mode === 'bike') && P.onGround && !P.ride) carveV = clamp(sp / 18, 0, 1) * (0.4 + 0.6 * clamp(Math.abs(P.edge || 0) + (P.skid || 0), 0, 1)) * (s.summer && P.mode === 'ski' ? 0.3 : 1);
      if (!P.ride) rushV = clamp((sp - 6) / 25, 0, 1);
      if (P.mode === 'bully' || P.mode === 'skidoo') engV = 0.35; else if (P.mode === 'car' || P.mode === 'bus') engV = 0.18;
      this.carve.f.frequency.setTargetAtTime(1400 + sp * 60, now, 0.1);
      this.myEngine.o1.frequency.setTargetAtTime(48 + Math.abs(P.v || sp) * 6, now, 0.2);
      this.myEngine.o2.frequency.setTargetAtTime((48 + Math.abs(P.v || sp) * 6) * 1.503, now, 0.2);
      // landing after a jump
      if (P.onGround && !this.wasGround && this.airT > 0.35) this.thump(clamp(this.airT / 1.5, 0.2, 1));
      this.airT = P.onGround ? 0 : (this.airT || 0) + s.dt;
      this.wasGround = P.onGround;
    }
    set(this.carve, carveV * 0.35); set(this.rush, rushV * 0.25); set(this.myEngine, engV);
  }
}
