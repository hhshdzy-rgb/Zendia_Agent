import type { Server as HttpServer } from 'node:http'
import { WebSocketServer } from 'ws'
import type { Hub } from '../hub.js'

export function attachStreamWs(httpServer: HttpServer, hub: Hub): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url) {
      socket.destroy()
      return
    }
    const path = req.url.split('?')[0]
    if (path !== '/stream') return
    wss.handleUpgrade(req, socket, head, (ws) => {
      hub.subscribe(ws)
    })
  })

  return wss
}
