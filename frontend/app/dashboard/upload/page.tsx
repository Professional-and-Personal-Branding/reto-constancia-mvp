'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import type { ExerciseType, PhotoType } from '@/lib/types';

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

function isoToday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default function UploadPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { challenge } = useActiveChallenge();

  const [date, setDate] = useState(isoToday());
  const [exerciseType, setExerciseType] = useState<ExerciseType>('RUNNING');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [distanceKm, setDistanceKm] = useState<string>('');
  const [avgHeartRate, setAvgHeartRate] = useState<string>('');
  const [hasHeartRateProof, setHasHeartRateProof] = useState(true);
  const [notes, setNotes] = useState('');

  const [activityPhoto, setActivityPhoto] = useState<PhotoSlot>({
    file: null,
    preview: null,
    type: 'ACTIVITY',
  });
  const [heartRatePhoto, setHeartRatePhoto] = useState<PhotoSlot>({
    file: null,
    preview: null,
    type: 'HEART_RATE',
  });

  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!challenge) throw new Error('Sin reto activo');
      if (!activityPhoto.file) {
        throw new Error('Foto de la actividad es obligatoria');
      }

      setProgress('Subiendo foto de actividad…');
      const folder = `${challenge.year}-${String(challenge.month).padStart(2, '0')}`;
      const main = await uploadToCloudinary(activityPhoto.file, folder);

      const photos: { url: string; cloudinaryId: string; type: PhotoType }[] = [
        { url: main.url, cloudinaryId: main.cloudinaryId, type: 'ACTIVITY' },
      ];

      if (heartRatePhoto.file) {
        setProgress('Subiendo captura de FC…');
        const hr = await uploadToCloudinary(heartRatePhoto.file, folder);
        photos.push({
          url: hr.url,
          cloudinaryId: hr.cloudinaryId,
          type: 'HEART_RATE',
        });
      }

      setProgress('Registrando actividad…');
      return api('/activities', {
        method: 'POST',
        body: {
          challengeId: challenge.id,
          date,
          exerciseType,
          durationMinutes,
          distanceKm: distanceKm ? parseFloat(distanceKm) : undefined,
          avgHeartRate: avgHeartRate ? parseInt(avgHeartRate, 10) : undefined,
          hasHeartRateProof: hasHeartRateProof && !!heartRatePhoto.file,
          notes: notes || undefined,
          photos,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['results'] });
      router.push('/dashboard');
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
      if (slot === 'activity') setActivityPhoto(next);
      else setHeartRatePhoto(next);
    };
  }

  if (!challenge) {
    return (
      <div className="card p-8 text-center">
        <h2 className="display text-3xl mb-2">Sin reto activo</h2>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          Validación diaria
        </p>
        <h1 className="display text-5xl leading-none">Subir actividad</h1>
        <p className="text-ink-dim mt-3">
          Foto del entreno + captura de FC con al menos {challenge.minHeartRateMinutes} min.
        </p>
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
            <label className="label">Fecha</label>
            <input
              type="date"
              required
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={isoToday()}
            />
          </div>
          <div>
            <label className="label">Tipo de ejercicio</label>
            <select
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
            <label className="label">Duración (min)</label>
            <input
              type="number"
              required
              min={1}
              className="input"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
            />
          </div>
          <div>
            <label className="label">Distancia (km, opcional)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              className="input"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
            />
          </div>
          <div>
            <label className="label">FC promedio (bpm, opcional)</label>
            <input
              type="number"
              min={30}
              max={250}
              className="input"
              value={avgHeartRate}
              onChange={(e) => setAvgHeartRate(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-3 self-end pb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasHeartRateProof}
              onChange={(e) => setHasHeartRateProof(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm">Tengo captura con frecuencia cardíaca</span>
          </label>
        </div>

        <div>
          <label className="label">Notas (opcional)</label>
          <textarea
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
          onChange={handleFileChange('activity')}
          onClear={() => setActivityPhoto({ file: null, preview: null, type: 'ACTIVITY' })}
        />

        {/* Captura de FC */}
        <PhotoField
          label="Captura de frecuencia cardíaca"
          slot={heartRatePhoto}
          onChange={handleFileChange('hr')}
          onClear={() => setHeartRatePhoto({ file: null, preview: null, type: 'HEART_RATE' })}
        />

        {err && (
          <div className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
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
            disabled={submitMutation.isPending}
            className="btn-primary flex-1"
          >
            {submitMutation.isPending ? 'Enviando…' : 'Registrar actividad'}
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
  onChange,
  onClear,
}: {
  label: string;
  required?: boolean;
  slot: PhotoSlot;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
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
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-line hover:border-accent rounded-md p-8 text-center transition cursor-pointer"
        >
          <p className="text-ink-dim">Toca para seleccionar foto</p>
          <p className="text-xs text-ink-mute mt-1">JPG, PNG o HEIC</p>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}
