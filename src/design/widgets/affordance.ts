import type { WidgetAction } from './schema';

/**
 * Never an arrow and never an ellipsis: both promise a destination, and a row
 * either runs its action on the spot or opens a sheet of its own actions.
 */
export function affordanceFor(actions: WidgetAction[] | undefined): string | null {
  if (!actions?.length) return null;
  return actions.length === 1 ? actions[0].label : 'Options';
}
