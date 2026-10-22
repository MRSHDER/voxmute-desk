# VoxMute Desk

TXC 信号台聊天前端。对象是 VoxMute / 折声。回复经 Vercel 代理（`voxmute-proxy`）调用模型；代理不可用时退回本地假回复。

折声发不出声，但他会回你：解码器把他声带残端的震动翻成文字，他是个嘴毒、聪明、不太爱搭理人的家伙，被问到什么会接什么。他对你的熟悉度分四档（陌生 / 开始习惯 / 熟悉 / 信任），按你发过的消息总数算，聊到曲奇和小动物会加分；越熟，他肯透露的过去越多，不熟就不会说。人设和各档能讲的内容写在 `voxmute-proxy` 的系统提示里；代理不可用时，本地假回复会用同样的口吻兜底。

## 跑起来

```bash
npm install
npm run dev
```

浏览器打开 Vite 给的本地地址。会话存在 `localStorage`，刷新还在（同一个浏览器、同一台设备）。

## 记忆与档案

- **上下文**：每次把当前记录里最近 30 条消息发给模型（不含系统提示行）。
- **备忘**：每聊 6 句，代理会把最近的对话整理成一份“操作员备忘”（你的名字、答应过的事、他已经讲过的过去……），跨记录保存，随每次对话发出，聊长了他也记得。
- **熟悉度**：按你发过的每一句累计，删除记录不影响，只有“清空全部”归零。
- **右上角“档案”**：查看和手动修改备忘、导出当前记录为 `.txt`、删除当前记录、清空全部。

## 模型代理

- 默认代理地址写在 `src/main.ts` 的 `DEFAULT_API`（公开地址，不是密钥）。
- 本地可用 `.env.local` 设 `VITE_API_URL` 覆盖；设为空字符串则只用本地假回复。
- 模型 API Key 只存在于 Vercel 环境变量，前端和本仓库里都没有。

## 画面

右上角可切换日间 / 夜间；没选过时跟随系统，选过之后记在 `localStorage`。

视觉沿用 voxmute-archive 的档案风格：冷灰纸、墨色、衬线体、中英双语标签；失声是红色印章，信号波形只出现在深色监视器条里。

- 左侧是观察日志，可新开一条
- 右侧是信号台：`VOICE NULL` / `CARRIER ON`
- Enter 发送，Shift+Enter 换行

头像是 `public/voxmute-avatar.webp`（取自 [voxmute-archive](https://github.com/MRSHDER/voxmute-archive) 的半身像 `voxmute-card.webp`，裁成 320×320）。

Art by MRSHDER · Character Design by Goose hair
