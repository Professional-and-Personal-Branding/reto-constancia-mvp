'use client';

import { Suspense, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ACCEPT, uploadToCloudinary } from '@/lib/cloudinary';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import { formatDay, isoToday, toDayKey } from '@/lib/dates';
import { dateHint, resolveUploadDate, uploadDateBounds } from '@/lib/calendar';
import {
  buildResubmissionPhotos,
  canResubmit,
  clearSlot,
  moveToOtherSlot,
  removeOther,
  slotsFromPhotos,
  type SlotPhoto,
  type StoredSlots,
} from '@/lib/resubmission';
import type { DailyActivity, ExerciseType, MyCalendar, PhotoType } from '@/lib/types';

interface PhotoSlot {
  file: File | null;
  preview: string | null;
  type: PhotoType;
}

const EXERCISE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: 'RUNNING', label: 'Carrera' },
  { value: 'CYCLING', label: 'Bicicleta' },
  { value: 'ELLIPTICAL', label: 'Elíptica' },
  { value: 'TREADMILL', label: 'Caminadora' },
  { value: 'OTHER', label: 'Otro' },
];

const PHOTO_TYPE_LABEL: Record<PhotoType, string> = {
  ACTIVITY: 'Actividad',
  HEART_RATE: 'FC',
  METRICS: 'Métricas',
};

// useSearchParams exige una frontera Suspense en Next 15 (build estático)
export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadRouter />
    </Suspense>
  );
}

/** `?reenviar=<id>` abre el formulario en modo reenvío (design D9); sin él, el registro de siempre. */
function UploadRouter() {
  const resubmitId = useSearchParams().get('reenviar');
  return resubmitId ? <ResubmitLoader id={resubmitId} /> : <ActivityForm />;
}

function ResubmitGuard() {
  return (
    <div className="card p-8 text-center space-y-4">
      <p role="alert">Esta actividad ya no se puede reenviar.</p>
      <Link href="/dashboard" className="btn-primary inline-block">
        Volver a Mi reto
      </Link>
    </div>
  );
}

/**
 * Lee la actividad y toma el reto de ella misma (no del selector). La guarda cubre 403/404, una
 * actividad que ya no está rechazada, un reto que no está activo y una actividad ajena; la API
 * decide de nuevo al enviar.
 */
function ResubmitLoader({ id }: { id: string }) {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery<DailyActivity>({
    queryKey: ['activities', 'detail', id],
    queryFn: () => api<DailyActivity>(`/activities/${encodeURIComponent(id)}`),
    retry: false,
  });

  if (isLoading) return <p className="text-ink-dim">Cargando…</p>;
  if (isError || !data || !canResubmit(data, user?.id)) return <ResubmitGuard />;
  return <ActivityForm resubmit={data} />;
}

function emptySlot(type: PhotoType): PhotoSlot {
  return { file: null, preview: null, type };
}

function ActivityForm({ resubmit }: { resubmit?: DailyActivity }) {
  const router = useRouter();
  const qc = useQueryClient();
  const searchParams = useSearchParams();

  const { challenge: selected } = useActiveChallenge();
  // En el reenvío manda el reto de la actividad, sea cual sea el del selector
  const challengeId = resubmit ? resubmit.challengeId : selected?.id;
  const minHr = resubmit
    ? (resubmit.challenge?.minHeartRateMinutes ?? 0)
    : (selected?.minHeartRateMinutes ?? 0);
  const hasChallenge = resubmit ? true : !!selected;

  // Calendario propio: pistas de la fecha. Solo si participo (si no, la API respondería 403);
  // sin datos el formulario se comporta como antes y la API sigue validando todo.
  const { data: calendar } = useQuery<MyCalendar>({
    queryKey: ['activities', 'calendar', selected?.id],
    queryFn: () => api<MyCalendar>(`/activities/me/calendar?challengeId=${selected!.id}`),
    enabled: !resubmit && !!selected && !!selected.me,
  });

  // La fecha elegida por la persona manda; mientras no elija, `?date=` (si es un día del calendario) u hoy
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const today = isoToday();
  const date = resubmit
    ? toDayKey(resubmit.date)
    : (pickedDate ?? resolveUploadDate(calendar, searchParams.get('date'), today));
  const bounds = uploadDateBounds(calendar, today);
  const hint = resubmit ? null : dateHint(calendar, date);
  const [exerciseType, setExerciseType] = useState<ExerciseType>(resubmit?.exerciseType ?? 'RUNNING');
  const [durationMinutes, setDurationMinutes] = useState<number>(resubmit?.durationMinutes ?? 30);
  const [distanceKm, setDistanceKm] = useState<string>(resubmit?.distanceKm ?? '');
  const [avgHeartRate, setAvgHeartRate] = useState<string>(resubmit?.avgHeartRate?.toString() ?? '');
  const [heartRateMinutes, setHeartRateMinutes] = useState<string>(resubmit?.heartRateMinutes?.toString() ?? '');
  const [hasHeartRateProof, setHasHeartRateProof] = useState(true);
  const [notes, setNotes] = useState(resubmit?.notes ?? '');

  const [activityPhoto, setActivityPhoto] = useState<PhotoSlot>(emptySlot('ACTIVITY'));
  const [heartRatePhoto, setHeartRatePhoto] = useState<PhotoSlot>(emptySlot('HEART_RATE'));
  // Fotos ya guardadas de la actividad (solo en el reenvío): se conservan, se quitan o se reemplazan
  const [stored, setStored] = useState<StoredSlots>(() =>
    slotsFromPhotos(resubmit ? resubmit.photos : []),
  );

  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!challengeId) throw new Error('Sin reto activo');
      if (!activityPhoto.file && !(resubmit && stored.activity)) {
        throw new Error('Foto de la actividad es obligatoria');
      }

      // Solo se suben los archivos nuevos; la carpeta la decide el servidor según el reto y el participante
      let uploadedActivity: SlotPhoto | null = null;
      if (activityPhoto.file) {
        setProgress('Subiendo foto de actividad…');
        const main = await uploadToCloudinary(activityPhoto.file, challengeId, 'activity');
        uploadedActivity = { url: main.url, cloudinaryId: main.cloudinaryId, type: 'ACTIVITY' };
      }

      let uploadedHr: SlotPhoto | null = null;
      if (heartRatePhoto.file) {
        setProgress('Subiendo captura de FC…');
        const hr = await uploadToCloudinary(heartRatePhoto.file, challengeId, 'activity');
        uploadedHr = { url: hr.url, cloudinaryId: hr.cloudinaryId, type: 'HEART_RATE' };
      }

      const fields = {
        exerciseType,
        durationMinutes,
        distanceKm: distanceKm ? parseFloat(distanceKm) : undefined,
        avgHeartRate: avgHeartRate ? parseInt(avgHeartRate, 10) : undefined,
        heartRateMinutes: heartRateMinutes ? parseInt(heartRateMinutes, 10) : undefined,
        notes: notes || undefined,
      };

      if (resubmit) {
        setProgress('Reenviando actividad…');
        return api(`/activities/${resubmit.id}/resubmission`, {
          method: 'PUT',
          body: {
            ...fields,
            photos: buildResubmissionPhotos(stored, { activity: uploadedActivity, hr: uploadedHr }),
          },
        });
      }

      const photos: SlotPhoto[] = [uploadedActivity!];
      if (uploadedHr) photos.push(uploadedHr);

      setProgress('Registrando actividad…');
      return api('/activities', {
        method: 'POST',
        body: {
          challengeId,
          date,
          ...fields,
          hasHeartRateProof: hasHeartRateProof && !!heartRatePhoto.file,
          photos,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['results'] });
      // El aviso de éxito lo muestra el panel al llegar
      router.push(resubmit ? '/dashboard?reenviada=1' : '/dashboard');
    },
    onError: (e) => {
      const apiErr = e as ApiError;
      const msg =
        (apiErr.body as { message?: string | string[] })?.message ?? e.message;
      setErr(Array.isArray(msg) ? msg.join(', ') : msg);
      setProgress(null);
    },
  });

  function handleFileChange(slot: 'activity' | 'hr') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const preview = URL.createObjectURL(file);
      const next: PhotoSlot = {
        file,
        preview,
        type: slot === 'activity' ? 'ACTIVITY' : 'HEART_RATE',
      };
      // Elegir un archivo reemplaza la foto guardada de ese espacio (se descarta al enviar)
      if (resubmit) setStored((s) => clearSlot(s, slot));
      if (slot === 'activity') setActivityPhoto(next);
      else setHeartRatePhoto(next);
    };
  }

  if (!hasChallenge) {
    return (
      <div className="card p-8 text-center">
        <h2 className="display text-3xl mb-2">Sin reto activo</h2>
      </div>
    );
  }

  // Regla de FC del reto de la actividad (misma definición que la API; la API la vuelve a verificar)
  const hrMinutes = heartRateMinutes ? parseInt(heartRateMinutes, 10) : null;
  const hasCapture = !!heartRatePhoto.file || !!(resubmit && stored.hr);
  const hrIssues: string[] = [];
  if (minHr > 0) {
    if (hrMinutes === null) hrIssues.push(`indica los minutos con FC (mínimo ${minHr})`);
    else if (hrMinutes < minHr) hrIssues.push(`este reto exige al menos ${minHr} min de registro de FC`);
    if (!hasCapture) hrIssues.push('adjunta la captura de frecuencia cardíaca');
  }
  if (hrMinutes !== null && hrMinutes > durationMinutes) {
    hrIssues.push('los minutos con FC no pueden superar la duración');
  }
  const heartRateOk = hrIssues.length === 0;
  const missingMain = !!resubmit && !activityPhoto.file && !stored.activity;

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          {resubmit ? 'Actividad rechazada' : 'Validación diaria'}
        </p>
        <h1 className="display text-5xl leading-none">
          {resubmit ? 'Corregir y reenviar' : 'Subir actividad'}
        </h1>
        <p className="text-ink-dim mt-3">
          {minHr > 0
            ? `Foto del entreno + captura de FC con al menos ${minHr} min de registro.`
            : 'Foto del entreno. Este reto no exige un mínimo de FC.'}
        </p>
        {resubmit?.rejectionReason && (
          <p className="text-sm text-bad mt-3">⚠ Motivo del rechazo: {resubmit.rejectionReason}</p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          submitMutation.mutate();
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="activity-date">Fecha</label>
            {resubmit ? (
              <>
                <input
                  id="activity-date"
                  type="date"
                  className="input"
                  value={date}
                  readOnly
                  disabled
                  aria-describedby="activity-date-fixed"
                />
                <p id="activity-date-fixed" className="text-ink-dim text-sm mt-1.5">
                  {formatDay(date, { day: 'numeric', month: 'long' })}: la fecha no se puede cambiar al reenviar.
                </p>
              </>
            ) : (
              <input
                id="activity-date"
                type="date"
                required
                className="input"
                value={date}
                onChange={(e) => setPickedDate(e.target.value)}
                min={bounds.min}
                max={bounds.max}
                aria-describedby={hint ? 'activity-date-hint' : undefined}
              />
            )}
            {hint && (
              <p id="activity-date-hint" className="text-warn text-sm mt-1.5">
                {hint}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="activity-type">Tipo de ejercicio</label>
            <select
              id="activity-type"
              required
              className="input"
              value={exerciseType}
              onChange={(e) => setExerciseType(e.target.value as ExerciseType)}
            >
              {EXERCISE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="activity-duration">Duración (min)</label>
            <input
              id="activity-duration"
              type="number"
              required
              min={1}
              className="input"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
            />
          </div>
          <div>
            <label className="label" htmlFor="activity-distance">Distancia (km, opcional)</label>
            <input
              id="activity-distance"
              type="number"
              step="0.01"
              min={0}
              className="input"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="activity-avg-hr">FC promedio (bpm, opcional)</label>
            <input
              id="activity-avg-hr"
              type="number"
              min={30}
              max={250}
              className="input"
              value={avgHeartRate}
              onChange={(e) => setAvgHeartRate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">
              Minutos con FC (según la captura)
              {minHr > 0 && <span className="text-accent"> *</span>}
            </label>
            <input
              type="number"
              min={1}
              max={durationMinutes || undefined}
              className="input"
              value={heartRateMinutes}
              onChange={(e) => setHeartRateMinutes(e.target.value)}
              placeholder={minHr > 0 ? `mínimo ${minHr}` : 'opcional'}
              aria-label="Minutos con FC"
            />
          </div>
          {!resubmit && (
            <label className="flex items-center gap-3 self-end pb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasHeartRateProof}
                onChange={(e) => setHasHeartRateProof(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm">Tengo captura con frecuencia cardíaca</span>
            </label>
          )}
        </div>

        <div>
          <label className="label" htmlFor="activity-notes">Notas (opcional)</label>
          <textarea
            id="activity-notes"
            rows={2}
            className="input resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='"Salí pese a la lluvia 🌧️"'
          />
        </div>

        {/* Foto principal */}
        <PhotoField
          label="Foto del entrenamiento"
          required
          slot={activityPhoto}
          existing={resubmit ? stored.activity : null}
          onChange={handleFileChange('activity')}
          onClear={() => setActivityPhoto(emptySlot('ACTIVITY'))}
          onClearExisting={() => setStored((s) => clearSlot(s, 'activity'))}
          moveLabel="Usar como captura de FC"
          onMove={
            heartRatePhoto.file || stored.hr ? undefined : () => setStored((s) => moveToOtherSlot(s, 'activity'))
          }
        />

        {/* Captura de FC */}
        <PhotoField
          label="Captura de frecuencia cardíaca"
          slot={heartRatePhoto}
          existing={resubmit ? stored.hr : null}
          onChange={handleFileChange('hr')}
          onClear={() => setHeartRatePhoto(emptySlot('HEART_RATE'))}
          onClearExisting={() => setStored((s) => clearSlot(s, 'hr'))}
          moveLabel="Usar como foto de la actividad"
          onMove={
            activityPhoto.file || stored.activity ? undefined : () => setStored((s) => moveToOtherSlot(s, 'hr'))
          }
        />

        {resubmit && stored.others.length > 0 && (
          <section aria-label="Otras fotos" className="space-y-3">
            <h2 className="label">Otras fotos ({stored.others.length})</h2>
            <p className="text-sm text-ink-dim">Se conservan al reenviar, salvo las que quites.</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stored.others.map((p) => (
                <li key={p.cloudinaryId} className="space-y-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`Otra foto (${PHOTO_TYPE_LABEL[p.type]})`}
                    className="w-full h-28 object-cover rounded-md border border-line"
                  />
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-mute">
                    <span>{PHOTO_TYPE_LABEL[p.type]}</span>
                    <button
                      type="button"
                      onClick={() => setStored((s) => removeOther(s, p.cloudinaryId))}
                      className="text-bad hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!heartRateOk && (
          <div
            role="status"
            className="text-warn text-sm bg-warn/10 border border-warn/30 rounded-md px-4 py-2.5"
          >
            Para {resubmit ? 'reenviar' : 'registrar'} esta actividad: {hrIssues.join('; ')}.
          </div>
        )}

        {missingMain && (
          <div
            role="status"
            className="text-warn text-sm bg-warn/10 border border-warn/30 rounded-md px-4 py-2.5"
          >
            Adjunta la foto del entrenamiento.
          </div>
        )}

        {err && (
          <div role="alert" className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
            {err}
          </div>
        )}

        {progress && (
          <div className="text-accent text-sm bg-accent/10 border border-accent/30 rounded-md px-4 py-2.5">
            {progress}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitMutation.isPending || !heartRateOk || !!hint || missingMain}
            className="btn-primary flex-1"
          >
            {submitMutation.isPending ? 'Enviando…' : resubmit ? 'Reenviar' : 'Registrar actividad'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="btn-ghost"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function PhotoField({
  label,
  required,
  slot,
  existing,
  onChange,
  onClear,
  onClearExisting,
  moveLabel,
  onMove,
}: {
  label: string;
  required?: boolean;
  slot: PhotoSlot;
  /** Foto ya guardada de la actividad (reenvío); se muestra con vista previa remota */
  existing?: SlotPhoto | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onClearExisting?: () => void;
  moveLabel?: string;
  /** Solo si el otro espacio está libre */
  onMove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="label">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {slot.preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.preview}
            alt={label}
            className="w-full max-h-64 object-cover rounded-md border border-line"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 bg-black/70 text-ink hover:text-bad rounded-md px-2 py-1 text-sm"
          >
            Quitar
          </button>
        </div>
      ) : existing ? (
        <div className="space-y-2">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={existing.url}
              alt={`${label} guardada`}
              className="w-full max-h-64 object-cover rounded-md border border-line"
            />
            <button
              type="button"
              onClick={onClearExisting}
              className="absolute top-2 right-2 bg-black/70 text-ink hover:text-bad rounded-md px-2 py-1 text-sm"
            >
              Quitar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-ghost text-sm py-1 px-3"
            >
              Reemplazar
            </button>
            {onMove && moveLabel && (
              <button type="button" onClick={onMove} className="btn-ghost text-sm py-1 px-3">
                {moveLabel}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-line hover:border-accent rounded-md p-8 text-center transition cursor-pointer"
        >
          <p className="text-ink-dim">Toca para seleccionar foto</p>
          <p className="text-xs text-ink-mute mt-1">JPG, PNG, WEBP o HEIC · hasta 10 MB</p>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.activity}
        capture="environment"
        className="hidden"
        aria-label={label}
        onChange={onChange}
      />
    </div>
  );
}
