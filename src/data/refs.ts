import type { DataFile, Id } from './types'

/** Every `{ "code": "<hook>" }` node anywhere inside a record (CodeRef shape: only `code` and optional `params`). */
export function codesIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) codesIn(n, out)
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    const keys = Object.keys(o)
    if (typeof o.code === 'string' && keys.every((k) => k === 'code' || k === 'params')) out.push(o.code)
    for (const k of keys) codesIn(o[k], out)
  }
  return out
}

/** Every `{ "unimplemented": "<why>" }` node anywhere inside a record, with its reason. */
export function unimplementedIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) unimplementedIn(n, out)
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o.unimplemented === 'string') out.push(o.unimplemented)
    for (const k of Object.keys(o)) unimplementedIn(o[k], out)
  }
  return out
}

/** Every string value in a record that looks like an id under one of the given prefixes. */
export function idsWithPrefix(node: unknown, prefix: string, out: Id[] = []): Id[] {
  if (typeof node === 'string') {
    if (node.startsWith(prefix)) out.push(node)
  } else if (Array.isArray(node)) {
    for (const n of node) idsWithPrefix(n, prefix, out)
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) idsWithPrefix(v, prefix, out)
  }
  return out
}

export function recordsOf(file: DataFile): Record<string, unknown>[] {
  return (file.array ? (file.data as unknown[]) : [file.data]) as Record<string, unknown>[]
}
