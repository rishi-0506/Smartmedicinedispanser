import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, saveToken, clearToken, getToken, apiError } from './api';

type User = { id: string; email: string; name: string; role: 'caregiver' | 'patient' };
type AuthState = {
  user: User | null | undefined; // undefined=loading, null=signed out
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, role: 'caregiver' | 'patient') => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({} as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) { setUser(null); return; }
      try {
        const r = await api.get('/auth/me');
        setUser(r.data);
      } catch {
        await clearToken();
        setUser(null);
      }
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const r = await api.post('/auth/login', { email, password });
      await saveToken(r.data.access_token);
      setUser(r.data.user);
    } catch (e) {
      throw new Error(apiError(e));
    }
  };

  const signUp = async (email: string, password: string, name: string, role: 'caregiver' | 'patient') => {
    try {
      const r = await api.post('/auth/register', { email, password, name, role });
      await saveToken(r.data.access_token);
      setUser(r.data.user);
    } catch (e) {
      throw new Error(apiError(e));
    }
  };

  const signOut = async () => {
    await clearToken();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, signIn, signUp, signOut }}>{children}</Ctx.Provider>;
}
