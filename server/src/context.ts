import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { messagesRepo } from './db.js'
import type { Message } from './types.js'

// CONTEXT.JS — assembles the 6-fragment prompt the architecture施工图
// describes:
//   1. systemPersona     — prompts/dj-persona.md
//   2. userCorpus        — user/*.md + user/*.json
//   3. environment       — caller-supplied: now, weather, calendar
//   4. retrievedMemory   — recent messages from state.db (plays come later)
//   5. userInput         — caller-supplied chat / tool result (optional)
//   6. trace             — caller-supplied scheduler/webhook trail (optional)
//
// Output is a single Markdown blob suitable as the system prompt for
// the Claude subprocess. Each section is delimited so a debugger can
// see what the model actually saw.

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

function formatEnvironment(env: Environment | undefined): string {
  const lines: string[] = []
  const now = env?.now ?? new Date()
  lines.push(`- now: ${now.toISOString()}`)
  if (env?.weather) lines.push(`- weather: ${env.weather}`)
  if (env?.calendar) lines.push(`- calendar: ${env.calendar}`)
  return lines.join('\n')
}

function formatRecentMessages(messages: Message[]): string {
  if (messages.length === 0) return '_(none)_'
  return messages.map((m) => `- [${m.status}] "${m.text}"`).join('\n')
}

export function buildContext(input: ContextInput = {}): AssembledContext {
  const persona = readIfExists(PERSONA_PATH)
  const userCorpus = readUserCorpus()
  const environment = formatEnvironment(input.environment)
  const recent = messagesRepo.recent(input.historyLimit ?? 10)
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
  sections.push(`# Recent timeline (most recent last)\n\n${retrievedMemory}`)
  if (userInput) sections.push(`# User input\n\n${userInput}`)
  if (trace) sections.push(`# Execution trace\n\n${trace}`)

  return {
    systemPrompt: sections.join('\n\n---\n\n'),
    fragments,
  }
}
