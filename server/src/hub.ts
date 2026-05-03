import type { WebSocket } from 'ws'
import { messagesRepo } from './db.js'
import type { ClientEvent, Message, ServerEvent, Song } from './types.js'

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
      case 'ping':
        return
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
