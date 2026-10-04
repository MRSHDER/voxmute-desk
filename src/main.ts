import "./style.css";
import { initEffects, mentionsSoftSpot, pulse, reveal, setDecoding, soften } from "./effects";

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
      subject("……"),
      subject("载波还在。不要等句子。"),
    ],
  },
  {
    id: "audio",
    title: "AUDIO LAB",
    bay: "CAM-14 / RESIDUAL",
    messages: [
      system("ROOM MIC LIVE. VOICE CHANNEL NULL."),
      subject("灯关了也还在。"),
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
  if (/名字|是谁|who|vox|折声/.test(q)) {
    return ["VoxMute。", "折声。档案上就这两行。"];
  }
  if (/说话|声音|voice|说/.test(q)) {
    return ["VOICE FUNCTION SEVERED", "嘴能动。出去的那条断了。"];
  }
  if (/信号|signal|听/.test(q)) {
    return ["SIGNAL STILL ACTIVE", "房间麦能收到。不要把它写成话。"];
  }
  if (/疼|痛|hurt|还好/.test(q)) {
    return ["体征平稳。", "这个问题没有出口。"];
  }
  if (/你好|hello|hi|在吗/.test(q)) {
    return ["在。", "不是用声音在。"];
  }
  const pool = [
    "收到。不回答。",
    "载波偏移了一下。",
    "不要提示语。",
    "还在。",
    "这条不进语音通道。",
  ];
  return [pool[input.length % pool.length]];
}

function rand(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Local fallback: run replyTo() through the same decoder shape, with a low-confidence reading.
function localDecode(input: string, note: string): Decoded {
  const lines = replyTo(input);
  const zh = lines.filter((l) => /[\u4e00-\u9fff]/.test(l));
  const text = (zh[zh.length - 1] ?? lines[lines.length - 1] ?? "…").slice(0, 16);
  return {
    reading: `FREQ ${rand(30, 110)}Hz · AMP LOW · CONF ${rand(28, 55)}%`,
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

function renderDecoded(d: Decoded): string {
  const conf = confOf(d.reading);
  const flat = isFlat(d);
  const low = conf !== null && conf < 60;
  const reading = d.reading
    ? `<div class="readout">${escapeHtml(d.reading)}</div>`
    : "";
  const body = flat
    ? `<div class="flatline" aria-label="无震动"><span></span></div>`
    : `<div class="decoded ${low ? "lowconf" : ""}">${escapeHtml(d.text)}</div>`;
  const note = d.note ? `<div class="dnote">${escapeHtml(d.note)}</div>` : "";
  return `<div class="bubble decoder ${flat ? "flat" : ""}">${reading}${body}${note}</div>`;
}

function drawTrace(canvas: HTMLCanvasElement, seedN: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = 56);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#d6ff3a";
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
        <strong>SIGNAL DESK</strong>
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
      <button class="new-log" id="new-log">NEW LOG</button>
    </aside>
    <main>
      <header class="desk">
        <div class="who">
          <div class="mark">VM</div>
          <div>
            <div>VoxMute / <em>折声</em></div>
            <small>Non-verbal Signal Subject · ${s.bay}</small>
          </div>
        </div>
        <div class="flags">
          <span class="flag warn">VOICE NULL</span>
          <span class="flag on">CARRIER ON</span>
          <span class="flag ${API ? "on" : ""}">${API ? "LINK ON" : "LOCAL ONLY"}</span>
        </div>
      </header>
      <div id="log">
        <div class="handover" role="note">[夜班交接 · 上一位操作员：失联]</div>
        ${s.messages
          .map((m) => {
            const label = m.role === "user" ? "OPERATOR" : m.role === "subject" ? "SUBJECT" : "DESK";
            return `
            <article class="msg ${m.role}"${m.id === freshId ? " data-fresh" : ""}>
              <div class="meta">${label} ${m.at}</div>
              ${m.decoded ? renderDecoded(m.decoded) : `<div class="bubble">${escapeHtml(m.text)}</div>`}
              ${m.role === "subject" && !(m.decoded && isFlat(m.decoded)) ? `<canvas class="trace" data-seed="${m.id.length}"></canvas>` : ""}
            </article>`;
          })
          .join("")}
        ${
          pending === s.id
            ? `<article class="msg subject decoding" aria-live="polite">
              <div class="meta">SUBJECT ${stamp()}</div>
              <div class="bubble decoder"><span class="wave"><i></i><i></i><i></i><i></i><i></i></span> DECODING…</div>
            </article>`
            : ""
        }
      </div>
      <form id="composer">
        <textarea id="draft" placeholder="写入观察。对方不会回话，解码器只读声带残端的震动。"></textarea>
        <button class="send" type="submit" ${pending ? "disabled" : ""}>${pending ? "DECODING" : "SEND"}</button>
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
    if (mentionsSoftSpot(text)) soften("auto", text);
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
      if (mentionsSoftSpot(d.text)) soften("auto", d.text);
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
