# Zendia

个人 AI 电台 — 读懂听歌习惯 → 规划声音 → 像 DJ 那样播报。

## 架构

四层结构(详见施工图):

1. **外部上下文** — 用户语料 (`taste.md` / `routines.md` / ...) + Claude Code (子进程) + NeteaseCloudMusicApi + Fish/Feishu/Weather/UPnP
2. **本地大脑** (Node.js) — `router.js` / `context.js` / `claude.js` / `scheduler.js` / `tts.js` / `state.db`
3. **运行时聚合** — 6 片 fragment 拼成 prompt → 模型输出 `{say, play[], reason, segue}`
4. **交互表层** — PWA at `localhost:8910`,Player / Profile / Settings 三视图

## 仓库结构

```
Zendia/
├── web/        # PWA 前端 (Vite + React + TS)
└── server/     # Node.js 中枢 (express + ws)
```

## 开发

需要两个终端,分别起前后端:

```bash
# 终端 A — 后端 (默认 :8910,可用 PORT 覆盖)
cd server
npm install
npm run dev

# 终端 B — 前端 (Vite :5173,/api 与 /stream 自动 proxy 到 :8910)
cd web
npm install
npm run dev
```

如果 8910 撞了别的项目,服务端 `PORT=xxxx npm run dev`,前端 `ZENDIA_SERVER_PORT=xxxx npm run dev`,保持两边一致。

## NCM cookie(解锁 VIP 曲目)

NCM 免费目录大量主流华语流行 VIP 锁。如果你有黑胶 / 会员账号,登录后传 cookie 给后端解锁:

1. `cp server/.env.example server/.env`
2. 浏览器去 https://music.163.com/ 登录
3. F12 → Application → Cookies → https://music.163.com → 找 `MUSIC_U`,复制值
4. 编辑 `server/.env`:`NCM_COOKIE=MUSIC_U=<刚刚复制的值>`
5. 重启后端 `npm run dev`,跑 `npm run ncm:smoke -- "十年 陈奕迅"` 应该能拿到 url 了

`.env` 已经在 .gitignore,不会进 commit。**MUSIC_U 是你账号的 auth token,不要分享 / 截图 / 贴给别人。**
