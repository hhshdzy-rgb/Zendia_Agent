// Shared with web/src/types.ts. Mirrors the WebSocket protocol contract.
// TODO: extract to a shared package once we have more than one consumer.

export type Song = {
  title: string
  artist: string
  album: string
  durationSec: number
  positionSec: number
  streamUrl?: string
  // Stable identity, for example an NCM song id. Used so a fresh signed URL
  // for the same track does not restart playback.
  id?: number
}

export type WordTiming = {
  word: string
  start: number
  end: number
}

export type Message = {
  id: string
  ts: number
  type: 'dj_say' | 'song' | 'system' | 'user_chat'
  text: string
  status: 'pending' | 'speaking' | 'done' | 'failed'
  highlightWord?: number
  audioUrl?: string
  songId?: number
  wordTimings?: WordTiming[]
}

export type ServerEvent =
  | { type: 'hello'; sessionStartedAt: number }
  | { type: 'song'; song: Song }
  | { type: 'song_progress'; positionSec: number }
  | { type: 'tts_state'; state: 'speaking' | 'idle' }
  // True the moment a user_message lands; false once the reply turn
  // emits tts_state='speaking' (or fails). Lets the UI show a
  // "thinking" indicator instead of leaving the listener wondering.
  | { type: 'dj_thinking'; on: boolean }
  | { type: 'message_new'; message: Message }
  | { type: 'message_word'; id: string; wordIdx: number }
  | { type: 'message_done'; id: string }

export type ClientEvent =
  | { type: 'song_ended'; id?: number }
  | { type: 'skip_song'; id?: number }
  | { type: 'user_message'; text: string; clientMsgId: string }
  | { type: 'like_song'; songId: number; liked: boolean }
  | { type: 'ping' }
