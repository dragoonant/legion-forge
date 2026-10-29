// Shared helpers for the e2e specs: WebGL under headless Chromium, the test URL, and reads of the `window.__lf` hooks.
import type { Page } from '@playwright/test'

/** Launch args that give headless Chromium a software WebGL context. */
export const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

export function testUrl(params: Record<string, string> = {}): string {
  const q = new URLSearchParams({ test: '1', speed: 'instant', ...params })
  return `?${q.toString()}`
}

/** Collects page errors and console errors (WebGL driver chatter excluded). */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver|favicon/.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return errors
}

export interface Snapshot {
  kind: string | undefined
  seat: string | undefined
  settled: boolean
  phase: string | undefined
  round: number | undefined
  owed: boolean
}

/** The pending decision and whether the human seat A owes it, as the store sees it. */
export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const lf = window.__lf!
    const p = lf.getPending() as { kind: string; seat: string; context: { answered?: string[] } } | null
    const s = lf.getState() as { phase: string; round: number } | null
    const owed = !!p && (p.seat === 'A' || (p.seat === 'all' && !(p.context.answered ?? []).includes('A')))
    return { kind: p?.kind, seat: p?.seat, settled: lf.settled(), phase: s?.phase, round: s?.round, owed }
  })
}

/** Step the human seat through decisions with the random bot's choices until `stop` holds or the battle ends. */
export async function autoPlay(page: Page, stop: (s: Snapshot) => boolean, maxIterations = 1500): Promise<Snapshot> {
  let last = await snapshot(page)
  for (let i = 0; i < maxIterations; i++) {
    last = await snapshot(page)
    if (last.phase === 'ended' || (last.settled && stop(last))) return last
    if (!last.settled || !last.owed) {
      await page.waitForTimeout(40)
      continue
    }
    await page.evaluate(() => window.__lf!.autoStep())
    await page.waitForTimeout(20)
  }
  return last
}
