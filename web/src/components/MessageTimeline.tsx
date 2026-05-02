import { formatTime } from '../lib/format'
import type { Message } from '../types'

type Props = {
  messages: Message[]
}

export default function MessageTimeline({ messages }: Props) {
  return (
    <div className="message-timeline">
      {messages.map((m) => (
        <article key={m.id} className={`message message-${m.status}`}>
          <header className="message-meta">
            <span className="message-author">Zendia</span>
            <span className="message-dot">·</span>
            <span className="message-ts mono">{formatTime(m.ts)}</span>
          </header>
          <p className="message-body">
            {renderBody(m.text, m.status === 'speaking' ? m.highlightWord : undefined)}
          </p>
        </article>
      ))}
    </div>
  )
}

function renderBody(text: string, highlightIdx: number | undefined) {
  // Word-level highlight (when speaking). Splits on whitespace, preserves punctuation glued.
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
