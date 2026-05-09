import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api, apiError } from '../src/api';
import { usePatient } from '../src/patient';
import { theme, radius } from '../src/theme';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'bn', label: 'Bengali' },
];

export default function AddPatient() {
  const router = useRouter();
  const { refresh, setCurrentPatient } = usePatient();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [condition, setCondition] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const a = parseInt(age, 10);
    if (!name || !a) {
      Alert.alert('Missing', 'Name and age are required');
      return;
    }
    setLoading(true);
    try {
      const r = await api.post('/patients', {
        name, age: a, condition, language, avatar: '',
      });
      await refresh();
      setCurrentPatient(r.data);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="add-patient-screen">
      <LinearGradient colors={['#04253A', '#020B14']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={theme.cyan} />
            <Text style={{ color: theme.cyan, fontWeight: '700', letterSpacing: 2 }}>BACK</Text>
          </TouchableOpacity>

          <Text style={styles.h1}>NEW PATIENT</Text>
          <Text style={styles.sub}>Add a patient to your trolley network</Text>

          <View style={styles.card}>
            <Text style={styles.label}>FULL NAME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              testID="pt-name" placeholder="e.g. Aarav Sharma" placeholderTextColor={theme.muted} />

            <Text style={styles.label}>AGE</Text>
            <TextInput style={styles.input} value={age} onChangeText={setAge}
              testID="pt-age" placeholder="72" placeholderTextColor={theme.muted} keyboardType="numeric" />

            <Text style={styles.label}>CONDITION (OPTIONAL)</Text>
            <TextInput style={styles.input} value={condition} onChangeText={setCondition}
              testID="pt-condition" placeholder="Hypertension, Mild Alzheimer's" placeholderTextColor={theme.muted} />

            <Text style={styles.label}>VOICE LANGUAGE</Text>
            <View style={styles.chipRow}>
              {LANGS.map(l => (
                <TouchableOpacity key={l.code} testID={`pt-lang-${l.code}`}
                  onPress={() => setLanguage(l.code)}
                  style={[styles.chip, language === l.code && styles.chipActive]}>
                  <Text style={[styles.chipText, language === l.code && { color: theme.cyan }]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity testID="pt-submit" style={styles.primaryBtn} onPress={submit} disabled={loading}>
              {loading ? <ActivityIndicator color={theme.cyan} /> :
                <Text style={styles.primaryBtnText}>CREATE PATIENT →</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  h1: { color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: 3 },
  sub: { color: theme.muted, marginTop: 4, marginBottom: 24 },
  card: {
    backgroundColor: theme.surface, borderColor: theme.glassBorder, borderWidth: 1,
    borderRadius: radius.lg, padding: 22,
  },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: theme.bg, borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    color: theme.text, fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: theme.glassBorder, backgroundColor: 'rgba(255,255,255,0.02)',
  },
  chipActive: { borderColor: theme.cyan, backgroundColor: 'rgba(0,240,255,0.08)' },
  chipText: { color: theme.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  primaryBtn: {
    marginTop: 22, backgroundColor: 'rgba(0,240,255,0.1)', borderColor: theme.cyan, borderWidth: 1,
    paddingVertical: 14, borderRadius: radius.md, alignItems: 'center',
  },
  primaryBtnText: { color: theme.cyan, fontWeight: '800', letterSpacing: 3, fontSize: 13 },
});
