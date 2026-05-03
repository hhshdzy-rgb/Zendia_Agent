// Shared {say, play, reason, segue} contract for every Claude-driven DJ turn.
// Kept in one place so the live runtime and smoke scripts validate the same
// JSON shape.

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

export function buildDjDirective(
  opts: {
    nowPlaying?: { title: string; artist: string }
    mode?: 'intro' | 'mid-song' | 'auto'
  } = {},
): string {
  const lines: string[] = ['Generate the next DJ segment.']
  const mode = opts.mode ?? 'auto'

  if (opts.nowPlaying) {
    lines.push(
      '',
      `Currently playing: "${opts.nowPlaying.title}" by ${opts.nowPlaying.artist}.`,
    )
  } else {
    lines.push(
      '',
      'No song is playing yet. This is the first turn of the session, so pick something to start with.',
    )
  }

  lines.push(
    '',
    'Produce a tight radio segment that fits inside a song intro: about 10-15 seconds of speech, 30-50 words, 2-3 sentences.',
    'Compact structure:',
    '1. Context: who, when, what scene, in one short clause.',
    '2. Feeling or theme: what the song carries.',
    '3. Hand-off: a clean exit into the track.',
  )

  if (mode === 'intro') {
    lines.push('', 'Intro mode: queue a new song in play[] and introduce it.')
  } else if (mode === 'mid-song') {
    lines.push('', 'Mid-song mode: leave play empty and deepen the current track.')
  } else {
    lines.push(
      '',
      'Choose intro mode, with a new song in play[], or mid-song mode, with play empty, based on the moment.',
    )
  }

  lines.push(
    '',
    "Match the song's language. Chinese song: Chinese DJ. English song: English DJ.",
    '',
    'Reply with only a single JSON object. Start with { and end with }.',
    'No prose, no markdown fences, and no quotes around the whole reply.',
    '',
    'Required keys: say (string), play (string[]), reason (string), segue (string, empty string if none).',
    '',
    'Valid example:',
    '{"say":"It is late on a Monday, and this one moves like a slow breath after a long day. David Gates keeps the guitar close and lets the melody do the leaning. Let it open the room a little.","play":["Bread If"],"reason":"Soft late-night pacing; acoustic, warm, and familiar.","segue":""}',
  )

  return lines.join('\n')
}
