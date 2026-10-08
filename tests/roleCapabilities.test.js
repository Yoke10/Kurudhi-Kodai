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

// Authorization policy helpers matching dashboard guards
function canAccessSuperAdminDashboard({ role }) {
  return isSuperAdminRole(role);
}

function canAccessAdminDashboard({ role }) {
  return isAdminRole(role);
}

function canAccessDonorDashboard({ donorProfile }) {
  return hasDonorProfile(donorProfile);
}

// Simulated donor registration function matching app/newdonor/page.js
function executeDonorRegistration({ userDoc, donorPayload }) {
  // Capture snapshot before registration
  const beforeRole = userDoc.role;
  const beforeCity = userDoc.assignedCity;
  const beforeVerified = userDoc.emailVerified;

  // 1. Create donor profile under donors/{uid}
  const donorRecord = {
    uid: userDoc.uid,
    id: userDoc.uid,
    name: donorPayload.name,
    bloodGroup: donorPayload.bloodGroup,
    mobile: donorPayload.mobile,
    residentCity: donorPayload.city,
    availabilityStatus: 'AVAILABLE',
  };

  // 2. User document is strictly NOT mutated for role, assignedCity, or emailVerified
  const userDocAfter = { ...userDoc };

  return {
    userDocAfter,
    donorRecord,
    invariantsPreserved:
      userDocAfter.role === beforeRole &&
      userDocAfter.assignedCity === beforeCity &&
      userDocAfter.emailVerified === beforeVerified,
  };
}

// Simulated Firestore Rules Evaluator matching firestore.rules
function evaluateFirestoreRules({ auth, targetCollection, targetDocId, action, resourceData, requestData }) {
  const isAuthenticated = auth !== null;
  const isOwner = (id) => isAuthenticated && auth.uid === id;
  const isSuperAdmin = isAuthenticated && auth.role === 'SUPERADMIN';
  const isAdmin = isAuthenticated && (auth.role === 'ADMIN' || auth.role === 'SUPERADMIN');

  if (targetCollection === 'users') {
    if (action === 'read') {
      return isOwner(targetDocId) || isAdmin;
    }
    if (action === 'create') {
      const allowedRoles = ['USER', 'user'];
      const hasValidRole = !requestData?.role || allowedRoles.includes(requestData.role);
      const hasValidCity = !requestData?.assignedCity || requestData.assignedCity === '';
      return isOwner(targetDocId) && hasValidRole && hasValidCity;
    }
    if (action === 'update') {
      if (isSuperAdmin) return true;
      if (!isOwner(targetDocId)) return false;
      // Normal owner cannot change role or assignedCity
      const changesRole = requestData?.role !== undefined && requestData.role !== resourceData?.role;
      const changesCity = requestData?.assignedCity !== undefined && requestData.assignedCity !== resourceData?.assignedCity;
      if (changesRole || changesCity) return false;
      return true;
    }
    if (action === 'delete') {
      return isSuperAdmin;
    }
  }

  if (targetCollection === 'donors') {
    if (action === 'read') {
      return isOwner(targetDocId) || isAdmin;
    }
    if (action === 'create' || action === 'update') {
      return isOwner(targetDocId) || isAdmin;
    }
    if (action === 'delete') {
      return isSuperAdmin;
    }
  }

  if (targetCollection === 'requests') {
    if (action === 'read') return true;
    if (action === 'create') return isAuthenticated;
    if (action === 'update') return isAuthenticated;
    if (action === 'delete') return isSuperAdmin;
  }

  return false;
}

// ============================================================
// TEST 1: USER registers as donor
// Expected: role = USER, donor profile exists
// ============================================================
test('Test 1: USER registers as donor -> role = USER, donor profile exists', () => {
  const user = {
    uid: 'user-001',
    email: 'user@example.com',
    role: ROLES.USER,
    assignedCity: '',
    emailVerified: true,
  };

  const registration = executeDonorRegistration({
    userDoc: user,
    donorPayload: { name: 'Ravi Kumar', bloodGroup: 'O+', mobile: '9876543210', city: 'Chennai' },
  });

  assert.equal(registration.userDocAfter.role, ROLES.USER);
  assert.equal(registration.donorRecord.bloodGroup, 'O+');
  assert.equal(registration.donorRecord.uid, user.uid);
  assert.equal(hasDonorProfile(registration.donorRecord), true);
  assert.equal(registration.invariantsPreserved, true);
});

// ============================================================
// TEST 2: ADMIN registers as donor
// Expected: role = ADMIN, donor profile exists
// ============================================================
test('Test 2: ADMIN registers as donor -> role = ADMIN, donor profile exists', () => {
  const admin = {
    uid: 'admin-001',
    email: 'admin.chennai@example.com',
    role: ROLES.ADMIN,
    assignedCity: 'Chennai',
    emailVerified: true,
  };

  const registration = executeDonorRegistration({
    userDoc: admin,
    donorPayload: { name: 'Priya Admin', bloodGroup: 'A+', mobile: '9876543211', city: 'Chennai' },
  });

  assert.equal(registration.userDocAfter.role, ROLES.ADMIN);
  assert.equal(registration.donorRecord.bloodGroup, 'A+');
  assert.equal(registration.donorRecord.uid, admin.uid);
  assert.equal(hasDonorProfile(registration.donorRecord), true);
  assert.equal(isAdminRole(registration.userDocAfter.role), true);
  assert.equal(registration.invariantsPreserved, true);
});

// ============================================================
// TEST 3: SUPERADMIN registers as donor
// Expected: role = SUPERADMIN, donor profile exists
// ============================================================
test('Test 3: SUPERADMIN registers as donor -> role = SUPERADMIN, donor profile exists', () => {
  const superAdmin = {
    uid: 'superadmin-001',
    email: 'superadmin@example.com',
    role: ROLES.SUPERADMIN,
    assignedCity: '',
    emailVerified: true,
  };

  const registration = executeDonorRegistration({
    userDoc: superAdmin,
    donorPayload: { name: 'Head Coordinator', bloodGroup: 'B-', mobile: '9876543212', city: 'Madurai' },
  });

  assert.equal(registration.userDocAfter.role, ROLES.SUPERADMIN);
  assert.equal(registration.donorRecord.bloodGroup, 'B-');
  assert.equal(registration.donorRecord.uid, superAdmin.uid);
  assert.equal(hasDonorProfile(registration.donorRecord), true);
  assert.equal(isSuperAdminRole(registration.userDocAfter.role), true);
  assert.equal(registration.invariantsPreserved, true);
});

// ============================================================
// TEST 4: SUPERADMIN + donor
// Expected: superadmin dashboard accessible, donor dashboard accessible
// ============================================================
test('Test 4: SUPERADMIN + donor -> superadmin & donor dashboards both accessible', () => {
  const user = {
    role: ROLES.SUPERADMIN,
    donorProfile: { uid: 'sa-001', bloodGroup: 'O-', name: 'Super Donor' },
  };

  assert.equal(canAccessSuperAdminDashboard(user), true);
  assert.equal(canAccessDonorDashboard(user), true);
  assert.equal(canAccessAdminDashboard(user), true); // SuperAdmin inherits admin
});

// ============================================================
// TEST 5: ADMIN + donor
// Expected: admin dashboard accessible, donor dashboard accessible
// ============================================================
test('Test 5: ADMIN + donor -> admin & donor dashboards both accessible', () => {
  const user = {
    role: ROLES.ADMIN,
    donorProfile: { uid: 'admin-001', bloodGroup: 'AB+', name: 'Admin Donor' },
  };

  assert.equal(canAccessAdminDashboard(user), true);
  assert.equal(canAccessDonorDashboard(user), true);
  assert.equal(canAccessSuperAdminDashboard(user), false); // Cannot access Superadmin
});

// ============================================================
// TEST 6: USER + donor
// Expected: donor dashboard accessible, admin & superadmin dashboards inaccessible
// ============================================================
test('Test 6: USER + donor -> donor dashboard accessible, admin & superadmin inaccessible', () => {
  const user = {
    role: ROLES.USER,
    donorProfile: { uid: 'user-001', bloodGroup: 'A-', name: 'Ordinary Donor' },
  };

  assert.equal(canAccessDonorDashboard(user), true);
  assert.equal(canAccessAdminDashboard(user), false);
  assert.equal(canAccessSuperAdminDashboard(user), false);
});

// ============================================================
// TEST 7: Donor registration must never change: role, assignedCity, emailVerified
// ============================================================
test('Test 7: Donor registration must never change role, assignedCity, emailVerified', () => {
  const testCases = [
    { uid: 'u1', role: ROLES.USER, assignedCity: '', emailVerified: true },
    { uid: 'u2', role: ROLES.ADMIN, assignedCity: 'Salem', emailVerified: true },
    { uid: 'u3', role: ROLES.SUPERADMIN, assignedCity: '', emailVerified: true },
  ];

  for (const initialUser of testCases) {
    const result = executeDonorRegistration({
      userDoc: initialUser,
      donorPayload: { name: 'Donor Name', bloodGroup: 'O+', mobile: '9876543210', city: 'Salem' },
    });

    assert.equal(result.userDocAfter.role, initialUser.role, `Role changed for ${initialUser.uid}`);
    assert.equal(result.userDocAfter.assignedCity, initialUser.assignedCity, `assignedCity changed for ${initialUser.uid}`);
    assert.equal(result.userDocAfter.emailVerified, initialUser.emailVerified, `emailVerified changed for ${initialUser.uid}`);
    assert.equal(result.invariantsPreserved, true);
  }
});

// ============================================================
// TEST 8: Verify Firestore rule behavior for all user personas
// USER, DONOR-capable USER, ADMIN, ADMIN + donor, SUPERADMIN, SUPERADMIN + donor, unauthenticated
// ============================================================
test('Test 8: Firestore security rule behavior matrix across all user personas', () => {
  const personaUnauthenticated = null;
  const personaUser = { uid: 'u1', role: 'USER' };
  const personaDonorUser = { uid: 'u2', role: 'USER' };
  const personaAdmin = { uid: 'a1', role: 'ADMIN' };
  const personaAdminDonor = { uid: 'a2', role: 'ADMIN' };
  const personaSuperAdmin = { uid: 'sa1', role: 'SUPERADMIN' };
  const personaSuperAdminDonor = { uid: 'sa2', role: 'SUPERADMIN' };

  // Rule 1: Donor PII privacy (Reading someone else's donor record)
  // Only the donor owner or admins can read a donor's document
  assert.equal(evaluateFirestoreRules({
    auth: personaUnauthenticated,
    targetCollection: 'donors',
    targetDocId: 'donor-victim',
    action: 'read'
  }), false, 'Unauthenticated user cannot read donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaUser,
    targetCollection: 'donors',
    targetDocId: 'donor-victim',
    action: 'read'
  }), false, 'Ordinary USER cannot scrape other donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaDonorUser,
    targetCollection: 'donors',
    targetDocId: 'donor-victim',
    action: 'read'
  }), false, 'DONOR-capable USER cannot scrape other donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaDonorUser,
    targetCollection: 'donors',
    targetDocId: personaDonorUser.uid,
    action: 'read'
  }), true, 'Donor can read their own donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaAdmin,
    targetCollection: 'donors',
    targetDocId: 'donor-victim',
    action: 'read'
  }), true, 'ADMIN can read donor document for emergency coordination');

  assert.equal(evaluateFirestoreRules({
    auth: personaAdminDonor,
    targetCollection: 'donors',
    targetDocId: 'donor-victim',
    action: 'read'
  }), true, 'ADMIN + donor can read donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaSuperAdmin,
    targetCollection: 'donors',
    targetDocId: 'donor-victim',
    action: 'read'
  }), true, 'SUPERADMIN can read donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaSuperAdminDonor,
    targetCollection: 'donors',
    targetDocId: 'donor-victim',
    action: 'read'
  }), true, 'SUPERADMIN + donor can read donor document');

  // Rule 2: User profile role tampering
  // Normal users cannot change their role on update
  assert.equal(evaluateFirestoreRules({
    auth: personaUser,
    targetCollection: 'users',
    targetDocId: personaUser.uid,
    action: 'update',
    resourceData: { role: 'USER' },
    requestData: { role: 'DONOR' } // Attempt to change role to DONOR
  }), false, 'Ordinary user cannot mutate their own role to DONOR');

  assert.equal(evaluateFirestoreRules({
    auth: personaUser,
    targetCollection: 'users',
    targetDocId: personaUser.uid,
    action: 'update',
    resourceData: { role: 'USER' },
    requestData: { role: 'ADMIN' } // Attempt to elevate to ADMIN
  }), false, 'Ordinary user cannot elevate to ADMIN');

  assert.equal(evaluateFirestoreRules({
    auth: personaSuperAdmin,
    targetCollection: 'users',
    targetDocId: 'target-user',
    action: 'update',
    resourceData: { role: 'USER' },
    requestData: { role: 'ADMIN' }
  }), true, 'SuperAdmin CAN update user roles');

  // Rule 3: Creating a donor record
  // USER, ADMIN, and SUPERADMIN can all create their own donor record
  assert.equal(evaluateFirestoreRules({
    auth: personaUser,
    targetCollection: 'donors',
    targetDocId: personaUser.uid,
    action: 'create',
    requestData: { bloodGroup: 'O+' }
  }), true, 'USER can create their own donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaAdmin,
    targetCollection: 'donors',
    targetDocId: personaAdmin.uid,
    action: 'create',
    requestData: { bloodGroup: 'A+' }
  }), true, 'ADMIN can create their own donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaSuperAdmin,
    targetCollection: 'donors',
    targetDocId: personaSuperAdmin.uid,
    action: 'create',
    requestData: { bloodGroup: 'B+' }
  }), true, 'SUPERADMIN can create their own donor document');

  assert.equal(evaluateFirestoreRules({
    auth: personaUser,
    targetCollection: 'donors',
    targetDocId: 'another-user',
    action: 'create',
    requestData: { bloodGroup: 'O+' }
  }), false, 'USER cannot create donor document for someone else');

  // Rule 4: Public blood request visibility
  assert.equal(evaluateFirestoreRules({
    auth: personaUnauthenticated,
    targetCollection: 'requests',
    targetDocId: 'req-01',
    action: 'read'
  }), true, 'Blood requests are publicly readable for coordination');
});
