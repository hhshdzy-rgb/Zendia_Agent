import 'dotenv/config'
import crypto from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode } from '@msgpack/msgpack'
import type { WordTiming } from './types.js'

// TTS pipeline — Fish Audio + on-disk cache.
// Same text + voice always hits the cache, so repeats are free and fast.
// The architecture施工图 names this layer cache/tts/<hash>.mp3 → /tts/<hash>;
// commit 2 will wire the static-serve side.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(SERVER_ROOT, 'cache', 'tts')

const FISH_API_KEY = process.env.FISH_API_KEY?.trim() || undefined
const FISH_API_URL = 'https://api.fish.audio/v1/tts'
const FISH_VOICE_ID = process.env.FISH_VOICE_ID?.trim() || undefined
const FISH_MODEL = process.env.FISH_MODEL?.trim() || 'speech-1.6'

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

let warnedNoKey = false
function ensureKeyWarning() {
  if (!FISH_API_KEY && !warnedNoKey) {
    warnedNoKey = true
    console.warn(
      '[tts] FISH_API_KEY not set — TTS synthesis will be skipped (DJ stays mute). ' +
        'See server/.env.example for setup.',
    )
  }
}

function hashKey(text: string, voice: string, model: string): string {
  return crypto
    .createHash('sha256')
    .update(`${model}|${voice}|${text}`)
    .digest('hex')
    .slice(0, 16)
}

export type SynthResult = {
  url: string // public path the frontend fetches: /tts/<hash>.mp3
  absPath: string // server-side absolute path
  bytes: number
  cached: boolean
  durationMs: number
  wordTimings?: WordTiming[]
}

export async function synthesize(text: string): Promise<SynthResult | null> {
  ensureKeyWarning()
  if (!FISH_API_KEY) return null
  if (!text.trim()) return null

  const voice = FISH_VOICE_ID ?? ''
  const hash = hashKey(text, voice, FISH_MODEL)
  const filename = `${hash}.mp3`
  const absPath = path.join(CACHE_DIR, filename)
  const url = `/tts/${filename}`

  if (existsSync(absPath)) {
    return { url, absPath, bytes: statSync(absPath).size, cached: true, durationMs: 0 }
  }

  const start = Date.now()
  const body: Record<string, unknown> = {
    text,
    format: 'mp3',
    mp3_bitrate: 128,
    normalize: true,
    latency: 'normal',
  }
  if (voice) body.reference_id = voice

  const res = await fetch(FISH_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FISH_API_KEY}`,
      'Content-Type': 'application/msgpack',
      model: FISH_MODEL,
    },
    body: encode(body),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Fish Audio HTTP ${res.status}: ${errBody.slice(0, 200)}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(absPath, buf)

  return {
    url,
    absPath,
    bytes: buf.length,
    cached: false,
    durationMs: Date.now() - start,
  }
}
