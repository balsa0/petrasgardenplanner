/**
 * Sound for walk mode, synthesised on the fly (no audio files): footsteps shaped by the ground
 * underfoot, and a quiet garden around you (wind in the leaves, the odd bird). The browser only
 * allows sound after a click, so nothing plays until `unlockAudio` runs from one.
 */

export type Ground = "grass" | "gravel" | "mulch" | "hard" | "wood";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = false;

/** Creates (or wakes) the audio context; call from a click or key press. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    // Two seconds of white noise, the raw material for every sound here.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** Turns all walk sound on or off (footsteps and ambience). */
export function setAmbience(on: boolean) {
  enabled = on;
  if (on) startAmbience();
  else stopAmbience();
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A filtered noise burst: the scuff, crunch or tap of a step. */
function burst(at: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number) {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rand(0.8, 1.2);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq * rand(0.88, 1.12);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master);
  src.start(at, rand(0, 1.8), dur + 0.05);
}

/** A soft low knock: the heel landing on something firm. */
function thump(at: number, freq: number, dur: number, gain: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq * rand(0.9, 1.1), at);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** One footfall on the given ground; `force` ~0.4 for creeping, 1 walking, 1.5 landing a jump. */
export function footstep(ground: Ground, force: number) {
  if (!enabled || !ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.005;
  const v = force * rand(0.8, 1.1);
  switch (ground) {
    case "grass":
      burst(t, 0.17, "bandpass", 850, 0.7, 0.32 * v);
      burst(t + 0.03, 0.12, "highpass", 3200, 0.5, 0.07 * v);
      break;
    case "gravel":
      for (let i = 0; i < 7; i++) burst(t + i * 0.011 + rand(0, 0.012), 0.05, "bandpass", rand(2200, 5200), 1.3, 0.42 * v);
      thump(t, 90, 0.08, 0.16 * v);
      break;
    case "mulch":
      burst(t, 0.15, "lowpass", 650, 0.8, 0.5 * v);
      for (let i = 0; i < 3; i++) burst(t + 0.01 + i * 0.022, 0.04, "bandpass", 1500, 2, 0.16 * v);
      break;
    case "hard":
      burst(t, 0.05, "bandpass", 2300, 1.6, 0.36 * v);
      burst(t + 0.05, 0.04, "bandpass", 3200, 1.6, 0.12 * v);
      thump(t, 115, 0.07, 0.42 * v);
      break;
    case "wood":
      thump(t, 175, 0.13, 0.5 * v);
      burst(t, 0.06, "bandpass", 1100, 2.2, 0.28 * v);
      break;
  }
}

// ── Ambience ─────────────────────────────────────────────────────────────

let wind: { src: AudioBufferSourceNode; gain: GainNode; timer: number } | null = null;
let birdTimer = 0;

function chirp(at: number, pan: number) {
  if (!ctx || !master) return;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(master);
  // A short phrase of falling or rising whistles.
  const notes = Math.round(rand(2, 6));
  const base = rand(2400, 4200);
  const up = Math.random() < 0.5;
  for (let i = 0; i < notes; i++) {
    const s = at + i * rand(0.09, 0.16);
    const o = ctx.createOscillator();
    o.type = "sine";
    const f0 = base * rand(0.9, 1.1);
    o.frequency.setValueAtTime(up ? f0 * 0.8 : f0 * 1.15, s);
    o.frequency.exponentialRampToValueAtTime(up ? f0 * 1.15 : f0 * 0.8, s + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.035, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
    o.connect(g).connect(p);
    o.start(s);
    o.stop(s + 0.1);
  }
}

function scheduleBirds() {
  birdTimer = window.setTimeout(() => {
    if (ctx && enabled) chirp(ctx.currentTime + 0.05, rand(-0.8, 0.8));
    scheduleBirds();
  }, rand(2500, 9000));
}

function startAmbience() {
  if (!ctx || !master || !noise || wind) return;
  // Wind: slow, low noise that swells and settles.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.playbackRate.value = 0.5;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 380;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5);
  src.connect(f).connect(gain).connect(master);
  src.start();
  const timer = window.setInterval(() => {
    if (!ctx) return;
    gain.gain.setTargetAtTime(rand(0.025, 0.075), ctx.currentTime, 1.2);
    f.frequency.setTargetAtTime(rand(260, 520), ctx.currentTime, 1.2);
  }, 2500);
  wind = { src, gain, timer };
  scheduleBirds();
}

function stopAmbience() {
  window.clearTimeout(birdTimer);
  if (!wind || !ctx) return;
  window.clearInterval(wind.timer);
  const w = wind;
  w.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
  w.src.stop(ctx.currentTime + 1.2);
  wind = null;
}
