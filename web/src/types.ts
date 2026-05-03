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
  type: 'dj_say' | 'song' | 'system'
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
  | { type: 'ping' }

export type PlayerState = {
  sessionStartedAt: number
  speaking: boolean
  song: Song
  messages: Message[]
}
