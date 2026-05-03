import { useEffect, useState } from 'react'
import { formatTime } from '../lib/format'

type Props = {
  positionSec: number
  paused: boolean
  onTogglePlay: () => void
  onSkip: () => void
  analyser: AnalyserNode | null
  bars?: number
  /** 0..1 — user's volume preference (before any TTS ducking). */
  volume: number
  onVolumeChange: (v: number) => void
}

export default function BottomMiniPlayer({
  positionSec,
  paused,
  onTogglePlay,
  onSkip,
  analyser,
  bars = 40,
  volume,
  onVolumeChange,
}: Props) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: bars }, (_, i) => 30 + Math.sin(i * 0.6) * 18 + 10),
  )

  useEffect(() => {
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const step = Math.max(1, Math.floor(data.length / bars))
      const next = new Array<number>(bars)
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] ?? 0
        next[i] = 18 + (v / 255) * 70
      }
      setHeights(next)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [analyser, bars])

  return (
    <div className="mini-player">
      <span className="mini-time mono">{formatTime(positionSec)}</span>
      <div className={`mini-waveform ${analyser ? 'is-live' : ''}`}>
        {heights.map((h, i) => (
          <div key={i} className="mini-bar" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mini-volume" title={`Volume ${Math.round(volume * 100)}%`}>
        <SpeakerIcon muted={volume === 0} />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          className="mini-volume-range"
          aria-label="Volume"
        />
      </div>
      <button
        type="button"
        className="mini-toggle"
        onClick={onTogglePlay}
        aria-label={paused ? 'Play' : 'Pause'}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>
      <button
        type="button"
        className="mini-skip"
        onClick={onSkip}
        aria-label="Skip song"
        title="Skip song"
      >
        <SkipIcon />
      </button>
    </div>
  )
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3 9v6h4l5 4V5L7 9H3z" />
        <path
          d="M16 9l5 5m0-5l-5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 4V5L7 9H3z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  )
}

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M5 5.4v13.2L15.2 12z" />
      <rect x="17" y="5" width="2.2" height="14" rx="0.8" />
    </svg>
  )
}
