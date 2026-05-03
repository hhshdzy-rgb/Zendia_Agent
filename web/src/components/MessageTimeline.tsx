import { useEffect, useRef } from 'react'
import { formatMessageClock } from '../lib/format'
import { tokenize } from '../lib/tokenize'
import type { Message } from '../types'

type Props = {
  messages: Message[]
  /** Server's sessionStartedAt (epoch ms). Used to convert each message's
      session-relative ts into a wall-clock HH:MM stamp for display. */
  sessionStartedAt: number
  // Local playback override keeps the highlighted word aligned with the
  // audio element, even if the server has already marked the message done.
  playingOverride?: { id: string; wordIdx: number } | null
  /** Re-play a DJ message's cached TTS audio. Only DJ messages with
      audioUrl render a Replay button. */
  onReplay?: (m: Message) => void
}

export default function MessageTimeline({
  messages,
  sessionStartedAt,
  playingOverride,
  onReplay,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lastSpeakingIdRef = useRef<string | null>(null)
  const speakingId =
    playingOverride?.id ?? messages.find((m) => m.status === 'speaking')?.id ?? null

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
        const isUser = m.type === 'user_chat'
        const isOverride = !isUser && playingOverride?.id === m.id
        const visualStatus = isOverride ? 'speaking' : m.status
        const highlightIdx = isUser
          ? undefined
          : isOverride
            ? playingOverride!.wordIdx
            : m.status === 'speaking'
              ? m.highlightWord
              : undefined
        const author = isUser ? '你' : 'Zendia'
        const avatarLetter = isUser ? '你' : 'Z'
        const variantClass = isUser ? 'message-user-chat' : 'message-dj-say'

        return (
          <article key={m.id} className={`message message-${visualStatus} ${variantClass}`}>
            <div className="message-avatar" aria-hidden="true">
              {avatarLetter}
            </div>
            <div className="message-content">
              <header className="message-meta">
                <span className="message-author">{author}</span>
                <span className="message-dot">/</span>
                <span className="message-ts mono">
                  {formatMessageClock(sessionStartedAt, m.ts)}
                </span>
                {!isUser && m.audioUrl && onReplay && (
                  <button
                    type="button"
                    className="message-replay pixel"
                    onClick={() => onReplay(m)}
                    aria-label="Replay this message"
                    title="Replay"
                  >
                    <ReplayIcon />
                    REPLAY
                  </button>
                )}
              </header>
              <p className="message-body">{renderBody(m.text, highlightIdx)}</p>
            </div>
          </article>
        )
      })}
      <div ref={sentinelRef} className="message-sentinel" aria-hidden="true" />
    </div>
  )
}

function ReplayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  )
}

function renderBody(text: string, highlightIdx: number | undefined) {
  const tokens = tokenize(text)
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
