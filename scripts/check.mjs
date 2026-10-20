// 사용: node scripts/check.mjs <slug> [baseUrl]
// slug: site(루트 = Living Terminal) | deep-dive | museum(concepts/ 아래, dev 서버에서만). vite dev/preview가 떠 있어야 한다.
// 1440·390 폭 × 일반·reduced-motion 스크린샷, 콘솔 에러, 가로 스크롤, 언어 토글을 검사한다.
// 브라우저는 로컬 Microsoft Edge를 쓴다 (PW_CHANNEL로 바꿀 수 있음, 'none'이면 번들 chromium).
// 색 구성은 PW_COLOR_SCHEME=light|dark (기본 light), 스크린샷은 shots/<slug>/<scheme>/ 에 남는다.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const slug = process.argv[2]
const base = process.argv[3] ?? 'http://localhost:4173'
if (!slug) { console.error('slug required'); process.exit(2) }
const scheme = process.env.PW_COLOR_SCHEME ?? 'light'
const out = `shots/${slug}/${scheme}`
mkdirSync(out, { recursive: true })

const channel = process.env.PW_CHANNEL ?? 'msedge'
const browser = await chromium.launch(channel === 'none' ? {} : { channel })
let failed = false
const fail = (m) => { failed = true; console.log('FAIL', m) }

for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: w < 768, isMobile: w < 768 })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(`${base}${slug === 'site' ? '/' : `/concepts/${slug}/`}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const tag = `${w}-${reducedMotion === 'reduce' ? 'reduced' : 'motion'}`
    await page.screenshot({ path: `${out}/${tag}-top.png` })
    await page.screenshot({ path: `${out}/${tag}-full.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 1) fail(`${tag}: horizontal overflow ${overflow}px`)
    const koText = await page.evaluate(() => document.body.innerText)
    const toggle = page.locator('[data-lang-toggle]')
    if (await toggle.count() !== 1) fail(`${tag}: expected exactly one [data-lang-toggle]`)
    else {
      await toggle.click()
      await page.waitForTimeout(600)
      const enText = await page.evaluate(() => document.body.innerText)
      const lang = await page.evaluate(() => document.documentElement.lang)
      if (lang !== 'en' || !enText.includes('Chanju Jeon') || enText.includes('전찬주')) fail(`${tag}: toggle did not switch to English cleanly (lang=${lang})`)
      if (!koText.includes('전찬주')) fail(`${tag}: initial Korean content missing`)
      await toggle.click()
    }
    if (errors.length) fail(`${tag}: console errors: ${errors.join(' | ')}`)
    await ctx.close()
  }
}
await browser.close()
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS', `→ ${out}/`)
process.exit(failed ? 1 : 0)
