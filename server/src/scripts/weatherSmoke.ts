/* tsx server/src/scripts/weatherSmoke.ts
   Hits Open-Meteo via the same getWeather() the live runtime uses, then
   re-calls it to verify the 10-min in-memory cache short-circuits. */

import { getWeather, isWeatherConfigured } from '../weather.js'

if (!isWeatherConfigured()) {
  console.log('[weather smoke] WEATHER_LAT / WEATHER_LON not set in .env — skipping')
  console.log('[weather smoke] try: WEATHER_LAT=39.91 WEATHER_LON=116.40 WEATHER_PLACE=Beijing')
  process.exit(0)
}

console.log('[weather smoke] cold call (hits Open-Meteo)...')
const t0 = Date.now()
const text = await getWeather()
console.log(`[weather smoke] done in ${Date.now() - t0}ms`)
console.log(`[weather smoke] -> ${text ?? '(undefined)'}`)

console.log('[weather smoke] cached call (should be ~0ms)...')
const t1 = Date.now()
const text2 = await getWeather()
console.log(`[weather smoke] done in ${Date.now() - t1}ms`)
console.log(`[weather smoke] -> ${text2 ?? '(undefined)'}`)
