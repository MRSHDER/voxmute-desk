# VoxMute Desk

TXC 信号台聊天前端。对象是 VoxMute / 折声。回复经 Vercel 代理（`voxmute-proxy`）调用模型；代理不可用时退回本地假回复。

折声不说话。界面把操作员输入记成观察，回的是载波、状态和短句，不是对话模型。

## 跑起来

```bash
npm install
npm run dev
```

浏览器打开 Vite 给的本地地址。会话存在 `localStorage`，刷新还在。

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
