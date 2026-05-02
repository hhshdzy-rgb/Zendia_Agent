import { useEffect, useState } from 'react'
import { createMockStream, createWebSocketStream, type ServerEvent } from '../lib/stream'
import type { PlayerState } from '../types'

const INITIAL: PlayerState = {
  sessionStartedAt: Date.now(),
  speaking: false,
  song: { title: '', artist: '', album: '', durationSec: 0, positionSec: 0 },
  messages: [],
}

const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false'

export function usePlayerStream(): PlayerState {
  const [state, setState] = useState<PlayerState>(INITIAL)

  useEffect(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const stream = USE_MOCK
      ? createMockStream()
      : createWebSocketStream(`${wsProto}://${window.location.host}/stream`)

    const unsubscribe = stream.subscribe((e) => {
      setState((prev) => reduce(prev, e))
    })

    return () => {
      unsubscribe()
      stream.close()
    }
  }, [])

  return state
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
      return { ...state, speaking: e.state === 'speaking' }
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
