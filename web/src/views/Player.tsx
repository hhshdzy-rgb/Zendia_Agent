import { useState } from 'react'
import Header from '../components/Header'
import DJWaveform from '../components/DJWaveform'
import NowPlayingCard from '../components/NowPlayingCard'
import MessageTimeline from '../components/MessageTimeline'
import type { PlayerState } from '../types'
import './Player.css'

const MOCK: PlayerState = {
  sessionStartedAt: Date.now() - 5000,
  speaking: true,
  song: {
    title: 'Monday Night Exhale',
    artist: 'Bread',
    album: 'If',
    durationSec: 207,
    positionSec: 140,
  },
  messages: [
    {
      id: 'm1',
      ts: 1,
      text: "It's late on a Monday, and here's a song that moves with your breath.",
      status: 'speaking',
      highlightWord: 8,
    },
    {
      id: 'm2',
      ts: 5,
      text: 'Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper',
      status: 'done',
    },
    {
      id: 'm3',
      ts: 11,
      text: "you'll feel yourself lift off the ground a little.",
      status: 'done',
    },
    {
      id: 'm4',
      ts: 14,
      text: "This one's called…",
      status: 'done',
    },
  ],
}

export default function Player() {
  const [paused, setPaused] = useState(false)
  const elapsed = Math.floor((Date.now() - MOCK.sessionStartedAt) / 1000)

  return (
    <div className="view-player">
      <Header speaking={MOCK.speaking} sessionElapsedSec={elapsed} />
      <DJWaveform speaking={MOCK.speaking} />
      <NowPlayingCard
        song={MOCK.song}
        paused={paused}
        onTogglePlay={() => setPaused((p) => !p)}
      />
      <MessageTimeline messages={MOCK.messages} />
    </div>
  )
}
