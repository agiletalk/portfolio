// 라이트/다크/자동 테마. 같은 origin의 블로그(agiletalk.github.io)와
// localStorage 'theme' 키와 <html data-theme> 규약을 그대로 공유한다.
//   'light' | 'dark' | 키 없음(= auto, prefers-color-scheme을 따른다)
// 토글 순서도 블로그와 같다: light → dark → auto → light.

export type ThemeSetting = 'light' | 'dark' | 'auto'
export type Scheme = 'light' | 'dark'

const KEY = 'theme'
const listeners = new Set<(s: Scheme) => void>()
const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

// <meta name="theme-color">의 원래 값(미디어 쿼리별)을 기억해 auto로 돌아올 때 되돌린다
const META_COLOR: Record<Scheme, string> = { light: '#FAF6EF', dark: '#0d1117' }

function readStored(): ThemeSetting {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

let current: ThemeSetting = readStored()
let lastScheme: Scheme | null = null

export function getTheme(): ThemeSetting {
  return current
}

/** 실제로 칠해지는 색 구성. auto면 OS 설정을 따른다. */
export function getScheme(setting: ThemeSetting = current): Scheme {
  if (setting === 'light' || setting === 'dark') return setting
  return mql?.matches ? 'dark' : 'light'
}

function syncMeta(): void {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const media = m.dataset.media ?? m.getAttribute('media') ?? ''
    if (!m.dataset.media) m.dataset.media = media
    const own: Scheme = media.includes('dark') ? 'dark' : 'light'
    if (current === 'auto') {
      m.setAttribute('media', media)
      m.content = META_COLOR[own]
    } else {
      // 명시 테마는 OS 설정과 무관하게 이긴다
      m.removeAttribute('media')
      m.content = META_COLOR[current]
    }
  })
}

function notify(): void {
  const s = getScheme()
  if (s === lastScheme) return
  lastScheme = s
  listeners.forEach((fn) => fn(s))
}

/** data-theme을 반영하고 구독자에게 알린다. persist=false면 저장소는 건드리지 않는다. */
export function applyTheme(setting: ThemeSetting, persist = true): void {
  current = setting
  if (persist) {
    try {
      if (setting === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, setting)
    } catch {
      // 저장이 막힌 환경에서도 현재 페이지에서는 전환된다
    }
  }
  document.documentElement.dataset.theme = setting
  syncMeta()
  notify()
  buttons.forEach(labelButton)
}

export function toggleTheme(): void {
  const c = current
  applyTheme(c === 'light' ? 'dark' : c === 'dark' ? 'auto' : 'light')
}

/** 실효 색 구성(light|dark)이 바뀔 때마다 호출된다. 등록 즉시 현재 값으로 한 번 호출한다. */
export function onThemeChange(fn: (s: Scheme) => void): () => void {
  listeners.add(fn)
  fn(getScheme())
  return () => listeners.delete(fn)
}

// ---------------------------------------------------------------- toggle button

const buttons = new Set<HTMLElement>()
const ICON: Record<ThemeSetting, string> = { auto: '◐', light: '☾', dark: '☀' }

function labelButton(button: HTMLElement): void {
  const en = document.documentElement.lang === 'en'
  const label = en ? 'Toggle theme (light → dark → auto)' : '테마 전환 (라이트 → 다크 → 자동)'
  const state = en
    ? { light: 'light', dark: 'dark', auto: 'auto' }[current]
    : { light: '라이트', dark: '다크', auto: '자동' }[current]
  button.textContent = ICON[current]
  button.setAttribute('aria-label', `${label}: ${state}`)
  button.title = label
}

/** 버튼 하나를 테마 토글로 만든다. 언어가 바뀌면 relabel()을 불러 라벨을 갱신한다. */
export function bindThemeToggle(button: HTMLElement): { relabel(): void } {
  buttons.add(button)
  button.addEventListener('click', toggleTheme)
  labelButton(button)
  return { relabel: () => labelButton(button) }
}

// ---------------------------------------------------------------- outside changes

// OS 설정 변경 (auto일 때만 실효 색이 바뀐다)
const onSystem = () => { if (current === 'auto') notify() }
if (mql) {
  if (mql.addEventListener) mql.addEventListener('change', onSystem)
  else mql.addListener(onSystem)
}

// 다른 탭(블로그 포함)에서 바꾼 테마
window.addEventListener('storage', (e) => {
  if (e.key !== KEY && e.key !== null) return
  applyTheme(readStored(), false)
})

applyTheme(current, false)
