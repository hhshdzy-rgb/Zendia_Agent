import { useEffect, useState } from 'react'
import Header from '../components/Header'
import DJWaveform from '../components/DJWaveform'
import NowPlayingCard from '../components/NowPlayingCard'
import MessageTimeline from '../components/MessageTimeline'
import { usePlayerStream } from '../hooks/usePlayerStream'
import './Player.css'

export default function Player() {
  const state = usePlayerStream()
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = Math.max(0, Math.floor((now - state.sessionStartedAt) / 1000))

  return (
    <div className="view-player">
      <Header speaking={state.speaking} sessionElapsedSec={elapsed} />
      <DJWaveform speaking={state.speaking} />
      <NowPlayingCard
        song={state.song}
        paused={paused}
        onTogglePlay={() => setPaused((p) => !p)}
      />
      <MessageTimeline messages={state.messages} />
    </div>
  )
}
