// Thin wrapper over NeteaseCloudMusicApi. Keeps the rest of Zendia away from
// package-specific response shapes and cookie plumbing.

import 'dotenv/config'
import api from 'NeteaseCloudMusicApi'

const NCM_COOKIE = process.env.NCM_COOKIE?.trim() || undefined

let warnedNoCookie = false
function ensureCookieWarning() {
  if (!NCM_COOKIE && !warnedNoCookie) {
    warnedNoCookie = true
    console.warn(
      '[ncm] NCM_COOKIE not set. VIP-locked songs and user playlists may be unavailable. See server/.env.example for setup.',
    )
  }
}

export type NcmSong = {
  id: number
  name: string
  artists: string[]
  album: string
  fee?: number
}

export type NcmPlaylist = {
  id: number
  name: string
  trackCount?: number
  specialType?: number
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

type UserAccountBody = {
  profile?: {
    userId?: number
    nickname?: string
  }
}

type UserPlaylistBody = {
  playlist?: Array<{
    id: number
    name: string
    trackCount?: number
    specialType?: number
  }>
}

type PlaylistDetailBody = {
  playlist?: {
    id: number
    name: string
    tracks?: Array<{
      id: number
      name: string
      ar?: Array<{ name: string }>
      al?: { name: string }
    }>
  }
}

export async function searchSong(keywords: string, limit = 5): Promise<NcmSong[]> {
  ensureCookieWarning()
  const res = await api.cloudsearch({
    keywords,
    type: 1,
    limit,
    ...(NCM_COOKIE && { cookie: NCM_COOKIE }),
  })
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
  ensureCookieWarning()
  const res = await api.song_url_v1({
    id,
    level: level as never,
    ...(NCM_COOKIE && { cookie: NCM_COOKIE }),
  })
  const body = res.body as SongUrlV1Body
  const first = body.data?.[0]
  if (!first?.url) return null
  return { url: first.url, ...(first.expi !== undefined && { expiresAt: first.expi }) }
}

export async function getCurrentNcmUser(): Promise<{ userId: number; nickname?: string }> {
  ensureCookieWarning()
  if (!NCM_COOKIE) throw new Error('NCM_COOKIE is required to read user playlists')

  const res = await api.user_account({ cookie: NCM_COOKIE })
  const body = res.body as UserAccountBody
  const userId = body.profile?.userId
  if (!userId) throw new Error('Could not read NCM user id from user_account response')
  return { userId, ...(body.profile?.nickname ? { nickname: body.profile.nickname } : {}) }
}

export async function getUserPlaylists(uid: number, limit = 100): Promise<NcmPlaylist[]> {
  ensureCookieWarning()
  const res = await api.user_playlist({
    uid,
    limit,
    offset: 0,
    ...(NCM_COOKIE && { cookie: NCM_COOKIE }),
  })
  const body = res.body as UserPlaylistBody
  return (body.playlist ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    ...(p.trackCount !== undefined && { trackCount: p.trackCount }),
    ...(p.specialType !== undefined && { specialType: p.specialType }),
  }))
}

export async function getPlaylistSongs(id: number): Promise<NcmSong[]> {
  ensureCookieWarning()
  const res = await api.playlist_detail({
    id,
    ...(NCM_COOKIE && { cookie: NCM_COOKIE }),
  })
  const body = res.body as PlaylistDetailBody
  const tracks = body.playlist?.tracks ?? []
  return tracks.map((s) => ({
    id: s.id,
    name: s.name,
    artists: (s.ar ?? []).map((a) => a.name),
    album: s.al?.name ?? '',
  }))
}

export async function getMyLikedPlaylistSongs(): Promise<{
  user: { userId: number; nickname?: string }
  playlist: NcmPlaylist
  songs: NcmSong[]
}> {
  const user = await getCurrentNcmUser()
  const playlists = await getUserPlaylists(user.userId)
  const liked =
    playlists.find((p) => p.specialType === 5) ??
    playlists.find((p) => p.name.includes('喜欢')) ??
    playlists[0]

  if (!liked) throw new Error('No playlists found for current NCM user')
  const songs = await getPlaylistSongs(liked.id)
  return { user, playlist: liked, songs }
}
