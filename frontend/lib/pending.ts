/**
 * Cola de validación del admin (spec challenge-lifecycle, cambio validation-queue-filters).
 */

/** Texto de la insignia de "Validar": nada en 0, el número hasta 99 y "99+" por encima. */
export function pendingBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}
