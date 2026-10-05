/*
 * Bloqueo de la fila del reto (spec challenge-lifecycle, cambio closed-challenge-freeze).
 *
 * Toda escritura que depende del estado del reto corre en una transacción que primero bloquea
 * la fila y vuelve a leer el estado: así nada se confirma después de que el reto se cerró.
 * Las escrituras toman FOR SHARE (no se bloquean entre sí); el cierre toma FOR UPDATE.
 *
 * El SQL usa el nombre de tabla "Challenge": el modelo no tiene @@map. Si se agrega uno,
 * hay que cambiarlo aquí (lo ejercitan las e2e de API).
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ChallengeStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type LockMode = 'share' | 'update';

export const LOCK_CONFLICT_MESSAGE =
  'El reto se está cerrando; vuelve a intentarlo en unos segundos';

/**
 * Tiempos, ordenados para que falle primero el lock con su propio mensaje:
 * escrituras lock 5 s < timeout 10 s; cierre lock 10 s < timeout 15 s.
 */
export const WRITER_TX = { lockTimeoutMs: 5_000, maxWait: 5_000, timeout: 10_000 } as const;
export const CLOSER_TX = { lockTimeoutMs: 10_000, maxWait: 5_000, timeout: 15_000 } as const;

export interface LockedChallenge {
  id: string;
  status: ChallengeStatus;
}

/** Bloquea la fila del reto dentro de `tx` y devuelve su estado actual. */
export async function lockChallenge(
  tx: Prisma.TransactionClient,
  challengeId: string,
  mode: LockMode = 'share',
  lockTimeoutMs: number = WRITER_TX.lockTimeoutMs,
): Promise<LockedChallenge> {
  // SET no admite parámetros: el valor sale de una constante numérica, no del cliente.
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${Math.trunc(lockTimeoutMs)}ms'`);
  const rows =
    mode === 'update'
      ? await tx.$queryRaw<LockedChallenge[]>`SELECT id, status FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`
      : await tx.$queryRaw<LockedChallenge[]>`SELECT id, status FROM "Challenge" WHERE id = ${challengeId} FOR SHARE`;
  if (!rows.length) throw new NotFoundException('Reto no encontrado');
  return rows[0];
}

/** Errores de Prisma/Postgres que significan "no se pudo tomar el lock a tiempo". */
export function isLockTimeout(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2028') return true;
    if (e.code === 'P2010' || e.code === 'P2034') return /55P03|lock timeout|lock_not_available/i.test(e.message);
    return false;
  }
  if (e instanceof Prisma.PrismaClientUnknownRequestError) {
    return /55P03|lock timeout|lock_not_available/i.test(e.message);
  }
  return false;
}

/**
 * Corre `fn` en una transacción interactiva y traduce los timeouts de lock a 409, para que
 * el cliente reciba un mensaje legible y nunca un 500.
 */
export async function withChallengeLock<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWait: number; timeout: number } = WRITER_TX,
): Promise<T> {
  try {
    return await prisma.$transaction(fn, { maxWait: options.maxWait, timeout: options.timeout });
  } catch (e) {
    if (isLockTimeout(e)) throw new ConflictException(LOCK_CONFLICT_MESSAGE);
    throw e;
  }
}
