/**
 * Acta de un reto cerrado en CSV (spec challenge-export): una fila por participante, en el orden
 * del ranking, lista para abrir en Excel o Google Sheets.
 */
export const EXPORT_HEADERS = [
  'reto',
  'periodo',
  'moneda',
  'cuota',
  'pote',
  'posicion',
  'nombre',
  'email',
  'dias_validados',
  'dias_pendientes',
  'dias_rechazados',
  'km',
  'puntaje',
  'califica',
  'estado_pago',
  'monto_pagado',
  'fecha_pago',
  'ganador',
  'nota_premio',
  'premio',
] as const;

export type ExportPaymentState = 'paid' | 'partial' | 'unpaid';

export interface ExportChallenge {
  name: string;
  year: number;
  month: number;
  currency: string;
  fee: number;
  pot: number;
}

export interface ExportParticipant {
  name: string;
  email: string;
  validatedDays: number;
  pendingDays: number;
  rejectedDays: number;
  totalKm: number;
  score: number;
  qualified: boolean;
  paymentState: ExportPaymentState;
  amountPaid: number;
  paidAt: Date | null;
  winner: boolean;
  awardNote: string | null;
  /** Premio por ganador; solo se informa a quien ganó cuando el reto cobra cuota */
  prize: number | null;
}

const PAYMENT_LABEL: Record<ExportPaymentState, string> = {
  paid: 'pagado',
  partial: 'parcial',
  unpaid: 'pendiente',
};

/** Un texto que empieza así lo leería una planilla como fórmula. */
const FORMULA_START = /^[=+\-@\t\r]/;

type Cell = { text: string } | { raw: string };

const text = (value: string | null | undefined): Cell => ({ text: value ?? '' });
const raw = (value: string | number): Cell => ({ raw: String(value) });
const yesNo = (value: boolean): Cell => raw(value ? 'si' : 'no');
const money = (value: number): Cell => raw(value.toFixed(2));

function formatCell(cell: Cell): string {
  // Los números nunca se prefijan: un valor negativo debe seguir siendo un número
  let value = 'raw' in cell ? cell.raw : FORMULA_START.test(cell.text) ? `'${cell.text}` : cell.text;
  if (/[",\r\n]/.test(value) || value !== value.trim()) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const line = (cells: Cell[]): string => cells.map(formatCell).join(',');

/** Fecha del día en UTC (AAAA-MM-DD), sin corrimiento de zona horaria. */
export function isoDay(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

/** Nombre del archivo: sale solo del año y el mes, nunca de texto escrito por usuarios. */
export function exportFilename(year: number, month: number): string {
  return `acta-reto-${year}-${String(month).padStart(2, '0')}.csv`;
}

/** CSV sin BOM: cabecera y una fila por participante, con líneas separadas por CRLF. */
export function buildChallengeCsv(challenge: ExportChallenge, participants: ExportParticipant[]): string {
  const period = `${challenge.year}-${String(challenge.month).padStart(2, '0')}`;
  const rows = participants.map((p, index) =>
    line([
      text(challenge.name),
      raw(period),
      text(challenge.currency),
      money(challenge.fee),
      money(challenge.pot),
      raw(index + 1),
      text(p.name),
      text(p.email),
      raw(p.validatedDays),
      raw(p.pendingDays),
      raw(p.rejectedDays),
      money(p.totalKm),
      raw(p.score),
      yesNo(p.qualified),
      raw(PAYMENT_LABEL[p.paymentState]),
      money(p.amountPaid),
      raw(isoDay(p.paidAt)),
      yesNo(p.winner),
      text(p.awardNote),
      raw(p.prize === null ? '' : p.prize.toFixed(2)),
    ]),
  );
  return [EXPORT_HEADERS.join(','), ...rows].map((l) => `${l}\r\n`).join('');
}
