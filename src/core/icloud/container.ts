import type { Container } from "./cloudkit";

export const ICLOUD_CONTAINER = "iCloud.im.statim.app";

/** Where Apple's sign-in sends the browser back to, with the web auth token. */
export interface IcloudSetup extends Container {
  callback: string;
}

/** Each API token names the app, not a person; Apple takes a localhost callback only in development. */
export function icloudContainer(): IcloudSetup | null {
  if (!__DEV__) {
    return {
      id: ICLOUD_CONTAINER,
      environment: "production",
      apiToken: "1ecaf6f089eba60a2c8751b0b5d5062e0d4acc2d7e10f301859d1259554be637",
      callback: "cloudkit-icloud.im.statim.app://signed-in",
    };
  }
  const apiToken = process.env.EXPO_PUBLIC_ICLOUD_API_TOKEN;
  if (!apiToken) return null;
  return {
    id: ICLOUD_CONTAINER,
    environment: "development",
    apiToken,
    callback: "http://localhost:47219/icloud",
  };
}
