/* node server/src/scripts/sendUserMessage.cjs ["text"] [host:port]

   Connects to the Zendia WS at /stream, sends one user_message, then
   waits for the server to broadcast it back as a message_new and prints
   the round-trip. Use this to verify the client-event protocol layer
   without spinning up the PWA.

   Defaults: text="hello from cjs", host=localhost:8910

   Exit codes:
     0  message round-tripped within 3s
     1  WS error
     2  timed out before echo
*/
const WebSocket = require('ws')
const { randomUUID } = require('node:crypto')

const text = process.argv[2] || 'hello from cjs'
const hostport = process.argv[3] || 'localhost:8910'
const url = `ws://${hostport}/stream`
const clientMsgId = randomUUID()

console.log(`[chat-smoke] connecting ${url}`)
console.log(`[chat-smoke] will send text=${JSON.stringify(text)} clientMsgId=${clientMsgId}`)

const ws = new WebSocket(url)
let sentAt = 0

const timer = setTimeout(() => {
  console.error('[chat-smoke] TIMEOUT — no echo within 3000ms')
  ws.close()
  process.exit(2)
}, 3000)

ws.on('open', () => {
  sentAt = Date.now()
  ws.send(JSON.stringify({ type: 'user_message', text, clientMsgId }))
  console.log('[chat-smoke] sent user_message')
})

ws.on('message', (raw) => {
  let evt
  try {
    evt = JSON.parse(raw.toString())
  } catch {
    return
  }
  if (evt.type !== 'message_new') return
  if (evt.message?.id !== clientMsgId) return
  const rttMs = Date.now() - sentAt
  console.log(`[chat-smoke] ECHO received in ${rttMs}ms:`)
  console.log(`  type=${evt.message.type} text=${JSON.stringify(evt.message.text)} status=${evt.message.status}`)
  clearTimeout(timer)
  ws.close()
  process.exit(0)
})

ws.on('error', (err) => {
  console.error('[chat-smoke] WS error:', err.message)
  clearTimeout(timer)
  process.exit(1)
})
