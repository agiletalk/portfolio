// 키네틱 타이포용 글자/단어 분할. 언어가 바뀌면 마크업을 새로 만들기 때문에
// 상태를 들고 있지 않는 순수 함수로 둔다.

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 글자 단위 — 제목용. 스크린리더는 aria-label로 원문을 읽는다. */
export function chars(text: string): string {
  const words = text.split(/(\s+)/)
  const inner = words
    .map((w) => {
      if (/^\s+$/.test(w)) return ' '
      const cs = Array.from(w)
        .map((ch) => `<span class="ch">${esc(ch)}</span>`)
        .join('')
      return `<span class="sw">${cs}</span>`
    })
    .join('')
  return `<span class="split" aria-hidden="true">${inner}</span><span class="sr">${esc(text)}</span>`
}

/** 단어 단위 — 본문용. 단어 사이 공백은 실제 텍스트로 남아 읽기에 지장이 없다. */
export function words(text: string, transform: (s: string) => string = esc): string {
  return text
    .split(/(\s+)/)
    .map((w) => (/^\s+$/.test(w) ? ' ' : `<span class="wd"><span class="wi">${transform(w)}</span></span>`))
    .join('')
}

/** "352%" 같은 수치를 카운트업 가능한 span으로 감싼다 (이미 escape된 문자열에 적용). */
export function countable(escaped: string): string {
  return escaped.replace(/(\d[\d,]*)(?=%)/g, (m) => `<span class="num" data-count="${m}">${m}</span>`)
}

/** 백틱 구간을 <code>로 (escape 이후) */
export function inlineCode(escaped: string): string {
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
}

export interface Parsed {
  prefix: string
  value: number
  suffix: string
  commas: boolean
}

export function parseNumber(s: string): Parsed | null {
  const m = s.match(/^(\D*)(\d[\d,]*)(.*)$/)
  if (!m) return null
  return { prefix: m[1], value: Number(m[2].replace(/,/g, '')), suffix: m[3], commas: m[2].includes(',') }
}

export function formatNumber(p: Parsed, v: number): string {
  const r = Math.round(v)
  return p.prefix + (p.commas ? r.toLocaleString('en-US') : String(r)) + p.suffix
}
