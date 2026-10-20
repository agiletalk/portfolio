import Lenis from 'lenis'
import type { Content } from '../src/content/types'
import { bindLangToggle, onLangChange } from '../src/i18n'
import { bindThemeToggle } from '../src/theme'
import { createLoop, prefersReducedMotion } from '../src/lib/motion'
import { createAquarium } from './aquarium'
import { decode, run, setTyped, typeInto, wait } from './fx'

const reduced = prefersReducedMotion()
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** short, stable, decorative commit hash derived from an id */
function hash7(id: string): string {
  let h = 0x811c9dc5
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  let h2 = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  return (h.toString(16).padStart(8, '0') + h2.toString(16)).slice(0, 7)
}

const fmt = (n: number) => n.toLocaleString('en-US')

// ---------------------------------------------------------------- renderers

function renderAbout(c: Content): string {
  const p = c.profile
  return `
    <pre class="faint fm" data-noscramble>---</pre>
    <dl class="kv fm-kv">
      <dt>name</dt><dd>${esc(p.name)}</dd>
      <dt>role</dt><dd>${esc(p.role)}</dd>
      <dt>location</dt><dd>$HOME</dd>
    </dl>
    <pre class="faint fm" data-noscramble>---</pre>
    <div class="about-bio">${p.bio.map((b) => `<p>${esc(b)}</p>`).join('')}</div>
    <dl class="kv stats">${c.stats.map((s) => `<dt>${esc(s.value)}</dt><dd>${esc(s.label)}</dd>`).join('')}</dl>`
}

function renderCareer(c: Content): string {
  const entries = [...c.career].sort((a, b) => b.from - a.from || (b.to ?? 9999) - (a.to ?? 9999))
  return `<ol class="glog">${entries
    .map((e) => {
      const ref = e.to === null
        ? `<span class="c-ref">(<span class="br">HEAD -&gt; main</span>)</span>`
        : `<span class="c-ref">(tag: ${esc(e.id)})</span>`
      return `<li class="commit">
        <span class="rail" aria-hidden="true" data-noscramble>*</span>
        <div class="commit-body">
          <h3 class="c-head"><span class="c-hash" data-noscramble>${hash7(e.id)}</span> ${ref} <span class="c-company">${esc(e.company)}</span></h3>
          <p class="c-meta"><b>Role:</b> ${esc(e.role)}</p>
          <p class="c-meta"><b>Date:</b> ${esc(e.period)}</p>
          <p class="c-sum">${esc(e.summary)}</p>
          <ul class="c-list">
            ${e.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}
            ${e.honors.map((h) => `<li class="honor">${esc(h)}</li>`).join('')}
          </ul>
        </div>
      </li>`
    })
    .join('')}</ol>`
}

function commitsCaption(c: Content): string {
  const total = fmt(c.commits.total)
  return c.stats.find((s) => s.value === total)?.label ?? ''
}

function renderCommits(c: Content): string {
  const max = Math.max(...c.commits.byYear.map((y) => y.count))
  return `<ul class="chart">${c.commits.byYear
    .map((y) => `<li class="${y.count === max ? 'peak' : ''}" data-count="${y.count}">
        <span class="yr">${y.year}</span>
        <span class="row"><span class="bar" aria-hidden="true" data-noscramble></span><span class="cnt">${fmt(y.count)}</span></span>
      </li>`)
    .join('')}</ul>
    <p class="chart-foot"><span data-noscramble>Σ</span> ${fmt(c.commits.total)} · ${esc(commitsCaption(c))} · ${esc(c.commits.asOf)}</p>`
}

let openProject: string | null = null

function inlineCode(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderProjects(c: Content): string {
  return `<p class="ls-total">total ${c.projects.length}</p>
  <ul class="ls">${c.projects
    .map((p) => {
      const open = p.id === openProject
      return `<li>
        <button type="button" class="ls-row" aria-expanded="${open}" aria-controls="pd-${p.id}" data-id="${p.id}">
          <span class="perm" aria-hidden="true" data-noscramble>drwxr-xr-x</span>
          <span class="glyph" aria-hidden="true" data-noscramble>${esc(p.glyph)}</span>
          <span class="pname">${esc(p.name)}</span>
          <span class="yr">${p.year}</span>
          <span class="tag">${esc(p.tagline)}<span class="open">[${esc(c.ui.viewProject)}]</span></span>
        </button>
        <div class="detail" id="pd-${p.id}" ${open ? '' : 'hidden'}>
          <p class="sub"><span class="ps1" data-noscramble>$</span> cat projects/${esc(p.id)}/README.md</p>
          <p>${inlineCode(p.description)}</p>
          <ul class="chips" aria-label="stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
          <p class="links">${p.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</p>
        </div>
      </li>`
    })
    .join('')}</ul>`
}

function renderSkills(c: Content): string {
  const groups = c.skills
    .map((g, gi) => {
      const items = g.items
        .map((it, i) => `<span class="item"><span class="s">"${esc(it)}"</span>${i < g.items.length - 1 ? '<span class="p">, </span>' : ''}</span>`)
        .join('')
      return `<span class="grp"><span class="k">"${esc(g.group)}"</span><span class="p">: [</span></span><span class="items">${items}</span><span class="grp"><span class="p">]${gi < c.skills.length - 1 ? ',' : ''}</span></span>`
    })
    .join('')
  return `<pre class="json"><span class="p" data-noscramble>{</span>${groups}<span class="p" data-noscramble>}</span></pre>`
}

function renderContact(c: Content): string {
  const p = c.profile
  return `<h3 class="contact-h">${esc(c.contact.heading)}</h3>
    <p class="contact-body">${esc(c.contact.body)}</p>
    <dl class="contact-kv">
      <dt>email</dt><dd><a class="mail" href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd>
      ${p.links.map((l) => `<dt>${esc(l.label)}</dt><dd><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url.replace(/^https?:\/\//, ''))}</a></dd>`).join('')}
    </dl>`
}

const sections: { id: string; render: (c: Content) => string }[] = [
  { id: 'about', render: renderAbout },
  { id: 'career', render: renderCareer },
  { id: 'commits', render: renderCommits },
  { id: 'projects', render: renderProjects },
  { id: 'skills', render: renderSkills },
  { id: 'contact', render: renderContact },
]

// ---------------------------------------------------------------- bar chart

let barsGrown = reduced
let barsAnimating = false

function chUnit(el: HTMLElement): number {
  const probe = document.createElement('span')
  probe.textContent = '0000000000'
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
  el.appendChild(probe)
  const w = probe.getBoundingClientRect().width / 10
  probe.remove()
  return w || 9
}

function barLengths(): { el: HTMLElement; n: number }[] {
  const chart = document.querySelector<HTMLElement>('#out-commits .chart')
  if (!chart) return []
  const ch = chUnit(chart)
  const rowsEls = [...chart.querySelectorAll<HTMLElement>('li')]
  const max = Math.max(...rowsEls.map((li) => Number(li.dataset.count)))
  const rowW = rowsEls[0]?.querySelector<HTMLElement>('.row')?.getBoundingClientRect().width ?? 300
  const avail = Math.max(6, Math.floor(rowW / ch) - 7)
  return rowsEls.map((li) => ({
    el: li.querySelector<HTMLElement>('.bar')!,
    n: Math.max(1, Math.round((Number(li.dataset.count) / max) * Math.min(avail, 64))),
  }))
}

function setBarsFinal() {
  for (const b of barLengths()) b.el.textContent = '█'.repeat(b.n)
}

function growBars() {
  const bars = barLengths()
  barsAnimating = true
  const t0 = performance.now()
  for (const b of bars) b.el.textContent = ''
  run((now) => {
    let done = true
    bars.forEach((b, i) => {
      const local = Math.min(1, Math.max(0, (now - t0 - i * 55) / 750))
      if (local < 1) done = false
      const eased = 1 - Math.pow(1 - local, 3)
      const len = eased * b.n
      const full = Math.floor(len)
      const frac = len - full
      const edge = local >= 1 || full >= b.n ? '' : frac > 0.66 ? '▓' : frac > 0.33 ? '▒' : frac > 0 ? '░' : ''
      b.el.textContent = '█'.repeat(full) + edge
    })
    if (done) {
      barsAnimating = false
      barsGrown = true
      setBarsFinal()
    }
    return done
  })
}

// ---------------------------------------------------------------- hero

let heroState: 'idle' | 'typing' | 'done' = reduced ? 'done' : 'idle'
const heroEls = () => ({
  cmd: $('#cmd-whoami'),
  name: $('#hero-name'),
  role: $('#hero-role'),
  intro: $('#hero-intro'),
})

function heroTexts(c: Content) {
  return { cmd: 'whoami', name: c.profile.name, role: c.profile.role, intro: c.profile.intro }
}

async function playHero(c: Content) {
  heroState = 'typing'
  const els = heroEls()
  const tx = heroTexts(c)
  // the real strings go into the DOM immediately (visually-hidden copies)
  for (const k of ['cmd', 'name', 'role', 'intro'] as const) {
    const { vis } = setTyped(els[k], tx[k])
    vis.textContent = ''
  }
  await wait(250)
  await typeInto(els.cmd, tx.cmd, 13)
  if (heroState !== 'typing') return
  await wait(180)
  if (heroState !== 'typing') return
  const nameVis = setTyped(els.name, heroTexts(currentContent).name).vis
  await decode(nameVis, { duration: 420, tick: 40 })
  if (heroState !== 'typing') return
  await typeInto(els.role, heroTexts(currentContent).role, 70)
  if (heroState !== 'typing') return
  await wait(120)
  await typeInto(els.intro, heroTexts(currentContent).intro, 75)
  heroState = 'done'
}

function updateHero(c: Content, animate: boolean) {
  const els = heroEls()
  const tx = heroTexts(c)
  if (heroState === 'typing') {
    // language switched mid-intro: stop typing and show everything
    heroState = 'done'
    for (const k of ['cmd', 'role', 'intro'] as const) els[k].dataset.cancel = '1'
  }
  for (const k of ['cmd', 'name', 'role', 'intro'] as const) {
    const { vis } = setTyped(els[k], tx[k])
    els[k].classList.remove('typing')
    if (animate && k !== 'cmd') decode(vis, { duration: k === 'intro' ? 520 : 360, tick: 40 })
  }
}

// ---------------------------------------------------------------- sections

const revealed = new Set<string>()

function inView(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.top < window.innerHeight
}

function revealSection(sec: HTMLElement) {
  if (revealed.has(sec.id)) return
  revealed.add(sec.id)
  if (reduced) return
  const cmd = sec.querySelector<HTMLElement>('.cmd-text')
  const n = cmd ? Array.from(cmd.textContent ?? '').length : 8
  const dur = Math.min(650, n * 26)
  sec.style.setProperty('--n', String(n))
  sec.style.setProperty('--dur', `${dur}ms`)
  sec.classList.add('typing')
  setTimeout(() => sec.classList.remove('typing'), dur + 40)
  const out = sec.querySelector<HTMLElement>('.out')
  if (out) {
    const len = (out.textContent ?? '').length
    decode(out, { delay: dur * 0.55, duration: Math.min(1300, 520 + len * 1.1), tick: 45 })
  }
  if (sec.id === 'commits') setTimeout(growBars, dur * 0.6)
}

function setupReveal() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          revealSection(e.target as HTMLElement)
          io.unobserve(e.target)
        }
      }
    },
    { rootMargin: '0px 0px 8% 0px', threshold: 0 },
  )
  document.querySelectorAll<HTMLElement>('main > section.sec').forEach((s) => io.observe(s))
}

// ---------------------------------------------------------------- language

let currentContent: Content
let first = true

function renderAll(c: Content) {
  currentContent = c
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
    const key = el.dataset.t!
    if (key === 'back') el.textContent = c.ui.backToConcepts
    else if (key === 'scrollHint') el.textContent = c.ui.scrollHint
    else if (key === 'commitsLabel') el.textContent = commitsCaption(c)
    else if (key.startsWith('nav.')) el.textContent = c.ui.nav[key.slice(4) as keyof Content['ui']['nav']]
  })
  const note = $('#rm-note')
  note.hidden = !reduced
  note.textContent = c.ui.reducedMotionNote

  for (const s of sections) $(`#out-${s.id}`).innerHTML = s.render(c)
  if (barsGrown && !barsAnimating) setBarsFinal()
  else if (barsAnimating) growBars()

  if (first) {
    first = false
    if (reduced) updateHero(c, false)
    else playHero(c)
    return
  }
  updateHero(c, !reduced)
  if (reduced) return
  // a quick decode into the new language for whatever is on screen
  for (const s of sections) {
    const sec = document.getElementById(s.id)!
    if (!revealed.has(s.id) || !inView(sec)) continue
    decode($(`#out-${s.id}`), { duration: 480, tick: 40 })
    sec.querySelectorAll('.cmt').forEach((el) => decode(el, { duration: 300 }))
  }
  document.querySelectorAll('.topbar-nav, .topbar-home').forEach((el) => decode(el, { duration: 300 }))
}

// ---------------------------------------------------------------- wiring

bindLangToggle($('[data-lang-toggle]'))
const themeToggle = bindThemeToggle($('[data-theme-toggle]'))
onLangChange(() => themeToggle.relabel())
onLangChange(renderAll)

$('#out-projects').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.ls-row')
  if (!btn) return
  const id = btn.dataset.id!
  const wasOpen = btn.getAttribute('aria-expanded') === 'true'
  document.querySelectorAll<HTMLButtonElement>('#out-projects .ls-row').forEach((b) => {
    b.setAttribute('aria-expanded', 'false')
    document.getElementById(`pd-${b.dataset.id}`)!.hidden = true
  })
  openProject = wasOpen ? null : id
  if (!wasOpen) {
    btn.setAttribute('aria-expanded', 'true')
    const detail = document.getElementById(`pd-${id}`)!
    detail.hidden = false
    if (!reduced) decode(detail, { duration: 520, tick: 40 })
  }
})

document.fonts?.ready.then(() => { if (barsGrown && !barsAnimating) setBarsFinal() })

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => { if (!barsAnimating && barsGrown) setBarsFinal() }, 120)
})

createAquarium(
  $<HTMLCanvasElement>('#aquarium'),
  currentContent!.projects.map((p) => ({ glyph: p.glyph, name: p.name })),
  (cols, rows) => { $('#win-size').textContent = `${cols}×${rows}` },
)

setupReveal()
if (reduced) {
  for (const s of sections) revealed.add(s.id)
  setBarsFinal()
}

if (!reduced) {
  const lenis = new Lenis({ autoRaf: false, anchors: { offset: -64 } })
  createLoop((_dt, t) => lenis.raf(t * 1000), { respectReducedMotion: true }).start()
}
