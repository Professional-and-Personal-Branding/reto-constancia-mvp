import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FORMAT_MESSAGE, sizeMessage, storageErrorMessage } from './upload-errors.ts';

const TEN_MB = 10 * 1024 * 1024;

test('el tamaño máximo se muestra en MB', () => {
  assert.equal(sizeMessage(TEN_MB), 'El archivo supera el tamaño máximo (10 MB)');
});

test('traduce los rechazos de formato de Cloudinary y del simulador', () => {
  assert.equal(storageErrorMessage(400, '{"error":{"message":"Image file format gif not allowed"}}', TEN_MB), FORMAT_MESSAGE);
  assert.equal(storageErrorMessage(400, `{"statusCode":400,"message":"${FORMAT_MESSAGE}"}`, TEN_MB), FORMAT_MESSAGE);
});

test('traduce los archivos demasiado grandes', () => {
  assert.equal(storageErrorMessage(400, '{"error":{"message":"File size too large. Got 20000000."}}', TEN_MB), sizeMessage(TEN_MB));
  assert.equal(storageErrorMessage(413, '{"statusCode":413,"message":"File too large"}', TEN_MB), sizeMessage(TEN_MB));
});

test('muestra el mensaje en español del simulador y un texto genérico si no hay mensaje', () => {
  assert.equal(
    storageErrorMessage(403, '{"statusCode":403,"message":"No participas en este reto"}', TEN_MB),
    'No participas en este reto',
  );
  assert.equal(storageErrorMessage(500, '<html>', TEN_MB), 'No se pudo subir el archivo. Intenta de nuevo.');
});
