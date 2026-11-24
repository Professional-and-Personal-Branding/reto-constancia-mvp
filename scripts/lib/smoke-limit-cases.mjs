/**
 * Comprobaciones del límite de login de la prueba de humo del servicio único. Es la única fuente
 * del conteo que el resumen de --skip-limit informa como omitido: cada elemento es una comprobación
 * y llama a `check` exactamente una vez. Se ejecutan en orden (la tercera depende de la primera).
 */
export function buildLimitCases({ login, clientA, clientB, forged }) {
  return [
    {
      name: 'el login de un cliente da 401 cinco veces y 429 la sexta',
      async run(check) {
        const statuses = [];
        for (let i = 0; i < 6; i++) statuses.push((await login(clientA)).status);
        check(
          'el login de un cliente da 401 cinco veces y 429 la sexta',
          statuses.slice(0, 5).every((s) => s === 401) && statuses[5] === 429,
          statuses.join(','),
        );
      },
    },
    {
      name: 'otro cliente no comparte el límite (no da 429)',
      async run(check) {
        const other = (await login(clientB)).status;
        check('otro cliente no comparte el límite (no da 429)', other !== 429, `status ${other}`);
      },
    },
    {
      name: 'una entrada falsa a la izquierda de X-Forwarded-For no evade el límite (429)',
      async run(check) {
        const spoofed = (await login(`${forged}, ${clientA}`)).status;
        check(
          'una entrada falsa a la izquierda de X-Forwarded-For no evade el límite (429)',
          spoofed === 429,
          `status ${spoofed}`,
        );
      },
    },
  ];
}
