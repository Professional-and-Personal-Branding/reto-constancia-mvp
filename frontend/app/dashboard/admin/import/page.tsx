'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { getTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type {
  ActivityStatus,
  ImportCommitResult,
  ImportPreviewResult,
} from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

async function authFetch(path: string, init: RequestInit): Promise<Response> {
  const tokens = getTokens();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(tokens?.accessToken
        ? { Authorization: `Bearer ${tokens.accessToken}` }
        : {}),
    },
  });
}

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  if (body && typeof body.message === 'string') return body.message;
  if (body && Array.isArray(body.message)) return body.message.join('; ');
  return `Error ${res.status}`;
}

type DuplicateStrategy = 'skip' | 'update';

export default function ImportPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<ActivityStatus>('VALIDATED');
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DuplicateStrategy>('skip');
  const [defaultPassword, setDefaultPassword] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const previewMut = useMutation<ImportPreviewResult, Error, File>({
    mutationFn: async (f) => {
      const fd = new FormData();
      fd.append('file', f);
      const res = await authFetch('/import/activities/preview', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      return res.json() as Promise<ImportPreviewResult>;
    },
  });

  const commitMut = useMutation<ImportCommitResult, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error('Selecciona un archivo primero');
      const fd = new FormData();
      fd.append('file', file);
      const qs = new URLSearchParams({ defaultStatus, duplicateStrategy });
      if (defaultPassword) qs.set('defaultPassword', defaultPassword);
      const res = await authFetch(`/import/activities/commit?${qs.toString()}`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      return res.json() as Promise<ImportCommitResult>;
    },
  });

  async function downloadTemplate(format: 'csv' | 'xlsx') {
    setDownloadError(null);
    try {
      const res = await authFetch(`/import/template?format=${format}`, {
        method: 'GET',
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantilla-importacion.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Error al descargar');
    }
  }

  function handleFile(f: File | null) {
    setFile(f);
    previewMut.reset();
    commitMut.reset();
  }

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="card p-8 text-center text-ink-dim">
        Sección solo para administradores.
      </div>
    );
  }

  const preview = previewMut.data;
  const result = commitMut.data;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          Carga masiva
        </p>
        <h1 className="display text-5xl leading-none">Importar actividades</h1>
        <p className="text-ink-dim mt-3 max-w-2xl">
          Descarga la plantilla, complétala (o úsala como Google Sheet) y súbela
          aquí. Cada fila se registra como si el participante la hubiera cargado
          manualmente: crea el usuario si no existe, lo inscribe en el reto y
          agrega su actividad del día.
        </p>
      </div>

      {/* Paso 1: plantilla */}
      <section className="card p-5 space-y-3">
        <h2 className="display text-2xl">1. Plantilla</h2>
        <p className="text-ink-dim text-sm">
          Columnas: <code>email, name, challengeMonth, challengeYear, date,
          exerciseType, durationMinutes, distanceKm, avgHeartRate,
          hasHeartRateProof, status, notes, photoUrl</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => downloadTemplate('xlsx')}
          >
            Descargar XLSX
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => downloadTemplate('csv')}
          >
            Descargar CSV
          </button>
        </div>
        {downloadError && <p className="text-bad text-sm">{downloadError}</p>}
      </section>

      {/* Paso 2: archivo + opciones */}
      <section className="card p-5 space-y-4">
        <h2 className="display text-2xl">2. Subir archivo</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="block text-sm text-ink-dim file:mr-3 file:rounded-md file:border-0 file:bg-accent/15 file:px-4 file:py-2 file:text-accent hover:file:bg-accent/25"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-ink-mute">
              Estado por defecto
            </span>
            <select
              className="input"
              value={defaultStatus}
              onChange={(e) =>
                setDefaultStatus(e.target.value as ActivityStatus)
              }
            >
              <option value="VALIDATED">Validada</option>
              <option value="PENDING">Pendiente</option>
              <option value="REJECTED">Rechazada</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-ink-mute">
              Si ya existe el día
            </span>
            <select
              className="input"
              value={duplicateStrategy}
              onChange={(e) =>
                setDuplicateStrategy(e.target.value as DuplicateStrategy)
              }
            >
              <option value="skip">Omitir</option>
              <option value="update">Actualizar</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-ink-mute">
              Password temporal (opcional)
            </span>
            <input
              type="text"
              className="input"
              placeholder="Para usuarios nuevos"
              value={defaultPassword}
              onChange={(e) => setDefaultPassword(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={!file || previewMut.isPending}
            onClick={() => file && previewMut.mutate(file)}
          >
            {previewMut.isPending ? 'Analizando…' : 'Previsualizar'}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={
              !preview || preview.summary.valid === 0 || commitMut.isPending
            }
            onClick={() => commitMut.mutate()}
          >
            {commitMut.isPending
              ? 'Importando…'
              : `Importar${
                  preview ? ` ${preview.summary.valid} válidas` : ''
                }`}
          </button>
        </div>
        {previewMut.error && (
          <p className="text-bad text-sm">{previewMut.error.message}</p>
        )}
        {commitMut.error && (
          <p className="text-bad text-sm">{commitMut.error.message}</p>
        )}
      </section>

      {/* Resultado del commit */}
      {result && (
        <section className="card p-5 space-y-3 border border-ok/30">
          <h2 className="display text-2xl">Importación completada</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Filas" value={result.total} />
            <Stat label="Creadas" value={result.created} />
            <Stat label="Actualizadas" value={result.updated} />
            <Stat label="Omitidas" value={result.skipped} />
            <Stat label="Usuarios nuevos" value={result.usersCreated} />
            <Stat label="Inscripciones nuevas" value={result.participantsCreated} />
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-warn text-sm font-medium">
                {result.errors.length} fila(s) con error:
              </p>
              <ul className="text-xs text-ink-dim space-y-0.5">
                {result.errors.map((err) => (
                  <li key={err.row}>
                    Fila {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Preview */}
      {preview && (
        <section className="card p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="display text-2xl">Previsualización</h2>
            <span className="badge-validated">
              {preview.summary.valid} válidas
            </span>
            {preview.summary.invalid > 0 && (
              <span className="badge-rejected">
                {preview.summary.invalid} con error
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-mute text-xs uppercase tracking-wider">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={r.row}
                    className="border-t border-line align-top"
                  >
                    <td className="py-2 pr-3 text-ink-mute">{r.row}</td>
                    <td className="py-2 pr-3">{String(r.data.email ?? '')}</td>
                    <td className="py-2 pr-3">{String(r.data.date ?? '')}</td>
                    <td className="py-2 pr-3">
                      {String(r.data.exerciseType ?? '')}
                    </td>
                    <td className="py-2 pr-3">
                      {r.valid ? (
                        <span className="text-ok">OK</span>
                      ) : (
                        <span className="text-bad">Error</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-ink-dim">
                      {r.errors.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink-mute">{label}</p>
      <p className="display text-2xl">{value}</p>
    </div>
  );
}
