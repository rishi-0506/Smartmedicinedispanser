import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../src/firebase/firebaseConfig';
import { useAuth } from '../../src/auth';
import { usePatient } from '../../src/patient';
import { theme, radius } from '../../src/theme';
import { GlassCard } from '../../src/GlassCard';

export default function Schedule() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentPatient } = usePatient();
  const [meds, setMeds] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const isCaregiver = user?.role === 'caregiver';

  const load = useCallback(async () => {
    if (!currentPatient) { setMeds([]); return; }
    try {
      const q = query(collection(db, 'medicines'), where('patientId', '==', currentPatient.id));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Map times back to strings for display if needed
      const mapped = list.map((m: any) => ({
        ...m,
        times: m.times ? m.times.map((t: any) => `${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`) : []
      }));
      setMeds(mapped);
    } catch { /* ignore */ }
  }, [currentPatient]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const remove = async (id: string) => {
    try { 
      await deleteDoc(doc(db, 'medicines', id)); 
      load(); 
    }
    catch (e: any) { Alert.alert('Error', e.message || 'Failed to delete'); }
  };

  return (
    <SafeAreaView style={styles.safe} testID="schedule-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>SCHEDULE</Text>
        <Text style={styles.sub}>
          {currentPatient ? `${currentPatient.name} · ${meds.length} medicines` : 'No patient selected'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.cyan} />}
      >
        {!isCaregiver && (
          <GlassCard style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'rgba(0,240,255,0.04)' }}>
            <Ionicons name="lock-closed" size={16} color={theme.cyan} />
            <Text style={styles.readOnly}>Read-only · Ask your caregiver to update medicines</Text>
          </GlassCard>
        )}

        {meds.length === 0 && (
          <GlassCard style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="flask-outline" size={36} color={theme.muted} />
            <Text style={{ color: theme.muted, marginTop: 8 }}>No medicines added yet</Text>
          </GlassCard>
        )}

        {meds.map(m => (
          <GlassCard key={m.id} testID={`med-${m.id}`}>
            <View style={styles.medHead}>
              <View style={[styles.colorDot, { backgroundColor: m.color || theme.cyan }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.medName}>{m.name}</Text>
                <Text style={styles.medSub}>{m.dosage} · slot {m.compartment}</Text>
              </View>
              {isCaregiver && (
                <TouchableOpacity onPress={() => remove(m.id)} testID={`del-${m.id}`}>
                  <Ionicons name="trash-outline" size={20} color={theme.rose} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.timesRow}>
              {m.times.map((t: string) => (
                <View key={t} style={styles.timeChip}>
                  <Ionicons name="time" size={12} color={theme.cyan} />
                  <Text style={styles.timeText}>{t}</Text>
                </View>
              ))}
            </View>
            {m.notes ? <Text style={styles.notes}>“{m.notes}”</Text> : null}
          </GlassCard>
        ))}
      </ScrollView>

      {isCaregiver && currentPatient && (
        <TouchableOpacity
          testID="add-medicine-fab"
          style={styles.fab}
          onPress={() => router.push({ pathname: '/add-medicine', params: { patientId: currentPatient.id } })}
        >
          <Ionicons name="add" size={28} color={theme.bg} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  h1: { color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: 3 },
  sub: { color: theme.muted, fontSize: 12, marginTop: 4 },
  scroll: { padding: 16, gap: 12, paddingBottom: 100 },
  readOnly: { color: theme.cyan, fontSize: 12, letterSpacing: 1 },
  medHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorDot: { width: 14, height: 14, borderRadius: 7, shadowColor: theme.cyan, shadowOpacity: 0.6, shadowRadius: 6 },
  medName: { color: theme.text, fontSize: 16, fontWeight: '700' },
  medSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  timesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  timeChip: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: theme.glassBorder,
    backgroundColor: 'rgba(0,240,255,0.05)',
  },
  timeText: { color: theme.cyan, fontWeight: '700', fontSize: 12 },
  notes: { color: theme.muted, marginTop: 8, fontStyle: 'italic', fontSize: 12 },
  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 60, height: 60, borderRadius: 30, backgroundColor: theme.cyan,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.cyan, shadowOpacity: 0.6, shadowRadius: 16, elevation: 8,
  },
});
