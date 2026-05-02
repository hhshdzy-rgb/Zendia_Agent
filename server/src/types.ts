// Shared with web/src/types.ts — mirrors the WS protocol contract.
// TODO: extract to a shared package once we have more than one consumer.

export type Song = {
  title: string
  artist: string
  album: string
  durationSec: number
  positionSec: number
  streamUrl?: string
}

export type Message = {
  id: string
  ts: number
  text: string
  status: 'pending' | 'speaking' | 'done'
  highlightWord?: number
}

export type ServerEvent =
  | { type: 'hello'; sessionStartedAt: number }
  | { type: 'song'; song: Song }
  | { type: 'song_progress'; positionSec: number }
  | { type: 'tts_state'; state: 'speaking' | 'idle' }
  | { type: 'message_new'; message: Message }
  | { type: 'message_word'; id: string; wordIdx: number }
  | { type: 'message_done'; id: string }
