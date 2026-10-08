import {
  buildChallengeCsv,
  EXPORT_HEADERS,
  ExportChallenge,
  ExportParticipant,
  exportFilename,
} from './challenge-export';

const challenge: ExportChallenge = {
  name: 'Reto Mayo 2026',
  year: 2026,
  month: 5,
  currency: 'BOB',
  fee: 50,
  pot: 100,
};

function participant(over: Partial<ExportParticipant> = {}): ExportParticipant {
  return {
    name: 'Ana Pérez',
    email: 'ana@reto.local',
    validatedDays: 12,
    pendingDays: 1,
    rejectedDays: 2,
    totalKm: 30.5,
    score: 12,
    qualified: true,
    paymentState: 'paid',
    amountPaid: 50,
    paidAt: new Date('2026-05-03T15:00:00.000Z'),
    winner: false,
    awardNote: null,
    prize: null,
    ...over,
  };
}

/** Separa el CSV en líneas y las celdas simples (sin comas dentro de comillas). */
const lines = (csv: string) => csv.split('\r\n').slice(0, -1);

describe('buildChallengeCsv (spec challenge-export)', () => {
  it('trae la cabecera fija y una fila por participante, con CRLF al final de cada línea', () => {
    const csv = buildChallengeCsv(challenge, [participant(), participant({ name: 'Bruno' })]);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = lines(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe(EXPORT_HEADERS.join(','));
    expect(EXPORT_HEADERS).toHaveLength(20);
  });

  it('sin participantes solo trae la cabecera', () => {
    expect(buildChallengeCsv(challenge, [])).toBe(`${EXPORT_HEADERS.join(',')}\r\n`);
  });

  it('formatea reto, periodo, dinero, km, fechas y booleanos', () => {
    const [, row] = lines(buildChallengeCsv(challenge, [participant()]));
    expect(row).toBe(
      'Reto Mayo 2026,2026-05,BOB,50.00,100.00,1,Ana Pérez,ana@reto.local,12,1,2,30.50,12,si,pagado,50.00,2026-05-03,no,,',
    );
  });

  it('numera la posición en el orden recibido y marca estado de pago y ganadores con su premio', () => {
    const csv = buildChallengeCsv(challenge, [
      participant({ name: 'Ana', winner: true, awardNote: 'Sorteo automático al cierre', prize: 50 }),
      participant({ name: 'Bruno', paymentState: 'partial', amountPaid: 20, qualified: false }),
      participant({ name: 'Carla', paymentState: 'unpaid', amountPaid: 0, paidAt: null }),
    ]);
    const [, ana, bruno, carla] = lines(csv);
    expect(ana).toContain(',1,Ana,');
    expect(ana.endsWith(',si,Sorteo automático al cierre,50.00')).toBe(true);
    expect(bruno).toContain(',2,Bruno,');
    expect(bruno).toContain(',no,parcial,20.00,2026-05-03,no,,');
    expect(carla).toContain(',3,Carla,');
    expect(carla).toContain(',pendiente,0.00,,no,,');
  });

  it('cita las celdas con comas, comillas o saltos de línea y conserva los acentos', () => {
    const [, row] = lines(
      buildChallengeCsv(challenge, [participant({ name: 'Pérez, José "Pepe"', awardNote: 'a\nb' })]),
    );
    expect(row).toContain('"Pérez, José ""Pepe"""');
    expect(row).toContain('"a\nb"');
  });

  it('cita los textos con espacios al borde', () => {
    const [, row] = lines(buildChallengeCsv(challenge, [participant({ name: ' Ana ' })]));
    expect(row).toContain('," Ana ",');
  });

  it.each(['=1+1', '+54', '-2', '@SUMA(A1)', '\tcelda', '\rcelda'])(
    'neutraliza un texto que una planilla leería como fórmula: %j',
    (value) => {
      const csv = buildChallengeCsv({ ...challenge, name: value }, [participant({ name: value, email: value, awardNote: value })]);
      const dataRow = csv.slice(csv.indexOf('\r\n') + 2);
      // El apóstrofo va delante y el texto original sigue a continuación (entre comillas si hace falta)
      expect(dataRow).toContain(`'${value}`);
      expect(dataRow.startsWith(value)).toBe(false);
    },
  );

  it('una fórmula con comillas queda neutralizada y bien citada', () => {
    const name = '=HYPERLINK("http://x","y")';
    const [, row] = lines(buildChallengeCsv(challenge, [participant({ name })]));
    expect(row).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it('no prefija los números: un puntaje negativo seguiría siendo un número', () => {
    const [, row] = lines(buildChallengeCsv(challenge, [participant({ score: -1 })]));
    expect(row).toContain(',-1,');
    expect(row).not.toContain("'-1");
  });
});

describe('exportFilename', () => {
  it('sale solo del año y el mes', () => {
    expect(exportFilename(2026, 5)).toBe('acta-reto-2026-05.csv');
    expect(exportFilename(2026, 12)).toBe('acta-reto-2026-12.csv');
  });
});
