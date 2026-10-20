// ① Deep Dive — 어항 속으로 잠수하기.
// 수면(2026)에서 해저(2010)까지, 스크롤 = 잠수 = 시간 역행.

import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { bindLangToggle, getContent, onLangChange } from '../../src/i18n'
import type { CareerEntry, Content, Project } from '../../src/content/types'
import { createLoop, pick, prefersReducedMotion } from '../../src/lib/motion'
import { createCaustics } from './caustics'
import { createSchool } from './boids'
import { createTank, lookFor } from './species'
import { createCommitScene, UNIT } from './commits'

const reduced = prefersReducedMotion()
document.documentElement.classList.add(reduced ? 'reduced' : 'motion')

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => {
  const el = root.querySelector<T>(sel)
  if (!el) throw new Error(`missing ${sel}`)
  return el
}
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text != null) el.textContent = text
  return el
}

// 모든 문구는 Content에서. 숫자·연도도 콘텐츠에서 계산한다.
const first = getContent()
const latestYear = Math.max(...first.commits.byYear.map((y) => y.year), ...first.projects.map((p) => p.year))
const earliestYear = Math.min(...first.career.map((c) => c.from))
const MAX_DEPTH = (latestYear - earliestYear) * 10 // 1년 = 10m
const fmt = (n: number) => n.toLocaleString('en-US')

/** `코드`를 <code>로 바꾸며 텍스트 노드로만 채운다 (glyph 같은 <, > 안전) */
function setRich(el: HTMLElement, text: string) {
  el.replaceChildren()
  text.split(/`([^`]+)`/).forEach((part, i) => {
    if (!part) return
    el.append(i % 2 ? h('code', undefined, part) : document.createTextNode(part))
  })
}

// ---------------------------------------------------------------- DOM 골격 (한 번만)

const sortedCareer = (c: Content) => [...c.career].sort((a, b) => b.from - a.from)

const strata = $('#strata')
const careerNodes = new Map<string, ReturnType<typeof buildStratum>>()
let commitNodes: { total: HTMLElement; label: HTMLElement; meta: HTMLElement; stage: HTMLElement; canvas: HTMLCanvasElement } | null = null

function buildStratum(entry: CareerEntry) {
  const li = h('li', 'stratum')
  li.dataset.reveal = ''
  li.dataset.id = entry.id
  const years = h('p', 'stratum__years mono')
  years.setAttribute('aria-hidden', 'true')
  const period = h('span', 'stratum__period')
  const head = h('div', 'stratum__head')
  const company = h('h3', 'stratum__company')
  const role = h('span', 'stratum__role')
  head.append(company, role)
  const summary = h('p', 'stratum__summary')
  const hl = h('ul', 'stratum__hl')
  const honors = h('ul', 'stratum__honors')
  li.append(years, period, head, summary, hl, honors)
  return { li, years, period, company, role, summary, hl, honors }
}

for (const entry of sortedCareer(first)) {
  const n = buildStratum(entry)
  careerNodes.set(entry.id, n)
  strata.append(n.li)
  // 원티드(진행 중인 경력) 수심대 안에 커밋 기포 장면을 둔다
  if (entry.to === null && !commitNodes) {
    const wrap = h('div', 'commits')
    const top = h('div', 'commits__top')
    const left = h('div')
    const total = h('p', 'commits__total')
    const label = h('span', 'commits__label')
    left.append(total, label)
    const meta = h('p', 'commits__meta')
    meta.setAttribute('aria-hidden', 'true')
    top.append(left, meta)
    const stage = h('div', 'commits__stage')
    const canvas = h('canvas', 'commits__canvas')
    canvas.setAttribute('aria-hidden', 'true')
    stage.append(canvas)
    const years = h('ol', 'commits__years')
    for (const y of first.commits.byYear) {
      const li = h('li')
      li.append(h('b', undefined, String(y.year)), h('span', undefined, fmt(y.count)))
      years.append(li)
    }
    wrap.append(top, stage, years)
    n.li.insertBefore(wrap, n.honors.nextSibling)
    commitNodes = { total, label, meta, stage, canvas }
  }
}

const speciesList = $('#species')
const speciesNodes = new Map<string, { btn: HTMLButtonElement; glyph: HTMLElement; name: HTMLElement; tag: HTMLElement }>()
first.projects.forEach((p, i) => {
  const li = h('li')
  li.dataset.reveal = ''
  const btn = h('button', 'species__btn')
  btn.type = 'button'
  btn.dataset.id = p.id
  const sw = h('span', 'species__swatch')
  sw.style.background = lookFor(p.id, i).swatch
  sw.setAttribute('aria-hidden', 'true')
  const glyph = h('span', 'species__glyph')
  glyph.setAttribute('aria-hidden', 'true')
  const name = h('span', 'species__name')
  const tag = h('span', 'species__tag')
  btn.append(sw, glyph, name, tag)
  li.append(btn)
  speciesList.append(li)
  speciesNodes.set(p.id, { btn, glyph, name, tag })
  btn.addEventListener('click', () => openCard(p.id))
  btn.addEventListener('pointerenter', () => tank.setHot(p.id))
  btn.addEventListener('pointerleave', () => tank.setHot(null))
  btn.addEventListener('focus', () => tank.setHot(p.id))
  btn.addEventListener('blur', () => tank.setHot(null))
})

// ---------------------------------------------------------------- 텍스트 렌더 (언어 전환마다)

const texts: Record<string, (c: Content) => string> = {
  back: (c) => c.ui.backToConcepts,
  'nav.about': (c) => c.ui.nav.about,
  'nav.career': (c) => c.ui.nav.career,
  'nav.projects': (c) => c.ui.nav.projects,
  'nav.contact': (c) => c.ui.nav.contact,
  name: (c) => c.profile.name,
  role: (c) => c.profile.role,
  intro: (c) => c.profile.intro,
  scrollHint: (c) => c.ui.scrollHint,
}

let currentCard: string | null = null
let countShown = -1

function render(c: Content) {
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
    const fn = texts[el.dataset.t ?? '']
    if (fn) el.textContent = fn(c)
  })

  const note = $('#rmNote')
  note.textContent = c.ui.reducedMotionNote
  note.hidden = !reduced

  // 소개 + 숫자 + 기술
  $('#bio').replaceChildren(...c.profile.bio.map((p) => h('p', undefined, p)))
  $('#stats').replaceChildren(...c.stats.map((s) => {
    const d = h('div')
    d.append(h('dt', undefined, s.label), h('dd', undefined, s.value))
    return d
  }))
  $('#skills').replaceChildren(...c.skills.map((g) => {
    const d = h('div')
    const ul = h('ul')
    ul.append(...g.items.map((it) => h('li', undefined, it)))
    d.append(h('h3', undefined, g.group), ul)
    return d
  }))

  // 프로젝트
  for (const p of c.projects) {
    const n = speciesNodes.get(p.id)
    if (!n) continue
    n.glyph.textContent = p.glyph
    n.name.textContent = p.name
    n.tag.textContent = p.tagline
    n.btn.setAttribute('aria-haspopup', 'dialog')
  }
  tank.setLabels(c.projects.map((p) => ({ id: p.id, name: p.name, glyph: p.glyph })))
  if (currentCard) fillCard(c, currentCard)

  // 경력
  for (const e of sortedCareer(c)) {
    const n = careerNodes.get(e.id)
    if (!n) continue
    n.years.textContent = `${e.from}`
    n.period.textContent = e.period
    n.company.textContent = e.company
    n.role.textContent = e.role
    n.summary.textContent = e.summary
    n.hl.replaceChildren(...e.highlights.map((x) => h('li', undefined, x)))
    n.honors.replaceChildren(...e.honors.map((x) => h('li', undefined, x)))
    n.honors.hidden = e.honors.length === 0
  }
  if (commitNodes) {
    const totalStr = fmt(c.commits.total)
    commitNodes.label.textContent = c.stats.find((s) => s.value === totalStr)?.label ?? ''
    const ys = c.commits.byYear
    commitNodes.meta.textContent = `○ = ${UNIT} · ${ys[0].year}–${ys[ys.length - 1].year} · ${c.commits.asOf}`
    countShown = -1
    paintCount()
  }

  // 연락
  $('#contactH').textContent = c.contact.heading
  $('#contactBody').textContent = c.contact.body
  const mail = $<HTMLAnchorElement>('#mail')
  mail.href = `mailto:${c.profile.email}`
  mail.textContent = c.profile.email
  $('#contactLinks').replaceChildren(...c.profile.links.map((l) => {
    const li = h('li')
    const a = h('a', undefined, l.label)
    a.href = l.url
    a.target = '_blank'
    a.rel = 'noopener'
    li.append(a)
    return li
  }))
  $('#loc').textContent = c.profile.location

  // 닫기 버튼의 접근성 이름 (화면에는 ✕만 보인다)
  $('.card__close').setAttribute('aria-label', c.lang === 'ko' ? '닫기' : 'Close')
  reveal.rescan()
  scheduleLayout()
}

// ---------------------------------------------------------------- 프로젝트 카드

const card = $<HTMLDialogElement>('#card')

function fillCard(c: Content, id: string) {
  const p: Project | undefined = c.projects.find((x) => x.id === id)
  if (!p) return
  $('#cardGlyph').textContent = p.glyph
  $('#cardYear').textContent = String(p.year)
  $('#cardName').textContent = p.name
  $('#cardTagline').textContent = p.tagline
  setRich($('#cardDesc'), p.description)
  $('#cardStack').replaceChildren(...p.stack.map((s) => h('li', undefined, s)))
  $('#cardLinks').replaceChildren(...p.links.map((l) => {
    const li = h('li')
    const a = h('a', undefined, `${l.label} ↗`)
    a.href = l.url
    a.target = '_blank'
    a.rel = 'noopener'
    li.append(a)
    return li
  }))
}

function openCard(id: string) {
  currentCard = id
  fillCard(getContent(), id)
  if (!card.open) card.showModal()
  lenis?.stop()
}
card.addEventListener('close', () => {
  currentCard = null
  lenis?.start()
})
card.addEventListener('click', (e) => {
  // 카드 바깥(backdrop) 클릭으로 닫기
  const r = card.getBoundingClientRect()
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) card.close()
})

// ---------------------------------------------------------------- 떠오름 연출

const reveal = (() => {
  const io = reduced ? null : new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io?.unobserve(e.target) }
  }, { rootMargin: '0px 0px -8% 0px' })
  return {
    rescan() {
      document.querySelectorAll('[data-reveal]:not(.in)').forEach((el) => {
        if (!io) el.classList.add('in')
        else io.observe(el)
      })
    },
  }
})()

// ---------------------------------------------------------------- 캔버스들

const vh = () => window.innerHeight
const caustics = createCaustics($<HTMLCanvasElement>('#caustics'))
const school = createSchool(
  $<HTMLCanvasElement>('#school'),
  pick({ low: 46, mid: 90, high: 150 }),
  pick({ low: 40, mid: 70, high: 110 }),
)
const tankEl = $('#tank')
const tank = createTank($<HTMLCanvasElement>('#tankCanvas'), first.projects.map((p) => ({ id: p.id, name: p.name, glyph: p.glyph })), {
  onPick: (id) => openCard(id),
  onHover: (id) => speciesNodes.forEach((n, key) => n.btn.classList.toggle('is-hot', key === id)),
})
const scene = commitNodes ? createCommitScene(commitNodes.canvas, first.commits.byYear) : null

function paintCount() {
  if (!commitNodes || !scene) return
  const total = getContent().commits.total
  // 장면이 시작되기 전에는 최종 값을 보여준다 (시작하면 0부터 다시 차오른다)
  const k = scene.started ? scene.progress : 1
  const eased = 1 - Math.pow(1 - k, 3)
  const v = Math.round(total * eased)
  if (v === countShown) return
  countShown = v
  commitNodes.total.textContent = fmt(v)
}

// ---------------------------------------------------------------- 수심계 · 수심-연도 앵커

const gaugeDepth = $('#gaugeDepth')
const gaugeYear = $('#gaugeYear')
const gaugeFill = $('#gaugeFill')
const gaugeDot = $('#gaugeDot')
let anchors: { y: number; year: number }[] = []
let maxScroll = 1
let lastGauge = ''

const docTop = (el: Element) => el.getBoundingClientRect().top + (lenis ? lenis.scroll : window.scrollY)

function measureLayout() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vh())
  const list: { y: number; year: number }[] = [{ y: 0, year: latestYear }]
  for (const id of ['about', 'projects', 'career']) list.push({ y: docTop($(`#${id}`)), year: latestYear })
  for (const e of sortedCareer(getContent())) {
    const li = careerNodes.get(e.id)?.li
    if (!li) continue
    const top = docTop(li)
    list.push({ y: top, year: e.to ?? latestYear }, { y: top + li.offsetHeight, year: e.from })
  }
  list.push({ y: docTop($('#contact')), year: earliestYear })
  anchors = list.sort((a, b) => a.y - b.y)
  document.querySelectorAll<HTMLElement>('.band').forEach((band) => {
    const d = Math.round((Math.min(maxScroll, docTop(band)) / maxScroll) * MAX_DEPTH)
    const slot = band.querySelector('[data-depth]')
    if (slot) slot.textContent = String(d)
  })
  lastGauge = ''
}

function yearAt(scroll: number) {
  const probe = scroll + vh() * 0.5
  if (!anchors.length) return latestYear
  if (probe <= anchors[0].y) return anchors[0].year
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i]
    if (probe <= b.y) return a.year + (b.year - a.year) * ((probe - a.y) / Math.max(1, b.y - a.y))
  }
  return anchors[anchors.length - 1].year
}

function updateGauge(scroll: number) {
  const k = Math.min(1, Math.max(0, scroll / maxScroll))
  const depth = Math.round(k * MAX_DEPTH)
  const year = Math.round(yearAt(scroll))
  const key = `${depth}|${year}|${Math.round(k * 400)}`
  if (key === lastGauge) return
  lastGauge = key
  gaugeDepth.textContent = depth === 0 ? "0m" : `−${depth}m`
  gaugeYear.textContent = String(year)
  gaugeFill.style.height = `${k * 100}%`
  gaugeDot.style.top = `${k * 100}%`
}

let layoutTimer = 0
function scheduleLayout() {
  clearTimeout(layoutTimer)
  layoutTimer = window.setTimeout(() => {
    measureLayout()
    if (!reduced) ScrollTrigger.refresh()
    updateGauge(lenis ? lenis.scroll : window.scrollY)
  }, 120)
}

// ---------------------------------------------------------------- 스크롤 · 루프

let lenis: Lenis | null = null

if (!reduced) {
  gsap.registerPlugin(ScrollTrigger)
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)

  // 수면을 떠나는 순간: 이름이 천천히 위로 멀어지고 흐려진다
  gsap.to('#heroInner', {
    y: () => -vh() * 0.28, opacity: 0, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 15%', scrub: true },
  })
  gsap.to('.hero__hint', {
    opacity: 0, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: '25% top', scrub: true },
  })

  const main = createLoop((dt, t) => {
    lenis?.raf(t * 1000)
    const y = lenis ? lenis.scroll : window.scrollY
    updateGauge(y)
    school.step(dt, t, y)
    school.draw(t, y)
    caustics.render(t, y / vh())
  })
  main.start()

  createLoop((dt, t) => { tank.step(dt, t); tank.draw(t) }, { visibleTarget: tankEl }).start()

  if (scene && commitNodes) {
    const stage = commitNodes.stage
    createLoop((dt, t) => { scene.step(dt, t); scene.draw(t); paintCount() }, { visibleTarget: stage }).start()
    // createLoop의 t는 rAF 타임스탬프(초) — performance.now()와 같은 시간축이다
    new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        scene.play(performance.now() / 1000)
        obs.disconnect()
      }
    }, { threshold: 0.45 }).observe(stage)
  }

  // 커서로 떼를 부르고, 클릭/탭으로 먹이를 준다
  const hero = $('#hero')
  window.addEventListener('pointermove', (e) => {
    const y = lenis ? lenis.scroll : window.scrollY
    school.pointer(e.clientX, e.clientY + y, e.clientY + y < vh() * 1.05)
  }, { passive: true })
  document.addEventListener('pointerleave', () => school.pointer(0, 0, false))
  hero.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button')) return
    const y = lenis ? lenis.scroll : window.scrollY
    school.feed(e.clientX, e.clientY + y)
  })

  // 섹션 링크는 Lenis로 천천히 잠수/부상
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector<HTMLElement>(a.getAttribute('href') ?? '')
      if (!target || !lenis) return
      e.preventDefault()
      lenis.scrollTo(target, { duration: 1.8, easing: (x) => 1 - Math.pow(1 - x, 4) })
      target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    })
  })
} else {
  // 모션 줄이기: 같은 어항의 정지 화면 한 장
  const still = () => {
    let t = 0
    for (let i = 0; i < 360; i++) { t += 1 / 60; school.step(1 / 60, t, 0) }
    school.draw(t, 0)
    caustics.render(7.5, 0)
    for (let i = 0; i < 30; i++) tank.step(1 / 60, i / 60)
    tank.draw(0)
    if (scene) { scene.finish(); scene.draw(0) }
    paintCount()
  }
  still()
  let rt = 0
  window.addEventListener('resize', () => {
    clearTimeout(rt)
    rt = window.setTimeout(() => {
      school.resize(); caustics.resize(); tank.resize(); scene?.resize(); still()
    }, 150)
  })
}

window.addEventListener('resize', () => {
  if (reduced) return
  school.resize(); caustics.resize(); tank.resize(); scene?.resize()
  scheduleLayout()
})
new ResizeObserver(() => scheduleLayout()).observe(document.body)
document.fonts?.ready.then(() => scheduleLayout())

// ---------------------------------------------------------------- 언어

$('#heroYear').textContent = String(latestYear)
bindLangToggle($('[data-lang-toggle]'))
onLangChange(render)
measureLayout()
updateGauge(window.scrollY)
