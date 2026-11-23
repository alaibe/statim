import type { WidgetAction } from "./schema";

/** Never an arrow or an ellipsis: both promise a destination, and a row acts on the spot or opens a sheet. */
export function affordanceFor(actions: WidgetAction[] | undefined): string | null {
  if (!actions?.length) return null;
  return actions.length === 1 ? actions[0].label : "Options";
}
