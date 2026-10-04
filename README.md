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

- 左侧是观察日志，可新开一条
- 右侧是信号台：`VOICE NULL` / `CARRIER ON`
- Enter 发送，Shift+Enter 换行

头像位现在是 `VM` 标记。以后把胸像放到 `public/voxmute-card.webp`，再在界面里引用即可。

Art by MRSHDER · Character Design by Goose hair
