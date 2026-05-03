export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

// Wall-clock HH:MM (24h) of when a message was emitted. ts is
// "seconds since the hub's sessionStartedAt", so absolute ms is
// sessionStartedAt + ts*1000. Using the client clock for the
// formatter — a few seconds of drift is irrelevant at minute precision.
export function formatMessageClock(sessionStartedAtMs: number, tsRelativeSec: number): string {
  const d = new Date(sessionStartedAtMs + tsRelativeSec * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
