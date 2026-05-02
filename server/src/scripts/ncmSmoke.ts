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

const top = songs[0]!
console.log(`\n[ncm] resolving URL for top hit: ${top.id} ${top.name}`)
const t1 = Date.now()
const url = await getSongUrl(top.id)
console.log(`[ncm] resolved in ${Date.now() - t1}ms`)
if (!url) {
  console.error('[ncm] no URL returned (likely VIP-only or region-locked)')
  console.error('[ncm] try a different query — that song may need a paid account')
  process.exit(2)
}
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
