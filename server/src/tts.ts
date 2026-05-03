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
// Per-language voice + model. The runtime auto-detects whether `say` is
// CJK or Latin and routes both fields to the matching pair. The
// non-suffixed env vars (FISH_VOICE_ID, FISH_MODEL) are global fallbacks
// when a language-specific one isn't set.
const FISH_VOICE_ID = process.env.FISH_VOICE_ID?.trim() || undefined
const FISH_VOICE_ID_ZH = process.env.FISH_VOICE_ID_ZH?.trim() || undefined
const FISH_VOICE_ID_EN = process.env.FISH_VOICE_ID_EN?.trim() || undefined
const FISH_MODEL_DEFAULT = process.env.FISH_MODEL?.trim() || 'speech-1.6'
const FISH_MODEL_ZH = process.env.FISH_MODEL_ZH?.trim() || undefined
const FISH_MODEL_EN = process.env.FISH_MODEL_EN?.trim() || undefined

function detectLanguage(text: string): 'zh' | 'en' {
  // Count CJK characters vs total non-whitespace chars. A pure Chinese
  // sentence is essentially 100% CJK; a pure English one is 0%. Mixed
  // (Chinese with quoted English titles, or vice versa) still tilts
  // strongly toward one. The 30% threshold handles the common case
  // where a Chinese line drops in an English song title.
  let cjk = 0
  let total = 0
  for (const ch of text) {
    if (/\s/.test(ch)) continue
    total++
    const code = ch.codePointAt(0) ?? 0
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0xac00 && code <= 0xd7af) // Hangul Syllables
    ) {
      cjk++
    }
  }
  if (total === 0) return 'en'
  return cjk / total >= 0.3 ? 'zh' : 'en'
}

function pickVoiceAndModel(text: string): { voice: string; model: string } {
  const lang = detectLanguage(text)
  if (lang === 'zh') {
    return {
      voice: FISH_VOICE_ID_ZH ?? FISH_VOICE_ID ?? '',
      model: FISH_MODEL_ZH ?? FISH_MODEL_DEFAULT,
    }
  }
  return {
    voice: FISH_VOICE_ID_EN ?? FISH_VOICE_ID ?? '',
    model: FISH_MODEL_EN ?? FISH_MODEL_DEFAULT,
  }
}

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

  const { voice, model } = pickVoiceAndModel(text)
  const hash = hashKey(text, voice, model)
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
      model,
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
