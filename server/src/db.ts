import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Message } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.ZENDIA_DB ?? path.resolve(__dirname, '..', 'state.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    ts              INTEGER NOT NULL,
    text            TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending', 'speaking', 'done')),
    highlight_word  INTEGER,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
`)

const stmts = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO messages (id, ts, text, status, highlight_word, created_at)
    VALUES (@id, @ts, @text, @status, @highlight_word, @created_at)
  `),
  updateWord: db.prepare(`
    UPDATE messages SET highlight_word = @highlight_word WHERE id = @id
  `),
  markDone: db.prepare(`
    UPDATE messages SET status = 'done', highlight_word = NULL WHERE id = @id
  `),
  recent: db.prepare(`
    SELECT id, ts, text, status, highlight_word
    FROM messages
    ORDER BY created_at DESC
    LIMIT @limit
  `),
  count: db.prepare(`SELECT COUNT(*) AS n FROM messages`),
}

type Row = {
  id: string
  ts: number
  text: string
  status: 'pending' | 'speaking' | 'done'
  highlight_word: number | null
}

export const messagesRepo = {
  insert(message: Message): void {
    stmts.insert.run({
      id: message.id,
      ts: message.ts,
      text: message.text,
      status: message.status,
      highlight_word: message.highlightWord ?? null,
      created_at: Date.now(),
    })
  },
  updateWord(id: string, wordIdx: number): void {
    stmts.updateWord.run({ id, highlight_word: wordIdx })
  },
  markDone(id: string): void {
    stmts.markDone.run({ id })
  },
  recent(limit: number): Message[] {
    const rows = stmts.recent.all({ limit }) as Row[]
    // SELECT returns DESC by created_at; reverse to chronological
    return rows.reverse().map((r) => ({
      id: r.id,
      ts: r.ts,
      text: r.text,
      status: r.status,
      ...(r.highlight_word !== null ? { highlightWord: r.highlight_word } : {}),
    }))
  },
  count(): number {
    return (stmts.count.get() as { n: number }).n
  },
}

console.log(`[zendia] sqlite at ${DB_PATH} (${messagesRepo.count()} messages)`)
