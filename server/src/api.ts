import { Router } from 'express'
import type { Hub } from './hub.js'

// HTTP endpoints from the architecture's PWA<->server contract.
// All three return placeholder data for now; real implementations land
// after STATE.DB + CONTEXT.JS arrive.

export function buildApiRouter(hub: Hub): Router {
  const router = Router()

  router.get('/now', (_req, res) => {
    const snapshot = hub.snapshot()
    res.json(snapshot)
  })

  router.get('/taste', (_req, res) => {
    res.json({
      summary: 'placeholder — read from user/taste.md once CONTEXT.JS lands',
      moods: [],
      genres: [],
    })
  })

  router.get('/plan/today', (_req, res) => {
    res.json({
      date: new Date().toISOString().slice(0, 10),
      slots: [],
      note: 'placeholder — SCHEDULER.JS will fill this',
    })
  })

  return router
}
