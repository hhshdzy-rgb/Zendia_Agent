import type { WebSocket } from 'ws'
import { messagesRepo } from './db.js'
import type { Message, ServerEvent, Song } from './types.js'

// Single shared broadcaster. State is the union of the most recent
// "snapshot-worthy" events (song, speaking, recent messages); when a new
// client connects, we replay this snapshot before forwarding live events.
//
// Messages are written to SQLite for archival, but the in-memory window
// starts EMPTY on each server boot — radio metaphor: tune in, hear what's
// happening now, not a recap of past sessions. The persisted db is still
// there for a future "history" view to read directly.

const HISTORY_LIMIT = 20

export class Hub {
  readonly sessionStartedAt = Date.now()
  private song: Song | null = null
  private speaking = false
  private messages: Message[] = []
  private clients = new Set<WebSocket>()

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
  }

  private apply(event: ServerEvent): void {
    switch (event.type) {
      case 'song':
        this.song = event.song
        return
      case 'song_progress':
        if (this.song) this.song = { ...this.song, positionSec: event.positionSec }
        return
      case 'tts_state':
        this.speaking = event.state === 'speaking'
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
