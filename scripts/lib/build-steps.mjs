/**
 * Pasos del build de producción del servicio único (scripts/build-prod.mjs) antes de la poda de SWC.
 * Función pura, probada en build-steps.test.mjs.
 *
 * Los `npm ci` llevan `--include=dev`: si el panel de la plataforma aplica NODE_ENV=production
 * también al build, npm omitiría las devDependencies y fallarían `nest build` y Tailwind. El
 * `npm prune --omit=dev` posterior deja solo las dependencias de ejecución.
 *
 * @param {Record<string, string>} webEnv variables del `next build`
 * @returns {{ label: string, dir: 'backend' | 'frontend', cmd: string, env?: Record<string, string> }[]}
 */
export function buildSteps(webEnv) {
  return [
    { label: 'backend · npm ci', dir: 'backend', cmd: 'npm ci --include=dev --no-audit --no-fund' },
    { label: 'backend · prisma generate', dir: 'backend', cmd: 'npx prisma generate' },
    { label: 'backend · nest build', dir: 'backend', cmd: 'npm run build' },
    { label: 'backend · npm prune --omit=dev', dir: 'backend', cmd: 'npm prune --omit=dev --no-audit --no-fund' },
    { label: 'frontend · npm ci', dir: 'frontend', cmd: 'npm ci --include=dev --no-audit --no-fund' },
    {
      label: `frontend · next build (NEXT_PUBLIC_API_URL=${webEnv.NEXT_PUBLIC_API_URL})`,
      dir: 'frontend',
      cmd: 'npx next build',
      env: webEnv,
    },
    { label: 'frontend · npm prune --omit=dev', dir: 'frontend', cmd: 'npm prune --omit=dev --no-audit --no-fund' },
  ];
}
