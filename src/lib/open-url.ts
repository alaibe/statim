import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export function openInBrowser(url: string, options?: { fullScreen?: boolean }): Promise<unknown> {
  return WebBrowser.openBrowserAsync(url, {
    presentationStyle: options?.fullScreen ? WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN : undefined,
  });
}

export async function openExternal(url: string): Promise<void> {
  await Linking.openURL(url);
}

export function canOpenExternal(url: string): Promise<boolean> {
  return Linking.canOpenURL(url);
}
