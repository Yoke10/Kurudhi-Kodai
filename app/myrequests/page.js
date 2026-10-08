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
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Navbar from '@/components/Navbar';
import { verifyOtpAttempt, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS } from '@/lib/otpService';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { sendNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import {
  Activity, Check, ChevronDown, ChevronRight, Clock, Droplet,
  FileText, HeartHandshake, ListChecks, Users, Hospital, MapPin, AlertCircle
} from 'lucide-react';
import Link from 'next/link';

// 4-Digit OTP Input
function OtpInput({ length = 4, onChange }) {
  const [otp, setOtp] = useState(new Array(length).fill(""));
  const inputRefs = useRef([]);

  useEffect(() => {
    onChange(otp.join(""));
  }, [otp, onChange]);

  const handleChange = (e, index) => {
    const val = e.target.value.replace(/\D/g, "");
    if (!val && val !== "") return;

    const newOtp = [...otp];
    newOtp[index] = val.slice(-1);
    setOtp(newOtp);

    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
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
          className="w-12 h-12 text-center text-xl font-bold border-2 border-red-300 rounded-xl bg-white text-gray-900 shadow-sm focus:border-red-600 focus:outline-none"
          value={digit}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          autoFocus={index === 0}
        />
      ))}
    </div>
  );
}

export default function MyRequestsPage() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    fulfilled: 0,
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
      onSnapshot(q2, (snap2) => {
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
        let donatedSum = 0;

        combined.forEach(req => {
          const st = (req.status || req.Verified || '').toLowerCase();
          if (st === 'fulfilled' || st === 'completed') fulfilledCount++;
          else if (st !== 'cancelled' && st !== 'rejected') activeCount++;

          donatedSum += parseInt(req.unitsDonated || req.UnitsDonated || 0, 10);
        });

        setStats({
          total: combined.length,
          active: activeCount,
          fulfilled: fulfilledCount,
          unitsDonated: donatedSum,
        });
      });
    });

    return () => unsub1();
  }, [user]);

  const filtered = myRequests.filter(req => {
    const st = (req.status || req.Verified || '').toLowerCase();
    if (activeTab === 'active') return st === 'active' || st === 'accepted' || st === 'matching' || st === 'received';
    if (activeTab === 'fulfilled') return st === 'fulfilled' || st === 'completed';
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

  useEffect(() => {
    const donRef = collection(db, 'requests', request.id, 'donations');
    const unsub = onSnapshot(donRef, (snap) => {
      setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [request.id]);

  const unitsNeeded = parseInt(request.unitsNeeded || request.UnitsNeeded || 1, 10);
  const unitsDonated = parseInt(request.unitsDonated || request.UnitsDonated || 0, 10);
  const isFulfilled = unitsDonated >= unitsNeeded;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 cursor-pointer bg-white" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-extrabold text-lg text-gray-900">
                {request.patientName || request.PatientName}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                isFulfilled ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {isFulfilled ? 'Fulfilled' : 'Active Matching'}
              </span>
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
          <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            Matched Donors ({donations.length})
          </h4>

          {donations.length > 0 ? (
            <div className="space-y-3">
              {donations.map(don => (
                <RequesterDonationItem
                  key={don.id}
                  donation={don}
                  request={request}
                  currentUser={currentUser}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-xs text-gray-500">
              No donors have pledged yet. We are actively matching your request with eligible local donors.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Subcomponent: Verification Card for Requester to confirm a Donor
function RequesterDonationItem({ donation, request, currentUser }) {
  const [enteredOtp, setEnteredOtp] = useState("");
  const [requesterVerbalOtp, setRequesterVerbalOtp] = useState("");
  const [isGeneratingOtp, setIsGeneratingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
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

  // Generate / reveal verbal code to give to the donor at hospital
  const handleGenerateRequesterOtp = async () => {
    if (!donation || !currentUser) return;
    setIsGeneratingOtp(true);
    setOtpError("");
    try {
      const res = await fetch('/api/donations/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-requester-otp',
          requestId: request.id,
          donationId: donation.id,
          userUid: currentUser.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to generate confirmation code');
      } else {
        setRequesterVerbalOtp(data.requesterOtp);
      }
    } catch (err) {
      console.error('Error generating requester verbal code:', err);
      alert('Network error while generating code.');
    } finally {
      setIsGeneratingOtp(false);
    }
  };

  // Verify donor's verbal code via secure server API
  const handleVerifyDonorOtp = async () => {
    if (!enteredOtp || enteredOtp.length !== 4) return;
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
          userUid: currentUser.uid,
          otp: enteredOtp.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Incorrect or expired code");
        return;
      }

      alert("Donation successfully confirmed and recorded! Thank you.");
    } catch (err) {
      console.error("Verification error:", err);
      setOtpError(err.message || "Failed to confirm donation.");
    } finally {
      setIsVerifying(false);
    }
  };

  const isCompleted = donation.completed || donation.status === 'DONATION_COMPLETED';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-xs space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-bold text-gray-900 text-sm block">
            {donation.donorName || donorDetails?.name || donorDetails?.Name || 'Anonymous Donor'}
          </span>
          <span className="text-gray-500 font-mono">
            {donorDetails?.mobile || donorDetails?.MobileNumber || donation.donorEmail}
          </span>
        </div>

        <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
          isCompleted ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {isCompleted ? 'Completed' : 'Awaiting On-Site Verification'}
        </span>
      </div>

      {isCompleted ? (
        <div className="bg-green-50 text-green-800 p-2.5 rounded-lg font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          Donation confirmed and verified on-site.
        </div>
      ) : (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-3">
          {/* Tell donor your requester verbal OTP */}
          <div className="bg-white p-3 rounded-lg border border-amber-200 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-[11px]">Your 4-Digit Requester Code (give to donor at hospital):</p>
              {requesterVerbalOtp ? (
                <p className="text-2xl font-black text-red-700 tracking-widest mt-0.5">{requesterVerbalOtp}</p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateRequesterOtp}
                  disabled={isGeneratingOtp}
                  className="mt-1 text-xs border-red-300 text-red-700 hover:bg-red-50"
                >
                  {isGeneratingOtp ? 'Generating...' : 'Reveal / Generate My Code'}
                </Button>
              )}
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 block max-w-[120px]">
                Valid for 10 minutes.
              </span>
              {requesterVerbalOtp && (
                <button
                  onClick={handleGenerateRequesterOtp}
                  disabled={isGeneratingOtp}
                  className="text-[10px] text-red-600 hover:underline mt-1 font-semibold"
                >
                  Regenerate Code
                </button>
              )}
            </div>
          </div>

          {/* Enter OTP given by donor */}
          <div>
            <p className="font-semibold text-gray-800 mb-2">
              Enter the 4-digit code given by the donor to confirm donation:
            </p>
            <OtpInput onChange={setEnteredOtp} />

            {otpError && (
              <p className="text-red-600 font-medium text-xs mt-2 text-center">{otpError}</p>
            )}

            <Button
              onClick={handleVerifyDonorOtp}
              disabled={isVerifying || enteredOtp.length !== 4}
              className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg"
            >
              {isVerifying ? 'Confirming...' : 'Verify Donor Code & Confirm Donation'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
