"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateSecure4DigitOtp,
  hashOtp,
  verifyOtpAttempt,
  saveRetainedOtp,
  getRetainedOtp,
  clearRetainedOtp,
  getPartyOtpStatus,
  isDualOtpFullyVerified,
  OTP_EXPIRY_MINUTES,
  MAX_OTP_ATTEMPTS
} from '@/lib/otpService';
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { Button } from '@/components/ui/button';
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Sparkles,
  ArrowRight,
  HeartHandshake,
  Check
} from 'lucide-react';

/**
 * 4-Digit Numeric Input with Auto-Focus
 */
function OtpDigitsInput({ length = 4, value = "", onChange, disabled = false }) {
  const inputsRef = useRef([]);
  const digits = value.split("").concat(Array(length).fill("")).slice(0, length);

  const handleDigitChange = (e, idx) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw && raw !== "") return;
    const newDigits = [...digits];
    newDigits[idx] = raw.slice(-1);
    const combined = newDigits.join("");
    onChange(combined);

    if (raw && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 my-2">
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => (inputsRef.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          value={digits[idx] || ""}
          onChange={(e) => handleDigitChange(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          className={`w-11 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black rounded-xl border-2 transition-all outline-none ${
            digits[idx]
              ? 'border-red-600 bg-red-50/50 text-red-900 shadow-sm'
              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 focus:border-red-600 focus:ring-2 focus:ring-red-100'
          } ${disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed' : ''}`}
        />
      ))}
    </div>
  );
}

/**
 * Dual OTP Verification Lifecycle Component
 * Coordinates the 5-stage verification between Donor & Requester.
 */
export default function DualOtpVerification({
  donation,
  request,
  currentRole, // 'DONOR' or 'REQUESTER'
  currentUser,
  onCompleted,
  onStatusChange,
}) {
  const isDonorRole = currentRole === 'DONOR';
  const myParty = isDonorRole ? 'DONOR' : 'REQUESTER';
  const counterParty = isDonorRole ? 'REQUESTER' : 'DONOR';

  // Live donation state initialized from prop, kept synchronized in real time via onSnapshot
  const [liveDonation, setLiveDonation] = useState(donation || null);

  // Sync state if donation prop changes
  useEffect(() => {
    if (donation) {
      setLiveDonation(prev => ({ ...(prev || {}), ...donation }));
    }
  }, [donation]);

  const activeDonationId = donation?.id || liveDonation?.id;

  // Real-time Firestore document listener to ensure zero-lag synchronization between donor and requester
  useEffect(() => {
    if (!request?.id || !activeDonationId) return;

    const donRef = doc(db, 'requests', request.id, 'donations', activeDonationId);
    const unsubscribe = onSnapshot(donRef, (snap) => {
      if (snap.exists()) {
        const freshData = { id: snap.id, ...snap.data() };
        setLiveDonation(freshData);
        if (typeof onStatusChange === 'function') {
          onStatusChange(freshData);
        }
      }
    }, (err) => {
      console.warn("DualOtpVerification onSnapshot notice:", err);
    });

    return () => unsubscribe();
  }, [request?.id, activeDonationId, onStatusChange]);

  // Plaintext verbal code retained in component state & sessionStorage
  const [myVerbalCode, setMyVerbalCode] = useState("");
  const [enteredCounterOtp, setEnteredCounterOtp] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  // 1. Restore retained OTP from browser session storage on mount / donation change
  useEffect(() => {
    if (currentUser?.uid && activeDonationId) {
      const cached = getRetainedOtp({
        uid: currentUser.uid,
        donationId: activeDonationId,
        role: myParty
      });
      if (cached) {
        setMyVerbalCode(cached);
      }
    }
  }, [currentUser?.uid, activeDonationId, myParty]);

  const donorStatus = getPartyOtpStatus(liveDonation, 'DONOR');
  const requesterStatus = getPartyOtpStatus(liveDonation, 'REQUESTER');
  const isFullyComplete = liveDonation?.completed || liveDonation?.status === 'DONATION_COMPLETED';

  // 2. Action: Generate / Reveal verbal code for my side
  const handleGenerateMyCode = async () => {
    if (!activeDonationId || !request?.id || !currentUser?.uid) return;
    setIsGenerating(true);
    setErrorMessage("");
    setSuccessNotice("");

    try {
      const rawCode = generateSecure4DigitOtp();
      const codeHash = await hashOtp(rawCode);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
      const donationRef = doc(db, 'requests', request.id, 'donations', activeDonationId);

      const updates = isDonorRole
        ? {
            donorOtpHash: codeHash,
            donorOtpExpiresAt: expiresAt,
            donorOtpAttemptsRemaining: MAX_OTP_ATTEMPTS,
            donorOtpVerified: false,
            status: 'OTP_PENDING',
            updatedAt: serverTimestamp(),
          }
        : {
            requesterOtpHash: codeHash,
            requesterOtpExpiresAt: expiresAt,
            requesterOtpAttemptsRemaining: MAX_OTP_ATTEMPTS,
            requesterOtpVerified: false,
            status: 'OTP_PENDING',
            updatedAt: serverTimestamp(),
          };

      await updateDoc(donationRef, updates);

      // Save to React state and secure session storage
      setMyVerbalCode(rawCode);
      saveRetainedOtp({
        uid: currentUser.uid,
        donationId: activeDonationId,
        role: myParty,
        code: rawCode,
        expiresAt: expiresAt.getTime(),
      });

      setConfirmRegenerate(false);
      setSuccessNotice(`Your 4-digit ${myParty.toLowerCase()} code is ready. Speak this to the ${counterParty.toLowerCase()} on-site.`);
    } catch (err) {
      console.error('Error generating OTP:', err);
      setErrorMessage(err.message || 'Failed to generate confirmation code.');
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Action: Verify the counterparty's 4-digit code
  const handleVerifyCounterpartyCode = async () => {
    if (!activeDonationId || !request?.id || !currentUser?.uid) return;
    if (enteredCounterOtp.length !== 4) {
      setErrorMessage("Please enter all 4 digits.");
      return;
    }

    setIsVerifying(true);
    setErrorMessage("");
    setSuccessNotice("");

    try {
      const cleanInput = enteredCounterOtp.trim();
      const donRef = doc(db, 'requests', request.id, 'donations', activeDonationId);
      const reqRef = doc(db, 'requests', request.id);

      // Always fetch the freshest donation document from Firestore to eliminate any race condition / stale state
      let freshData = liveDonation;
      try {
        const freshSnap = await getDoc(donRef);
        if (freshSnap.exists()) {
          freshData = { id: freshSnap.id, ...freshSnap.data() };
          setLiveDonation(freshData);
          if (typeof onStatusChange === 'function') {
            onStatusChange(freshData);
          }
        }
      } catch (fetchErr) {
        console.warn("Could not pre-fetch fresh donation snapshot:", fetchErr);
      }

      const storedHash = isDonorRole ? freshData?.requesterOtpHash : freshData?.donorOtpHash;
      const rawExpiry = isDonorRole ? freshData?.requesterOtpExpiresAt : freshData?.donorOtpExpiresAt;
      const attemptsRemaining = isDonorRole
        ? (freshData?.requesterOtpAttemptsRemaining ?? MAX_OTP_ATTEMPTS)
        : (freshData?.donorOtpAttemptsRemaining ?? MAX_OTP_ATTEMPTS);

      if (!storedHash) {
        setErrorMessage(`The ${counterParty.toLowerCase()} has not generated their 4-digit code yet.`);
        setIsVerifying(false);
        return;
      }

      // Verification calculation
      const verifyRes = await verifyOtpAttempt({
        enteredOtp: cleanInput,
        storedOtpOrHash: storedHash,
        expiresAt: rawExpiry,
        attemptsRemaining,
        isHashed: true,
      });

      if (!verifyRes.success) {
        // Decrement attempts
        const decUpdate = isDonorRole
          ? { requesterOtpAttemptsRemaining: verifyRes.attemptsRemaining, updatedAt: serverTimestamp() }
          : { donorOtpAttemptsRemaining: verifyRes.attemptsRemaining, updatedAt: serverTimestamp() };

        await updateDoc(donRef, decUpdate);
        setErrorMessage(verifyRes.error || "Incorrect confirmation code.");
        setIsVerifying(false);
        return;
      }

      // Code matches! Execute transactional atomic update
      let completedInThisTx = false;

      await runTransaction(db, async (tx) => {
        const reqSnap = await tx.get(reqRef);
        const donSnap = await tx.get(donRef);

        if (!reqSnap.exists() || !donSnap.exists()) {
          throw new Error("Target record not found");
        }

        const dData = donSnap.data();
        const rData = reqSnap.data();

        if (rData.status === 'CANCELLED') {
          throw new Error("This blood request has been cancelled.");
        }
        if (dData.status === 'CANCELLED') {
          throw new Error("This donation commitment has been cancelled.");
        }
        if (dData.completed || dData.status === 'DONATION_COMPLETED') {
          throw new Error("This donation has already been finalized.");
        }

        // Determine if the OTHER party is already verified
        const otherAlreadyVerified = isDonorRole
          ? Boolean(dData.donorOtpVerified)
          : Boolean(dData.requesterOtpVerified);

        if (otherAlreadyVerified) {
          // BOTH VERIFICATIONS COMPLETE! Atomically finalize!
          const currentUnits = parseInt(rData.unitsDonated || rData.UnitsDonated || 0, 10);
          const unitsNeeded = parseInt(rData.unitsNeeded || rData.UnitsNeeded || 1, 10);

          if (currentUnits >= unitsNeeded) {
            throw new Error("This blood request has already reached its fulfilled unit goal.");
          }

          const newUnits = currentUnits + 1;
          const isFulfilled = newUnits >= unitsNeeded;

          // Update blood request
          tx.update(reqRef, {
            unitsDonated: newUnits,
            UnitsDonated: newUnits,
            status: isFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED',
            updatedAt: serverTimestamp(),
          });

          // Update donation to DONATION_COMPLETED
          const completionUpdates = isDonorRole
            ? {
                requesterOtpVerified: true,
                requesterOtpVerifiedAt: serverTimestamp(),
                completed: true,
                status: 'DONATION_COMPLETED',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }
            : {
                donorOtpVerified: true,
                donorOtpVerifiedAt: serverTimestamp(),
                completed: true,
                status: 'DONATION_COMPLETED',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };

          tx.update(donRef, completionUpdates);

          // Release donor active commitment
          const donorUidToRelease = dData.donorUid || dData.donorId;
          if (donorUidToRelease) {
            const commitmentRef = doc(db, 'donorCommitments', donorUidToRelease);
            tx.set(
              commitmentRef,
              {
                status: 'COMPLETED',
                activeDonationId: null,
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          completedInThisTx = true;
        } else {
          // Only this party is confirmed so far. Keep status OTP_PENDING
          const partialUpdates = isDonorRole
            ? {
                requesterOtpVerified: true,
                requesterOtpVerifiedAt: serverTimestamp(),
                status: 'OTP_PENDING',
                updatedAt: serverTimestamp(),
              }
            : {
                donorOtpVerified: true,
                donorOtpVerifiedAt: serverTimestamp(),
                status: 'OTP_PENDING',
                updatedAt: serverTimestamp(),
              };

          tx.update(donRef, partialUpdates);
        }
      });

      // Post-transaction handling
      if (completedInThisTx) {
        // Clear session storage retained code
        clearRetainedOtp({ uid: currentUser.uid, donationId: activeDonationId, role: myParty });

        // Update donor cooldown if current user is the donor
        if (isDonorRole) {
          try {
            await updateDoc(doc(db, 'donors', currentUser.uid), {
              lastDonationAt: serverTimestamp(),
              availabilityStatus: 'COOLDOWN',
              updatedAt: serverTimestamp(),
            });
          } catch (_) {}
        }

        // Notify counterparty
        const recipientUid = isDonorRole
          ? (request.createdByUid || request.uuid)
          : (freshData.donorUid || freshData.donorId);

        if (recipientUid) {
          await sendNotification({
            recipientUid,
            type: NOTIFICATION_TYPES.DONATION_COMPLETED,
            title: 'Life Saved! Donation Verified & Complete',
            message: `Blood donation for ${request.patientName || 'patient'} has been verified by both parties.`,
            requestId: request.id,
            donationId: activeDonationId,
          }).catch(() => {});
        }

        await logAuditEvent({
          action: AUDIT_ACTIONS.DONATION_COMPLETED,
          actorUid: currentUser.uid,
          entityType: 'donation',
          entityId: activeDonationId,
          metadata: { requestId: request.id, dualOtpVerified: true },
        }).catch(() => {});

        setSuccessNotice("Dual confirmation successful! Blood donation is finalized and recorded.");
        setEnteredCounterOtp("");
        if (onCompleted) onCompleted();
      } else {
        setSuccessNotice(
          `Confirmation recorded! Waiting for the ${counterParty.toLowerCase()} to verify their code to complete the donation.`
        );
        setEnteredCounterOtp("");
      }
    } catch (err) {
      console.error("Verification error:", err);
      setErrorMessage(err.message || "Failed to process verification.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Determine counterparty verified flag
  const isMyCodeVerifiedByCounterparty = isDonorRole
    ? Boolean(liveDonation?.donorOtpVerified)
    : Boolean(liveDonation?.requesterOtpVerified);

  const haveIVerifiedCounterpartyCode = isDonorRole
    ? Boolean(liveDonation?.requesterOtpVerified)
    : Boolean(liveDonation?.donorOtpVerified);

  const isCancelled = liveDonation?.status === 'CANCELLED' || request?.status === 'CANCELLED';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 text-xs text-slate-700 space-y-4 shadow-sm">
      {/* Header & Verification Mode */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-slate-900">Hospital On-Site Verification</h4>
            <p className="text-[11px] text-slate-500">
              Dual-OTP verification ensures physical presence before completion.
            </p>
          </div>
        </div>

        <span className={`px-2.5 py-0.5 rounded-full font-black uppercase text-[10px] tracking-wider border ${
          isFullyComplete
            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : isCancelled
            ? 'bg-slate-200 text-slate-700 border-slate-300'
            : 'bg-blue-100 text-blue-800 border-blue-200'
        }`}>
          {isFullyComplete ? 'Completed' : isCancelled ? 'Cancelled' : 'Two-Party Verification'}
        </span>
      </div>

      {/* 5-Step Visual Progress Stepper */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
          Verification Progress
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs">
          {/* Step A: Donor Code Verified */}
          <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 sm:flex-col sm:text-center ${
            liveDonation?.donorOtpVerified
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              liveDonation?.donorOtpVerified ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {liveDonation?.donorOtpVerified ? <Check className="w-3.5 h-3.5" /> : '1'}
            </div>
            <div>
              <p className="font-bold text-xs">Donor Code</p>
              <p className="text-[10px] text-slate-500">
                {liveDonation?.donorOtpVerified ? 'Verified by Requester' : 'Pending Requester'}
              </p>
            </div>
          </div>

          {/* Step B: Requester Code Verified */}
          <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 sm:flex-col sm:text-center ${
            liveDonation?.requesterOtpVerified
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              liveDonation?.requesterOtpVerified ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {liveDonation?.requesterOtpVerified ? <Check className="w-3.5 h-3.5" /> : '2'}
            </div>
            <div>
              <p className="font-bold text-xs">Requester Code</p>
              <p className="text-[10px] text-slate-500">
                {liveDonation?.requesterOtpVerified ? 'Verified by Donor' : 'Pending Donor'}
              </p>
            </div>
          </div>

          {/* Step C: Atomic Completion */}
          <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 sm:flex-col sm:text-center ${
            isFullyComplete
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isFullyComplete ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {isFullyComplete ? <Check className="w-3.5 h-3.5" /> : '3'}
            </div>
            <div>
              <p className="font-bold text-xs">Final Completion</p>
              <p className="text-[10px] text-slate-500">
                {isFullyComplete ? 'Life Saved Recorded' : 'Requires Both OTPs'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* COMPLETED OR CANCELLED STATE BANNER */}
      {isFullyComplete ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          <div>
            <h5 className="font-bold text-sm">Donation Successfully Completed!</h5>
            <p className="text-xs text-emerald-800 mt-0.5">
              Both parties verified their codes on-site. Thank you for your humanitarian coordination.
            </p>
          </div>
        </div>
      ) : isCancelled ? (
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 text-slate-700 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-slate-500 flex-shrink-0" />
          <div>
            <h5 className="font-bold text-sm">
              {request?.status === 'CANCELLED' ? 'Blood Request Cancelled' : 'Donation Commitment Cancelled'}
            </h5>
            <p className="text-xs text-slate-500 mt-0.5">
              {liveDonation?.cancellationReason
                ? `Reason: ${liveDonation.cancellationReason}`
                : request?.cancellationReason
                ? `Reason: ${request.cancellationReason}`
                : 'This coordination has been cancelled. OTP verification is disabled.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SECTION 1: MY 4-DIGIT CODE (Tell to the other party) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="font-extrabold text-xs text-slate-900">
                  Your Verbal 4-Digit Code
                </p>
                <p className="text-[11px] text-slate-500">
                  Speak this code to the {counterParty.toLowerCase()} at the hospital.
                </p>
              </div>

              {isMyCodeVerifiedByCounterparty ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <Check className="w-3.5 h-3.5" />
                  Verified by {counterParty}
                </span>
              ) : myVerbalCode ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl sm:text-3xl font-black text-red-700 tracking-widest bg-red-50 border border-red-200 px-3.5 py-1 rounded-xl font-mono shadow-sm">
                    {myVerbalCode}
                  </span>
                  {!confirmRegenerate ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRegenerate(true)}
                      className="text-xs text-slate-500 hover:text-red-700 underline font-medium"
                    >
                      Regenerate
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleGenerateMyCode}
                        disabled={isGenerating}
                        className="text-xs px-2.5 py-1 h-auto"
                      >
                        Confirm
                      </Button>
                      <button
                        type="button"
                        onClick={() => setConfirmRegenerate(false)}
                        className="text-xs text-slate-400 hover:text-slate-600 px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={handleGenerateMyCode}
                  disabled={isGenerating}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm px-4 py-2"
                >
                  {isGenerating ? 'Generating...' : 'Reveal / Generate My Code'}
                </Button>
              )}
            </div>

            {myVerbalCode && !isMyCodeVerifiedByCounterparty && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" />
                Active for 10 minutes. Retained in your current browser session.
              </p>
            )}
          </div>

          {/* SECTION 2: ENTER THE OTHER PARTY'S 4-DIGIT CODE */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-extrabold text-xs text-slate-900">
                  Verify {counterParty}&apos;s 4-Digit Code
                </p>
                <p className="text-[11px] text-slate-500">
                  Ask the {counterParty.toLowerCase()} for their spoken code and enter it below:
                </p>
              </div>

              {haveIVerifiedCounterpartyCode && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <Check className="w-3.5 h-3.5" />
                  Confirmed by You
                </span>
              )}
            </div>

            {!haveIVerifiedCounterpartyCode ? (
              <div className="pt-1">
                <OtpDigitsInput
                  value={enteredCounterOtp}
                  onChange={setEnteredCounterOtp}
                  disabled={isVerifying}
                />

                <Button
                  onClick={handleVerifyCounterpartyCode}
                  disabled={isVerifying || enteredCounterOtp.length !== 4}
                  className="w-full mt-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl py-2.5 shadow-sm transition-all disabled:opacity-50"
                >
                  {isVerifying ? 'Verifying Code...' : `Confirm ${counterParty} Code`}
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                <Check className="w-4 h-4 text-emerald-600" />
                You have verified the {counterParty.toLowerCase()}&apos;s code.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notifications & Error Feedback */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}
    </div>
  );
}
