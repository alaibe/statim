// react-native-web writes `dataSet` as data-* attributes, and Tauri drags the window by this one.
export const DRAG_REGION: Record<string, unknown> = { dataSet: { tauriDragRegion: "" } };
