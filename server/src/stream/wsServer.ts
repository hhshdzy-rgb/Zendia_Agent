import type { Server as HttpServer } from 'node:http'
import { WebSocketServer } from 'ws'
import type { Hub } from '../hub.js'
import type { ClientEvent } from '../types.js'

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
      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString()) as ClientEvent
          hub.handleClientEvent(event)
        } catch {
          // malformed frame from client — ignore
        }
      })
    })
  })

  return wss
}
