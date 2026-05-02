import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import DJWaveform from '../components/DJWaveform'
import NowPlayingCard from '../components/NowPlayingCard'
import MessageTimeline from '../components/MessageTimeline'
import BottomMiniPlayer from '../components/BottomMiniPlayer'
import { usePlayerStream } from '../hooks/usePlayerStream'
import './Player.css'

export default function Player() {
  const state = usePlayerStream()
  const audioRef = useRef<HTMLAudioElement>(null)
  const ttsAudioRef = useRef<HTMLAudioElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [paused, setPaused] = useState(true)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [ttsHighlight, setTtsHighlight] = useState<{ id: string; wordIdx: number } | null>(null)

  const speakingMsg = useMemo(
    () => state.messages.find((m) => m.status === 'speaking' && m.audioUrl),
    [state.messages],
  )

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

  // When the server swaps to a new track (Claude → NCM resolved a fresh
  // streamUrl), continue playback automatically — but only if the user
  // has already pressed play once (audioCtxRef is set). Browsers block
  // play() without prior user gesture, and we don't want to fight that.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioCtxRef.current || !state.song.streamUrl) return
    audio.play().catch((err) => console.warn('audio.play() after src swap rejected', err))
  }, [state.song.streamUrl])

  // TTS: when there's a speaking message with audioUrl, play it and drive
  // word highlighting from currentTime / duration / wordCount. Replaces
  // the per-word events the server skips when audioUrl is present.
  useEffect(() => {
    const tts = ttsAudioRef.current
    if (!tts) return
    if (!speakingMsg?.audioUrl) {
      tts.pause()
      setTtsHighlight(null)
      return
    }
    if (tts.src !== speakingMsg.audioUrl) {
      tts.src = speakingMsg.audioUrl
    }
    const wordCount = speakingMsg.text.split(/\s+/).filter(Boolean).length
    const messageId = speakingMsg.id
    const onTime = () => {
      const dur = tts.duration
      if (!isFinite(dur) || dur <= 0) return
      const ratio = Math.min(1, tts.currentTime / dur)
      const wordIdx = Math.min(wordCount - 1, Math.floor(ratio * wordCount))
      setTtsHighlight({ id: messageId, wordIdx })
    }
    const onEnded = () => setTtsHighlight(null)
    tts.addEventListener('timeupdate', onTime)
    tts.addEventListener('ended', onEnded)
    // Logs both the autoplay-policy rejection (expected on first turn
    // before user gesture) and any real failure (404, decoding error).
    // The latter is the kind of thing you want to see — keep it loud.
    tts.play().catch((err) => console.warn('tts.play() rejected', err))
    return () => {
      tts.removeEventListener('timeupdate', onTime)
      tts.removeEventListener('ended', onEnded)
    }
  }, [speakingMsg?.id, speakingMsg?.audioUrl, speakingMsg?.text])

  // Music ducking: drop volume to 25% while DJ is talking, restore to 100%
  // afterwards. Lets the voice cut through without pausing the song.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = speakingMsg ? 0.25 : 1.0
  }, [speakingMsg])

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
      <audio ref={ttsAudioRef} preload="auto" />
      <Header speaking={state.speaking} sessionElapsedSec={elapsed} />
      <DJWaveform speaking={state.speaking} analyser={analyser} />
      <NowPlayingCard
        song={songWithLiveTime}
        paused={paused}
        onTogglePlay={togglePlay}
      />
      <MessageTimeline messages={state.messages} highlightOverride={ttsHighlight} />
      <BottomMiniPlayer
        positionSec={position}
        paused={paused}
        onTogglePlay={togglePlay}
        analyser={analyser}
      />
    </div>
  )
}
