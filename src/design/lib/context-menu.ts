export interface MenuAnchor {
  x: number;
  y: number;
}

export function contextMenu(_open: (anchor: MenuAnchor) => void): Record<string, unknown> {
  return {};
}
