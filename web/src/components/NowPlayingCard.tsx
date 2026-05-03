import { formatTime } from '../lib/format'
import type { Song } from '../types'

type Props = {
  song: Song
  paused: boolean
  onTogglePlay: () => void
}

export default function NowPlayingCard({ song, paused, onTogglePlay }: Props) {
  const pct =
    song.durationSec > 0 ? Math.min(100, (song.positionSec / song.durationSec) * 100) : 0
  return (
    <div className="now-playing">
      <div className="now-playing-meta">
        <h2 className="np-title">{song.title}</h2>
        <div className="np-sub">
          {song.album} <span className="np-sep">-</span> {song.artist}
        </div>
      </div>
      <div className="np-controls">
        <button
          type="button"
          className="np-toggle"
          aria-label={paused ? 'Play' : 'Pause'}
          onClick={onTogglePlay}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <div className="np-progress">
          <div className="np-progress-bar">
            <div className="np-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="np-time mono">
          {formatTime(song.positionSec)} / {formatTime(song.durationSec)}
        </div>
      </div>
    </div>
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
