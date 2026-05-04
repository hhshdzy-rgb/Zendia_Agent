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
    mode?: 'intro' | 'mid-song' | 'reply' | 'auto'
    /** Required when mode = 'reply'; the listener's message to address. */
    userMessage?: string
    /** Recently played tracks the model must NOT pick again. Newest first. */
    recentlyPlayed?: string[]
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

  if (opts.recentlyPlayed && opts.recentlyPlayed.length > 0) {
    lines.push(
      '',
      'RECENTLY PLAYED — DO NOT REPEAT (newest first):',
      ...opts.recentlyPlayed.map((s) => `  - ${s}`),
      '',
      'Hard rules:',
      '- Do NOT pick any title in the list above.',
      '- Do NOT pick the same artist back-to-back; leave at least 3 turns between same-artist picks.',
      '- Reach for deeper cuts, album tracks, B-sides, live versions, collaborations — not the artist\'s 3 most-canonical hits over and over.',
    )
  }

  if (mode === 'reply') {
    // Reply turns get their own structure — the listener interrupted, so
    // drop the radio-segment template and respond directly to them.
    lines.push(
      '',
      `THE LISTENER JUST SAID: "${opts.userMessage ?? ''}"`,
      '',
      'Reply directly to them. ONE acknowledging line + one short follow-up. Maximum 25 words total. No "great question" / "thanks for sharing" / "love that vibe" — speak like a friend they texted, not like a call-in show.',
      '',
      'If they asked for a song or a vibe, put a search query in play[] and the next track will swap immediately. If they just made a comment, leave play empty.',
      '',
      'Do not continue your previous monologue. Address THEM.',
    )
  } else {
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
  }

  lines.push(
    '',
    'Language: ENGLISH only if the song is English. For Chinese / Japanese / Korean / instrumental / unknown — write CHINESE. (In reply mode, match the listener\'s input language: their English → your English, their Chinese → your Chinese.)',
    '',
    'Reply with only a single JSON object. Start with { and end with }.',
    'No prose, no markdown fences, and no quotes around the whole reply.',
    '',
    'Required keys: say (string), play (string[]), reason (string), segue (string, empty string if none).',
    '',
    mode === 'reply'
      ? 'Valid reply-mode example:\n{"say":"陈奕迅来了。先放一首《十年》,看你听完什么感觉。","play":["十年 陈奕迅"],"reason":"User asked for Eason; pick the canonical track","segue":""}'
      : 'Valid example:\n{"say":"It is late on a Monday, and this one moves like a slow breath after a long day. David Gates keeps the guitar close and lets the melody do the leaning. Let it open the room a little.","play":["Bread If"],"reason":"Soft late-night pacing; acoustic, warm, and familiar.","segue":""}',
  )

  return lines.join('\n')
}
