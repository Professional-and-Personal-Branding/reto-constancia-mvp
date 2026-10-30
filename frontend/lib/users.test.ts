import assert from 'node:assert/strict';
import { test } from 'node:test';

import { filterUsers, roleConfirmation, roleLabel, rowActions, sortUsers, statusLabel } from './users.ts';
import type { SafeUser } from './types.ts';

const make = (id: string, name: string, email: string, over: Partial<SafeUser> = {}): SafeUser => ({
  id,
  name,
  email,
  role: 'PARTICIPANT',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

test('Usuarios: la búsqueda ignora mayúsculas y tildes en nombre y correo', () => {
  const users = [
    make('1', 'José Pérez', 'jp@x.com'),
    make('2', 'Ana', 'ANA.GOMEZ@x.com'),
    make('3', 'Luis', 'l@x.com'),
  ];
  assert.deepEqual(
    filterUsers(users, 'JOSE').map((u) => u.id),
    ['1'],
  );
  assert.deepEqual(
    filterUsers(users, 'pérez').map((u) => u.id),
    ['1'],
  );
  assert.deepEqual(
    filterUsers(users, 'gómez').map((u) => u.id),
    ['2'],
  );
  assert.equal(filterUsers(users, '  ').length, 3);
  assert.equal(filterUsers(users, 'zzz').length, 0);
});

test('Usuarios: la lista se ordena por nombre', () => {
  const users = [make('1', 'Zoe', 'z@x.com'), make('2', 'Álvaro', 'a@x.com'), make('3', 'Beto', 'b@x.com')];
  assert.deepEqual(
    sortUsers(users).map((u) => u.name),
    ['Álvaro', 'Beto', 'Zoe'],
  );
  assert.deepEqual(
    users.map((u) => u.id),
    ['1', '2', '3'],
  );
});

test('Usuarios: la propia fila no ofrece desactivar, cambiar rol ni reiniciar', () => {
  const me = make('1', 'Admin', 'a@x.com', { role: 'ADMIN' });
  const other = make('2', 'Ana', 'ana@x.com');
  assert.deepEqual(rowActions(me, '1'), { isSelf: true });
  assert.equal(rowActions(other, '1').isSelf, false);
});

test('Usuarios: las etiquetas de rol, estado y acción siguen al usuario', () => {
  const ana = make('2', 'Ana', 'ana@x.com');
  const boss = make('3', 'Jefe', 'j@x.com', { role: 'ADMIN', active: false });
  assert.equal(roleLabel(ana), 'Participante');
  assert.equal(roleLabel(boss), 'Admin');
  assert.equal(statusLabel(ana), 'Activo');
  assert.equal(statusLabel(boss), 'Inactivo');
  const a = rowActions(ana, '1');
  const b = rowActions(boss, '1');
  assert.ok(!a.isSelf && !b.isSelf);
  if (!a.isSelf && !b.isSelf) {
    assert.equal(a.toggleActiveLabel, 'Desactivar');
    assert.equal(a.toggleRoleLabel, 'Hacer admin');
    assert.equal(a.activeNeedsConfirm, true);
    assert.equal(b.toggleActiveLabel, 'Activar');
    assert.equal(b.toggleRoleLabel, 'Quitar admin');
    assert.equal(b.activeNeedsConfirm, false);
  }
  assert.equal(roleConfirmation(ana), '¿Dar permisos de administrador a Ana?');
  assert.equal(roleConfirmation(boss), '¿Quitar los permisos de administrador a Jefe?');
});
