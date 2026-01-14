import './style.css'
import { Application } from 'pixi.js'
import { CodexVisualizer, loadVisualizerAssets, type CodexEvent } from './visualizer'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('Missing #app container')
}

const params = new URLSearchParams(window.location.search)
const mockEnabled = params.get('mock') !== '0'
const doneIconIndex = Number(params.get('icon') ?? 0)
const wsUrl = params.get('ws')

const app = new Application()
await app.init({
  antialias: false,
  backgroundColor: 0x0a0f17,
})

app.renderer.roundPixels = true
appRoot.prepend(app.canvas)

const assets = await loadVisualizerAssets(Number.isFinite(doneIconIndex) ? doneIconIndex : 0)
const visualizer = new CodexVisualizer(app, assets)

const resize = () => {
  app.renderer.resize(window.innerWidth, window.innerHeight)
  visualizer.resize(app.renderer.width, app.renderer.height)
}

resize()
window.addEventListener('resize', resize)

updateHud(mockEnabled, wsUrl ?? undefined)

const emit = (event: CodexEvent | CodexEvent[]) => visualizer.emit(event)

;(window as any).codexViz = {
  emit,
  spawn: (id: string, name?: string) => emit({ type: 'spawn', id, name }),
  work: (id: string, label?: string) => emit({ type: 'work', id, label }),
  idle: (id: string, label?: string) => emit({ type: 'idle', id, label }),
  done: (id: string, label?: string) => emit({ type: 'done', id, label }),
  remove: (id: string) => emit({ type: 'remove', id }),
}

if (mockEnabled) {
  startMock(visualizer)
}

if (wsUrl) {
  connectWebSocket(visualizer, wsUrl)
}

function startMock(target: CodexVisualizer): void {
  let counter = 1
  const active = new Set<string>()

  const spawnAgent = () => {
    const id = `codex-${counter}`
    const name = `Codex ${counter}`
    counter += 1

    active.add(id)
    target.emit({ type: 'spawn', id, name })

    window.setTimeout(() => {
      target.emit({ type: 'work', id, label: 'Building' })
    }, 500)

    window.setTimeout(() => {
      target.emit({ type: 'done', id, label: 'Complete' })
    }, 3800)

    window.setTimeout(() => {
      target.emit({ type: 'remove', id })
      active.delete(id)
    }, 6400)
  }

  spawnAgent()

  window.setInterval(() => {
    if (active.size < 6) {
      spawnAgent()
    }
  }, 2200)
}

function connectWebSocket(target: CodexVisualizer, url: string): void {
  const status = document.querySelector<HTMLSpanElement>('#hud-ws')

  const socket = new WebSocket(url)

  socket.addEventListener('open', () => {
    if (status) status.textContent = 'connected'
  })

  socket.addEventListener('close', () => {
    if (status) status.textContent = 'disconnected'
  })

  socket.addEventListener('error', () => {
    if (status) status.textContent = 'error'
  })

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data as string) as CodexEvent | CodexEvent[]
      target.emit(payload)
    } catch (error) {
      console.warn('Invalid Codex event payload', error)
    }
  })
}

function updateHud(mockEnabled: boolean, wsUrl?: string): void {
  const mockStatus = document.querySelector<HTMLSpanElement>('#hud-mock')
  const wsStatus = document.querySelector<HTMLSpanElement>('#hud-ws')

  if (mockStatus) {
    mockStatus.textContent = mockEnabled ? 'on' : 'off'
  }

  if (wsStatus) {
    wsStatus.textContent = wsUrl ? 'connecting' : 'disabled'
  }
}
