import { Tabs } from "expo-router";

import { useChatStore } from "@/core/messaging/chat-store";
import { TabBar } from "@/design";
import { PLACES } from "@/features/navigation/commands";
import { protocolsNeedAttention } from "@/features/protocols/presentation";

/** The phone's first three places, in the system's tab bar. */
const TABS = [
  { route: "(chats)", place: PLACES[0] },
  { route: "(contacts)", place: PLACES[1] },
  { route: "(settings)", place: PLACES[2] },
] as const;

export default function TabsLayout() {
  const attention = useChatStore((s) => protocolsNeedAttention(s.protocols));

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <TabBar
          places={TABS.map(({ route, place }) => ({
            id: route,
            label: place.label,
            icon: place.icon,
            news: place.id === "settings" && attention,
            testID: `tab-${place.id}`,
          }))}
          current={state.routes[state.index]?.name ?? "(chats)"}
          onPress={(route) => {
            const target = state.routes.find((entry) => entry.name === route);
            if (!target) return;
            const event = navigation.emit({ type: "tabPress", target: target.key, canPreventDefault: true });
            if (!event.defaultPrevented) navigation.navigate(target.name, target.params);
          }}
        />
      )}
    >
      {TABS.map(({ route }) => (
        <Tabs.Screen key={route} name={route} />
      ))}
    </Tabs>
  );
}
