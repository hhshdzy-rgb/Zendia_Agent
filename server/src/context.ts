import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { messagesRepo } from './db.js'
import type { Message } from './types.js'

// Builds the six context fragments used by the local DJ brain:
// 1. persona, 2. user corpus, 3. environment, 4. recent memory,
// 5. user input, 6. execution trace.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..')

const PERSONA_PATH = path.join(SERVER_ROOT, 'prompts', 'dj-persona.md')
const USER_DIR = path.join(SERVER_ROOT, 'user')

export type Environment = {
  now?: Date
  weather?: string
  calendar?: string
}

export type ContextInput = {
  environment?: Environment
  userInput?: string
  trace?: string
  historyLimit?: number
}

export type ContextFragments = {
  persona: string
  userCorpus: string
  environment: string
  retrievedMemory: string
  userInput: string
  trace: string
}

export type AssembledContext = {
  systemPrompt: string
  fragments: ContextFragments
}

function readIfExists(filePath: string): string {
  if (!existsSync(filePath)) return ''
  return readFileSync(filePath, 'utf8').trim()
}

function readUserCorpus(): string {
  if (!existsSync(USER_DIR)) return ''
  const entries = readdirSync(USER_DIR).filter((f) => /\.(md|json)$/i.test(f))
  if (entries.length === 0) return ''
  return entries
    .sort()
    .map((file) => {
      const body = readFileSync(path.join(USER_DIR, file), 'utf8').trim()
      return `## ${file}\n\n${body}`
    })
    .join('\n\n---\n\n')
}

function deriveDaySegment(now: Date): string {
  const h = now.getHours()
  if (h < 6) return 'late night'
  if (h < 9) return 'early morning'
  if (h < 12) return 'morning'
  if (h < 14) return 'midday'
  if (h < 18) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

function formatEnvironment(env: Environment | undefined): string {
  const lines: string[] = []
  const now = env?.now ?? new Date()
  const dow = now.toLocaleDateString('en-US', { weekday: 'long' })
  lines.push(`- now: ${now.toISOString()}`)
  lines.push(`- day-of-week: ${dow}`)
  lines.push(`- day-segment: ${deriveDaySegment(now)}`)
  if (env?.weather) lines.push(`- weather: ${env.weather}`)
  if (env?.calendar) lines.push(`- calendar: ${env.calendar}`)
  return lines.join('\n')
}

const MAX_MEM_CHARS_PER_MSG = 200

function formatRecentMessages(messages: Message[]): string {
  if (messages.length === 0) return '_(none)_'
  return messages
    .map((m) => {
      const text =
        m.text.length > MAX_MEM_CHARS_PER_MSG
          ? `${m.text.slice(0, MAX_MEM_CHARS_PER_MSG)}...`
          : m.text
      return `- [${m.status}] "${text}"`
    })
    .join('\n')
}

export function buildContext(input: ContextInput = {}): AssembledContext {
  const persona = readIfExists(PERSONA_PATH)
  const userCorpus = readUserCorpus()
  const environment = formatEnvironment(input.environment)
  const recent = messagesRepo.recent(input.historyLimit ?? 5)
  const retrievedMemory = formatRecentMessages(recent)
  const userInput = input.userInput?.trim() ?? ''
  const trace = input.trace?.trim() ?? ''

  const fragments: ContextFragments = {
    persona,
    userCorpus,
    environment,
    retrievedMemory,
    userInput,
    trace,
  }

  const sections: string[] = []
  if (persona) sections.push(`# Persona\n\n${persona}`)
  if (userCorpus) sections.push(`# User corpus\n\n${userCorpus}`)
  sections.push(`# Environment\n\n${environment}`)

  const memoryHeading =
    recent.length > 0
      ? `# Recent: your last ${recent.length} turn(s). Vary opener, phrasing, energy, and song picks; do not echo these.`
      : '# Recent: no prior turns yet.'
  sections.push(`${memoryHeading}\n\n${retrievedMemory}`)

  if (userInput) sections.push(`# User input\n\n${userInput}`)
  if (trace) sections.push(`# Execution trace\n\n${trace}`)

  return {
    systemPrompt: sections.join('\n\n---\n\n'),
    fragments,
  }
}
