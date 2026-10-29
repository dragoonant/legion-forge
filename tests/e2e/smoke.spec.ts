// Smoke: the start screen loads with the fan-project notice and the four Recon lists, a game starts from the menus, the battle shows
// the table, the HUD and the first decision of the engine; ?test=1 skips straight to the battle; no page errors.
import { expect, test } from '@playwright/test'
import { GL_ARGS, autoPlay, testUrl, watchErrors } from './helpers'

test.use({ launchOptions: { args: GL_ARGS }, viewport: { width: 1440, height: 810 } })

test('the start screen loads and a game starts from the menus', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await expect(page.getByTestId('fan-notice')).toContainText('Unofficial, non-commercial fan project')
  // two sides, two lists each (names come from the data)
  await expect(page.getByTestId('list-A-emp.list.recon-a')).toBeVisible()
  await expect(page.getByTestId('faction-B-rebels')).toBeVisible()
  await page.getByTestId('faction-A-rebels').click()
  await expect(page.getByTestId('list-A-reb.list.recon-a')).toBeVisible()
  await page.getByTestId('faction-A-empire').click()
  await page.getByTestId('seed-input').fill('smoke-1')
  await page.getByTestId('start-battle').click()
  await expect(page.getByTestId('briefing')).toBeVisible()
  await expect(page.getByTestId('roster-A')).toContainText('Darth Vader')
  await page.getByTestId('begin-battle').click()
  // the battle: canvas, HUD, and the engine's first decision (the blue player picks the table edge; when the bot is blue the
  // human's first decision is the first deployment)
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.getByTestId('hud-round')).toBeVisible()
  const prompt = page.getByTestId('prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toHaveAttribute('data-kind', /^setup\.(battle|deploy)$/)
  expect(errors).toEqual([])
})

test('?test=1 opens a battle and the human seat can answer decisions through the page', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'smoke-2' })}`)
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => window.__lf?.camera.current)
  // choose the edge by clicking when the human is the blue player, then let the page play to the first activation
  const edge = page.getByTestId('opt-edge:xMax')
  if (await edge.isVisible({ timeout: 3000 }).catch(() => false)) await edge.click()
  const at = await autoPlay(page, (s) => s.kind === 'activation.choose')
  expect(at.kind).toBe('activation.choose')
  await expect(page.getByTestId('hud-round')).toContainText('Round 1')
  await expect(page.getByTestId('pool-draw')).toBeVisible()
  expect(errors).toEqual([])
})
