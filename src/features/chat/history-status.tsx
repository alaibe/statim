import { View } from "react-native";

import { type ProtocolConnection, useChatStore } from "@/core/messaging/chat-store";
import { type ProtocolId, protocolEntries } from "@/core/messaging/namespace";
import { Button, Tag, Text } from "@/design";
import { networkLabel } from "@/features/protocols/presentation";

export function HistoryStatus({
  protocol,
  compact = false,
  showPartial = true,
}: {
  protocol?: ProtocolId;
  compact?: boolean;
  showPartial?: boolean;
}) {
  const protocols = useChatStore((s) => s.protocols);
  const syncProtocol = useChatStore((s) => s.syncProtocol);
  const entries = protocolEntries(protocols).filter(([id]) => !protocol || id === protocol);
  const fetching = entries.filter(([, state]) => state.history.status === "fetching");
  const connecting = entries.filter(([, state]) => state.status === "connecting");
  const failed = entries.filter(([, state]) => state.history.status === "error");
  const partial = showPartial ? entries.filter(([, state]) => state.history.status === "partial") : [];
  const active = [...fetching, ...connecting.filter(([id]) => !fetching.some(([key]) => key === id))];

  if (active.length === 0 && failed.length === 0 && partial.length === 0) return null;
  const describe = compact ? summary : details;

  return (
    <View className={compact ? "gap-0.5 px-4 py-1.5" : "gap-1 px-4 py-3"} accessibilityLiveRegion="polite">
      {active.length > 0 ? (
        <View
          className="flex-row items-center gap-2"
          accessible
          accessibilityLabel={`${fetching.length ? "Fetching history" : "Connecting"}: ${active.map(([id]) => networkLabel(id)).join(", ")}`}
        >
          <Tag tone="accent" label={fetching.length ? "Syncing" : "Connecting"} dot />
          <Text variant="meta" className="flex-1" numberOfLines={1}>
            {active.map(([id]) => networkLabel(id)).join(" · ")}
          </Text>
        </View>
      ) : null}
      {failed.length > 0 ? (
        <Problem
          text={describe(failed)}
          label={`Retry fetching history. ${details(failed)}`}
          onRetry={() => {
            for (const [id] of failed) void syncProtocol(id);
          }}
        />
      ) : null}
      {partial.length > 0 ? (
        <Problem
          text={describe(partial)}
          label={`Retry unavailable relays. ${details(partial)}`}
          onRetry={() => {
            for (const [id] of partial) void syncProtocol(id);
          }}
        />
      ) : null}
    </View>
  );
}

function Problem({ text, label, onRetry }: { text: string; label: string; onRetry(): void }) {
  return (
    <View className="flex-row items-center gap-2">
      <Tag tone="warn" />
      <Text variant="meta" numberOfLines={1} className="flex-1">
        {text}
      </Text>
      <Button variant="ghost" size="sm" label="Retry" accessibilityLabel={label} onPress={onRetry} />
    </View>
  );
}

function summary(entries: [ProtocolId, unknown][]): string {
  return `${entries.map(([id]) => networkLabel(id)).join(", ")}: some history unavailable`;
}

function details(entries: [ProtocolId, ProtocolConnection][]): string {
  return entries
    .map(([id, state]) => `${networkLabel(id)}: ${state.history.error ?? "History unavailable"}`)
    .join(" · ");
}
