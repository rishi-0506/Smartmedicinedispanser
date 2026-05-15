// ============================================================================
// Firebase dispenser service — bridges the app to an ESP32 medicine dispenser
// via Firebase Realtime Database.
//
// Data path written by the app and read by ESP32:
//   devices/{DEVICE_ID}/drawers/drawer{1..4}
//
// Data path written by ESP32 and read by the app:
//   devices/{DEVICE_ID}/state
//
// The ESP32 firmware uses Wi-Fi + NTP for time-keeping (no RTC) and triggers
// the servo when the current time matches a drawer's hour/minute.
// ============================================================================

import { ref, set, update, onValue, Unsubscribe } from 'firebase/database';
import { getRealtimeDb, isFirebaseConfigured } from './firebaseConfig';

// Hardware has 4 physical drawers
export const MAX_DRAWERS = 4;
export const DEVICE_ID = 'dispenser_001';

export type DrawerSchedule = {
  drawerNumber: number; // 1..4
  medicine: string;
  times: { hour: number; minute: number }[];
  enabled: boolean;
};

export type DispenserState = {
  online?: boolean;
  lastSeen?: number;
  currentStatus?: 'idle' | 'dispensing' | 'awaiting_ack' | 'missed' | string;
  lastDispensedDrawer?: number;
  lastScheduleUpdate?: number;
};

export type SyncResult = {
  ok: boolean;
  skipped?: boolean;   // true when drawerNumber > 4 or Firebase not configured
  reason?: string;
};

/**
 * Push a single drawer schedule to Firebase.
 * Returns a SyncResult so callers can show a status message but never throws.
 * - Skips silently when Firebase is not configured (placeholder credentials)
 *   or when the drawerNumber is outside 1..MAX_DRAWERS.
 */
export async function saveDrawerSchedule(schedule: DrawerSchedule): Promise<SyncResult> {
  if (!isFirebaseConfigured) {
    return { ok: false, skipped: true, reason: 'Firebase credentials not set' };
  }
  if (schedule.drawerNumber < 1 || schedule.drawerNumber > MAX_DRAWERS) {
    return { ok: false, skipped: true, reason: `Drawer ${schedule.drawerNumber} > ${MAX_DRAWERS}` };
  }
  const db = getRealtimeDb();
  if (!db) return { ok: false, skipped: true, reason: 'Realtime DB unavailable' };

  try {
    const drawerKey = `drawer${schedule.drawerNumber}`;
    await set(ref(db, `devices/${DEVICE_ID}/drawers/${drawerKey}`), {
      enabled: schedule.enabled,
      medicine: schedule.medicine,
      times: schedule.times,
      updatedAt: Date.now(),
    });
    await update(ref(db, `devices/${DEVICE_ID}/state`), {
      lastScheduleUpdate: Date.now(),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Firebase sync failed' };
  }
}

/**
 * Subscribe to dispenser state updates pushed by the ESP32.
 * Returns an unsubscribe function (or null if Firebase isn't configured).
 */
export function listenToDispenserState(callback: (state: DispenserState | null) => void): Unsubscribe | null {
  if (!isFirebaseConfigured) {
    callback(null);
    return null;
  }
  const db = getRealtimeDb();
  if (!db) return null;
  const stateRef = ref(db, `devices/${DEVICE_ID}/state`);
  return onValue(stateRef, (snap) => callback(snap.val() || null));
}

// Parses "HH:MM" → { hour, minute }
export function parseTime(hhmm: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { hour: h, minute: mm };
}
