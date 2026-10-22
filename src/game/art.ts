// 序章里的简单道具：纯线稿 SVG，颜色全走样式变量（日夜两套都适用）。
// 类名：l 墨线 · m 淡线 · a 钴蓝线 · f 纸色填充+墨边 · k 墨色实心 · d 边牧的深色毛（日夜都保持深色，夜间加浅描边） · s 信号色 · r 印章红 · scr 监视器 · sl 屏上信号线
const svg = (body: string) => `<svg viewBox="0 0 240 120" role="img" aria-hidden="true" focusable="false">${body}</svg>`;

export const ART: Record<string, string> = {
  door: svg(`
    <path class="m" d="M16 112H224"/>
    <rect class="f" x="78" y="12" width="64" height="100"/>
    <path class="l" d="M86 22H134V104H86Z"/>
    <circle class="l" cx="127" cy="66" r="3.5"/>
    <rect class="f" x="156" y="44" width="20" height="30" rx="3"/>
    <circle class="s" cx="166" cy="53" r="3"/>
    <path class="l" d="M161 62H171M161 67H171"/>
    <path class="m" d="M28 10l-8 24M50 4l-8 24M196 6l-8 24M220 16l-8 24M16 52l-8 24"/>`),

  camera: svg(`
    <path class="m" d="M16 12H224"/>
    <path class="l" d="M118 12V30"/>
    <rect class="f" x="82" y="30" width="72" height="30" rx="6"/>
    <circle class="f" cx="150" cy="45" r="11"/>
    <circle class="r" cx="150" cy="45" r="4"/>
    <circle class="s" cx="95" cy="41" r="2.5"/>
    <path class="m" d="M164 40L224 12M164 52L224 96"/>`),

  desk: svg(`
    <path class="l" d="M14 88H226M30 88V112M210 88V112"/>
    <rect class="scr" x="86" y="26" width="76" height="46" rx="3"/>
    <path class="sl" d="M96 38H128M96 48H146M96 58H116"/>
    <path class="l" d="M124 72V88M106 88H142"/>
    <path class="l" d="M196 88V64L210 34M186 88H206"/>
    <path class="f" d="M200 36L228 28L216 52Z"/>
    <path class="f" d="M30 70L36 62H70L68 70Z"/>
    <rect class="f" x="30" y="70" width="38" height="18"/>
    <path class="l" d="M36 46C36 22 64 22 64 46"/>
    <rect class="f" x="31" y="42" width="8" height="14" rx="3"/>
    <rect class="f" x="61" y="42" width="8" height="14" rx="3"/>`),

  cookies: svg(`
    <path class="m" d="M20 104H220"/>
    <path class="f" d="M76 56L96 30H184L164 56Z"/>
    <path class="a" d="M110 44c6-6 8 6 14 0s8 6 14 0 8 6 14 0"/>
    <rect class="f" x="76" y="56" width="88" height="48"/>
    <circle class="f" cx="104" cy="72" r="11"/>
    <circle class="f" cx="128" cy="68" r="11"/>
    <circle class="k" cx="101" cy="70" r="1.6"/><circle class="k" cx="108" cy="75" r="1.6"/><circle class="k" cx="106" cy="67" r="1.4"/>
    <circle class="k" cx="125" cy="66" r="1.6"/><circle class="k" cx="132" cy="71" r="1.6"/><circle class="k" cx="130" cy="63" r="1.4"/>`),

  drawer: svg(`
    <path class="m" d="M16 112H224"/>
    <rect class="f" x="70" y="12" width="100" height="100"/>
    <rect class="f" x="78" y="22" width="84" height="38"/>
    <rect class="f" x="78" y="68" width="84" height="38"/>
    <path class="l" d="M110 41H130"/>
    <circle class="l" cx="120" cy="84" r="4"/><path class="l" d="M120 88V96"/>
    <path class="m" d="M204 12V38"/>
    <circle class="l" cx="204" cy="46" r="7"/>
    <path class="l" d="M204 53V84M204 68h7M204 78h7"/>`),

  drawer_open: svg(`
    <path class="m" d="M16 108H224"/>
    <rect class="f" x="40" y="30" width="160" height="72"/>
    <rect class="f" x="56" y="46" width="58" height="46"/>
    <path class="l" d="M64 46v-6M76 46v-6M88 46v-6M100 46v-6"/>
    <path class="m" d="M66 60H104M66 70H104M66 80H92"/>
    <path class="f" d="M134 54L170 48L176 84L140 90Z"/>
    <path class="m" d="M152 51L158 87M137 71L173 65"/>`),

  log: svg(`
    <path class="m" d="M16 108H224"/>
    <rect class="f" x="40" y="20" width="80" height="80"/>
    <rect class="f" x="120" y="20" width="80" height="80"/>
    <path class="m" d="M52 38H108M52 50H108M52 62H100M52 74H108M132 38H188M132 50H176M132 62H188"/>
    <circle class="k" cx="160" cy="84" r="9"/>
    <path class="k" d="M156 90q-1 7 2 9q3-3 2-9Z"/>`),

  note: svg(`
    <path class="m" d="M16 108H224"/>
    <path class="f" d="M80 14H160V102H80Z"/>
    <path class="m" d="M120 14V102M80 58H160"/>
    <path class="a" d="M90 32c6-5 8 5 14 0M130 32c6-5 8 5 14 0"/>
    <path class="m" d="M132 76H152M132 84H146"/>`),

  headset: svg(`
    <path class="l" d="M76 74C76 26 164 26 164 74"/>
    <rect class="f" x="66" y="66" width="18" height="32" rx="7"/>
    <rect class="f" x="156" y="66" width="18" height="32" rx="7"/>
    <path class="a" d="M16 112H98l4-3 4 6 4-14 4 14 4-6 4 3H224"/>`),

  briefing: svg(`
    <rect class="scr" x="56" y="12" width="128" height="76" rx="4"/>
    <path class="sl" d="M70 28H130M70 40H160M70 52H146M70 64H120"/>
    <rect class="s" x="126" y="60" width="8" height="8"/>
    <path class="l" d="M120 88V106M94 106H146"/>`),

  window: svg(`
    <path class="m" d="M16 112H224"/>
    <rect class="f" x="40" y="8" width="160" height="86"/>
    <path class="m" d="M48 78H192M60 20L82 20M56 28L72 28"/>
    <path class="d" d="M110 32L105 16L118 26ZM130 32L135 16L122 26Z"/>
    <circle class="d" cx="120" cy="40" r="12"/>
    <ellipse class="d" cx="120" cy="64" rx="17" ry="19"/>
    <circle fill="var(--star)" cx="108" cy="22" r="2.2"/>
    <path class="l" style="stroke-width:6" d="M134 74C150 78 156 72 160 66"/>
    <circle class="f" cx="160" cy="65" r="3.6"/>
    <rect class="f" x="102" y="94" width="36" height="14"/>`),

  hatch: svg(`
    <path class="m" d="M16 112H224"/>
    <rect class="f" x="56" y="14" width="128" height="90"/>
    <rect class="scr" x="96" y="44" width="48" height="26"/>
    <path class="f" d="M96 70H144L152 88H88Z"/>
    <circle class="f" cx="120" cy="78" r="8"/>
    <circle class="k" cx="117" cy="76" r="1.3"/><circle class="k" cx="123" cy="80" r="1.3"/>
    <path class="a" d="M22 58H84M76 50L84 58L76 66"/>`),

  switch: svg(`
    <path class="m" d="M16 112H224"/>
    <rect class="f" x="96" y="14" width="48" height="84" rx="4"/>
    <rect class="l" x="108" y="30" width="24" height="52" rx="3"/>
    <path class="f" d="M110 34H130V54H110Z"/>
    <path class="m" d="M30 24H80M26 36H70M160 24H210M168 36H214"/>
    <circle class="r" cx="186" cy="80" r="3.5"/>
    <path class="m" d="M170 80H178M194 80H202"/>`),

  cookie_wave: svg(`
    <circle class="f" cx="120" cy="60" r="26"/>
    <circle class="k" cx="110" cy="52" r="2"/><circle class="k" cx="128" cy="56" r="2"/><circle class="k" cx="118" cy="70" r="2"/><circle class="k" cx="132" cy="70" r="1.8"/><circle class="k" cx="108" cy="66" r="1.8"/>
    <path class="a" d="M162 42C172 54 172 66 162 78M176 30C192 50 192 70 176 90"/>
    <path class="a" d="M78 42C68 54 68 66 78 78M64 30C48 50 48 70 64 90"/>`),

  manual: svg(`
    <path class="m" d="M16 108H224"/>
    <rect class="f" x="82" y="12" width="76" height="92" rx="3"/>
    <path class="l" d="M92 12V104"/>
    <path class="m" d="M102 32H148M102 46H148M102 60H148M102 74H140"/>`),
};
