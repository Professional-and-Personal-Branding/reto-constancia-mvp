/**
 * Pruebas del reenvío de una actividad rechazada (cambio resubmit-rejected-activity-2).
 * `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildResubmissionPhotos,
  canResubmit,
  clearSlot,
  earlierRejections,
  moveToOtherSlot,
  removeOther,
  resubmittedLabel,
  slotsFromPhotos,
} from './resubmission.ts';

const photo = (id: string, type: 'ACTIVITY' | 'HEART_RATE' | 'METRICS') => ({
  url: `https://x.test/${id}.png`,
  cloudinaryId: `reto/${id}`,
  type,
});

test('reenvío: la primera ACTIVITY y la primera HEART_RATE llenan los espacios', () => {
  const slots = slotsFromPhotos([photo('a', 'ACTIVITY'), photo('h', 'HEART_RATE')]);
  assert.equal(slots.activity?.cloudinaryId, 'reto/a');
  assert.equal(slots.hr?.cloudinaryId, 'reto/h');
  assert.deepEqual(slots.others, []);
  // METRICS también es la foto de la actividad
  assert.equal(slotsFromPhotos([photo('m', 'METRICS')]).activity?.cloudinaryId, 'reto/m');
});

test('reenvío: una actividad importada con tres fotos ACTIVITY deja dos en Otras fotos', () => {
  const slots = slotsFromPhotos([photo('a', 'ACTIVITY'), photo('b', 'ACTIVITY'), photo('c', 'ACTIVITY')]);
  assert.equal(slots.activity?.cloudinaryId, 'reto/a');
  assert.equal(slots.hr, null);
  assert.deepEqual(
    slots.others.map((p) => p.cloudinaryId),
    ['reto/b', 'reto/c'],
  );
  // Sin cambios, el cuerpo conserva las tres con su tipo guardado
  const body = buildResubmissionPhotos(slots, {});
  assert.deepEqual(
    body.map((p) => [p.cloudinaryId, p.type]),
    [
      ['reto/a', 'ACTIVITY'],
      ['reto/b', 'ACTIVITY'],
      ['reto/c', 'ACTIVITY'],
    ],
  );
  // Quitar una de "Otras fotos" la deja fuera del cuerpo
  assert.equal(buildResubmissionPhotos(removeOther(slots, 'reto/b'), {}).length, 2);
});

test('reenvío: quitar vacía el espacio y subir una captura nueva la agrega al cuerpo', () => {
  const slots = slotsFromPhotos([photo('a', 'ACTIVITY')]);
  assert.equal(clearSlot(slots, 'activity').activity, null);
  const body = buildResubmissionPhotos(slots, { hr: photo('new', 'HEART_RATE') });
  assert.deepEqual(
    body.map((p) => [p.cloudinaryId, p.type]),
    [
      ['reto/a', 'ACTIVITY'],
      ['reto/new', 'HEART_RATE'],
    ],
  );
  // Reemplazar: la subida nueva gana sobre la guardada del mismo espacio
  const replaced = buildResubmissionPhotos(slots, { activity: photo('n', 'ACTIVITY') });
  assert.deepEqual(
    replaced.map((p) => p.cloudinaryId),
    ['reto/n'],
  );
});

test('reenvío: re-etiquetar mueve la foto al otro espacio con el tipo del espacio', () => {
  const slots = slotsFromPhotos([photo('a', 'ACTIVITY')]);
  const moved = moveToOtherSlot(slots, 'activity');
  assert.equal(moved.activity, null);
  assert.equal(moved.hr?.cloudinaryId, 'reto/a');
  assert.equal(moved.hr?.type, 'HEART_RATE');
  assert.equal(buildResubmissionPhotos(moved, {})[0].type, 'HEART_RATE');
  // Con el otro espacio ocupado (foto guardada o archivo nuevo) no se mueve
  const both = slotsFromPhotos([photo('a', 'ACTIVITY'), photo('h', 'HEART_RATE')]);
  assert.equal(moveToOtherSlot(both, 'activity'), both);
  assert.equal(moveToOtherSlot(slots, 'activity', true), slots);
  // Y al revés: la captura pasa a ser la foto de la actividad
  const back = moveToOtherSlot(slotsFromPhotos([photo('h', 'HEART_RATE')]), 'hr');
  assert.equal(back.activity?.type, 'ACTIVITY');
});

test('reenvío: canResubmit pide dueño, rechazada y reto activo', () => {
  const base = { userId: 'u1', status: 'REJECTED' as const, challenge: { status: 'ACTIVE' as const } };
  assert.equal(canResubmit(base, 'u1'), true);
  assert.equal(canResubmit(base, 'u2'), false);
  assert.equal(canResubmit(base, undefined), false);
  assert.equal(canResubmit({ ...base, status: 'PENDING' }, 'u1'), false);
  assert.equal(canResubmit({ ...base, status: 'VALIDATED' }, 'u1'), false);
  assert.equal(canResubmit({ ...base, challenge: { status: 'COMPLETED' } }, 'u1'), false);
  assert.equal(canResubmit({ userId: 'u1', status: 'REJECTED' }, 'u1'), false);
  // Con el estado del reto del selector cuando la lista no lo trae
  assert.equal(canResubmit({ userId: 'u1', status: 'REJECTED' }, 'u1', 'ACTIVE'), true);
});

test('reenvío: earlierRejections excluye el rechazo vigente solo si sigue rechazada', () => {
  const rejections = [
    { reason: 'uno', rejectedAt: '2025-01-10T10:00:00.000Z' },
    { reason: 'dos', rejectedAt: '2025-01-11T10:00:00.000Z' },
  ];
  assert.deepEqual(
    earlierRejections({ status: 'REJECTED', rejections }).map((r) => r.reason),
    ['uno'],
  );
  assert.deepEqual(
    earlierRejections({ status: 'PENDING', rejections }).map((r) => r.reason),
    ['uno', 'dos'],
  );
  assert.deepEqual(earlierRejections({ status: 'REJECTED', rejections: rejections.slice(0, 1) }), []);
  assert.deepEqual(earlierRejections({ status: 'REJECTED' }), []);
});

test('reenvío: la insignia de la cola dice Reenviada y Reenviada ×n desde la segunda', () => {
  assert.equal(resubmittedLabel(undefined), null);
  assert.equal(resubmittedLabel(0), null);
  assert.equal(resubmittedLabel(1), 'Reenviada');
  assert.equal(resubmittedLabel(3), 'Reenviada ×3');
});
