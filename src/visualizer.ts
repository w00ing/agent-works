import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js'

export type CodexEvent =
  | { type: 'spawn'; id: string; name?: string }
  | { type: 'work'; id: string; label?: string }
  | { type: 'idle'; id: string; label?: string }
  | { type: 'done'; id: string; label?: string }
  | { type: 'remove'; id: string }

export type VisualizerAssets = {
  heroFrames: HeroFrames[]
  hammerTexture: Texture
  doneTexture: Texture
}

type CodexState = 'idle' | 'working' | 'done'

type HeroFrames = {
  idle: Texture[]
  work: Texture[]
  done: Texture[]
}

const HERO_FRAME_SIZE = 16
const HERO_ROW_COUNT = 3
const ICON_SIZE = 16

const LABEL_STYLE_BASE = {
  fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
  fontSize: 12,
  fill: 0xcbd5f5,
  letterSpacing: 0.6,
}

const STATUS_STYLE_BASE = {
  fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
  fontSize: 10,
  fill: 0xaab4c4,
  letterSpacing: 0.4,
}

const LABEL_STYLE = new TextStyle(LABEL_STYLE_BASE)
const STATUS_STYLE = new TextStyle(STATUS_STYLE_BASE)

const STATUS_COLORS: Record<CodexState, number> = {
  idle: 0x9aa4b2,
  working: 0xf6c453,
  done: 0x8af28a,
}

const DEFAULT_STATUS: Record<CodexState, string> = {
  idle: 'IDLE',
  working: 'WORKING',
  done: 'DONE',
}

export async function loadVisualizerAssets(doneIconIndex = 0): Promise<VisualizerAssets> {
  await Assets.load([
    { alias: 'hero', src: '/assets/hero.png' },
    { alias: 'hammer', src: '/assets/hammer.png' },
    { alias: 'icons', src: '/assets/icons.png' },
  ])

  const heroSheet = Assets.get('hero') as Texture
  const hammerTexture = Assets.get('hammer') as Texture
  const iconsTexture = Assets.get('icons') as Texture

  setNearest(heroSheet)
  setNearest(hammerTexture)
  setNearest(iconsTexture)

  const heroFrames = buildHeroFrames(heroSheet)
  const doneTexture = pickIconTexture(iconsTexture, doneIconIndex)

  return { heroFrames, hammerTexture, doneTexture }
}

export class CodexVisualizer {
  private readonly app: Application
  private readonly world: Container
  private readonly background: Graphics
  private readonly ground: Graphics
  private readonly agentManager: AgentManager

  constructor(app: Application, assets: VisualizerAssets) {
    this.app = app
    this.world = new Container()
    this.background = new Graphics()
    this.ground = new Graphics()
    this.agentManager = new AgentManager(this.world, assets)

    this.app.stage.addChild(this.background)
    this.app.stage.addChild(this.ground)
    this.app.stage.addChild(this.world)

    this.resize(this.app.renderer.width, this.app.renderer.height)

    this.app.ticker.add((delta) => {
      this.agentManager.update(delta)
    })
  }

  emit(event: CodexEvent | CodexEvent[]): void {
    const events = Array.isArray(event) ? event : [event]

    for (const payload of events) {
      switch (payload.type) {
        case 'spawn':
          this.agentManager.spawn(payload.id, payload.name)
          break
        case 'work':
          this.agentManager.setState(payload.id, 'working', payload.label)
          break
        case 'idle':
          this.agentManager.setState(payload.id, 'idle', payload.label)
          break
        case 'done':
          this.agentManager.setState(payload.id, 'done', payload.label)
          break
        case 'remove':
          this.agentManager.remove(payload.id)
          break
        default:
          break
      }
    }
  }

  resize(width: number, height: number): void {
    drawBackground(this.background, width, height)
    drawGround(this.ground, width, height)
    this.agentManager.layout(width, height)
  }
}

class AgentManager {
  private readonly root: Container
  private readonly assets: VisualizerAssets
  private readonly agents = new Map<string, Agent>()
  private order: string[] = []
  private layoutSize = { width: 0, height: 0 }

  constructor(root: Container, assets: VisualizerAssets) {
    this.root = root
    this.assets = assets
  }

  spawn(id: string, name = 'Codex Agent'): void {
    const existing = this.agents.get(id)

    if (existing) {
      existing.setName(name)
      return
    }

    const availableRows = Math.max(1, this.assets.heroFrames.length)
    const rowIndex = this.order.length % availableRows
    const agent = new Agent(id, name, this.assets, rowIndex)

    this.agents.set(id, agent)
    this.order = [...this.order, id]
    this.root.addChild(agent.container)
    this.layout(this.layoutSize.width, this.layoutSize.height)
  }

  setState(id: string, state: CodexState, label?: string): void {
    const agent = this.agents.get(id)

    if (!agent) return

    agent.setState(state, label)
  }

  remove(id: string): void {
    const agent = this.agents.get(id)

    if (!agent) return

    agent.destroy()
    this.agents.delete(id)
    this.order = this.order.filter((entry) => entry !== id)
    this.layout(this.layoutSize.width, this.layoutSize.height)
  }

  layout(width: number, height: number): void {
    this.layoutSize = { width, height }

    if (width === 0 || height === 0) return

    const padding = 36
    const cellWidth = 160
    const cellHeight = 120
    const usableWidth = Math.max(1, width - padding * 2)
    const columns = Math.max(1, Math.floor(usableWidth / cellWidth))
    const groundY = Math.round(height * 0.72)

    this.order.forEach((id, index) => {
      const agent = this.agents.get(id)
      if (!agent) return

      const col = index % columns
      const row = Math.floor(index / columns)
      const x = padding + col * cellWidth + cellWidth * 0.5
      const y = groundY - row * cellHeight

      agent.setPosition(x, y)
    })
  }

  update(delta: number): void {
    for (const agent of this.agents.values()) {
      agent.update(delta)
    }
  }
}

class Agent {
  readonly id: string
  readonly container: Container

  private readonly sprite: AnimatedSprite
  private readonly emote: Sprite
  private readonly label: Text
  private readonly status: Text
  private readonly hammerTexture: Texture
  private readonly doneTexture: Texture
  private readonly idleFrames: Texture[]
  private readonly workFrames: Texture[]
  private readonly doneFrames: Texture[]

  private state: CodexState = 'idle'
  private time = 0

  constructor(id: string, name: string, assets: VisualizerAssets, rowIndex: number) {
    this.id = id
    this.container = new Container()

    const frames = assets.heroFrames[rowIndex] ?? assets.heroFrames[0]

    this.idleFrames = frames.idle
    this.workFrames = frames.work
    this.doneFrames = frames.done
    this.hammerTexture = assets.hammerTexture
    this.doneTexture = assets.doneTexture

    this.sprite = new AnimatedSprite(this.idleFrames)
    this.sprite.anchor.set(0.5, 1)
    this.sprite.animationSpeed = 0.08
    this.sprite.play()
    this.sprite.scale.set(3.2)

    this.emote = new Sprite(this.hammerTexture)
    this.emote.anchor.set(0.5, 1)
    this.emote.scale.set(0.2)
    this.emote.visible = false

    this.label = new Text({ text: name, style: LABEL_STYLE })
    this.label.anchor.set(0.5, 0)
    this.label.position.set(0, 10)

    this.status = new Text({ text: DEFAULT_STATUS.idle, style: STATUS_STYLE })
    this.status.anchor.set(0.5, 0)
    this.status.position.set(0, 26)

    this.container.addChild(this.sprite, this.emote, this.label, this.status)
  }

  setName(name: string): void {
    this.label.text = name
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y)
    this.updateEmotePosition()
  }

  setState(state: CodexState, label?: string): void {
    if (this.state === state && !label) return

    this.state = state

    if (state === 'idle') {
      this.sprite.textures = this.idleFrames
      this.sprite.animationSpeed = 0.08
      this.sprite.play()
      this.emote.visible = false
    }

    if (state === 'working') {
      this.sprite.textures = this.workFrames
      this.sprite.animationSpeed = 0.15
      this.sprite.play()
      this.emote.texture = this.hammerTexture
      this.emote.scale.set(0.2)
      this.emote.visible = true
    }

    if (state === 'done') {
      this.sprite.textures = this.doneFrames
      this.sprite.gotoAndStop(0)
      this.emote.texture = this.doneTexture
      this.emote.scale.set(2.4)
      this.emote.visible = true
    }

    this.status.text = label ?? DEFAULT_STATUS[state]
    this.status.style = new TextStyle({ ...STATUS_STYLE_BASE, fill: STATUS_COLORS[state] })
    this.updateEmotePosition()
  }

  update(delta: number): void {
    this.time += delta

    if (this.state === 'working') {
      const bob = Math.sin(this.time * 0.25) * 2
      const swing = Math.sin(this.time * 0.3) * 0.35
      this.sprite.y = -bob
      this.emote.rotation = swing
    } else {
      this.sprite.y = 0
      this.emote.rotation = 0
    }

    if (this.state === 'done') {
      const pulse = 1 + Math.sin(this.time * 0.15) * 0.08
      this.emote.scale.set(2.4 * pulse)
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }

  private updateEmotePosition(): void {
    const spriteHeight = this.sprite.height
    this.emote.position.set(0, -spriteHeight - 6)
    this.label.position.set(0, 12)
    this.status.position.set(0, 28)
  }
}

function buildHeroFrames(sheet: Texture): HeroFrames[] {
  const frames: HeroFrames[] = []

  const rowCount = Math.max(1, Math.floor(sheet.height / HERO_FRAME_SIZE))

  for (let row = 0; row < Math.min(HERO_ROW_COUNT, rowCount); row += 1) {
    const idle = [
      slice(sheet, 0, row, HERO_FRAME_SIZE),
      slice(sheet, 1, row, HERO_FRAME_SIZE),
    ]
    const work = [
      slice(sheet, 2, row, HERO_FRAME_SIZE),
      slice(sheet, 3, row, HERO_FRAME_SIZE),
    ]
    const done = [slice(sheet, 4, row, HERO_FRAME_SIZE)]

    frames.push({ idle, work, done })
  }

  return frames
}

function slice(sheet: Texture, column: number, row: number, size: number): Texture {
  const x = column * size
  const y = row * size

  return new Texture({
    source: sheet.source,
    frame: new Rectangle(x, y, size, size),
  })
}

function pickIconTexture(sheet: Texture, index: number): Texture {
  const columns = Math.max(1, Math.floor(sheet.width / ICON_SIZE))
  const rows = Math.max(1, Math.floor(sheet.height / ICON_SIZE))
  const maxIndex = columns * rows - 1
  const safeIndex = Math.min(Math.max(0, index), maxIndex)
  const col = safeIndex % columns
  const row = Math.floor(safeIndex / columns)

  return new Texture({
    source: sheet.source,
    frame: new Rectangle(col * ICON_SIZE, row * ICON_SIZE, ICON_SIZE, ICON_SIZE),
  })
}

function setNearest(texture: Texture): void {
  texture.source.style.scaleMode = 'nearest'
}

function drawBackground(graphics: Graphics, width: number, height: number): void {
  graphics.clear()
  graphics.beginFill(0x0a0f17)
  graphics.drawRect(0, 0, width, height)
  graphics.endFill()

  graphics.beginFill(0x0f1724)
  graphics.drawRect(0, height * 0.6, width, height * 0.4)
  graphics.endFill()
}

function drawGround(graphics: Graphics, width: number, height: number): void {
  graphics.clear()
  const groundY = Math.round(height * 0.6)

  graphics.beginFill(0x1b2535)
  graphics.drawRect(0, groundY, width, 6)
  graphics.endFill()
}
