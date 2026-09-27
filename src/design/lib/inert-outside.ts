import type { RefObject } from 'react';
import type { View } from 'react-native';

/** Whatever lies outside `ref` stops taking focus and input on the desktop; see inert-outside.web.ts. */
export function useInertOutside(_ref: RefObject<View | null>): void {}
