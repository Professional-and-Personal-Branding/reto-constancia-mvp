/** Descarga del acta de un reto cerrado (spec challenge-export). */

/** Mismo nombre que arma la API: sale solo del año y el mes del reto. */
export function exportFilename(year: number, month: number): string {
  return `acta-reto-${year}-${String(month).padStart(2, '0')}.csv`;
}

/** Entrega un archivo ya descargado al navegador con un enlace temporal. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
