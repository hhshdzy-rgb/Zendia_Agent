import type { Message, Song } from '../types'

export type ServerEvent =
  | { type: 'hello'; sessionStartedAt: number }
  | { type: 'song'; song: Song }
  | { type: 'song_progress'; positionSec: number }
  | { type: 'tts_state'; state: 'speaking' | 'idle' }
  | { type: 'message_new'; message: Message }
  | { type: 'message_word'; id: string; wordIdx: number }
  | { type: 'message_done'; id: string }

export type EventStream = {
  subscribe: (handler: (e: ServerEvent) => void) => () => void
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
  const intervals = new Set<ReturnType<typeof setInterval>>()

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
    // SoundHelix CC0 demo track — replaceable when real backend lands
    streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    durationSec: 0, // filled in by audio element on load
    positionSec: 0,
  }

  // Boot sequence
  emit({ type: 'hello', sessionStartedAt })
  emit({ type: 'song', song })

  // Seed timeline with a few "history" messages so the screen isn't empty
  SCRIPT_LINES.slice(0, 3).forEach((text, i) => {
    emit({
      type: 'message_new',
      message: {
        id: `seed-${i}`,
        ts: Math.max(0, i * 4),
        text,
        status: 'done',
      },
    })
  })

  // Position is now driven by the <audio> element's timeupdate event,
  // so the mock no longer emits song_progress.

  // Looping speaking-message generator
  let cycle = 0
  const playOne = () => {
    const text = SCRIPT_LINES[cycle % SCRIPT_LINES.length]
    const id = `live-${cycle}-${Date.now()}`
    const ts = Math.floor((Date.now() - sessionStartedAt) / 1000)
    const wordCount = text.split(/\s+/).filter(Boolean).length

    emit({ type: 'tts_state', state: 'speaking' })
    emit({
      type: 'message_new',
      message: { id, ts, text, status: 'speaking', highlightWord: 0 },
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
    close: () => {
      handlers.clear()
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
      intervals.forEach((i) => clearInterval(i))
      intervals.clear()
    },
  }
}

export function createWebSocketStream(url: string): EventStream {
  const handlers = new Set<(e: ServerEvent) => void>()
  let ws: WebSocket | null = null
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let backoff = 500

  const connect = () => {
    if (closed) return
    ws = new WebSocket(url)
    ws.onopen = () => {
      backoff = 500
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ServerEvent
        handlers.forEach((h) => h(data))
      } catch {
        // malformed frame — ignore
      }
    }
    ws.onclose = () => {
      if (closed) return
      reconnectTimer = setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 5000)
    }
    ws.onerror = () => ws?.close()
  }

  connect()

  return {
    subscribe: (h) => {
      handlers.add(h)
      return () => {
        handlers.delete(h)
      }
    },
    close: () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
      handlers.clear()
    },
  }
}
