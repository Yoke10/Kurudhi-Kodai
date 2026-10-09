'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import DualOtpVerification from '@/components/donations/DualOtpVerification';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  isRequestActive,
  isRequestFullyCompleted,
  isRequestCancelled,
} from '@/lib/requestStateMachine';
import {
  isDonationActive,
  isDonationCompleted,
  isDonationCancelled,
} from '@/lib/donationStateMachine';
import { cancelRequesterRequest } from '@/lib/donationService';
import {
  Activity, Check, ChevronDown, ChevronRight, Clock, Droplet,
  FileText, HeartHandshake, ListChecks, Users, Hospital, MapPin, AlertCircle, XCircle
} from 'lucide-react';
import Link from 'next/link';


export default function MyRequestsPage() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    fulfilled: 0,
    cancelled: 0,
    unitsDonated: 0,
  });

  useEffect(() => {
    if (!user) return;

    // Listen to requests created by current user (supports both createdByUid and legacy uuid)
    const q1 = query(collection(db, 'requests'), where('createdByUid', '==', user.uid));
    const q2 = query(collection(db, 'requests'), where('uuid', '==', user.uid));

    const unsub1 = onSnapshot(q1, (snap1) => {
      const list1 = snap1.docs.map(d => ({ id: d.id, ...d.data() }));

      // Also get legacy matching requests
      const unsub2 = onSnapshot(q2, (snap2) => {
        const list2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        // Merge without duplicates
        const map = new Map();
        list1.forEach(item => map.set(item.id, item));
        list2.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());

        // Sort newest first
        combined.sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        });

        setMyRequests(combined);

        let activeCount = 0;
        let fulfilledCount = 0;
        let cancelledCount = 0;
        let donatedSum = 0;

        combined.forEach(req => {
          if (isRequestFullyCompleted(req)) {
            fulfilledCount++;
          } else if (isRequestCancelled(req)) {
            cancelledCount++;
          } else if (isRequestActive(req)) {
            activeCount++;
          }

          donatedSum += parseInt(req.unitsDonated || req.UnitsDonated || 0, 10);
        });

        setStats({
          total: combined.length,
          active: activeCount,
          fulfilled: fulfilledCount,
          cancelled: cancelledCount,
          unitsDonated: donatedSum,
        });
      });

      return () => unsub2();
    });

    return () => unsub1();
  }, [user]);

  const filtered = myRequests.filter(req => {
    if (activeTab === 'active') return isRequestActive(req);
    if (activeTab === 'fulfilled') return isRequestFullyCompleted(req);
    if (activeTab === 'cancelled') return isRequestCancelled(req);
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              My Blood Requests
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Track donor responses, verify on-site donations via 4-digit OTP, and monitor unit progress.
            </p>
          </div>

          <Link href="/needdonor">
            <Button className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-md">
              Create New Blood Request
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase">Total Requests</span>
            <p className="text-3xl font-black text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase">Active / Matching</span>
            <p className="text-3xl font-black text-amber-600 mt-1">{stats.active}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase">Fulfilled Requests</span>
            <p className="text-3xl font-black text-green-600 mt-1">{stats.fulfilled}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase">Total Units Donated</span>
            <p className="text-3xl font-black text-red-600 mt-1">{stats.unitsDonated}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 gap-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'all' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            All Requests ({myRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'active' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Active ({stats.active})
          </button>
          <button
            onClick={() => setActiveTab('fulfilled')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'fulfilled' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Fulfilled ({stats.fulfilled})
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'cancelled' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Cancelled ({stats.cancelled})
          </button>
        </div>

        {/* List of Requests */}
        {filtered.length > 0 ? (
          <div className="space-y-4">
            {filtered.map(req => (
              <RequesterRequestCard key={req.id} request={req} currentUser={user} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-gray-800 text-base">No requests in this tab</h3>
            <p className="text-sm mt-1">Create a blood request whenever you or someone you know needs blood.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Request Card for Requesters with Subcollection Donations Listener
function RequesterRequestCard({ request, currentUser }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [donations, setDonations] = useState([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    const donRef = collection(db, 'requests', request.id, 'donations');
    const unsub = onSnapshot(donRef, (snap) => {
      setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [request.id]);

  const unitsNeeded = parseInt(request.unitsNeeded || request.UnitsNeeded || 1, 10);
  const unitsDonated = parseInt(request.unitsDonated || request.UnitsDonated || 0, 10);
  const isFulfilled = isRequestFullyCompleted(request);
  const isCancelled = isRequestCancelled(request);
  const isActive = isRequestActive(request);
  const canCancel = !isCancelled && !isFulfilled;

  const activeDonations = donations.filter(d => isDonationActive(d));
  const completedDonations = donations.filter(d => isDonationCompleted(d));
  const cancelledDonations = donations.filter(d => isDonationCancelled(d));

  const handleCancelRequest = async () => {
    if (!currentUser?.uid || !cancelReason.trim()) return;
    setIsCancelling(true);
    setCancelError('');
    try {
      await cancelRequesterRequest({
        requestId: request.id,
        requesterUid: currentUser.uid,
        reason: cancelReason.trim(),
      });
      setShowCancelModal(false);
      setCancelReason('');
    } catch (err) {
      console.error('Cancel request error:', err);
      setCancelError(err.message || 'Failed to cancel request.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 cursor-pointer bg-white" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-extrabold text-lg text-gray-900">
                {request.patientName || request.PatientName}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                isCancelled
                  ? 'bg-gray-100 text-gray-700'
                  : isFulfilled
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {isCancelled ? 'Cancelled' : isFulfilled ? 'Fulfilled' : 'Active Matching'}
              </span>
              {canCancel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCancelModal(true);
                  }}
                  className="text-xs text-red-600 hover:text-red-800 font-bold ml-2 underline"
                >
                  Cancel Request
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center text-xs text-gray-500 gap-y-1 gap-x-3 mt-1.5">
              <span className="flex items-center gap-1 font-medium text-gray-700">
                <Hospital className="w-3.5 h-3.5 text-gray-400" />
                {request.hospital || request.Hospital}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                {request.city || request.City}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="inline-block bg-red-50 text-red-700 border border-red-200 font-black text-sm px-3 py-1 rounded-xl">
                {request.bloodGroup || request.BloodGroup}
              </span>
              <p className="text-xs font-bold text-gray-700 mt-1">
                {unitsDonated} / {unitsNeeded} Units
              </p>
            </div>
            <button className="text-gray-400 hover:text-gray-600">
              <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5 bg-gray-50/70 border-t border-gray-100 space-y-4">
          {isCancelled && (
            <div className="p-3.5 bg-gray-100 border border-gray-200 rounded-xl text-xs text-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span>This blood request was cancelled by you. Associated donor commitments have been released, and OTP operations are disabled.</span>
              </div>
              {request.cancellationReason && (
                <span className="italic text-gray-500 text-[11px] ml-2">Reason: {request.cancellationReason}</span>
              )}
            </div>
          )}

          {/* Active Pledges */}
          <div>
            <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gray-500" />
              Active Matched Donors ({activeDonations.length})
            </h4>

            {activeDonations.length > 0 ? (
              <div className="space-y-3">
                {activeDonations.map(don => (
                  <RequesterDonationItem
                    key={don.id}
                    donation={don}
                    request={request}
                    currentUser={currentUser}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-xs text-gray-500">
                {isCancelled
                  ? 'No active donor commitments remain for this cancelled request.'
                  : isFulfilled
                  ? 'All required units have been fulfilled.'
                  : 'No active donor pledges at the moment. We are matching your request with eligible local donors.'}
              </div>
            )}
          </div>

          {/* Completed Donations History */}
          {completedDonations.length > 0 && (
            <div className="pt-2">
              <h4 className="font-bold text-green-800 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
                <Check className="w-4 h-4 text-green-600" />
                Completed Donations ({completedDonations.length})
              </h4>
              <div className="space-y-3">
                {completedDonations.map(don => (
                  <RequesterDonationItem
                    key={don.id}
                    donation={don}
                    request={request}
                    currentUser={currentUser}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cancelled Donations History */}
          {cancelledDonations.length > 0 && (
            <div className="pt-2">
              <h4 className="font-bold text-gray-500 text-xs uppercase tracking-wider flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-gray-400" />
                Cancelled Pledges ({cancelledDonations.length})
              </h4>
              <div className="space-y-2">
                {cancelledDonations.map(don => (
                  <RequesterDonationItem
                    key={don.id}
                    donation={don}
                    request={request}
                    currentUser={currentUser}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancel Request Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-gray-900 text-base mb-2">Cancel Blood Request</h3>
            <p className="text-xs text-gray-500 mb-4">
              Cancelling will release any pledged donors and permanently close this request. Please specify a reason.
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Patient received blood from hospital bank, requirement postponed..."
              className="w-full p-2.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-red-500"
            />
            {cancelError && (
              <p className="text-xs text-red-600 font-medium mt-2">{cancelError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowCancelModal(false)}>
                Back
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={isCancelling || !cancelReason.trim()}
                onClick={handleCancelRequest}
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Verification Card for Requester to confirm a Donor
function RequesterDonationItem({ donation, request, currentUser }) {
  const [donorDetails, setDonorDetails] = useState(null);

  useEffect(() => {
    const fetchDonor = async () => {
      try {
        if (donation.donorUid || donation.donorId) {
          const snap = await getDoc(doc(db, 'donors', donation.donorUid || donation.donorId));
          if (snap.exists()) {
            setDonorDetails(snap.data());
          }
        }
      } catch (e) {
        console.warn("Could not fetch donor details:", e);
      }
    };
    fetchDonor();
  }, [donation]);

  const donorName = donation.donorName || donorDetails?.name || donorDetails?.Name || 'Anonymous Donor';
  const donorContact = donorDetails?.mobile || donorDetails?.MobileNumber || donation.donorEmail || 'Contact available';
  const donorBlood = donation.donorBloodGroup || donorDetails?.bloodGroup || donorDetails?.BloodGroup || request.bloodGroup;

  const isCompleted = isDonationCompleted(donation);
  const isCancelled = isDonationCancelled(donation);
  const isActive = isDonationActive(donation);

  // If donation is cancelled, render a soft record without active OTP controls
  if (isCancelled) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-xs">
            {donorBlood}
          </div>
          <div>
            <h5 className="font-bold text-gray-700">{donorName}</h5>
            <p className="text-[11px] text-gray-400">
              {donation.cancellationReason ? `Reason: ${donation.cancellationReason}` : 'Pledge cancelled.'}
            </p>
          </div>
        </div>
        <span className="bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
          Cancelled
        </span>
      </div>
    );
  }

  // If completed, show verified completion banner
  if (isCompleted) {
    return (
      <div className="bg-white rounded-2xl border border-green-200 p-4 shadow-sm space-y-3 bg-green-50/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-green-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 text-green-800 flex items-center justify-center font-black text-sm border border-green-200">
              {donorBlood}
            </div>
            <div>
              <h4 className="font-extrabold text-gray-900 text-sm">{donorName}</h4>
              <p className="text-xs text-green-700 font-medium">1 Unit Donated & Fully Verified</p>
            </div>
          </div>
          <span className="bg-green-100 text-green-800 font-bold text-xs px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-green-600" /> Verified Complete
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
      {/* Donor Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center font-black text-sm border border-red-100">
            {donorBlood}
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900 text-sm">{donorName}</h4>
            <p className="text-xs text-slate-500 font-mono">{donorContact}</p>
          </div>
        </div>

        <StatusBadge status={donation.status || 'OTP_PENDING'} type="donation" />
      </div>

      {/* Dual OTP Verification Interface only for active uncancelled requests */}
      <DualOtpVerification
        donation={donation}
        request={request}
        currentRole="REQUESTER"
        currentUser={currentUser}
      />
    </div>
  );
}
