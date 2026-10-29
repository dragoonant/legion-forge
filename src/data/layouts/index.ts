import type { DataFile } from '../types'
import reconForest1 from './recon-forest-1.json'

/** Terrain layouts per format. */
export const LAYOUT_FILES: DataFile[] = [{ path: 'layouts/recon-forest-1.json', def: 'layout#layout', array: false, data: reconForest1 }]
