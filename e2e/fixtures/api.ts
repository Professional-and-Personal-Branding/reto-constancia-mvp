import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Utilidades para preparar datos por API. Las pruebas verifican la UI; los datos que
 * necesitan (retos, inscripciones, actividades) se crean por aquí para que cada recorrido
 * sea independiente y repetible.
 */
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3002/api';

/**
 * Año reservado para los datos de Playwright. Cada spec limpia el suyo antes de empezar.
 * Debe estar en el pasado: el formulario de subida no acepta fechas futuras.
 */
export const E2E_YEAR = 2025;

export const SEED = {
  admin: { email: 'admin@reto.local', password: 'ChangeMe123!' },
  participant: { email: 'ana@reto.local', password: 'ChangeMe123!' },
};

export const AUTH_DIR = join(__dirname, '..', '.auth');
export const STATE = {
  admin: join(AUTH_DIR, 'admin.json'),
  participant: join(AUTH_DIR, 'participant.json'),
  tokens: join(AUTH_DIR, 'tokens.json'),
};

export interface ApiTokens {
  admin: string;
  participant: string;
  adminId: string;
  participantId: string;
}

/** Tokens capturados en auth.setup.ts: evita volver a loguear (límite de 5 por minuto). */
export function tokens(): ApiTokens {
  return JSON.parse(readFileSync(STATE.tokens, 'utf8')) as ApiTokens;
}

export async function api<T = any>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = (await res.json().catch(() => null)) as T;
  return { status: res.status, body };
}

export interface Challenge {
  id: string;
  name: string;
  month: number;
  year: number;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
}

export interface ChallengeInput {
  month: number;
  name: string;
  minHeartRateMinutes?: number;
  budgetTotal?: number;
  feePerParticipant?: number;
  validDays?: number[];
  pointsPerValidatedDay?: number;
  pointsPerKm?: number;
  minValidatedDaysToQualify?: number;
  maxWinners?: number;
  tiebreakRule?: 'DRAW' | 'TOTAL_KM' | 'SHARE_ALL';
}

async function findChallenge(month: number): Promise<Challenge | undefined> {
  const { admin } = tokens();
  const list = await api<Challenge[]>('GET', '/challenges', { token: admin });
  return (list.body ?? []).find((c) => c.month === month && c.year === E2E_YEAR);
}

/** Borra todas las actividades de un reto (el admin puede borrar cualquiera). */
export async function clearActivities(challengeId: string): Promise<void> {
  const { admin } = tokens();
  const list = await api<{ id: string }[]>('GET', `/activities?challengeId=${challengeId}`, {
    token: admin,
  });
  for (const activity of list.body ?? []) {
    await api('DELETE', `/activities/${activity.id}`, { token: admin });
  }
}

/**
 * Deja listo un reto ACTIVO del año de pruebas con las reglas pedidas, sin actividades.
 * Reutiliza el reto si ya existe (la clave mes+año es única) para que la suite sea repetible.
 */
export async function setupChallenge(input: ChallengeInput): Promise<Challenge> {
  const { admin } = tokens();
  const rules = {
    name: input.name,
    validDays: input.validDays ?? [0, 1, 2, 3, 4, 5, 6],
    minHeartRateMinutes: input.minHeartRateMinutes ?? 0,
    feePerParticipant: input.feePerParticipant ?? 0,
    budgetTotal: input.budgetTotal ?? 0,
    currency: 'BOB',
    pointsPerValidatedDay: input.pointsPerValidatedDay ?? 1,
    pointsPerKm: input.pointsPerKm ?? 0,
    minValidatedDaysToQualify: input.minValidatedDaysToQualify ?? 0,
    maxWinners: input.maxWinners ?? 2,
    tiebreakRule: input.tiebreakRule ?? 'DRAW',
  };

  let challenge = await findChallenge(input.month);

  if (!challenge) {
    const created = await api<Challenge>('POST', '/challenges', {
      token: admin,
      body: {
        ...rules,
        month: input.month,
        year: E2E_YEAR,
        startDate: `${E2E_YEAR}-${String(input.month).padStart(2, '0')}-01T00:00:00.000Z`,
        endDate: `${E2E_YEAR}-${String(input.month).padStart(2, '0')}-28T23:59:59.000Z`,
      },
    });
    if (created.status !== 201) {
      throw new Error(`No se pudo crear el reto: ${created.status} ${JSON.stringify(created.body)}`);
    }
    challenge = created.body;
  } else {
    await clearActivities(challenge.id);
    if (challenge.status === 'COMPLETED') {
      await api('PATCH', `/challenges/${challenge.id}`, { token: admin, body: { status: 'DRAFT' } });
    }
    const updated = await api<Challenge>('PATCH', `/challenges/${challenge.id}`, {
      token: admin,
      body: rules,
    });
    challenge = updated.body;
  }

  const activated = await api<Challenge>('POST', `/challenges/${challenge.id}/activate`, {
    token: admin,
  });
  return activated.status === 201 ? activated.body : challenge;
}

/** Cierra el reto de pruebas para que deje de aparecer entre los activos. */
export async function closeChallenge(month: number): Promise<void> {
  const { admin } = tokens();
  const challenge = await findChallenge(month);
  if (!challenge) return;
  await clearActivities(challenge.id);
  if (challenge.status === 'ACTIVE') {
    await api('POST', `/challenges/${challenge.id}/close`, { token: admin });
  }
}

export async function enroll(challengeId: string, userId: string): Promise<void> {
  const { admin } = tokens();
  await api('POST', `/challenges/${challengeId}/participants`, {
    token: admin,
    body: { userId },
  });
}

export async function markPaid(challengeId: string, userId: string, paid: boolean): Promise<void> {
  const { admin } = tokens();
  await api('PATCH', `/challenges/${challengeId}/participants/${userId}/payment`, {
    token: admin,
    body: { paid },
  });
}

/** Crea una actividad del participante por API (para poblar rankings y validaciones). */
export async function createActivity(
  challengeId: string,
  isoDate: string,
  options: { distanceKm?: number; heartRateMinutes?: number; withHeartRatePhoto?: boolean } = {},
): Promise<{ id: string; status: string }> {
  const { participant } = tokens();
  const photos: { url: string; cloudinaryId: string; type: string }[] = [
    { url: 'https://example.com/e2e/activity.png', cloudinaryId: `e2e/${isoDate}/act`, type: 'ACTIVITY' },
  ];
  if (options.withHeartRatePhoto) {
    photos.push({
      url: 'https://example.com/e2e/hr.png',
      cloudinaryId: `e2e/${isoDate}/hr`,
      type: 'HEART_RATE',
    });
  }
  const res = await api<{ id: string; status: string }>('POST', '/activities', {
    token: participant,
    body: {
      challengeId,
      date: isoDate,
      exerciseType: 'RUNNING',
      durationMinutes: 40,
      distanceKm: options.distanceKm,
      heartRateMinutes: options.heartRateMinutes,
      photos,
    },
  });
  if (res.status !== 201) {
    throw new Error(`No se pudo crear la actividad: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/** Fecha válida dentro del reto de pruebas (día 1..28 del mes indicado). */
export function e2eDate(month: number, day: number): string {
  return `${E2E_YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
