/* tsx server/src/scripts/pipelineSmoke.ts ["directive"]
   Full DJ-brain dry run:
     buildContext()  ->  systemPrompt
     runClaude(directive, { systemPrompt })  ->  raw text
     parseDjReply  ->  {say, play, reason, segue}

   Same shape the live runtime uses; only difference is this is one-shot. */

import { runClaude } from '../claude.js'
import { buildContext } from '../context.js'
import { buildDjDirective, parseDjReply } from '../dj-contract.js'

const directive =
  process.argv[2] ??
  buildDjDirective({ nextSongHint: '"Monday Night Exhale" by Bread' })

console.log('[pipeline] directive:', JSON.stringify(directive))
console.log('[pipeline] building context...')

const ctx = buildContext({
  environment: {
    now: new Date(),
    weather: 'overcast, 14°C, light rain',
    calendar: '17:30 — meeting with Alice; 19:00 — dinner',
  },
})

console.log(
  `[pipeline] context: ${ctx.systemPrompt.length} chars (~${Math.round(ctx.systemPrompt.length / 4)} tokens)`,
)
console.log('[pipeline] calling claude...')

const result = await runClaude(directive, {
  systemPrompt: ctx.systemPrompt,
  timeoutMs: 120_000,
})

console.log(`[pipeline] claude returned in ${result.durationMs}ms`)
if (!result.ok) {
  console.error('[pipeline] FAILED at subprocess layer:')
  console.error(result.error)
  process.exit(1)
}

console.log('\n[pipeline] raw text:')
console.log(result.text)

const reply = parseDjReply(result.text ?? '')
if (!reply) {
  console.error('\n[pipeline] FAILED to parse {say, play, reason, segue} JSON')
  process.exit(2)
}

console.log('\n[pipeline] parsed:')
console.dir(reply, { depth: 5 })
console.log('\n[pipeline] OK — context -> claude -> contract pipeline verified end-to-end.')
