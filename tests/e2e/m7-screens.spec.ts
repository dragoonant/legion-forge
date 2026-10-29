// Check-in screenshots for M7: the desktop board mid-game (tools/out/m7-desktop.png) and, after the game is played out, the end screen
// with its recap (tools/out/m7-end.png).
import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { GL_ARGS, autoPlay, testUrl, watchErrors } from './helpers'

test.use({ launchOptions: { args: GL_ARGS }, viewport: { width: 1440, height: 810 } })

test('desktop mid-game and the end screen (screenshots into tools/out)', async ({ page }) => {
  test.setTimeout(480_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'm7-shots', tier: 'normal' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  const edge = page.getByTestId('opt-edge:xMax')
  if (await edge.isVisible({ timeout: 3000 }).catch(() => false)) await edge.click()
  const at = await autoPlay(page, (s) => (s.round ?? 0) >= 2 && s.kind === 'activation.choose')
  expect(at.round).toBeGreaterThanOrEqual(2)
  await page.getByTestId('toggle-briefing').click()
  await page.waitForTimeout(800)
  mkdirSync('tools/out', { recursive: true })
  await page.screenshot({ path: 'tools/out/m7-desktop.png' })
  await page.getByTestId('toggle-briefing').click()
  const end = await autoPlay(page, () => false, 8000)
  expect(end.phase).toBe('ended')
  await expect(page.getByTestId('end-screen')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'tools/out/m7-end.png' })
  expect(errors).toEqual([])
})
