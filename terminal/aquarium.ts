// A living ASCII aquarium on a Canvas2D character grid.
// Fish are project glyphs (mirrored to swim the other way), bubbles rise and
// grow, seaweed sways, the cursor leaves water ripples that bend nearby glyphs,
// and a tap drops food that fish race to.

import { createLoop, dpr, fitCanvas, pick, prefersReducedMotion } from '../src/lib/motion'
import { onThemeChange, type Scheme } from '../src/theme'

export interface Species {
  glyph: string
  name: string
}

interface Fish {
  right: string
  left: string
  len: number
  name: string
  x: number // center, in columns
  y: number // row
  vx: number
  dir: 1 | -1
  ty: number
  base: number
  z: number // depth 0.55..1 (alpha + speed)
  color: number // index into the theme's fish palette
  phase: number
  nextWander: number
  startle: number
  label: number // 0..1 name-tag visibility
}

interface Bubble { x: number; y: number; y0: number; vy: number; phase: number }
interface Pop { x: number; y: number; age: number }
interface Food { x: number; y: number; vy: number; phase: number; settled: number; ch: string }
interface Ripple { x: number; y: number; t0: number; amp: number }
interface Weed { col: number; h: number; phase: number; color: number }
interface Speck { x: number; y: number; vx: number; vy: number; ch: string; a: number }

const MIRROR: Record<string, string> = { '<': '>', '>': '<', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '/': '\\', '\\': '/' }
export function mirror(s: string): string {
  return Array.from(s).reverse().map((c) => MIRROR[c] ?? c).join('')
}

/** Which way does a glyph face? Eye position decides; otherwise the nose. */
function facesRight(g: string): boolean {
  const chars = Array.from(g)
  const eye = chars.findIndex((c) => c === 'º' || c === '°' || c === 'o' || c === '@')
  if (eye >= 0) return eye >= (chars.length - 1) / 2
  if (chars[0] === '<') return false
  return true
}

interface Palette {
  fish: string[]
  weeds: string[]
  sand: string
  water: string // specks + troughs of the ripple layer
  crest: string // crests of the ripple layer
  surface: string
  label: string
  bubble: string
  pop: string
  food: string
  /** alpha for a fish at depth z (0.5..1) */
  fishAlpha(z: number): number
  /** multiplier for faint layers (specks, ripples, sand top) */
  faint: number
  bubbleAlpha: number
}

// dark: the original glow-on-black colors, unchanged
const DARK: Palette = {
  fish: ['#f2c46d', '#7ee0b5', '#82b8ff', '#f5a3c7', '#b9a2ff', '#ffd29b', '#9fe3ff', '#ff9f8f'],
  weeds: ['#4fae7c', '#5fbf8a', '#3f9a6d', '#6fcf97'],
  sand: '#b59a6a',
  water: '#7fb6c9',
  crest: '#9fe3ff',
  surface: '#9fd4e6',
  label: '#dfe4ea',
  bubble: '#bfe9f7',
  pop: '#e8f8ff',
  food: '#f2c46d',
  fishAlpha: (z) => 0.35 + z * 0.65,
  faint: 1,
  bubbleAlpha: 0.75,
}

// light: ink on a pale aqua/paper tank; every glyph color ≥ 3:1 on the tank
const LIGHT: Palette = {
  fish: ['#8F5300', '#17704C', '#2356A3', '#A8336A', '#6343B8', '#9A4A12', '#0B6683', '#A93A2A'],
  weeds: ['#2F7350', '#3A805A', '#245F44', '#3F8058'],
  sand: '#7D6236',
  water: '#3A7489',
  crest: '#1F6A85',
  surface: '#2F7590',
  label: '#2C2825',
  bubble: '#2F7590',
  pop: '#2A6F88',
  food: '#8F5300',
  fishAlpha: (z) => 0.6 + z * 0.4,
  faint: 1.35,
  bubbleAlpha: 0.8,
}
const RAMP = ['.', '·', ':', '-', '~', '=', '≈']

export interface Aquarium {
  destroy(): void
}

export function createAquarium(
  canvas: HTMLCanvasElement,
  species: Species[],
  onGrid?: (cols: number, rows: number) => void,
): Aquarium {
  const ctx = canvas.getContext('2d')!
  let C: Palette = DARK
  const reduced = prefersReducedMotion()
  let fontSize = 14
  let cw = 8.4
  let chh = 18
  let cols = 80
  let rows = 24
  let ox = 0
  let oy = 0
  let W = 0
  let H = 0

  let fish: Fish[] = []
  let bubbles: Bubble[] = []
  let pops: Pop[] = []
  let food: Food[] = []
  let ripples: Ripple[] = []
  let weeds: Weed[] = []
  let specks: Speck[] = []
  let sandRow: string[] = []
  let sandTop: string[] = []
  let t = 0
  let nextBubble = 0
  // pointer state, in cell units
  const ptr = { x: -99, y: -99, inside: false, energy: 0, lastEmit: 0, ex: -99, ey: -99 }

  const rand = (a: number, b: number) => a + Math.random() * (b - a)
  const aspect = () => chh / cw

  function measure() {
    W = canvas.clientWidth
    H = canvas.clientHeight
    fontSize = W < 520 ? 13 : W > 1100 ? 17 : 15
    ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`
    cw = ctx.measureText('M').width || fontSize * 0.6
    chh = Math.round(fontSize * 1.34)
    cols = Math.max(20, Math.floor(W / cw))
    rows = Math.max(10, Math.floor(H / chh))
    ox = (W - cols * cw) / 2
    oy = (H - rows * chh) / 2
  }

  let laidCols = -1
  function layout(first: boolean) {
    if (!first && cols === laidCols) {
      for (const w of weeds) w.h = Math.min(w.h, Math.max(3, rows - 4))
      for (const s of specks) s.y = Math.min(s.y, rows - 2.5)
      for (const f of fish) { f.y = Math.min(f.y, rows - 4); f.ty = Math.min(f.ty, rows - 4) }
    } else regenerate(first)
    laidCols = cols
    onGrid?.(cols, rows)
  }

  function regenerate(first: boolean) {
    // seaweed clumps, spaced so they don't touch
    weeds = []
    const n = Math.max(3, Math.round(cols / 11))
    for (let i = 0; i < n; i++) {
      const col = Math.round(((i + rand(0.2, 0.8)) / n) * (cols - 2)) + 1
      weeds.push({ col, h: Math.round(rand(3, Math.max(4, Math.min(9, rows * 0.42)))), phase: rand(0, 6.28), color: i })
    }
    sandRow = Array.from({ length: cols }, () => {
      const r = Math.random()
      return r < 0.04 ? 'º' : r < 0.1 ? ',' : r < 0.45 ? '.' : r < 0.6 ? '_' : r < 0.7 ? ':' : r < 0.78 ? '`' : '.'
    })
    sandTop = Array.from({ length: cols }, () => {
      const r = Math.random()
      return r < 0.12 ? '.' : r < 0.16 ? ',' : r < 0.2 ? '_' : ' '
    })
    const nSpecks = Math.round(cols * rows * pick({ low: 0.012, mid: 0.016, high: 0.02 }))
    specks = Array.from({ length: nSpecks }, () => ({
      x: rand(0, cols), y: rand(1.5, rows - 2), vx: rand(-0.15, 0.15), vy: rand(-0.08, 0.05),
      ch: Math.random() < 0.6 ? '·' : Math.random() < 0.5 ? '.' : '`', a: rand(0.12, 0.32),
    }))
    if (first) {
      const count = Math.min(pick({ low: 6, mid: 8, high: 10 }), Math.max(4, Math.floor(cols / 7)))
      fish = []
      for (let i = 0; i < count; i++) {
        const sp = species[i % species.length]
        const right = facesRight(sp.glyph) ? sp.glyph : mirror(sp.glyph)
        const left = mirror(right)
        const z = i < species.length ? rand(0.75, 1) : rand(0.5, 0.72)
        const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
        const base = rand(2.4, 5.2) * (0.6 + z * 0.5)
        fish.push({
          right, left, len: Array.from(right).length, name: sp.name,
          x: rand(4, cols - 4), y: rand(2, rows - 4), vx: dir * base, dir, ty: rand(2, rows - 4),
          base, z, color: i, phase: rand(0, 6.28), nextWander: rand(1, 4), startle: 0, label: 0,
        })
      }
      fish.sort((a, b) => a.z - b.z)
    } else {
      for (const f of fish) {
        f.x = Math.min(Math.max(f.x, 2), cols - 2)
        f.y = Math.min(Math.max(f.y, 2), rows - 4)
        f.ty = Math.min(Math.max(f.ty, 2), rows - 4)
      }
      bubbles = bubbles.filter((b) => b.x < cols && b.y < rows)
      food = food.filter((p) => p.x < cols)
    }
  }

  function fit(first = false) {
    fitCanvas(canvas, dpr())
    const s = canvas.width / Math.max(1, canvas.clientWidth)
    ctx.setTransform(s, 0, 0, s, 0, 0)
    measure()
    layout(first)
  }

  // ---------- water field ----------
  function field(x: number, y: number): number {
    let h = 0
    const a = aspect()
    for (const r of ripples) {
      const age = t - r.t0
      const rad = age * 15
      const dx = x - r.x
      const dy = (y - r.y) * a
      const d = Math.sqrt(dx * dx + dy * dy)
      const k = d - rad
      if (k > 4 || k < -7) continue
      h += r.amp * Math.exp(-age * 2.1) * Math.cos(k * 1.5) * Math.exp(-(k * k) / 6)
    }
    if (ptr.energy > 0.01 && ptr.inside) {
      const dx = x - ptr.x
      const dy = (y - ptr.y) * a
      const d2 = dx * dx + dy * dy
      if (d2 < 120) {
        const d = Math.sqrt(d2)
        h += 0.55 * ptr.energy * Math.sin(d * 1.25 - t * 5.5) * Math.exp(-d2 / 30)
      }
    }
    return h
  }

  function emitRipple(x: number, y: number, amp: number) {
    ripples.push({ x, y, t0: t, amp })
    if (ripples.length > 10) ripples.shift()
    // fish close to a splash dart away
    for (const f of fish) {
      const dx = f.x - x
      const dy = (f.y - y) * aspect()
      if (dx * dx + dy * dy < 64 && amp > 0.6 && !food.length) {
        f.dir = dx >= 0 ? 1 : -1
        f.startle = 0.7
        f.ty = Math.min(Math.max(f.y + (dy >= 0 ? 2 : -2), 2), rows - 4)
      }
    }
  }

  // ---------- simulation ----------
  function step(dt: number) {
    t += dt
    ptr.energy = Math.max(0, ptr.energy - dt * 0.8)
    ripples = ripples.filter((r) => t - r.t0 < 1.8)

    // food sinks, then rests on the sand and dissolves
    const floor = rows - 2
    for (const p of food) {
      if (p.y < floor) {
        p.y = Math.min(floor, p.y + p.vy * dt)
        p.x += Math.sin(t * 2 + p.phase) * dt * 0.6
      } else p.settled += dt
    }
    food = food.filter((p) => p.settled < 7)

    for (const f of fish) {
      const head = f.x + f.dir * (f.len / 2)
      let target: Food | null = null
      if (food.length) {
        let best = Infinity
        for (const p of food) {
          const dx = p.x - head
          const dy = (p.y - f.y) * 2
          const d = dx * dx + dy * dy
          if (d < best) { best = d; target = p }
        }
      }
      let speed = f.base
      if (target) {
        const dx = target.x - head
        if (Math.abs(dx) > 0.8) f.dir = dx > 0 ? 1 : -1
        f.ty = Math.min(target.y, rows - 3)
        speed = f.base * 2 + 2
        if (Math.abs(dx) < 1.3 && Math.abs(target.y - f.y) < 0.9) {
          food.splice(food.indexOf(target), 1)
          bubbles.push({ x: head, y: f.y - 0.5, y0: f.y, vy: rand(2.5, 3.5), phase: rand(0, 6.28) })
          f.label = 1
          for (const o of fish) o.nextWander = Math.min(o.nextWander, rand(0.4, 2.2))
        }
      } else {
        f.nextWander -= dt
        if (f.nextWander <= 0) {
          f.nextWander = rand(2.5, 6)
          f.ty = rand(2, rows - 4)
          if (Math.random() < 0.25) f.dir = f.dir === 1 ? -1 : 1
          f.base = rand(2.2, 5) * (0.6 + f.z * 0.5)
        }
        // turn at the glass
        if (f.dir === 1 && f.x + f.len / 2 > cols - 1) f.dir = -1
        if (f.dir === -1 && f.x - f.len / 2 < 1) f.dir = 1
        // now and then, blow a bubble
        if (Math.random() < dt * 0.06) bubbles.push({ x: head, y: f.y - 0.6, y0: f.y, vy: rand(2, 3), phase: rand(0, 6.28) })
      }
      if (f.startle > 0) { f.startle -= dt; speed *= 3 }
      const want = f.dir * speed
      f.vx += (want - f.vx) * Math.min(1, dt * (f.startle > 0 ? 6 : 1.6))
      f.x += f.vx * dt
      f.x = Math.min(Math.max(f.x, -2), cols + 2)
      f.y += (f.ty - f.y) * Math.min(1, dt * 0.9)
      // name tag when the cursor hovers a fish
      const near = ptr.inside && Math.abs(ptr.x - f.x) < f.len / 2 + 1 && Math.abs(ptr.y - f.y) < 1.2
      f.label = Math.max(near ? 1 : 0, f.label - dt * 0.6)
    }

    // bubbles from the seaweed beds
    nextBubble -= dt
    if (nextBubble <= 0) {
      nextBubble = rand(0.35, 1.1) * pick({ low: 1.4, mid: 1.1, high: 1 })
      const w = weeds[(Math.random() * weeds.length) | 0]
      const x = w && Math.random() < 0.7 ? w.col + rand(-1, 1) : rand(1, cols - 1)
      bubbles.push({ x, y: rows - 2.2, y0: rows - 2.2, vy: rand(2, 3.6), phase: rand(0, 6.28) })
    }
    for (const b of bubbles) {
      b.y -= b.vy * dt
      b.x += Math.sin(t * 3 + b.phase) * dt * 0.9
    }
    for (const b of bubbles) if (b.y < 1.1) pops.push({ x: b.x, y: 1, age: 0 })
    bubbles = bubbles.filter((b) => b.y >= 1.1)
    for (const p of pops) p.age += dt
    pops = pops.filter((p) => p.age < 0.35)

    for (const s of specks) {
      s.x += s.vx * dt
      s.y += s.vy * dt + Math.sin(t * 0.7 + s.x) * dt * 0.05
      if (s.x < 0) s.x += cols
      if (s.x > cols) s.x -= cols
      if (s.y < 1.5) s.y = rows - 2.5
      if (s.y > rows - 2) s.y = 1.6
    }
  }

  // ---------- drawing ----------
  function put(ch: string, x: number, y: number, color: string, alpha: number, ripple = true) {
    if (ch === ' ') return
    let px = ox + x * cw
    let py = oy + y * chh
    if (ripple && ripples.length + ptr.energy > 0) {
      const h = field(x, y)
      px += h * cw * 0.35
      py += h * chh * 0.28
    }
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fillText(ch, px, py)
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)
    ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`
    ctx.textBaseline = 'top'

    // ripple density layer: empty water cells light up as the wave passes
    if (ripples.length || ptr.energy > 0.02) {
      for (let r = 1; r < rows - 2; r++) {
        for (let c = 0; c < cols; c++) {
          const h = field(c, r)
          const a = Math.abs(h)
          if (a < 0.14) continue
          const idx = Math.min(RAMP.length - 1, Math.floor(a * RAMP.length * 0.9))
          put(RAMP[idx], c, r, h > 0 ? C.crest : C.water, Math.min(0.55, a * 0.6 * C.faint), false)
        }
      }
    }

    for (const s of specks) put(s.ch, Math.floor(s.x), s.y, C.water, Math.min(0.5, s.a * C.faint))

    // surface
    for (let c = 0; c < cols; c++) {
      const w = Math.sin(c * 0.33 - t * 1.4) + Math.sin(c * 0.11 + t * 0.7) * 0.6
      const ch = w > 1.05 ? '^' : w < -1.1 ? '-' : '~'
      put(ch, c, 0.15 + w * 0.08, C.surface, 0.5 + w * 0.12)
    }

    // seaweed: alternating ( ) that flip and sway more toward the tip
    for (const wd of weeds) {
      for (let k = 0; k < wd.h; k++) {
        const row = rows - 2 - k
        const flip = (k + Math.floor(t * 1.4 + wd.phase)) % 2
        const sway = Math.sin(t * 1.1 + wd.phase + k * 0.45) * (k / wd.h) * 1.1
        put(flip ? '(' : ')', wd.col + sway, row, C.weeds[wd.color % C.weeds.length], 0.65 + 0.35 * (k / wd.h))
      }
    }

    // fish, far to near
    for (const f of fish) {
      const g = f.vx > 0.05 ? f.right : f.vx < -0.05 ? f.left : f.dir > 0 ? f.right : f.left
      const chars = Array.from(g)
      const left = f.x - f.len / 2
      const bob = Math.sin(t * 1.6 + f.phase) * 0.12
      for (let i = 0; i < chars.length; i++) put(chars[i], left + i, f.y + bob, C.fish[f.color % C.fish.length], C.fishAlpha(f.z))
      if (f.label > 0.01) {
        const name = f.name
        const lx = Math.max(0, Math.min(cols - name.length, Math.round(f.x - name.length / 2)))
        for (let i = 0; i < name.length; i++) put(name[i], lx + i, f.y - 1 + bob, C.label, 0.7 * Math.min(1, f.label * 2))
      }
    }

    for (const b of bubbles) {
      const p = (b.y0 - b.y) / Math.max(1, b.y0 - 1)
      const ch = p < 0.2 ? '.' : p < 0.45 ? '°' : p < 0.75 ? 'o' : 'O'
      put(ch, b.x, b.y, C.bubble, C.bubbleAlpha)
    }
    for (const p of pops) put(p.age < 0.15 ? '*' : '·', p.x, p.y, C.pop, 1 - p.age / 0.35)

    for (const p of food) put(p.ch, p.x, p.y, C.food, p.settled > 5 ? (7 - p.settled) / 2 : 1)

    // sand bed
    for (let c = 0; c < cols; c++) {
      put(sandTop[c], c, rows - 2, C.sand, Math.min(0.8, 0.45 * C.faint))
      put(sandRow[c], c, rows - 1, C.sand, sandRow[c] === 'º' ? 0.9 : 0.7)
    }
    ctx.globalAlpha = 1
  }

  function frame(dt: number) {
    step(dt)
    draw()
  }

  // ---------- input ----------
  function toCell(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    return { x: (e.clientX - rect.left - ox) / cw, y: (e.clientY - rect.top - oy) / chh }
  }
  let down: { x: number; y: number; time: number } | null = null
  const onMove = (e: PointerEvent) => {
    const p = toCell(e)
    ptr.x = p.x
    ptr.y = p.y
    ptr.inside = true
    ptr.energy = Math.min(1, ptr.energy + 0.25)
    const dx = p.x - ptr.ex
    const dy = (p.y - ptr.ey) * aspect()
    if (dx * dx + dy * dy > 9 && t - ptr.lastEmit > 0.12) {
      emitRipple(p.x, p.y, 0.55)
      ptr.ex = p.x
      ptr.ey = p.y
      ptr.lastEmit = t
    }
  }
  const onLeave = () => { ptr.inside = false }
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, time: performance.now() } }
  const onUp = (e: PointerEvent) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    const quick = performance.now() - down.time < 600
    down = null
    if (moved > 8 || !quick) return
    const p = toCell(e)
    if (p.y > rows - 2) return
    emitRipple(p.x, p.y, 1.3)
    const n = 3 + ((Math.random() * 3) | 0)
    for (let i = 0; i < n; i++) {
      food.push({ x: p.x + rand(-1.6, 1.6), y: Math.max(1, p.y + rand(-0.4, 0.4)), vy: rand(1.6, 2.6), phase: rand(0, 6.28), settled: 0, ch: Math.random() < 0.5 ? '.' : '·' })
    }
    if (food.length > 24) food.splice(0, food.length - 24)
    if (!e.pointerType || e.pointerType !== 'mouse') ptr.inside = false
  }
  const onCancel = () => { down = null; ptr.inside = false }

  // ---------- lifecycle ----------
  const loop = createLoop((dt) => frame(dt), { visibleTarget: canvas })
  const ro = new ResizeObserver(() => {
    fit(false)
    if (reduced || !loop.running) frame(0)
  })

  let destroyed = false
  let booted = false
  // repaint in the new palette right away, even when the loop is idle
  // (reduced motion, off-screen, or before the first animated frame)
  const offTheme = onThemeChange((s: Scheme) => {
    C = s === 'light' ? LIGHT : DARK
    if (booted && W) draw()
  })
  const boot = () => {
    if (destroyed) return
    fit(true)
    booted = true
    ro.observe(canvas)
    if (reduced) {
      // one still frame: a few seconds into the scene so everything is placed
      t = 3
      for (let i = 0; i < 6; i++) bubbles.push({ x: rand(2, cols - 2), y: rand(2, rows - 3), y0: rows - 2, vy: 0, phase: 0 })
      draw()
      return
    }
    // pre-roll so the tank is already populated on first paint
    for (let i = 0; i < 40; i++) step(1 / 30)
    draw()
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    loop.start()
  }

  // measure the cell with the real font; fall back if the font is slow
  const fontReady = document.fonts?.load?.(`${14}px "JetBrains Mono"`) ?? Promise.resolve()
  Promise.race([fontReady, new Promise((r) => setTimeout(r, 1200))]).then(boot, boot)
  document.fonts?.ready.then(() => { if (!destroyed && W) { fit(false); if (reduced) draw() } })

  return {
    destroy() {
      destroyed = true
      offTheme()
      loop.stop()
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
    },
  }
}
