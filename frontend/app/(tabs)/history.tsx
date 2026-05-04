import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { theme, radius } from '../../src/theme';
import { GlassCard } from '../../src/GlassCard';
import { Ionicons } from '@expo/vector-icons';

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

export default function History() {
  const [doses, setDoses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.get('/patients');
      const pid = p.data[0]?.id;
      if (!pid) return;
      const [d, s] = await Promise.all([
        api.get(`/doses?patient_id=${pid}&days=14`),
        api.get(`/doses/stats?patient_id=${pid}`),
      ]);
      setDoses(d.data.slice().reverse());
      setStats(s.data);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const adherence = stats?.adherence ?? 0;

  return (
    <SafeAreaView style={styles.safe} testID="history-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>HISTORY</Text>
        <Text style={styles.sub}>Adherence analytics · 14 days</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.cyan} />}
      >
        {/* Adherence ring */}
        <GlassCard glow style={{ alignItems: 'center', paddingVertical: 24 }}>
          <View style={styles.ringWrap}>
            <View style={styles.ringBg} />
            <View style={[styles.ringFg, { transform: [{ rotate: `${adherence * 3.6 - 90}deg` }] }]} />
            <View style={styles.ringInner}>
              <Text style={styles.ringPct}>{adherence}%</Text>
              <Text style={styles.ringLabel}>ADHERENCE</Text>
            </View>
          </View>
          {stats && (
            <View style={styles.legend}>
              <Legend color={theme.spring} label="Taken" value={stats.taken} />
              <Legend color={theme.rose} label="Missed" value={stats.missed} />
              <Legend color={theme.amber} label="Skipped" value={stats.skipped} />
              <Legend color={theme.cyan} label="Pending" value={stats.pending} />
            </View>
          )}
        </GlassCard>

        <GlassCard testID="history-list">
          <Text style={styles.cardTitle}>RECENT EVENTS</Text>
          {doses.length === 0 && <Text style={styles.empty}>No history yet</Text>}
          {doses.map(d => (
            <View key={d.id} style={styles.row}>
              <Ionicons
                name={d.status === 'taken' ? 'checkmark-circle' : d.status === 'missed' ? 'close-circle' : 'time'}
                size={20}
                color={d.status === 'taken' ? theme.spring : d.status === 'missed' ? theme.rose : theme.amber}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.medName}>{d.medicine_name}</Text>
                <Text style={styles.timeText}>{fmt(d.scheduled_at)}</Text>
              </View>
              <Text style={[styles.status, { color: d.status === 'taken' ? theme.spring : d.status === 'missed' ? theme.rose : theme.amber }]}>
                {d.status.toUpperCase()}
              </Text>
            </View>
          ))}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={legendStyles.box}>
      <View style={[legendStyles.dot, { backgroundColor: color }]} />
      <Text style={legendStyles.val}>{value}</Text>
      <Text style={legendStyles.lbl}>{label}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  box: { alignItems: 'center', minWidth: 60 },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
  val: { color: theme.text, fontSize: 16, fontWeight: '700' },
  lbl: { color: theme.muted, fontSize: 10, letterSpacing: 1, marginTop: 2 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  h1: { color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: 3 },
  sub: { color: theme.muted, fontSize: 12, marginTop: 4 },
  scroll: { padding: 16, gap: 12, paddingBottom: 100 },
  ringWrap: {
    width: 200, height: 200, alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 16,
  },
  ringBg: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 12, borderColor: 'rgba(255,255,255,0.06)',
  },
  ringFg: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 12, borderColor: theme.cyan, borderRightColor: 'transparent', borderBottomColor: 'transparent',
  },
  ringInner: { alignItems: 'center' },
  ringPct: { color: theme.cyan, fontSize: 48, fontWeight: '300', letterSpacing: -2 },
  ringLabel: { color: theme.muted, fontSize: 11, letterSpacing: 3, marginTop: 4 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  cardTitle: { color: theme.text, fontSize: 12, letterSpacing: 2, fontWeight: '800', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.divider,
  },
  medName: { color: theme.text, fontWeight: '600' },
  timeText: { color: theme.muted, fontSize: 11, marginTop: 2 },
  status: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  empty: { color: theme.muted, textAlign: 'center', paddingVertical: 12 },
});
