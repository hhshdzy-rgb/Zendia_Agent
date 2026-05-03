import express from 'express'
import { existsSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hub } from './hub.js'
import { attachStreamWs } from './stream/wsServer.js'
import { startScriptedDJ } from './stream/script.js'
import { startLiveDJ } from './stream/live.js'
import { buildApiRouter } from './api.js'
import { getWeather } from './weather.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..')

const PORT = Number(process.env.PORT ?? 8910)

const app = express()
const hub = new Hub()

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'zendia-server' })
})
app.use('/api', buildApiRouter(hub))

// Serve cached TTS mp3s. Frontend uses URLs like /tts/<hash>.mp3 returned
// from synthesize(). immutable cache header is safe — file names are
// content-hashed, so the same URL always points at identical bytes.
app.use(
  '/tts',
  express.static(path.join(SERVER_ROOT, 'cache', 'tts'), {
    immutable: true,
    maxAge: '7d',
    fallthrough: false,
  }),
)

// Production mode: if web/dist exists (i.e. `npm run build` was run from
// the web/ folder), serve it as static + add a SPA fallback so React
// Router URLs like /profile and /settings work on hard refresh. In dev
// you run Vite separately on :5173 and dist/ won't exist — server is
// API-only then.
const WEB_DIST = path.resolve(SERVER_ROOT, '..', 'web', 'dist')
const SERVE_PWA = existsSync(WEB_DIST)
if (SERVE_PWA) {
  app.use(express.static(WEB_DIST, { index: 'index.html' }))
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/tts') ||
      req.path === '/healthz'
    ) {
      return next()
    }
    res.sendFile(path.join(WEB_DIST, 'index.html'))
  })
}

const server = http.createServer(app)
attachStreamWs(server, hub)

const DJ_MODE = process.env.ZENDIA_DJ ?? 'live'
const stopDj = DJ_MODE === 'script' ? startScriptedDJ(hub) : startLiveDJ(hub)

// Initial weather + periodic refresh. 15-min interval is just longer than
// the in-module cache (10 min), so the cache gets refilled on this clock.
const WEATHER_REFRESH_MS = 15 * 60 * 1000
async function refreshWeather() {
  const snap = await getWeather()
  if (snap) hub.setWeather(snap)
}
void refreshWeather()
const weatherTimer = setInterval(() => void refreshWeather(), WEATHER_REFRESH_MS)

const shutdown = () => {
  console.log('[zendia] shutting down')
  clearInterval(weatherTimer)
  stopDj()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Bind to 0.0.0.0 so LAN devices can reach the player at the host's IP.
// Prints localhost + every non-internal IPv4 it finds so the user knows
// which URL to open from a phone / iPad on the same network.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[zendia] WS /stream attached, DJ mode = ${DJ_MODE}`)
  console.log(`[zendia] PWA serve: ${SERVE_PWA ? 'on (web/dist found)' : 'off (api-only — run Vite for the PWA)'}`)
  console.log(`[zendia] listening on:`)
  console.log(`           http://localhost:${PORT}`)
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`           http://${iface.address}:${PORT}`)
      }
    }
  }
})
