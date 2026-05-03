# Zendia

> English · [中文](./README.zh.md)

<p align="center">
  <img src="./docs/screenshots/player.png" alt="Zendia player UI — late-night dark theme with retro LED clock, ON AIR badge, white Now Playing card, and chat-style DJ timeline" width="320">
</p>

Personal AI radio: understands listening habits, plans voice segments, and speaks
between songs like a lightweight DJ.

## Architecture

Zendia is split into two apps:

- `server/`: Node.js control plane, Express API, WebSocket stream, SQLite state,
  Claude subprocess adapter, NCM music lookup, and Fish Audio TTS cache.
- `web/`: Vite + React PWA, mobile-first player UI, live message timeline,
  music playback, TTS playback, and waveform visualizers.

Runtime flow:

```text
context fragments -> Claude DJ contract -> { say, play[], reason, segue }
  -> persist message
  -> synthesize DJ voice
  -> resolve music URL
  -> stream message/song events to PWA over WebSocket
```

## Development

Run backend and frontend in two terminals:

```bash
cd server
npm install
npm run dev
```

```bash
cd web
npm install
npm run dev
```

Defaults:

- Server: `http://localhost:8910`
- Web: `http://localhost:5173`
- WebSocket: `/stream`
- API snapshot: `/api/now`

If port `8910` is busy, start the server with `PORT=xxxx npm run dev` and keep
the Vite proxy setting aligned.

## Production / LAN deployment (Mac mini, home network)

Single Node process serves both the PWA and the API/WS, on one port.
Other devices on the same WiFi can play from any browser.

### One-time setup on the Mac

```bash
brew install node                         # if Node 22+ isn't installed
npm install -g @anthropic-ai/claude-code  # claude CLI; log in once
git clone <your repo url> Zendia
cd Zendia
npm run install:all                       # installs server + web deps
cp server/.env.example server/.env
# Edit server/.env — fill in NCM_COOKIE, FISH_API_KEY,
# FISH_VOICE_ID_ZH / _EN, FISH_MODEL_ZH / _EN.
```

### Build + run

```bash
npm run build      # builds web → web/dist
npm start          # starts the Node server, which auto-serves dist
```

Boot log prints every URL the server is reachable on:

```
[zendia] PWA serve: on (web/dist found)
[zendia] listening on:
           http://localhost:8910
           http://192.168.1.42:8910
```

Open the LAN URL on your phone or iPad (same WiFi). PWA install works
from Safari → Share → Add to Home Screen.

### After code updates

```bash
git pull
npm run install:all   # only re-runs npm install if package.json changed
npm run build
# Ctrl+C the server, then:
npm start
```

Auto-start on Mac boot (so you don't have to keep a terminal open) is a
follow-up step using `launchd`; not yet scripted here.

## LLM provider

The DJ brain is pluggable. Pick the backend with `ZENDIA_LLM` in `server/.env`:

- `claude-cli` (default) — talks to the locally installed `claude` CLI.
  Best quality, but needs you to be able to run Claude Code on this machine.
- `openai` — any service that speaks the OpenAI `/chat/completions` shape.
  Good escape hatch when Claude isn't reachable: works with **DeepSeek**,
  **通义千问 (Qwen)**, **Moonshot (Kimi)**, **Ollama** (local), or OpenAI itself.

For the openai provider, also set `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
`OPENAI_MODEL`. `server/.env.example` lists the common base URLs.

```bash
# example: DeepSeek
ZENDIA_LLM=openai
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=deepseek-chat
```

Smoke-test the selected provider end-to-end:

```bash
cd server && npm run llm:smoke
```

## Environment

Copy `server/.env.example` to `server/.env` and fill in local secrets:

- `ZENDIA_LLM`: which LLM backend to run (`claude-cli` default, or `openai`).
- `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`: only when
  `ZENDIA_LLM=openai`.
- `NCM_COOKIE`: optional but recommended for NetEase Cloud Music tracks that
  require login.
- `FISH_API_KEY`: required for DJ voice synthesis.
- `FISH_VOICE_ID`: optional custom Fish Audio voice reference.
- `FISH_MODEL`: optional Fish Audio model id.

Do not commit `.env`. The file is gitignored because it contains account tokens.
