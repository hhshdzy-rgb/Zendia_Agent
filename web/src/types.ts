export type Song = {
  title: string
  artist: string
  album: string
  durationSec: number
  positionSec: number
  streamUrl?: string
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

export type ClientEvent =
  | { type: 'song_ended'; id?: number }
  | { type: 'skip_song'; id?: number }
  | { type: 'user_message'; text: string; clientMsgId: string }
  | { type: 'like_song'; songId: number; liked: boolean }
  | { type: 'ping' }

export type PlayerState = {
  sessionStartedAt: number
  speaking: boolean
  // True between "user_message arrived" and "DJ reply audio starts".
  // Frontend uses it for a "thinking…" indicator while Claude generates.
  thinking: boolean
  song: Song
  messages: Message[]
}
