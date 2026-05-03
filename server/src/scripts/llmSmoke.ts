/* tsx server/src/scripts/llmSmoke.ts ["custom prompt"]
   Verifies that whichever LLM provider is selected (ZENDIA_LLM env, default
   claude-cli) returns a parseable response. Hits the same runLlm() entry
   the live runtime uses, so a green smoke means the pipeline can talk
   to its model end-to-end. */

import { runLlm } from '../llm.js'

const prompt =
  process.argv[2] ??
  'Reply with the literal JSON object {"hello":"zendia"} and nothing else.'

console.log('[llm smoke] prompt:', JSON.stringify(prompt))
console.log('[llm smoke] running (this may take a few seconds)...')

const result = await runLlm(prompt, { timeoutMs: 60_000 })

console.log(`[llm smoke] done in ${result.durationMs}ms`)
if (!result.ok) {
  console.error('[llm smoke] FAILED')
  console.error(result.error)
  process.exit(1)
}

console.log('[llm smoke] text:')
console.log(result.text)
console.log('[llm smoke] raw:')
console.dir(result.raw, { depth: 5 })
