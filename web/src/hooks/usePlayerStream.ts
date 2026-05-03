import { useCallback, useEffect, useRef, useState } from 'react'
import { createMockStream, createWebSocketStream, type ServerEvent } from '../lib/stream'
import type { ClientEvent, PlayerState } from '../types'

const INITIAL: PlayerState = {
  sessionStartedAt: Date.now(),
  speaking: false,
  thinking: false,
  song: { title: '', artist: '', album: '', durationSec: 0, positionSec: 0 },
  messages: [],
}

// Default: connect to the real Node server (via Vite proxy in dev,
// same-origin in prod). Set VITE_USE_MOCK=true to keep the in-browser
// scripted demo (e.g. for offline UI work or CI screenshots).
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export type PlayerStream = {
  state: PlayerState
  send: (event: ClientEvent) => void
  /** True while the WS is open. Mock stream is always true. */
  connected: boolean
}

export function usePlayerStream(): PlayerStream {
  const [state, setState] = useState<PlayerState>(INITIAL)
  const [connected, setConnected] = useState(false)
  const sendRef = useRef<(event: ClientEvent) => void>(() => {})

  useEffect(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const stream = USE_MOCK
      ? createMockStream()
      : createWebSocketStream(`${wsProto}://${window.location.host}/stream`)

    sendRef.current = stream.send

    const unsubscribe = stream.subscribe((e) => {
      setState((prev) => reduce(prev, e))
    })
    const unsubscribeConn = stream.onConnectionChange(setConnected)

    return () => {
      unsubscribe()
      unsubscribeConn()
      stream.close()
      sendRef.current = () => {}
    }
  }, [])

  const send = useCallback((event: ClientEvent) => sendRef.current(event), [])
  return { state, send, connected }
}

function reduce(state: PlayerState, e: ServerEvent): PlayerState {
  switch (e.type) {
    case 'hello':
      return { ...state, sessionStartedAt: e.sessionStartedAt }
    case 'song':
      return { ...state, song: e.song }
    case 'song_progress':
      return { ...state, song: { ...state.song, positionSec: e.positionSec } }
    case 'tts_state':
      // tts_state always supersedes any pending "thinking" — by the time
      // the DJ is speaking (or fully idle) the spinner should be gone.
      return { ...state, speaking: e.state === 'speaking', thinking: false }
    case 'dj_thinking':
      return { ...state, thinking: e.on }
    case 'message_new':
      if (state.messages.some((m) => m.id === e.message.id)) return state
      return { ...state, messages: [...state.messages, e.message] }
    case 'message_word':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === e.id ? { ...m, highlightWord: e.wordIdx } : m,
        ),
      }
    case 'message_done':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === e.id ? { ...m, status: 'done', highlightWord: undefined } : m,
        ),
      }
  }
}
