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
  // Local state for the message whose TTS audio we are *currently playing*.
  // Decoupled from the server's status='speaking' window because that window
  // is shorter than the actual audio (server estimates 220ms/word, real Fish
  // audio is typically ~30% longer for Chinese). If we tied playback to the
  // server window the audio would get pause()'d mid-sentence.
  const [playingTts, setPlayingTts] = useState<{
    id: string
    audioUrl: string
    text: string
  } | null>(null)

  const speakingMsg = useMemo(
    () => state.messages.find((m) => m.status === 'speaking' && m.audioUrl),
    [state.messages],
  )

  // When a new server-side speaking message arrives, switch over.
  // Otherwise let the current playback finish naturally.
  useEffect(() => {
    if (!speakingMsg?.audioUrl) return
    if (playingTts?.id === speakingMsg.id) return
    setPlayingTts({
      id: speakingMsg.id,
      audioUrl: speakingMsg.audioUrl,
      text: speakingMsg.text,
    })
  }, [speakingMsg?.id, speakingMsg?.audioUrl, speakingMsg?.text, playingTts?.id])

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

  // TTS playback + word-sync. Driven by `playingTts` (local), NOT by the
  // server's speaking-message window — so the audio plays to its natural
  // end even if the server says message_done partway through.
  useEffect(() => {
    const tts = ttsAudioRef.current
    if (!tts || !playingTts) return

    if (tts.src !== playingTts.audioUrl) {
      tts.src = playingTts.audioUrl
    }
    const wordCount = playingTts.text.split(/\s+/).filter(Boolean).length
    const { id: messageId } = playingTts
    const onTime = () => {
      const dur = tts.duration
      if (!isFinite(dur) || dur <= 0) return
      const ratio = Math.min(1, tts.currentTime / dur)
      const wordIdx = Math.min(wordCount - 1, Math.floor(ratio * wordCount))
      setTtsHighlight({ id: messageId, wordIdx })
    }
    const onEnded = () => {
      setTtsHighlight(null)
      setPlayingTts((p) => (p?.id === messageId ? null : p))
    }
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
  }, [playingTts])

  // Music ducking: drop volume while DJ audio is actually playing (keyed
  // on `playingTts`, not the server status), so the song doesn't ramp
  // back up while the voice is still mid-sentence.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = playingTts ? 0.25 : 1.0
  }, [playingTts])

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
