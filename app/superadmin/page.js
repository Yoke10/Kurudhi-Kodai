'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
  updateDoc,
  addDoc,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ROLES, normalizeRole, isSuperAdminRole } from '@/lib/roles';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auditLogger';

// Modular Admin Components
import AdminShell from '@/components/admin/AdminShell';
import AdminOverview from '@/components/admin/AdminOverview';
import AdminRequestsTab from '@/components/admin/AdminRequestsTab';
import AdminDonationsTab from '@/components/admin/AdminDonationsTab';
import AdminDonorsTab from '@/components/admin/AdminDonorsTab';
import AdminCampsTab from '@/components/admin/AdminCampsTab';
import AdminUsersTab from '@/components/admin/AdminUsersTab';
import AdminAuditTab from '@/components/admin/AdminAuditTab';
import SupportPage from '../support/page';

export default function SuperAdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Collections state
  const [requests, setRequests] = useState([]);
  const [donations, setDonations] = useState([]);
  const [donors, setDonors] = useState([]);
  const [camps, setCamps] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Loading states
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const [loadingDonors, setLoadingDonors] = useState(true);
  const [loadingCamps, setLoadingCamps] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);

  // Authorization Check
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

          if (!isSuperAdminRole(role)) {
            router.replace('/');
            return;
          }
        } else {
          router.replace('/');
        }
      } catch (err) {
        console.error('Error verifying superadmin permissions:', err);
        router.replace('/');
      } finally {
        setLoading(false);
      }
    };

    checkAuthorization();
  }, [user, router]);

  // Subscribe to all Requests
  useEffect(() => {
    if (loading) return;
    setLoadingRequests(true);

    const q = query(collection(db, 'requests'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRequests(list);
        setLoadingRequests(false);
      },
      (err) => {
        console.warn('Requests listener notice:', err);
        setLoadingRequests(false);
      }
    );

    return () => unsubscribe();
  }, [loading]);

  // Requests lookup map
  const requestsMap = useMemo(() => {
    const map = {};
    requests.forEach((r) => {
      map[r.id] = r;
    });
    return map;
  }, [requests]);

  // Subscribe to all Donations via collectionGroup
  useEffect(() => {
    if (loading) return;
    setLoadingDonations(true);

    try {
      const donGroup = collectionGroup(db, 'donations');
      const unsubscribe = onSnapshot(
        donGroup,
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setDonations(list);
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
  }, [loading]);

  // Subscribe to all Donors
  useEffect(() => {
    if (loading) return;
    setLoadingDonors(true);

    const q = query(collection(db, 'donors'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDonors(list);
        setLoadingDonors(false);
      },
      (err) => {
        console.warn('Donors listener notice:', err);
        setLoadingDonors(false);
      }
    );

    return () => unsubscribe();
  }, [loading]);

  // Subscribe to Camps
  useEffect(() => {
    if (loading) return;
    setLoadingCamps(true);

    const q = query(collection(db, 'camps'));
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
  }, [loading]);

  // Subscribe to Users collection
  useEffect(() => {
    if (loading) return;
    setLoadingUsers(true);

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsers(list);
        setLoadingUsers(false);
      },
      (err) => {
        console.warn('Users listener notice:', err);
        setLoadingUsers(false);
      }
    );

    return () => unsubscribe();
  }, [loading]);

  // Subscribe to Audit Logs (last 100 entries)
  useEffect(() => {
    if (loading) return;
    setLoadingAudit(true);

    try {
      const q = query(
        collection(db, 'auditLogs'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setAuditLogs(list);
          setLoadingAudit(false);
        },
        (err) => {
          console.warn('Audit logs listener notice:', err);
          setLoadingAudit(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.warn('Error querying audit logs:', err);
      setLoadingAudit(false);
    }
  }, [loading]);

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
        metadata: { actionType: 'SUPERADMIN_VERIFY_REQUEST' },
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
        metadata: { actionType: 'SUPERADMIN_REJECT_REQUEST', reason },
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
        metadata: { actionType: 'SUPERADMIN_TOGGLE_EMERGENCY', isEmergency },
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

  // User Role Management (Superadmin Only)
  const handleUpdateUserRole = async (targetUid, newRole, assignedCity = '') => {
    try {
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        role: newRole,
        assignedCity: newRole === ROLES.ADMIN ? assignedCity : '',
        updatedAt: serverTimestamp(),
      });

      await logAuditEvent({
        action: AUDIT_ACTIONS.ROLE_CHANGED,
        actorUid: user.uid,
        entityType: 'user',
        entityId: targetUid,
        metadata: { newRole, assignedCity },
      });
    } catch (err) {
      console.error('Error updating role:', err);
      throw err;
    }
  };

  // Aggregated KPI Stats across all Tamil Nadu
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
          <p className="text-xs text-gray-500 font-medium">Verifying superadmin authority...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      role="SUPERADMIN"
      activeTab={activeTab}
      onTabChange={setActiveTab}
      badgeCounts={{
        requests: stats.pendingVerification,
        donations: stats.pendingDualOtp,
        donors: stats.totalDonors,
        users: users.length,
      }}
    >
      {activeTab === 'overview' && (
        <AdminOverview
          stats={stats}
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
        />
      )}

      {activeTab === 'camps' && (
        <AdminCampsTab
          camps={camps}
          isLoading={loadingCamps}
          onCreateCamp={handleCreateCamp}
        />
      )}

      {activeTab === 'users' && (
        <AdminUsersTab
          users={users}
          currentUser={user}
          isLoading={loadingUsers}
          onUpdateUserRole={handleUpdateUserRole}
        />
      )}

      {activeTab === 'audit' && (
        <AdminAuditTab
          auditLogs={auditLogs}
          isLoading={loadingAudit}
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
