// One worker of `npm run sim`: plays the games whose index is congruent to its id modulo the worker count and posts each
// report back. Games are independent and seeded, so the merged result does not depend on how many workers ran.
import { parentPort, workerData } from 'node:worker_threads'
import { setHashEvery } from '../src/engine'
import { playGame } from './sim-core'
import { argOf, setupFromArgs } from './sim-cli'

interface WorkerInput {
  argv: string[]
  games: number
  seed: string
  id: number
  workers: number
}

const { argv, games, seed, id, workers } = workerData as WorkerInput
setHashEvery(Number(argOf(argv, 'hash-every', '8')))
const { bundle, setupFor } = setupFromArgs(argv)
const replayEvery = Math.max(1, Number(argOf(argv, 'replay-every', '1')))
for (let g = id; g < games; g += workers) {
  parentPort!.postMessage({ type: 'game', report: playGame(setupFor(g), bundle, `${seed}-${g}`, g, replayEvery) })
}
parentPort!.postMessage({ type: 'done' })
