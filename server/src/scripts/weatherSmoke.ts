/* tsx server/src/scripts/weatherSmoke.ts
   Hits Open-Meteo via the same getWeather() the live runtime uses, then
   re-calls it to verify the 10-min in-memory cache short-circuits.
   Coords come from WEATHER_LAT/LON env if set; otherwise the module
   auto-detects via outbound IP geolocation. */

import { getWeather } from '../weather.js'

console.log('[weather smoke] cold call (resolves coords + hits Open-Meteo)...')
const t0 = Date.now()
const snap = await getWeather()
console.log(`[weather smoke] done in ${Date.now() - t0}ms`)
if (snap) console.log(`[weather smoke] -> ${snap.text}  (code=${snap.code})`)
else console.log('[weather smoke] -> (undefined — no env coords and IP geo failed)')

console.log('[weather smoke] cached call (should be ~0ms)...')
const t1 = Date.now()
const snap2 = await getWeather()
console.log(`[weather smoke] done in ${Date.now() - t1}ms`)
if (snap2) console.log(`[weather smoke] -> ${snap2.text}  (code=${snap2.code})`)
else console.log('[weather smoke] -> (undefined)')
