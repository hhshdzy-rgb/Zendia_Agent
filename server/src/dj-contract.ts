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

export function buildDjDirective(
  opts: {
    nowPlaying?: { title: string; artist: string }
    nextSongHint?: string
  } = {},
): string {
  const lines: string[] = []

  if (opts.nowPlaying) {
    lines.push(
      `Right now the listener is hearing: "${opts.nowPlaying.title}" by ${opts.nowPlaying.artist}.`,
      '',
      'React to THIS song — an impression, a small memory, what the moment feels like with this track in the room. Not an introduction. Not "up next". Talk about the song as if it is already playing (because it is).',
      '',
      'For `play`: leave it [] unless this song has been playing long enough that it is time for a change. If you do queue a next track, pick something that segues naturally.',
    )
  } else {
    lines.push(
      'This is the first DJ turn of the session — pick a song to start with and say a brief opening thought. Keep it conversational, not a "welcome to my radio show" cliché.',
    )
  }

  lines.push(
    '',
    'Reply with ONLY a single JSON object on one line. Start with { and end with }.',
    'No prose, no quotes around the whole reply, no markdown.',
    '',
    'Required keys: say (string, 1-2 sentence DJ thought), play (string[]), reason (string), segue (string, "" if none).',
    '',
    'Example of a valid full reply:',
    '{"say":"Monday Night Exhale always sounds like the room got a little quieter — that nylon-string pull never misses.","play":[],"reason":"Mid-song reflection, no swap needed","segue":""}',
  )

  if (opts.nextSongHint) {
    lines.push('', `Hint: a candidate next track is ${opts.nextSongHint}.`)
  }
  return lines.join('\n')
}
