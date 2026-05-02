// Shared {say, play, reason, segue} contract used by every Claude-driven
// DJ turn — parsed off the model's raw text and the directive that nudges
// the model to produce it. Kept in one place so the pipelineSmoke script,
// the live runtime loop, and any future call site stay in sync.

export type DjReply = {
  say: string
  play: string[]
  reason: string
  segue: string
}

export function parseDjReply(text: string): DjReply | null {
  let body = text.trim()
  if (body.startsWith('```')) {
    body = body
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/, '')
      .trim()
  }
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.say !== 'string' || !v.say.trim()) return null
  if (!Array.isArray(v.play)) return null
  if (typeof v.reason !== 'string') return null
  if (typeof v.segue !== 'string') return null
  const play = (v.play as unknown[]).filter((x): x is string => typeof x === 'string')
  return { say: v.say, play, reason: v.reason, segue: v.segue }
}

export function buildDjDirective(opts: { nextSongHint?: string } = {}): string {
  const lines: string[] = ['Generate the next DJ turn for the listener.']
  if (opts.nextSongHint) {
    lines.push(`The next song in the queue is ${opts.nextSongHint}.`)
  }
  lines.push(
    '',
    'Reply with ONLY a single JSON object on one line. Start with { and end with }.',
    'No prose, no quotes around the whole reply, no markdown.',
    '',
    'Required keys: say (string, 1-3 sentence DJ line), play (string[]), reason (string), segue (string, "" if none).',
    '',
    'Example of a valid full reply:',
    '{"say":"It is late on a Monday, and here is a song that moves with your breath.","play":["Monday Night Exhale - Bread"],"reason":"Winding-down playlist + late weekday evening","segue":""}',
  )
  return lines.join('\n')
}
