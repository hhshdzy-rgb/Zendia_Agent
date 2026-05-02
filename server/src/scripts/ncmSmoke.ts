/* tsx server/src/scripts/ncmSmoke.ts ["search query"]
   Verifies NeteaseCloudMusicApi can: (a) search, (b) resolve a stream URL,
   (c) the URL actually serves audio bytes. Any failure here means the live
   loop's NCM integration won't work — fix here first. */

import { getSongUrl, searchSong } from '../ncm.js'

const query = process.argv[2] ?? '月亮代表我的心 邓丽君'

console.log(`[ncm] searching: "${query}"`)
const t0 = Date.now()
const songs = await searchSong(query, 5)
console.log(`[ncm] ${songs.length} hits in ${Date.now() - t0}ms`)
for (const s of songs) {
  const fee = s.fee === 1 ? ' [VIP]' : ''
  console.log(`  ${String(s.id).padEnd(11)} ${s.name}  —  ${s.artists.join(', ')}  (${s.album})${fee}`)
}
if (songs.length === 0) {
  console.error('[ncm] no hits — search returned empty')
  process.exit(1)
}

// Walk hits in order, return the first that resolves a real URL —
// mirrors what resolvePlayQueue() does in the live loop.
let url: { url: string; expiresAt?: number } | null = null
let winner: (typeof songs)[number] | null = null
for (const candidate of songs) {
  const t1 = Date.now()
  const probe = await getSongUrl(candidate.id)
  console.log(
    `[ncm]   try ${candidate.id} (${candidate.name}) -> ${probe ? 'OK' : 'no url'} (${Date.now() - t1}ms)`,
  )
  if (probe) {
    url = probe
    winner = candidate
    break
  }
}
if (!url || !winner) {
  console.error('\n[ncm] none of the hits resolved a URL (likely all VIP / region-locked)')
  process.exit(2)
}
console.log(`\n[ncm] picked: ${winner.id} ${winner.name} — ${winner.artists.join(', ')}`)
console.log(`[ncm] url: ${url.url}`)
if (url.expiresAt) console.log(`[ncm] expires in: ${url.expiresAt}s`)

// Probe the URL — make sure it really serves audio bytes
console.log(`\n[ncm] HEAD ${url.url}`)
const head = await fetch(url.url, { method: 'HEAD' })
console.log(`[ncm] status: ${head.status}`)
console.log(`[ncm] content-type: ${head.headers.get('content-type')}`)
console.log(`[ncm] content-length: ${head.headers.get('content-length')}`)
if (!head.ok) {
  console.error('[ncm] HEAD failed — URL is not directly fetchable')
  process.exit(3)
}
console.log('\n[ncm] OK — search + url + bytes pipeline verified')
