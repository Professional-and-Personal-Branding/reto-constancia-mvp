'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDay } from '@/lib/dates';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import { useClosedChallenges } from '@/lib/use-closed-challenges';
import type { Challenge, ChallengeResults, ParticipantRanking } from '@/lib/types';
import { CloseChallengeDialog, closeErrorFrom, type CloseError } from '@/components/close-challenge-dialog';

const RESULTS_PATH = '/dashboard/results';

// useSearchParams necesita un límite de Suspense para que la página siga siendo estática
export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="text-ink-dim">Cargando ranking…</p>}>
      <Results />
    </Suspense>
  );
}

function Results() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();

  const { challenge: active } = useActiveChallenge();
  const { closed, isLoading: closedLoading } = useClosedChallenges();

  // ?reto=<id> abre un reto cerrado sin tocar el reto activo elegido en el encabezado.
  // Un id desconocido o que no está cerrado vuelve al ranking activo.
  const requestedId = params.get('reto');
  const closedChallenge = requestedId ? closed.find((c) => c.id === requestedId) : undefined;
  const challenge: Challenge | null = closedChallenge ?? active ?? null;
  const isClosedView = !!closedChallenge;

  const { data: results, isLoading } = useQuery<ChallengeResults>({
    queryKey: ['results', challenge?.id],
    queryFn: () => api<ChallengeResults>(`/challenges/${challenge!.id}/results`),
    enabled: !!challenge,
  });

  // Guardar la premiación cierra el reto: pasa por la revisión previa y muestra los errores
  // de la API (spec challenge-lifecycle, cambio assisted-challenge-close)
  const [pendingAward, setPendingAward] = useState<{ userIds: string[]; notes?: string } | null>(null);
  const [awardError, setAwardError] = useState<CloseError | null>(null);
  const awardMut = useMutation({
    mutationFn: ({ userIds, notes }: { userIds: string[]; notes?: string }) =>
      api(`/challenges/${challenge!.id}/awards`, {
        method: 'POST',
        body: { userIds, notes },
      }),
    onSuccess: () => {
      setPendingAward(null);
      setAwardError(null);
      qc.invalidateQueries({ queryKey: ['results'] });
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['challenges'] });
      qc.invalidateQueries({ queryKey: ['close-preview'] });
    },
    onError: (e) => setAwardError(closeErrorFrom(e)),
  });

  const openClosed = (id: string) => router.push(id ? `${RESULTS_PATH}?reto=${id}` : RESULTS_PATH);

  if (requestedId && closedLoading) {
    return <p className="text-ink-dim">Cargando ranking…</p>;
  }

  if (!challenge) {
    return (
      <div className="card p-8 text-center space-y-4">
        <p className="text-ink-dim">Sin reto activo</p>
        {closed.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-dim">Resultados de retos cerrados:</p>
            <ul className="flex flex-wrap justify-center gap-2">
              {closed.map((c) => (
                <li key={c.id}>
                  <Link href={`${RESULTS_PATH}?reto=${c.id}`} className="btn-ghost text-sm py-1.5 px-3">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Solo se muestran los puntos cuando el puntaje no es simplemente los días validados
  const showPoints =
    !!challenge &&
    (challenge.pointsPerValidatedDay !== 1 || parseFloat(challenge.pointsPerKm) > 0);
  // Con la regla por defecto el puntaje son días validados; con reglas propias son puntos
  const scoreUnit = (n: number) => (showPoints ? (n === 1 ? 'punto' : 'puntos') : n === 1 ? 'día' : 'días');

  if (isLoading || !results) {
    return <p className="text-ink-dim">Cargando ranking…</p>;
  }

  return (
    <div className="space-y-8">
      {closed.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-ink-mute whitespace-nowrap">Retos cerrados</span>
            <select
              aria-label="Retos cerrados"
              className="input py-1.5 text-sm max-w-[16rem]"
              value={closedChallenge?.id ?? ''}
              onChange={(e) => openClosed(e.target.value)}
            >
              <option value="">{isClosedView ? 'Reto activo' : 'Elegir un reto cerrado…'}</option>
              {closed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {isClosedView && active && (
            <Link href={RESULTS_PATH} className="text-accent hover:underline">
              Volver al reto activo
            </Link>
          )}
        </div>
      )}

      <div>
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          {challenge.name}
          {isClosedView && ` · cerrado el ${formatDay(challenge.endDate, { day: '2-digit', month: 'short', year: 'numeric' })}`}
        </p>
        <h1 className="display text-5xl leading-none">Ranking</h1>
        <p className="text-ink-dim mt-3">
          {results.totalValidDays} días válidos en el período · top {isClosedView ? 'final' : 'actual'}:{' '}
          <span className="text-accent font-semibold">
            {results.topScore} {scoreUnit(results.topScore)}
          </span>
        </p>
        {(challenge.pointsPerValidatedDay !== 1 ||
          parseFloat(challenge.pointsPerKm) > 0 ||
          challenge.minValidatedDaysToQualify > 0) && (
          <p className="text-sm text-ink-dim mt-2" aria-label="Regla de puntaje">
            Puntaje: {challenge.pointsPerValidatedDay} por día validado
            {parseFloat(challenge.pointsPerKm) > 0
              ? ` + ${parseFloat(challenge.pointsPerKm)} por km`
              : ''}
            {challenge.minValidatedDaysToQualify > 0
              ? ` · mínimo ${challenge.minValidatedDaysToQualify} días para calificar`
              : ''}
            .
          </p>
        )}
        {results.payout && (
          <p className="text-sm text-ink-dim mt-2" aria-label="Premio por ganador">
            {/* El pote es lo recaudado; mientras el reto sigue abierto puede crecer con más pagos */}
            {!results.payout.monetary
              ? 'Premio no monetario (el reto no cobra cuota).'
              : results.payout.pot === 0
                ? `Pote 0 ${challenge.currency} · aún no hay pagos registrados.`
                : results.payout.winnersCount === 0
                  ? `Pote ${results.payout.pot} ${challenge.currency} recaudado · aún sin ganador` +
                    (results.status === 'COMPLETED' ? '.' : ' · proyectado')
                  : `Premio: ${results.payout.perWinner} ${challenge.currency} por ganador` +
                    (results.payout.winnersCount > 1 ? ` (${results.payout.winnersCount})` : '') +
                    ` · pote ${results.payout.pot} ${challenge.currency} recaudado` +
                    (results.status === 'COMPLETED' ? '' : ' · proyectado')}
          </p>
        )}
      </div>

      {/* Ganadores (si el reto está cerrado) */}
      {results.status === 'COMPLETED' && results.winners.length > 0 && (
        <div className="card border-2 border-accent/40 bg-accent/5 p-6">
          <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
            🏆 Ganador{results.winners.length > 1 ? 'es' : ''}
          </p>
          <div className="space-y-2">
            {results.winners.map((w) => (
              <p key={w.userId} className="display text-3xl">
                {w.name}
              </p>
            ))}
          </div>
          {results.notes.length > 0 && (
            <div className="mt-4 pt-4 border-t border-accent/20 space-y-1">
              {results.notes.map((n, i) => (
                <p key={i} className="text-sm text-ink-dim">
                  {n}
                </p>
              ))}
            </div>
          )}
          {challenge.prizeDescription && (
            <p className="text-sm text-ink mt-4">
              <span className="text-ink-dim">Premio:</span> {challenge.prizeDescription}
            </p>
          )}
        </div>
      )}

      {/* Un reto cerrado se consulta en solo lectura, también para el administrador */}
      {user?.role === 'ADMIN' && !isClosedView && (
        <AwardPanel
          results={results}
          isPending={awardMut.isPending}
          onAward={(userIds, notes) => {
            setAwardError(null);
            setPendingAward({ userIds, notes });
          }}
        />
      )}
      {challenge && pendingAward && results && (
        <CloseChallengeDialog
          challengeId={challenge.id}
          open
          mode="award"
          selectedWinners={results.ranking.filter((r) => pendingAward.userIds.includes(r.userId))}
          isPending={awardMut.isPending}
          error={awardError}
          onConfirm={() => awardMut.mutate(pendingAward)}
          onCancel={() => setPendingAward(null)}
        />
      )}

      {/* Tabla de ranking */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 text-left w-12">#</th>
              <th className="px-4 py-3 text-left">Participante</th>
              {showPoints && <th className="px-4 py-3 text-right">Puntos</th>}
              <th className="px-4 py-3 text-right">Validados</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Pend.</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Rech.</th>
              <th className="px-4 py-3 text-right hidden md:table-cell">Km</th>
            </tr>
          </thead>
          <tbody>
            {results.ranking.map((r, idx) => {
              const isMe = r.userId === user?.id;
              const isTop =
                r.qualified && r.score === results.topScore && results.topScore > 0;
              return (
                <tr
                  key={r.userId}
                  className={`border-b border-line last:border-b-0 ${
                    isMe ? 'bg-accent/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span
                      className={`display text-2xl ${
                        isTop ? 'text-accent' : 'text-ink-dim'
                      }`}
                    >
                      {idx + 1}°
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {r.name}
                      {isMe && (
                        <span className="text-accent text-xs ml-2">(tú)</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-mute">
                      {user?.role === 'ADMIN' && r.email}
                      {!r.qualified && challenge.minValidatedDaysToQualify > 0 && (
                        <span className="text-warn ml-2">no califica</span>
                      )}
                    </p>
                  </td>
                  {showPoints && (
                    <td className="px-4 py-3 text-right">
                      <span className="display text-2xl text-accent">{r.score}</span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <span className="display text-2xl text-ok">
                      {r.validatedDays}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-warn hidden sm:table-cell">
                    {r.pendingDays}
                  </td>
                  <td className="px-4 py-3 text-right text-bad hidden sm:table-cell">
                    {r.rejectedDays}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-dim hidden md:table-cell">
                    {r.totalKm > 0 ? `${r.totalKm} km` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notas (cuando hay empate proyectado) */}
      {results.status !== 'COMPLETED' && results.tiedAtTop.length > 1 && (
        <div className="card border border-warn/30 bg-warn/5 p-4">
          <p className="text-warn text-xs uppercase tracking-wider font-semibold mb-2">
            Empate proyectado
          </p>
          <p className="text-sm">
            Si el reto cerrara hoy, hay {results.tiedAtTop.length} personas en el
            tope con {results.topScore} {scoreUnit(results.topScore)}.{' '}
            {/* La regla de desempate es la del reto: el servidor la describe en las notas */}
            {results.notes
              .filter((n) => !n.startsWith('Puntaje:') && !n.startsWith('Mínimo'))
              .join(' ')}
          </p>
        </div>
      )}
    </div>
  );
}

function AwardPanel({
  results,
  isPending,
  onAward,
}: {
  results: ChallengeResults;
  isPending: boolean;
  onAward: (userIds: string[], notes?: string) => void;
}) {
  // Sugiere la premiación registrada o, si no hay, los ganadores que calcula el servidor con
  // las reglas del reto (número de ganadores y desempate configurados).
  const suggestedIds =
    results.awards.length > 0
      ? results.awards.map((award) => award.userId)
      : results.winners.map((w) => w.userId);

  const [selectedIds, setSelectedIds] = useState<string[]>(suggestedIds);
  const [notes, setNotes] = useState('');

  // La selección se reinicia cuando cambia la sugerencia (otro reto, otra premiación u otros
  // ganadores), y no en cada recarga de los resultados: así no se pierde lo que marcó el admin.
  const suggestedKey = suggestedIds.join(',');
  useEffect(() => {
    setSelectedIds(suggestedKey ? suggestedKey.split(',') : []);
  }, [suggestedKey]);

  function toggle(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  return (
    <div className="card p-5 border border-accent/25">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
            Premiación
          </p>
          <h2 className="display text-2xl tracking-wider">
            Ganador del mes
          </h2>
          <p className="text-sm text-ink-dim mt-1">
            Selecciona el ganador o ganadores y guarda la premiación. Al guardar,
            el reto se cierra como completado.
          </p>
        </div>
        {results.awards.length > 0 && (
          <span className="badge-validated">Premiación registrada</span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-2 mt-4">
        {results.ranking.map((participant) => (
          <AwardOption
            key={participant.userId}
            participant={participant}
            checked={selectedIds.includes(participant.userId)}
            onToggle={() => toggle(participant.userId)}
            isTop={
              participant.qualified && participant.score === results.topScore && results.topScore > 0
            }
          />
        ))}
      </div>

      <textarea
        rows={2}
        className="input resize-none mt-4"
        placeholder="Notas de premiación, compra del suplemento o sorteo realizado"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
        <button
          type="button"
          className="btn-primary"
          disabled={selectedIds.length === 0 || isPending}
          onClick={() => onAward(selectedIds, notes || undefined)}
        >
          {isPending ? 'Guardando…' : 'Guardar premiación'}
        </button>
        <p className="text-xs text-ink-mute">
          Seleccionados: {selectedIds.length}. Vienen marcados los ganadores que dan las
          reglas del reto; ajusta la selección si el desempate se resolvió en persona.
        </p>
      </div>
    </div>
  );
}

function AwardOption({
  participant,
  checked,
  onToggle,
  isTop,
}: {
  participant: ParticipantRanking;
  checked: boolean;
  onToggle: () => void;
  isTop: boolean;
}) {
  return (
    <label className="flex items-center gap-3 p-3 border border-line rounded-md cursor-pointer hover:border-accent/50">
      <input
        type="checkbox"
        className="w-4 h-4 accent-accent"
        checked={checked}
        onChange={onToggle}
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {participant.name}
          {isTop && <span className="text-accent text-xs ml-2">top actual</span>}
        </p>
        <p className="text-xs text-ink-mute">
          {participant.validatedDays} validados · {participant.totalKm} km
        </p>
      </div>
    </label>
  );
}
