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

export type PlayerState = {
  sessionStartedAt: number
  speaking: boolean
  song: Song
  messages: Message[]
}
