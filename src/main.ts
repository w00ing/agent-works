import './style.css'
import Phaser from 'phaser'
import { CodexScene, type CodexEvent } from './visualizer'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('Missing #app container')
}

const params = new URLSearchParams(window.location.search)
const mockEnabled = params.get('mock') !== '0'
const doneIconIndex = Number(params.get('icon') ?? 0)
const wsUrl = params.get('ws')

const scene = new CodexScene(Number.isFinite(doneIconIndex) ? doneIconIndex : 0)

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: appRoot,
  backgroundColor: '#0a0f17',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [scene],
})

game.events.once(Phaser.Core.Events.READY, () => {
  const activeScene = game.scene.getScene('CodexScene') as CodexScene

  const emit = (event: CodexEvent | CodexEvent[]) => activeScene.emit(event)

  ;(window as any).codexViz = {
    emit,
    spawn: (id: string, name?: string) => emit({ type: 'spawn', id, name }),
    work: (id: string, label?: string) => emit({ type: 'work', id, label }),
    idle: (id: string, label?: string) => emit({ type: 'idle', id, label }),
    done: (id: string, label?: string) => emit({ type: 'done', id, label }),
    remove: (id: string) => emit({ type: 'remove', id }),
  }

  updateHud(mockEnabled, wsUrl ?? undefined)

  if (mockEnabled) {
    startMock(activeScene)
  }

  if (wsUrl) {
    connectWebSocket(activeScene, wsUrl)
  }
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true)
  })
}

function startMock(target: CodexScene): void {
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

function connectWebSocket(target: CodexScene, url: string): void {
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
