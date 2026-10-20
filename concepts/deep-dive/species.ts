// 사이드 프로젝트 = 어종. 프로젝트마다 몸 모양·색이 다른 물고기를 Canvas2D로 그린다.
// 클릭(탭)하면 해당 프로젝트 카드가 떠오른다. 카드 버튼과 호버 상태를 주고받는다.

import { dpr, fitCanvas } from '../../src/lib/motion'

type Kind = 'tetra' | 'clown' | 'angel' | 'tang' | 'puffer' | 'betta' | 'swift'

interface Look { kind: Kind; size: number; body: string; accent: string; fin: string; swatch: string }

// project.id → 어종. 모르는 id는 순서대로 기본 어종을 돌려 쓴다.
const LOOKS: Record<string, Look> = {
  vivarium: { kind: 'tetra', size: 1.0, body: '#c9d8e6', accent: '#38e1ff', fin: '#ff3d5e', swatch: 'linear-gradient(#38e1ff,#ff3d5e)' },
  aquarium: { kind: 'clown', size: 0.92, body: '#ff7a2e', accent: '#fff6ec', fin: '#1a0e08', swatch: 'linear-gradient(#ff7a2e,#fff6ec)' },
  'commit-museum': { kind: 'angel', size: 1.15, body: '#dfe6ea', accent: '#2a333b', fin: '#c7d3da', swatch: 'linear-gradient(#dfe6ea,#2a333b)' },
  relnote: { kind: 'tang', size: 1.05, body: '#2f63ff', accent: '#0b1640', fin: '#ffd23f', swatch: 'linear-gradient(#2f63ff,#ffd23f)' },
  'agile-xcode-themes': { kind: 'betta', size: 1.05, body: '#8a5cff', accent: '#ff5cc8', fin: '#5c8bff', swatch: 'linear-gradient(#8a5cff,#ff5cc8)' },
  swiftuinote: { kind: 'swift', size: 1.0, body: '#ff5a36', accent: '#ffb08f', fin: '#ff8a4a', swatch: 'linear-gradient(#ff5a36,#ffb08f)' },
}
const FALLBACK: Look[] = Object.values(LOOKS)

export function lookFor(id: string, index: number): Look {
  return LOOKS[id] ?? FALLBACK[index % FALLBACK.length]
}

interface Swimmer {
  id: string; label: string; glyph: string; look: Look
  x: number; lane: number; y: number
  dir: number; face: number; speed: number; phase: number; bob: number
  hot: number // 호버 강조 0..1
}

export interface Tank {
  setLabels(items: { id: string; name: string; glyph: string }[]): void
  setHot(id: string | null): void
  step(dt: number, t: number): void
  draw(t: number): void
  resize(): void
}

export function createTank(
  canvas: HTMLCanvasElement,
  items: { id: string; name: string; glyph: string }[],
  handlers: { onPick(id: string): void; onHover(id: string | null): void },
): Tank {
  const ctx = canvas.getContext('2d')
  let W = 1, H = 1, scale = dpr(), unit = 1
  let externalHot: string | null = null
  let hoverId: string | null = null
  const fish: Swimmer[] = items.map((it, i) => ({
    id: it.id, label: it.name, glyph: it.glyph, look: lookFor(it.id, i),
    x: 0, lane: 0, y: 0,
    dir: i % 2 ? -1 : 1, face: i % 2 ? -1 : 1,
    speed: 26 + ((i * 37) % 23), phase: i * 1.9, bob: i * 2.3, hot: 0,
  }))

  const layout = () => {
    scale = dpr()
    fitCanvas(canvas, scale)
    W = canvas.clientWidth; H = canvas.clientHeight
    unit = W < 600 ? 0.58 : Math.min(1, W / 900) * 0.3 + 0.75
    const n = fish.length
    fish.forEach((f, i) => {
      // 지그재그 레인으로 고르게 퍼뜨린다
      f.lane = H * (0.16 + (0.7 * i) / Math.max(1, n - 1))
      if (!f.x) f.x = W * (i % 2 ? 0.68 : 0.3) + ((i * 37) % 11 - 5) * W * 0.012
      f.y = f.lane
    })
  }
  layout()

  const lenOf = (f: Swimmer) => 84 * f.look.size * unit

  const hit = (px: number, py: number): Swimmer | null => {
    for (let i = fish.length - 1; i >= 0; i--) {
      const f = fish[i]
      const L = lenOf(f)
      const ry = f.look.kind === 'angel' ? L * 0.6 : L * 0.36
      const dx = (px - f.x) / (L * 0.62), dy = (py - f.y) / ry
      if (dx * dx + dy * dy < 1) return f
    }
    return null
  }

  const local = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e)
    const f = hit(x, y)
    const id = f?.id ?? null
    canvas.style.cursor = f ? 'pointer' : 'default'
    if (id !== hoverId) { hoverId = id; handlers.onHover(id) }
  })
  canvas.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; handlers.onHover(null) } })
  canvas.addEventListener('click', (e) => {
    const [x, y] = local(e)
    const f = hit(x, y)
    if (f) handlers.onPick(f.id)
  })

  const step: Tank['step'] = (dt, t) => {
    for (const f of fish) {
      const isHot = f.id === hoverId || f.id === externalHot
      f.hot += ((isHot ? 1 : 0) - f.hot) * Math.min(1, dt * 6)
      const L = lenOf(f)
      const sp = f.speed * unit * (1 - f.hot * 0.8)
      f.x += f.dir * sp * dt
      if (f.x > W - L * 0.7 && f.dir > 0) f.dir = -1
      if (f.x < L * 0.7 && f.dir < 0) f.dir = 1
      f.face += (f.dir - f.face) * Math.min(1, dt * 2.6)
      f.y = f.lane + Math.sin(t * 0.5 + f.bob) * H * 0.035
      f.phase += dt * (4 + sp * 0.06)
    }
  }

  const draw: Tank['draw'] = (t) => {
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, W, H)
    // 위에서 떨어지는 스포트라이트
    const g = ctx.createRadialGradient(W * 0.5, -H * 0.2, 0, W * 0.5, -H * 0.2, H * 1.2)
    g.addColorStop(0, 'rgba(160,255,240,0.10)')
    g.addColorStop(1, 'rgba(160,255,240,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    for (const f of fish) {
      const L = lenOf(f) * (1 + f.hot * 0.08)
      // 발광 후광
      if (f.hot > 0.02) {
        const hg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, L)
        hg.addColorStop(0, `rgba(143,245,230,${0.22 * f.hot})`)
        hg.addColorStop(1, 'rgba(143,245,230,0)')
        ctx.fillStyle = hg
        ctx.fillRect(f.x - L, f.y - L, L * 2, L * 2)
      }
      ctx.save()
      ctx.translate(f.x, f.y)
      // 방향 전환 시 face가 0을 지나며 몸이 얇아진다 — 가짜 3D 회전
      const fx = Math.sign(f.face) * Math.max(0.08, Math.abs(f.face))
      ctx.scale(fx, 1)
      drawSpecies(ctx, f.look, L, f.phase, t)
      ctx.restore()

      // 라벨: 이름 + ASCII glyph
      const a = 0.5 + f.hot * 0.5
      ctx.textAlign = 'center'
      ctx.font = `500 ${Math.round(11 + unit * 1.5)}px "JetBrains Mono", ui-monospace, monospace`
      ctx.fillStyle = `rgba(230,250,248,${a})`
      const ly = f.y + (f.look.kind === 'angel' ? L * 0.62 : L * 0.42) + 14
      ctx.fillText(f.label, f.x, ly)
      if (f.hot > 0.02) {
        ctx.fillStyle = `rgba(143,245,230,${f.hot})`
        ctx.fillText(f.glyph, f.x, ly + 16)
      }
    }
  }

  return {
    setLabels(next) {
      for (const n of next) {
        const f = fish.find((x) => x.id === n.id)
        if (f) { f.label = n.name; f.glyph = n.glyph }
      }
    },
    setHot(id) { externalHot = id },
    step, draw, resize: layout,
  }
}

// ---------- 어종별 그리기 (오른쪽을 향한 기준, 원점 = 몸 중심) ----------

function drawSpecies(ctx: CanvasRenderingContext2D, look: Look, L: number, ph: number, t: number) {
  const wag = Math.sin(ph) * 0.22
  switch (look.kind) {
    case 'tetra': return tetra(ctx, look, L, wag)
    case 'clown': return clown(ctx, look, L, wag)
    case 'angel': return angel(ctx, look, L, wag, ph)
    case 'tang': return tang(ctx, look, L, wag)
    case 'puffer': return puffer(ctx, look, L, wag, t)
    case 'betta': return betta(ctx, look, L, wag, ph)
    case 'swift': return swift(ctx, look, L, wag)
  }
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#f4fbff'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#081018'
  ctx.beginPath(); ctx.arc(x + r * 0.2, y, r * 0.6, 0, Math.PI * 2); ctx.fill()
}

function tail(ctx: CanvasRenderingContext2D, x: number, L: number, wag: number, spread: number, len: number, fork = 0) {
  const tx = x - L * len, ty = wag * L * 0.5
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.quadraticCurveTo(x - L * len * 0.5, -L * spread * 0.4 + ty * 0.5, tx, -L * spread + ty)
  if (fork) ctx.lineTo(tx + L * fork, ty)
  ctx.lineTo(tx, L * spread + ty)
  ctx.quadraticCurveTo(x - L * len * 0.5, L * spread * 0.4 + ty * 0.5, x, 0)
  ctx.fill()
}

function spindle(ctx: CanvasRenderingContext2D, L: number, h: number, back = 0.42) {
  ctx.beginPath()
  ctx.moveTo(L * 0.5, 0)
  ctx.bezierCurveTo(L * 0.4, -h * 1.1, -L * 0.2, -h * 1.05, -L * back, -h * 0.25)
  ctx.lineTo(-L * back, h * 0.25)
  ctx.bezierCurveTo(-L * 0.2, h * 1.05, L * 0.4, h * 1.1, L * 0.5, 0)
}

function tetra(ctx: CanvasRenderingContext2D, k: Look, L: number, wag: number) {
  ctx.fillStyle = 'rgba(210,230,245,0.55)'
  tail(ctx, -L * 0.38, L, wag, 0.2, 0.28, 0.1)
  spindle(ctx, L, L * 0.17)
  ctx.fillStyle = k.body; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1
  // 붉은 배
  ctx.save(); ctx.clip()
  ctx.fillStyle = k.fin
  ctx.fillRect(-L * 0.45, L * 0.02, L * 0.62, L * 0.25)
  // 네온 줄무늬
  const g = ctx.createLinearGradient(-L * 0.4, 0, L * 0.4, 0)
  g.addColorStop(0, 'rgba(56,225,255,0.4)'); g.addColorStop(0.5, k.accent); g.addColorStop(1, 'rgba(56,225,255,0.6)')
  ctx.fillStyle = g
  ctx.shadowColor = k.accent; ctx.shadowBlur = 10
  ctx.fillRect(-L * 0.42, -L * 0.055, L * 0.8, L * 0.06)
  ctx.restore()
  eye(ctx, L * 0.32, -L * 0.03, L * 0.045)
}

function clown(ctx: CanvasRenderingContext2D, k: Look, L: number, wag: number) {
  ctx.fillStyle = k.body
  tail(ctx, -L * 0.36, L, wag, 0.2, 0.2)
  // 둥근 지느러미
  ctx.beginPath(); ctx.ellipse(-L * 0.05, -L * 0.2, L * 0.2, L * 0.09, -0.2, 0, Math.PI * 2); ctx.fill()
  spindle(ctx, L, L * 0.22, 0.38)
  ctx.fill()
  ctx.save(); ctx.clip()
  for (const [x, w] of [[L * 0.22, 0.075], [-L * 0.04, 0.09], [-L * 0.33, 0.06]] as const) {
    ctx.fillStyle = k.fin; ctx.fillRect(x - L * w * 0.5 - 1.6, -L, L * w + 3.2, L * 2)
    ctx.fillStyle = k.accent; ctx.fillRect(x - L * w * 0.5, -L, L * w, L * 2)
  }
  ctx.restore()
  eye(ctx, L * 0.34, -L * 0.04, L * 0.05)
}

function angel(ctx: CanvasRenderingContext2D, k: Look, L: number, wag: number, ph: number) {
  const sway = Math.sin(ph * 0.5) * L * 0.04
  // 길게 늘어진 등·뒷지느러미
  ctx.fillStyle = 'rgba(210,225,232,0.55)'
  ctx.beginPath()
  ctx.moveTo(L * 0.05, -L * 0.25)
  ctx.quadraticCurveTo(-L * 0.15, -L * 0.6, -L * 0.42 + sway, -L * 0.78)
  ctx.quadraticCurveTo(-L * 0.25, -L * 0.35, -L * 0.25, -L * 0.1)
  ctx.moveTo(L * 0.05, L * 0.25)
  ctx.quadraticCurveTo(-L * 0.15, L * 0.6, -L * 0.42 - sway, L * 0.78)
  ctx.quadraticCurveTo(-L * 0.25, L * 0.35, -L * 0.25, L * 0.1)
  ctx.fill()
  tail(ctx, -L * 0.28, L, wag, 0.16, 0.22)
  // 높은 원반형 몸
  ctx.beginPath()
  ctx.moveTo(L * 0.42, 0)
  ctx.quadraticCurveTo(L * 0.25, -L * 0.42, -L * 0.05, -L * 0.36)
  ctx.quadraticCurveTo(-L * 0.28, -L * 0.18, -L * 0.3, 0)
  ctx.quadraticCurveTo(-L * 0.28, L * 0.18, -L * 0.05, L * 0.36)
  ctx.quadraticCurveTo(L * 0.25, L * 0.42, L * 0.42, 0)
  const g = ctx.createLinearGradient(0, -L * 0.4, 0, L * 0.4)
  g.addColorStop(0, '#f3f7f9'); g.addColorStop(1, k.body)
  ctx.fillStyle = g; ctx.fill()
  ctx.save(); ctx.clip()
  ctx.fillStyle = k.accent
  for (const x of [L * 0.18, -L * 0.05, -L * 0.24]) ctx.fillRect(x, -L, L * 0.045, L * 2)
  ctx.restore()
  eye(ctx, L * 0.28, -L * 0.06, L * 0.045)
}

function tang(ctx: CanvasRenderingContext2D, k: Look, L: number, wag: number) {
  ctx.fillStyle = k.fin
  tail(ctx, -L * 0.36, L, wag, 0.22, 0.2, 0.06)
  ctx.beginPath()
  ctx.moveTo(L * 0.48, L * 0.02)
  ctx.bezierCurveTo(L * 0.42, -L * 0.34, -L * 0.2, -L * 0.36, -L * 0.38, -L * 0.04)
  ctx.lineTo(-L * 0.38, L * 0.04)
  ctx.bezierCurveTo(-L * 0.2, L * 0.34, L * 0.42, L * 0.3, L * 0.48, L * 0.02)
  ctx.fillStyle = k.body; ctx.fill()
  ctx.save(); ctx.clip()
  // 팔레트 무늬
  ctx.fillStyle = k.accent
  ctx.beginPath()
  ctx.moveTo(L * 0.28, -L * 0.2)
  ctx.quadraticCurveTo(-L * 0.05, -L * 0.02, -L * 0.36, -L * 0.18)
  ctx.quadraticCurveTo(-L * 0.1, L * 0.18, L * 0.1, L * 0.02)
  ctx.quadraticCurveTo(L * 0.25, -L * 0.04, L * 0.28, -L * 0.2)
  ctx.fill()
  ctx.restore()
  eye(ctx, L * 0.32, -L * 0.07, L * 0.05)
}

function puffer(ctx: CanvasRenderingContext2D, k: Look, L: number, wag: number, t: number) {
  const puff = 1 + Math.max(0, Math.sin(t * 0.7)) * 0.08
  ctx.fillStyle = k.fin
  tail(ctx, -L * 0.3, L, wag, 0.14, 0.16)
  ctx.beginPath(); ctx.ellipse(L * 0.02, -L * 0.24 * puff, L * 0.07, L * 0.05, 0.6, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, 0, L * 0.36 * puff, L * 0.29 * puff, 0, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(-L * 0.05, -L * 0.12, 0, 0, 0, L * 0.4)
  g.addColorStop(0, '#fff1c4'); g.addColorStop(1, k.body)
  ctx.fillStyle = g; ctx.fill()
  ctx.fillStyle = k.accent
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, r = L * 0.08 + (i % 3) * L * 0.07
    ctx.beginPath(); ctx.arc(Math.cos(a) * r - L * 0.05, Math.sin(a) * r * 0.7 - L * 0.08, L * 0.02, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#fffaf0'
  ctx.beginPath(); ctx.ellipse(0, L * 0.16 * puff, L * 0.24, L * 0.1, 0, 0, Math.PI * 2); ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1
  eye(ctx, L * 0.2, -L * 0.08, L * 0.06)
}

function betta(ctx: CanvasRenderingContext2D, k: Look, L: number, wag: number, ph: number) {
  // 몸보다 큰, 하늘거리는 지느러미
  const fl = Math.sin(ph * 0.6) * L * 0.06
  const g = ctx.createLinearGradient(-L * 0.9, 0, 0, 0)
  g.addColorStop(0, 'rgba(92,139,255,0.25)'); g.addColorStop(1, 'rgba(255,92,200,0.75)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-L * 0.2, -L * 0.1)
  ctx.bezierCurveTo(-L * 0.5, -L * 0.55 + fl, -L * 0.95, -L * 0.45 + wag * L, -L * 0.85, wag * L * 0.6)
  ctx.bezierCurveTo(-L * 0.95, L * 0.45 + wag * L, -L * 0.5, L * 0.55 - fl, -L * 0.2, L * 0.1)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(L * 0.05, L * 0.1)
  ctx.quadraticCurveTo(-L * 0.1, L * 0.5 + fl, -L * 0.35, L * 0.35)
  ctx.lineTo(-L * 0.2, L * 0.05)
  ctx.moveTo(L * 0.05, -L * 0.1)
  ctx.quadraticCurveTo(-L * 0.1, -L * 0.42 - fl, -L * 0.3, -L * 0.3)
  ctx.lineTo(-L * 0.2, -L * 0.05)
  ctx.fill()
  spindle(ctx, L * 0.85, L * 0.12, 0.42)
  const bg = ctx.createLinearGradient(L * 0.4, 0, -L * 0.3, 0)
  bg.addColorStop(0, k.body); bg.addColorStop(1, k.accent)
  ctx.fillStyle = bg; ctx.fill()
  eye(ctx, L * 0.26, -L * 0.02, L * 0.04)
}

function swift(ctx: CanvasRenderingContext2D, k: Look, L: number, wag: number) {
  // 제비꼬리처럼 깊게 갈라진 꼬리 — Swift 로고의 새를 닮은 물고기
  ctx.fillStyle = k.fin
  tail(ctx, -L * 0.38, L, wag, 0.24, 0.32, 0.22)
  ctx.beginPath()
  ctx.moveTo(L * 0.05, -L * 0.12)
  ctx.quadraticCurveTo(-L * 0.12, -L * 0.3, -L * 0.24, -L * 0.28)
  ctx.lineTo(-L * 0.18, -L * 0.08)
  ctx.fill()
  spindle(ctx, L, L * 0.14, 0.4)
  const g = ctx.createLinearGradient(0, -L * 0.15, 0, L * 0.15)
  g.addColorStop(0, k.body); g.addColorStop(1, k.accent)
  ctx.fillStyle = g; ctx.fill()
  eye(ctx, L * 0.32, -L * 0.03, L * 0.04)
}
