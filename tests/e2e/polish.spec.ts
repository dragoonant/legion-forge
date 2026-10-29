// M7 polish on the desktop: Save and Continue (and a discarded save), settings that persist, the how-to-play guide, term doorways,
// folding the prompt (a new decision opens it again), and the end-screen recap with the AI's hidden decisions revealed.
import { expect, test } from '@playwright/test'
import { GL_ARGS, autoPlay, testUrl, watchErrors } from './helpers'

test.use({ launchOptions: { args: GL_ARGS }, viewport: { width: 1440, height: 810 } })

test('Continue brings an autosaved battle back; a save that cannot replay is discarded with a notice', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'polish-save' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  const edge = page.getByTestId('opt-edge:xMax')
  if (await edge.isVisible({ timeout: 3000 }).catch(() => false)) await edge.click()
  const at = await autoPlay(page, (s) => (s.round ?? 0) >= 1 && s.kind === 'activation.choose')
  expect(at.kind).toBe('activation.choose')
  const hash = await page.evaluate(() => (window.__lf!.getState() as { hash: string }).hash)
  // the start screen of a fresh page load offers Continue
  await page.goto('./?debug')
  await expect(page.getByTestId('continue-card')).toBeVisible()
  await expect(page.getByTestId('continue-factions')).toContainText('Galactic Empire')
  await expect(page.getByTestId('continue-detail')).toContainText('Round 1')
  await expect(page.getByTestId('continue-detail')).toContainText('activation phase')
  await expect(page.getByTestId('continue-detail')).toContainText(/saved (just now|\d+ \w+ ago)/)
  await page.getByTestId('continue-game').click()
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('hud-round')).toContainText('Round 1')
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-kind', 'activation.choose')
  expect(await page.evaluate(() => (window.__lf!.getState() as { hash: string }).hash)).toBe(hash)
  // tamper with the saved hash from the start screen (a live game would rewrite its save when the page goes away)
  await page.goto('./?debug')
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('legionforge.save.v1')!)
    raw.file.finalHash = 'tampered'
    localStorage.setItem('legionforge.save.v1', JSON.stringify(raw))
  })
  await page.goto('./?debug')
  await expect(page.getByTestId('continue-card')).toBeVisible()
  await page.getByTestId('continue-game').click()
  await expect(page.getByTestId('save-notice')).toContainText('discarded')
  await expect(page.getByTestId('continue-card')).toBeHidden()
  await expect(page.getByTestId('start-screen')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('legionforge.save.v1'))).toBeNull()
  expect(errors).toEqual([])
})

test('settings persist; the guide opens from the start screen and its terms are doorways', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./')
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByTestId('speed-fast').click()
  await page.getByTestId('feel-lively').click()
  await page.getByTestId('set-show-odds').uncheck()
  await page.getByTestId('set-reduce-motion').check()
  await page.getByTestId('sound-music').fill('25')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-panel')).toBeHidden()
  await page.reload()
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('speed-fast')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('feel-lively')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('set-show-odds')).not.toBeChecked()
  await expect(page.getByTestId('set-reduce-motion')).toBeChecked()
  await expect(page.getByTestId('sound-music')).toHaveValue('25')
  await page.getByTestId('settings-reset').click()
  await expect(page.getByTestId('speed-normal')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('settings-panel-close').click()
  // the guide
  await page.getByTestId('open-howto').click()
  await expect(page.getByTestId('how-to-play')).toBeVisible()
  for (const id of ['round', 'orders', 'actions', 'move', 'attack', 'suppression']) await expect(page.getByTestId(`howto-${id}`)).toBeVisible()
  await page.getByTestId('howto-actions').locator('[data-keyword="Aim"]').first().hover()
  await expect(page.getByTestId('tooltip')).toContainText('reroll')
  expect(errors).toEqual([])
})

test('the prompt folds to a pill and a new decision opens it again; terms in the log and prompts are doorways', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'polish-fold' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  await expect(page.getByTestId('prompt')).toBeVisible()
  await page.getByTestId('collapse-prompt').click()
  await expect(page.getByTestId('collapsed-prompt')).toBeVisible()
  await expect(page.getByTestId('prompt')).toBeHidden()
  await page.getByTestId('collapsed-prompt').click()
  await expect(page.getByTestId('prompt')).toBeVisible()
  await page.getByTestId('collapse-prompt').click()
  await expect(page.getByTestId('collapsed-prompt')).toBeVisible()
  // answering moves to a new decision: it opens unfolded
  expect(await page.evaluate(() => window.__lf!.autoStep())).toBe(true)
  await expect(page.getByTestId('prompt')).toBeVisible()
  await expect(page.getByTestId('collapsed-prompt')).toBeHidden()
  // play to the first activation: the prompt carries term doorways (the order pool) and the first-turn hint strip shows
  const at = await autoPlay(page, (s) => s.kind === 'activation.choose')
  expect(at.kind).toBe('activation.choose')
  await expect(page.getByTestId('pool-draw').locator('[data-keyword="Order pool"]')).toBeVisible()
  await expect(page.getByTestId('hint-strip')).toBeVisible()
  await page.getByTestId('hint-dismiss').click()
  await expect(page.getByTestId('hint-strip')).toBeHidden()
  // the log: every line is searched for terms
  expect(await page.getByTestId('event-feed').locator('[data-keyword]').count()).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('the end screen recaps points by card, units lost and reveals what the AI chose in secret', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await page.goto(`./${testUrl({ seats: 'human,bot', seed: 'polish-end', tier: 'easy' })}`)
  await page.waitForFunction(() => window.__lf?.camera.current)
  const edge = page.getByTestId('opt-edge:xMax')
  if (await edge.isVisible({ timeout: 3000 }).catch(() => false)) await edge.click()
  await autoPlay(page, (s) => (s.round ?? 0) >= 3 && s.kind === 'activation.choose')
  await page.evaluate(() => {
    const lf = window.__lf!
    const p = lf.getPending() as { id: string }
    lf.dispatch({ type: 'resign', seat: 'A', decisionId: p.id, payload: {} })
  })
  await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('recap-vp')).toBeVisible()
  await expect(page.getByTestId('recap-lost')).toBeVisible()
  await expect(page.getByTestId('recap-ai')).toBeVisible()
  await expect(page.getByTestId('ai-reveal-B')).toBeVisible()
  // the audit matches the engine's own record: round 1's revealed pick is the first card the AI played
  const played = await page.evaluate(() => {
    const s = window.__lf!.getState() as { players: { B: { played: string[] } }; data: { cards: Record<string, { name: string }> } }
    return s.players.B.played.map((id) => s.data.cards[id]!.name)
  })
  expect(played.length).toBeGreaterThanOrEqual(2)
  await expect(page.getByTestId('ai-round-B-1')).toContainText(played[0]!)
  await expect(page.getByTestId('ai-round-B-2')).toContainText(played[1]!)
  await expect(page.getByTestId('ai-round-B-1')).toContainText('drew from its order pool')
  // the human's own seat is not in the reveal
  await expect(page.getByTestId('ai-reveal-A')).toHaveCount(0)
  expect(errors).toEqual([])
})
