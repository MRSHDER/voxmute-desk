// Zero-dependency visual effects: CRT overlay, background vibration waveform,
// and decoded-text reveal.

export type Decoded = { reading: string; text: string; note: string };

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- 1) CRT scanlines + noise ---------------- */

function makeNoiseTile(size = 96): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

/* ---------------- 2) background waveform ---------------- */

type Mode = "idle" | "decoding" | "flat" | "jam";

const wave = {
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  w: 0,
  h: 0,
  dpr: 1,
  t: 0,
  amp: 0.06, // current amplitude (fraction of height)
  base: 0.06, // idle amplitude it settles back to
  freq: 1, // spatial frequency multiplier
  freqTarget: 1,
  jitter: 0.02,
  mode: "idle" as Mode,
  modeUntil: 0,
  raf: 0,
  last: 0,
  color: "214,255,58",
};

function resize() {
  const c = wave.canvas;
  if (!c) return;
  wave.dpr = Math.min(window.devicePixelRatio || 1, 2);
  wave.w = c.clientWidth;
  wave.h = c.clientHeight;
  c.width = Math.round(wave.w * wave.dpr);
  c.height = Math.round(wave.h * wave.dpr);
  wave.ctx?.setTransform(wave.dpr, 0, 0, wave.dpr, 0, 0);
  if (reduced()) drawWave(0);
}

function drawWave(dt: number) {
  const { ctx, w, h } = wave;
  if (!ctx || !w) return;
  const now = performance.now();
  if (wave.modeUntil && now > wave.modeUntil) {
    wave.mode = "idle";
    wave.modeUntil = 0;
  }
  const k = Math.min(dt / 1000, 0.1);
  // ease amplitude / freq back toward targets
  let targetAmp = wave.base;
  let speed = 1.4;
  let jitter = wave.jitter;
  if (wave.mode === "decoding") { targetAmp = 0.12; speed = 3.2; jitter = 0.05; }
  if (wave.mode === "flat") { targetAmp = 0; jitter = 0; speed = 0.4; }
  if (wave.mode === "jam") { targetAmp = 0.05; jitter = 0.22; speed = 6; }
  wave.amp += (targetAmp - wave.amp) * (1 - Math.exp(-k * 1.3));
  wave.freq += (wave.freqTarget - wave.freq) * (1 - Math.exp(-k * 1.5));
  wave.t += k * speed;

  ctx.clearRect(0, 0, w, h);
  const mid = h * 0.55;
  const A = wave.amp * h;
  const step = w < 500 ? 4 : 3;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = `rgba(${wave.color},0.32)`;
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) {
    const u = x / w;
    const env = Math.sin(Math.PI * u) ** 0.6; // taper at edges
    let y =
      Math.sin(u * 14 * wave.freq + wave.t * 2.1) * 0.6 +
      Math.sin(u * 37 * wave.freq - wave.t * 3.3) * 0.28 +
      Math.sin(u * 5 + wave.t * 0.7) * 0.12;
    if (jitter) y += (Math.random() - 0.5) * jitter * 8;
    y = mid + y * A * env;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  // faint baseline
  ctx.strokeStyle = `rgba(${wave.color},0.07)`;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
}

function loop(ts: number) {
  const dt = wave.last ? ts - wave.last : 16;
  wave.last = ts;
  drawWave(dt);
  wave.raf = requestAnimationFrame(loop);
}

function start() {
  if (reduced() || wave.raf || document.hidden) return;
  wave.last = 0;
  wave.raf = requestAnimationFrame(loop);
}

function stop() {
  cancelAnimationFrame(wave.raf);
  wave.raf = 0;
}

function parseReading(reading: string) {
  const f = /FREQ\s*(\d{1,4})/i.exec(reading);
  const a = /AMP\s*([A-Z]+)/i.exec(reading);
  const c = /CONF\s*(\d{1,3})/i.exec(reading);
  return {
    freq: f ? Number(f[1]) : 80,
    amp: a ? a[1].toUpperCase() : "LOW",
    conf: c ? Number(c[1]) : 60,
  };
}

export function setDecoding(on: boolean) {
  if (on) { wave.mode = "decoding"; wave.modeUntil = 0; }
  else if (wave.mode === "decoding") wave.mode = "idle";
  if (reduced()) drawWave(16);
}

export function pulse(d: Decoded, flat: boolean) {
  const now = performance.now();
  if (flat) {
    wave.mode = "flat";
    wave.modeUntil = now + 3500;
  } else if (/信号干扰/.test(d.note)) {
    wave.mode = "jam";
    wave.modeUntil = now + 2200;
  } else {
    const r = parseReading(d.reading);
    const ampMul = r.amp === "HIGH" ? 0.34 : r.amp === "MID" || r.amp === "MED" ? 0.24 : r.amp === "NULL" ? 0.02 : 0.16;
    wave.mode = "idle";
    wave.amp = ampMul; // spike, then ease back to base
    wave.freqTarget = Math.max(0.4, Math.min(3, r.freq / 80));
    wave.freq = wave.freqTarget * 1.6;
    wave.jitter = Math.max(0.005, (100 - r.conf) / 1500);
    setTimeout(() => { wave.freqTarget = 1; wave.jitter = 0.02; }, 2600);
  }
  if (reduced()) { drawWave(16); setTimeout(() => drawWave(16), 3600); }
}

/* ---------------- 3) decoded text reveal ---------------- */

const GLYPHS = "▓▒░█▚▞#%&@$*+=/\\|<>01ABCDEFXZ折声震载波信号";

export function reveal(el: HTMLElement) {
  // Reveal line by line (".ln" children) so multi-segment replies keep their layout.
  const targets = Array.from(el.querySelectorAll<HTMLElement>(".ln:not(.gap)"));
  if (!targets.length && el.textContent) targets.push(el);
  if (!targets.length || reduced()) return;
  const finals = targets.map((t) => t.textContent ?? "");
  const total = finals.reduce((n, f) => n + Array.from(f).length, 0);
  const lowconf = el.classList.contains("lowconf");
  el.classList.remove("lowconf"); // run flicker only after reveal
  el.classList.add("glitch-in");
  el.setAttribute("aria-label", finals.join(" "));
  targets.forEach((t) => (t.textContent = "\u00a0"));
  const perChar = Math.max(18, Math.min(70, 1400 / Math.max(total, 1)));
  let line = 0;
  let i = 0;
  let lastStep = 0;
  const tick = (ts: number) => {
    if (!el.isConnected) return; // re-rendered away; final text is in the new DOM
    if (!lastStep) lastStep = ts;
    if (ts - lastStep >= perChar) { i++; lastStep = ts; }
    const chars = Array.from(finals[line]);
    let out = chars.slice(0, i).join("");
    for (let j = i; j < Math.min(chars.length, i + 3); j++) {
      out += chars[j] === "…" || chars[j] === " " ? chars[j] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    targets[line].textContent = out || "\u00a0";
    if (i >= chars.length) {
      targets[line].textContent = finals[line];
      line++;
      i = 0;
    }
    if (line < targets.length) requestAnimationFrame(tick);
    else {
      el.classList.remove("glitch-in");
      if (lowconf) el.classList.add("lowconf");
    }
  };
  requestAnimationFrame(tick);
}

/* ---------------- setup (once, outside #app so render() never touches it) ---------------- */

export function initEffects() {
  const bg = document.createElement("canvas");
  bg.id = "bgwave";
  bg.setAttribute("aria-hidden", "true");
  const crt = document.createElement("div");
  crt.className = "crt";
  crt.setAttribute("aria-hidden", "true");
  const noise = makeNoiseTile();
  if (noise) crt.style.setProperty("--noise", `url(${noise})`);
  document.body.prepend(bg);
  document.body.append(crt);

  wave.canvas = bg;
  wave.ctx = bg.getContext("2d");
  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => {
    stop();
    resize();
    start();
  });
  if (reduced()) drawWave(16);
  else start();
}
