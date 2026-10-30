import type { SafeUser } from './types';

/** Reglas puras de la página Usuarios del admin (spec user-administration). */

/** Minúsculas y sin tildes (NFD) para comparar texto. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Busca por nombre o correo, sin distinguir mayúsculas ni tildes. Búsqueda vacía: todos. */
export function filterUsers(users: SafeUser[], query: string): SafeUser[] {
  const q = normalizeText(query);
  if (!q) return users;
  return users.filter((u) => normalizeText(u.name).includes(q) || normalizeText(u.email).includes(q));
}

/** Ordena por nombre (español) sin mutar la lista recibida. */
export function sortUsers(users: SafeUser[]): SafeUser[] {
  return [...users].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.email.localeCompare(b.email, 'es'));
}

export const roleLabel = (user: Pick<SafeUser, 'role'>) => (user.role === 'ADMIN' ? 'Admin' : 'Participante');
export const statusLabel = (user: Pick<SafeUser, 'active'>) => (user.active ? 'Activo' : 'Inactivo');

/** Qué ofrece la fila: la propia no ofrece nada (muestra "Tú"); el resto, las tres acciones. */
export function rowActions(user: SafeUser, selfId: string | undefined) {
  if (user.id === selfId) return { isSelf: true as const };
  return {
    isSelf: false as const,
    toggleActiveLabel: user.active ? 'Desactivar' : 'Activar',
    toggleRoleLabel: user.role === 'ADMIN' ? 'Quitar admin' : 'Hacer admin',
    resetLabel: 'Reiniciar contraseña',
    // Activar no pide confirmación (design D6)
    activeNeedsConfirm: user.active,
  };
}

export const deactivateConfirmation = (name: string) =>
  `¿Desactivar a ${name}? No podrá entrar ni usar su sesión actual.`;
export const roleConfirmation = (user: Pick<SafeUser, 'name' | 'role'>) =>
  user.role === 'ADMIN'
    ? `¿Quitar los permisos de administrador a ${user.name}?`
    : `¿Dar permisos de administrador a ${user.name}?`;
export const resetConfirmation = (name: string) =>
  `Se generará una contraseña temporal para ${name} y sus sesiones abiertas se cerrarán en unos minutos. ¿Continuar?`;

export const TEMP_PASSWORD_NOTICE =
  'Se muestra una sola vez. Compártela por un canal privado y pídele que la cambie en Mi cuenta al entrar.';
export const INACTIVE_NOTICE = 'La cuenta está inactiva: actívala para que pueda entrar.';
