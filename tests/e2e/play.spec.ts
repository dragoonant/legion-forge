// A whole game against the random bot through the page: the human seat is stepped with the random bot's choices through the page's own
// decision path (`window.__lf.autoStep`), attacks included (the combat merge is in), until the engine ends the battle.
import { expect, test } from '@playwright/test'
import { GL_ARGS, autoPlay, testUrl, watchErrors } from './helpers'

test.use({ launchOptions: { args: GL_ARGS }, viewport: { width: 1440, height: 810 } })

test('a full game against the random bot ends with a result and an end screen', async ({ page }) => {
  test.setTimeout(420_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'play-1' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  const edge = page.getByTestId('opt-edge:xMax')
  if (await edge.isVisible({ timeout: 3000 }).catch(() => false)) await edge.click()
  const end = await autoPlay(page, () => false, 6000)
  expect(end.phase).toBe('ended')
  // attacks happened: the dice tray and the feed carry them
  const events = (await page.evaluate(() => window.__lf!.events())) as { type: string }[]
  expect(events.some((e) => e.type === 'AttackDeclared')).toBe(true)
  await expect(page.getByTestId('end-screen')).toBeVisible()
  await expect(page.getByTestId('result')).toBeVisible()
  expect(errors).toEqual([])
})
