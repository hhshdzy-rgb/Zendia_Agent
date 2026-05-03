import { runClaude } from '../claude.js'
import { buildContext } from '../context.js'
import { buildDjDirective, parseDjReply, type DjReply } from '../dj-contract.js'
import type { Hub } from '../hub.js'
import { getSongUrl, searchSong } from '../ncm.js'
import { synthesize } from '../tts.js'
import type { Song, WordTiming } from '../types.js'

// Live DJ runtime:
// 1. build context + directive
// 2. call Claude and parse { say, play, reason, segue }
// 3. resolve the next song and synthesize DJ voice
// 4. emit song/message events over the hub
//
// Important handoff rule: when a song has ended and Claude selects the next
// track, emit the new song as soon as the intro segment begins. The DJ voice
// then rides over the new track's intro instead of leaving a long silence.

const PER_WORD_MS = 220
const PAUSE_BETWEEN_MS = Number(process.env.ZENDIA_DJ_PAUSE_MS ?? 180_000)
const MIN_TURN_MS = Number(process.env.ZENDIA_DJ_MIN_TURN_MS ?? 8000)
const CLAUDE_TIMEOUT_MS = 30_000
const MIN_SONG_INTERVAL_MS = Number(process.env.ZENDIA_SONG_INTERVAL_MS ?? 180_000)
const FAST_SKIP_QUERIES = (
  process.env.ZENDIA_FAST_SKIP_QUERIES ?? 'Jay Chou Qing Tian|Eason Chan Ten Years|Bread If'
)
  .split('|')
  .map((q) => q.trim())
  .filter(Boolean)

const FALLBACK_SONG: Song = {
  title: 'Monday Night Exhale',
  artist: 'SoundHelix',
  album: 'Demo',
  streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  durationSec: 0,
  positionSec: 0,
}

async function synthesizeSafely(text: string): ReturnType<typeof synthesize> {
  try {
    return await synthesize(text)
  } catch (err) {
    console.warn('[live] tts failed:', (err as Error).message)
    return null
  }
}

async function resolvePlayQueue(queries: string[], excludeIds = new Set<number>()): Promise<Song | null> {
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
      if (excludeIds.has(hit.id)) continue
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
  let lastSongId: number | undefined
  let lastSongChangeAt = 0
  let currentSong: { title: string; artist: string } | null = null
  let turnInFlight = false
  let runImmediatelyAfterTurn = false
  let skipIntroInFlight = false
  let fastSkipInFlight = false
  let fastSkipCursor = 0
  // Latest unanswered user chat. Set by onUserMessage; consumed by the next
  // generateTurn (and immediately cleared so we don't keep replying to it).
  // Multiple messages arriving while a turn is in flight collapse to the
  // most recent — earlier ones still appear in the timeline but only the
  // last gets a dedicated DJ reply.
  let pendingUserMessage: string | null = null
  // Handle to the speak-done timer of the *current* in-flight turn, so a
  // user message can short-circuit the wordCount×220ms wait and get a
  // reply within ~7s instead of 30s. Both fields cleared once fired.
  let activeSpeakDoneTimer: ReturnType<typeof setTimeout> | null = null
  let activeSpeakDoneFire: (() => void) | null = null
  let nextTurnTimer: ReturnType<typeof setTimeout> | null = null
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t)
      if (!stopped) fn()
    }, ms)
    timers.add(t)
  }

  const scheduleNextTurn = (delayMs: number) => {
    if (nextTurnTimer) clearTimeout(nextTurnTimer)
    nextTurnTimer = setTimeout(() => {
      nextTurnTimer = null
      if (!stopped) generateTurn()
    }, delayMs)
  }

  const unsubscribeSongEnded = hub.onSongEnded(() => {
    if (hub.getHandoffReason() === 'skip') {
      void fastSkipNow()
      return
    }
    if (turnInFlight) {
      runImmediatelyAfterTurn = true
      console.log('[live] handoff requested while turn is in flight; queued next turn')
      return
    }
    console.log('[live] client requested song handoff; triggering next turn now')
    scheduleNextTurn(0)
  })

  const unsubscribeUserMessage = hub.onUserMessage((text) => {
    pendingUserMessage = text
    if (turnInFlight && activeSpeakDoneFire) {
      // The current turn is past Claude/Fish/NCM and just sitting on the
      // wordCount × PER_WORD_MS wait. Fire the done callback now so the
      // turn releases and we can run the reply turn ~immediately.
      runImmediatelyAfterTurn = true
      console.log(
        `[live] user message during speak; short-circuiting speak timer to reply faster: ${JSON.stringify(text.slice(0, 60))}`,
      )
      const fire = activeSpeakDoneFire
      const timer = activeSpeakDoneTimer
      activeSpeakDoneFire = null
      activeSpeakDoneTimer = null
      if (timer) {
        clearTimeout(timer)
        timers.delete(timer)
      }
      fire()
      return
    }
    if (turnInFlight) {
      runImmediatelyAfterTurn = true
      console.log(`[live] user message during turn; queued reply: ${JSON.stringify(text.slice(0, 60))}`)
      return
    }
    console.log(`[live] user message; triggering reply turn: ${JSON.stringify(text.slice(0, 60))}`)
    scheduleNextTurn(0)
  })

  hub.emit({ type: 'song', song: FALLBACK_SONG })

  const generateTurn = async () => {
    if (stopped || turnInFlight) return
    turnInFlight = true
    const turnStart = Date.now()

    // Consume any pending user message — if present, this turn becomes
    // a direct reply (mode = 'reply') instead of a normal broadcast turn.
    const userMessage = pendingUserMessage
    pendingUserMessage = null

    const ctx = buildContext({
      environment: {
        now: new Date(),
        weather: 'overcast, cool; placeholder',
      },
    })

    const songEnded = hub.isCurrentSongEnded()
    const handoffReason = hub.getHandoffReason()
    const isFirstSong = lastSongChangeAt === 0
    const mode: 'intro' | 'mid-song' | 'reply' = userMessage
      ? 'reply'
      : songEnded || isFirstSong
        ? 'intro'
        : 'mid-song'
    const directive = buildDjDirective({
      ...(currentSong ? { nowPlaying: currentSong } : {}),
      mode,
      ...(userMessage ? { userMessage } : {}),
    })
    const userInput = userMessage
      ? `The listener just said: "${userMessage}"`
      : handoffReason === 'skip'
        ? 'The listener just skipped the current song. Pick a different new track now; do not keep commenting on the skipped track.'
        : undefined

    let reply: DjReply | null = null
    try {
      const result = await runClaude(directive, {
        systemPrompt: userInput
          ? `${ctx.systemPrompt}\n\n---\n\n# User input\n\n${userInput}`
          : ctx.systemPrompt,
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
      turnInFlight = false
      // If this was a reply turn (user message in flight), drop the
      // "thinking…" indicator so the UI doesn't hang on it.
      if (mode === 'reply') hub.emit({ type: 'dj_thinking', on: false })
      scheduleNextTurn(MIN_TURN_MS)
      return
    }

    const forceNewSong = handoffReason === 'skip' || mode === 'intro'
    const playQueries =
      forceNewSong && reply.play.length === 0
        ? ['Jay Chou Qing Tian', 'Eason Chan Ten Years', 'Bread If']
        : reply.play

    const [nextSong, voice] = await Promise.all([
      playQueries.length > 0
        ? resolvePlayQueue(playQueries, lastSongId !== undefined ? new Set([lastSongId]) : new Set())
        : Promise.resolve(null),
      synthesizeSafely(reply.say),
    ])

    if (playQueries.length > 0) {
      if (nextSong) {
        console.log(`[live] resolved -> ${nextSong.title} - ${nextSong.artist}`)
      } else {
        console.warn(`[live] could not resolve any of: ${JSON.stringify(playQueries)}`)
      }
    }
    if (voice) {
      console.log(`[live] tts ${voice.cached ? 'cached' : 'fresh'} ${voice.bytes}B -> ${voice.url}`)
    }

    // In reply mode, the listener explicitly asked — bypass cooldown +
    // song-still-playing gates so their request lands immediately.
    const forceSwap = mode === 'reply' && !!nextSong
    const startedAtIntro = tryStartNextSong(nextSong, mode === 'reply' ? 'reply' : 'intro', forceSwap)

    speakLine(reply, voice?.url, voice?.wordTimings, () => {
      if (!startedAtIntro) tryStartNextSong(nextSong, 'post-speech', forceSwap)
      turnInFlight = false
      if (runImmediatelyAfterTurn && !startedAtIntro) {
        runImmediatelyAfterTurn = false
        scheduleNextTurn(0)
        return
      }
      runImmediatelyAfterTurn = false
      const elapsed = Date.now() - turnStart
      const wait = Math.max(PAUSE_BETWEEN_MS, MIN_TURN_MS - elapsed)
      scheduleNextTurn(wait)
    })
  }

  async function fastSkipNow() {
    if (fastSkipInFlight) return
    fastSkipInFlight = true
    if (nextTurnTimer) {
      clearTimeout(nextTurnTimer)
      nextTurnTimer = null
    }

    const excludeIds = lastSongId !== undefined ? new Set([lastSongId]) : new Set<number>()
    const rotatedQueries = [
      ...FAST_SKIP_QUERIES.slice(fastSkipCursor),
      ...FAST_SKIP_QUERIES.slice(0, fastSkipCursor),
    ]
    fastSkipCursor = (fastSkipCursor + 1) % Math.max(1, FAST_SKIP_QUERIES.length)

    console.log('[live] fast skip: resolving next song without DJ turn')
    const nextSong = await resolvePlayQueue(rotatedQueries, excludeIds)
    fastSkipInFlight = false

    if (stopped) return
    if (nextSong && tryStartNextSong(nextSong, 'skip')) {
      runImmediatelyAfterTurn = false
      void speakSkipIntro(nextSong)
      return
    }

    console.warn('[live] fast skip could not resolve a quick song; falling back to DJ turn')
    if (turnInFlight) {
      runImmediatelyAfterTurn = true
    } else {
      scheduleNextTurn(0)
    }
  }

  async function speakSkipIntro(song: Song) {
    if (skipIntroInFlight || turnInFlight || stopped) return
    skipIntroInFlight = true
    turnInFlight = true

    const ctx = buildContext({
      environment: {
        now: new Date(),
        weather: 'overcast, cool; placeholder',
      },
      userInput: `The listener skipped into "${song.title}" by ${song.artist}. Say a short DJ intro for this exact track. Do not choose another song; play must be [].`,
      historyLimit: 4,
    })
    const directive = buildDjDirective({
      nowPlaying: { title: song.title, artist: song.artist },
      mode: 'mid-song',
    })

    let reply: DjReply | null = null
    try {
      const result = await runClaude(directive, {
        systemPrompt: ctx.systemPrompt,
        timeoutMs: CLAUDE_TIMEOUT_MS,
      })
      if (result.ok) reply = parseDjReply(result.text ?? '')
      if (!result.ok || !reply) {
        console.warn('[live] skip intro failed; using fallback line')
      }
    } catch (err) {
      console.warn('[live] skip intro threw:', (err as Error).message)
    }

    const line: DjReply =
      reply ??
      ({
        say: `Switching it up now with ${song.title} by ${song.artist}. Let this one reset the room.`,
        play: [],
        reason: 'Fallback skip intro.',
        segue: '',
      } satisfies DjReply)

    const voice = await synthesizeSafely(line.say)
    speakLine(line, voice?.url, voice?.wordTimings, () => {
      skipIntroInFlight = false
      turnInFlight = false
      runImmediatelyAfterTurn = false
      scheduleNextTurn(PAUSE_BETWEEN_MS)
    })
  }

  function tryStartNextSong(
    nextSong: Song | null,
    phase: 'intro' | 'post-speech' | 'skip' | 'reply',
    force = false,
  ) {
    if (!nextSong) return false

    const sameSong = nextSong.id === lastSongId
    const sinceLastSwap = Date.now() - lastSongChangeAt
    const cooldownLeft = MIN_SONG_INTERVAL_MS - sinceLastSwap
    const songEndedNow = hub.isCurrentSongEnded()
    const isFirstSong = lastSongChangeAt === 0

    if (sameSong) {
      console.log(`[live] same song (${nextSong.id}); skipping song event to avoid restart`)
      return false
    }
    if (!force && !songEndedNow && !isFirstSong) {
      console.log(
        `[live] song still playing; keep "${currentSong?.title}", ignoring "${nextSong.title}" until client signals song_ended`,
      )
      return false
    }
    if (!force && !songEndedNow && cooldownLeft > 0 && !isFirstSong) {
      console.log(`[live] safety cooldown ${Math.round(cooldownLeft / 1000)}s; holding "${nextSong.title}"`)
      return false
    }

    hub.emit({ type: 'song', song: nextSong })
    lastSongId = nextSong.id
    lastSongChangeAt = Date.now()
    currentSong = { title: nextSong.title, artist: nextSong.artist }
    const tag = force ? `forced ${phase}` : phase
    console.log(`[live] started next song during ${tag}: ${nextSong.title} - ${nextSong.artist}`)
    return true
  }

  function speakLine(
    reply: DjReply,
    audioUrl: string | undefined,
    wordTimings: WordTiming[] | undefined,
    onDone: () => void,
  ) {
    const id = `live-${Date.now()}`
    const ts = Math.floor((Date.now() - hub.sessionStartedAt) / 1000)
    const wordCount = reply.say.split(/\s+/).filter(Boolean).length

    hub.emit({ type: 'tts_state', state: 'speaking' })
    hub.emit({
      type: 'message_new',
      message: {
        id,
        ts,
        type: 'dj_say',
        text: reply.say,
        status: 'speaking',
        highlightWord: 0,
        ...(audioUrl && { audioUrl }),
        ...(wordTimings && { wordTimings }),
      },
    })

    if (!audioUrl) {
      for (let w = 0; w < wordCount; w++) {
        later(w * PER_WORD_MS, () => {
          hub.emit({ type: 'message_word', id, wordIdx: w })
        })
      }
    }

    // The speak-done logic is split out so onUserMessage can fire it early
    // (see the activeSpeakDoneFire ref). It MUST be idempotent — if the
    // user-message handler invokes it, the setTimeout below would otherwise
    // double-fire; we guard by clearing both refs as the first step.
    const fire = () => {
      if (activeSpeakDoneFire !== fire) return // already fired
      activeSpeakDoneFire = null
      activeSpeakDoneTimer = null
      hub.emit({ type: 'message_done', id })
      hub.emit({ type: 'tts_state', state: 'idle' })
      onDone()
    }
    activeSpeakDoneFire = fire
    activeSpeakDoneTimer = setTimeout(() => {
      if (activeSpeakDoneTimer) timers.delete(activeSpeakDoneTimer)
      if (!stopped) fire()
    }, wordCount * PER_WORD_MS)
    timers.add(activeSpeakDoneTimer)
  }

  scheduleNextTurn(500)

  return () => {
    stopped = true
    if (nextTurnTimer) clearTimeout(nextTurnTimer)
    nextTurnTimer = null
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
    unsubscribeSongEnded()
    unsubscribeUserMessage()
  }
}
