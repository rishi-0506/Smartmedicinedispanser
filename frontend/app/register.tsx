import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import { theme, radius } from '../src/theme';

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'caregiver' | 'patient'>('caregiver');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const onSubmit = async () => {
    if (!name || !email || password.length < 6) {
      setErr('Please fill all fields. Password must be 6+ chars.');
      return;
    }
    setErr(''); setLoading(true);
    try {
      await signUp(email.trim(), password, name, role);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setErr(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="register-screen">
      <LinearGradient colors={['#020B14', '#04253A', '#020B14']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="register-back">
            <Ionicons name="chevron-back" size={22} color={theme.cyan} />
            <Text style={{ color: theme.cyan, fontWeight: '700', letterSpacing: 2 }}>BACK</Text>
          </TouchableOpacity>

          <Text style={styles.h1}>CREATE OPERATOR</Text>
          <Text style={styles.sub}>Register to manage your trolley network</Text>

          <View style={styles.card}>
            <Text style={styles.label}>FULL NAME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              testID="reg-name" placeholder="Dr. Aria Voss" placeholderTextColor={theme.muted} />

            <Text style={styles.label}>EMAIL</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail}
              testID="reg-email" placeholder="you@hospital.io" placeholderTextColor={theme.muted}
              autoCapitalize="none" keyboardType="email-address" />

            <Text style={styles.label}>PASSWORD</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword}
              testID="reg-password" placeholder="6+ characters" placeholderTextColor={theme.muted} secureTextEntry />

            <Text style={styles.label}>ROLE</Text>
            <View style={styles.roleRow}>
              {(['caregiver', 'patient'] as const).map(r => (
                <TouchableOpacity key={r} testID={`reg-role-${r}`} onPress={() => setRole(r)}
                  style={[styles.rolePill, role === r && styles.rolePillActive]}>
                  <Text style={[styles.rolePillText, role === r && { color: theme.cyan }]}>{r.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {err ? <Text style={styles.err} testID="reg-error">{err}</Text> : null}

            <TouchableOpacity testID="reg-submit" style={styles.primaryBtn} onPress={onSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={theme.cyan} /> :
                <Text style={styles.primaryBtnText}>CREATE ACCOUNT →</Text>}
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
  roleRow: { flexDirection: 'row', gap: 10 },
  rolePill: {
    flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  rolePillActive: { borderColor: theme.cyan, backgroundColor: 'rgba(0,240,255,0.08)' },
  rolePillText: { color: theme.muted, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  err: { color: theme.rose, marginTop: 12 },
  primaryBtn: {
    marginTop: 22, backgroundColor: 'rgba(0,240,255,0.1)', borderColor: theme.cyan, borderWidth: 1,
    paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: theme.cyan, fontWeight: '800', letterSpacing: 3, fontSize: 13 },
});
