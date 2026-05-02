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
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
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

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {})
    }
  }, [])

  const ensureAudioGraph = () => {
    const audio = audioRef.current
    if (!audio || audioCtxRef.current) return
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      const source = ctx.createMediaElementSource(audio)
      const node = ctx.createAnalyser()
      node.fftSize = 256
      node.smoothingTimeConstant = 0.6
      source.connect(node)
      node.connect(ctx.destination)
      audioCtxRef.current = ctx
      setAnalyser(node)
    } catch (err) {
      console.warn('AudioContext setup failed', err)
    }
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    ensureAudioGraph()
    audioCtxRef.current?.resume().catch(() => {})
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
      <DJWaveform speaking={state.speaking} analyser={analyser} />
      <NowPlayingCard
        song={songWithLiveTime}
        paused={paused}
        onTogglePlay={togglePlay}
      />
      <MessageTimeline messages={state.messages} />
    </div>
  )
}
