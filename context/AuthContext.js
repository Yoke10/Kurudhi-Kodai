"use client";

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { ROLES, normalizeRole } from '@/lib/roles';

const AuthContext = createContext({
  user: null,
  userRole: null,
  assignedCity: null,
  donorProfile: null,
  isDonor: false,
  loading: true,
  signin: async () => {},
  signup: async () => {},
  googleSignIn: async () => {},
  logout: async () => {},
  refreshUserProfile: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [assignedCity, setAssignedCity] = useState(null);
  const [donorProfile, setDonorProfile] = useState(null);
  const [isDonor, setIsDonor] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Helper to sync / ensure user profile document in Firestore
  const syncUserDocument = useCallback(async (firebaseUser, extraData = {}) => {
    if (!firebaseUser) return null;
    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        const newUserData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || extraData.displayName || '',
          firstName: extraData.firstName || '',
          lastName: extraData.lastName || '',
          dateOfBirth: extraData.dob || '',
          role: ROLES.USER, // Canonical uppercase role
          assignedCity: '',
          emailVerified: firebaseUser.emailVerified || false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userDocRef, newUserData);
        return newUserData;
      } else {
        const existingData = userDocSnap.data();
        // Update emailVerified if changed
        if (existingData.emailVerified !== firebaseUser.emailVerified) {
          await setDoc(userDocRef, { emailVerified: firebaseUser.emailVerified, updatedAt: serverTimestamp() }, { merge: true });
        }
        return existingData;
      }
    } catch (err) {
      console.error('Error synchronizing user document:', err);
      return null;
    }
  }, []);

  // Helper to fetch donor record (direct UID lookup conforming to security rules)
  const fetchDonorRecord = useCallback(async (firebaseUser) => {
    if (!firebaseUser) return null;
    try {
      const directRef = doc(db, 'donors', firebaseUser.uid);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        return { id: directSnap.id, ...directSnap.data() };
      }
      return null;
    } catch (err) {
      console.warn('Donor profile lookup note:', err?.message || err);
      return null;
    }
  }, []);

  // Refresh profile details on demand
  const refreshUserProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setUserRole(null);
      setAssignedCity(null);
      setDonorProfile(null);
      setIsDonor(false);
      return;
    }

    const userData = await syncUserDocument(auth.currentUser);
    if (userData) {
      const canonicalRole = normalizeRole(userData.role);
      setUserRole(canonicalRole);
      setAssignedCity(userData.assignedCity || null);
    }

    const donorData = await fetchDonorRecord(auth.currentUser);
    if (donorData) {
      setDonorProfile(donorData);
      setIsDonor(true);
    } else {
      setDonorProfile(null);
      setIsDonor(false);
    }
  }, [syncUserDocument, fetchDonorRecord]);

  // Main auth listener
  useEffect(() => {
    // Proactively clean up legacy insecure localStorage UID
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('userUUID');
      } catch (_) {}
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userData = await syncUserDocument(currentUser);
        if (userData) {
          const canonicalRole = normalizeRole(userData.role);
          setUserRole(canonicalRole);
          setAssignedCity(userData.assignedCity || null);
        }

        const donorData = await fetchDonorRecord(currentUser);
        if (donorData) {
          setDonorProfile(donorData);
          setIsDonor(true);
        } else {
          setDonorProfile(null);
          setIsDonor(false);
        }
      } else {
        setUserRole(null);
        setAssignedCity(null);
        setDonorProfile(null);
        setIsDonor(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [syncUserDocument, fetchDonorRecord]);

  const signup = async (firstName, lastName, dob, email, password) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = cred.user;

      // Sync user document with extra profile info
      await syncUserDocument(newUser, {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        dob,
      });

      // Send verification email
      try {
        await sendEmailVerification(newUser);
      } catch (verificationErr) {
        console.warn('Failed to send verification email:', verificationErr);
      }

      await refreshUserProfile();
      return newUser;
    } catch (error) {
      throw error;
    }
  };

  const signin = async (email, password) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await syncUserDocument(cred.user);
      await refreshUserProfile();
      return cred.user;
    } catch (error) {
      throw error;
    }
  };

  const googleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const cred = await signInWithPopup(auth, provider);
      await syncUserDocument(cred.user);
      await refreshUserProfile();
      return cred.user;
    } catch (error) {
      throw error;
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('No user is currently signed in.');
    await sendEmailVerification(auth.currentUser);
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserRole(null);
      setAssignedCity(null);
      setDonorProfile(null);
      setIsDonor(false);
      router.push('/signin');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userRole,
        assignedCity,
        donorProfile,
        isDonor,
        loading,
        signin,
        signup,
        googleSignIn,
        logout,
        refreshUserProfile,
        resendVerificationEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);