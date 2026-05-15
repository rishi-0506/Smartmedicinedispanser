import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase/firebaseConfig';

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
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        return;
      }
      try {
        const docRef = doc(db, 'users', fbUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUser({ id: fbUser.uid, ...docSnap.data() } as User);
        } else {
          // If no user doc exists, fallback to basic info
          setUser({ id: fbUser.uid, email: fbUser.email || '', name: 'User', role: 'patient' });
        }
      } catch (e) {
        console.warn('Failed to fetch user profile:', e);
        setUser(null);
      }
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      throw new Error(e.message || 'Login failed');
    }
  };

  const signUp = async (email: string, password: string, name: string, role: 'caregiver' | 'patient') => {
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password);
      // Create user profile in Firestore
      await setDoc(doc(db, 'users', fbUser.uid), {
        email: fbUser.email,
        name,
        role,
        createdAt: serverTimestamp(),
      });
      // The onAuthStateChanged listener will pick this up and set the user state.
    } catch (e: any) {
      throw new Error(e.message || 'Registration failed');
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, signIn, signUp, signOut }}>{children}</Ctx.Provider>;
}
