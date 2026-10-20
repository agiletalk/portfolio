// 한/영 전환. 세 컨셉과 컨셉 목록이 같은 localStorage 키를 공유해
// 한 페이지에서 바꾼 언어가 다른 페이지로 이동해도 유지된다.

import type { Content, Lang } from './content/types'
import { ko } from './content/ko'
import { en } from './content/en'

const KEY = 'portfolio.lang'
const listeners = new Set<(c: Content) => void>()

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'ko' || v === 'en' ? v : null
  } catch {
    return null
  }
}

let current: Lang = readStored() ?? 'ko'

export function getLang(): Lang {
  return current
}

export function getContent(lang: Lang = current): Content {
  return lang === 'en' ? en : ko
}

export function setLang(lang: Lang): void {
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // 저장이 막힌 환경에서도 현재 페이지에서는 전환된다
  }
  applyDocument(getContent())
  listeners.forEach((fn) => fn(getContent()))
}

export function toggleLang(): void {
  setLang(current === 'ko' ? 'en' : 'ko')
}

/** 언어가 바뀔 때마다 호출된다. 등록 즉시 현재 콘텐츠로 한 번 호출한다. */
export function onLangChange(fn: (c: Content) => void): () => void {
  listeners.add(fn)
  fn(getContent())
  return () => listeners.delete(fn)
}

/** 버튼 하나를 언어 토글로 만든다. 라벨은 "전환될 언어"를 보여준다. */
export function bindLangToggle(button: HTMLElement): void {
  button.addEventListener('click', toggleLang)
  onLangChange((c) => {
    button.textContent = c.ui.langToggle
    button.setAttribute('aria-label', c.lang === 'ko' ? 'Switch to English' : '한국어로 보기')
  })
}

function applyDocument(c: Content): void {
  document.documentElement.lang = c.lang
  document.title = c.meta.title
  document.querySelector('meta[name="description"]')?.setAttribute('content', c.meta.description)
}

applyDocument(getContent())
