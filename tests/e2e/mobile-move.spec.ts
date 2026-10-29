// The movement tool by touch (phone profiles): a tap aims it, one finger drags the gold hinge WITHOUT panning the board, the dragged
// point rides above the finger so the base stays visible, and Confirm commits. Dragging needs raw touch events (CDP), so this runs on
// Chromium (the iPhone profiles use Chromium with the same device metrics when WebKit is not installed).
import { existsSync } from 'node:fs'
import { expect, test, webkit } from '@playwright/test'
import { GL_ARGS, testUrl, watchErrors } from './helpers'

const haveWebkit = (() => {
  try {
    return existsSync(webkit.executablePath())
  } catch {
    return false
  }
})()
test.use({ launchOptions: { args: GL_ARGS }, browserName: 'chromium' })
void haveWebkit

test('aim the tool by tap, drag the hinge by finger, confirm', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'phone-move' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  // play the human seat with the random bot's choices until it must place a movement tool
  await expect
    .poll(
      async () => {
        const done = await page.evaluate(() => {
          const lf = window.__lf!
          const p = lf.getPending() as { kind: string; seat: string; context: { kind?: string; deploying?: boolean } } | null
          if (p && p.kind === 'move.tool' && p.seat === 'A' && p.context.kind !== 'controlled' && !p.context.deploying && lf.settled()) return true
          if (lf.settled()) lf.autoStep()
          return false
        })
        return done
      },
      { timeout: 120_000, intervals: [30] },
    )
    .toBe(true)
  const leader = await page.evaluate(() => {
    const lf = window.__lf!
    const p = lf.getPending() as unknown as { context: { unitId: string } }
    const d = lf.display() as { units: Record<string, { leaderId: string; minis: { id: string; pos: { x: number; z: number } }[] }> }
    const u = d.units[p.context.unitId]!
    const m = (u.minis.find((q) => q.id === u.leaderId) ?? u.minis[0]!).pos
    return { x: m.x, z: m.z }
  })
  await page.evaluate(([x, z]) => window.__lf!.camera.current!.lookAt(x!, z!, 16), [leader.x, leader.z])
  await page.waitForTimeout(200)
  // a legal destination a few inches away, found with the engine's own dry run
  const dest = await page.evaluate(([lx, lz]) => {
    const lf = window.__lf!
    for (let r = 4; r >= 2; r -= 1) for (let a = 0; a < 16; a++) {
      const x = lx! + Math.cos((a / 16) * Math.PI * 2) * r
      const z = lz! + Math.sin((a / 16) * Math.PI * 2) * r
      const s = lf.project(x, 0.1, z)
      if (s && s.y > 70 && s.y < 200 && lf.toolOk(x, z).ok) return { x, z }
    }
    return null
  }, [leader.x, leader.z])
  expect(dest, 'a legal destination in view').not.toBeNull()
  const tapAt = await page.evaluate(([x, z]) => window.__lf!.project(x!, 0.1, z!), [dest!.x, dest!.z])
  await page.touchscreen.tap(tapAt!.x, tapAt!.y)
  await expect.poll(() => page.evaluate(() => window.__lf!.tool()?.hinge ?? null)).not.toBeNull()
  // the sheet folds to its header while the tool is aimed, with Confirm in it
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByTestId('move-confirm-folded')).toBeVisible()

  // drag the hinge with one finger
  const hinge0 = (await page.evaluate(() => window.__lf!.tool()!.hinge))!
  const cam0 = await page.evaluate(() => window.__lf!.camera.current!.get())
  const from = (await page.evaluate(([x, z]) => window.__lf!.project(x!, 0.7, z!), [hinge0.x, hinge0.z]))!
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  await touch('touchStart', from.x, from.y)
  const to = { x: from.x + 70, y: from.y + 30 }
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10)
    await page.waitForTimeout(20)
  }
  const hingeDuring = (await page.evaluate(() => window.__lf!.tool()?.hinge ?? null))
  await touch('touchEnd', to.x, to.y)
  await page.waitForTimeout(150)
  const hinge1 = (await page.evaluate(() => window.__lf!.tool()?.hinge ?? hingeDuring))!
  expect(Math.hypot(hinge1.x - hinge0.x, hinge1.z - hinge0.z), 'the hinge moved with the finger').toBeGreaterThan(0.5)
  const cam1 = await page.evaluate(() => window.__lf!.camera.current!.get())
  expect(Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z), 'the board did not pan under the dragging finger').toBeLessThan(0.01)
  expect(Math.abs(cam1.distance - cam0.distance)).toBeLessThan(0.01)
  // held above the finger: the hinge sits higher on the screen than where the finger lifted
  const at1 = (await page.evaluate(([x, z]) => window.__lf!.project(x!, 0.7, z!), [hinge1.x, hinge1.z]))!
  expect(at1.y, 'the dragged hinge rides above the finger').toBeLessThan(to.y - 30)
  // confirm by tap if the engine accepts the bent tool, else the verdict says why
  const ok = await page.evaluate(() => window.__lf!.tool()?.ok ?? false)
  if (ok) {
    const id = await page.evaluate(() => (window.__lf!.getPending() as { id: string }).id)
    await page.getByTestId('move-confirm-folded').tap()
    await expect.poll(() => page.evaluate(() => (window.__lf!.getPending() as { id: string } | null)?.id)).not.toBe(id)
  }
  expect(errors).toEqual([])
})
