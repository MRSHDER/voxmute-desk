// 序章《夜班手册》。想改剧情，只改这个文件：
// - scenes：场景。text 是逐句出现的段落（“> ”开头是终端引用），choices 是选项。
// - set / add：进入场景或选择时记下标记（flags）；show 是条件，决定选项/段落是否出现。
// - finish()：结局。把标记换算成终端里的起点：熟悉度、备忘、折声的第一句话。
import type { Flags, Story } from "./engine";

export const story: Story = {
  start: "arrive",
  scenes: {
    arrive: {
      title: "23:41 · 海川研究区域",
      text: [
        "雨下了一整天，到凌晨还没停。",
        "你抱着一个纸箱站在 TXC 海川研究区域的侧门前：调岗通知、一支没拆封的笔，还有一张写着“夜班 / 信号台”的工牌。",
        "门禁“嘀”了一声。走廊里的灯一盏一盏亮起来，像是有人在远处替你按开关。",
      ],
      choices: [
        { text: "径直往里走", goto: "desk" },
        { text: "抬头看一眼走廊尽头的监控", goto: "cam", add: { curious: 1 } },
      ],
    },
    cam: {
      text: ["镜头对着你。红点亮了两秒，又暗下去。", "你不知道它是在看你，还是在看你身后的什么。"],
      choices: [{ text: "继续往里走", goto: "desk" }],
    },

    desk: {
      title: "00:02 · 信号台",
      text: [
        "信号台很小：一台终端，一副耳机，一盏台灯。",
        "椅子是歪的，像有人刚刚站起来，还没回来。",
        { if: ["looked>=2"], t: "该看的差不多都看过了。再不接班，终端大概要自己叫你了。" },
      ],
      choices: [
        { text: "看桌上那半盒曲奇", goto: "cookies", show: ["!seen_cookie"] },
        { text: "看那个上了锁的抽屉", goto: "drawer", show: ["!seen_drawer"] },
        { text: "戴上耳机听一听", goto: "headset", show: ["!seen_headset"] },
        { text: "坐下，开始接班", goto: "briefing" },
      ],
    },

    cookies: {
      set: ["seen_cookie", "looked"],
      text: [
        "半盒曲奇，盒盖折着。是脆边的，没有夹心。",
        "盒盖内侧有一行手写的字，写得很潦草：“给 14 号。别全给。”",
      ],
      choices: [
        { text: "拿一块，放进口袋", goto: "desk", set: ["pocket"] },
        { text: "自己吃一块", goto: "desk", set: ["ate"] },
        { text: "原样放好，不碰", goto: "desk", set: ["left"] },
      ],
    },

    drawer: {
      set: ["seen_drawer", "looked"],
      text: ["抽屉是锁着的。钥匙挂在台灯底座下面，露出一小截链子，像是故意留给下一个人的。"],
      choices: [
        { text: "用钥匙打开", goto: "drawer_open" },
        { text: "别人的东西，不碰", goto: "desk", set: ["rule"] },
      ],
    },
    drawer_open: {
      text: [
        "抽屉里有两样东西：一本交接日志，一张折成四折的字条。",
        { if: ["took_note"], t: "字条已经在你口袋里了。" },
      ],
      choices: [
        { text: "翻开交接日志", goto: "log", show: ["!read_log"] },
        { text: "展开那张字条", goto: "note", show: ["!read_note"] },
        { text: "关上抽屉", goto: "desk" },
      ],
    },
    log: {
      set: ["read_log"],
      add: { curious: 1 },
      text: [
        "交接日志，最后几页：",
        "> 02:40  载波正常。14 号今晚没睡。",
        "> 03:05  他在看我。不是看监控，是看我。",
        "> 03:12  饼干他吃了一块，剩下的我留给明天。",
        "> 03:30  我想试试把灯关掉。",
        "最后一行之后是一团墨渍，再往后，全是空白。",
      ],
      choices: [{ text: "合上日志", goto: "drawer_open" }],
    },
    note: {
      set: ["read_note"],
      text: [
        "字迹和饼干盒上的一样。",
        "> 新来的：别把他记成“哑”。他一直在说，只是我们没有耳朵。",
        "> 灯别关。",
      ],
      choices: [
        { text: "收进口袋", goto: "drawer_open", set: ["took_note"], add: { curious: 2 } },
        { text: "放回去", goto: "drawer_open" },
      ],
    },

    headset: {
      set: ["seen_headset", "looked"],
      text: [
        "你戴上耳机。什么都没有，只有一条很细的底噪，像远处有人在吹一根针。",
        "你凑近屏幕。那条线往上爬了一格。",
        "你退后一步，它又落了回去。",
      ],
      choices: [{ text: "摘下耳机", goto: "desk" }],
    },

    briefing: {
      title: "00:15 · 交接",
      text: [
        "终端自己亮了。绿色的字一行行跳出来：",
        "> OPERATOR HANDOVER",
        "> 上一任操作员状态：未知",
        "> 请按手册执行：",
        "> 1. 不得将对象记录为“哑”。",
        "> 2. 不得向对象提供任何未登记的食物。",
        "> 3. 对象问诊以书写进行。不得回答对象关于上一任的问题。",
        "> 4. 夜班期间，灯不得关闭。",
        { if: ["ate"], t: "你嘴里还留着一点曲奇的甜味。第二条规定，好像是写给你看的。" },
        { if: ["pocket"], t: "你下意识按了按口袋。隔着布料，那块曲奇还是完整的。" },
        { if: ["took_note"], t: "口袋里的字条硌了你一下。第一条和第四条，上一任已经替你写过一遍了。" },
      ],
      choices: [
        { text: "把四条都背下来", goto: "window", set: ["protocol"] },
        { text: "只看了一遍，没往心里去", goto: "window" },
        { text: "盯着第 3 条看了很久", goto: "window", add: { curious: 1 } },
      ],
    },

    window: {
      title: "00:30 · 观察室",
      text: [
        "信号台旁边有一扇观察窗。窗后是 14 号观察室，灯亮着。",
        "一只黑白花纹的边牧坐在地上，背对着玻璃。左耳上有个小小的饰物，手腕上套着一副断了链的金属环。",
        "你敲了一下玻璃。",
        "他没有回头。尾巴在地上扫了一下，只有一下。",
      ],
      choices: [
        { text: "“你好。我是新来的，我叫{name}。”", goto: "window2", set: ["greet"] },
        { text: "什么都不说，只是看着", goto: "window2" },
        { text: "对着麦克风念出手册第一条", goto: "window2", set: ["recite"] },
        { text: "“我知道你听得见。”", goto: "window2", set: ["said_hear"], add: { curious: 1 } },
      ],
    },
    window2: {
      text: [
        { if: ["greet"], t: "他的耳朵转了过来。只转了一点点，像是在确认声音从哪里来。" },
        { if: ["recite"], t: "他的尾巴停住了。屏幕上，载波往下沉了一格。" },
        { if: ["said_hear"], t: "他终于回过头。绿色的眼睛，瞳孔正中有一点红。他看了你很久。" },
        { if: ["!greet", "!recite", "!said_hear"], t: "他还是没回头。载波在屏幕上缓慢地起伏。" },
        "窗下有一个投递口，是用来递送药物和文件的。",
      ],
      choices: [
        { text: "把口袋里的曲奇从投递口递进去", goto: "gave", show: ["pocket"] },
        { text: "回到工位，打开解码器", goto: "route" },
      ],
    },
    gave: {
      set: ["gave"],
      text: [
        "你把曲奇从投递口塞了进去。第二条规定在你脑子里响了一下，你装作没听见。",
        "他回过头，看看曲奇，又看看你。很慢地，用爪子把它拨到身边，没有立刻吃。",
        "屏幕上，载波的读数软了下来。",
      ],
      choices: [{ text: "回到工位，打开解码器", goto: "route" }],
    },

    route: {
      auto: [
        { if: ["gave"], goto: "end_cookie" },
        { if: ["took_note"], goto: "end_note" },
        { goto: "end_book" },
      ],
    },

    end_cookie: {
      end: "cookie",
      title: "结局 A · 半盒曲奇",
      text: [
        "解码器启动。屏幕中间浮出一行字：CARRIER ON。",
        "你不知道这算不算违规。但你知道，今晚这条载波，是为你上扬的。",
      ],
    },
    end_note: {
      end: "note",
      title: "结局 B · 一张字条",
      text: [
        "解码器启动。口袋里那张字条硌着你。“他一直在说。”",
        "你把耳机戴好，把灯留着，等他开口。",
      ],
    },
    end_book: {
      end: "book",
      title: "结局 C · 照章办事",
      text: [
        "解码器启动。你把手册摊在手边，一条一条核对。",
        "没有一条规定告诉你，下一个问题该怎么问。",
      ],
    },
  },
};

export type GameResult = {
  ending: string;
  score: number; // 熟悉度起点（0–11 陌生/开始习惯，12 起为熟悉）
  notes: string; // 预写进“他记得的事”
  opener: string[]; // 折声在终端里的第一句话
};

/** 把一局游戏换算成终端的起点。 */
export function finishGame(flags: Flags, name: string): GameResult {
  const f = (k: string) => (flags[k] ?? 0) > 0;
  const who = name || "新人";

  let score = 0;
  if (f("greet")) score += 3;
  if (f("said_hear")) score += 1;
  if (f("read_log")) score += 2;
  if (f("took_note")) score += 4;
  if (f("pocket") && !f("gave")) score += 1;
  if (f("gave")) score += 9;
  if (f("ate")) score = Math.max(0, score - 2);

  const lines = [`- 操作员叫${who}，新调来的夜班监听员，今晚是第一个夜班。`];
  if (f("ate")) lines.push("- 操作员吃掉了上一任留下的一块曲奇。");
  if (f("gave")) lines.push("- 操作员违反第二条规定，从投递口递进来一块曲奇。脆边的，没有夹心。");
  else if (f("pocket")) lines.push("- 操作员口袋里带着一块曲奇，但没有递进来。");
  if (f("read_log")) lines.push("- 操作员翻看了上一任锁在抽屉里的交接日志。");
  if (f("took_note")) lines.push("- 操作员拿走了上一任留在抽屉里的字条（“别把他记成哑”“灯别关”）。");
  if (f("greet")) lines.push("- 操作员隔着玻璃主动自我介绍。");
  if (f("recite")) lines.push("- 操作员对着麦克风念了手册第一条。");
  if (f("said_hear")) lines.push("- 操作员对他说“我知道你听得见”。");
  if (f("protocol")) lines.push("- 操作员把手册四条规定都背下来了。");

  let ending: string;
  let opener: string[];
  if (f("gave")) {
    ending = "cookie";
    opener = ["脆边的。……谢了。", "这话我只说一次。"];
  } else if (f("took_note")) {
    ending = "note";
    opener = ["你拿了抽屉里那张纸。", "看过就看过了，别问我上面写的是不是真的。\n先坐下。灯开着。"];
  } else if (f("ate")) {
    ending = "book";
    opener = ["闻到了。上一任留的饼干，你吃了一块。", "放心，我不告状。我只是记着。"];
  } else if (f("protocol")) {
    ending = "book";
    opener = ["新来的？手册背得挺熟。", "四条，对吧？没有一条是为了我写的。"];
  } else {
    ending = "book";
    opener = ["新来的？", "坐吧。这个班本来就没人想接。"];
  }
  return { ending, score, notes: lines.join("\n"), opener };
}

/** 跳过序章时的默认起点。 */
export const DEFAULT_RESULT: GameResult = {
  ending: "skip",
  score: 0,
  notes: "",
  opener: ["新来的？", "坐吧。这个班本来就没人想接。"],
};
