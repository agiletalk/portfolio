// 히어로의 물고기 떼(boids)와 수중 부유물(marine snow).
// 고정 캔버스 하나에 그리지만, 물고기는 "문서 좌표"에 산다 — 잠수하면 떼가 머리 위로
// 멀어진다. 부유물은 층마다 다른 시차로 흘러가서 스크롤이 곧 하강감이 된다.

import { dpr, fitCanvas } from '../../src/lib/motion'

interface Fish {
  x: number; y: number; vx: number; vy: number
  z: number          // 0(멀리) ~ 1(가까이)
  len: number
  phase: number
  heading: number
  shade: string
}
interface Pellet { x: number; y: number; vx: number; age: number; eaten: boolean }
interface Ripple { x: number; y: number; age: number }
interface Snow { x: number; y: number; r: number; k: number; a: number; drift: number }

export interface School {
  resize(): void
  pointer(x: number, y: number, active: boolean): void
  feed(x: number, y: number): void
  /** scrollY: 문서 스크롤(px) */
  step(dt: number, t: number, scrollY: number): void
  draw(t: number, scrollY: number): void
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function createSchool(canvas: HTMLCanvasElement, count: number, snowCount: number): School {
  const ctx = canvas.getContext('2d')
  let W = 1, H = 1, scale = dpr()
  const fish: Fish[] = []
  const pellets: Pellet[] = []
  const ripples: Ripple[] = []
  const snow: Snow[] = []
  const ptr = { x: 0, y: 0, active: false, lastMove: -1e9 }
  let now = 0

  const measure = () => {
    scale = dpr()
    fitCanvas(canvas, scale)
    W = canvas.clientWidth || window.innerWidth
    H = canvas.clientHeight || window.innerHeight
  }
  measure()

  // 어두운 청록 실루엣 — 밝은 수면을 등지고 아래에서 올려다본 정어리 떼
  const shades = ['#0b3a4c', '#0e4457', '#124f62', '#0a3242', '#17596a']
  for (let i = 0; i < count; i++) {
    const z = Math.pow(Math.random(), 0.7)
    const a = Math.random() * Math.PI * 2
    const sp = 60 + Math.random() * 40
    fish.push({
      x: W * (0.45 + (Math.random() - 0.5) * 0.5),
      y: H * (0.45 + (Math.random() - 0.5) * 0.4),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.4,
      z, len: lerp(7, 15, z) * (W < 600 ? 0.85 : 1),
      phase: Math.random() * 10, heading: a,
      shade: shades[(Math.random() * shades.length) | 0],
    })
  }
  fish.sort((a, b) => a.z - b.z) // 먼 것부터 그린다

  for (let i = 0; i < snowCount; i++) {
    snow.push({
      x: Math.random(), y: Math.random(),
      r: 0.5 + Math.random() * 1.6,
      k: 0.25 + Math.random() * 0.9, // 시차 계수: 클수록 가까워 빨리 지나간다
      a: 0.25 + Math.random() * 0.55,
      drift: Math.random() * Math.PI * 2,
    })
  }

  // 이웃 탐색용 격자
  const CELL = 48
  const grid = new Map<number, number[]>()
  const key = (cx: number, cy: number) => cx * 73856093 ^ cy * 19349663

  const step: School['step'] = (dt, t, scrollY) => {
    now = t
    if (dt <= 0) return
    // 화면에 물고기가 하나도 안 보일 만큼 내려가면 시뮬레이션도 쉰다
    if (scrollY > H * 1.25) return

    grid.clear()
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i]
      const k = key(Math.floor(f.x / CELL), Math.floor(f.y / CELL))
      let cell = grid.get(k)
      if (!cell) grid.set(k, (cell = []))
      cell.push(i)
    }

    const pointerOn = ptr.active && t - ptr.lastMove < 3
    // 커서가 없을 땐 리사주 곡선을 따라 떠도는 가상의 목표
    const wx = W * (0.55 + 0.3 * Math.sin(t * 0.13) + 0.08 * Math.sin(t * 0.41))
    const wy = H * (0.5 + 0.22 * Math.sin(t * 0.17 + 1.3))
    const tx = pointerOn ? ptr.x : wx
    const ty = pointerOn ? ptr.y : wy

    const live = pellets.filter((p) => !p.eaten)

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i]
      let ax = 0, ay = 0
      let cx = 0, cy = 0, avx = 0, avy = 0, sx = 0, sy = 0, n = 0
      const gx = Math.floor(f.x / CELL), gy = Math.floor(f.y / CELL)
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const cell = grid.get(key(gx + ox, gy + oy))
        if (!cell) continue
        for (const j of cell) {
          if (j === i) continue
          const o = fish[j]
          const dx = o.x - f.x, dy = o.y - f.y
          const d2 = dx * dx + dy * dy
          if (d2 > CELL * CELL || d2 < 1e-4) continue
          // 깊이가 많이 다른 물고기끼리는 덜 신경 쓴다 (겹쳐 보여도 다른 층)
          const w = 1 - Math.abs(o.z - f.z) * 0.6
          cx += o.x * w; cy += o.y * w; avx += o.vx * w; avy += o.vy * w; n += w
          if (d2 < 15 * 15) { const inv = 1 / d2; sx -= dx * inv; sy -= dy * inv }
        }
      }
      if (n > 0) {
        cx /= n; cy /= n; avx /= n; avy /= n
        ax += (cx - f.x) * 0.9 + (avx - f.vx) * 1.1
        ay += (cy - f.y) * 0.9 + (avy - f.vy) * 1.1
      }
      ax += sx * 2600; ay += sy * 2600

      // 먹이가 있으면 가장 가까운 먹이로 돌진
      let maxSp = 105, rushing = false
      if (live.length) {
        let best: Pellet | null = null, bd = 420 * 420
        for (const p of live) {
          const dx = p.x - f.x, dy = p.y - f.y, d2 = dx * dx + dy * dy
          if (d2 < bd) { bd = d2; best = p }
        }
        if (best) {
          const d = Math.sqrt(bd) || 1
          ax += ((best.x - f.x) / d) * 420; ay += ((best.y - f.y) / d) * 420
          maxSp = 190; rushing = true
          if (d < 7 && !best.eaten) { best.eaten = true; ripples.push({ x: best.x, y: best.y, age: 0 }) }
        }
      }
      if (!rushing) {
        // 목표 주변을 맴돌도록: 멀면 끌리고, 가까우면 접선 방향으로 돈다
        const dx = tx - f.x, dy = ty - f.y
        const d = Math.hypot(dx, dy) || 1
        const pull = pointerOn ? 120 : 55
        const ring = pointerOn ? 70 : Math.min(140, W * 0.16)
        const radial = clamp((d - ring) / 120, -1, 1)
        ax += (dx / d) * pull * radial + (-dy / d) * pull * 0.55
        ay += (dy / d) * pull * radial + (dx / d) * pull * 0.55
      }
      // 화면 가장자리에서 부드럽게 되돌아오기 (히어로 = 문서 0..H)
      const m = 60
      if (f.x < m) ax += (m - f.x) * 6
      if (f.x > W - m) ax -= (f.x - (W - m)) * 6
      if (f.y < H * 0.12) ay += (H * 0.12 - f.y) * 7
      if (f.y > H * 0.94) ay -= (f.y - H * 0.94) * 7
      ay -= f.vy * 0.25 // 물고기는 수평으로 헤엄치는 걸 선호한다

      f.vx += ax * dt; f.vy += ay * dt
      const sp = Math.hypot(f.vx, f.vy) || 1
      const minSp = 45
      const target = clamp(sp, minSp, maxSp)
      f.vx = (f.vx / sp) * target; f.vy = (f.vy / sp) * target
      f.x += f.vx * dt * lerp(0.75, 1, f.z); f.y += f.vy * dt * lerp(0.75, 1, f.z)
      const h = Math.atan2(f.vy, f.vx)
      let dh = h - f.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      f.heading += dh * Math.min(1, dt * 9)
      f.phase += dt * (6 + target * 0.09)
    }

    for (const p of pellets) {
      p.age += dt
      p.y += (18 + Math.min(p.age, 1) * 10) * dt
      p.x += Math.sin(p.age * 2.4 + p.vx) * 9 * dt
    }
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i]
      if (p.eaten || p.age > 16 || p.y > H * 0.98) pellets.splice(i, 1)
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt
      if (ripples[i].age > 0.7) ripples.splice(i, 1)
    }
  }

  const draw: School['draw'] = (t, scrollY) => {
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, W, H)

    // 부유물: 수심이 깊을수록 또렷하고(주변이 어두워져서), 층별 시차로 흘러간다
    const depth = scrollY / H
    const snowA = clamp(0.25 + depth * 0.18, 0.25, 0.85)
    ctx.fillStyle = depth < 0.6 ? '#f2fffd' : '#bff7ee'
    for (const s of snow) {
      let y = (s.y * H - scrollY * s.k * 0.35 - t * 6 * s.k) % (H + 20)
      if (y < -10) y += H + 20
      const x = (s.x * W + Math.sin(t * 0.3 + s.drift) * 8 * s.k + W) % W
      ctx.globalAlpha = s.a * snowA
      ctx.beginPath()
      ctx.arc(x, y, s.r * (0.6 + s.k * 0.6), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    const off = scrollY // 물고기와 먹이는 문서 좌표 → 화면으로
    if (off > H * 1.25) return

    for (const p of pellets) {
      const y = p.y - off
      ctx.globalAlpha = clamp(1 - p.age / 16, 0, 1)
      ctx.fillStyle = '#ffb38a'
      ctx.beginPath(); ctx.arc(p.x, y, 2.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,220,190,0.35)'
      ctx.beginPath(); ctx.arc(p.x, y, 5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
    for (const r of ripples) {
      const k = r.age / 0.7
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(r.x, r.y - off, 3 + k * 16, 0, Math.PI * 2); ctx.stroke()
    }

    for (const f of fish) {
      const y = f.y - off
      if (y < -30 || y > H + 30) continue
      const L = f.len
      const wag = Math.sin(f.phase) * 0.38
      const c = Math.cos(f.heading), s = Math.sin(f.heading)
      ctx.setTransform(c * scale, s * scale, -s * scale, c * scale, f.x * scale, y * scale)
      ctx.globalAlpha = lerp(0.32, 0.92, f.z)
      ctx.fillStyle = f.shade
      ctx.beginPath()
      // 몸통: 주둥이 → 등 → 꼬리자루 → 배
      ctx.moveTo(L * 0.55, 0)
      ctx.quadraticCurveTo(L * 0.2, -L * 0.22, -L * 0.35, -L * 0.05)
      // 꼬리지느러미 (흔들림)
      const tx = -L * 0.72, ty = Math.sin(f.phase - 0.6) * L * 0.12
      ctx.lineTo(tx + wag * L * 0.1, ty - L * 0.2)
      ctx.lineTo(tx + L * 0.1, ty)
      ctx.lineTo(tx + wag * L * 0.1, ty + L * 0.2)
      ctx.lineTo(-L * 0.35, L * 0.05)
      ctx.quadraticCurveTo(L * 0.2, L * 0.2, L * 0.55, 0)
      ctx.fill()
      // 가까운 물고기만 옆줄 반사광
      if (f.z > 0.7) {
        ctx.globalAlpha = (f.z - 0.7) * 1.4
        ctx.strokeStyle = '#cdf7f2'
        ctx.lineWidth = 0.7
        ctx.beginPath(); ctx.moveTo(L * 0.4, L * 0.02); ctx.quadraticCurveTo(0, L * 0.09, -L * 0.3, L * 0.02); ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
  }

  return {
    resize: measure,
    pointer(x, y, active) {
      ptr.x = x; ptr.y = y; ptr.active = active
      if (active) ptr.lastMove = now
    },
    feed(x, y) {
      const n = 6 + ((Math.random() * 4) | 0)
      for (let i = 0; i < n; i++) {
        pellets.push({ x: x + (Math.random() - 0.5) * 34, y: y + (Math.random() - 0.5) * 18, vx: Math.random() * 6, age: -Math.random() * 0.2, eaten: false })
      }
      ripples.push({ x, y, age: 0 })
      if (pellets.length > 60) pellets.splice(0, pellets.length - 60)
    },
    step,
    draw,
  }
}
