import { Platform } from "react-native";

export const PLATFORM_NAME =
  Platform.OS === "android" ? `Android ${Platform.constants.Release}` : `iOS ${Platform.Version}`;
