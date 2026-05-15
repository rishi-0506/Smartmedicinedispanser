import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth';
import { theme, radius } from '../../src/theme';
import { GlassCard } from '../../src/GlassCard';

export default function Profile() {
  const { user, signOut } = useAuth();

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
            <Text style={styles.infoKey}>BACKEND</Text>
            <Text style={styles.infoVal}>Firebase-only</Text>
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
