// Takes the check-in screenshot of the board mid-game (tools/out/m3-board.png): the human seat is stepped to round 2 with the
// random bot's choices, and the shot is taken at the next decision of the human, after the presentation has settled.
import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { GL_ARGS, autoPlay, testUrl, watchErrors } from './helpers'

test.use({ launchOptions: { args: GL_ARGS }, viewport: { width: 1440, height: 810 } })

test('the board mid-game (screenshot into tools/out)', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 's3' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  const at = await autoPlay(page, (s) => (s.round ?? 0) >= 2 && s.kind === 'activation.choose')
  expect(at.round).toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(800)
  mkdirSync('tools/out', { recursive: true })
  await page.screenshot({ path: 'tools/out/m3-board.png' })
  expect(errors).toEqual([])
})
