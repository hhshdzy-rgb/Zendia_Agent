// Shared with web/src/types.ts — mirrors the WS protocol contract.
// TODO: extract to a shared package once we have more than one consumer.

export type Song = {
  title: string
  artist: string
  album: string
  durationSec: number
  positionSec: number
  streamUrl?: string
  // Stable identity (e.g. NCM song id). Used for "is this the same song?"
  // dedup so a fresh signed URL for the same track doesn't restart playback.
  id?: number
}

export type Message = {
  id: string
  ts: number
  text: string
  status: 'pending' | 'speaking' | 'done'
  highlightWord?: number
  audioUrl?: string  // /tts/<hash>.mp3 when TTS synthesis succeeded
}

export type ServerEvent =
  | { type: 'hello'; sessionStartedAt: number }
  | { type: 'song'; song: Song }
  | { type: 'song_progress'; positionSec: number }
  | { type: 'tts_state'; state: 'speaking' | 'idle' }
  | { type: 'message_new'; message: Message }
  | { type: 'message_word'; id: string; wordIdx: number }
  | { type: 'message_done'; id: string }

// Client → server messages over the same WS.
export type ClientEvent =
  | { type: 'song_ended'; id?: number }
  | { type: 'ping' }
