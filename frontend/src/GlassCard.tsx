import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { theme, radius } from './theme';

export function GlassCard({ children, style, glow = false, testID }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; glow?: boolean; testID?: string }) {
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        glow && styles.glow,
        style as any,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.glassBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    overflow: 'hidden',
  },
  glow: {
    shadowColor: theme.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
    borderColor: 'rgba(0,240,255,0.45)',
  },
});
