/**
 * Índice al que debe ir el foco con Tab dentro de un diálogo modal (OpenSpec: renewal-hardening).
 * `current` es la posición del elemento enfocado entre los `count` controles habilitados, o -1 si
 * el foco no está en ninguno. Devuelve -1 cuando no hay controles (el foco se queda en el diálogo).
 */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}
