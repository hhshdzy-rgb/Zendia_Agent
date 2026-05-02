import { formatTime } from '../lib/format'

type Props = {
  speaking: boolean
  sessionElapsedSec: number
}

export default function Header({ speaking, sessionElapsedSec }: Props) {
  return (
    <header className="player-header">
      <div className="player-header-left">
        <div className="avatar" aria-hidden="true" />
        <div className="player-header-text">
          <div className="brand">Zendia</div>
          <div className={`status ${speaking ? 'is-speaking' : ''}`}>
            <span className="status-dot" />
            {speaking ? 'Speaking…' : 'Idle'}
          </div>
        </div>
      </div>
      <div className="player-header-clock mono">{formatTime(sessionElapsedSec)}</div>
    </header>
  )
}
