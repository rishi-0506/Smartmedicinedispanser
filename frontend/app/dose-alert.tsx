import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { theme, radius } from '../src/theme';
import { PulseRing, PulseDot } from '../src/Pulse';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebase/firebaseConfig';
import { usePatient } from '../src/patient';

export default function DoseAlert() {
  const { doseParam } = useLocalSearchParams<{ doseParam: string }>();
  const router = useRouter();
  const { currentPatient } = usePatient();
  const [dose, setDose] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (doseParam) {
      try {
        const d = JSON.parse(doseParam);
        setDose(d);
        if (Platform.OS !== 'web') {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
        }
      } catch (e) { console.warn("Failed to parse dose", e); }
    }
  }, [doseParam]);

  const update = async (status: 'taken' | 'skipped' | 'snoozed') => {
    if (!dose || !currentPatient) return;
    setBusy(status);
    try {
      // Use a deterministic ID for the log: medicineId_timestamp
      const logId = `${dose.medicineId}_${new Date(dose.scheduled_at).getTime()}`;
      await setDoc(doc(db, 'doseLogs', logId), {
        patientId: currentPatient.id,
        medicineId: dose.medicineId,
        medicine_name: dose.medicine_name,
        scheduled_at: dose.scheduled_at,
        status,
        updatedAt: new Date().toISOString(),
      });

      if (Platform.OS !== 'web') {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Failed to update dose status');
    } finally {
      setBusy(null);
    }
  };

  if (!dose) {
    return (
      <View style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.cyan} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="dose-alert-screen">
      <LinearGradient colors={['rgba(0,240,255,0.12)', '#020B14', 'rgba(0,255,157,0.08)']} style={StyleSheet.absoluteFill} />

      <TouchableOpacity onPress={() => router.back()} style={styles.close} testID="alert-close">
        <Ionicons name="close" size={26} color={theme.text} />
      </TouchableOpacity>

      <View style={styles.center}>
        <View style={styles.alertBadge}>
          <PulseDot color={theme.cyan} size={6} />
          <Text style={styles.alertBadgeText}>DOSE ALERT</Text>
        </View>

        <PulseRing color={theme.cyan}>
          <View style={styles.iconBig}>
            <Ionicons name="medkit" size={64} color={theme.cyan} />
          </View>
        </PulseRing>

        <Text style={styles.medName}>{dose.medicine_name}</Text>
        <Text style={styles.dosage}>{dose.dosage} · Compartment {dose.compartment}</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity testID="dose-skip" onPress={() => update('skipped')} style={[styles.actionBtn, { borderColor: theme.amber }]} disabled={!!busy}>
            {busy === 'skipped' ? <ActivityIndicator color={theme.amber} /> : <>
              <Ionicons name="close" size={20} color={theme.amber} />
              <Text style={[styles.actionText, { color: theme.amber }]}>SKIP</Text>
            </>}
          </TouchableOpacity>

          <TouchableOpacity testID="dose-snooze" onPress={() => update('snoozed')} style={[styles.actionBtn, { borderColor: theme.subtext }]} disabled={!!busy}>
            {busy === 'snoozed' ? <ActivityIndicator color={theme.subtext} /> : <>
              <Ionicons name="time" size={20} color={theme.subtext} />
              <Text style={[styles.actionText, { color: theme.subtext }]}>SNOOZE</Text>
            </>}
          </TouchableOpacity>

          <TouchableOpacity testID="dose-taken" onPress={() => update('taken')} style={[styles.actionBtn, styles.takeBtn]} disabled={!!busy}>
            {busy === 'taken' ? <ActivityIndicator color={theme.bg} /> : <>
              <Ionicons name="checkmark" size={20} color={theme.bg} />
              <Text style={[styles.actionText, { color: theme.bg }]}>TAKEN</Text>
            </>}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  close: { position: 'absolute', top: 50, right: 20, padding: 10, zIndex: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  alertBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: theme.cyan,
    backgroundColor: 'rgba(0,240,255,0.1)', marginBottom: 30,
  },
  alertBadgeText: { color: theme.cyan, letterSpacing: 3, fontSize: 11, fontWeight: '800' },
  iconBig: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(0,240,255,0.08)', borderColor: theme.cyan, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.cyan, shadowOpacity: 0.7, shadowRadius: 30,
  },
  medName: { color: theme.text, fontSize: 32, fontWeight: '700', letterSpacing: -1, marginTop: 32 },
  dosage: { color: theme.subtext, fontSize: 14, marginTop: 6, letterSpacing: 1 },
  voiceBtn: {
    flexDirection: 'row', gap: 8, marginTop: 24,
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 999, borderWidth: 1, borderColor: theme.cyan,
    backgroundColor: 'rgba(0,240,255,0.08)', alignItems: 'center',
  },
  voiceText: { color: theme.cyan, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 36, width: '100%' },
  actionBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: radius.md, borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  takeBtn: { borderColor: theme.spring, backgroundColor: theme.spring, shadowColor: theme.spring, shadowOpacity: 0.6, shadowRadius: 14 },
  actionText: { fontWeight: '800', letterSpacing: 2, fontSize: 12 },
});
