import { useEffect, useRef } from 'react'
import { formatTime } from '../lib/format'
import type { Message } from '../types'

type Props = {
  messages: Message[]
  // Local-playback override: when a TTS audio file is in flight, this
  // says "treat the matching message as still speaking visually + use
  // this wordIdx for the highlight cursor", regardless of what the
  // server has set m.status to. Keeps the bold/darker styling AND the
  // green word cursor aligned with the actual audio, instead of fading
  // to gray midway through the sentence.
  playingOverride?: { id: string; wordIdx: number } | null
}

export default function MessageTimeline({ messages, playingOverride }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lastSpeakingIdRef = useRef<string | null>(null)
  const speakingId =
    playingOverride?.id ?? messages.find((m) => m.status === 'speaking')?.id ?? null

  // Scroll to bottom whenever the message list grows or a new utterance
  // starts speaking. Word advances within an active utterance don't trigger
  // scroll — the message is already in view.
  useEffect(() => {
    const changed = speakingId !== lastSpeakingIdRef.current
    lastSpeakingIdRef.current = speakingId
    if (changed || messages.length > 0) {
      sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages.length, speakingId])

  return (
    <div className="message-timeline">
      {messages.map((m) => {
        const isOverride = playingOverride?.id === m.id
        const visualStatus = isOverride ? 'speaking' : m.status
        const highlightIdx = isOverride
          ? playingOverride!.wordIdx
          : m.status === 'speaking'
            ? m.highlightWord
            : undefined
        return (
          <article key={m.id} className={`message message-${visualStatus}`}>
            <header className="message-meta">
              <span className="message-author">Zendia</span>
              <span className="message-dot">·</span>
              <span className="message-ts mono">{formatTime(m.ts)}</span>
            </header>
            <p className="message-body">{renderBody(m.text, highlightIdx)}</p>
          </article>
        )
      })}
      <div ref={sentinelRef} className="message-sentinel" aria-hidden="true" />
    </div>
  )
}

function renderBody(text: string, highlightIdx: number | undefined) {
  const tokens = text.split(/(\s+)/)
  let wordIdx = -1
  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>
    wordIdx += 1
    const isHighlight = highlightIdx !== undefined && wordIdx === highlightIdx
    return (
      <span key={i} className={isHighlight ? 'word word-highlight' : 'word'}>
        {tok}
      </span>
    )
  })
}
