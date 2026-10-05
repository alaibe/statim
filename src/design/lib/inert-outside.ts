import type { RefObject } from 'react';
import type { View } from 'react-native';

/** On the desktop, whatever lies outside `ref` stops taking focus and input. */
export function useInertOutside(_ref: RefObject<View | null>): void {}
