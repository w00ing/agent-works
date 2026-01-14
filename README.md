# Codex Grove (2D Codex Process Visualizer)

A small PixiJS + TypeScript visualizer that turns Codex processes into 8-bit characters. Each agent animates while working and shows a completion emote when done.

## Quick start

```bash
bun install
bun run dev
```

Open the dev server URL printed by Vite.

## How it works

- **PixiJS** renders a simple 2D scene with pixel-art sprites.
- **Agents** are managed by a small state machine (`idle`, `working`, `done`).
- **Events** drive the visuals. You can emit events from the console or via WebSocket.

## Event API

```ts
type CodexEvent =
  | { type: 'spawn'; id: string; name?: string }
  | { type: 'work'; id: string; label?: string }
  | { type: 'idle'; id: string; label?: string }
  | { type: 'done'; id: string; label?: string }
  | { type: 'remove'; id: string }
```

### Emit events from the browser console

```js
window.codexViz.spawn('codex-1', 'Builder')
window.codexViz.work('codex-1', 'Compiling')
window.codexViz.done('codex-1', 'Complete')
window.codexViz.remove('codex-1')
```

### WebSocket bridge (optional)

Add `?ws=ws://localhost:8787` to the URL. The visualizer expects JSON messages containing either a single `CodexEvent` object or an array of events.

Example message payload:

```json
{"type":"spawn","id":"codex-2","name":"Planner"}
```

## URL options

- `?mock=0` - disable the built-in mock generator.
- `?ws=ws://localhost:8787` - stream events from a WebSocket server.
- `?icon=7` - select a different icon tile from `public/assets/icons.png`.

## Assets

Sprites are CC0 and sourced from OpenGameArt. See `ASSET_LICENSES.md`.

## Project layout

- `src/main.ts` - app bootstrap, mock generator, WebSocket bridge.
- `src/visualizer.ts` - Pixi scene, agent logic, asset slicing.
- `public/assets/` - sprite sheets and icons.
