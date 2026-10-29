// The phone check-in screenshot (tools/out/m7-phone.png): Pixel 7 landscape, mid-game, at the human's first activation of round 2.
import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { GL_ARGS, testUrl, watchErrors } from './helpers'

test.use({ launchOptions: { args: GL_ARGS }, browserName: 'chromium' })

test('phone mid-game (screenshot into tools/out)', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel', 'one phone profile is enough for the screenshot')
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'm7-phone', tier: 'normal' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const lf = window.__lf!
          const p = lf.getPending() as { kind: string; seat: string } | null
          const s = lf.getState() as { round: number } | null
          if (p && p.kind === 'activation.choose' && p.seat === 'A' && (s?.round ?? 0) >= 2 && lf.settled()) return true
          if (lf.settled()) lf.autoStep()
          return false
        }),
      { timeout: 200_000, intervals: [30] },
    )
    .toBe(true)
  // a unit picked by tap shows the confirm bar; the camera is left where the game put it
  const target = await page.evaluate(() => {
    const lf = window.__lf!
    const id = lf.clickable()[0]!
    const d = lf.display() as { units: Record<string, { leaderId: string; minis: { id: string; pos: { x: number; z: number } }[] }> }
    const u = d.units[id]!
    const m = (u.minis.find((q) => q.id === u.leaderId) ?? u.minis[0]!).pos
    lf.camera.current!.lookAt(m.x, m.z, 22)
    return { x: m.x, z: m.z }
  })
  await page.waitForTimeout(400)
  const p = await page.evaluate(([x, z]) => window.__lf!.project(x!, 0.6, z!), [target.x, target.z])
  await page.touchscreen.tap(p!.x, p!.y)
  await expect(page.getByTestId('confirm-bar')).toBeVisible()
  await page.waitForTimeout(600)
  mkdirSync('tools/out', { recursive: true })
  await page.screenshot({ path: 'tools/out/m7-phone.png' })
  expect(errors).toEqual([])
})
