/**
 * Pasos del build de producción del backend, en el orden en que corren (los usa scripts/build-prod.mjs).
 * El seed se compila a JS antes de la poda porque tsc es una devDependency: tras `npm prune --omit=dev`
 * ya no existe ts-node ni tsc, y `npm run seed:prod` solo necesita node y las dependencias de producción.
 */
export function backendSteps() {
  return [
    { label: 'backend · npm ci', cmd: 'npm ci --no-audit --no-fund' },
    { label: 'backend · prisma generate', cmd: 'npx prisma generate' },
    { label: 'backend · nest build', cmd: 'npm run build' },
    { label: 'backend · compilar el seed (npm run build:seed)', cmd: 'npm run build:seed' },
    { label: 'backend · npm prune --omit=dev', cmd: 'npm prune --omit=dev --no-audit --no-fund' },
  ];
}
