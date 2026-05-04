import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 30000,
});

const TOKEN_KEY = 'trolley_access_token';

export async function saveToken(token: string) {
  if (Platform.OS === 'web') {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

api.interceptors.request.use(async (config) => {
  const t = await getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export function apiError(e: any): string {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || 'Network error';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x?.msg || JSON.stringify(x)).join(' ');
  return String(d);
}
