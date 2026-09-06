/**
 * Prueba de sesiones paralelas (admin + participante) contra la API local.
 *
 * Simula dos sesiones concurrentes para visualizar el flujo desde ambos roles:
 *  - Admin: gestiona reto, valida actividades, premia, consulta resultados.
 *  - Participante: consulta reto activo, registra actividad, ve su progreso.
 * Incluye verificación de RBAC y de apertura de múltiples retos con reglas configurables.
 *
 * Uso: node scripts/parallel-session-test.mjs
 * Requiere el backend corriendo (por defecto http://localhost:3002/api).
 */

const BASE = process.env.API_URL ?? 'http://localhost:3002/api';
const ADMIN = { email: 'admin@reto.local', password: 'ChangeMe123!' };
const ANA = { email: 'ana@reto.local', password: 'ChangeMe123!' };

let pass = 0;
let fail = 0;

function check(name, cond, detail = '') {
  const ok = !!cond;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ->  ${detail}` : ''}`);
  return ok;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo */
  }
  return { status: res.status, json };
}

async function login({ email, password }) {
  const { status, json } = await req('POST', '/auth/login', { body: { email, password } });
  if (status !== 200) throw new Error(`Login falló para ${email}: ${status}`);
  return json.tokens.accessToken;
}

async function main() {
  console.log(`API: ${BASE}`);

  // ---- 1. Dos sesiones en paralelo (login concurrente) ----
  section('1. Apertura de 2 sesiones en paralelo (admin + participante)');
  const [adminTok, anaTok] = await Promise.all([login(ADMIN), login(ANA)]);
  check('Admin obtiene token', !!adminTok);
  check('Ana (participante) obtiene token', !!anaTok);

  const [meAdmin, meAna] = await Promise.all([
    req('GET', '/auth/me', { token: adminTok }),
    req('GET', '/auth/me', { token: anaTok }),
  ]);
  check('Sesión admin -> rol ADMIN', meAdmin.json?.role === 'ADMIN', meAdmin.json?.email);
  check('Sesión Ana -> rol PARTICIPANT', meAna.json?.role === 'PARTICIPANT', meAna.json?.email);

  // ---- 2. Participante consulta el reto activo ----
  section('2. Participante consulta el reto activo');
  const active = await req('GET', '/challenges/active', { token: anaTok });
  const challengeId = active.json?.id;
  check('Hay un reto activo', !!challengeId, active.json?.name);

  // ---- 3. Participante registra una actividad (día válido libre) ----
  section('3. Participante registra actividad del día');
  const candidateDates = ['2026-05-06', '2026-05-07', '2026-05-08', '2026-05-11'];
  let created = null;
  for (const date of candidateDates) {
    const r = await req('POST', '/activities', {
      token: anaTok,
      body: {
        challengeId,
        date,
        exerciseType: 'RUNNING',
        durationMinutes: 32,
        distanceKm: 5.5,
        avgHeartRate: 145,
        hasHeartRateProof: true,
        notes: 'Sesión paralela: actividad de prueba.',
        photos: [
          { url: `${BASE.replace('/api', '')}/uploads/test.png`, cloudinaryId: 'test/parallel', type: 'ACTIVITY' },
        ],
      },
    });
    if (r.status === 201) {
      created = r.json;
      check(`Actividad creada para ${date}`, true, `id=${created.id} status=${created.status}`);
      break;
    }
    if (r.status === 409) continue; // ya existe ese día, prueba el siguiente
    check(`Actividad para ${date}`, false, `status ${r.status}: ${JSON.stringify(r.json)}`);
    break;
  }
  check('Se registró una actividad nueva', !!created);

  // ---- 4. Admin valida la actividad recién creada (mientras Ana consulta) ----
  section('4. Admin valida la actividad (flujo concurrente)');
  const [pending, anaList] = await Promise.all([
    req('GET', `/activities/pending?challengeId=${challengeId}`, { token: adminTok }),
    req('GET', `/activities/me?challengeId=${challengeId}`, { token: anaTok }),
  ]);
  check('Admin ve actividades pendientes', Array.isArray(pending.json), `total=${pending.json?.length}`);
  check('Ana ve sus actividades', Array.isArray(anaList.json), `total=${anaList.json?.length}`);

  if (created) {
    const val = await req('POST', `/activities/${created.id}/validate`, { token: adminTok });
    check('Admin valida la actividad de Ana', val.json?.status === 'VALIDATED');

    const after = await req('GET', `/activities/me?challengeId=${challengeId}`, { token: anaTok });
    const validatedNow = after.json?.find((a) => a.id === created.id)?.status;
    check('Ana ve su actividad VALIDATED', validatedNow === 'VALIDATED', `status=${validatedNow}`);
  }

  // ---- 5. Resultados / ranking ----
  section('5. Resultados y ranking del reto');
  const results = await req('GET', `/challenges/${challengeId}/results`, { token: adminTok });
  check('Hay ranking', Array.isArray(results.json?.ranking), `participantes=${results.json?.ranking?.length}`);
  const top = results.json?.ranking?.[0];
  check('Top del ranking calculado', !!top, top ? `${top.name} (${top.validatedDays} días)` : '');

  // ---- 6. RBAC: el participante NO puede acciones de admin ----
  section('6. RBAC (control de acceso por rol)');
  const anaCreateChallenge = await req('POST', '/challenges', {
    token: anaTok,
    body: { name: 'Hack', month: 7, year: 2026, startDate: '2026-07-01', endDate: '2026-07-31' },
  });
  check('Ana NO puede crear retos (403)', anaCreateChallenge.status === 403, `status=${anaCreateChallenge.status}`);

  const anaListAll = await req('GET', '/activities', { token: anaTok });
  check('Ana NO puede listar todas las actividades (403)', anaListAll.status === 403, `status=${anaListAll.status}`);

  const anaImport = await req('GET', '/import/template', { token: anaTok });
  check('Ana NO puede usar importación (403)', anaImport.status === 403, `status=${anaImport.status}`);

  const noToken = await req('GET', '/auth/me');
  check('Sin token -> 401', noToken.status === 401, `status=${noToken.status}`);

  // ---- 7. Múltiples retos con reglas configurables ----
  section('7. Apertura de múltiples retos con reglas configurables');
  const all = await req('GET', '/challenges', { token: adminTok });
  check('Listado de retos disponible', Array.isArray(all.json), `total=${all.json?.length}`);

  // Crea (o reutiliza) un segundo reto con reglas DISTINTAS al de mayo.
  const customRules = {
    name: 'Reto Diciembre 2026 (reglas distintas)',
    month: 12,
    year: 2026,
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    validDays: [0, 6], // solo fines de semana
    minHeartRateMinutes: 30,
    feePerParticipant: 150,
    budgetTotal: 900,
    currency: 'USD',
    prizeDescription: 'Reglas configurables: FC 30min, solo fines de semana, premio en USD.',
  };
  let second = await req('POST', '/challenges', { token: adminTok, body: customRules });
  if (second.status === 409) {
    const list = await req('GET', '/challenges', { token: adminTok });
    const existing = list.json.find((c) => c.month === 12 && c.year === 2026);
    second = { status: 200, json: existing };
    check('Segundo reto ya existía (idempotente)', !!existing);
  } else {
    check('Segundo reto creado con reglas propias', second.status === 201, `status=${second.status}`);
  }

  const sid = second.json?.id;
  const detail = await req('GET', `/challenges/${sid}`, { token: adminTok });
  const c = detail.json;
  check('validDays configurable (fines de semana)', JSON.stringify(c?.validDays) === JSON.stringify([0, 6]), JSON.stringify(c?.validDays));
  check('minHeartRateMinutes configurable (30)', Number(c?.minHeartRateMinutes) === 30, `${c?.minHeartRateMinutes}`);
  check('currency configurable (USD)', c?.currency === 'USD', c?.currency);
  check('Coexisten >= 2 retos', (all.json?.length ?? 0) >= 1 && !!sid);

  // ---- 8. Múltiples retos ACTIVOS a la vez (OpenSpec: challenge-lifecycle) ----
  section('8. Múltiples retos activos a la vez y selección por participante');
  if (c?.status === 'COMPLETED') {
    // Corrida anterior interrumpida: vuelve a DRAFT para que el flujo sea repetible.
    await req('PATCH', `/challenges/${sid}`, { token: adminTok, body: { status: 'DRAFT' } });
  }
  const anaActivate = await req('POST', `/challenges/${sid}/activate`, { token: anaTok });
  check('Ana NO puede activar retos (403)', anaActivate.status === 403, `status=${anaActivate.status}`);

  const act2 = await req('POST', `/challenges/${sid}/activate`, { token: adminTok });
  check('Admin activa el segundo reto con el de mayo aún activo', act2.json?.status === 'ACTIVE', `status=${act2.status}`);
  const actAgain = await req('POST', `/challenges/${sid}/activate`, { token: adminTok });
  check('Reactivar es idempotente', actAgain.json?.status === 'ACTIVE', `status=${actAgain.status}`);
  const mayStill = await req('GET', `/challenges/${challengeId}`, { token: adminTok });
  check('El reto de mayo sigue ACTIVE', mayStill.json?.status === 'ACTIVE', mayStill.json?.status);

  const enroll = await req('POST', `/challenges/${sid}/participants`, { token: adminTok, body: { userId: meAna.json?.id } });
  check('Ana inscrita en el segundo reto (o ya lo estaba)', enroll.status === 201 || enroll.status === 409, `status=${enroll.status}`);

  const activeList = await req('GET', '/challenges/active/list', { token: anaTok });
  const listIds = (activeList.json ?? []).map((x) => x.id);
  check('GET /challenges/active/list devuelve ambos retos', listIds.includes(sid) && listIds.includes(challengeId), `total=${listIds.length}`);
  const starts = (activeList.json ?? []).map((x) => new Date(x.startDate).getTime());
  const sortedDesc = starts.every((t, i) => i === 0 || starts[i - 1] >= t);
  check('Lista ordenada del más reciente al más antiguo (startDate desc)', sortedDesc, `first=${activeList.json?.[0]?.name}`);
  check('isParticipant calculado para Ana', activeList.json?.every((x) => typeof x.isParticipant === 'boolean') && activeList.json?.find((x) => x.id === sid)?.isParticipant === true);

  const activeDefault = await req('GET', '/challenges/active', { token: anaTok });
  const expectedDefault = (activeList.json ?? []).find((x) => x.isParticipant)?.id;
  check('GET /challenges/active -> el activo más reciente donde Ana participa', !!expectedDefault && activeDefault.json?.id === expectedDefault, activeDefault.json?.name);

  // Actividad en el segundo reto (solo fines de semana) sin afectar el ranking de mayo
  let decCreated = null;
  for (const date of ['2026-12-05', '2026-12-06', '2026-12-12', '2026-12-13']) {
    const r = await req('POST', '/activities', {
      token: anaTok,
      body: {
        challengeId: sid,
        date,
        exerciseType: 'CYCLING',
        durationMinutes: 40,
        distanceKm: 12,
        avgHeartRate: 138,
        hasHeartRateProof: true,
        photos: [
          { url: `${BASE.replace('/api', '')}/uploads/test.png`, cloudinaryId: 'test/parallel-dec', type: 'ACTIVITY' },
        ],
      },
    });
    if (r.status === 201) { decCreated = r.json; break; }
    if (r.status !== 409) { check(`Actividad diciembre ${date}`, false, `status ${r.status}: ${JSON.stringify(r.json)}`); break; }
  }
  check('Ana registra actividad en el segundo reto activo', !!decCreated, decCreated ? `id=${decCreated.id}` : '');
  const decResults = await req('GET', `/challenges/${sid}/results`, { token: adminTok });
  check('Ranking del segundo reto disponible', Array.isArray(decResults.json?.ranking));
  const mayAfter = await req('GET', `/challenges/${challengeId}/results`, { token: adminTok });
  check('El ranking de mayo no cambia por actividades de diciembre', mayAfter.json?.topScore === results.json?.topScore, `topScore=${mayAfter.json?.topScore}`);

  // Cierre del segundo reto: mayo sigue activo, el cerrado ya no se lista ni se reactiva
  const closeDec = await req('POST', `/challenges/${sid}/close`, { token: adminTok });
  check('Admin cierra el segundo reto', closeDec.json?.status === 'COMPLETED', `status=${closeDec.status}`);
  const listAfterClose = await req('GET', '/challenges/active/list', { token: anaTok });
  const idsAfter = (listAfterClose.json ?? []).map((x) => x.id);
  check('Mayo sigue en la lista de activos y diciembre ya no', idsAfter.includes(challengeId) && !idsAfter.includes(sid), `total=${idsAfter.length}`);
  const reactivate = await req('POST', `/challenges/${sid}/activate`, { token: adminTok });
  check('Un reto cerrado no se reactiva (400)', reactivate.status === 400, `status=${reactivate.status}`);

  // Limpieza para que la corrida sea repetible
  if (decCreated) await req('DELETE', `/activities/${decCreated.id}`, { token: anaTok });
  const reset = await req('PATCH', `/challenges/${sid}`, { token: adminTok, body: { status: 'DRAFT' } });
  check('Segundo reto vuelve a DRAFT (limpieza)', reset.json?.status === 'DRAFT', `status=${reset.status}`);

  // ---- Resumen ----
  section('Resumen');
  console.log(`  TOTAL: ${pass + fail}  |  PASS: ${pass}  |  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Error en la prueba:', e);
  process.exit(1);
});
