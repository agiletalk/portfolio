// 원티드 수심대 안의 한 장면: 연도별 커밋을 기포 기둥으로.
// 기포 1개 = UNIT 커밋. 화면에 들어오면 해저에서 기포가 차오르며 기둥을 이루고,
// 그동안 총합이 카운트업된다. 기둥 꼭대기에서는 이따금 기포가 떨어져 나와 떠오른다.

import { dpr, fitCanvas } from '../../src/lib/motion'

export const UNIT = 20

interface Bubble { col: number; tx: number; ty: number; r: number; delay: number; wob: number }
interface Free { x: number; y: number; r: number; v: number; age: number; wob: number }

export interface CommitScene {
  resize(): void
  /** 연출 시작(한 번만). 끝나면 onDone */
  play(t: number): void
  step(dt: number, t: number): void
  draw(t: number): void
  /** 0..1 — 카운트업 진행도 */
  readonly progress: number
  readonly started: boolean
  finish(): void
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

export function createCommitScene(canvas: HTMLCanvasElement, byYear: { year: number; count: number }[]): CommitScene {
  const ctx = canvas.getContext('2d')
  let W = 1, H = 1, scale = dpr()
  let bubbles: Bubble[] = []
  const free: Free[] = []
  let start = -1
  let done = false
  let clock = 0
  let duration = 3
  let sprites: HTMLCanvasElement[] = []
  let lastEmit = 0
  let shrunk = false

  // 오래된 해(2015)는 깊은 청록, 최근(2026)은 밝은 발광색
  const colorFor = (i: number) => {
    const k = byYear.length > 1 ? i / (byYear.length - 1) : 1
    const a = [62, 150, 170], b = [160, 255, 240]
    return a.map((v, j) => Math.round(v + (b[j] - v) * k))
  }

  const makeSprite = (r: number, rgb: number[]) => {
    const s = document.createElement('canvas')
    const size = Math.ceil((r * 2 + 4) * scale)
    s.width = s.height = size
    const c = s.getContext('2d')
    if (!c) return s
    c.scale(scale, scale)
    const cx = r + 2
    const g = c.createRadialGradient(cx - r * 0.3, cx - r * 0.35, r * 0.1, cx, cx, r)
    g.addColorStop(0, `rgba(${rgb},0.05)`)
    g.addColorStop(0.75, `rgba(${rgb},0.16)`)
    g.addColorStop(1, `rgba(${rgb},0.5)`)
    c.fillStyle = g
    c.beginPath(); c.arc(cx, cx, r, 0, Math.PI * 2); c.fill()
    c.strokeStyle = `rgba(${rgb},0.85)`
    c.lineWidth = Math.max(0.6, r * 0.14)
    c.stroke()
    c.fillStyle = 'rgba(255,255,255,0.85)'
    c.beginPath(); c.arc(cx - r * 0.35, cx - r * 0.38, r * 0.22, 0, Math.PI * 2); c.fill()
    return s
  }

  const layout = () => {
    scale = dpr()
    fitCanvas(canvas, scale)
    W = canvas.clientWidth; H = canvas.clientHeight
    const cols = byYear.length
    const colW = W / cols
    const perRow = 3
    const maxN = Math.max(...byYear.map((y) => Math.ceil(y.count / UNIT)))
    const rows = Math.ceil(maxN / perRow)
    const byH = (H * 0.94) / (rows * 1.78 + 1)
    const byW = colW / (perRow * 2.5)
    const r = Math.max(1.6, Math.min(byH, byW, 7))
    const dx = r * 2.15, dy = r * 1.78
    sprites = byYear.map((_, i) => makeSprite(r, colorFor(i)))
    bubbles = []
    byYear.forEach((y, ci) => {
      const n = Math.ceil(y.count / UNIT)
      const cx = colW * (ci + 0.5)
      for (let k = 0; k < n; k++) {
        const row = Math.floor(k / perRow), slot = k % perRow
        const off = (slot - (perRow - 1) / 2) * dx + (row % 2 ? dx * 0.25 : -dx * 0.25)
        bubbles.push({
          col: ci,
          tx: cx + off + (Math.random() - 0.5) * r * 0.3,
          ty: H - r - 2 - row * dy,
          r,
          delay: ci * 0.11 + row * 0.03 + Math.random() * 0.12,
          wob: Math.random() * 10,
        })
      }
    })
    duration = Math.max(...bubbles.map((b) => b.delay)) + 1.3
    // 폭이 좁아 기포가 작아지면(모바일) 무대 높이를 기둥에 맞춰 줄인다
    const need = Math.ceil(rows * dy + r * 2 + 36)
    const stage = canvas.parentElement
    if (stage && need < H - 12 && !shrunk) { shrunk = true; stage.style.height = `${need}px`; layout() }
    else if (stage && shrunk && need >= H + 40) { shrunk = false; stage.style.height = ''; layout() }
  }
  layout()

  const RISE = 1.3

  return {
    resize: layout,
    play(t) { if (start < 0) start = t },
    finish() { done = true; start = 0 },
    get started() { return start >= 0 || done },
    get progress() {
      if (done) return 1
      if (start < 0) return 0
      return Math.min(1, (clock - start) / duration)
    },
    step(dt, t) {
      clock = t
      if (start >= 0 && !done && t - start > duration) done = true
      if (!done) return
      // 완성된 기둥 꼭대기에서 떨어져 나오는 기포
      if (t - lastEmit > 0.35) {
        lastEmit = t
        const ci = (Math.random() * byYear.length) | 0
        const top = bubbles.filter((b) => b.col === ci).reduce((m, b) => Math.min(m, b.ty), H)
        const r0 = bubbles[0]?.r ?? 3
        free.push({ x: (W / byYear.length) * (ci + 0.5), y: top - r0 * 2, r: r0 * (0.5 + Math.random() * 0.5), v: 18 + Math.random() * 20, age: 0, wob: Math.random() * 6 })
      }
      for (let i = free.length - 1; i >= 0; i--) {
        const f = free[i]
        f.age += dt; f.y -= f.v * dt; f.v += 8 * dt
        if (f.y < -10 || f.age > 6) free.splice(i, 1)
      }
    },
    draw(t) {
      if (!ctx) return
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const el = done ? Infinity : start < 0 ? -1 : t - start
      for (const b of bubbles) {
        const sprite = sprites[b.col]
        const s = sprite.width / scale
        let x = b.tx, y = b.ty, a = 1
        if (el !== Infinity) {
          const k = (el - b.delay) / RISE
          if (k <= 0) continue
          const e = easeOut(Math.min(1, k))
          y = H + b.r * 2 + (b.ty - H - b.r * 2) * e
          x = b.tx + Math.sin(k * 7 + b.wob) * b.r * 1.2 * (1 - e)
          a = Math.min(1, k * 3)
        }
        // 정착한 기포도 아주 살짝 흔들린다
        x += Math.sin(t * 1.3 + b.wob) * b.r * 0.12
        y += Math.cos(t * 1.1 + b.wob) * b.r * 0.1
        ctx.globalAlpha = a
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s)
      }
      const last = sprites[sprites.length - 1]
      for (const f of free) {
        const s = (last?.width ?? 0) / scale * (f.r / (bubbles[0]?.r ?? 1))
        ctx.globalAlpha = Math.max(0, 0.8 - f.age * 0.13)
        if (last) ctx.drawImage(last, f.x + Math.sin(f.age * 3 + f.wob) * 4 - s / 2, f.y - s / 2, s, s)
      }
      ctx.globalAlpha = 1
    },
  }
}
