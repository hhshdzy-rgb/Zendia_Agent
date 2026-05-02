/* tsx server/src/scripts/fishSmoke.ts ["text to synthesize"]
   Verifies Fish Audio TTS pipeline: synth + cache write + file readable.
   Open the printed absPath in any media player to confirm the audio is
   actually a recognizable voice. Subsequent runs of the same text hit
   the cache (returns instantly). */

import { synthesize } from '../tts.js'

const text =
  process.argv[2] ??
  '欢迎收听 Zendia,这里是你的私人 AI 电台。今晚,让我们慢慢听完这首歌。'

console.log(`[fish] synthesizing: ${JSON.stringify(text)}`)

let result
try {
  result = await synthesize(text)
} catch (err) {
  console.error('[fish] FAILED:', (err as Error).message)
  process.exit(2)
}

if (!result) {
  console.error('[fish] FISH_API_KEY not set — see server/.env.example')
  process.exit(1)
}

console.log(
  `[fish] done in ${result.durationMs}ms (${result.cached ? 'cache hit' : 'fresh synthesis'})`,
)
console.log(`[fish] absPath: ${result.absPath}`)
console.log(`[fish] url:     ${result.url}`)
console.log(`[fish] bytes:   ${result.bytes}`)
console.log('\n[fish] OK — open the absPath in a media player to verify audio quality.')
