import "./style.css";

type Role = "user" | "subject" | "system";

type Msg = {
  id: string;
  role: Role;
  text: string;
  at: string;
};

type Session = {
  id: string;
  title: string;
  bay: string;
  messages: Msg[];
};

const KEY = "voxmute-desk-v1";

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
          <span class="flag">LOCAL ONLY</span>
        </div>
      </header>
      <div id="log">
        ${s.messages
          .map((m) => {
            const label = m.role === "user" ? "OPERATOR" : m.role === "subject" ? "SUBJECT" : "DESK";
            return `
            <article class="msg ${m.role}">
              <div class="meta">${label} ${m.at}</div>
              <div class="bubble">${escapeHtml(m.text)}</div>
              ${m.role === "subject" ? `<canvas class="trace" data-seed="${m.id.length}"></canvas>` : ""}
            </article>`;
          })
          .join("")}
      </div>
      <form id="composer">
        <textarea id="draft" placeholder="写入观察。对方不会回话，只会回信号。"></textarea>
        <button class="send" type="submit">SEND</button>
        <div class="note">Enter 发送 · Shift+Enter 换行 · 回复写在本地，不接模型</div>
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
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = draft.value.trim();
    if (!text) return;
    const box = active();
    box.messages.push({ id: id(), role: "user", text, at: stamp() });
    for (const line of replyTo(text)) box.messages.push(subject(line));
    save();
    render();
  };

  app.querySelectorAll<HTMLCanvasElement>(".trace").forEach((canvas, i) => {
    drawTrace(canvas, i + 3);
  });

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

render();
