'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ROLES, normalizeRole, isAdminRole } from '@/lib/roles';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auditLogger';

// Modular Admin Components
import AdminShell from '@/components/admin/AdminShell';
import AdminOverview from '@/components/admin/AdminOverview';
import AdminRequestsTab from '@/components/admin/AdminRequestsTab';
import AdminDonationsTab from '@/components/admin/AdminDonationsTab';
import AdminDonorsTab from '@/components/admin/AdminDonorsTab';
import AdminCampsTab from '@/components/admin/AdminCampsTab';
import SupportPage from '../support/page';

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [assignedCity, setAssignedCity] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Collections state
  const [requests, setRequests] = useState([]);
  const [donations, setDonations] = useState([]);
  const [donors, setDonors] = useState([]);
  const [camps, setCamps] = useState([]);

  // Loading states
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const [loadingDonors, setLoadingDonors] = useState(true);
  const [loadingCamps, setLoadingCamps] = useState(true);

  // Authentication & Role Check
  useEffect(() => {
    if (!user) {
      router.replace('/signin');
      return;
    }

    const checkAuthorization = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          const role = normalizeRole(userData.role);

          if (!isAdminRole(role)) {
            router.replace('/');
            return;
          }

          setUserRole(role);
          setAssignedCity(userData.assignedCity || '');
        } else {
          router.replace('/');
        }
      } catch (err) {
        console.error('Error verifying admin permissions:', err);
        router.replace('/');
      } finally {
        setLoading(false);
      }
    };

    checkAuthorization();
  }, [user, router]);

  // Subscribe to Requests (scoped by assignedCity if regional Admin)
  useEffect(() => {
    if (!userRole) return;
    setLoadingRequests(true);

    const reqCollection = collection(db, 'requests');
    let q = query(reqCollection);

    if (userRole === ROLES.ADMIN && assignedCity) {
      q = query(reqCollection, where('City', '==', assignedCity));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Also client-side filter case-insensitively if legacy mixed case exists
        const filtered = assignedCity && userRole === ROLES.ADMIN
          ? list.filter((r) => (r.city || r.City || '').toLowerCase() === assignedCity.toLowerCase())
          : list;

        setRequests(filtered);
        setLoadingRequests(false);
      },
      (err) => {
        console.warn('Requests listener notice:', err);
        setLoadingRequests(false);
      }
    );

    return () => unsubscribe();
  }, [userRole, assignedCity]);

  // Requests lookup map for easy joining
  const requestsMap = useMemo(() => {
    const map = {};
    requests.forEach((r) => {
      map[r.id] = r;
    });
    return map;
  }, [requests]);

  // Subscribe to Donations
  useEffect(() => {
    if (!userRole) return;
    setLoadingDonations(true);

    try {
      const donGroup = collectionGroup(db, 'donations');
      const unsubscribe = onSnapshot(
        donGroup,
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          // If regional admin, keep donations belonging to requests in assigned city
          const filtered = assignedCity && userRole === ROLES.ADMIN
            ? list.filter((d) => {
                const req = requestsMap[d.requestId];
                return req ? (req.city || req.City || '').toLowerCase() === assignedCity.toLowerCase() : true;
              })
            : list;

          setDonations(filtered);
          setLoadingDonations(false);
        },
        (err) => {
          console.warn('Donations collectionGroup notice:', err);
          setLoadingDonations(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.warn('Error setting up donations listener:', err);
      setLoadingDonations(false);
    }
  }, [userRole, assignedCity, requestsMap]);

  // Subscribe to Donors
  useEffect(() => {
    if (!userRole) return;
    setLoadingDonors(true);

    const donorsCol = collection(db, 'donors');
    let q = query(donorsCol);

    if (userRole === ROLES.ADMIN && assignedCity) {
      q = query(donorsCol, where('city', '==', assignedCity));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = assignedCity && userRole === ROLES.ADMIN
          ? list.filter((dn) => (dn.city || dn.City || '').toLowerCase() === assignedCity.toLowerCase())
          : list;

        setDonors(filtered);
        setLoadingDonors(false);
      },
      (err) => {
        console.warn('Donors listener notice:', err);
        setLoadingDonors(false);
      }
    );

    return () => unsubscribe();
  }, [userRole, assignedCity]);

  // Subscribe to Camps
  useEffect(() => {
    if (!userRole) return;
    setLoadingCamps(true);

    const campsCol = collection(db, 'camps');
    let q = query(campsCol);

    if (userRole === ROLES.ADMIN && assignedCity) {
      q = query(campsCol, where('city', '==', assignedCity));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCamps(list);
        setLoadingCamps(false);
      },
      (err) => {
        console.warn('Camps listener notice:', err);
        setLoadingCamps(false);
      }
    );

    return () => unsubscribe();
  }, [userRole, assignedCity]);

  // Operational Actions: Verify Request
  const handleVerifyRequest = async (requestId) => {
    try {
      const reqRef = doc(db, 'requests', requestId);
      await updateDoc(reqRef, {
        Verified: 'verified',
        status: 'ACCEPTED',
        updatedAt: serverTimestamp(),
      });

      await logAuditEvent({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorUid: user.uid,
        entityType: 'request',
        entityId: requestId,
        metadata: { actionType: 'VERIFY_REQUEST' },
      });
    } catch (err) {
      console.error('Error verifying request:', err);
    }
  };

  // Operational Actions: Reject Request
  const handleRejectRequest = async (requestId, reason) => {
    try {
      const reqRef = doc(db, 'requests', requestId);
      await updateDoc(reqRef, {
        status: 'REJECTED',
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
      });

      await logAuditEvent({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorUid: user.uid,
        entityType: 'request',
        entityId: requestId,
        metadata: { actionType: 'REJECT_REQUEST', reason },
      });
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  // Operational Actions: Toggle Emergency
  const handleToggleEmergency = async (requestId, isEmergency) => {
    try {
      const reqRef = doc(db, 'requests', requestId);
      await updateDoc(reqRef, {
        isEmergency,
        urgencyLevel: isEmergency ? 'CRITICAL' : 'STANDARD',
        updatedAt: serverTimestamp(),
      });

      await logAuditEvent({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorUid: user.uid,
        entityType: 'request',
        entityId: requestId,
        metadata: { actionType: 'TOGGLE_EMERGENCY', isEmergency },
      });
    } catch (err) {
      console.error('Error updating emergency status:', err);
    }
  };

  // Sub-queries: Matched Donors
  const handleFetchDonorsForRequest = async (requestId) => {
    try {
      const donRef = collection(db, 'requests', requestId, 'donations');
      const snap = await getDocs(donRef);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('Error fetching donors for request:', err);
      return [];
    }
  };

  // Sub-queries: Cancellations
  const handleFetchCancellationsForRequest = async (requestId) => {
    try {
      const canRef = collection(db, 'requests', requestId, 'cancellations');
      const snap = await getDocs(canRef);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('Error fetching cancellations for request:', err);
      return [];
    }
  };

  // Create Blood Camp
  const handleCreateCamp = async (campData) => {
    try {
      const campsCol = collection(db, 'camps');
      await addDoc(campsCol, {
        ...campData,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
      });

      await logAuditEvent({
        action: AUDIT_ACTIONS.CAMP_CREATED,
        actorUid: user.uid,
        entityType: 'camp',
        entityId: campData.name,
        metadata: { city: campData.city },
      });
    } catch (err) {
      console.error('Error creating camp:', err);
    }
  };

  // Aggregated KPI Stats
  const stats = useMemo(() => {
    const activeRequests = requests.filter((r) =>
      ['PENDING', 'ACCEPTED', 'PARTIALLY_FULFILLED'].includes(r.status || 'PENDING')
    ).length;

    const emergencyRequests = requests.filter(
      (r) => r.isEmergency || r.urgencyLevel === 'CRITICAL' || r.EmergencyLevel === 'high'
    ).length;

    const pendingVerification = requests.filter((r) => (r.status || 'PENDING') === 'PENDING').length;

    const completedDonations = donations.filter(
      (d) => d.completed === true || d.status === 'DONATION_COMPLETED'
    ).length;

    const pendingDualOtp = donations.filter(
      (d) => !d.completed && d.status !== 'DONATION_COMPLETED' && d.status !== 'CANCELLED'
    ).length;

    const rejectedRequests = requests.filter((r) =>
      ['REJECTED', 'CANCELLED'].includes(r.status)
    ).length;

    const upcomingCamps = camps.filter((c) => {
      const d = new Date(c.date);
      return !isNaN(d.getTime()) && d >= new Date();
    }).length;

    return {
      activeRequests,
      emergencyRequests,
      pendingVerification,
      completedDonations,
      pendingDualOtp,
      totalDonors: donors.length,
      upcomingCamps,
      rejectedRequests,
    };
  }, [requests, donations, donors, camps]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-9 h-9 border-3 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 font-medium">Verifying administrator credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      role={userRole || 'ADMIN'}
      assignedCity={assignedCity}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      badgeCounts={{
        requests: stats.pendingVerification,
        donations: stats.pendingDualOtp,
        donors: stats.totalDonors,
      }}
    >
      {activeTab === 'overview' && (
        <AdminOverview
          stats={stats}
          assignedCity={assignedCity}
          onNavigateTab={setActiveTab}
        />
      )}

      {activeTab === 'requests' && (
        <AdminRequestsTab
          requests={requests}
          isLoading={loadingRequests}
          onVerifyRequest={handleVerifyRequest}
          onRejectRequest={handleRejectRequest}
          onToggleEmergency={handleToggleEmergency}
          onFetchDonorsForRequest={handleFetchDonorsForRequest}
          onFetchCancellationsForRequest={handleFetchCancellationsForRequest}
        />
      )}

      {activeTab === 'donations' && (
        <AdminDonationsTab
          donations={donations}
          requestsMap={requestsMap}
          isLoading={loadingDonations}
        />
      )}

      {activeTab === 'donors' && (
        <AdminDonorsTab
          donors={donors}
          isLoading={loadingDonors}
          assignedCity={assignedCity}
        />
      )}

      {activeTab === 'camps' && (
        <AdminCampsTab
          camps={camps}
          isLoading={loadingCamps}
          onCreateCamp={handleCreateCamp}
          assignedCity={assignedCity}
        />
      )}

      {activeTab === 'support' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <SupportPage />
        </div>
      )}
    </AdminShell>
  );
}
