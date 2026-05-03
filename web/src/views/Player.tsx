import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import ClockHero from '../components/ClockHero'
import OnAirBadge from '../components/OnAirBadge'
import DJWaveform from '../components/DJWaveform'
import NowPlayingCard from '../components/NowPlayingCard'
import MessageTimeline from '../components/MessageTimeline'
import BottomMiniPlayer from '../components/BottomMiniPlayer'
import ChatInput from '../components/ChatInput'
import StationFooter from '../components/StationFooter'
import { usePlayerStream } from '../hooks/usePlayerStream'
import { countSpeakable } from '../lib/tokenize'
import './Player.css'

export default function Player() {
  const { state, send, connected } = usePlayerStream()
  const audioRef = useRef<HTMLAudioElement>(null)
  const ttsAudioRef = useRef<HTMLAudioElement>(null)
  const musicAudioCtxRef = useRef<AudioContext | null>(null)
  const ttsAudioCtxRef = useRef<AudioContext | null>(null)
  const [musicAnalyser, setMusicAnalyser] = useState<AnalyserNode | null>(null)
  const [ttsAnalyser, setTtsAnalyser] = useState<AnalyserNode | null>(null)
  const [paused, setPaused] = useState(true)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ttsHighlight, setTtsHighlight] = useState<{ id: string; wordIdx: number } | null>(null)
  // User-controlled volume (0..1). Music ducking still applies on top of
  // this when the DJ is talking — see the volume sync effect below.
  const [userVolume, setUserVolume] = useState<number>(() => {
    if (typeof localStorage === 'undefined') return 1
    const stored = localStorage.getItem('zendia.volume')
    if (!stored) return 1
    const n = Number(stored)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1
  })
  // Per-session liked song ids. Optimistic — updated locally on click,
  // persisted to NCM by the server. Reload clears this; sync from NCM
  // on connect is a future feature.
  const [likedSongIds, setLikedSongIds] = useState<Set<number>>(() => new Set())
  // Local state for the message whose TTS audio we are *currently playing*.
  // Decoupled from the server's status='speaking' window because that window
  // is shorter than the actual audio (server estimates 220ms/word, real Fish
  // audio is typically ~30% longer for Chinese). If we tied playback to the
  // server window the audio would get pause()'d mid-sentence.
  const [playingTts, setPlayingTts] = useState<{
    id: string
    audioUrl: string
    text: string
    wordTimings?: typeof state.messages[number]['wordTimings']
  } | null>(null)

  const speakingMsg = useMemo(
    () => state.messages.find((m) => m.status === 'speaking' && m.audioUrl),
    [state.messages],
  )

  function ensureMusicAudioGraph() {
    const audio = audioRef.current
    if (!audio || musicAudioCtxRef.current) return
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      const source = ctx.createMediaElementSource(audio)
      const node = ctx.createAnalyser()
      node.fftSize = 256
      node.smoothingTimeConstant = 0.6
      source.connect(node)
      node.connect(ctx.destination)
      musicAudioCtxRef.current = ctx
      setMusicAnalyser(node)
    } catch (err) {
      console.warn('Music AudioContext setup failed', err)
    }
  }

  function ensureTtsAudioGraph() {
    const audio = ttsAudioRef.current
    if (!audio || ttsAudioCtxRef.current) return
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      const source = ctx.createMediaElementSource(audio)
      const node = ctx.createAnalyser()
      node.fftSize = 256
      node.smoothingTimeConstant = 0.72
      source.connect(node)
      node.connect(ctx.destination)
      ttsAudioCtxRef.current = ctx
      setTtsAnalyser(node)
    } catch (err) {
      console.warn('TTS AudioContext setup failed', err)
    }
  }

  // When a new server-side speaking message arrives, switch over.
  // Otherwise let the current playback finish naturally.
  useEffect(() => {
    if (!speakingMsg?.audioUrl) return
    if (playingTts?.id === speakingMsg.id) return
    // This local copy intentionally outlives the server's speaking status so
    // the TTS audio can finish naturally on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayingTts({
      id: speakingMsg.id,
      audioUrl: speakingMsg.audioUrl,
      text: speakingMsg.text,
      wordTimings: speakingMsg.wordTimings,
    })
  }, [
    speakingMsg?.id,
    speakingMsg?.audioUrl,
    speakingMsg?.text,
    speakingMsg?.wordTimings,
    playingTts?.id,
  ])

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
      musicAudioCtxRef.current?.close().catch(() => {})
      ttsAudioCtxRef.current?.close().catch(() => {})
    }
  }, [])

  // When the server swaps to a new track (Claude → NCM resolved a fresh
  // streamUrl), continue playback automatically — but only if the user
  // has already pressed play once (audioCtxRef is set). Browsers block
  // play() without prior user gesture, and we don't want to fight that.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !musicAudioCtxRef.current || !state.song.streamUrl) return
    audio.play().catch((err) => console.warn('audio.play() after src swap rejected', err))
  }, [state.song.streamUrl])

  // When the music finishes naturally, tell the server. The live loop
  // gates new song events on this signal so songs always play through.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => {
      send({ type: 'song_ended', ...(state.song.id !== undefined && { id: state.song.id }) })
    }
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [state.song.id, send])

  // TTS setup: when a new utterance arrives, set src + wire highlight
  // listeners. Playback start/stop is handled by the next effect (driven
  // by `paused`), so a paused user doesn't hear the DJ.
  useEffect(() => {
    const tts = ttsAudioRef.current
    if (!tts || !playingTts) return

    const nextSrc = new URL(playingTts.audioUrl, window.location.href).href
    if (tts.src !== nextSrc) {
      tts.src = nextSrc
      tts.currentTime = 0
      tts.load()
    }
    // Use the same tokenizer MessageTimeline uses, so the word index that
    // moves the cursor matches the slot count rendered on screen. Critical
    // for CJK where whitespace-only split would yield 1 "word".
    const wordCount = countSpeakable(playingTts.text)
    const { id: messageId } = playingTts
    const onTime = () => {
      const dur = tts.duration
      if (!isFinite(dur) || dur <= 0) return
      const wordIdx = getWordIndex(tts.currentTime, dur, wordCount, playingTts.wordTimings)
      setTtsHighlight({ id: messageId, wordIdx })
    }
    const onEnded = () => {
      setTtsHighlight(null)
      setPlayingTts((p) => (p?.id === messageId ? null : p))
    }
    tts.addEventListener('timeupdate', onTime)
    tts.addEventListener('ended', onEnded)
    return () => {
      tts.removeEventListener('timeupdate', onTime)
      tts.removeEventListener('ended', onEnded)
    }
  }, [playingTts])

  // TTS play/pause: tied to the user's pause toggle. Pause → DJ goes
  // silent immediately. Resume → if there's an in-flight utterance,
  // continue from where it was paused; new utterances arriving while
  // paused get queued (set as playingTts but not played) and start
  // when the user un-pauses.
  useEffect(() => {
    const tts = ttsAudioRef.current
    if (!tts) return
    if (paused) {
      tts.pause()
    } else if (playingTts) {
      // TTS turns can arrive after the user's initial play gesture. Ensure the
      // analyser exists before playback so the header waveform has a live source.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      ensureTtsAudioGraph()
      ttsAudioCtxRef.current?.resume().catch(() => {})
      // Logs both the autoplay-policy rejection (expected on first turn
      // before user gesture) and any real failure (404, decoding error).
      tts.play().catch((err) => console.warn('tts.play() rejected', err))
    }
  }, [paused, playingTts])

  // Music + TTS volume sync. userVolume is the ceiling; music gets ducked
  // to 25% of the ceiling while DJ is actually speaking (playingTts), and
  // ramps back to the full ceiling when the voice finishes. TTS plays at
  // the full ceiling so the user can hear what's said clearly.
  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = playingTts ? userVolume * 0.25 : userVolume
    const tts = ttsAudioRef.current
    if (tts) tts.volume = userVolume
  }, [playingTts, userVolume])

  // Persist volume across reloads.
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zendia.volume', String(userVolume))
    }
  }, [userVolume])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    ensureMusicAudioGraph()
    ensureTtsAudioGraph()
    musicAudioCtxRef.current?.resume().catch(() => {})
    ttsAudioCtxRef.current?.resume().catch(() => {})
    if (audio.paused) {
      audio.play().catch((err) => console.warn('audio.play() rejected', err))
    } else {
      audio.pause()
    }
  }

  const skipSong = () => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    send({ type: 'skip_song', ...(state.song.id !== undefined && { id: state.song.id }) })
  }

  const songId = state.song.id
  const isLiked = songId !== undefined && likedSongIds.has(songId)
  const toggleLike = () => {
    if (songId === undefined) return
    const nextLiked = !isLiked
    // Optimistic flip; server will persist via NCM. No rollback if NCM
    // fails — keep it simple, error logging happens server-side.
    setLikedSongIds((prev) => {
      const next = new Set(prev)
      if (nextLiked) next.add(songId)
      else next.delete(songId)
      return next
    })
    send({ type: 'like_song', songId, liked: nextLiked })
  }

  const dislikeCurrent = () => {
    if (songId === undefined) return
    // Stop the current music + DJ immediately so the listener doesn't
    // have to keep hearing what they just said they don't want. The
    // server-side handler triggers the same fast-skip path the Skip
    // button uses, plus persists the dislike to user/disliked.md.
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    const tts = ttsAudioRef.current
    if (tts) {
      tts.pause()
      tts.currentTime = 0
    }
    setPlayingTts(null)
    setTtsHighlight(null)
    send({
      type: 'dislike_song',
      songId,
      title: state.song.title,
      artist: state.song.artist,
    })
  }

  const replayMessage = (msg: typeof state.messages[number]) => {
    if (!msg.audioUrl) return
    setPlayingTts({
      id: msg.id,
      audioUrl: msg.audioUrl,
      text: msg.text,
      wordTimings: msg.wordTimings,
    })
  }

  const sendChat = (text: string) => {
    // Immediate "I heard you" feedback: stop the current DJ utterance
    // (audio + highlight) the moment we send. Server-side dj_thinking
    // event will fire when the message lands; the next reply turn will
    // then play through normally.
    const tts = ttsAudioRef.current
    if (tts) {
      tts.pause()
      tts.currentTime = 0
    }
    setPlayingTts(null)
    setTtsHighlight(null)
    send({ type: 'user_message', text, clientMsgId: crypto.randomUUID() })
  }

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
      <Header />
      <ClockHero />
      <OnAirBadge speaking={state.speaking || Boolean(playingTts)} thinking={state.thinking} />
      <DJWaveform speaking={state.speaking || Boolean(playingTts)} analyser={ttsAnalyser} />
      <NowPlayingCard
        song={songWithLiveTime}
        paused={paused}
        liked={isLiked}
        onTogglePlay={togglePlay}
        onToggleLike={toggleLike}
        onDislike={dislikeCurrent}
      />
      <MessageTimeline
        messages={state.messages}
        sessionStartedAt={state.sessionStartedAt}
        playingOverride={ttsHighlight}
        onReplay={replayMessage}
      />
      <div className="player-footer">
        <ChatInput onSend={sendChat} />
        <BottomMiniPlayer
          positionSec={position}
          paused={paused}
          onTogglePlay={togglePlay}
          onSkip={skipSong}
          analyser={musicAnalyser}
          volume={userVolume}
          onVolumeChange={setUserVolume}
        />
        <StationFooter connected={connected} />
      </div>
    </div>
  )
}

function getWordIndex(
  currentTime: number,
  duration: number,
  wordCount: number,
  wordTimings: { start: number; end: number }[] | undefined,
) {
  if (wordCount <= 0) return 0
  if (wordTimings?.length) {
    const idx = wordTimings.findIndex((w) => currentTime >= w.start && currentTime < w.end)
    if (idx >= 0) return Math.min(wordCount - 1, idx)
    if (currentTime >= wordTimings[wordTimings.length - 1]!.end) {
      return Math.min(wordCount - 1, wordTimings.length - 1)
    }
  }
  const ratio = Math.min(1, currentTime / duration)
  return Math.min(wordCount - 1, Math.floor(ratio * wordCount))
}
