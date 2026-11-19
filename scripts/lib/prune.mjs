/**
 * Poda de binarios SWC de Next tras `npm prune --omit=dev` (servicio único, plan de 750 MB).
 * Next instala los binarios de glibc y de musl (137 MB cada uno); `next start` no los carga,
 * así que se conservan solo los de la libc del runtime. Función pura, probada en prune.test.mjs.
 */

/**
 * @param {string[]} names nombres dentro de node_modules/@next
 * @param {boolean} glibc true si el runtime es glibc, false si es musl
 * @returns {string[]} nombres a borrar
 */
export function swcDirsToPrune(names, glibc) {
  const otherLibc = glibc ? 'musl' : 'gnu';
  return names.filter((name) => new RegExp(`^swc-linux-.+-${otherLibc}$`).test(name));
}

/** true si el proceso corre sobre glibc (Debian, Ubuntu); false en musl (Alpine). */
export function runtimeIsGlibc() {
  return Boolean(process.report?.getReport?.().header?.glibcVersionRuntime);
}
