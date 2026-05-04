import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { theme } from './theme';

export function PulseDot({ color = theme.cyan, size = 10 }: { color?: string; size?: number }) {
  const v = useSharedValue(0.4);
  React.useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [v]);
  const aStyle = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.85 + v.value * 0.4 }] }));
  return (
    <View style={{ width: size * 2.2, height: size * 2.2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size * 2.2, height: size * 2.2, borderRadius: size, backgroundColor: color, opacity: 0.25 }, aStyle]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

export function PulseRing({ children, color = theme.cyan }: { children: React.ReactNode; color?: string }) {
  const v = useSharedValue(0);
  React.useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [v]);
  const aStyle = useAnimatedStyle(() => ({
    opacity: 1 - v.value,
    transform: [{ scale: 1 + v.value * 0.35 }],
  }));
  return (
    <View style={styles.center}>
      <Animated.View style={[styles.ring, { borderColor: color }, aStyle]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 2 },
});
