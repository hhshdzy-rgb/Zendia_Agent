type Props = {
  speaking: boolean
  thinking: boolean
}

// "ON AIR" lamp under the clock. Always present; the dot color +
// the small sub-label below reflect what the DJ is doing right now:
//   - Speaking → green pulse + "BROADCASTING"
//   - Thinking → amber blink + "STANDBY"
//   - Idle    → green slow pulse + "ON THE LINE"

export default function OnAirBadge({ speaking, thinking }: Props) {
  const stateClass = speaking ? 'is-speaking' : thinking ? 'is-thinking' : 'is-idle'
  const subLabel = speaking ? 'BROADCASTING' : thinking ? 'STANDBY' : 'ON THE LINE'

  return (
    <div className={`on-air ${stateClass}`} aria-live="polite">
      <span className="on-air-dot" aria-hidden="true" />
      <span className="on-air-label">ON AIR</span>
      <span className="on-air-sep" aria-hidden="true">
        ·
      </span>
      <span className="on-air-sub">{subLabel}</span>
    </div>
  )
}
