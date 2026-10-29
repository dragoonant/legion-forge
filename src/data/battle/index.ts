import type { DataFile } from '../types'
import reconObjectives from './recon/objectives.json'
import reconSecondaries from './recon/secondaries.json'
import reconAdvantages from './recon/advantages.json'
import reconMaps from './recon/maps.json'

/** Battle-deck files. The Standard pool lands here later (`standard/*.json`), as additive rows. */
export const BATTLE_FILES: DataFile[] = [
  { path: 'battle/recon/objectives.json', def: 'battle#battleCard', array: true, data: reconObjectives },
  { path: 'battle/recon/secondaries.json', def: 'battle#battleCard', array: true, data: reconSecondaries },
  { path: 'battle/recon/advantages.json', def: 'battle#battleCard', array: true, data: reconAdvantages },
  { path: 'battle/recon/maps.json', def: 'battle#map', array: true, data: reconMaps },
]
