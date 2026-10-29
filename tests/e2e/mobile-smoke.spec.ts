// Phone smoke (runs in the iphone-se, iphone-pro and pixel projects, landscape): the start screen has 44 px targets and no sideways
// scroll, a game starts by tap, the compact HUD and the bottom-sheet prompt show, the first decisions are answered by tap (edge,
// a deployment staged and placed on the board, the card pick, an order given by picking a unit on the board and confirming in the bar),
// and nothing logs an error. WebKit is not installed in every sandbox: the iPhone profiles then run on Chromium with the same device
// metrics and touch emulation.
import { existsSync } from 'node:fs'
import { expect, test, webkit, type Page } from '@playwright/test'
import { GL_ARGS, testUrl, watchErrors } from './helpers'

const haveWebkit = (() => {
  try {
    return existsSync(webkit.executablePath())
  } catch {
    return false
  }
})()

test.use({ launchOptions: { args: GL_ARGS }, ...(haveWebkit ? {} : { browserName: 'chromium' as const }) })

/** Page coordinates of a table point at the current camera. */
async function screenOf(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(([a, b, c]) => window.__lf!.project(a!, b!, c!), [x, y, z])
  if (!p) throw new Error('point off screen')
  return p
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(over, 'no horizontal page scroll').toBeLessThanOrEqual(1)
}

/** Every visible button / field under `selector` is at least 44 px tall (touch target). */
async function targetsAre44(page: Page, selector: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = []
    document.querySelectorAll(`${sel} button, ${sel} select, ${sel} input:not([type=hidden])`).forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      if (r.height < 43.5) out.push(`${el.tagName}:${(el.getAttribute('data-testid') ?? el.textContent ?? '').slice(0, 24)}=${Math.round(r.height)}`)
    })
    return out
  }, selector)
  expect(small, `targets under 44 px in ${selector}`).toEqual([])
}

async function kind(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window.__lf!.getPending() as { kind: string } | null)?.kind)
}

/** The human seat owes the pending decision and the presentation has settled. */
async function myTurn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const lf = window.__lf!
    const p = lf.getPending() as { seat: string; context: { answered?: string[] } } | null
    return lf.settled() && !!p && (p.seat === 'A' || (p.seat === 'all' && !(p.context.answered ?? []).includes('A')))
  })
}

async function waitMyTurn(page: Page): Promise<string> {
  await expect.poll(() => myTurn(page), { timeout: 30_000 }).toBe(true)
  return (await kind(page))!
}

test('the start screen fits a phone, and a game is played into the first activation by tap', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.goto('./?debug')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await noSidewaysScroll(page)
  await targetsAre44(page, '[data-testid="start-screen"]')
  await expect(page.locator('html')).toHaveAttribute('data-ff', 'compact')
  // the guide and the settings open by tap and close again
  await page.getByTestId('open-howto').tap()
  await expect(page.getByTestId('how-to-play')).toBeVisible()
  await expect(page.getByTestId('howto-round')).toContainText('Command phase')
  // a term in running text opens its help on tap
  await page.getByTestId('howto-actions').locator('[data-keyword]').first().tap()
  await expect(page.getByTestId('tooltip')).toBeVisible()
  await page.getByTestId('how-to-play-close').tap()
  await expect(page.getByTestId('how-to-play')).toBeHidden()
  await page.getByTestId('open-settings').tap()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByTestId('speed-instant').tap()
  await page.getByTestId('settings-panel-close').tap()
  // start by tap
  await page.getByTestId('seed-input').fill('phone-1')
  await page.getByTestId('start-battle').tap()
  await expect(page.getByTestId('briefing')).toBeVisible()
  await noSidewaysScroll(page)
  await page.getByTestId('begin-battle').tap()
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => window.__lf?.camera.current, undefined, { timeout: 30_000 }).catch(() => undefined)
  await expect(page.getByTestId('compact-bar')).toBeVisible()
  await expect(page.getByTestId('hud-round')).toBeVisible()
  const bar = await page.getByTestId('compact-bar').boundingBox()
  const vp = page.viewportSize()!
  expect(bar!.height).toBeLessThanOrEqual(50)
  expect(bar!.x + bar!.width, 'the bar stops short of the top-right corner').toBeLessThanOrEqual(vp.width - 100)
  await noSidewaysScroll(page)

  // the first decisions, by tap
  let k = await waitMyTurn(page)
  for (let i = 0; i < 3 && (k === 'card.choice' || k === 'setup.battle'); i++) {
    await expect(page.getByTestId('prompt')).toBeVisible()
    await targetsAre44(page, '[data-testid="prompt"]')
    await page.locator('[data-testid="prompt"] [data-testid^="opt-"]').first().tap()
    k = await waitMyTurn(page)
  }
  // deployment: stage a unit on the board with one tap, place it with a second
  for (let guard = 0; guard < 4 && k !== 'setup.deploy'; guard++) k = await waitMyTurn(page)
  expect(k).toBe('setup.deploy')
  // a legal spot in the band of the board that the top bar and the bottom sheet leave free
  const vp0 = page.viewportSize()!
  const spot = await page.evaluate((h) => {
    const lf = window.__lf!
    const p = lf.getPending() as unknown as { context: { regions: { x: number; z: number }[][] } }
    const poly = p.context.regions[0]!
    const xs = poly.map((q) => q.x)
    const zs = poly.map((q) => q.z)
    for (let a = 0; a <= 1; a += 0.05) for (let b = 0; b <= 1; b += 0.05) {
      const x = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * a
      const z = Math.min(...zs) + (Math.max(...zs) - Math.min(...zs)) * b
      const s = lf.project(x, 0.1, z)
      if (s && s.y > 70 && s.y < h * 0.42 && lf.deployOk(x, z)) return { x, z }
    }
    return null
  }, vp0.height)
  expect(spot, 'a legal deployment spot in the free band').not.toBeNull()
  const before = await page.evaluate(() => (window.__lf!.getPending() as unknown as { context: { unitIds: string[] } }).context.unitIds.length)
  const at = await screenOf(page, spot!.x, 0.1, spot!.z)
  await page.touchscreen.tap(at.x, at.y)
  await expect(page.getByTestId('deploy-note')).toBeVisible()
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByTestId('deploy-place-folded')).toBeEnabled()
  await page.waitForTimeout(450) // past the page's double-tap guard (a tap within 320 ms of the last is not a click)
  await page.touchscreen.tap(at.x, at.y)
  await expect.poll(() => page.evaluate(() => (window.__lf!.getPending() as unknown as { context: { unitIds?: string[] } } | null)?.context.unitIds?.length ?? -1)).not.toBe(before)
  // the rest by the "deploy the rest" button
  await expect(page.getByTestId('deploy-auto')).toBeVisible()
  await page.getByTestId('deploy-auto').tap()

  // the command phase: pick a card by tap
  await expect.poll(() => kind(page), { timeout: 60_000 }).toBe('command.pick')
  await waitMyTurn(page)
  // the tap lands on a term inside the card button: it goes through to the button (the card is picked, no tooltip stays)
  const cardTerm = page.locator('[data-testid^="cmd-card-"]:not([disabled]) [data-keyword]').first()
  await expect(cardTerm).toBeVisible()
  await cardTerm.tap()
  await expect.poll(() => kind(page), { timeout: 30_000 }).not.toBe('command.pick')
  // an order: pick a unit on the board, confirm in the bar
  await expect.poll(() => kind(page), { timeout: 60_000 }).toMatch(/^command\.(issuer|order)$/)
  await waitMyTurn(page)
  for (let i = 0; i < 6; i++) {
    const k2 = await kind(page)
    if (k2 === 'activation.choose') break
    if (!(await myTurn(page))) {
      await page.waitForTimeout(150)
      continue
    }
    const target = await page.evaluate(() => {
      const lf = window.__lf!
      const ids = lf.clickable()
      const d = lf.display() as { units: Record<string, { minis: { pos: { x: number; z: number } }[] }> }
      const u = ids[0] ? d.units[ids[0]] : null
      return u ? { id: ids[0]!, x: u.minis[0]!.pos.x, z: u.minis[0]!.pos.z } : null
    })
    if (!target) {
      await page.locator('[data-testid="prompt"] [data-testid^="opt-"]').first().tap()
      continue
    }
    const p = await screenOf(page, target.x, 0.6, target.z)
    await page.touchscreen.tap(p.x, p.y)
    await expect(page.getByTestId('confirm-bar')).toBeVisible()
    await expect(page.getByTestId('confirm-bar')).toHaveAttribute('data-unit', target.id)
    await targetsAre44(page, '[data-testid="confirm-bar"]')
    await page.getByTestId('pick-confirm').tap()
    await expect(page.getByTestId('confirm-bar')).toBeHidden()
    await page.waitForTimeout(150)
  }
  await noSidewaysScroll(page)
  // drawers open from the left column and close from their own top-left button
  await page.getByTestId('drawer-log').tap()
  await expect(page.getByTestId('drawer-panel-log')).toBeVisible()
  await page.getByTestId('drawer-close').tap()
  await expect(page.getByTestId('drawer-panel-log')).toBeHidden()
  expect(errors).toEqual([])
})

test('a phone held upright is asked to turn sideways; the Home Screen manifest and icons are served', async ({ page, request }) => {
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'phone-rotate' })}`)
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('rotate-prompt')).toBeHidden()
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: Math.min(vp.width, vp.height), height: Math.max(vp.width, vp.height) })
  await expect(page.getByTestId('rotate-prompt')).toBeVisible()
  await page.setViewportSize(vp)
  await expect(page.getByTestId('rotate-prompt')).toBeHidden()
  // Home Screen install: manifest, the icons it names, and the touch icon
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifestUrl = new URL(href!, page.url()).toString()
  const res = await request.get(manifestUrl)
  expect(res.ok()).toBe(true)
  const m = (await res.json()) as { name: string; display: string; orientation: string; icons: { src: string; sizes: string; purpose?: string }[] }
  expect(m.name).toBe('Legion Forge')
  expect(m.orientation).toBe('landscape')
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  for (const i of m.icons) expect((await request.get(new URL(i.src, manifestUrl).toString())).ok(), i.src).toBe(true)
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect((await request.get(new URL(touchIcon!, page.url()).toString())).ok()).toBe(true)
  expect(errors).toEqual([])
})
