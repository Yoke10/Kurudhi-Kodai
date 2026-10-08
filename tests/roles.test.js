import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ALL_ROLES,
  normalizeRole,
  isAdminRole,
  isSuperAdminRole,
} from '../lib/roles.js';

test('Roles - Canonical Definitions are uppercase', () => {
  assert.equal(ROLES.USER, 'USER');
  assert.equal(ROLES.DONOR, 'DONOR');
  assert.equal(ROLES.ADMIN, 'ADMIN');
  assert.equal(ROLES.SUPERADMIN, 'SUPERADMIN');
  assert.deepEqual(ALL_ROLES, ['USER', 'DONOR', 'ADMIN', 'SUPERADMIN']);
});

test('Roles - normalizeRole handles legacy lowercase and mixed case', () => {
  assert.equal(normalizeRole('user'), 'USER');
  assert.equal(normalizeRole('donor'), 'DONOR');
  assert.equal(normalizeRole('admin'), 'ADMIN');
  assert.equal(normalizeRole('superadmin'), 'SUPERADMIN');
  assert.equal(normalizeRole('SuperAdmin'), 'SUPERADMIN');
  assert.equal(normalizeRole('  donor  '), 'DONOR');
  assert.equal(normalizeRole(null), 'USER');
  assert.equal(normalizeRole(undefined), 'USER');
  assert.equal(normalizeRole('unknown_role'), 'USER');
});

test('Roles - isAdminRole and isSuperAdminRole', () => {
  assert.equal(isAdminRole('ADMIN'), true);
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('SUPERADMIN'), true);
  assert.equal(isAdminRole('superadmin'), true);
  assert.equal(isAdminRole('USER'), false);
  assert.equal(isAdminRole('DONOR'), false);

  assert.equal(isSuperAdminRole('SUPERADMIN'), true);
  assert.equal(isSuperAdminRole('superadmin'), true);
  assert.equal(isSuperAdminRole('ADMIN'), false);
  assert.equal(isSuperAdminRole('USER'), false);
});
