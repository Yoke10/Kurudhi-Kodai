import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyPlaceholderKeyForBuildSafety000000',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'kurudhi-kodai.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'kurudhi-kodai',
  ...(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? { storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET } : {}),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1234567890:web:abcdef123456',
  ...(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? { measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID } : {})
};

// Ensure Firebase is initialized only once across the entire application
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = null; // Kurudhi Kodai does not require Cloud Storage (zero cost free-tier)

export default app;
