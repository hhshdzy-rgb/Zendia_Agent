import { spawn } from 'node:child_process'

// Thin wrapper around the Claude Code CLI in non-interactive print mode:
//   $ echo "<full prompt incl. system section>" | claude -p --output-format json
// EVERYTHING goes through stdin. We deliberately do NOT pass --system-prompt
// as a CLI arg because Windows caps single-arg length at ~8 KB, and once
// userCorpus picks up a real NCM playlist it blows past that. stdin has no
// length limit. We just merge systemPrompt + user prompt with a clear
// delimiter so the model still sees the structure.
//
// On Windows claude is a .cmd shim, so spawn needs shell:true to resolve it.

export type ClaudeResult = {
  ok: boolean
  text?: string
  raw?: unknown
  durationMs: number
  error?: string
}

export type ClaudeOptions = {
  systemPrompt?: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 120_000

export async function runClaude(prompt: string, opts: ClaudeOptions = {}): Promise<ClaudeResult> {
  const start = Date.now()
  const isWindows = process.platform === 'win32'
  const args = ['-p', '--output-format', 'json']

  // Merge systemPrompt into the stdin payload instead of passing as a CLI
  // arg (see file header). Clear delimiter so the model sees the boundary.
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
        const text = extractText(raw)
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
}

function extractText(raw: unknown): string {
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
