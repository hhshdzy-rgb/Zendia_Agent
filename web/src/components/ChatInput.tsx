import { useState, type FormEvent } from 'react'

type Props = {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  maxLength?: number
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Say something to the DJ…',
  maxLength = 1000,
}: Props) {
  const [text, setText] = useState('')

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  const canSend = text.trim().length > 0 && !disabled

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <input
        className="chat-input-text"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete="off"
        // Helps mobile keyboards show a "send" key instead of "return".
        enterKeyHint="send"
      />
      <button
        type="submit"
        className="chat-input-send"
        disabled={!canSend}
        aria-label="Send message"
      >
        <SendIcon />
      </button>
    </form>
  )
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </svg>
  )
}
