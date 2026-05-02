// Thin wrapper over NeteaseCloudMusicApi: just `searchSong` and `getSongUrl`
// for now — that's all the live DJ loop needs. Lyric / recommend can be
// added later without changing call sites.
//
// The package is CJS and exports a flat namespace of functions; we use
// named imports for ergonomics. SoundQualityType is a const enum which
// can't be imported under isolatedModules, so we pass the string and cast.

import api from 'NeteaseCloudMusicApi'

export type NcmSong = {
  id: number
  name: string
  artists: string[]
  album: string
  fee?: number // 0 = free, 1 = vip
}

type CloudSearchBody = {
  result?: {
    songs?: Array<{
      id: number
      name: string
      ar?: Array<{ name: string }>
      al?: { name: string }
      fee?: number
    }>
  }
}

type SongUrlV1Body = {
  data?: Array<{
    id: number
    url: string | null
    br?: number
    expi?: number
  }>
}

export async function searchSong(keywords: string, limit = 5): Promise<NcmSong[]> {
  const res = await api.cloudsearch({ keywords, type: 1, limit })
  const body = res.body as CloudSearchBody
  const songs = body.result?.songs ?? []
  return songs.map((s) => ({
    id: s.id,
    name: s.name,
    artists: (s.ar ?? []).map((a) => a.name),
    album: s.al?.name ?? '',
    fee: s.fee,
  }))
}

export async function getSongUrl(
  id: number,
  level: 'standard' | 'higher' | 'exhigh' | 'lossless' = 'standard',
): Promise<{ url: string; expiresAt?: number } | null> {
  const res = await api.song_url_v1({ id, level: level as never })
  const body = res.body as SongUrlV1Body
  const first = body.data?.[0]
  if (!first?.url) return null
  return { url: first.url, ...(first.expi !== undefined && { expiresAt: first.expi }) }
}
