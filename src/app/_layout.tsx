import { Notice, Splash, type ThemeColors, ToastHost, toast, useThemeColors } from "@/design";
import "@/global.css";

import { useFonts } from "expo-font";
import { Observe, type ObserveErrorBoundaryFallbackProps, ObserveRoot, useObserve } from "expo-observe";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colorScheme as nativewindColorScheme } from "nativewind";
import { useEffect, useSyncExternalStore } from "react";
import { useColorScheme as useSystemColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAppearanceStore } from "@/core/app/appearance";
import { useAppBoot, useAppLock, useDeepLinkRouter } from "@/core/app/boot";
import { useMessageNotifications } from "@/core/app/use-notifications";
import { type HostUi, PluginProvider, usePluginHost } from "@/core/plugins/host";
import { UsageStatistics } from "@/core/usage/usage-statistics";
import { FONTS } from "@/design/fonts";
import { DevicePromptHost } from "@/features/account/device-prompt";
import { LockGate } from "@/features/account/lock-gate";
import { CliApprovals } from "@/features/cli/approvals";
import { useCliServer } from "@/features/cli/server";
import { AppFrame } from "@/features/navigation/app-frame";
import { Dialog } from "@/features/navigation/dialog";
import { openChat, openTab } from "@/features/navigation/open";
import { DIALOG_ROUTES } from "@/features/navigation/routes";
import { stackScreenOptions } from "@/features/navigation/stack-options";
import { ALL_PLUGINS, DEFAULT_ENABLED_PLUGINS } from "@/plugins";

Observe.configure({
  integrations: {
    "expo-router": { filteredParams: ["id"] },
  },
});

const HOST_UI: HostUi = {
  notify: (message, tone = "info") => toast[tone](message),
  openChat,
  openSettings: (page) => openTab(page === "pin" ? "/settings/pin" : "/settings"),
};

/** The navigator paints with the system's colours: `bg` behind screens, `side` for bars, `line`, `fg`, `accent`. */
function navigationTheme(colors: ThemeColors): typeof DefaultTheme {
  const base = colors.scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.side,
      border: colors.line,
      text: colors.fg,
      primary: colors.accent,
      notification: colors.accent,
    },
  };
}

function RootLayout() {
  const system = useSystemColorScheme();
  const choice = useAppearanceStore((s) => s.theme);

  // With no preference from the system, dark: it is the system's home.
  const scheme = choice === "system" ? (system ?? "dark") : choice;
  // Given a resolved scheme, NativeWind pins Appearance on a phone; the desktop's dark class needs one.
  const applied = process.env.EXPO_OS === "web" ? (scheme === "dark" ? "dark" : "light") : choice;
  useEffect(() => {
    nativewindColorScheme.set(applied);
  }, [applied]);
  const [fontsLoaded, fontError] = useFonts(FONTS);
  // WKWebView's user agent has no "Safari", so expo-font waits on FontFaceObserver, which times out at launch there.
  if (!fontsLoaded && !fontError && process.env.EXPO_OS !== "web") return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemedNavigation>
          <PluginProvider plugins={ALL_PLUGINS} defaultEnabled={DEFAULT_ENABLED_PLUGINS} ui={HOST_UI}>
            <AppShell />
          </PluginProvider>
        </ThemedNavigation>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedNavigation({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return <ThemeProvider value={navigationTheme(colors)}>{children}</ThemeProvider>;
}

/** An error is never an empty state: it says what happened and the way out, inline, with its tag. */
function Crashed({ resetError }: ObserveErrorBoundaryFallbackProps) {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 16, backgroundColor: colors.bg }}>
      <Notice
        tone="danger"
        message="This screen hit an error it couldn’t recover from."
        detail="Your account and messages are not affected. Try again, or restart Statim."
        action={{ label: "Try again", onPress: resetError }}
      />
    </View>
  );
}

export default function Root() {
  return (
    <ObserveRoot errorBoundaryFallback={(props) => <Crashed {...props} />}>
      <RootLayout />
    </ObserveRoot>
  );
}

function PluginOverlays() {
  const { registry } = usePluginHost();
  const overlays = useSyncExternalStore(
    registry.subscribe,
    () => registry.overlays(),
    () => registry.overlays(),
  );

  return (
    <>
      {overlays.map(({ overlay, pluginId }) => {
        const Overlay = overlay.component;
        return <Overlay key={`${pluginId}:${overlay.id}`} />;
      })}
    </>
  );
}

const desktop = process.env.EXPO_OS === "web";

const SHEET_OPTIONS = {
  presentation: desktop ? "transparentModal" : "modal",
  animation: "slide_from_bottom",
} as const;

function AppShell() {
  useAppBoot();
  useDeepLinkRouter();
  useMessageNotifications(openChat);
  useCliServer();

  const lockStatus = useAppLock();
  const colors = useThemeColors();

  const { markInteractive } = useObserve();
  useEffect(() => {
    if (lockStatus === "open") markInteractive();
  }, [lockStatus, markInteractive]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={colors.scheme === "dark" ? "light" : "dark"} />
      <AppFrame>
        <Stack
          screenOptions={{ headerShown: false, ...stackScreenOptions(colors) }}
          screenLayout={
            desktop
              ? ({ route, children }) => (DIALOG_ROUTES.has(route.name) ? <Dialog>{children}</Dialog> : <>{children}</>)
              : undefined
          }
        >
          <Stack.Screen name="index" options={{ animation: "none" }} />
          <Stack.Screen name="(onboarding)" options={{ animation: "fade" }} />
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="thread/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen
            name="profile/[id]"
            options={{
              animation: "slide_from_right",
              presentation: desktop ? "transparentModal" : "card",
            }}
          />
          <Stack.Screen name="recover" options={{ animation: "fade" }} />
          <Stack.Screen name="new-chat" options={SHEET_OPTIONS} />
          <Stack.Screen name="invite" options={SHEET_OPTIONS} />
          <Stack.Screen name="qr" options={SHEET_OPTIONS} />
          <Stack.Screen name="bridge-login" options={SHEET_OPTIONS} />
          <Stack.Screen name="search" options={SHEET_OPTIONS} />
          <Stack.Screen name="share" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen
            name="sheet"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: "fitToContents",
              contentStyle: { backgroundColor: colors.panel },
              sheetCornerRadius: 6,
            }}
          />
        </Stack>
      </AppFrame>
      <PluginOverlays />
      <CliApprovals />
      <DevicePromptHost />
      <ToastHost />
      <UsageStatistics />

      {lockStatus === "open" ? null : lockStatus === "locked" ? (
        <LockGate />
      ) : (
        <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
          <Splash />
        </View>
      )}
    </View>
  );
}
