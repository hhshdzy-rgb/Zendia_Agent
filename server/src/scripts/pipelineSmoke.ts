/* tsx server/src/scripts/pipelineSmoke.ts ["directive"]
   Full DJ-brain dry run:
     buildContext()  ->  systemPrompt
     runClaude(directive, { systemPrompt })  ->  raw text
     parse + validate {say, play, reason, segue}

   This is the same pipe shape the live runtime will use; the only
   things still missing here are NCM-driven `play` resolution and
   replacing the scripted DJ in script.ts with this loop. */

import { runClaude } from '../claude.js'
import { buildContext } from '../context.js'

// The contract is repeated here, close to the user turn, because the
// system prompt alone wasn't strong enough — the model kept wrapping its
// DJ line as a JSON string instead of producing the structured object.
const DEFAULT_DIRECTIVE = [
  'Generate the next DJ turn. The next song queued is "Monday Night Exhale" by Bread.',
  '',
  'Reply with ONLY a single JSON object on one line. Start with { and end with }.',
  'No prose, no quotes around the whole reply, no markdown.',
  '',
  'Required keys: say (string, 1-3 sentence DJ line), play (string[]), reason (string), segue (string, "" if none).',
  '',
  'Example of a valid full reply:',
  '{"say":"It is late on a Monday, and here is a song that moves with your breath.","play":["Monday Night Exhale - Bread"],"reason":"Winding-down playlist + late weekday evening","segue":""}',
].join('\n')

const directive = process.argv[2] ?? DEFAULT_DIRECTIVE

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

const parsed = parseDjReply(result.text ?? '')
if (parsed.kind === 'parse-failed') {
  console.error(`\n[pipeline] FAILED to parse {say,play,reason,segue} JSON: ${parsed.reason}`)
  process.exit(2)
}

console.log('\n[pipeline] parsed:')
console.dir(parsed.value, { depth: 5 })

const violations = validateContract(parsed.value)
if (violations.length > 0) {
  console.warn('\n[pipeline] contract violations:')
  for (const v of violations) console.warn(`  - ${v}`)
  process.exit(3)
}

console.log('\n[pipeline] OK — context -> claude -> contract pipeline verified end-to-end.')

// ---------- helpers ----------

type DjReply = {
  say?: unknown
  play?: unknown
  reason?: unknown
  segue?: unknown
}

function parseDjReply(
  text: string,
): { kind: 'ok'; value: DjReply } | { kind: 'parse-failed'; reason: string } {
  // Tolerate stray whitespace and the occasional fenced code block —
  // the model is told not to wrap, but defenses cost nothing.
  let body = text.trim()
  if (body.startsWith('```')) {
    body = body
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/, '')
      .trim()
  }
  try {
    const value = JSON.parse(body)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { kind: 'parse-failed', reason: 'expected JSON object' }
    }
    return { kind: 'ok', value: value as DjReply }
  } catch (err) {
    return { kind: 'parse-failed', reason: (err as Error).message }
  }
}

function validateContract(reply: DjReply): string[] {
  const errors: string[] = []
  if (typeof reply.say !== 'string' || !reply.say.trim()) {
    errors.push('missing or empty "say"')
  }
  if (!Array.isArray(reply.play)) {
    errors.push('"play" must be an array (use [] for none)')
  }
  if (typeof reply.reason !== 'string') {
    errors.push('"reason" must be a string')
  }
  if (typeof reply.segue !== 'string') {
    errors.push('"segue" must be a string (use "" for none)')
  }
  return errors
}
