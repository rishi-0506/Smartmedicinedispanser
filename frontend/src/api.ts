// ============================================================================
// api.ts — LEGACY SHIM (no longer used by any screen)
//
// All app data now flows through Firebase Auth + Firestore + RTDB.
// This file is kept only to avoid breaking any stray imports during transition.
// It does NOT connect to any backend server.
// ============================================================================

export function apiError(e: unknown): string {
  const err = e as any;
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || 'Unknown error';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x?.msg || JSON.stringify(x)).join(' ');
  return String(d);
}
