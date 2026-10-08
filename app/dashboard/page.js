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
  updateDoc,
  where,
  runTransaction,
  increment,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isBloodGroupCompatible } from '@/lib/bloodCompatibility';
import { calculateDonorCooldown } from '@/lib/matchingEngine';
import { generateSecure4DigitOtp, verifyOtpAttempt, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS } from '@/lib/otpService';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { sendNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import {
  AlertCircle, Check, ChevronDown, Clock, Droplet, Hospital,
  Info, MapPin, Share2, Shield, HeartHandshake, X
} from 'lucide-react';

// Secure 4-Digit OTP Input
function OtpInput({ length = 4, onChange, inputClassName = "w-12 h-12 text-center text-xl font-bold border-2 border-red-300 rounded-xl bg-white text-gray-900 shadow-sm focus:border-red-600 focus:outline-none" }) {
  const [otp, setOtp] = useState(new Array(length).fill(""));
  const inputRefs = useRef([]);

  useEffect(() => {
    onChange(otp.join(""));
  }, [otp, onChange]);

  const handleChange = (e, index) => {
    const value = e.target.value.replace(/\D/g, "");
    if (!value && value !== "") return;

    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex justify-center gap-3">
      {otp.map((digit, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          className={inputClassName}
          value={digit}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          autoFocus={index === 0}
        />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user, donorProfile, isDonor } = useAuth();
  const [requests, setRequests] = useState([]);
  const [userDonations, setUserDonations] = useState([]);
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

  // Fetch user donations efficiently without looping full collection
  useEffect(() => {
    if (!user) return;

    // Listen to donations where user is donor
    let active = true;
    const fetchDonations = async () => {
      try {
        const found = [];
        // Check top requests currently active or user's active pledges
        for (const req of requests) {
          const donRef = collection(db, "requests", req.id, "donations");
          const q = query(donRef, where("donorId", "==", user.uid));
          const snap = await getDocs(q);
          snap.forEach(d => {
            found.push({ id: d.id, requestId: req.id, ...d.data() });
          });
        }
        if (active) {
          setUserDonations(found);
        }
      } catch (e) {
        console.warn("Error fetching user donations:", e);
      }
    };

    if (requests.length > 0) {
      fetchDonations();
    }

    return () => { active = false; };
  }, [user, requests.length]);

  // Compute stats
  useEffect(() => {
    let activeCount = 0;
    let eligibleCount = 0;
    let totalEligibleUnits = 0;

    const donorBlood = donorProfile?.bloodGroup || donorProfile?.BloodGroup;

    requests.forEach(req => {
      const status = (req.status || req.Verified || '').toLowerCase();
      const isActive = status === 'active' || status === 'accepted' || status === 'received';

      if (isActive) {
        activeCount++;
        const reqBlood = req.bloodGroup || req.BloodGroup;
        const anyAccepted = req.anyBloodGroupAccepted || req.AnyBloodGroupAccepted || false;

        if (donorBlood && isBloodGroupCompatible(donorBlood, reqBlood, anyAccepted)) {
          eligibleCount++;
          totalEligibleUnits += parseInt(req.unitsNeeded || req.UnitsNeeded || 1, 10);
        }
      }
    });

    const completed = userDonations.filter(d => d.completed || d.status === 'DONATION_COMPLETED').length;

    setStats({
      activeRequests: activeCount,
      eligibleRequests: eligibleCount,
      completedDonations: completed,
      unitsNeeded: totalEligibleUnits,
    });
  }, [requests, donorProfile, userDonations]);

  const donorBlood = donorProfile?.bloodGroup || donorProfile?.BloodGroup;
  const { isEligible, remainingDays } = calculateDonorCooldown(donorProfile?.lastDonationAt || donorProfile?.lastDonationDate);

  // Filter requests for tabs
  const filteredRequests = requests.filter(request => {
    const status = (request.status || request.Verified || '').toLowerCase();
    const isCompleted = status === 'completed' || status === 'fulfilled';
    const isActive = status === 'active' || status === 'accepted' || status === 'received' || status === 'matching' || status === 'partially_fulfilled';

    if (activeTab === 'active') {
      return isActive;
    }
    if (activeTab === 'completed') {
      // User contributed to this request or it is completed
      const donationReqIds = userDonations.map(d => d.requestId);
      return donationReqIds.includes(request.id) || isCompleted;
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
            Completed
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
function DonorRequestCard({ request, user, donorProfile, isEligible, remainingDays, userDonation }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [donation, setDonation] = useState(userDonation || null);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [donorVerbalOtp, setDonorVerbalOtp] = useState("");
  const [isGeneratingOtp, setIsGeneratingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const reqBlood = request.bloodGroup || request.BloodGroup;
  const donorBlood = donorProfile?.bloodGroup || donorProfile?.BloodGroup;
  const anyAcc = request.anyBloodGroupAccepted || request.AnyBloodGroupAccepted || false;
  const isCompatible = donorBlood && isBloodGroupCompatible(donorBlood, reqBlood, anyAcc);

  // Sync state if userDonation changes
  useEffect(() => {
    if (userDonation) setDonation(userDonation);
  }, [userDonation]);

  // PLEDGE DONATION: Initial record created; OTPs generated via secure server API
  const handlePledgeDonation = async () => {
    if (!user || !donorProfile) return;
    if (!isEligible) {
      alert(`You are currently in cooldown for ${remainingDays} more days.`);
      return;
    }

    try {
      const donationData = {
        requestId: request.id,
        donorId: user.uid,
        donorUid: user.uid,
        donorEmail: user.email,
        donorName: donorProfile.name || donorProfile.Name || 'Anonymous Donor',
        donorBloodGroup: donorBlood,
        donorOtpVerified: false,
        requesterOtpVerified: false,
        completed: false,
        status: 'OTP_PENDING',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "requests", request.id, "donations"), donationData);
      setDonation({ id: docRef.id, ...donationData });

      // Request verbal code from secure server API (stores SHA-256 hash in Firestore, delivers code in memory)
      try {
        const res = await fetch('/api/donations/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate-donor-otp',
            requestId: request.id,
            donationId: docRef.id,
            userUid: user.uid,
          }),
        });
        const otpData = await res.json();
        if (otpData.donorOtp) {
          setDonorVerbalOtp(otpData.donorOtp);
        }
      } catch (otpErr) {
        console.warn("Notice generating initial verbal OTP:", otpErr);
      }

      // In-App Notification to Request Creator
      if (request.createdByUid || request.uuid) {
        await sendNotification({
          recipientUid: request.createdByUid || request.uuid,
          type: NOTIFICATION_TYPES.DONOR_ACCEPTED,
          title: 'Donor Matched for Your Request!',
          message: `${donorProfile.name || 'A donor'} has pledged to donate ${reqBlood} blood for ${request.patientName || request.PatientName}.`,
          requestId: request.id,
          donationId: docRef.id,
        });
      }

      await logAuditEvent({
        action: AUDIT_ACTIONS.DONOR_ACCEPTED,
        actorUid: user.uid,
        entityType: 'donation',
        entityId: docRef.id,
        metadata: { requestId: request.id },
      });

    } catch (err) {
      console.error("Error creating donation pledge:", err);
      alert("Unable to pledge donation. Please try again.");
    }
  };

  // Generate or regenerate donor's 4-digit verbal code via secure server API
  const handleGenerateDonorOtp = async () => {
    if (!donation || !user) return;
    setIsGeneratingOtp(true);
    setOtpError("");
    try {
      const res = await fetch('/api/donations/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-donor-otp',
          requestId: request.id,
          donationId: donation.id,
          userUid: user.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to generate verbal code');
      } else {
        setDonorVerbalOtp(data.donorOtp);
      }
    } catch (err) {
      console.error('Error generating donor verbal OTP:', err);
      alert('Network error while generating code.');
    } finally {
      setIsGeneratingOtp(false);
    }
  };

  // VERIFY REQUESTER'S OTP VIA SECURE SERVER API
  const handleVerifyOtp = async () => {
    if (!donation || !enteredOtp) return;
    setIsVerifying(true);
    setOtpError("");

    try {
      const res = await fetch('/api/donations/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-counterparty-otp',
          requestId: request.id,
          donationId: donation.id,
          userUid: user.uid,
          otp: enteredOtp.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Verification failed");
        return;
      }

      // Server executed atomic completion & cooldown update
      setDonation(prev => ({
        ...prev,
        donorOtpVerified: true,
        completed: true,
        status: 'DONATION_COMPLETED'
      }));
      alert("Donation successfully verified and recorded! Thank you for saving a life.");

    } catch (err) {
      console.error("Verification error:", err);
      setOtpError(err.message || "Failed to finalize verification transaction.");
    } finally {
      setIsVerifying(false);
    }
  };

  // CANCELLATION: Never delete historical documents, mark as CANCELLED
  const handleCancelDonation = async () => {
    if (!donation || !cancelReason.trim()) return;
    try {
      const donationRef = doc(db, "requests", request.id, "donations", donation.id);
      await updateDoc(donationRef, {
        status: 'CANCELLED',
        cancelledBy: user.uid,
        cancellationReason: cancelReason.trim(),
        cancelledAt: serverTimestamp(),
      });

      await logAuditEvent({
        action: AUDIT_ACTIONS.DONATION_CANCELLED,
        actorUid: user.uid,
        entityType: 'donation',
        entityId: donation.id,
        metadata: { reason: cancelReason },
      });

      setDonation(null);
      setShowCancelModal(false);
      setCancelReason("");
      alert("Donation pledge cancelled.");
    } catch (e) {
      console.error("Cancellation error:", e);
      alert("Failed to cancel pledge.");
    }
  };

  const isCompleted = donation?.completed || donation?.status === 'DONATION_COMPLETED';

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
          <div className="flex items-center justify-between text-green-800 bg-green-50 p-3 rounded-xl border border-green-200 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <Check className="w-4 h-4 text-green-600" />
              Donation Completed & Verified!
            </div>
            <span className="text-green-700 font-medium">Thank you for saving a life.</span>
          </div>
        ) : donation ? (
          <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900 flex items-center gap-1.5 text-sm">
                <Shield className="w-4 h-4 text-amber-700" />
                Donation In Progress
              </span>
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-red-600 hover:underline font-semibold"
              >
                Cancel Pledge
              </button>
            </div>

            {/* Instruction: Tell requester your verbal OTP */}
            <div className="bg-white p-3 rounded-lg border border-amber-200 flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-[11px]">Your 4-Digit Donor Verbal Code (speak to requester upon arrival):</p>
                {donorVerbalOtp ? (
                  <p className="text-2xl font-black text-red-700 tracking-widest mt-0.5">{donorVerbalOtp}</p>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateDonorOtp}
                    disabled={isGeneratingOtp}
                    className="mt-1 text-xs border-red-300 text-red-700 hover:bg-red-50"
                  >
                    {isGeneratingOtp ? 'Generating...' : 'Reveal / Generate My Code'}
                  </Button>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 block max-w-[140px]">
                  Verifies physical arrival. Valid for 10 minutes.
                </span>
                {donorVerbalOtp && (
                  <button
                    onClick={handleGenerateDonorOtp}
                    disabled={isGeneratingOtp}
                    className="text-[10px] text-red-600 hover:underline mt-1 font-semibold"
                  >
                    Regenerate Code
                  </button>
                )}
              </div>
            </div>

            {/* Prompt to enter requester's OTP */}
            <div className="pt-2">
              <p className="font-semibold text-gray-800 mb-2">
                Enter the 4-digit OTP provided by the patient/requester:
              </p>
              <OtpInput onChange={setEnteredOtp} />

              {otpError && (
                <p className="text-red-600 font-medium text-xs mt-2 text-center">{otpError}</p>
              )}

              <Button
                onClick={handleVerifyOtp}
                disabled={isVerifying || enteredOtp.length !== 4}
                className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg"
              >
                {isVerifying ? 'Verifying OTP...' : 'Confirm & Complete Donation'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              {isCompatible 
                ? 'Your blood group is compatible for this patient.' 
                : 'Blood group does not match your profile.'}
            </p>
            <Button
              onClick={handlePledgeDonation}
              disabled={!isCompatible || !isEligible}
              className={`px-6 font-bold text-xs py-2 rounded-lg transition-colors ${
                !isCompatible || !isEligible
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
              }`}
            >
              {!isEligible ? `Eligible in ${remainingDays}d` : 'Pledge Donation'}
            </Button>
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
