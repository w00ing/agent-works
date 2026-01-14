import Phaser from 'phaser'

export type CodexEvent =
  | { type: 'spawn'; id: string; name?: string }
  | { type: 'work'; id: string; label?: string }
  | { type: 'idle'; id: string; label?: string }
  | { type: 'done'; id: string; label?: string }
  | { type: 'remove'; id: string }

type CodexState = 'idle' | 'working' | 'done'

type HeroLayout = {
  columns: number
  rows: number
}

const HERO_FRAME_SIZE = 16
const HERO_MAX_ROWS = 3
const ICON_SIZE = 16
const SPRITE_SCALE = 3
const HAMMER_SCALE = 0.22
const DONE_ICON_SCALE = 2.2
const HUD_WIDTH = 260
const HUD_PADDING = 16
const EMBER_COUNT = 22

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
  fontSize: '12px',
  color: '#cbd5f5',
  letterSpacing: '0.6px',
}

const STATUS_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
  fontSize: '10px',
  color: '#aab4c4',
  letterSpacing: '0.4px',
}

const STATUS_COLORS: Record<CodexState, string> = {
  idle: '#9aa4b2',
  working: '#f6c453',
  done: '#8af28a',
}

const DEFAULT_STATUS: Record<CodexState, string> = {
  idle: 'IDLE',
  working: 'WORKING',
  done: 'DONE',
}

type Summary = {
  total: number
  working: number
  idle: number
  done: number
}

export class CodexScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Graphics
  private ground?: Phaser.GameObjects.Graphics
  private glowLeft?: Phaser.GameObjects.Image
  private glowRight?: Phaser.GameObjects.Image
  private emberField?: EmberField
  private hud?: GameHud
  private agentManager?: AgentManager
  private heroLayout: HeroLayout = { columns: 1, rows: 1 }
  private doneIconIndex = 0
  private lastSummary?: Summary

  constructor(doneIconIndex = 0) {
    super('CodexScene')
    this.doneIconIndex = doneIconIndex
  }

  preload(): void {
    this.load.spritesheet('hero', 'assets/hero.png', {
      frameWidth: HERO_FRAME_SIZE,
      frameHeight: HERO_FRAME_SIZE,
    })
    this.load.image('hammer', 'assets/hammer.png')
    this.load.spritesheet('icons', 'assets/icons.png', {
      frameWidth: ICON_SIZE,
      frameHeight: ICON_SIZE,
    })
  }

  create(): void {
    this.background = this.add.graphics()
    this.ground = this.add.graphics()
    this.background.setDepth(0)
    this.ground.setDepth(4)

    ensureGlowTexture(this, 'forge-glow', 256, '#f9b24b', 'rgba(249, 178, 75, 0)')
    ensureGlowTexture(this, 'forge-glow-blue', 220, '#6aa9ff', 'rgba(106, 169, 255, 0)')
    ensureEmberTexture(this, 'ember')

    this.glowLeft = this.add.image(0, 0, 'forge-glow')
    this.glowLeft.setBlendMode(Phaser.BlendModes.ADD)
    this.glowLeft.setAlpha(0.55)
    this.glowLeft.setDepth(1)

    this.glowRight = this.add.image(0, 0, 'forge-glow-blue')
    this.glowRight.setBlendMode(Phaser.BlendModes.ADD)
    this.glowRight.setAlpha(0.2)
    this.glowRight.setDepth(1)

    this.emberField = new EmberField(this, EMBER_COUNT)
    this.hud = new GameHud(this)

    this.heroLayout = resolveHeroLayout(this)
    this.createAnimations()

    this.agentManager = new AgentManager(this, {
      heroLayout: this.heroLayout,
      doneIconIndex: this.doneIconIndex,
    })

    this.resize(this.scale.width, this.scale.height)
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.resize(gameSize.width, gameSize.height)
    })
  }

  update(_time: number, delta: number): void {
    this.agentManager?.update(delta)
    this.emberField?.update(delta)
    const summary = this.agentManager?.getSummary()

    if (summary && !summariesEqual(summary, this.lastSummary)) {
      this.hud?.setSummary(summary)
      this.lastSummary = summary
    }
  }

  emit(event: CodexEvent | CodexEvent[]): void {
    if (!this.agentManager) return

    const events = Array.isArray(event) ? event : [event]
    let lastEvent: CodexEvent | undefined

    for (const payload of events) {
      lastEvent = payload
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

    if (lastEvent) {
      this.hud?.setLastEvent(formatEvent(lastEvent))
    }
  }

  private resize(width: number, height: number): void {
    if (!this.background || !this.ground || !this.agentManager) return

    drawBackground(this.background, width, height)
    drawGround(this.ground, width, height)
    this.agentManager.layout(width, height)
    this.emberField?.resize(width, height)
    this.hud?.resize(width, height)

    if (this.glowLeft) {
      this.glowLeft.setPosition(width * 0.22, height * 0.68)
      this.glowLeft.setScale(1.4)
    }

    if (this.glowRight) {
      this.glowRight.setPosition(width * 0.82, height * 0.4)
      this.glowRight.setScale(1.1)
    }
  }

  private createAnimations(): void {
    const rows = Math.min(this.heroLayout.rows, HERO_MAX_ROWS)
    const columns = this.heroLayout.columns

    for (let row = 0; row < rows; row += 1) {
      const idleKey = `hero-idle-${row}`
      const workKey = `hero-work-${row}`
      const doneKey = `hero-done-${row}`

      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: frameNumbers(row, [0, 1]),
          frameRate: 6,
          repeat: -1,
        })
      }

      if (!this.anims.exists(workKey)) {
        this.anims.create({
          key: workKey,
          frames: frameNumbers(row, [2, 3]),
          frameRate: 6,
          repeat: -1,
        })
      }

      if (!this.anims.exists(doneKey)) {
        this.anims.create({
          key: doneKey,
          frames: frameNumbers(row, [4]),
          frameRate: 1,
          repeat: -1,
        })
      }
    }

    function frameNumbers(row: number, cols: number[]): Phaser.Types.Animations.AnimationFrame[] {
      return cols.map((col) => ({ key: 'hero', frame: row * columns + col }))
    }
  }
}

type AgentManagerConfig = {
  heroLayout: HeroLayout
  doneIconIndex: number
}

class AgentManager {
  private readonly scene: Phaser.Scene
  private readonly heroLayout: HeroLayout
  private readonly doneIconIndex: number
  private readonly agents = new Map<string, Agent>()
  private readonly stateById = new Map<string, CodexState>()
  private order: string[] = []
  private layoutSize = { width: 0, height: 0 }

  constructor(scene: Phaser.Scene, config: AgentManagerConfig) {
    this.scene = scene
    this.heroLayout = config.heroLayout
    this.doneIconIndex = config.doneIconIndex
  }

  spawn(id: string, name = 'Codex Agent'): void {
    const existing = this.agents.get(id)

    if (existing) {
      existing.setName(name)
      return
    }

    const availableRows = Math.max(1, Math.min(HERO_MAX_ROWS, this.heroLayout.rows))
    const rowIndex = this.order.length % availableRows
    const agent = new Agent(this.scene, {
      id,
      name,
      rowIndex,
      columns: this.heroLayout.columns,
      doneIconIndex: this.doneIconIndex,
    })

    this.agents.set(id, agent)
    this.stateById.set(id, 'idle')
    this.order = [...this.order, id]
    this.layout(this.layoutSize.width, this.layoutSize.height)
  }

  setState(id: string, state: CodexState, label?: string): void {
    const agent = this.agents.get(id)
    if (!agent) return

    agent.setState(state, label)
    this.stateById.set(id, state)
  }

  remove(id: string): void {
    const agent = this.agents.get(id)
    if (!agent) return

    agent.destroy()
    this.agents.delete(id)
    this.stateById.delete(id)
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
      const x = Math.round(padding + col * cellWidth + cellWidth * 0.5)
      const y = Math.round(groundY - row * cellHeight)

      agent.setPosition(x, y)
    })
  }

  update(delta: number): void {
    for (const agent of this.agents.values()) {
      agent.update(delta)
    }
  }

  getSummary(): Summary {
    let working = 0
    let done = 0
    let idle = 0

    for (const state of this.stateById.values()) {
      if (state === 'working') working += 1
      if (state === 'done') done += 1
      if (state === 'idle') idle += 1
    }

    return {
      total: this.stateById.size,
      working,
      idle,
      done,
    }
  }
}

type AgentConfig = {
  id: string
  name: string
  rowIndex: number
  columns: number
  doneIconIndex: number
}

class Agent {
  readonly id: string
  private readonly scene: Phaser.Scene
  private readonly container: Phaser.GameObjects.Container
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly hammer: Phaser.GameObjects.Image
  private readonly doneIcon: Phaser.GameObjects.Image
  private readonly spark: Phaser.GameObjects.Container
  private readonly label: Phaser.GameObjects.Text
  private readonly status: Phaser.GameObjects.Text

  private state: CodexState = 'idle'
  private time = 0
  private emoteBaseY = 0
  private sparkBaseY = 0
  private rowIndex = 0
  private columns = 1

  constructor(scene: Phaser.Scene, config: AgentConfig) {
    this.scene = scene
    this.id = config.id
    this.rowIndex = config.rowIndex
    this.columns = config.columns

    this.sprite = scene.add.sprite(0, 0, 'hero', frameIndex(config.rowIndex, 0, this.columns))
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setScale(SPRITE_SCALE)

    this.hammer = scene.add.image(0, 0, 'hammer')
    this.hammer.setOrigin(0.5, 1)
    this.hammer.setScale(HAMMER_SCALE)

    this.doneIcon = scene.add.image(0, 0, 'icons', config.doneIconIndex)
    this.doneIcon.setOrigin(0.5, 1)
    this.doneIcon.setScale(DONE_ICON_SCALE)

    this.spark = createSpark(scene)

    this.label = scene.add.text(0, 10, config.name, LABEL_STYLE)
    this.label.setOrigin(0.5, 0)

    this.status = scene.add.text(0, 26, DEFAULT_STATUS.idle, STATUS_STYLE)
    this.status.setOrigin(0.5, 0)

    this.container = scene.add.container(0, 0, [
      this.sprite,
      this.hammer,
      this.doneIcon,
      this.spark,
      this.label,
      this.status,
    ])
    this.container.setDepth(5)

    this.setState('idle')
    this.updateEmotePosition()
  }

  setName(name: string): void {
    this.label.setText(name)
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y)
    this.updateEmotePosition()
  }

  setState(state: CodexState, label?: string): void {
    this.state = state

    if (state === 'idle') {
      this.sprite.play({ key: `hero-idle-${this.rowIndex}` })
      this.hammer.setVisible(false)
      this.doneIcon.setVisible(false)
      this.spark.setVisible(false)
    }

    if (state === 'working') {
      this.sprite.play({ key: `hero-work-${this.rowIndex}` })
      this.hammer.setVisible(true)
      this.doneIcon.setVisible(false)
      this.spark.setVisible(true)
    }

    if (state === 'done') {
      this.sprite.play({ key: `hero-done-${this.rowIndex}` })
      this.hammer.setVisible(false)
      this.doneIcon.setVisible(true)
      this.spark.setVisible(false)
    }

    this.status.setText(label ?? DEFAULT_STATUS[state])
    this.status.setColor(STATUS_COLORS[state])
  }

  update(delta: number): void {
    this.time += delta

    if (this.state === 'working') {
      const bob = Math.round(Math.sin(this.time * 0.01) * 2)
      this.sprite.y = -bob
      this.hammer.y = this.emoteBaseY
      this.spark.y = this.sparkBaseY
      this.spark.setAlpha(0.6 + Math.sin(this.time * 0.06) * 0.4)
    } else {
      this.sprite.y = 0
      this.hammer.y = this.emoteBaseY
      this.spark.y = this.sparkBaseY
      this.spark.setAlpha(1)
    }
  }

  destroy(): void {
    this.container.destroy(true)
  }

  private updateEmotePosition(): void {
    const spriteHeight = this.sprite.displayHeight
    this.emoteBaseY = -spriteHeight - 6
    this.sparkBaseY = -spriteHeight - 18
    this.hammer.setPosition(0, this.emoteBaseY)
    this.doneIcon.setPosition(0, this.emoteBaseY)
    this.spark.setPosition(12, this.sparkBaseY)
    this.label.setPosition(0, 12)
    this.status.setPosition(0, 28)
  }
}

class EmberField {
  private readonly scene: Phaser.Scene
  private readonly embers: Array<{
    sprite: Phaser.GameObjects.Image
    speed: number
    drift: number
  }> = []
  private bounds = { width: 0, height: 0 }

  constructor(scene: Phaser.Scene, count: number) {
    this.scene = scene

    for (let i = 0; i < count; i += 1) {
      const sprite = scene.add.image(0, 0, 'ember')
      sprite.setBlendMode(Phaser.BlendModes.ADD)
      sprite.setAlpha(0.5 + Math.random() * 0.4)
      sprite.setScale(0.6 + Math.random() * 0.9)
      sprite.setDepth(2)

      this.embers.push({
        sprite,
        speed: 0.015 + Math.random() * 0.04,
        drift: (Math.random() - 0.5) * 0.02,
      })
    }
  }

  resize(width: number, height: number): void {
    this.bounds = { width, height }
    for (const ember of this.embers) {
      this.reset(ember)
    }
  }

  update(delta: number): void {
    for (const ember of this.embers) {
      ember.sprite.y -= ember.speed * delta * 10
      ember.sprite.x += ember.drift * delta * 10

      if (ember.sprite.y < this.bounds.height * 0.3) {
        this.reset(ember)
      }
    }
  }

  private reset(ember: { sprite: Phaser.GameObjects.Image; speed: number; drift: number }): void {
    ember.sprite.x = Math.random() * this.bounds.width
    ember.sprite.y = this.bounds.height * (0.7 + Math.random() * 0.4)
    ember.sprite.setAlpha(0.4 + Math.random() * 0.5)
  }
}

class GameHud {
  private readonly scene: Phaser.Scene
  private readonly container: Phaser.GameObjects.Container
  private readonly panel: Phaser.GameObjects.Graphics
  private readonly title: Phaser.GameObjects.Text
  private readonly subtitle: Phaser.GameObjects.Text
  private readonly stats: Phaser.GameObjects.Text
  private readonly lastEvent: Phaser.GameObjects.Text
  private summary: Summary = { total: 0, working: 0, idle: 0, done: 0 }

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.panel = scene.add.graphics()
    this.title = scene.add.text(0, 0, 'Workshop Board', {
      fontFamily: 'Menlo, Monaco, Consolas, \"Courier New\", monospace',
      fontSize: '12px',
      color: '#f5d7a1',
      letterSpacing: '1.2px',
    })
    this.subtitle = scene.add.text(0, 0, 'Codex Grove', {
      fontFamily: 'Menlo, Monaco, Consolas, \"Courier New\", monospace',
      fontSize: '10px',
      color: '#caa676',
      letterSpacing: '0.8px',
    })
    this.stats = scene.add.text(0, 0, '', {
      fontFamily: 'Menlo, Monaco, Consolas, \"Courier New\", monospace',
      fontSize: '11px',
      color: '#f0e4d6',
      lineSpacing: 6,
    })
    this.lastEvent = scene.add.text(0, 0, '', {
      fontFamily: 'Menlo, Monaco, Consolas, \"Courier New\", monospace',
      fontSize: '10px',
      color: '#d5c4b0',
      lineSpacing: 4,
    })

    this.container = scene.add.container(0, 0, [
      this.panel,
      this.title,
      this.subtitle,
      this.stats,
      this.lastEvent,
    ])
    this.container.setDepth(20)
    this.container.setScrollFactor(0)

    this.setSummary(this.summary)
    this.setLastEvent('Awaiting tasks...')
  }

  resize(width: number, _height: number): void {
    this.container.setPosition(Math.max(20, width - HUD_WIDTH - 20), 20)
    this.layout()
  }

  setSummary(summary: Summary): void {
    this.summary = summary
    this.stats.setText([
      `Agents: ${summary.total}`,
      `Working: ${summary.working}   Idle: ${summary.idle}`,
      `Done: ${summary.done}`,
    ])
    this.layout()
  }

  setLastEvent(text: string): void {
    this.lastEvent.setText(text)
    this.layout()
  }

  private layout(): void {
    const titleHeight = this.title.height
    const subtitleHeight = this.subtitle.height
    const statsHeight = this.stats.height
    const eventHeight = this.lastEvent.height
    const panelHeight = HUD_PADDING * 2 + titleHeight + subtitleHeight + statsHeight + eventHeight + 18

    this.panel.clear()
    drawHudPanel(this.panel, HUD_WIDTH, panelHeight)

    const startX = HUD_PADDING
    let cursorY = HUD_PADDING
    this.title.setPosition(startX, cursorY)
    cursorY += titleHeight + 2
    this.subtitle.setPosition(startX, cursorY)
    cursorY += subtitleHeight + 10
    this.stats.setPosition(startX, cursorY)
    cursorY += statsHeight + 8
    this.lastEvent.setPosition(startX, cursorY)
  }
}

function frameIndex(row: number, col: number, columns: number): number {
  return row * columns + col
}

function resolveHeroLayout(scene: Phaser.Scene): HeroLayout {
  const image = scene.textures.get('hero').getSourceImage() as HTMLImageElement
  const columns = Math.max(1, Math.floor(image.width / HERO_FRAME_SIZE))
  const rows = Math.max(1, Math.floor(image.height / HERO_FRAME_SIZE))

  return { columns, rows }
}

function drawBackground(graphics: Phaser.GameObjects.Graphics, width: number, height: number): void {
  graphics.clear()
  graphics.fillStyle(0x0b1119, 1)
  graphics.fillRect(0, 0, width, height)
  graphics.fillStyle(0x111a26, 1)
  graphics.fillRect(0, height * 0.38, width, height * 0.62)
  graphics.fillStyle(0x1a1612, 0.95)
  graphics.fillRect(0, height * 0.6, width, height * 0.4)
  graphics.fillStyle(0x2b1e12, 0.15)
  graphics.fillRect(0, height * 0.48, width, height * 0.18)
}

function drawGround(graphics: Phaser.GameObjects.Graphics, width: number, height: number): void {
  graphics.clear()
  const groundY = Math.round(height * 0.6)
  graphics.fillStyle(0x26190f, 1)
  graphics.fillRect(0, groundY, width, height - groundY)
  graphics.fillStyle(0x3a2618, 1)
  graphics.fillRect(0, groundY, width, 8)

  graphics.lineStyle(1, 0x3f2c1c, 0.5)
  for (let x = 0; x < width; x += 32) {
    graphics.lineBetween(x, groundY, x, height)
  }
}

function drawHudPanel(graphics: Phaser.GameObjects.Graphics, width: number, height: number): void {
  graphics.clear()
  graphics.fillStyle(0x2a1c12, 0.96)
  graphics.fillRoundedRect(0, 0, width, height, 12)
  graphics.lineStyle(2, 0x6b4b2a, 1)
  graphics.strokeRoundedRect(0, 0, width, height, 12)
  graphics.fillStyle(0x3d2a1b, 0.9)
  graphics.fillRect(0, 26, width, 2)
  graphics.fillStyle(0x6b4b2a, 1)
  graphics.fillCircle(10, 10, 3)
  graphics.fillCircle(width - 10, 10, 3)
}

function ensureGlowTexture(scene: Phaser.Scene, key: string, size: number, inner: string, outer: string): void {
  if (scene.textures.exists(key)) return

  const canvas = scene.textures.createCanvas(key, size, size)
  const context = canvas.getContext()
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, inner)
  gradient.addColorStop(1, outer)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  canvas.refresh()
}

function ensureEmberTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return

  const size = 16
  const canvas = scene.textures.createCanvas(key, size, size)
  const context = canvas.getContext()
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 214, 126, 0.9)')
  gradient.addColorStop(1, 'rgba(255, 214, 126, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  canvas.refresh()
}

function summariesEqual(a: Summary, b?: Summary): boolean {
  if (!b) return false
  return a.total === b.total && a.working === b.working && a.idle === b.idle && a.done === b.done
}

function formatEvent(event: CodexEvent): string {
  if (event.type === 'spawn') {
    return `Spawned ${event.name ?? event.id}`
  }

  if (event.type === 'remove') {
    return `Removed ${event.id}`
  }

  const label = event.label ? ` - ${event.label}` : ''
  return `${event.id} ${event.type.toUpperCase()}${label}`
}

function createSpark(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const core = scene.add.rectangle(0, 0, 4, 4, 0xfbd87a)
  const shard = scene.add.rectangle(6, -6, 3, 3, 0xf6c453)
  core.setOrigin(0.5, 0.5)
  shard.setOrigin(0.5, 0.5)

  return scene.add.container(0, 0, [core, shard])
}
