// ============================================================================
// Firebase Realtime Database configuration for ESP32 IoT bridge.
//
// ⚠️  REPLACE THE PLACEHOLDER VALUES BELOW WITH YOUR REAL FIREBASE PROJECT
//     CREDENTIALS BEFORE THE ESP32 SYNC WILL WORK.
//
// How to obtain them:
//   1. Go to https://console.firebase.google.com
//   2. Create / open your project
//   3. Add a Web App (</> icon) — copy the firebaseConfig values shown
//   4. In the left nav: Build → Realtime Database → Create Database
//      (choose any region; start in Test mode for the prototype)
//   5. Paste the values into this file.
//
// Database rules (PROTOTYPE / DEMO ONLY — secure before production!):
//   {
//     "rules": {
//       ".read": true,
//       ".write": true
//     }
//   }
//
// ============================================================================

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_FIREBASE_API_KEY',
  authDomain: 'REPLACE_WITH_PROJECT.firebaseapp.com',
  databaseURL: 'https://REPLACE_WITH_PROJECT_ID-default-rtdb.firebaseio.com',
  projectId: 'REPLACE_WITH_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_WITH_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID',
};

// Detect whether the developer has actually filled in the credentials.
// If not, the dispenser service will short-circuit and skip the Firebase call
// (the rest of the app continues to work normally).
export const isFirebaseConfigured: boolean =
  !firebaseConfig.apiKey.startsWith('REPLACE_WITH') &&
  !firebaseConfig.databaseURL.includes('REPLACE_WITH');

let _db: Database | null = null;

export function getRealtimeDb(): Database | null {
  if (!isFirebaseConfigured) return null;
  if (_db) return _db;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  _db = getDatabase(app);
  return _db;
}
