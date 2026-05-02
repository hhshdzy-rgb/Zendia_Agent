import { runClaude } from '../claude.js'
import { buildContext } from '../context.js'
import { buildDjDirective, parseDjReply, type DjReply } from '../dj-contract.js'
import type { Hub } from '../hub.js'
import { getSongUrl, searchSong } from '../ncm.js'
import { synthesize } from '../tts.js'
import type { Song } from '../types.js'

// Live DJ — replaces the scripted replay with real Claude generations.
// Each turn:
//   1. buildContext + buildDjDirective + runClaude
//   2. parse {say, play, reason, segue}
//   3. emit message_new + per-word advance + message_done
//   4. wait, repeat
//
// Failures (subprocess error / parse error / contract violation) are
// logged and the loop waits MIN_TURN_MS before trying again — never
// crashes the server, never burns into a tight retry storm.

const PER_WORD_MS = 220
const PAUSE_BETWEEN_MS = Number(process.env.ZENDIA_DJ_PAUSE_MS ?? 5000)
const MIN_TURN_MS = Number(process.env.ZENDIA_DJ_MIN_TURN_MS ?? 8000)
const CLAUDE_TIMEOUT_MS = 30_000

// Fallback when NCM can't resolve any of the model's play[] entries
// (region-locked, VIP-only, or the model invented a song that doesn't
// exist on NCM). We keep streaming the demo until the next turn picks
// something playable.
const FALLBACK_SONG: Song = {
  title: 'Monday Night Exhale',
  artist: 'SoundHelix',
  album: 'Demo',
  streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  durationSec: 0,
  positionSec: 0,
}

// Wrapper so a Fish Audio failure (no key, 402 balance, network) just
// means "no voice this turn" instead of crashing the whole loop.
async function synthesizeSafely(text: string): ReturnType<typeof synthesize> {
  try {
    return await synthesize(text)
  } catch (err) {
    console.warn('[live] tts failed:', (err as Error).message)
    return null
  }
}

// Walk the model's queue in order; for each query, search NCM and try
// to resolve a stream URL on each hit. Return the first that works.
async function resolvePlayQueue(queries: string[]): Promise<Song | null> {
  for (const query of queries) {
    if (!query.trim()) continue
    let hits
    try {
      hits = await searchSong(query, 5)
    } catch (err) {
      console.warn(`[live] ncm search threw for "${query}":`, (err as Error).message)
      continue
    }
    for (const hit of hits) {
      let url
      try {
        url = await getSongUrl(hit.id)
      } catch (err) {
        console.warn(`[live] ncm song_url threw for ${hit.id}:`, (err as Error).message)
        continue
      }
      if (!url) continue
      return {
        id: hit.id,
        title: hit.name,
        artist: hit.artists.join(', '),
        album: hit.album,
        streamUrl: url.url,
        durationSec: 0,
        positionSec: 0,
      }
    }
  }
  return null
}

export function startLiveDJ(hub: Hub): () => void {
  let stopped = false
  // Last-emitted song identity. NCM signs URLs per-call so the same
  // track gets a different streamUrl every resolve; if we re-emit, the
  // frontend reloads audio from position 0. Dedup by stable id.
  let lastSongId: number | undefined
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t)
      if (!stopped) fn()
    }, ms)
    timers.add(t)
  }

  hub.emit({ type: 'song', song: FALLBACK_SONG })

  const generateTurn = async () => {
    if (stopped) return
    const turnStart = Date.now()

    // Weather is a hardcoded placeholder until OpenWeather lands; even a
    // wrong-but-present weather string nudges the model away from generic
    // "feel-good Saturday night" output toward something mood-aware.
    const ctx = buildContext({
      environment: {
        now: new Date(),
        weather: 'overcast, cool — placeholder',
      },
    })
    const directive = buildDjDirective()

    let reply: DjReply | null = null
    try {
      const result = await runClaude(directive, {
        systemPrompt: ctx.systemPrompt,
        timeoutMs: CLAUDE_TIMEOUT_MS,
      })
      if (!result.ok) {
        console.warn(`[live] claude failed in ${result.durationMs}ms:`, result.error?.slice(0, 200))
      } else {
        reply = parseDjReply(result.text ?? '')
        if (!reply) {
          console.warn('[live] reply did not match contract:', result.text?.slice(0, 200))
        } else {
          console.log(
            `[live] turn ok in ${result.durationMs}ms, ${reply.say.length} chars, play=${JSON.stringify(reply.play)}`,
          )
        }
      }
    } catch (err) {
      console.warn('[live] generation threw:', (err as Error).message)
    }

    if (stopped) return
    if (!reply) {
      // Skip this turn but keep the loop alive
      later(MIN_TURN_MS, generateTurn)
      return
    }

    // Resolve the next song AND synthesize the DJ voice in parallel —
    // both are independent and either can fail without blocking the other.
    const [nextSong, voice] = await Promise.all([
      reply.play.length > 0 ? resolvePlayQueue(reply.play) : Promise.resolve(null),
      synthesizeSafely(reply.say),
    ])

    if (reply.play.length > 0) {
      if (nextSong) {
        console.log(`[live] resolved -> ${nextSong.title} — ${nextSong.artist}`)
      } else {
        console.warn(`[live] could not resolve any of: ${JSON.stringify(reply.play)}`)
      }
    }
    if (voice) {
      console.log(`[live] tts ${voice.cached ? 'cached' : 'fresh'} ${voice.bytes}B -> ${voice.url}`)
    }

    speakLine(reply, voice?.url, () => {
      if (nextSong && nextSong.id !== lastSongId) {
        hub.emit({ type: 'song', song: nextSong })
        lastSongId = nextSong.id
      } else if (nextSong) {
        console.log(`[live] same song (${nextSong.id}) — skipping song event to avoid restart`)
      }
      const elapsed = Date.now() - turnStart
      const wait = Math.max(PAUSE_BETWEEN_MS, MIN_TURN_MS - elapsed)
      later(wait, generateTurn)
    })
  }

  function speakLine(reply: DjReply, audioUrl: string | undefined, onDone: () => void) {
    const id = `live-${Date.now()}`
    const ts = Math.floor((Date.now() - hub.sessionStartedAt) / 1000)
    const wordCount = reply.say.split(/\s+/).filter(Boolean).length

    hub.emit({ type: 'tts_state', state: 'speaking' })
    hub.emit({
      type: 'message_new',
      message: {
        id,
        ts,
        text: reply.say,
        status: 'speaking',
        highlightWord: 0,
        ...(audioUrl && { audioUrl }),
      },
    })

    // When TTS audio is present, the frontend drives word highlighting from
    // audio.currentTime — skip the per-word event spam. Only schedule the
    // done/idle transition (still on the 220ms estimate; if audio runs
    // longer, frontend keeps playing until it ends; if shorter, status
    // flips slightly before audio finishes — both tolerable for MVP).
    if (!audioUrl) {
      for (let w = 0; w < wordCount; w++) {
        later(w * PER_WORD_MS, () => {
          hub.emit({ type: 'message_word', id, wordIdx: w })
        })
      }
    }

    later(wordCount * PER_WORD_MS, () => {
      hub.emit({ type: 'message_done', id })
      hub.emit({ type: 'tts_state', state: 'idle' })
      onDone()
    })
  }

  // Kick off the first turn after a short delay so the WS handshake
  // has time to settle for any client that connected at boot.
  later(500, generateTurn)

  return () => {
    stopped = true
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
  }
}
