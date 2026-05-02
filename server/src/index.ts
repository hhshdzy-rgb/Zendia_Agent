import express from 'express'
import http from 'node:http'
import { Hub } from './hub.js'
import { attachStreamWs } from './stream/wsServer.js'
import { startScriptedDJ } from './stream/script.js'

const PORT = Number(process.env.PORT ?? 8080)

const app = express()

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'zendia-server' })
})

const server = http.createServer(app)
const hub = new Hub()
attachStreamWs(server, hub)
const stopScript = startScriptedDJ(hub)

const shutdown = () => {
  console.log('[zendia] shutting down')
  stopScript()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(PORT, () => {
  console.log(`[zendia] listening on http://localhost:${PORT}`)
  console.log(`[zendia] WS /stream attached, scripted DJ replay running`)
})
