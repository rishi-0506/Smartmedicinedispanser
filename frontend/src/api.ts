import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------
// Priority:
//   1. EXPO_PUBLIC_BACKEND_URL env var (set in frontend/.env)
//   2. Hardcoded localhost fallback for local development
//
// Android emulator needs 10.0.2.2 instead of localhost.
// Physical device on the same LAN needs the laptop's LAN IP.
// See frontend/.env.example for examples.
// ---------------------------------------------------------------------------
const _envBase = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!_envBase && __DEV__) {
  // Single-shot warning in dev so the missing env var is immediately visible
  // in the Metro console instead of surfacing as a cryptic 404 later.
  console.warn(
    '[api] EXPO_PUBLIC_BACKEND_URL is not set.\n' +
    '  Copy frontend/.env.example → frontend/.env, fill in the URL, then\n' +
    '  restart Expo with:  npx expo start -c\n' +
    '  Falling back to http://localhost:8000'
  );
}

// Strip any trailing slash so we never produce double-slashes.
const _base = (_envBase || 'http://localhost:8000').replace(/\/+$/, '');
const API_BASE_URL = `${_base}/api`;

if (__DEV__) {
  console.log(`[api] baseURL → ${API_BASE_URL}`);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
});

// ---------------------------------------------------------------------------
// Token storage (SecureStore on native, localStorage on web)
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'trolley_access_token';

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

// ---------------------------------------------------------------------------
// Auth interceptor — attach JWT to every request (if present)
// ---------------------------------------------------------------------------
api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Error helper — extracts a human-readable message from FastAPI error shapes
// ---------------------------------------------------------------------------
export function apiError(e: unknown): string {
  const err = e as any;
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || 'Network error';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x?.msg || JSON.stringify(x)).join(' ');
  return String(d);
}
