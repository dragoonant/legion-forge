// Pacing rules of a bot game. Pure, so the store and the tests share them: how long a bot waits before it answers, and which
// decisions start an attack sequence (a watched game can pause there).
import type { Seat } from '@/engine'
import { speedFactor, type AnimSpeed } from '../presentation/settings'
import type { SeatMode } from '../params'

/** Pause (ms at normal speed) between the end of the last beat and the bot's answer. */
export const BOT_DELAY_MS = 350

export const botDelayMs = (speed: AnimSpeed): number => Math.round(BOT_DELAY_MS * speedFactor(speed))

/** The decision kinds that make up an attack. */
const ATTACK_KINDS = new Set(['attack.defender', 'attack.pool', 'attack.extraDefender', 'attack.spend', 'attack.allocate'])
export const isAttackKind = (kind: string | null): boolean => kind !== null && ATTACK_KINDS.has(kind)

/** True for the first decision of an attack (the decision before it was not part of one). */
export const startsAttackSequence = (previousKind: string | null, kind: string): boolean => isAttackKind(kind) && !isAttackKind(previousKind)

/** Nobody at a human seat: the watch controls apply. */
export const isWatching = (seats: Record<Seat, SeatMode>): boolean => seats.A === 'bot' && seats.B === 'bot'
