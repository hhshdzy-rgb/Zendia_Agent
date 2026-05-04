import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Message, WordTiming } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.ZENDIA_DB ?? path.resolve(__dirname, '..', 'state.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

// Bump when the table schema or its CHECK constraints change so the
// migration block below knows to rebuild old DBs in the wild.
const SCHEMA_VERSION = 2

function migrateMessagesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT PRIMARY KEY,
      ts                INTEGER NOT NULL,
      type              TEXT NOT NULL DEFAULT 'dj_say'
                        CHECK (type IN ('dj_say', 'song', 'system', 'user_chat')),
      text              TEXT NOT NULL,
      status            TEXT NOT NULL
                        CHECK (status IN ('pending', 'speaking', 'done', 'failed')),
      highlight_word    INTEGER,
      audio_url         TEXT,
      song_id           INTEGER,
      word_timings_json TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    );
  `)

  const cols = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{ name: string }>
  const names = new Set(cols.map((c) => c.name))
  const required = [
    'type',
    'audio_url',
    'song_id',
    'word_timings_json',
    'updated_at',
  ]
  const columnsOK = required.every((name) => names.has(name))
  const dbVersion = db.pragma('user_version', { simple: true }) as number
  if (columnsOK && dbVersion >= SCHEMA_VERSION) return

  // Rebuild path. Some columns may not exist on very old DBs; guard the
  // SELECT with NULL fills for whatever's missing.
  const audioUrlSrc = names.has('audio_url') ? 'audio_url' : 'NULL'
  const songIdSrc = names.has('song_id') ? 'song_id' : 'NULL'
  const timingsSrc = names.has('word_timings_json') ? 'word_timings_json' : 'NULL'
  const updatedAtSrc = names.has('updated_at') ? 'updated_at' : 'created_at'
  const typeSrc = names.has('type') ? `COALESCE(type, 'dj_say')` : `'dj_say'`

  db.exec(`ALTER TABLE messages RENAME TO messages_old;`)
  db.exec(`
    CREATE TABLE messages (
      id                TEXT PRIMARY KEY,
      ts                INTEGER NOT NULL,
      type              TEXT NOT NULL DEFAULT 'dj_say'
                        CHECK (type IN ('dj_say', 'song', 'system', 'user_chat')),
      text              TEXT NOT NULL,
      status            TEXT NOT NULL
                        CHECK (status IN ('pending', 'speaking', 'done', 'failed')),
      highlight_word    INTEGER,
      audio_url         TEXT,
      song_id           INTEGER,
      word_timings_json TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    );
  `)
  db.exec(`
    INSERT INTO messages (
      id, ts, type, text, status, highlight_word, audio_url, song_id,
      word_timings_json, created_at, updated_at
    )
    SELECT
      id,
      ts,
      ${typeSrc},
      text,
      CASE WHEN status IN ('pending', 'speaking', 'done', 'failed') THEN status ELSE 'done' END,
      highlight_word,
      ${audioUrlSrc},
      ${songIdSrc},
      ${timingsSrc},
      created_at,
      ${updatedAtSrc}
    FROM messages_old;
  `)
  db.exec(`DROP TABLE messages_old;`)
  db.pragma(`user_version = ${SCHEMA_VERSION}`)
}

migrateMessagesTable()

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_session_time ON messages (ts);
`)

const stmts = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO messages (
      id, ts, type, text, status, highlight_word, audio_url, song_id,
      word_timings_json, created_at, updated_at
    )
    VALUES (
      @id, @ts, @type, @text, @status, @highlight_word, @audio_url, @song_id,
      @word_timings_json, @created_at, @updated_at
    )
  `),
  updateWord: db.prepare(`
    UPDATE messages
    SET highlight_word = @highlight_word, updated_at = @updated_at
    WHERE id = @id
  `),
  markDone: db.prepare(`
    UPDATE messages
    SET status = 'done', highlight_word = NULL, updated_at = @updated_at
    WHERE id = @id
  `),
  recent: db.prepare(`
    SELECT
      id, ts, type, text, status, highlight_word, audio_url, song_id,
      word_timings_json
    FROM messages
    ORDER BY created_at DESC
    LIMIT @limit
  `),
  recentSongs: db.prepare(`
    SELECT id, text, song_id, created_at
    FROM messages
    WHERE type = 'song'
    ORDER BY created_at DESC
    LIMIT @limit
  `),
  count: db.prepare(`SELECT COUNT(*) AS n FROM messages`),
}

type Row = {
  id: string
  ts: number
  type: 'dj_say' | 'song' | 'system'
  text: string
  status: 'pending' | 'speaking' | 'done' | 'failed'
  highlight_word: number | null
  audio_url: string | null
  song_id: number | null
  word_timings_json: string | null
}

function encodeTimings(wordTimings: WordTiming[] | undefined): string | null {
  return wordTimings && wordTimings.length > 0 ? JSON.stringify(wordTimings) : null
}

function decodeTimings(raw: string | null): WordTiming[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as WordTiming[]
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export const messagesRepo = {
  insert(message: Message): void {
    const now = Date.now()
    stmts.insert.run({
      id: message.id,
      ts: message.ts,
      type: message.type,
      text: message.text,
      status: message.status,
      highlight_word: message.highlightWord ?? null,
      audio_url: message.audioUrl ?? null,
      song_id: message.songId ?? null,
      word_timings_json: encodeTimings(message.wordTimings),
      created_at: now,
      updated_at: now,
    })
  },
  updateWord(id: string, wordIdx: number): void {
    stmts.updateWord.run({ id, highlight_word: wordIdx, updated_at: Date.now() })
  },
  markDone(id: string): void {
    stmts.markDone.run({ id, updated_at: Date.now() })
  },
  recent(limit: number): Message[] {
    const rows = stmts.recent.all({ limit }) as Row[]
    return rows.reverse().map((r) => ({
      id: r.id,
      ts: r.ts,
      type: r.type,
      text: r.text,
      status: r.status,
      ...(r.highlight_word !== null ? { highlightWord: r.highlight_word } : {}),
      ...(r.audio_url ? { audioUrl: r.audio_url } : {}),
      ...(r.song_id !== null ? { songId: r.song_id } : {}),
      ...(decodeTimings(r.word_timings_json)
        ? { wordTimings: decodeTimings(r.word_timings_json) }
        : {}),
    }))
  },
  count(): number {
    return (stmts.count.get() as { n: number }).n
  },
  // Returns the most recent N songs the DJ has played, newest first.
  // Used as a "do not repeat" list injected into the prompt every turn.
  recentSongs(limit: number): Array<{ text: string; songId: number | null; createdAt: number }> {
    const rows = stmts.recentSongs.all({ limit }) as Array<{
      id: string
      text: string
      song_id: number | null
      created_at: number
    }>
    return rows.map((r) => ({ text: r.text, songId: r.song_id, createdAt: r.created_at }))
  },
}

console.log(`[zendia] sqlite at ${DB_PATH} (${messagesRepo.count()} messages)`)
