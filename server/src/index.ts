import express from 'express'
import http from 'node:http'
import { Hub } from './hub.js'
import { attachStreamWs } from './stream/wsServer.js'
import { startScriptedDJ } from './stream/script.js'
import { startLiveDJ } from './stream/live.js'
import { buildApiRouter } from './api.js'

const PORT = Number(process.env.PORT ?? 8910)

const app = express()
const hub = new Hub()

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'zendia-server' })
})
app.use('/api', buildApiRouter(hub))

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
