# Zendia Web

Mobile-first React PWA for the Zendia player.

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

The dev server uses Vite. In normal development it connects to the backend
WebSocket at `/stream` and API routes at `/api/*`.

Set `VITE_USE_MOCK=true` to run the in-browser mock stream without the Node
server.
