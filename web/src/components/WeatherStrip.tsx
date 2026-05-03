import type { WeatherSnapshot } from '../types'

// Compact weather line that sits under the clock. Renders nothing
// until the first 'weather' event lands. WMO codes are bucketed into
// 7 visual categories so we only need 7 inline SVG icons rather than
// one per code.

type Props = {
  weather?: WeatherSnapshot
}

export default function WeatherStrip({ weather }: Props) {
  if (!weather) return null
  const desc = describeWmo(weather.code)
  const place = weather.place || 'HERE'
  const temp = `${Math.round(weather.tempC)}°C`

  return (
    <div className="weather-strip" aria-label={`Current weather: ${weather.text}`}>
      <WeatherIcon code={weather.code} />
      <span className="weather-strip-place">{place.toUpperCase()}</span>
      <span className="weather-strip-dot">·</span>
      <span className="weather-strip-temp">{temp}</span>
      <span className="weather-strip-dot">·</span>
      <span className="weather-strip-desc">{desc.toUpperCase()}</span>
    </div>
  )
}

function describeWmo(code: number): string {
  if (code === 0) return 'clear'
  if (code === 1) return 'mostly clear'
  if (code === 2) return 'partly cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain showers'
  if (code >= 85 && code <= 86) return 'snow showers'
  if (code === 95) return 'thunderstorm'
  if (code === 96 || code === 99) return 'storm with hail'
  return 'weather'
}

function WeatherIcon({ code }: { code: number }) {
  if (code === 0 || code === 1) return <SunIcon />
  if (code === 2) return <PartlyCloudyIcon />
  if (code === 45 || code === 48) return <FogIcon />
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <RainIcon />
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return <SnowIcon />
  if (code >= 95 && code <= 99) return <StormIcon />
  return <CloudIcon />
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function SunIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </svg>
  )
}

function PartlyCloudyIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="8" cy="9" r="3" />
      <path d="M8 3v1M3 9h1M5.2 5.2l.7.7M11.7 5.2l-.7.7" />
      <path d="M10 18h7a3 3 0 0 0 .4-6c-.4-2-2.3-3.5-4.4-3.5-1.6 0-3 .9-3.7 2.2A3 3 0 0 0 10 18z" />
    </svg>
  )
}

function CloudIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M7 18h10a4 4 0 0 0 .5-7.9c-.5-2.4-2.6-4.1-5-4.1-2 0-3.7 1.1-4.5 2.7A4 4 0 0 0 7 18z" />
    </svg>
  )
}

function RainIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M7 14h10a4 4 0 0 0 .5-7.9c-.5-2.4-2.6-4.1-5-4.1-2 0-3.7 1.1-4.5 2.7A4 4 0 0 0 7 14z" />
      <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" />
    </svg>
  )
}

function SnowIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M7 14h10a4 4 0 0 0 .5-7.9c-.5-2.4-2.6-4.1-5-4.1-2 0-3.7 1.1-4.5 2.7A4 4 0 0 0 7 14z" />
      <circle cx="9" cy="19" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13" cy="20" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="17" cy="19" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FogIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 8h16M3 12h18M5 16h14M6 20h12" />
    </svg>
  )
}

function StormIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M7 14h10a4 4 0 0 0 .5-7.9c-.5-2.4-2.6-4.1-5-4.1-2 0-3.7 1.1-4.5 2.7A4 4 0 0 0 7 14z" />
      <path d="M13 16l-3 4h3l-1 3" />
    </svg>
  )
}
