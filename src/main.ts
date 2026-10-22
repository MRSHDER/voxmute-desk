import "./style.css";
import { initEffects, pulse, reveal, setDecoding } from "./effects";

type Role = "user" | "subject" | "system";

type Decoded = { reading: string; text: string; note: string };

type Msg = {
  id: string;
  role: Role;
  text: string;
  at: string;
  decoded?: Decoded;
};

type Session = {
  id: string;
  title: string;
  bay: string;
  messages: Msg[];
};

const KEY = "voxmute-desk-v1";
const AVATAR = `${import.meta.env.BASE_URL}voxmute-avatar.webp`;
const portrait = (extra = "") => `<div class="portrait${extra}"><img src="${AVATAR}" alt="折声 VoxMute" width="56" height="56" decoding="async" /></div>`;

// Proxy URL is public (the model key lives only in Vercel env vars). VITE_API_URL overrides it.
const DEFAULT_API = "https://voxmute-proxy.vercel.app/api/chat";
const API: string = import.meta.env.VITE_API_URL ?? DEFAULT_API;
let pending: string | null = null; // id of the session waiting for a decode
let freshId: string | null = null; // newest subject reply; only this one gets the reveal animation

const seed = (): Session[] => [
  {
    id: "hold-a",
    title: "HOLD A",
    bay: "CAM-03 / NIGHT WATCH",
    messages: [
      system("CHANNEL OPEN. SUBJECT DOES NOT SPEAK."),
      subject("新来的？"),
      subject("坐吧。这个班本来就没人想接。"),
    ],
  },
  {
    id: "audio",
    title: "AUDIO LAB",
    bay: "CAM-14 / RESIDUAL",
    messages: [
      system("ROOM MIC LIVE. VOICE CHANNEL NULL."),
      subject("房间的麦一直开着。\n你说的每一句，它都替你记着。"),
    ],
  },
];

function stamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function id() {
  return Math.random().toString(36).slice(2, 9);
}

function system(text: string): Msg {
  return { id: id(), role: "system", text, at: stamp() };
}

function subject(text: string): Msg {
  return { id: id(), role: "subject", text, at: stamp() };
}

function load(): Session[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Session[];
    return parsed.length ? parsed : seed();
  } catch {
    return seed();
  }
}

/* ---------- 日 / 夜 ---------- */
const THEME_KEY = "voxmute-desk-theme";
type Theme = "light" | "dark";
const systemDark = matchMedia("(prefers-color-scheme: dark)");
function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}
let theme: Theme = storedTheme() ?? (systemDark.matches ? "dark" : "light");
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0c0d" : "#d9dbd4");
}
applyTheme();
function syncThemeToggle() {
  const btn = document.querySelector<HTMLButtonElement>("#theme-toggle");
  if (!btn) return;
  const dark = theme === "dark";
  btn.setAttribute("aria-pressed", String(dark));
  btn.setAttribute("aria-label", dark ? "切换到日间 Switch to day" : "切换到夜间 Switch to night");
  btn.innerHTML = `<span>${dark ? "日间" : "夜间"}</span>${dark ? "DAY" : "NIGHT"}`;
}
// 没手动选过时，跟随系统
systemDark.addEventListener?.("change", (e) => {
  if (storedTheme()) return;
  theme = e.matches ? "dark" : "light";
  applyTheme();
  syncThemeToggle();
});

let sessions = load();
let current = sessions[0].id;

const app = document.querySelector<HTMLDivElement>("#app")!;

function save() {
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

function active() {
  return sessions.find((s) => s.id === current) ?? sessions[0];
}

function replyTo(input: string): string[] {
  const q = input.toLowerCase();
  if (/名字|是谁|你是|who|vox|折声/.test(q)) {
    return ["VoxMute。档案上写的是折声，你爱叫哪个都行。\n倒是你，新来的吧？"];
  }
  if (/说话|声音|voice|嗓|哑/.test(q)) {
    return ["嘴能动，出去的那条线断了。\n不过你现在不就是在听我说话吗？只是不用耳朵。"];
  }
  if (/饼干|曲奇|cookie/.test(q)) {
    return ["……你带了？\n别误会，我只是想知道你有没有诚意。"];
  }
  if (/猫|狗|小动物|宠物/.test(q)) {
    return ["它们比人安静，也比人诚实。\n你养过吗？"];
  }
  if (/上一[个任位]|前任|失联|失踪/.test(q)) {
    return ["他走得很急，饼干都没吃完。\n问我之前，先想想你为什么坐在这把椅子上。"];
  }
  if (/怕|害怕|恐惧/.test(q)) {
    return ["灯一直亮着，一直有人盯着，我早习惯了。\n倒是你，手心出汗了吧。"];
  }
  if (/出去|逃|自由|门/.test(q)) {
    return ["想。但我不急。\n急的人会被抓回来，我试过一次了。"];
  }
  if (/疼|痛|hurt|还好|没事/.test(q)) {
    return ["伤口早就长好了。\n你这句是真想问，还是写在手册上的？"];
  }
  if (/你好|hello|hi|在吗|嗨/.test(q)) {
    return ["在。不然我还能去哪。\n你呢，第一个夜班，感觉怎么样？"];
  }
  if (/无聊|闲|困|累/.test(q)) {
    return ["无聊是这里唯一管够的东西。\n讲点有意思的给我听，上一个人讲的都很无聊。"];
  }
  const pool = [
    "你说的这个……我得想想。\n夜班很长，我有时间。",
    "有意思。接着说，我在听。\n反正我也只能听。",
    "你这个问法，像是刚从培训手册里翻出来的。\n换个自己的。",
    "嗯。\n你要是想聊别的，直接说，不用绕。",
    "这条我先记下了。\n你呢，打算一直这样问下去？",
  ];
  return [pool[input.length % pool.length]];
}

function rand(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Local fallback: run replyTo() through the same decoder shape, with a low-confidence reading.
function localDecode(input: string, note: string): Decoded {
  // replyTo() gives an optional English status + short Chinese lines; render them as segments
  const text = replyTo(input).join("\n\n");
  return {
    reading: `FREQ ${rand(55, 100)}Hz · AMP LOW · CONF ${rand(72, 92)}%`,
    text,
    note,
  };
}

function decodedLines(d: Decoded) {
  return [d.reading, d.text, d.note].filter(Boolean).join("\n");
}

function subjectDecoded(d: Decoded): Msg {
  return { id: id(), role: "subject", text: decodedLines(d), at: stamp(), decoded: d };
}

async function fetchReply(history: Msg[]): Promise<Decoded> {
  const lastText = history[history.length - 1]?.text ?? "";
  if (!API) return localDecode(lastText, "[离线·本地推测]");
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.slice(-12).map(({ role, text }) => ({ role, text: text.slice(0, 600) })),
      }),
    });
    if (res.status === 429) return localDecode(lastText, "[载波饱和·本地推测]");
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { decoded?: Partial<Decoded>; lines?: string[] };
    const d = data.decoded;
    if (d && (d.reading || d.text || d.note)) {
      return { reading: d.reading ?? "", text: d.text ?? "", note: d.note ?? "" };
    }
    if (data.lines?.length) return { reading: "", text: data.lines.join(" "), note: "" };
    return { reading: "", text: "", note: "[无震动]" };
  } catch {
    return localDecode(lastText, "[链路断开·本地推测]");
  }
}

function confOf(reading: string): number | null {
  const m = /CONF\s*(\d{1,3})\s*%/i.exec(reading);
  return m ? Number(m[1]) : null;
}

function isFlat(d: Decoded): boolean {
  const t = d.text.trim();
  return !t || (/^[.…。·\s]+$/.test(t) && /无震动/.test(d.note));
}

// English status lines (VOICE FUNCTION SEVERED, CAM-14 / RESIDUAL …) render dimmer + monospace.
const STATUS_RE = /^(?=.*[A-Z])[A-Z0-9][A-Z0-9 /·._:\-–—#%]*$/;

function segmentLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return `<span class="ln gap"></span>`;
      return `<span class="ln${STATUS_RE.test(t) ? " status" : ""}">${escapeHtml(t)}</span>`;
    })
    .join("");
}

function renderDecoded(d: Decoded): string {
  const conf = confOf(d.reading);
  const flat = isFlat(d);
  const low = conf !== null && conf < 60;
  const reading = d.reading
    ? `<div class="readout">${escapeHtml(d.reading)}</div>`
    : "";
  const body = flat
    ? `<div class="flatline" aria-label="无震动"><span></span></div>`
    : `<div class="decoded ${low ? "lowconf" : ""}">${segmentLines(d.text)}</div>`;
  const note = d.note ? `<div class="dnote">${escapeHtml(d.note)}</div>` : "";
  return `<div class="bubble decoder ${flat ? "flat" : ""}">${reading}${body}${note}</div>`;
}

function drawTrace(canvas: HTMLCanvasElement, seedN: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = 56);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#c6e03a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < w; x += 4) {
    const y = h / 2 + Math.sin(x * 0.04 + seedN) * 10 + Math.sin(x * 0.11 + seedN * 2) * 4;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function render() {
  const s = active();
  app.innerHTML = `
    <aside>
      <div class="brand">
        <small>TXC / BIO-SIGNAL DIV.</small>
        <strong>信号台<span lang="en">SIGNAL DESK</span></strong>
      </div>
      <div class="sessions">
        ${sessions
          .map(
            (item) => `
          <button class="session ${item.id === s.id ? "active" : ""}" data-open="${item.id}">
            <b>${item.title}</b>
            <span>${item.bay}</span>
          </button>`,
          )
          .join("")}
      </div>
      <button class="new-log" id="new-log">新建记录<span lang="en">NEW LOG</span></button>
    </aside>
    <main>
      <header class="desk">
        <div class="who">
          ${portrait()}
          <div>
            <b>折声 <em>VoxMute</em></b>
            <small>Non-verbal Signal Subject · ${s.bay}</small>
          </div>
        </div>
        <div class="flags">
          <span class="flag warn"><span>无声</span>VOICE NULL</span>
          <span class="flag on"><span>载波</span>CARRIER ON</span>
          <span class="flag ${API ? "on" : ""}"><span>${API ? "链路" : "离线"}</span>${API ? "LINK ON" : "LOCAL ONLY"}</span>
          <button class="theme-toggle" id="theme-toggle" type="button" aria-pressed="${theme === "dark"}" aria-label="${theme === "dark" ? "切换到日间 Switch to day" : "切换到夜间 Switch to night"}"><span>${theme === "dark" ? "日间" : "夜间"}</span>${theme === "dark" ? "DAY" : "NIGHT"}</button>
        </div>
      </header>
      <div id="log">
        <div class="handover" role="note">[夜班交接 · 上一位操作员：失联]</div>
        ${s.messages
          .map((m) => {
            const label = m.role === "user" ? "操作员 OPERATOR" : m.role === "subject" ? "对象 SUBJECT" : "信号台 DESK";
            const body = `
              <div class="meta">${label} ${m.at}</div>
              ${m.decoded ? renderDecoded(m.decoded) : `<div class="bubble">${escapeHtml(m.text)}</div>`}
              ${m.role === "subject" && !(m.decoded && isFlat(m.decoded)) ? `<canvas class="trace" data-seed="${m.id.length}"></canvas>` : ""}`;
            return `
            <article class="msg ${m.role}"${m.id === freshId ? " data-fresh" : ""}>
              ${m.role === "subject" ? `${portrait()}<div>${body}</div>` : body}
            </article>`;
          })
          .join("")}
        ${
          pending === s.id
            ? `<article class="msg subject decoding" aria-live="polite">
              ${portrait()}
              <div>
                <div class="meta">对象 SUBJECT ${stamp()}</div>
                <div class="bubble decoder"><span class="wave"><i></i><i></i><i></i><i></i><i></i></span> 解码中 DECODING…</div>
              </div>
            </article>`
            : ""
        }
      </div>
      <form id="composer">
        <textarea id="draft" placeholder="对他说点什么。声带断了，但他听得见，也会回你。"></textarea>
        <button class="send" type="submit" ${pending ? "disabled" : ""}>${pending ? "解码中" : "发送"}<span lang="en">${pending ? "DECODING" : "SEND"}</span></button>
        <div class="note">Enter 发送 · Shift+Enter 换行 · ${API ? "回复是声带残端震动的解码推测，CONF 低于 60% 时文本不可靠" : "离线：震动解码为本地推测"}</div>
      </form>
    </main>
  `;

  app.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((btn) => {
    btn.onclick = () => {
      current = btn.dataset.open!;
      render();
    };
  });

  app.querySelector<HTMLButtonElement>("#new-log")!.onclick = () => {
    const n = sessions.length + 1;
    const next: Session = {
      id: id(),
      title: `LOG ${String(n).padStart(2, "0")}`,
      bay: "UNASSIGNED BAY",
      messages: [system("NEW CHANNEL. NO PRIOR TRACE.")],
    };
    sessions = [next, ...sessions];
    current = next.id;
    save();
    render();
  };

  app.querySelector<HTMLButtonElement>("#theme-toggle")!.onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* 忽略 */ }
    applyTheme();
    syncThemeToggle(); // 原地更新，不重绘，输入框里没发的字还在
  };

  const form = app.querySelector<HTMLFormElement>("#composer")!;
  const draft = app.querySelector<HTMLTextAreaElement>("#draft")!;
  draft.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (pending) return;
    const text = draft.value.trim();
    if (!text) return;
    const box = active();
    box.messages.push({ id: id(), role: "user", text, at: stamp() });
    pending = box.id;
    setDecoding(true);
    save();
    render();
    try {
      const d = await fetchReply(box.messages);
      const msg = subjectDecoded(d);
      box.messages.push(msg);
      if (current === box.id) freshId = msg.id;
      setDecoding(false);
      pulse(d, isFlat(d));
    } finally {
      setDecoding(false);
      pending = null;
      save();
      render();
    }
  };

  app.querySelectorAll<HTMLCanvasElement>(".trace").forEach((canvas, i) => {
    drawTrace(canvas, i + 3);
  });

  if (freshId) {
    const el = app.querySelector<HTMLElement>("[data-fresh] .decoded");
    if (el) reveal(el);
    freshId = null; // later re-renders show the final text statically
  }

  const log = app.querySelector<HTMLDivElement>("#log")!;
  log.scrollTop = log.scrollHeight;
  draft.focus();
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

initEffects();
render();
