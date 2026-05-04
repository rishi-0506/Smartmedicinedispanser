import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, apiError } from '../../src/api';
import { useAuth } from '../../src/auth';
import { theme, radius } from '../../src/theme';
import { GlassCard } from '../../src/GlassCard';
import { createAudioPlayer } from 'expo-audio';

const LANGS = [
  { code: 'en', label: 'English', sample: 'Time to take your medicine.' },
  { code: 'hi', label: 'Hindi', sample: 'दवा लेने का समय हो गया है।' },
  { code: 'ta', label: 'Tamil', sample: 'உங்கள் மருந்தை எடுக்கும் நேரம் வந்துவிட்டது.' },
  { code: 'te', label: 'Telugu', sample: 'మీ మందు తీసుకునే సమయం వచ్చింది.' },
  { code: 'bn', label: 'Bengali', sample: 'আপনার ওষুধ খাওয়ার সময় হয়েছে।' },
];

const VOICES = ['nova', 'shimmer', 'alloy', 'echo', 'sage'];

export default function Profile() {
  const { user, signOut } = useAuth();
  const [lang, setLang] = useState('en');
  const [voice, setVoice] = useState('nova');
  const [busy, setBusy] = useState(false);

  const previewVoice = async () => {
    setBusy(true);
    try {
      const sample = LANGS.find(l => l.code === lang)?.sample || 'Time to take your medicine.';
      const r = await api.post('/tts', { text: sample, voice, language: lang });
      const dataUri = `data:${r.data.mime};base64,${r.data.audio_base64}`;
      if (Platform.OS === 'web') {
        const audio = new (window as any).Audio(dataUri);
        await audio.play();
      } else {
        const player = createAudioPlayer({ uri: dataUri });
        player.play();
      }
    } catch (e: any) {
      Alert.alert('Voice preview failed', apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="profile-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>PROFILE</Text>
        <Text style={styles.sub}>Operator settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <GlassCard glow>
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={theme.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name || '—'}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <View style={styles.roleTag}>
                <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </GlassCard>

        <GlassCard testID="voice-card">
          <Text style={styles.cardTitle}>VOICE ASSISTANT</Text>
          <Text style={styles.cardSub}>Regional language alerts powered by OpenAI TTS</Text>

          <Text style={styles.label}>LANGUAGE</Text>
          <View style={styles.chipRow}>
            {LANGS.map(l => (
              <TouchableOpacity
                key={l.code} testID={`lang-${l.code}`}
                onPress={() => setLang(l.code)}
                style={[styles.chip, lang === l.code && styles.chipActive]}
              >
                <Text style={[styles.chipText, lang === l.code && { color: theme.cyan }]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>VOICE TIMBRE</Text>
          <View style={styles.chipRow}>
            {VOICES.map(v => (
              <TouchableOpacity
                key={v} testID={`voice-${v}`}
                onPress={() => setVoice(v)}
                style={[styles.chip, voice === v && styles.chipActive]}
              >
                <Text style={[styles.chipText, voice === v && { color: theme.cyan }]}>
                  {v.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={previewVoice} style={styles.previewBtn} testID="voice-preview-btn" disabled={busy}>
            {busy ? <ActivityIndicator color={theme.cyan} /> :
              <>
                <Ionicons name="volume-high" size={16} color={theme.cyan} />
                <Text style={styles.previewBtnText}>PREVIEW VOICE</Text>
              </>
            }
          </TouchableOpacity>
        </GlassCard>

        <GlassCard>
          <Text style={styles.cardTitle}>ABOUT</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>SYSTEM</Text>
            <Text style={styles.infoVal}>MEDIDOSE.OS v1.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>BUILD</Text>
            <Text style={styles.infoVal}>Trolley-IOT-2026</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>LICENSE</Text>
            <Text style={styles.infoVal}>Hospital · Home Care</Text>
          </View>
        </GlassCard>

        <TouchableOpacity onPress={signOut} testID="profile-signout" style={styles.signOut}>
          <Ionicons name="log-out" size={16} color={theme.rose} />
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  h1: { color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: 3 },
  sub: { color: theme.muted, fontSize: 12, marginTop: 4 },
  scroll: { padding: 16, gap: 12, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,240,255,0.08)', borderColor: theme.cyan, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { color: theme.text, fontSize: 18, fontWeight: '700' },
  email: { color: theme.muted, fontSize: 12, marginTop: 2 },
  roleTag: {
    alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: theme.cyan,
  },
  roleText: { color: theme.cyan, fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  cardTitle: { color: theme.text, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  cardSub: { color: theme.muted, fontSize: 11, marginTop: 4 },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: theme.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  chipActive: { borderColor: theme.cyan, backgroundColor: 'rgba(0,240,255,0.08)' },
  chipText: { color: theme.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  previewBtn: {
    flexDirection: 'row', gap: 8, marginTop: 16,
    backgroundColor: 'rgba(0,240,255,0.1)', borderColor: theme.cyan, borderWidth: 1,
    paddingVertical: 12, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  previewBtnText: { color: theme.cyan, fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.divider, marginTop: 8 },
  infoKey: { color: theme.muted, fontSize: 11, letterSpacing: 1.5 },
  infoVal: { color: theme.text, fontSize: 12, fontWeight: '600' },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: theme.rose,
    backgroundColor: 'rgba(255,51,102,0.08)',
  },
  signOutText: { color: theme.rose, fontWeight: '700', letterSpacing: 2 },
});
