'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { getTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type {
  ActivityStatus,
  ImportCommitResult,
  ImportPreviewResult,
  SheetStatus,
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
  const [sheetId, setSheetId] = useState('');
  const [sheetRange, setSheetRange] = useState('');

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

  // ---- Google Sheets (spec google-sheets-import) ----
  const sheetStatusQuery = useQuery<SheetStatus>({
    queryKey: ['import', 'sheet', 'status'],
    queryFn: async () => {
      const res = await authFetch('/import/sheet/status', { method: 'GET' });
      if (!res.ok) throw new Error(await errorMessage(res));
      return res.json() as Promise<SheetStatus>;
    },
  });
  const sheetConfigured = sheetStatusQuery.data?.configured === true;
  const sheetBody = () =>
    JSON.stringify({ spreadsheetId: sheetId.trim(), range: sheetRange.trim() || undefined });

  const sheetCheckMut = useMutation<SheetStatus, Error, void>({
    mutationFn: async () => {
      const qs = new URLSearchParams({ spreadsheetId: sheetId.trim() });
      if (sheetRange.trim()) qs.set('range', sheetRange.trim());
      const res = await authFetch(`/import/sheet/status?${qs.toString()}`, { method: 'GET' });
      if (!res.ok) throw new Error(await errorMessage(res));
      return res.json() as Promise<SheetStatus>;
    },
  });

  const sheetPreviewMut = useMutation<ImportPreviewResult, Error, void>({
    mutationFn: async () => {
      previewMut.reset();
      commitMut.reset();
      const res = await authFetch('/import/sheet/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: sheetBody(),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      return res.json() as Promise<ImportPreviewResult>;
    },
  });

  const sheetCommitMut = useMutation<ImportCommitResult, Error, void>({
    mutationFn: async () => {
      const qs = new URLSearchParams({ defaultStatus, duplicateStrategy });
      if (defaultPassword) qs.set('defaultPassword', defaultPassword);
      const res = await authFetch(`/import/sheet/commit?${qs.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: sheetBody(),
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
    sheetPreviewMut.reset();
    sheetCommitMut.reset();
  }

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="card p-8 text-center text-ink-dim">
        Sección solo para administradores.
      </div>
    );
  }

  // Las tablas de resultado se comparten entre la carga por archivo y la de Google Sheets
  const preview = previewMut.data ?? sheetPreviewMut.data;
  const result = commitMut.data ?? sheetCommitMut.data;

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
              !previewMut.data || previewMut.data.summary.valid === 0 || commitMut.isPending
            }
            onClick={() => commitMut.mutate()}
          >
            {commitMut.isPending
              ? 'Importando…'
              : `Importar${
                  previewMut.data ? ` ${previewMut.data.summary.valid} válidas` : ''
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

      {/* Paso 3: Google Sheets (spec google-sheets-import) */}
      <section className="card p-5 space-y-4" aria-label="Importar desde Google Sheets">
        <h2 className="display text-2xl">3. Desde Google Sheets</h2>
        {sheetStatusQuery.isLoading ? (
          <p className="text-ink-dim text-sm">Comprobando la integración…</p>
        ) : !sheetConfigured ? (
          <p className="text-ink-dim text-sm" role="status">
            Integración no configurada en el servidor (faltan{' '}
            <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> y <code>GOOGLE_PRIVATE_KEY</code>).
            Mientras tanto usa la carga por archivo. Guía: <code>docs/import-template.md</code>.
          </p>
        ) : (
          <p className="text-ink-dim text-sm">
            Comparte la hoja (lector) con el email de la cuenta de servicio y mantén la
            cabecera de la plantilla en la fila 1. Se usan las mismas opciones del paso 2.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-ink-mute">Spreadsheet ID</span>
            <input
              type="text"
              className="input"
              placeholder="Segmento entre /d/ y /edit de la URL"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              disabled={!sheetConfigured}
              aria-label="Spreadsheet ID"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-ink-mute">
              Hoja o rango (opcional)
            </span>
            <input
              type="text"
              className="input"
              placeholder="mayo · mayo!A:Z"
              value={sheetRange}
              onChange={(e) => setSheetRange(e.target.value)}
              disabled={!sheetConfigured}
              aria-label="Hoja o rango"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={!sheetConfigured || !sheetId.trim() || sheetCheckMut.isPending}
            onClick={() => sheetCheckMut.mutate()}
          >
            {sheetCheckMut.isPending ? 'Comprobando…' : 'Comprobar'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!sheetConfigured || !sheetId.trim() || sheetPreviewMut.isPending}
            onClick={() => sheetPreviewMut.mutate()}
          >
            {sheetPreviewMut.isPending ? 'Analizando…' : 'Previsualizar'}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={
              !sheetPreviewMut.data ||
              sheetPreviewMut.data.summary.valid === 0 ||
              sheetCommitMut.isPending
            }
            onClick={() => sheetCommitMut.mutate()}
          >
            {sheetCommitMut.isPending
              ? 'Importando…'
              : `Importar${
                  sheetPreviewMut.data ? ` ${sheetPreviewMut.data.summary.valid} válidas` : ''
                }`}
          </button>
        </div>
        {sheetCheckMut.data && (
          <p className={`text-sm ${sheetCheckMut.data.readable ? 'text-ok' : 'text-warn'}`}>
            {sheetCheckMut.data.readable
              ? `Legible: "${sheetCheckMut.data.title}" · hojas: ${sheetCheckMut.data.sheets?.join(', ')} · rango ${sheetCheckMut.data.range} · ${sheetCheckMut.data.rowCount} filas de datos`
              : (sheetCheckMut.data.message ?? 'No se pudo leer la hoja')}
          </p>
        )}
        {sheetCheckMut.error && <p className="text-bad text-sm">{sheetCheckMut.error.message}</p>}
        {sheetPreviewMut.error && (
          <p className="text-bad text-sm">{sheetPreviewMut.error.message}</p>
        )}
        {sheetCommitMut.error && <p className="text-bad text-sm">{sheetCommitMut.error.message}</p>}
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
            {preview.summary.warnings > 0 && (
              <span className="badge bg-warn/15 text-warn">
                {preview.summary.warnings} sin cumplir la regla de FC (se importan igual)
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
                      {r.warnings.length > 0 && (
                        <span className="text-warn">{r.warnings.join('; ')}</span>
                      )}
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
