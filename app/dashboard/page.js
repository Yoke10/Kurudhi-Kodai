'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isBloodGroupCompatible } from '@/lib/bloodCompatibility';
import { calculateDonorCooldown } from '@/lib/matchingEngine';
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
import {
  acceptDonationPledge,
  cancelDonorDonation,
  COMMITMENT_ERROR_MSG,
} from '@/lib/donationService';
import DualOtpVerification from '@/components/donations/DualOtpVerification';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  AlertCircle, Check, ChevronDown, Clock, Droplet, Hospital,
  Info, MapPin, Share2, Shield, HeartHandshake, X
} from 'lucide-react';


export default function DashboardPage() {
  const { user, donorProfile, isDonor } = useAuth();
  const [requests, setRequests] = useState([]);
  const [userDonations, setUserDonations] = useState([]);
  const [activeCommitment, setActiveCommitment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'mytype' | 'completed'
  const [stats, setStats] = useState({
    activeRequests: 0,
    eligibleRequests: 0,
    completedDonations: 0,
    unitsNeeded: 0,
  });

  // Fetch requests and listener
  useEffect(() => {
    const q = query(collection(db, "requests"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(list);
      setIsLoading(false);
    }, (err) => {
      console.warn("Requests snapshot notice:", err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to donor's active commitment document in real-time
  useEffect(() => {
    if (!user?.uid) {
      setActiveCommitment(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "donorCommitments", user.uid), (docSnap) => {
      if (docSnap.exists() && docSnap.data().status === 'ACTIVE') {
        setActiveCommitment({ id: docSnap.id, ...docSnap.data() });
      } else {
        setActiveCommitment(null);
      }
    }, (err) => {
      console.warn("Notice listening to donorCommitments:", err);
    });

    return () => unsub();
  }, [user?.uid]);

  // Fetch user donations efficiently
  const refreshUserDonations = async () => {
    if (!user?.uid || requests.length === 0) return;
    try {
      const found = [];
      for (const req of requests) {
        const donRef = collection(db, "requests", req.id, "donations");
        const q = query(donRef, where("donorId", "==", user.uid));
        const snap = await getDocs(q);
        snap.forEach(d => {
          found.push({ id: d.id, requestId: req.id, ...d.data() });
        });
      }
      setUserDonations(found);
    } catch (e) {
      console.warn("Error fetching user donations:", e);
    }
  };

  useEffect(() => {
    refreshUserDonations();
  }, [user?.uid, requests.length]);

  // Compute stats with authoritative helpers
  useEffect(() => {
    let activeCount = 0;
    let eligibleCount = 0;
    let totalEligibleUnits = 0;

    const donorBlood = donorProfile?.bloodGroup || donorProfile?.BloodGroup;

    requests.forEach(req => {
      if (isRequestActive(req)) {
        activeCount++;
        const reqBlood = req.bloodGroup || req.BloodGroup;
        const anyAccepted = req.anyBloodGroupAccepted || req.AnyBloodGroupAccepted || false;

        if (donorBlood && isBloodGroupCompatible(donorBlood, reqBlood, anyAccepted)) {
          eligibleCount++;
          const needed = parseInt(req.unitsNeeded || req.UnitsNeeded || 1, 10);
          const donated = parseInt(req.unitsDonated || req.UnitsDonated || 0, 10);
          totalEligibleUnits += Math.max(0, needed - donated);
        }
      }
    });

    const completed = userDonations.filter(d => isDonationCompleted(d)).length;

    setStats({
      activeRequests: activeCount,
      eligibleRequests: eligibleCount,
      completedDonations: completed,
      unitsNeeded: totalEligibleUnits,
    });
  }, [requests, donorProfile, userDonations]);

  const donorBlood = donorProfile?.bloodGroup || donorProfile?.BloodGroup;
  const { isEligible, remainingDays } = calculateDonorCooldown(donorProfile?.lastDonationAt || donorProfile?.lastDonationDate);

  // Filter requests for tabs strictly using canonical lifecycle states
  const filteredRequests = requests.filter(request => {
    const isActive = isRequestActive(request);
    const isCompleted = isRequestFullyCompleted(request);

    if (activeTab === 'active') {
      return isActive;
    }
    if (activeTab === 'completed') {
      // Completed Requests MUST only contain requests that have met full canonical completion!
      return isCompleted;
    }
    if (activeTab === 'mytype') {
      if (!donorBlood || !isActive) return false;
      const reqBlood = request.bloodGroup || request.BloodGroup;
      const anyAcc = request.anyBloodGroupAccepted || request.AnyBloodGroupAccepted || false;
      return isBloodGroupCompatible(donorBlood, reqBlood, anyAcc);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Blood Donor Portal
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {donorProfile ? (
                <>Welcome, <strong className="text-red-700">{donorProfile.name || donorProfile.Name}</strong>. Registered blood type: <strong className="text-red-700 font-bold">{donorBlood}</strong></>
              ) : (
                'Review urgent blood requests and coordinate real-time life-saving donations.'
              )}
            </p>
          </div>

          {!isDonor && (
            <Link href="/newdonor">
              <Button className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-md">
                Register as Blood Donor
              </Button>
            </Link>
          )}
        </div>

        {/* Cooldown Alert Banner */}
        {donorProfile && !isEligible && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold">Donation Cooldown Active</p>
              <p className="text-xs text-amber-800">
                You recently donated blood. For donor safety, you will be eligible for your next donation in <strong>{remainingDays} day{remainingDays === 1 ? '' : 's'}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Active Commitment Notice Banner */}
        {activeCommitment && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-sm flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-bold">Active Donation Commitment in Progress</p>
                <p className="text-xs text-blue-800">
                  You are pledged to an active donation for Patient <strong>{activeCommitment.patientName || 'Blood Request'}</strong>. You cannot accept other requests until this is completed or cancelled.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-200/70 text-blue-900 px-2.5 py-1 rounded-full">
              Pledged
            </span>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Requests</span>
            <p className="text-3xl font-black text-gray-900 mt-1">{stats.activeRequests}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compatible With Me</span>
            <p className="text-3xl font-black text-red-600 mt-1">{stats.eligibleRequests}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My Completed Donations</span>
            <p className="text-3xl font-black text-green-600 mt-1">{stats.completedDonations}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compatible Units Needed</span>
            <p className="text-3xl font-black text-amber-600 mt-1">{stats.unitsNeeded}</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-gray-200 mb-6 gap-2">
          <button
            onClick={() => setActiveTab('active')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'active' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            All Active ({stats.activeRequests})
          </button>
          <button
            onClick={() => setActiveTab('mytype')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'mytype' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Compatible With Me ({stats.eligibleRequests})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'completed' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Completed Requests
          </button>
        </div>

        {/* Request Cards Feed */}
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">Loading blood requests...</p>
          </div>
        ) : filteredRequests.length > 0 ? (
          <div className="space-y-4">
            {filteredRequests.map(req => (
              <DonorRequestCard
                key={req.id}
                request={req}
                user={user}
                donorProfile={donorProfile}
                isEligible={isEligible}
                remainingDays={remainingDays}
                userDonation={userDonations.find(d => d.requestId === req.id)}
                activeCommitment={activeCommitment}
                onDonationChange={refreshUserDonations}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
            <Info className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-gray-800 text-base">No blood requests in this view</h3>
            <p className="text-sm mt-1">Check back soon or explore other blood types.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Subcomponent: Individual Blood Request Card
function DonorRequestCard({
  request,
  user,
  donorProfile,
  isEligible,
  remainingDays,
  userDonation,
  activeCommitment,
  onDonationChange,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [donation, setDonation] = useState(userDonation || null);
  const [isPledging, setIsPledging] = useState(false);
  const [pledgeError, setPledgeError] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const reqBlood = request.bloodGroup || request.BloodGroup;
  const donorBlood = donorProfile?.bloodGroup || donorProfile?.BloodGroup;
  const anyAcc = request.anyBloodGroupAccepted || request.AnyBloodGroupAccepted || false;
  const isCompatible = donorBlood && isBloodGroupCompatible(donorBlood, reqBlood, anyAcc);

  // Sync state if userDonation changes from parent
  useEffect(() => {
    if (userDonation) setDonation(userDonation);
  }, [userDonation]);

  // Real-time listener for donations pledged by current user on this request
  useEffect(() => {
    if (!request?.id || !user?.uid) return;
    const donCol = collection(db, "requests", request.id, "donations");
    const q1 = query(donCol, where("donorId", "==", user.uid));
    const unsub = onSnapshot(q1, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA;
      });
      // Pick active donation if any, else latest donation
      const activeDoc = docs.find(d => isDonationActive(d));
      setDonation(activeDoc || docs[0] || null);
    }, (err) => {
      console.warn("DonorRequestCard donations listener notice:", err);
    });
    return () => unsub();
  }, [request?.id, user?.uid]);

  // PLEDGE DONATION: Atomically verified and recorded with donor commitment lock
  const handlePledgeDonation = async () => {
    if (!user || !donorProfile) return;
    if (!isEligible) {
      setPledgeError(`You are currently in cooldown for ${remainingDays} more days.`);
      return;
    }
    if (activeCommitment && activeCommitment.requestId !== request.id) {
      setPledgeError(COMMITMENT_ERROR_MSG);
      return;
    }

    setIsPledging(true);
    setPledgeError("");
    try {
      const result = await acceptDonationPledge({
        request,
        donorUid: user.uid,
        donorProfile,
        userEmail: user.email,
      });

      setDonation(result.donation);
      if (onDonationChange) onDonationChange();
    } catch (err) {
      console.error("Error creating donation pledge:", err);
      setPledgeError(err.message || "Unable to pledge donation. Please try again.");
    } finally {
      setIsPledging(false);
    }
  };

  // CANCELLATION: Soft cancellation, releases commitment lock and reopens request if blood still needed
  const handleCancelDonation = async () => {
    if (!donation || !cancelReason.trim()) return;
    setIsCancelling(true);
    try {
      await cancelDonorDonation({
        requestId: request.id,
        donationId: donation.id,
        donorUid: user.uid,
        reason: cancelReason.trim(),
      });

      setDonation(prev => prev ? ({
        ...prev,
        status: 'CANCELLED',
        cancelledByUid: user.uid,
        cancellationReason: cancelReason.trim()
      }) : null);
      setShowCancelModal(false);
      setCancelReason("");
      if (onDonationChange) onDonationChange();
    } catch (e) {
      console.error("Cancellation error:", e);
      setPledgeError(e.message || "Failed to cancel pledge.");
    } finally {
      setIsCancelling(false);
    }
  };

  const isCompleted = isDonationCompleted(donation);
  const isCancelled = isDonationCancelled(donation);
  const isActive = isDonationActive(donation);
  const hasOtherActiveCommitment = Boolean(activeCommitment && activeCommitment.requestId !== request.id);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
      <div className="p-5 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-extrabold text-lg text-gray-900">
                {request.patientName || request.PatientName}
              </span>
              {(request.isEmergency || request.urgencyLevel === 'CRITICAL' || request.EmergencyLevel === 'high') && (
                <span className="bg-red-100 text-red-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Critical Emergency
                </span>
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
                {request.city || request.City} {request.area ? `(${request.area})` : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="inline-block bg-red-50 text-red-700 border border-red-200 font-extrabold text-sm px-3 py-1 rounded-xl">
                {reqBlood}
              </span>
              <span className="block text-[10px] text-gray-400 mt-1">
                {request.unitsNeeded || request.UnitsNeeded} Unit(s)
              </span>
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {/* Action / State Area */}
      <div className="border-t border-gray-100 bg-gray-50/50 p-4">
        {isCompleted ? (
          <div className="flex items-center justify-between text-green-800 bg-green-50 p-3.5 rounded-xl border border-green-200 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <Check className="w-4 h-4 text-green-600" />
              Donation Completed & Fully Verified!
            </div>
            <span className="text-green-700 font-medium">Thank you for saving a life.</span>
          </div>
        ) : isActive ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={donation.status || 'OTP_PENDING'} />
                <span className="text-xs font-semibold text-gray-700">Donation In Progress</span>
              </div>
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-red-600 hover:underline font-semibold text-xs"
              >
                Cancel Pledge
              </button>
            </div>

            {/* Dual OTP Verification Flow for Donor */}
            <DualOtpVerification
              donation={donation}
              request={request}
              currentRole="DONOR"
              currentUser={user}
              onStatusChange={(updatedFields) => {
                setDonation(prev => ({ ...prev, ...updatedFields }));
                if (onDonationChange) onDonationChange();
              }}
            />
          </div>
        ) : (
          <div>
            {isCancelled && (
              <div className="mb-3 p-2.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-gray-200 text-gray-700 font-bold px-2 py-0.5 rounded text-[10px]">CANCELLED</span>
                  <span>Your previous pledge for this request was cancelled.</span>
                </div>
                {donation?.cancellationReason && (
                  <span className="text-gray-500 italic text-[11px]">Reason: {donation.cancellationReason}</span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-gray-500">
                {!isRequestActive(request)
                  ? 'This blood request is fulfilled or closed.'
                  : hasOtherActiveCommitment
                  ? 'You already have an active donation commitment.'
                  : isCompatible 
                  ? 'Your blood group is compatible for this patient.' 
                  : 'Blood group does not match your profile.'}
              </p>
              <Button
                onClick={handlePledgeDonation}
                disabled={!isRequestActive(request) || !isCompatible || !isEligible || isPledging || hasOtherActiveCommitment}
                className={`px-6 font-bold text-xs py-2 rounded-lg transition-colors ${
                  !isRequestActive(request) || !isCompatible || !isEligible || hasOtherActiveCommitment
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                }`}
              >
                {isPledging
                  ? 'Pledging...'
                  : hasOtherActiveCommitment
                  ? 'Active Commitment Ongoing'
                  : !isEligible
                  ? `Eligible in ${remainingDays}d`
                  : isCancelled
                  ? 'Re-Pledge Donation'
                  : 'Pledge Donation'}
              </Button>
            </div>
            {(pledgeError || (hasOtherActiveCommitment && !isCancelled)) && (
              <p className="text-xs text-red-600 font-medium mt-2">
                {pledgeError || (hasOtherActiveCommitment ? COMMITMENT_ERROR_MSG : '')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details Drawer */}
      {isExpanded && (
        <div className="p-5 border-t border-gray-100 bg-white text-xs text-gray-600 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-gray-400 block mb-0.5">Medical Reason:</span>
              <p className="font-medium text-gray-800">{request.reason || request.Reason || 'Not specified'}</p>
            </div>
            <div>
              <span className="text-gray-400 block mb-0.5">Attender Contact:</span>
              <p className="font-medium text-gray-800">{request.attenderName || request.AttenderName} ({request.attenderMobile || request.AttenderMobile})</p>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Pledge Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-gray-900 text-base mb-2">Cancel Donation Pledge</h3>
            <p className="text-xs text-gray-500 mb-4">
              Please let the patient know why you need to cancel so we can alert backup donors immediately.
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Unable to travel to hospital, unwell today..."
              className="w-full p-2.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-red-500"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowCancelModal(false)}>
                Back
              </Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCancelDonation}>
                Confirm Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
