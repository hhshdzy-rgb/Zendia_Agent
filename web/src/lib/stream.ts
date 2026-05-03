import type { ClientEvent, Message, Song, WeatherSnapshot } from '../types'

export type ServerEvent =
  | { type: 'hello'; sessionStartedAt: number; weather?: WeatherSnapshot }
  | { type: 'song'; song: Song }
  | { type: 'song_progress'; positionSec: number }
  | { type: 'tts_state'; state: 'speaking' | 'idle' }
  | { type: 'dj_thinking'; on: boolean }
  | { type: 'message_new'; message: Message }
  | { type: 'message_word'; id: string; wordIdx: number }
  | { type: 'message_done'; id: string }
  | { type: 'weather'; weather: WeatherSnapshot }

export type EventStream = {
  subscribe: (handler: (e: ServerEvent) => void) => () => void
  send: (event: ClientEvent) => void
  /** Called with true on WS open, false on close/error. Mock impl
      treats itself as always connected and only calls once. */
  onConnectionChange: (handler: (connected: boolean) => void) => () => void
  close: () => void
}

const SCRIPT_LINES = [
  "It's late on a Monday, and here's a song that moves with your breath.",
  'Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper.',
  "You'll feel yourself lift off the ground a little.",
  "This one's called Monday Night Exhale.",
]

const PER_WORD_MS = 220
const PAUSE_BETWEEN_MS = 1500

export function createMockStream(): EventStream {
  const handlers = new Set<(e: ServerEvent) => void>()
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const emit = (e: ServerEvent) => {
    handlers.forEach((h) => h(e))
  }
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }

  const sessionStartedAt = Date.now()
  const song: Song = {
    title: 'Monday Night Exhale',
    artist: 'SoundHelix',
    album: 'Demo',
    streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    durationSec: 0,
    positionSec: 0,
  }

  emit({ type: 'hello', sessionStartedAt })
  emit({ type: 'song', song })

  SCRIPT_LINES.slice(0, 3).forEach((text, i) => {
    emit({
      type: 'message_new',
      message: {
        id: `seed-${i}`,
        ts: Math.max(0, i * 4),
        type: 'dj_say',
        text,
        status: 'done',
      },
    })
  })

  let cycle = 0
  const playOne = () => {
    const text = SCRIPT_LINES[cycle % SCRIPT_LINES.length]
    const id = `live-${cycle}-${Date.now()}`
    const ts = Math.floor((Date.now() - sessionStartedAt) / 1000)
    const wordCount = text.split(/\s+/).filter(Boolean).length

    emit({ type: 'tts_state', state: 'speaking' })
    emit({
      type: 'message_new',
      message: { id, ts, type: 'dj_say', text, status: 'speaking', highlightWord: 0 },
    })

    for (let w = 0; w < wordCount; w++) {
      later(w * PER_WORD_MS, () => {
        emit({ type: 'message_word', id, wordIdx: w })
      })
    }
    later(wordCount * PER_WORD_MS, () => {
      emit({ type: 'message_done', id })
      emit({ type: 'tts_state', state: 'idle' })
    })
    later(wordCount * PER_WORD_MS + PAUSE_BETWEEN_MS, () => {
      cycle++
      playOne()
    })
  }
  later(400, playOne)

  return {
    subscribe: (h) => {
      handlers.add(h)
      return () => {
        handlers.delete(h)
      }
    },
    send: () => {
      // Mock has no server to talk to; drop client events on the floor.
    },
    onConnectionChange: (handler) => {
      // Mock is always "connected" — fire once and never again.
      handler(true)
      return () => {}
    },
    close: () => {
      handlers.clear()
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    },
  }
}

export function createWebSocketStream(url: string): EventStream {
  const handlers = new Set<(e: ServerEvent) => void>()
  const connectionHandlers = new Set<(connected: boolean) => void>()
  let ws: WebSocket | null = null
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let backoff = 500
  let lastConnectedNotified: boolean | null = null

  const notifyConnected = (connected: boolean) => {
    // De-dup so rapid reconnect storms don't spam the UI.
    if (lastConnectedNotified === connected) return
    lastConnectedNotified = connected
    connectionHandlers.forEach((h) => h(connected))
  }

  const connect = () => {
    if (closed) return
    ws = new WebSocket(url)
    ws.onopen = () => {
      backoff = 500
      notifyConnected(true)
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ServerEvent
        handlers.forEach((h) => h(data))
      } catch {
        // Malformed frame: ignore.
      }
    }
    ws.onclose = () => {
      notifyConnected(false)
      if (closed) return
      reconnectTimer = setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 5000)
    }
    ws.onerror = () => ws?.close()
  }

  // Defer the actual connect() so a synchronous mount/cleanup pair
  // in React StrictMode can cancel before any socket is created.
  let initialTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    initialTimer = null
    connect()
  }, 50)

  return {
    subscribe: (h) => {
      handlers.add(h)
      return () => {
        handlers.delete(h)
      }
    },
    send: (event) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event))
      }
    },
    onConnectionChange: (handler) => {
      connectionHandlers.add(handler)
      // Replay current state immediately so first paint is right.
      if (lastConnectedNotified !== null) handler(lastConnectedNotified)
      return () => {
        connectionHandlers.delete(handler)
      }
    },
    close: () => {
      closed = true
      if (initialTimer) clearTimeout(initialTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
      handlers.clear()
      connectionHandlers.clear()
    },
  }
}
