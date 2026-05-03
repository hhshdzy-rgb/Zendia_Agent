/* tsx src/scripts/syncNcmLikes.ts
   Pulls the current NCM account's liked playlist and writes it into
   server/user/ncm-likes.md. The file is gitignored but automatically read by
   context.ts via user/*.md. */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMyLikedPlaylistSongs } from '../ncm.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..', '..')
const USER_DIR = path.join(SERVER_ROOT, 'user')
const OUT_PATH = path.join(USER_DIR, 'ncm-likes.md')

function formatSongLine(song: { name: string; artists: string[]; album: string }) {
  const artists = song.artists.length > 0 ? song.artists.join(', ') : 'Unknown Artist'
  const album = song.album ? ` (${song.album})` : ''
  return `- ${song.name} - ${artists}${album}`
}

console.log('[ncm:likes] reading current NCM account and liked playlist...')

const { user, playlist, songs } = await getMyLikedPlaylistSongs()
mkdirSync(USER_DIR, { recursive: true })

const generatedAt = new Date().toISOString()
const body = [
  '# NCM Liked Songs',
  '',
  'This file is generated from the current NetEase Cloud Music account and is gitignored.',
  'Zendia reads it as listening taste context.',
  '',
  `- generated_at: ${generatedAt}`,
  `- user_id: ${user.userId}`,
  ...(user.nickname ? [`- nickname: ${user.nickname}`] : []),
  `- playlist: ${playlist.name}`,
  `- playlist_id: ${playlist.id}`,
  `- song_count: ${songs.length}`,
  '',
  '## Songs',
  '',
  ...songs.map(formatSongLine),
  '',
].join('\n')

writeFileSync(OUT_PATH, body, 'utf8')

console.log(`[ncm:likes] wrote ${songs.length} songs`)
console.log(`[ncm:likes] ${OUT_PATH}`)
