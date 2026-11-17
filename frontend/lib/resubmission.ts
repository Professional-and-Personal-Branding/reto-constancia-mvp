/**
 * Reenvío de una actividad rechazada (cambio resubmit-rejected-activity-2, design D9): funciones
 * puras que reparten las fotos guardadas en los dos espacios del formulario y arman el cuerpo del
 * `PUT /activities/:id/resubmission`. La API vuelve a decidir todo; esto solo guía la interfaz.
 */
import type { ActivityRejection, ActivityStatus, ChallengeStatus, DailyActivity, PhotoType } from './types.ts';

/** Foto ya guardada (o recién subida) tal como la espera la API. */
export interface SlotPhoto {
  url: string;
  cloudinaryId: string;
  type: PhotoType;
}

export type SlotName = 'activity' | 'hr';

/** Fotos guardadas repartidas: foto de la actividad, captura de FC y "Otras fotos". */
export interface StoredSlots {
  activity: SlotPhoto | null;
  hr: SlotPhoto | null;
  others: SlotPhoto[];
}

const SLOT_TYPE: Record<SlotName, PhotoType> = { activity: 'ACTIVITY', hr: 'HEART_RATE' };

function asSlotPhoto(p: { url: string; cloudinaryId: string; type: PhotoType }): SlotPhoto {
  return { url: p.url, cloudinaryId: p.cloudinaryId, type: p.type };
}

/**
 * La primera foto ACTIVITY o METRICS llena el espacio de la actividad, la primera HEART_RATE el de
 * la captura; el resto (importadas o por API) va a "Otras fotos" con su tipo guardado.
 */
export function slotsFromPhotos(photos: { url: string; cloudinaryId: string; type: PhotoType }[]): StoredSlots {
  const slots: StoredSlots = { activity: null, hr: null, others: [] };
  for (const p of photos) {
    if (p.type === 'HEART_RATE' && !slots.hr) slots.hr = asSlotPhoto(p);
    else if (p.type !== 'HEART_RATE' && !slots.activity) slots.activity = asSlotPhoto(p);
    else slots.others.push(asSlotPhoto(p));
  }
  return slots;
}

/** "Quitar" en un espacio: la foto guardada se descarta al enviar. */
export function clearSlot(slots: StoredSlots, name: SlotName): StoredSlots {
  return { ...slots, [name]: null };
}

/** "Quitar" en "Otras fotos". */
export function removeOther(slots: StoredSlots, cloudinaryId: string): StoredSlots {
  return { ...slots, others: slots.others.filter((p) => p.cloudinaryId !== cloudinaryId) };
}

/**
 * "Usar como captura de FC" / "Usar como foto de la actividad": mueve la foto guardada al otro
 * espacio si está libre; el tipo que se envía es el del espacio. Si el otro espacio está ocupado
 * (con una foto guardada o con un archivo nuevo, `otherBusy`) no cambia nada.
 */
export function moveToOtherSlot(slots: StoredSlots, from: SlotName, otherBusy = false): StoredSlots {
  const to: SlotName = from === 'activity' ? 'hr' : 'activity';
  const photo = slots[from];
  if (!photo || slots[to] || otherBusy) return slots;
  return { ...slots, [from]: null, [to]: { ...photo, type: SLOT_TYPE[to] } };
}

/**
 * Lista final de fotos del cuerpo: por espacio, la recién subida si la hay o la guardada (con el
 * tipo del espacio), y luego las "Otras fotos" con su tipo guardado.
 */
export function buildResubmissionPhotos(
  stored: StoredSlots,
  uploaded: { activity?: SlotPhoto | null; hr?: SlotPhoto | null },
): SlotPhoto[] {
  const photos: SlotPhoto[] = [];
  for (const name of ['activity', 'hr'] as const) {
    const photo = uploaded[name] ?? stored[name];
    if (photo) photos.push({ url: photo.url, cloudinaryId: photo.cloudinaryId, type: SLOT_TYPE[name] });
  }
  return [...photos, ...stored.others];
}

/**
 * Guarda de la pantalla de reenvío: la actividad es del usuario, está rechazada y su reto sigue
 * activo (`challengeStatus` permite usar el reto del selector cuando la lista no lo trae).
 */
export function canResubmit(
  activity: { userId: string; status: ActivityStatus; challenge?: { status: ChallengeStatus } },
  userId: string | undefined,
  challengeStatus: ChallengeStatus | undefined = activity.challenge?.status,
): boolean {
  return !!userId && activity.userId === userId && activity.status === 'REJECTED' && challengeStatus === 'ACTIVE';
}

/** Rechazos previos: todo el historial, salvo el vigente cuando la actividad sigue rechazada. */
export function earlierRejections(activity: Pick<DailyActivity, 'status' | 'rejections'>): ActivityRejection[] {
  const all = activity.rejections ?? [];
  return activity.status === 'REJECTED' ? all.slice(0, -1) : all;
}

/** Insignia de la cola de validación: "Reenviada" o "Reenviada ×n" desde el segundo reenvío. */
export function resubmittedLabel(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count === 1 ? 'Reenviada' : `Reenviada ×${count}`;
}
