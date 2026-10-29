import type { DataFile } from '../types'
import empireFaction from './empire/faction.json'
import empireUnits from './empire/units.json'
import empireWeapons from './empire/weapons.json'
import empireUpgrades from './empire/upgrades.json'
import empireCards from './empire/command-cards.json'
import empireLists from './empire/lists.json'
import rebelsFaction from './rebels/faction.json'
import rebelsUnits from './rebels/units.json'
import rebelsWeapons from './rebels/weapons.json'
import rebelsUpgrades from './rebels/upgrades.json'
import rebelsCards from './rebels/command-cards.json'
import rebelsLists from './rebels/lists.json'
import neutralWeapons from './neutral/weapons.json'
import neutralUpgrades from './neutral/upgrades.json'
import neutralCards from './neutral/command-cards.json'

/** Army data files, one block per faction folder (a new faction adds a block here and nowhere else). */
export const ARMY_FILES: DataFile[] = [
  { path: 'armies/empire/faction.json', def: 'army#faction', array: false, data: empireFaction },
  { path: 'armies/empire/units.json', def: 'army#unit', array: true, data: empireUnits },
  { path: 'armies/empire/weapons.json', def: 'army#weapon', array: true, data: empireWeapons },
  { path: 'armies/empire/upgrades.json', def: 'army#upgrade', array: true, data: empireUpgrades },
  { path: 'armies/empire/command-cards.json', def: 'army#commandCard', array: true, data: empireCards },
  { path: 'armies/empire/lists.json', def: 'army#armyList', array: true, data: empireLists },
  { path: 'armies/rebels/faction.json', def: 'army#faction', array: false, data: rebelsFaction },
  { path: 'armies/rebels/units.json', def: 'army#unit', array: true, data: rebelsUnits },
  { path: 'armies/rebels/weapons.json', def: 'army#weapon', array: true, data: rebelsWeapons },
  { path: 'armies/rebels/upgrades.json', def: 'army#upgrade', array: true, data: rebelsUpgrades },
  { path: 'armies/rebels/command-cards.json', def: 'army#commandCard', array: true, data: rebelsCards },
  { path: 'armies/rebels/lists.json', def: 'army#armyList', array: true, data: rebelsLists },
  { path: 'armies/neutral/weapons.json', def: 'army#weapon', array: true, data: neutralWeapons },
  { path: 'armies/neutral/upgrades.json', def: 'army#upgrade', array: true, data: neutralUpgrades },
  { path: 'armies/neutral/command-cards.json', def: 'army#commandCard', array: true, data: neutralCards },
]
