// Zero-dependency visual effects: paper-grain overlay and decoded-text reveal.

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- decoded text reveal ---------------- */

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
  const crt = document.createElement("div");
  crt.className = "crt";
  crt.setAttribute("aria-hidden", "true");
  document.body.append(crt);
}
