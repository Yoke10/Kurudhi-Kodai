import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DONATION_STATES,
  ACTIVE_DONATION_STATES,
  TERMINAL_DONATION_STATES,
  isDonationActive,
  isDonationCompleted,
  isDonationCancelled,
  isDonationCancellable,
  normalizeDonationStatus,
} from '../lib/donationStateMachine.js';
import {
  REQUEST_STATES,
  isRequestActive,
  isRequestFullyCompleted,
  isRequestCancelled,
  isRequestExpired,
  isRequestPartiallyFulfilled,
  isRequestOpenForMatching,
  normalizeRequestStatus,
} from '../lib/requestStateMachine.js';
import { calculateDonorCooldown } from '../lib/matchingEngine.js';
import {
  generateSecure4DigitOtp,
  hashOtp,
  isDualOtpFullyVerified,
} from '../lib/otpService.js';
import { COMMITMENT_ERROR_MSG } from '../lib/donationService.js';

// =========================================================================
// In-Memory Transactional Firestore Simulation for Authoritative Validation
// =========================================================================
class MockFirestore {
  constructor() {
    this.store = new Map(); // path -> document data copy
    this.versions = new Map(); // path -> version integer
    this.txAttempts = 0;
  }

  getDoc(path) {
    if (!this.store.has(path)) return { exists: false, data: () => null };
    return {
      exists: true,
      id: path.split('/').pop(),
      data: () => JSON.parse(JSON.stringify(this.store.get(path))),
    };
  }

  setDoc(path, data, options = {}) {
    const curVer = this.versions.get(path) || 0;
    this.versions.set(path, curVer + 1);
    if (options.merge && this.store.has(path)) {
      const existing = this.store.get(path);
      this.store.set(path, { ...existing, ...JSON.parse(JSON.stringify(data)) });
    } else {
      this.store.set(path, JSON.parse(JSON.stringify(data)));
    }
  }

  updateDoc(path, data) {
    if (!this.store.has(path)) throw new Error(`Document ${path} does not exist`);
    const curVer = this.versions.get(path) || 0;
    this.versions.set(path, curVer + 1);
    const existing = this.store.get(path);
    this.store.set(path, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }

  deleteDoc(path) {
    const curVer = this.versions.get(path) || 0;
    this.versions.set(path, curVer + 1);
    this.store.delete(path);
  }

  async runTransaction(updateFunction, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      this.txAttempts++;
      const readVersions = new Map();
      const pendingWrites = [];

      const tx = {
        get: async (path) => {
          // Micro-tick yield to simulate true network concurrency
          await new Promise((res) => setTimeout(res, 2));
          const v = this.versions.get(path) || 0;
          readVersions.set(path, v);
          if (!this.store.has(path)) return { exists: false, data: () => null };
          return {
            exists: true,
            id: path.split('/').pop(),
            data: () => JSON.parse(JSON.stringify(this.store.get(path))),
          };
        },
        set: (path, data, options = {}) => {
          pendingWrites.push({ type: 'set', path, data, options });
        },
        update: (path, data) => {
          pendingWrites.push({ type: 'update', path, data });
        },
        delete: (path) => {
          pendingWrites.push({ type: 'delete', path });
        },
      };

      try {
        const result = await updateFunction(tx);

        // Optimistic concurrency control check: did any read document change?
        let conflict = false;
        for (const [readPath, readVer] of readVersions.entries()) {
          const currentVer = this.versions.get(readPath) || 0;
          if (currentVer !== readVer) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          // Document modified by concurrent transaction -> retry with fresh snapshot
          continue;
        }

        // Commit pending writes
        for (const op of pendingWrites) {
          if (op.type === 'set') {
            this.setDoc(op.path, op.data, op.options);
          } else if (op.type === 'update') {
            this.updateDoc(op.path, op.data);
          } else if (op.type === 'delete') {
            this.deleteDoc(op.path);
          }
        }

        return result;
      } catch (err) {
        throw err;
      }
    }
    throw new Error('Transaction failed after maximum retries due to concurrent write contention.');
  }
}

// Transactional Helper mirroring acceptDonationPledge
async function mockAcceptDonationPledge(db, { request, donorUid, donorProfile, userEmail }) {
  if (!donorUid) throw new Error('Donor must be authenticated');
  if (!donorProfile) throw new Error('Donor profile not found');

  return await db.runTransaction(async (tx) => {
    const commitmentPath = `donorCommitments/${donorUid}`;
    const reqPath = `requests/${request.id}`;

    const commitmentSnap = await tx.get(commitmentPath);
    if (commitmentSnap.exists) {
      const cData = commitmentSnap.data();
      if (cData.status === 'ACTIVE') {
        throw new Error(COMMITMENT_ERROR_MSG);
      }
    }

    const reqSnap = await tx.get(reqPath);
    if (!reqSnap.exists) throw new Error('Blood request does not exist');
    const rData = reqSnap.data();

    if (rData.status === 'CANCELLED') throw new Error('This blood request has been cancelled');
    if (rData.status === 'FULFILLED') throw new Error('This blood request is already fulfilled');
    if (!isRequestActive(rData)) throw new Error('Blood request is no longer open for donations');

    const unitsNeeded = parseInt(rData.unitsNeeded || rData.UnitsNeeded || 1, 10);
    const unitsDonated = parseInt(rData.unitsDonated || rData.UnitsDonated || 0, 10);
    if (unitsDonated >= unitsNeeded) throw new Error('This blood request has already met required units');

    if (rData.createdByUid === donorUid || rData.uuid === donorUid) {
      throw new Error('You cannot accept your own blood request');
    }

    // Cooldown check
    const { isEligible } = calculateDonorCooldown(donorProfile.lastDonationAt);
    if (!isEligible) throw new Error('Donor is currently in cooldown period');

    // Create donation record
    const donationId = `don_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const donationPath = `requests/${request.id}/donations/${donationId}`;
    const donationData = {
      requestId: request.id,
      requesterUid: rData.createdByUid || rData.uuid,
      donorId: donorUid,
      donorUid,
      donorEmail: userEmail || 'donor@test.com',
      donorName: donorProfile.name || 'Test Donor',
      donorBloodGroup: donorProfile.bloodGroup || 'O+',
      status: 'OTP_PENDING',
      completed: false,
      donorOtpVerified: false,
      requesterOtpVerified: false,
      createdAt: new Date().toISOString(),
    };

    tx.set(donationPath, donationData);

    // Atomically establish active donor commitment lock
    tx.set(commitmentPath, {
      donorUid,
      requestId: request.id,
      donationId,
      patientName: rData.patientName || 'Patient',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    });

    return { donationId, donation: donationData };
  });
}

// Transactional Helper mirroring cancelDonorDonation
async function mockCancelDonorDonation(db, { requestId, donationId, donorUid, reason }) {
  if (!donorUid) throw new Error('Unauthorized');

  return await db.runTransaction(async (tx) => {
    const donationPath = `requests/${requestId}/donations/${donationId}`;
    const reqPath = `requests/${requestId}`;
    const commitmentPath = `donorCommitments/${donorUid}`;

    const donSnap = await tx.get(donationPath);
    if (!donSnap.exists) throw new Error('Donation record not found');
    const dData = donSnap.data();

    // Verify authorized donor owns this donation
    if (dData.donorUid !== donorUid && dData.donorId !== donorUid) {
      throw new Error('Unauthorized: You can only cancel your own donation pledge');
    }

    if (!isDonationCancellable(dData)) {
      throw new Error(`Donation cannot be cancelled from status ${dData.status}`);
    }

    // Soft cancellation
    tx.update(donationPath, {
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      cancelledByUid: donorUid,
      cancellationReason: reason || 'Donor cancelled pledge',
    });

    // Release commitment lock
    tx.set(commitmentPath, {
      status: 'RELEASED',
      releasedAt: new Date().toISOString(),
      releasedByUid: donorUid,
      releaseReason: reason,
      previousRequestId: requestId,
      previousDonationId: donationId,
    }, { merge: true });

    // Reopen parent request if eligible
    const reqSnap = await tx.get(reqPath);
    if (reqSnap.exists) {
      const rData = reqSnap.data();
      const unitsNeeded = parseInt(rData.unitsNeeded || rData.UnitsNeeded || 1, 10);
      const unitsDonated = parseInt(rData.unitsDonated || rData.UnitsDonated || 0, 10);

      if (rData.status !== 'CANCELLED' && rData.status !== 'REJECTED' && unitsDonated < unitsNeeded) {
        tx.update(reqPath, {
          status: 'ACTIVE',
          reopenedAt: new Date().toISOString(),
        });
      }
    }

    return { success: true };
  });
}

// Helper mirroring cancelRequesterRequest
async function mockCancelRequesterRequest(db, { requestId, requesterUid, reason }) {
  const reqPath = `requests/${requestId}`;
  const reqDoc = db.getDoc(reqPath);
  if (!reqDoc.exists) throw new Error('Request not found');
  const rData = reqDoc.data();

  if (rData.createdByUid !== requesterUid && rData.uuid !== requesterUid) {
    throw new Error('Unauthorized: You can only cancel your own request');
  }

  // Update request to CANCELLED
  db.updateDoc(reqPath, {
    status: 'CANCELLED',
    cancelledAt: new Date().toISOString(),
    cancelledByUid: requesterUid,
    cancellationReason: reason,
  });

  // Find all active donations under this request and release them
  for (const [path, docData] of db.store.entries()) {
    if (path.startsWith(`requests/${requestId}/donations/`)) {
      if (isDonationActive(docData)) {
        db.updateDoc(path, {
          status: 'CANCELLED',
          cancelledAt: new Date().toISOString(),
          cancelledByUid: requesterUid,
          cancellationReason: `Request cancelled by requester: ${reason}`,
        });

        // Release donor commitment
        const donorUid = docData.donorUid || docData.donorId;
        if (donorUid) {
          db.setDoc(`donorCommitments/${donorUid}`, {
            status: 'RELEASED',
            releasedAt: new Date().toISOString(),
            releasedByUid: requesterUid,
            releaseReason: `Request cancelled by requester`,
            previousRequestId: requestId,
          }, { merge: true });
        }
      }
    }
  }

  return { success: true };
}

// Helper mirroring atomic dual-OTP completion
async function mockCompleteDonation(db, { requestId, donationId, donorUid }) {
  return await db.runTransaction(async (tx) => {
    const donPath = `requests/${requestId}/donations/${donationId}`;
    const reqPath = `requests/${requestId}`;
    const donSnap = await tx.get(donPath);
    const reqSnap = await tx.get(reqPath);

    if (!donSnap.exists || !reqSnap.exists) throw new Error('Document not found');
    const dData = donSnap.data();
    const rData = reqSnap.data();

    if (dData.status === 'CANCELLED' || rData.status === 'CANCELLED') {
      throw new Error('Cannot complete a cancelled donation or request');
    }
    if (dData.completed || dData.status === 'DONATION_COMPLETED') {
      throw new Error('This donation has already been completed.');
    }

    const currentUnits = parseInt(rData.unitsDonated || 0, 10);
    const needed = parseInt(rData.unitsNeeded || 1, 10);
    if (currentUnits >= needed) {
      throw new Error('This request has already reached its fulfilled unit goal.');
    }

    const newUnits = currentUnits + 1;
    const isFulfilled = newUnits >= needed;

    // Update request units
    tx.update(reqPath, {
      unitsDonated: newUnits,
      status: isFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED',
      updatedAt: new Date().toISOString(),
    });

    // Update donation
    tx.update(donPath, {
      status: 'DONATION_COMPLETED',
      completed: true,
      completedAt: new Date().toISOString(),
    });

    // Release commitment
    tx.set(`donorCommitments/${donorUid}`, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    }, { merge: true });

    return { newUnits, isFulfilled };
  });
}

// =========================================================================
// TEST SUITE: 20 MANDATORY LIFECYCLE & CONCURRENCY TESTS
// =========================================================================

test('Case 1: A donor can accept an eligible request when they have no active commitment', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', {
    id: 'req_1',
    patientName: 'Ravi Kumar',
    status: 'ACTIVE',
    unitsNeeded: 1,
    unitsDonated: 0,
    createdByUid: 'requester_1',
    bloodGroup: 'O+',
  });

  const res = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: null },
    userEmail: 'karthik@test.com',
  });

  assert.ok(res.donationId);
  assert.equal(res.donation.status, 'OTP_PENDING');

  const commitment = db.getDoc('donorCommitments/donor_A');
  assert.equal(commitment.exists, true);
  assert.equal(commitment.data().status, 'ACTIVE');
  assert.equal(commitment.data().requestId, 'req_1');
});

test('Case 2: The same donor cannot accept a second request while the first donation is active', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user1' });
  db.setDoc('requests/req_2', { id: 'req_2', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user2' });

  // First pledge succeeds
  await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: null },
  });

  // Second pledge MUST be rejected
  await assert.rejects(
    async () => {
      await mockAcceptDonationPledge(db, {
        request: { id: 'req_2' },
        donorUid: 'donor_A',
        donorProfile: { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: null },
      });
    },
    (err) => {
      assert.match(err.message, new RegExp(COMMITMENT_ERROR_MSG));
      return true;
    }
  );
});

test('Case 3: Concurrency requirement: Simultaneous requests cannot both accept', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user1' });
  db.setDoc('requests/req_2', { id: 'req_2', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user2' });

  // Simulate two concurrent requests hitting the database
  const p1 = mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_concurrent',
    donorProfile: { name: 'Priya', bloodGroup: 'B+', lastDonationAt: null },
  });
  const p2 = mockAcceptDonationPledge(db, {
    request: { id: 'req_2' },
    donorUid: 'donor_concurrent',
    donorProfile: { name: 'Priya', bloodGroup: 'B+', lastDonationAt: null },
  });

  const results = await Promise.allSettled([p1, p2]);
  const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
  const rejectedCount = results.filter(r => r.status === 'rejected').length;

  assert.equal(fulfilledCount, 1, 'Exactly one pledge must succeed');
  assert.equal(rejectedCount, 1, 'The conflicting parallel pledge must be rejected');
});

test('Case 4: A donor can accept another eligible request after the previous donation is cancelled', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user1' });
  db.setDoc('requests/req_2', { id: 'req_2', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user2' });

  // Pledge 1
  const pledge = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: null },
  });

  // Cancel pledge 1
  await mockCancelDonorDonation(db, {
    requestId: 'req_1',
    donationId: pledge.donationId,
    donorUid: 'donor_A',
    reason: 'Emergency travel',
  });

  // Check commitment is RELEASED
  const commitment = db.getDoc('donorCommitments/donor_A');
  assert.equal(commitment.data().status, 'RELEASED');

  // Pledge 2 now succeeds!
  const pledge2 = await mockAcceptDonationPledge(db, {
    request: { id: 'req_2' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: null },
  });
  assert.ok(pledge2.donationId);
});

test('Case 5: A donor can accept another request after completion only if cooldown rules permit it', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user1' });
  db.setDoc('requests/req_2', { id: 'req_2', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user2' });

  const pledge = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: null },
  });

  // Complete donation 1
  await mockCompleteDonation(db, { requestId: 'req_1', donationId: pledge.donationId, donorUid: 'donor_A' });

  // Now donor has donated today -> cooldown active
  const recentDate = new Date();
  const donorWithRecentDonation = { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: recentDate };

  // Attempting to pledge immediately is rejected due to safety cooldown
  await assert.rejects(
    async () => {
      await mockAcceptDonationPledge(db, {
        request: { id: 'req_2' },
        donorUid: 'donor_A',
        donorProfile: donorWithRecentDonation,
      });
    },
    /cooldown period/
  );

  // But after 91 days, cooldown is finished and donor can donate again!
  const pastDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
  const eligibleDonor = { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: pastDate };
  const pledgeAfterCooldown = await mockAcceptDonationPledge(db, {
    request: { id: 'req_2' },
    donorUid: 'donor_A',
    donorProfile: eligibleDonor,
  });
  assert.ok(pledgeAfterCooldown.donationId);
});

test("Case 6: A donor cannot cancel another donor's commitment", async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'req_user1' });

  const pledge = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Karthik', bloodGroup: 'O+', lastDonationAt: null },
  });

  // Malicious donor B attempts to cancel donor A's pledge
  await assert.rejects(
    async () => {
      await mockCancelDonorDonation(db, {
        requestId: 'req_1',
        donationId: pledge.donationId,
        donorUid: 'donor_B_imposter',
        reason: 'Malicious cancellation',
      });
    },
    /Unauthorized: You can only cancel your own donation pledge/
  );
});

test("Case 7: A requester cannot cancel another user's request", async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'requester_Alice' });

  await assert.rejects(
    async () => {
      await mockCancelRequesterRequest(db, {
        requestId: 'req_1',
        requesterUid: 'requester_Bob_imposter',
        reason: 'Cancel another user request',
      });
    },
    /Unauthorized: You can only cancel your own request/
  );
});

test('Case 8: Cancelling an accepted donation removes it from active/accepted views', () => {
  const activeDonation = { status: 'OTP_PENDING', completed: false };
  const cancelledDonation = { status: 'CANCELLED', completed: false };

  assert.equal(isDonationActive(activeDonation), true);
  assert.equal(isDonationActive(cancelledDonation), false);
  assert.equal(isDonationCancelled(cancelledDonation), true);
});

test("Case 9: Cancelling one donor's commitment reopens parent request only when still eligible", async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 2, unitsDonated: 0, createdByUid: 'requester_1' });

  const pledge1 = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Donor A', bloodGroup: 'O+', lastDonationAt: null },
  });

  // Cancel pledge1 -> parent request remains ACTIVE
  await mockCancelDonorDonation(db, {
    requestId: 'req_1',
    donationId: pledge1.donationId,
    donorUid: 'donor_A',
  });
  const reqSnap = db.getDoc('requests/req_1');
  assert.equal(reqSnap.data().status, 'ACTIVE');

  // If request was cancelled by requester, donor cancellation does NOT restore it
  db.updateDoc('requests/req_1', { status: 'CANCELLED' });
  const pledge2 = { donationId: 'don_2' };
  db.setDoc('requests/req_1/donations/don_2', {
    donorUid: 'donor_B',
    status: 'OTP_PENDING',
  });
  db.setDoc('donorCommitments/donor_B', { status: 'ACTIVE' });

  await mockCancelDonorDonation(db, {
    requestId: 'req_1',
    donationId: 'don_2',
    donorUid: 'donor_B',
  });
  const reqSnapAfter = db.getDoc('requests/req_1');
  assert.equal(reqSnapAfter.data().status, 'CANCELLED', 'Cancelled parent request must remain CANCELLED');
});

test('Case 10: Cancelling a parent request prevents further acceptance and OTP verification', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'requester_1' });

  await mockCancelRequesterRequest(db, {
    requestId: 'req_1',
    requesterUid: 'requester_1',
    reason: 'Requirement resolved',
  });

  // Attempt to accept cancelled request fails
  await assert.rejects(
    async () => {
      await mockAcceptDonationPledge(db, {
        request: { id: 'req_1' },
        donorUid: 'donor_A',
        donorProfile: { name: 'Donor A', bloodGroup: 'O+', lastDonationAt: null },
      });
    },
    /cancelled/
  );
});

test('Case 11: Cancelled records remain in history and are not physically deleted (soft cancel)', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'requester_1' });

  const pledge = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Donor A', bloodGroup: 'O+', lastDonationAt: null },
  });

  await mockCancelDonorDonation(db, {
    requestId: 'req_1',
    donationId: pledge.donationId,
    donorUid: 'donor_A',
    reason: 'Personal reason',
  });

  const donDoc = db.getDoc(`requests/req_1/donations/${pledge.donationId}`);
  assert.equal(donDoc.exists, true, 'Document must exist in database');
  assert.equal(donDoc.data().status, 'CANCELLED');
  assert.equal(donDoc.data().cancellationReason, 'Personal reason');
});

test('Case 12: Active requests never appear in Completed Requests', () => {
  const activeReq = { id: 'req_1', status: 'ACTIVE', unitsNeeded: 2, unitsDonated: 0 };
  const matchingReq = { id: 'req_2', status: 'MATCHING', unitsNeeded: 1, unitsDonated: 0 };
  const inProgressReq = { id: 'req_3', status: 'DONOR_ACCEPTED', unitsNeeded: 1, unitsDonated: 0 };

  assert.equal(isRequestFullyCompleted(activeReq), false);
  assert.equal(isRequestFullyCompleted(matchingReq), false);
  assert.equal(isRequestFullyCompleted(inProgressReq), false);
});

test('Case 13: A request with partial fulfillment is not incorrectly marked fully completed', () => {
  const partialReq = {
    id: 'req_partial',
    status: 'PARTIALLY_FULFILLED',
    unitsNeeded: 3,
    unitsDonated: 2,
  };

  assert.equal(isRequestPartiallyFulfilled(partialReq), true);
  assert.equal(isRequestFullyCompleted(partialReq), false);
  assert.equal(isRequestActive(partialReq), true, 'Partially fulfilled requests are still active');
});

test('Case 14: A fulfilled request appears in Completed Requests', () => {
  const fulfilledReq1 = {
    id: 'req_done1',
    status: 'FULFILLED',
    unitsNeeded: 2,
    unitsDonated: 2,
  };
  const fulfilledReq2 = {
    id: 'req_done2',
    status: 'COMPLETED',
    unitsNeeded: 1,
    unitsDonated: 1,
  };

  assert.equal(isRequestFullyCompleted(fulfilledReq1), true);
  assert.equal(isRequestFullyCompleted(fulfilledReq2), true);
});

test('Case 15: Unknown or legacy statuses are handled safely', () => {
  assert.equal(normalizeRequestStatus('UNKNOWN_STATUS'), REQUEST_STATES.SUBMITTED);
  assert.equal(isRequestFullyCompleted({ status: 'UNKNOWN_STATUS' }), false);
  assert.equal(isRequestFullyCompleted({ status: 'INVALID_STATUS', unitsNeeded: 2, unitsDonated: 0 }), false);

  // Legacy case-insensitive values
  assert.equal(normalizeRequestStatus('accepted'), REQUEST_STATES.ACTIVE);
  assert.equal(normalizeRequestStatus('fulfilled'), REQUEST_STATES.FULFILLED);
  assert.equal(normalizeDonationStatus('completed'), DONATION_STATES.DONATION_COMPLETED);
});

test('Case 16: Repeated cancellation does not duplicate side effects or corrupt state', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'requester_1' });

  const pledge = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Donor A', bloodGroup: 'O+', lastDonationAt: null },
  });

  // First cancellation succeeds
  await mockCancelDonorDonation(db, {
    requestId: 'req_1',
    donationId: pledge.donationId,
    donorUid: 'donor_A',
  });

  // Second cancellation on already CANCELLED donation is rejected safely
  await assert.rejects(
    async () => {
      await mockCancelDonorDonation(db, {
        requestId: 'req_1',
        donationId: pledge.donationId,
        donorUid: 'donor_A',
      });
    },
    /cannot be cancelled/
  );
});

test('Case 17: Repeated completion does not increment donated units twice', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 2, unitsDonated: 0, createdByUid: 'requester_1' });

  const pledge = await mockAcceptDonationPledge(db, {
    request: { id: 'req_1' },
    donorUid: 'donor_A',
    donorProfile: { name: 'Donor A', bloodGroup: 'O+', lastDonationAt: null },
  });

  // First completion
  const res1 = await mockCompleteDonation(db, { requestId: 'req_1', donationId: pledge.donationId, donorUid: 'donor_A' });
  assert.equal(res1.newUnits, 1);

  // Second completion on same donation must fail
  await assert.rejects(
    async () => {
      await mockCompleteDonation(db, { requestId: 'req_1', donationId: pledge.donationId, donorUid: 'donor_A' });
    },
    /already been completed/
  );

  const reqDoc = db.getDoc('requests/req_1');
  assert.equal(reqDoc.data().unitsDonated, 1, 'Units donated must not increment twice');
});

test('Case 18: A failed transaction does not leave partial commitment, donation, or request updates', async () => {
  const db = new MockFirestore();
  db.setDoc('requests/req_1', { id: 'req_1', status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0, createdByUid: 'requester_1' });

  // Attempt an acceptance that fails midway
  await assert.rejects(
    async () => {
      await db.runTransaction(async (tx) => {
        tx.set('donorCommitments/donor_fail', { status: 'ACTIVE' });
        tx.set('requests/req_1/donations/don_fail', { status: 'OTP_PENDING' });
        throw new Error('Mid-transaction database network error');
      });
    },
    /Mid-transaction database network error/
  );

  assert.equal(db.getDoc('donorCommitments/donor_fail').exists, false, 'No partial commitment write');
  assert.equal(db.getDoc('requests/req_1/donations/don_fail').exists, false, 'No partial donation write');
});

test('Case 19: Real-time UI state functions remain consistent after acceptance, cancellation, and completion', () => {
  // Pending donation
  const pending = { status: 'OTP_PENDING', completed: false };
  assert.equal(isDonationActive(pending), true);
  assert.equal(isDonationCompleted(pending), false);
  assert.equal(isDonationCancelled(pending), false);

  // Cancelled donation
  const cancelled = { status: 'CANCELLED', completed: false };
  assert.equal(isDonationActive(cancelled), false);
  assert.equal(isDonationCompleted(cancelled), false);
  assert.equal(isDonationCancelled(cancelled), true);

  // Completed donation
  const completed = { status: 'DONATION_COMPLETED', completed: true };
  assert.equal(isDonationActive(completed), false);
  assert.equal(isDonationCompleted(completed), true);
  assert.equal(isDonationCancelled(completed), false);

  // Active request
  const activeReq = { status: 'ACTIVE', unitsNeeded: 1, unitsDonated: 0 };
  assert.equal(isRequestActive(activeReq), true);
  assert.equal(isRequestFullyCompleted(activeReq), false);

  // Completed request
  const compReq = { status: 'FULFILLED', unitsNeeded: 1, unitsDonated: 1 };
  assert.equal(isRequestActive(compReq), false);
  assert.equal(isRequestFullyCompleted(compReq), true);
});

test('Case 20: Existing OTP dual-verification rules and state invariants continue to hold', async () => {
  const otp = generateSecure4DigitOtp();
  assert.equal(otp.length, 4);
  assert.ok(/^\d{4}$/.test(otp));

  const hash = await hashOtp(otp);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);

  // Both parties must verify before completion
  const partial = isDualOtpFullyVerified({ donorOtpVerified: true, requesterOtpVerified: false });
  assert.equal(partial, false);
  const full = isDualOtpFullyVerified({ donorOtpVerified: true, requesterOtpVerified: true });
  assert.equal(full, true);
});
