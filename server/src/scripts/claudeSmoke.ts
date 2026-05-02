/* tsx server/src/scripts/claudeSmoke.ts ["custom prompt"]
   Verifies that the Claude Code CLI is callable as a subprocess and that
   --output-format json gives us something parseable. Any failure here
   means CLAUDE.JS won't work at all — fix this first before wiring it
   into the runtime pipeline. */

import { runClaude } from '../claude.js'

const prompt =
  process.argv[2] ??
  'Reply with the literal JSON object {"hello":"zendia"} and nothing else.'

console.log('[claude smoke] prompt:', JSON.stringify(prompt))
console.log('[claude smoke] running (this may take a few seconds)...')

const result = await runClaude(prompt, { timeoutMs: 60_000 })

console.log(`[claude smoke] done in ${result.durationMs}ms`)
if (!result.ok) {
  console.error('[claude smoke] FAILED')
  console.error(result.error)
  process.exit(1)
}

console.log('[claude smoke] text:')
console.log(result.text)
console.log('[claude smoke] raw:')
console.dir(result.raw, { depth: 5 })
