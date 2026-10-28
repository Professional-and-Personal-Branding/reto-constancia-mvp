/*
 * Regla de inscripción compartida (spec challenge-enrollment): solo se inscribe a usuarios que
 * existen y están activos, una vez por reto. La usan la inscripción en bloque y, más adelante, la
 * renovación mensual dentro de su propia transacción: por eso recibe el cliente transaccional.
 */
import { Prisma } from '@prisma/client';

export const USER_NOT_FOUND_MESSAGE = 'Usuario no encontrado';
export const USER_INACTIVE_MESSAGE = 'El usuario está inactivo';

export interface EnrollmentRow {
  userId: string;
  name: string;
  email: string;
}

export type EnrollmentSkipReason = 'NOT_FOUND' | 'INACTIVE';

export interface EnrollmentSkip {
  userId: string;
  reason: EnrollmentSkipReason;
  message: string;
}

export interface EnrollManyResult {
  enrolled: EnrollmentRow[];
  alreadyEnrolled: EnrollmentRow[];
  skipped: EnrollmentSkip[];
}

/**
 * Inscribe a `userIds` en el reto dentro de `tx` (el llamador ya tomó el lock del reto).
 * Cada id distinto aparece en exactamente una lista; los problemas por usuario no fallan el resto.
 */
export async function enrollMany(
  tx: Prisma.TransactionClient,
  challengeId: string,
  userIds: string[],
): Promise<EnrollManyResult> {
  const ids = [...new Set(userIds)];
  const result: EnrollManyResult = { enrolled: [], alreadyEnrolled: [], skipped: [] };
  if (ids.length === 0) return result;

  const users = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, active: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const activeIds: string[] = [];
  for (const id of ids) {
    const u = byId.get(id);
    if (!u) {
      result.skipped.push({ userId: id, reason: 'NOT_FOUND', message: USER_NOT_FOUND_MESSAGE });
    } else if (!u.active) {
      result.skipped.push({ userId: id, reason: 'INACTIVE', message: USER_INACTIVE_MESSAGE });
    } else {
      activeIds.push(id);
    }
  }
  if (activeIds.length === 0) return result;

  const existing = await tx.challengeParticipant.findMany({
    where: { challengeId, userId: { in: activeIds } },
    select: { userId: true },
  });
  const enrolledBefore = new Set(existing.map((e) => e.userId));
  const toInsert = activeIds.filter((id) => !enrolledBefore.has(id));

  let inserted = new Set<string>();
  if (toInsert.length > 0) {
    // INSERT ... ON CONFLICT DO NOTHING RETURNING: solo vuelven las filas que insertó esta
    // sentencia; si otra transacción inscribió a alguien en medio, esa persona queda como ya inscrita.
    const created = await tx.challengeParticipant.createManyAndReturn({
      data: toInsert.map((userId) => ({ challengeId, userId })),
      skipDuplicates: true,
      select: { userId: true },
    });
    inserted = new Set(created.map((c) => c.userId));
  }

  for (const id of activeIds) {
    const u = byId.get(id)!;
    const entry = { userId: u.id, name: u.name, email: u.email };
    if (inserted.has(id)) result.enrolled.push(entry);
    else result.alreadyEnrolled.push(entry);
  }
  return result;
}
