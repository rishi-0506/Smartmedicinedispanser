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

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@trolley.health');
  const [password, setPassword] = useState('Admin@123');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const onSubmit = async () => {
    setErr(''); setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="login-screen">
      <LinearGradient
        colors={['#020B14', '#04253A', '#020B14']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoRing}>
              <Ionicons name="medkit" size={40} color={theme.cyan} />
            </View>
            <Text style={styles.brand}>MEDIDOSE.OS</Text>
            <Text style={styles.tagline}>Smart Trolley · Medicine Dispenser</Text>
          </View>

          <View style={styles.card} testID="login-card">
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@hospital.io"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.muted}
              secureTextEntry
            />

            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}

            <TouchableOpacity
              testID="login-submit"
              style={styles.primaryBtn}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={theme.cyan} /> : (
                <>
                  <Text style={styles.primaryBtnText}>INITIATE SESSION</Text>
                  <Ionicons name="arrow-forward" size={18} color={theme.cyan} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity testID="goto-register" onPress={() => router.push('/register')} style={styles.linkBtn}>
              <Text style={styles.linkText}>New operator? Create account →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.demoHint}>
            <Ionicons name="flask" size={12} color={theme.muted} />
            <Text style={styles.demoText}>Caregiver: admin@trolley.health / Admin@123</Text>
          </View>
          <View style={styles.demoHint}>
            <Ionicons name="person" size={12} color={theme.muted} />
            <Text style={styles.demoText}>Patient: patient@trolley.health / Patient@123</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoRing: {
    width: 84, height: 84, borderRadius: 42,
    borderWidth: 1, borderColor: 'rgba(0,240,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,240,255,0.06)',
    shadowColor: theme.cyan, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  brand: {
    color: theme.text, fontSize: 26, fontWeight: '800',
    letterSpacing: 4, marginTop: 12,
  },
  tagline: { color: theme.muted, fontSize: 11, letterSpacing: 2, marginTop: 4 },

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
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  rolePillActive: {
    borderColor: theme.cyan, backgroundColor: 'rgba(0,240,255,0.08)',
    shadowColor: theme.cyan, shadowOpacity: 0.4, shadowRadius: 12,
  },
  rolePillText: { color: theme.muted, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  err: { color: theme.rose, marginTop: 12, fontSize: 13 },
  primaryBtn: {
    marginTop: 22, flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(0,240,255,0.1)', borderColor: theme.cyan, borderWidth: 1,
    paddingVertical: 14, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: theme.cyan, fontWeight: '800', letterSpacing: 3, fontSize: 13 },
  linkBtn: { alignItems: 'center', marginTop: 16 },
  linkText: { color: theme.subtext, fontSize: 13 },
  demoHint: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  demoText: { color: theme.muted, fontSize: 11 },
});
