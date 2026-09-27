import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '../icon';
import { useDigitKeys } from '../lib/digit-keys';
import { cn } from '../lib/cn';
import { Pressable } from './pressable';
import { Text } from './text';

const SHAKE = { duration: 55, reduceMotion: ReduceMotion.System } as const;

/** `shakes` counts rejections; each new one shakes the dots and buzzes. */
export function PinDots({
  length,
  filled,
  shakes,
}: {
  length: number;
  filled: number;
  shakes: number;
}) {
  const offset = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  useEffect(() => {
    if (shakes === 0) return;
    offset.set(
      withSequence(
        withTiming(-10, SHAKE),
        withRepeat(withTiming(10, SHAKE), 4, true),
        withTiming(0, SHAKE)
      )
    );
    if (process.env.EXPO_OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [shakes, offset]);

  return (
    <Animated.View
      style={style}
      accessible
      accessibilityLabel={`${filled} of ${length} digits entered`}
      className="flex-row justify-center gap-4 py-2">
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          className={cn(
            'h-3.5 w-3.5 rounded-pill border-2',
            i < filled ? 'border-content bg-content' : 'border-line-strong'
          )}
        />
      ))}
    </Animated.View>
  );
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export interface PinPadProps {
  onDigit(digit: string): void;
  onDelete(): void;
  disabled?: boolean;
  /** Whether typed digits reach this pad, on the desktop. */
  listening?: boolean;
  /** The key left of 0, such as a way back to Face ID. */
  extra?: { label: string; icon: IconName; onPress(): void };
}

export function PinPad({
  onDigit,
  onDelete,
  disabled = false,
  listening = true,
  extra,
}: PinPadProps) {
  useDigitKeys(listening && !disabled, onDigit, onDelete);

  return (
    <View className="items-center gap-3">
      {ROWS.map((row) => (
        <View key={row[0]} className="flex-row gap-5">
          {row.map((digit) => (
            <DigitKey key={digit} digit={digit} disabled={disabled} onPress={onDigit} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-5">
        {extra ? (
          <IconKey label={extra.label} icon={extra.icon} onPress={extra.onPress} />
        ) : (
          <View className="h-[72px] w-[72px]" />
        )}
        <DigitKey digit="0" disabled={disabled} onPress={onDigit} />
        <IconKey label="Delete" icon="backspace-outline" disabled={disabled} onPress={onDelete} />
      </View>
    </View>
  );
}

function DigitKey({
  digit,
  disabled,
  onPress,
}: {
  digit: string;
  disabled: boolean;
  onPress: (digit: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={digit}
      accessibilityState={{ disabled }}
      disabled={disabled}
      pressScale={0.92}
      onPress={() => {
        if (process.env.EXPO_OS === 'ios') Haptics.selectionAsync().catch(() => {});
        onPress(digit);
      }}
      className={cn(
        'h-[72px] w-[72px] items-center justify-center rounded-pill bg-surface-sunken active:bg-line',
        disabled && 'opacity-40'
      )}>
      <Text className="text-[28px] leading-[34px] tabular-nums text-content">{digit}</Text>
    </Pressable>
  );
}

function IconKey({
  label,
  icon,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: IconName;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      pressScale={0.92}
      onPress={onPress}
      className={cn(
        'h-[72px] w-[72px] items-center justify-center rounded-pill active:bg-surface-sunken',
        disabled && 'opacity-40'
      )}>
      <Icon name={icon} size={26} tone="content" />
    </Pressable>
  );
}
