/* tsx server/src/scripts/contextSmoke.ts ["user input"]
   Builds a context with sample environment + (optional) user input and
   prints the resulting system prompt + fragment sizes. Verifies that
   prompts/dj-persona.md and user/*.md were picked up correctly. */

import { buildContext } from '../context.js'

const userInput = process.argv[2]

const ctx = buildContext({
  environment: {
    now: new Date(),
    weather: 'overcast, 14°C, light rain',
    calendar: '17:30 — meeting with Alice; 19:00 — dinner',
  },
  ...(userInput ? { userInput } : {}),
  trace: 'scheduler.tick=hourly-mood-check',
})

console.log('=== systemPrompt ===\n')
console.log(ctx.systemPrompt)
console.log('\n=== fragment sizes ===')
let total = 0
for (const [name, content] of Object.entries(ctx.fragments)) {
  console.log(`  ${name.padEnd(18)} ${content.length} chars`)
  total += content.length
}
console.log(`  ${'TOTAL'.padEnd(18)} ${total} chars (~${Math.round(total / 4)} tokens)`)
