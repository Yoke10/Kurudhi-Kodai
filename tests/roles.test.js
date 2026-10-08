import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ALL_ROLES,
  normalizeRole,
  isAdminRole,
  isSuperAdminRole,
  hasDonorProfile,
  resolveMigratedRole,
} from '../lib/roles.js';

test('Roles - Canonical Authorization Definitions are uppercase without DONOR', () => {
  assert.equal(ROLES.USER, 'USER');
  assert.equal(ROLES.ADMIN, 'ADMIN');
  assert.equal(ROLES.SUPERADMIN, 'SUPERADMIN');
  assert.equal(ROLES.DONOR, undefined); // DONOR is not an authorization system role
  assert.deepEqual(ALL_ROLES, ['USER', 'ADMIN', 'SUPERADMIN']);
});

test('Roles - normalizeRole handles legacy lowercase and mixed case', () => {
  assert.equal(normalizeRole('user'), 'USER');
  assert.equal(normalizeRole('admin'), 'ADMIN');
  assert.equal(normalizeRole('superadmin'), 'SUPERADMIN');
  assert.equal(normalizeRole('SuperAdmin'), 'SUPERADMIN');
  assert.equal(normalizeRole('donor'), 'USER'); // Legacy donor role maps to USER
  assert.equal(normalizeRole('DONOR'), 'USER');
  assert.equal(normalizeRole('  donor  '), 'USER');
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

test('Roles - hasDonorProfile capability detection', () => {
  assert.equal(hasDonorProfile({ uid: 'u1', bloodGroup: 'O+' }), true);
  assert.equal(hasDonorProfile({ id: 'u1', name: 'Ravi' }), true);
  assert.equal(hasDonorProfile(null), false);
  assert.equal(hasDonorProfile(undefined), false);
  assert.equal(hasDonorProfile({}), false);
});

test('Roles - resolveMigratedRole preserves previous privileged roles from audit', () => {
  // Case A: Ordinary user with legacy DONOR role -> USER
  assert.equal(resolveMigratedRole({ role: 'DONOR' }, []), 'USER');

  // Case B: Previous SUPERADMIN was downgraded to DONOR -> Restores SUPERADMIN
  const superAdminAudit = [
    { details: { role: 'SUPERADMIN' } }
  ];
  assert.equal(resolveMigratedRole({ role: 'DONOR' }, superAdminAudit), 'SUPERADMIN');

  // Case C: Previous ADMIN was downgraded to DONOR -> Restores ADMIN
  const adminAudit = [
    { metadata: { newRole: 'ADMIN' } }
  ];
  assert.equal(resolveMigratedRole({ role: 'DONOR' }, adminAudit), 'ADMIN');

  // Case D: Existing privileged user retains their role
  assert.equal(resolveMigratedRole({ role: 'SUPERADMIN' }, []), 'SUPERADMIN');
  assert.equal(resolveMigratedRole({ role: 'ADMIN' }, []), 'ADMIN');
});

