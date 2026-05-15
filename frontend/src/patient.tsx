import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase/firebaseConfig';
import { useAuth } from './auth';

type Patient = {
  id: string;
  name: string;
  age: number;
  condition: string;
  language: string;
  caregiver_id?: string | null;
  user_id?: string | null;
};

type Ctx = {
  patients: Patient[];
  currentPatient: Patient | null;
  setCurrentPatient: (p: Patient) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const PatientCtx = createContext<Ctx>({} as any);
export const usePatient = () => useContext(PatientCtx);

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setPatients([]); setCurrentPatient(null); return; }
    setLoading(true);
    try {
      const q = user.role === 'caregiver'
        ? query(collection(db, 'patients'), where('caregiver_id', '==', user.id))
        : query(collection(db, 'patients'), where('user_id', '==', user.id));
        
      const snapshot = await getDocs(q);
      const list: Patient[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      
      setPatients(list);
      setCurrentPatient(prev => {
        if (prev && list.find(p => p.id === prev.id)) return prev;
        return list[0] || null;
      });
    } catch (e) {
      console.warn("Failed to fetch patients", e);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <PatientCtx.Provider value={{ patients, currentPatient, setCurrentPatient, refresh, loading }}>
      {children}
    </PatientCtx.Provider>
  );
}
