import { NextResponse } from 'next/server';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hashOtp, generateSecure4DigitOtp, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS } from '@/lib/otpService';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { sendNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import { DONATION_STATES } from '@/lib/donationStateMachine';
import { REQUEST_STATES } from '@/lib/requestStateMachine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/donations/otp
 *
 * Actions:
 * 1. 'generate-donor-otp': Donor generates their verbal 4-digit code.
 *    Stores only SHA-256 hash in Firestore. Returns plaintext code ONLY to donor.
 *
 * 2. 'generate-requester-otp': Requester generates their verbal 4-digit code.
 *    Stores only SHA-256 hash in Firestore. Returns plaintext code ONLY to requester.
 *
 * 3. 'verify-counterparty-otp': Either party submits the counterparty's 4-digit code.
 *    Verifies against stored hash, decrements attempts, checks 10-minute expiry.
 *    When verified, atomically completes the donation and increments request units.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { action, requestId, donationId, userUid, otp } = body;

    if (!action || !requestId || !donationId || !userUid) {
      return NextResponse.json(
        { error: 'Missing required parameters (action, requestId, donationId, userUid)' },
        { status: 400 }
      );
    }

    const donationRef = doc(db, 'requests', requestId, 'donations', donationId);
    const donationSnap = await getDoc(donationRef);

    if (!donationSnap.exists()) {
      return NextResponse.json({ error: 'Donation record not found' }, { status: 404 });
    }

    const donationData = donationSnap.data();
    const isDonor = donationData.donorUid === userUid || donationData.donorId === userUid;
    const isRequester = donationData.requesterUid === userUid;

    // Fetch request document
    const requestRef = doc(db, 'requests', requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) {
      return NextResponse.json({ error: 'Blood request not found' }, { status: 404 });
    }
    const requestData = requestSnap.data();

    // Verify user authorization for this interaction
    const isActualRequester = isRequester || requestData.createdByUid === userUid || requestData.uuid === userUid;
    if (!isDonor && !isActualRequester) {
      return NextResponse.json({ error: 'Unauthorized: You are not a party to this donation' }, { status: 403 });
    }

    // -------------------------------------------------------------
    // ACTION 1: GENERATE DONOR OTP (Plaintext returned only to Donor)
    // -------------------------------------------------------------
    if (action === 'generate-donor-otp') {
      if (!isDonor) {
        return NextResponse.json({ error: 'Only the donor may generate the donor OTP' }, { status: 403 });
      }

      const rawDonorOtp = generateSecure4DigitOtp();
      const donorOtpHash = await hashOtp(rawDonorOtp);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await updateDoc(donationRef, {
        donorOtpHash,
        donorOtpExpiresAt: expiresAt,
        donorOtpAttemptsRemaining: MAX_OTP_ATTEMPTS,
        donorOtpVerified: false,
        status: DONATION_STATES.OTP_PENDING,
        updatedAt: serverTimestamp(),
      });

      return NextResponse.json({
        success: true,
        message: 'Donor OTP generated successfully. Speak this code to the requester upon arrival.',
        donorOtp: rawDonorOtp, // Plaintext delivered ONLY in memory/response to the donor
        expiresAt,
      });
    }

    // -----------------------------------------------------------------
    // ACTION 2: GENERATE REQUESTER OTP (Plaintext returned only to Requester)
    // -----------------------------------------------------------------
    if (action === 'generate-requester-otp') {
      if (!isActualRequester) {
        return NextResponse.json({ error: 'Only the requester may generate the requester OTP' }, { status: 403 });
      }

      const rawRequesterOtp = generateSecure4DigitOtp();
      const requesterOtpHash = await hashOtp(rawRequesterOtp);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await updateDoc(donationRef, {
        requesterOtpHash,
        requesterOtpExpiresAt: expiresAt,
        requesterOtpAttemptsRemaining: MAX_OTP_ATTEMPTS,
        requesterOtpVerified: false,
        status: DONATION_STATES.OTP_PENDING,
        updatedAt: serverTimestamp(),
      });

      return NextResponse.json({
        success: true,
        message: 'Requester OTP generated successfully. Speak this code to the donor upon receipt.',
        requesterOtp: rawRequesterOtp, // Plaintext delivered ONLY in memory/response to the requester
        expiresAt,
      });
    }

    // -----------------------------------------------------------------
    // ACTION 3: VERIFY COUNTERPARTY OTP (Server-Side Secure Hash Check)
    // -----------------------------------------------------------------
    if (action === 'verify-counterparty-otp') {
      if (!otp || typeof otp !== 'string' || !/^\d{4}$/.test(otp.trim())) {
        return NextResponse.json({ error: 'OTP must be exactly 4 digits' }, { status: 400 });
      }

      const cleanOtp = otp.trim();
      const inputHash = await hashOtp(cleanOtp);
      const now = Date.now();

      // Case A: Requester is verifying the Donor's verbal OTP
      if (isActualRequester) {
        const storedHash = donationData.donorOtpHash;
        const rawExpiry = donationData.donorOtpExpiresAt || donationData.expiresAt;
        const expiryTime = rawExpiry?.toDate ? rawExpiry.toDate().getTime() : (rawExpiry instanceof Date ? rawExpiry.getTime() : new Date(rawExpiry).getTime());
        const attemptsRemaining = donationData.donorOtpAttemptsRemaining ?? MAX_OTP_ATTEMPTS;

        if (!storedHash) {
          return NextResponse.json({ error: 'The donor has not generated their 4-digit code yet.' }, { status: 400 });
        }

        if (attemptsRemaining <= 0) {
          return NextResponse.json({ error: 'Maximum attempts exceeded. Please ask donor to regenerate the code.' }, { status: 429 });
        }

        if (now > expiryTime) {
          return NextResponse.json({ error: 'Code has expired (10 minutes). Please ask donor to regenerate.' }, { status: 410 });
        }

        if (inputHash !== storedHash) {
          const newRemaining = Math.max(0, attemptsRemaining - 1);
          await updateDoc(donationRef, { donorOtpAttemptsRemaining: newRemaining, updatedAt: serverTimestamp() });
          return NextResponse.json({
            error: `Incorrect code. ${newRemaining} attempt${newRemaining === 1 ? '' : 's'} remaining.`,
            attemptsRemaining: newRemaining,
          }, { status: 400 });
        }

        // MATCH CONFIRMED! Complete the transaction atomically
        return await executeAtomicDonationCompletion({
          requestRef,
          donationRef,
          requestId,
          donationId,
          verifiedRole: 'REQUESTER',
          donorUid: donationData.donorUid || donationData.donorId,
          userUid,
        });
      }

      // Case B: Donor is verifying the Requester's verbal OTP
      if (isDonor) {
        const storedHash = donationData.requesterOtpHash;
        const rawExpiry = donationData.requesterOtpExpiresAt || donationData.expiresAt;
        const expiryTime = rawExpiry?.toDate ? rawExpiry.toDate().getTime() : (rawExpiry instanceof Date ? rawExpiry.getTime() : new Date(rawExpiry).getTime());
        const attemptsRemaining = donationData.requesterOtpAttemptsRemaining ?? MAX_OTP_ATTEMPTS;

        if (!storedHash) {
          return NextResponse.json({ error: 'The requester has not generated their confirmation code yet.' }, { status: 400 });
        }

        if (attemptsRemaining <= 0) {
          return NextResponse.json({ error: 'Maximum attempts exceeded. Please ask requester to regenerate.' }, { status: 429 });
        }

        if (now > expiryTime) {
          return NextResponse.json({ error: 'Code has expired (10 minutes). Please ask requester to regenerate.' }, { status: 410 });
        }

        if (inputHash !== storedHash) {
          const newRemaining = Math.max(0, attemptsRemaining - 1);
          await updateDoc(donationRef, { requesterOtpAttemptsRemaining: newRemaining, updatedAt: serverTimestamp() });
          return NextResponse.json({
            error: `Incorrect code. ${newRemaining} attempt${newRemaining === 1 ? '' : 's'} remaining.`,
            attemptsRemaining: newRemaining,
          }, { status: 400 });
        }

        // MATCH CONFIRMED! Complete the transaction atomically
        return await executeAtomicDonationCompletion({
          requestRef,
          donationRef,
          requestId,
          donationId,
          verifiedRole: 'DONOR',
          donorUid: userUid,
          userUid,
        });
      }
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    console.error('API /api/donations/otp notice:', error);
    const isPermissionError = error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions');
    return NextResponse.json({
      error: isPermissionError
        ? 'Client must perform OTP generation and verification directly via authenticated Firebase session.'
        : (error.message || 'Internal server error')
    }, { status: isPermissionError ? 403 : 500 });
  }
}

/**
 * Executes the atomic transaction guaranteeing unitsDonated <= unitsNeeded
 */
async function executeAtomicDonationCompletion({
  requestRef,
  donationRef,
  requestId,
  donationId,
  verifiedRole,
  donorUid,
  userUid
}) {
  let isFulfilled = false;
  let finalDonated = 0;

  await runTransaction(db, async (tx) => {
    const reqSnap = await tx.get(requestRef);
    const donSnap = await tx.get(donationRef);

    if (!reqSnap.exists() || !donSnap.exists()) {
      throw new Error('Transaction aborted: target document does not exist.');
    }

    const rData = reqSnap.data();
    const dData = donSnap.data();

    // Prevent double completion
    if (dData.status === DONATION_STATES.DONATION_COMPLETED || dData.completed === true) {
      throw new Error('This donation has already been completed.');
    }

    const unitsNeeded = parseInt(rData.unitsNeeded || rData.UnitsNeeded || 1, 10);
    const currentDonated = parseInt(rData.unitsDonated || rData.UnitsDonated || 0, 10);

    if (currentDonated >= unitsNeeded) {
      throw new Error('This blood request is already completely fulfilled.');
    }

    finalDonated = currentDonated + 1;
    isFulfilled = finalDonated >= unitsNeeded;

    // 1. Atomically increment units & update request status
    tx.update(requestRef, {
      unitsDonated: finalDonated,
      UnitsDonated: finalDonated,
      status: isFulfilled ? REQUEST_STATES.FULFILLED : REQUEST_STATES.PARTIALLY_FULFILLED,
      Verified: isFulfilled ? 'completed' : 'accepted',
      updatedAt: serverTimestamp(),
    });

    // 2. Atomically mark donation as completed
    tx.update(donationRef, {
      status: DONATION_STATES.DONATION_COMPLETED,
      completed: true,
      completedAt: serverTimestamp(),
      verifiedByRole: verifiedRole,
      verifiedByUid: userUid,
      updatedAt: serverTimestamp(),
    });
  });

  // Post-transaction updates (cooldown, notifications, audit log)
  if (donorUid) {
    try {
      const donorRef = doc(db, 'donors', donorUid);
      await updateDoc(donorRef, {
        lastDonationAt: new Date().toISOString(),
        lastDonationDate: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
    } catch (_) {}
  }

  // Audit log
  await logAuditEvent({
    action: AUDIT_ACTIONS.DONATION_COMPLETED,
    actorUid: userUid,
    entityType: 'donation',
    entityId: donationId,
    metadata: { requestId, verifiedRole, finalDonated, isFulfilled },
  });

  return NextResponse.json({
    success: true,
    message: 'Donation successfully verified and completed!',
    status: DONATION_STATES.DONATION_COMPLETED,
    unitsDonated: finalDonated,
    isFulfilled,
  });
}
