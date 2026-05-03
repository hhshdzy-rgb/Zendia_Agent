type Props = {
  connected: boolean
}

// Thin "ZENDIA FM · CONNECTED" strip at the very bottom of the player.
// Connection is true while the WS is open; flips to RECONNECTING when
// the socket drops (the underlying stream auto-retries with backoff).

export default function StationFooter({ connected }: Props) {
  return (
    <div className="station-footer pixel">
      <span className="station-id">ZENDIA FM</span>
      <span className="station-sep" aria-hidden="true">
        ·
      </span>
      <span className={`station-status ${connected ? 'is-connected' : 'is-reconnecting'}`}>
        {connected ? 'CONNECTED' : 'RECONNECTING…'}
      </span>
    </div>
  )
}
