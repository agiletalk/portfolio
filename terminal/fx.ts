// Text effects for Living Terminal: one shared rAF loop (createLoop) drives
// typing, decode-scramble and bar growth. Every effect has a "final state"
// path, so reduced motion simply never schedules jobs.

import { createLoop } from '../src/lib/motion'

type Job = (now: number) => boolean // return true when finished

const jobs = new Set<Job>()
const loop = createLoop(() => {
  const now = performance.now()
  for (const job of [...jobs]) {
    if (job(now)) jobs.delete(job)
  }
  // stop outside the rAF callback, otherwise createLoop re-arms the frame
  if (jobs.size === 0) queueMicrotask(() => { if (jobs.size === 0) loop.stop() })
})

export function run(job: Job): () => void {
  jobs.add(job)
  loop.start()
  // createLoop refuses to run under reduced motion; never leave jobs dangling
  if (!loop.running) queueMicrotask(() => { if (!loop.running) flush() })
  return () => jobs.delete(job)
}

function flush() {
  for (const job of [...jobs]) {
    job(Number.POSITIVE_INFINITY)
    jobs.delete(job)
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const end = performance.now() + ms
    run((now) => {
      if (now < end) return false
      resolve()
      return true
    })
  })
}

// ---------- width-safe glyph pools ----------
const WIDE_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏＀-｠￠-￦]/
const NARROW = '█▓▒░█▓▒░#%&*+=<>/\\0123456789abcdefxyzABCDEFXYZ'
const HANGUL_POOL = '가각간갈감갑강개객거건걸검겁게격견결경계고곡곤골공과관광괴교구국군굴궁권귀규균그극근글금급기긴길김깊까깨꼬꽃꿈끝나낙난날남납낭내냄너널네녀년념노녹논놀농뇌누눈뉴느늘능니다단달담답당대댁더덕던덜데도독돈돌동두둑둘뒤드득든들등디따때또뚜뜻라락란람랑래랭량러럭런럼레려력련렬령례로록론롤료루룩류륙률르른를름릉리린림립마막만말망매맥머먹멀메며면멸명모목몰못몽묘무묵문물미민밀바박반발방배백버번벌범법벽변별병보복본봉부북분불붕비빈빌빛사삭산살삼상새색생서석선설섬섭성세소속손솔송쇄수숙순술숭쉬스슬습승시식신실심십싸쌍써쏘쑥씨아악안알암압앙애액야약양어억언얼엄업엉에여역연열염엽영예오옥온올옹와완왕외요욕용우욱운울웅원월위유육윤율융으은을음읍응의이익인일임입잉자작잔잠잡장재쟁저적전절점접정제조족존졸종좌죄주죽준줄중즉증지직진질짐집징차착찬찰참창채책처척천철첨첩청체초촉촌총최추축춘출충취측층치칙친칠침카쾌타탁탄탈탐탑탕태택터토통퇴투특파판팔패팽퍼편평폐포폭표품풍프피필하학한할함합항해핵행향허헌험혁현혈협형혜호혹혼홀홍화확환활황회획효후훈휘휴흉흑흔흥희히'

export function isWide(ch: string): boolean {
  return WIDE_RE.test(ch)
}

function scrambleChar(ch: string): string {
  if (ch === ' ' || ch === '\n' || ch === '\t' || ch === ' ') return ch
  if (isWide(ch)) return HANGUL_POOL[(Math.random() * HANGUL_POOL.length) | 0]
  return NARROW[(Math.random() * NARROW.length) | 0]
}

export function scrambleString(s: string, revealed: number, window = Infinity): string {
  let out = ''
  const chars = Array.from(s)
  for (let i = 0; i < chars.length; i++) {
    if (i < revealed) out += chars[i]
    else if (i - revealed < window) out += scrambleChar(chars[i])
    else out += chars[i] === ' ' ? ' ' : scrambleChar(chars[i])
  }
  return out
}

// ---------- decode an entire subtree ----------
const busy = new WeakMap<Element, number>()

function textNodes(root: Element): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      const p = n.parentElement
      if (p && p.closest('[data-noscramble], .sr, script, style')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  while (walker.nextNode()) out.push(walker.currentNode as Text)
  return out
}

export interface DecodeOpts {
  /** total budget for the whole subtree in ms */
  duration?: number
  delay?: number
  /** ms between glyph refreshes, crisper when larger */
  tick?: number
}

/** Scramble every text node of `root` and settle into the original text. */
export function decode(root: Element, opts: DecodeOpts = {}): Promise<void> {
  const duration = opts.duration ?? 900
  const delay = opts.delay ?? 0
  const tick = opts.tick ?? 45
  const nodes = textNodes(root)
  if (!nodes.length) return Promise.resolve()
  const items = nodes.map((node) => ({ node, orig: node.nodeValue ?? '', len: Array.from(node.nodeValue ?? '').length }))
  const totalChars = items.reduce((s, it) => s + it.len, 0)
  // stagger nodes along the reading order; each node decodes left→right
  let acc = 0
  const plan = items.map((it) => {
    const start = (acc / totalChars) * duration * 0.55
    acc += it.len
    const dur = Math.min(duration - start, Math.max(180, it.len * 14))
    return { ...it, start, dur, last: -1e9 }
  })
  const section = root.closest('section')
  if (section) {
    busy.set(section, (busy.get(section) ?? 0) + 1)
    section.setAttribute('aria-busy', 'true')
  }

  return new Promise((resolve) => {
    const t0 = performance.now() + delay
    // first frame: everything scrambled
    for (const p of plan) p.node.nodeValue = scrambleString(p.orig, 0)
    run((now) => {
      const t = now - t0
      let done = true
      for (const p of plan) {
        const local = (t - p.start) / p.dur
        if (local >= 1) {
          if (p.node.nodeValue !== p.orig) p.node.nodeValue = p.orig
          continue
        }
        done = false
        if (now - p.last < tick) continue
        p.last = now
        const eased = local <= 0 ? 0 : 1 - Math.pow(1 - local, 2)
        p.node.nodeValue = scrambleString(p.orig, Math.floor(eased * p.len))
      }
      if (done) {
        if (section) {
          const n = (busy.get(section) ?? 1) - 1
          busy.set(section, n)
          if (n <= 0) section.removeAttribute('aria-busy')
        }
        resolve()
      }
      return done
    })
  })
}

// ---------- typewriter into an aria-hidden copy ----------
/**
 * `el` keeps the real text in a visually-hidden span at all times (so the
 * DOM always holds the complete string); a sibling aria-hidden span shows the
 * typed progress.
 */
export function setTyped(el: HTMLElement, text: string): { sr: HTMLElement; vis: HTMLElement } {
  let sr = el.querySelector<HTMLElement>(':scope > .sr')
  let vis = el.querySelector<HTMLElement>(':scope > .vis')
  let ghost = el.querySelector<HTMLElement>(':scope > .ghost')
  if (!sr || !vis || !ghost) {
    el.textContent = ''
    sr = document.createElement('span')
    sr.className = 'sr'
    // invisible full copy reserves the final layout so nothing below jumps
    ghost = document.createElement('span')
    ghost.className = 'ghost'
    ghost.setAttribute('aria-hidden', 'true')
    vis = document.createElement('span')
    vis.className = 'vis'
    vis.setAttribute('aria-hidden', 'true')
    el.append(sr, ghost, vis)
  }
  sr.textContent = text
  ghost.textContent = text
  vis.textContent = text
  return { sr, vis }
}

export function typeInto(el: HTMLElement, text: string, cps: number): Promise<void> {
  const { vis } = setTyped(el, text)
  const chars = Array.from(text)
  vis.textContent = ''
  el.classList.add('typing')
  return new Promise((resolve) => {
    const t0 = performance.now()
    let shown = 0
    run((now) => {
      if (el.dataset.cancel === '1') {
        delete el.dataset.cancel
        el.classList.remove('typing')
        resolve()
        return true
      }
      const n = Math.min(chars.length, Math.floor(((now - t0) / 1000) * cps))
      if (n !== shown) {
        shown = n
        vis.textContent = chars.slice(0, n).join('')
      }
      if (n >= chars.length) {
        vis.textContent = text
        el.classList.remove('typing')
        resolve()
        return true
      }
      return false
    })
  })
}
