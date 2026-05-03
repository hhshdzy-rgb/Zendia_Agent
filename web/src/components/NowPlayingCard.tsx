import { formatTime } from '../lib/format'
import type { Song } from '../types'

type Props = {
  song: Song
  paused: boolean
  liked: boolean
  onTogglePlay: () => void
  onToggleLike: () => void
}

export default function NowPlayingCard({
  song,
  paused,
  liked,
  onTogglePlay,
  onToggleLike,
}: Props) {
  const pct =
    song.durationSec > 0 ? Math.min(100, (song.positionSec / song.durationSec) * 100) : 0
  // Disable like when there's no NCM song id to act on (initial fallback song
  // before the live loop resolves anything has no id).
  const canLike = song.id !== undefined
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
        <button
          type="button"
          className={`np-like ${liked ? 'is-liked' : ''}`}
          aria-label={liked ? 'Unlike' : 'Like song'}
          aria-pressed={liked}
          disabled={!canLike}
          onClick={onToggleLike}
        >
          <HeartIcon filled={liked} />
        </button>
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

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
