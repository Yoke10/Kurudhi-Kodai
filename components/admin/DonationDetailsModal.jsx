'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/ui/StatusBadge';
import { getPartyOtpStatus } from '@/lib/otpService';
import { Shield, Clock, CheckCircle2, User, Droplet, Hospital, MapPin, AlertTriangle, Calendar, FileText } from 'lucide-react';

function formatDate(val) {
  if (!val) return 'Date unavailable';
  try {
    const d = val?.toDate ? val.toDate() : (val instanceof Date ? val : new Date(val));
    if (isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return 'Date unavailable';
  }
}

/**
 * Detailed inspection modal for a donation record.
 * Conforms to security requirements:
 * - NEVER exposes plaintext OTP or OTP hashes.
 * - Displays clear two-party verification lifecycle steps.
 * - Distinguishes createdAt, completedAt, and cancelledAt accurately.
 */
export default function DonationDetailsModal({
  isOpen,
  onClose,
  donation,
  request,
}) {
  if (!donation) return null;

  const donorStatus = getPartyOtpStatus(donation, 'DONOR');
  const requesterStatus = getPartyOtpStatus(donation, 'REQUESTER');

  const donorVerified = donation.donorOtpVerified === true;
  const requesterVerified = donation.requesterOtpVerified === true;
  const isCompleted = donation.completed === true || donation.status === 'DONATION_COMPLETED';
  const isCancelled = donation.status === 'CANCELLED';

  const reqBlood = donation.donorBloodGroup || request?.bloodGroup || request?.BloodGroup || '—';
  const unitsNeeded = request?.unitsNeeded || request?.UnitsNeeded || 1;
  const unitsDonated = request?.unitsDonated || request?.UnitsDonated || 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <DialogHeader className="border-b border-gray-100 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Droplet className="w-5 h-5 text-red-600 fill-red-100" />
                Donation Record Details
              </DialogTitle>
              <p className="text-xs text-gray-400 mt-0.5">
                Donation Ref: <span className="font-mono text-gray-600">{donation.id}</span>
              </p>
            </div>
            <StatusBadge status={donation.status || 'OTP_PENDING'} />
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-3 text-xs">
          {/* Two-Party Dual-OTP Verification Progress */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 flex items-center gap-1.5 text-xs">
                <Shield className="w-4 h-4 text-red-600" />
                Dual-OTP Verification Progress
              </span>
              <span className="text-[11px] font-semibold text-gray-500">
                {isCompleted ? 'Verification Complete (2/2)' : donorVerified || requesterVerified ? 'Partial (1/2)' : 'Pending (0/2)'}
              </span>
            </div>

            {/* Stepper Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Party 1: Donor OTP (Verified by Requester) */}
              <div className={`p-3 rounded-lg border text-xs transition-colors ${
                donorVerified ? 'bg-green-50/70 border-green-200' : 'bg-white border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-gray-800">1. Donor Verbal Code</span>
                  <StatusBadge status={donorStatus.state} />
                </div>
                <p className="text-[11px] text-gray-500">{donorStatus.label}</p>
                {donation.donorOtpVerifiedAt && (
                  <p className="text-[10px] text-green-700 mt-1 font-medium">
                    Verified: {formatDate(donation.donorOtpVerifiedAt)}
                  </p>
                )}
                {donorStatus.state === 'ACTIVE' && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Expires: {formatDate(donation.donorOtpExpiresAt)}
                  </p>
                )}
              </div>

              {/* Party 2: Requester OTP (Verified by Donor) */}
              <div className={`p-3 rounded-lg border text-xs transition-colors ${
                requesterVerified ? 'bg-green-50/70 border-green-200' : 'bg-white border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-gray-800">2. Requester Code</span>
                  <StatusBadge status={requesterStatus.state} />
                </div>
                <p className="text-[11px] text-gray-500">{requesterStatus.label}</p>
                {donation.requesterOtpVerifiedAt && (
                  <p className="text-[10px] text-green-700 mt-1 font-medium">
                    Verified: {formatDate(donation.requesterOtpVerifiedAt)}
                  </p>
                )}
                {requesterStatus.state === 'ACTIVE' && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Expires: {formatDate(donation.requesterOtpExpiresAt)}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-gray-400 italic">
              * Note: Plaintext OTP codes and hashes are protected and never rendered in administration interfaces.
            </p>
          </div>

          {/* Parties Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Donor Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1.5">
              <span className="font-bold text-gray-900 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                Donor Information
              </span>
              <p className="text-gray-700 font-semibold">{donation.donorName || 'Registered Donor'}</p>
              <p className="text-gray-500 text-[11px]">Email: {donation.donorEmail || '—'}</p>
              <p className="text-gray-500 text-[11px]">Blood Group: <span className="font-bold text-red-600">{reqBlood}</span></p>
              <p className="text-gray-400 text-[10px] font-mono">UID: {donation.donorUid || donation.donorId || '—'}</p>
            </div>

            {/* Requester / Request Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1.5">
              <span className="font-bold text-gray-900 flex items-center gap-1.5">
                <Hospital className="w-3.5 h-3.5 text-red-600" />
                Blood Request Context
              </span>
              <p className="text-gray-700 font-semibold">{request?.patientName || request?.PatientName || 'Patient'}</p>
              <p className="text-gray-500 text-[11px]">Hospital: {request?.hospital || request?.Hospital || '—'}</p>
              <p className="text-gray-500 text-[11px]">City: {request?.city || request?.City || '—'}</p>
              <p className="text-gray-400 text-[10px] font-mono">Request ID: {donation.requestId || request?.id || '—'}</p>
            </div>
          </div>

          {/* Lifecycle Timestamps */}
          <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2">
            <span className="font-bold text-gray-900 flex items-center gap-1.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              Lifecycle Audit Timestamps
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
              <div>
                <span className="text-gray-400 block">Pledge Created:</span>
                <span className="font-medium text-gray-700">{formatDate(donation.createdAt)}</span>
              </div>
              <div>
                <span className="text-gray-400 block">Accepted / Contacted:</span>
                <span className="font-medium text-gray-700">{formatDate(donation.acceptedAt || donation.createdAt)}</span>
              </div>
              <div>
                <span className="text-gray-400 block">Completed At:</span>
                <span className={`font-medium ${donation.completedAt ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                  {formatDate(donation.completedAt)}
                </span>
              </div>
              {isCancelled && (
                <div className="col-span-2 sm:col-span-3 bg-red-50 p-2.5 rounded-lg border border-red-200 mt-1">
                  <span className="text-red-700 font-bold block mb-0.5">Cancellation Details:</span>
                  <p className="text-red-900">Reason: {donation.cancellationReason || 'No reason provided'}</p>
                  <p className="text-red-600 text-[10px] mt-0.5">Cancelled at: {formatDate(donation.cancelledAt)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-gray-100 pt-3 mt-4">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
