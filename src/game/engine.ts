import { ART } from "./art";
import { gameSound as sound } from "./sound";

// 一个很小的文游引擎：场景、选项、标记（flags）、条件显示。故事本身在 story.ts，改文字不用碰这里。

export type Flags = Record<string, number>;
export type Cond = string; // "flag" 有 · "!flag" 没有 · "flag>=2" 至少 2
export type Para = string | { if: Cond[]; t: string };
export type Sfx = string | { name: string; at: number }; // at：第几段出现时响（缺省为进入时）
export type Choice = { text: string; goto: string; set?: string[]; add?: Flags; show?: Cond[]; sfx?: string[] };
export type Scene = {
  title?: string;
  art?: string; // 道具插图，见 art.ts
  sfx?: Sfx[]; // 进入这一幕时的音效，见 sound.ts
  conf?: number; // 这一幕的“解码置信度”，显示成顶部读数；越低越不可信（默认 90）
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
  clearedAt?: number; // 上一次通关的时间戳（毫秒），封面提示用
  startFlags?: Flags; // 新开一局时的初始标记（比如 loop：之前通关过几次）
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
/** 距今多久，用在“上一次通关在……”和“隔了多久才回来”。 */
export function agoText(ms: number): string {
  const h = ms / 36e5;
  if (h < 1) return "不到一小时";
  if (h < 24) return `${Math.floor(h)} 小时`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} 天` : "很久";
}
/** 本地时钟所处的时段（只在浏览器里用，不记录地点）。 */
export type DayPart = "night" | "morning" | "day" | "evening";
export function dayPart(d = new Date()): DayPart {
  const h = d.getHours();
  return h >= 23 || h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "day" : "evening";
}
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const cleanName = (s: string) => s.replace(/[\r\n\t<>&"'`{}]+/g, " ").trim().slice(0, 12);

export function mountGame(o: Opts): () => void {
  const { story } = o;
  const state: Saved = o.saved?.scene
    ? JSON.parse(JSON.stringify(o.saved))
    : { scene: "", flags: { ...(o.startFlags ?? {}) }, name: "" };
  let resumed = !!o.saved?.scene; // 刷新后续玩：第一幕提示“链路中断”
  const el = document.createElement("div");
  el.id = "game";
  el.setAttribute("aria-live", "polite");
  document.body.append(el);
  document.documentElement.classList.add("in-game");

  const fill = (s: string) =>
    esc(s.replaceAll("{name}", state.name || "新人").replaceAll("{n}", String((state.flags.loop ?? 0) + 1)).replaceAll("{clock}", hhmm()));
  const save = () => o.onSave(JSON.parse(JSON.stringify(state)));

  const apply = (set?: string[], add?: Flags) => {
    for (const k of set ?? []) state.flags[k] = (state.flags[k] ?? 0) + 1;
    for (const [k, v] of Object.entries(add ?? {})) state.flags[k] = (state.flags[k] ?? 0) + v;
  };

  // 本幕里还没响的音效；换幕时清掉，免得上一幕的声音落到下一幕
  let sfxTimers: number[] = [];
  const clearSfx = () => { sfxTimers.forEach((t) => window.clearTimeout(t)); sfxTimers = []; };
  const later = (name: string, ms: number) => {
    if (ms <= 0) return sound.play(name);
    sfxTimers.push(window.setTimeout(() => sound.play(name), ms));
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

  const soundLabel = () => (sound.status === "muted" ? "声音 关" : sound.status === "waiting" ? "声音 点一下启用" : "声音 开");
  const topBar = () =>
    `<header class="g-top"><span>夜班手册 <i lang="en">NIGHT SHIFT</i></span><span class="g-tools"><button type="button" class="g-skip g-snd" aria-pressed="${sound.enabled}">${soundLabel()}</button>${o.canSkip ? `<button type="button" class="g-skip g-exit">${o.replay ? "退出序章" : "跳过序章"}</button>` : ""}</span></header>`;

  // 用玩家本地的真实时间说一句话
  function realTimeLine(): string {
    const now = hhmm();
    switch (dayPart()) {
      case "night": return `此刻是 ${now}。你那边也是深夜，这个点读夜班手册，倒是合适。`;
      case "morning": return `此刻是 ${now}。大早上读夜班手册……手册大概不太高兴。`;
      case "day": return `此刻是 ${now}。大白天来上夜班，班表大概出了点问题。`;
      default: return `此刻是 ${now}。离夜班还早，不过手册不介意。`;
    }
  }

  function cover() {
    el.className = "";
    el.innerHTML = `${topBar()}
      <article class="g-sheet g-cover">
        <div class="g-kicker">TXC / BIO-SIGNAL DIV. · 海川研究区域</div>
        <h1>夜班手册<span lang="en">NIGHT SHIFT</span></h1>
        <p class="g-p">你是新调来的夜班监听员。第一个夜班，从交接开始。</p>
        <p class="g-hint">序章大约十分钟。你在这里的选择，会决定今晚终端里的他，怎么对你开口。<br />以下为解码记录：置信度（CONF）会随内容变化，请勿当作事实。</p>
        <p class="g-hint">${realTimeLine()}</p>
        ${(state.flags.loop ?? 0) > 0 ? `<p class="g-sys">这是你第 ${state.flags.loop + 1} 次接这个夜班${o.clearedAt ? `（上一次通关在 ${agoText(Date.now() - o.clearedAt)}前）` : ""}。</p>` : ""}
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
    if (sc.end) paras.push("> 解码完成。以上为对载波的推测文本，不可当作事实记录。");
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

    const conf = sc.conf ?? 90;
    const hash = [...state.scene].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const amp = conf < 60 ? "HIGH" : conf < 80 ? "MID" : "LOW";
    const readout = sc.end
      ? `DECODE COMPLETE · CONF ${conf}%`
      : `FREQ ${55 + (hash % 46)}Hz · AMP ${amp} · CONF ${conf}%`;
    const notice = resumed ? `<div class="g-sys">[链路中断 · 已恢复]</div>` : "";
    resumed = false;

    el.className = "";
    el.innerHTML = `${topBar()}
      <article class="g-sheet${sc.end ? " g-ending" : ""}">
        ${notice}
        ${sc.title ? `<div class="${sc.end ? "g-stamp" : "g-title"}">${fill(sc.title)}</div>` : ""}
        <div class="g-readout${conf < 60 ? " low" : ""}">${readout}</div>
        ${sc.art && ART[sc.art] ? `<figure class="g-art">${ART[sc.art]}</figure>` : ""}
        ${html}${tail}
      </article>`;

    // 线稿逐笔画出来
    el.querySelectorAll<SVGElement>(".g-art .l, .g-art .m, .g-art .a, .g-art .f").forEach((n, i) => {
      n.setAttribute("pathLength", "1");
      if (!reduced()) n.style.animationDelay = `${(i * 0.06).toFixed(2)}s`;
    });

    // 声音：氛围跟着置信度走，场景音效按段落出现的节奏响，终端引用行有轻轻的打字声
    clearSfx();
    sound.setConf(conf);
    for (const s of sc.sfx ?? []) {
      const name = typeof s === "string" ? s : s.name;
      later(name, (typeof s === "string" ? 0 : s.at) * step * 1000);
    }
    paras.forEach((p, i) => p.startsWith("> ") && later("tick", i * step * 1000));

    el.querySelectorAll<HTMLButtonElement>("[data-i]").forEach((b) => {
      b.onclick = () => {
        const c = sc.choices![Number(b.dataset.i)];
        sound.play("click");
        (c.sfx ?? []).forEach((n) => sound.play(n));
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
    const snd = t.closest<HTMLButtonElement>(".g-snd");
    if (snd) {
      // 想出声但还在等浏览器放行：这一下是“启用”，不是“关掉”
      if (sound.status === "waiting") sound.unlock();
      else sound.setEnabled(!sound.enabled);
      refreshSound();
      return;
    }
    if (t.closest(".g-exit")) return o.onExit(o.replay ? "keep" : "skip", JSON.parse(JSON.stringify(state)));
    if (!t.closest("button, input, label")) el.classList.add("instant");
  });

  // 第一次点击/触摸/按键：建立并启动声音（浏览器不允许自动出声；iOS 认 touchend 和 click）
  const refreshSound = () => {
    const btn = el.querySelector<HTMLButtonElement>(".g-snd");
    if (!btn) return;
    btn.textContent = soundLabel();
    btn.setAttribute("aria-pressed", String(sound.enabled));
  };
  sound.setMode("game");
  sound.onChange = refreshSound;
  const unlock = (ev: Event) => {
    if ((ev.target as HTMLElement | null)?.closest?.(".g-snd")) return; // 声音开关自己处理
    sound.unlock();
    refreshSound();
  };
  for (const type of ["pointerup", "touchend", "click"]) el.addEventListener(type, unlock, true);
  document.addEventListener("keydown", unlock, true);

  const onKey = (e: KeyboardEvent) => {
    if (!/^[1-9]$/.test(e.key) || (e.target as HTMLElement).tagName === "INPUT") return;
    el.querySelectorAll<HTMLButtonElement>(".g-choices button")[Number(e.key) - 1]?.click();
  };
  document.addEventListener("keydown", onKey);

  // 切走标签页 5 秒以上再回来：手册里没有这一条，但它记了一笔
  let hiddenAt = 0;
  const onVis = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (!hiddenAt || !state.scene || story.scenes[state.scene]?.end) return;
    const secs = Math.round((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
    if (secs < 5) return;
    apply(["away"]);
    save();
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    el.querySelector(".g-sheet")?.insertAdjacentHTML("afterbegin", `<div class="g-sys">[操作员离岗 ${mm}:${ss} · 无对应规定，已记录]</div>`);
  };
  document.addEventListener("visibilitychange", onVis);

  draw();
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    document.removeEventListener("keydown", unlock, true);
    sound.onChange = null;
    clearSfx();
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
    sound.play("boot");
    const finish = () => {
      if (done) return;
      done = true;
      sound.setMode("terminal"); // 声音不关，转入终端的轻氛围
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
