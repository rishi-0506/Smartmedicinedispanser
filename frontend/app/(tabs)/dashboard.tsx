import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { usePatient } from '../../src/patient';
import { theme, radius } from '../../src/theme';
import { GlassCard } from '../../src/GlassCard';
import { PulseDot } from '../../src/Pulse';

type Trolley = { battery: number; wifi: boolean; online: boolean; compartments: any[]; last_sync: string };
type Dose = { id: string; medicine_name: string; dosage: string; compartment: number; scheduled_at: string; status: string };
type Stats = { total: number; taken: number; missed: number; adherence: number; pending: number };

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
function nextDose(doses: Dose[]): Dose | null {
  const now = Date.now();
  return doses.filter(d => d.status === 'pending' && new Date(d.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] || null;
}
function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'NOW';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { patients, currentPatient, setCurrentPatient } = usePatient();
  const router = useRouter();
  const [trolley, setTrolley] = useState<Trolley | null>(null);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const [showSwitcher, setShowSwitcher] = useState(false);

  const isCaregiver = user?.role === 'caregiver';

  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(i); }, []);

  const load = useCallback(async () => {
    if (!currentPatient) return;
    try {
      const [t, d, s] = await Promise.all([
        api.get(`/trolley/${currentPatient.id}`),
        api.get(`/doses/today?patient_id=${currentPatient.id}`),
        api.get(`/doses/stats?patient_id=${currentPatient.id}`),
      ]);
      setTrolley(t.data);
      setDoses(d.data);
      setStats(s.data);
    } catch { /* ignore */ }
  }, [currentPatient]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const next = nextDose(doses);
  const remaining = next ? countdown(next.scheduled_at) : '—';
  void tick;

  return (
    <SafeAreaView style={styles.safe} testID="dashboard-screen">
      <LinearGradient colors={['#04253A', '#020B14']} style={styles.headerGrad} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.cyan} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hello}>{isCaregiver ? 'CAREGIVER · WELCOME' : 'PATIENT · WELCOME'}</Text>
            <Text style={styles.userName}>{user?.name || 'Operator'}</Text>
          </View>
          <View style={styles.statusPill}>
            <PulseDot color={trolley?.online ? theme.spring : theme.rose} size={8} />
            <Text style={styles.statusText}>{trolley?.online ? 'TROLLEY ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Patient card / Switcher */}
        {currentPatient && (
          <TouchableOpacity
            activeOpacity={isCaregiver ? 0.7 : 1}
            onPress={() => isCaregiver && setShowSwitcher(true)}
            testID="patient-card"
          >
            <GlassCard style={styles.patientCard}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={26} color={theme.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientLabel}>
                    {isCaregiver ? 'MONITORING' : 'YOUR PROFILE'}
                  </Text>
                  <Text style={styles.patientName}>{currentPatient.name}</Text>
                  <Text style={styles.patientMeta}>{currentPatient.age} yrs · {currentPatient.condition}</Text>
                </View>
                {isCaregiver ? (
                  <View style={styles.switchBtn}>
                    <Ionicons name="swap-horizontal" size={18} color={theme.cyan} />
                  </View>
                ) : (
                  <View style={styles.langTag}>
                    <Text style={styles.langText}>{currentPatient.language.toUpperCase()}</Text>
                  </View>
                )}
              </View>
            </GlassCard>
          </TouchableOpacity>
        )}

        {!currentPatient && isCaregiver && (
          <GlassCard style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="person-add-outline" size={36} color={theme.muted} />
            <Text style={styles.empty}>No patients yet</Text>
            <TouchableOpacity testID="add-first-patient-btn" style={styles.addPatientBtn} onPress={() => router.push('/add-patient')}>
              <Ionicons name="add" size={16} color={theme.bg} />
              <Text style={{ color: theme.bg, fontWeight: '800', letterSpacing: 1.5 }}>ADD PATIENT</Text>
            </TouchableOpacity>
          </GlassCard>
        )}

        {/* Hero */}
        {currentPatient && (
          <GlassCard style={styles.heroCard} glow testID="next-dose-card">
            <Text style={styles.heroLabel}>NEXT DOSE IN</Text>
            <Text style={styles.heroTime}>{remaining}</Text>
            {next ? (
              <View style={styles.nextRow}>
                <Ionicons name="medical" size={16} color={theme.cyan} />
                <Text style={styles.nextText}>
                  {next.medicine_name} · {next.dosage} · {fmtTime(next.scheduled_at)}
                </Text>
              </View>
            ) : (
              <Text style={styles.nextText}>All doses for today complete ✓</Text>
            )}
            {next && (
              <TouchableOpacity
                testID="trigger-alert-btn"
                style={styles.dispenseBtn}
                onPress={() => router.push({ pathname: '/dose-alert', params: { doseId: next.id } })}
              >
                <Ionicons name="play" size={14} color={theme.bg} />
                <Text style={styles.dispenseText}>TRIGGER ALERT</Text>
              </TouchableOpacity>
            )}
          </GlassCard>
        )}

        {/* Stats */}
        {stats && currentPatient && (
          <View style={styles.statsRow}>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statLabel}>ADHERENCE</Text>
              <Text style={[styles.statValue, { color: theme.cyan }]}>{stats.adherence}%</Text>
              <Text style={styles.statSub}>7-day</Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statLabel}>TAKEN</Text>
              <Text style={[styles.statValue, { color: theme.spring }]}>{stats.taken}</Text>
              <Text style={styles.statSub}>doses</Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statLabel}>MISSED</Text>
              <Text style={[styles.statValue, { color: theme.rose }]}>{stats.missed}</Text>
              <Text style={styles.statSub}>doses</Text>
            </GlassCard>
          </View>
        )}

        {trolley && (
          <GlassCard testID="trolley-card">
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>TROLLEY · LIVE STATUS</Text>
              <Text style={styles.cardSub}>SYNC {fmtTime(trolley.last_sync)}</Text>
            </View>
            <View style={styles.statusBoxRow}>
              <View style={styles.statusBox}>
                <Ionicons name="battery-charging" size={18} color={theme.spring} />
                <Text style={styles.statusVal}>{trolley.battery}%</Text>
                <Text style={styles.statusKey}>BATTERY</Text>
              </View>
              <View style={styles.statusBox}>
                <Ionicons name="wifi" size={18} color={trolley.wifi ? theme.cyan : theme.muted} />
                <Text style={styles.statusVal}>{trolley.wifi ? 'STRONG' : 'OFF'}</Text>
                <Text style={styles.statusKey}>WIFI</Text>
              </View>
              <View style={styles.statusBox}>
                <Ionicons name="cube" size={18} color={theme.cyan} />
                <Text style={styles.statusVal}>{trolley.compartments.filter(c => c.loaded).length}/6</Text>
                <Text style={styles.statusKey}>LOADED</Text>
              </View>
            </View>

            <Text style={[styles.cardTitle, { marginTop: 16, marginBottom: 8 }]}>COMPARTMENTS</Text>
            <View style={styles.grid}>
              {trolley.compartments.map(c => (
                <View key={c.id} testID={`compartment-${c.id}`} style={[styles.cell, c.loaded && styles.cellLoaded]}>
                  <Text style={styles.cellNum}>{c.id}</Text>
                  <Ionicons name={c.loaded ? 'medkit' : 'add'} size={20} color={c.loaded ? theme.cyan : theme.muted} />
                  <Text style={[styles.cellLabel, c.loaded && { color: theme.cyan }]}>
                    {c.loaded ? 'LOADED' : 'EMPTY'}
                  </Text>
                </View>
              ))}
            </View>
          </GlassCard>
        )}

        {currentPatient && (
          <GlassCard testID="today-queue-card">
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>TODAY · DOSE QUEUE</Text>
              <Text style={styles.cardSub}>{doses.length} items</Text>
            </View>
            {doses.length === 0 && <Text style={styles.empty}>No doses scheduled today</Text>}
            {doses.map(d => (
              <View key={d.id} style={styles.doseRow} testID={`dose-${d.id}`}>
                <View style={styles.doseTime}>
                  <Text style={styles.doseTimeText}>{fmtTime(d.scheduled_at)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.doseMed}>{d.medicine_name}</Text>
                  <Text style={styles.doseSub}>{d.dosage} · slot {d.compartment}</Text>
                </View>
                <View style={[styles.doseStatus, statusStyle(d.status)]}>
                  <Text style={[styles.doseStatusText, { color: statusColor(d.status) }]}>
                    {d.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </GlassCard>
        )}

        <TouchableOpacity onPress={signOut} style={styles.signOut} testID="sign-out-btn">
          <Ionicons name="log-out" size={16} color={theme.rose} />
          <Text style={{ color: theme.rose, marginLeft: 6, letterSpacing: 1 }}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Patient switcher modal */}
      <Modal visible={showSwitcher} transparent animationType="fade" onRequestClose={() => setShowSwitcher(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>SELECT PATIENT</Text>
              <TouchableOpacity onPress={() => setShowSwitcher(false)} testID="close-switcher">
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {patients.map(p => (
                <TouchableOpacity
                  key={p.id}
                  testID={`switch-to-${p.id}`}
                  style={[styles.patientItem, currentPatient?.id === p.id && styles.patientItemActive]}
                  onPress={() => { setCurrentPatient(p); setShowSwitcher(false); }}
                >
                  <View style={styles.avatarSm}>
                    <Ionicons name="person" size={18} color={theme.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{p.name}</Text>
                    <Text style={styles.itemMeta}>{p.age} yrs · {p.condition || '—'}</Text>
                  </View>
                  {currentPatient?.id === p.id && <Ionicons name="checkmark-circle" size={20} color={theme.cyan} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              testID="add-new-patient-btn"
              style={styles.addPatientBtn}
              onPress={() => { setShowSwitcher(false); router.push('/add-patient'); }}
            >
              <Ionicons name="add" size={16} color={theme.bg} />
              <Text style={{ color: theme.bg, fontWeight: '800', letterSpacing: 1.5 }}>ADD NEW PATIENT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function statusColor(s: string): string {
  if (s === 'taken') return theme.spring;
  if (s === 'missed') return theme.rose;
  if (s === 'skipped') return theme.amber;
  return theme.cyan;
}
function statusStyle(s: string) { return { borderColor: statusColor(s) + '60', backgroundColor: statusColor(s) + '15' }; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  scroll: { padding: 16, paddingBottom: 80, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  hello: { color: theme.muted, fontSize: 11, letterSpacing: 2 },
  userName: { color: theme.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: theme.glassBorder,
    backgroundColor: 'rgba(0,255,157,0.05)',
  },
  statusText: { color: theme.text, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  patientCard: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(0,240,255,0.08)',
    borderColor: theme.cyan, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarSm: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,240,255,0.08)',
    borderColor: theme.cyan, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  patientLabel: { color: theme.muted, fontSize: 9, letterSpacing: 2 },
  patientName: { color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 2 },
  patientMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  switchBtn: {
    width: 38, height: 38, borderRadius: 19,
    borderColor: theme.cyan, borderWidth: 1,
    backgroundColor: 'rgba(0,240,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  langTag: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: theme.glassBorder, borderRadius: 6 },
  langText: { color: theme.cyan, fontSize: 10, letterSpacing: 2, fontWeight: '700' },

  heroCard: { alignItems: 'center', paddingVertical: 24 },
  heroLabel: { color: theme.muted, fontSize: 11, letterSpacing: 4 },
  heroTime: { color: theme.cyan, fontSize: 56, fontWeight: '300', letterSpacing: -2, marginTop: 6, ...(Platform.OS === 'ios' ? {} : { fontFamily: 'monospace' }) },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  nextText: { color: theme.subtext, fontSize: 13 },
  dispenseBtn: {
    marginTop: 16, flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: theme.cyan, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
  },
  dispenseText: { color: theme.bg, fontWeight: '800', letterSpacing: 2, fontSize: 12 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', padding: 14 },
  statLabel: { color: theme.muted, fontSize: 9, letterSpacing: 2 },
  statValue: { fontSize: 28, fontWeight: '700', marginTop: 4, letterSpacing: -1 },
  statSub: { color: theme.muted, fontSize: 10, marginTop: 2 },

  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: theme.text, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  cardSub: { color: theme.muted, fontSize: 10, letterSpacing: 1.5 },

  statusBoxRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statusBox: { alignItems: 'center', gap: 4 },
  statusVal: { color: theme.text, fontSize: 16, fontWeight: '700', marginTop: 4 },
  statusKey: { color: theme.muted, fontSize: 9, letterSpacing: 1.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    width: '31.5%', aspectRatio: 1,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  cellLoaded: {
    borderColor: 'rgba(0,240,255,0.45)', backgroundColor: 'rgba(0,240,255,0.06)',
    shadowColor: theme.cyan, shadowOpacity: 0.3, shadowRadius: 10,
  },
  cellNum: { position: 'absolute', top: 6, left: 8, color: theme.muted, fontSize: 10, fontWeight: '700' },
  cellLabel: { fontSize: 9, letterSpacing: 1.5, color: theme.muted, marginTop: 6, fontWeight: '700' },

  doseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.divider },
  doseTime: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.glassBorder },
  doseTimeText: { color: theme.cyan, fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  doseMed: { color: theme.text, fontWeight: '600' },
  doseSub: { color: theme.muted, fontSize: 11, marginTop: 1 },
  doseStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  doseStatusText: { fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  empty: { color: theme.muted, textAlign: 'center', paddingVertical: 12 },

  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 12 },

  // Switcher
  modalBg: { flex: 1, backgroundColor: 'rgba(2,11,20,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: theme.surface, borderColor: theme.glassBorder, borderWidth: 1,
    borderRadius: radius.lg, padding: 18,
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: theme.text, fontSize: 14, letterSpacing: 3, fontWeight: '800' },
  patientItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: 8,
  },
  patientItemActive: { borderColor: theme.cyan, backgroundColor: 'rgba(0,240,255,0.06)' },
  itemName: { color: theme.text, fontWeight: '700' },
  itemMeta: { color: theme.muted, fontSize: 11, marginTop: 2 },
  addPatientBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.cyan, paddingVertical: 12, borderRadius: radius.md, marginTop: 8,
  },
});
