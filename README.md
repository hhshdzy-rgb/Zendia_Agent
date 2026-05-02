# Zendia

个人 AI 电台 — 读懂听歌习惯 → 规划声音 → 像 DJ 那样播报。

## 架构

四层结构(详见施工图):

1. **外部上下文** — 用户语料 (`taste.md` / `routines.md` / ...) + Claude Code (子进程) + NeteaseCloudMusicApi + Fish/Feishu/Weather/UPnP
2. **本地大脑** (Node.js) — `router.js` / `context.js` / `claude.js` / `scheduler.js` / `tts.js` / `state.db`
3. **运行时聚合** — 6 片 fragment 拼成 prompt → 模型输出 `{say, play[], reason, segue}`
4. **交互表层** — PWA at `localhost:8080`,Player / Profile / Settings 三视图

## 仓库结构

```
Zendia/
├── web/        # PWA 前端 (Vite + React + TS)
└── server/     # Node.js 中枢 (待建)
```

## 开发

```bash
cd web
npm install
npm run dev
```
