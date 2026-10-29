// Procedural table-mat texture for the Recon table (one canvas per table size), built once, deterministic (seeded pseudo-random,
// never Math.random) and cached. Browser only (canvas). A faint 1" grid, stronger every 6", so distances read at a glance; M5
// replaces this with real mat art.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const PPI = 24
const cache = new Map<string, CanvasTexture>()

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** The mat for a table of `w` x `h` inches (centred on the origin). */
export function tableTexture(w: number, h: number): CanvasTexture {
  const key = `${w}x${h}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = Math.round(w * PPI)
  const H = Math.round(h * PPI)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const rand = rng(1977)
  const base = g.createLinearGradient(0, 0, W, H)
  base.addColorStop(0, '#4a5236')
  base.addColorStop(0.5, '#3f4a32')
  base.addColorStop(1, '#475038')
  g.fillStyle = base
  g.fillRect(0, 0, W, H)
  // mottled patches of dry grass and dirt
  for (let i = 0; i < 260; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = (0.6 + rand() * 2.4) * PPI
    const b = g.createRadialGradient(x, y, 0, x, y, r)
    const dirt = rand() < 0.4
    b.addColorStop(0, dirt ? `rgba(120,100,70,${0.1 + rand() * 0.15})` : `rgba(${rand() < 0.5 ? '90,110,60' : '35,50,28'},${0.12 + rand() * 0.16})`)
    b.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = b
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(255,255,230,${rand() * 0.07})` : `rgba(0,0,0,${rand() * 0.12})`
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2)
  }
  // grid: 1" faint, 6" strong
  for (let i = 0; i <= w; i++) {
    g.strokeStyle = i % 6 === 0 ? 'rgba(210,225,240,0.28)' : 'rgba(210,225,240,0.07)'
    g.lineWidth = i % 6 === 0 ? 1.5 : 1
    g.beginPath()
    g.moveTo(i * PPI, 0)
    g.lineTo(i * PPI, H)
    g.stroke()
  }
  for (let j = 0; j <= h; j++) {
    g.strokeStyle = j % 6 === 0 ? 'rgba(210,225,240,0.28)' : 'rgba(210,225,240,0.07)'
    g.lineWidth = j % 6 === 0 ? 1.5 : 1
    g.beginPath()
    g.moveTo(0, j * PPI)
    g.lineTo(W, j * PPI)
    g.stroke()
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.anisotropy = 8
  cache.set(key, tex)
  return tex
}
