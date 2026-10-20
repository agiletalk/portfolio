// 사용: node scripts/record.mjs <slug> <outDir> [baseUrl]  (slug: site | deep-dive | museum)
// 히어로에서 커서를 움직이고 클릭한 뒤 천천히 스크롤하는 모습을 CDP 스크린캐스트 프레임으로 남기고, 중간 지점 스틸을 남긴다.
// 프레임은 <outDir>/<slug>/NNNNN.jpg, 평균 fps는 <outDir>/<slug>/fps.txt — 시스템 ffmpeg로 묶는다.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const [slug, outDir, base = 'http://localhost:4173'] = process.argv.slice(2)
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
const frameDir = `${outDir}/${slug}`
mkdirSync(frameDir, { recursive: true })
const cdp = await ctx.newCDPSession(page)
let n = 0, t0 = 0, t1 = 0
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  if (!t0) t0 = metadata.timestamp
  t1 = metadata.timestamp
  writeFileSync(`${frameDir}/${String(n++).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'))
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await page.goto(`${base}${slug === 'site' ? '/' : `/concepts/${slug}/`}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
await page.waitForTimeout(600)
const pts = [[300, 400], [640, 300], [900, 500], [700, 600], [500, 450]]
for (const [x, y] of pts) await page.mouse.move(x, y, { steps: 25 })
await page.mouse.click(760, 520)
await page.waitForTimeout(2200)
const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
const stops = 6
for (let i = 1; i <= 60; i++) {
  await page.mouse.wheel(0, total / 60)
  await page.waitForTimeout(160)
  if (i % (60 / stops) === 0) await page.screenshot({ path: `${outDir}/${slug}-scroll-${i / (60 / stops)}.png` })
}
await page.waitForTimeout(800)
await cdp.send('Page.stopScreencast')
writeFileSync(`${frameDir}/fps.txt`, String(Math.max(5, Math.round(n / Math.max(0.1, t1 - t0)))))
await ctx.close()
await browser.close()
