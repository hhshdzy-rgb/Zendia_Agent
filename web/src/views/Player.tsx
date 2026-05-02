import { useEffect, useRef, useState } from 'react'
import Header from '../components/Header'
import DJWaveform from '../components/DJWaveform'
import NowPlayingCard from '../components/NowPlayingCard'
import MessageTimeline from '../components/MessageTimeline'
import { usePlayerStream } from '../hooks/usePlayerStream'
import './Player.css'

export default function Player() {
  const state = usePlayerStream()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [paused, setPaused] = useState(true)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setPosition(audio.currentTime)
    const onMeta = () => setDuration(audio.duration || 0)
    const onPlay = () => setPaused(false)
    const onPause = () => setPaused(true)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch((err) => console.warn('audio.play() rejected', err))
    } else {
      audio.pause()
    }
  }

  const elapsed = Math.max(0, Math.floor((now - state.sessionStartedAt) / 1000))
  const songWithLiveTime = {
    ...state.song,
    positionSec: position,
    durationSec: duration || state.song.durationSec,
  }

  return (
    <div className="view-player">
      <audio
        ref={audioRef}
        src={state.song.streamUrl}
        preload="auto"
        crossOrigin="anonymous"
      />
      <Header speaking={state.speaking} sessionElapsedSec={elapsed} />
      <DJWaveform speaking={state.speaking} />
      <NowPlayingCard
        song={songWithLiveTime}
        paused={paused}
        onTogglePlay={togglePlay}
      />
      <MessageTimeline messages={state.messages} />
    </div>
  )
}
