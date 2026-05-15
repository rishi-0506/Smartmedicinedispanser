// ============================================================================
// Firebase App configuration for Auth, Firestore, and Realtime Database.
// ============================================================================

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "REPLACE_WITH_API_KEY",
  authDomain: "REPLACE_WITH_AUTH_DOMAIN",
  databaseURL: "REPLACE_WITH_DATABASE_URL",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
  measurementId: "REPLACE_WITH_MEASUREMENT_ID"
};

// Detect whether the developer has actually filled in the credentials.
export const isFirebaseConfigured: boolean =
  !firebaseConfig.apiKey.startsWith('REPLACE_WITH') &&
  !firebaseConfig.databaseURL.includes('REPLACE_WITH');

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let _rtdb: Database | null = null;

export function getRealtimeDb(): Database | null {
  if (!isFirebaseConfigured) return null;
  if (!_rtdb) {
    _rtdb = getDatabase(app);
  }
  return _rtdb;
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
