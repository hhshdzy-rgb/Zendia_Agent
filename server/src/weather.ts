import 'dotenv/config'

// Pulls current conditions from Open-Meteo (no API key, free, global
// coverage incl. mainland China). Returns a short string ready to drop
// into the DJ context block: "Beijing — overcast, 17°C".
//
// 10-minute in-memory cache — weather doesn't change every turn, and
// every Claude invocation hitting the API would be wasteful.
//
// Zero-config behavior: if WEATHER_LAT/WEATHER_LON are not set,
// getWeather() returns undefined and the context block silently omits
// the weather line (context.ts:80 already does a falsy-skip).

const TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

const LAT = parseLatLon(process.env.WEATHER_LAT)
const LON = parseLatLon(process.env.WEATHER_LON)
const PLACE = process.env.WEATHER_PLACE?.trim() || ''

type Cached = { text: string; fetchedAt: number }
let cache: Cached | null = null

function parseLatLon(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw.trim())
  return Number.isFinite(n) ? n : null
}

export function isWeatherConfigured(): boolean {
  return LAT !== null && LON !== null
}

export async function getWeather(): Promise<string | undefined> {
  if (!isWeatherConfigured()) return undefined
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.text

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,weather_code,wind_speed_10m`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      console.warn(`[weather] HTTP ${res.status}; reusing cache if any`)
      return cache?.text
    }
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number
        weather_code?: number
        wind_speed_10m?: number
      }
    }
    const tempC = data.current?.temperature_2m
    const code = data.current?.weather_code
    if (typeof tempC !== 'number' || typeof code !== 'number') {
      console.warn('[weather] unexpected payload shape; reusing cache if any')
      return cache?.text
    }
    const text = formatSnapshot(code, tempC)
    cache = { text, fetchedAt: Date.now() }
    return text
  } catch (err) {
    console.warn(`[weather] fetch failed: ${(err as Error).message}; reusing cache if any`)
    return cache?.text
  } finally {
    clearTimeout(timer)
  }
}

function formatSnapshot(code: number, tempC: number): string {
  const desc = describeWmo(code)
  const t = `${Math.round(tempC)}°C`
  return PLACE ? `${PLACE} — ${desc}, ${t}` : `${desc}, ${t}`
}

// Open-Meteo uses standard WMO weather interpretation codes.
// https://open-meteo.com/en/docs#weathervariables
function describeWmo(code: number): string {
  if (code === 0) return 'clear sky'
  if (code === 1) return 'mainly clear'
  if (code === 2) return 'partly cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain showers'
  if (code >= 85 && code <= 86) return 'snow showers'
  if (code === 95) return 'thunderstorm'
  if (code === 96 || code === 99) return 'thunderstorm with hail'
  return 'unknown weather'
}
