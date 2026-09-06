'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Challenge } from '@/lib/types';

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

      {showForm && <NewChallengeForm onDone={() => setShowForm(false)} />}

      {actionError && (
        <div
          role="alert"
          className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5"
        >
          {actionError}
        </div>
      )}

      <div className="space-y-3">
        {challenges?.map((c) => (
          <div key={c.id} className="card p-5">
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
                  · {c.budgetTotal} {c.currency}
                </p>
              </div>
              <div className="flex gap-2">
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
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Challenge['status'] }) {
  if (status === 'ACTIVE') return <span className="badge bg-ok/15 text-ok">Activo</span>;
  if (status === 'COMPLETED') return <span className="badge bg-ink-mute/15 text-ink-mute">Cerrado</span>;
  return <span className="badge bg-warn/15 text-warn">Borrador</span>;
}

function NewChallengeForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const now = new Date();

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [name, setName] = useState(`Reto ${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
  const [validDays, setValidDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [minHr, setMinHr] = useState(20);
  const [fee, setFee] = useState(120);
  const [budget, setBudget] = useState(600);
  const [currency, setCurrency] = useState('BOB');
  const [prize, setPrize] = useState(
    'Suplemento para gym al ganador (o sorteo en caso de empate)',
  );
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const last = lastDayOfMonth(year, month);
      return api('/challenges', {
        method: 'POST',
        body: {
          name,
          month,
          year,
          startDate: `${year}-${String(month).padStart(2, '0')}-01`,
          endDate: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
          validDays,
          minHeartRateMinutes: minHr,
          feePerParticipant: fee,
          budgetTotal: budget,
          currency,
          prizeDescription: prize,
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
        create.mutate();
      }}
      className="card p-5 space-y-5"
    >
      <h2 className="display text-2xl tracking-wider">Nuevo reto</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="label">Nombre</label>
          <input
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
        <div>
          <label className="label">Min FC (minutos)</label>
          <input
            type="number"
            min={1}
            className="input"
            value={minHr}
            onChange={(e) => setMinHr(parseInt(e.target.value, 10))}
          />
        </div>
        <div>
          <label className="label">Cuota / persona</label>
          <input
            type="number"
            min={0}
            className="input"
            value={fee}
            onChange={(e) => setFee(parseFloat(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Presupuesto total</label>
          <input
            type="number"
            min={0}
            className="input"
            value={budget}
            onChange={(e) => setBudget(parseFloat(e.target.value))}
          />
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
        <div className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
          {err}
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={create.isPending} className="btn-primary">
          {create.isPending ? 'Creando…' : 'Crear reto'}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
