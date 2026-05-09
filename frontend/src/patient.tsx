import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
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
      const r = await api.get('/patients');
      const list: Patient[] = r.data || [];
      setPatients(list);
      setCurrentPatient(prev => {
        if (prev && list.find(p => p.id === prev.id)) return prev;
        return list[0] || null;
      });
    } catch {
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
