import express from 'express'
import http from 'node:http'

const PORT = Number(process.env.PORT ?? 8080)

const app = express()

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'zendia-server' })
})

const server = http.createServer(app)

server.listen(PORT, () => {
  console.log(`[zendia] listening on http://localhost:${PORT}`)
})
