'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  Hospital,
  MapPin,
  Phone,
  Droplet,
  User,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  FileText,
} from 'lucide-react';

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
 * Inspection and operational action modal for a blood request.
 */
export default function RequestDetailsModal({
  isOpen,
  onClose,
  request,
  onVerify,
  onReject,
  onToggleEmergency,
  onViewDonors,
  onViewCancellations,
  isProcessing = false,
}) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (!request) return null;

  const bloodGroup = request.bloodGroup || request.BloodGroup || '—';
  const unitsNeeded = request.unitsNeeded || request.UnitsNeeded || 1;
  const unitsDonated = request.unitsDonated || request.UnitsDonated || 0;
  const isEmergency = request.isEmergency || request.urgencyLevel === 'CRITICAL' || request.EmergencyLevel === 'high';
  const status = request.status || 'PENDING';

  const handleConfirmReject = () => {
    if (!rejectReason.trim()) return;
    onReject && onReject(request.id, rejectReason.trim());
    setShowRejectInput(false);
    setRejectReason('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <DialogHeader className="border-b border-gray-100 pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Droplet className="w-5 h-5 text-red-600 fill-red-100" />
                {request.patientName || request.PatientName || 'Blood Request'}
              </DialogTitle>
              <p className="text-xs text-gray-400 mt-0.5">
                Ref ID: <span className="font-mono text-gray-600">{request.id}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isEmergency && <StatusBadge status="EMERGENCY" />}
              <StatusBadge status={status} />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-3 text-xs">
          {/* Key Metric Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-red-50/50 p-3.5 rounded-xl border border-red-100">
            <div>
              <span className="text-[11px] text-gray-500 block">Required Blood:</span>
              <span className="text-base font-black text-red-700">{bloodGroup}</span>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 block">Units Donated / Needed:</span>
              <span className="text-base font-extrabold text-gray-900">
                {unitsDonated} / {unitsNeeded}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 block">City:</span>
              <span className="text-sm font-bold text-gray-800">{request.city || request.City || '—'}</span>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 block">Hospital:</span>
              <span className="text-sm font-bold text-gray-800 truncate block">
                {request.hospital || request.Hospital || '—'}
              </span>
            </div>
          </div>

          {/* Details Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Patient & Hospital Info */}
            <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-gray-900 flex items-center gap-1.5 text-xs">
                <Hospital className="w-3.5 h-3.5 text-red-600" />
                Patient & Hospital Details
              </span>
              <div className="space-y-1 text-gray-600">
                <p>
                  <strong className="text-gray-800">Hospital:</strong> {request.hospital || request.Hospital || '—'}
                </p>
                <p>
                  <strong className="text-gray-800">Location:</strong> {request.city || request.City}{' '}
                  {request.area ? `(${request.area})` : ''}
                </p>
                <p>
                  <strong className="text-gray-800">Medical Reason:</strong>{' '}
                  {request.reason || request.Reason || 'Not specified'}
                </p>
                <p>
                  <strong className="text-gray-800">Urgency Level:</strong>{' '}
                  <span className="uppercase font-semibold text-gray-800">{request.urgencyLevel || 'Standard'}</span>
                </p>
              </div>
            </div>

            {/* Attender Contact */}
            <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-gray-900 flex items-center gap-1.5 text-xs">
                <Phone className="w-3.5 h-3.5 text-blue-600" />
                Attender Contact Information
              </span>
              <div className="space-y-1 text-gray-600">
                <p>
                  <strong className="text-gray-800">Attender Name:</strong>{' '}
                  {request.attenderName || request.AttenderName || '—'}
                </p>
                <p>
                  <strong className="text-gray-800">Mobile:</strong>{' '}
                  <a
                    href={`tel:${request.attenderMobile || request.AttenderMobile}`}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    {request.attenderMobile || request.AttenderMobile || '—'}
                  </a>
                </p>
                <p>
                  <strong className="text-gray-800">Created Date:</strong> {formatDate(request.createdAt)}
                </p>
                {request.rejectionReason && (
                  <p className="text-red-700 font-semibold mt-1">
                    Rejection Reason: {request.rejectionReason}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Rejection input box if triggered */}
          {showRejectInput && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <span className="font-bold text-red-900 block text-xs">
                Specify Reason for Request Rejection:
              </span>
              <Textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Invalid hospital contact, patient already discharged..."
                className="text-xs bg-white border-red-200"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRejectInput(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmReject}
                  disabled={!rejectReason.trim() || isProcessing}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          )}

          {/* Operational Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {onViewDonors && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewDonors(request)}
                className="text-xs"
              >
                View Matched Donors
              </Button>
            )}

            {onViewCancellations && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewCancellations(request)}
                className="text-xs"
              >
                View Cancellations
              </Button>
            )}

            {onToggleEmergency && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleEmergency(request.id, !isEmergency)}
                disabled={isProcessing}
                className={`text-xs ${
                  isEmergency
                    ? 'border-orange-300 text-orange-700 hover:bg-orange-50'
                    : 'border-red-300 text-red-700 hover:bg-red-50'
                }`}
              >
                {isEmergency ? 'Remove Emergency Flag' : 'Mark Critical Emergency'}
              </Button>
            )}

            {status === 'PENDING' && onVerify && (
              <Button
                size="sm"
                onClick={() => onVerify(request.id)}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
              >
                Verify & Approve
              </Button>
            )}

            {status === 'PENDING' && onReject && !showRejectInput && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowRejectInput(true)}
                disabled={isProcessing}
                className="text-xs font-semibold"
              >
                Reject Request
              </Button>
            )}
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
