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
      'No song is playing yet — this is the first turn of the session. Pick something to start with.',
    )
  }

  lines.push('', 'Produce a substantial radio segment, ~30-60 seconds of speech (about 60-120 words). Build a small arc:')
  lines.push('  1. Context: who wrote / recorded it, roughly when, what scene or genre.')
  lines.push('  2. Feeling / theme: what the song is trying to say, or how it lands in this moment.')
  lines.push('  3. Hand-off: a clean exit into the music ("接下来请欣赏…" or equivalent).')
  lines.push('')
  if (mode === 'intro') {
    lines.push('Intro mode: queue a NEW song in play[] and use steps 1-2-3 to introduce it.')
  } else if (mode === 'mid-song') {
    lines.push('Mid-song mode: leave play empty and use steps 1-2 to deepen the current track.')
  } else {
    lines.push('Choose intro mode (queue new song in play[]) or mid-song mode (play=[]) based on what the moment calls for.')
  }

  lines.push(
    '',
    'Match the song\'s language. Chinese song → Chinese DJ. English song → English DJ.',
    '',
    'Reply with ONLY a single JSON object. Start with { and end with }.',
    'No prose, no quotes around the whole reply, no markdown fences.',
    '',
    'Required keys: say (string, 60-120 words), play (string[]), reason (string), segue (string, "" if none).',
    '',
    'Example of a valid full reply:',
    '{"say":"接下来这首是周杰伦的《晴天》,2003年发行,收在《叶惠美》这张专辑里。这是他自己作词作曲的钢琴民谣,讲的是青春期那种朦胧又笨拙的暗恋——你想说一句喜欢,可还是绕了一整个夏天。听这首歌的时候,你会想起某个具体的午后,阳光是斜的,身边那个人正在笑。接下来请欣赏。","play":["晴天 周杰伦"],"reason":"傍晚柔光,适合一首怀旧又柔软的钢琴民谣开场","segue":""}',
  )
  return lines.join('\n')
}
