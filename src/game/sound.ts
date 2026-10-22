// 序章的配乐与音效：全部用 Web Audio 实时合成，没有音频文件，声音语言和 voxmute-archive 一致
// （冷色调的持续和声、磁带底噪、载波音、钟片单音）。底噪的明暗跟着每一幕的解码置信度走：越不可信，越不稳。
// 浏览器不允许未经操作自动出声：由序章里的第一次点击（“开始”）建立并启动。

const KEY = "voxmute-desk-game-sound";
const LEVEL = 0.8; // 总音量

class GameSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padGain!: GainNode;
  private padFilter!: BiquadFilterNode;
  private diss!: GainNode;
  private hiss!: GainNode;
  private carrierGain!: GainNode;
  private carrierOsc!: OscillatorNode;
  private vibAmt!: GainNode;
  private noise!: AudioBuffer;
  private bellTimer = 0;
  private closeTimer = 0;
  private holds = new Set<number>();
  enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== "off";
    } catch {
      /* 读不到就用默认：开 */
    }
  }

  private ok(): boolean {
    return !!this.ctx && this.enabled && this.ctx.state !== "closed";
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // 偏暖的粉噪（底噪和音效共用）
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 3; }

    // 持续和声 D2 A2 C3 F3
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass"; this.padFilter.frequency.value = 380; this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.07;
    this.padFilter.connect(this.padGain).connect(this.master);
    for (const f of [73.42, 110, 130.81, 174.61]) {
      for (const det of [-6, 5]) {
        const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = f < 100 ? 0.5 : 0.28;
        o.connect(g).connect(this.padFilter); o.start();
      }
    }
    // 不协和的两个音：置信度低时才推上来，让和声发涩
    this.diss = ctx.createGain(); this.diss.gain.value = 0;
    this.diss.connect(this.padFilter);
    for (const f of [116.54, 123.47]) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(this.diss); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 120;
    lfo.connect(lfoAmt).connect(this.padFilter.frequency); lfo.start();

    // 磁带底噪
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noise; hiss.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = 2400; hf.Q.value = 0.5;
    this.hiss = ctx.createGain(); this.hiss.gain.value = 0.012;
    hiss.connect(hf).connect(this.hiss).connect(this.master); hiss.start();

    // 载波：348 Hz 带一点颤音，平时无声，由场景拉起
    this.carrierOsc = ctx.createOscillator(); this.carrierOsc.type = "sine"; this.carrierOsc.frequency.value = 348;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    this.vibAmt = ctx.createGain(); this.vibAmt.gain.value = 1.5;
    vib.connect(this.vibAmt).connect(this.carrierOsc.frequency); vib.start();
    this.carrierGain = ctx.createGain(); this.carrierGain.gain.value = 0;
    this.carrierOsc.connect(this.carrierGain).connect(this.master); this.carrierOsc.start();
  }

  /** 第一次点击/按键时调用：建立并启动。 */
  unlock() {
    if (!this.enabled) return;
    try {
      window.clearTimeout(this.closeTimer);
      if (!this.ctx || this.ctx.state === "closed") this.build();
      const ctx = this.ctx!;
      if (ctx.state !== "running") void ctx.resume();
      this.master.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.6);
      if (!this.bellTimer) this.scheduleBell(7);
    } catch {
      /* 不支持 Web Audio：静音继续 */
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* 忽略 */
    }
    if (!this.ctx || this.ctx.state === "closed") {
      if (on) this.unlock();
      return;
    }
    this.master.gain.setTargetAtTime(on ? LEVEL : 0, this.ctx.currentTime, 0.15);
    if (!on) { window.clearTimeout(this.bellTimer); this.bellTimer = 0; }
    else if (!this.bellTimer) this.scheduleBell(4);
  }

  /** 淡出并关闭。fade 单位秒。 */
  stop(fade = 0.8) {
    window.clearTimeout(this.bellTimer);
    this.bellTimer = 0;
    this.holds.forEach((h) => window.clearTimeout(h));
    this.holds.clear();
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      void ctx.close().catch(() => {});
      if (this.ctx === ctx) this.ctx = null;
    }, (fade + 0.4) * 1000);
  }

  /** 每一幕的解码置信度：越低，滤波越亮、不协和音越响、底噪越重。 */
  setConf(conf: number) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.padFilter.frequency.setTargetAtTime(380 + Math.max(0, 90 - conf) * 7, t, 0.9);
    this.diss.gain.setTargetAtTime(Math.min(0.04, (Math.max(0, 70 - conf) / 25) * 0.035), t, 0.9);
    this.hiss.gain.setTargetAtTime(0.012 + (Math.max(0, 75 - conf) / 35) * 0.02, t, 0.9);
  }

  /* ---------------- 零件 ---------------- */

  private scheduleBell(delay: number) {
    window.clearTimeout(this.bellTimer);
    this.bellTimer = window.setTimeout(() => {
      if (!this.ok()) { this.bellTimer = 0; return; }
      const notes = [587.33, 698.46, 880, 1046.5, 1174.66];
      this.bell(notes[Math.floor(Math.random() * notes.length)], 0.04);
      this.scheduleBell(9 + Math.random() * 9);
    }, delay * 1000);
  }

  private bell(freq = 880, level = 0.05, at = 0) {
    if (!this.ok()) return;
    const ctx = this.ctx!, t = ctx.currentTime + at;
    for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 / mult);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 3.5);
    }
  }

  private burst(dur: number, type: BiquadFilterType, freq: number, level: number, q = 1, at = 0) {
    if (!this.ok()) return;
    const ctx = this.ctx!, t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur);
  }

  private tone(freq: number, dur: number, level: number, o: { type?: OscillatorType; to?: number; at?: number; lp?: number } = {}) {
    if (!this.ok()) return;
    const ctx = this.ctx!, t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator(); osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level, t + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /** 载波拉起一阵再落回去。 */
  private swell(peak: number, up: number, hold: number, down: number, from = 348, to = 372) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.carrierGain.gain.cancelScheduledValues(t);
    this.carrierGain.gain.setValueAtTime(this.carrierGain.gain.value, t);
    this.carrierGain.gain.linearRampToValueAtTime(peak, t + up);
    this.carrierGain.gain.setValueAtTime(peak, t + up + hold);
    this.carrierGain.gain.linearRampToValueAtTime(0, t + up + hold + down);
    this.carrierOsc.frequency.setValueAtTime(from, t);
    this.carrierOsc.frequency.linearRampToValueAtTime(to, t + up);
  }

  /* ---------------- 音效 ---------------- */

  play(name: string) {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    switch (name) {
      case "click": this.burst(0.03, "highpass", 2500, 0.05); this.tone(660, 0.06, 0.02, { type: "triangle" }); break;
      case "tick": this.tone(1900, 0.02, 0.012, { type: "square", lp: 3000 }); break;
      case "page": this.burst(0.35, "bandpass", 1800, 0.08, 0.6); break;
      case "rustle": [0, 0.07, 0.15].forEach((d, i) => this.burst(0.09, "bandpass", 1500 + i * 500, 0.05, 0.8, d)); break;
      case "beep": this.tone(1046, 0.08, 0.04, { type: "square", lp: 2400 }); this.tone(1568, 0.14, 0.04, { type: "square", lp: 2400, at: 0.1 }); break;
      case "camera": this.tone(1800, 0.05, 0.03); this.tone(1800, 0.05, 0.02, { at: 0.12 }); break;
      case "blip2": this.tone(1760, 0.04, 0.03, { type: "square", lp: 2600 }); this.tone(1760, 0.04, 0.03, { type: "square", lp: 2600, at: 0.16 }); break;
      case "key": [2400, 3200, 4100].forEach((f, i) => this.tone(f, 0.18, 0.025 / (i + 1), { at: i * 0.03 })); this.burst(0.05, "highpass", 3000, 0.04); break;
      case "drawer": this.burst(0.4, "lowpass", 500, 0.09); this.tone(90, 0.12, 0.12, { to: 50, at: 0.38 }); break;
      case "hatch": this.burst(0.25, "lowpass", 700, 0.08); this.tone(1700, 0.2, 0.035, { at: 0.26 }); break;
      case "crunch": [0, 0.07, 0.15, 0.24].forEach((d) => this.burst(0.05, "highpass", 1200, 0.12, 0.7, d)); break;
      case "terminal": [880, 988, 1175].forEach((f, i) => this.tone(f, 0.07, 0.03, { type: "square", lp: 2200, at: i * 0.11 })); break;
      case "carrierUp": this.swell(0.045, 1.0, 0.3, 1.6); break;
      case "knock":
        [0, 0.3].forEach((d) => { this.tone(95, 0.14, 0.3, { to: 55, at: d }); this.burst(0.1, "lowpass", 260, 0.2, 1, d); });
        break;
      case "switch": {
        this.burst(0.012, "highpass", 4000, 0.3); this.tone(300, 0.03, 0.08, { type: "square", lp: 1200 });
        this.tone(120, 1.4, 0.08, { to: 45, at: 0.05 });
        // 和声被“关掉”一阵
        const t = ctx.currentTime;
        this.padGain.gain.setTargetAtTime(0.015, t + 0.05, 0.15);
        this.padGain.gain.setTargetAtTime(0.07, t + 3.2, 0.9);
        break;
      }
      case "glitch":
        for (let i = 0; i < 6; i++) this.tone(800 + Math.random() * 1700, 0.035, 0.03, { type: "square", lp: 3000, at: i * 0.045 });
        this.burst(0.2, "bandpass", 3200, 0.05, 1.5);
        break;
      case "steady": {
        // 载波稳下来：去掉颤音，一条拉直的线
        const t = ctx.currentTime;
        this.vibAmt.gain.setTargetAtTime(0, t, 0.2);
        this.carrierGain.gain.cancelScheduledValues(t);
        this.carrierGain.gain.setTargetAtTime(0.035, t, 0.4);
        const h = window.setTimeout(() => {
          this.holds.delete(h);
          if (!this.ok()) return;
          const n = this.ctx!.currentTime;
          this.carrierGain.gain.setTargetAtTime(0, n, 0.8);
          this.vibAmt.gain.setTargetAtTime(1.5, n + 1, 0.5);
        }, 7000);
        this.holds.add(h);
        break;
      }
      case "boot":
        this.tone(180, 0.7, 0.05, { to: 900, type: "sawtooth", lp: 1400 });
        [0.75, 0.88, 1.01].forEach((d, i) => this.tone(880 * (1 + i * 0.125), 0.07, 0.03, { type: "square", lp: 2200, at: d }));
        break;
      case "end_warm": this.bell(587.33, 0.06); this.bell(880, 0.045, 0.18); this.swell(0.03, 1.2, 2.5, 2.5, 348, 360); break;
      case "end_note": this.bell(698.46, 0.05); this.burst(0.3, "bandpass", 1700, 0.05, 0.7, 0.2); break;
      case "end_flat": this.tone(146.83, 3.2, 0.07, { type: "triangle", lp: 600 }); this.burst(1.2, "bandpass", 2400, 0.012, 0.5); break;
      case "end_dark":
        this.tone(55, 3.6, 0.12, { to: 50 }); this.bell(880, 0.025, 1.4);
        this.swell(0.025, 0.8, 2.2, 2.4, 348, 348);
        break;
    }
  }
}

export const gameSound = new GameSound();
