'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { toDayKey } from '@/lib/dates';
import type { Challenge, TiebreakRule } from '@/lib/types';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function ChallengesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: challenges } = useQuery<(Challenge & { _count: { participants: number; activities: number } })[]>({
    queryKey: ['challenges', 'all'],
    queryFn: () => api('/challenges'),
  });

  const [actionError, setActionError] = useState<string | null>(null);

  function showError(e: unknown) {
    const apiErr = e as ApiError;
    const msg =
      (apiErr?.body as { message?: string | string[] } | null)?.message ??
      (e instanceof Error ? e.message : 'Error inesperado');
    setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
  }

  const closeMut = useMutation({
    mutationFn: (id: string) => api(`/challenges/${id}/close`, { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['challenges'] });
      qc.invalidateQueries({ queryKey: ['challenge'] });
    },
    onError: showError,
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => api(`/challenges/${id}/activate`, { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries();
    },
    onError: showError,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
            Configuración
          </p>
          <h1 className="display text-5xl leading-none">Retos</h1>
          <p className="text-ink-dim mt-3">
            Cada reto tiene sus propias reglas. Puede haber varios retos activos a la vez;
            los participantes eligen en cuál trabajan desde el selector del encabezado.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className={showForm ? 'btn-ghost' : 'btn-primary'}
        >
          {showForm ? 'Cerrar' : '+ Nuevo reto'}
        </button>
      </div>

      {showForm && <ChallengeForm onDone={() => setShowForm(false)} />}

      {actionError && (
        <div
          role="alert"
          className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5"
        >
          {actionError}
        </div>
      )}

      <div className="space-y-3">
        {challenges?.map((c) =>
          editingId === c.id ? (
            <ChallengeForm key={c.id} challenge={c} onDone={() => setEditingId(null)} />
          ) : (
          <div key={c.id} className="card p-5" aria-label={`Reto ${c.name}`}>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <p className="display text-2xl">{c.name}</p>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-sm text-ink-dim">
                  {MONTHS[c.month - 1]} {c.year} · días{' '}
                  {c.validDays.map((d) => DAY_NAMES[d]).join(', ')} ·{' '}
                  {c.minHeartRateMinutes} min FC mín
                </p>
                <p className="text-xs text-ink-mute mt-1">
                  {c._count.participants} participantes · {c._count.activities} actividades
                  · presupuesto{' '}
                  {c.budgetTotal === null ? 'automático' : `${c.budgetTotal} ${c.currency}`}
                </p>
              </div>
              <div className="flex gap-2">
                {/* Un reto cerrado es definitivo: no se edita */}
                {c.status !== 'COMPLETED' && (
                  <button
                    onClick={() => {
                      setActionError(null);
                      setEditingId(c.id);
                    }}
                    className="btn-ghost text-sm py-1.5 px-3"
                  >
                    Editar
                  </button>
                )}
                {c.status === 'DRAFT' && (
                  <button
                    onClick={() => activateMut.mutate(c.id)}
                    className="btn-primary text-sm py-1.5 px-3"
                  >
                    Activar
                  </button>
                )}
                {c.status === 'ACTIVE' && (
                  <button
                    onClick={() => {
                      if (confirm('¿Cerrar este reto y calcular ganadores?')) {
                        closeMut.mutate(c.id);
                      }
                    }}
                    className="btn-danger text-sm py-1.5 px-3"
                  >
                    Cerrar reto
                  </button>
                )}
              </div>
            </div>
          </div>
          ),
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Challenge['status'] }) {
  if (status === 'ACTIVE') return <span className="badge bg-ok/15 text-ok">Activo</span>;
  if (status === 'COMPLETED') return <span className="badge bg-ink-mute/15 text-ink-mute">Cerrado</span>;
  return <span className="badge bg-warn/15 text-warn">Borrador</span>;
}

type ChallengeRow = Challenge & { _count?: { participants: number; activities: number } };

/**
 * Formulario de reto. Sin `challenge` crea uno (el período sale del mes elegido); con
 * `challenge` lo edita: viene completo con los valores actuales, el mes y el año quedan fijos
 * (son la clave del reto) y solo se envían los campos que cambiaron.
 */
function ChallengeForm({ challenge, onDone }: { challenge?: ChallengeRow; onDone: () => void }) {
  const qc = useQueryClient();
  const now = new Date();
  const editing = !!challenge;

  const initial = {
    name: challenge?.name ?? `Reto ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    startDate: challenge ? toDayKey(challenge.startDate) : '',
    endDate: challenge ? toDayKey(challenge.endDate) : '',
    validDays: challenge?.validDays ?? [1, 2, 3, 4, 5, 6],
    minHeartRateMinutes: challenge?.minHeartRateMinutes ?? 20,
    feePerParticipant: challenge ? Number(challenge.feePerParticipant) : 120,
    // null = automático (cuota × inscritos); un número = fijado a mano
    budgetTotal: challenge && challenge.budgetTotal !== null ? Number(challenge.budgetTotal) : null,
    currency: challenge?.currency ?? 'BOB',
    prizeDescription: challenge?.prizeDescription ?? 'Suplemento para gym al ganador (o sorteo en caso de empate)',
    // Reglas de puntaje (defaults = comportamiento histórico)
    pointsPerValidatedDay: challenge?.pointsPerValidatedDay ?? 1,
    pointsPerKm: challenge ? Number(challenge.pointsPerKm) : 0,
    minValidatedDaysToQualify: challenge?.minValidatedDaysToQualify ?? 0,
    maxWinners: challenge?.maxWinners ?? 2,
    tiebreakRule: challenge?.tiebreakRule ?? ('DRAW' as TiebreakRule),
  };

  const [month, setMonth] = useState(challenge?.month ?? now.getMonth() + 1);
  const [year, setYear] = useState(challenge?.year ?? now.getFullYear());
  const [name, setName] = useState(initial.name);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [validDays, setValidDays] = useState<number[]>(initial.validDays);
  const [minHr, setMinHr] = useState(initial.minHeartRateMinutes);
  const [fee, setFee] = useState(initial.feePerParticipant);
  const [budgetAuto, setBudgetAuto] = useState(initial.budgetTotal === null);
  const [budget, setBudget] = useState(initial.budgetTotal ?? initial.feePerParticipant * (challenge?._count?.participants ?? 0));
  const [currency, setCurrency] = useState(initial.currency);
  const [prize, setPrize] = useState(initial.prizeDescription);
  const [pointsPerValidatedDay, setPointsPerValidatedDay] = useState(initial.pointsPerValidatedDay);
  const [pointsPerKm, setPointsPerKm] = useState(initial.pointsPerKm);
  const [minValidatedDaysToQualify, setMinValidatedDaysToQualify] = useState(initial.minValidatedDaysToQualify);
  const [maxWinners, setMaxWinners] = useState(initial.maxWinners);
  const [tiebreakRule, setTiebreakRule] = useState<TiebreakRule>(initial.tiebreakRule);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const values = {
        name,
        startDate,
        endDate,
        validDays,
        minHeartRateMinutes: minHr,
        feePerParticipant: fee,
        budgetTotal: budgetAuto ? null : budget,
        currency,
        prizeDescription: prize,
        pointsPerValidatedDay,
        pointsPerKm,
        minValidatedDaysToQualify,
        maxWinners,
        tiebreakRule,
      };
      if (editing) {
        // Solo lo que cambió: no tocar un campo no lo reescribe
        const changed = Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => JSON.stringify(value) !== JSON.stringify(initial[key as keyof typeof initial]),
          ),
        );
        if (Object.keys(changed).length === 0) return Promise.resolve(challenge);
        return api(`/challenges/${challenge!.id}`, { method: 'PATCH', body: changed });
      }
      const last = lastDayOfMonth(year, month);
      return api('/challenges', {
        method: 'POST',
        body: {
          ...values,
          month,
          year,
          startDate: `${year}-${String(month).padStart(2, '0')}-01`,
          endDate: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onDone();
    },
    onError: (e) => {
      const apiErr = e as ApiError;
      const msg = (apiErr.body as { message?: string | string[] })?.message ?? e.message;
      setErr(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  function toggleDay(d: number) {
    setValidDays((curr) =>
      curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d].sort(),
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        save.mutate();
      }}
      className="card p-5 space-y-5"
      aria-label={editing ? `Editar ${challenge!.name}` : 'Nuevo reto'}
    >
      <h2 className="display text-2xl tracking-wider">
        {editing ? `Editar ${MONTHS[challenge!.month - 1]} ${challenge!.year}` : 'Nuevo reto'}
      </h2>
      {editing && challenge!.status === 'ACTIVE' && (
        <p className="text-sm text-warn bg-warn/10 border border-warn/30 rounded-md px-4 py-2.5">
          El reto está activo: los cambios de puntaje y de días recalculan el ranking en curso.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="label" htmlFor="challenge-name">Nombre</label>
          <input
            id="challenge-name"
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Moneda</label>
          <input
            className="input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
          />
        </div>
        {editing ? (
          <>
            <div>
              <label className="label" htmlFor="challenge-start">Inicio</label>
              <input
                id="challenge-start"
                type="date"
                className="input"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="challenge-end">Fin</label>
              <input
                id="challenge-end"
                type="date"
                className="input"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">Mes</label>
              <select
                className="input"
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Año</label>
              <input
                type="number"
                min={2024}
                max={2100}
                className="input"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
              />
            </div>
          </>
        )}
        <div>
          <label className="label">Min FC (minutos, 0 = sin regla)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={minHr}
            onChange={(e) => setMinHr(parseInt(e.target.value, 10))}
          />
        </div>
        <div>
          <label className="label" htmlFor="challenge-fee">Cuota / persona</label>
          <input
            id="challenge-fee"
            type="number"
            min={0}
            className="input"
            value={fee}
            onChange={(e) => setFee(parseFloat(e.target.value))}
          />
        </div>
        <div>
          <label className="label" htmlFor="challenge-budget">Presupuesto total</label>
          <label className="flex items-center gap-2 text-sm text-ink-dim mb-2">
            <input
              type="checkbox"
              className="w-4 h-4 accent-accent"
              checked={budgetAuto}
              onChange={(e) => setBudgetAuto(e.target.checked)}
            />
            Presupuesto automático (cuota × inscritos)
          </label>
          {budgetAuto ? (
            <p className="text-xs text-ink-mute">
              {editing
                ? `Hoy: ${fee} × ${challenge!._count?.participants ?? 0} inscritos = ${fee * (challenge!._count?.participants ?? 0)} ${currency}. Se recalcula al inscribir o quitar personas o cambiar la cuota.`
                : 'Se calcula con la cuota y los inscritos, y se recalcula solo.'}
            </p>
          ) : (
            <input
              id="challenge-budget"
              type="number"
              min={0}
              className="input"
              value={budget}
              onChange={(e) => setBudget(parseFloat(e.target.value))}
              aria-label="Presupuesto fijado"
            />
          )}
        </div>
      </div>

      <div>
        <label className="label">Días válidos</label>
        <div className="flex gap-2 flex-wrap">
          {DAY_NAMES.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                validDays.includes(i)
                  ? 'bg-accent text-black border-accent'
                  : 'bg-bg-elev border-line text-ink-dim'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="text-xs uppercase tracking-wider text-ink-mute mb-2">
          Reglas de puntaje
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Puntos por día validado</label>
            <input
              type="number"
              min={0}
              className="input"
              value={pointsPerValidatedDay}
              onChange={(e) => setPointsPerValidatedDay(parseInt(e.target.value, 10) || 0)}
              aria-label="Puntos por día validado"
            />
            <p className="text-xs text-ink-mute mt-1">1 = el puntaje son los días validados.</p>
          </div>
          <div>
            <label className="label">Puntos por km</label>
            <input
              type="number"
              min={0}
              step="0.1"
              className="input"
              value={pointsPerKm}
              onChange={(e) => setPointsPerKm(parseFloat(e.target.value) || 0)}
              aria-label="Puntos por km"
            />
            <p className="text-xs text-ink-mute mt-1">0 = la distancia no suma puntos.</p>
          </div>
          <div>
            <label className="label">Mínimo de días para calificar</label>
            <input
              type="number"
              min={0}
              className="input"
              value={minValidatedDaysToQualify}
              onChange={(e) =>
                setMinValidatedDaysToQualify(parseInt(e.target.value, 10) || 0)
              }
              aria-label="Mínimo de días para calificar"
            />
            <p className="text-xs text-ink-mute mt-1">0 = basta un día validado.</p>
          </div>
          <div>
            <label className="label">Máximo de ganadores</label>
            <input
              type="number"
              min={1}
              className="input"
              value={maxWinners}
              onChange={(e) => setMaxWinners(parseInt(e.target.value, 10) || 1)}
              aria-label="Máximo de ganadores"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Si empatan más que los cupos</label>
            <select
              className="input"
              value={tiebreakRule}
              onChange={(e) => setTiebreakRule(e.target.value as TiebreakRule)}
              aria-label="Regla de desempate"
            >
              <option value="DRAW">Sorteo entre los empatados</option>
              <option value="TOTAL_KM">Gana quien acumuló más km</option>
              <option value="SHARE_ALL">Ganan todos y comparten el premio</option>
            </select>
          </div>
        </div>
      </fieldset>

      <div>
        <label className="label">Premio</label>
        <textarea
          rows={2}
          className="input resize-none"
          value={prize}
          onChange={(e) => setPrize(e.target.value)}
        />
      </div>

      {err && (
        <div role="alert" className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
          {err}
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={save.isPending} className="btn-primary">
          {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear reto'}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
