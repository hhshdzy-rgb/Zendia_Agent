# Zendia

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

## Environment

Copy `server/.env.example` to `server/.env` and fill in local secrets:

- `NCM_COOKIE`: optional but recommended for NetEase Cloud Music tracks that
  require login.
- `FISH_API_KEY`: required for DJ voice synthesis.
- `FISH_VOICE_ID`: optional custom Fish Audio voice reference.
- `FISH_MODEL`: optional Fish Audio model id.

Do not commit `.env`. The file is gitignored because it contains account tokens.
