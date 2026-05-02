import express from 'express'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hub } from './hub.js'
import { attachStreamWs } from './stream/wsServer.js'
import { startScriptedDJ } from './stream/script.js'
import { startLiveDJ } from './stream/live.js'
import { buildApiRouter } from './api.js'

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

const server = http.createServer(app)
attachStreamWs(server, hub)

const DJ_MODE = process.env.ZENDIA_DJ ?? 'live'
const stopDj = DJ_MODE === 'script' ? startScriptedDJ(hub) : startLiveDJ(hub)

const shutdown = () => {
  console.log('[zendia] shutting down')
  stopDj()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(PORT, () => {
  console.log(`[zendia] listening on http://localhost:${PORT}`)
  console.log(`[zendia] WS /stream attached, DJ mode = ${DJ_MODE}`)
})
