// 세 컨셉이 공통으로 지키는 모션 안전장치.
// - prefers-reduced-motion을 존중한다 (정적이지만 완결된 화면)
// - 탭이 숨겨지거나 캔버스가 화면 밖이면 렌더를 멈춘다
// - DPR은 2로 제한하고, 저사양·모바일에서는 개체 수를 줄인다

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

export function prefersReducedMotion(): boolean {
  return reduceQuery.matches
}

export function onReducedMotionChange(fn: (reduce: boolean) => void): () => void {
  const handler = (e: MediaQueryListEvent) => fn(e.matches)
  reduceQuery.addEventListener('change', handler)
  return () => reduceQuery.removeEventListener('change', handler)
}

export type Tier = 'low' | 'mid' | 'high'

/** 기기 성능 등급. 개체 수·해상도를 정할 때 쓴다. */
export function tier(): Tier {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.innerWidth < 768
  const cores = navigator.hardwareConcurrency ?? 4
  if (cores <= 4 || (coarse && narrow)) return 'low'
  if (coarse || narrow || cores <= 8) return 'mid'
  return 'high'
}

/** tier별 값 고르기: pick({ low: 40, mid: 90, high: 160 }) */
export function pick<T>(values: Record<Tier, T>): T {
  return values[tier()]
}

export function dpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2)
}

/** 캔버스를 CSS 크기에 맞춰 DPR 보정한다. 변경 여부를 돌려준다. */
export function fitCanvas(canvas: HTMLCanvasElement, scale = dpr()): boolean {
  const { clientWidth: w, clientHeight: h } = canvas
  const W = Math.max(1, Math.round(w * scale))
  const H = Math.max(1, Math.round(h * scale))
  if (canvas.width === W && canvas.height === H) return false
  canvas.width = W
  canvas.height = H
  return true
}

export interface Loop {
  start(): void
  stop(): void
  readonly running: boolean
}

/**
 * rAF 루프. `visibleTarget`을 주면 그 요소가 화면 밖일 때 멈춘다.
 * 탭이 숨겨지면 항상 멈춘다. reduced-motion이면 시작하지 않는다
 * (정적 프레임이 필요하면 호출 측에서 frame(0, 0)을 한 번 직접 그린다).
 */
export function createLoop(
  frame: (dt: number, t: number) => void,
  opts: { visibleTarget?: Element; respectReducedMotion?: boolean } = {},
): Loop {
  const respect = opts.respectReducedMotion ?? true
  let raf = 0
  let last = 0
  let wanted = false
  let onScreen = true

  const tick = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 0
    last = now
    frame(dt, now / 1000)
    raf = requestAnimationFrame(tick)
  }

  const sync = () => {
    const should = wanted && onScreen && !document.hidden && !(respect && prefersReducedMotion())
    if (should && !raf) {
      last = 0
      raf = requestAnimationFrame(tick)
    } else if (!should && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  document.addEventListener('visibilitychange', sync)
  reduceQuery.addEventListener('change', sync)
  if (opts.visibleTarget) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      sync()
    }).observe(opts.visibleTarget)
  }

  return {
    start() {
      wanted = true
      sync()
    },
    stop() {
      wanted = false
      sync()
    },
    get running() {
      return raf !== 0
    },
  }
}
