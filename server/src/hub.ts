import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebSocket } from 'ws'
import { messagesRepo } from './db.js'
import { setSongLiked } from './ncm.js'
import type { ClientEvent, Message, ServerEvent, Song } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..')
const LEARNED_LIKES_PATH = path.join(SERVER_ROOT, 'user', 'learned-likes.md')
const DISLIKED_PATH = path.join(SERVER_ROOT, 'user', 'disliked.md')

// Single shared broadcaster. State is the union of the most recent
// snapshot-worthy events: song, speaking state, and recent messages.
// New clients receive the snapshot before live events.

const HISTORY_LIMIT = 20

export class Hub {
  readonly sessionStartedAt = Date.now()
  private song: Song | null = null
  private speaking = false
  private messages: Message[] = []
  private clients = new Set<WebSocket>()
  // True when a client reports that the current song should hand off, either
  // because it ended naturally or because the user skipped it.
  private currentSongEnded = false
  private handoffReason: 'ended' | 'skip' | null = null
  private thinking = false
  private songEndedListeners = new Set<() => void>()
  private userMessageListeners = new Set<(text: string) => void>()
  // Trim absurdly long inputs so a single user can't blow up token budget
  // or the prompt size in one go.
  private static readonly MAX_USER_MESSAGE_CHARS = 1000

  isCurrentSongEnded(): boolean {
    return this.currentSongEnded
  }

  getHandoffReason(): 'ended' | 'skip' | null {
    return this.handoffReason
  }

  onSongEnded(fn: () => void): () => void {
    this.songEndedListeners.add(fn)
    return () => {
      this.songEndedListeners.delete(fn)
    }
  }

  // Subscribers (live loop, mainly) get notified after the user message
  // has been persisted + broadcast, so they can react with a Claude turn.
  onUserMessage(fn: (text: string) => void): () => void {
    this.userMessageListeners.add(fn)
    return () => {
      this.userMessageListeners.delete(fn)
    }
  }

  handleClientEvent(event: ClientEvent): void {
    switch (event.type) {
      case 'song_ended':
      case 'skip_song':
        // Match against current song id when the client provides one; this
        // guards against stale events after the server has already swapped.
        if (event.id !== undefined && event.id !== this.song?.id) return
        this.currentSongEnded = true
        this.handoffReason = event.type === 'skip_song' ? 'skip' : 'ended'
        this.songEndedListeners.forEach((fn) => fn())
        return
      case 'user_message': {
        const text = event.text?.trim()
        const id = event.clientMsgId?.trim()
        if (!text || !id) return // silent drop on malformed frames
        const truncated =
          text.length > Hub.MAX_USER_MESSAGE_CHARS
            ? text.slice(0, Hub.MAX_USER_MESSAGE_CHARS)
            : text
        const message: Message = {
          id,
          ts: Math.floor((Date.now() - this.sessionStartedAt) / 1000),
          type: 'user_chat',
          text: truncated,
          status: 'done',
        }
        // Reuse the message_new path so the broadcast + dedup + DB insert
        // logic stays in one place.
        this.emit({ type: 'message_new', message })
        // Light up the "thinking…" indicator immediately. The reply turn
        // will clear it when it emits tts_state='speaking' (or fails).
        this.emit({ type: 'dj_thinking', on: true })
        this.userMessageListeners.forEach((fn) => fn(truncated))
        return
      }
      case 'like_song': {
        const { songId, liked } = event
        if (!songId || !Number.isFinite(songId)) return
        // Fire-and-forget: write the local "learned" record first (cheap,
        // synchronous) so model context catches it next turn even if the
        // NCM API is slow / fails. Then call NCM.
        if (liked && this.song?.id === songId) {
          this.appendLearnedLike(this.song.title, this.song.artist)
        }
        setSongLiked(songId, liked)
          .then((res) => {
            if (!res.ok) {
              console.warn(`[hub] NCM like(${songId}, ${liked}) returned non-200`)
            } else {
              console.log(`[hub] NCM like(${songId}, ${liked}) ok`)
            }
          })
          .catch((err) => {
            console.warn(`[hub] NCM like threw:`, (err as Error).message)
          })
        return
      }
      case 'dislike_song': {
        const { songId, title, artist } = event
        if (!songId || !Number.isFinite(songId)) return
        // Persist as a strong negative signal in the user corpus so the
        // model stops recommending it. Resolve title/artist from current
        // song if the client didn't include them.
        const fallbackTitle = this.song?.id === songId ? this.song.title : 'unknown'
        const fallbackArtist = this.song?.id === songId ? this.song.artist : 'unknown'
        this.appendDislike(
          songId,
          (title?.trim() || fallbackTitle) ?? 'unknown',
          (artist?.trim() || fallbackArtist) ?? 'unknown',
        )
        // Trigger a fast skip if it's the currently-playing track. Same
        // path the Skip button uses, so the live loop does the right thing
        // (fastSkipNow → speakSkipIntro).
        if (this.song?.id === songId) {
          this.currentSongEnded = true
          this.handoffReason = 'skip'
          this.songEndedListeners.forEach((fn) => fn())
        }
        return
      }
      case 'ping':
        return
    }
  }

  private appendDislike(songId: number, title: string, artist: string): void {
    try {
      const dir = path.dirname(DISLIKED_PATH)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().slice(0, 10)
      const line = `- ${stamp}: ${title} — ${artist} (id ${songId})\n`
      if (!existsSync(DISLIKED_PATH)) {
        appendFileSync(
          DISLIKED_PATH,
          `# Disliked songs\n\nThe listener pressed "not for me" on these. **Do not recommend any track from this list — find something different.**\n\n`,
        )
      }
      appendFileSync(DISLIKED_PATH, line)
      console.log(`[hub] dislike persisted: ${title} — ${artist}`)
    } catch (err) {
      console.warn('[hub] failed to append disliked:', (err as Error).message)
    }
  }

  private appendLearnedLike(title: string, artist: string): void {
    try {
      const dir = path.dirname(LEARNED_LIKES_PATH)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().slice(0, 10)
      const line = `- ${stamp}: ${title} — ${artist}\n`
      if (!existsSync(LEARNED_LIKES_PATH)) {
        appendFileSync(
          LEARNED_LIKES_PATH,
          `# Learned likes\n\nSongs the listener heart-ed in-app. Treat as strong signal for recommendations.\n\n`,
        )
      }
      appendFileSync(LEARNED_LIKES_PATH, line)
    } catch (err) {
      console.warn('[hub] failed to append learned-like:', (err as Error).message)
    }
  }

  emit(event: ServerEvent): void {
    this.apply(event)
    const frame = JSON.stringify(event)
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(frame)
    }
  }

  snapshot(): { sessionStartedAt: number; song: Song | null; speaking: boolean; messages: Message[] } {
    return {
      sessionStartedAt: this.sessionStartedAt,
      song: this.song,
      speaking: this.speaking,
      messages: this.messages,
    }
  }

  subscribe(ws: WebSocket): void {
    this.clients.add(ws)
    this.sendSnapshot(ws)
    ws.on('close', () => this.clients.delete(ws))
    ws.on('error', () => this.clients.delete(ws))
  }

  private sendSnapshot(ws: WebSocket): void {
    const send = (e: ServerEvent) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e))
    }
    send({ type: 'hello', sessionStartedAt: this.sessionStartedAt })
    if (this.song) send({ type: 'song', song: this.song })
    for (const message of this.messages) {
      send({ type: 'message_new', message })
    }
    send({ type: 'tts_state', state: this.speaking ? 'speaking' : 'idle' })
    if (this.thinking) send({ type: 'dj_thinking', on: true })
  }

  private apply(event: ServerEvent): void {
    switch (event.type) {
      case 'song':
        this.song = event.song
        this.currentSongEnded = false
        this.handoffReason = null
        return
      case 'song_progress':
        if (this.song) this.song = { ...this.song, positionSec: event.positionSec }
        return
      case 'tts_state':
        this.speaking = event.state === 'speaking'
        // Once the DJ actually starts speaking, the thinking spinner
        // should drop. Same for explicit idle (failed reply, etc.).
        if (this.thinking) this.thinking = false
        return
      case 'dj_thinking':
        this.thinking = event.on
        return
      case 'message_new': {
        if (this.messages.some((m) => m.id === event.message.id)) return
        this.messages.push(event.message)
        if (this.messages.length > HISTORY_LIMIT) {
          this.messages.splice(0, this.messages.length - HISTORY_LIMIT)
        }
        messagesRepo.insert(event.message)
        return
      }
      case 'message_word': {
        const idx = this.messages.findIndex((m) => m.id === event.id)
        if (idx >= 0) {
          this.messages[idx] = { ...this.messages[idx]!, highlightWord: event.wordIdx }
          messagesRepo.updateWord(event.id, event.wordIdx)
        }
        return
      }
      case 'message_done': {
        const idx = this.messages.findIndex((m) => m.id === event.id)
        if (idx >= 0) {
          this.messages[idx] = { ...this.messages[idx]!, status: 'done', highlightWord: undefined }
          messagesRepo.markDone(event.id)
        }
        return
      }
      case 'hello':
        return
    }
  }
}
