import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { bindLangToggle, getContent, onLangChange } from '../../src/i18n'
import { prefersReducedMotion } from '../../src/lib/motion'
import type { CareerEntry, Content } from '../../src/content/types'
import { CommitField, type NameFont } from './particles'
import { chars, countable, esc, formatNumber, inlineCode, parseNumber, words } from './split'

gsap.registerPlugin(ScrollTrigger)

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[]

const reduced = prefersReducedMotion()
document.documentElement.classList.toggle('reduced', reduced)
document.documentElement.classList.toggle('motion', !reduced)

const pad = (n: number, len = 4) => String(n).padStart(len, '0')
const NAME_FONT: Record<Content['lang'], NameFont> = {
  ko: { style: '700 {size} "Noto Serif KR", serif', weight: '700', family: 'Noto Serif KR' },
  en: { style: 'italic 400 {size} "Instrument Serif", serif', weight: '400', family: 'Instrument Serif' },
}

// ---------------------------------------------------------------- hero field

const field = new CommitField({
  stage: $('#stage'),
  canvas: $<HTMLCanvasElement>('#field'),
  axis: $('#axis'),
  total: getContent().commits.total,
  byYear: getContent().commits.byYear,
})

// ---------------------------------------------------------------- smooth scroll

let lenis: Lenis | null = null
if (!reduced) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis?.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
}

document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest?.('a[href^="#"]') as HTMLAnchorElement | null
  if (!a) return
  const id = a.getAttribute('href')!
  const target = id === '#top' ? document.body : document.querySelector(id)
  if (!target) return
  e.preventDefault()
  if (lenis) lenis.scrollTo(target as HTMLElement, { offset: id === '#top' ? 0 : -64 })
  else (target as HTMLElement).scrollIntoView()
  if (target instanceof HTMLElement && id !== '#top') {
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }
})

// ---------------------------------------------------------------- render

function sectionHead(code: string, id: string, title: string): string {
  return `<header class="room-head">
    <span class="sign" aria-hidden="true"><span class="sign-code">${esc(code)}</span><span class="sign-arrow">→</span></span>
    <h2 class="room-title" id="${id}">${chars(title)}</h2>
  </header>`
}

function renderHero(c: Content): string {
  const years = c.commits.byYear
  const first = years[0].year
  const last = years[years.length - 1].year
  const wanted = c.career.find((e) => e.id === 'wanted')
  return `
    <div class="placard-main">
      <p class="cat">No. 0001 <span class="dot">·</span> ${first}—${last}</p>
      <h1 class="hero-name">${esc(c.profile.name)}</h1>
      <p class="hero-role">${esc(c.profile.role)}</p>
    </div>
    <p class="hero-intro">${esc(c.profile.intro)}</p>
    <div class="placard-count">
      <p class="hero-total"><span class="num" data-count="${c.commits.total.toLocaleString('en-US')}">${c.commits.total.toLocaleString('en-US')}</span></p>
      <p class="hero-total-label">${esc(c.stats[1]?.label ?? '')}${wanted ? ` <span class="dot">·</span> ${esc(wanted.company)}` : ''}</p>
      <p class="cat">${esc(c.commits.asOf)}</p>
    </div>
    <p class="hero-hint" aria-hidden="true"><span class="hint-line"></span>${esc(c.ui.scrollHint)}</p>`
}

function renderAbout(c: Content): string {
  const stats = c.stats
    .map(
      (s, i) => `<div class="stat">
        <span class="cat">No. ${pad(i + 2)}</span>
        <dt class="stat-label">${esc(s.label)}</dt>
        <dd class="stat-value">${statValue(s.value)}</dd>
        <span class="stat-rule" aria-hidden="true"></span>
      </div>`,
    )
    .join('')
  return `${sectionHead('00', 'about-title', c.ui.nav.about)}
    <div class="about-grid">
      <p class="about-lede kinetic">${words(c.profile.intro)}</p>
      <div class="about-bio">
        ${c.profile.bio.map((b) => `<p class="kinetic">${words(b)}</p>`).join('')}
        <p class="about-meta cat">${esc(c.profile.location)} <span class="dot">·</span> ${esc(c.profile.role)}</p>
      </div>
    </div>
    <dl class="stats">${stats}</dl>`
}

function statValue(v: string): string {
  const p = parseNumber(v)
  if (!p) return esc(v)
  return `<span class="num" data-count="${esc(v)}">${esc(v)}</span>`
}

function renderHall(c: Content, e: CareerEntry, i: number, total: number): string {
  const no = pad(i + 1, 2)
  const range = `${e.from} — ${e.to ?? c.ui.present}`
  const highlights = e.highlights
    .map(
      (h, k) => `<li class="exhibit">
        <span class="exhibit-rule" aria-hidden="true"></span>
        <span class="cat">No. ${pad((i + 1) * 100 + k + 1)}</span>
        <p class="exhibit-text">${countable(esc(h))}</p>
      </li>`,
    )
    .join('')
  const honors = e.honors
    .map(
      (h, k) => `<aside class="special">
        <div class="special-frame">
          <span class="special-mark" aria-hidden="true">✦</span>
          <p class="cat">S. ${no}-${pad(k + 1, 2)} <span class="dot">·</span> ${esc(e.company)} <span class="dot">·</span> ${esc(e.period)}</p>
          <p class="special-title">${chars(h)}</p>
        </div>
      </aside>`,
    )
    .join('')
  const annals = e.id === 'wanted' ? renderAnnals(c) : ''
  return `<article class="hall" id="hall-${no}" aria-labelledby="hall-${no}-title" data-hall="${i}">
    <div class="hall-num" aria-hidden="true"><span>${no}</span></div>
    <div class="hall-inner">
      <header class="hall-head">
        <p class="hall-plate"><span class="plate-no">Hall ${no}<span class="plate-of">/${pad(total, 2)}</span></span><span class="plate-range">${esc(range)}</span></p>
        <h3 class="hall-title" id="hall-${no}-title">${chars(e.company)}</h3>
        <p class="hall-role">${esc(e.role)} <span class="dot">·</span> ${esc(e.period)}</p>
      </header>
      <p class="hall-summary kinetic">${words(e.summary)}</p>
      <ol class="exhibits">${highlights}</ol>
      ${honors}
    </div>
    ${annals}
  </article>`
}

function renderAnnals(c: Content): string {
  const max = Math.max(...c.commits.byYear.map((y) => y.count))
  const last = c.commits.byYear[c.commits.byYear.length - 1].year
  const rooms = c.commits.byYear
    .map(
      (y, k) => `<li class="room-year${y.year === last ? ' is-current' : ''}" style="--v:${(y.count / max).toFixed(4)}">
        <span class="cat">R. ${pad(k + 1, 2)}</span>
        <span class="room-y">${y.year}</span>
        <span class="room-bar" aria-hidden="true"><span></span></span>
        <span class="room-count"><span class="num" data-count="${y.count.toLocaleString('en-US')}">${y.count.toLocaleString('en-US')}</span></span>
      </li>`,
    )
    .join('')
  return `<div class="annals">
    <div class="annals-head">
      <p class="cat">${esc(c.stats[1]?.label ?? '')} <span class="dot">·</span> ${c.commits.byYear[0].year}—${last}</p>
      <p class="annals-total"><span class="num" data-count="${c.commits.total.toLocaleString('en-US')}">${c.commits.total.toLocaleString('en-US')}</span></p>
    </div>
    <div class="annals-viewport"><ol class="annals-track">${rooms}</ol></div>
  </div>`
}

function renderCareer(c: Content): string {
  const halls = [...c.career].sort((a, b) => a.from - b.from)
  const n = halls.length
  return `${sectionHead(`01—${pad(n, 2)}`, 'career-title', c.ui.nav.career)}
    ${halls.map((e, i) => renderHall(c, e, i, n)).join('')}`
}

function renderProjects(c: Content): string {
  const cards = c.projects
    .map(
      (p, i) => `<li class="vitrine">
        <div class="plinth" aria-hidden="true">
          <span class="glyph">${esc(p.glyph)}</span>
          <span class="plinth-shadow"></span>
        </div>
        <div class="vitrine-label">
          <p class="cat">No. ${pad(201 + i)} <span class="dot">·</span> ${p.year}</p>
          <h3 class="vitrine-name">${esc(p.name)}</h3>
          <p class="vitrine-tagline">${esc(p.tagline)}</p>
          <p class="vitrine-desc">${inlineCode(esc(p.description))}</p>
          <ul class="stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
          <p class="vitrine-links">${p.links
            .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><span>${esc(l.label)}</span><span class="arr" aria-hidden="true">↗</span></a>`)
            .join('')}</p>
        </div>
      </li>`,
    )
    .join('')
  return `${sectionHead('B', 'projects-title', c.ui.nav.projects)}
    <ul class="vitrines">${cards}</ul>`
}

function renderSkills(c: Content): string {
  const title = c.skills.map((s) => s.group).join(' · ')
  const shelves = c.skills
    .map(
      (g, i) => `<div class="shelf">
        <p class="cat">C. ${pad(i + 1, 2)}</p>
        <h3 class="shelf-title">${esc(g.group)}</h3>
        <ul class="shelf-items">${g.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>
      </div>`,
    )
    .join('')
  return `${sectionHead('C', 'skills-title', title)}
    <div class="shelves">${shelves}</div>`
}

function renderContact(c: Content): string {
  return `${sectionHead('i', 'contact-title', c.ui.nav.contact)}
    <p class="contact-heading">${chars(c.contact.heading)}</p>
    <p class="contact-body kinetic">${words(c.contact.body)}</p>
    <p class="contact-mail"><a href="mailto:${esc(c.profile.email)}">${esc(c.profile.email)}<span class="arr" aria-hidden="true">→</span></a></p>
    <ul class="contact-links">${c.profile.links
      .map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}<span class="arr" aria-hidden="true">↗</span></a></li>`)
      .join('')}</ul>`
}

function renderExit(c: Content): string {
  return `<div class="exit-inner">
    <div class="exit-sign" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="40" height="40"><g fill="currentColor"><circle cx="27" cy="8" r="4"/><path d="M20 15l9 1 5 8 6 1-1 3-8-1-3-4-2 8 6 5 1 10h-4l-1-8-6-4-4 12h-4l5-16 1-7-4 2-2 6-3-1 3-8z"/></g><path d="M4 40h8" stroke="currentColor" stroke-width="3"/></svg>
      <span class="exit-word">EXIT</span>
      <span class="exit-arrow">→</span>
    </div>
    <div class="exit-cols">
      <p class="exit-name">${esc(c.profile.name)}</p>
      <p class="cat">${esc(c.profile.role)}</p>
      <p class="cat">${esc(c.profile.location)}</p>
    </div>
    <div class="exit-cols">
      <p class="cat">${c.commits.total.toLocaleString('en-US')} <span class="dot">·</span> ${esc(c.commits.asOf)}</p>
      <p><a class="exit-link" href="mailto:${esc(c.profile.email)}">${esc(c.profile.email)}</a></p>
      <p><a class="exit-link" href="../index.html">← ${esc(c.ui.backToConcepts)}</a></p>
    </div>
    <p class="exit-top"><a href="#top" class="exit-link">↑ No. 0001</a></p>
  </div>`
}

function render(c: Content) {
  $$('[data-nav]').forEach((a) => {
    const k = a.dataset.nav as keyof Content['ui']['nav']
    a.textContent = c.ui.nav[k]
  })
  $('[data-ui="backToConcepts"]').textContent = `← ${c.ui.backToConcepts}`
  $('#hero-placard').innerHTML = renderHero(c)
  $('#about').innerHTML = renderAbout(c)
  $('#career').innerHTML = renderCareer(c)
  $('#projects').innerHTML = renderProjects(c)
  $('#skills').innerHTML = renderSkills(c)
  $('#contact').innerHTML = renderContact(c)
  $('#exit').innerHTML = renderExit(c)
  const note = $('#rm-note')
  note.hidden = !reduced
  note.textContent = reduced ? c.ui.reducedMotionNote : ''
}

// ---------------------------------------------------------------- motion

let ctx: gsap.Context | null = null
let mm: gsap.MatchMedia | null = null

function countUp(el: HTMLElement, trigger: Element | null, extra: ScrollTrigger.Vars = {}) {
  const raw = el.dataset.count ?? el.textContent ?? ''
  const p = parseNumber(raw)
  if (!p) return
  const o = { v: 0 }
  el.textContent = formatNumber(p, 0)
  gsap.to(o, {
    v: p.value,
    duration: Math.min(2.4, 0.9 + Math.log10(p.value + 1) * 0.35),
    ease: 'power3.out',
    onUpdate: () => {
      el.textContent = formatNumber(p, o.v)
    },
    scrollTrigger: trigger ? { trigger, start: 'top 88%', once: true, ...extra } : undefined,
  })
}

function revealChars(el: Element, opts: { delay?: number; trigger?: Element; start?: string } = {}) {
  const chs = $$('.ch', el)
  if (!chs.length) return
  gsap.from(chs, {
    yPercent: 118,
    rotate: 6,
    duration: 1.15,
    ease: 'expo.out',
    stagger: Math.min(0.04, 0.6 / chs.length),
    delay: opts.delay ?? 0,
    scrollTrigger: { trigger: opts.trigger ?? el, start: opts.start ?? 'top 86%', once: true },
  })
}

function revealWords(el: Element) {
  const ws = $$('.wi', el)
  if (!ws.length) return
  gsap.from(ws, {
    yPercent: 105,
    opacity: 0,
    duration: 0.9,
    ease: 'power3.out',
    stagger: Math.min(0.03, 0.9 / ws.length),
    scrollTrigger: { trigger: el, start: 'top 88%', once: true },
  })
}

function buildMotion() {
  ctx = gsap.context(() => {
    // 헤더 진행선 — 관람 동선 표시
    gsap.to('.progress-bar', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.3 } })

    // 원티드 연간 전시실: 데스크톱은 가로로 핀 스크롤, 좁은 화면은 격자
    mm = gsap.matchMedia()
    mm.add('(min-width: 900px)', () => {
      const viewport = $('.annals-viewport')
      const track = $('.annals-track')
      if (!viewport || !track) return
      const dist = () => {
        const cs = getComputedStyle(viewport)
        const inner = viewport.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        return Math.max(0, track.scrollWidth - inner)
      }
      const tween = gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: {
          trigger: '.annals',
          start: 'top top+=72',
          end: () => `+=${dist() + window.innerHeight * 0.25}`,
          pin: true,
          scrub: 0.7,
          invalidateOnRefresh: true,
        },
      })
      $$('.room-year', track).forEach((room) => {
        const st = { trigger: room, containerAnimation: tween, start: 'left 92%', once: true }
        gsap.from($('.room-bar span', room), { scaleY: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: st })
        gsap.from($$('.cat, .room-y', room), { y: 30, opacity: 0, duration: 0.9, stagger: 0.06, ease: 'power3.out', scrollTrigger: st })
        $$('.num', room).forEach((n) => countUp(n, room, { containerAnimation: tween, start: 'left 92%' }))
      })
    })
    mm.add('(max-width: 899px)', () => {
      $$('.room-year').forEach((room, k) => {
        const st = { trigger: room, start: 'top 92%', once: true }
        gsap.from($('.room-bar span', room), { scaleY: 0, duration: 1.2, delay: (k % 4) * 0.06, ease: 'expo.out', scrollTrigger: st })
        $$('.num', room).forEach((n) => countUp(n, room))
      })
    })
    // 히어로 플라카드
    const placard = $('#hero-placard')
    gsap.from($$('.placard-main > *, .hero-intro, .placard-count > *, .hero-hint', placard), {
      y: 24,
      opacity: 0,
      duration: 1.1,
      ease: 'power3.out',
      stagger: 0.07,
      delay: 0.35,
    })
    $$('.num', placard).forEach((el) => countUp(el, null))

    // 히어로가 스크롤로 빠져나갈 때 점 풍경이 살짝 가라앉는다
    gsap.to('#stage', { yPercent: 14, opacity: 0.35, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })

    // 섹션 제목
    $$('.room-head').forEach((h) => {
      revealChars($('.room-title', h), { trigger: h })
      gsap.from($('.sign', h), { x: -30, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: h, start: 'top 86%', once: true } })
    })
    $$('.kinetic').forEach(revealWords)

    // 소개 — 숫자 플라카드
    $$('.stat').forEach((s, i) => {
      gsap.from(s, { y: 40, opacity: 0, duration: 1, ease: 'power3.out', delay: i * 0.08, scrollTrigger: { trigger: '.stats', start: 'top 88%', once: true } })
      gsap.from($('.stat-rule', s), { scaleX: 0, duration: 1.2, ease: 'expo.out', delay: 0.2 + i * 0.08, scrollTrigger: { trigger: '.stats', start: 'top 88%', once: true } })
      $$('.num', s).forEach((n) => countUp(n, $('.stats')))
    })

    // 전시실
    $$('.hall').forEach((hall) => {
      const num = $('.hall-num span', hall)
      gsap.fromTo(num, { yPercent: 35 }, { yPercent: -35, ease: 'none', scrollTrigger: { trigger: hall, start: 'top bottom', end: 'bottom top', scrub: true } })
      gsap.from(num, { opacity: 0, scale: 0.92, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: hall, start: 'top 80%', once: true } })
      const head = $('.hall-head', hall)
      gsap.from($$('.hall-plate > span', head), { y: 16, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: head, start: 'top 85%', once: true } })
      revealChars($('.hall-title', head), { trigger: head, delay: 0.15 })
      gsap.from($('.hall-role', head), { opacity: 0, y: 12, duration: 0.9, delay: 0.45, ease: 'power3.out', scrollTrigger: { trigger: head, start: 'top 85%', once: true } })

      $$('.exhibit', hall).forEach((ex) => {
        const st = { trigger: ex, start: 'top 90%', once: true }
        gsap.from($('.exhibit-rule', ex), { scaleX: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: st })
        gsap.from($$('.cat, .exhibit-text', ex), { x: -24, opacity: 0, duration: 0.9, stagger: 0.08, delay: 0.1, ease: 'power3.out', scrollTrigger: st })
        $$('.num', ex).forEach((n) => countUp(n, ex))
      })

      $$('.special', hall).forEach((sp) => {
        const st = { trigger: sp, start: 'top 85%', once: true }
        gsap.from($('.special-frame', sp), { clipPath: 'inset(50% 50% 50% 50%)', duration: 1.4, ease: 'expo.inOut', scrollTrigger: st })
        gsap.from($('.special-mark', sp), { rotate: -180, scale: 0, duration: 1.4, delay: 0.4, ease: 'back.out(1.6)', scrollTrigger: st })
        revealChars($('.special-title', sp), { trigger: sp, delay: 0.6, start: 'top 85%' })
      })
    })

    $$('.annals-total .num').forEach((n) => countUp(n, $('.annals')))

    // 동시대관 — 진열장
    ScrollTrigger.batch('.vitrine', {
      start: 'top 90%',
      once: true,
      onEnter: (els) =>
        gsap.from(els, { y: 60, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.1, overwrite: true }),
    })
    $$('.vitrine').forEach((v) => {
      const glyph = $('.glyph', v)
      gsap.fromTo(glyph, { yPercent: 40 }, { yPercent: -40, ease: 'none', scrollTrigger: { trigger: v, start: 'top bottom', end: 'bottom top', scrub: true } })
    })

    // 수장고
    $$('.shelf').forEach((s, i) => {
      gsap.from($$('.shelf-items li', s), { y: 18, opacity: 0, duration: 0.7, stagger: 0.04, delay: i * 0.1, ease: 'power3.out', scrollTrigger: { trigger: s, start: 'top 88%', once: true } })
    })

    // 연락
    revealChars($('.contact-heading'), { start: 'top 88%' })
    gsap.from('.contact-mail, .contact-links li', { y: 24, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out', scrollTrigger: { trigger: '.contact-mail', start: 'top 92%', once: true } })

    // 출구
    gsap.from('.exit-sign', { y: 30, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '#exit', start: 'top 92%', once: true } })

    // 현재 전시실 표시
    ;(['about', 'career', 'projects', 'contact'] as const).forEach((id) => {
      const link = $(`[data-nav="${id}"]`)
      ScrollTrigger.create({
        trigger: `#${id}`,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => link.classList.toggle('is-here', self.isActive),
      })
    })

  })
}

function teardown() {
  mm?.revert()
  ctx?.revert()
  mm = null
  ctx = null
}

// ---------------------------------------------------------------- boot

bindLangToggle($('[data-lang-toggle]'))

let booted = false
onLangChange((c) => {
  const y = window.scrollY
  teardown()
  render(c)
  field.showName(c.profile.name, NAME_FONT[c.lang])
  if (!reduced) {
    buildMotion()
    ScrollTrigger.refresh()
    if (booted) {
      // 리렌더 직후 핀 간격이 다시 계산되며 생기는 점프를 되돌린다
      lenis?.scrollTo(y, { immediate: true, force: true })
    }
  }
  booted = true
})

// 폰트가 늦게 도착하면 레이아웃이 바뀌므로 트리거 위치를 다시 잰다
document.fonts?.ready.then(() => !reduced && ScrollTrigger.refresh())
