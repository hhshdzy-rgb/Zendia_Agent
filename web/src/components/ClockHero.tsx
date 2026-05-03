import { useEffect, useState } from 'react'

// The big LED-style time + day + date block beneath the brand bar.
// Updates once per minute, aligned to the minute boundary so the first
// tick happens at HH:MM:00 instead of drifting.

export default function ClockHero() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000)
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, msUntilNextMinute)
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  // en-US for the radio-station "MONDAY" / "JAN" feel; could be made
  // locale-aware later if anyone asks.
  const day = now.toLocaleDateString('en-US', { weekday: 'long' })
  const dd = String(now.getDate()).padStart(2, '0')
  const mon = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const yyyy = now.getFullYear()

  return (
    <section className="clock-hero" aria-label="Now">
      <div className="clock-time">
        {hh}:{mm}
      </div>
      <div className="clock-day">{day}</div>
      <div className="clock-date">
        {dd}·{mon}·{yyyy}
      </div>
    </section>
  )
}
