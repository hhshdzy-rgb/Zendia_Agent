import type { Hub } from '../hub.js'
import type { Song } from '../types.js'

// Scripted DJ replay — the placeholder pipeline output until the real
// router → context → claude → tts chain lands. Mirrors the per-word
// cadence from web/src/lib/stream.ts so the UI feels identical whether
// it's running against the mock or the server.

const SCRIPT_LINES = [
  "It's late on a Monday, and here's a song that moves with your breath.",
  'Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper.',
  "You'll feel yourself lift off the ground a little.",
  "This one's called Monday Night Exhale.",
]

const PER_WORD_MS = 220
const PAUSE_BETWEEN_MS = 1500

const DEMO_SONG: Song = {
  title: 'Monday Night Exhale',
  artist: 'SoundHelix',
  album: 'Demo',
  streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  durationSec: 0,
  positionSec: 0,
}

export function startScriptedDJ(hub: Hub): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }

  hub.emit({ type: 'song', song: DEMO_SONG })

  // Seed history so a fresh client doesn't see an empty timeline
  SCRIPT_LINES.slice(0, 3).forEach((text, i) => {
    hub.emit({
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
    const text = SCRIPT_LINES[cycle % SCRIPT_LINES.length]!
    const id = `live-${cycle}-${Date.now()}`
    const ts = Math.floor((Date.now() - hub.sessionStartedAt) / 1000)
    const wordCount = text.split(/\s+/).filter(Boolean).length

    hub.emit({ type: 'tts_state', state: 'speaking' })
    hub.emit({
      type: 'message_new',
      message: { id, ts, type: 'dj_say', text, status: 'speaking', highlightWord: 0 },
    })

    for (let w = 0; w < wordCount; w++) {
      later(w * PER_WORD_MS, () => {
        hub.emit({ type: 'message_word', id, wordIdx: w })
      })
    }
    later(wordCount * PER_WORD_MS, () => {
      hub.emit({ type: 'message_done', id })
      hub.emit({ type: 'tts_state', state: 'idle' })
    })
    later(wordCount * PER_WORD_MS + PAUSE_BETWEEN_MS, () => {
      cycle++
      playOne()
    })
  }
  later(400, playOne)

  return () => {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
  }
}
