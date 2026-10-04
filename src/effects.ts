// Zero-dependency visual effects: CRT overlay, background vibration waveform,
// decoded-text reveal, and the "soft spot" easter egg.

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

type Mode = "idle" | "decoding" | "flat" | "jam" | "soft";

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
  if (wave.mode === "soft") { targetAmp = 0.05; jitter = 0; speed = 0.45; wave.freqTarget = 0.6; }
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
  if (soft.until > now) wave.mode = "soft";
  if (reduced()) { drawWave(16); setTimeout(() => drawWave(16), 3600); }
}

/* ---------------- 3) decoded text reveal ---------------- */

const GLYPHS = "▓▒░█▚▞#%&@$*+=/\\|<>01ABCDEFXZ折声震载波信号";

export function reveal(el: HTMLElement) {
  const final = el.textContent ?? "";
  if (!final || reduced()) return;
  const chars = Array.from(final);
  const lowconf = el.classList.contains("lowconf");
  el.classList.remove("lowconf"); // run flicker only after reveal
  el.classList.add("glitch-in");
  el.setAttribute("aria-label", final);
  let i = 0;
  const perChar = Math.max(35, Math.min(90, 900 / chars.length));
  let lastStep = 0;
  const tick = (ts: number) => {
    if (!el.isConnected) return; // re-rendered away; final text is in the new DOM
    if (!lastStep) lastStep = ts;
    if (ts - lastStep >= perChar) { i++; lastStep = ts; }
    let out = chars.slice(0, i).join("");
    for (let j = i; j < Math.min(chars.length, i + 3); j++) {
      out += chars[j] === "…" || chars[j] === " " ? chars[j] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (i < chars.length) requestAnimationFrame(tick);
    else {
      el.textContent = final;
      el.classList.remove("glitch-in");
      if (lowconf) el.classList.add("lowconf");
    }
  };
  el.textContent = "";
  requestAnimationFrame(tick);
}

/* ---------------- 4) soft-spot easter egg ---------------- */

const SOFT_RE =
  /曲奇|饼干|cookie|biscuit|小动物|小猫|猫|小狗|狗|兔|鸟|仓鼠|松鼠|刺猬|鸭|小鸡|小羊|\b(?:kitten|kitty|cats?|puppy|puppies|dogs?|bunny|rabbits?|hamsters?|birds?)\b/i;

export function mentionsSoftSpot(text: string) {
  return SOFT_RE.test(text);
}

const soft = { until: 0, timer: 0 as number | undefined, layer: null as HTMLDivElement | null };

export function soften(kind: "cookie" | "animal" | "auto" = "auto", text = "") {
  const k = kind === "auto" ? (/曲奇|饼干|cookie|biscuit/i.test(text) ? "cookie" : "animal") : kind;
  const ms = 6000;
  soft.until = performance.now() + ms;
  document.body.classList.add("soft");
  wave.mode = "soft";
  wave.color = "255,196,140";
  window.clearTimeout(soft.timer);
  soft.timer = window.setTimeout(unsoften, ms);
  if (reduced() || !soft.layer) { drawWave(16); return; }
  soft.layer.replaceChildren();
  const n = window.innerWidth < 600 ? 7 : 11;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    s.className = "crumb";
    s.textContent = k === "cookie" ? (i % 3 ? "·" : "🍪") : "🐾";
    s.style.left = `${5 + Math.random() * 90}%`;
    s.style.animationDelay = `${Math.random() * 2.5}s`;
    s.style.animationDuration = `${4 + Math.random() * 2.5}s`;
    s.style.fontSize = `${k === "cookie" && i % 3 ? 22 : 13 + Math.random() * 8}px`;
    soft.layer.appendChild(s);
  }
}

function unsoften() {
  document.body.classList.remove("soft");
  if (wave.mode === "soft") wave.mode = "idle";
  wave.freqTarget = 1;
  wave.color = "214,255,58";
  soft.layer?.replaceChildren();
  if (reduced()) drawWave(16);
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
  const tint = document.createElement("div");
  tint.className = "soft-tint";
  tint.setAttribute("aria-hidden", "true");
  const layer = document.createElement("div");
  layer.className = "crumbs";
  layer.setAttribute("aria-hidden", "true");
  document.body.prepend(bg);
  document.body.append(tint, layer, crt);

  wave.canvas = bg;
  wave.ctx = bg.getContext("2d");
  soft.layer = layer;
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
