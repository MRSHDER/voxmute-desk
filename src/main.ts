import "./style.css";
import { initEffects, pulse, reveal, setDecoding } from "./effects";
import { bootTransition, mountGame, type Saved } from "./game/engine";
import { DEFAULT_RESULT, finishGame, story, type GameResult } from "./game/story";

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

/* ---------- 本地存储（隐私模式等读写失败时静默忽略） ---------- */
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略 */
  }
}

function save() {
  store(KEY, JSON.stringify(sessions));
}

function active() {
  return sessions.find((s) => s.id === current) ?? sessions[0];
}

/* ---------- 熟悉度 ----------
   聊得越多，折声透露得越多。按操作员发过的每一句累计（跨记录，新建 / 删除记录都不影响，
   只有“清空全部”会归零），聊到他在意的东西（曲奇、小动物）额外加分。
   0 陌生 · 1 开始习惯 · 2 熟悉 · 3 信任。代理按这个等级决定他肯讲多少过去。 */
const SCORE_KEY = "voxmute-desk-rapport-v1";
const LIKES = /饼干|曲奇|cookie|猫|狗|小动物|宠物/i;
const textScore = (text: string) => 1 + (LIKES.test(text) ? 2 : 0);
const stageOf = (n: number) => (n >= 25 ? 3 : n >= 12 ? 2 : n >= 5 ? 1 : 0);
let score = Number(recall(SCORE_KEY));
if (recall(SCORE_KEY) === null || !Number.isFinite(score)) {
  // 旧版本没存过分数：按已有记录补算一次
  score = sessions.reduce((sum, s) => sum + s.messages.filter((x) => x.role === "user").reduce((n, x) => n + textScore(x.text), 0), 0);
  store(SCORE_KEY, String(score));
}

/* ---------- 记忆 ----------
   WINDOW：每次发给模型的最近消息条数（当前记录，不含系统提示行）。
   notes：跨记录的“操作员备忘”，每聊 MEMO_EVERY 句由代理整理一次，随每次对话一起发出，
   这样聊长了他也记得你说过的名字、答应过的事、他自己已经讲过的过去。 */
const NOTES_KEY = "voxmute-desk-notes-v1";
const WINDOW = 30;
const MEMO_EVERY = 6;
let notes = recall(NOTES_KEY) ?? "";

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
    return stageOf(score) >= 2
      ? ["病院后院以前有只瘸腿的猫。我每天留一半饭，隔着铁丝网递给它。\n后来它不见了。……别问了。"]
      : ["它们比人安静，也比人诚实。\n你养过吗？"];
  }
  if (/上一[个任位]|前任|失联|失踪/.test(q)) {
    return stageOf(score) >= 2
      ? ["他和你不一样，他会半夜把灯关掉。\n后来他被叫去三楼谈话，就没回来。他们谈了什么，我也不知道。"]
      : ["我们认识吗？\n这种事，等你坐满几个班再问。"];
  }
  if (/过去|以前|经历|怎么进来|为什么在这|声带|怎么没的|医院|病院/.test(q)) {
    return stageOf(score) >= 2
      ? ["病院里待了很多年。他们说我是稳定的病例，因为我从不吵闹。\n其实我只是在记他们换班的时间。"]
      : ["你这个问法，像在填表。\n我们还没熟到那一步。"];
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

function recentOf(history: Msg[]) {
  return history
    .filter((m) => m.role !== "system")
    .slice(-WINDOW)
    .map(({ role, text }) => ({ role, text: text.slice(0, 600) }));
}

// 每聊 MEMO_EVERY 句，让代理把最近的对话整理进备忘；失败就算了，下次再试。
async function updateMemo(box: Session) {
  if (!API) return;
  const said = box.messages.filter((m) => m.role === "user").length;
  if (!said || said % MEMO_EVERY) return;
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "memo", messages: recentOf(box.messages), notes }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { notes?: unknown };
    if (typeof data.notes !== "string") return;
    notes = data.notes.slice(0, 800);
    store(NOTES_KEY, notes);
    const field = document.querySelector<HTMLTextAreaElement>("#memo");
    if (field && document.querySelector<HTMLDialogElement>("#files")?.open !== true) field.value = notes;
  } catch {
    /* 忽略 */
  }
}

async function fetchReply(history: Msg[]): Promise<Decoded> {
  const lastText = history[history.length - 1]?.text ?? "";
  if (!API) return localDecode(lastText, "[离线·本地推测]");
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: recentOf(history),
        rapport: stageOf(score),
        notes,
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
          <button class="theme-toggle" id="files-btn" type="button" aria-haspopup="dialog"><span>档案</span>FILES</button>
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

  app.querySelector<HTMLButtonElement>("#files-btn")!.onclick = openFiles;

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
    score += textScore(text);
    store(SCORE_KEY, String(score));
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
      void updateMemo(box);
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

/* ---------- 档案管理：备忘 / 导出 / 删除 / 清空 ---------- */
const files = document.createElement("dialog");
files.id = "files";
files.setAttribute("aria-labelledby", "files-title");
files.innerHTML = `
  <form method="dialog" class="files-box">
    <h2 id="files-title">档案管理 <span lang="en">ARCHIVE</span></h2>
    <label class="files-label" for="memo">他记得的事 <span lang="en">MEMO</span></label>
    <p class="files-hint">每聊 ${MEMO_EVERY} 句会自动整理一次。你也可以直接改，下次对话就按改过的来。</p>
    <textarea id="memo" rows="7" maxlength="800" placeholder="（还没有备忘。多聊几句之后会自动出现。）"></textarea>
    <div class="files-row"><button type="button" id="memo-clear">清空备忘</button></div>
    <hr />
    <div class="files-row">
      <button type="button" id="log-export">导出当前记录 <span lang="en">.txt</span></button>
      <button type="button" id="log-delete">删除当前记录</button>
    </div>
    <div class="files-row">
      <button type="button" id="game-replay">重玩序章 <span lang="en">REPLAY PROLOGUE</span></button>
      <button type="button" id="all-reset" class="danger">清空全部，重新开始</button>
    </div>
    <div class="files-row end"><button value="close">关闭 <span lang="en">CLOSE</span></button></div>
  </form>`;
document.body.append(files);

const memoField = files.querySelector<HTMLTextAreaElement>("#memo")!;
memoField.addEventListener("input", () => {
  notes = memoField.value.slice(0, 800);
  store(NOTES_KEY, notes);
});
files.querySelector<HTMLButtonElement>("#memo-clear")!.onclick = () => {
  if (!confirm("清空他的备忘？之后他会忘掉这些事。")) return;
  notes = "";
  store(NOTES_KEY, "");
  memoField.value = "";
};
files.querySelector<HTMLButtonElement>("#log-export")!.onclick = () => {
  const s = active();
  const who = (r: Role) => (r === "user" ? "操作员" : r === "subject" ? "对象" : "信号台");
  const text = [
    `折声 VoxMute · ${s.title}（${s.bay}）`,
    `导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    "",
    ...s.messages.map((m) => `[${m.at}] ${who(m.role)}：${m.text}`),
    "",
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = `voxmute-${s.title.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
files.querySelector<HTMLButtonElement>("#log-delete")!.onclick = () => {
  const s = active();
  if (!confirm(`删除记录「${s.title}」？这条记录的聊天会一起删掉，不能撤销。（他对你的熟悉度和备忘不受影响）`)) return;
  sessions = sessions.filter((x) => x.id !== s.id);
  if (!sessions.length) sessions = seed();
  current = sessions[0].id;
  save();
  files.close();
  render();
};
files.querySelector<HTMLButtonElement>("#all-reset")!.onclick = () => {
  if (!confirm("清空全部？所有记录、他的备忘、他对你的熟悉度都会归零，序章也会重新开始。不能撤销。")) return;
  sessions = seed();
  current = sessions[0].id;
  notes = "";
  score = 0;
  save();
  store(NOTES_KEY, "");
  store(SCORE_KEY, "0");
  memoField.value = "";
  files.close();
  game = { scene: "", flags: {}, name: "", done: false };
  store(GAME_KEY, JSON.stringify(game));
  history = [];
  store(HISTORY_KEY, "[]");
  playGame(false);
};
files.querySelector<HTMLButtonElement>("#game-replay")!.onclick = () => {
  files.close();
  playGame(true);
};
files.addEventListener("click", (e) => {
  if (e.target === files) files.close(); // 点遮罩关闭
});

function openFiles() {
  memoField.value = notes;
  files.showModal();
}

/* ---------- 序章（文游）：玩完才进终端 ----------
   选择会换算成终端的起点：熟悉度、备忘、折声的第一句话（见 game/story.ts 的 finishGame）。
   序章上线前就用过终端的老访客直接进终端；随时可以“跳过序章”，或在“档案”里重玩。 */
const GAME_KEY = "voxmute-desk-game-v1";
function loadGame(): Saved | null {
  const raw = recall(GAME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Saved;
  } catch {
    return null;
  }
}
let game = loadGame();
if (!game && recall(KEY) !== null) {
  game = { scene: "", flags: {}, name: "", done: true };
  store(GAME_KEY, JSON.stringify(game));
}
// 通关过的结局（按时间顺序）。重玩时用来让游戏“记得你来过”：封面提示、场景里的熟悉感、折声的备忘。
const HISTORY_KEY = "voxmute-desk-history-v1";
let history: string[] = [];
try {
  const raw = JSON.parse(recall(HISTORY_KEY) ?? "[]");
  if (Array.isArray(raw)) history = raw.filter((x): x is string => typeof x === "string");
} catch {
  /* 忽略 */
}
let stopGame: (() => void) | null = null;

function applyResult(r: GameResult) {
  sessions = seed();
  sessions[0].messages = [system("CHANNEL OPEN. SUBJECT DOES NOT SPEAK."), ...r.opener.map(subject)];
  current = sessions[0].id;
  notes = r.notes;
  score = r.score;
  save();
  store(NOTES_KEY, notes);
  store(SCORE_KEY, String(score));
}

function enterDesk() {
  app.hidden = false;
  render();
}

function playGame(replay: boolean) {
  stopGame?.();
  app.hidden = true;
  stopGame = mountGame({
    story,
    saved: replay ? null : game,
    replay,
    startFlags: { loop: history.length },
    // 首次游玩必须通关才能进终端；重玩时是“退出序章”。开发调试可在网址后加 ?skip
    canSkip: replay || new URLSearchParams(location.search).has("skip"),
    onSave: (s) => {
      if (replay) return; // 重玩的进度不覆盖真正的存档
      game = s;
      store(GAME_KEY, JSON.stringify(s));
    },
    onExit: (how, s) => {
      stopGame?.();
      stopGame = null;
      // 走到结局才算一次通关（中途“退出序章”不算）
      const reached = story.scenes[s.scene]?.end;
      const prior = history.slice();
      if (reached && how !== "skip") {
        history.push(reached);
        store(HISTORY_KEY, JSON.stringify(history));
      }
      if (how === "keep") return enterDesk();
      if (how === "skip") {
        game = { scene: "", flags: {}, name: "", done: true };
        store(GAME_KEY, JSON.stringify(game));
        applyResult(DEFAULT_RESULT);
        return enterDesk();
      }
      // enter / apply：把结局写进终端，再开机
      applyResult(finishGame(s.flags, s.name, prior));
      game = { ...(replay ? (game ?? s) : s), done: true };
      store(GAME_KEY, JSON.stringify(game));
      const boot = bootTransition(["TXC / BIO-SIGNAL DIV.", `OPERATOR: ${s.name || "新人"}`, "CAM-14 / RESIDUAL", "CHANNEL OPEN. SUBJECT DOES NOT SPEAK."]);
      enterDesk();
      void boot;
    },
  });
}

initEffects();
if (game?.done) enterDesk();
else playGame(false);
