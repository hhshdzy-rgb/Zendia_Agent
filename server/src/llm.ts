import 'dotenv/config'
import { spawn } from 'node:child_process'

// Pluggable LLM backend. The rest of the codebase calls runLlm(prompt, opts);
// the actual provider — Claude Code subprocess, OpenAI-compatible HTTP API,
// or anything else added later — is selected at boot via ZENDIA_LLM env.
//
// Every provider returns the same LlmResult shape so callers don't care
// which backend is actually serving the turn.

export type LlmResult = {
  ok: boolean
  text?: string
  raw?: unknown
  durationMs: number
  error?: string
}

export type LlmOptions = {
  systemPrompt?: string
  timeoutMs?: number
}

export type LlmProvider = {
  name: string
  run(prompt: string, opts: LlmOptions): Promise<LlmResult>
}

const DEFAULT_TIMEOUT_MS = 120_000

// ---------------------------------------------------------------------------
// Provider: Claude Code CLI subprocess (default)
// ---------------------------------------------------------------------------
//
// Calls the locally-installed `claude` CLI in non-interactive print mode:
//   $ echo "<full prompt incl. system section>" | claude -p --output-format json
// EVERYTHING goes through stdin (Windows caps single-arg length at ~8 KB,
// userCorpus easily exceeds that). System prompt is merged into the stdin
// payload with a clear delimiter so the model still sees the boundary.

const claudeCliProvider: LlmProvider = {
  name: 'claude-cli',
  async run(prompt, opts) {
    const start = Date.now()
    const isWindows = process.platform === 'win32'
    const args = ['-p', '--output-format', 'json']

    const fullPrompt = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n=== END SYSTEM ===\n\n${prompt}`
      : prompt

    // Unset CLAUDECODE so the wrapper still works when itself invoked from
    // inside another Claude Code session (e.g. our smoke test). In normal
    // production this env var isn't set anyway, so no behavior change.
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT

    return new Promise((resolve) => {
      let proc
      try {
        proc = spawn('claude', args, {
          shell: isWindows,
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
        })
      } catch (err) {
        resolve({
          ok: false,
          durationMs: Date.now() - start,
          error: `spawn threw: ${(err as Error).message}`,
        })
        return
      }

      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
        resolve({
          ok: false,
          durationMs: Date.now() - start,
          error: `timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        })
      }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          ok: false,
          durationMs: Date.now() - start,
          error: `spawn error: ${err.message}`,
        })
      })

      proc.on('exit', (code) => {
        clearTimeout(timer)
        const durationMs = Date.now() - start
        if (code !== 0) {
          resolve({
            ok: false,
            durationMs,
            error: `exit code ${code}\nstderr:\n${stderr.trim()}\nstdout:\n${stdout.trim()}`,
          })
          return
        }
        try {
          const raw = JSON.parse(stdout)
          const text = extractClaudeText(raw)
          resolve({ ok: true, text, raw, durationMs })
        } catch (err) {
          resolve({
            ok: false,
            durationMs,
            error: `JSON parse failed: ${(err as Error).message}\nstdout:\n${stdout.trim()}`,
          })
        }
      })

      proc.stdin.write(fullPrompt)
      proc.stdin.end()
    })
  },
}

function extractClaudeText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (typeof r.result === 'string') return r.result
    if (typeof r.content === 'string') return r.content
    if (Array.isArray(r.messages)) {
      const last = r.messages[r.messages.length - 1] as Record<string, unknown> | undefined
      if (last && typeof last.content === 'string') return last.content
    }
  }
  return JSON.stringify(raw)
}

// ---------------------------------------------------------------------------
// Picker
// ---------------------------------------------------------------------------

const PROVIDERS: Record<string, LlmProvider> = {
  'claude-cli': claudeCliProvider,
}

const SELECTED = process.env.ZENDIA_LLM?.trim() || 'claude-cli'

const provider: LlmProvider = (() => {
  const p = PROVIDERS[SELECTED]
  if (!p) {
    console.warn(
      `[llm] unknown provider "${SELECTED}" — falling back to claude-cli. ` +
        `Available: ${Object.keys(PROVIDERS).join(', ')}`,
    )
    return claudeCliProvider
  }
  return p
})()

console.log(`[llm] provider: ${provider.name}`)

export async function runLlm(prompt: string, opts: LlmOptions = {}): Promise<LlmResult> {
  return provider.run(prompt, opts)
}
