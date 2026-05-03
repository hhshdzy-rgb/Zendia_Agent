import 'dotenv/config'

// Pulls current conditions from Open-Meteo (no API key, free, global
// coverage incl. mainland China). Returns a short string ready to drop
// into the DJ context block: "Boston — overcast, 10°C".
//
// Coordinate resolution priority:
//   1. WEATHER_LAT + WEATHER_LON env vars (explicit, wins)
//   2. Auto-detect via outbound IP geolocation (api.ipify.org -> ipapi.co)
//   3. Give up; getWeather() returns undefined and the context block
//      silently omits the weather line.
//
// 10-minute weather cache + one-shot coord auto-detect (memoized for the
// process lifetime). Auto-detect runs lazily on the first getWeather()
// call so server boot stays fast.

const WEATHER_TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

const ENV_LAT = parseLatLon(process.env.WEATHER_LAT)
const ENV_LON = parseLatLon(process.env.WEATHER_LON)
const ENV_PLACE = process.env.WEATHER_PLACE?.trim() || ''

type Coords = { lat: number; lon: number; place: string }
type Cached = { text: string; fetchedAt: number }

let weatherCache: Cached | null = null
let coordsPromise: Promise<Coords | null> | null = null

function parseLatLon(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw.trim())
  return Number.isFinite(n) ? n : null
}

function resolveCoords(): Promise<Coords | null> {
  if (ENV_LAT !== null && ENV_LON !== null) {
    return Promise.resolve({ lat: ENV_LAT, lon: ENV_LON, place: ENV_PLACE })
  }
  if (!coordsPromise) coordsPromise = autoLocate()
  return coordsPromise
}

async function autoLocate(): Promise<Coords | null> {
  try {
    const ip = await fetchText('https://api.ipify.org')
    if (!ip) return null
    const geo = await fetchJson<{ latitude?: number; longitude?: number; city?: string }>(
      `https://ipapi.co/${encodeURIComponent(ip.trim())}/json/`,
    )
    if (!geo || typeof geo.latitude !== 'number' || typeof geo.longitude !== 'number') {
      console.warn('[weather] auto-locate: ipapi response missing lat/lon')
      return null
    }
    const place = ENV_PLACE || (typeof geo.city === 'string' ? geo.city : '')
    console.log(
      `[weather] auto-located via IP -> ${place || '(no city)'} ` +
        `(${geo.latitude.toFixed(2)}, ${geo.longitude.toFixed(2)})`,
    )
    return { lat: geo.latitude, lon: geo.longitude, place }
  } catch (err) {
    console.warn(`[weather] auto-locate failed: ${(err as Error).message}`)
    return null
  }
}

export async function getWeather(): Promise<string | undefined> {
  const coords = await resolveCoords()
  if (!coords) return undefined
  if (weatherCache && Date.now() - weatherCache.fetchedAt < WEATHER_TTL_MS) {
    return weatherCache.text
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m`

  try {
    const data = await fetchJson<{
      current?: {
        temperature_2m?: number
        weather_code?: number
        wind_speed_10m?: number
      }
    }>(url)
    const tempC = data?.current?.temperature_2m
    const code = data?.current?.weather_code
    if (typeof tempC !== 'number' || typeof code !== 'number') {
      console.warn('[weather] unexpected payload shape; reusing cache if any')
      return weatherCache?.text
    }
    const text = formatSnapshot(code, tempC, coords.place)
    weatherCache = { text, fetchedAt: Date.now() }
    return text
  } catch (err) {
    console.warn(`[weather] fetch failed: ${(err as Error).message}; reusing cache if any`)
    return weatherCache?.text
  }
}

function formatSnapshot(code: number, tempC: number, place: string): string {
  const desc = describeWmo(code)
  const t = `${Math.round(tempC)}°C`
  return place ? `${place} — ${desc}, ${t}` : `${desc}, ${t}`
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      console.warn(`[weather] HTTP ${res.status} from ${url}`)
      return null
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      console.warn(`[weather] HTTP ${res.status} from ${url}`)
      return null
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
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
