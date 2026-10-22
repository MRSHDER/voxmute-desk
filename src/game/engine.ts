import { ART } from "./art";

// 一个很小的文游引擎：场景、选项、标记（flags）、条件显示。故事本身在 story.ts，改文字不用碰这里。

export type Flags = Record<string, number>;
export type Cond = string; // "flag" 有 · "!flag" 没有 · "flag>=2" 至少 2
export type Para = string | { if: Cond[]; t: string };
export type Choice = { text: string; goto: string; set?: string[]; add?: Flags; show?: Cond[] };
export type Scene = {
  title?: string;
  art?: string; // 道具插图，见 art.ts
  text?: Para[]; // “> ” 开头的行是终端/印刷引用，“~ ” 开头的行是手写批注
  choices?: Choice[];
  auto?: { if?: Cond[]; goto: string }[]; // 无界面的路由场景：按条件跳转
  set?: string[]; // 进入场景时：标记 +1
  add?: Flags; // 进入场景时：累加
  end?: string; // 结局场景
};
export type Story = { start: string; scenes: Record<string, Scene> };
export type Saved = { scene: string; flags: Flags; name: string; done?: boolean };
export type Exit = "enter" | "skip" | "keep" | "apply";

export type Opts = {
  story: Story;
  saved: Saved | null;
  replay: boolean; // 重玩：结局页给“保留现有记录 / 用这个结局重开”两个出口
  canSkip: boolean; // 首次游玩不给跳过（通关才能进终端）；重玩时是“退出序章”
  onSave(s: Saved): void;
  onExit(how: Exit, s: Saved): void;
};

export function holds(flags: Flags, conds: Cond[] = []): boolean {
  return conds.every((c) => {
    if (c.startsWith("!")) return !(flags[c.slice(1)] > 0);
    const m = /^(\w+)>=(\d+)$/.exec(c);
    if (m) return (flags[m[1]] ?? 0) >= Number(m[2]);
    return (flags[c] ?? 0) > 0;
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const cleanName = (s: string) => s.replace(/[\r\n\t<>&"'`{}]+/g, " ").trim().slice(0, 12);

export function mountGame(o: Opts): () => void {
  const { story } = o;
  const state: Saved = o.saved?.scene ? JSON.parse(JSON.stringify(o.saved)) : { scene: "", flags: {}, name: "" };
  const el = document.createElement("div");
  el.id = "game";
  el.setAttribute("aria-live", "polite");
  document.body.append(el);
  document.documentElement.classList.add("in-game");

  const fill = (s: string) => esc(s.replaceAll("{name}", state.name || "新人"));
  const save = () => o.onSave(JSON.parse(JSON.stringify(state)));

  const apply = (set?: string[], add?: Flags) => {
    for (const k of set ?? []) state.flags[k] = (state.flags[k] ?? 0) + 1;
    for (const [k, v] of Object.entries(add ?? {})) state.flags[k] = (state.flags[k] ?? 0) + v;
  };

  function enter(id: string) {
    let cur = id;
    for (let guard = 0; guard < 20; guard++) {
      const sc = story.scenes[cur];
      if (!sc) throw new Error(`unknown scene: ${cur}`);
      apply(sc.set, sc.add);
      if (!sc.auto) break;
      const hit = sc.auto.find((a) => holds(state.flags, a.if));
      if (!hit) break;
      cur = hit.goto;
    }
    state.scene = cur;
    save();
    draw();
    el.scrollTop = 0;
  }

  const topBar = () =>
    `<header class="g-top"><span>夜班手册 <i lang="en">NIGHT SHIFT</i></span>${o.canSkip ? `<button type="button" class="g-skip">${o.replay ? "退出序章" : "跳过序章"}</button>` : ""}</header>`;

  function cover() {
    el.className = "";
    el.innerHTML = `${topBar()}
      <article class="g-sheet g-cover">
        <div class="g-kicker">TXC / BIO-SIGNAL DIV. · 海川研究区域</div>
        <h1>夜班手册<span lang="en">NIGHT SHIFT</span></h1>
        <p class="g-p">你是新调来的夜班监听员。第一个夜班，从交接开始。</p>
        <p class="g-hint">序章大约十分钟。你在这里的选择，会决定今晚终端里的他，怎么对你开口。</p>
        <label class="g-name">操作员姓名 <i lang="en">NAME</i>
          <input id="g-name" maxlength="12" placeholder="新人" autocomplete="off" value="${esc(state.name)}" />
        </label>
        <div class="g-choices show"><button type="button" class="g-go" data-start><b>▶</b> 开始 <i lang="en">BEGIN</i></button></div>
      </article>`;
    const input = el.querySelector<HTMLInputElement>("#g-name")!;
    const begin = () => {
      state.name = cleanName(input.value);
      enter(story.start);
    };
    el.querySelector<HTMLButtonElement>("[data-start]")!.onclick = begin;
    input.addEventListener("keydown", (e) => e.key === "Enter" && begin());
    input.focus();
  }

  function draw() {
    if (!state.scene) return cover();
    const sc = story.scenes[state.scene];
    const paras = (sc.text ?? [])
      .filter((p) => typeof p === "string" || holds(state.flags, p.if))
      .map((p) => (typeof p === "string" ? p : p.t));
    const step = reduced() ? 0 : 0.55;
    const html = paras
      .map((p, i) => {
        const quote = p.startsWith("> ");
        const hand = p.startsWith("~ "); // 手写批注
        const cls = quote ? " g-quote" : hand ? " g-hand" : "";
        return `<p class="g-p${cls}" style="animation-delay:${(i * step).toFixed(2)}s">${fill(quote || hand ? p.slice(2) : p)}</p>`;
      })
      .join("");
    const after = `style="animation-delay:${(paras.length * step + 0.1).toFixed(2)}s"`;

    let tail = "";
    if (sc.end) {
      tail = o.replay
        ? `<div class="g-choices" ${after}>
             <button type="button" data-exit="keep"><b>1</b> 回到信号台 <i lang="en">KEEP MY LOGS</i></button>
             <button type="button" data-exit="apply"><b>2</b> 带着这个结局重开信号台 <i lang="en">RESTART WITH THIS ENDING</i></button>
           </div>`
        : `<div class="g-choices" ${after}><button type="button" data-exit="enter"><b>▶</b> 进入信号台 <i lang="en">ENTER THE DESK</i></button></div>`;
    } else {
      const shown = (sc.choices ?? []).filter((c) => holds(state.flags, c.show));
      tail = `<div class="g-choices" ${after}>${shown
        .map((c, i) => `<button type="button" data-i="${sc.choices!.indexOf(c)}"><b>${i + 1}</b> ${fill(c.text)}</button>`)
        .join("")}</div>`;
    }

    el.className = "";
    el.innerHTML = `${topBar()}
      <article class="g-sheet${sc.end ? " g-ending" : ""}">
        ${sc.title ? `<div class="${sc.end ? "g-stamp" : "g-title"}">${fill(sc.title)}</div>` : ""}
        ${sc.art && ART[sc.art] ? `<figure class="g-art">${ART[sc.art]}</figure>` : ""}
        ${html}${tail}
      </article>`;

    // 线稿逐笔画出来
    el.querySelectorAll<SVGElement>(".g-art .l, .g-art .m, .g-art .a, .g-art .f").forEach((n, i) => {
      n.setAttribute("pathLength", "1");
      if (!reduced()) n.style.animationDelay = `${(i * 0.06).toFixed(2)}s`;
    });

    el.querySelectorAll<HTMLButtonElement>("[data-i]").forEach((b) => {
      b.onclick = () => {
        const c = sc.choices![Number(b.dataset.i)];
        apply(c.set, c.add);
        enter(c.goto);
      };
    });
    el.querySelectorAll<HTMLButtonElement>("[data-exit]").forEach((b) => {
      b.onclick = () => o.onExit(b.dataset.exit as Exit, JSON.parse(JSON.stringify(state)));
    });
    // 逐句出现的时候点一下就全部显示；出现完后把焦点给第一个选项
    const first = el.querySelector<HTMLButtonElement>(".g-choices button");
    if (reduced()) first?.focus();
    else setTimeout(() => first?.focus({ preventScroll: true }), (paras.length * step + 0.4) * 1000);
  }

  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".g-skip")) return o.onExit(o.replay ? "keep" : "skip", JSON.parse(JSON.stringify(state)));
    if (!t.closest("button, input, label")) el.classList.add("instant");
  });

  const onKey = (e: KeyboardEvent) => {
    if (!/^[1-9]$/.test(e.key) || (e.target as HTMLElement).tagName === "INPUT") return;
    el.querySelectorAll<HTMLButtonElement>(".g-choices button")[Number(e.key) - 1]?.click();
  };
  document.addEventListener("keydown", onKey);

  draw();
  return () => {
    document.removeEventListener("keydown", onKey);
    el.remove();
    document.documentElement.classList.remove("in-game");
  };
}

/** 进入终端前的开机过场。点击可跳过。 */
export function bootTransition(lines: string[]): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.id = "boot";
    el.setAttribute("aria-hidden", "true");
    document.body.append(el);
    const quick = reduced();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add("out");
      setTimeout(() => { el.remove(); resolve(); }, quick ? 0 : 450);
    };
    el.addEventListener("click", finish);
    lines.forEach((l, i) => {
      setTimeout(() => {
        if (done) return;
        const p = document.createElement("p");
        p.textContent = l;
        el.append(p);
      }, quick ? 0 : 350 + i * 520);
    });
    setTimeout(finish, quick ? 0 : 350 + lines.length * 520 + 700);
  });
}
