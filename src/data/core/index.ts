import type { DataFile } from '../types'
import dice from './dice.json'
import ranks from './ranks.json'
import formats from './formats.json'
import tokens from './tokens.json'
import bases from './bases.json'
import silhouettes from './silhouettes.json'
import constants from './constants.json'
import movementTool from './movement-tool.json'
import actions from './actions.json'
import unitTypes from './unit-types.json'
import slots from './upgrade-slots.json'
import keywords from '../keywords.json'

/** Core data files (and the keyword list); paths are relative to `src/data/`. */
export const CORE_FILES: DataFile[] = [
  { path: 'core/dice.json', def: 'core#dice', array: false, data: dice },
  { path: 'core/ranks.json', def: 'core#rank', array: true, data: ranks },
  { path: 'core/formats.json', def: 'core#format', array: true, data: formats },
  { path: 'core/tokens.json', def: 'core#token', array: true, data: tokens },
  { path: 'core/bases.json', def: 'core#base', array: true, data: bases },
  { path: 'core/silhouettes.json', def: 'core#silhouette', array: true, data: silhouettes },
  { path: 'core/constants.json', def: 'core#constants', array: false, data: constants },
  { path: 'core/movement-tool.json', def: 'core#movementTool', array: false, data: movementTool },
  { path: 'core/actions.json', def: 'core#action', array: true, data: actions },
  { path: 'core/unit-types.json', def: 'core#unitType', array: true, data: unitTypes },
  { path: 'core/upgrade-slots.json', def: 'core#slot', array: true, data: slots },
  { path: 'keywords.json', def: 'keyword#keyword', array: true, data: keywords },
]
