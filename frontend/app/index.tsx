import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import { theme } from '../src/theme';

export default function Index() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return;
    if (user) router.replace('/(tabs)/dashboard');
    else router.replace('/login');
  }, [user, router]);

  return (
    <View style={styles.c} testID="splash-screen">
      <ActivityIndicator color={theme.cyan} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
