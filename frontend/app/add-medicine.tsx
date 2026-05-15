import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { saveDrawerSchedule, parseTime, MAX_DRAWERS } from '../src/firebase/dispenserService';
import { db } from '../src/firebase/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../src/auth';
import { theme, radius } from '../src/theme';

const COLORS = ['#00F0FF', '#00FF9D', '#FFB800', '#FF3366', '#8AB4F8'];

export default function AddMedicine() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [compartment, setCompartment] = useState(1);
  const [color, setColor] = useState(COLORS[0]);
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [newTime, setNewTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const addTime = () => {
    const t = newTime.trim();
    if (/^\d{2}:\d{2}$/.test(t) && !times.includes(t)) {
      setTimes([...times, t].sort());
      setNewTime('');
    } else {
      Alert.alert('Invalid', 'Use HH:MM format (e.g. 08:30)');
    }
  };

  const removeTime = (t: string) => setTimes(times.filter(x => x !== t));

  const submit = async () => {
    if (!name || !dosage || times.length === 0) {
      Alert.alert('Missing', 'Fill name, dosage, and at least one time');
      return;
    }
    if (!user) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }
    setLoading(true);
    setSyncMsg(null);
    try {
      const parsedTimes = times.map(t => parseTime(t)).filter(Boolean) as { hour: number; minute: number }[];
      
      // 1) Save to Firestore
      await addDoc(collection(db, 'medicines'), {
        patientId,
        name,
        dosage,
        compartment,
        times: parsedTimes,
        notes,
        color,
        enabled: true,
        createdBy: user.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2) Sync with ESP32
      if (compartment <= MAX_DRAWERS) {
        if (parsedTimes.length > 0) {
          const result = await saveDrawerSchedule({
            drawerNumber: compartment,
            medicine: name,
            times: parsedTimes,
            enabled: true,
          });
          if (result.ok) {
            setSyncMsg({ kind: 'ok', text: `Synced to dispenser · drawer ${compartment}` });
          } else if (result.skipped) {
            setSyncMsg({ kind: 'warn', text: `Saved locally · dispenser sync skipped (${result.reason || 'unconfigured'})` });
          } else {
            setSyncMsg({ kind: 'err', text: `Saved locally · Firebase sync failed (${result.reason})` });
          }
        }
      } else {
        setSyncMsg({ kind: 'warn', text: `Saved locally · ESP32 only supports drawers 1–${MAX_DRAWERS}` });
      }

      setTimeout(() => router.back(), 900);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save medicine');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="add-medicine-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={theme.cyan} />
            <Text style={{ color: theme.cyan, fontWeight: '700', letterSpacing: 2 }}>BACK</Text>
          </TouchableOpacity>
          <Text style={styles.h1}>NEW MEDICINE</Text>
          <Text style={styles.sub}>Configure dose schedule</Text>

          <Text style={styles.label}>NAME</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName}
            testID="med-name" placeholder="e.g. Amlodipine" placeholderTextColor={theme.muted} />

          <Text style={styles.label}>DOSAGE</Text>
          <TextInput style={styles.input} value={dosage} onChangeText={setDosage}
            testID="med-dosage" placeholder="e.g. 5mg" placeholderTextColor={theme.muted} />

          <Text style={styles.label}>COMPARTMENT (1–6)</Text>
          <View style={styles.compRow}>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <TouchableOpacity key={n} testID={`comp-${n}`} onPress={() => setCompartment(n)}
                style={[styles.compBox, compartment === n && styles.compBoxActive]}>
                <Text style={[styles.compText, compartment === n && { color: theme.cyan }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>COLOR TAG</Text>
          <View style={styles.colorRow}>
            {COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => setColor(c)}
                style={[styles.colorChip, { backgroundColor: c }, color === c && styles.colorChipActive]} />
            ))}
          </View>

          <Text style={styles.label}>TIMES</Text>
          <View style={styles.timesWrap}>
            {times.map(t => (
              <TouchableOpacity key={t} onPress={() => removeTime(t)} style={styles.timeChip}>
                <Text style={styles.timeChipText}>{t}</Text>
                <Ionicons name="close" size={12} color={theme.cyan} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.timeAddRow}>
            <TextInput
              testID="time-input"
              style={[styles.input, { flex: 1 }]}
              value={newTime} onChangeText={setNewTime}
              placeholder="HH:MM" placeholderTextColor={theme.muted}
            />
            <TouchableOpacity onPress={addTime} testID="add-time-btn" style={styles.addBtn}>
              <Ionicons name="add" size={20} color={theme.bg} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>NOTES (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, { height: 70 }]} multiline
            value={notes} onChangeText={setNotes}
            testID="med-notes" placeholder="Take after meal" placeholderTextColor={theme.muted}
          />

          <TouchableOpacity testID="med-submit" style={styles.primaryBtn} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={theme.cyan} /> :
              <Text style={styles.primaryBtnText}>ADD TO TROLLEY →</Text>}
          </TouchableOpacity>

          {syncMsg && (
            <View
              testID="sync-status"
              style={[
                styles.syncBar,
                syncMsg.kind === 'ok' && { borderColor: theme.spring, backgroundColor: 'rgba(0,255,157,0.08)' },
                syncMsg.kind === 'warn' && { borderColor: theme.amber, backgroundColor: 'rgba(255,184,0,0.08)' },
                syncMsg.kind === 'err' && { borderColor: theme.rose, backgroundColor: 'rgba(255,51,102,0.08)' },
              ]}
            >
              <Ionicons
                name={syncMsg.kind === 'ok' ? 'cloud-done' : syncMsg.kind === 'warn' ? 'cloud-offline' : 'warning'}
                size={16}
                color={syncMsg.kind === 'ok' ? theme.spring : syncMsg.kind === 'warn' ? theme.amber : theme.rose}
              />
              <Text style={[
                styles.syncText,
                {
                  color: syncMsg.kind === 'ok' ? theme.spring : syncMsg.kind === 'warn' ? theme.amber : theme.rose,
                },
              ]}>{syncMsg.text}</Text>
            </View>
          )}

          <Text style={styles.hint}>
            Compartments 1–{MAX_DRAWERS} sync to the ESP32 dispenser. Slots 5–6 are app-only.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  h1: { color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: 3 },
  sub: { color: theme.muted, fontSize: 12, marginTop: 4 },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 18, marginBottom: 8 },
  input: {
    backgroundColor: theme.surface, borderColor: theme.glassBorder, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    color: theme.text, fontSize: 15,
  },
  compRow: { flexDirection: 'row', gap: 8 },
  compBox: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.glassBorder, borderRadius: radius.md,
    backgroundColor: theme.surface,
  },
  compBoxActive: { borderColor: theme.cyan, backgroundColor: 'rgba(0,240,255,0.1)' },
  compText: { color: theme.muted, fontSize: 16, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorChip: { width: 36, height: 36, borderRadius: 18 },
  colorChipActive: { borderWidth: 2, borderColor: theme.text },
  timesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  timeChip: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: theme.cyan,
    backgroundColor: 'rgba(0,240,255,0.08)',
  },
  timeChipText: { color: theme.cyan, fontWeight: '700', fontSize: 12 },
  timeAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: {
    width: 46, height: 46, borderRadius: radius.md,
    backgroundColor: theme.cyan, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: 26, backgroundColor: 'rgba(0,240,255,0.1)', borderColor: theme.cyan, borderWidth: 1,
    paddingVertical: 14, borderRadius: radius.md, alignItems: 'center',
  },
  primaryBtnText: { color: theme.cyan, fontWeight: '800', letterSpacing: 3, fontSize: 13 },
  syncBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: radius.md, borderWidth: 1,
  },
  syncText: { fontSize: 12, fontWeight: '600', flex: 1 },
  hint: { color: theme.muted, fontSize: 11, marginTop: 14, textAlign: 'center', fontStyle: 'italic' },
});
