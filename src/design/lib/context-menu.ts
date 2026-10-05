export interface MenuAnchor {
  x: number;
  y: number;
}

/** Props that open a menu on a right-click. Nothing on a phone, where the long-press does that. */
export function contextMenu(_open: (anchor: MenuAnchor) => void): Record<string, unknown> {
  return {};
}
