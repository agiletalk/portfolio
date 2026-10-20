// 커밋 하나 = 점 하나. 흩어진 점이 이름으로 모였다가 연도별 막대 풍경으로 재배치된다.
// 위치·속도·목표는 전부 typed array, 그리기는 WebGL points 한 번(없으면 Canvas2D 배치 fill).

import { createLoop, dpr, fitCanvas, pick, prefersReducedMotion, type Loop } from '../../src/lib/motion'

export interface YearDatum {
  year: number
  count: number
}

interface Phase {
  from: Float32Array
  to: Float32Array
  zFrom: number
  zTo: number
  aFrom: number
  aTo: number
  start: number
  dur: number
  delay: Float32Array
  maxDelay: number
  onStart?: () => void
  onDone?: () => void
  started?: boolean
}

const VERT = `
attribute vec4 a_state;
attribute vec3 a_colA;
attribute vec3 a_colB;
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_sizeA;
uniform float u_sizeB;
varying vec3 v_col;
varying float v_a;
varying float v_z;
void main() {
  vec2 clip = vec2(a_state.x / u_res.x * 2.0 - 1.0, 1.0 - a_state.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = mix(u_sizeA, u_sizeB, a_state.z) * u_dpr;
  v_col = mix(a_colA, a_colB, a_state.z);
  v_a = a_state.w;
  v_z = a_state.z;
}`

const FRAG = `
precision mediump float;
varying vec3 v_col;
varying float v_a;
varying float v_z;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float round = length(c);
  float square = max(abs(c.x), abs(c.y)) * 1.04;
  float d = mix(round, square, v_z * 0.8);
  float a = smoothstep(0.5, 0.34, d) * v_a;
  gl_FragColor = vec4(v_col * a, a);
}`

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const INK = hex('#1c1a17')
const INK_SOFT = hex('#4d463c')
const ACCENT = hex('#a8402a')
const SAND = hex('#cbbfa9')

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const now = () => performance.now() / 1000

export interface NameFont {
  /** CSS font shorthand without size, e.g. '700 "Noto Serif KR"' — `{size}` is inserted */
  style: string
  weight: string
  family: string
}

export class CommitField {
  readonly total: number
  readonly count: number
  private stage: HTMLElement
  private canvas: HTMLCanvasElement
  private axis: HTMLElement
  private years: YearDatum[]
  private yearOf: Uint8Array
  private rank: Uint16Array // index of the particle within its year
  private px: Float32Array
  private py: Float32Array
  private vx: Float32Array
  private vy: Float32Array
  private seed: Float32Array
  private scatterT: Float32Array
  private nameT: Float32Array
  private heatT: Float32Array
  private rest: Float32Array
  private restZ = 0
  private restA = 0.3
  private phases: Phase[] = []
  private zNow: Float32Array
  private aNow: Float32Array
  private sizeName = 2
  private sizeHeat = 2
  private w = 1
  private h = 1
  private mx = -9999
  private my = -9999
  private pointer = false
  private gl: WebGLRenderingContext | null = null
  private g2: CanvasRenderingContext2D | null = null
  private glState: { buf: WebGLBuffer; data: Float32Array; uRes: WebGLUniformLocation | null; uDpr: WebGLUniformLocation | null; uA: WebGLUniformLocation | null; uB: WebGLUniformLocation | null } | null = null
  private colA: Float32Array
  private colB: Float32Array
  private loop: Loop
  private name = ''
  private font: NameFont | null = null
  private reduced = prefersReducedMotion()
  private heatShown = false
  private barTop: Float32Array
  private colX: Float32Array
  private baseY = 0
  private labelEls: { li: HTMLElement; count: HTMLElement }[] = []

  constructor(opts: { stage: HTMLElement; canvas: HTMLCanvasElement; axis: HTMLElement; total: number; byYear: YearDatum[] }) {
    this.stage = opts.stage
    this.canvas = opts.canvas
    this.axis = opts.axis
    this.years = opts.byYear
    this.total = opts.total
    const n = Math.min(this.total, pick({ low: 2600, mid: 5200, high: this.total }))
    this.count = n

    // 연도별로 점을 비례 배분한다 (low tier에서도 막대 높이 비율은 그대로)
    const alloc = this.years.map((y) => Math.round((y.count / this.total) * n))
    let diff = n - alloc.reduce((a, b) => a + b, 0)
    const maxIdx = alloc.indexOf(Math.max(...alloc))
    alloc[maxIdx] += diff
    diff = 0
    this.yearOf = new Uint8Array(n)
    this.rank = new Uint16Array(n)
    let k = 0
    alloc.forEach((cnt, yi) => {
      for (let r = 0; r < cnt; r++, k++) {
        this.yearOf[k] = yi
        this.rank[k] = r
      }
    })

    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.seed = new Float32Array(n)
    this.scatterT = new Float32Array(n * 2)
    this.nameT = new Float32Array(n * 2)
    this.heatT = new Float32Array(n * 2)
    this.rest = this.scatterT
    this.zNow = new Float32Array(n)
    this.aNow = new Float32Array(n)
    this.barTop = new Float32Array(this.years.length)
    this.colX = new Float32Array(this.years.length)
    for (let i = 0; i < n; i++) this.seed[i] = Math.random()

    // 색: 이름 상태는 먹색(가끔 주홍 낙관), 히트맵 상태는 커밋량에 따른 모래→먹 램프, 진행 중인 해는 주홍
    this.colA = new Float32Array(n * 3)
    this.colB = new Float32Array(n * 3)
    const maxCount = Math.max(...this.years.map((y) => y.count))
    const lastYear = this.years.length - 1
    for (let i = 0; i < n; i++) {
      const s = this.seed[i]
      const a = s < 0.035 ? ACCENT : s < 0.2 ? INK_SOFT : INK
      const yi = this.yearOf[i]
      let b: [number, number, number]
      if (yi === lastYear) b = ACCENT
      else {
        const v = Math.pow(this.years[yi].count / maxCount, 0.75)
        b = [SAND[0] + (INK[0] - SAND[0]) * v, SAND[1] + (INK[1] - SAND[1]) * v, SAND[2] + (INK[2] - SAND[2]) * v]
      }
      this.colA.set(a, i * 3)
      this.colB.set(b, i * 3)
    }

    this.buildAxis()
    this.initRenderer()
    this.layout(true)

    this.loop = createLoop((dt, t) => this.frame(dt, t), { visibleTarget: this.canvas })
    if (this.reduced) this.drawStatic()
    else this.loop.start()

    this.stage.addEventListener('pointermove', (e) => {
      const r = this.stage.getBoundingClientRect()
      this.mx = e.clientX - r.left
      this.my = e.clientY - r.top
      this.pointer = true
    })
    this.stage.addEventListener('pointerleave', () => {
      this.pointer = false
    })

    // 스테이지 크기는 창 크기뿐 아니라 아래 플라카드 높이(언어·폰트)에 따라서도 바뀐다
    let raf = 0
    new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (this.stage.clientWidth === this.w && this.stage.clientHeight === this.h) return
        this.layout(false)
        if (this.reduced) this.drawStatic()
      })
    }).observe(this.stage)
  }

  /** 이름을 (다시) 만든다. 처음 호출이면 흩어진 상태에서, 이후엔 현재 위치에서 출발한다. */
  async showName(name: string, font: NameFont): Promise<void> {
    this.name = name
    this.font = font
    try {
      await Promise.race([
        document.fonts.load(`${font.style.replace('{size}', '120px')}`, name),
        new Promise((r) => setTimeout(r, 2500)),
      ])
    } catch {
      // 폰트 로드 실패 시 폴백 글꼴로 샘플링
    }
    if (this.name !== name) return // 그새 언어가 또 바뀌었다
    this.buildName()

    if (this.reduced) {
      this.drawStatic()
      return
    }

    const first = this.phases.length === 0 && this.rest === this.scatterT
    const t0 = now() + (first ? 0.25 : 0.05)
    const from = first ? this.scatterT : this.snapshot()
    const zFrom = first ? 0 : this.averageZ()
    this.phases = []
    this.setHeatVisible(false)

    const n = this.count
    const d1 = new Float32Array(n)
    for (let i = 0; i < n; i++) d1[i] = (this.nameT[i * 2] / this.w) * 0.75 + this.seed[i] * 0.45
    const p1: Phase = { from, to: this.nameT, zFrom, zTo: 0, aFrom: first ? 0.3 : 1, aTo: 1, start: t0, dur: first ? 1.6 : 1.2, delay: d1, maxDelay: 1.2 }

    const d2 = new Float32Array(n)
    const maxRows = this.maxRows()
    for (let i = 0; i < n; i++) {
      const yi = this.yearOf[i]
      const rowFrac = maxRows ? this.rowOf(i) / maxRows : 0
      d2[i] = yi * 0.055 + rowFrac * 0.55 + this.seed[i] * 0.22
    }
    const p2: Phase = {
      from: this.nameT,
      to: this.heatT,
      zFrom: 0,
      zTo: 1,
      aFrom: 1,
      aTo: 1,
      start: p1.start + p1.dur + p1.maxDelay + 1.9,
      dur: 1.5,
      delay: d2,
      maxDelay: 1.4,
      onStart: () => this.stage.classList.add('is-heat-forming'),
      onDone: () => this.setHeatVisible(true),
    }
    this.phases.push(p1, p2)
    this.stage.classList.remove('is-heat-forming')
    this.loop.start()
  }

  private setHeatVisible(v: boolean) {
    this.heatShown = v
    this.stage.classList.toggle('is-heat', v)
    if (!v) this.stage.classList.remove('is-heat-forming')
  }

  private snapshot(): Float32Array {
    const s = new Float32Array(this.count * 2)
    for (let i = 0; i < this.count; i++) {
      s[i * 2] = this.px[i]
      s[i * 2 + 1] = this.py[i]
    }
    return s
  }

  private averageZ(): number {
    let z = 0
    for (let i = 0; i < this.count; i += 7) z += this.zNow[i]
    return z / Math.ceil(this.count / 7)
  }

  // ---------- layout ----------

  private gridCols = 1
  private spacing = 4
  private maxRows() {
    let m = 0
    for (const y of this.allocPerYear()) m = Math.max(m, Math.ceil(y / this.gridCols))
    return m
  }
  private rowOf(i: number) {
    return Math.floor(this.rank[i] / this.gridCols)
  }
  private _alloc: number[] | null = null
  private allocPerYear(): number[] {
    if (this._alloc) return this._alloc
    const a = new Array(this.years.length).fill(0)
    for (let i = 0; i < this.count; i++) a[this.yearOf[i]]++
    this._alloc = a
    return a
  }

  private layout(initial: boolean) {
    const w = Math.max(1, this.stage.clientWidth)
    const h = Math.max(1, this.stage.clientHeight)
    const sx = w / this.w
    const sy = h / this.h
    this.w = w
    this.h = h
    this.resizeRenderer()

    const n = this.count
    if (initial) {
      for (let i = 0; i < n; i++) {
        const x = Math.random() * w
        const y = Math.random() * h
        this.scatterT[i * 2] = x
        this.scatterT[i * 2 + 1] = y
        this.px[i] = x
        this.py[i] = y
      }
    } else {
      for (let i = 0; i < n; i++) {
        this.scatterT[i * 2] *= sx
        this.scatterT[i * 2 + 1] *= sy
      }
    }

    this.buildHeat()
    if (this.name) this.buildName()
    if (!initial && this.reduced) this.snapTo(this.heatT, 1)
  }

  private buildHeat() {
    const { w, h } = this
    const narrow = w < 640
    const padX = narrow ? 16 : Math.max(56, w * 0.08)
    const top = narrow ? 84 : 110
    const bottom = narrow ? 44 : 56
    const availW = w - padX * 2
    const availH = Math.max(80, h - top - bottom)
    const slots = this.years.length
    const slot = availW / slots
    const barW = slot * (narrow ? 0.74 : 0.6)
    const alloc = this.allocPerYear()
    const maxA = Math.max(...alloc)

    let s = Math.sqrt((barW * availH) / maxA)
    for (let guard = 0; guard < 200; guard++) {
      const c = Math.max(1, Math.floor(barW / s))
      if (Math.ceil(maxA / c) * s <= availH) break
      s *= 0.97
    }
    const cols = Math.max(1, Math.floor(barW / s))
    this.gridCols = cols
    this.spacing = s
    this.sizeHeat = Math.max(1.2, s * 0.74)
    const baseY = top + availH
    this.baseY = baseY

    for (let yi = 0; yi < slots; yi++) {
      const cx = padX + slot * (yi + 0.5)
      this.colX[yi] = cx
      this.barTop[yi] = baseY - Math.ceil(alloc[yi] / cols) * s
    }
    for (let i = 0; i < this.count; i++) {
      const yi = this.yearOf[i]
      const r = this.rank[i]
      const col = r % cols
      const row = Math.floor(r / cols)
      this.heatT[i * 2] = this.colX[yi] - ((cols - 1) * s) / 2 + col * s
      this.heatT[i * 2 + 1] = baseY - s / 2 - row * s
    }
    this.placeAxis(narrow)
  }

  private buildName() {
    if (!this.font) return
    const { w, h } = this
    const narrow = w < 640
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })
    if (!g) return
    const f = this.font
    g.font = f.style.replace('{size}', '100px')
    const mw = g.measureText(this.name).width / 100 || 1
    const top = narrow ? 70 : 90
    const region = h - top
    const size = Math.min((w * (narrow ? 0.88 : 0.76)) / mw, region * (narrow ? 0.4 : 0.62))
    g.font = f.style.replace('{size}', `${size}px`)
    g.fillStyle = '#000'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(this.name, w / 2, top + region * 0.47)
    const data = g.getImageData(0, 0, w, h).data

    let area = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) area++
    const n = this.count
    const step = Math.max(1, Math.sqrt(area / n) * 0.97)
    const pts: number[] = []
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const xi = x | 0
        const yi = y | 0
        if (data[(yi * w + xi) * 4 + 3] > 128) pts.push(x, y)
      }
    }
    const P = pts.length / 2
    if (P === 0) return
    // 섞어서 배정 — 어느 점이 어느 획으로 갈지 무작위라 모일 때 소용돌이가 생긴다
    const order = new Uint32Array(P)
    for (let i = 0; i < P; i++) order[i] = i
    for (let i = P - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      const t = order[i]
      order[i] = order[j]
      order[j] = t
    }
    const jitter = P < n ? step * 0.45 : step * 0.18
    for (let i = 0; i < n; i++) {
      const p = order[i % P]
      this.nameT[i * 2] = pts[p * 2] + (Math.random() - 0.5) * jitter
      this.nameT[i * 2 + 1] = pts[p * 2 + 1] + (Math.random() - 0.5) * jitter
    }
    this.sizeName = Math.min(4.2, Math.max(1.3, step * 0.92))
  }

  // ---------- axis labels (real DOM text) ----------

  private buildAxis() {
    this.axis.innerHTML = ''
    this.labelEls = this.years.map((y) => {
      const li = document.createElement('li')
      li.className = 'axis-item'
      const count = document.createElement('span')
      count.className = 'axis-count'
      count.textContent = y.count.toLocaleString('en-US')
      const year = document.createElement('span')
      year.className = 'axis-year'
      year.dataset.full = String(y.year)
      year.dataset.short = `’${String(y.year).slice(2)}`
      li.append(count, year)
      this.axis.append(li)
      return { li, count }
    })
  }

  private placeAxis(narrow: boolean) {
    this.stage.style.setProperty('--baseline', `${this.baseY}px`)
    this.labelEls.forEach(({ li, count }, yi) => {
      li.style.transform = `translate3d(${this.colX[yi]}px, 0, 0)`
      li.style.setProperty('--base', `${this.baseY}px`)
      count.style.setProperty('--top', `${this.barTop[yi]}px`)
      const year = li.querySelector('.axis-year') as HTMLElement
      year.textContent = narrow ? year.dataset.short! : year.dataset.full!
      li.style.setProperty('--i', String(yi))
    })
  }

  // ---------- simulation ----------

  private frame(dt: number, t: number) {
    const n = this.count
    const ph = this.phases[0]
    if (ph && !ph.started && t >= ph.start) {
      ph.started = true
      ph.onStart?.()
    }
    if (ph && t >= ph.start + ph.dur + ph.maxDelay) {
      this.rest = ph.to
      this.restZ = ph.zTo
      this.restA = ph.aTo
      this.phases.shift()
      ph.onDone?.()
    }
    const cur = this.phases[0]
    const active = cur && t >= cur.start ? cur : null
    const R = this.w < 640 ? 56 : 96
    const R2 = R * R
    const K = 80
    const C = 13
    const mx = this.mx
    const my = this.my
    const push = this.pointer
    const wob = this.heatShown ? 0.35 : 0.6
    const step = Math.min(dt, 1 / 30)

    for (let i = 0; i < n; i++) {
      let tx: number, ty: number, z: number, a: number
      if (active) {
        let p = (t - active.start - active.delay[i]) / active.dur
        p = p < 0 ? 0 : p > 1 ? 1 : p
        const e = easeInOut(p)
        const fx = active.from[i * 2]
        const fy = active.from[i * 2 + 1]
        tx = fx + (active.to[i * 2] - fx) * e
        ty = fy + (active.to[i * 2 + 1] - fy) * e
        z = active.zFrom + (active.zTo - active.zFrom) * e
        a = active.aFrom + (active.aTo - active.aFrom) * e
        if (p > 0 && p < 1) {
          // 이동 중엔 살짝 휘어서 날아간다
          const arc = Math.sin(p * Math.PI) * (this.seed[i] - 0.5) * 60
          tx += arc
        }
      } else {
        const src = cur ? cur.from : this.rest
        tx = src[i * 2]
        ty = src[i * 2 + 1]
        z = cur ? cur.zFrom : this.restZ
        a = cur ? cur.aFrom : this.restA
      }
      const sd = this.seed[i] * 6.283
      tx += Math.sin(t * 0.9 + sd) * wob
      ty += Math.cos(t * 1.1 + sd * 1.7) * wob

      let ax = (tx - this.px[i]) * K - this.vx[i] * C
      let ay = (ty - this.py[i]) * K - this.vy[i] * C
      if (push) {
        const dx = this.px[i] - mx
        const dy = this.py[i] - my
        const d2 = dx * dx + dy * dy
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const f = (1 - d / R) * (1 - d / R) * 9000
          ax += (dx / d) * f
          ay += (dy / d) * f
        }
      }
      this.vx[i] += ax * step
      this.vy[i] += ay * step
      this.px[i] += this.vx[i] * step
      this.py[i] += this.vy[i] * step
      this.zNow[i] = z
      this.aNow[i] = a
    }
    this.draw()
  }

  private snapTo(target: Float32Array, z: number) {
    for (let i = 0; i < this.count; i++) {
      this.px[i] = target[i * 2]
      this.py[i] = target[i * 2 + 1]
      this.vx[i] = 0
      this.vy[i] = 0
      this.zNow[i] = z
      this.aNow[i] = 1
    }
  }

  /** reduced-motion: 최종 히트맵 상태를 한 번 그린다 */
  drawStatic() {
    this.snapTo(this.heatT, 1)
    this.setHeatVisible(true)
    this.draw()
  }

  // ---------- rendering ----------

  private initRenderer() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) as WebGLRenderingContext | null
    if (gl) {
      const prog = this.program(gl)
      if (prog) {
        this.gl = gl
        gl.useProgram(prog)
        const data = new Float32Array(this.count * 4)
        const buf = gl.createBuffer()!
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
        const aState = gl.getAttribLocation(prog, 'a_state')
        gl.enableVertexAttribArray(aState)
        gl.vertexAttribPointer(aState, 4, gl.FLOAT, false, 0, 0)

        const bindStatic = (name: string, arr: Float32Array) => {
          const b = gl.createBuffer()!
          gl.bindBuffer(gl.ARRAY_BUFFER, b)
          gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW)
          const loc = gl.getAttribLocation(prog, name)
          gl.enableVertexAttribArray(loc)
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
        }
        bindStatic('a_colA', this.colA)
        bindStatic('a_colB', this.colB)
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.clearColor(0, 0, 0, 0)
        this.glState = {
          buf,
          data,
          uRes: gl.getUniformLocation(prog, 'u_res'),
          uDpr: gl.getUniformLocation(prog, 'u_dpr'),
          uA: gl.getUniformLocation(prog, 'u_sizeA'),
          uB: gl.getUniformLocation(prog, 'u_sizeB'),
        }
        this.canvas.dataset.renderer = 'webgl'
        return
      }
    }
    this.g2 = this.canvas.getContext('2d')
    this.canvas.dataset.renderer = '2d'
    this.buildPalette2d()
  }

  private program(gl: WebGLRenderingContext): WebGLProgram | null {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
    }
    const v = sh(gl.VERTEX_SHADER, VERT)
    const f = sh(gl.FRAGMENT_SHADER, FRAG)
    if (!v || !f) return null
    const p = gl.createProgram()!
    gl.attachShader(p, v)
    gl.attachShader(p, f)
    gl.linkProgram(p)
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null
  }

  private resizeRenderer() {
    fitCanvas(this.canvas)
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  // Canvas2D 폴백: 색을 몇 개의 버킷으로 묶어 버킷당 path 하나, fill 한 번
  private palette2d: string[] = []
  private idxA = new Uint8Array(0)
  private idxB = new Uint8Array(0)
  private buildPalette2d() {
    const key = (c: ArrayLike<number>) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`
    const map = new Map<string, number>()
    const idx = (s: string) => {
      if (!map.has(s)) {
        map.set(s, this.palette2d.length)
        this.palette2d.push(s)
      }
      return map.get(s)!
    }
    this.idxA = new Uint8Array(this.count)
    this.idxB = new Uint8Array(this.count)
    for (let i = 0; i < this.count; i++) {
      this.idxA[i] = idx(key(this.colA.subarray(i * 3, i * 3 + 3)))
      this.idxB[i] = idx(key(this.colB.subarray(i * 3, i * 3 + 3)))
    }
  }

  private draw() {
    const n = this.count
    const ratio = dpr()
    if (this.gl && this.glState) {
      const gl = this.gl
      const st = this.glState
      const d = st.data
      for (let i = 0; i < n; i++) {
        const o = i * 4
        d[o] = this.px[i]
        d[o + 1] = this.py[i]
        d[o + 2] = this.zNow[i]
        d[o + 3] = this.aNow[i]
      }
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindBuffer(gl.ARRAY_BUFFER, st.buf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, d)
      gl.uniform2f(st.uRes, this.w, this.h)
      gl.uniform1f(st.uDpr, ratio)
      gl.uniform1f(st.uA, this.sizeName)
      gl.uniform1f(st.uB, this.sizeHeat)
      gl.drawArrays(gl.POINTS, 0, n)
      return
    }
    const g = this.g2
    if (!g) return
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    g.clearRect(0, 0, this.w, this.h)
    const buckets = this.palette2d.length
    for (let b = 0; b < buckets; b++) {
      g.beginPath()
      let any = false
      for (let i = 0; i < n; i++) {
        const z = this.zNow[i]
        const ci = z < 0.5 ? this.idxA[i] : this.idxB[i]
        if (ci !== b) continue
        const s = this.sizeName + (this.sizeHeat - this.sizeName) * z
        g.rect(this.px[i] - s / 2, this.py[i] - s / 2, s, s)
        any = true
      }
      if (!any) continue
      g.globalAlpha = this.aNow[0] || 1
      g.fillStyle = this.palette2d[b]
      g.fill()
    }
    g.globalAlpha = 1
  }
}
