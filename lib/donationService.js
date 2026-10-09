/**
 * KURUDHI KODAI — Unified Donation Lifecycle & Concurrency Service
 *
 * Guarantees:
 * - One active donation per donor enforced atomically via Firestore transactions
 * - Deterministic, non-leaking cancellation and release of commitments
 * - Request reopening only when eligible units are still needed
 * - Soft cancellation preserving historical audit records
 */

import {
  doc,
  getDoc,
  getDocs,
  collection,
  collectionGroup,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';
import {
  DONATION_STATES,
  ACTIVE_DONATION_STATES,
  isDonationActive,
  isDonationCompleted,
  isDonationCancelled,
  normalizeDonationStatus,
} from './donationStateMachine.js';
import {
  REQUEST_STATES,
  isRequestAcceptingDonors,
  isRequestFullyCompleted,
  isRequestCancelled,
  normalizeRequestStatus,
} from './requestStateMachine.js';
import { isBloodGroupCompatible } from './bloodCompatibility.js';
import { calculateDonorCooldown } from './matchingEngine.js';
import {
  generateSecure4DigitOtp,
  hashOtp,
  saveRetainedOtp,
  clearRetainedOtp,
  OTP_EXPIRY_MINUTES,
  MAX_OTP_ATTEMPTS,
} from './otpService.js';
import { sendNotification, NOTIFICATION_TYPES } from './notifications.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditLogger.js';

export const COMMITMENT_ERROR_MSG =
  'You already have an active donation commitment. Complete or cancel it before accepting another request.';

/**
 * Checks whether a donor currently possesses an active donation commitment.
 * Inspects authoritative donorCommitments/{donorUid} and performs safe legacy check.
 *
 * @param {string} donorUid
 * @returns {Promise<{ hasActiveCommitment: boolean, commitment: object | null }>}
 */
export async function getActiveDonorCommitment(donorUid) {
  if (!donorUid) return { hasActiveCommitment: false, commitment: null };

  try {
    const commitmentRef = doc(db, 'donorCommitments', donorUid);
    const commitmentSnap = await getDoc(commitmentRef);

    if (commitmentSnap.exists()) {
      const data = commitmentSnap.data();
      if (data.status === 'ACTIVE' && data.activeDonationId) {
        return { hasActiveCommitment: true, commitment: data };
      }
    }

    // Compatibility check: Scan existing nonterminal donations to protect against unmigrated records
    try {
      const donGroup = collectionGroup(db, 'donations');
      const q = query(donGroup, where('donorId', '==', donorUid));
      const snap = await getDocs(q);

      const legacyActive = snap.docs.find((d) => {
        const item = d.data();
        return isDonationActive(item);
      });

      if (legacyActive) {
        const item = legacyActive.data();
        const activeData = {
          donorUid,
          activeDonationId: legacyActive.id,
          requestId: item.requestId || legacyActive.ref.parent.parent?.id,
          status: 'ACTIVE',
        };
        return { hasActiveCommitment: true, commitment: activeData };
      }
    } catch (_) {
      // If collectionGroup query requires an index or is restricted, fallback safely
    }

    return { hasActiveCommitment: false, commitment: null };
  } catch (err) {
    console.warn('Error checking donor active commitment:', err);
    return { hasActiveCommitment: false, commitment: null };
  }
}

/**
 * Atomically pledges to an open blood request.
 * Enforces all 8 acceptance business rules under a strict Firestore transaction.
 *
 * @param {object} params
 * @param {object} params.request - Blood request document
 * @param {object} params.user - Authenticated Firebase user
 * @param {object} params.donorProfile - Registered donor profile
 * @returns {Promise<{ success: boolean, donationId: string, donationData: object }>}
 */
export async function acceptDonationPledge({ request, user, donorProfile }) {
  if (!user?.uid) {
    throw new Error('Authentication required to pledge a blood donation.');
  }
  if (!request?.id) {
    throw new Error('Valid blood request required.');
  }
  if (!donorProfile) {
    throw new Error('Registered donor profile required.');
  }

  // 1. Eligibility & Cooldown verification
  const { isEligible, remainingDays } = calculateDonorCooldown(
    donorProfile.lastDonationAt || donorProfile.lastDonationDate
  );
  if (!isEligible) {
    throw new Error(`You are currently in donation cooldown for ${remainingDays} more day(s).`);
  }

  // 2. Requester check
  const reqCreatorUid = request.createdByUid || request.uuid;
  if (reqCreatorUid && reqCreatorUid === user.uid) {
    throw new Error('Requesters cannot donate blood to their own request.');
  }

  // 3. Compatibility check
  const donorBlood = donorProfile.bloodGroup || donorProfile.BloodGroup;
  const reqBlood = request.bloodGroup || request.BloodGroup;
  const anyAcc = request.anyBloodGroupAccepted || request.AnyBloodGroupAccepted || false;
  if (!donorBlood || !isBloodGroupCompatible(donorBlood, reqBlood, anyAcc)) {
    throw new Error(`Your blood group (${donorBlood}) is not compatible with patient requirement (${reqBlood}).`);
  }

  // 4. Pre-flight active commitment check
  const { hasActiveCommitment } = await getActiveDonorCommitment(user.uid);
  if (hasActiveCommitment) {
    throw new Error(COMMITMENT_ERROR_MSG);
  }

  // 5. Generate secure 4-digit verbal OTP & SHA-256 hash
  const rawDonorOtp = generateSecure4DigitOtp();
  const donorOtpHash = await hashOtp(rawDonorOtp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const reqRef = doc(db, 'requests', request.id);
  const commitmentRef = doc(db, 'donorCommitments', user.uid);
  const donCol = collection(db, 'requests', request.id, 'donations');
  const donRef = doc(donCol);

  const donationData = {
    requestId: request.id,
    requesterUid: reqCreatorUid || null,
    donorId: user.uid,
    donorUid: user.uid,
    donorEmail: user.email || '',
    donorName: donorProfile.name || donorProfile.Name || 'Anonymous Donor',
    donorBloodGroup: donorBlood,
    donorOtpHash,
    donorOtpExpiresAt: expiresAt,
    donorOtpAttemptsRemaining: MAX_OTP_ATTEMPTS,
    donorOtpVerified: false,
    requesterOtpVerified: false,
    completed: false,
    status: DONATION_STATES.OTP_PENDING,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 6. Execute Atomic Concurrency Transaction
  await runTransaction(db, async (tx) => {
    const [reqSnap, commitmentSnap] = await Promise.all([
      tx.get(reqRef),
      tx.get(commitmentRef),
    ]);

    if (!reqSnap.exists()) {
      throw new Error('Blood request no longer exists.');
    }
    const rData = reqSnap.data();

    // Verify request is active and open
    if (!isRequestAcceptingDonors(rData)) {
      throw new Error('This blood request is no longer accepting donations.');
    }

    const unitsNeeded = parseInt(rData.unitsNeeded || rData.UnitsNeeded || 1, 10);
    const unitsDonated = parseInt(rData.unitsDonated || rData.UnitsDonated || 0, 10);
    if (unitsDonated >= unitsNeeded) {
      throw new Error('This blood request has already reached its fulfilled unit goal.');
    }

    // Verify atomic concurrency commitment
    if (commitmentSnap.exists()) {
      const cData = commitmentSnap.data();
      if (cData.status === 'ACTIVE' && cData.activeDonationId) {
        throw new Error(COMMITMENT_ERROR_MSG);
      }
    }

    // Establish donation and commitment atomically
    tx.set(donRef, donationData);
    tx.set(commitmentRef, {
      donorUid: user.uid,
      activeDonationId: donRef.id,
      requestId: request.id,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Advance request state to MATCHING if previously ACTIVE/SUBMITTED
    const curStatus = normalizeRequestStatus(rData.status || rData.Verified);
    if (curStatus === REQUEST_STATES.ACTIVE || curStatus === REQUEST_STATES.SUBMITTED) {
      tx.update(reqRef, {
        status: REQUEST_STATES.MATCHING,
        updatedAt: serverTimestamp(),
      });
    }
  });

  // Retain plaintext code in session storage for current user
  saveRetainedOtp(user.uid, donRef.id, 'DONOR', rawDonorOtp, OTP_EXPIRY_MINUTES);

  // In-app notification to requester
  if (reqCreatorUid) {
    sendNotification({
      recipientUid: reqCreatorUid,
      type: NOTIFICATION_TYPES.DONOR_ACCEPTED,
      title: 'Donor Matched for Your Request!',
      message: `${donorProfile.name || 'A donor'} has pledged to donate ${donorBlood} blood for ${request.patientName || request.PatientName}.`,
      requestId: request.id,
      donationId: donRef.id,
    }).catch(() => {});
  }

  // Audit logging
  logAuditEvent({
    action: AUDIT_ACTIONS.DONOR_ACCEPTED,
    actorUid: user.uid,
    entityType: 'donation',
    entityId: donRef.id,
    metadata: { requestId: request.id },
  }).catch(() => {});

  return {
    success: true,
    donationId: donRef.id,
    donationData: { id: donRef.id, ...donationData },
  };
}

/**
 * Cancels a donor's accepted pledge reliably and releases active commitment atomically.
 * If the parent request still needs units, reopens it for other donors.
 *
 * @param {object} params
 * @param {string} params.requestId
 * @param {string} params.donationId
 * @param {string} params.donorUid
 * @param {string} [params.reason]
 */
export async function cancelDonorDonation({ requestId, donationId, donorUid, reason = 'Cancelled by donor' }) {
  if (!requestId || !donationId || !donorUid) {
    throw new Error('Missing parameters required for donation cancellation.');
  }

  const reqRef = doc(db, 'requests', requestId);
  const donRef = doc(db, 'requests', requestId, 'donations', donationId);
  const commitmentRef = doc(db, 'donorCommitments', donorUid);

  let recipientUidToNotify = null;
  let patientName = 'patient';

  await runTransaction(db, async (tx) => {
    const [donSnap, reqSnap, commitmentSnap] = await Promise.all([
      tx.get(donRef),
      tx.get(reqRef),
      tx.get(commitmentRef),
    ]);

    if (!donSnap.exists()) {
      throw new Error('Donation record not found.');
    }
    const dData = donSnap.data();

    // Verify authorized actor
    if (dData.donorUid !== donorUid && dData.donorId !== donorUid) {
      throw new Error('Unauthorized: You are not the assigned donor for this pledge.');
    }

    // Verify cancellable state
    if (dData.completed === true || normalizeDonationStatus(dData.status) === DONATION_STATES.DONATION_COMPLETED) {
      throw new Error('Completed donations cannot be cancelled.');
    }
    if (normalizeDonationStatus(dData.status) === DONATION_STATES.CANCELLED) {
      return; // Idempotent
    }

    // 1. Mark donation CANCELLED with audit metadata
    tx.update(donRef, {
      status: DONATION_STATES.CANCELLED,
      cancelledByUid: donorUid,
      cancelledBy: donorUid,
      cancellationReason: reason.trim(),
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Release active commitment
    if (commitmentSnap.exists()) {
      tx.update(commitmentRef, {
        status: 'CANCELLED',
        activeDonationId: null,
        releasedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 3. Reopen blood request if eligible and units are still needed
    if (reqSnap.exists()) {
      const rData = reqSnap.data();
      recipientUidToNotify = rData.createdByUid || rData.uuid;
      patientName = rData.patientName || rData.PatientName || 'patient';

      const unitsNeeded = parseInt(rData.unitsNeeded || rData.UnitsNeeded || 1, 10);
      const unitsDonated = parseInt(rData.unitsDonated || rData.UnitsDonated || 0, 10);
      const curReqStatus = normalizeRequestStatus(rData.status || rData.Verified);

      if (
        curReqStatus !== REQUEST_STATES.CANCELLED &&
        curReqStatus !== REQUEST_STATES.REJECTED &&
        curReqStatus !== REQUEST_STATES.EXPIRED &&
        curReqStatus !== REQUEST_STATES.FULFILLED &&
        unitsDonated < unitsNeeded
      ) {
        const reopenedStatus = unitsDonated > 0 ? REQUEST_STATES.PARTIALLY_FULFILLED : REQUEST_STATES.ACTIVE;
        tx.update(reqRef, {
          status: reopenedStatus,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });

  // Clear session storage retention
  clearRetainedOtp(donorUid, donationId, 'DONOR');

  // Notify requester
  if (recipientUidToNotify) {
    sendNotification({
      recipientUid: recipientUidToNotify,
      type: NOTIFICATION_TYPES.DONATION_CANCELLED,
      title: 'Donor Pledge Cancelled',
      message: `A donor has cancelled their pledge for ${patientName}. Your request has been reopened for local donors.`,
      requestId,
      donationId,
    }).catch(() => {});
  }

  // Audit logging
  logAuditEvent({
    action: AUDIT_ACTIONS.DONATION_CANCELLED,
    actorUid: donorUid,
    entityType: 'donation',
    entityId: donationId,
    metadata: { requestId, reason },
  }).catch(() => {});

  return { success: true };
}

/**
 * Cancels a blood request by its requester.
 * Atomically marks the parent request CANCELLED, cancels all active donations,
 * and releases affected donors' active commitments.
 *
 * @param {object} params
 * @param {string} params.requestId
 * @param {string} params.requesterUid
 * @param {string} [params.reason]
 */
export async function cancelRequesterRequest({ requestId, requesterUid, reason = 'Cancelled by requester' }) {
  if (!requestId || !requesterUid) {
    throw new Error('Missing parameters required to cancel request.');
  }

  const reqRef = doc(db, 'requests', requestId);
  const donCol = collection(db, 'requests', requestId, 'donations');

  const [reqSnap, donSnap] = await Promise.all([
    getDoc(reqRef),
    getDocs(donCol),
  ]);

  if (!reqSnap.exists()) {
    throw new Error('Blood request not found.');
  }
  const rData = reqSnap.data();

  // Verify ownership
  if (rData.createdByUid !== requesterUid && rData.uuid !== requesterUid) {
    throw new Error('Unauthorized: Only the creator of the request can cancel it.');
  }

  if (normalizeRequestStatus(rData.status || rData.Verified) === REQUEST_STATES.CANCELLED) {
    return { success: true }; // Idempotent
  }

  const affectedDonors = [];

  await runTransaction(db, async (tx) => {
    // 1. Cancel request
    tx.update(reqRef, {
      status: REQUEST_STATES.CANCELLED,
      cancelledByUid: requesterUid,
      cancellationReason: reason.trim(),
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Cancel all in-progress donations & release commitments
    for (const dDoc of donSnap.docs) {
      const d = dDoc.data();
      if (isDonationActive(d)) {
        tx.update(dDoc.ref, {
          status: DONATION_STATES.CANCELLED,
          cancelledByUid: requesterUid,
          cancellationReason: `Request cancelled by requester: ${reason.trim()}`,
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const donorUid = d.donorUid || d.donorId;
        if (donorUid) {
          affectedDonors.push({ donorUid, donationId: dDoc.id });
          const commitmentRef = doc(db, 'donorCommitments', donorUid);
          tx.set(
            commitmentRef,
            {
              status: 'CANCELLED',
              activeDonationId: null,
              releasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    }
  });

  // Notify affected donors
  for (const item of affectedDonors) {
    sendNotification({
      recipientUid: item.donorUid,
      type: NOTIFICATION_TYPES.REQUEST_CANCELLED,
      title: 'Blood Request Cancelled',
      message: `The blood request for ${rData.patientName || 'patient'} has been cancelled by the requester. Your commitment has been released.`,
      requestId,
      donationId: item.donationId,
    }).catch(() => {});
  }

  // Audit logging
  logAuditEvent({
    action: AUDIT_ACTIONS.REQUEST_CANCELLED,
    actorUid: requesterUid,
    entityType: 'request',
    entityId: requestId,
    metadata: { reason },
  }).catch(() => {});

  return { success: true };
}

/**
 * Releases donor commitment upon successful completion
 * @param {string} donorUid
 */
export async function releaseDonorCommitmentOnCompletion(donorUid) {
  if (!donorUid) return;
  try {
    const commitmentRef = doc(db, 'donorCommitments', donorUid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(commitmentRef);
      if (snap.exists()) {
        tx.update(commitmentRef, {
          status: 'COMPLETED',
          activeDonationId: null,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (e) {
    console.warn('Notice releasing commitment on completion:', e);
  }
}
