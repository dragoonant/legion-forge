// Worker entry of `npm run sim`: a worker thread does not inherit the TypeScript loader of `tsx`, so it registers it first.
import { register } from 'tsx/esm/api'

register()
await import('./sim-worker.ts')
